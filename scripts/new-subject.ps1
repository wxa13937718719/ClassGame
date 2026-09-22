param(
    [Parameter(Mandatory = $true)][string]$Id,
    [Parameter(Mandatory = $true)][string]$Name
)
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$subjectsRoot = Join-Path $repoRoot "app\subjects"
if ($Id -notmatch '^[A-Za-z0-9_-]+$') { throw "Invalid subject ID '$Id'. Use ASCII letters, digits, underscore, or hyphen." }
if ($Id -eq "_template") { throw "The _template subject is reserved." }
if ([string]::IsNullOrWhiteSpace($Name)) { throw "Subject name cannot be empty." }

$target = Join-Path $subjectsRoot $Id
if (Test-Path $target) { throw "Subject already exists: $Id" }
$template = Join-Path $subjectsRoot "_template"
if (-not (Test-Path (Join-Path $template "subject.json"))) { throw "Template subject is incomplete." }

New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item (Join-Path $template "data") (Join-Path $target "data") -Recurse -Force
Copy-Item (Join-Path $template "static") (Join-Path $target "static") -Recurse -Force

$config = Get-Content -Raw -Encoding UTF8 (Join-Path $template "subject.json") | ConvertFrom-Json
$config.id = $Id
$config.name = $Name
$config.app.productName = "ClassGame $Name"
$config.app.gameTitle = "$Name Quiz"
$config.app.editorTitle = "ClassGame $Name Editor"
$config.app.appUserModelId = "ClassGame.$Id"
$config.labels.splashTitle = "$Name Quiz"
$config.labels.homeTitle = "$Name Learning Hall"
$config.storageKey = "classgame:$Id"
$config | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 (Join-Path $target "subject.json")

Write-Host "Created subject '$Id' ($Name)." -ForegroundColor Green
Write-Host "Edit next: $target\subject.json"
Write-Host "Add questions: $target\data\chapters\chapter_001\chapter.json"
Write-Host "Add owned media under: $target\static"
Write-Host "Validate with: powershell -ExecutionPolicy Bypass -File .\scripts\validate-project.ps1 -SubjectId $Id"
