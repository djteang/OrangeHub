!include LogicLib.nsh
!include nsDialogs.nsh
!include WinMessages.nsh

; OrangeHub's setup page follows the compact, white single-column layout used by
; modern Chinese desktop clients. The generated NSIS pages inherit these colors.
!define OrangeHubInstallerBackground "FFFFFF"
!define OrangeHubInstallerSurface "F5F7FA"
!define OrangeHubInstallerText "1F2937"
!define OrangeHubInstallerMuted "7B8794"
!define OrangeHubInstallerAccent "1769FF"

!undef MUI_BGCOLOR
!define MUI_BGCOLOR "${OrangeHubInstallerBackground}"
!undef MUI_TEXTCOLOR
!define MUI_TEXTCOLOR "${OrangeHubInstallerText}"

LangString OrangeHubWelcomeTitle ${LANG_SIMPCHINESE} "欢迎使用 OrangeHub"
LangString OrangeHubWelcomeTitle ${LANG_ENGLISH} "Welcome to OrangeHub"
LangString OrangeHubWelcomeText ${LANG_SIMPCHINESE} "SSH、文件传输、数据库和 Docker 工作区，一站式管理。"
LangString OrangeHubWelcomeText ${LANG_ENGLISH} "SSH, file transfer, database, and Docker workspaces in one place."
LangString OrangeHubFinishTitle ${LANG_SIMPCHINESE} "OrangeHub 已安装"
LangString OrangeHubFinishTitle ${LANG_ENGLISH} "OrangeHub is installed"
LangString OrangeHubFinishText ${LANG_SIMPCHINESE} "OrangeHub 已准备就绪。点击完成启动应用。"
LangString OrangeHubFinishText ${LANG_ENGLISH} "OrangeHub is ready. Click Finish to start the app."
LangString OrangeHubInstallNow ${LANG_SIMPCHINESE} "安装"
LangString OrangeHubInstallNow ${LANG_ENGLISH} "Install"
LangString OrangeHubAgreement ${LANG_SIMPCHINESE} "安装即同意《用户协议》和《隐私政策》"
LangString OrangeHubAgreement ${LANG_ENGLISH} "Installing means you agree to the User Agreement and Privacy Policy"
LangString OrangeHubChoose ${LANG_SIMPCHINESE} "选择"
LangString OrangeHubChoose ${LANG_ENGLISH} "Browse"
LangString OrangeHubInstallNote ${LANG_SIMPCHINESE} "安装完成后可在应用设置中更改本地数据目录。"
LangString OrangeHubInstallNote ${LANG_ENGLISH} "You can change the local data directory later in app settings."
LangString OrangeHubDataDirectoryTitle ${LANG_SIMPCHINESE} "数据目录"
LangString OrangeHubDataDirectoryTitle ${LANG_ENGLISH} "Data directory"
LangString OrangeHubDataDirectoryDescription ${LANG_SIMPCHINESE} "连接配置、加密凭据和会话历史保存位置"
LangString OrangeHubDataDirectoryDescription ${LANG_ENGLISH} "Connection profiles, encrypted credentials, and session history"
LangString OrangeHubInstallDirectoryTitle ${LANG_SIMPCHINESE} "安装到"
LangString OrangeHubInstallDirectoryTitle ${LANG_ENGLISH} "Install to"
LangString OrangeHubInstallDirectoryHint ${LANG_SIMPCHINESE} "OrangeHub 程序文件保存位置"
LangString OrangeHubInstallDirectoryHint ${LANG_ENGLISH} "Where OrangeHub program files will be stored"
LangString OrangeHubDataDirectoryHint ${LANG_SIMPCHINESE} "建议使用当前用户可访问的目录"
LangString OrangeHubDataDirectoryHint ${LANG_ENGLISH} "Use a directory accessible by the current user"
LangString OrangeHubDataDirectoryRequired ${LANG_SIMPCHINESE} "请选择 OrangeHub 本地数据目录。"
LangString OrangeHubDataDirectoryRequired ${LANG_ENGLISH} "Please choose a local OrangeHub data directory."
LangString OrangeHubInstallDirectoryRequired ${LANG_SIMPCHINESE} "请选择 OrangeHub 安装位置。"
LangString OrangeHubInstallDirectoryRequired ${LANG_ENGLISH} "Please choose an OrangeHub install location."

!define MUI_WELCOMEPAGE_TITLE "$(OrangeHubWelcomeTitle)"
!define MUI_WELCOMEPAGE_TEXT "$(OrangeHubWelcomeText)"
!define MUI_FINISHPAGE_TITLE "$(OrangeHubFinishTitle)"
!define MUI_FINISHPAGE_TEXT "$(OrangeHubFinishText)"

Var OrangeHubDataDirectory
Var OrangeHubDataDirectoryControl
Var OrangeHubBrowseControl
Var OrangeHubInstallDirectory
Var OrangeHubInstallDirectoryControl
Var OrangeHubInstallBrowseControl
Var OrangeHubInstallButton
Var OrangeHubDialog
Var OrangeHubTitleControl
Var OrangeHubSubtitleControl
Var OrangeHubAgreementControl
Var OrangeHubInstallLabel
Var OrangeHubInstallHint
Var OrangeHubDataLabel
Var OrangeHubDataHint
Var OrangeHubNoteControl
Var OrangeHubTitleFont
Var OrangeHubSubtitleFont

Function OrangeHubDataDirectoryCreate
  ; Match the tall, narrow proportions of the reference installers.
  ; NSIS has no portable ChangeWindowSize command, so resize the wizard with
  ; the Win32 API while keeping its current centered position.
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i 0, i 0, i 720, i 900, i 0x0006)'

  ${If} $OrangeHubInstallDirectory == ""
    StrCpy $OrangeHubInstallDirectory "$INSTDIR"
  ${EndIf}
  ${If} $OrangeHubDataDirectory == ""
    IfFileExists "$INSTDIR\orangehub-install-data-directory.txt" 0 orangehub_data_directory_default
    FileOpen $0 "$INSTDIR\orangehub-install-data-directory.txt" r
    FileRead $0 $OrangeHubDataDirectory
    FileClose $0
    orangehub_data_directory_default:
    ${If} $OrangeHubDataDirectory == ""
      StrCpy $OrangeHubDataDirectory "$LOCALAPPDATA\OrangeHub\Data"
    ${EndIf}
  ${EndIf}

  nsDialogs::Create 1018
  Pop $OrangeHubDialog
  ${If} $OrangeHubDialog == error
    Abort
  ${EndIf}
  SetCtlColors $OrangeHubDialog "${OrangeHubInstallerText}" "${OrangeHubInstallerBackground}"

  ; Logo, brand name, and short product description. The horizontal values use
  ; percentages because NSIS dialog units scale with the active Windows font.
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_ICON}|${SS_CENTERIMAGE}|${SS_CENTER} 0 12u 100% 76u "${INSTALLERICON}"
  Pop $0
  CreateFont $OrangeHubTitleFont "Microsoft YaHei UI" 18 700
  ${NSD_CreateLabel} 0 94u 100% 24u "OrangeHub"
  Pop $OrangeHubTitleControl
  SendMessage $OrangeHubTitleControl ${WM_SETFONT} $OrangeHubTitleFont 1
  SetCtlColors $OrangeHubTitleControl "${OrangeHubInstallerText}" "transparent"

  CreateFont $OrangeHubSubtitleFont "Microsoft YaHei UI" 9 400
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_CENTER} 0 120u 100% 20u "$(OrangeHubWelcomeText)"
  Pop $OrangeHubSubtitleControl
  SendMessage $OrangeHubSubtitleControl ${WM_SETFONT} $OrangeHubSubtitleFont 1
  SetCtlColors $OrangeHubSubtitleControl "${OrangeHubInstallerMuted}" "transparent"

  ; Large primary action, matching the reference install screen.
  nsDialogs::CreateControl BUTTON ${WS_VISIBLE}|${WS_CHILD}|${BS_PUSHBUTTON}|${BS_FLAT} 12% 164u 76% 40u "$(OrangeHubInstallNow)"
  Pop $OrangeHubInstallButton
  SetCtlColors $OrangeHubInstallButton "FFFFFF" "${OrangeHubInstallerAccent}"
  System::Call 'uxtheme::SetWindowTheme(p $OrangeHubInstallButton, w "", w "")'
  ${NSD_OnClick} $OrangeHubInstallButton OrangeHubStartInstall

  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_CENTER} 0 215u 100% 18u "$(OrangeHubAgreement)"
  Pop $OrangeHubAgreementControl
  SetCtlColors $OrangeHubAgreementControl "${OrangeHubInstallerMuted}" "transparent"

  ; Install location row.
  ${NSD_CreateLabel} 8% 268u 84% 18u "$(OrangeHubInstallDirectoryTitle)"
  Pop $OrangeHubInstallLabel
  SetCtlColors $OrangeHubInstallLabel "${OrangeHubInstallerText}" "transparent"
  ${NSD_CreateLabel} 8% 286u 84% 16u "$(OrangeHubInstallDirectoryHint)"
  Pop $OrangeHubInstallHint
  SetCtlColors $OrangeHubInstallHint "${OrangeHubInstallerMuted}" "transparent"
  ${NSD_CreateDirRequest} 8% 307u 68% 20u "$OrangeHubInstallDirectory"
  Pop $OrangeHubInstallDirectoryControl
  SetCtlColors $OrangeHubInstallDirectoryControl "${OrangeHubInstallerText}" "${OrangeHubInstallerSurface}"
  ${NSD_CreateButton} 78% 307u 14% 20u "$(OrangeHubChoose)"
  Pop $OrangeHubInstallBrowseControl
  SetCtlColors $OrangeHubInstallBrowseControl "${OrangeHubInstallerText}" "${OrangeHubInstallerSurface}"
  ${NSD_OnClick} $OrangeHubInstallBrowseControl OrangeHubInstallDirectoryBrowse

  ; Local data location row. Keep it visible so an upgrade never silently moves
  ; encrypted credentials or session history to a different directory.
  ${NSD_CreateLabel} 8% 347u 84% 18u "$(OrangeHubDataDirectoryTitle)"
  Pop $OrangeHubDataLabel
  SetCtlColors $OrangeHubDataLabel "${OrangeHubInstallerText}" "transparent"
  ${NSD_CreateLabel} 8% 365u 84% 16u "$(OrangeHubDataDirectoryDescription)"
  Pop $OrangeHubDataHint
  SetCtlColors $OrangeHubDataHint "${OrangeHubInstallerMuted}" "transparent"
  ${NSD_CreateDirRequest} 8% 386u 68% 20u "$OrangeHubDataDirectory"
  Pop $OrangeHubDataDirectoryControl
  SetCtlColors $OrangeHubDataDirectoryControl "${OrangeHubInstallerText}" "${OrangeHubInstallerSurface}"
  ${NSD_CreateButton} 78% 386u 14% 20u "$(OrangeHubChoose)"
  Pop $OrangeHubBrowseControl
  SetCtlColors $OrangeHubBrowseControl "${OrangeHubInstallerText}" "${OrangeHubInstallerSurface}"
  ${NSD_OnClick} $OrangeHubBrowseControl OrangeHubDataDirectoryBrowse

  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_CENTER} 0 420u 100% 18u "$(OrangeHubInstallNote)"
  Pop $OrangeHubNoteControl
  SetCtlColors $OrangeHubNoteControl "${OrangeHubInstallerMuted}" "transparent"

  ; The reference screen uses one large action instead of the default MUI
  ; navigation row. Keep the standard buttons available to the page engine but
  ; hide them visually until this page has validated its two paths.
  GetDlgItem $0 $HWNDPARENT 1
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${SW_HIDE}
  nsDialogs::Show
FunctionEnd

Function OrangeHubStartInstall
  ; Clicking the large primary button follows the normal NSIS page transition,
  ; so validation and upgrade detection continue to use the generated flow.
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${BM_CLICK} 0 0
FunctionEnd

Function OrangeHubInstallDirectoryBrowse
  nsDialogs::SelectFolderDialog $HWNDPARENT "$OrangeHubInstallDirectory"
  Pop $0
  ${If} $0 != error
    StrCpy $OrangeHubInstallDirectory $0
    ${NSD_SetText} $OrangeHubInstallDirectoryControl $OrangeHubInstallDirectory
  ${EndIf}
FunctionEnd

Function OrangeHubDataDirectoryBrowse
  nsDialogs::SelectFolderDialog $HWNDPARENT "$OrangeHubDataDirectory"
  Pop $0
  ${If} $0 != error
    StrCpy $OrangeHubDataDirectory $0
    ${NSD_SetText} $OrangeHubDataDirectoryControl $OrangeHubDataDirectory
  ${EndIf}
FunctionEnd

Function OrangeHubDataDirectoryLeave
  ; Restore the hidden Next button before the page manager advances to license,
  ; reinstall, or installation pages.
  GetDlgItem $0 $HWNDPARENT 1
  ShowWindow $0 ${SW_SHOW}

  ${NSD_GetText} $OrangeHubInstallDirectoryControl $OrangeHubInstallDirectory
  StrCpy $INSTDIR $OrangeHubInstallDirectory
  ${If} $INSTDIR == ""
    MessageBox MB_ICONSTOP "$(OrangeHubInstallDirectoryRequired)"
    Abort
  ${EndIf}
  ${NSD_GetText} $OrangeHubDataDirectoryControl $0
  StrCpy $OrangeHubDataDirectory $0
  ${If} $OrangeHubDataDirectory == ""
    MessageBox MB_ICONSTOP "$(OrangeHubDataDirectoryRequired)"
    Abort
  ${EndIf}
FunctionEnd

; The data directory is selected during installation and written beside the app.
; The first-run onboarding reads this value before creating the vault.
!macro NSIS_HOOK_POSTINSTALL
  CreateDirectory "$INSTDIR"
  FileOpen $0 "$INSTDIR\orangehub-install-data-directory.txt" w
  FileWrite $0 "$OrangeHubDataDirectory"
  FileClose $0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\orangehub-install-data-directory.txt"
!macroend
