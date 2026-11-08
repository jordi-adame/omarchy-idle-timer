# Contributing

## Layout

- `manifest.json`: the Omarchy plugin manifest; `entryPoints.barWidget` names the version folder the shell loads.
- `v1/`: `Panel.qml` (bar icon, popup, save, idle restart) and `Model.js` (stops, labels, the lock >= screensaver rule, the `shell.json` reader, the save and restart commands).
- `test/`: `node --test` suites; `test/stubs/` stands in for the `Quickshell` and `qs.*` modules so the real `Panel.qml` loads offscreen.
- `tools/render-preview.js`: renders `preview.png`, Qt offscreen only.

## Tests

```bash
mkdir -p .scratch
TMPDIR=$PWD/.scratch node --test
omarchy plugin validate .
/usr/lib/qt6/bin/qmllint v1/*.qml     # warnings about the qs.* imports are expected
TMPDIR=$PWD/.scratch node tools/render-preview.js preview.png
rm -rf .scratch
```

Needs Node 20+, `jq` and the Qt `qml` runtime (`qt6-declarative`). The QML
tests run with `QT_QPA_PLATFORM=offscreen` and stubs that record commands and
run none, against a fake `HOME`. The save test runs the real save script with
a fake `omarchy-shell-config`. Nothing touches your `shell.json`, the running
shell or the idle service.

## A QML change goes in a new version folder

The shell loads a changed bar widget only from a fresh subdirectory. A release
that changes anything under `v1/` copies it to `v2/`, edits there, points
`entryPoints.barWidget` at `v2/Panel.qml`, bumps `version` and deletes `v1/`,
all in one commit. The tests and tools follow the manifest.
