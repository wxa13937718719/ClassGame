# ClassGame

ClassGame is an offline, configuration-driven classroom quiz platform and
teacher editor for Windows. One shared Electron application supports single
choice, multiple choice, and fill-in-the-blank questions; each subject supplies
its own labels, theme, media, chapters, and question bank.

## Layout

```text
app/                 shared Electron shell and renderer
app/subjects/        template plus Chemistry, Chinese, and custom subjects
examples/            complete extracted historical projects
archives/            original ZIP files, preserved byte-for-byte
schemas/             subject configuration contract
scripts/              validation and new-subject scaffolding
docs/                 licensing and asset guidance
```

## Requirements

- Windows PowerShell 5+ or PowerShell 7+
- Node.js with `node --check` available
- Electron `43.2.0` runtime for a full portable build

Run `scripts/validate-project.ps1` before editing or publishing. It checks
subject manifests, chapter/question IDs, answer references, image paths, JSON,
JavaScript syntax, and required files.

## Subjects

Chemistry and Chinese are included as runnable examples. The primary app reads
`app/subjects/<id>/subject.json`; the shared renderer uses its `labels`,
`theme`, `assets`, and unique `storageKey` at runtime. Select a subject with
`--subject chemistry` or `--subject=chinese`, or edit
`app/default-subject.json`.

Create a new subject without copying application code:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\new-subject.ps1 -Id biology -Name "biology"
powershell -ExecutionPolicy Bypass -File .\scripts\validate-project.ps1 -SubjectId biology
powershell -ExecutionPolicy Bypass -File .\app\tools\build-portable.ps1 -SubjectId biology -ValidateOnly
```

Edit the generated `subject.json`, chapter manifest, chapter JSON files, and
owned media under `app/subjects/biology/`. The template starts with one
disabled chapter and no questions.

## Build

Inspect a dry-run file manifest without downloading Electron:

```powershell
powershell -ExecutionPolicy Bypass -File .\app\tools\build-portable.ps1 -SubjectId chemistry -ValidateOnly
```

Build a selected Windows portable release after the pinned runtime is cached:

```powershell
powershell -ExecutionPolicy Bypass -File .\app\tools\build-portable.ps1 -SubjectId chemistry
.\app\BUILD.cmd chinese
```

Each release contains shared UI and exactly one selected subject. Runtime user
data and backups are created beside the executable, while archives, examples,
other subjects, and source caches stay out of the release.

## Archives and licensing

The supplied ZIP files remain unchanged under `archives/`, and complete
extracted copies remain under `examples/` for historical reference. Source code
is MIT-licensed. Question text, images, audio, and icons require separate
redistribution permission; see `docs/assets-and-licenses.md` before making the
GitHub repository public.
