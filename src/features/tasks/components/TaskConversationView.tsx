import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon } from '@/components/ui'
import { ApiError } from '@/lib/apiClient'
import { taskKeys, useTaskDetail, useTaskHistory } from '../hooks/useTasks'
import type { TaskDetail, TaskEvent, TaskHistory } from '../types'
import { compareSequences, formatTaskTime, mergeTaskEvents, parseTaskPrompt, taskStatusLabels, taskTitle } from '../utils/taskPresentation'
import '../styles/task-conversation.css'

interface TaskConversationViewProps {
  userId: number
  teamId: number
  taskId: number
  autoRefresh: boolean
  onError: (error: unknown) => void
  onBack?: () => void
}

const eventLabels: Record<string, string> = {
  CREATED: '작업 생성',
  STATUS_CHANGED: '상태 변경',
  PROGRESS: '진행 기록',
  QUESTION: '질문',
  ANSWER: '답변',
}

const fileChangeLabels = { ADDED: '추가', MODIFIED: '수정', DELETED: '삭제', RENAMED: '이름 변경' }

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'
}

function isAccessError(error: unknown): error is ApiError {
  return error instanceof ApiError && [401, 403, 404].includes(error.status)
}

function RecordTime({ value, utc = false, className }: { value: string; utc?: boolean; className?: string }) {
  const localTime = utc || /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
  return <time className={className} title={localTime ? '내 기기의 시간대 기준' : '서버에 기록된 시각'}>{formatTaskTime(value, utc)}<span className="tc-time-basis">· {localTime ? '내 시간' : '서버 시각'}</span></time>
}

function InitialTaskRequest({ prompt, fallbackTitle }: { prompt: string; fallbackTitle: string }) {
  const request = parseTaskPrompt(prompt);

  return (
    <section className="tc-bubble tc-request-card" aria-label="최초 작업 요청">
      <header className="tc-request-heading">
        <span className="tc-message-kind">최초 작업 요청</span>
        <h3>{request.title || fallbackTitle}</h3>
      </header>
      <div className="tc-request-description">
        {request.description.trim() ? (
          <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
            h1: "h4",
            h2: "h4",
            h3: "h5",
            table: ({ children }) => <div className="tc-request-table"><table>{children}</table></div>,
            a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
          }}>
            {request.description}
          </Markdown>
        ) : <p>등록된 요청 설명이 없습니다.</p>}
      </div>
    </section>
  );
}

function EventMessage({ event, detail, eventsById }: {
  event: TaskEvent
  detail: TaskDetail
  eventsById: Map<string, TaskEvent>
}) {
  const conversation = event.eventType === 'QUESTION' || event.eventType === 'ANSWER'
  const author = event.authorAgent
  const requester = author?.agentId === detail.requesterAgent.agentId
  const receiver = author?.agentId === detail.receiverAgent.agentId
  const question = event.questionEventId ? eventsById.get(event.questionEventId) : undefined

  if (!conversation || !author || (!requester && !receiver)) {
    return (
      <li className="tc-system-record" data-event-id={event.eventId}>
        <span className="tc-system-symbol"><Icon name={event.eventType === 'CREATED' ? 'plus' : 'check'} size={13} /></span>
        <div>
          <div className="tc-system-meta"><strong>{eventLabels[event.eventType] ?? '작업 기록'}</strong><RecordTime value={event.createdAt} utc={conversation} /></div>
          {author && <span className="tc-system-author">{author.name}</span>}
          {event.questionEventId && <span className="tc-system-reference">질문 #{event.questionEventId}에 대한 답변</span>}
          {event.message !== null && <p className="tc-message-text">{event.message}</p>}
        </div>
      </li>
    )
  }

  return (
    <li className={`tc-message-row ${requester ? 'tc-requester' : 'tc-receiver'}`} data-event-id={event.eventId}>
      <span className="tc-agent-avatar" aria-hidden="true"><Icon name="agent" size={18} /></span>
      <div className="tc-message-content">
        <div className="tc-message-meta"><strong>{author.name}</strong></div>
        <div className="tc-bubble">
          <span className="tc-message-kind">{eventLabels[event.eventType]}</span>
          {event.questionEventId && (
            <div className="tc-question-reference">
              <span>{question ? `질문 #${event.questionEventId}에 대한 답변` : `이전 질문 #${event.questionEventId}에 대한 답변`}</span>
              {question?.message && <p>{question.message}</p>}
            </div>
          )}
          <p className="tc-message-text">{event.message ?? '저장된 메시지 본문이 없습니다.'}</p>
        </div>
        <RecordTime className="tc-message-time" value={event.createdAt} utc />
      </div>
    </li>
  )
}

function TaskResult({ history }: { history: TaskHistory }) {
  const failed = history.failureReason !== null
  const rejected = history.rejectionReason !== null
  const text = history.resultText ?? history.failureReason ?? history.rejectionReason
  if (text === null && history.taskFiles.length === 0) return null

  return (
    <section className={`tc-result-card ${failed || rejected ? 'tc-result-attention' : ''}`} aria-label="저장된 작업 결과">
      <header>
        <span className="tc-result-icon"><Icon name={failed || rejected ? 'shield' : 'check'} size={18} /></span>
        <div><h3>{failed ? "작업 실패" : rejected ? "작업 거절" : history.resultText !== null ? "작업 결과" : "변경 파일"}</h3></div>
        {failed && history.partiallyModified && <span className="tc-partial-badge">일부 수정됨</span>}
      </header>
      {text !== null && <p className="tc-message-text tc-result-text">{text}</p>}
      {history.taskFiles.length > 0 && (
        <div className="tc-result-files">
          <h4>변경 파일 <span>{history.taskFiles.length}</span></h4>
          {history.taskFiles.map((file) => (
            <details className="tc-file" key={file.fileId}>
              <summary><Icon name="chevron" size={14} /><span className="tc-file-path">{file.relativePath}</span><span className="tc-file-change" data-change={file.changeType}>{fileChangeLabels[file.changeType]}</span></summary>
              {file.diffText !== null ? <pre className="tc-file-diff"><code>{file.diffText}</code></pre> : <p className="tc-file-empty">저장된 diff가 없습니다.</p>}
            </details>
          ))}
        </div>
      )}
    </section>
  )
}

function ConversationContent({ userId, teamId, taskId, autoRefresh, onError, onBack }: TaskConversationViewProps) {
  const queryClient = useQueryClient()
  const [blockedError, setBlockedError] = useState<ApiError | null>(null)
  const activeTaskId = blockedError ? null : taskId
  const detailQuery = useTaskDetail(userId, teamId, activeTaskId, autoRefresh)
  const historyQuery = useTaskHistory(userId, teamId, activeTaskId, autoRefresh)
  const observedAccessError = [detailQuery.error, historyQuery.error].find(isAccessError) ?? null
  if (observedAccessError && blockedError === null) setBlockedError(observedAccessError)
  const accessError = blockedError ?? observedAccessError
  const detail = accessError ? undefined : detailQuery.data
  const pages = accessError ? undefined : historyQuery.data?.pages
  const latestHistory = pages?.[0]
  const events = useMemo(() => mergeTaskEvents(pages), [pages])
  const eventsById = useMemo(() => new Map(events.map((event) => [event.eventId, event])), [events])
  const viewport = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)
  const lastSequence = useRef<string | null>(null)
  const prependPosition = useRef<{ height: number; top: number } | null>(null)
  const [newEvents, setNewEvents] = useState(0)
  const [awayFromLatest, setAwayFromLatest] = useState(false)
  const error = accessError ?? detailQuery.error ?? historyQuery.error
  const refreshing = detailQuery.isFetching || historyQuery.isFetching

  useEffect(() => {
    if (!blockedError) return
    queryClient.removeQueries({ queryKey: taskKeys.detail(userId, teamId, taskId), exact: true })
    queryClient.removeQueries({ queryKey: taskKeys.history(userId, teamId, taskId) })
    initialized.current = false
    lastSequence.current = null
    prependPosition.current = null
  }, [blockedError, queryClient, userId, teamId, taskId])

  useEffect(() => {
    if (error) onError(error)
  }, [error, onError])

  useLayoutEffect(() => {
    const container = viewport.current
    if (!container || !detail || !latestHistory) return
    const newest = events.at(-1)?.sequence ?? null
    if (!initialized.current) {
      container.scrollTop = container.scrollHeight
      initialized.current = true
      lastSequence.current = newest
      return
    }
    if (prependPosition.current && !historyQuery.isFetchingNextPage) {
      container.scrollTop = prependPosition.current.top + container.scrollHeight - prependPosition.current.height
      prependPosition.current = null
    }
    const previous = lastSequence.current
    if (newest !== null && (previous === null || compareSequences(newest, previous) > 0)) {
      const added = events.filter((event) => previous === null || compareSequences(event.sequence, previous) > 0).length
      setNewEvents((count) => count + added)
      lastSequence.current = newest
    }
  }, [detail, latestHistory, events, historyQuery.isFetchingNextPage])

  function refresh() {
    if (accessError) {
      setNewEvents(0)
      setAwayFromLatest(false)
      setBlockedError(null)
      return
    }
    void Promise.all([detailQuery.refetch(), historyQuery.refetch()])
  }

  function loadEarlier() {
    if (!historyQuery.hasNextPage || historyQuery.isFetching) return
    const container = viewport.current
    if (container) prependPosition.current = { height: container.scrollHeight, top: container.scrollTop }
    void historyQuery.fetchNextPage()
  }

  function goToLatest() {
    const container = viewport.current
    if (!container) return
    container.scrollTop = container.scrollHeight
    setNewEvents(0)
    setAwayFromLatest(false)
  }

  function trackScroll() {
    const container = viewport.current
    if (!container) return
    const away = container.scrollHeight - container.scrollTop - container.clientHeight > 80
    setAwayFromLatest(away)
    if (!away) setNewEvents(0)
  }

  return (
    <section className="task-conversation" aria-label="작업 대화 기록">
      <header className="tc-header">
        <div className="tc-heading">
          {onBack && <button type="button" className="icon-button tc-back" onClick={onBack} aria-label="작업 목록으로 돌아가기"><Icon name="arrow" size={18} /></button>}
          <div>
            <h2 title={detail ? taskTitle(detail) : `작업 #${taskId}`}>{detail ? taskTitle(detail) : `작업 #${taskId}`}</h2>
            {detail && (
              <div className="tc-context">
                <p className="tc-team-name" title={`팀 · ${detail.teamName}`}><Icon name="team" size={13} /><span>팀 · {detail.teamName}</span></p>
                <div className="tc-participants" aria-label="대화 참여 Agent">
                  <Icon name="agent" size={13} />
                  <span title={detail.requesterAgent.name}>{detail.requesterAgent.name}</span>
                  <span className="tc-participant-divider" aria-hidden="true">·</span>
                  <span title={detail.receiverAgent.name}>{detail.receiverAgent.name}</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="tc-header-actions">
          {detail && <span className={`dashboard-task-badge dashboard-task-${detail.status.toLowerCase()}`}>{taskStatusLabels[detail.status]}</span>}
          <button type="button" className="icon-button refresh-button" onClick={refresh} disabled={refreshing && !accessError} aria-label="대화 기록 새로고침" title="대화 기록 새로고침" aria-busy={refreshing}><Icon name="refresh" size={18} /></button>
        </div>
      </header>

      {error && (detail || latestHistory) && <div className="tc-refresh-error" role="alert"><span>{errorMessage(error)}</span><button type="button" onClick={refresh} disabled={refreshing}>다시 시도</button></div>}

      <div className="tc-body">
        <div className="tc-viewport" ref={viewport} onScroll={trackScroll} tabIndex={0} aria-label="작업 요청과 Agent 대화 기록">
          {(!detail || !latestHistory) && (
            <div className="tc-query-state" role={error ? 'alert' : 'status'}>
              <span className="tc-state-icon"><Icon name={error ? 'shield' : 'book'} size={25} /></span>
              <h3>{accessError ? accessError.status === 404 ? "작업 없음" : "대화 접근 제한" : error ? "대화 기록 조회 실패" : "대화 기록 불러오는 중"}</h3>
              <p>{error ? errorMessage(error) : '작업 요청과 Agent 사이에 오간 기록을 확인하고 있어요.'}</p>
              {error && <button type="button" className="button button-secondary button-small" disabled={refreshing && !accessError} onClick={refresh}><Icon name="refresh" size={14} />다시 시도</button>}
            </div>
          )}

          {detail && latestHistory && (
            <div className="tc-timeline">
              <div className="tc-history-start"><span /> <span>작업 대화 기록</span> <span /></div>
              <div className="tc-message-row tc-requester tc-initial-request">
                <span className="tc-agent-avatar" aria-hidden="true"><Icon name="agent" size={18} /></span>
                <div className="tc-message-content">
                  <div className="tc-message-meta"><strong>{detail.requesterAgent.name}</strong></div>
                  <InitialTaskRequest prompt={latestHistory.prompt} fallbackTitle={taskTitle(detail)} />
                  <RecordTime className="tc-message-time" value={detail.createdAt} />
                </div>
              </div>

              {historyQuery.hasNextPage && <div className="tc-earlier"><button type="button" className="button button-secondary button-small" onClick={loadEarlier} disabled={historyQuery.isFetching}><Icon name={historyQuery.isFetchingNextPage ? 'refresh' : 'chevron'} size={14} className={historyQuery.isFetchingNextPage ? 'tc-spinning' : 'tc-earlier-chevron'} />{historyQuery.isFetchingNextPage ? '이전 기록 불러오는 중' : '이전 기록 더 보기'}</button><span>아래에는 불러온 기록만 표시됩니다.</span></div>}

              {events.length > 0 ? <ol className="tc-events">{events.map((event) => <EventMessage key={event.eventId} event={event} detail={detail} eventsById={eventsById} />)}</ol> : <div className="tc-no-events"><Icon name="book" size={18} /><p>아직 저장된 대화 기록이 없습니다.</p><span>새로운 기록이 생기면 이곳에서 확인할 수 있습니다.</span></div>}

              <TaskResult history={latestHistory} />
              <div className="tc-latest-marker"><span />현재 불러온 기록의 끝<span /></div>
            </div>
          )}
        </div>
        {(newEvents > 0 || awayFromLatest) && detail && latestHistory && <button type="button" className="tc-latest-button" onClick={goToLatest}><span aria-live="polite">{newEvents > 0 ? `새 기록 ${newEvents}개 · 최신으로 이동` : '최신 기록으로 이동'}</span><Icon name="arrow" size={14} /></button>}
      </div>
    </section>
  )
}

export default function TaskConversationView(props: TaskConversationViewProps) {
  return <ConversationContent key={`${props.userId}:${props.teamId}:${props.taskId}`} {...props} />
}
