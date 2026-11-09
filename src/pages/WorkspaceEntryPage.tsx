import { lazy, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@/features/auth/types";
import { agentApi } from "@/features/agents/api/agentApi";
import { agentKeys } from "@/features/agents/hooks/useAgents";
import { teamApi } from "@/features/teams/api/teamApi";
import { teamKeys } from "@/features/teams/hooks/useTeams";
import { Icon } from "@/components/ui";
import { useNotice } from "@/hooks/useNotice";

const WorkspacePage = lazy(() => import("./WorkspacePage"));
const OnboardingPage = lazy(() => import("./OnboardingPage"));

export default function WorkspaceEntryPage({ user }: { user: User }) {
  const historyKey = `devlink:${user.userId}:onboarding-v1`;
  const [finished, setFinished] = useState(() => {
    try {
      return ["completed", "skipped", "existing"].includes(
        localStorage.getItem(historyKey) ?? "",
      );
    } catch {
      return false;
    }
  });
  const [preferredTeamId, setPreferredTeamId] = useState<number>();
  const client = useQueryClient();
  const notify = useNotice();
  const existingAccount = useQuery({
    queryKey: ["workspace", user.userId, "onboarding"],
    enabled: !finished,
    staleTime: Infinity,
    retry: false,
    queryFn: async ({ signal }) => {
      const teams = await client.fetchQuery({
        queryKey: teamKeys.list(user.userId),
        queryFn: ({ signal }) => teamApi.listTeams(signal),
      });
      const agentLists = await Promise.all(
        teams.map((team) =>
          client.fetchQuery({
            queryKey: agentKeys.list(user.userId, team.teamId),
            queryFn: ({ signal }) => agentApi.listAgents(team.teamId, signal),
          }),
        ),
      );
      signal.throwIfAborted();
      const hasOwnedAgent = agentLists.some((agents) =>
        agents.some((agent) => agent.ownerUserId === user.userId),
      );
      if (hasOwnedAgent) {
        try {
          localStorage.setItem(historyKey, "existing");
        } catch {
          /* 현재 접속의 판정 유지 */
        }
      }
      return hasOwnedAgent;
    },
  });

  function finish(status: "completed" | "skipped", teamId?: number) {
    try {
      localStorage.setItem(historyKey, status);
    } catch {
      notify(
        "설정 이력을 저장하지 못했습니다. 현재 접속에서는 대시보드로 이동합니다.",
        "error",
      );
    }
    setPreferredTeamId(teamId);
    setFinished(true);
  }

  if (finished || existingAccount.data === true)
    return <WorkspacePage user={user} initialTeamId={preferredTeamId} />;
  if (existingAccount.isPending)
    return (
      <div className="boot-screen" role="status">
        <span className="brand-symbol">
          D<span />
        </span>
        <h1>DevLink</h1>
        <p className="muted">작업 공간을 준비하고 있어요.</p>
        <span className="loading-bar" />
      </div>
    );
  if (existingAccount.isError)
    return (
      <main className="boot-screen">
        <Icon name="shield" size={28} />
        <h1>설정 이력을 확인하지 못했어요</h1>
        <p className="muted">연결 상태를 확인한 뒤 다시 시도해주세요.</p>
        <div className="section-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={() => finish("skipped")}
          >
            대시보드로 이동
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={existingAccount.isFetching}
            onClick={() => {
              void existingAccount.refetch();
            }}
          >
            다시 확인
          </button>
        </div>
      </main>
    );
  return <OnboardingPage user={user} onFinish={finish} />;
}
