const path = require("node:path");

function checkCliRuntime(data) {
  const check = (condition) => {
    if (!condition) throw new Error("Windows x64 CLI의 PE 가져오기 표가 올바르지 않습니다.");
  };
  const bytes = (offset, size) => {
    check(Number.isSafeInteger(offset) && offset >= 0 && size >= 0 && offset + size <= data.length);
  };
  const u16 = (offset) => { bytes(offset, 2); return data.readUInt16LE(offset); };
  const u32 = (offset) => { bytes(offset, 4); return data.readUInt32LE(offset); };
  check(Buffer.isBuffer(data));
  check(u16(0) === 0x5a4d);
  const pe = u32(0x3c);
  check(u32(pe) === 0x4550 && u16(pe + 4) === 0x8664);
  const optional = pe + 24;
  const optionalSize = u16(pe + 20);
  bytes(optional, optionalSize);
  check(optionalSize >= 112 && u16(optional) === 0x20b);
  const directoryCount = u32(optional + 108);
  check(directoryCount <= Math.floor((optionalSize - 112) / 8));
  const imageBase = data.readBigUInt64LE(optional + 24);
  const headerSize = u32(optional + 60);
  const sections = [];
  for (let i = 0; i < u16(pe + 6); i++) {
    const section = optional + optionalSize + i * 40;
    bytes(section, 40);
    sections.push({ rva: u32(section + 12), size: u32(section + 16), raw: u32(section + 20) });
  }
  const span = (rva, size = 1) => {
    check(rva > 0 && rva <= 0xffffffff);
    if (rva < headerSize) {
      check(rva + size <= headerSize);
      bytes(rva, size);
      return { offset: rva, end: Math.min(headerSize, data.length) };
    }
    const section = sections.find((entry) => rva >= entry.rva && rva + size <= entry.rva + entry.size);
    check(Boolean(section));
    const offset = section.raw + rva - section.rva;
    bytes(offset, size);
    return { offset, end: Math.min(section.raw + section.size, data.length) };
  };
  const dllName = (rva) => {
    const { offset, end } = span(rva);
    const terminator = data.indexOf(0, offset);
    check(terminator > offset && terminator < end);
    const name = data.toString("ascii", offset, terminator);
    check(/^[\x20-\x7e]+$/.test(name));
    return name;
  };
  // 일반 가져오기와 지연 가져오기 모두 검사
  const table = (index, stride, nameOffset) => {
    if (index >= directoryCount) return [];
    const directory = optional + 112 + index * 8;
    const rva = u32(directory);
    const size = u32(directory + 4);
    if (rva === 0 && size === 0) return [];
    check(rva > 0 && size >= stride);
    const names = [];
    for (let cursor = 0; cursor + stride <= size; cursor += stride) {
      const { offset } = span(rva + cursor, stride);
      if (data.subarray(offset, offset + stride).every((value) => value === 0)) return names;
      let nameRva = u32(offset + nameOffset);
      if (index === 13) {
        const attributes = u32(offset);
        check((attributes & ~1) === 0);
        if (!(attributes & 1)) nameRva = Number(BigInt(nameRva) - imageBase);
      }
      names.push(dllName(nameRva));
    }
    check(false);
  };
  const imports = table(1, 20, 12);
  const delayImports = table(13, 32, 4);
  const runtime = [...new Set([...imports, ...delayImports])].filter((name) =>
    /^(?:vcruntime|msvcp|msvcr|concrt|vcomp|vccorlib)\d.*\.dll$/i.test(path.win32.basename(name)),
  );
  if (runtime.length) {
    throw new Error(`CLI가 Visual C++ 재배포 DLL에 의존합니다: ${runtime.join(", ")}. Windows MSVC의 +crt-static 설정으로 다시 빌드해주세요.`);
  }
  return { imports, delayImports };
}

module.exports = { checkCliRuntime };
