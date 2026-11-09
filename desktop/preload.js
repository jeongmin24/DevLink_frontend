const { contextBridge, ipcRenderer } = require("electron");

function appArgument(name) {
  const prefix = `--devlink-${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const origin = appArgument("origin");
if (process.isMainFrame && window.location.origin === origin) {
  contextBridge.exposeInMainWorld("devlinkDesktop", {
    version: appArgument("version"),
    ...(["http://localhost:5173", "https://devlink.ai.kr"].includes(origin) && {
      getStatus: (account) => ipcRenderer.invoke("devlink:status", account),
      setup: {
        pickFolder: (account) => ipcRenderer.invoke("devlink:pickFolder", account),
        run: (id, tool, password, metadata) => ipcRenderer.invoke("devlink:setup", id, tool, password, metadata),
        check: (id) => ipcRenderer.invoke("devlink:checkSetup", id),
        openConfigFolder: (id) => ipcRenderer.invoke("devlink:openConfigFolder", id),
        onProgress: (listener) => {
          const handler = (_event, progress) => listener(progress);
          ipcRenderer.on("devlink:setup-event", handler);
          return () => ipcRenderer.removeListener("devlink:setup-event", handler);
        },
      },
    }),
  });
}
