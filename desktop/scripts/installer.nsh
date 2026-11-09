; 사용자 정의 검사에서도 기본 검사에 필요한 초기화 유지
!include "getProcessInfo.nsh"
Var pid

!macro DevLinkStopBrokers UPDATE_FLAGS
  Push $0
  Push $1
  ; 동봉 런타임이 없으면 종료 단계 생략
  ${If} ${FileExists} "$INSTDIR\resources\node\node.exe"
  ${AndIf} ${FileExists} "$INSTDIR\resources\maintenance\broker-lifecycle.js"
    nsExec::ExecToStack '"$INSTDIR\resources\node\node.exe" "$INSTDIR\resources\maintenance\broker-lifecycle.js" ${UPDATE_FLAGS}'
    Pop $0
    Pop $1
    ; 종료 실패에도 진행, 사용 중인 파일은 업데이트 시 기존 설치 복원 후 중단
    ${If} $0 != 0
      DetailPrint "DevLink 연결 프로그램 일부를 종료하지 못했습니다."
      !if "${UPDATE_FLAGS}" == ""
        MessageBox MB_OK|MB_ICONEXCLAMATION "DevLink 연결 프로그램 일부를 종료하지 못했습니다. 제거 후 남은 파일은 컴퓨터를 다시 시작한 뒤 삭제해주세요." /SD IDOK
      !endif
    ${EndIf}
  ${Else}
    DetailPrint "동봉 런타임이 없어 연결 프로그램 종료를 건너뜁니다."
  ${EndIf}
  Pop $1
  Pop $0
!macroend

!macro customCheckAppRunning
  ; 기본 프로세스 종료 전에 실행 중인 연결 저장 및 정상 종료
  !ifdef BUILD_UNINSTALLER
    ${If} ${isUpdated}
      !insertmacro DevLinkStopBrokers "--update"
    ${Else}
      !insertmacro DevLinkStopBrokers ""
    ${EndIf}
  !else
    ; 직접 실행한 설치 프로그램에도 업데이트 재시작 목록 보존
    !insertmacro DevLinkStopBrokers "--update"
  !endif
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro _CHECK_APP_RUNNING
!macroend

!macro customUnInstall
  ${If} ${isUpdated}
    !insertmacro DevLinkStopBrokers "--update"
  ${Else}
    !insertmacro DevLinkStopBrokers ""
  ${EndIf}
!macroend
