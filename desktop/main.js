const { app, BrowserWindow, dialog, shell } = require("electron");
const path = require("node:path");
const { registerSetupHandlers } = require("./setup-ipc");
const { loadApplicationPaths } = require("./runtime-paths");

const webOrigin = app.isPackaged ? "https://devlink.ai.kr" : "http://localhost:5173";

if (process.platform === "win32") app.setAppUserModelId("kr.ai.devlink.desktop");

function openExternal(url) {
  const target = URL.parse(url);
  if (target && ["http:", "https:"].includes(target.protocol) && !target.username && !target.password) {
    void shell.openExternal(target.href).catch(() => {});
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, "assets", "devlink.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--devlink-version=${app.getVersion()}`, `--devlink-origin=${webOrigin}`],
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event) => {
    if (URL.parse(event.url)?.origin === webOrigin) return;
    event.preventDefault();
    openExternal(event.url);
  });
  window.webContents.on("will-redirect", (event) => {
    if (event.isMainFrame && URL.parse(event.url)?.origin !== webOrigin) event.preventDefault();
  });

  registerSetupHandlers(window, webOrigin, () => loadApplicationPaths(app));

  void window.loadURL(webOrigin).catch(() => {
    if (!window.isDestroyed()) return window.loadFile(path.join(__dirname, "offline.html"));
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.whenReady().then(async () => {
    if (app.isPackaged) {
      try {
        const { resumeBrokers } = require(path.join(process.resourcesPath, "maintenance", "broker-lifecycle"));
        await resumeBrokers(await loadApplicationPaths(app));
      } catch {
        dialog.showErrorBox("연결 프로그램 재시작 필요", "업데이트 전 연결을 일부 복원하지 못했습니다. 앱을 다시 시작하거나 같은 프로젝트로 다시 연결해주세요.");
      }
    }
    createWindow();
  });
}
app.on("window-all-closed", () => app.quit());
