const { execFile, spawn } = require("node:child_process");
const { mkdtemp, readFile, rmdir, stat, unlink, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { createInterface } = require("node:readline");
const { parseEnv } = require("node:util");

function developmentPath(env, key) {
  const value = (process.env[key] ?? env[key])?.trim();
  if (!value) throw new Error(`desktop/.env.local에 ${key} 경로를 설정해주세요.`);
  return path.resolve(__dirname, value);
}

async function loadDevelopmentPaths() {
  let env = {};
  try {
    env = parseEnv(await readFile(path.join(__dirname, ".env.local"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("desktop/.env.local을 읽을 수 없습니다.");
  }

  const cli = developmentPath(env, "DEVLINK_DESKTOP_CLI_PATH");
  const config = developmentPath(env, "DEVLINK_DESKTOP_CONFIG_PATH");
  const node = developmentPath(env, "DEVLINK_DESKTOP_NODE_PATH");
  const entry = developmentPath(env, "DEVLINK_DESKTOP_MCP_ENTRY");

  let profile;
  try {
    profile = JSON.parse(await readFile(config, "utf8"));
  } catch {
    throw new Error("CLI 테스트 프로필을 읽을 수 없습니다.");
  }

  const server = typeof profile?.serverUrl === "string" ? URL.parse(profile.serverUrl) : null;
  if (!server || server.protocol !== "ws:" || !["127.0.0.1", "localhost", "[::1]"].includes(server.hostname)
    || server.username || server.password || server.search || server.hash) {
    throw new Error("CLI 테스트 프로필은 로컬 서버(ws://127.0.0.1 등)를 가리켜야 합니다.");
  }

  return { cli, config, node, entry, serverUrl: server.href };
}

function runJson({ cli, config }, args, allowErrorWithoutJson = false) {
  return new Promise((resolve, reject) => {
    execFile(cli, ["--config", config, ...args], { windowsHide: true, timeout: 15_000, encoding: "utf8" }, (error, stdout) => {
      if (error && typeof error.code !== "number") {
        reject(new Error("DevLink CLI를 실행하지 못했습니다. CLI 경로와 실행 상태를 확인해주세요."));
        return;
      }

      try {
        resolve({ exitCode: error?.code ?? 0, result: JSON.parse(stdout) });
      } catch {
        if (allowErrorWithoutJson && typeof error?.code === "number") {
          resolve({ exitCode: error.code, result: null });
        } else {
          reject(new Error("DevLink CLI에서 JSON 상태 응답을 받지 못했습니다."));
        }
      }
    });
  });
}

function runtimeArgs(paths) {
  return ["--node-path", paths.node, "--mcp-entry", paths.entry];
}

async function runStatus(paths) {
  const current = paths ?? await loadDevelopmentPaths();
  if (current.accountProfile && !(await hasConfig(current))) {
    return { exitCode: 0, result: { data: { connection: { setupReady: false } } } };
  }
  return runJson(current, ["setup", "status", "--output", "json", ...runtimeArgs(current)]);
}

async function checkSession(paths) {
  if (paths.accountProfile && !(await hasConfig(paths))) return { state: "logged_out", authenticated: false };
  const { result } = await runJson(paths, ["auth", "status"], true);
  return result;
}

function hasConfig(paths) {
  return stat(paths.config).then(() => true, (error) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
}

async function detectTools(paths) {
  const { exitCode, result } = await runJson(paths, ["setup", "tools"], true);
  if (exitCode !== 0 || !Array.isArray(result) || !result.every((tool) => tool === "codex" || tool === "claude-code")) {
    throw new Error("설치된 AI 도구를 확인하지 못했습니다. DevLink CLI를 다시 빌드한 뒤 시도해주세요.");
  }
  return result;
}

function runJsonLines(paths, inputFile, password, onProgress) {
  const args = ["--config", paths.config, "setup", "--non-interactive", "--input", inputFile,
    "--output", "jsonl", ...runtimeArgs(paths)];
  if (password !== undefined) args.push("--password-stdin");

  return new Promise((resolve, reject) => {
    const child = spawn(paths.cli, args, { windowsHide: true, timeout: 75_000, stdio: ["pipe", "pipe", "ignore"] });
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    let result;
    let invalid = false;

    lines.on("line", (line) => {
      try {
        const event = JSON.parse(line);
        if (event?.schemaVersion !== 1 || result) {
          invalid = true;
        } else if (event.type === "progress") {
          onProgress({ step: event.step, status: event.stepStatus });
        } else if (event.type === "result") {
          result = event;
        } else {
          invalid = true;
        }
      } catch {
        invalid = true;
      }
    });
    lines.on("error", () => { invalid = true; });
    child.stdin.on("error", () => {});
    child.stdin.end(password === undefined ? undefined : `${password}\n`, "utf8");
    child.on("error", () => reject(new Error("DevLink CLI를 실행하지 못했습니다. CLI 경로를 확인해주세요.")));
    child.on("close", (exitCode) => {
      if (invalid || !result || exitCode === null || exitCode !== result.exitCode) {
        reject(new Error("CLI 실행 결과를 확인할 수 없습니다. Agent 목록과 연결 상태를 확인해주세요."));
        return;
      }
      resolve(result);
    });
  });
}

async function runSetup(paths, input, password, onProgress) {
  const directory = await mkdtemp(path.join(path.dirname(paths.config), "setup-input-")).catch(() => {
    throw new Error("테스트 프로필 폴더에 연결 요청을 저장할 수 없습니다.");
  });
  const inputFile = path.join(directory, "input.json");
  try {
    await writeFile(inputFile, JSON.stringify(input), { encoding: "utf8", flag: "wx", mode: 0o600 });
    return await runJsonLines(paths, inputFile, password, onProgress);
  } finally {
    await unlink(inputFile).catch((error) => { if (error.code !== "ENOENT") throw error; });
    await rmdir(directory);
  }
}

module.exports = { checkSession, detectTools, loadDevelopmentPaths, runSetup, runStatus };
