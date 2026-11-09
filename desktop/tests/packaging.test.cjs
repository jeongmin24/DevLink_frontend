const assert = require("node:assert/strict");
const { mkdtemp, mkdir, readFile, readdir, rm, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { packagedPaths } = require("../runtime-paths");
const { listProfiles, resumeBrokers, stopBrokers } = require("../maintenance/broker-lifecycle");

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "devlink-package-test-"));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("devlink-package-test-"));
    await rm(root, { recursive: true, force: true });
  });
  const names = ["config.json", `accounts/${"a".repeat(64)}/5/config.json`,
    `accounts/${"a".repeat(64)}/5/teams/7/${"b".repeat(16)}/config.json`];
  for (const name of [...names, "unrelated/config.json"]) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), "{}");
  }
  const paths = { config: path.join(root, "config.json"), cli: "fixture-cli" };
  return { root, names, paths };
}

test("배포 경로는 동봉한 런타임과 별도 데스크톱 프로필을 사용한다", async (t) => {
  const { root } = await fixture(t);
  const before = await readdir(root, { recursive: true });
  const resources = path.join(root, "resources");
  const paths = packagedPaths(resources, root);
  assert.equal(paths.cli, path.join(resources, "bin", "devlink.exe"));
  assert.equal(paths.node, path.join(resources, "node", "node.exe"));
  assert.equal(paths.entry, path.join(resources, "bin", "mcp-server", "dist", "index.js"));
  assert.equal(paths.config, path.join(root, ".devlink", "desktop", "config.json"));
  assert.equal(paths.serverUrl, "wss://api.devlink.ai.kr/");
  assert.equal(paths.accountProfile, true);
  assert.notEqual(require("../package.json").build.win.executableName.toLowerCase(), "devlink");
  assert.deepEqual(await readdir(root, { recursive: true }), before);
});

test("preload는 허용한 최상위 개발·배포 화면에만 연결 기능을 노출한다", async () => {
  const source = await readFile(path.join(__dirname, "..", "preload.js"), "utf8");
  for (const [origin, current, mainFrame, expected] of [
    ["http://localhost:5173", "http://localhost:5173", true, true],
    ["https://devlink.ai.kr", "https://devlink.ai.kr", true, true],
    ["https://devlink.ai.kr", "https://example.test", true, false],
    ["https://devlink.ai.kr", "https://devlink.ai.kr", false, false],
  ]) {
    let exposed;
    const calls = [];
    vm.runInNewContext(source, {
      process: { isMainFrame: mainFrame, argv: [`--devlink-origin=${origin}`, "--devlink-version=0.1.0"] },
      window: { location: { origin: current } },
      require: () => ({
        contextBridge: { exposeInMainWorld: (_name, value) => { exposed = value; } },
        ipcRenderer: { invoke: (...args) => { calls.push(args); }, on() {}, removeListener() {} },
      }),
    });
    assert.equal(Boolean(exposed?.setup), expected);
    if (expected) {
      exposed.getStatus({ userId: 5 });
      exposed.setup.check("selection");
      assert.equal(calls[0][0], "devlink:status");
      assert.equal(calls[1][0], "devlink:checkSetup");
      const metadata = { part: "BACKEND", roles: ["API"] };
      exposed.setup.run("selection", "codex", undefined, metadata);
      assert.equal(calls[2][0], "devlink:setup");
      assert.equal(calls[2][4], metadata);
      assert.equal(exposed.ipcRenderer, undefined);
    }
  }
});

test("업데이트는 실행 중인 모든 프로젝트를 중지하고 다음 실행에서만 복원한다", async (t) => {
  const { root, names, paths } = await fixture(t);
  assert.deepEqual((await listProfiles(root)).sort(), [...names].sort());
  const calls = [];
  const running = new Set([names[0], names[2]]);
  const command = async (_cli, config, action) => {
    const name = path.relative(root, config).split(path.sep).join("/");
    calls.push([name, action]);
    return { stdout: running.has(name) ? "Local Broker  : Running (PID: 123)" : "Local Broker  : Stopped" };
  };
  let stoppedMcp = false;
  await stopBrokers(paths, { updating: true, command, stopMcp: async () => { stoppedMcp = true; } });
  assert.equal(stoppedMcp, true);
  assert.deepEqual(calls.filter((call) => call[1] === "stop").map((call) => call[0]).sort(), [...running].sort());
  calls.length = 0;
  await resumeBrokers(paths, command);
  assert.deepEqual(calls.map((call) => call[0]).sort(), [...running].sort());
  assert.ok(calls.every((call) => call[1] === "start"));
  await assert.rejects(readFile(path.join(root, "restart-brokers.json")), { code: "ENOENT" });
  for (const name of names) assert.equal(await readFile(path.join(root, name), "utf8"), "{}");
});

test("재시작 실패는 재시도 목록에 남기고 제거할 때는 프로필을 보존한다", async (t) => {
  const { root, names, paths } = await fixture(t);
  await writeFile(path.join(root, "restart-brokers.json"), JSON.stringify(names));
  await assert.rejects(resumeBrokers(paths, async (_cli, config) => {
    if (config === path.join(root, names[1])) throw new Error("fixture failure");
  }));
  assert.deepEqual(JSON.parse(await readFile(path.join(root, "restart-brokers.json"), "utf8")), [names[1]]);
  await stopBrokers(paths, { command: async () => ({ stdout: "Local Broker : Stopped" }), stopMcp: async () => {} });
  await assert.rejects(readFile(path.join(root, "restart-brokers.json")), { code: "ENOENT" });
  for (const name of names) assert.equal(await readFile(path.join(root, name), "utf8"), "{}");
});

test("기본 종료 검사와 기존 버전 제거가 이어져도 먼저 저장한 재시작 목록을 보존한다", async (t) => {
  const { root, names, paths } = await fixture(t);
  const running = new Set([names[0], names[2]]);
  const restarted = [];
  const command = async (_cli, config, action) => {
    const name = path.relative(root, config).split(path.sep).join("/");
    if (action === "status") return { stdout: `Local Broker : ${running.has(name) ? "Running" : "Stopped"}` };
    if (action === "stop") running.delete(name);
    if (action === "start") restarted.push(name);
    return { stdout: "" };
  };
  const expected = [...running].sort();
  await stopBrokers(paths, { updating: true, command, stopMcp: async () => {} });
  assert.equal(running.size, 0);
  await stopBrokers(paths, { updating: true, command, stopMcp: async () => {} });
  assert.deepEqual(JSON.parse(await readFile(path.join(root, "restart-brokers.json"), "utf8")).sort(), expected);
  await resumeBrokers(paths, command);
  assert.deepEqual(restarted.sort(), expected);
  await assert.rejects(readFile(path.join(root, "restart-brokers.json")), { code: "ENOENT" });
});

test("일부 프로필의 상태 확인이나 중지가 실패해도 나머지를 중지하고 실패를 알린다", async (t) => {
  const { root, names, paths } = await fixture(t);
  await writeFile(path.join(root, "restart-brokers.json"), "{broken");
  const calls = [];
  const command = async (_cli, config, action) => {
    const name = path.relative(root, config).split(path.sep).join("/");
    calls.push([name, action]);
    if (name === names[0] && action === "status") throw new Error("fixture status failure");
    if (name === names[1] && action === "stop") throw new Error("fixture stop failure");
    return { stdout: "Local Broker  : Running (PID: 123)" };
  };
  let stoppedMcp = false;
  await assert.rejects(stopBrokers(paths, {
    updating: true, command, stopMcp: async () => { stoppedMcp = true; },
  }));
  assert.equal(stoppedMcp, true);
  assert.deepEqual(calls.filter((call) => call[1] === "stop").map((call) => call[0]), [names[1], names[2]]);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, "restart-brokers.json"), "utf8")), [names[1], names[2]]);

  await assert.rejects(stopBrokers(paths, {
    command: async () => ({ stdout: "Local Broker : Stopped" }),
    stopMcp: async () => { throw new Error("fixture mcp failure"); },
  }));
  await assert.rejects(readFile(path.join(root, "restart-brokers.json")), { code: "ENOENT" });
});

test("제거 훅은 런타임이 없거나 종료에 실패해도 제거를 중단하지 않는다", async () => {
  const source = await readFile(path.join(__dirname, "..", "scripts", "installer.nsh"), "utf8");
  assert.match(source, /\$\{If\} \$\{FileExists\} "\$INSTDIR\\resources\\node\\node\.exe"/);
  assert.match(source, /\$\{AndIf\} \$\{FileExists\} "\$INSTDIR\\resources\\maintenance\\broker-lifecycle\.js"/);
  assert.doesNotMatch(source, /^\s*(Quit|Abort|SetErrorLevel)\b/m);
});

test("재시작 목록에 다른 경로가 있으면 CLI 실행 전에 거부한다", async (t) => {
  const { root, paths } = await fixture(t);
  await writeFile(path.join(root, "restart-brokers.json"), '["../config.json"]');
  let called = false;
  await assert.rejects(resumeBrokers(paths, async () => { called = true; }));
  assert.equal(called, false);
});
