!include LogicLib.nsh
!include nsDialogs.nsh

; OrangeHub uses the same dark green and orange palette in the installer as in the
; desktop workspace. Tauri includes MUI2 before this hook, so replace its defaults
; before the generated page macros consume them.
!define OrangeHubInstallerBackground "101614"
!define OrangeHubInstallerSurface "18211E"
!define OrangeHubInstallerText "DCE6E2"
!define OrangeHubInstallerMuted "87938D"
!define OrangeHubInstallerAccent "F49A5B"
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
LangString OrangeHubDataDirectoryTitle ${LANG_SIMPCHINESE} "选择本地数据目录"
LangString OrangeHubDataDirectoryTitle ${LANG_ENGLISH} "Choose a local data directory"
LangString OrangeHubDataDirectoryDescription ${LANG_SIMPCHINESE} "连接配置、加密凭据和会话历史将保存在这里。OrangeHub 只会在本机使用这些数据。"
LangString OrangeHubDataDirectoryDescription ${LANG_ENGLISH} "Connection profiles, encrypted credentials, and session history will be stored here. OrangeHub keeps this data on this computer."
LangString OrangeHubDataDirectoryHint ${LANG_SIMPCHINESE} "请使用只有当前用户可以访问的目录，并确保该目录有足够的磁盘空间。"
LangString OrangeHubDataDirectoryHint ${LANG_ENGLISH} "Use a directory that only the intended users can access and make sure it has enough free space."
LangString OrangeHubInstallDirectoryTitle ${LANG_SIMPCHINESE} "安装位置"
LangString OrangeHubInstallDirectoryTitle ${LANG_ENGLISH} "Install location"
LangString OrangeHubInstallDirectoryHint ${LANG_SIMPCHINESE} "OrangeHub 程序文件将安装到此文件夹。"
LangString OrangeHubInstallDirectoryHint ${LANG_ENGLISH} "OrangeHub program files will be installed in this folder."
LangString OrangeHubSetupSubtitle ${LANG_SIMPCHINESE} "选择安装位置和本地数据目录"
LangString OrangeHubSetupSubtitle ${LANG_ENGLISH} "Choose install and local data locations"
LangString OrangeHubBrowse ${LANG_SIMPCHINESE} "浏览..."
LangString OrangeHubBrowse ${LANG_ENGLISH} "Browse..."
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

Function OrangeHubDataDirectoryCreate
  !insertmacro MUI_HEADER_TEXT "$(OrangeHubWelcomeTitle)" "$(OrangeHubSetupSubtitle)"
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
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ; Keep the page itself dark so static labels do not inherit a light Windows
  ; background. Labels use transparent backgrounds to match the app workspace.
  SetCtlColors $0 "" "${OrangeHubInstallerBackground}"
  ${NSD_CreateLabel} 0 0 100% 18u "$(OrangeHubInstallDirectoryTitle)"
  Pop $0
  SetCtlColors $0 "${OrangeHubInstallerAccent}" "transparent"
  ${NSD_CreateLabel} 0 20u 100% 18u "$(OrangeHubInstallDirectoryHint)"
  Pop $0
  SetCtlColors $0 "${OrangeHubInstallerMuted}" "transparent"
  ${NSD_CreateDirRequest} 0 42u 78% 13u "$OrangeHubInstallDirectory"
  Pop $OrangeHubInstallDirectoryControl
  SetCtlColors $OrangeHubInstallDirectoryControl "${OrangeHubInstallerText}" "${OrangeHubInstallerSurface}"
  ${NSD_CreateButton} 81% 42u 19% 13u "$(OrangeHubBrowse)"
  Pop $OrangeHubInstallBrowseControl
  SetCtlColors $OrangeHubInstallBrowseControl "${OrangeHubInstallerText}" "${OrangeHubInstallerSurface}"
  ${NSD_OnClick} $OrangeHubInstallBrowseControl OrangeHubInstallDirectoryBrowse
  ${NSD_CreateLabel} 0 65u 100% 18u "$(OrangeHubDataDirectoryTitle)"
  Pop $0
  SetCtlColors $0 "${OrangeHubInstallerText}" "transparent"
  ${NSD_CreateLabel} 0 85u 100% 28u "$(OrangeHubDataDirectoryDescription)"
  Pop $0
  SetCtlColors $0 "${OrangeHubInstallerMuted}" "transparent"
  ${NSD_CreateDirRequest} 0 117u 78% 13u "$OrangeHubDataDirectory"
  Pop $OrangeHubDataDirectoryControl
  SetCtlColors $OrangeHubDataDirectoryControl "${OrangeHubInstallerText}" "${OrangeHubInstallerSurface}"
  ${NSD_CreateButton} 81% 117u 19% 13u "$(OrangeHubBrowse)"
  Pop $OrangeHubBrowseControl
  SetCtlColors $OrangeHubBrowseControl "${OrangeHubInstallerText}" "${OrangeHubInstallerSurface}"
  ${NSD_OnClick} $OrangeHubBrowseControl OrangeHubDataDirectoryBrowse
  ${NSD_CreateLabel} 0 138u 100% 28u "$(OrangeHubDataDirectoryHint)"
  Pop $0
  SetCtlColors $0 "${OrangeHubInstallerMuted}" "transparent"
  nsDialogs::Show
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
; The first-run onboarding reads this value and uses it before creating the vault.
!macro NSIS_HOOK_POSTINSTALL
  CreateDirectory "$INSTDIR"
  FileOpen $0 "$INSTDIR\orangehub-install-data-directory.txt" w
  FileWrite $0 "$OrangeHubDataDirectory"
  FileClose $0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\orangehub-install-data-directory.txt"
!macroend
