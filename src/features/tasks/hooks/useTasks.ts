import { useEffect } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/apiClient";
import { getAllTeamTasks, getTaskUpdates, taskApi } from "../api/taskApi";
import type { TaskListItem } from "../types";
import { compareSequences } from "../utils/taskPresentation";

export const taskKeys = {
  all: (userId: number) => ["workspace", userId, "tasks"] as const,
  team: (userId: number, teamId: number | null) => [...taskKeys.all(userId), teamId] as const,
  list: (userId: number, teamId: number | null) => [...taskKeys.team(userId, teamId), "list"] as const,
  detail: (userId: number, teamId: number | null, taskId: number | null) =>
    [...taskKeys.team(userId, teamId), "detail", taskId] as const,
  history: (userId: number, teamId: number | null, taskId: number | null) =>
    [...taskKeys.team(userId, teamId), "history", taskId] as const,
  updates: (userId: number, teamId: number | null, taskId: number | null, anchor: string | null) =>
    [...taskKeys.history(userId, teamId, taskId), "updates", anchor] as const,
};

export function useTeamTasks(userId: number, teamId: number | null, autoRefresh = true) {
  return useQuery({
    queryKey: taskKeys.list(userId, teamId),
    queryFn: ({ signal }) => getAllTeamTasks(teamId!, signal),
    enabled: teamId !== null,
    staleTime: 15_000,
    refetchOnWindowFocus: autoRefresh,
    refetchOnReconnect: autoRefresh,
    refetchInterval: autoRefresh ? 30_000 : false,
  });
}

export function useTaskDetail(
  userId: number,
  teamId: number | null,
  taskId: number | null,
  autoRefresh = true,
) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: taskKeys.detail(userId, teamId, taskId),
    queryFn: ({ signal }) => taskApi.getTaskDetail(teamId!, taskId!, signal),
    enabled: teamId !== null && taskId !== null,
    staleTime: 10_000,
    refetchOnWindowFocus: autoRefresh,
    refetchOnReconnect: autoRefresh,
    refetchInterval: autoRefresh ? 20_000 : false,
  });

  useEffect(() => {
    const detail = query.data;
    if (!detail || query.isError) return;
    const listKey = taskKeys.list(userId, teamId);
    const listState = client.getQueryState<TaskListItem[]>(listKey);
    if (!listState?.data || listState.dataUpdatedAt > query.dataUpdatedAt) return;
    client.setQueryData<TaskListItem[]>(listKey, (tasks) => tasks?.map((task) => task.taskId === detail.taskId
      ? { ...task, status: detail.status, taskSummary: detail.taskSummary }
      : task), { updatedAt: listState.dataUpdatedAt });
  }, [client, userId, teamId, query.data, query.dataUpdatedAt, query.isError]);

  return query;
}

export function useTaskHistory(
  userId: number,
  teamId: number | null,
  taskId: number | null,
  autoRefresh = true,
) {
  const history = useInfiniteQuery({
    queryKey: taskKeys.history(userId, teamId, taskId),
    queryFn: ({ signal, pageParam }) => taskApi.getTaskHistory(teamId!, taskId!, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasNext && lastPage.nextBeforeSequence !== null
        ? lastPage.nextBeforeSequence
        : undefined,
    enabled: teamId !== null && taskId !== null,
    // 전체 새로고침에도 과거 페이지는 유지하고 새 기록은 별도 조회
    staleTime: "static",
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });
  const anchor = history.data
    ? (history.data.pages[0]?.items ?? []).reduce(
      (latest, event) => compareSequences(event.sequence, latest) > 0 ? event.sequence : latest,
      "0",
    )
    : null;
  const updates = useQuery({
    queryKey: taskKeys.updates(userId, teamId, taskId, anchor),
    queryFn: ({ signal }) => getTaskUpdates(teamId!, taskId!, anchor!, signal),
    enabled: teamId !== null && taskId !== null && anchor !== null,
    staleTime: 10_000,
    refetchOnWindowFocus: autoRefresh,
    refetchOnReconnect: autoRefresh,
    refetchInterval: autoRefresh ? 20_000 : false,
  });
  const updatePages = updates.data ?? [];
  const data = history.data && updatePages.length > 0
    ? {
      ...history.data,
      pages: [...updatePages, ...history.data.pages],
      pageParams: [
        ...updatePages.map((_, index) => index === 0 ? null : updatePages[index - 1].nextBeforeSequence),
        ...history.data.pageParams,
      ],
    }
    : history.data;
  const error = [history.error, updates.error].find(
    (candidate) => candidate instanceof ApiError && [401, 403, 404].includes(candidate.status),
  ) ?? history.error ?? updates.error;

  return {
    ...history,
    data,
    error,
    isError: error !== null,
    isFetching: history.isFetching || updates.isFetching,
    isRefetching: history.isRefetching || updates.isFetching,
    dataUpdatedAt: Math.max(history.dataUpdatedAt, updates.dataUpdatedAt),
    refetch: () => history.data ? updates.refetch() : history.refetch(),
  };
}
