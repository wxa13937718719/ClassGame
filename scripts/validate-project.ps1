param([string]$SubjectId)
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $repoRoot "app"
$subjectsRoot = Join-Path $appRoot "subjects"
$errors = [System.Collections.Generic.List[string]]::new()
$reports = [System.Collections.Generic.List[string]]::new()
$storageKeys = @{}

function Add-Error([string]$Message) { $errors.Add($Message) }
function Read-Json([string]$Path) {
    try { return (Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | ConvertFrom-Json) }
    catch { Add-Error "Invalid JSON: $Path ($($_.Exception.Message))"; return $null }
}
function Assert-Relative([string]$Value, [string]$Field) {
    if ([string]::IsNullOrWhiteSpace($Value) -or $Value.StartsWith("/") -or $Value -match '^[A-Za-z][A-Za-z0-9+.-]*:' -or $Value.Split("/") -contains "..") {
        Add-Error "Invalid asset path in ${Field}: $Value"
        return $false
    }
    return $true
}
function Validate-Subject([string]$Id) {
    $root = Join-Path $subjectsRoot $Id
    $configPath = Join-Path $root "subject.json"
    if (-not (Test-Path $configPath)) { Add-Error "Missing subject config: $Id"; return }
    $config = Read-Json $configPath
    if (-not $config) { return }
    if ($config.id -ne $Id -or $Id -notmatch '^[A-Za-z0-9_-]+$') { Add-Error "Subject id mismatch or invalid: $Id" }
    foreach ($key in @("locale", "name", "storageKey")) { if ([string]::IsNullOrWhiteSpace([string]$config.$key)) { Add-Error "Missing ${Id}.${key}" } }
    if ($config.storageKey -notmatch '^classgame:[A-Za-z0-9_-]+$') { Add-Error "Invalid ${Id}.storageKey" }
    if ($storageKeys.ContainsKey([string]$config.storageKey)) { Add-Error "Duplicate storageKey for $Id and $($storageKeys[[string]$config.storageKey]): $($config.storageKey)" } else { $storageKeys[[string]$config.storageKey] = $Id }
    foreach ($key in @("productName", "gameTitle", "editorTitle", "appUserModelId")) { if ([string]::IsNullOrWhiteSpace([string]$config.app.$key)) { Add-Error "Missing ${Id}.app.${key}" } }
    foreach ($key in @("splashTitle", "enterButton", "homeTitle", "homeDescription", "chapterSectionTitle", "practiceSectionTitle", "chapterMode", "wrongBookTitle", "favoritesTitle")) { if ([string]::IsNullOrWhiteSpace([string]$config.labels.$key)) { Add-Error "Missing ${Id}.labels.${key}" } }
    foreach ($key in @("primary", "secondary", "ink", "surface", "accent")) { if ([string]$config.theme.$key -notmatch '^#[0-9A-Fa-f]{6}$') { Add-Error "Invalid ${Id}.theme.${key}" } }
    $null = Assert-Relative $config.assets.background "${Id}.assets.background"
    $null = Assert-Relative $config.assets.icon "${Id}.assets.icon"
    foreach ($asset in $config.assets.audio.psobject.Properties) { $null = Assert-Relative $asset.Value "${Id}.assets.audio.$($asset.Name)" }
    foreach ($asset in @($config.assets.background, $config.assets.icon) + @($config.assets.audio.psobject.Properties | ForEach-Object Value)) { if (-not (Test-Path (Join-Path $root $asset))) { Add-Error "Missing asset for ${Id}: $asset" } }
    $manifestPath = Join-Path $root "data\manifest.json"
    $manifest = Read-Json $manifestPath
    if (-not $manifest -or -not $manifest.chapters) { return }
    $chapterIds = [System.Collections.Generic.HashSet[string]]::new()
    $questionCount = 0
    foreach ($item in @($manifest.chapters)) {
        if (-not $chapterIds.Add([string]$item.id)) { Add-Error "Duplicate chapter id in ${Id}: $($item.id)" }
        if ($item.id -notmatch '^[A-Za-z0-9_-]+$') { Add-Error "Invalid chapter id in ${Id}: $($item.id)" }
        if (-not (Assert-Relative $item.file "${Id} chapter $($item.id)")) { continue }
        $chapterPath = Join-Path $root $item.file
        $chapter = Read-Json $chapterPath
        if (-not $chapter) { continue }
        if ($chapter.id -ne $item.id) { Add-Error "Chapter id mismatch in ${Id}: $($item.id)" }
        $questionIds = [System.Collections.Generic.HashSet[string]]::new()
        foreach ($question in @($chapter.questions)) {
            $questionCount++
            if (-not $questionIds.Add([string]$question.id)) { Add-Error "Duplicate question id in ${Id}/$($item.id): $($question.id)" }
            if ($question.id -notmatch '^[A-Za-z0-9_-]+$') { Add-Error "Invalid question id in ${Id}/$($item.id): $($question.id)" }
            if ([string]::IsNullOrWhiteSpace([string]$question.text)) { Add-Error "Question missing text in ${Id}/$($item.id): $($question.id)" }
            if (@("single", "multiple", "fill") -notcontains $question.type) { Add-Error "Unsupported question type in ${Id}/$($item.id): $($question.id)"; continue }
            if ($question.type -eq "fill") {
                if (-not @($question.answers | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }).Count) { Add-Error "Fill question has no answers in ${Id}: $($question.id)" }
            } else {
                $options = @($question.options)
                $optionIds = @($options | ForEach-Object id)
                if ($options.Count -lt 2 -or $optionIds.Count -ne (@($optionIds | Select-Object -Unique)).Count) { Add-Error "Invalid options in ${Id}: $($question.id)" }
                foreach ($option in $options) { if ([string]::IsNullOrWhiteSpace([string]$option.content) -and [string]::IsNullOrWhiteSpace([string]$option.image)) { Add-Error "Empty option in ${Id}: $($question.id)" } }
                if ($question.type -eq "single" -and $optionIds -notcontains $question.answerId) { Add-Error "Invalid single answer in ${Id}: $($question.id)" }
                if ($question.type -eq "multiple" -and (-not @($question.answerIds).Count -or @($question.answerIds | Where-Object { $optionIds -notcontains $_ }).Count)) { Add-Error "Invalid multiple answer in ${Id}: $($question.id)" }
            }
            foreach ($image in @($question.image) + @($question.options | ForEach-Object image)) { if ($image -and (Assert-Relative $image "${Id} question $($question.id)")) { if (-not (Test-Path (Join-Path $root $image))) { Add-Error "Missing question image in ${Id}: $image" } } }
        }
    }
    $reports.Add("${Id}: chapters=$(@($manifest.chapters).Count); questions=$questionCount")
}

$subjectIds = if ($SubjectId) { @($SubjectId) } else { @(Get-ChildItem $subjectsRoot -Directory | Where-Object Name -ne "_template" | ForEach-Object Name) }
if (-not $subjectIds.Count) { Add-Error "No subjects found." }
foreach ($id in $subjectIds) { Validate-Subject $id }

$jsFiles = @(Get-ChildItem $appRoot, (Join-Path $repoRoot "examples") -Recurse -File -Filter *.js)
foreach ($file in $jsFiles) { node --check $file.FullName *> $null; if ($LASTEXITCODE -ne 0) { Add-Error "JavaScript syntax failure: $($file.FullName)" } }
$required = @("main.js", "preload.js", "package.json", "default-subject.json", "content/index.html", "content/game.html", "content/editor.html", "content/js/config.js", "content/editor/editor.js", "subjects/_template/subject.json", "subjects/_template/data/manifest.json", "tools/build-portable.ps1")
foreach ($file in $required) { if (-not (Test-Path (Join-Path $appRoot $file))) { Add-Error "Missing required app file: $file" } }
if ($errors.Count) { Write-Error (($errors | Select-Object -First 20) -join [Environment]::NewLine); exit 1 }
Write-Host "ClassGame validation passed." -ForegroundColor Green
$reports | ForEach-Object { Write-Host $_ }
Write-Host "JavaScript files checked: $($jsFiles.Count)"
