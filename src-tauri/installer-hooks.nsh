!include LogicLib.nsh
!include nsDialogs.nsh

; OrangeHub uses the same dark green and orange palette in the installer as in the
; desktop workspace. Tauri includes MUI2 before this hook, so replace its defaults
; before the generated page macros consume them.
!define OrangeHubInstallerBackground "101614"
!define OrangeHubInstallerSurface "18211E"
!define OrangeHubInstallerText "DCE6E2"
!define OrangeHubInstallerMuted "87938D"
!undef MUI_BGCOLOR
!define MUI_BGCOLOR "${OrangeHubInstallerBackground}"
!undef MUI_TEXTCOLOR
!define MUI_TEXTCOLOR "${OrangeHubInstallerText}"

; Keep the installer page copy aligned with the selected NSIS language.
LangString OrangeHubWelcomeTitle ${LANG_SIMPCHINESE} "欢迎使用 OrangeHub"
LangString OrangeHubWelcomeTitle ${LANG_ENGLISH} "Welcome to OrangeHub"
LangString OrangeHubWelcomeText ${LANG_SIMPCHINESE} "OrangeHub 将 SSH、文件传输、数据库和 Docker 工作区放在一个桌面工具中。\r\n\r\n安装完成后即可开始配置你的连接。"
LangString OrangeHubWelcomeText ${LANG_ENGLISH} "OrangeHub brings SSH, file transfer, database, and Docker workspaces into one desktop tool.\r\n\r\nAfter installation, you can start configuring your connections."
LangString OrangeHubFinishTitle ${LANG_SIMPCHINESE} "OrangeHub 已安装"
LangString OrangeHubFinishTitle ${LANG_ENGLISH} "OrangeHub is installed"
LangString OrangeHubFinishText ${LANG_SIMPCHINESE} "OrangeHub 已准备就绪。点击完成启动应用，开始管理你的远程连接和数据工作区。"
LangString OrangeHubFinishText ${LANG_ENGLISH} "OrangeHub is ready. Click Finish to start the app and manage your remote connections and data workspaces."
LangString OrangeHubDataDirectoryLabel ${LANG_SIMPCHINESE} "选择 OrangeHub 本地数据目录。连接配置、加密凭据和会话历史将保存到这里："
LangString OrangeHubDataDirectoryLabel ${LANG_ENGLISH} "Choose the local OrangeHub data directory. Connection profiles, encrypted credentials, and session history will be stored here:"
LangString OrangeHubDataDirectoryHint ${LANG_SIMPCHINESE} "请使用只有当前用户可以访问的目录，并确保该目录有足够的磁盘空间。"
LangString OrangeHubDataDirectoryHint ${LANG_ENGLISH} "Use a directory that only the intended users can access and make sure it has enough free space."
LangString OrangeHubBrowse ${LANG_SIMPCHINESE} "浏览..."
LangString OrangeHubBrowse ${LANG_ENGLISH} "Browse..."
LangString OrangeHubDataDirectoryRequired ${LANG_SIMPCHINESE} "请选择 OrangeHub 本地数据目录。"
LangString OrangeHubDataDirectoryRequired ${LANG_ENGLISH} "Please choose a local OrangeHub data directory."

!define MUI_WELCOMEPAGE_TITLE "$(OrangeHubWelcomeTitle)"
!define MUI_WELCOMEPAGE_TEXT "$(OrangeHubWelcomeText)"
!define MUI_FINISHPAGE_TITLE "$(OrangeHubFinishTitle)"
!define MUI_FINISHPAGE_TEXT "$(OrangeHubFinishText)"

Var OrangeHubDataDirectory
Var OrangeHubDataDirectoryControl
Var OrangeHubBrowseControl

Function OrangeHubDataDirectoryCreate
  ${If} $OrangeHubDataDirectory == ""
    StrCpy $OrangeHubDataDirectory "$LOCALAPPDATA\OrangeHub\Data"
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 28u "$(OrangeHubDataDirectoryLabel)"
  Pop $0
  SetCtlColors $0 "${OrangeHubInstallerText}" "${OrangeHubInstallerBackground}"
  ${NSD_CreateDirRequest} 0 35u 78% 13u "$OrangeHubDataDirectory"
  Pop $OrangeHubDataDirectoryControl
  SetCtlColors $OrangeHubDataDirectoryControl "${OrangeHubInstallerText}" "${OrangeHubInstallerSurface}"
  ${NSD_CreateButton} 81% 35u 19% 13u "$(OrangeHubBrowse)"
  Pop $OrangeHubBrowseControl
  SetCtlColors $OrangeHubBrowseControl "${OrangeHubInstallerText}" "${OrangeHubInstallerSurface}"
  ${NSD_OnClick} $OrangeHubBrowseControl OrangeHubDataDirectoryBrowse
  ${NSD_CreateLabel} 0 56u 100% 30u "$(OrangeHubDataDirectoryHint)"
  Pop $0
  SetCtlColors $0 "${OrangeHubInstallerMuted}" "${OrangeHubInstallerBackground}"
  nsDialogs::Show
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
  ${NSD_GetText} $OrangeHubDataDirectoryControl $0
  StrCpy $OrangeHubDataDirectory $0
  ${If} $OrangeHubDataDirectory == ""
    MessageBox MB_ICONSTOP "$(OrangeHubDataDirectoryRequired)"
    Abort
  ${EndIf}
FunctionEnd

; The data directory is selected during installation and written beside the app.
; The first-run onboarding reads this value and uses it before creating the vault.
Page custom OrangeHubDataDirectoryCreate OrangeHubDataDirectoryLeave

!macro NSIS_HOOK_POSTINSTALL
  CreateDirectory "$INSTDIR"
  FileOpen $0 "$INSTDIR\orangehub-install-data-directory.txt" w
  FileWrite $0 "$OrangeHubDataDirectory"
  FileClose $0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\orangehub-install-data-directory.txt"
!macroend
