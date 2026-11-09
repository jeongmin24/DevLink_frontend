const { dialog, ipcMain, shell } = require("electron");
const { randomUUID } = require("node:crypto");
const { realpath, stat } = require("node:fs/promises");
const path = require("node:path");
const { checkSession, detectTools, loadDevelopmentPaths, runSetup, runStatus } = require("./setup-runner");
const { listTeamProfiles, prepareAccountProfile, resolveProjectPaths } = require("./setup-profiles");

const notReady = { exitCode: 0, result: { data: { connection: { setupReady: false } } } };

function samePath(actual, expected) {
  if (typeof actual !== "string" || !path.isAbsolute(actual)) return false;
  const normalize = (value) => process.platform === "win32"
    ? path.toNamespacedPath(path.resolve(value)).toLowerCase()
    : path.resolve(value);
  return normalize(actual) === normalize(expected);
}

function matchesProject(data, selection) {
  return data?.connection?.setupReady === true
    && data.userId === selection.userId && data.teamId === selection.teamId
    && data.toolType === (selection.tool === "claude-code" ? "claude_code" : "codex")
    && samePath(data.projectPath, selection.project);
}

function validId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function validateAccount(account) {
  if (!validId(account?.userId) || !validId(account?.teamId) || typeof account?.email !== "string"
    || !/^[^\s@]+@[^\s@]+$/.test(account.email) || account.email.length > 255) {
    throw new Error("현재 로그인 계정과 팀을 확인해주세요.");
  }
}

function agentMetadata(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !["part", "roles"].includes(key))) {
    throw new Error("담당 파트와 역할 태그를 확인해주세요.");
  }
  const part = value.part === undefined ? "OTHER" : value.part;
  const roles = value.roles === undefined ? [] : value.roles;
  if (!["FRONTEND", "BACKEND", "INFRA", "OTHER"].includes(part)
    || !Array.isArray(roles) || roles.length > 10
    || roles.some((role) => typeof role !== "string" || role.length > 64
      || /^[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]*$/.test(role))) {
    throw new Error("담당 파트 또는 역할 태그가 올바르지 않습니다. 태그는 64자 이내로 최대 10개 입력해주세요.");
  }
  return {
    ...(value.part === undefined ? {} : { part }),
    ...(value.roles === undefined ? {} : {
      roles: [...new Set(roles.map((role) => role.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, "")))],
    }),
  };
}

function registerSetupHandlers(window, webOrigin, loadPaths = loadDevelopmentPaths) {
  let selection;
  let busy = false;
  let documentVersion = 0;

  function handle(name, action) {
    ipcMain.handle(`devlink:${name}`, (event, ...args) => {
      const frame = event.senderFrame;
      if (event.sender !== window.webContents || !frame || frame.parent || frame.origin !== webOrigin) {
        throw new Error("허용되지 않은 데스크톱 요청입니다.");
      }
      return action(frame, ...args);
    });
  }

  async function exclusive(action) {
    if (busy) throw new Error("이 PC 연결 작업이 진행 중입니다.");
    busy = true;
    try {
      return await action();
    } finally {
      busy = false;
    }
  }

  function requireSelection(id) {
    if (!selection || selection.id !== id) throw new Error("프로젝트 폴더를 다시 선택해주세요.");
    return selection;
  }

  window.webContents.on("did-start-navigation", (event) => {
    if (event.isMainFrame && !event.isSameDocument) {
      documentVersion++;
      selection = undefined;
    }
  });
  window.on("close", (event) => { if (busy) event.preventDefault(); });

  handle("status", async (_frame, account) => {
    validateAccount(account);
    let firstError;
    // 현재 팀에 연결된 프로젝트 중 하나라도 준비되면 연결됨
    for (const paths of await listTeamProfiles(await loadPaths(), account)) {
      let status;
      try {
        status = await runStatus(paths);
      } catch (error) {
        firstError ??= error;
        continue;
      }
      const data = status.result?.data;
      if (status.exitCode === 0 && data?.connection?.setupReady === true
        && data.userId === String(account.userId) && data.teamId === String(account.teamId)) {
        return status;
      }
    }
    if (firstError) throw firstError;
    return notReady;
  });
  handle("pickFolder", (frame, account) => exclusive(async () => {
    validateAccount(account);

    selection = undefined;
    const version = documentVersion;
    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      title: "연결할 프로젝트 폴더 선택",
      properties: ["openDirectory"],
    });
    if (canceled || !filePaths[0] || frame.detached) return null;

    const project = await realpath(filePaths[0]);
    const name = path.basename(project).trim();
    if (!name || name.length > 100 || !(await stat(project)).isDirectory()) {
      throw new Error("이름이 1~100자인 프로젝트 폴더를 선택해주세요.");
    }
    const paths = await resolveProjectPaths(await loadPaths(), account, project);
    const tools = await detectTools(paths);
    if (version !== documentVersion) return null;

    selection = {
      id: randomUUID(), project, name, tools, paths,
      userId: String(account.userId), teamId: String(account.teamId), email: account.email,
    };
    return { id: selection.id, name, tools };
  }));

  handle("setup", (frame, id, tool, password, metadata) => exclusive(async () => {
    const current = requireSelection(id);
    const agent = agentMetadata(metadata === undefined ? current.agentMetadata : metadata);
    if (!current.tools.includes(tool) || (current.tool && current.tool !== tool)) {
      throw new Error("감지된 AI 도구를 선택해주세요. 도구를 바꾸려면 폴더를 다시 선택해주세요.");
    }
    if (password !== undefined && (!current.needsPassword || typeof password !== "string" || !password
      || /[\r\n\0]/.test(password) || Buffer.byteLength(password, "utf8") > 72)) {
      throw new Error("비밀번호를 확인해주세요. 비밀번호는 UTF-8 기준 72바이트 이하여야 합니다.");
    }

    current.agentMetadata = agent;
    current.tool = tool;
    current.targetPath = tool === "claude-code"
      ? path.join(current.project, ".mcp.json")
      : path.join(current.project, ".codex", "config.toml");
    const paths = await resolveProjectPaths(await loadPaths(), current, current.project);
    if (!samePath(paths.config, current.paths.config) || paths.serverUrl !== current.paths.serverUrl) {
      throw new Error("서버 또는 연결 프로필이 변경됐습니다. 프로젝트 폴더를 다시 선택해주세요.");
    }
    await prepareAccountProfile(paths);
    if (password === undefined) {
      const session = await checkSession(paths);
      if (!session || ["logged_out", "expired"].includes(session.state)
        || (session.authenticated === true && String(session.user?.userId) !== current.userId)) {
        current.needsPassword = true;
        return { state: "password" };
      }
      if (session.authenticated !== true || String(session.user?.userId) !== current.userId) {
        return { state: "error", message: "CLI 테스트 프로필의 계정과 현재 로그인 계정이 일치하는지 확인해주세요." };
      }
    }

    current.manualConfig = undefined;
    current.needsPassword = false;
    const input = {
      schemaVersion: 1,
      serverUrl: paths.serverUrl,
      user: password === undefined ? { mode: "session" } : { mode: "login", email: current.email },
      team: { id: current.teamId },
      project: { path: current.project, name: current.name },
      tool: { type: tool },
      agent: { action: "create", name: current.name, ...agent },
      mcp: { mode: "replace", targetPath: current.targetPath },
    };
    const result = await runSetup(paths, input, password, (progress) => {
      if (selection !== current || frame.detached || frame.origin !== webOrigin) return;
      try { frame.send("devlink:setup-event", progress); } catch { /* 화면이 닫힌 경우 진행 이벤트 생략 */ }
    });

    if (result.exitCode === 0) {
      const status = await runStatus(paths);
      if (status.exitCode === 0 && matchesProject(status.result.data, current)) return { state: "done" };
      return { state: "error", message: "설정은 적용됐지만 연결 상태를 확인하지 못했습니다. 잠시 후 같은 폴더로 다시 확인해주세요." };
    }

    const error = result.error;
    if (error?.step === "authenticate" && ["SETUP_AUTH_REQUIRED", "SETUP_AUTH_REJECTED"].includes(error.code)) {
      current.needsPassword = true;
      return { state: "password", message: error.code === "SETUP_AUTH_REJECTED" ? "비밀번호를 다시 확인해주세요." : undefined };
    }

    const manual = error?.manualConfig;
    if (error?.code === "SETUP_MANUAL_ACTION_REQUIRED" && samePath(manual?.suggestedTargetPath, current.targetPath)
      && typeof manual.snippet === "string") {
      current.manualConfig = { config: paths.config, serverUrl: paths.serverUrl };
      return { state: "manual", targetPath: current.targetPath, snippet: manual.snippet };
    }

    if (error?.code === "SETUP_PROFILE_CONFLICT") {
      return {
        state: "error",
        code: error.code,
        message: "이 폴더는 이 PC에서 다른 AI 도구나 설정으로 이미 연결돼 있습니다. 처음 연결한 AI 도구로 다시 시도해주세요.",
      };
    }

    if (error?.code === "SETUP_AGENT_BINDING_CONFLICT") {
      // 담당 정보를 보내지 않았으면 이름·도구 등 다른 연결 정보 충돌
      return {
        state: "error",
        code: error.code,
        message: Object.keys(agent).length > 0
          ? "이 폴더에 연결된 기존 Agent 정보와 입력한 내용이 다릅니다. 기존 Agent의 담당 파트·역할 태그는 이 화면에서 바꿀 수 없으니 해당 항목을 비워 두고 다시 연결해주세요."
          : "이 폴더에 연결된 기존 Agent 정보가 현재 연결 정보와 다릅니다. Agent 목록에서 이름과 AI 도구를 확인하거나 폴더를 다시 선택해주세요.",
      };
    }

    return { state: "error", code: error?.code, message: error?.message ?? "프로젝트를 연결하지 못했습니다." };
  }));

  handle("checkSetup", (_frame, id) => exclusive(async () => {
    const current = requireSelection(id);
    const paths = await resolveProjectPaths(await loadPaths(), current, current.project);
    if (!current.manualConfig || !samePath(paths.config, current.manualConfig.config)
      || paths.serverUrl !== current.manualConfig.serverUrl) {
      throw new Error("같은 테스트 프로필로 연결을 다시 시작해주세요.");
    }
    const { exitCode, result } = await runStatus(paths);
    return exitCode === 0 && matchesProject(result.data, current);
  }));

  handle("openConfigFolder", async (_frame, id) => {
    const current = requireSelection(id);
    if (!current.manualConfig) throw new Error("AI 도구 설정 위치를 확인해주세요.");
    const configDirectory = path.dirname(current.targetPath);
    const resolved = await realpath(configDirectory).catch(() => null);
    const directory = resolved && samePath(resolved, configDirectory) ? resolved : current.project;
    if (await shell.openPath(directory)) throw new Error("설정 폴더를 열지 못했습니다.");
  });
}

module.exports = { registerSetupHandlers };
