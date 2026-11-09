const { execFile, spawn } = require("node:child_process");
const { access, mkdir, mkdtemp, readFile, readdir, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execute = promisify(execFile);

async function main() {
  const output = path.resolve(__dirname, "..", "dist", "verification");
  await mkdir(output, { recursive: true });
  const record = path.join(output, `paths-${process.pid}.json`);
  const env = { ...process.env, DEVLINK_VERIFY_RECORD: record };
  delete env.ELECTRON_RUN_AS_NODE;
  let testInstall;
  try {
    if (process.argv.includes("--installer")) {
      const profileRoot = path.join(os.homedir(), ".devlink", "desktop");
      const profileExists = await access(profileRoot).then(() => true, () => false);
      const installed = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        "@(Get-ChildItem 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall' | Get-ItemProperty | Where-Object { $_.DisplayName -eq 'DevLink' }).Count"], { windowsHide: true });
      if (profileExists || installed.stdout.trim() !== "0") throw new Error("기존 DevLink 설치 또는 배포 프로필이 있어 설치 검증을 중단합니다.");
      testInstall = await mkdtemp(path.join(process.env.LOCALAPPDATA, "Programs", "DevLink-verify-install-"));
      const installer = path.join(output, "..", `DevLink-Setup-${require("../package.json").version}.exe`);
      await execute(process.env.DEVLINK_VERIFY_INITIAL_INSTALLER || installer, ["/S", `/D=${testInstall}`], { windowsHide: true, timeout: 120_000 });
      await access(path.join(testInstall, "DevLinkDesktop.exe"));
      console.log("통과: 실제 NSIS 설치 및 동봉 런타임 배치");
      env.DEVLINK_VERIFY_INSTALL_DIR = testInstall;
      env.DEVLINK_VERIFY_INSTALLER = installer;
    }
    process.exitCode = await new Promise((resolve, reject) => {
      const child = spawn(require("electron"), [path.join(__dirname, "verify-connection.cjs")], {
        env, windowsHide: true, stdio: "inherit",
      });
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
  } finally {
    const created = await readFile(record, "utf8").then(JSON.parse).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (created) {
      for (const [target, parent, prefix] of [
        [created.root, path.join(os.homedir(), ".devlink", "desktop-tests"), "connection-"],
        [created.install, path.join(process.env.LOCALAPPDATA, "Programs"), "DevLink-verify-"],
      ]) {
        if (path.dirname(path.resolve(target)) !== parent || !path.basename(target).startsWith(prefix)) {
          throw new Error("검증 임시 폴더 경로가 올바르지 않습니다.");
        }
        if (testInstall && target === testInstall) continue;
        await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
      }
      if (testInstall && created.profileRoot === path.join(os.homedir(), ".devlink", "desktop")) {
        await rm(created.profileRoot, { recursive: true, force: true });
      }
    }
    if (testInstall) {
      const names = await readdir(testInstall).catch(() => []);
      const uninstaller = names.find((name) => /^Uninstall .*\.exe$/.test(name));
      const runtimeExists = await access(path.join(testInstall, "resources", "node", "node.exe")).then(() => true, () => false);
      if (uninstaller && runtimeExists) await execute(path.join(testInstall, uninstaller), ["/S", `_?=${testInstall}`], { windowsHide: true, timeout: 120_000 });
      if (path.dirname(testInstall) !== path.join(process.env.LOCALAPPDATA, "Programs") || !path.basename(testInstall).startsWith("DevLink-verify-install-")) throw new Error("설치 검증 경로를 확인해주세요.");
      await rm(testInstall, { recursive: true, force: true });
    }
    await rm(record, { force: true });
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
