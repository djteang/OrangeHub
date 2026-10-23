!include LogicLib.nsh
!include nsDialogs.nsh

Var OrangeHubDataDirectory
Var OrangeHubDataDirectoryControl

Function OrangeHubDataDirectoryCreate
  ${If} $OrangeHubDataDirectory == ""
    StrCpy $OrangeHubDataDirectory "$LOCALAPPDATA\OrangeHub\Data"
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 28u "选择 OrangeHub 本地数据目录。连接配置、加密凭据和会话历史将保存到这里："
  Pop $0
  ${NSD_CreateDirRequest} 0 35u 78% 13u "$OrangeHubDataDirectory"
  Pop $OrangeHubDataDirectoryControl
  ${NSD_CreateButton} 81% 35u 19% 13u "浏览..."
  Pop $0
  ${NSD_OnClick} $0 OrangeHubDataDirectoryBrowse
  ${NSD_CreateLabel} 0 56u 100% 30u "请使用只有当前用户可以访问的目录，并确保该目录有足够的磁盘空间。"
  Pop $0
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
    MessageBox MB_ICONSTOP "请选择 OrangeHub 本地数据目录。"
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
