# Historical examples

This directory contains complete extracted copies of the two supplied Electron
projects. They are retained as runnable historical references while the shared,
configuration-driven application lives in `app/`.

- `chemistry-original/ChemGame_TeacherEditor_v2_1/` is the original Chemistry
  teacher editor and classroom game.
- `chinese-original/YuWenGame_TeacherEditor_v1_1_BuilderFix/` is the original
  Chinese teacher editor and classroom game.

The normalized application does not import runtime code from these folders.
Their question data and subject assets were copied into `app/subjects/` so new
subjects can share one maintained implementation. The byte-for-byte source ZIP
files are retained separately under `archives/`.

The original build notes and self-check instructions remain inside each
extracted project. Do not add generated portable releases, user data, backups,
or Electron runtime caches to these historical examples.
