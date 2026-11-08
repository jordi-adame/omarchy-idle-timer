import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Bar icon with a popup holding two sliders: screensaver and lock timeouts.
// Values are read from and written to idle.screensaver / idle.lock in
// shell.json. Third-party widgets get no shellConfig or idle mutator in
// Omarchy 4.0.6, so this reads the file directly and writes it with
// Omarchy's own omarchy-shell-config helper, which reloads the shell.
Panel {
  id: root
  moduleName: "io.github.jordi-adame.idle-timer"
  ipcTarget: "io.github.jordi-adame.idle-timer"
  // Own the IpcHandler so it can also expose set().
  manageIpc: false

  // Slider positions map to these seconds (Model.STOPS).
  readonly property var stops: Model.STOPS

  // Omarchy's defaults when shell.json has no idle block (idle service fallbacks).
  property var idleConfig: ({})
  readonly property int screensaverSeconds: Model.screensaverSeconds(idleConfig)
  readonly property int lockSeconds: Model.lockSeconds(idleConfig)

  // Slider values held until shell.json reloads (or the write fails), so the
  // knob doesn't jump back to the old value in between.
  property int previewScreensaver: -1
  property int previewLock: -1

  // The last values released while a write was running, written after it.
  property var pendingSave: null

  FileView {
    id: shellConfigFile
    path: Quickshell.env("HOME") + "/.config/omarchy/shell.json"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: {
      root.idleConfig = Model.parseIdle(text())
      if (root.pendingSave) return
      root.previewScreensaver = -1
      root.previewLock = -1
    }
    onLoadFailed: function(error) { root.idleConfig = ({}) }
  }

  function indexFor(seconds) { return Model.indexFor(seconds) }
  function label(seconds) { return Model.label(seconds) }

  function save(screensaver, lock) {
    if (saveProcess.running) {
      pendingSave = { screensaver: screensaver, lock: lock }
      return
    }
    saveProcess.command = Model.saveCommand(screensaver, lock)
    saveProcess.running = true
  }

  Process {
    id: saveProcess
    onExited: function(exitCode, exitStatus) {
      var next = root.pendingSave
      root.pendingSave = null
      if (exitCode !== 0) {
        root.previewScreensaver = -1
        root.previewLock = -1
      } else if (next) {
        root.save(next.screensaver, next.lock)
      } else {
        rearmTimer.restart()
      }
    }
  }

  // Workaround for IdleMonitor not re-arming after a timeout change: restart
  // the idle service once the write has landed, unless Stay Awake is on
  // (Model.RESTART_COMMAND).
  Timer {
    id: rearmTimer
    interval: 300
    onTriggered: Quickshell.execDetached(Model.RESTART_COMMAND)
  }

  // Keep lock >= screensaver so the screensaver always shows first.
  function applyValues(values) {
    previewScreensaver = values.screensaver
    previewLock = values.lock
    save(values.screensaver, values.lock)
  }

  function setScreensaver(seconds) { applyValues(Model.withScreensaver(seconds, lockSeconds)) }
  function setLock(seconds) { applyValues(Model.withLock(seconds, screensaverSeconds)) }

  IpcHandler {
    target: "io.github.jordi-adame.idle-timer"

    function open(): void { root.open() }
    function close(): void { root.close() }
    function toggle(): void { root.toggle() }
    function set(screensaver: int, lock: int): void { root.save(screensaver, Math.max(screensaver, lock)) }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "󰒲"
    tooltipText: "Screensaver " + root.label(root.screensaverSeconds) + " · Lock " + root.label(root.lockSeconds)
    onPressed: function(b) { root.toggle() }
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(320))
    contentHeight: panel.fittedContentHeight(column.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Column {
        id: column
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        spacing: Style.space(14)

        TimeoutRow {
          title: "SCREENSAVER"
          seconds: root.previewScreensaver >= 0 ? root.previewScreensaver : root.screensaverSeconds
          onPreview: function(s) { root.previewScreensaver = s }
          onCommit: function(s) { root.setScreensaver(s) }
        }

        PanelSeparator { foreground: root.bar.foreground }

        TimeoutRow {
          title: "LOCK"
          seconds: root.previewLock >= 0 ? root.previewLock : root.lockSeconds
          onPreview: function(s) { root.previewLock = s }
          onCommit: function(s) { root.setLock(s) }
        }
      }
    }
  }

  component TimeoutRow: Column {
    id: row
    property string title: ""
    property int seconds: 0
    signal preview(int seconds)
    signal commit(int seconds)

    width: parent.width
    spacing: Style.space(8)

    Item {
      width: parent.width
      implicitHeight: header.implicitHeight

      PanelSectionHeader {
        id: header
        anchors.left: parent.left
        text: row.title
        foreground: root.bar.foreground
        fontFamily: root.bar.fontFamily
      }

      Text {
        anchors.right: parent.right
        anchors.verticalCenter: header.verticalCenter
        textFormat: Text.PlainText
        text: root.label(row.seconds)
        color: root.bar.foreground
        font.family: root.bar.fontFamily
        font.pixelSize: Style.font.bodySmall
        font.bold: true
      }
    }

    PanelSlider {
      bar: root.bar
      width: parent.width
      minimum: 0
      maximum: root.stops.length - 1
      step: 1
      integer: true
      tickCount: root.stops.length
      value: root.indexFor(row.seconds)
      onMoved: function(v) { row.preview(root.stops[Math.round(v)]) }
      onReleased: function(v) { row.commit(root.stops[Math.round(v)]) }
    }
  }
}
