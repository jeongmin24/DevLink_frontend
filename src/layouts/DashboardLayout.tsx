import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import PageTitle from "@/components/common/PageTitle";
import { Icon } from "@/components/ui";
import { useSession } from "@/features/auth/hooks/useSession";
import type { Team } from "@/features/teams/types";
import type { TaskListItem } from "@/features/tasks/types";
import { taskTitle, taskStatusLabels } from "@/features/tasks/utils/taskPresentation";
import { API_BASE_URL } from "@/lib/apiClient";
import "@/styles/dashboard-layout.css";

export type WorkspaceView = "workspace" | "agents" | "teams" | "conversation" | "guide" | "settings" | "design";

interface DashboardLayoutProps {
  children: ReactNode;
  view: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  teams: Team[];
  selectedTeamId: number | null;
  teamsLoading: boolean;
  workspaceLoading: boolean;
  onSelectTeam: (teamId: number) => void;
  onRefresh: () => void;
  onReturnToScene: () => void;
  taskList?: TaskListItem[];
  tasksLoading?: boolean;
  tasksError?: string | null;
  selectedTaskId?: number | null;
  onSelectTask?: (taskId: number) => void;
}

const viewLabels: Record<WorkspaceView, string> = {
  workspace: "대시보드",
  agents: "Agent 관리",
  teams: "팀 관리",
  conversation: "채팅",
  guide: "사용 가이드",
  settings: "설정",
  design: "디자인 미리보기",
};

function SettingsIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9.3 3-.6 2.3-2 .9-2.2-.7L3 8l1.6 1.7v2.6L3 14l1.5 2.5 2.2-.7 2 .9.6 2.3h3.4l.6-2.3 2-.9 2.2.7L19 14l-1.6-1.7V9.7L19 8l-1.5-2.5-2.2.7-2-.9-.6-2.3Z" transform="translate(1 1)" /><circle cx="12" cy="12" r="3" /></svg>;
}

function DashboardTeamPicker({ teams, selectedTeamId, loading, onSelectTeam }: {
  teams: Team[];
  selectedTeamId: number | null;
  loading: boolean;
  onSelectTeam: (teamId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const picker = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const disabled = loading || teams.length === 0;
  const expanded = open && !disabled;
  const selectedTeam = teams.find((team) => team.teamId === selectedTeamId);

  useEffect(() => {
    if (!expanded) return;
    const selected = list.current?.querySelector<HTMLButtonElement>("[aria-selected='true']");
    (selected ?? list.current?.querySelector("button"))?.focus();

    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !picker.current?.contains(event.target)) setOpen(false);
    }

    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [expanded]);

  function closePicker() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (expanded && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePicker();
      return;
    }
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (!expanded) {
      if (step && !disabled) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (!step && event.key !== "Home" && event.key !== "End") return;
    const options = Array.from(list.current?.querySelectorAll("button") ?? []);
    if (options.length === 0) return;
    event.preventDefault();
    const current = options.indexOf(event.target as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
      : current < 0 ? (step > 0 ? 0 : options.length - 1) : (current + step + options.length) % options.length;
    options[next]?.focus();
  }

  return (
    <div className="dashboard-team-picker" ref={picker} onKeyDown={handleKeyDown}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button type="button" className="dashboard-team-trigger" ref={trigger} disabled={disabled}
        aria-label={`현재 팀 변경, ${selectedTeam?.name ?? "선택한 팀 없음"}`} aria-haspopup="listbox"
        aria-expanded={expanded} aria-controls={expanded ? listId : undefined} onClick={() => setOpen((current) => !current)}>
        <span className="dashboard-team-symbol" aria-hidden="true"><Icon name="team" size={17} /></span>
        <span className="dashboard-team-copy"><span>현재 팀</span><strong>{loading ? "팀 불러오는 중" : selectedTeam?.name ?? (teams.length ? "팀 선택" : "참여 중인 팀 없음")}</strong></span>
        <Icon name="chevron" size={15} className="dashboard-team-chevron" />
      </button>
      {expanded && (
        <div className="dashboard-team-panel">
          <div className="dashboard-team-panel-heading"><span>참여 중인 팀</span><span>{teams.length}</span></div>
          <ul className="dashboard-team-options" ref={list} id={listId} role="listbox" aria-label="현재 팀 변경">
            {teams.map((team) => (
              <li role="none" key={team.teamId}>
                <button type="button" role="option" aria-selected={team.teamId === selectedTeamId} tabIndex={-1}
                  onClick={() => { closePicker(); onSelectTeam(team.teamId); }}>
                  <span className="dashboard-team-initial" aria-hidden="true">{Array.from(team.name.trim())[0] ?? "?"}</span>
                  <span className="dashboard-team-option-name">{team.name}</span>
                  {team.teamId === selectedTeamId && <Icon name="check" size={16} />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout({
  children, view, onViewChange, teams, selectedTeamId, teamsLoading,
  workspaceLoading, onSelectTeam, onRefresh, onReturnToScene,
  taskList = [], tasksLoading = false, tasksError = null,
  selectedTaskId = null, onSelectTask,
}: DashboardLayoutProps) {
  const { user, connection, loggingOut, logout } = useSession();
  const menuDialog = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const dialog = menuDialog.current;
    if (menuOpen && dialog && !dialog.open) dialog.showModal();
    if (!menuOpen && dialog?.open) dialog.close();
  }, [menuOpen]);

  if (!user) return null;

  const profileName = user.nickname || user.name;
  const profileEmail = user.email;
  const selectedTask = taskList.find((task) => task.taskId === selectedTaskId);
  const pageLabel = viewLabels[view];

  function changeView(next: WorkspaceView) {
    onViewChange(next);
    setMenuOpen(false);
  }

  function selectTask(taskId: number) {
    onSelectTask?.(taskId);
    changeView("conversation");
  }

  function sidebarContent(mobile = false) {
    return <>
      <div className="dashboard-sidebar-brand">
        <a className="brand" href="/" aria-label="DevLink 홈"><span className="brand-symbol">D</span><span>DevLink</span></a>
        {mobile && <button type="button" className="icon-button" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)}><Icon name="close" /></button>}
      </div>
      <span className="dashboard-nav-label">워크스페이스</span>
      <nav className="main-nav" aria-label="주 메뉴">
        <button type="button" className={`nav-item${view === "workspace" ? " active" : ""}`} onClick={() => changeView("workspace")} aria-current={view === "workspace" ? "page" : undefined}><Icon name="grid" size={19} /><span>대시보드</span></button>
        <button type="button" className={`nav-item${view === "agents" ? " active" : ""}`} onClick={() => changeView("agents")} aria-current={view === "agents" ? "page" : undefined}><Icon name="agent" size={19} /><span>Agent 관리</span></button>
        <button type="button" className={`nav-item${view === "teams" ? " active" : ""}`} onClick={() => changeView("teams")} aria-current={view === "teams" ? "page" : undefined}><Icon name="team" size={19} /><span>팀 관리</span></button>
      </nav>
      <section className="dashboard-chats" aria-label="최근 채팅">
        <div className="dashboard-chats-heading"><h2>최근 채팅</h2><span>{taskList.length}</span>{tasksLoading && <span className="dashboard-chat-updating" role="status">갱신 중</span>}</div>
        {tasksError && <div className="dashboard-chat-error" role="status"><p>채팅을 불러오지 못했어요.</p><button type="button" onClick={onRefresh} disabled={tasksLoading}>다시 불러오기</button></div>}
        <div className="dashboard-chat-list">
          {taskList.map((task) => {
            const active = view === "conversation" && selectedTaskId === task.taskId;
            return <button className={`dashboard-chat-item${active ? " is-selected" : ""}`} type="button" key={task.taskId} onClick={() => selectTask(task.taskId)} aria-current={active ? "page" : undefined} title={taskTitle(task)} disabled={!onSelectTask}>
              <span className="dashboard-chat-title"><strong>{taskTitle(task)}</strong><span className={`dashboard-task-badge dashboard-task-${task.status.toLowerCase()}`}>{taskStatusLabels[task.status]}</span></span>
            </button>;
          })}
          {taskList.length === 0 && !tasksError && <div className="dashboard-chat-empty"><Icon name="book" size={23} /><p>{tasksLoading ? "채팅을 불러오고 있어요." : selectedTeamId === null ? "팀을 선택하면 채팅이 표시됩니다." : "아직 시작한 대화가 없어요."}</p></div>}
        </div>
      </section>
      {import.meta.env.DEV && <div className="dashboard-sidebar-utility"><button type="button" className={`nav-item dashboard-design-link${view === "design" ? " active" : ""}`} onClick={() => changeView("design")} aria-current={view === "design" ? "page" : undefined}><Icon name="eye" size={18} /><span>디자인 미리보기</span><Icon name="chevron" size={14} /></button></div>}
      <div className="sidebar-bottom"><div className="sidebar-profile">
        <button type="button" className="dashboard-profile" onClick={() => changeView("settings")} aria-label="내 프로필과 설정 열기"><span className="avatar">{profileName.slice(0, 1)}</span><span className="dashboard-profile-text"><strong>{profileName}</strong><span title={profileEmail}>{profileEmail}</span></span></button>
        <button type="button" className={`icon-button${view === "settings" || view === "guide" ? " is-selected" : ""}`} onClick={() => changeView("settings")} aria-label="설정" title="설정"><SettingsIcon /></button>
        <button type="button" className="icon-button" onClick={logout} disabled={loggingOut} aria-label={loggingOut ? "로그아웃 처리 중" : "로그아웃"} title="로그아웃"><Icon name="logout" size={17} /></button>
      </div></div>
    </>;
  }

  return <div className={`workspace-dashboard app-shell min-h-screen${view === "conversation" ? " is-conversation" : ""}`}>
    <PageTitle title={view === "conversation" && selectedTask ? taskTitle(selectedTask) : pageLabel} />
    <aside className="sidebar" aria-label="워크스페이스 메뉴">{sidebarContent()}</aside>
    <dialog ref={menuDialog} className="dashboard-menu-dialog" aria-label="워크스페이스 메뉴" onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }} onCancel={(event) => { event.preventDefault(); setMenuOpen(false); }} onClick={(event) => { if (event.target === event.currentTarget) setMenuOpen(false); }}><div className="dashboard-mobile-sidebar">{sidebarContent(true)}</div></dialog>
    <div className="main-shell">
      <header className="topbar">
        <div className="dashboard-topbar-context">
          <button type="button" className="icon-button dashboard-mobile-menu-button" onClick={() => setMenuOpen(true)} aria-label="워크스페이스 메뉴 열기" aria-haspopup="dialog" aria-expanded={menuOpen}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
          <div className="breadcrumb"><span>워크스페이스</span><Icon name="chevron" size={12} /><strong>{pageLabel}</strong></div>
        </div>
        <button type="button" className="space-navigation-button dashboard-return-scene" data-direction="up" onClick={onReturnToScene}>
          <span>3D 스페이스로 가기</span><Icon name="chevrons" size={20} className="space-navigation-arrows" />
        </button>
        <div className="topbar-actions">
          {connection !== "online" && <span className={`connection-indicator connection-${connection}`} title={API_BASE_URL || "로컬 개발 프록시"} role="status"><span className="status-dot" />{connection === "checking" ? "확인 중" : "연결 확인 필요"}</span>}
          <DashboardTeamPicker teams={teams} selectedTeamId={selectedTeamId} loading={teamsLoading} onSelectTeam={onSelectTeam} />
          <button type="button" className="icon-button refresh-button dashboard-refresh" onClick={onRefresh} aria-label="전체 새로고침" title="전체 새로고침" disabled={teamsLoading || workspaceLoading || tasksLoading} aria-busy={teamsLoading || workspaceLoading || tasksLoading}><Icon name="refresh" size={18} /></button>
        </div>
      </header>
      <main className="workspace-main">{children}</main>
    </div>
  </div>;
}
