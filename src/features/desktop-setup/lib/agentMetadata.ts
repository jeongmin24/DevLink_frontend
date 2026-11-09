import type { SetupAgentMetadata } from "../api/desktopApi";

export const agentParts = [
  { value: "FRONTEND", label: "프론트엔드" },
  { value: "BACKEND", label: "백엔드" },
  { value: "INFRA", label: "인프라" },
  { value: "OTHER", label: "기타" },
] as const;

const blankCharacters = "\t\n\r\f\v\u001c\u001d\u001e\u001f \u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2008\u2009\u200a\u2028\u2029\u205f\u3000";

function trimTag(role: string) {
  let start = 0;
  let end = role.length;
  while (start < end && role.charCodeAt(start) <= 32) start++;
  while (end > start && role.charCodeAt(end - 1) <= 32) end--;
  return role.slice(start, end);
}

export function createSetupAgentMetadata(
  part: string,
  rolesText: string,
): SetupAgentMetadata {
  const metadata: SetupAgentMetadata = {};
  if (part) {
    const selected = agentParts.find((option) => option.value === part);
    if (!selected) throw new Error("담당 파트를 다시 선택해주세요.");
    metadata.part = selected.value;
  }
  if (!rolesText.trim()) return metadata;

  const roles = rolesText.split(",");
  if (roles.length > 10) throw new Error("역할 태그는 최대 10개까지 입력해주세요.");
  if (roles.some((role) => role.length > 64)) {
    throw new Error("각 역할 태그는 64자 이내로 입력해주세요. 이모지는 2자로 계산해요.");
  }
  if (roles.some((role) => Array.from(role).every((character) => blankCharacters.includes(character)))) {
    throw new Error("쉼표 사이에 비어 있는 역할 태그가 있어요. 태그를 입력하거나 쉼표를 지워주세요.");
  }
  metadata.roles = [...new Set(roles.map(trimTag))];
  return metadata;
}
