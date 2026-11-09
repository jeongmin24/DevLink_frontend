import type { ReactNode } from 'react'

type IconName = 'team' | 'agent' | 'plus' | 'arrow' | 'refresh' | 'copy' | 'logout' | 'check' | 'close' | 'key' | 'chevron' | 'chevrons' | 'book' | 'shield' | 'eye' | 'eye-off' | 'grid'

export function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    team: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    agent: <><rect x="4" y="7" width="16" height="13" rx="4" /><path d="M12 3v4M1 12v4M23 12v4M9 16h6" /><circle cx="8.5" cy="12" r=".6" /><circle cx="15.5" cy="12" r=".6" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    refresh: <><path d="M20 11a8 8 0 0 0-13.66-4.66L4 9m0-6v6h6" /><path d="M4 13a8 8 0 0 0 13.66 4.66L20 15m-6 0h6v6" /></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" /></>,
    logout: <><path d="M9 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M15 8l4 4-4 4M8 12h11" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    key: <><circle cx="8" cy="8" r="5" /><path d="m11.5 11.5 9 9M17 16l3-3M14 13l3-3" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
    chevrons: <><path d="m6 4 6 4 6-4" /><path d="m6 10 6 4 6-4" /><path d="m6 16 6 4 6-4" /></>,
    book: <><path d="M12 5v16M3 3h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v16h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z" /></>,
    shield: <><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z" /><path d="m8 12 3 3 5-6" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    'eye-off': <><path d="m3 3 18 18M10 5.2c.7-.1 1.3-.2 2-.2 6.5 0 10 7 10 7a18 18 0 0 1-3.1 3.8M6.5 6.5A20 20 0 0 0 2 12s3.5 7 10 7c1.8 0 3.5-.5 5-1.3M10 10a3 3 0 0 0 4 4" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{paths[name]}</svg>
}

