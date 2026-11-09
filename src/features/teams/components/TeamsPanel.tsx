import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, Ref } from "react";
import type { Team, TeamMember } from '../types'
import { useTeamMutations } from '../hooks/useTeams'
import { copyText, formatDate } from '../../../utils'
import { EmptyState, Icon, Modal } from '../../../components/ui'

export interface TeamsPanelProps {
  teams: Team[]
  selectedTeam: Team | null
  members: TeamMember[]
  currentUserId: number
  loading: boolean
  onSelectTeam: (teamId: number) => void
  onTeamsChanged: (preferredTeamId?: number) => void
  onRefresh: () => void
  onError: (error: unknown) => void
  onNotice: (message: string) => void
  inviteButtonRef?: Ref<HTMLButtonElement>;
}

type TeamDialog =
  | { kind: 'create' }
  | { kind: 'join' }
  | { kind: 'invite-confirm'; team: Team }
  | { kind: 'invite'; team: Team; code: string; created: boolean }

export default function TeamsPanel({
  teams,
  selectedTeam,
  members,
  currentUserId,
  loading,
  onSelectTeam,
  onTeamsChanged,
  onRefresh,
  onError,
  onNotice,
  inviteButtonRef,
}: TeamsPanelProps) {
  const fieldId = useId()
  const active = useRef(true)
  const mutations = useTeamMutations(currentUserId)
  const [dialog, setDialog] = useState<TeamDialog | null>(null)
  const [teamName, setTeamName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [issuedCodes, setIssuedCodes] = useState<Record<number, string>>({})
  const pending = mutations.createTeam.isPending || mutations.joinTeam.isPending || mutations.regenerateInvite.isPending
  const [formError, setFormError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  function openCreate() {
    setTeamName('')
    setFormError(null)
    setDialog({ kind: 'create' })
  }

  function openJoin() {
    setInviteCode('')
    setFormError(null)
    setDialog({ kind: 'join' })
  }

  function openInvite(team: Team) {
    setFormError(null)
    setCopied(false)
    const knownCode = issuedCodes[team.teamId]
    setDialog(knownCode
      ? { kind: 'invite', team, code: knownCode, created: false }
      : { kind: 'invite-confirm', team })
  }

  function closeDialog() {
    if (pending) return
    setDialog(null)
    setFormError(null)
    setCopied(false)
  }

  function reportFailure(error: unknown) {
    if (!active.current) return
    setFormError(error instanceof Error ? error.message : '요청을 처리하지 못했습니다. 다시 확인해주세요.')
    onError(error)
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = teamName.trim()
    if (!name || pending) return
    setFormError(null)
    try {
      const created = await mutations.createTeam.mutateAsync(name)
      if (!active.current) return
      const team: Team = {
        teamId: created.teamId,
        name: created.name,
        myRole: created.myRole,
        createdAt: created.createdAt,
      }
      setIssuedCodes((previous) => ({ ...previous, [team.teamId]: created.inviteCode }))
      setCopied(false)
      setDialog({ kind: 'invite', team, code: created.inviteCode, created: true })
      onTeamsChanged(team.teamId)
      onNotice('팀을 만들었습니다. 초대 코드를 팀원에게 공유해보세요.')
    } catch (error) {
      reportFailure(error)
    } finally {
      mutations.createTeam.reset()
    }
  }

  async function joinTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = inviteCode.trim()
    if (!code || pending) return
    setFormError(null)
    try {
      const joined = await mutations.joinTeam.mutateAsync(code)
      if (!active.current) return
      setDialog(null)
      setInviteCode('')
      onTeamsChanged(joined.teamId)
      onNotice(joined.replayed
        ? '이미 참여 중인 팀입니다. 해당 팀으로 이동합니다.'
        : '팀에 참여했습니다. 함께 사용할 Agent를 등록해보세요.')
    } catch (error) {
      reportFailure(error)
    }
  }

  async function regenerateInvite() {
    if (dialog?.kind !== 'invite-confirm' || pending) return
    const team = dialog.team
    setFormError(null)
    try {
      const issued = await mutations.regenerateInvite.mutateAsync(team.teamId)
      if (!active.current) return
      setIssuedCodes((previous) => ({ ...previous, [team.teamId]: issued.inviteCode }))
      setCopied(false)
      setDialog({ kind: 'invite', team, code: issued.inviteCode, created: false })
      onNotice('새 초대 코드를 만들었습니다. 이전 코드는 사용할 수 없습니다.')
    } catch (error) {
      reportFailure(error)
    } finally {
      mutations.regenerateInvite.reset()
    }
  }

  async function copyInvite(code: string) {
    try {
      await copyText(code)
      if (!active.current) return
      setCopied(true)
      onNotice('초대 코드를 복사했습니다.')
    } catch (error) {
      if (!active.current) return
      setFormError('복사하지 못했습니다. 코드를 선택해 직접 복사해주세요.')
      onError(error)
    }
  }

  return (
    <section className="panel team-panel" aria-labelledby={`${fieldId}-title`}>
      <div className="panel-heading">
        <div>
          <h2 className="section-title" id={`${fieldId}-title`}>참여 팀</h2>
        </div>
        <div className="section-actions">
          <button className="button button-secondary" type="button" onClick={openJoin} disabled={pending}>
            <Icon name="arrow" size={16} /> 코드로 참여
          </button>
          <button className="button button-primary" type="button" onClick={openCreate} disabled={pending}>
            <Icon name="plus" size={16} /> 팀 만들기
          </button>
        </div>
      </div>

      {teams.length > 0 && (
        <div className="team-selector">
          <label htmlFor={`${fieldId}-team`}>현재 팀</label>
          <select
            id={`${fieldId}-team`}
            value={selectedTeam?.teamId ?? ''}
            onChange={(event) => onSelectTeam(Number(event.target.value))}
            disabled={loading || pending}
          >
            {!selectedTeam && <option value="" disabled>팀을 선택하세요</option>}
            {teams.map((team) => (
              <option key={team.teamId} value={team.teamId}>{team.name} · #{team.teamId}</option>
            ))}
          </select>
          <button
            className="icon-button refresh-button"
            type="button"
            onClick={onRefresh}
            aria-label="팀 정보 새로고침"
            title="팀 정보 새로고침"
            aria-busy={loading}
            disabled={loading || pending || !selectedTeam}
          >
            <Icon name="refresh" size={18} />
          </button>
        </div>
      )}

      {loading && !selectedTeam ? (
        <p className="loading-copy" role="status">팀 정보를 불러오는 중입니다.</p>
      ) : !selectedTeam ? (
        <EmptyState
          icon={<Icon name="team" size={30} />}
          title="참여 중인 팀 없음"
          description="첫 팀을 만들거나 팀원에게 받은 초대 코드로 참여해보세요."
        />
      ) : (
        <div className="team-workspace">
          <div className="team-summary">
            <div className="team-summary-heading">
              <div className="team-mark" aria-hidden="true"><Icon name="team" size={24} /></div>
              <div>
                <h3>{selectedTeam.name}</h3>
                <span className={`badge ${selectedTeam.myRole === 'OWNER' ? 'badge-owner' : 'badge-member'}`}>
                  {selectedTeam.myRole}
                </span>
              </div>
            </div>
            <dl className="team-meta">
              <div><dt>팀 ID</dt><dd>#{selectedTeam.teamId}</dd></div>
              <div><dt>생성일</dt><dd>{formatDate(selectedTeam.createdAt)}</dd></div>
            </dl>
            {selectedTeam.myRole === 'OWNER' ? (
              <button
                ref={inviteButtonRef}
                className="button button-secondary button-small"
                type="button"
                disabled={pending || loading}
                onClick={() => openInvite(selectedTeam)}
              >
                <Icon name="key" size={15} />
                {issuedCodes[selectedTeam.teamId] ? '초대 코드 보기' : '새 초대 코드'}
              </button>
            ) : (
              <p className="field-hint">초대 코드는 팀 소유자가 발급할 수 있습니다.</p>
            )}
          </div>

          <div className="team-members">
            <div className="team-members-heading">
              <h3>함께하는 팀원</h3>
              <span className="badge">{loading ? '…' : `${members.length}명`}</span>
            </div>
            {loading ? (
              <p className="loading-copy" role="status">팀원 정보를 불러오는 중입니다.</p>
            ) : members.length === 0 ? (
              <p className="muted">표시할 팀원이 없습니다. 팀 정보를 다시 불러와주세요.</p>
            ) : (
              <ul className="member-list">
                {members.map((member) => (
                  <li className="member-row" key={member.userId}>
                    <span className="avatar" aria-hidden="true">{Array.from(member.name.trim())[0] ?? '?'}</span>
                    <div className="member-identity">
                      <strong>
                        {member.name}
                        {member.userId === currentUserId && <span className="member-self">나</span>}
                      </strong>
                      <span className="muted">{member.nickname || `사용자 #${member.userId}`}</span>
                    </div>
                    <span className={`badge ${member.role === 'OWNER' ? 'badge-owner' : 'badge-member'}`}>
                      {member.role}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {dialog?.kind === 'create' && (
        <Modal title="새 팀 만들기" description="팀을 만든 계정이 소유자(OWNER)가 됩니다." onClose={closeDialog} busy={pending}>
          <form className="grid gap-[18px]" onSubmit={(event) => { void createTeam(event) }}>
            <div className="field">
              <label htmlFor={`${fieldId}-name`}>팀 이름</label>
              <input
                id={`${fieldId}-name`}
                name="teamName"
                placeholder="예: DevLink 개발팀"
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                maxLength={120}
                required
                disabled={pending}
                aria-invalid={Boolean(formError)}
              />
              <span className="field-hint">최대 120자까지 입력할 수 있습니다.</span>
            </div>
            {formError && <p className="inline-error" role="alert">{formError}</p>}
            <div className="modal-footer">
              <button className="button button-secondary" type="button" onClick={closeDialog} disabled={pending}>취소</button>
              <button className="button button-primary" type="submit" disabled={pending || !teamName.trim()}>
                {pending ? '팀 만드는 중…' : '팀 만들기'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {dialog?.kind === 'join' && (
        <Modal title="초대 코드로 참여" description="팀원에게 받은 초대 코드를 입력해주세요." onClose={closeDialog} busy={pending}>
          <form className="grid gap-[18px]" onSubmit={(event) => { void joinTeam(event) }}>
            <div className="field">
              <label htmlFor={`${fieldId}-invite`}>초대 코드</label>
              <input
                id={`${fieldId}-invite`}
                name="inviteCode"
                className="code-input"
                placeholder="초대 코드를 붙여넣으세요"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                maxLength={64}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                disabled={pending}
                aria-invalid={Boolean(formError)}
              />
              <span className="field-hint">영문 대소문자를 구분합니다.</span>
            </div>
            {formError && <p className="inline-error" role="alert">{formError}</p>}
            <div className="modal-footer">
              <button className="button button-secondary" type="button" onClick={closeDialog} disabled={pending}>취소</button>
              <button className="button button-primary" type="submit" disabled={pending || !inviteCode.trim()}>
                {pending ? '참여하는 중…' : '팀에 참여하기'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {dialog?.kind === 'invite-confirm' && (
        <Modal title="새 초대 코드 만들기" description={`${dialog.team.name} 팀의 초대 코드를 새로 발급합니다.`} onClose={closeDialog} busy={pending}>
          <div className="grid gap-[18px]">
            <div className="invite-warning">
              <Icon name="shield" size={20} />
              <p>새 코드를 만들면 이전 초대 코드는 사용할 수 없습니다. 기존 팀원의 가입은 유지됩니다.</p>
            </div>
            {formError && <p className="inline-error" role="alert">{formError}</p>}
            <div className="modal-footer">
              <button className="button button-secondary" type="button" onClick={closeDialog} disabled={pending}>취소</button>
              <button className="button button-primary" type="button" onClick={() => { void regenerateInvite() }} disabled={pending}>
                {pending ? '코드 만드는 중…' : '새 코드 만들기'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {dialog?.kind === 'invite' && (
        <Modal
          title={dialog.created ? "팀 생성 완료" : "팀 초대 코드"}
          description={`${dialog.team.name} 팀에 초대할 사람에게 코드를 공유해주세요.`}
          onClose={closeDialog}
          busy={pending}
        >
          <div className="grid gap-[18px]">
            <div className="field">
              <label htmlFor={`${fieldId}-issued`}>초대 코드</label>
              <input
                id={`${fieldId}-issued`}
                className="invite-code"
                value={dialog.code}
                readOnly
                spellCheck={false}
                onFocus={(event) => event.currentTarget.select()}
              />
              <span className="field-hint">팀원은 로그인한 뒤 이 코드로 참여할 수 있습니다.</span>
            </div>
            {formError && <p className="inline-error" role="alert">{formError}</p>}
            <div className="modal-footer">
              <button
                className="button button-ghost button-small"
                type="button"
                onClick={() => {
                  setFormError(null)
                  setDialog({ kind: 'invite-confirm', team: dialog.team })
                }}
                disabled={pending}
              >
                새 코드 만들기
              </button>
              <button className="button button-secondary" type="button" onClick={closeDialog} disabled={pending}>닫기</button>
              <button className="button button-primary" type="button" onClick={() => { void copyInvite(dialog.code) }} disabled={pending}>
                <Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? '복사됨' : '코드 복사'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  )
}
