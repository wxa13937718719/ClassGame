# ClassGame Configurable Platform Design

## Outcome

ClassGame will become a public, reusable classroom quiz platform rather than a repository containing two subject-specific Electron applications. The repository will ship one configuration-driven application, a template for creating additional subjects, two extracted subject examples (Chemistry and Chinese), and the original ZIP archives preserved as reference material.

The application will keep the existing offline workflow: students play locally, teachers edit a JSON-backed question bank, the editor validates and backs up data before publishing, and a Windows portable build can be produced without a network dependency after the Electron runtime is cached.

## Scope and Non-Goals

In scope:

- Extract both supplied archives without deleting the original ZIP files.
- Normalize the repository into a single open-source project with a clear root README, license, ignore rules, and contribution guidance.
- Replace subject-specific branding in the primary application with runtime configuration.
- Preserve the existing question model and the single-choice, multiple-choice, and fill-in-the-blank workflows.
- Add a subject template and a PowerShell scaffolding command for new subjects.
- Keep Chemistry and Chinese as runnable examples with their existing question data and visual assets.
- Add static checks for JavaScript syntax, subject configuration, manifest/chapter integrity, and required build files.

Out of scope:

- Replacing Electron or upgrading the pinned Electron runtime.
- Adding a web server, cloud database, account system, or online synchronization.
- Redesigning the game mechanics, scoring rules, editor interactions, or question schema beyond the configuration boundary.
- Deleting or rewriting the supplied original ZIP archives.

## Repository Layout

The normalized repository will use this layout:

```text
ClassGame/
├─ app/
│  ├─ main.js
│  ├─ preload.js
│  ├─ package.json
│  ├─ default-subject.json
│  ├─ content/
│  │  ├─ index.html
│  │  ├─ game.html
│  │  ├─ editor.html
│  │  ├─ editor/
│  │  ├─ js/
│  │  └─ static/               # neutral UI assets shared by all subjects
│  ├─ subjects/
│  │  ├─ _template/
│  │  │  ├─ subject.json
│  │  │  ├─ data/
│  │  │  └─ static/
│  │  ├─ chemistry/
│  │  │  ├─ subject.json
│  │  │  ├─ data/
│  │  │  └─ static/
│  │  └─ chinese/
│  │     ├─ subject.json
│  │     ├─ data/
│  │     └─ static/
│  ├─ tools/build-portable.ps1
│  ├─ BUILD.cmd
│  └─ README.md
├─ examples/
│  ├─ chemistry-original/
│  ├─ chinese-original/
│  └─ README.md
├─ archives/
│  ├─ ChemGame_TeacherEditor_v2_1_BuilderFix.zip
│  └─ YuWenGame_TeacherEditor_v1_1_BuilderFix.zip
├─ schemas/
│  └─ subject.schema.json
├─ scripts/
│  ├─ new-subject.ps1
│  └─ validate-project.ps1
├─ docs/
│  └─ assets-and-licenses.md
├─ README.md
├─ LICENSE
├─ THIRD_PARTY_NOTICES.md
└─ .gitignore
```

`app/content` owns the shared UI and renderer logic. A subject directory owns only its configuration, question data, and subject-specific assets. `examples/*-original` contains the complete extracted source trees from the two supplied archives so that their historical build instructions remain inspectable. The ZIP files are moved into `archives/` and retained unchanged.

## Subject Configuration Contract

Every subject must have `app/subjects/<id>/subject.json`. The file is validated against `schemas/subject.schema.json` before a build or release. The minimum shape is:

```json
{
  "id": "chemistry",
  "locale": "zh-CN",
  "name": "化学",
  "app": {
    "productName": "ClassGame 化学",
    "gameTitle": "趣味化学大闯关",
    "editorTitle": "ClassGame 化学题库编辑器",
    "appUserModelId": "ClassGame.Chemistry"
  },
  "labels": {
    "splashTitle": "趣味化学大闯关",
    "enterButton": "点击进入系统",
    "homeTitle": "化学闯关大厅",
    "homeDescription": "选择章节开始挑战",
    "chapterSectionTitle": "章节目录",
    "practiceSectionTitle": "专项练习",
    "chapterMode": "章节闯关",
    "wrongBookTitle": "我的错题本",
    "favoritesTitle": "我的收藏夹"
  },
  "theme": {
    "primary": "#00c6ff",
    "secondary": "#0072ff",
    "ink": "#19324a",
    "surface": "#ffffff",
    "accent": "#ffd43b"
  },
  "assets": {
    "background": "static/images/common/bg.jpg",
    "icon": "static/images/common/app_icon.ico",
    "audio": {
      "bgm": "static/audio/bgm.mp3",
      "correct": "static/audio/correct.mp3",
      "wrong": "static/audio/wrong.mp3",
      "hover": "static/audio/hover.mp3"
    }
  },
  "storageKey": "classgame:chemistry"
}
```

`id` is restricted to ASCII letters, digits, underscores, and hyphens. It is used for the subject directory, storage namespace, and build output name. `storageKey` must be unique among shipped subjects. The renderer will use safe defaults for optional labels and audio entries, but it will reject an invalid theme color, a missing required label, a duplicate ID, or an asset path that escapes the subject directory.

## Runtime Data Flow

1. `main.js` resolves a subject ID from `--subject <id>`, then `default-subject.json`, then the `chemistry` example as the final fallback.
2. `main.js` validates the subject ID and loads `subjects/<id>/subject.json` before creating any window.
3. The local HTTP server serves shared UI files from `app/content`, subject configuration from `/subject.json`, question data from `/data/*`, and subject assets from `/static/*`.
4. `content/js/config.js` loads `/subject.json`, applies theme CSS variables, updates configured page text, and exposes an immutable `window.ClassGameConfig` object.
5. The existing data loader reads `/data/manifest.json` and chapter files without changing the question model.
6. The editor writes only to the selected subject's `data/` directory, creates timestamped backups under the runtime `backups/` directory, and never writes to the repository source tree during a packaged run.
7. The preload bridge exposes generic `classGameEditor` methods. No renderer code may depend on `chemEditor`, `yuwenEditor`, or a subject-specific global namespace.

The server keeps path traversal protection for both UI and subject roots. A request for an unknown subject, an invalid asset path, a missing manifest, or malformed JSON fails with a bounded error page and a log entry; it must not silently fall back to another subject.

## Customization Workflow

The command below creates a new subject from `_template`:

```powershell
pwsh -File .\scripts\new-subject.ps1 -Id biology -Name "生物"
```

The command will:

- Validate the ID and refuse to overwrite an existing subject.
- Copy the template `data/` and `static/` directories.
- Generate a complete `subject.json` with the supplied name and neutral labels.
- Print the exact files that should be edited next.

The user then edits the generated configuration and chapter JSON files, places owned media in the generated `static/` directories, and runs `scripts/validate-project.ps1`. A custom subject is built with:

```powershell
powershell -ExecutionPolicy Bypass -File .\app\tools\build-portable.ps1 -SubjectId biology
```

`BUILD.cmd` accepts the same subject ID as its first argument and defaults to the value in `app/default-subject.json`.

## Build and Release Behavior

The pinned Electron runtime remains 43.2.0 with the existing SHA-256 and size checks. The builder will:

- Verify shared app files and the selected subject before downloading or extracting Electron.
- Copy shared UI files and exactly one selected subject profile into the release directory.
- Create empty runtime directories for learning records, editor user data, and backups.
- Produce `release/ClassGame_<subject-id>_Teacher_Windows_x64/` and its ZIP archive.
- Never include `_build_cache/*.zip`, runtime user data, editor backups, logs, or a previous `release/` directory in source control.

The source repository will not commit `node_modules`; the current projects have no runtime npm dependency and the build uses the system PowerShell and the cached Electron runtime.

## Validation and Tests

`scripts/validate-project.ps1` is the release gate. It will run:

- `node --check` on every JavaScript file under `app/` and both extracted examples.
- JSON parsing and schema checks for every `subject.json`, `manifest.json`, and chapter file.
- Question validation for each shipped subject, including duplicate IDs, supported question types, answer references, and image paths.
- Required-file checks for the shared UI, editor bridge, template, each example, and each build script.
- A dry-run subject selection check for the default subject and every subject directory.

The implementation will add focused fixture checks for the path resolver, subject selection precedence, and the scaffolding command's refusal to overwrite an existing ID. The existing runtime self-checks remain available in each extracted example and are documented as historical reference checks.

## Open-Source and Asset Boundaries

`LICENSE` will contain the MIT license for the ClassGame source code. `THIRD_PARTY_NOTICES.md` will identify Electron and any other redistributable runtime components. `docs/assets-and-licenses.md` will distinguish source code, question text, images, audio, and icons, and will state that bundled media must be owned by the publisher or accompanied by redistribution permission before a public release.

Before changing the GitHub repository visibility to Public, the publisher must confirm that the bundled Chemistry and Chinese question text and media can be redistributed. If a particular asset is not cleared, it must be replaced or removed before the visibility change; the code license alone does not grant rights to third-party media.

## GitHub Delivery

The local repository will be initialized on `master`, connected to `https://github.com/wxa13937718719/ClassGame.git`, and committed with a clear initial migration message. The final GitHub step will be performed only after local validation and the asset-rights confirmation. It will require the user to authenticate in the isolated browser session; any security challenge or two-factor prompt will be handed back to the user rather than automated.

