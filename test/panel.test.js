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
function stopIndex(seconds) { return panel.stops.indexOf(seconds) }
function state() {
  return {
    screensaver: panel.screensaverSeconds, lock: panel.lockSeconds,
    previewScreensaver: panel.previewScreensaver, previewLock: panel.previewLock,
    sliders: { SCREENSAVER: slider("SCREENSAVER").value, LOCK: slider("LOCK").value },
    labels: { SCREENSAVER: label("SCREENSAVER"), LOCK: label("LOCK") },
    started: Recorder.started, detached: Recorder.detached
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

test("consent: loading and opening the popup write nothing and restart nothing", { skip }, () => {
  const r = run(json({ screensaver: 60, lock: 30 }), `
    panel.open()
    after(400, function () { panel.close(); panel.toggle(); after(400, function () { done(state()) }) })`)
  assert.deepEqual(r.started, [])
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
    var save = Recorder.processes[0]
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
    Recorder.processes[0].finish(1)
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
    Recorder.processes[0].finish(0)
    var queued = state()
    Recorder.processes[0].finish(0)
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
    Recorder.processes[0].finish(1)
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
