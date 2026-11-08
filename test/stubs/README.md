Stand-ins for the shell's QML modules (`Quickshell`, `Quickshell.Io`,
`qs.Commons`, `qs.Ui`) so the real `Panel.qml` loads in the plain `qml`
runtime with `QT_QPA_PLATFORM=offscreen`. `Process` and `execDetached` only
record their commands in `Stub.Recorder`; nothing is run. The look of the panel,
slider, header and separator follows Omarchy 4.5's `Ui/` files.
