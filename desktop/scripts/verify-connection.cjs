const assert = require("node:assert/strict");
const { execFile, execFileSync, spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { app, BrowserWindow, dialog } = require("electron");
const { registerSetupHandlers } = require("../setup-ipc");
const { listTeamProfiles, resolveProjectPaths } = require("../setup-profiles");
const { runStatus } = require("../setup-runner");
const { resumeBrokers, stopBrokers } = require("../maintenance/broker-lifecycle");

const webOrigin = "http://localhost:5173";
const desktop = path.resolve(__dirname, "..");
const client = path.resolve(desktop, "..", "..", "DevLink_client");
const checks = [];
const execute = promisify(execFile);
let window;
let root;
let install;
let paths;
let picked;
let installedApp;
let configs = new Set();
const oldPath = process.env.PATH;
app.on("window-all-closed", () => {});

async function waitFor(expression, label, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return;
    const error = await window.webContents.executeJavaScript("document.querySelector('#verification .inline-error')?.textContent");
    if (error) throw new Error(`${label}: ${error}`);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`${label}: 시간 초과`);
}

async function click(text) {
  const code = `Array.from(document.querySelectorAll('#verification button')).find(b => b.textContent.trim() === ${JSON.stringify(text)} || b.querySelector('strong')?.textContent.trim() === ${JSON.stringify(text)})`;
  await waitFor(`Boolean(${code})`, `${text} 버튼`, 15_000);
  await window.webContents.executeJavaScript(`${code}.click()`);
}

async function mount(account, scenario) {
  await window.webContents.executeJavaScript(`(async () => {
    const reactModule = await import('/node_modules/.vite/deps/react.js');
    const React = reactModule.default || reactModule;
    const domModule = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { createRoot } = domModule.default || domModule;
    const { default: View } = await import('/src/features/desktop-setup/components/ProjectConnectView.tsx');
    if (!window.verificationRoot) {
      document.body.innerHTML = '<main id="verification" style="max-width:700px;margin:40px auto;padding:24px"></main>';
      window.verificationRoot = createRoot(document.getElementById('verification'));
    }
    window.verificationConnected = false;
    window.verificationRoot.render(React.createElement(View, {
      key: ${JSON.stringify(scenario)}, account: ${JSON.stringify(account)}, teamName: '로컬 검증 팀',
      setup: window.devlinkDesktop.setup, getStatus: window.devlinkDesktop.getStatus,
      presentation: 'page', onRefreshAgents() {}, onConnected() { window.verificationConnected = true; },
    }));
  })()`);
}

async function connect(account, project, password, scenario, manual = false) {
  picked = project;
  await mount(account, scenario);
  await click("폴더 선택");
  await waitFor("Boolean(document.querySelector('#verification input[type=password], #verification .project-connect-tools')) || window.verificationConnected", "도구·계정 확인");
  if (await window.webContents.executeJavaScript("Boolean(document.querySelector('#verification .project-connect-tools'))")) {
    await click("Codex");
  }
  await waitFor("Boolean(document.querySelector('#verification input[type=password]')) || window.verificationConnected", "비밀번호 확인");
  if (await window.webContents.executeJavaScript("Boolean(document.querySelector('#verification input[type=password]'))")) {
    await window.webContents.executeJavaScript(`document.querySelector('#verification input[type=password]').value = ${JSON.stringify(password)}; document.querySelector('#verification form').requestSubmit();`);
  }
  await waitFor("Boolean(document.querySelector('#verification pre')) || window.verificationConnected", "프로젝트 연결");
  if (manual) {
    assert.equal(await window.webContents.executeJavaScript("window.verificationConnected"), false);
    const snippet = await window.webContents.executeJavaScript("document.querySelector('#verification pre').textContent");
    const target = path.join(project, ".codex", "config.toml");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, snippet);
    await click("적용했어요, 다시 확인");
    await waitFor("window.verificationConnected", "직접 적용 후 확인");
  } else {
    await waitFor("window.verificationConnected", "연결 완료");
  }
  const selected = await resolveProjectPaths(paths, account, await realpath(project));
  configs.add(selected.config);
  const status = await runStatus(selected);
  assert.equal(status.result.data.connection.setupReady, true);
  assert.equal(status.result.data.teamId, String(account.teamId));
  assert.ok(status.result.data.agentId);
  checks.push(scenario);
  console.log(`통과: ${scenario}`);
  return { config: selected.config, agentId: status.result.data.agentId };
}

async function main() {
  if (process.platform !== "win32") throw new Error("Windows 전용 검증입니다.");
  const testParent = path.join(os.homedir(), ".devlink", "desktop-tests");
  await mkdir(testParent, { recursive: true });
  root = await mkdtemp(path.join(testParent, "connection-"));
  install = process.env.DEVLINK_VERIFY_INSTALL_DIR
    || await mkdtemp(path.join(process.env.LOCALAPPDATA, "Programs", "DevLink-verify-"));
  const profileRoot = process.env.DEVLINK_VERIFY_INSTALL_DIR
    ? path.join(os.homedir(), ".devlink", "desktop") : path.join(root, "profile");
  await mkdir(profileRoot);
  if (process.env.DEVLINK_VERIFY_RECORD) {
    await writeFile(process.env.DEVLINK_VERIFY_RECORD, JSON.stringify({ root, install, profileRoot }));
  }
  const resources = path.join(install, "resources");
  if (!process.env.DEVLINK_VERIFY_INSTALL_DIR) {
    for (const name of ["bin", "node"]) await cp(path.join(desktop, "vendor", name), path.join(resources, name), { recursive: true });
  }
  paths = {
    cli: path.join(resources, "bin", "devlink.exe"), node: path.join(resources, "node", "node.exe"),
    entry: path.join(resources, "bin", "mcp-server", "dist", "index.js"),
    config: path.join(profileRoot, "config.json"), serverUrl: "ws://127.0.0.1:8080/", accountProfile: true,
  };
  app.setPath("userData", path.join(root, "electron"));
  await app.whenReady();
  window = new BrowserWindow({ show: false, width: 1100, height: 850, webPreferences: {
    preload: path.join(desktop, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true,
    additionalArguments: [`--devlink-origin=${webOrigin}`, "--devlink-version=0.1.0"],
  } });
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [picked] });
  registerSetupHandlers(window, webOrigin, async () => paths);

  const cookies = new Map();
  async function request(route, body) {
    const headers = { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") };
    if (body) {
      const csrf = await request("/auth/csrf");
      headers.Cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
      headers[csrf.headerName] = csrf.token;
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(`${webOrigin}/api/v1${route}`, { method: body ? "POST" : "GET", headers, body: body && JSON.stringify(body) });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const at = pair.indexOf("=");
      cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
    const result = await response.json();
    if (!response.ok || result.success !== true) throw new Error(`로컬 API ${route}: ${response.status}`);
    return result.data;
  }
  const id = randomBytes(6).toString("hex");
  const email = `desktop-${id}@example.test`;
  const password = `Test-${randomBytes(18).toString("hex")}`;
  await request("/auth/signup", { email, password, name: "Desktop Verify" });
  await request("/auth/login", { email, password });
  const user = await request("/auth/users/me");
  const team = await request("/teams", { name: `Desktop ${id}` });
  const other = await request("/teams", { name: `Desktop other ${id}` });
  for (const [name, value] of cookies) await window.webContents.session.cookies.set({ url: webOrigin, name, value, httpOnly: true });
  await window.loadURL(webOrigin);
  const account = { userId: user.userId, teamId: team.teamId, email };
  const projects = ["first", "second", "manual"].map((name) => path.join(root, name));
  for (const project of projects) await mkdir(project);
  const first = await connect(account, projects[0], password, "첫 프로젝트 연결 및 설치 위치 ACL");
  const before = await readFile(path.join(projects[0], ".codex", "config.toml"));
  const reused = await connect(account, projects[0], password, "같은 폴더 재연결");
  assert.equal(reused.agentId, first.agentId);
  assert.deepEqual(await readFile(path.join(projects[0], ".codex", "config.toml")), before);
  const second = await connect(account, projects[1], password, "같은 계정의 두 번째 프로젝트");
  const otherTeam = await connect({ ...account, teamId: other.teamId }, projects[0], password, "다른 팀의 같은 폴더 연결");
  assert.equal(new Set([first.config, second.config, otherTeam.config]).size, 3);
  assert.equal((await listTeamProfiles(paths, account)).length, 2);

  const host = path.join(root, "host");
  await mkdir(host);
  execFileSync("rustc", ["--edition=2024", path.join(client, "rust", "crates", "devlink-cli", "tests", "support", "tool_host.rs"), "-o", path.join(host, "codex.exe")], { windowsHide: true });
  await writeFile(path.join(host, "codex.probe"), "codex-cli 9.9.9");
  process.env.PATH = `${host}${path.delimiter}${oldPath}`;
  await connect(account, projects[2], password, "미검증 Host 직접 적용 후 화면 확인", true);
  const manualBefore = await readFile(path.join(projects[2], ".codex", "config.toml"));
  await connect(account, projects[2], password, "직접 적용 후 새 setup 재실행");
  assert.deepEqual(await readFile(path.join(projects[2], ".codex", "config.toml")), manualBefore);

  if (process.env.DEVLINK_VERIFY_INSTALLER) {
    const before = new Map();
    assert.equal(configs.size, 4);
    for (const config of configs) {
      before.set(config, await readFile(config));
      const { connection } = (await runStatus({ ...paths, config })).result.data;
      assert.equal(connection.broker, "running", "업데이트 전 브로커 실행 확인");
      assert.equal(connection.identity, "verified", "업데이트 전 서버 계정 연결 확인");
    }
    await execute(process.env.DEVLINK_VERIFY_INSTALLER, ["/S", `/D=${install}`], { windowsHide: true, timeout: 120_000 });
    const marker = path.join(profileRoot, "restart-brokers.json");
    const expected = [...configs].map((config) => path.relative(profileRoot, config).split(path.sep).join("/")).sort();
    assert.deepEqual(JSON.parse(await readFile(marker, "utf8")).sort(), expected);
    for (const [config, contents] of before) assert.deepEqual(await readFile(config), contents);
    checks.push("실제 NSIS 업데이트가 기본 종료 검사 전에 연결 4개 저장·프로필 보존");
  } else {
    await stopBrokers(paths, { updating: true, resources });
  }
  for (const config of configs) assert.equal((await runStatus({ ...paths, config })).result.data.connection.setupReady, false);
  if (process.env.DEVLINK_VERIFY_INSTALLER) {
    installedApp = spawn(path.join(install, "DevLinkDesktop.exe"), [], { windowsHide: true, stdio: "ignore", env: { ...process.env } });
    await new Promise((resolve, reject) => { installedApp.once("spawn", resolve); installedApp.once("error", reject); });
    const deadline = Date.now() + 90_000;
    while (true) {
      const ready = await Promise.all([...configs].map(async (config) => {
        const { connection } = (await runStatus({ ...paths, config })).result.data;
        return connection.broker === "running" && connection.identity === "verified" && connection.credentials === "valid";
      }));
      const markerRemoved = await readFile(path.join(profileRoot, "restart-brokers.json")).then(() => false, (error) => {
        if (error.code === "ENOENT") return true;
        throw error;
      });
      if (ready.every(Boolean) && markerRemoved) break;
      if (installedApp.exitCode !== null) throw new Error("설치된 앱이 연결 복원 전에 종료됐습니다.");
      if (Date.now() >= deadline) throw new Error("설치된 앱의 연결 복원 시간 초과");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await assert.rejects(readFile(path.join(profileRoot, "restart-brokers.json")), { code: "ENOENT" });
    assert.equal((await runStatus({ ...paths, config: second.config })).result.data.connection.setupReady, true);
    await execute("taskkill", ["/PID", String(installedApp.pid), "/F"], { windowsHide: true });
    installedApp = undefined;
    checks.push("업데이트 후 설치된 앱 실제 실행으로 연결 4개 자동 복원·재시작 목록 정리");
  } else {
    await resumeBrokers(paths);
    assert.equal((await runStatus({ ...paths, config: second.config })).result.data.connection.setupReady, true);
    checks.push("여러 프로젝트 중지 및 업데이트 후 재시작");
  }
  if (process.env.DEVLINK_VERIFY_INSTALLER) {
    const snapshots = new Map();
    const pids = [];
    for (const config of configs) {
      assert.equal((await runStatus({ ...paths, config })).result.data.connection.broker, "running", "앱 종료 후에도 제거 전 브로커 실행 유지");
      const runtime = path.join(path.dirname(config), ".devlink-runtime");
      pids.push(JSON.parse(await readFile(path.join(runtime, "runtime.json"), "utf8")).pid);
      for (const file of [config, path.join(runtime, "agent-profile.json"), path.join(runtime, "broker.json")]) {
        snapshots.set(file, await readFile(file));
      }
    }
    const { readdir } = require("node:fs/promises");
    const uninstaller = (await readdir(install)).find((name) => /^Uninstall .*\.exe$/.test(name));
    assert.ok(uninstaller);
    await execute(path.join(install, uninstaller), ["/S", `_?=${install}`], { windowsHide: true, timeout: 120_000 });
    for (const [file, before] of snapshots) assert.deepEqual(await readFile(file), before);
    for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    checks.push("실제 NSIS 제거 중 브로커 종료·프로필 및 자격 보존");
  }
  const output = path.join(desktop, "dist", "verification");
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "connection.png"), (await window.webContents.capturePage()).toPNG());
  await writeFile(path.join(output, "connection.json"), JSON.stringify({ checks, server: paths.serverUrl, installedRuntimeAcl: "passed" }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks }));
}

main().catch((error) => { console.error(error.message, error.cause?.code || ""); process.exitCode = 1; }).finally(async () => {
  process.env.PATH = oldPath;
  if (installedApp?.pid && installedApp.exitCode === null) {
    await execute("taskkill", ["/PID", String(installedApp.pid), "/T", "/F"], { windowsHide: true }).catch(() => {});
  }
  if (paths) {
    const profiles = await readdirConfigs();
    for (const config of profiles) {
      try { execFileSync(paths.cli, ["--config", config, "stop"], { windowsHide: true, stdio: "ignore", timeout: 45_000 }); } catch {}
    }
  }
  window?.destroy();
  if (root && path.dirname(root) === path.join(os.homedir(), ".devlink", "desktop-tests")) {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
  if (!process.env.DEVLINK_VERIFY_INSTALL_DIR && install && path.dirname(install) === path.join(process.env.LOCALAPPDATA, "Programs") && path.basename(install).startsWith("DevLink-verify-")) await rm(install, { recursive: true, force: true });
  app.exit(process.exitCode || 0);
});

async function readdirConfigs() {
  const { listProfiles } = require("../maintenance/broker-lifecycle");
  return (await listProfiles(path.dirname(paths.config))).map((name) => path.join(path.dirname(paths.config), name));
}
