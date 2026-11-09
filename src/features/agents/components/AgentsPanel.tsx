import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Agent, CreateAgentInput } from "../types";
import type { Team, TeamMember } from "../../teams/types";
import { useAgent, useAgentMutations } from "../hooks/useAgents";
import { copyText, formatDate } from "../../../utils";
import { EmptyState, Icon, Modal } from "../../../components/ui";
import { getDesktopApi } from "@/features/desktop-setup/api/desktopApi";
import ProjectConnectView from "@/features/desktop-setup/components/ProjectConnectView";

interface AgentsPanelProps {
  team: Team;
  agents: Agent[];
  members: TeamMember[];
  currentUserId: number;
  currentUserEmail: string;
  loading: boolean;
  onRefresh: () => void;
  onError: (error: unknown) => void;
  onNotice: (message: string) => void;
}

interface AgentForm {
  name: string;
  roleDescription: string;
  projectName: string;
  toolType: CreateAgentInput["toolType"];
}

const emptyForm: AgentForm = {
  name: "",
  roleDescription: "",
  projectName: "",
  toolType: "CODEX",
};

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "요청을 처리하지 못했습니다. 잠시 후 다시 확인해주세요.";
}

function toolName(toolType: Agent["toolType"]): string {
  return toolType === "CODEX" ? "Codex" : "Claude Code";
}

export default function AgentsPanel({
  team,
  agents,
  members,
  currentUserId,
  currentUserEmail,
  loading,
  onRefresh,
  onError,
  onNotice,
}: AgentsPanelProps) {
  const fieldId = useId();
  const desktop = getDesktopApi();
  const active = useRef(true);
  const mutations = useAgentMutations(currentUserId, team.teamId);
  const [search, setSearch] = useState("");
  const [pcReady, setPcReady] = useState<boolean | null>(null);
  const [formTarget, setFormTarget] = useState<Agent | "register" | null>(null);
  const [form, setForm] = useState<AgentForm>(emptyForm);
  const saving = mutations.registerAgent.isPending || mutations.updateAgent.isPending;
  const [formError, setFormError] = useState<string | null>(null);
  const [detailAgentId, setDetailAgentId] = useState<number | null>(null);
  const detailQuery = useAgent(currentUserId, detailAgentId);
  const detail =
    detailAgentId === null
      ? null
      : {
        agent: detailQuery.data ?? null,
        loading: detailQuery.isFetching,
        error: detailQuery.error ? errorMessage(detailQuery.error) : null,
      };
  const [tokenAgent, setTokenAgent] = useState<Agent | null>(null);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [tokenVisible, setTokenVisible] = useState(false);
  const issuing = mutations.issueAgentToken.isPending;
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const deleting = mutations.deleteAgent.isPending;
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  useEffect(() => {
    if (detailAgentId !== null && detailQuery.error) onError(detailQuery.error);
  }, [detailAgentId, detailQuery.error, onError]);

  const query = search.trim().toLocaleLowerCase();
  const editingAgent = formTarget === "register" ? null : formTarget;
  const formChanged =
    !editingAgent ||
    form.name !== editingAgent.name ||
    form.projectName !== editingAgent.projectName ||
    form.roleDescription !== (editingAgent.roleDescription ?? "");
  const teamAgents = agents.filter((agent) => agent.teamId === team.teamId);
  const visibleAgents = teamAgents.filter((agent) =>
    [agent.name, agent.projectName, agent.roleDescription ?? ""].some((value) =>
      value.toLocaleLowerCase().includes(query),
    ),
  );

  function ownerName(agent: Agent): string {
    const owner = members.find((member) => member.userId === agent.ownerUserId);
    return owner?.nickname || owner?.name || `사용자 #${agent.ownerUserId}`;
  }

  function openRegister() {
    setForm(emptyForm);
    setFormError(null);
    setFormTarget("register");
  }

  function openEdit(agent: Agent) {
    if (agent.ownerUserId !== currentUserId) return;
    setForm({
      name: agent.name,
      projectName: agent.projectName,
      roleDescription: agent.roleDescription ?? "",
      toolType: agent.toolType,
    });
    setFormError(null);
    setFormTarget(agent);
  }

  function closeForm() {
    if (!saving) setFormTarget(null);
  }

  async function saveAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !formTarget ||
      saving ||
      !formChanged ||
      (editingAgent && editingAgent.ownerUserId !== currentUserId)
    )
      return;
    const name = form.name.trim();
    const projectName = form.projectName.trim();
    const roleDescription = form.roleDescription.trim();
    if (!name || !projectName) {
      setFormError("Agent 이름과 프로젝트명을 입력해주세요.");
      return;
    }
    setFormError(null);
    try {
      if (editingAgent) {
        await mutations.updateAgent.mutateAsync({
          agentId: editingAgent.agentId,
          input: {
            ...(form.name !== editingAgent.name ? { name } : {}),
            ...(form.projectName !== editingAgent.projectName ? { projectName } : {}),
            ...(form.roleDescription !== (editingAgent.roleDescription ?? "")
              ? { roleDescription }
              : {}),
          },
        });
      } else {
        await mutations.registerAgent.mutateAsync({
          name,
          projectName,
          toolType: form.toolType,
          ...(roleDescription ? { roleDescription } : {}),
        });
      }
      if (!active.current) return;
      setFormTarget(null);
      setForm(emptyForm);
      onNotice(editingAgent ? "Agent 정보를 수정했습니다." : "내 Agent를 팀에 등록했습니다.");
    } catch (error) {
      if (!active.current) return;
      setFormError(errorMessage(error));
      onError(error);
    }
  }

  function showDetail(agentId: number) {
    setDetailAgentId(agentId);
  }

  function closeDetail() {
    setDetailAgentId(null);
  }

  function openToken(agent: Agent) {
    setTokenAgent(agent);
    setIssuedToken(null);
    setTokenVisible(false);
    setTokenError(null);
  }

  function closeToken() {
    if (issuing) return;
    setTokenAgent(null);
    setIssuedToken(null);
    setTokenVisible(false);
    setTokenError(null);
  }

  async function issueToken() {
    if (!tokenAgent || issuing) return;
    const agentId = tokenAgent.agentId;
    setTokenError(null);
    try {
      const result = await mutations.issueAgentToken.mutateAsync(agentId);
      if (!active.current) return;
      if (result.agentId !== agentId || !result.token) {
        throw new Error("토큰 응답을 확인하지 못했습니다. Agent 정보를 새로고침해주세요.");
      }
      setIssuedToken(result.token);
      setTokenVisible(false);
      onNotice("Agent 연결 토큰을 발급했습니다.");
    } catch (error) {
      if (!active.current) return;
      setTokenError(errorMessage(error));
      onError(error);
    } finally {
      mutations.issueAgentToken.reset();
    }
  }

  function openDelete(agent: Agent) {
    if (agent.ownerUserId !== currentUserId || deleting) return;
    setDeleteTarget(agent);
    setDeleteError(null);
  }

  function closeDelete() {
    if (!deleting) setDeleteTarget(null);
  }

  async function deleteAgent() {
    if (!deleteTarget || deleting || deleteTarget.ownerUserId !== currentUserId) return;
    const agentId = deleteTarget.agentId;
    setDeleteError(null);
    try {
      await mutations.deleteAgent.mutateAsync(agentId);
      if (!active.current) return;
      if (detailAgentId === agentId) setDetailAgentId(null);
      if (tokenAgent?.agentId === agentId) {
        setTokenAgent(null);
        setIssuedToken(null);
        setTokenVisible(false);
        setTokenError(null);
      }
      setDeleteTarget(null);
      onNotice("Agent를 삭제했습니다.");
    } catch (error) {
      if (!active.current) return;
      setDeleteError(errorMessage(error));
      onError(error);
    }
  }

  async function copyToken() {
    if (!issuedToken) return;
    try {
      await copyText(issuedToken);
      if (active.current) onNotice("연결 토큰을 복사했습니다.");
    } catch {
      if (active.current)
        setTokenError("자동 복사를 사용할 수 없습니다. 토큰을 표시한 뒤 직접 선택해 복사해주세요.");
    }
  }

  return (
    <section className="panel agents-panel" aria-labelledby={`${fieldId}-heading`}>
      <div className="panel-heading">
        <div className="section-actions">
          <h2 className="section-title" id={`${fieldId}-heading`}>
            Agent 목록
          </h2>
          {pcReady !== null && (
            <span
              className={`badge ${pcReady ? "badge-online" : "badge-offline"}`}
              role="status"
            >
              PC : {pcReady ? "연결" : "미연결"}
            </span>
          )}
        </div>
        <div className="section-actions">
          {desktop?.setup && desktop.getStatus && (
            <ProjectConnectView
              setup={desktop.setup}
              getStatus={desktop.getStatus}
              account={{ userId: currentUserId, teamId: team.teamId, email: currentUserEmail }}
              teamName={team.name}
              onRefreshAgents={onRefresh}
              onReadyChange={setPcReady}
            />
          )}
          <button
            className="button button-primary"
            type="button"
            onClick={openRegister}
            disabled={loading}
          >
            <Icon name="plus" size={18} /> Agent 등록
          </button>
        </div>
      </div>

      <div className="agents-toolbar">
        <label className="search-field" htmlFor={`${fieldId}-search`}>
          <Icon name="agent" size={18} />
          <input
            id={`${fieldId}-search`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Agent, 프로젝트, 역할 검색"
            type="search"
          />
        </label>
        <span className="muted">
          {query ? `${visibleAgents.length}개 검색 결과` : `전체 ${teamAgents.length}개`}
        </span>
      </div>

      {loading && (
        <p className="loading-copy" role="status">
          Agent 목록을 불러오고 있습니다.
        </p>
      )}
      {!loading && teamAgents.length === 0 ? (
        <EmptyState
          icon={<Icon name="agent" size={28} />}
          title="등록된 Agent 없음"
          description="이 팀에서 사용할 내 Agent와 담당 프로젝트를 등록할 수 있습니다."
        />
      ) : (
        teamAgents.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col">프로젝트</th>
                  <th scope="col">도구</th>
                  <th scope="col">소유자</th>
                  <th scope="col">연결 상태</th>
                  <th scope="col">관리</th>
                </tr>
              </thead>
              <tbody>
                {visibleAgents.map((agent) => (
                  <tr key={agent.agentId}>
                    <td>
                      <div className="agent-cell">
                        <span className="agent-icon">
                          <Icon name="agent" size={20} />
                        </span>
                        <div>
                          <button
                            className="agent-name-button"
                            type="button"
                            onClick={() => showDetail(agent.agentId)}
                          >
                            {agent.name}
                          </button>
                          <div className="agent-meta">{agent.roleDescription || "역할 미등록"}</div>
                        </div>
                      </div>
                    </td>
                    <td>{agent.projectName}</td>
                    <td>
                      <span className="badge badge-tool">{toolName(agent.toolType)}</span>
                    </td>
                    <td>
                      {ownerName(agent)}
                      {agent.ownerUserId === currentUserId && (
                        <span className="self-label">나</span>
                      )}
                    </td>
                    <td>
                      <div className="status-cell">
                        <span
                          className={`badge ${agent.status === "ONLINE" ? "badge-online" : "badge-offline"}`}
                        >
                          {agent.status === "ONLINE" ? "온라인" : "오프라인"}
                        </span>
                        <div className="status-detail">
                          {agent.lastSeenAt ? formatDate(agent.lastSeenAt) : "접속 기록 없음"}
                        </div>
                      </div>
                    </td>
                    <td>
                      {agent.ownerUserId === currentUserId ? (
                        <div className="section-actions">
                          <button
                            className="button button-secondary button-small"
                            type="button"
                            onClick={() => openEdit(agent)}
                            disabled={deleting}
                            aria-label={`${agent.name} 수정`}
                          >
                            수정
                          </button>
                          <button
                            className="button button-secondary button-small"
                            type="button"
                            onClick={() => openToken(agent)}
                            disabled={deleting}
                          >
                            <Icon name="key" size={15} /> 연결 토큰
                          </button>
                          <button
                            className="button button-danger button-small"
                            type="button"
                            onClick={() => openDelete(agent)}
                            disabled={deleting}
                            aria-label={`${agent.name} 삭제`}
                          >
                            삭제
                          </button>
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {visibleAgents.length === 0 && (
                  <tr>
                    <td className="empty-table-cell" colSpan={6}>
                      검색 조건에 맞는 Agent가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )
      )}
      <p className="field-hint agents-footnote">
        등록 직후에는 오프라인으로 표시됩니다. 실제 접속 상태는 로컬 연결이 보고된 뒤 반영됩니다.
      </p>

      {deleteTarget && (
        <Modal
          title="Agent 삭제"
          description={`${deleteTarget.name} · ${deleteTarget.projectName}`}
          busy={deleting}
          onClose={closeDelete}
        >
          <p>
            이 Agent를 삭제할까요? 삭제하면 기존 연결 토큰을 사용할 수 없고 브로커 연결이
            종료됩니다.
          </p>
          <p className="field-hint">
            작업을 요청하거나 받은 이력이 있는 Agent는 삭제할 수 없습니다.
          </p>
          {deleteError && (
            <p className="inline-error" role="alert">
              {deleteError}
            </p>
          )}
          <div className="modal-footer">
            <button
              className="button button-secondary"
              type="button"
              disabled={deleting}
              onClick={closeDelete}
            >
              취소
            </button>
            <button
              className="button button-danger"
              type="button"
              disabled={deleting}
              onClick={() => {
                void deleteAgent();
              }}
            >
              {deleting ? "삭제 중…" : "Agent 삭제"}
            </button>
          </div>
        </Modal>
      )}

      {formTarget && (
        <Modal
          title={editingAgent ? "Agent 정보 수정" : "내 Agent 등록"}
          description={
            editingAgent
              ? `${editingAgent.name}의 정보를 수정합니다.`
              : `${team.name} 팀에 등록할 Agent 정보를 입력해주세요.`
          }
          busy={saving}
          onClose={closeForm}
        >
          <form
            className="grid gap-4.5"
            onSubmit={(event) => {
              void saveAgent(event);
            }}
          >
            <div className="field">
              <label htmlFor={`${fieldId}-name`}>
                Agent 이름 <span className="required-mark">*</span>
              </label>
              <input
                id={`${fieldId}-name`}
                value={form.name}
                maxLength={100}
                required
                autoFocus
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="예: 프론트엔드 Agent"
                disabled={saving}
              />
            </div>
            <div className={editingAgent ? undefined : "form-row"}>
              <div className="field">
                <label htmlFor={`${fieldId}-project`}>
                  {editingAgent ? "프로젝트 표시명" : "프로젝트명"}{" "}
                  <span className="required-mark">*</span>
                </label>
                <input
                  id={`${fieldId}-project`}
                  value={form.projectName}
                  maxLength={120}
                  required
                  onChange={(event) => setForm({ ...form, projectName: event.target.value })}
                  placeholder="예: DevLink Web"
                  disabled={saving}
                />
              </div>
              {!editingAgent && (
                <div className="field">
                  <label htmlFor={`${fieldId}-tool`}>사용 도구</label>
                  <select
                    id={`${fieldId}-tool`}
                    value={form.toolType}
                    disabled={saving}
                    onChange={(event) =>
                      setForm({ ...form, toolType: event.target.value as AgentForm["toolType"] })
                    }
                  >
                    <option value="CODEX">Codex</option>
                    <option value="CLAUDE_CODE">Claude Code</option>
                  </select>
                </div>
              )}
            </div>
            <div className="field">
              <label htmlFor={`${fieldId}-role`}>
                담당 역할 <span className="muted">선택</span>
              </label>
              <textarea
                id={`${fieldId}-role`}
                value={form.roleDescription}
                maxLength={255}
                rows={3}
                onChange={(event) => setForm({ ...form, roleDescription: event.target.value })}
                placeholder="예: 화면 구성과 사용자 인증 연동을 담당합니다."
                disabled={saving}
              />
              <span className="field-hint">{form.roleDescription.length}/255자</span>
            </div>
            {formError && (
              <p className="inline-error" role="alert">
                {formError}
              </p>
            )}
            <div className="modal-footer">
              <button
                className="button button-secondary"
                type="button"
                disabled={saving}
                onClick={closeForm}
              >
                취소
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={saving || !formChanged}
              >
                {editingAgent
                  ? saving
                    ? "저장 중…"
                    : "변경 사항 저장"
                  : saving
                    ? "등록 중…"
                    : "Agent 등록"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {detail && (
        <Modal title="Agent 상세 정보" onClose={closeDetail}>
          {detail.loading && (
            <p className="loading-copy" role="status">
              상세 정보를 불러오고 있습니다.
            </p>
          )}
          {detail.error && (
            <p className="inline-error" role="alert">
              {detail.error}
            </p>
          )}
          {detail.agent && (
            <dl className="detail-grid">
              <div className="detail-item">
                <dt>Agent 이름</dt>
                <dd>{detail.agent.name}</dd>
              </div>
              <div className="detail-item">
                <dt>Agent ID</dt>
                <dd>#{detail.agent.agentId}</dd>
              </div>
              <div className="detail-item">
                <dt>프로젝트</dt>
                <dd>{detail.agent.projectName}</dd>
              </div>
              <div className="detail-item">
                <dt>도구</dt>
                <dd>{toolName(detail.agent.toolType)}</dd>
              </div>
              <div className="detail-item">
                <dt>소유자</dt>
                <dd>{ownerName(detail.agent)}</dd>
              </div>
              <div className="detail-item">
                <dt>연결 상태</dt>
                <dd>{detail.agent.status === "ONLINE" ? "온라인" : "오프라인"}</dd>
              </div>
              <div className="detail-item">
                <dt>등록일</dt>
                <dd>{formatDate(detail.agent.createdAt)}</dd>
              </div>
              <div className="detail-item">
                <dt>마지막 접속</dt>
                <dd>
                  {detail.agent.lastSeenAt ? formatDate(detail.agent.lastSeenAt) : "접속 기록 없음"}
                </dd>
              </div>
              <div className="detail-item detail-item-full">
                <dt>담당 역할</dt>
                <dd>{detail.agent.roleDescription || "역할 미등록"}</dd>
              </div>
            </dl>
          )}
          <div className="modal-footer">
            <button className="button button-secondary" type="button" onClick={closeDetail}>
              닫기
            </button>
          </div>
        </Modal>
      )}

      {tokenAgent && (
        <Modal
          title={issuedToken ? "연결 토큰 발급 완료" : "Agent 연결 토큰"}
          description={`${tokenAgent.name} · ${tokenAgent.projectName}`}
          busy={issuing}
          onClose={closeToken}
        >
          {issuedToken ? (
            <>
              <p className="token-warning">
                토큰 원문은 이 화면에서만 확인할 수 있습니다. 창을 닫기 전에 안전한 곳에
                보관해주세요.
              </p>
              <div className="field">
                <label htmlFor={`${fieldId}-token`}>발급된 연결 토큰</label>
                <div className="token-field">
                  <input
                    id={`${fieldId}-token`}
                    type={tokenVisible ? "text" : "password"}
                    value={issuedToken}
                    readOnly
                    autoComplete="off"
                    spellCheck={false}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => setTokenVisible(!tokenVisible)}
                    aria-label={tokenVisible ? "토큰 숨기기" : "토큰 표시"}
                    aria-pressed={tokenVisible}
                  >
                    <Icon name={tokenVisible ? "eye-off" : "eye"} size={18} />
                  </button>
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    onClick={() => {
                      void copyToken();
                    }}
                  >
                    <Icon name="copy" size={16} /> 복사
                  </button>
                </div>
              </div>
              <p className="field-hint">
                이 화면을 닫으면 토큰을 다시 조회할 수 없습니다. 필요한 경우 새 토큰을 발급해주세요.
              </p>
            </>
          ) : (
            <>
              <div className="token-warning">
                <strong>기존 토큰이 있으면 새 토큰으로 교체됩니다.</strong>
                <p>
                  이전 토큰은 사용할 수 없고 기존 연결이 종료됩니다. 새 토큰이 필요할 때
                  발급해주세요.
                </p>
              </div>
              <p className="muted">
                토큰은 이 Agent의 연결 자격정보입니다. 다른 사람에게 공유하거나 공개 저장소에 올리지
                마세요.
              </p>
            </>
          )}
          {tokenError && (
            <p className="inline-error" role="alert">
              {tokenError}
            </p>
          )}
          <div className="modal-footer">
            <button
              className="button button-secondary"
              type="button"
              disabled={issuing}
              onClick={closeToken}
            >
              {issuedToken ? "닫기" : "취소"}
            </button>
            {!issuedToken && (
              <button
                className="button button-primary"
                type="button"
                disabled={issuing}
                onClick={() => {
                  void issueToken();
                }}
              >
                <Icon name="key" size={16} /> {issuing ? "발급 중…" : "새 연결 토큰 발급"}
              </button>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
