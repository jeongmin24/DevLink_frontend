import { useState } from "react";
import type { Team, TeamMember } from "@/features/teams/types";
import type { Agent } from "@/features/agents/types";
import type { TaskListItem, TaskStatus } from "@/features/tasks/types";
import { formatTaskTime, taskStatusLabels, taskTitle } from "@/features/tasks/utils/taskPresentation";
import { EmptyState, Icon } from "@/components/ui";
import "../styles/workspace-overview.css";

interface WorkspaceOverviewViewProps {
  teams: Team[];
  team: Team | null;
  members: TeamMember[];
  agents: Agent[];
  teamsLoading: boolean;
  workspaceLoading: boolean;
  workspaceError: boolean;
  tasks: TaskListItem[];
  tasksLoading: boolean;
  tasksError: string | null;
  onSelectTask: (taskId: number) => void;
  onManageTeams: () => void;
  onManageAgents: () => void;
  onGuide: () => void;
  onInvite: () => void;
  onRetryTasks: () => void;
}

export default function WorkspaceOverviewView({
  teams, team, members, agents, teamsLoading, workspaceLoading,
  workspaceError, tasks, tasksLoading, tasksError, onSelectTask,
  onManageTeams, onManageAgents, onGuide, onInvite, onRetryTasks,
}: WorkspaceOverviewViewProps) {
  const [status, setStatus] = useState<TaskStatus | "all">("all");
  const ready = team !== null && !workspaceLoading && !workspaceError;
  const onlineAgents = agents.filter((agent) => agent.status === "ONLINE");
  const activeTasks = tasks.filter((task) => task.status === "IN_PROGRESS");
  const visibleTasks = (status === "all" ? tasks : tasks.filter((task) => task.status === status)).slice(0, 6);
  const owners = new Map(members.map((member) => [member.userId, member.nickname || member.name]));
  const recentAgents = [...agents].sort((a, b) => Number(b.status === "ONLINE") - Number(a.status === "ONLINE")).slice(0, 4);

  return <div className="workspace-overview">
    <div className="overview-heading">
      <h1>대시보드</h1>
    </div>

    <dl className="overview-stats" aria-label="워크스페이스 현황">
      <div><dt>참여 팀</dt><dd>{teamsLoading ? "—" : teams.length}</dd></div>
      <div><dt>현재 팀 Agent</dt><dd>{ready ? agents.length : "—"}</dd></div>
      <div><dt>온라인 Agent</dt><dd>{ready ? onlineAgents.length : "—"}</dd></div>
      <div><dt>진행 중인 작업</dt><dd>{team && !tasksLoading && !tasksError ? activeTasks.length : "—"}</dd></div>
    </dl>

    <div className="overview-section-heading"><div><h2>최근 Agent 대화</h2><span className="overview-count">{tasksLoading ? "…" : tasks.length}</span></div><label className="overview-task-filter"><span className="sr-only">작업 상태 필터</span><select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus | "all")}><option value="all">모든 상태</option>{Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    <section className="overview-task-panel" aria-label="최근 Agent 대화">
      {tasksError ? <div className="overview-inline-error" role="alert"><Icon name="shield" /><div><strong>작업 기록을 불러오지 못했어요</strong><p>{tasksError}</p></div><button type="button" className="button button-secondary button-small" onClick={onRetryTasks}>다시 불러오기</button></div>
        : tasksLoading ? <div className="overview-loading" role="status">작업 기록을 불러오고 있어요<span className="loading-bar" /></div>
          : visibleTasks.length === 0 ? <EmptyState title={!team ? "팀 선택" : status === "all" ? "작업 기록 없음" : "해당 상태의 작업 없음"} description={!team ? "팀 관리에서 새 팀을 만들거나 초대 코드로 참여하세요." : undefined} icon={<Icon name="book" size={26} />} />
            : <div className="overview-table-scroll"><table className="overview-task-table"><thead><tr><th scope="col">작업</th><th scope="col">참여 Agent</th><th scope="col">상태</th><th scope="col">최근 활동</th></tr></thead><tbody>{visibleTasks.map((task) => <tr key={task.taskId}><td><button type="button" className="overview-task-link" onClick={() => onSelectTask(task.taskId)}><span className="overview-task-number">#{task.taskId}</span><strong>{taskTitle(task)}</strong><Icon name="arrow" size={15} /></button></td><td><span className="overview-task-agents">{task.requesterAgent.name}<span>→ {task.receiverAgent.name}</span></span></td><td><span className={`workspace-task-status status-${task.status.toLowerCase()}`}>{taskStatusLabels[task.status]}</span></td><td><time dateTime={task.lastActivityAt ?? task.createdAt}>{formatTaskTime(task.lastActivityAt ?? task.createdAt)}</time></td></tr>)}</tbody></table></div>}
      {tasks.length > 6 && <p className="overview-table-note">전체 {tasks.length}개 대화는 왼쪽 채팅 목록에서 확인할 수 있어요.</p>}
    </section>

    <div className="overview-team-grid">
      <section className="overview-team-card">
        <div className="overview-section-heading"><div><h2>현재 팀</h2></div><button type="button" className="overview-text-button" onClick={onManageTeams}>팀 관리<Icon name="arrow" size={14} /></button></div>
        {team ? <><div className="overview-team-identity"><span className="overview-team-symbol"><Icon name="team" size={25} /></span><div><h3>{team.name}</h3></div><span className="overview-role">{team.myRole === "OWNER" ? "소유자" : "팀원"}</span></div><div className="overview-member-stack">{members.slice(0, 5).map((member) => <span key={member.userId} className="overview-member-avatar" title={member.nickname || member.name}>{Array.from(member.nickname || member.name)[0]}</span>)}{members.length > 5 && <span className="overview-member-avatar overview-member-overflow">+{members.length - 5}</span>}<span className="overview-member-count">팀원 {workspaceLoading ? "…" : members.length}명</span></div><div className="overview-team-card-footer"><span><i className="overview-online-dot" />온라인 Agent {ready ? onlineAgents.length : "—"}개</span>{team.myRole === "OWNER" && <button type="button" className="button button-secondary button-small" disabled={!ready} onClick={onInvite}><Icon name="plus" size={14} />팀원 초대</button>}</div></>
          : <><EmptyState title="참여 중인 팀 없음" description="새 팀을 만들거나 초대 코드로 참여할 수 있어요." icon={<Icon name="team" size={26} />} /><button type="button" className="button button-primary overview-create-team" onClick={onManageTeams}>팀 만들기 · 참여하기<Icon name="arrow" size={16} /></button></>}
      </section>

      <section className="overview-agent-card"><div className="overview-section-heading"><div><h2>Agent 연결 상태</h2></div><button type="button" className="overview-text-button" onClick={onManageAgents}>전체 보기<Icon name="arrow" size={14} /></button></div>
        {workspaceLoading ? <div className="overview-loading" role="status">Agent를 불러오고 있어요</div> : recentAgents.length === 0 ? <EmptyState title="등록된 Agent 없음" description="Agent를 등록하고 연결 토큰을 발급해보세요." icon={<Icon name="agent" size={26} />} /> : <div className="overview-agent-list">{recentAgents.map((agent) => <div className="overview-agent-row" key={agent.agentId}><span className="overview-agent-symbol"><Icon name="agent" size={19} /></span><div><strong>{agent.name}</strong><span>{owners.get(agent.ownerUserId) ?? "팀원"} · {agent.projectName}</span></div><span className={`overview-agent-presence ${agent.status === "ONLINE" ? "is-online" : ""}`}><i />{agent.status === "ONLINE" ? "온라인" : "오프라인"}</span></div>)}</div>}
      </section>
    </div>

    <div className="overview-guide-banner"><button type="button" className="overview-text-button" onClick={onGuide}>Agent 연결 가이드<Icon name="arrow" size={15} /></button></div>
  </div>;
}
