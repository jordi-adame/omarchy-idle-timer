// The real Panel.qml, loaded offscreen with the stubs in test/stubs: what it
// reads, and that it writes shell.json only after a slider is released.
const test = require("node:test")
const assert = require("node:assert/strict")
const { Model, QML, runPanel } = require("./helpers.js")

const skip = !QML && "qml runtime not found (qt6-declarative)"
const json = (idle) => JSON.stringify(idle === undefined ? { version: 1 } : { version: 1, idle })

// Helpers available to every script: the row and slider for a title.
const PRELUDE = `
function slider(title) {
  for (var i = 0; i < Recorder.sliders.length; i++)
    if (Recorder.sliders[i].parent.title === title) return Recorder.sliders[i]
  throw new Error("no slider " + title)
}
function label(title) {
  var row = slider(title).parent
  return row.children[0].children[1].text
}
// The Process that writes shell.json, and the one that reads the binds.
function saveProcess() {
  for (var i = 0; i < Recorder.processes.length; i++)
    if (!Recorder.processes[i].stdout) return Recorder.processes[i]
  throw new Error("no save process")
}
function bindsProcess() {
  for (var i = 0; i < Recorder.processes.length; i++)
    if (Recorder.processes[i].stdout) return Recorder.processes[i]
  throw new Error("no binds process")
}
function button(text) {
  for (var i = 0; i < Recorder.buttons.length; i++)
    if (Recorder.buttons[i].text === text) return Recorder.buttons[i]
  throw new Error("no button " + text)
}
function stopIndex(seconds) { return ${JSON.stringify(Model.STOPS)}.indexOf(seconds) }
function state() {
  return {
    screensaver: panel.screensaverSeconds, lock: panel.lockSeconds,
    previewScreensaver: panel.previewScreensaver, previewLock: panel.previewLock,
    sliders: { SCREENSAVER: slider("SCREENSAVER").value, LOCK: slider("LOCK").value },
    labels: { SCREENSAVER: label("SCREENSAVER"), LOCK: label("LOCK") },
    started: Recorder.started, detached: Recorder.detached,
    opened: panel.opened, cursor: panel.actionCursor,
    tooltips: { Screensaver: button("Screensaver").tooltipText, Lock: button("Lock").tooltipText }
  }
}
`
const run = (shellJson, body) => {
  const { result, output } = runPanel({ shellJson, script: PRELUDE + body })
  assert.equal(result && result.error, undefined, output)
  assert.doesNotMatch(output, /(TypeError|ReferenceError|is not defined|Cannot assign|Unable to assign)/, output)
  return result
}

test("panel: loads and reads idle.screensaver and idle.lock", { skip }, () => {
  const r = run(json({ screensaver: 300, lock: 600 }), "panel.open(); after(50, function () { done(state()) })")
  assert.equal(r.screensaver, 300)
  assert.equal(r.lock, 600)
  assert.deepEqual(r.labels, { SCREENSAVER: "5 min", LOCK: "10 min" })
  assert.deepEqual(r.sliders, { SCREENSAVER: Model.indexFor(300), LOCK: Model.indexFor(600) })
})

test("panel: no shell.json, no idle block, a partial block and bad JSON read as the defaults", { skip }, () => {
  for (const [text, expected] of [[null, [150, 300]], [json(), [150, 300]], [json({ lock: 900 }), [150, 900]], ["{ bad", [150, 300]]]) {
    const r = run(text, "done(state())")
    assert.deepEqual([r.screensaver, r.lock], expected, String(text))
  }
})

test("consent: loading writes, reads and runs nothing", { skip }, () => {
  const r = run(json({ screensaver: 60, lock: 30 }), "after(400, function () { done(state()) })")
  assert.deepEqual(r.started, [])
  assert.deepEqual(r.detached, [])
})

test("consent: opening the popup only reads the binds; it writes nothing and restarts nothing", { skip }, () => {
  const r = run(json({ screensaver: 60, lock: 30 }), `
    panel.open()
    after(400, function () {
      bindsProcess().finish(0, "[]")
      panel.close(); panel.toggle()
      after(400, function () { done(state()) })
    })`)
  assert.deepEqual(r.started, [Model.BINDS_COMMAND, Model.BINDS_COMMAND], "one read per open")
  assert.deepEqual(r.detached, [])
})

test("consent: dragging a slider previews only; release writes", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 300 }), `
    slider("SCREENSAVER").moved(stopIndex(60))
    var dragged = state()
    slider("SCREENSAVER").released(stopIndex(60))
    done({ dragged: dragged, released: state() })`)
  assert.deepEqual(r.dragged.started, [])
  assert.equal(r.dragged.labels.SCREENSAVER, "1 min")
  assert.deepEqual(r.released.started, [Model.saveCommand(60, 300)])
})

test("save: the screensaver slider pushes the lock up to keep lock >= screensaver", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 300 }), `
    slider("SCREENSAVER").released(stopIndex(900))
    done(state())`)
  assert.deepEqual(r.started, [Model.saveCommand(900, 900)])
  assert.deepEqual(r.labels, { SCREENSAVER: "15 min", LOCK: "15 min" })
})

test("save: the lock slider pulls the screensaver down to keep lock >= screensaver", { skip }, () => {
  const r = run(json({ screensaver: 600, lock: 1200 }), `
    slider("LOCK").released(stopIndex(90))
    done(state())`)
  assert.deepEqual(r.started, [Model.saveCommand(90, 90)])
  assert.deepEqual(r.labels, { SCREENSAVER: "1 min 30 s", LOCK: "1 min 30 s" })
})

test("restart: the idle service restarts once, after a successful write", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 300 }), `
    slider("LOCK").released(stopIndex(600))
    var save = saveProcess()
    after(400, function () {
      var before = Recorder.detached.length
      save.finish(0)
      after(400, function () { done({ before: before, state: state() }) })
    })`)
  assert.equal(r.before, 0, "no restart before the write ends")
  assert.deepEqual(r.state.detached, [Model.RESTART_COMMAND])
})

test("restart: a failed write restarts nothing and drops the preview", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 300 }), `
    slider("LOCK").released(stopIndex(600))
    saveProcess().finish(1)
    after(400, function () { done(state()) })`)
  assert.deepEqual(r.detached, [])
  assert.equal(r.previewLock, -1)
  assert.deepEqual(r.labels, { SCREENSAVER: "2 min 30 s", LOCK: "5 min" })
})

test("save: a release while a write runs is saved after it, not dropped", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 300 }), `
    slider("LOCK").released(stopIndex(600))
    slider("LOCK").released(stopIndex(900))
    slider("LOCK").released(stopIndex(1200))
    var during = state()
    saveProcess().finish(0)
    var queued = state()
    saveProcess().finish(0)
    after(400, function () { done({ during: during, after: queued, last: state() }) })`)
  assert.deepEqual(r.during.started, [Model.saveCommand(150, 600)], "one write at a time")
  assert.equal(r.during.labels.LOCK, "20 min", "the preview shows the last release")
  assert.deepEqual(r.after.started, [Model.saveCommand(150, 600), Model.saveCommand(150, 1200)], "then the last release only")
  assert.deepEqual(r.after.detached, [], "no restart between the two writes")
  assert.deepEqual(r.last.detached, [Model.RESTART_COMMAND], "one restart after the last")
})

test("save: a failed write drops the release queued behind it", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 300 }), `
    slider("LOCK").released(stopIndex(600))
    slider("LOCK").released(stopIndex(900))
    saveProcess().finish(1)
    done(state())`)
  assert.deepEqual(r.started, [Model.saveCommand(150, 600)])
  assert.equal(r.labels.LOCK, "5 min")
})

test("off: a screensaver that is off shows Off and stays off when the lock moves", { skip }, () => {
  const r = run(json({ screensaver: 0, lock: 600 }), `
    var before = state()
    slider("LOCK").released(stopIndex(900))
    done({ before: before, after: state() })`)
  assert.equal(r.before.labels.SCREENSAVER, "Off")
  assert.deepEqual(r.after.started, [Model.saveCommand(0, 900)])
})

test("off: a lock that is off stays off when the screensaver moves", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 0 }), `
    slider("SCREENSAVER").released(stopIndex(600))
    done(state())`)
  assert.equal(r.labels.LOCK, "Off")
  assert.deepEqual(r.started, [Model.saveCommand(600, 0)])
})

test("ipc: set writes the values, keeps lock >= screensaver and refuses bad ones", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 300 }), `
    var ipc = null
    for (var i = 0; i < panel.resources.length; i++)
      if (panel.resources[i].target === "io.github.jordi-adame.idle-timer") ipc = panel.resources[i]
    var bad = ipc.set(-5, 10)
    var startedAfterBad = Recorder.started.length
    var ok = ipc.set(900, 600)
    done({ bad: bad, ok: ok, startedAfterBad: startedAfterBad, state: state() })`)
  assert.match(r.bad, /^error/)
  assert.equal(r.startedAfterBad, 0)
  assert.equal(r.ok, "ok")
  assert.deepEqual(r.state.started, [Model.saveCommand(900, 900)])
  assert.deepEqual(r.state.labels, { SCREENSAVER: "15 min", LOCK: "15 min" })
})

test("save: a release where the slider already was writes nothing", { skip }, () => {
  const r = run(json({ screensaver: 400, lock: 900 }), `
    slider("SCREENSAVER").moved(stopIndex(300))
    slider("SCREENSAVER").released(stopIndex(300))
    slider("LOCK").released(stopIndex(900))
    after(400, function () { done(state()) })`)
  assert.deepEqual(r.started, [])
  assert.deepEqual(r.detached, [])
  assert.equal(r.previewScreensaver, -1)
  assert.deepEqual(r.labels, { SCREENSAVER: "6 min 40 s", LOCK: "15 min" }, "a hand-set 400 s is kept")
})

test("save: a release back to the saved value while a write runs is still written", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 300 }), `
    slider("LOCK").released(stopIndex(900))
    slider("LOCK").released(stopIndex(300))
    saveProcess().finish(0)
    done(state())`)
  assert.deepEqual(r.started, [Model.saveCommand(150, 900), Model.saveCommand(150, 300)])
})

const BINDS = require("node:fs").readFileSync(require("node:path").join(__dirname, "fixtures", "binds.json"), "utf8")

test("buttons: Screensaver and Lock sit under the sliders", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 300 }), `
    panel.open()
    var s = button("Screensaver"), l = button("Lock"), lockSlider = slider("LOCK")
    after(50, function () {
      done({ below: s.mapToItem(null, 0, 0).y > lockSlider.mapToItem(null, 0, 0).y,
             sameRow: s.y === l.y, widths: [s.width, l.width], rowWidth: s.parent.width, spacing: s.parent.spacing })
    })`)
  assert.equal(r.below, true)
  assert.equal(r.sameRow, true)
  assert.equal(r.widths[0], r.widths[1])
  assert.equal(r.widths[0] * 2 + r.spacing, r.rowWidth)
})

test("buttons: Screensaver closes the popup, then runs omarchy-launch-screensaver force", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 300 }), `
    panel.open()
    var before = state()
    button("Screensaver").clicked()
    after(400, function () { done({ before: before, after: state() }) })`)
  assert.equal(r.before.opened, true)
  assert.deepEqual(r.before.detached, [])
  assert.equal(r.after.opened, false)
  assert.deepEqual(r.after.detached, [["omarchy-launch-screensaver", "force"]])
  assert.deepEqual(r.after.started, [Model.BINDS_COMMAND], "no write, no restart")
})

test("buttons: Lock closes the popup, then runs omarchy-system-lock", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 300 }), `
    panel.open()
    button("Lock").clicked()
    after(400, function () { done(state()) })`)
  assert.equal(r.opened, false)
  assert.deepEqual(r.detached, [["omarchy-system-lock"]])
  assert.deepEqual(r.started, [Model.BINDS_COMMAND])
})

test("buttons: the popup is already closed when the command is handed over", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 300 }), `
    panel.open()
    var openedAtRun = null
    panel.openedChanged.connect(function () { if (!panel.opened) openedAtRun = Recorder.detached.length })
    button("Lock").clicked()
    done({ detachedWhenClosed: openedAtRun, detached: Recorder.detached.length })`)
  assert.equal(r.detachedWhenClosed, 0)
  assert.equal(r.detached, 1)
})

test("buttons: a click leaves the timeouts alone", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 300 }), `
    panel.open()
    button("Lock").clicked()
    after(400, function () { done(state()) })`)
  assert.deepEqual([r.screensaver, r.lock, r.previewScreensaver, r.previewLock], [150, 300, -1, -1])
})

test("tooltip: the shortcuts come from the binds read when the popup opens", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 300 }), `
    var loaded = state()
    panel.open()
    var reading = state()
    bindsProcess().finish(0, ${JSON.stringify(BINDS)})
    done({ loaded: loaded, reading: reading, read: state() })`)
  assert.deepEqual(r.loaded.tooltips, { Screensaver: "Start screensaver", Lock: "Lock screen" })
  assert.deepEqual(r.reading.tooltips, { Screensaver: "Start screensaver", Lock: "Lock screen" })
  assert.deepEqual(r.read.tooltips, {
    Screensaver: "Start screensaver: Super + Ctrl + Alt + Shift + S",
    Lock: "Lock screen: Super + Shift + F9 or Ctrl + Alt + DELETE or code:201"
  })
})

test("tooltip: with no bind it says there is no shortcut", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 300 }), `
    panel.open()
    bindsProcess().finish(0, "[]")
    done(state())`)
  assert.deepEqual(r.tooltips, { Screensaver: "Start screensaver: no keyboard shortcut", Lock: "Lock screen: no keyboard shortcut" })
})

test("tooltip: a failed read names the action only, and the next open reads again", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 300 }), `
    panel.open()
    bindsProcess().finish(0, ${JSON.stringify(BINDS)})
    panel.close(); panel.open()
    bindsProcess().finish(1, "")
    var failed = state()
    panel.close(); panel.open()
    bindsProcess().finish(0, "[]")
    done({ failed: failed, again: state() })`)
  assert.deepEqual(r.failed.tooltips, { Screensaver: "Start screensaver", Lock: "Lock screen" })
  assert.equal(r.again.tooltips.Lock, "Lock screen: no keyboard shortcut")
  assert.equal(r.again.started.length, 3)
})

test("keyboard: arrows move a cursor over the buttons and Enter presses the one under it", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 300 }), `
    var keys = slider("LOCK").parent.parent.parent
    panel.open()
    keys.activateRequested()
    var none = state()
    keys.moveRequested(1, 0)
    var first = [panel.actionCursor, button("Screensaver").hasCursor, button("Lock").hasCursor]
    keys.moveRequested(1, 0); keys.moveRequested(1, 0)
    var second = [panel.actionCursor, button("Screensaver").hasCursor, button("Lock").hasCursor]
    keys.moveRequested(0, -1)
    var back = panel.actionCursor
    keys.moveRequested(0, 1)
    keys.activateRequested()
    var pressed = state()
    panel.open()
    done({ none: none, first: first, second: second, back: back, pressed: pressed, reopened: state() })`)
  assert.deepEqual(r.none.detached, [], "Enter with no cursor runs nothing")
  assert.equal(r.none.opened, true)
  assert.deepEqual(r.first, [0, true, false])
  assert.deepEqual(r.second, [1, false, true])
  assert.equal(r.back, 0)
  assert.deepEqual(r.pressed.detached, [["omarchy-system-lock"]])
  assert.equal(r.pressed.opened, false)
  assert.equal(r.reopened.cursor, -1, "a new open starts with no cursor")
})

test("keyboard: Left or Up from no cursor lands on Lock", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 300 }), `
    var keys = slider("LOCK").parent.parent.parent
    panel.open()
    keys.moveRequested(-1, 0)
    done(state())`)
  assert.equal(r.cursor, 1)
})

test("tooltip: a new open drops the binds of the last one until its own read ends", { skip }, () => {
  const r = run(json({ screensaver: 150, lock: 300 }), `
    panel.open()
    bindsProcess().finish(0, ${JSON.stringify(BINDS)})
    panel.close(); panel.open()
    done(state())`)
  assert.deepEqual(r.tooltips, { Screensaver: "Start screensaver", Lock: "Lock screen" })
})
