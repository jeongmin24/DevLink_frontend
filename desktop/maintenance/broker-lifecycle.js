const { execFile } = require("node:child_process");
const { mkdir, readdir, readFile, rename, unlink, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execute = promisify(execFile);
const markerName = "restart-brokers.json";

function profileName(name) {
  return name === "config.json"
    || /^accounts\/[a-f0-9]{64}\/[1-9][0-9]*\/config\.json$/.test(name)
    || /^accounts\/[a-f0-9]{64}\/[1-9][0-9]*\/teams\/[1-9][0-9]*\/[a-f0-9]{16}\/config\.json$/.test(name);
}

async function listProfiles(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  return entries.filter((entry) => entry.isFile()).map((entry) =>
    path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"),
  ).filter(profileName).sort();
}

async function pending(root) {
  const marker = await readFile(path.join(root, markerName), "utf8").catch((error) => {
    if (error.code === "ENOENT") return "[]";
    throw error;
  });
  const names = JSON.parse(marker);
  if (!Array.isArray(names) || names.some((name) => typeof name !== "string" || !profileName(name))) {
    throw new Error("연결 프로그램 재시작 목록을 확인할 수 없습니다.");
  }
  return names;
}

async function savePending(root, names) {
  const marker = path.join(root, markerName);
  if (!names.length) {
    await unlink(marker).catch((error) => { if (error.code !== "ENOENT") throw error; });
    return;
  }
  await mkdir(root, { recursive: true, mode: 0o700 });
  const temporary = `${marker}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify([...new Set(names)]), { mode: 0o600, flag: "wx" });
  try {
    await rename(temporary, marker);
  } finally {
    await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; });
  }
}

async function run(cli, config, command) {
  const env = { ...process.env };
  delete env.DEVLINK_TOKEN;
  return execute(cli, ["--config", config, command], { windowsHide: true, timeout: 45_000, env });
}

async function resumeBrokers(paths, command = run) {
  const root = path.dirname(paths.config);
  const names = await pending(root);
  const remaining = [];
  const available = new Set(await listProfiles(root));
  for (const name of names) {
    if (!available.has(name)) continue;
    try {
      await command(paths.cli, path.join(root, name), "start");
    } catch {
      remaining.push(name);
    }
  }
  await savePending(root, remaining);
  if (remaining.length) throw new Error("일부 연결 프로그램을 다시 시작하지 못했습니다.");
}

async function stopBundledMcp(resources) {
  const env = {
    ...process.env,
    DEVLINK_MAINTENANCE_NODE: path.join(resources, "node", "node.exe"),
    DEVLINK_MAINTENANCE_PID: String(process.pid),
  };
  const script = "$ErrorActionPreference = 'Stop'; Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.ExecutablePath -eq $env:DEVLINK_MAINTENANCE_NODE -and $_.ProcessId -ne [int]$env:DEVLINK_MAINTENANCE_PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction Stop }";
  await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    windowsHide: true, timeout: 30_000, env,
  });
}

async function stopBrokers(paths, { updating = false, command = run, stopMcp = stopBundledMcp, resources } = {}) {
  const root = path.dirname(paths.config);
  const profiles = await listProfiles(root);
  const running = [];
  let failed = false;
  // 일부 프로필이 실패해도 나머지 연결 프로그램과 MCP 종료 계속
  for (const name of profiles) {
    try {
      const status = await command(paths.cli, path.join(root, name), "status");
      if (/Local Broker\s*:\s*Running\b/.test(status.stdout)) running.push(name);
    } catch {
      failed = true;
    }
  }
  if (updating) {
    const previous = await pending(root).catch(() => {
      failed = true;
      return [];
    });
    await savePending(root, [...previous, ...running]);
  }
  for (const name of running) {
    try {
      await command(paths.cli, path.join(root, name), "stop");
    } catch {
      failed = true;
    }
  }
  try {
    await stopMcp(resources);
  } catch {
    failed = true;
  }
  if (!updating) await savePending(root, []);
  if (failed) throw new Error("일부 연결 프로그램을 종료하지 못했습니다.");
}

module.exports = { listProfiles, resumeBrokers, stopBrokers };

if (require.main === module) {
  const resources = path.resolve(__dirname, "..");
  const paths = {
    config: path.join(os.homedir(), ".devlink", "desktop", "config.json"),
    cli: path.join(resources, "bin", "devlink.exe"),
  };
  stopBrokers(paths, { resources, updating: process.argv.includes("--update") }).catch(() => {
    process.stderr.write("DevLink 연결 프로그램 일부를 종료하지 못했습니다.\n");
    process.exitCode = 1;
  });
}
