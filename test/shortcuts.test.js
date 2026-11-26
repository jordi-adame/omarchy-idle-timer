// The buttons' keyboard shortcuts: modmask decoding, matching binds to an
// action and the tooltip text. The fixture is shaped like `hyprctl binds -j`
// output, with made-up binds.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { Model } = require("./helpers.js")

const FIXTURE = fs.readFileSync(path.join(__dirname, "fixtures", "binds.json"), "utf8")
const binds = Model.parseBinds(FIXTURE)
const { screensaver, lock } = Model.ACTIONS

test("actions: each button runs one public Omarchy command, as an argv array", () => {
  assert.deepEqual(screensaver.command, ["omarchy-launch-screensaver", "force"])
  assert.deepEqual(lock.command, ["omarchy-system-lock"])
  assert.deepEqual(Model.BINDS_COMMAND, ["hyprctl", "binds", "-j"])
})

test("parseBinds: an array, or null for anything else", () => {
  assert.equal(binds.length, 11)
  for (const text of ["", "{ bad", "{}", "null", "\"x\"", "Couldn't connect to Hyprland"]) {
    assert.equal(Model.parseBinds(text), null, text)
  }
  assert.deepEqual(Model.parseBinds("[]"), [])
})

test("modifierNames: every modmask bit has its name", () => {
  for (const [mask, name] of [[1, "Shift"], [2, "Caps"], [4, "Ctrl"], [8, "Alt"], [16, "Mod2"], [32, "Mod3"], [64, "Super"], [128, "Mod5"]]) {
    assert.deepEqual(Model.modifierNames(mask), [name])
  }
  assert.deepEqual(Model.modifierNames(0), [])
  assert.deepEqual(Model.modifierNames(undefined), [])
  assert.deepEqual(Model.modifierNames(68), ["Super", "Ctrl"])
  assert.deepEqual(Model.modifierNames(77), ["Super", "Ctrl", "Alt", "Shift"])
  assert.equal(Model.modifierNames(255).length, 8)
})

test("shortcutText: modifiers, then the key", () => {
  assert.equal(Model.shortcutText({ modmask: 68, key: "L" }), "Super + Ctrl + L")
  assert.equal(Model.shortcutText({ modmask: 0, key: "XF86Launch1" }), "XF86Launch1")
  assert.equal(Model.shortcutText({ modmask: 1, key: "s" }), "Shift + S")
  assert.equal(Model.shortcutText({ modmask: 64, key: "", keycode: 201 }), "Super + code:201")
  assert.equal(Model.shortcutText({ modmask: 64, key: "", keycode: 0 }), "")
})

test("shortcutsFor: binds matched by description, each shortcut once, submaps and keyless binds left out", () => {
  assert.deepEqual(Model.shortcutsFor(binds, lock), ["Super + Shift + F9", "Ctrl + Alt + DELETE", "code:201"])
})

test("shortcutsFor: a description that only contains the words does not match", () => {
  const some = binds.filter((b) => /lock/i.test(b.description) && b.description !== "Lock system")
  assert.equal(some.length, 2)
  assert.deepEqual(Model.shortcutsFor(some, lock), [])
})

test("shortcutsFor: an exec bind that runs the command matches; one that only mentions it does not", () => {
  assert.deepEqual(Model.shortcutsFor(binds, screensaver), ["Super + Ctrl + Alt + Shift + S"])
  assert.equal(Model.matchesAction({ dispatcher: "exec", arg: "/usr/bin/omarchy-system-lock" }, lock), true)
  assert.equal(Model.matchesAction({ dispatcher: "exec", arg: "sleep 1; omarchy-system-lock" }, lock), true)
  assert.equal(Model.matchesAction({ dispatcher: "exec", arg: "omarchy-system-lockdown" }, lock), false)
  assert.equal(Model.matchesAction({ dispatcher: "__lua", arg: "omarchy-system-lock" }, lock), false)
})

test("shortcutsFor: the command must be what the exec bind runs, not an argument", () => {
  const exec = (arg) => Model.matchesAction({ dispatcher: "exec", arg }, lock)
  for (const arg of ["uwsm app -- omarchy-system-lock", "uwsm-app -- omarchy-system-lock", "bash -c \"omarchy-system-lock\"",
    "bash -c 'sleep 1 && omarchy-system-lock'", "setsid omarchy-system-lock", "(omarchy-system-lock)"]) {
    assert.equal(exec(arg), true, arg)
  }
  for (const arg of ["pkill -f omarchy-system-lock", "omarchy-cmd-present omarchy-system-lock && notify-send hi",
    "notify-send 'omarchy-system-lock'", ""]) {
    assert.equal(exec(arg), false, arg)
  }
})

test("shortcutsFor: a description match ignores case and outer spaces", () => {
  assert.deepEqual(Model.shortcutsFor([{ modmask: 64, key: "F1", description: " lock SYSTEM " }], lock), ["Super + F1"])
  assert.deepEqual(Model.shortcutsFor([{ modmask: 64, key: "F2", description: "Screensaver" }], screensaver), ["Super + F2"])
})

test("shortcutsFor: junk entries and no binds give no shortcuts", () => {
  assert.deepEqual(Model.shortcutsFor([null, 3, "x", {}, { description: 7, key: 9 }], lock), [])
  assert.deepEqual(Model.shortcutsFor([], lock), [])
  assert.deepEqual(Model.shortcutsFor(null, lock), [])
})

test("actionTooltip: all shortcuts joined with or", () => {
  assert.equal(Model.actionTooltip(lock, binds), "Lock screen: Super + Shift + F9 or Ctrl + Alt + DELETE or code:201")
  assert.equal(Model.actionTooltip(screensaver, binds), "Start screensaver: Super + Ctrl + Alt + Shift + S")
})

test("actionTooltip: no bind says so; never an invented shortcut", () => {
  assert.equal(Model.actionTooltip(screensaver, []), "Start screensaver: no keyboard shortcut")
  assert.equal(Model.actionTooltip(lock, binds.filter((b) => b.description !== "Lock system")), "Lock screen: no keyboard shortcut")
})

test("actionTooltip: binds that could not be read give the action alone", () => {
  assert.equal(Model.actionTooltip(lock, null), "Lock screen")
  assert.equal(Model.actionTooltip(screensaver, Model.parseBinds("")), "Start screensaver")
})

test("shortcutsFor: mouse binds are not keyboard shortcuts", () => {
  assert.deepEqual(Model.shortcutsFor([
    { modmask: 64, key: "mouse:272", description: "Lock system" },
    { modmask: 64, key: "mouse_down", description: "Lock system" },
    { modmask: 64, key: "M", mouse: true, description: "Lock system" }
  ], lock), [])
})
