# DevLink 데스크톱 개발

Windows에서 Node.js 24와 로컬 DevLink 서버를 준비합니다. CLI와 MCP 서버는 `DevLink_client`에서 빌드한 결과물을 사용합니다.

도구 감지와 계정 전환 시 MCP 설정 갱신에는 `devlink setup tools` 및 `mcp.mode=replace`를 지원하는 최신 CLI가 필요합니다. 기존 바이너리를 사용 중이라면 `DevLink_client/rust`에서 `cargo build --release -p devlink-cli`로 다시 빌드합니다.

프론트 저장소 루트에서 Vite를 실행합니다. `61907`은 로컬 서버 포트에 맞춰 바꿉니다.

```powershell
npm ci
$env:VITE_API_BASE_URL = ''
$env:DEVLINK_API_PROXY_TARGET = 'http://127.0.0.1:61907'
npm run dev -- --host localhost --port 5173 --strictPort
```

별도 PowerShell에서 `desktop`으로 이동해 `.env.local`을 설정하고 Electron을 실행합니다.

```powershell
cd desktop
npm ci
Copy-Item .env.example .env.local
```

`.env.local`의 `DEVLINK_DESKTOP_CONFIG_PATH`를 로컬 서버를 가리키는 테스트 프로필의 `config.json`으로 바꿉니다. 프로필이 없다면 사용자 홈 아래의 전용 폴더에 다음과 같이 만듭니다.

```powershell
$cli = (Resolve-Path '../../DevLink_client/rust/target/release/devlink.exe').Path
$testDir = Join-Path $env:USERPROFILE 'devlink-test'
New-Item -ItemType Directory -Force $testDir | Out-Null
$testConfig = Join-Path $testDir 'config.json'
# 새 테스트 프로필에서만 실행합니다.
if (Test-Path $testConfig) { throw '이미 존재하는 테스트 프로필입니다.' }
& $cli --config $testConfig init
if ($LASTEXITCODE -ne 0) { throw '테스트 프로필 초기화 실패' }
& $cli --config $testConfig config set serverUrl 'ws://127.0.0.1:61907/'
```

```powershell
npm run dev
```

창 아이콘은 `public/devlink.svg`를 Windows용으로 변환한 `desktop/assets/devlink.ico`를 사용합니다. 아이콘 설정 변경 후에는 프론트 새로고침 대신 Electron 앱을 종료하고 다시 실행합니다. Windows 실행 파일 패키징에도 같은 아이콘을 사용합니다.

Electron이 최초 실행 시 Windows 런타임을 내려받습니다. 로그인 후 팀 대시보드의 **Agent → 이 PC 연결**에서 프로젝트의 루트 폴더를 선택합니다. Codex와 Claude Code 중 하나만 감지되면 자동으로 사용하고, 둘 다 감지되면 선택할 수 있습니다. 해당 계정의 CLI 세션이 없거나 다른 계정으로 인증돼 있으면 현재 계정의 비밀번호를 입력합니다.

`DEVLINK_DESKTOP_CONFIG_PATH`는 기준 프로필입니다. CLI 프로필 하나는 Agent 하나(서버·사용자·팀·프로젝트)에 묶이므로, 앱은 프로젝트마다 기준 프로필 폴더 아래 `accounts/<서버 해시>/<사용자 ID>/teams/<팀 ID>/<프로젝트 해시>/config.json`을 자동으로 사용합니다. 기준 프로필이나 이전 계정별 프로필(`accounts/<서버 해시>/<사용자 ID>/config.json`)의 Agent가 같은 서버·사용자·팀·프로젝트에 속하면 해당 프로필을 재사용하고, 기준 프로필에 Agent가 없으면 같은 계정의 로그인 세션이 있을 때 기준 프로필을 사용합니다. 프로젝트 연결과 수동 설정 확인은 선택한 프로젝트의 프로필을 사용하고, 대시보드의 연결 상태는 현재 팀에 연결된 프로필 중 하나라도 준비되면 연결됨으로 표시합니다. 새 프로필은 로그인 정보와 Agent 토큰을 복사하지 않으므로 처음 연결하는 프로젝트마다 비밀번호를 확인하며, 로컬 브로커 포트를 자동 할당합니다. 같은 프로젝트에서 처음 연결한 것과 다른 AI 도구를 선택하면 기존 CLI 바인딩 정책에 따라 연결하지 않습니다.

설정 이력과 본인 소유 Agent가 없는 계정은 로그인 후 **DevLink 시작하기**에서 팀 준비와 프로젝트 연결을 순서대로 진행합니다. 완료하거나 **나중에 설정**을 선택한 이력은 현재 브라우저·앱에 계정별로 저장합니다. 기존 Agent가 있는 계정은 대시보드로 바로 진입하며, 추가 연결은 **Agent → 이 PC 연결**에서 진행합니다.

Windows 권한 검사를 통과하려면 사용자 전용 폴더에 프로젝트를 준비합니다. 바탕화면 아래의 MCP 경로가 권한 검사에서 거부되면 사용자 전용 폴더에 MCP의 `dist`, `package.json`, `node_modules`를 복사하고 `.env.local`의 `DEVLINK_DESKTOP_MCP_ENTRY`를 복사한 `dist/index.js`로 바꿉니다.

기존 브로커가 테스트 프로필의 포트를 사용 중이면 `devlink --config <테스트 config> config set localPort <빈 포트>`로 테스트 프로필에 다른 포트를 지정합니다.

프로젝트를 연결하면 지원 버전의 Codex·Claude Code 설정에서 DevLink 항목을 선택한 계정의 프로필로 갱신합니다. 기존 파일은 CLI가 비공개 백업으로 보존하고, 다른 MCP 서버와 프로젝트 설정은 유지합니다. 적용 직전 파일이 변경되면 덮어쓰지 않고 중단합니다. 같은 프로젝트에서 계정을 바꾼 뒤에는 AI 도구를 다시 열어 변경된 연결 정보를 사용합니다. 미검증 도구 버전은 기존과 같이 수동 설정 안내를 표시합니다.

계정별 프로필 및 데스크톱 IPC 회귀 테스트는 저장소 루트에서 `node --test desktop/tests/setup-profiles.test.cjs`로 실행합니다.

SET-3-01의 연결 화면은 폴더 선택 후 AI 도구·담당 파트·역할 태그를 확인하고 **연결하기**를 눌러 등록합니다. 도구가 하나여도 담당 정보를 입력할 수 있습니다. 파트는 프론트엔드·백엔드·인프라·기타 중 선택하며, 태그는 쉼표로 구분해 최대 10개·각 UTF-16 64자로 입력합니다. 잘못된 태그는 CLI 실행 전에 화면에서 오류를 표시합니다. 앞뒤 U+0000–U+0020과 중복은 서버와 같이 제거하며 비밀번호 재입력·연결 재시도에도 입력값을 유지합니다. 등록 결과 불명과 프로필 충돌에는 재시도 버튼을 제공하지 않습니다. 이미 연결된 Agent와 담당 정보가 달라 `SETUP_AGENT_BINDING_CONFLICT`가 나면 한글 안내와 함께 **담당 정보 다시 입력**으로 입력 화면에 돌아가며, 비운 항목은 저장값을 유지합니다. 이때 AI 도구는 처음 실행한 도구로 고정됩니다. 담당 정보를 입력하지 않았는데 같은 충돌이 나면 이름·도구 등 다른 연결 정보 문제로 안내하고 다시 입력 버튼을 표시하지 않습니다.

화면은 preload의 `setup.run(id, tool, password?, metadata?)` 네 번째 인자로 `{ part: "BACKEND", roles: ["API", "인증"] }`를 전달합니다. 선택하지 않거나 비워 둔 필드는 생략해 CLI가 신규 등록 시 `OTHER`·`[]`, 기존 프로필 재사용 시 저장값으로 처리합니다. 기존 Agent의 담당 정보 변경은 이 화면에서 제공하지 않습니다. 새 CLI와 서버의 Agent 메타데이터 API 반영이 필요합니다.

입력 검증 회귀는 `node --test desktop/tests/agent-metadata.test.cjs`로 실행합니다. 실제 React 화면의 입력·비밀번호 재입력·재시도·모달·좁은 화면 회귀는 `node --test desktop/tests/project-connect.test.cjs`로 실행합니다. 이 검사는 로컬 Vite 개발 서버와 모의 setup API를 사용하고 빌드를 실행하지 않습니다. Playwright 모듈이 없으면 화면 검사는 건너뜁니다. 외부 모듈 경로는 `DEVLINK_TEST_PLAYWRIGHT`, 설치된 Chromium 계열 브라우저 실행 경로는 `DEVLINK_TEST_BROWSER`로 지정할 수 있습니다.

## Windows 설치 파일

Node 24 x64에서 최신 CLI 릴리스 빌드와 MCP의 `dist`를 준비한 뒤 `desktop`에서 실행합니다. 프론트 웹 빌드는 이 과정에 포함하지 않습니다.

```powershell
# DevLink_client/rust에서 먼저 실행
cargo build --release --locked -p devlink-cli
# DevLink_client/packages/mcp-server에서 먼저 실행
npm ci
npm run build
# DevLink_frontend/desktop에서 실행
npm ci
npm run dist:win
```

Windows x64 CLI는 `DevLink_client/rust/.cargo/config.toml`의 `+crt-static` 설정으로 C 런타임을 정적으로 연결합니다. 위 Cargo 명령은 `rust` 디렉터리에서 실행하며, 배포 PC에 Visual C++ 재배포 패키지를 별도로 요구하지 않습니다. `RUSTFLAGS`로 빌드 설정을 재정의할 때도 이 설정을 유지해야 합니다.

기존 연결 프로그램이 `target/release/devlink.exe`를 사용 중이면 별도 Cargo 출력 폴더로 빌드하고, `DEVLINK_VENDOR_CLI_PATH` 환경 변수로 해당 실행 파일을 지정할 수 있습니다. 이 변수는 설치 파일을 준비할 때만 사용합니다. `prepare:vendor`는 실행 중인 공식 Node 24의 `node.exe`, CLI, MCP의 운영 의존성을 `vendor`에 모읍니다. CLI를 실행하기 전에 일반·지연 DLL 가져오기 표를 검사하고, `VCRUNTIME`·`MSVCP` 등 Visual C++ 재배포 DLL 의존성이나 잘못된 Windows x64 실행 파일을 발견하면 중단합니다. 그다음 CLI 버전과 MCP 초기화 응답을 확인합니다. 결과는 `desktop/dist/DevLink-Setup-<버전>.exe`이며 바이너리와 `vendor`는 Git에 추가하지 않습니다.

설치본은 `process.resourcesPath` 아래의 `bin/devlink.exe`, `bin/mcp-server/dist/index.js`, `node/node.exe`를 사용합니다. 서버는 `wss://api.devlink.ai.kr/`, 프로필은 사용자 홈의 `.devlink/desktop/accounts/...`를 사용합니다. 개발용 `.env.local`과 테스트 계정 프로필은 설치본에 포함하지 않습니다. 배포 화면(`https://devlink.ai.kr`)의 최상위 프레임에만 연결 API를 제공하며, main에서도 호출 출처를 확인합니다.

데스크톱 실행 파일명은 `DevLinkDesktop.exe`입니다. 설치 프로그램의 실행 중 앱 검사에서 CLI인 `devlink.exe`를 함께 종료하지 않도록 구분합니다. 서로 다른 Agent의 프로젝트 연결 프로그램은 동시에 실행할 수 있지만, 같은 Agent의 중복 실행과 실행 중 토큰 변경은 거부합니다. 구버전 CLI가 같은 계정으로 실행 중이면 해당 연결을 한 번 중지한 뒤 새 CLI로 다시 시작해야 합니다.

업데이트·제거 시 설치본 소유의 실행 중인 연결 프로그램을 프로젝트별로 중지하고, 동봉한 Node에서 실행 중인 MCP도 종료합니다. 일부를 종료하지 못하거나 동봉 런타임이 없어도 설치·제거를 중단하지 않습니다. 제거는 사용 중인 파일만 남기고 완료하며, 업데이트는 사용 중인 파일이 있으면 기존 설치를 복원한 뒤 중단합니다. 업데이트 전 실행 중이던 프로필은 다음 앱 실행에서 다시 시작합니다. 실패한 재시작은 다음 실행에서 다시 시도합니다. 프로젝트 설정의 런타임 경로는 설치 위치로 유지하며, 업데이트 후 AI 도구를 다시 열어주세요. 제거해도 사용자 홈의 프로필과 자격 파일은 보존합니다.

배포 설정은 [Electron의 격리·보안 지침](https://www.electronjs.org/docs/latest/tutorial/security)과 [electron-builder의 NSIS 훅](https://www.electron.build/nsis/)을 기준으로 구성합니다. 코드 서명과 자동 업데이트는 이번 범위에 포함하지 않습니다.

## 연결 검증

```powershell
# desktop에서 회귀 테스트
npm test
# 로컬 서버 127.0.0.1:8080, Vite localhost:5173, vendor를 준비한 뒤 실행
npm run verify:connection
# 설치 파일 생성 후 실제 설치·실행 중 업데이트·제거도 검증
npm run verify:installer
```

실제 Electron의 프로젝트 연결 화면과 CLI를 사용해 새 연결, 재연결, 두 번째 프로젝트, 다른 팀, 직접 적용 후 확인·재실행, 여러 연결 프로그램의 중지·복원을 확인합니다. 직접 적용 경로만 미검증 버전을 출력하는 테스트 Host를 사용합니다. AI 작업이나 모델 호출은 실행하지 않습니다. 테스트 전용 계정과 팀을 로컬 서버에 생성하고, 임시 프로필·설치 후보 폴더는 검증 후 삭제합니다. 화면과 검사 결과는 `dist/verification`에 남깁니다. 이 검사는 깨끗한 Windows 계정에서의 실제 설치·업데이트·제거 수용 검사를 대체하지 않습니다.

Visual C++ 런타임은 PC 전체에 설치될 수 있으므로 같은 PC에 새 계정을 만드는 것만으로 런타임 미설치 환경을 보장하지 않습니다. 이 조건은 재배포 패키지가 없는 깨끗한 Windows VM 등에서 별도로 확인합니다.

폴더 선택 대화상자의 반환값은 테스트 프로젝트로 고정하고 나머지 화면·IPC·CLI·로컬 서버는 실제 구현을 사용합니다. `verify:installer`는 기존 DevLink 설치와 `.devlink/desktop` 프로필이 없을 때만 실행합니다. `Programs` 아래의 임시 위치에 실제 NSIS 설치 파일을 설치하고 업데이트·제거 훅을 확인합니다. 제거 후 프로필과 자격 파일이 보존되는지 검사한 다음 테스트가 만든 프로필과 임시 설치만 정리합니다. 로컬 서버에 생성한 테스트 계정·팀·Agent 데이터는 남습니다.
