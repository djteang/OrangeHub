!include LogicLib.nsh
!include nsDialogs.nsh
!include WinMessages.nsh

; OrangeHub's installer follows the compact, white and blue layout of the
; reference installer while keeping the real NSIS install engine underneath.
!define OrangeHubInstallerBackground "FFFFFF"
!define OrangeHubInstallerSurface "F5F8FC"
!define OrangeHubInstallerText "1D2A3A"
!define OrangeHubInstallerMuted "7A8797"
!define OrangeHubInstallerAccent "2563EB"
!define OrangeHubInstallerAccentSoft "EAF2FF"

!undef MUI_BGCOLOR
!define MUI_BGCOLOR "${OrangeHubInstallerBackground}"
!undef MUI_TEXTCOLOR
!define MUI_TEXTCOLOR "${OrangeHubInstallerText}"

LangString OrangeHubWelcomeTitle ${LANG_SIMPCHINESE} "欢迎安装 OrangeHub"
LangString OrangeHubWelcomeTitle ${LANG_ENGLISH} "Welcome to OrangeHub"
LangString OrangeHubWelcomeText ${LANG_SIMPCHINESE} "SSH、文件传输、数据库和 Docker 工作区，一站式管理。"
LangString OrangeHubWelcomeText ${LANG_ENGLISH} "SSH, file transfer, database, and Docker workspaces in one place."
LangString OrangeHubFinishTitle ${LANG_SIMPCHINESE} "安装完成"
LangString OrangeHubFinishTitle ${LANG_ENGLISH} "Installation complete"
LangString OrangeHubFinishText ${LANG_SIMPCHINESE} "OrangeHub 已准备就绪，点击进入软件。"
LangString OrangeHubFinishText ${LANG_ENGLISH} "OrangeHub is ready. Click to open the app."
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
LangString OrangeHubInstallDirectoryTitle ${LANG_SIMPCHINESE} "安装到"
LangString OrangeHubInstallDirectoryTitle ${LANG_ENGLISH} "Install to"
LangString OrangeHubInstallDirectoryHint ${LANG_SIMPCHINESE} "OrangeHub 程序文件保存位置"
LangString OrangeHubInstallDirectoryHint ${LANG_ENGLISH} "Where OrangeHub program files will be stored"
LangString OrangeHubDataDirectoryTitle ${LANG_SIMPCHINESE} "数据目录"
LangString OrangeHubDataDirectoryTitle ${LANG_ENGLISH} "Data directory"
LangString OrangeHubDataDirectoryHint ${LANG_SIMPCHINESE} "连接配置、加密凭据和会话历史保存位置"
LangString OrangeHubDataDirectoryHint ${LANG_ENGLISH} "Connection profiles, encrypted credentials, and session history"
LangString OrangeHubDataDirectoryRequired ${LANG_SIMPCHINESE} "请选择 OrangeHub 本地数据目录。"
LangString OrangeHubDataDirectoryRequired ${LANG_ENGLISH} "Please choose a local OrangeHub data directory."
LangString OrangeHubInstallDirectoryRequired ${LANG_SIMPCHINESE} "请选择 OrangeHub 安装位置。"
LangString OrangeHubInstallDirectoryRequired ${LANG_ENGLISH} "Please choose an OrangeHub install location."
LangString OrangeHubPolicyUser ${LANG_SIMPCHINESE} "OrangeHub 用户协议：请仅在你已阅读并同意使用条款后继续安装。"
LangString OrangeHubPolicyUser ${LANG_ENGLISH} "OrangeHub User Agreement: continue only after reading and accepting the terms."
LangString OrangeHubPolicyPrivacy ${LANG_SIMPCHINESE} "OrangeHub 隐私政策：连接配置和凭据仅保存在你选择的本地数据目录。"
LangString OrangeHubPolicyPrivacy ${LANG_ENGLISH} "OrangeHub Privacy Policy: connection profiles and credentials stay in your selected local data directory."
LangString OrangeHubReady ${LANG_SIMPCHINESE} "OrangeHub 已准备就绪"
LangString OrangeHubReady ${LANG_ENGLISH} "OrangeHub is ready"
LangString OrangeHubOpen ${LANG_SIMPCHINESE} "进入 OrangeHub"
LangString OrangeHubOpen ${LANG_ENGLISH} "Open OrangeHub"

!define MUI_WELCOMEPAGE_TITLE "$(OrangeHubWelcomeTitle)"
!define MUI_WELCOMEPAGE_TEXT "$(OrangeHubWelcomeText)"
!define MUI_FINISHPAGE_TITLE "$(OrangeHubFinishTitle)"
!define MUI_FINISHPAGE_TEXT "$(OrangeHubFinishText)"
!define MUI_FINISHPAGE_BUTTON "$(OrangeHubOpen)"

Var OrangeHubDataDirectory
Var OrangeHubDataDirectoryControl
Var OrangeHubBrowseControl
Var OrangeHubInstallDirectory
Var OrangeHubInstallDirectoryControl
Var OrangeHubInstallBrowseControl
Var OrangeHubInstallButton
Var OrangeHubInstallButtonSurface
Var OrangeHubDialog
Var OrangeHubDragSurface
Var OrangeHubTopBarControl
Var OrangeHubMinimizeButton
Var OrangeHubCloseButton
Var OrangeHubFinishButton
Var OrangeHubLogoSurface
Var OrangeHubLogoControl
Var OrangeHubLogoFallback
Var OrangeHubHeroTitle
Var OrangeHubHeroSubtitle
Var OrangeHubAgreementPrefixControl
Var OrangeHubUserAgreementControl
Var OrangeHubPrivacyPolicyControl
Var OrangeHubAgreementAndControl
Var OrangeHubInstallLabel
Var OrangeHubInstallHint
Var OrangeHubDataLabel
Var OrangeHubDataHint
Var OrangeHubNoteControl
Var OrangeHubOptionTitle
Var OrangeHubOptionOne
Var OrangeHubOptionTwo
Var OrangeHubOptionThree
Var OrangeHubTopBarFont
Var OrangeHubTitleFont
Var OrangeHubBodyFont
Var OrangeHubButtonFont
Var OrangeHubWindowCustomized
Var OrangeHubInstFilesPage
Var OrangeHubProgressBar
Var OrangeHubProgressText
Var OrangeHubProgressLogButton
Var OrangeHubProgressLog

Function OrangeHubApplyRoundRegion
  ; Stack order: HWND, width, height, radius.
  Pop $3
  Pop $2
  Pop $1
  Pop $0
  System::Call 'gdi32::CreateRoundRectRgn(i 0, i 0, i $1, i $2, i $3, i $3)i.r4'
  System::Call 'user32::SetWindowRgn(p $0, p $4, i 1)'
FunctionEnd

Function OrangeHubDataDirectoryCreate
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
  System::Call 'user32::SetWindowPos(p $OrangeHubDialog, p 0, i 0, i 0, i 760, i 940, i 0x0024)'

  ; Create the lower surface before its child controls so it stays behind the
  ; completion button and the option labels.
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 0 63% 100% 37% ""
  Pop $0
  SetCtlColors $0 "" "${OrangeHubInstallerSurface}"
  CreateFont $OrangeHubTitleFont "Microsoft YaHei UI" 10 700
  ${NSD_CreateLabel} 8% 67% 42% 5% "安装选项"
  Pop $OrangeHubOptionTitle
  SendMessage $OrangeHubOptionTitle ${WM_SETFONT} $OrangeHubTitleFont 1
  SetCtlColors $OrangeHubOptionTitle "${OrangeHubInstallerText}" "transparent"
  ${NSD_CreateLabel} 8% 74% 70% 5% "创建开始菜单快捷方式"
  Pop $OrangeHubOptionOne
  SetCtlColors $OrangeHubOptionOne "${OrangeHubInstallerMuted}" "transparent"
  ${NSD_CreateLabel} 8% 81% 70% 5% "创建桌面快捷方式"
  Pop $OrangeHubOptionTwo
  SetCtlColors $OrangeHubOptionTwo "${OrangeHubInstallerMuted}" "transparent"
  ${NSD_CreateLabel} 8% 88% 70% 5% "检查并安装 WebView2"
  Pop $OrangeHubOptionThree
  SetCtlColors $OrangeHubOptionThree "${OrangeHubInstallerMuted}" "transparent"
  ${NSD_CreateLabel} 88% 74% 6% 5% "✓"
  Pop $0
  SetCtlColors $0 "${OrangeHubInstallerAccent}" "transparent"
  ${NSD_CreateLabel} 88% 81% 6% 5% "✓"
  Pop $0
  SetCtlColors $0 "${OrangeHubInstallerAccent}" "transparent"
  ${NSD_CreateLabel} 88% 88% 6% 5% "✓"
  Pop $0
  SetCtlColors $0 "${OrangeHubInstallerAccent}" "transparent"

  ; A single lower surface creates the same visual split as the reference UI.
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 0 63% 100% 37% ""
  Pop $0
  SetCtlColors $0 "" "${OrangeHubInstallerSurface}"

  ; The transparent drag surface keeps the full title area interactive. The
  ; timer below starts the move on mouse-down, which works for a borderless NSIS window.
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_NOTIFY} 0 0 0 100% 8% ""
  Pop $OrangeHubDragSurface
  SetCtlColors $OrangeHubDragSurface "" "transparent"
  ${NSD_OnClick} $OrangeHubDragSurface OrangeHubDragWindow

  CreateFont $OrangeHubTopBarFont "Microsoft YaHei UI" 11 700
  ${NSD_CreateLabel} 5% 2% 50% 5% "OrangeHub"
  Pop $OrangeHubTopBarControl
  SendMessage $OrangeHubTopBarControl ${WM_SETFONT} $OrangeHubTopBarFont 1
  SetCtlColors $OrangeHubTopBarControl "${OrangeHubInstallerText}" "transparent"

  CreateFont $OrangeHubButtonFont "Microsoft YaHei UI" 11 700
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_CENTER}|${SS_NOTIFY} 0 82% 2% 7% 6% "-"
  Pop $OrangeHubMinimizeButton
  SendMessage $OrangeHubMinimizeButton ${WM_SETFONT} $OrangeHubButtonFont 1
  SetCtlColors $OrangeHubMinimizeButton "${OrangeHubInstallerMuted}" "transparent"
  ${NSD_OnClick} $OrangeHubMinimizeButton OrangeHubMinimize
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_CENTER}|${SS_NOTIFY} 0 90% 2% 7% 6% "x"
  Pop $OrangeHubCloseButton
  SendMessage $OrangeHubCloseButton ${WM_SETFONT} $OrangeHubButtonFont 1
  SetCtlColors $OrangeHubCloseButton "${OrangeHubInstallerMuted}" "transparent"
  ${NSD_OnClick} $OrangeHubCloseButton OrangeHubClose

  ; Brand mark: a large blue roundel with the embedded OrangeHub icon.
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 31% 10% 38% 25% ""
  Pop $OrangeHubLogoSurface
  SetCtlColors $OrangeHubLogoSurface "" "${OrangeHubInstallerAccentSoft}"
  Push $OrangeHubLogoSurface
  Push 288
  Push 235
  Push 118
  Call OrangeHubApplyRoundRegion
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_ICON}|${SS_CENTERIMAGE}|${SS_CENTER} 0 39% 14% 22% 17% ""
  Pop $OrangeHubLogoControl
  System::Call 'shell32::ExtractIcon(i 0, t "$EXEPATH", i 0)i.r0'
  ${If} $0 != 0
    SendMessage $OrangeHubLogoControl ${STM_SETIMAGE} ${IMAGE_ICON} $0
  ${Else}
    CreateFont $OrangeHubTitleFont "Microsoft YaHei UI" 30 700
    ${NSD_CreateLabel} 0 0 100% 100% "O"
    Pop $OrangeHubLogoFallback
    SendMessage $OrangeHubLogoFallback ${WM_SETFONT} $OrangeHubTitleFont 1
    SetCtlColors $OrangeHubLogoFallback "${OrangeHubInstallerAccent}" "transparent"
  ${EndIf}

  CreateFont $OrangeHubTitleFont "Microsoft YaHei UI" 15 700
  ${NSD_CreateLabel} 0 37% 100% 4% "OrangeHub"
  Pop $OrangeHubHeroTitle
  SendMessage $OrangeHubHeroTitle ${WM_SETFONT} $OrangeHubTitleFont 1
  SetCtlColors $OrangeHubHeroTitle "${OrangeHubInstallerText}" "transparent"
  CreateFont $OrangeHubBodyFont "Microsoft YaHei UI" 9 400
  ${NSD_CreateLabel} 0 41% 100% 4% "SSH · 数据库 · 文件传输 · Docker"
  Pop $OrangeHubHeroSubtitle
  SendMessage $OrangeHubHeroSubtitle ${WM_SETFONT} $OrangeHubBodyFont 1
  SetCtlColors $OrangeHubHeroSubtitle "${OrangeHubInstallerMuted}" "transparent"

  ; Primary action, rounded like the reference installer.
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 47% 48% 76% 9% ""
  Pop $OrangeHubInstallButtonSurface
  SetCtlColors $OrangeHubInstallButtonSurface "" "${OrangeHubInstallerAccent}"
  Push $OrangeHubInstallButtonSurface
  Push 578
  Push 74
  Push 30
  Call OrangeHubApplyRoundRegion
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_CENTER}|${SS_NOTIFY} 0 47% 48% 76% 9% "$(OrangeHubInstallNow)"
  Pop $OrangeHubInstallButton
  SendMessage $OrangeHubInstallButton ${WM_SETFONT} $OrangeHubButtonFont 1
  SetCtlColors $OrangeHubInstallButton "FFFFFF" "${OrangeHubInstallerAccent}"
  Push $OrangeHubInstallButton
  Push 578
  Push 74
  Push 30
  Call OrangeHubApplyRoundRegion
  ${NSD_OnClick} $OrangeHubInstallButton OrangeHubStartInstall

  ${NSD_CreateLabel} 19% 58% 24% 4% "$(OrangeHubAgreementPrefix)"
  Pop $OrangeHubAgreementPrefixControl
  SendMessage $OrangeHubAgreementPrefixControl ${WM_SETFONT} $OrangeHubBodyFont 1
  SetCtlColors $OrangeHubAgreementPrefixControl "${OrangeHubInstallerMuted}" "transparent"
  ${NSD_CreateLink} 44% 58% 18% 4% "$(OrangeHubUserAgreement)"
  Pop $OrangeHubUserAgreementControl
  SendMessage $OrangeHubUserAgreementControl ${WM_SETFONT} $OrangeHubBodyFont 1
  SetCtlColors $OrangeHubUserAgreementControl "${OrangeHubInstallerText}" "transparent"
  ${NSD_OnClick} $OrangeHubUserAgreementControl OrangeHubOpenUserAgreement
  ${NSD_CreateLabel} 63% 58% 5% 4% "和"
  Pop $OrangeHubAgreementAndControl
  SendMessage $OrangeHubAgreementAndControl ${WM_SETFONT} $OrangeHubBodyFont 1
  SetCtlColors $OrangeHubAgreementAndControl "${OrangeHubInstallerMuted}" "transparent"
  ${NSD_CreateLink} 68% 58% 18% 4% "$(OrangeHubPrivacyPolicy)"
  Pop $OrangeHubPrivacyPolicyControl
  SendMessage $OrangeHubPrivacyPolicyControl ${WM_SETFONT} $OrangeHubBodyFont 1
  SetCtlColors $OrangeHubPrivacyPolicyControl "${OrangeHubInstallerText}" "transparent"
  ${NSD_OnClick} $OrangeHubPrivacyPolicyControl OrangeHubOpenPrivacyPolicy

  ; Settings area: install location and data location remain editable.
  CreateFont $OrangeHubTitleFont "Microsoft YaHei UI" 10 700
  ${NSD_CreateLabel} 8% 65% 32% 4% "$(OrangeHubInstallDirectoryTitle)"
  Pop $OrangeHubInstallLabel
  SendMessage $OrangeHubInstallLabel ${WM_SETFONT} $OrangeHubTitleFont 1
  SetCtlColors $OrangeHubInstallLabel "${OrangeHubInstallerText}" "transparent"
  ${NSD_CreateLabel} 8% 69% 70% 3% "$(OrangeHubInstallDirectoryHint)"
  Pop $OrangeHubInstallHint
  SendMessage $OrangeHubInstallHint ${WM_SETFONT} $OrangeHubBodyFont 1
  SetCtlColors $OrangeHubInstallHint "${OrangeHubInstallerMuted}" "transparent"
  ${NSD_CreateDirRequest} 8% 72% 68% 5% "$OrangeHubInstallDirectory"
  Pop $OrangeHubInstallDirectoryControl
  SetCtlColors $OrangeHubInstallDirectoryControl "${OrangeHubInstallerText}" "${OrangeHubInstallerBackground}"
  ${NSD_CreateButton} 78% 72% 14% 5% "$(OrangeHubChoose)"
  Pop $OrangeHubInstallBrowseControl
  SendMessage $OrangeHubInstallBrowseControl ${WM_SETFONT} $OrangeHubBodyFont 1
  SetCtlColors $OrangeHubInstallBrowseControl "${OrangeHubInstallerText}" "${OrangeHubInstallerBackground}"
  ${NSD_OnClick} $OrangeHubInstallBrowseControl OrangeHubInstallDirectoryBrowse

  ${NSD_CreateLabel} 8% 79% 32% 4% "$(OrangeHubDataDirectoryTitle)"
  Pop $OrangeHubDataLabel
  SendMessage $OrangeHubDataLabel ${WM_SETFONT} $OrangeHubTitleFont 1
  SetCtlColors $OrangeHubDataLabel "${OrangeHubInstallerText}" "transparent"
  ${NSD_CreateLabel} 8% 83% 70% 3% "$(OrangeHubDataDirectoryHint)"
  Pop $OrangeHubDataHint
  SendMessage $OrangeHubDataHint ${WM_SETFONT} $OrangeHubBodyFont 1
  SetCtlColors $OrangeHubDataHint "${OrangeHubInstallerMuted}" "transparent"
  ${NSD_CreateDirRequest} 8% 86% 68% 5% "$OrangeHubDataDirectory"
  Pop $OrangeHubDataDirectoryControl
  SetCtlColors $OrangeHubDataDirectoryControl "${OrangeHubInstallerText}" "${OrangeHubInstallerBackground}"
  ${NSD_CreateButton} 78% 86% 14% 5% "$(OrangeHubChoose)"
  Pop $OrangeHubBrowseControl
  SendMessage $OrangeHubBrowseControl ${WM_SETFONT} $OrangeHubBodyFont 1
  SetCtlColors $OrangeHubBrowseControl "${OrangeHubInstallerText}" "${OrangeHubInstallerBackground}"
  ${NSD_OnClick} $OrangeHubBrowseControl OrangeHubDataDirectoryBrowse

  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_CENTER} 0 0 93% 100% 4% "$(OrangeHubInstallNote)"
  Pop $OrangeHubNoteControl
  SendMessage $OrangeHubNoteControl ${WM_SETFONT} $OrangeHubBodyFont 1
  SetCtlColors $OrangeHubNoteControl "${OrangeHubInstallerMuted}" "transparent"

  ${NSD_CreateTimer} OrangeHubDragTimer 25
  nsDialogs::Show
FunctionEnd

Function OrangeHubApplyWindowChrome
  ${If} $OrangeHubWindowCustomized == 1
    Return
  ${EndIf}
  StrCpy $OrangeHubWindowCustomized 1
  ; Remove the native caption and frame. The timer callback below supplies a
  ; native drag operation while keeping the custom title bar visually clean.
  System::Call 'user32::GetWindowLong(p $HWNDPARENT, i -16)i.r0'
  IntOp $0 $0 & 0xFF30FFFF
  System::Call 'user32::SetWindowLong(p $HWNDPARENT, p -16, i $0)'
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i 0, i 0, i 760, i 940, i 0x0026)'
  System::Call 'gdi32::CreateRoundRectRgn(i 0, i 0, i 760, i 940, i 28, i 28)i.r0'
  System::Call 'user32::SetWindowRgn(p $HWNDPARENT, p r0, i 1)'
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
  System::Call 'user32::SetWindowLong(p $HWNDPARENT, p -16, i $0)'
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

Function OrangeHubDragTimer
  System::Call 'user32::GetAsyncKeyState(i 1)i.r0'
  IntOp $0 $0 & 0x8000
  ${If} $0 = 0
    Return
  ${EndIf}

  System::Alloc 8
  Pop $0
  System::Call 'user32::GetCursorPos(p $0)i.r1'
  System::Call '*$0(i.r2, i.r3)'
  System::Free $0
  System::Alloc 16
  Pop $0
  System::Call 'user32::GetWindowRect(p $HWNDPARENT, p $0)i.r1'
  System::Call '*$0(i.r4, i.r5, i.r6, i.r7)'
  System::Free $0
  IntOp $2 $2 - $4
  IntOp $3 $3 - $5
  ; Leave the minimize and close controls clickable.
  ${If} $3 < 68
  ${AndIf} $2 > 12
  ${AndIf} $2 < 625
    Call OrangeHubDragWindow
  ${EndIf}
FunctionEnd

Function OrangeHubMinimize
  ShowWindow $HWNDPARENT ${SW_MINIMIZE}
FunctionEnd

Function OrangeHubClose
  Quit
FunctionEnd

Function OrangeHubStartInstall
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${BM_CLICK} 0 0
FunctionEnd

Function OrangeHubInstFilesShow
  FindWindow $OrangeHubInstFilesPage "#32770" "" $HWNDPARENT
  GetDlgItem $OrangeHubProgressText $OrangeHubInstFilesPage 1006
  GetDlgItem $OrangeHubProgressBar $OrangeHubInstFilesPage 1004
  GetDlgItem $OrangeHubProgressLogButton $OrangeHubInstFilesPage 1027
  GetDlgItem $OrangeHubProgressLog $OrangeHubInstFilesPage 1016
  System::Call 'user32::SetWindowPos(p $OrangeHubInstFilesPage, p 0, i 0, i 0, i 760, i 940, i 0x0024)'
  SetCtlColors $OrangeHubInstFilesPage "${OrangeHubInstallerText}" "${OrangeHubInstallerBackground}"
  SetCtlColors $OrangeHubProgressText "${OrangeHubInstallerText}" "transparent"
  SetCtlColors $OrangeHubProgressBar "${OrangeHubInstallerAccent}" "${OrangeHubInstallerSurface}"
  SendMessage $OrangeHubProgressText ${WM_SETTEXT} 0 "STR:正在安装 OrangeHub..."
  System::Call 'user32::SetWindowPos(p $OrangeHubProgressText, p 0, i 90, i 390, i 580, i 30, i 0x0024)'
  System::Call 'user32::SetWindowPos(p $OrangeHubProgressBar, p 0, i 90, i 440, i 580, i 30, i 0x0024)'
  ShowWindow $OrangeHubProgressLogButton ${SW_HIDE}
  ShowWindow $OrangeHubProgressLog ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1
  System::Call 'user32::SetWindowPos(p $0, p 0, i 90, i 540, i 580, i 52, i 0x0024)'
  SetCtlColors $0 "FFFFFF" "${OrangeHubInstallerAccent}"
  ShowWindow $0 ${SW_SHOW}
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
FunctionEnd

Function OrangeHubFinishCreate
  Call OrangeHubApplyWindowChrome
  nsDialogs::Create 1018
  Pop $OrangeHubDialog
  ${If} $OrangeHubDialog == error
    Abort
  ${EndIf}
  SetCtlColors $OrangeHubDialog "${OrangeHubInstallerText}" "${OrangeHubInstallerBackground}"
  System::Call 'user32::SetWindowPos(p $OrangeHubDialog, p 0, i 0, i 0, i 760, i 940, i 0x0024)'

  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_NOTIFY} 0 0 0 100% 8% ""
  Pop $OrangeHubDragSurface
  SetCtlColors $OrangeHubDragSurface "" "transparent"
  ${NSD_OnClick} $OrangeHubDragSurface OrangeHubDragWindow
  CreateFont $OrangeHubTopBarFont "Microsoft YaHei UI" 11 700
  ${NSD_CreateLabel} 5% 2% 50% 5% "OrangeHub"
  Pop $OrangeHubTopBarControl
  SendMessage $OrangeHubTopBarControl ${WM_SETFONT} $OrangeHubTopBarFont 1
  SetCtlColors $OrangeHubTopBarControl "${OrangeHubInstallerText}" "transparent"
  CreateFont $OrangeHubButtonFont "Microsoft YaHei UI" 11 700
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_CENTER}|${SS_NOTIFY} 0 82% 2% 7% 6% "-"
  Pop $OrangeHubMinimizeButton
  SendMessage $OrangeHubMinimizeButton ${WM_SETFONT} $OrangeHubButtonFont 1
  SetCtlColors $OrangeHubMinimizeButton "${OrangeHubInstallerMuted}" "transparent"
  ${NSD_OnClick} $OrangeHubMinimizeButton OrangeHubMinimize
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_CENTER}|${SS_NOTIFY} 0 90% 2% 7% 6% "x"
  Pop $OrangeHubCloseButton
  SendMessage $OrangeHubCloseButton ${WM_SETFONT} $OrangeHubButtonFont 1
  SetCtlColors $OrangeHubCloseButton "${OrangeHubInstallerMuted}" "transparent"
  ${NSD_OnClick} $OrangeHubCloseButton OrangeHubClose

  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 31% 10% 38% 25% ""
  Pop $OrangeHubLogoSurface
  SetCtlColors $OrangeHubLogoSurface "" "${OrangeHubInstallerAccentSoft}"
  Push $OrangeHubLogoSurface
  Push 288
  Push 235
  Push 118
  Call OrangeHubApplyRoundRegion
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_ICON}|${SS_CENTERIMAGE}|${SS_CENTER} 0 39% 14% 22% 17% ""
  Pop $OrangeHubLogoControl
  System::Call 'shell32::ExtractIcon(i 0, t "$EXEPATH", i 0)i.r0'
  ${If} $0 != 0
    SendMessage $OrangeHubLogoControl ${STM_SETIMAGE} ${IMAGE_ICON} $0
  ${EndIf}

  CreateFont $OrangeHubTitleFont "Microsoft YaHei UI" 15 700
  ${NSD_CreateLabel} 0 39% 100% 5% "$(OrangeHubReady)"
  Pop $OrangeHubHeroTitle
  SendMessage $OrangeHubHeroTitle ${WM_SETFONT} $OrangeHubTitleFont 1
  SetCtlColors $OrangeHubHeroTitle "${OrangeHubInstallerText}" "transparent"
  CreateFont $OrangeHubBodyFont "Microsoft YaHei UI" 10 400
  ${NSD_CreateLabel} 0 45% 100% 5% "$(OrangeHubFinishText)"
  Pop $OrangeHubHeroSubtitle
  SendMessage $OrangeHubHeroSubtitle ${WM_SETFONT} $OrangeHubBodyFont 1
  SetCtlColors $OrangeHubHeroSubtitle "${OrangeHubInstallerMuted}" "transparent"

  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 53% 61% 76% 9% ""
  Pop $OrangeHubInstallButtonSurface
  SetCtlColors $OrangeHubInstallButtonSurface "" "${OrangeHubInstallerAccent}"
  Push $OrangeHubInstallButtonSurface
  Push 578
  Push 74
  Push 30
  Call OrangeHubApplyRoundRegion
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_CENTER}|${SS_NOTIFY} 0 53% 61% 76% 9% "$(OrangeHubOpen)"
  Pop $OrangeHubFinishButton
  SendMessage $OrangeHubFinishButton ${WM_SETFONT} $OrangeHubButtonFont 1
  SetCtlColors $OrangeHubFinishButton "FFFFFF" "${OrangeHubInstallerAccent}"
  Push $OrangeHubFinishButton
  Push 578
  Push 74
  Push 30
  Call OrangeHubApplyRoundRegion
  ${NSD_OnClick} $OrangeHubFinishButton OrangeHubFinishLeave

  ${NSD_CreateTimer} OrangeHubDragTimer 25
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

!macro NSIS_HOOK_POSTINSTALL
  CreateDirectory "$INSTDIR"
  FileOpen $0 "$INSTDIR\orangehub-install-data-directory.txt" w
  FileWrite $0 "$OrangeHubDataDirectory"
  FileClose $0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\orangehub-install-data-directory.txt"
!macroend
