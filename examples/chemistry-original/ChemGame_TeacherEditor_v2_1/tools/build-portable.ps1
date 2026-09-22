$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Version = "43.2.0"
$RuntimeFile = "electron-v$Version-win32-x64.zip"
$ExpectedSha256 = "EBA5F5088AF40ECB364FE258809C79A5234C6ECE5A75C64722772EBA01B02786"
$ExpectedSize = 144326439
$CacheDir = Join-Path $ProjectRoot "_build_cache"
$RuntimeZip = Join-Path $CacheDir $RuntimeFile
$RuntimePart = "$RuntimeZip.part"
$ExtractDir = Join-Path $CacheDir "electron-runtime-$Version"
$ReleaseRoot = Join-Path $ProjectRoot "release"
$AppFolderName = "ChemGame_Teacher_Windows_x64"
$AppDir = Join-Path $ReleaseRoot $AppFolderName
$AppZip = Join-Path $ReleaseRoot "$AppFolderName.zip"

function Write-Step([string]$Text) {
    Write-Host "`n==> $Text" -ForegroundColor Cyan
}

function Test-RuntimeZip([string]$Path) {
    if (-not (Test-Path $Path)) { return $false }
    try {
        $Size = (Get-Item $Path).Length
        Write-Host "Downloaded size: $Size bytes"
        if ($Size -ne $ExpectedSize) {
            Write-Warning "File size is not the official size ($ExpectedSize bytes)."
            return $false
        }
        $Hash = (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToUpperInvariant()
        Write-Host "SHA-256: $Hash"
        return ($Hash -eq $ExpectedSha256)
    } catch {
        Write-Warning $_.Exception.Message
        return $false
    }
}

function Download-WithCurl([string]$Url, [string]$Destination) {
    Write-Host "Source: $Url" -ForegroundColor Yellow
    Remove-Item -Force -ErrorAction SilentlyContinue $Destination
    & curl.exe -L --fail --progress-bar --retry 2 --retry-delay 2 --connect-timeout 15 --max-time 600 -o $Destination $Url
    return ($LASTEXITCODE -eq 0 -and (Test-Path $Destination))
}

function Download-WithIwr([string]$Url, [string]$Destination) {
    Write-Host "Source: $Url" -ForegroundColor Yellow
    Remove-Item -Force -ErrorAction SilentlyContinue $Destination
    try {
        Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing -TimeoutSec 180
        return (Test-Path $Destination)
    } catch {
        Write-Warning $_.Exception.Message
        return $false
    }
}

function Acquire-Runtime {
    if (Test-Path $RuntimeZip) {
        Write-Host "Found cached runtime: $RuntimeZip"
        if (Test-RuntimeZip $RuntimeZip) {
            Write-Host "Cached runtime is valid." -ForegroundColor Green
            return
        }
        Write-Warning "Cached runtime is invalid and will be removed."
        Remove-Item -Force -ErrorAction SilentlyContinue $RuntimeZip
    }

    Write-Step "Downloading Electron $Version Windows x64 runtime (~137.6 MB)"
    Write-Host "A progress bar should appear below. Download time depends on your network."

    $Urls = @(
        "https://npmmirror.com/mirrors/electron/$Version/$RuntimeFile",
        "https://github.com/electron/electron/releases/download/v$Version/$RuntimeFile",
        "https://mirrors.huaweicloud.com/electron/$Version/$RuntimeFile"
    )

    $HasCurl = [bool](Get-Command curl.exe -ErrorAction SilentlyContinue)
    foreach ($Url in $Urls) {
        Write-Host "`nTrying download source..." -ForegroundColor Cyan
        $Ok = if ($HasCurl) { Download-WithCurl $Url $RuntimePart } else { Download-WithIwr $Url $RuntimePart }
        if (-not $Ok) {
            Write-Warning "Download failed from this source; trying the next source."
            continue
        }

        Write-Host "Verifying downloaded file..."
        if (Test-RuntimeZip $RuntimePart) {
            Move-Item -Force $RuntimePart $RuntimeZip
            Write-Host "Electron runtime downloaded and verified successfully." -ForegroundColor Green
            return
        }

        Write-Warning "Downloaded file did not match the official Electron runtime. Trying the next source."
        Remove-Item -Force -ErrorAction SilentlyContinue $RuntimePart
    }

    throw "Could not download a valid Electron runtime. You can manually download $RuntimeFile and put it in _build_cache, then run BUILD.cmd again."
}

Write-Step "Checking project files"
$Required = @(
    "main.js", "preload.js", "package.json",
    "content\index.html", "content\game.html", "content\editor.html",
    "content\data\manifest.json",
    "content\data\chapters\01_intro\chapter.json",
    "content\data\chapters\02_change\chapter.json",
    "content\js\data-loader.js", "content\js\app.js", "content\js\game.js",
    "content\js\storage.js", "content\js\audio.js", "content\js\effects.js", "content\js\validator.js",
    "content\editor\editor.js", "content\editor\editor.css"
)
foreach ($Relative in $Required) {
    if (-not (Test-Path (Join-Path $ProjectRoot $Relative))) { throw "Missing project file: $Relative" }
}
Write-Host "Project files OK." -ForegroundColor Green

New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
New-Item -ItemType Directory -Force -Path $ReleaseRoot | Out-Null
Remove-Item -Force -ErrorAction SilentlyContinue $RuntimePart

Acquire-Runtime

Write-Step "Final Electron runtime verification"
if (-not (Test-RuntimeZip $RuntimeZip)) {
    Remove-Item -Force -ErrorAction SilentlyContinue $RuntimeZip
    throw "Electron runtime verification failed."
}
Write-Host "SHA-256 OK." -ForegroundColor Green

Write-Step "Extracting Electron runtime"
Write-Host "This can take a minute or two."
if (Test-Path $ExtractDir) { Remove-Item -Recurse -Force $ExtractDir }
New-Item -ItemType Directory -Force -Path $ExtractDir | Out-Null
Expand-Archive -Path $RuntimeZip -DestinationPath $ExtractDir -Force
if (-not (Test-Path (Join-Path $ExtractDir "electron.exe"))) { throw "electron.exe not found after extraction." }
Write-Host "Runtime extraction complete." -ForegroundColor Green

Write-Step "Assembling shared game + editor portable folder"
if (Test-Path $AppDir) { Remove-Item -Recurse -Force $AppDir }
New-Item -ItemType Directory -Force -Path $AppDir | Out-Null
Copy-Item -Path (Join-Path $ExtractDir "*") -Destination $AppDir -Recurse -Force

$ResourcesDir = Join-Path $AppDir "resources"
$DefaultAsar = Join-Path $ResourcesDir "default_app.asar"
if (Test-Path $DefaultAsar) { Remove-Item -Force $DefaultAsar }
$ResourcesApp = Join-Path $ResourcesDir "app"
if (Test-Path $ResourcesApp) { Remove-Item -Recurse -Force $ResourcesApp }
New-Item -ItemType Directory -Force -Path $ResourcesApp | Out-Null
Copy-Item (Join-Path $ProjectRoot "main.js") $ResourcesApp -Force
Copy-Item (Join-Path $ProjectRoot "preload.js") $ResourcesApp -Force
Copy-Item (Join-Path $ProjectRoot "package.json") $ResourcesApp -Force

Copy-Item (Join-Path $ProjectRoot "content") (Join-Path $AppDir "content") -Recurse -Force
New-Item -ItemType Directory -Force -Path (Join-Path $AppDir "userdata") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $AppDir "editor_userdata") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $AppDir "backups") | Out-Null
Set-Content -Path (Join-Path $AppDir "userdata\DO_NOT_DELETE.txt") -Encoding UTF8 -Value "ChemGame learning records are stored in this folder."
Set-Content -Path (Join-Path $AppDir "backups\README.txt") -Encoding UTF8 -Value "ChemGameEditor automatically keeps up to 20 question-bank backups here."

$ElectronExe = Join-Path $AppDir "electron.exe"
$GameExe = Join-Path $AppDir "ChemGame.exe"
$EditorExe = Join-Path $AppDir "ChemGameEditor.exe"
Rename-Item -Path $ElectronExe -NewName "ChemGame.exe"

$LauncherCode = @"
using System;
using System.Diagnostics;
using System.IO;
public static class ChemGameEditorLauncher {
    [STAThread]
    public static void Main() {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string exe = Path.Combine(root, "ChemGame.exe");
        var psi = new ProcessStartInfo();
        psi.FileName = exe;
        psi.Arguments = "--editor";
        psi.WorkingDirectory = root;
        psi.UseShellExecute = true;
        Process.Start(psi);
    }
}
"@
try {
    Add-Type -TypeDefinition $LauncherCode -OutputAssembly $EditorExe -OutputType WindowsApplication
} catch {
    Write-Warning "Could not compile the tiny editor launcher; falling back to a second Electron executable copy."
    Copy-Item $GameExe $EditorExe -Force
}

$ReadmeSource = Join-Path $ProjectRoot "TEACHER_README_CN.txt"
if (Test-Path $ReadmeSource) { Copy-Item $ReadmeSource (Join-Path $AppDir "README_CN.txt") -Force }

$BuildInfo = @"
ChemGame Teacher Portable Edition
Build time: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Electron: $Version
Platform: Windows x64

Game: ChemGame.exe
Editor: ChemGameEditor.exe
Question data: content\data\manifest.json + content\data\chapters
Learning records: userdata
Editor backups: backups
"@
Set-Content -Path (Join-Path $AppDir "BUILD_INFO.txt") -Encoding UTF8 -Value $BuildInfo
Write-Host "Portable folder assembled." -ForegroundColor Green

Write-Step "Creating final ZIP"
Write-Host "Compressing the Electron runtime can take several minutes. Please wait until 'Done' appears."
if (Test-Path $AppZip) { Remove-Item -Force $AppZip }
Compress-Archive -Path $AppDir -DestinationPath $AppZip -CompressionLevel Optimal

Write-Step "Done"
Write-Host "Portable folder: $AppDir" -ForegroundColor Green
Write-Host "Game EXE: $GameExe" -ForegroundColor Green
Write-Host "Editor EXE: $EditorExe" -ForegroundColor Green
Write-Host "Final ZIP: $AppZip" -ForegroundColor Green
