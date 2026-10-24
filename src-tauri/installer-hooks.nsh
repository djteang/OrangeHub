!include LogicLib.nsh
!include nsDialogs.nsh
!include WinMessages.nsh

; OrangeHub's setup page is a compact, white single-column installer. The first
; page is borderless and draws its own title bar so it matches the client chrome.
!define OrangeHubInstallerBackground "FFFFFF"
!define OrangeHubInstallerSurface "F5F7FA"
!define OrangeHubInstallerText "1F2937"
!define OrangeHubInstallerMuted "7B8794"
!define OrangeHubInstallerAccent "111111"

!undef MUI_BGCOLOR
!define MUI_BGCOLOR "${OrangeHubInstallerBackground}"
!undef MUI_TEXTCOLOR
!define MUI_TEXTCOLOR "${OrangeHubInstallerText}"

LangString OrangeHubWelcomeTitle ${LANG_SIMPCHINESE} "欢迎使用 OrangeHub"
LangString OrangeHubWelcomeTitle ${LANG_ENGLISH} "Welcome to OrangeHub"
LangString OrangeHubWelcomeText ${LANG_SIMPCHINESE} "SSH、文件传输、数据库和 Docker 工作区，一站式管理。"
LangString OrangeHubWelcomeText ${LANG_ENGLISH} "SSH, file transfer, database, and Docker workspaces in one place."
LangString OrangeHubFinishTitle ${LANG_SIMPCHINESE} "安装完成"
LangString OrangeHubFinishTitle ${LANG_ENGLISH} "Installation complete"
LangString OrangeHubFinishText ${LANG_SIMPCHINESE} "OrangeHub 已准备就绪，点击完成进入软件。"
LangString OrangeHubFinishText ${LANG_ENGLISH} "OrangeHub is ready. Click Finish to open the app."
LangString OrangeHubInstallNow ${LANG_SIMPCHINESE} "安装"
LangString OrangeHubInstallNow ${LANG_ENGLISH} "Install"
LangString OrangeHubAgreementPrefix ${LANG_SIMPCHINESE} "安装即同意"
LangString OrangeHubAgreementPrefix ${LANG_ENGLISH} "Installing means you agree to"
LangString OrangeHubUserAgreement ${LANG_SIMPCHINESE} "用户协议"
LangString OrangeHubUserAgreement ${LANG_ENGLISH} "User Agreement"
LangString OrangeHubPrivacyPolicy ${LANG_SIMPCHINESE} "隐私政策"
LangString OrangeHubPrivacyPolicy ${LANG_ENGLISH} "Privacy Policy"
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
LangString OrangeHubDataDirectoryRequired ${LANG_SIMPCHINESE} "请选择 OrangeHub 本地数据目录。"
LangString OrangeHubDataDirectoryRequired ${LANG_ENGLISH} "Please choose a local OrangeHub data directory."
LangString OrangeHubInstallDirectoryRequired ${LANG_SIMPCHINESE} "请选择 OrangeHub 安装位置。"
LangString OrangeHubInstallDirectoryRequired ${LANG_ENGLISH} "Please choose an OrangeHub install location."
LangString OrangeHubPolicyUser ${LANG_SIMPCHINESE} "OrangeHub 用户协议：请仅在你已阅读并同意使用条款后继续安装。"
LangString OrangeHubPolicyUser ${LANG_ENGLISH} "OrangeHub User Agreement: continue only after reading and accepting the terms."
LangString OrangeHubPolicyPrivacy ${LANG_SIMPCHINESE} "OrangeHub 隐私政策：连接配置和凭据仅保存在你选择的本地数据目录。"
LangString OrangeHubPolicyPrivacy ${LANG_ENGLISH} "OrangeHub Privacy Policy: connection profiles and credentials stay in your selected local data directory."

!define MUI_WELCOMEPAGE_TITLE "$(OrangeHubWelcomeTitle)"
!define MUI_WELCOMEPAGE_TEXT "$(OrangeHubWelcomeText)"
!define MUI_FINISHPAGE_TITLE "$(OrangeHubFinishTitle)"
!define MUI_FINISHPAGE_TEXT "$(OrangeHubFinishText)"
!define MUI_FINISHPAGE_BUTTON "进入 OrangeHub"

Var OrangeHubDataDirectory
Var OrangeHubDataDirectoryControl
Var OrangeHubBrowseControl
Var OrangeHubInstallDirectory
Var OrangeHubInstallDirectoryControl
Var OrangeHubInstallBrowseControl
Var OrangeHubInstallButton
Var OrangeHubDialog
Var OrangeHubTopBarControl
Var OrangeHubMinimizeButton
Var OrangeHubCloseButton
Var OrangeHubFinishButton
Var OrangeHubLogoControl
Var OrangeHubInstallSurface
Var OrangeHubTitleControl
Var OrangeHubAgreementPrefixControl
Var OrangeHubUserAgreementControl
Var OrangeHubPrivacyPolicyControl
Var OrangeHubAgreementAndControl
Var OrangeHubInstallLabel
Var OrangeHubInstallHint
Var OrangeHubDataLabel
Var OrangeHubDataHint
Var OrangeHubNoteControl
Var OrangeHubTopBarFont
Var OrangeHubButtonFont
Var OrangeHubWindowCustomized
Var OrangeHubInstFilesPage
Var OrangeHubProgressBar
Var OrangeHubProgressText
Var OrangeHubProgressLogButton
Var OrangeHubProgressLog

Function OrangeHubDataDirectoryCreate
  ; The custom page must fill the resized window. The default MUI page is much
  ; shorter, which is why controls previously disappeared below the viewport.
  Call OrangeHubApplyWindowChrome

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
  ; Move the page dialog over the full borderless client area.
  System::Call 'user32::SetWindowPos(p $OrangeHubDialog, p 0, i 0, i 0, i 720, i 900, i 0x0024)'

  ; Custom title bar with draggable brand text and window actions.
  CreateFont $OrangeHubTopBarFont "Microsoft YaHei UI" 11 700
  ${NSD_CreateLabel} 5% 4u 55% 18u "OrangeHub"
  Pop $OrangeHubTopBarControl
  SendMessage $OrangeHubTopBarControl ${WM_SETFONT} $OrangeHubTopBarFont 1
  SetCtlColors $OrangeHubTopBarControl "${OrangeHubInstallerText}" "transparent"
  ${NSD_OnClick} $OrangeHubTopBarControl OrangeHubDragWindow

  CreateFont $OrangeHubButtonFont "Microsoft YaHei UI" 11 700
  nsDialogs::CreateControl BUTTON ${WS_VISIBLE}|${WS_CHILD}|${BS_FLAT} 82% 3u 7% 18u "-"
  Pop $OrangeHubMinimizeButton
  SendMessage $OrangeHubMinimizeButton ${WM_SETFONT} $OrangeHubButtonFont 1
  SetCtlColors $OrangeHubMinimizeButton "${OrangeHubInstallerText}" "transparent"
  ${NSD_OnClick} $OrangeHubMinimizeButton OrangeHubMinimize
  nsDialogs::CreateControl BUTTON ${WS_VISIBLE}|${WS_CHILD}|${BS_FLAT} 90% 3u 7% 18u "x"
  Pop $OrangeHubCloseButton
  SendMessage $OrangeHubCloseButton ${WM_SETFONT} $OrangeHubButtonFont 1
  SetCtlColors $OrangeHubCloseButton "${OrangeHubInstallerText}" "transparent"
  ${NSD_OnClick} $OrangeHubCloseButton OrangeHubClose

  ; Use the same icon resource as the generated installer executable.
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_ICON}|${SS_CENTERIMAGE}|${SS_CENTER} 35% 22u 30% 54u "${INSTALLERICON}"
  Pop $OrangeHubLogoControl

  ; Large black primary action in the center of the page.
  nsDialogs::CreateControl BUTTON ${WS_VISIBLE}|${WS_CHILD}|${BS_PUSHBUTTON}|${BS_FLAT} 12% 100u 76% 30u "$(OrangeHubInstallNow)"
  Pop $OrangeHubInstallButton
  SetCtlColors $OrangeHubInstallButton "FFFFFF" "${OrangeHubInstallerAccent}"
  System::Call 'uxtheme::SetWindowTheme(p $OrangeHubInstallButton, w "", w "")'
  ${NSD_OnClick} $OrangeHubInstallButton OrangeHubStartInstall

  ; The agreement is made of real links so the user can inspect both texts.
  ${NSD_CreateLabel} 23% 134u 22% 16u "$(OrangeHubAgreementPrefix)"
  Pop $OrangeHubAgreementPrefixControl
  SetCtlColors $OrangeHubAgreementPrefixControl "${OrangeHubInstallerMuted}" "transparent"
  ${NSD_CreateLink} 45% 134u 19% 16u "$(OrangeHubUserAgreement)"
  Pop $OrangeHubUserAgreementControl
  SetCtlColors $OrangeHubUserAgreementControl "${OrangeHubInstallerText}" "transparent"
  ${NSD_OnClick} $OrangeHubUserAgreementControl OrangeHubOpenUserAgreement
  ${NSD_CreateLabel} 64% 134u 5% 16u "和"
  Pop $OrangeHubAgreementAndControl
  SetCtlColors $OrangeHubAgreementAndControl "${OrangeHubInstallerMuted}" "transparent"
  ${NSD_CreateLink} 69% 134u 20% 16u "$(OrangeHubPrivacyPolicy)"
  Pop $OrangeHubPrivacyPolicyControl
  SetCtlColors $OrangeHubPrivacyPolicyControl "${OrangeHubInstallerText}" "transparent"
  ${NSD_OnClick} $OrangeHubPrivacyPolicyControl OrangeHubOpenPrivacyPolicy

  ; Light settings surface matching the lower section in the reference image.
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 150u 100% 74u ""
  Pop $OrangeHubInstallSurface
  SetCtlColors $OrangeHubInstallSurface "" "${OrangeHubInstallerSurface}"

  ; Install location row.
  ${NSD_CreateLabel} 8% 154u 84% 14u "$(OrangeHubInstallDirectoryTitle)"
  Pop $OrangeHubInstallLabel
  SetCtlColors $OrangeHubInstallLabel "${OrangeHubInstallerText}" "transparent"
  ${NSD_CreateLabel} 8% 168u 84% 12u "$(OrangeHubInstallDirectoryHint)"
  Pop $OrangeHubInstallHint
  SetCtlColors $OrangeHubInstallHint "${OrangeHubInstallerMuted}" "transparent"
  ${NSD_CreateDirRequest} 8% 181u 68% 16u "$OrangeHubInstallDirectory"
  Pop $OrangeHubInstallDirectoryControl
  SetCtlColors $OrangeHubInstallDirectoryControl "${OrangeHubInstallerText}" "${OrangeHubInstallerBackground}"
  ${NSD_CreateButton} 78% 181u 14% 16u "$(OrangeHubChoose)"
  Pop $OrangeHubInstallBrowseControl
  SetCtlColors $OrangeHubInstallBrowseControl "${OrangeHubInstallerText}" "${OrangeHubInstallerBackground}"
  ${NSD_OnClick} $OrangeHubInstallBrowseControl OrangeHubInstallDirectoryBrowse

  ; Local data location row.
  ${NSD_CreateLabel} 8% 199u 84% 14u "$(OrangeHubDataDirectoryTitle)"
  Pop $OrangeHubDataLabel
  SetCtlColors $OrangeHubDataLabel "${OrangeHubInstallerText}" "transparent"
  ${NSD_CreateLabel} 8% 213u 84% 12u "$(OrangeHubDataDirectoryDescription)"
  Pop $OrangeHubDataHint
  SetCtlColors $OrangeHubDataHint "${OrangeHubInstallerMuted}" "transparent"
  ${NSD_CreateDirRequest} 8% 226u 68% 16u "$OrangeHubDataDirectory"
  Pop $OrangeHubDataDirectoryControl
  SetCtlColors $OrangeHubDataDirectoryControl "${OrangeHubInstallerText}" "${OrangeHubInstallerBackground}"
  ${NSD_CreateButton} 78% 226u 14% 16u "$(OrangeHubChoose)"
  Pop $OrangeHubBrowseControl
  SetCtlColors $OrangeHubBrowseControl "${OrangeHubInstallerText}" "${OrangeHubInstallerBackground}"
  ${NSD_OnClick} $OrangeHubBrowseControl OrangeHubDataDirectoryBrowse

  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_CENTER} 0 246u 100% 14u "$(OrangeHubInstallNote)"
  Pop $OrangeHubNoteControl
  SetCtlColors $OrangeHubNoteControl "${OrangeHubInstallerMuted}" "transparent"

  nsDialogs::Show
FunctionEnd

Function OrangeHubApplyWindowChrome
  ${If} $OrangeHubWindowCustomized == 1
    Return
  ${EndIf}
  StrCpy $OrangeHubWindowCustomized 1
  ; Remove the native caption, system menu, and resize frame.
  System::Call 'user32::GetWindowLong(p $HWNDPARENT, i -16)i.r0'
  IntOp $0 $0 & 0xFF30FFFF
  System::Call 'user32::SetWindowLong(p $HWNDPARENT, i -16, i $0)'
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i 0, i 0, i 720, i 900, i 0x0026)'
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i 0, i 0, i 0, i 0, i 0x0027)'
  GetDlgItem $0 $HWNDPARENT 1
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
FunctionEnd

Function OrangeHubRestoreWindowChrome
  ${If} $OrangeHubWindowCustomized != 1
    Return
  ${EndIf}
  StrCpy $OrangeHubWindowCustomized 0
  System::Call 'user32::GetWindowLong(p $HWNDPARENT, i -16)i.r0'
  IntOp $0 $0 | 0x00CF0000
  System::Call 'user32::SetWindowLong(p $HWNDPARENT, i -16, i $0)'
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i 0, i 0, i 0, i 0, i 0x0027)'
  GetDlgItem $0 $HWNDPARENT 1
  ShowWindow $0 ${SW_SHOW}
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${SW_SHOW}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_SHOW}
FunctionEnd

Function OrangeHubDragWindow
  System::Call 'user32::ReleaseCapture()'
  SendMessage $HWNDPARENT ${WM_NCLBUTTONDOWN} ${HTCAPTION} 0
FunctionEnd

Function OrangeHubMinimize
  ShowWindow $HWNDPARENT ${SW_MINIMIZE}
FunctionEnd

Function OrangeHubClose
  Quit
FunctionEnd

Function OrangeHubStartInstall
  ; Follow the normal NSIS page transition so the built-in installer engine runs
  ; the sections while the next page presents the matching progress state.
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${BM_CLICK} 0 0
FunctionEnd

Function OrangeHubInstFilesShow
  ; Keep the actual NSIS section engine but present its progress in the same
  ; centered position as the black install button.
  FindWindow $OrangeHubInstFilesPage "#32770" "" $HWNDPARENT
  GetDlgItem $OrangeHubProgressText $OrangeHubInstFilesPage 1006
  GetDlgItem $OrangeHubProgressBar $OrangeHubInstFilesPage 1004
  GetDlgItem $OrangeHubProgressLogButton $OrangeHubInstFilesPage 1027
  GetDlgItem $OrangeHubProgressLog $OrangeHubInstFilesPage 1016
  System::Call 'user32::SetWindowPos(p $OrangeHubInstFilesPage, p 0, i 0, i 0, i 720, i 900, i 0x0024)'
  System::Call 'user32::SetWindowPos(p $OrangeHubProgressText, p 0, i 86, i 360, i 548, i 30, i 0x0024)'
  System::Call 'user32::SetWindowPos(p $OrangeHubProgressBar, p 0, i 86, i 410, i 548, i 30, i 0x0024)'
  SetCtlColors $OrangeHubInstFilesPage "${OrangeHubInstallerText}" "${OrangeHubInstallerBackground}"
  SetCtlColors $OrangeHubProgressText "${OrangeHubInstallerText}" "transparent"
  SetCtlColors $OrangeHubProgressBar "${OrangeHubInstallerAccent}" "${OrangeHubInstallerSurface}"
  SendMessage $OrangeHubProgressText ${WM_SETTEXT} 0 "STR:正在安装 OrangeHub..."
  ShowWindow $OrangeHubProgressLogButton ${SW_HIDE}
  ShowWindow $OrangeHubProgressLog ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1
  System::Call 'user32::SetWindowPos(p $0, p 0, i 86, i 500, i 548, i 46, i 0x0024)'
  SetCtlColors $0 "FFFFFF" "${OrangeHubInstallerAccent}"
  ShowWindow $0 ${SW_SHOW}
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
FunctionEnd

Function OrangeHubFinishCreate
  ; Render completion inside the same white, borderless installer canvas.
  nsDialogs::Create 1018
  Pop $OrangeHubDialog
  ${If} $OrangeHubDialog == error
    Abort
  ${EndIf}
  SetCtlColors $OrangeHubDialog "${OrangeHubInstallerText}" "${OrangeHubInstallerBackground}"
  System::Call 'user32::SetWindowPos(p $OrangeHubDialog, p 0, i 0, i 0, i 720, i 900, i 0x0024)'

  CreateFont $OrangeHubTopBarFont "Microsoft YaHei UI" 11 700
  ${NSD_CreateLabel} 5% 4u 55% 18u "OrangeHub"
  Pop $OrangeHubTopBarControl
  SendMessage $OrangeHubTopBarControl ${WM_SETFONT} $OrangeHubTopBarFont 1
  SetCtlColors $OrangeHubTopBarControl "${OrangeHubInstallerText}" "transparent"
  ${NSD_OnClick} $OrangeHubTopBarControl OrangeHubDragWindow

  CreateFont $OrangeHubButtonFont "Microsoft YaHei UI" 11 700
  nsDialogs::CreateControl BUTTON ${WS_VISIBLE}|${WS_CHILD}|${BS_FLAT} 82% 3u 7% 18u "-"
  Pop $OrangeHubMinimizeButton
  SendMessage $OrangeHubMinimizeButton ${WM_SETFONT} $OrangeHubButtonFont 1
  SetCtlColors $OrangeHubMinimizeButton "${OrangeHubInstallerText}" "transparent"
  ${NSD_OnClick} $OrangeHubMinimizeButton OrangeHubMinimize
  nsDialogs::CreateControl BUTTON ${WS_VISIBLE}|${WS_CHILD}|${BS_FLAT} 90% 3u 7% 18u "x"
  Pop $OrangeHubCloseButton
  SendMessage $OrangeHubCloseButton ${WM_SETFONT} $OrangeHubButtonFont 1
  SetCtlColors $OrangeHubCloseButton "${OrangeHubInstallerText}" "transparent"
  ${NSD_OnClick} $OrangeHubCloseButton OrangeHubClose

  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_ICON}|${SS_CENTERIMAGE}|${SS_CENTER} 35% 22u 30% 54u "${INSTALLERICON}"
  Pop $OrangeHubLogoControl
  ${NSD_CreateLabel} 0 100u 100% 28u "$(OrangeHubFinishTitle)"
  Pop $OrangeHubTitleControl
  SetCtlColors $OrangeHubTitleControl "${OrangeHubInstallerText}" "transparent"
  ${NSD_CreateLabel} 0 132u 100% 24u "$(OrangeHubFinishText)"
  Pop $OrangeHubAgreementPrefixControl
  SetCtlColors $OrangeHubAgreementPrefixControl "${OrangeHubInstallerMuted}" "transparent"
  nsDialogs::CreateControl BUTTON ${WS_VISIBLE}|${WS_CHILD}|${BS_PUSHBUTTON}|${BS_FLAT} 12% 170u 76% 30u "进入 OrangeHub"
  Pop $OrangeHubFinishButton
  SetCtlColors $OrangeHubFinishButton "FFFFFF" "${OrangeHubInstallerAccent}"
  System::Call 'uxtheme::SetWindowTheme(p $OrangeHubFinishButton, w "", w "")'
  ${NSD_OnClick} $OrangeHubFinishButton OrangeHubFinishLeave
  nsDialogs::Show
FunctionEnd

Function OrangeHubFinishLeave
  ExecShell open "$INSTDIR\${MAINBINARYNAME}.exe"
  Quit
FunctionEnd

Function OrangeHubOpenUserAgreement
  MessageBox MB_OK "$(OrangeHubPolicyUser)"
FunctionEnd

Function OrangeHubOpenPrivacyPolicy
  MessageBox MB_OK "$(OrangeHubPolicyPrivacy)"
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
