import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import type { Team } from "@/features/teams/types";
import type { PreviewMember } from "../data/previewData";
import { Icon } from "@/components/ui";
import PageTitle from "@/components/common/PageTitle";
import { copyText } from "@/utils";
import ImmersiveTeamScene from './ImmersiveTeamScene'
import FocusedMemberDetails from './FocusedMemberDetails'
import TeamWorkspaceDashboard from './TeamWorkspaceDashboard'
import { immersivePreviewTeams } from '../data/immersivePreviewData'
import '../styles/ImmersiveTeamPreview.css'
import '../styles/ImmersiveExperience.css'
import '../styles/RefinedTeamPreview.css'

function MotionIcon({ paused }: { paused: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paused ? <path d="m9 5 11 7-11 7V5Z" /> : <><path d="M8 5v14M16 5v14" /></>}</svg>
}


function TopViewIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" /><path d="M4 9h16M9 4v16" /><circle cx="14.5" cy="14.5" r="2" />
    </svg>
  );
}

function SceneLoading({ message }: { message: string }) {
  return (
    <div className="itp-scene-message itp-scene-loading" role="status">
      <span className="itp-loader" aria-hidden="true">
        <span className="itp-loader-orbit"><i /></span>
        <span className="itp-loader-float">
          <span className="itp-loader-cube"><i /><i /><i /><i /><i /><i /></span>
        </span>
      </span>
      <span className="itp-loader-caption">
        <span className="itp-loader-kicker" aria-hidden="true">TEAM SPACE</span>
        <strong>{message}</strong>
        <span className="itp-loader-track" aria-hidden="true" />
      </span>
    </div>
  );
}

function TeamPicker({ teamName, teams, selectedTeamId, onSelectTeam }: {
  teamName: string;
  teams: { id: string; name: string }[];
  selectedTeamId: string;
  onSelectTeam: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const picker = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    const selectedTeam = list.current?.querySelector<HTMLButtonElement>("[aria-current='true']");
    (selectedTeam ?? list.current?.querySelector("button"))?.focus();

    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !picker.current?.contains(event.target)) setOpen(false);
    }

    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [open]);

  function closePicker() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePicker();
      return;
    }

    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (!open) {
      if (step && teams.length > 0) {
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
    <div className="itp-team-picker" ref={picker} onKeyDown={handleKeyDown}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <span className="itp-team-picker-label">현재 팀</span>
      <h1>
        {teams.length === 0 ? teamName : (
          <button className="itp-team-picker-trigger" type="button" ref={trigger} aria-expanded={open}
            aria-controls={open ? listId : undefined} aria-label={`팀 선택, 현재 팀 ${teamName}`} onClick={() => setOpen((current) => !current)}>
            <span className="itp-team-picker-name">{teamName}</span>
            <span className="itp-team-picker-chevron"><Icon name="chevron" size={16} /></span>
          </button>
        )}
      </h1>
      {open && (
        <div className="itp-team-picker-panel">
          <div className="itp-team-picker-heading"><span>참여 중인 팀</span><span>{teams.length}</span></div>
          <ul className="itp-team-picker-list" id={listId} ref={list} aria-label="참여 중인 팀">
            {teams.map((team) => (
              <li key={team.id}>
                <button type="button" className="itp-team-picker-option" aria-current={team.id === selectedTeamId ? true : undefined}
                  onClick={() => { closePicker(); onSelectTeam(team.id); }}>
                  <span className="itp-team-picker-initial" aria-hidden="true">{Array.from(team.name.trim())[0] ?? "?"}</span>
                  <span className="itp-team-picker-option-name">{team.name}</span>
                  {team.id === selectedTeamId && <span className="itp-team-picker-current"><Icon name="check" size={15} /><span className="itp-sr-only">현재 팀</span></span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MemberIcon({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="7.5" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>
}

const memberColors: Record<string, string> = {
  sage: '#858585', blue: '#6b6b6b', peach: '#a5a5a5',
  lavender: '#909090', sand: '#bdbdbd', mint: '#999999',
}
const loadingMembers: PreviewMember[] = [];

interface LiveWorkspace {
  teams: Team[];
  selectedTeam: Team | null;
  members: PreviewMember[];
  agentCount: number;
  sceneStatus: "loading" | "error" | "empty" | "ready";
  onSelectTeam: (teamId: number) => void;
  onRetry: () => void;
  onInvite?: () => void;
  renderDashboard: (showScene: () => void) => ReactNode;
}

export default function ImmersiveTeamPreview({ workspace }: { workspace?: LiveWorkspace }) {
  const [teamId, setTeamId] = useState(immersivePreviewTeams[0].id)
  const [selection, setSelection] = useState<{ teamId: string; memberId: string; focused: boolean } | null>(null);
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [topView, setTopView] = useState(false);
  const [availability, setAvailability] = useState<"loading" | "ready" | "unavailable">("loading");
  const [inviteOpen, setInviteOpen] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const [sceneInteractive, setSceneInteractive] = useState(true)
  const experienceRoot = useRef<HTMLDivElement>(null)
  const journey = useRef<HTMLElement>(null)
  const stickyStage = useRef<HTMLDivElement>(null)
  const dashboardSection = useRef<HTMLElement>(null)
  const sceneScrollState = useRef({ progress: 0, requestRender: () => {} })
  const inviteDialog = useRef<HTMLDialogElement>(null)
  const copyAttempt = useRef(0)
  const team = immersivePreviewTeams.find((item) => item.id === teamId) ?? immersivePreviewTeams[0]
  const activeTeamId = workspace ? String(workspace.selectedTeam?.teamId ?? "") : team.id;
  const sceneStatus = workspace?.sceneStatus ?? "ready";
  const showTeam = sceneStatus === "ready";
  const loadingTeam = sceneStatus === "loading";
  const mountScene = loadingTeam || showTeam;
  const loadingMessage = loadingTeam
    ? "팀 정보를 불러오는 중이에요"
    : showTeam && availability === "loading" ? "3D 공간을 준비하는 중이에요" : null;
  const showTeamControls = showTeam && availability !== "loading";
  const teamName = workspace ? workspace.selectedTeam?.name ?? "DevLink 워크스페이스" : team.name;
  const members = workspace ? workspace.members : team.members;
  const teamOptions = workspace
    ? workspace.teams.map((item) => ({ id: String(item.teamId), name: item.name }))
    : immersivePreviewTeams;
  const activeSelection = selection?.teamId === activeTeamId ? selection : null;
  const selectedMember = members.find((item) => item.id === activeSelection?.memberId);
  const member = selectedMember ?? members[0];
  const focusedMemberId = showTeam && activeSelection?.focused && selectedMember ? selectedMember.id : null;
  const agentCount = workspace?.agentCount ?? members.reduce((count, item) => count + item.agents.length, 0);
  const color = memberColors[member?.color] ?? memberColors.sage;

  const onRenderRequestChange = useCallback((requestRender: () => void) => {
    sceneScrollState.current.requestRender = requestRender
  }, [])

  const onAvailabilityChange = useCallback((available: boolean) => {
    setAvailability(available ? "ready" : "unavailable");
  }, []);

  const selectMember = useCallback((id: string) => {
    setTopView(false);
    setSelection({ teamId: activeTeamId, memberId: id, focused: true });
  }, [activeTeamId]);

  const selectDashboardMember = useCallback((id: string) => {
    setSelection({ teamId: activeTeamId, memberId: id, focused: false });
  }, [activeTeamId]);

  const returnToOverview = useCallback(() => {
    setSelection((current) => current?.focused ? { ...current, focused: false } : current);
  }, [])

  useEffect(() => {
    const root = experienceRoot.current
    const section = journey.current
    const stage = stickyStage.current
    if (!root || !section || !stage) return
    const previousRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    let frame = 0
    let interactive = true

    const paint = () => {
      frame = 0
      const travel = Math.max(section.offsetHeight - stage.offsetHeight, 1)
      const progress = Math.max(0, Math.min(1, -section.getBoundingClientRect().top / travel))
      const normalized = Math.max(0, Math.min(1, (progress - 0.04) / 0.92))
      const reveal = normalized * normalized * (3 - 2 * normalized)
      root.style.setProperty('--itp-scroll', progress.toFixed(4))
      root.style.setProperty('--itp-reveal', reveal.toFixed(4))
      root.style.setProperty('--itp-hud-opacity', Math.max(0, 1 - progress * 2.4).toFixed(4))
      root.style.setProperty('--itp-scene-opacity', (1 - reveal).toFixed(4))
      root.style.setProperty('--itp-blur', `${(reveal * 12).toFixed(2)}px`)
      root.style.setProperty('--itp-scene-scale', (1 - reveal * 0.12).toFixed(4))
      root.style.setProperty('--itp-scene-y', `${(-reveal * 56).toFixed(2)}px`)
      root.style.setProperty('--itp-dashboard-scale', (0.96 + reveal * 0.04).toFixed(4))
      root.style.setProperty('--itp-wash', reveal.toFixed(4))
      const nextInteractive = progress < 0.12
      if (nextInteractive !== interactive) {
        interactive = nextInteractive
        setSceneInteractive(nextInteractive)
      }
      if (Math.abs(sceneScrollState.current.progress - progress) > 0.0001) {
        sceneScrollState.current.progress = progress
        sceneScrollState.current.requestRender()
      }
    }

    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(paint) }
    const observer = new ResizeObserver(schedule)
    observer.observe(section)
    observer.observe(stage)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    paint()
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.history.scrollRestoration = previousRestoration
    }
  }, [])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = (event: MediaQueryListEvent) => setPaused(event.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const dialog = inviteDialog.current
    if (inviteOpen && !dialog?.open) dialog?.showModal()
    else if (!inviteOpen && dialog?.open) dialog.close()
    return () => { if (dialog?.open) dialog.close() }
  }, [inviteOpen])

  useEffect(() => () => { copyAttempt.current++ }, [])

  useEffect(() => {
    if (!focusedMemberId || inviteOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') returnToOverview()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [focusedMemberId, inviteOpen, returnToOverview])

  function scrollToSection(section: HTMLElement | null) {
    if (!section) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const top = window.scrollY + section.getBoundingClientRect().top
    window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' })
  }

  function showDashboard() {
    dashboardSection.current?.focus({ preventScroll: true });
    scrollToSection(dashboardSection.current);
  }

  function showScene() {
    returnToOverview();
    journey.current?.focus({ preventScroll: true });
    scrollToSection(journey.current);
  }

  function toggleTopView() {
    returnToOverview();
    setTopView((current) => !current);
  }

  function focusMemberFromDashboard(id: string) {
    selectMember(id)
    scrollToSection(journey.current)
  }

  function openInvite() {
    if (workspace) {
      workspace.onInvite?.();
      return;
    }
    setCopyStatus('idle')
    setInviteOpen(true)
  }

  function changeTeam(id: string) {
    if (id === activeTeamId) return;
    if (workspace) {
      setSelection(null);
      workspace.onSelectTeam(Number(id));
      return;
    }
    const nextTeam = immersivePreviewTeams.find((item) => item.id === id)
    if (!nextTeam) return;
    setTeamId(id)
    setSelection(null);
    closeInvite()
  }

  function closeInvite() {
    copyAttempt.current++
    setInviteOpen(false)
    setCopyStatus('idle')
  }

  async function copyInvite() {
    const attempt = ++copyAttempt.current
    try {
      await copyText(team.inviteCode)
      if (copyAttempt.current === attempt) setCopyStatus('copied')
    } catch {
      if (copyAttempt.current === attempt) setCopyStatus('error')
    }
  }

  return <div className="itp-experience" ref={experienceRoot}>
    {!workspace && <PageTitle title="3D 팀 스페이스" />}
    <section className="itp-journey" ref={journey} aria-label="3D 팀 스페이스" tabIndex={-1}>
      <div className="itp-stage-sticky" ref={stickyStage}>
        <div className={`immersive-team-preview ${paused ? 'is-paused' : ''} ${focusedMemberId ? 'is-focused' : ''} ${loadingMessage ? "is-loading" : ""}`} inert={!sceneInteractive}>
    <div className="itp-scene">
      {mountScene && (
        <ImmersiveTeamScene
          teamName={teamName}
          members={loadingTeam ? loadingMembers : members}
          loading={loadingTeam}
          selectedMemberId={member?.id ?? ""}
          focusedMemberId={focusedMemberId}
          scrollState={sceneScrollState}
          onRenderRequestChange={onRenderRequestChange}
          onSelectMember={selectMember}
          paused={paused}
          topView={topView}
          onAvailabilityChange={onAvailabilityChange}
        />
      )}
      {mountScene && availability !== "unavailable" && (
        <div className="itp-scene-handoff-status" role={loadingMessage ? "status" : undefined} aria-hidden={!loadingMessage}>
          <span className="itp-loader-kicker" aria-hidden="true">TEAM SPACE</span>
          <strong>{loadingMessage ?? "팀 정보를 불러오는 중이에요"}</strong>
        </div>
      )}
      {loadingMessage && availability === "unavailable" && <SceneLoading message={loadingMessage} />}
      {sceneStatus === "empty" && (
        <div className="itp-scene-message" role="status">
          <strong>아직 참여한 팀이 없어요</strong>
          <span>대시보드에서 팀을 만들거나 초대 코드로 참여할 수 있어요.</span>
        </div>
      )}
      {sceneStatus === "error" && (
        <div className="itp-scene-message">
          <strong role="alert">팀 정보를 불러오지 못했어요</strong>
          <button type="button" className="itp-dashboard-jump" onClick={workspace?.onRetry}>다시 불러오기</button>
        </div>
      )}
      {showTeam && availability === 'unavailable' && <div className="itp-fallback"><div className="itp-fallback-core"><span className="itp-fallback-hub-model" aria-hidden="true"><i /><i /><i /></span><span className="itp-fallback-team-name">{teamName}</span></div><div className="itp-fallback-members">{members.map((item, index) => <button key={item.id} type="button" className={member?.id === item.id ? 'is-active' : ''} onClick={() => selectMember(item.id)} aria-label={`${item.name} 선택`} aria-pressed={member?.id === item.id} style={{ '--itp-index': index, '--itp-count': members.length, '--itp-member-color': memberColors[item.color] } as CSSProperties}><span className="itp-fallback-node" aria-hidden="true"><i /><i /><i /></span><span className="itp-fallback-companions" aria-hidden="true">{item.agents.map((agent) => <span key={agent.id} className={`itp-fallback-companion ${agent.online ? 'is-online' : ''}`}><i /><i /><b /></span>)}</span><strong>{item.name}</strong></button>)}</div><span className="itp-fallback-note">이 환경에서는 기본 그래픽으로 표시해요</span></div>}
    </div>
    <div className="itp-ambient" aria-hidden="true"><i /><i /><i /></div>
    <div className="itp-ui">
      <header className="itp-header"><a href="/" className="itp-brand" aria-label="DevLink 워크스페이스"><span className="itp-brand-symbol">D<i /></span><span className="itp-brand-word">DevLink</span></a><div className="itp-header-actions">{focusedMemberId && <button type="button" className="itp-overview-button" onClick={returnToOverview}><Icon name="arrow" size={17} />전체 팀 보기</button>}</div></header>
      {showTeamControls && <div className={`itp-main${availability === "ready" ? " itp-team-reveal" : ""}`}>
        <section className="itp-hero" key={activeTeamId}>
          <TeamPicker teamName={teamName} teams={teamOptions} selectedTeamId={activeTeamId}
            onSelectTeam={(id) => {
              if (id === activeTeamId) return;
              journey.current?.focus({ preventScroll: true });
              changeTeam(id);
            }} />
          <div className="itp-stats" aria-label={`팀원 ${members.length}명, 에이전트 ${agentCount}개`}><div><strong>{members.length}</strong><span>팀원</span></div><span className="itp-stat-line" /><div><strong>{agentCount}</strong><span>에이전트</span></div></div>
        </section>
        {focusedMemberId && member && <FocusedMemberDetails key={`${activeTeamId}-${member.id}`} member={member} color={color} onClose={returnToOverview} onOpenDashboard={showDashboard} />}
        <p className="itp-sr-only">팀원을 선택하면 카메라가 이동합니다. 전체 팀 보기 버튼이나 Escape 키로 돌아올 수 있습니다. 아래로 스크롤하면 팀 대시보드가 나타납니다.</p>
        {members.length > 0 && (
          <div className="itp-dock itp-member-list" role="group" aria-label="팀원 선택">
            <div className="itp-member-list-heading"><span>팀원</span><span>{members.length}</span></div>
            {members.map((item) => (
              <button type="button" className={`itp-member ${member?.id === item.id ? "is-active" : ""}`} key={item.id}
                style={{ "--itp-member-color": memberColors[item.color] } as CSSProperties}
                aria-pressed={member?.id === item.id} aria-label={`${item.name} 선택`} onClick={() => selectMember(item.id)}>
                <span className="itp-member-avatar" aria-hidden="true"><MemberIcon /></span>
                <span className="itp-member-name">{item.name}</span>
                <span className="itp-member-dot" />
              </button>
            ))}
          </div>
        )}
      </div>}
      {showTeamControls && <div className={`itp-bottom${availability === "ready" ? " itp-team-reveal" : ""}`}>
        {availability === "ready" && <div className="itp-orbit-controls" role="group" aria-label="3D 화면 조작">
          <button type="button" className="itp-icon-button" onClick={toggleTopView} aria-label={topView ? "기본 각도로 돌아가기" : "위에서 보기"} title={topView ? "기본 각도로 돌아가기" : "위에서 보기"} aria-pressed={topView}>
            <TopViewIcon />
          </button>
          <button type="button" className="itp-icon-button" onClick={() => setPaused(!paused)} aria-label={paused ? "애니메이션 재생" : "애니메이션 일시정지"} title={paused ? "애니메이션 재생" : "애니메이션 일시정지"} aria-pressed={paused}>
            <MotionIcon paused={paused} />
          </button>
        </div>}
        {(!workspace || workspace.onInvite) && (
          <button type="button" className="itp-invite-trigger" onClick={openInvite} aria-label="팀원 초대" title="팀원 초대"><Icon name="plus" size={23} /></button>
        )}
      </div>}
      <button type="button" className="space-navigation-button itp-scroll-prompt" data-direction="down" onClick={showDashboard}><span>대시보드로 가기</span><Icon name="chevrons" size={20} className="space-navigation-arrows" /></button>
    </div>
        </div>
        <div className="itp-scroll-wash" aria-hidden="true" />
      </div>
    </section>
    <section className="itp-dashboard-section" id="team-dashboard" ref={dashboardSection} aria-label="팀 대시보드" tabIndex={-1}>
      <div className="itp-dashboard-frame">{workspace ? workspace.renderDashboard(showScene) : member && <TeamWorkspaceDashboard key={team.id} team={team} teams={immersivePreviewTeams} selectedMemberId={member.id} onSelectTeam={changeTeam} onSelectMember={selectDashboardMember} onFocusMember={focusMemberFromDashboard} onInvite={openInvite} onReturnToScene={showScene} />}</div>
    </section>
    {!workspace && <dialog ref={inviteDialog} className="itp-invite-dialog" aria-labelledby="itp-invite-title" onCancel={(event) => { event.preventDefault(); closeInvite() }} onClick={(event) => { if (event.target === event.currentTarget) closeInvite() }}><div className="itp-invite-heading"><h2 id="itp-invite-title">{team.name}</h2><button type="button" className="itp-icon-button" onClick={closeInvite} aria-label="초대 카드 닫기"><Icon name="close" size={19} /></button></div><label htmlFor="itp-invite-code">초대 코드</label><input id="itp-invite-code" value={team.inviteCode} readOnly onFocus={(event) => event.currentTarget.select()} /><button type="button" className="itp-copy" onClick={() => { void copyInvite() }}><Icon name={copyStatus === 'copied' ? 'check' : 'copy'} size={16} />{copyStatus === 'copied' ? '복사 완료' : '초대 코드 복사'}</button><p className="itp-invite-note" role="status">{copyStatus === 'error' ? '코드를 선택해 직접 복사해주세요.' : '미리보기용 초대 코드'}</p></dialog>}
  </div>
}
