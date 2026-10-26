!include LogicLib.nsh
!include nsDialogs.nsh

!define OH_THEME_SOURCE "${__FILEDIR__}\installer\orangehub-modern"
!define OH_PLUGIN_DIR "${__FILEDIR__}\installer\nsis-duilib-ui\out\build\windows-x86-ninja\Release"
!addplugindir /x86-unicode "${OH_PLUGIN_DIR}"

LangString OHUiLoadFailed ${LANG_SIMPCHINESE} "无法加载 OrangeHub 安装界面。请重新下载安装程序后重试。"
LangString OHUiLoadFailed ${LANG_ENGLISH} "The OrangeHub setup UI could not be loaded. Download the installer again and retry."
LangString OHInstallPathRequired ${LANG_SIMPCHINESE} "请选择有效的安装位置。"
LangString OHInstallPathRequired ${LANG_ENGLISH} "Choose a valid install location."
LangString OHDataPathRequired ${LANG_SIMPCHINESE} "请选择有效的本地数据目录。"
LangString OHDataPathRequired ${LANG_ENGLISH} "Choose a valid local data directory."
LangString OHPathRoot ${LANG_SIMPCHINESE} "数据目录不能是磁盘根目录。"
LangString OHPathRoot ${LANG_ENGLISH} "The data directory cannot be a drive root."
LangString OHPathOverlap ${LANG_SIMPCHINESE} "安装目录与数据目录不能相同或互相包含。"
LangString OHPathOverlap ${LANG_ENGLISH} "The install and data directories cannot overlap."
LangString OHBrowseInstall ${LANG_SIMPCHINESE} "选择 OrangeHub 安装位置"
LangString OHBrowseInstall ${LANG_ENGLISH} "Choose the OrangeHub install location"
LangString OHBrowseData ${LANG_SIMPCHINESE} "选择 OrangeHub 本地数据目录"
LangString OHBrowseData ${LANG_ENGLISH} "Choose the OrangeHub local data folder"
LangString OHUninstallStatus ${LANG_SIMPCHINESE} "正在整理应用文件…"
LangString OHUninstallStatus ${LANG_ENGLISH} "Organizing application files…"

Var OHLocale
Var OHThemePath
Var OHPluginResult
Var OHUiActive
Var OHDataDirectory
Var OHDataPath
Var OHPathsValid
Var OHPathError
Var OrangeHubDeleteDataState
Var OrangeHubCreateShortcutState

Function OHGetLocale
  ${If} $LANGUAGE == ${LANG_SIMPCHINESE}
    StrCpy $OHLocale "zh-CN"
  ${Else}
    StrCpy $OHLocale "en-US"
  ${EndIf}
FunctionEnd

Function un.OHGetLocale
  ${If} $LANGUAGE == ${LANG_SIMPCHINESE}
    StrCpy $OHLocale "zh-CN"
  ${Else}
    StrCpy $OHLocale "en-US"
  ${EndIf}
FunctionEnd

Function OHLoadDataDirectory
  StrCpy $OHDataDirectory ""
  ReadRegStr $OHDataDirectory SHCTX "${MANUPRODUCTKEY}" "DataDirectory"
  ${If} $OHDataDirectory == ""
    IfFileExists "$INSTDIR\orangehub-install-data-directory.txt" 0 oh_data_default
    FileOpen $0 "$INSTDIR\orangehub-install-data-directory.txt" r
    FileRead $0 $OHDataDirectory
    FileClose $0
  ${EndIf}
  oh_data_default:
  ${If} $OHDataDirectory == ""
    StrCpy $OHDataDirectory "$LOCALAPPDATA\OrangeHub\Data"
  ${EndIf}
FunctionEnd

Function un.OHLoadDataDirectory
  StrCpy $OHDataPath ""
  ReadRegStr $OHDataPath SHCTX "${MANUPRODUCTKEY}" "DataDirectory"
  ${If} $OHDataPath == ""
    IfFileExists "$INSTDIR\orangehub-install-data-directory.txt" 0 un_oh_data_done
    FileOpen $0 "$INSTDIR\orangehub-install-data-directory.txt" r
    FileRead $0 $OHDataPath
    FileClose $0
  ${EndIf}
  un_oh_data_done:
  ${If} $OHDataPath != ""
    GetFullPathName $R5 "$OHDataPath"
    StrCpy $OHDataPath $R5
    ${GetRoot} "$OHDataPath" $R4
    ${If} $OHDataPath != $R4
      StrLen $R5 "$OHDataPath"
      IntOp $R5 $R5 - 1
      StrCpy $R6 "$OHDataPath" 1 $R5
      ${If} $R6 == "\"
        StrCpy $OHDataPath "$OHDataPath" $R5
      ${EndIf}
    ${EndIf}
  ${EndIf}
FunctionEnd

Function OHValidatePaths
  StrCpy $OHPathsValid 0
  StrCpy $OHPathError "install"
  ${If} $INSTDIR == ""
    Return
  ${EndIf}
  GetFullPathName $INSTDIR "$INSTDIR"
  ${GetRoot} "$INSTDIR" $R4
  ${If} $INSTDIR == $R4
    Return
  ${EndIf}

  StrCpy $OHPathError "data"
  ${If} $OHDataDirectory == ""
    Return
  ${EndIf}
  GetFullPathName $OHDataDirectory "$OHDataDirectory"
  ${GetRoot} "$OHDataDirectory" $R4
  ${If} $OHDataDirectory == $R4
    StrCpy $OHPathError "root"
    Return
  ${EndIf}

  StrLen $R5 "$OHDataDirectory"
  IntOp $R5 $R5 - 1
  StrCpy $R6 "$OHDataDirectory" 1 $R5
  ${If} $R6 == "\"
    StrCpy $OHDataDirectory "$OHDataDirectory" $R5
  ${EndIf}

  StrCpy $OHPathError "overlap"
  ${StrCase} $R0 "$OHDataDirectory\" "L"
  ${StrCase} $R1 "$INSTDIR\" "L"
  StrLen $R2 $R0
  StrCpy $R3 $R1 $R2
  ${If} $R0 == $R3
    Return
  ${EndIf}
  StrLen $R2 $R1
  StrCpy $R3 $R0 $R2
  ${If} $R1 == $R3
    Return
  ${EndIf}

  StrCpy $OHPathsValid 1
FunctionEnd

Function OHShowPathError
  ${If} $OHPathError == "install"
    MessageBox MB_ICONSTOP "$(OHInstallPathRequired)"
  ${ElseIf} $OHPathError == "data"
    MessageBox MB_ICONSTOP "$(OHDataPathRequired)"
  ${ElseIf} $OHPathError == "root"
    MessageBox MB_ICONSTOP "$(OHPathRoot)"
  ${Else}
    MessageBox MB_ICONSTOP "$(OHPathOverlap)"
  ${EndIf}
FunctionEnd

Function OHPrepareTheme
  InitPluginsDir
  StrCpy $OHThemePath "$PLUGINSDIR\orangehub-modern"
  SetOutPath "$OHThemePath"
  File /r "${OH_THEME_SOURCE}\*.*"
  SetOutPath "$OHThemePath\assets"
  File /oname=orangehub-icon.png "${__FILEDIR__}\icons\StoreLogo.png"
  File /oname=orangehub-installer-hero.bmp "${__FILEDIR__}\icons\orangehub-installer-hero.bmp"
FunctionEnd

Function un.OHPrepareTheme
  InitPluginsDir
  StrCpy $OHThemePath "$PLUGINSDIR\orangehub-modern"
  SetOutPath "$OHThemePath"
  File /r "${OH_THEME_SOURCE}\*.*"
  SetOutPath "$OHThemePath\assets"
  File /oname=orangehub-icon.png "${__FILEDIR__}\icons\StoreLogo.png"
  File /oname=orangehub-installer-hero.bmp "${__FILEDIR__}\icons\orangehub-installer-hero.bmp"
FunctionEnd

Function OHInitializeUI
  Call OHGetLocale
  Call OHPrepareTheme
  nsis-duilib-ui::Init "$OHThemePath" "$OHLocale" "${VERSION}"
  Pop $OHPluginResult
  ${If} $OHPluginResult != "ok"
    nsis-duilib-ui::Shutdown
    Pop $0
    MessageBox MB_ICONSTOP "$(OHUiLoadFailed)"
    Quit
  ${EndIf}

  nsis-duilib-ui::SetPage "welcome"
  Pop $OHPluginResult
  ${If} $OHPluginResult != "ok"
    Goto oh_ui_failed
  ${EndIf}
  nsis-duilib-ui::SetInstallDirectory "$INSTDIR"
  Pop $OHPluginResult
  ${If} $OHPluginResult != "ok"
    Goto oh_ui_failed
  ${EndIf}
  nsis-duilib-ui::SetControlText "data-directory" "$OHDataDirectory"
  Pop $OHPluginResult
  ${If} $OHPluginResult != "ok"
    Goto oh_ui_failed
  ${EndIf}
  nsis-duilib-ui::Show
  Pop $OHPluginResult
  ${If} $OHPluginResult != "ok"
    Goto oh_ui_failed
  ${EndIf}
  StrCpy $OHUiActive 1
  Return

oh_ui_failed:
  nsis-duilib-ui::Shutdown
  Pop $0
  MessageBox MB_ICONSTOP "$(OHUiLoadFailed)"
  Quit
FunctionEnd

Function OrangeHubWelcomeShow
  Call OHLoadDataDirectory
  Call OHInitializeUI

oh_welcome_loop:
  nsis-duilib-ui::WaitForEvent
  Pop $OHPluginResult
  StrCmp $OHPluginResult "primary" oh_welcome_confirm
  StrCmp $OHPluginResult "primary-current" oh_welcome_confirm
  StrCmp $OHPluginResult "primary-all" oh_welcome_confirm
  StrCmp $OHPluginResult "browse" oh_welcome_browse_install
  StrCmp $OHPluginResult "browse-current" oh_welcome_browse_install
  StrCmp $OHPluginResult "browse-all" oh_welcome_browse_install
  StrCmp $OHPluginResult "browse-data" oh_welcome_browse_data
  StrCmp $OHPluginResult "cancel" oh_welcome_cancel
  StrCmp $OHPluginResult "closed" oh_welcome_cancel
  Goto oh_welcome_loop

oh_welcome_browse_install:
  nsDialogs::SelectFolderDialog "$(OHBrowseInstall)" "$INSTDIR"
  Pop $0
  StrCmp $0 "" oh_welcome_loop
  StrCpy $INSTDIR "$0"
  nsis-duilib-ui::SetInstallDirectory "$INSTDIR"
  Pop $OHPluginResult
  Goto oh_welcome_loop

oh_welcome_browse_data:
  nsis-duilib-ui::GetControlText "data-directory"
  Pop $OHDataDirectory
  nsDialogs::SelectFolderDialog "$(OHBrowseData)" "$OHDataDirectory"
  Pop $0
  StrCmp $0 "" oh_welcome_loop
  StrCpy $OHDataDirectory "$0"
  nsis-duilib-ui::SetControlText "data-directory" "$OHDataDirectory"
  Pop $OHPluginResult
  Goto oh_welcome_loop

oh_welcome_confirm:
  System::Call 'user32::PostMessageW(p $HWNDPARENT, i ${WM_COMMAND}, p 1, p 0)'
  Return

oh_welcome_cancel:
  nsis-duilib-ui::ShutdownHidden
  Pop $0
  Quit
FunctionEnd

Function OrangeHubWelcomeLeave
  nsis-duilib-ui::GetControlText "data-directory"
  Pop $OHDataDirectory
  Call OHValidatePaths
  ${If} $OHPathsValid != 1
    Call OHShowPathError
    Abort
  ${EndIf}
  nsis-duilib-ui::GetCheckState "create-shortcut"
  Pop $OrangeHubCreateShortcutState
FunctionEnd

Function OrangeHubInstallProgressShow
  ${If} $OHUiActive != 1
    Return
  ${EndIf}
  nsis-duilib-ui::SetPage "installing"
  Pop $OHPluginResult
  ${If} $OHPluginResult != "ok"
    Goto oh_install_ui_failed
  ${EndIf}
  SetAutoClose true
  Return

oh_install_ui_failed:
  nsis-duilib-ui::Shutdown
  Pop $0
  MessageBox MB_ICONSTOP "$(OHUiLoadFailed)"
  Quit
FunctionEnd

Function OHInstallSuccess
  ${If} $OHUiActive != 1
    Return
  ${EndIf}
  nsis-duilib-ui::SetProgress "100"
  Pop $OHPluginResult
  nsis-duilib-ui::SetPage "finish"
  Pop $OHPluginResult
  ${If} $OHPluginResult != "ok"
    nsis-duilib-ui::ShutdownHidden
    Pop $0
    Quit
  ${EndIf}
  nsis-duilib-ui::WaitForEvent
  Pop $OHPluginResult

  ${If} $OrangeHubCreateShortcutState == "1"
  ${AndIf} $NoShortcutMode != 1
    Call CreateOrUpdateDesktopShortcut
  ${EndIf}

  nsis-duilib-ui::ShutdownHidden
  Pop $0
  StrCmp $OHPluginResult "primary" oh_install_launch
  Quit
oh_install_launch:
  Call RunMainBinary
  Quit
FunctionEnd

Function .onInstFailed
  ${If} $OHUiActive == 1
    nsis-duilib-ui::SetPage "error"
    Pop $OHPluginResult
    nsis-duilib-ui::WaitForEvent
    Pop $OHPluginResult
    nsis-duilib-ui::ShutdownHidden
    Pop $0
  ${EndIf}
FunctionEnd

Function un.OHInitializeUI
  Call un.OHGetLocale
  Call un.OHPrepareTheme
  nsis-duilib-ui::Init "$OHThemePath" "$OHLocale" "${VERSION}"
  Pop $OHPluginResult
  ${If} $OHPluginResult != "ok"
    nsis-duilib-ui::Shutdown
    Pop $0
    MessageBox MB_ICONSTOP "$(OHUiLoadFailed)"
    Quit
  ${EndIf}
  nsis-duilib-ui::SetPage "uninstallWelcome"
  Pop $OHPluginResult
  ${If} $OHPluginResult != "ok"
    Goto un_oh_ui_failed
  ${EndIf}
  nsis-duilib-ui::Show
  Pop $OHPluginResult
  ${If} $OHPluginResult != "ok"
    Goto un_oh_ui_failed
  ${EndIf}
  StrCpy $OHUiActive 1
  Return

un_oh_ui_failed:
  nsis-duilib-ui::Shutdown
  Pop $0
  MessageBox MB_ICONSTOP "$(OHUiLoadFailed)"
  Quit
FunctionEnd

Function un.OHUninstallWelcomeShow
  Call un.OHLoadDataDirectory
  Call un.OHInitializeUI
  StrCpy $OrangeHubDeleteDataState 0

un_oh_welcome_loop:
  nsis-duilib-ui::WaitForEvent
  Pop $OHPluginResult
  StrCmp $OHPluginResult "primary" un_oh_welcome_confirm
  StrCmp $OHPluginResult "cancel" un_oh_welcome_cancel
  StrCmp $OHPluginResult "closed" un_oh_welcome_cancel
  Goto un_oh_welcome_loop

un_oh_welcome_confirm:
  nsis-duilib-ui::GetCheckState "delete-data"
  Pop $OHPluginResult
  StrCmp $OHPluginResult "1" un_oh_welcome_delete_data
  StrCpy $OrangeHubDeleteDataState 0
  System::Call 'user32::PostMessageW(p $HWNDPARENT, i ${WM_COMMAND}, p 1, p 0)'
  Return
un_oh_welcome_delete_data:
  StrCpy $OrangeHubDeleteDataState 1
  System::Call 'user32::PostMessageW(p $HWNDPARENT, i ${WM_COMMAND}, p 1, p 0)'
  Return

un_oh_welcome_cancel:
  nsis-duilib-ui::ShutdownHidden
  Pop $0
  Quit
FunctionEnd

Function un.OHUninstallWelcomeLeave
FunctionEnd

Function un.OHUninstallProgressShow
  ${If} $OHUiActive != 1
    Return
  ${EndIf}
  nsis-duilib-ui::SetPage "uninstalling"
  Pop $OHPluginResult
  ${If} $OHPluginResult != "ok"
    Goto un_oh_progress_ui_failed
  ${EndIf}
  nsis-duilib-ui::SetStatus "$(OHUninstallStatus)"
  Pop $OHPluginResult
  SetAutoClose true
  Return

un_oh_progress_ui_failed:
  nsis-duilib-ui::Shutdown
  Pop $0
  MessageBox MB_ICONSTOP "$(OHUiLoadFailed)"
  Quit
FunctionEnd

Function un.onUninstSuccess
  ${If} $OHUiActive != 1
    Return
  ${EndIf}
  nsis-duilib-ui::SetProgress "100"
  Pop $OHPluginResult
  nsis-duilib-ui::SetPage "uninstallFinish"
  Pop $OHPluginResult
  ${If} $OHPluginResult != "ok"
    nsis-duilib-ui::ShutdownHidden
    Pop $0
    Quit
  ${EndIf}
  nsis-duilib-ui::WaitForEvent
  Pop $OHPluginResult
  nsis-duilib-ui::ShutdownHidden
  Pop $0
  Quit
FunctionEnd

Function un.onUninstFailed
  ${If} $OHUiActive == 1
    nsis-duilib-ui::SetPage "uninstallError"
    Pop $OHPluginResult
    nsis-duilib-ui::WaitForEvent
    Pop $OHPluginResult
    nsis-duilib-ui::ShutdownHidden
    Pop $0
  ${EndIf}
FunctionEnd

!macro NSIS_HOOK_POSTINSTALL
  ${If} $OHDataDirectory == ""
    Call OHLoadDataDirectory
  ${EndIf}
  CreateDirectory "$OHDataDirectory"
  CreateDirectory "$INSTDIR"
  FileOpen $0 "$INSTDIR\orangehub-install-data-directory.txt" w
  FileWrite $0 "$OHDataDirectory"
  FileClose $0
  WriteRegStr SHCTX "${MANUPRODUCTKEY}" "DataDirectory" "$OHDataDirectory"
!macroend
