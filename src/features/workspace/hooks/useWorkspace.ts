import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from "@/features/auth/hooks/useSession";
import { authKeys } from "@/features/auth/api/authKeys";
import { useTeams, useTeam, useTeamMembers, teamKeys } from "@/features/teams/hooks/useTeams";
import { useAgents, agentKeys } from "@/features/agents/hooks/useAgents";
import type { Agent } from "@/features/agents/types";
import type { TeamMember } from "@/features/teams/types";

const emptyMembers: TeamMember[] = [];
const emptyAgents: Agent[] = [];

export function useWorkspace(userId: number, initialTeamId?: number) {
  const client = useQueryClient()
  const { onError } = useSession()
  const [preferredTeamId, setPreferredTeamId] = useState<number | null>(initialTeamId ?? null)
  const teamsQuery = useTeams(userId)
  const teams = teamsQuery.data ?? []
  const selectedTeamId = teams.find((team) => team.teamId === preferredTeamId)?.teamId
    ?? teams[0]?.teamId ?? null
  const teamQuery = useTeam(userId, selectedTeamId)
  const membersQuery = useTeamMembers(userId, selectedTeamId)
  const agentsQuery = useAgents(userId, selectedTeamId)
  const error = teamsQuery.error ?? teamQuery.error ?? membersQuery.error ?? agentsQuery.error
  const sceneQueries = selectedTeamId === null ? [teamsQuery] : [teamsQuery, teamQuery, membersQuery, agentsQuery];
  const sceneStatus: "error" | "loading" | "empty" | "ready" = sceneQueries.some((query) => query.isError && query.data === undefined)
    ? "error"
    : sceneQueries.some((query) => query.isPending)
      ? "loading"
      : selectedTeamId === null ? "empty" : "ready";

  useEffect(() => {
    if (error) onError(error)
  }, [error, onError])

  const refreshWorkspace = () => {
    if (selectedTeamId === null) return
    void client.invalidateQueries({ queryKey: teamKeys.detail(userId, selectedTeamId) })
    void client.invalidateQueries({ queryKey: agentKeys.list(userId, selectedTeamId) })
  }

  const refreshAll = () => {
    void client.invalidateQueries({ queryKey: authKeys.session })
    void client.invalidateQueries({ queryKey: authKeys.health })
    void client.invalidateQueries({ queryKey: ['workspace', userId] })
  }

  return {
    teams,
    selectedTeamId,
    selectedTeam: teamQuery.data ?? teams.find((team) => team.teamId === selectedTeamId) ?? null,
    members: membersQuery.data ?? emptyMembers,
    agents: agentsQuery.data ?? emptyAgents,
    teamsLoading: teamsQuery.isFetching,
    workspaceLoading: selectedTeamId !== null
      && (teamQuery.isFetching || membersQuery.isFetching || agentsQuery.isFetching),
    workspaceError: error instanceof Error ? error.message : null,
    sceneStatus,
    selectTeam: (teamId?: number) => setPreferredTeamId(teamId ?? null),
    refreshWorkspace,
    refreshAll,
  }
}
