const os = require("node:os");
const path = require("node:path");
const { loadDevelopmentPaths } = require("./setup-runner");

function packagedPaths(resources, home = os.homedir()) {
  return {
    cli: path.join(resources, "bin", "devlink.exe"),
    node: path.join(resources, "node", "node.exe"),
    entry: path.join(resources, "bin", "mcp-server", "dist", "index.js"),
    config: path.join(home, ".devlink", "desktop", "config.json"),
    serverUrl: "wss://api.devlink.ai.kr/",
    accountProfile: true,
  };
}

function loadApplicationPaths(app) {
  return app.isPackaged
    ? Promise.resolve(packagedPaths(process.resourcesPath))
    : loadDevelopmentPaths();
}

module.exports = { loadApplicationPaths, packagedPaths };
