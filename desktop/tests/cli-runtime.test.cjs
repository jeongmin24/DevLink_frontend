const assert = require("node:assert/strict");
const { test } = require("node:test");
const { checkCliRuntime } = require("../scripts/check-cli-runtime.cjs");

function executable(imports = [], delayImports = [], rvaBased = true) {
  const data = Buffer.alloc(0x1000);
  data.writeUInt16LE(0x5a4d, 0);
  data.writeUInt32LE(0x80, 0x3c);
  data.writeUInt32LE(0x4550, 0x80);
  data.writeUInt16LE(0x8664, 0x84);
  data.writeUInt16LE(1, 0x86);
  data.writeUInt16LE(240, 0x94);
  data.writeUInt16LE(0x20b, 0x98);
  data.writeBigUInt64LE(0x400000n, 0x98 + 24);
  data.writeUInt32LE(0x200, 0x98 + 60);
  data.writeUInt32LE(16, 0x98 + 108);
  const section = 0x98 + 240;
  data.writeUInt32LE(0xe00, section + 8);
  data.writeUInt32LE(0x1000, section + 12);
  data.writeUInt32LE(0xe00, section + 16);
  data.writeUInt32LE(0x200, section + 20);
  let name = 0x700;
  for (const [index, offset, stride, nameOffset, names] of [
    [1, 0x200, 20, 12, imports], [13, 0x400, 32, 4, delayImports],
  ]) {
    if (!names.length) continue;
    data.writeUInt32LE(offset + 0xe00, 0x98 + 112 + index * 8);
    data.writeUInt32LE((names.length + 1) * stride, 0x98 + 116 + index * 8);
    names.forEach((dll, i) => {
      if (index === 13) data.writeUInt32LE(rvaBased ? 1 : 0, offset + i * stride);
      const address = name + 0xe00 + (index === 13 && !rvaBased ? 0x400000 : 0);
      data.writeUInt32LE(address, offset + i * stride + nameOffset);
      data.write(dll, name, "ascii");
      name += Buffer.byteLength(dll) + 1;
    });
  }
  return data;
}

test("Windows 기본 DLL과 UCRT는 허용하고 가져오기 종류별로 반환한다", () => {
  assert.deepEqual(checkCliRuntime(executable(["KERNEL32.dll", "api-ms-win-crt-runtime-l1-1-0.dll"], ["USER32.dll"])), {
    imports: ["KERNEL32.dll", "api-ms-win-crt-runtime-l1-1-0.dll"], delayImports: ["USER32.dll"],
  });
});

test("Visual C++ 런타임의 일반·지연 가져오기는 대소문자와 버전에 관계없이 거부한다", () => {
  for (const dll of ["VCRUNTIME140.dll", "vCrUnTiMe140_1.DlL", "MSVCP140.dll", "msvcp140_atomic_wait.dll", "MSVCR120.dll", "CONCRT140.dll", "VCOMP140.dll", "VCCORLIB140.dll"]) {
    assert.throws(() => checkCliRuntime(executable([dll])), /Visual C\+\+ 재배포 DLL/);
    assert.throws(() => checkCliRuntime(executable(["KERNEL32.dll"], [dll])), /Visual C\+\+ 재배포 DLL/);
  }
});

test("지연 가져오기의 VA 형식에서도 런타임 의존성을 검사한다", () => {
  assert.throws(() => checkCliRuntime(executable([], ["VCRUNTIME140.dll"], false)), /Visual C\+\+ 재배포 DLL/);
});

test("깨진 실행 파일이나 잘못된 DLL 주소는 검사 통과로 처리하지 않는다", () => {
  assert.throws(() => checkCliRuntime(Buffer.from("VCRUNTIME140.dll")), /PE 가져오기 표/);
  const broken = executable(["KERNEL32.dll"]);
  broken.writeUInt32LE(0xffffff00, 0x200 + 12);
  assert.throws(() => checkCliRuntime(broken), /PE 가져오기 표/);
  assert.throws(() => checkCliRuntime(executable(["KERNEL32.dll"]).subarray(0, 0x700)), /PE 가져오기 표/);
  const unterminated = executable(["KERNEL32.dll"]);
  unterminated.writeUInt32LE(20, 0x98 + 116 + 8);
  assert.throws(() => checkCliRuntime(unterminated), /PE 가져오기 표/);
});
