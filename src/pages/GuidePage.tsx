import { Icon } from "@/components/ui";

export default function GuidePage() {
  const steps = [
    ["팀 생성", "팀 이름을 입력하면 내가 OWNER로 등록되고 첫 초대 코드가 발급됩니다."],
    ["팀원 초대", "코드를 복사해 공유하세요. 동료는 자신의 계정으로 로그인한 뒤 코드로 팀에 참여할 수 있습니다."],
    ["Agent 등록", "이름, 도구 종류, 프로젝트명과 역할을 입력하세요. 등록한 Agent는 같은 팀에서 조회할 수 있습니다."],
    ["연결 토큰 보관", "내 Agent에서 토큰을 발급하고 복사하세요. 토큰 원문은 창을 닫으면 사라지고, 재발급하면 기존 토큰이 무효화됩니다."],
    ["연결 상태 확인", "Agent의 ONLINE/OFFLINE은 별도 연결에서 서버로 보고한 상태입니다. 등록 직후 OFFLINE은 정상이며 새로고침으로 현재 값을 확인할 수 있습니다."],
  ];
  return <div className="guide-page"><div className="workspace-view-heading"><h1>사용 가이드</h1></div><section className="panel guide-panel">{steps.map(([title, description], index) => <div className="guide-step" key={title}><span>{String(index + 1).padStart(2, "0")}</span><div><h2>{title}</h2><p>{description}</p></div><Icon name={index === 3 ? "key" : index === 4 ? "shield" : "check"} size={21} /></div>)}</section><div className="guide-notes"><div><Icon name="team" /><h3>여러 계정 사용</h3><p>일반 창과 시크릿 창, 또는 서로 다른 브라우저를 사용하세요. 같은 브라우저의 일반 탭들은 로그인 쿠키를 공유합니다.</p></div><div><Icon name="shield" /><h3>계정과 토큰 관리</h3><p>로그아웃은 웹 로그인 세션을 종료합니다. Agent 연결 토큰은 별도로 유지되며, 이 화면에서는 발급 결과를 저장하지 않습니다.</p></div></div></div>;
}

