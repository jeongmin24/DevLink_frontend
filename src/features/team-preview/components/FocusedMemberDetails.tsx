import { useId, useRef } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../../components/ui'
import type { PreviewMember } from '../data/previewData'
import '../styles/FocusedMemberDetails.css'

interface FocusedMemberDetailsProps {
  member: PreviewMember
  color: string
  onClose: () => void
  onOpenDashboard: () => void
}

export default function FocusedMemberDetails({ member, color, onClose, onOpenDashboard }: FocusedMemberDetailsProps) {
  const id = useId()
  const scrollBody = useRef<HTMLDivElement>(null)
  const agentSection = useRef<HTMLElement>(null)
  const onlineCount = member.agents.filter((agent) => agent.online).length
  const projectCount = new Set(member.agents.map((agent) => agent.project)).size
  const role = member.role === 'OWNER' ? '팀 소유자' : '팀원'

  function showAgentDetails() {
    const body = scrollBody.current
    const section = agentSection.current
    if (!body || !section) return
    const scrollContainer = getComputedStyle(body).overflowY === "visible" ? body.parentElement : body;
    if (!scrollContainer) return;
    const top = scrollContainer.scrollTop + section.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top - 4;
    scrollContainer.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  return <aside className="itp-selection itp-member-inspector" style={{ '--itp-member-color': color } as CSSProperties} aria-labelledby={`${id}-name`}>
    <header className="imi-header">
      <span className="imi-avatar" aria-hidden="true"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="7.5" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg></span>
      <div className="imi-identity"><h2 id={`${id}-name`}>{member.name}</h2><div className="imi-header-meta"><span className="imi-role">{role}</span><button className="imi-agent-jump" type="button" onClick={showAgentDetails} aria-controls={`${id}-agent-section`} title="에이전트 정보로 이동">에이전트 {member.agents.length}개<Icon name="chevron" size={14} /></button></div></div>
      <button className="imi-close" type="button" onClick={onClose} aria-label="팀원 정보 닫고 전체 팀 보기" title="전체 팀 보기"><Icon name="close" size={21} /></button>
    </header>

    <div className="imi-scroll" ref={scrollBody} tabIndex={0} role="region" aria-label={`${member.name}의 팀원 및 에이전트 상세 정보`}>
      <div className="imi-summary" aria-label="에이전트 및 프로젝트 현황">
        <div><strong>{member.agents.length}<small>개</small></strong><span>등록 에이전트</span></div>
        <div><strong>{onlineCount}<small>개</small></strong><span>온라인 에이전트</span></div>
        <div><strong>{projectCount}<small>개</small></strong><span>참여 프로젝트</span></div>
      </div>

      <section className="imi-agent-section" id={`${id}-agent-section`} ref={agentSection} aria-labelledby={`${id}-agents`}>
        <div className="imi-section-heading"><h3 id={`${id}-agents`}>에이전트 정보</h3><span>{member.agents.length}개</span></div>
        <div className="imi-agent-list">
          {member.agents.length === 0 ? <p className="imi-empty">등록된 에이전트가 없습니다.</p> : member.agents.map((agent) => <article className="imi-agent-card" key={agent.id} aria-labelledby={`${id}-${agent.id}`}>
            <header className="imi-agent-heading">
              <span className="imi-tool-badge" aria-label={`사용 도구 ${agent.tool}`}>{agent.tool}</span>
              <h4 id={`${id}-${agent.id}`}>{agent.name}</h4>
              <span className={`imi-status ${agent.online ? 'is-online' : ''}`}><i />{agent.online ? '온라인' : '오프라인'}</span>
            </header>
            <p className="imi-agent-description" aria-label="담당 역할">{agent.description.trim() || "등록된 역할 설명이 없습니다."}</p>
          </article>)}
        </div>
      </section>
    </div>

    <footer className="imi-footer"><button className="imi-dashboard-button" type="button" onClick={onOpenDashboard}>대시보드에서 보기<Icon name="arrow" size={18} /></button></footer>
  </aside>
}
