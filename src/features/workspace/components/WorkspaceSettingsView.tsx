import type { User } from "@/features/auth/types";
import { Icon } from "@/components/ui";
import { formatDate } from "@/utils";
import "../styles/workspace-utilities.css";

interface WorkspaceSettingsViewProps {
  user: User;
  autoRefresh: boolean;
  onAutoRefreshChange: (enabled: boolean) => void;
  loggingOut: boolean;
  onLogout: () => void;
  onGuide: () => void;
}

export default function WorkspaceSettingsView({ user, autoRefresh, onAutoRefreshChange, loggingOut, onLogout, onGuide }: WorkspaceSettingsViewProps) {
  return <div className="workspace-settings">
    <div className="workspace-view-heading"><h1>설정</h1></div>
    <section className="workspace-settings-card"><h2>내 프로필</h2><div className="settings-profile"><span className="settings-profile-avatar">{Array.from(user.nickname || user.name)[0]}</span><div><strong>{user.nickname || user.name}</strong><p>{user.email}</p></div></div><dl className="settings-profile-fields"><div><dt>이름</dt><dd>{user.name}</dd></div><div><dt>닉네임</dt><dd>{user.nickname || "등록된 닉네임 없음"}</dd></div><div><dt>이메일</dt><dd>{user.email}</dd></div><div><dt>가입일</dt><dd>{formatDate(user.createdAt)}</dd></div></dl></section>
    <section className="workspace-settings-card"><h2>기록 표시</h2><p>아래 설정은 현재 계정의 이 브라우저에 저장됩니다.</p><div className="settings-preference-row"><div><strong id="settings-auto-refresh">대화 기록 자동 갱신</strong><p id="settings-auto-refresh-description">목록은 30초, 열어 둔 대화는 20초마다 새 기록을 확인합니다.</p></div><button type="button" role="switch" className="settings-toggle" aria-labelledby="settings-auto-refresh" aria-describedby="settings-auto-refresh-description" aria-checked={autoRefresh} onClick={() => onAutoRefreshChange(!autoRefresh)}><span /></button></div></section>
    <section className="workspace-settings-card"><h2>도움말과 계정</h2><div className="settings-help-row"><Icon name="book" size={19} /><div><strong>사용 가이드</strong><p>팀 참여, Agent 등록과 연결 토큰 발급 방법</p></div><button type="button" className="button button-secondary button-small" onClick={onGuide}>가이드 열기<Icon name="arrow" size={14} /></button></div><div className="settings-help-row"><Icon name="logout" size={19} /><div><strong>로그아웃</strong><p>현재 계정의 워크스페이스에서 나갑니다.</p></div><button type="button" className="button button-secondary button-small" disabled={loggingOut} onClick={onLogout}>{loggingOut ? "로그아웃 중" : "로그아웃"}</button></div></section>
  </div>;
}
