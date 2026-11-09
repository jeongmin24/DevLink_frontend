import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-layout">
      <section className="auth-story" aria-labelledby="auth-story-title">
        <a className="auth-brand" href="/" aria-label="DevLink 홈">
          <span className="auth-brand-mark" aria-hidden="true">D</span>
          <span>DevLink</span>
        </a>
        <div className="auth-story-content">
          <div className="auth-story-copy">
            <h1 id="auth-story-title">팀 <span className="auth-story-emphasis">Agent</span><br />워크스페이스</h1>
          </div>
          <div className="auth-mascot-stage">
            <img
              className="auth-mascot"
              src={`${import.meta.env.BASE_URL}mascot-1.png`}
              alt="DevLink 마스코트"
              width={934}
              height={854}
              decoding="async"
              fetchPriority="high"
            />
          </div>
        </div>
      </section>
      {children}
    </main>
  )
}
