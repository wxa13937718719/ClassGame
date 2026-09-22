param(
    [string]$SubjectId,
    [switch]$ValidateOnly
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Version = "43.2.0"
$RuntimeFile = "electron-v$Version-win32-x64.zip"
$ExpectedSha256 = "EBA5F508AF40ECB364FE258809C79A5234C6ECE5A75C64722772EBA01B02786"
$ExpectedSize = 144326439
$CacheDir = Join-Path $ProjectRoot "_build_cache"
$RuntimeZip = Join-Path $CacheDir $RuntimeFile
$RuntimePart = "$RuntimeZip.part"
$ExtractDir = Join-Path $CacheDir "electron-runtime-$Version"
$ReleaseRoot = Join-Path $ProjectRoot "release"

function Read-Json([string]$Path) { Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | ConvertFrom-Json }
function Resolve-SubjectId {
    if ($SubjectId) { return $SubjectId }
    $defaultPath = Join-Path $ProjectRoot "default-subject.json"
    if (Test-Path $defaultPath) { return (Read-Json $defaultPath).subjectId }
    return "chemistry"
}
function Assert-RelativePath([string]$Value, [string]$Field) {
    if ([string]::IsNullOrWhiteSpace($Value) -or $Value.StartsWith("/") -or $Value -match '^[A-Za-z][A-Za-z0-9+.-]*:' -or $Value.Split("/") -contains "..") { throw "Invalid relative path in ${Field}: $Value" }
}
function Get-Subject([string]$Id) {
    if ($Id -notmatch '^[A-Za-z0-9_-]+$') { throw "Invalid subject ID: $Id" }
    $root = Join-Path $ProjectRoot "subjects\$Id"
    $configPath = Join-Path $root "subject.json"
    if (-not (Test-Path $configPath)) { throw "Subject not found: $Id" }
    $config = Read-Json $configPath
    if ($config.id -ne $Id) { throw "Subject manifest id does not match its directory: $Id" }
    foreach ($key in @("productName", "gameTitle", "editorTitle", "appUserModelId")) { if ([string]::IsNullOrWhiteSpace([string]$config.app.$key)) { throw "Subject is missing app.$key" } }
    if ([string]$config.storageKey -notmatch '^classgame:[A-Za-z0-9_-]+$') { throw "Invalid subject storageKey" }
    $required = @("splashTitle", "enterButton", "homeTitle", "homeDescription", "chapterSectionTitle", "practiceSectionTitle", "chapterMode", "wrongBookTitle", "favoritesTitle")
    foreach ($key in $required) { if ([string]::IsNullOrWhiteSpace([string]$config.labels.$key)) { throw "Subject is missing labels.$key" } }
    foreach ($themeKey in @("primary", "secondary", "ink", "surface", "accent")) { if ([string]$config.theme.$themeKey -notmatch '^#[0-9A-Fa-f]{6}$') { throw "Invalid theme.$themeKey" } }
    Assert-RelativePath $config.assets.background "assets.background"
    Assert-RelativePath $config.assets.icon "assets.icon"
    foreach ($asset in $config.assets.audio.psobject.Properties) { Assert-RelativePath $asset.Value "assets.audio.$($asset.Name)" }
    $manifestPath = Join-Path $root "data\manifest.json"
    if (-not (Test-Path $manifestPath)) { throw "Subject is missing data/manifest.json" }
    $manifest = Read-Json $manifestPath
    if (-not $manifest.chapters) { throw "Subject manifest has no chapters" }
    foreach ($item in $manifest.chapters) {
        if ($item.id -notmatch '^[A-Za-z0-9_-]+$') { throw "Invalid chapter ID: $($item.id)" }
        Assert-RelativePath $item.file "chapter file $($item.id)"
        $chapterPath = Join-Path $root $item.file
        if (-not (Test-Path $chapterPath)) { throw "Missing chapter file: $($item.file)" }
        $chapter = Read-Json $chapterPath
        if ($chapter.id -ne $item.id) { throw "Chapter id mismatch: $($item.id)" }
        if ($null -eq $chapter.questions) { throw "Chapter has no questions array: $($item.id)" }
    }
    return @{ Root = $root; Config = $config; Manifest = $manifest }
}
function Get-SelectedManifest([string]$Id, $subject) {
    $files = @()
    $shared = Get-ChildItem (Join-Path $ProjectRoot "content") -File -Recurse | ForEach-Object { $_.FullName.Substring($ProjectRoot.Length + 1) }
    $files += $shared
    $files += @("main.js", "preload.js", "package.json", "default-subject.json")
    $subjectFiles = Get-ChildItem $subject.Root -File -Recurse | ForEach-Object { $_.FullName.Substring($ProjectRoot.Length + 1) }
    $files += $subjectFiles
    $files | Sort-Object -Unique | ForEach-Object { "$_" }
}
function Test-RuntimeZip([string]$Path) {
    if (-not (Test-Path $Path)) { return $false }
    return ((Get-Item $Path).Length -eq $ExpectedSize -and (Get-FileHash $Path -Algorithm SHA256).Hash.ToUpperInvariant() -eq $ExpectedSha256)
}
function Acquire-Runtime {
    if (Test-RuntimeZip $RuntimeZip) { return }
    New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
    $urls = @(
        "https://npmmirror.com/mirrors/electron/$Version/$RuntimeFile",
        "https://github.com/electron/electron/releases/download/v$Version/$RuntimeFile",
        "https://mirrors.huaweicloud.com/electron/$Version/$RuntimeFile"
    )
    foreach ($url in $urls) {
        Remove-Item -Force -ErrorAction SilentlyContinue $RuntimePart
        try { Invoke-WebRequest -Uri $url -OutFile $RuntimePart -UseBasicParsing -TimeoutSec 600 } catch { continue }
        if (Test-RuntimeZip $RuntimePart) { Move-Item -Force $RuntimePart $RuntimeZip; return }
    }
    throw "Could not download a valid Electron $Version runtime."
}

$selectedId = Resolve-SubjectId
$sharedRequired = @("main.js", "preload.js", "package.json", "default-subject.json", "content\index.html", "content\game.html", "content\editor.html", "content\js\config.js", "content\editor\editor.js")
foreach ($relative in $sharedRequired) { if (-not (Test-Path (Join-Path $ProjectRoot $relative))) { throw "Missing shared application file: $relative" } }
$selected = Get-Subject $selectedId
$manifest = Get-SelectedManifest $selectedId $selected
Write-Host "Selected subject: $selectedId"
Write-Host "Selected files ($($manifest.Count)):`n$($manifest -join "`n")"
if ($ValidateOnly) { exit 0 }

Acquire-Runtime
if (-not (Test-RuntimeZip $RuntimeZip)) { throw "Electron runtime verification failed." }
$appFolderName = "ClassGame_${selectedId}_Teacher_Windows_x64"
$appDir = Join-Path $ReleaseRoot $appFolderName
$appZip = Join-Path $ReleaseRoot "$appFolderName.zip"
if (Test-Path $appDir) { Remove-Item -Recurse -Force $appDir }
New-Item -ItemType Directory -Force -Path $appDir, $ReleaseRoot | Out-Null
$extractTemp = Join-Path $CacheDir "electron-runtime-$Version"
if (Test-Path $extractTemp) { Remove-Item -Recurse -Force $extractTemp }
New-Item -ItemType Directory -Force -Path $extractTemp | Out-Null
Expand-Archive -Path $RuntimeZip -DestinationPath $extractTemp -Force
Copy-Item (Join-Path $extractTemp "*") $appDir -Recurse -Force
$resourcesApp = Join-Path $appDir "resources\app"
New-Item -ItemType Directory -Force -Path $resourcesApp | Out-Null
Copy-Item (Join-Path $ProjectRoot "main.js"), (Join-Path $ProjectRoot "preload.js"), (Join-Path $ProjectRoot "package.json"), (Join-Path $ProjectRoot "default-subject.json") $resourcesApp -Force
Copy-Item (Join-Path $ProjectRoot "default-subject.json") $appDir -Force
Copy-Item (Join-Path $ProjectRoot "content") (Join-Path $appDir "content") -Recurse -Force
Copy-Item $selected.Root (Join-Path $appDir "subjects\$selectedId") -Recurse -Force
New-Item -ItemType Directory -Force -Path (Join-Path $appDir "userdata"), (Join-Path $appDir "editor_userdata"), (Join-Path $appDir "backups") | Out-Null
Rename-Item (Join-Path $appDir "electron.exe") "ClassGame.exe"
Copy-Item (Join-Path $appDir "ClassGame.exe") (Join-Path $appDir "ClassGameEditor.exe") -Force
@("ClassGame portable release", "Subject: $selectedId", "Electron: $Version", "Game: ClassGame.exe", "Editor: ClassGameEditor.exe") | Set-Content -Encoding UTF8 (Join-Path $appDir "BUILD_INFO.txt")
if (Test-Path $appZip) { Remove-Item -Force $appZip }
Compress-Archive -Path $appDir -DestinationPath $appZip -CompressionLevel Optimal
Write-Host "Portable release: $appDir"
Write-Host "Archive: $appZip"
