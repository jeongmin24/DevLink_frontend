import type { ReactNode } from 'react'
import { Icon } from './Icon'

export function EmptyState({ title, description, icon }: { title: string; description?: string; icon?: ReactNode }) {
  return <div className="empty-state px-5 py-[42px] text-center"><div className="empty-icon">{icon ?? <Icon name="agent" size={26} />}</div><h3>{title}</h3>{description && <p>{description}</p>}</div>
}
