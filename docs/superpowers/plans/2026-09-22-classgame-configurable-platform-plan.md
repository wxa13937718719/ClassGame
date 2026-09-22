# Configurable ClassGame Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Transform the two supplied Electron ZIP projects into a public ClassGame repository with one configuration-driven app, reusable subject profiles, preserved Chemistry and Chinese examples, and verified Windows packaging instructions.

**Architecture:** app/ contains one shared Electron shell and renderer UI. app/subjects/<id>/ contains only a subject configuration, question data, and subject assets; the Electron process serves shared UI routes separately from the selected subject root. The original extracted projects remain under examples/, while the original ZIP files move unchanged into archives/.

**Tech Stack:** Electron 43.2.0 portable runtime, vanilla HTML/CSS/JavaScript, Node.js syntax checks, PowerShell 5+/7 scripts, JSON configuration, Git.

**Spec:** docs/superpowers/specs/2026-09-22-classgame-configurable-platform-design.md

## Global Constraints

- Keep Electron pinned to 43.2.0, expected size 144326439, and SHA-256 EBA5F508AF40ECB364FE258809C79A5234C6ECE5A75C64722772EBA01B02786.
- Preserve the original ZIP files byte-for-byte under archives/; do not delete them.
- Do not commit _build_cache/*.zip, release/, runtime userdata/, editor_userdata/, backups/, *.log, or node_modules/.
- Keep the existing question model and single-choice, multiple-choice, and fill-in-the-blank flows.
- Use subject.json as the only subject-specific branding/configuration source in the primary app.
- Reject unknown subject IDs and path traversal; never silently fall back after an explicit invalid subject selection.
- Apply MIT to source code only after documenting media and question-text redistribution boundaries.
- Keep all implementation edits inside D:\AI\ClassGame.

## Review Focus

- Explicit --subject missing-id must fail with a nonzero validation result instead of selecting Chemistry; test with validate-project.ps1 -SubjectId missing-id.
- Asset paths such as ../content/index.html must be rejected by validation and runtime resolution; test with a temporary invalid fixture.
- A custom subject created by new-subject.ps1 must be isolated from other subjects; create biology, edit its manifest, and verify Chemistry files remain unchanged.
- An incomplete subject configuration must produce a bounded error listing the missing key; test by removing labels.homeTitle from a temporary copy.
- Portable build output must include one selected subject and no source ZIP, runtime cache, user data, or backups; inspect a dry-run manifest before any Electron download.

---

### Task 1: Initialize the normalized source tree and preserve the inputs

Files:
- Create: archives/ChemGame_TeacherEditor_v2_1_BuilderFix.zip
- Create: archives/YuWenGame_TeacherEditor_v1_1_BuilderFix.zip
- Create: examples/chemistry-original/
- Create: examples/chinese-original/
- Create: examples/README.md

Interfaces:
- Consumes the two ZIP files in D:\AI\ClassGame.
- Produces unchanged archives under archives/ and complete extracted source trees under examples/.

- [ ] Step 1: Record input hashes.

~~~powershell
Get-FileHash .\ChemGame_TeacherEditor_v2_1_BuilderFix.zip -Algorithm SHA256
Get-FileHash .\YuWenGame_TeacherEditor_v1_1_BuilderFix.zip -Algorithm SHA256
~~~

Expected: one SHA-256 line per archive.

- [ ] Step 2: Move, rather than delete, both archives.

~~~powershell
New-Item -ItemType Directory -Force .\archives | Out-Null
Move-Item -LiteralPath .\ChemGame_TeacherEditor_v2_1_BuilderFix.zip -Destination .\archives\ChemGame_TeacherEditor_v2_1_BuilderFix.zip
Move-Item -LiteralPath .\YuWenGame_TeacherEditor_v1_1_BuilderFix.zip -Destination .\archives\YuWenGame_TeacherEditor_v1_1_BuilderFix.zip
~~~

Expected: both files exist under archives/.

- [ ] Step 3: Extract complete examples.

~~~powershell
Expand-Archive .\archives\ChemGame_TeacherEditor_v2_1_BuilderFix.zip .\examples\chemistry-original -Force
Expand-Archive .\archives\YuWenGame_TeacherEditor_v1_1_BuilderFix.zip .\examples\chinese-original -Force
~~~

Expected: each example contains main.js, preload.js, package.json, content/, and tools/build-portable.ps1.

- [ ] Step 4: Create examples/README.md describing the extracted projects as historical runnable references, the primary app under app/, and the retained archives under archives/.

- [ ] Step 5: Verify extraction and archive hashes.

~~~powershell
Test-Path .\examples\chemistry-original\ChemGame_TeacherEditor_v2_1\main.js
Test-Path .\examples\chinese-original\YuWenGame_TeacherEditor_v1_1_BuilderFix\main.js
Get-FileHash .\archives\ChemGame_TeacherEditor_v2_1_BuilderFix.zip -Algorithm SHA256
Get-FileHash .\archives\YuWenGame_TeacherEditor_v1_1_BuilderFix.zip -Algorithm SHA256
~~~

Expected: both Test-Path calls are True and hashes equal Step 1.

- [ ] Step 6: Commit the preserved inputs.

~~~powershell
git add archives examples/README.md examples/chemistry-original examples/chinese-original
git commit -m "chore: preserve original ClassGame examples"
~~~

### Task 2: Create the generic Electron application skeleton

Files:
- Create: app/main.js
- Create: app/preload.js
- Create: app/package.json
- Create: app/default-subject.json
- Create: app/content/
- Create: app/README.md

Interfaces:
- Consumes shared behavior from the Chemistry example.
- Produces a subject-neutral Electron shell with generic ClassGame namespaces.

- [ ] Step 1: Copy main.js, preload.js, package.json, content/, and build documentation from the Chemistry example into app/. Set app/package.json to:

~~~json
{
  "name": "classgame",
  "version": "1.0.0",
  "private": true,
  "description": "Configurable offline classroom quiz platform and teacher editor",
  "main": "main.js",
  "productName": "ClassGame"
}
~~~

- [ ] Step 2: Normalize all subject-specific globals in app/content/js/ and app/content/editor/editor.js:

~~~text
ChemData/YuWenData -> ClassGameData
ChemStorage/YuWenStorage -> ClassGameStorage
ChemAudio/YuWenAudio -> ClassGameAudio
ChemEffects/YuWenEffects -> ClassGameEffects
ChemValidator/YuWenValidator -> ClassGameValidator
CHEM_CHAPTERS/YUWEN_CHAPTERS -> CLASSGAME_CHAPTERS
chemEditor/yuwenEditor -> classGameEditor
~~~

Expected: rg -n "Chem|YuWen|chemEditor|yuwenEditor" app returns no subject-specific runtime identifier.

- [ ] Step 3: Create app/default-subject.json with subjectId set to chemistry.

- [ ] Step 4: Run the initial syntax check.

~~~powershell
Get-ChildItem .\app -Recurse -File -Filter *.js | ForEach-Object { node --check $_.FullName }
~~~

Expected: every file exits with code 0.

- [ ] Step 5: Commit the neutral shell.

~~~powershell
git add app
git commit -m "refactor: add generic ClassGame application shell"
~~~

### Task 3: Add subject profiles, template data, and schema validation

Files:
- Create: app/subjects/_template/subject.json
- Create: app/subjects/_template/data/manifest.json
- Create: app/subjects/_template/data/chapters/chapter_001/chapter.json
- Create: app/subjects/_template/static/.gitkeep
- Create: app/subjects/chemistry/subject.json, data/, static/
- Create: app/subjects/chinese/subject.json, data/, static/
- Create: schemas/subject.schema.json

Interfaces:
- Consumes data/ and static/ from both extracted examples.
- Produces three valid profiles with unique IDs and a machine-readable configuration contract.

- [ ] Step 1: Copy only content/data/ and content/static/ from each extracted example into the matching app/subjects/chemistry/ and app/subjects/chinese/ directories.

- [ ] Step 2: Create a valid empty template manifest and chapter.

~~~json
{
  "version": 2,
  "chapters": [
    {
      "id": "chapter_001",
      "order": 1,
      "icon": "📘",
      "title": "第一章",
      "subtitle": "请编辑本章说明",
      "enabled": false,
      "file": "data/chapters/chapter_001/chapter.json"
    }
  ]
}
~~~

~~~json
{
  "id": "chapter_001",
  "questions": []
}
~~~

- [ ] Step 3: Create subject.json for Chemistry, Chinese, and the template. Preserve example titles, labels, colors, backgrounds, audio paths, and unique storageKey values. The template uses neutral Chinese labels and a neutral theme.

- [ ] Step 4: Write schemas/subject.schema.json. Require id, locale, name, app.productName, app.gameTitle, app.editorTitle, app.appUserModelId, labels, theme, assets, and storageKey. Constrain id to ^[A-Za-z0-9_-]+$, colors to ^#[0-9A-Fa-f]{6}$, and asset paths to relative paths without .. segments.

- [ ] Step 5: Parse every profile JSON and verify baseline counts.

~~~powershell
Get-ChildItem .\app\subjects -Recurse -File -Include *.json | ForEach-Object { Get-Content -Raw $_.FullName | ConvertFrom-Json | Out-Null }
~~~

Expected: Chemistry has 3 manifest chapters and 31 questions; Chinese has 3 manifest chapters and 9 questions; the template has one disabled chapter and zero questions.

- [ ] Step 6: Commit the profiles.

~~~powershell
git add app/subjects schemas/subject.schema.json
git commit -m "feat: add configurable subject profiles"
~~~

### Task 4: Make the renderer configuration-driven

Files:
- Create: app/content/js/config.js
- Modify: app/content/index.html, game.html, editor.html
- Modify: app/content/js/app.js, game.js
- Modify: app/content/editor/editor.js and editor/editor.css
- Modify: shared CSS blocks in the three HTML files

Interfaces:
- Consumes /subject.json from the main-process server.
- Produces window.ClassGameConfig and a renderer without subject-specific hardcoded titles, labels, colors, or storage namespaces.

- [ ] Step 1: Implement config.js with these functions:

~~~javascript
async function loadConfig() {}
function applyTheme(config) {}
function applyLabels(config) {}
function assetUrl(relativePath) {}
~~~

loadConfig() fetches /subject.json, validates id, labels, theme, and assets, freezes the object, and assigns window.ClassGameConfig. applyTheme() sets CSS variables --subject-primary, --subject-secondary, --subject-ink, --subject-surface, and --subject-accent. assetUrl() accepts only a relative asset path and returns a URL rooted at /static/.

- [ ] Step 2: Load config.js before app/game/editor scripts in the HTML files.

- [ ] Step 3: Replace hardcoded UI copy with data-config-key attributes for page titles, splash headings, enter buttons, menu headings, editor headings, chapter labels, and result labels. applyLabels() sets textContent and document.title from the selected configuration with neutral fallbacks.

- [ ] Step 4: Replace subject-specific CSS colors with the five variables and set the background image from config.assets.background after path validation. Keep layout and interaction styling unchanged.

- [ ] Step 5: Use ClassGameConfig.storageKey for local storage and replace bridge messages with classgame:audio-state, classgame:auto-remove-state, classgame:back-menu, and matching request/set messages. Update editor calls to window.classGameEditor.

- [ ] Step 6: Verify syntax and namespace cleanup.

~~~powershell
Get-ChildItem .\app\content -Recurse -File -Filter *.js | ForEach-Object { node --check $_.FullName }
if (rg -n "Chem|YuWen|chemEditor|yuwenEditor|CHEM_|YUWEN_" .\app\content) { throw "Subject-specific runtime identifiers remain" }
~~~

Expected: all syntax checks pass and the namespace search has no output.

- [ ] Step 7: Commit the renderer refactor.

~~~powershell
git add app/content
git commit -m "feat: drive ClassGame UI from subject configuration"
~~~

### Task 5: Refactor Electron routing, subject selection, and the preload bridge

Files:
- Modify: app/main.js
- Modify: app/preload.js
- Modify: app/package.json and app/README.md

Interfaces:
- Consumes app/default-subject.json, app/subjects/<id>/subject.json, shared content, and selected subject data/static.
- Produces a generic classGameEditor bridge and a server with separate UI and subject roots.

- [ ] Step 1: Add these subject-selection functions:

~~~javascript
function parseSubjectArg(argv) {}
function readDefaultSubject() {}
function resolveSubjectId(argv) {}
function loadSubjectConfig(subjectId) {}
~~~

parseSubjectArg() supports --subject=chemistry and --subject chemistry. resolveSubjectId() uses an explicit CLI value first, then default-subject.json, then chemistry only if the default file is unavailable. An explicit unknown ID throws and never falls through.

- [ ] Step 2: Split contentRoot into uiRoot and subjectRoot. Map /, /index.html, /game.html, /editor.html, /js/*, and /editor/* to uiRoot. Map /subject.json, /data/*, and /static/* to subjectRoot. Keep traversal protection for both roots.

- [ ] Step 3: Update manifest loading, question validation, image upload, save, and cleanup to use subjectRoot. Keep backups under portableRoot() runtime storage and never write backups into app/subjects during a packaged run.

- [ ] Step 4: Use subjectConfig.app.appUserModelId, gameTitle, and editorTitle for window metadata and errors. No user-facing process name may contain ChemGame or YuWenGame literals.

- [ ] Step 5: Expose exactly one generic preload bridge.

~~~javascript
contextBridge.exposeInMainWorld("classGameEditor", {
  loadData: () => ipcRenderer.invoke("load-data"),
  saveData: payload => ipcRenderer.invoke("save-data", payload),
  chooseImage: meta => ipcRenderer.invoke("choose-image", meta),
  openGame: () => ipcRenderer.invoke("open-game"),
  setDirty: value => ipcRenderer.send("editor-dirty", Boolean(value)),
  onSaveBeforeClose: callback => ipcRenderer.on("save-before-close", () => callback()),
  closeAfterSave: success => ipcRenderer.send("close-after-save", Boolean(success))
});
~~~

Update main-process handlers to use the selected subject root and generic channel names.

- [ ] Step 6: Run static checks.

~~~powershell
node --check .\app\main.js
node --check .\app\preload.js
~~~

Expected: both exit 0. After Task 7 exists, run validation for chemistry and chinese.

- [ ] Step 7: Commit the Electron refactor.

~~~powershell
git add app/main.js app/preload.js app/package.json app/README.md
git commit -m "feat: select subjects through the Electron runtime"
~~~

### Task 6: Add subject scaffolding and portable build support

Files:
- Create: scripts/new-subject.ps1
- Create: app/tools/build-portable.ps1
- Create: app/BUILD.cmd
- Modify: app/README.md

Interfaces:
- Consumes _template, a selected subject profile, and the pinned Electron runtime metadata.
- Produces new subject directories and subject-specific Windows portable release folders.

- [ ] Step 1: Implement new-subject.ps1 with:

~~~powershell
param(
  [Parameter(Mandatory = $true)][string]$Id,
  [Parameter(Mandatory = $true)][string]$Name
)
~~~

Validate Id with ^[A-Za-z0-9_-]+$, refuse _template and existing app/subjects/Id, copy _template/data and _template/static, write subject.json with neutral labels and storageKey classgame:Id, and print the next edit paths.

- [ ] Step 2: Implement build-portable.ps1 with SubjectId and ValidateOnly parameters. Resolve the repository root from PSScriptRoot, validate the subject before any runtime download, and keep the existing size/hash checks. Required-file checks include shared UI, subject.json, data/manifest.json, every chapter in the manifest, and the editor bridge. ValidateOnly must stop after producing the selected-file manifest and must not download, extract, or delete Electron runtime files.

- [ ] Step 3: Assemble one release at release/ClassGame_<subject-id>_Teacher_Windows_x64. Copy Electron, shared content/, exactly one subjects/Id/ directory, create userdata/editor_userdata/backups, and emit BUILD_INFO.txt with subject ID and runtime version. Do not copy archives, examples, or other subjects.

- [ ] Step 4: Make BUILD.cmd pass its first argument to build-portable.ps1 -SubjectId, use app/default-subject.json when omitted, return the builder exit code, and not launch Explorer automatically.

- [ ] Step 5: Test scaffolding without downloading Electron.

~~~powershell
powershell -ExecutionPolicy Bypass -File .\scripts\new-subject.ps1 -Id biology -Name "生物"
powershell -ExecutionPolicy Bypass -File .\scripts\new-subject.ps1 -Id biology -Name "生物"; if ($LASTEXITCODE -eq 0) { throw "Collision was not rejected" }
powershell -ExecutionPolicy Bypass -File .\scripts\new-subject.ps1 -Id "bad/id" -Name "非法"; if ($LASTEXITCODE -eq 0) { throw "Invalid ID was not rejected" }
~~~

Expected: first command succeeds; collision and invalid-ID commands fail. Remove only the generated temporary app/subjects/biology fixture after verification.

- [ ] Step 6: Commit build and scaffolding tools.

~~~powershell
git add scripts/new-subject.ps1 app/tools/build-portable.ps1 app/BUILD.cmd app/README.md
git commit -m "feat: scaffold subjects and build portable releases"
~~~

### Task 7: Add repository validation, documentation, and open-source metadata

Files:
- Create: scripts/validate-project.ps1
- Create: README.md
- Create: LICENSE
- Create: THIRD_PARTY_NOTICES.md
- Create: docs/assets-and-licenses.md
- Create: .gitignore
- Modify: app/README.md and examples/README.md

Interfaces:
- Consumes the normalized tree and schemas/subject.schema.json.
- Produces one release gate and contributor documentation.

- [ ] Step 1: Add .gitignore:

~~~gitignore
node_modules/
release/
_build_cache/*.zip
_build_cache/*.part
_build_cache/electron-runtime-*/
userdata/
editor_userdata/
backups/
*.log
~~~

Do not ignore archives/; the original ZIPs are intentionally preserved.

- [ ] Step 2: Implement validate-project.ps1 with an optional SubjectId. It enumerates subjects (excluding _template when requested), parses JSON, enforces schema constraints, verifies question IDs/answers/image paths, runs node --check for app/ and examples/, and returns exit code 1 with concise errors.

- [ ] Step 3: Write MIT text to LICENSE. Identify Electron 43.2.0 in THIRD_PARTY_NOTICES.md and link its upstream license. In docs/assets-and-licenses.md, separate source code licensing from question text and MP3/JPG/PNG/ICO redistribution rights.

- [ ] Step 4: Write root README.md with purpose, layout, prerequisites, subject creation, subject JSON fields, question examples, validation, builds for chemistry/chinese/custom subjects, archive preservation, and asset-rights warnings. Write app/README.md with runtime behavior and release outputs.

- [ ] Step 5: Run the release gate.

~~~powershell
powershell -ExecutionPolicy Bypass -File .\scripts\validate-project.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\validate-project.ps1 -SubjectId chemistry
powershell -ExecutionPolicy Bypass -File .\scripts\validate-project.ps1 -SubjectId chinese
~~~

Expected: all three commands exit 0 and report IDs, chapter counts, question counts, and JavaScript file count.

- [ ] Step 6: Commit release metadata.

~~~powershell
git add .gitignore README.md LICENSE THIRD_PARTY_NOTICES.md docs/assets-and-licenses.md scripts/validate-project.ps1 app/README.md examples/README.md
git commit -m "docs: document ClassGame open-source workflow"
~~~

### Task 8: Integrate, verify, and prepare GitHub delivery

Files:
- Modify: Git metadata only (.git/config and branch refs)
- Modify: implementation files identified by the final validation pass

Interfaces:
- Consumes all normalized source, profiles, examples, archives, scripts, and commits.
- Produces a clean local master branch ready to push and a GitHub repository configured for Public visibility.

- [ ] Step 1: Run the complete verification set.

~~~powershell
git status --short --branch
git diff --check HEAD~1..HEAD
powershell -ExecutionPolicy Bypass -File .\scripts\validate-project.ps1
Get-FileHash .\archives\ChemGame_TeacherEditor_v2_1_BuilderFix.zip -Algorithm SHA256
Get-FileHash .\archives\YuWenGame_TeacherEditor_v1_1_BuilderFix.zip -Algorithm SHA256
~~~

Expected: no whitespace errors, validation exit 0, hashes equal Task 1, and no runtime artifacts remain untracked.

- [ ] Step 2: Inspect the release manifest using build-portable.ps1 -SubjectId <id> -ValidateOnly for chemistry, chinese, and biology without downloading Electron. Confirm exactly one selected subject and no archives, examples, release, or _build_cache in the manifest.

- [ ] Step 3: Add and verify the remote.

~~~powershell
git remote add origin https://github.com/wxa13937718719/ClassGame.git
git remote -v
~~~

Expected: origin points to the user-supplied repository URL.

- [ ] Step 4: If the integration pass changed files, commit them only after validation.

~~~powershell
git add -A
git commit -m "chore: finalize ClassGame repository migration"
~~~

- [ ] Step 5: Ask for confirmation that the bundled Chemistry and Chinese question text, images, icons, and audio are redistributable. Replace uncleared assets before making the repository Public.

- [ ] Step 6: Push and change GitHub visibility with the isolated browser. Pause for login, two-factor authentication, CAPTCHA, or security confirmation. After authentication, set visibility to Public, verify the public badge and default branch, push master, and verify the online file tree and README.

- [ ] Step 7: Capture final evidence.

~~~powershell
git status --short --branch
git log --oneline --decorate -8
git remote -v
~~~

Expected: clean master, normalized commits visible locally, and origin set to the ClassGame URL. Report browser setup or login limitations explicitly instead of claiming the repository is public.
