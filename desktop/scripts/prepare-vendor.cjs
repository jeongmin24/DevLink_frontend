const { spawn, spawnSync } = require("node:child_process");
const { cp, mkdir, readFile, rename, rm } = require("node:fs/promises");
const path = require("node:path");
const { checkCliRuntime } = require("./check-cli-runtime.cjs");

const desktop = path.resolve(__dirname, "..");
const client = path.resolve(desktop, "..", "..", "DevLink_client");
const vendor = path.join(desktop, "vendor");
const stage = path.join(desktop, `vendor-stage-${process.pid}`);

function run(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, windowsHide: true, stdio: "inherit" });
  if (result.error || result.status !== 0) throw new Error("동봉할 런타임을 준비하지 못했습니다.");
}

async function smoke(node, entry) {
  await new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.DEVLINK_BROKER_FILE;
    delete env.NODE_OPTIONS;
    const child = spawn(node, [entry, "--transport", "stdio"], { windowsHide: true, env });
    let output = "";
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.stdin.end();
      child.kill();
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(() => finish(new Error("MCP 초기화 응답을 받지 못했습니다.")), 15_000);
    child.once("error", finish);
    child.once("exit", () => finish(new Error("MCP 초기화 중 종료됐습니다.")));
    child.stdin.on("error", () => {});
    child.stderr.resume();
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      if (output.length > 65_536) return finish(new Error("MCP 초기화 출력이 너무 큽니다."));
      for (const line of output.split("\n").slice(0, -1)) {
        try {
          const value = JSON.parse(line);
          if (value.id === 1) finish(value.result?.serverInfo?.name === "devlink-mcp"
            ? undefined : new Error("MCP 초기화 응답이 올바르지 않습니다."));
        } catch { finish(new Error("MCP 초기화 출력이 올바르지 않습니다.")); }
      }
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "devlink-desktop-package", version: "0.1.0" },
    } })}\n`);
  });
}

async function main() {
  if (process.platform !== "win32" || process.arch !== "x64" || process.versions.node.split(".")[0] !== "24") {
    throw new Error("Windows x64의 공식 Node 24로 실행해주세요.");
  }
  const node = process.execPath;
  const cli = process.env.DEVLINK_VENDOR_CLI_PATH
    ? path.resolve(process.env.DEVLINK_VENDOR_CLI_PATH)
    : path.join(client, "rust", "target", "release", "devlink.exe");
  const mcp = path.join(client, "packages", "mcp-server");
  const npm = process.env.npm_execpath || path.join(path.dirname(node), "node_modules", "npm", "bin", "npm-cli.js");
  const appPackage = JSON.parse(await readFile(path.join(desktop, "package.json"), "utf8"));
  const mcpPackage = JSON.parse(await readFile(path.join(mcp, "package.json"), "utf8"));
  if (mcpPackage.version !== appPackage.version) throw new Error("앱과 MCP 런타임 버전이 다릅니다.");
  await mkdir(stage);
  try {
    await mkdir(path.join(stage, "node"));
    await cp(node, path.join(stage, "node", "node.exe"));
    await mkdir(path.join(stage, "bin", "mcp-server"), { recursive: true });
    await cp(cli, path.join(stage, "bin", "devlink.exe"));
    checkCliRuntime(await readFile(path.join(stage, "bin", "devlink.exe")));
    run(path.join(stage, "bin", "devlink.exe"), ["--version"]);
    const destination = path.join(stage, "bin", "mcp-server");
    for (const name of ["dist", "package.json", "package-lock.json"]) {
      await cp(path.join(mcp, name), path.join(destination, name), { recursive: true });
    }
    run(node, [npm, "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], destination);
    await smoke(path.join(stage, "node", "node.exe"), path.join(destination, "dist", "index.js"));
    await rm(vendor, { recursive: true, force: true });
    await rename(stage, vendor);
    process.stdout.write("CLI, Node 24, MCP 런타임 준비 및 초기화 확인 완료\n");
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
