import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import PageTitle from "@/components/common/PageTitle";
import { Icon } from "@/components/ui";
import type { User } from "@/features/auth/types";
import { useSession } from "@/features/auth/hooks/useSession";
import {
  useTeams,
  useTeamMutations,
  teamKeys,
} from "@/features/teams/hooks/useTeams";
import { teamApi } from "@/features/teams/api/teamApi";
import type { Team } from "@/features/teams/types";
import { agentKeys } from "@/features/agents/hooks/useAgents";
import { getDesktopApi } from "@/features/desktop-setup/api/desktopApi";
import ProjectConnectView from "@/features/desktop-setup/components/ProjectConnectView";
import { copyText } from "@/utils";

interface OnboardingPageProps {
  user: User;
  onFinish: (status: "completed" | "skipped", teamId?: number) => void;
}

const steps = [
  { title: "팀 준비", description: "함께할 작업 공간을 선택해요." },
  { title: "프로젝트 연결", description: "이 PC의 AI 도구를 연결해요." },
  { title: "설정 완료", description: "팀의 대시보드로 이동해요." },
];

export default function OnboardingPage({
  user,
  onFinish,
}: OnboardingPageProps) {
  const id = useId();
  const client = useQueryClient();
  const { logout, loggingOut, onError } = useSession();
  const teamsQuery = useTeams(user.userId);
  const mutations = useTeamMutations(user.userId);
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [teamName, setTeamName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const active = useRef(false);
  const desktop = getDesktopApi();
  const teams = teamsQuery.data ?? [];
  const step = connected ? 2 : selectedTeam ? 1 : 0;
  const busy = submitting || connecting || loggingOut;

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  function changeMode(next: typeof mode) {
    setMode(next);
    setError(null);
  }

  async function prepareTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || mode === "choose") return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "create") {
        const created = await mutations.createTeam.mutateAsync(teamName.trim());
        if (!active.current) return;
        setIssuedCode(created.inviteCode);
        setSelectedTeam(created);
      } else {
        const joined = await mutations.joinTeam.mutateAsync(inviteCode.trim());
        const team = await client.fetchQuery({
          queryKey: teamKeys.detail(user.userId, joined.teamId),
          queryFn: ({ signal }) => teamApi.getTeam(joined.teamId, signal),
        });
        if (!active.current) return;
        setIssuedCode(null);
        setSelectedTeam(team);
      }
    } catch (caught) {
      if (!active.current) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "팀을 준비하지 못했습니다. 다시 확인해주세요.",
      );
      onError(caught);
    } finally {
      if (active.current) setSubmitting(false);
      mutations.createTeam.reset();
    }
  }

  async function copyInvite() {
    if (!issuedCode) return;
    try {
      await copyText(issuedCode);
      if (active.current) setNotice("초대 코드를 복사했습니다.");
    } catch {
      if (active.current) setNotice("코드를 선택해 직접 복사해주세요.");
    }
  }

  function refreshAgents() {
    if (selectedTeam)
      void client.invalidateQueries({
        queryKey: agentKeys.list(user.userId, selectedTeam.teamId),
      });
  }

  return (
    <main className="onboarding-page">
      <PageTitle title="DevLink 시작하기" />
      <header className="onboarding-header">
        <a className="auth-brand" href="/" aria-label="DevLink 홈">
          <span className="auth-brand-mark" aria-hidden="true">
            D
          </span>
          <span>DevLink</span>
        </a>
        <div className="onboarding-account">
          <span>{user.nickname || user.name}님</span>
          <button
            className="button button-ghost button-small"
            type="button"
            disabled={busy}
            onClick={() => {
              void logout();
            }}
          >
            로그아웃
            <Icon name="logout" size={15} />
          </button>
        </div>
      </header>

      <div className="onboarding-layout">
        <aside className="onboarding-story" aria-label="시작하기 진행 단계">
          <div className="onboarding-story-copy">
            <p className="eyebrow">LET’S GET CONNECTED</p>
            <h1>
              첫 연결부터,
              <br />
              팀과 함께<span className="heading-dot">.</span>
            </h1>
            <p>
              작업할 프로젝트와 AI 도구를
              <br />
              DevLink에 연결해보세요.
            </p>
          </div>
          <ol className="onboarding-steps">
            {steps.map((item, index) => (
              <li
                key={item.title}
                className={`${index === step ? "is-current" : ""} ${index < step ? "is-complete" : ""}`}
                aria-current={index === step ? "step" : undefined}
              >
                <span className="onboarding-step-number">
                  {index < step ? (
                    <Icon name="check" size={17} />
                  ) : (
                    `0${index + 1}`
                  )}
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="onboarding-mascot">
            <img
              src={`${import.meta.env.BASE_URL}mascot-1.png`}
              alt=""
              width={934}
              height={854}
            />
            <span>사람과 Agent가 함께하는 작업 공간</span>
          </div>
        </aside>

        <section className="onboarding-main" aria-labelledby={`${id}-heading`}>
          <div className="onboarding-main-heading">
            <span className="onboarding-step-caption">
              STEP 0{step + 1} / 03
            </span>
            <h2 id={`${id}-heading`}>
              {connected
                ? "첫 연결을 완료했어요"
                : selectedTeam
                  ? "프로젝트를 연결해볼까요?"
                  : "함께할 팀을 준비하세요"}
            </h2>
            <p>
              {connected
                ? "연결한 프로젝트를 확인하고 작업 공간으로 이동하세요."
                : selectedTeam
                  ? "폴더를 선택하면 이 PC에 설치된 AI 도구를 확인합니다."
                  : "새 팀을 만들거나, 동료에게 받은 초대 코드로 참여하세요."}
            </p>
          </div>

          {!selectedTeam ? (
            <div className="onboarding-team-content">
              {teamsQuery.isError && (
                <div className="inline-error" role="alert">
                  팀 목록을 불러오지 못했습니다.{" "}
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      void teamsQuery.refetch();
                    }}
                    disabled={teamsQuery.isFetching}
                  >
                    다시 확인
                  </button>
                </div>
              )}
              {teamsQuery.isPending && (
                <p className="loading-copy" role="status">
                  참여 중인 팀을 확인하고 있어요.
                </p>
              )}
              {teams.length > 0 && mode === "choose" && (
                <div className="onboarding-existing-teams">
                  <p className="onboarding-label">참여 중인 팀에서 시작하기</p>
                  {teams.map((team) => (
                    <button
                      className="onboarding-team-option"
                      type="button"
                      key={team.teamId}
                      onClick={() => {
                        setIssuedCode(null);
                        setSelectedTeam(team);
                      }}
                      disabled={busy}
                    >
                      <span className="onboarding-option-icon">
                        <Icon name="team" size={21} />
                      </span>
                      <span>
                        <strong>{team.name}</strong>
                        <small>
                          {team.myRole === "OWNER"
                            ? "내가 만든 팀"
                            : "참여 중인 팀"}
                        </small>
                      </span>
                      <Icon name="arrow" size={18} />
                    </button>
                  ))}
                </div>
              )}
              <div
                className="onboarding-team-choices"
                aria-label="팀 준비 방법"
              >
                <button
                  className={`onboarding-choice ${mode === "create" ? "is-selected" : ""}`}
                  type="button"
                  aria-pressed={mode === "create"}
                  disabled={busy}
                  onClick={() => changeMode("create")}
                >
                  <span className="onboarding-option-icon">
                    <Icon name="plus" size={22} />
                  </span>
                  <strong>새 팀 만들기</strong>
                  <span>새로운 작업 공간을 만들어요.</span>
                </button>
                <button
                  className={`onboarding-choice ${mode === "join" ? "is-selected" : ""}`}
                  type="button"
                  aria-pressed={mode === "join"}
                  disabled={busy}
                  onClick={() => changeMode("join")}
                >
                  <span className="onboarding-option-icon">
                    <Icon name="key" size={22} />
                  </span>
                  <strong>초대 코드로 참여</strong>
                  <span>동료의 작업 공간에 합류해요.</span>
                </button>
              </div>
              {mode !== "choose" && (
                <form
                  className="onboarding-team-form"
                  onSubmit={(event) => {
                    void prepareTeam(event);
                  }}
                >
                  <div className="field">
                    <label htmlFor={`${id}-team-input`}>
                      {mode === "create" ? "팀 이름" : "초대 코드"}
                    </label>
                    {mode === "create" ? (
                      <input
                        key="name"
                        id={`${id}-team-input`}
                        name="teamName"
                        value={teamName}
                        onChange={(event) => setTeamName(event.target.value)}
                        placeholder="예: DevLink 개발팀"
                        maxLength={120}
                        required
                        disabled={busy}
                        autoFocus
                      />
                    ) : (
                      <input
                        key="invite"
                        id={`${id}-team-input`}
                        name="inviteCode"
                        value={inviteCode}
                        onChange={(event) => setInviteCode(event.target.value)}
                        placeholder="동료에게 받은 초대 코드"
                        maxLength={64}
                        required
                        disabled={busy}
                        autoFocus
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                    )}
                  </div>
                  {error && (
                    <p className="inline-error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="onboarding-actions">
                    <button
                      className="button button-ghost"
                      type="button"
                      onClick={() => changeMode("choose")}
                      disabled={busy}
                    >
                      돌아가기
                    </button>
                    <button
                      className="button button-primary"
                      type="submit"
                      disabled={
                        busy ||
                        !(mode === "create" ? teamName : inviteCode).trim()
                      }
                    >
                      {submitting
                        ? "팀을 준비하고 있어요…"
                        : mode === "create"
                          ? "팀 만들고 계속"
                          : "참여하고 계속"}
                      <Icon name="arrow" size={16} />
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <>
              {!connected && (
                <div className="onboarding-selected-team">
                  <span className="onboarding-option-icon">
                    <Icon name="team" size={21} />
                  </span>
                  <div>
                    <small>현재 연결할 팀</small>
                    <strong>{selectedTeam.name}</strong>
                  </div>
                  <button
                    className="text-button"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setSelectedTeam(null);
                      setNotice("");
                    }}
                  >
                    변경
                  </button>
                </div>
              )}
              {desktop?.setup && desktop.getStatus ? (
                <ProjectConnectView
                  key={selectedTeam.teamId}
                  presentation="page"
                  setup={desktop.setup}
                  getStatus={desktop.getStatus}
                  account={{
                    userId: user.userId,
                    teamId: selectedTeam.teamId,
                    email: user.email,
                  }}
                  teamName={selectedTeam.name}
                  onRefreshAgents={refreshAgents}
                  onBusyChange={setConnecting}
                  onConnected={() => setConnected(true)}
                  onFinish={() => onFinish("completed", selectedTeam.teamId)}
                  onOpenDashboard={() =>
                    onFinish("skipped", selectedTeam.teamId)
                  }
                />
              ) : (
                <div className="onboarding-browser-help">
                  <span className="onboarding-option-icon">
                    <Icon name="agent" size={24} />
                  </span>
                  <h3>프로젝트 연결은 데스크톱 앱에서</h3>
                  <p>
                    데스크톱 앱에서 같은 계정으로 로그인하면 프로젝트 폴더와 AI
                    도구를 연결할 수 있어요.
                  </p>
                  <p className="field-hint">
                    먼저 대시보드에서 팀을 둘러봐도 좋아요.
                  </p>
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => onFinish("skipped", selectedTeam.teamId)}
                  >
                    대시보드 먼저 보기
                    <Icon name="arrow" size={16} />
                  </button>
                </div>
              )}
              {issuedCode && (
                <details className="onboarding-invite">
                  <summary>동료를 초대할 코드가 필요해요</summary>
                  <div className="onboarding-invite-content">
                    <label className="field">
                      <span>팀 초대 코드</span>
                      <input
                        value={issuedCode}
                        readOnly
                        aria-label="팀 초대 코드"
                        onFocus={(event) => event.currentTarget.select()}
                      />
                    </label>
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void copyInvite();
                      }}
                    >
                      <Icon name="copy" size={15} />
                      복사
                    </button>
                  </div>
                  {notice && (
                    <p className="field-hint" role="status">
                      {notice}
                    </p>
                  )}
                </details>
              )}
            </>
          )}

          {!connected && (
            <footer className="onboarding-skip">
              <p>연결은 대시보드에서도 시작할 수 있어요.</p>
              <button
                className="text-button"
                type="button"
                disabled={busy}
                onClick={() => onFinish("skipped", selectedTeam?.teamId)}
              >
                나중에 설정
                <Icon name="chevron" size={15} />
              </button>
            </footer>
          )}
        </section>
      </div>
      <footer className="onboarding-footer">
        <span>DevLink Workspace</span>
        <span>팀과 Agent를 잇는 첫걸음</span>
      </footer>
    </main>
  );
}
