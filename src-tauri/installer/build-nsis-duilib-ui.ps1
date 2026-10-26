$ErrorActionPreference = "Stop"

$pluginRoot = Join-Path $PSScriptRoot "nsis-duilib-ui"
$sourceDir = Join-Path $env:TEMP "orangehub-nsis-duilib-ui-source"
$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
$vsPath = & $vswhere -latest -products "*" -property installationPath
if (-not $vsPath) {
  throw "Visual Studio Build Tools were not found. Install the MSVC C++ toolset."
}

$vcRoot = Join-Path $vsPath "VC\Tools\MSVC"
$toolset = Get-ChildItem -LiteralPath $vcRoot -Directory |
  Sort-Object { [version]($_.Name -replace '^14\.', '14.') } -Descending |
  Where-Object {
    (Test-Path (Join-Path $_.FullName "bin\Hostx64\x86\cl.exe")) -and
    (Test-Path (Join-Path $_.FullName "include\vector")) -and
    (Test-Path (Join-Path $_.FullName "lib\x86\libcmt.lib"))
  } |
  Select-Object -First 1
if (-not $toolset) {
  throw "An x86 MSVC compiler was not found under $vcRoot."
}

$kitRoot = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10"
$sdk = Get-ChildItem -LiteralPath (Join-Path $kitRoot "Include") -Directory |
  Where-Object { Test-Path (Join-Path $_.FullName "um\Windows.h") } |
  Sort-Object { [version]$_.Name } -Descending |
  Select-Object -First 1
if (-not $sdk) {
  throw "A Windows 10 SDK was not found."
}

$devCmd = Join-Path $vsPath "Common7\Tools\VsDevCmd.bat"
$toolsetVersion = $toolset.Name.Substring(0, 5)
$environmentLines = & cmd.exe /d /s /c `
  "`"$devCmd`" -no_logo -arch=x86 -host_arch=x64 -vcvars_ver=$toolsetVersion >nul && set"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to initialize the Visual Studio x86 build environment."
}
foreach ($line in $environmentLines) {
  $separator = $line.IndexOf("=")
  if ($separator -gt 0) {
    $name = $line.Substring(0, $separator)
    [Environment]::SetEnvironmentVariable($name, $line.Substring($separator + 1), "Process")
  }
}

$buildDir = Join-Path $env:TEMP "orangehub-nsis-duilib-ui-windows-x86-staged"
$outputDir = Join-Path $pluginRoot "out\build\windows-x86-ninja\Release"
$patchFile = Join-Path $PSScriptRoot "nsis-duilib-ui.patch"
$copyOutput = & robocopy.exe $pluginRoot $sourceDir /E /XD out .git /XF .git /NFL /NDL /NJH /NJS /NC /NS
if ($LASTEXITCODE -ge 8) {
  throw "Failed to stage the DuiLib source files."
}

& git -C $sourceDir apply --check $patchFile
if ($LASTEXITCODE -eq 0) {
  & git -C $sourceDir apply $patchFile
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to apply the OrangeHub DuiLib integration patch."
  }
} else {
  & git -C $sourceDir apply --reverse --check $patchFile
  if ($LASTEXITCODE -ne 0) {
    throw "The DuiLib source does not match the expected OrangeHub integration patch."
  }
}

& cmake -S $sourceDir -B $buildDir -G "NMake Makefiles" `
  -DCMAKE_BUILD_TYPE=Release `
  -DCMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY `
  -DCMAKE_CXX_COMPILER=cl `
  -DNSIS_DUILIB_UI_BUILD_TESTS=OFF `
  -DNSIS_DUILIB_UI_BUILD_PREVIEW=ON `
  -DNSIS_DUILIB_UI_BUILD_PLUGIN=ON
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& cmake --build $buildDir --config Release --target nsis-duilib-ui ThemePreview
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $buildDir "nsis-duilib-ui.dll") -Destination $outputDir -Force
Copy-Item -LiteralPath (Join-Path $buildDir "ThemePreview.exe") -Destination $outputDir -Force
