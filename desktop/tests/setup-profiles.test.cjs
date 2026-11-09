const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { EventEmitter } = require("node:events");
const {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const {
  listTeamProfiles,
  prepareAccountProfile,
  resolveProjectPaths,
} = require("../setup-profiles");
const { checkSession, runStatus } = require("../setup-runner");

const accountA = { userId: 3, teamId: 2, email: "a@example.test" };
const accountB = { userId: 5, teamId: 4, email: "b@example.test" };
const origin = "http://127.0.0.1:8080/";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "devlink-profiles-test-"));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("devlink-profiles-test-"));
    await rm(root, { recursive: true, force: true });
  });
  const paths = {
    config: path.join(root, "config.json"),
    serverUrl: "ws://127.0.0.1:8080/",
    cli: "unused",
    node: "unused",
    entry: "unused",
  };
  await writeFile(
    paths.config,
    JSON.stringify({ serverUrl: paths.serverUrl, localPort: 57589 }),
  );
  const runtime = path.join(root, ".devlink-runtime");
  await mkdir(runtime);
  const binding = {
    origin,
    userId: 3,
    teamId: 2,
    projectRoot: root,
    state: { kind: "needs_token", agent: { agentId: 3, ownerUserId: 3 } },
  };
  await writeFile(
    path.join(runtime, "agent-profile.json"),
    JSON.stringify(binding),
  );
  await writeFile(
    path.join(runtime, "user-session.json"),
    JSON.stringify({
      origin,
      state: { kind: "authenticated", user: { userId: 5 } },
    }),
  );
  return { paths, root, runtime, other: path.join(root, "other-project") };
}

test("기존 Agent의 팀·프로젝트는 기준 프로필을 재사용하고 다른 프로젝트·팀·계정은 각각 분리한다", async (t) => {
  const { paths, root, runtime, other } = await fixture(t);
  const before = await readFile(
    path.join(runtime, "agent-profile.json"),
    "utf8",
  );
  assert.equal(
    (await resolveProjectPaths(paths, accountA, root)).config,
    paths.config,
  );
  const configs = [
    (await resolveProjectPaths(paths, accountA, other)).config,
    (await resolveProjectPaths(paths, { ...accountA, teamId: 9 }, root)).config,
    (await resolveProjectPaths(paths, accountB, root)).config,
    (await resolveProjectPaths(paths, accountB, other)).config,
  ];
  assert.equal(new Set([paths.config, ...configs]).size, 5);

  const b = await resolveProjectPaths(paths, accountB, root);
  await prepareAccountProfile(b);
  assert.deepEqual(await readdir(path.dirname(b.config)), []);
  assert.equal((await resolveProjectPaths(paths, accountB, root)).config, b.config);
  assert.equal(
    await readFile(path.join(runtime, "agent-profile.json"), "utf8"),
    before,
  );
});

test("프로필 선택과 미설정 계정 상태 조회는 파일을 만들지 않는다", async (t) => {
  const { paths, root } = await fixture(t);
  const before = await readdir(root, { recursive: true });
  const b = await resolveProjectPaths(paths, accountB, root);
  const status = await runStatus(b);
  assert.equal(status.result.data.connection.setupReady, false);
  assert.equal((await checkSession(b)).state, "logged_out");
  assert.deepEqual(await listTeamProfiles(paths, accountB), []);
  assert.deepEqual(await readdir(root, { recursive: true }), before);
});

test("같은 사용자라도 서버가 다르면 프로필을 분리하고 기존 설정을 보존한다", async (t) => {
  const { paths, root } = await fixture(t);
  const a = await resolveProjectPaths(paths, accountB, root);
  const b = await resolveProjectPaths(
    { ...paths, serverUrl: "ws://localhost:8081/" },
    accountB,
    root,
  );
  assert.notEqual(a.config, b.config);
  await prepareAccountProfile(a);
  const initialized = { serverUrl: paths.serverUrl, localPort: 50001 };
  await writeFile(a.config, JSON.stringify(initialized));
  await prepareAccountProfile(a);
  assert.deepEqual(JSON.parse(await readFile(a.config, "utf8")), initialized);
});

test("기존 Agent가 없을 때만 로그인 세션을 기준으로 기존 프로필을 재사용한다", async (t) => {
  const { paths, runtime, root, other } = await fixture(t);
  await rm(path.join(runtime, "agent-profile.json"));
  assert.equal(
    (await resolveProjectPaths(paths, accountB, other)).config,
    paths.config,
  );
  assert.notEqual(
    (await resolveProjectPaths(paths, accountA, root)).config,
    paths.config,
  );
});

test("이전 계정별 프로필은 같은 팀·프로젝트일 때만 재사용하고 팀 상태 조회에 포함한다", async (t) => {
  const { paths, root, other } = await fixture(t);
  const serverKey = createHash("sha256").update(origin).digest("hex");
  const legacy = path.join(root, "accounts", serverKey, "5", "config.json");
  await mkdir(path.join(path.dirname(legacy), ".devlink-runtime"), { recursive: true });
  await writeFile(legacy, JSON.stringify({ serverUrl: paths.serverUrl, localPort: 50002 }));
  await writeFile(
    path.join(path.dirname(legacy), ".devlink-runtime", "agent-profile.json"),
    JSON.stringify({ origin, userId: 5, teamId: 4, projectRoot: other }),
  );

  assert.equal((await resolveProjectPaths(paths, accountB, other)).config, legacy);
  const fresh = await resolveProjectPaths(paths, accountB, root);
  assert.notEqual(fresh.config, legacy);
  assert.notEqual(
    (await resolveProjectPaths(paths, { ...accountB, teamId: 7 }, other)).config,
    legacy,
  );

  await prepareAccountProfile(fresh);
  await writeFile(fresh.config, JSON.stringify({ serverUrl: paths.serverUrl }));
  assert.deepEqual(
    (await listTeamProfiles(paths, accountB)).map((profile) => profile.config).sort(),
    [legacy, fresh.config].sort(),
  );
  assert.deepEqual(await listTeamProfiles(paths, { ...accountB, teamId: 7 }), []);
  assert.deepEqual(
    (await listTeamProfiles(paths, accountA)).map((profile) => profile.config),
    [paths.config],
  );
});

test("잘못된 계정·팀 ID와 프로젝트, 손상된 기존 프로필은 조용히 새 연결을 만들지 않는다", async (t) => {
  const { paths, runtime, root } = await fixture(t);
  for (const userId of [0, -1, "../../other", Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(resolveProjectPaths(paths, { ...accountB, userId }, root));
  }
  await assert.rejects(resolveProjectPaths(paths, { ...accountB, teamId: "../1" }, root));
  await assert.rejects(resolveProjectPaths(paths, accountB, "relative/project"));
  await writeFile(path.join(runtime, "agent-profile.json"), "broken-json");
  await assert.rejects(resolveProjectPaths(paths, accountB, root), /기존 설정/);
});

async function ipcFixture(t) {
  const f = await fixture(t);
  await mkdir(f.other);
  const handlers = new Map();
  const window = new EventEmitter();
  window.webContents = new EventEmitter();
  const frame = {
    origin: "http://localhost:5173",
    parent: null,
    detached: false,
    send() {},
  };
  const event = { sender: window.webContents, senderFrame: frame };
  const calls = [];
  const inputs = new Map();
  const notReady = new Set();
  const statusErrors = new Map();
  let picked = f.root;
  let authenticatedUser = 5;
  let setupError = {
    code: "SETUP_MANUAL_ACTION_REQUIRED",
    manualConfig: { snippet: "test config" },
  };
  const runner = {
    loadDevelopmentPaths: async () => f.paths,
    detectTools: async () => ["codex", "claude-code"],
    checkSession: async () => ({
      authenticated: true,
      user: { userId: authenticatedUser },
    }),
    runStatus: async (paths) => {
      calls.push({ kind: "status", config: paths.config });
      if (statusErrors.has(paths.config)) throw statusErrors.get(paths.config);
      const input = inputs.get(paths.config);
      return {
        exitCode: 0,
        result: {
          data: {
            userId: "5",
            teamId: input?.team.id ?? "2",
            toolType: input?.tool.type === "codex" ? "codex" : "claude_code",
            projectPath: input?.project.path ?? f.root,
            connection: { setupReady: !notReady.has(paths.config) },
          },
        },
      };
    },
    runSetup: async (paths, input) => {
      calls.push({
        kind: "setup",
        config: paths.config,
        teamId: input.team.id,
        mcpMode: input.mcp.mode,
        agent: input.agent,
      });
      inputs.set(paths.config, input);
      // CLI가 새 프로필 설정 파일을 만드는 동작
      await writeFile(paths.config, JSON.stringify({ serverUrl: paths.serverUrl }));
      return {
        exitCode: setupError.code === "SETUP_MANUAL_ACTION_REQUIRED" ? 3 : 6,
        error: {
          ...setupError,
          manualConfig: setupError.manualConfig && {
            ...setupError.manualConfig,
            suggestedTargetPath: input.mcp.targetPath,
          },
        },
      };
    },
  };
  const module = { exports: {} };
  const source = await readFile(
    path.join(__dirname, "..", "setup-ipc.js"),
    "utf8",
  );
  vm.runInNewContext(source, {
    module,
    process,
    URL,
    Buffer,
    require(name) {
      if (name === "electron")
        return {
          dialog: {
            showOpenDialog: async () => ({
              canceled: false,
              filePaths: [picked],
            }),
          },
          ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
          shell: { openPath: async () => "" },
        };
      if (name === "./setup-runner") return runner;
      if (name === "./setup-profiles")
        return { listTeamProfiles, prepareAccountProfile, resolveProjectPaths };
      return require(name);
    },
  });
  module.exports.registerSetupHandlers(window, frame.origin);
  return {
    ...f,
    calls,
    notReady,
    statusErrors,
    pick: (folder) => {
      picked = folder;
    },
    setAuthenticatedUser: (id) => {
      authenticatedUser = id;
    },
    setSetupError: (error) => {
      setupError = error;
    },
    invoke: (name, ...args) => handlers.get(`devlink:${name}`)(event, ...args),
  };
}

function setupConfigs(calls) {
  return calls.filter((call) => call.kind === "setup").map((call) => call.config);
}

test("IPC 담당 정보는 검증·정규화하고 재시도 시 보존하며 생략 시 CLI 기본값·프로필을 따른다", async (t) => {
  const f = await ipcFixture(t);
  let selection = await f.invoke("pickFolder", accountB);
  await f.invoke("setup", selection.id, "codex", undefined, {
    part: "BACKEND", roles: [" API ", "API", "인증"],
  });
  const custom = f.calls.find((call) => call.kind === "setup").agent;
  assert.equal(custom.part, "BACKEND");
  assert.deepEqual(Array.from(custom.roles), ["API", "인증"]);

  await f.invoke("setup", selection.id, "codex");
  const retried = f.calls.filter((call) => call.kind === "setup").at(-1).agent;
  assert.equal(retried.part, "BACKEND");
  assert.deepEqual(Array.from(retried.roles), ["API", "인증"]);

  selection = await f.invoke("pickFolder", accountB);
  await f.invoke("setup", selection.id, "codex");
  const defaults = f.calls.filter((call) => call.kind === "setup").at(-1).agent;
  assert.equal(defaults.part, undefined);
  assert.equal(defaults.roles, undefined);
});

test("IPC의 잘못된 담당 정보는 세션 확인과 CLI 실행 전에 거부한다", async (t) => {
  const f = await ipcFixture(t);
  const selection = await f.invoke("pickFolder", accountB);
  for (const metadata of [
    { part: "backend" }, { part: null }, { roles: null }, { roles: "API" },
    { roles: [" "] }, { roles: [null] }, { roles: ["😀".repeat(33)] },
    { roles: Array(11).fill("API") }, { unexpected: true },
  ]) {
    await assert.rejects(f.invoke("setup", selection.id, "codex", undefined, metadata), /담당 파트/);
  }
  assert.equal(f.calls.length, 0);
});

test("IPC 상태 조회·설정·수동 확인은 같은 프로젝트 프로필을 사용하고 계정을 바꿔도 유지된다", async (t) => {
  const f = await ipcFixture(t);
  const empty = await f.invoke("status", accountB);
  assert.equal(empty.result.data.connection.setupReady, false);
  assert.equal(f.calls.length, 0);

  const selection = await f.invoke("pickFolder", accountB);
  assert.equal(selection.paths, undefined);
  const result = await f.invoke("setup", selection.id, "claude-code");
  assert.equal(result.state, "manual");
  assert.equal(
    f.calls.find((call) => call.kind === "setup").mcpMode,
    "replace",
  );
  assert.equal(await f.invoke("checkSetup", selection.id), true);
  const configs = f.calls.map((call) => call.config);
  assert.ok(configs.every((config) => config === configs[0]));
  assert.notEqual(configs[0], f.paths.config);

  await f.invoke("status", accountA);
  assert.equal(f.calls.at(-1).config, f.paths.config);
  const ready = await f.invoke("status", accountB);
  assert.equal(f.calls.at(-1).config, configs[0]);
  assert.equal(ready.result.data.connection.setupReady, true);
});

test("같은 계정의 두 번째 프로젝트와 다른 팀은 별도 프로필로 연결하고 팀 상태는 해당 팀 프로필만 본다", async (t) => {
  const f = await ipcFixture(t);
  const connect = async (account, folder) => {
    f.pick(folder);
    const selection = await f.invoke("pickFolder", account);
    assert.equal((await f.invoke("setup", selection.id, "codex")).state, "manual");
    return setupConfigs(f.calls).at(-1);
  };
  const first = await connect(accountB, f.root);
  const second = await connect(accountB, f.other);
  const otherTeam = await connect({ ...accountB, teamId: 7 }, f.root);
  assert.equal(new Set([f.paths.config, first, second, otherTeam]).size, 4);
  assert.equal(await connect(accountB, f.root), first);

  f.notReady.add(first);
  f.calls.length = 0;
  const status = await f.invoke("status", accountB);
  assert.equal(status.result.data.connection.setupReady, true);
  assert.equal(status.result.data.projectPath, await realpath(f.other));
  assert.ok(f.calls.every((call) => [first, second].includes(call.config)));

  f.notReady.add(second);
  assert.equal((await f.invoke("status", accountB)).result.data.connection.setupReady, false);
  f.calls.length = 0;
  assert.equal(
    (await f.invoke("status", { ...accountB, teamId: 7 })).result.data.connection.setupReady,
    true,
  );
  assert.deepEqual(f.calls.map((call) => call.config), [otherTeam]);
});

test("팀 상태 조회는 한 프로필이 실패해도 준비된 다른 프로필을 확인한다", async (t) => {
  const f = await ipcFixture(t);
  for (const folder of [f.root, f.other]) {
    f.pick(folder);
    const selection = await f.invoke("pickFolder", accountB);
    await f.invoke("setup", selection.id, "codex");
  }
  const profiles = await listTeamProfiles(f.paths, accountB);
  const failure = new Error("CLI timeout");
  f.statusErrors.set(profiles[0].config, failure);
  f.calls.length = 0;
  const status = await f.invoke("status", accountB);
  assert.equal(status.result.data.connection.setupReady, true);
  assert.deepEqual(f.calls.map((call) => call.config), profiles.map((profile) => profile.config));

  f.notReady.add(profiles[1].config);
  await assert.rejects(f.invoke("status", accountB), (error) => error === failure);
});

test("프로필 충돌은 원래 오류 코드와 함께 도구 확인 안내를 돌려준다", async (t) => {
  const f = await ipcFixture(t);
  f.setSetupError({ code: "SETUP_PROFILE_CONFLICT", message: "conflict" });
  const selection = await f.invoke("pickFolder", accountB);
  const result = await f.invoke("setup", selection.id, "codex");
  assert.equal(result.state, "error");
  assert.equal(result.code, "SETUP_PROFILE_CONFLICT");
  assert.match(result.message, /AI 도구/);
});

test("기존 Agent와 담당 정보가 다르면 한글 안내를 돌려주고 비운 담당 정보로 다시 연결한다", async (t) => {
  const f = await ipcFixture(t);
  f.setSetupError({ code: "SETUP_AGENT_BINDING_CONFLICT", message: "Agent identity, metadata or binding differs." });
  const selection = await f.invoke("pickFolder", accountB);
  const result = await f.invoke("setup", selection.id, "codex", undefined, { part: "BACKEND", roles: ["API"] });
  assert.equal(result.state, "error");
  assert.equal(result.code, "SETUP_AGENT_BINDING_CONFLICT");
  assert.match(result.message, /비워 두고/);

  const retried = await f.invoke("setup", selection.id, "codex", undefined, {});
  const cleared = f.calls.filter((call) => call.kind === "setup").at(-1).agent;
  assert.equal(cleared.part, undefined);
  assert.equal(cleared.roles, undefined);
  // 담당 정보 없이 난 충돌은 이름·도구 확인 안내
  assert.equal(retried.code, "SETUP_AGENT_BINDING_CONFLICT");
  assert.doesNotMatch(retried.message, /비워 두고/);
  assert.match(retried.message, /폴더를 다시 선택/);
});

test("이전 계정의 CLI 세션은 설정을 실행하지 않고 현재 계정 비밀번호를 요청한다", async (t) => {
  const f = await ipcFixture(t);
  const selection = await f.invoke("pickFolder", accountA);
  const result = await f.invoke("setup", selection.id, "codex");
  assert.equal(result.state, "password");
  assert.equal(f.calls.filter((call) => call.kind === "setup").length, 0);
  await assert.rejects(f.invoke("status", { ...accountB, userId: -1 }), /계정/);
});

test("폴더 선택 뒤 서버가 변경되면 설정과 수동 확인을 다른 프로필로 진행하지 않는다", async (t) => {
  const f = await ipcFixture(t);
  const selected = await f.invoke("pickFolder", accountB);
  const originalServer = f.paths.serverUrl;
  f.paths.serverUrl = "ws://127.0.0.1:8081/";
  await assert.rejects(
    f.invoke("setup", selected.id, "claude-code"),
    /프로필이 변경/,
  );
  assert.equal(f.calls.filter((call) => call.kind === "setup").length, 0);
  f.paths.serverUrl = originalServer;
  assert.equal(
    (await f.invoke("setup", selected.id, "claude-code")).state,
    "manual",
  );
  f.paths.serverUrl = "ws://127.0.0.1:8081/";
  await assert.rejects(
    f.invoke("checkSetup", selected.id),
    /같은 테스트 프로필/,
  );
});
