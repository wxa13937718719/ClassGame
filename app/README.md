# ClassGame application

`app/` contains the maintained Electron application. The renderer and editor
are shared across subjects; `subjects/<id>/` supplies only the selected
configuration, question data, and owned media.

Run the application from this directory after installing the pinned Electron
runtime, or use `BUILD.cmd` to assemble a Windows portable release. The runtime
selects a subject with `--subject <id>`, `--subject=<id>`, or the ID in
`default-subject.json`.

The editor writes question-bank changes to the selected subject and keeps
timestamped backups in the portable runtime's `backups/` directory. It never
uses the shared renderer directory as a data store.
