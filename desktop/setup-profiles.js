const { createHash } = require("node:crypto");
const { mkdir, readFile, readdir } = require("node:fs/promises");
const path = require("node:path");

function serverOrigin(serverUrl) {
  const url = new URL(serverUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  return `${url.origin}/`;
}

function projectKey(project) {
  const resolved = path.resolve(project);
  return process.platform === "win32"
    ? path.toNamespacedPath(resolved).toLowerCase()
    : resolved;
}

function checkedId(value, message) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(message);
  return id;
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(
      "CLI 연결 프로필을 읽을 수 없습니다. 기존 설정을 확인해주세요.",
    );
  }
}

function runtimeFile(config, name) {
  return path.join(path.dirname(config), ".devlink-runtime", name);
}

function accountScope(paths, account) {
  const userId = checkedId(account?.userId, "현재 로그인 계정을 확인해주세요.");
  const teamId = checkedId(account?.teamId, "현재 팀을 확인해주세요.");
  const origin = serverOrigin(paths.serverUrl);
  const serverKey = createHash("sha256").update(origin).digest("hex");
  const root = path.join(path.dirname(paths.config), "accounts", serverKey, String(userId));
  return { userId, teamId, origin, root, teams: path.join(root, "teams", String(teamId)) };
}

// 기존 Agent가 연결된 기준 프로필과 이전 계정별 프로필
function legacyConfigs(paths, scope) {
  return [paths.config, path.join(scope.root, "config.json")];
}

function scoped(paths, config) {
  return config === paths.config ? paths : { ...paths, config, accountProfile: true };
}

function boundTo(binding, scope, project) {
  return binding?.origin === scope.origin && binding.userId === scope.userId
    && binding.teamId === scope.teamId
    && (project === undefined || (typeof binding.projectRoot === "string"
      && projectKey(binding.projectRoot) === projectKey(project)));
}

async function resolveProjectPaths(paths, account, project) {
  const scope = accountScope(paths, account);
  if (typeof project !== "string" || !path.isAbsolute(project)) {
    throw new Error("프로젝트 폴더를 다시 선택해주세요.");
  }
  const hash = createHash("sha256").update(projectKey(project)).digest("hex").slice(0, 16);
  const config = path.join(scope.teams, hash, "config.json");
  const projectConfig = await readJson(config);
  if (projectConfig) {
    if (serverOrigin(projectConfig.serverUrl) !== scope.origin) {
      throw new Error(
        "계정별 CLI 프로필의 서버가 변경됐습니다. 연결 설정을 확인해주세요.",
      );
    }
    return scoped(paths, config);
  }

  for (const legacy of legacyConfigs(paths, scope)) {
    const binding = await readJson(runtimeFile(legacy, "agent-profile.json"));
    if (boundTo(binding, scope, project)) return scoped(paths, legacy);
  }

  // 기준 프로필에 Agent가 없으면 같은 계정의 로그인 세션 재사용
  const binding = await readJson(runtimeFile(paths.config, "agent-profile.json"));
  if (!binding) {
    const session = await readJson(runtimeFile(paths.config, "user-session.json"));
    if (session?.state?.user?.userId === scope.userId && session.origin === scope.origin) {
      return paths;
    }
  }
  return { ...paths, config, accountProfile: true };
}

async function listTeamProfiles(paths, account) {
  const scope = accountScope(paths, account);
  const profiles = [];
  for (const legacy of legacyConfigs(paths, scope)) {
    if (boundTo(await readJson(runtimeFile(legacy, "agent-profile.json")), scope)) {
      profiles.push(scoped(paths, legacy));
    }
  }
  const entries = await readdir(scope.teams, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw new Error("CLI 연결 프로필을 읽을 수 없습니다. 기존 설정을 확인해주세요.");
  });
  for (const entry of entries) {
    const config = path.join(scope.teams, entry.name, "config.json");
    if (entry.isDirectory() && await readJson(config)) profiles.push(scoped(paths, config));
  }
  return profiles;
}

async function prepareAccountProfile(paths) {
  if (!paths.accountProfile) return;
  try {
    await mkdir(path.dirname(paths.config), { recursive: true, mode: 0o700 });
  } catch {
    throw new Error("계정별 CLI 연결 프로필 폴더를 생성하지 못했습니다.");
  }
}

module.exports = { listTeamProfiles, prepareAccountProfile, resolveProjectPaths };
