import { useId, useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../../../lib/apiClient";
import type { User } from "../types";
import AuthLayout from "../../../layouts/AuthLayout";
import { useAuthMutations } from "../hooks/useAuthMutations";
import type { ConnectionState } from "../hooks/useSession";
import { Icon } from "../../../components/ui";
import PageTitle from "../../../components/common/PageTitle";

const rememberedEmailKey = "devlink:remembered-email";

function readRememberedEmail() {
  try {
    return localStorage.getItem(rememberedEmailKey) ?? "";
  } catch {
    return "";
  }
}

function saveRememberedEmail(email: string) {
  try {
    if (email) {
      localStorage.setItem(rememberedEmailKey, email);
    } else {
      localStorage.removeItem(rememberedEmailKey);
    }
  } catch {
    return;
  }
}

export default function AuthPanel({
  onAuthenticated,
  onNotice,
  connectionState,
  onRetryConnection,
}: {
  onAuthenticated: (user: User) => void | Promise<void>;
  onNotice: (message: string) => void;
  connectionState: ConnectionState;
  onRetryConnection: () => void;
}) {
  const id = useId();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState(readRememberedEmail);
  const [rememberEmail, setRememberEmail] = useState(() => Boolean(readRememberedEmail()));
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { login, signup } = useAuthMutations();
  const busy = login.isPending || signup.isPending;
  const [error, setError] = useState<string | null>(null);

  function changeMode(next: "login" | "signup") {
    setMode(next);
    setError(null);
    setPassword("");
    setShowPassword(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (new TextEncoder().encode(password).length > 72) {
      setError("비밀번호가 너무 깁니다. UTF-8 기준 72바이트 이하로 입력해주세요.");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setError("이름을 입력해주세요.");
      return;
    }
    try {
      if (mode === "signup") {
        await signup.mutateAsync({
          email: email.trim(),
          password,
          name: name.trim(),
          ...(nickname.trim() ? { nickname: nickname.trim() } : {}),
        });
        changeMode("login");
        onNotice("회원가입이 완료됐습니다. 같은 이메일로 로그인해주세요.");
      } else {
        const user = await login.mutateAsync({ email: email.trim(), password });
        saveRememberedEmail(rememberEmail ? email.trim().toLowerCase() : "");
        setPassword("");
        await onAuthenticated(user);
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.status === 0 || caught.code === "INVALID_API_RESPONSE"
            ? "연결하지 못했습니다. 잠시 후 다시 시도해주세요."
            : caught.message
          : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
      );
    } finally {
      login.reset();
      signup.reset();
    }
  }

  return (
    <AuthLayout>
      <PageTitle title={mode === "login" ? "로그인" : "회원가입"} />
      <section className="auth-form-side">
        <div className="auth-form-card">
          <h2>{mode === "login" ? "로그인" : "회원가입"}</h2>
          {connectionState === "offline" && (
            <div className="connection-help">
              <p>연결하지 못했습니다. 잠시 후 다시 시도해주세요.</p>
              <button className="text-button" type="button" onClick={onRetryConnection}>
                다시 확인 <Icon name="refresh" size={14} />
              </button>
            </div>
          )}
          <form className="grid gap-[18px]" onSubmit={submit}>
            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-[13px] max-[420px]:grid-cols-1">
                <div className="field">
                  <label htmlFor={`${id}-name`}>이름</label>
                  <input
                    id={`${id}-name`}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={100}
                    autoComplete="name"
                    placeholder="홍길동"
                    disabled={busy}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`${id}-nickname`}>
                    닉네임 <span className="optional">선택</span>
                  </label>
                  <input
                    id={`${id}-nickname`}
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                    maxLength={100}
                    autoComplete="nickname"
                    placeholder="팀에서 사용할 이름"
                    disabled={busy}
                  />
                </div>
              </div>
            )}
            <div className="field">
              <label htmlFor={`${id}-email`}>이메일</label>
              <input
                id={`${id}-email`}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value.toLowerCase())}
                required
                maxLength={255}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@example.com"
                disabled={busy}
              />
            </div>
            <div className="field">
              <label htmlFor={`${id}-password`}>비밀번호</label>
              <div className="password-field">
                <input
                  id={`${id}-password`}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={mode === "signup" ? 8 : undefined}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder={
                    mode === "signup" ? "8자 이상 입력해주세요" : "비밀번호를 입력해주세요"
                  }
                  disabled={busy}
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                  aria-pressed={showPassword}
                  disabled={busy}
                >
                  <Icon name={showPassword ? "eye-off" : "eye"} size={19} />
                </button>
              </div>
            </div>
            {mode === "login" && (
              <label className="auth-remember-email" htmlFor={`${id}-remember-email`}>
                <input
                  id={`${id}-remember-email`}
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setRememberEmail(checked);
                    if (!checked) saveRememberedEmail("");
                  }}
                  disabled={busy}
                />
                <span>이메일 저장</span>
              </label>
            )}
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <button className="button button-primary auth-submit" disabled={busy} type="submit">
              {busy ? "처리 중…" : mode === "login" ? "로그인" : "계정 만들기"}
            </button>
          </form>
          <div className="auth-mode-switch">
            <span>{mode === "login" ? "계정이 없으신가요?" : "이미 계정이 있으신가요?"}</span>
            <button
              type="button"
              onClick={() => changeMode(mode === "login" ? "signup" : "login")}
              disabled={busy}
            >
              {mode === "login" ? "회원가입" : "로그인"}
            </button>
          </div>
        </div>
      </section>
    </AuthLayout>
  );
}
