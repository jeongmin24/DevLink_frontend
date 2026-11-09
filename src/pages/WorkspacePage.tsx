import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@/features/auth/types";
import { useSession } from "@/features/auth/hooks/useSession";
import { useWorkspace } from "@/features/workspace/hooks/useWorkspace";
import WorkspaceOverviewView from "@/features/workspace/components/WorkspaceOverviewView";
import WorkspaceSettingsView from "@/features/workspace/components/WorkspaceSettingsView";
import WorkspaceDesignView from "@/features/workspace/components/WorkspaceDesignView";
import TaskConversationView from "@/features/tasks/components/TaskConversationView";
import { useTeamTasks } from "@/features/tasks/hooks/useTasks";
import TeamsPanel from "@/features/teams/components/TeamsPanel";
import AgentsPanel from "@/features/agents/components/AgentsPanel";
import ImmersiveTeamPreview from "@/features/team-preview/components/ImmersiveTeamPreview";
import type { PreviewMember } from "@/features/team-preview/data/previewData";
import { EmptyState, Icon } from "@/components/ui";
import DashboardLayout from "@/layouts/DashboardLayout";
import type { WorkspaceView } from "@/layouts/DashboardLayout";
import { useNotice } from "@/hooks/useNotice";
import { ApiError } from "@/lib/apiClient";
import { formatDate } from "@/utils";
import GuidePage from "./GuidePage";

const memberColors = ["sage", "blue", "peach", "lavender", "sand", "mint"];

export default function WorkspacePage({ user, initialTeamId }: { user: User; initialTeamId?: number }) {
  const [view, setView] = useState<WorkspaceView>('workspace')
  const [conversation, setConversation] = useState<{ teamId: number; taskId: number } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(() => {
    try {
      return localStorage.getItem(`devlink:${user.userId}:auto-refresh`) !== "off";
    } catch {
      return true;
    }
  });
  const inviteButton = useRef<HTMLButtonElement>(null);
  const { onError, logout, loggingOut } = useSession()
  const notify = useNotice()
  const workspace = useWorkspace(user.userId, initialTeamId)
  const { teams, selectedTeamId, selectedTeam, members, agents, teamsLoading,
    workspaceLoading, workspaceError, sceneStatus, selectTeam, refreshAll, refreshWorkspace } = workspace;
  const tasksQuery = useTeamTasks(user.userId, selectedTeamId, autoRefresh);
  const taskAccessDenied = tasksQuery.error instanceof ApiError
    && [401, 403, 404].includes(tasksQuery.error.status);
  const tasks = taskAccessDenied ? [] : tasksQuery.data ?? [];
  const tasksLoading = selectedTeamId !== null && tasksQuery.isPending;
  const tasksError = tasksQuery.error instanceof Error ? tasksQuery.error.message : null;
  const selectedTaskId = conversation?.teamId === selectedTeamId ? conversation.taskId : null;

  useEffect(() => {
    if (tasksQuery.error) onError(tasksQuery.error);
  }, [tasksQuery.error, onError]);

  function selectTask(taskId: number) {
    if (selectedTeamId === null) return;
    setConversation({ teamId: selectedTeamId, taskId });
    setView("conversation");
  }

  function changeAutoRefresh(enabled: boolean) {
    setAutoRefresh(enabled);
    try {
      localStorage.setItem(`devlink:${user.userId}:auto-refresh`, enabled ? "on" : "off");
    } catch {
      notify("설정은 현재 화면에 적용되었지만 브라우저에 저장하지 못했어요.", "error");
    }
  }

  const sceneMembers = useMemo<PreviewMember[]>(() => {
    const agentsByOwner = new Map<number, PreviewMember["agents"]>();
    for (const agent of agents) {
      const ownedAgents = agentsByOwner.get(agent.ownerUserId) ?? [];
      ownedAgents.push({
        id: String(agent.agentId),
        name: agent.name,
        tool: agent.toolType === "CODEX" ? "Codex" : "Claude Code",
        project: agent.projectName,
        description: agent.roleDescription ?? "",
        online: agent.status === "ONLINE",
      });
      agentsByOwner.set(agent.ownerUserId, ownedAgents);
    }
    return members.map((member, index) => ({
      id: String(member.userId),
      name: member.name,
      initials: Array.from(member.name.trim())[0] ?? "?",
      nickname: member.nickname ?? "",
      role: member.role,
      joinedAt: formatDate(member.joinedAt),
      color: memberColors[index % memberColors.length],
      agents: agentsByOwner.get(member.userId) ?? [],
    }));
  }, [members, agents]);

  const canInvite = selectedTeam?.myRole === "OWNER" && !teamsLoading && !workspaceLoading;

  function openTeamInvite() {
    setView("teams");
    inviteButton.current?.click();
  }

  return (
    <ImmersiveTeamPreview workspace={{
      teams,
      selectedTeam,
      members: sceneMembers,
      agentCount: agents.length,
      sceneStatus,
      onSelectTeam: selectTeam,
      onRetry: refreshAll,
      onInvite: canInvite ? openTeamInvite : undefined,
      renderDashboard: (showScene) => (
        <DashboardLayout
          view={view}
          onViewChange={setView}
          teams={teams}
          selectedTeamId={selectedTeamId}
          teamsLoading={teamsLoading}
          workspaceLoading={workspaceLoading}
          onSelectTeam={selectTeam}
          onRefresh={refreshAll}
          onReturnToScene={showScene}
          taskList={tasks}
          tasksLoading={tasksLoading}
          tasksError={tasksError}
          selectedTaskId={selectedTaskId}
          onSelectTask={selectTask}
        >
            {workspaceError && ["workspace", "agents", "teams"].includes(view) && <div className="workspace-error" role="alert"><Icon name="shield" /><p>{workspaceError}</p><button type="button" className="button button-secondary button-small" onClick={refreshAll}>다시 불러오기</button></div>}
            {view === "workspace" && <WorkspaceOverviewView
              teams={teams} team={selectedTeam} members={members} agents={agents}
              teamsLoading={teamsLoading} workspaceLoading={workspaceLoading} workspaceError={!!workspaceError}
              tasks={tasks} tasksLoading={tasksLoading} tasksError={tasksError} onSelectTask={selectTask}
              onManageTeams={() => setView("teams")} onManageAgents={() => setView("agents")}
              onGuide={() => setView("guide")} onInvite={openTeamInvite} onRetryTasks={() => { void tasksQuery.refetch(); }}
            />}
            <div hidden={view !== "teams"}>
              <div className="workspace-view-heading"><h1>팀 관리</h1></div>
              <TeamsPanel teams={teams} selectedTeam={selectedTeam} members={members} currentUserId={user.userId}
                loading={teamsLoading || workspaceLoading} onSelectTeam={selectTeam} onTeamsChanged={selectTeam}
                onRefresh={refreshAll} onError={onError} onNotice={notify} inviteButtonRef={inviteButton} />
            </div>
            {view === "agents" && <div>
              <div className="workspace-view-heading"><h1>Agent 관리</h1></div>
              {selectedTeam ? <AgentsPanel key={selectedTeam.teamId} team={selectedTeam} agents={agents} members={members}
                currentUserId={user.userId} currentUserEmail={user.email} loading={workspaceLoading || !!workspaceError}
                onRefresh={refreshWorkspace} onError={onError} onNotice={notify} />
                : <section className="workspace-selection-empty"><EmptyState title={teamsLoading ? "팀 정보 불러오는 중" : "참여 중인 팀 없음"} description="팀을 만들거나 초대 코드로 참여하면, 이곳에서 팀의 Agent를 관리할 수 있어요." icon={<Icon name="team" size={28} />} /><button type="button" className="button button-primary" onClick={() => setView("teams")}>팀 관리로 이동<Icon name="arrow" size={15} /></button></section>}
            </div>}
            {view === "conversation" && (selectedTeamId !== null && selectedTaskId !== null
              ? <TaskConversationView userId={user.userId} teamId={selectedTeamId} taskId={selectedTaskId} autoRefresh={autoRefresh} onError={onError} onBack={() => setView("workspace")} />
              : <section className="workspace-selection-empty"><EmptyState title="대화 선택" description="왼쪽 채팅 목록에서 현재 팀의 작업 대화 기록을 열 수 있어요." icon={<Icon name="book" size={28} />} /></section>)}
            {view === "guide" && <GuidePage />}
            {view === "settings" && <WorkspaceSettingsView user={user} autoRefresh={autoRefresh} onAutoRefreshChange={changeAutoRefresh} loggingOut={loggingOut} onLogout={() => { void logout(); }} onGuide={() => setView("guide")} />}
            {view === "design" && <WorkspaceDesignView />}
        </DashboardLayout>
      ),
    }} />
  );
}
