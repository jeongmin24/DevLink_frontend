import { Icon } from "@/components/ui";
import "../styles/workspace-utilities.css";

const previews = [
  { href: "/team-observatory", title: "3D 팀 스페이스 2", description: "팀 구성과 연결을 살펴보는 3D 공간", className: "design-art-observatory", icon: "team" as const },
  { href: "/team-network", title: "3D 팀 스페이스 3", description: "Agent 간 연결을 표현한 3D 공간", className: "design-art-network", icon: "agent" as const },
  { href: "/team-preview", title: "팀 디자인 미리보기", description: "팀 화면 디자인 시안", className: "design-art-collection", icon: "grid" as const },
];

export default function WorkspaceDesignView() {
  return <div className="workspace-design"><div className="workspace-view-heading"><h1>디자인 미리보기</h1></div><div className="workspace-design-grid">{previews.map((preview) => <a key={preview.href} href={preview.href} className="workspace-design-card"><div className={`design-card-art ${preview.className}`} aria-hidden="true"><Icon name={preview.icon} /></div><div className="design-card-copy"><h2>{preview.title}</h2><p>{preview.description}</p></div><span className="design-card-link">미리보기 열기<Icon name="arrow" size={16} /></span></a>)}</div><p className="workspace-utility-note"><Icon name="eye" size={17} />디자인용 미리보기에는 예시 데이터가 표시됩니다.</p></div>;
}
