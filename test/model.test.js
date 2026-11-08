// Model.js: slider stops, duration labels, the lock >= screensaver rule,
// the shell.json reader and the exact save command.
const test = require("node:test")
const assert = require("node:assert/strict")
const { Model } = require("./helpers.js")

test("stops: 15 s to 1 h, ascending, finer near the low end", () => {
  assert.deepEqual(Model.STOPS, [15, 30, 45, 60, 90, 120, 150, 180, 300, 600, 900, 1200, 1800, 2700, 3600])
  for (let i = 1; i < Model.STOPS.length; i++) assert.ok(Model.STOPS[i] > Model.STOPS[i - 1])
})

test("stops: Omarchy's defaults (150 s, 300 s) sit on a stop", () => {
  assert.equal(Model.STOPS[Model.indexFor(Model.DEFAULT_SCREENSAVER)], 150)
  assert.equal(Model.STOPS[Model.indexFor(Model.DEFAULT_LOCK)], 300)
})

test("indexFor: exact stops map to themselves", () => {
  Model.STOPS.forEach((s, i) => assert.equal(Model.indexFor(s), i))
})

test("indexFor: off-stop values snap to the nearest stop, the lower one on a tie", () => {
  assert.equal(Model.STOPS[Model.indexFor(1)], 15)
  assert.equal(Model.STOPS[Model.indexFor(100)], 90)
  assert.equal(Model.STOPS[Model.indexFor(105)], 90)
  assert.equal(Model.STOPS[Model.indexFor(240)], 180)
  assert.equal(Model.STOPS[Model.indexFor(241)], 300)
  assert.equal(Model.STOPS[Model.indexFor(86400)], 3600)
})

test("label: seconds, whole minutes, minutes and seconds", () => {
  assert.equal(Model.label(15), "15 s")
  assert.equal(Model.label(45), "45 s")
  assert.equal(Model.label(60), "1 min")
  assert.equal(Model.label(90), "1 min 30 s")
  assert.equal(Model.label(150), "2 min 30 s")
  assert.equal(Model.label(300), "5 min")
  assert.equal(Model.label(2700), "45 min")
  assert.equal(Model.label(3600), "60 min")
})

test("label: every stop has a label", () => {
  assert.deepEqual(Model.STOPS.map(Model.label), [
    "15 s", "30 s", "45 s", "1 min", "1 min 30 s", "2 min", "2 min 30 s", "3 min",
    "5 min", "10 min", "15 min", "20 min", "30 min", "45 min", "60 min"])
})

test("lock >= screensaver: a screensaver above the lock pushes the lock up", () => {
  assert.deepEqual(Model.withScreensaver(600, 300), { screensaver: 600, lock: 600 })
})

test("lock >= screensaver: a screensaver below the lock leaves the lock", () => {
  assert.deepEqual(Model.withScreensaver(60, 300), { screensaver: 60, lock: 300 })
})

test("lock >= screensaver: a lock below the screensaver pulls the screensaver down", () => {
  assert.deepEqual(Model.withLock(60, 150), { screensaver: 60, lock: 60 })
})

test("lock >= screensaver: a lock above the screensaver leaves the screensaver", () => {
  assert.deepEqual(Model.withLock(900, 150), { screensaver: 150, lock: 900 })
})

test("lock >= screensaver: holds for every pair of stops", () => {
  for (const a of Model.STOPS) for (const b of Model.STOPS) {
    const s = Model.withScreensaver(a, b)
    assert.ok(s.lock >= s.screensaver && s.screensaver === a, JSON.stringify([a, b, s]))
    const l = Model.withLock(a, b)
    assert.ok(l.lock >= l.screensaver && l.lock === a, JSON.stringify([a, b, l]))
  }
})

test("parseIdle: no file text, bad JSON, or JSON that is not an object give {}", () => {
  for (const text of ["", "{", "not json", "null", "42", "\"idle\"", "[]"]) {
    assert.deepEqual(Model.parseIdle(text), {}, JSON.stringify(text))
  }
})

test("parseIdle: no idle block, or an idle that is not an object, gives {}", () => {
  assert.deepEqual(Model.parseIdle(JSON.stringify({ bar: {} })), {})
  assert.deepEqual(Model.parseIdle(JSON.stringify({ idle: null })), {})
  assert.deepEqual(Model.parseIdle(JSON.stringify({ idle: 300 })), {})
  assert.deepEqual(Model.parseIdle(JSON.stringify({ idle: "300" })), {})
})

test("parseIdle: a full idle block is returned as is", () => {
  const idle = Model.parseIdle(JSON.stringify({ version: 1, idle: { screensaver: 60, lock: 120 } }))
  assert.deepEqual(idle, { screensaver: 60, lock: 120 })
  assert.equal(Model.screensaverSeconds(idle), 60)
  assert.equal(Model.lockSeconds(idle), 120)
})

test("defaults: no idle block reads as Omarchy's 150 s and 300 s", () => {
  const idle = Model.parseIdle(JSON.stringify({ version: 1 }))
  assert.equal(Model.screensaverSeconds(idle), 150)
  assert.equal(Model.lockSeconds(idle), 300)
})

test("defaults: a partial idle block fills the missing value", () => {
  assert.equal(Model.lockSeconds(Model.parseIdle(JSON.stringify({ idle: { screensaver: 60 } }))), 300)
  assert.equal(Model.screensaverSeconds(Model.parseIdle(JSON.stringify({ idle: { lock: 900 } }))), 150)
})

test("defaults: non-numeric values fall back", () => {
  const idle = { screensaver: "soon", lock: {} }
  assert.equal(Model.screensaverSeconds(idle), 150)
  assert.equal(Model.lockSeconds(idle), 300)
  assert.equal(Model.screensaverSeconds(undefined), 150)
})

test("saveCommand: the exact array, values as positional arguments", () => {
  assert.deepEqual(Model.saveCommand(150, 300), [
    "bash", "-c",
    "source omarchy-shell-config && commit \"$NORMALIZE | .idle = ((.idle | if type == \\\"object\\\" then . else {} end) + {screensaver: \\$s, lock: \\$l})\" --argjson s \"$1\" --argjson l \"$2\"",
    "_", "150", "300"])
})

test("saveCommand: the script text never changes with the values", () => {
  for (const [s, l] of [[15, 15], [600, 3600], ["$(touch pwned)", "\"; rm -rf ~ #"]]) {
    const cmd = Model.saveCommand(s, l)
    assert.equal(cmd.length, 6)
    assert.equal(cmd[2], Model.SAVE_SCRIPT)
    assert.deepEqual(cmd.slice(3), ["_", String(s), String(l)])
  }
})

test("restart command: the idle service is toggled off and on only while idle is on", () => {
  assert.deepEqual(Model.RESTART_COMMAND, ["bash", "-c",
    "omarchy-shell idle status | jq -e '.enabled == true' >/dev/null || exit 0; omarchy-shell idle disable; omarchy-shell idle enable"])
})

test("off: 0 reads as 0 (Omarchy's 'this action is off'), not as the default", () => {
  assert.equal(Model.screensaverSeconds({ screensaver: 0 }), 0)
  assert.equal(Model.lockSeconds({ lock: 0 }), 0)
})

test("off: values are read the way Omarchy's idle service reads them", () => {
  // IdleModel.secondsFromConfig: not finite or negative -> default; else floor.
  assert.equal(Model.screensaverSeconds({ screensaver: -5 }), 150)
  assert.equal(Model.lockSeconds({ lock: "soon" }), 300)
  assert.equal(Model.lockSeconds({ lock: "600" }), 600)
  assert.equal(Model.screensaverSeconds({ screensaver: 90.7 }), 90)
})

test("off: the label says Off", () => {
  assert.equal(Model.label(0), "Off")
})

test("off: a new screensaver leaves a lock that is off, off", () => {
  assert.deepEqual(Model.withScreensaver(600, 0), { screensaver: 600, lock: 0 })
})

test("off: a new lock leaves a screensaver that is off, off", () => {
  assert.deepEqual(Model.withLock(600, 0), { screensaver: 0, lock: 600 })
})

test("forSet: keeps lock >= screensaver, and 0 as off", () => {
  assert.deepEqual(Model.forSet(300, 600), { screensaver: 300, lock: 600 })
  assert.deepEqual(Model.forSet(600, 300), { screensaver: 600, lock: 600 })
  assert.deepEqual(Model.forSet(0, 300), { screensaver: 0, lock: 300 })
  assert.deepEqual(Model.forSet(300, 0), { screensaver: 300, lock: 0 })
  assert.deepEqual(Model.forSet(0, 0), { screensaver: 0, lock: 0 })
})

test("forSet: negative or non-integer seconds are refused", () => {
  for (const [s, l] of [[-5, 10], [10, -1], [1.5, 10], [NaN, 10], ["300", 600], [10, Infinity]]) {
    assert.equal(Model.forSet(s, l), null, JSON.stringify([s, l]))
  }
})
