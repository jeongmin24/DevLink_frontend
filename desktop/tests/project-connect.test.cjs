const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

let chromium;
try {
  ({ chromium } = require(process.env.DEVLINK_TEST_PLAYWRIGHT || "playwright"));
} catch {
  // 브라우저 검증 환경이 있는 경우에만 실행
}

test("실제 연결 화면의 담당 정보 입력·검증·비밀번호 재입력·재시도", {
  skip: !chromium && "Playwright가 필요합니다. DEVLINK_TEST_PLAYWRIGHT로 모듈 경로를 지정할 수 있습니다.",
  timeout: 120_000,
}, async (t) => {
  const { createServer } = await import("vite");
  const root = path.resolve(__dirname, "../..");
  const entry = "/__devlink-project-connect-test.js";
  const virtualId = "\0devlink-project-connect-test.js";
  const server = await createServer({
    root, logLevel: "error", clearScreen: false,
    optimizeDeps: { entries: [], include: ["react", "react-dom/client", "react/jsx-runtime"] },
    server: { host: "127.0.0.1", port: 0, strictPort: false, open: false },
    plugins: [{
      name: "project-connect-test",
      resolveId(id) { if (id === entry) return virtualId; },
      load(id) {
        if (id !== virtualId) return;
        return `
          import React from "react";
          import { createRoot } from "react-dom/client";
          import ProjectConnectView from "/src/features/desktop-setup/components/ProjectConnectView.tsx";
          import "/src/styles/index.css";
          window.harness = { calls: [], results: [], tools: ["codex"] };
          const setup = {
            pickFolder: async () => ({ id: "selection", name: "테스트 프로젝트", tools: window.harness.tools }),
            run: async (...args) => { window.harness.calls.push(args); return window.harness.results.shift() ?? { state: "done" }; },
            onProgress: () => () => {}, check: async () => true, openConfigFolder: async () => {},
          };
          const props = {
            setup, getStatus: async () => ({ exitCode: 0, result: { data: { connection: { setupReady: false } } } }),
            account: { userId: 1, teamId: 2, email: "test@example.test" }, teamName: "테스트 팀",
            onRefreshAgents: () => {}, presentation: location.search.includes("modal") ? "modal" : "page",
          };
          createRoot(document.getElementById("root")).render(React.createElement(ProjectConnectView, props));
        `;
      },
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url?.split("?")[0] !== "/__devlink-project-connect-test") return next();
          const html = await vite.transformIndexHtml(req.url, `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main class="panel" style="max-width:640px;margin:24px auto;padding:24px"><div id="root"></div></main><script type="module" src="${entry}"></script></body></html>`);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(html);
        });
      },
    }],
  });
  t.after(() => server.close());
  await server.listen();
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.DEVLINK_TEST_BROWSER ? { executablePath: process.env.DEVLINK_TEST_BROWSER } : {}),
  });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 960, height: 960 } });
  page.setDefaultTimeout(10_000);
  page.on("pageerror", (error) => t.diagnostic(error.message));
  const address = server.httpServer.address();
  const url = `http://127.0.0.1:${address.port}/__devlink-project-connect-test`;
  const calls = () => page.evaluate(() => window.harness.calls);
  const open = async (modal = false) => {
    await page.goto(url + (modal ? "?modal" : ""));
    if (modal) await page.getByRole("button", { name: "이 PC 연결", exact: true }).click();
    await page.getByRole("button", { name: "폴더 선택", exact: true }).click();
    await page.getByLabel("담당 파트", { exact: true }).waitFor();
  };

  await t.test("도구가 하나여도 입력 확인 후 등록하며 비밀번호 재입력·오류 재시도에 같은 담당 정보를 전달한다", async () => {
    await open();
    assert.equal((await calls()).length, 0);
    await page.getByLabel("담당 파트", { exact: true }).selectOption("BACKEND");
    await page.getByLabel("역할 태그", { exact: true }).fill(" API ,API,인증");
    if (process.env.DEVLINK_TEST_SCREENSHOT) await page.screenshot({ path: process.env.DEVLINK_TEST_SCREENSHOT, fullPage: true });
    await page.evaluate(() => { window.harness.results = [{ state: "password" }, { state: "password", message: "다시 확인해주세요." }, { state: "error", message: "연결 실패" }, { state: "done" }]; });
    await page.getByRole("button", { name: "연결하기", exact: true }).click();
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByLabel("비밀번호", { exact: true }).fill("test-password");
      await page.getByRole("button", { name: "계속", exact: true }).click();
    }
    await page.getByRole("button", { name: "다시 시도", exact: true }).click();
    await page.getByRole("button", { name: "대시보드로 이동", exact: true }).waitFor();
    const results = await calls();
    assert.equal(results.length, 4);
    for (const call of results) assert.deepEqual(call[3], { part: "BACKEND", roles: ["API", "인증"] });
    assert.equal(results[1][2], "test-password");
    assert.equal(results[2][2], "test-password");
  });

  await t.test("태그 오류는 화면에서 표시하고 등록 호출을 막는다", async () => {
    await open();
    for (const invalid of ["API,,인증", "😀".repeat(33), Array(11).fill("API").join(",")]) {
      await page.getByLabel("역할 태그", { exact: true }).fill(invalid);
      await page.getByRole("button", { name: "연결하기", exact: true }).click();
      await page.getByRole("alert").waitFor();
      assert.equal((await calls()).length, 0);
    }
    await page.getByLabel("역할 태그", { exact: true }).fill("");
    await page.getByRole("button", { name: "연결하기", exact: true }).click();
    await page.getByRole("button", { name: "대시보드로 이동", exact: true }).waitFor();
    assert.deepEqual((await calls())[0][3], {});
  });

  await t.test("모달에서 두 도구 중 선택한 뒤 담당 정보를 전달하며 결과 불명에는 재시도를 제공하지 않는다", async () => {
    await page.goto(url + "?modal");
    await page.getByRole("button", { name: "이 PC 연결", exact: true }).click();
    await page.evaluate(() => { window.harness.tools = ["codex", "claude-code"]; window.harness.results = [{ state: "error", code: "SETUP_REGISTRATION_UNKNOWN", message: "등록 결과 확인 필요" }]; });
    await page.getByRole("button", { name: "폴더 선택", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "연결하기", exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: /Claude Code 이 PC에서 사용 가능/ }).click();
    await page.getByLabel("담당 파트", { exact: true }).selectOption("INFRA");
    await page.getByRole("button", { name: "연결하기", exact: true }).click();
    await page.getByRole("button", { name: "Agent 목록 확인", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "다시 시도", exact: true }).count(), 0);
    assert.deepEqual((await calls())[0].slice(0, 2), ["selection", "claude-code"]);
    assert.deepEqual((await calls())[0][3], { part: "INFRA" });
  });

  await t.test("기존 Agent와 담당 정보가 충돌하면 재시도 대신 도구를 고정한 입력 화면으로 돌아가 비운 값으로 다시 연결한다", async () => {
    await page.goto(url);
    await page.evaluate(() => {
      window.harness.tools = ["codex", "claude-code"];
      window.harness.results = [
        { state: "error", code: "SETUP_AGENT_BINDING_CONFLICT", message: "담당 정보 충돌" },
        { state: "error", code: "SETUP_AGENT_BINDING_CONFLICT", message: "연결 정보 충돌" },
      ];
    });
    await page.getByRole("button", { name: "폴더 선택", exact: true }).click();
    await page.getByRole("button", { name: /Codex 이 PC에서 사용 가능/ }).click();
    await page.getByLabel("담당 파트", { exact: true }).selectOption("BACKEND");
    await page.getByRole("button", { name: "연결하기", exact: true }).click();
    await page.getByRole("button", { name: "담당 정보 다시 입력", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "다시 시도", exact: true }).count(), 0);
    await page.getByRole("button", { name: "담당 정보 다시 입력", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: /Claude Code 이 PC에서 사용 가능/ }).isDisabled(), true);
    await page.getByLabel("담당 파트", { exact: true }).selectOption("");
    await page.getByRole("button", { name: "연결하기", exact: true }).click();
    await page.getByRole("button", { name: "폴더 다시 선택", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "담당 정보 다시 입력", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "다시 시도", exact: true }).count(), 0);
    const results = await calls();
    assert.deepEqual(results.map((call) => call.slice(1, 2)), [["codex"], ["codex"]]);
    assert.deepEqual(results[0][3], { part: "BACKEND" });
    assert.deepEqual(results[1][3], {});
  });

  await t.test("좁은 화면에서도 입력 폼이 가로로 넘치지 않는다", async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole("button", { name: "연결하기", exact: true }).waitFor({ state: "visible" });
  });
});
