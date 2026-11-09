const assert = require("node:assert/strict");
const { before, test } = require("node:test");

let createSetupAgentMetadata;
before(async () => {
  ({ createSetupAgentMetadata } = await import("../../src/features/desktop-setup/lib/agentMetadata.ts"));
});

test("화면의 미입력 항목은 생략하고 명시한 기타와 역할 태그는 전달한다", () => {
  assert.deepEqual(createSetupAgentMetadata("", ""), {});
  assert.deepEqual(createSetupAgentMetadata("", "  "), {});
  assert.deepEqual(createSetupAgentMetadata("OTHER", ""), { part: "OTHER" });
  assert.deepEqual(createSetupAgentMetadata("BACKEND", " API ,API,인증"), {
    part: "BACKEND", roles: ["API", "인증"],
  });
});

test("화면의 역할 태그는 정규화 전 개수·UTF-16 길이와 빈 항목을 검사한다", () => {
  const roles = Array.from({ length: 10 }, (_, i) => `${i}${"가".repeat(63)}`);
  assert.deepEqual(createSetupAgentMetadata("FRONTEND", roles.join(",")).roles, roles);
  assert.deepEqual(createSetupAgentMetadata("INFRA", "😀".repeat(32)).roles, ["😀".repeat(32)]);
  for (const value of ["API,", "API, ,인증", "API,\u3000", "😀".repeat(33), ` ${"가".repeat(64)}`, Array(11).fill("API").join(",")]) {
    assert.throws(() => createSetupAgentMetadata("BACKEND", value));
  }
  assert.throws(() => createSetupAgentMetadata("backend", ""), /담당 파트/);
});
