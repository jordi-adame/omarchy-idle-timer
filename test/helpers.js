// Shared helpers: the Model of the version folder the manifest loads, temp
// dirs under TMPDIR, and runPanel(), which loads the real Panel.qml in the
// plain `qml` runtime with QT_QPA_PLATFORM=offscreen and the stubs in
// test/stubs. No window, no compositor; Process and execDetached only record.
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const PLUGIN = path.resolve(__dirname, "..")
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PLUGIN, "manifest.json"), "utf8"))
const VERSION_DIR = path.join(PLUGIN, path.dirname(MANIFEST.entryPoints.barWidget))
const PANEL = path.join(PLUGIN, MANIFEST.entryPoints.barWidget)
const Model = require(path.join(VERSION_DIR, "Model.js"))
const STUBS = path.join(__dirname, "stubs")

// Every temp dir lives under one base that is removed when the run ends.
// Point TMPDIR at a scratch folder inside the repo (.scratch/).
const TMP_BASE = fs.mkdtempSync(path.join(os.tmpdir(), "idle-timer-test-"))
process.on("exit", () => fs.rmSync(TMP_BASE, { recursive: true, force: true }))

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(TMP_BASE, prefix + "-"))
}

// A fake HOME whose ~/.config/omarchy/shell.json holds `text` (no file when null).
function fakeHome(text) {
  const home = tmpdir("home")
  fs.mkdirSync(path.join(home, ".config", "omarchy"), { recursive: true })
  if (text !== null && text !== undefined) fs.writeFileSync(path.join(home, ".config", "omarchy", "shell.json"), text)
  return home
}

const QML = ["/usr/lib/qt6/bin/qml", "/usr/bin/qml6", "/usr/bin/qml"].find((p) => fs.existsSync(p))

// Loads Panel.qml against a fake HOME holding `shellJson`, then runs `script`
// as the body of `function (panel, Recorder, done, after)`; done(value) ends the
// run and becomes the result. `after(ms, fn)` runs fn later. `env` adds to
// the qml process environment (QT_SCALE_FACTOR for the screenshots).
function runPanel({ shellJson = null, script, width = 360, height = 260, env = {} }) {
  if (!QML) throw new Error("qml runtime not found (qt6-declarative)")
  const home = fakeHome(shellJson)
  const dir = tmpdir("qml")
  const file = path.join(dir, "harness.qml")
  fs.writeFileSync(file, `
import QtQuick
import Stub

Item {
  id: win
  width: ${width}
  height: ${height}

  Rectangle { anchors.fill: parent; color: "#11111b" }

  // Colours close to Omarchy's default theme.
  QtObject {
    id: bar
    property color foreground: "#cdd6f4"
    property color background: "#1e1e2e"
    property color border: "#45475a"
    property string fontFamily: "monospace"
  }

  Item { id: cardHost; x: 12; y: 12 }

  Loader {
    id: loader
    onLoaded: Qt.callLater(function () { win.after(50, function () { win.run(loader.item) }) })
  }

  function after(ms, fn) {
    var timer = Qt.createQmlObject("import QtQuick; Timer { running: true; interval: " + ms + " }", win)
    timer.triggered.connect(function () {
      timer.destroy()
      try { fn() } catch (e) { done({ error: String(e) }) }
    })
  }

  function done(value) {
    console.log("RESULT " + JSON.stringify(value === undefined ? null : value))
    Qt.quit()
  }

  function run(panel) {
    if (!panel) { done({ error: "Panel.qml did not load" }); return }
    try {
      (function (panel, Recorder, done, after) {
${script}
      })(panel, Recorder, win.done, win.after)
    } catch (e) {
      done({ error: String(e) })
    }
  }

  Component.onCompleted: {
    Recorder.home = ${JSON.stringify(home)}
    Recorder.card = cardHost
    loader.setSource(${JSON.stringify("file://" + PANEL)}, { bar: bar })
  }
}
`)
  const res = spawnSync(QML, ["-I", STUBS, file], {
    env: {
      PATH: process.env.PATH, HOME: home, TMPDIR: dir, LANG: "C.UTF-8",
      QT_QPA_PLATFORM: "offscreen", QT_QUICK_BACKEND: "software", QT_FORCE_STDERR_LOGGING: "1",
      QML_XHR_ALLOW_FILE_READ: "1", ...env
    },
    encoding: "utf8", timeout: 60000
  })
  const output = (res.stderr || "") + "\n" + (res.stdout || "")
  const line = output.split("\n").find((l) => l.includes("RESULT "))
  if (!line) throw new Error("no result from qml (status " + res.status + "):\n" + output)
  return { result: JSON.parse(line.slice(line.indexOf("RESULT ") + 7)), output, home }
}

module.exports = { PLUGIN, MANIFEST, VERSION_DIR, PANEL, Model, STUBS, QML, tmpdir, fakeHome, runPanel }
