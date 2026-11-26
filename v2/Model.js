// Idle timer model: slider stops, labels, the lock >= screensaver rule, the
// shell.json reader, the save command, the two actions (screensaver now,
// lock now) and their keyboard shortcuts from `hyprctl binds -j`. Plain JS so Node tests can load it
// (module.exports at the bottom) and QML can import it.

// Slider positions map to these seconds; finer near the low end.
var STOPS = [15, 30, 45, 60, 90, 120, 150, 180, 300, 600, 900, 1200, 1800, 2700, 3600]

// Omarchy's idle service fallbacks when shell.json has no idle values.
var DEFAULT_SCREENSAVER = 150
var DEFAULT_LOCK = 300

// The idle block of a shell.json text; {} when the file is empty, not JSON,
// or has no idle object.
function parseIdle(text) {
  try {
    var config = JSON.parse(text)
    return config && config.idle && typeof config.idle === "object" ? config.idle : ({})
  } catch (e) {
    return ({})
  }
}

// Read the way Omarchy's idle service reads it (IdleModel.secondsFromConfig):
// 0 means that action is off; a missing, non-numeric or negative value means
// the default.
function secondsOr(value, fallback) {
  var n = Number(value)
  if (!isFinite(n) || n < 0) return fallback
  return Math.floor(n)
}

function screensaverSeconds(idle) {
  return secondsOr(idle && idle.screensaver, DEFAULT_SCREENSAVER)
}

function lockSeconds(idle) {
  return secondsOr(idle && idle.lock, DEFAULT_LOCK)
}

// The slider position closest to `seconds`.
function indexFor(seconds) {
  var best = 0
  for (var i = 0; i < STOPS.length; i++) {
    if (Math.abs(STOPS[i] - seconds) < Math.abs(STOPS[best] - seconds)) best = i
  }
  return best
}

// True when `seconds` is the stop `current` already shows at, so releasing
// the slider there changes nothing. Off (0) shows at the first stop, but a
// release there turns it on.
function sameStop(seconds, current) {
  return current > 0 && seconds === STOPS[indexFor(current)]
}

function label(seconds) {
  if (seconds === 0) return "Off"
  if (seconds < 60) return seconds + " s"
  if (seconds % 60 === 0) return (seconds / 60) + " min"
  return Math.floor(seconds / 60) + " min " + (seconds % 60) + " s"
}

// Keep lock >= screensaver so the screensaver always shows first. A new
// screensaver pushes the lock up; a new lock pulls the screensaver down. A
// value that is off (0) stays off: an action that is off never comes first.
function withScreensaver(seconds, lock) {
  return { screensaver: seconds, lock: lock === 0 ? 0 : Math.max(seconds, lock) }
}

function withLock(seconds, screensaver) {
  return { screensaver: Math.min(screensaver, seconds), lock: seconds }
}

// Both values at once (the IPC set call): whole seconds >= 0, 0 being off;
// null for anything else. The lock moves up to the screensaver unless off.
function forSet(screensaver, lock) {
  var valid = function(n) { return typeof n === "number" && Number.isInteger(n) && n >= 0 }
  if (!valid(screensaver) || !valid(lock)) return null
  return withScreensaver(screensaver, lock)
}

// The command that writes both values through Omarchy's own shell.json
// helper (omarchy-shell-config's commit: jq, tmp file, rename, shell reload).
// The values are positional arguments ($1, $2) handed to jq with --argjson,
// never part of the script text.
var SAVE_SCRIPT = "source omarchy-shell-config && commit \"$NORMALIZE | .idle = ((.idle | if type == \\\"object\\\" then . else {} end) + {screensaver: \\$s, lock: \\$l})\" --argjson s \"$1\" --argjson l \"$2\""

function saveCommand(screensaver, lock) {
  return ["bash", "-c", SAVE_SCRIPT, "_", String(screensaver), String(lock)]
}

// Changing IdleMonitor.timeout on a live shell leaves the monitor never
// reporting idle again. Toggling the idle service off and on recreates the
// Wayland idle notification with the new timeout. `idle disable` / `enable`
// are also Omarchy's persisted Stay Awake toggle, so the restart runs only
// while idle is on. With Stay Awake on, the monitor is disabled and is
// enabled again when Stay Awake ends.
var RESTART_COMMAND = ["bash", "-c",
  "omarchy-shell idle status | jq -e '.enabled == true' >/dev/null || exit 0; omarchy-shell idle disable; omarchy-shell idle enable"]

// The two buttons. Each runs one of Omarchy's public commands, so it works
// with the built-in idle and lock services and with replacements. `force`
// starts the screensaver even when it is toggled off, as Omarchy's menu does.
// A keyboard shortcut is a Hyprland bind whose description is one of
// `descriptions` (Lua-config binds show only a description), or an exec bind
// that runs the command.
var ACTIONS = {
  screensaver: {
    label: "Screensaver",
    hint: "Start screensaver",
    command: ["omarchy-launch-screensaver", "force"],
    descriptions: ["screensaver", "launch screensaver", "start screensaver"]
  },
  lock: {
    label: "Lock",
    hint: "Lock screen",
    command: ["omarchy-system-lock"],
    descriptions: ["lock system"]
  }
}

// Read-only: the user's own Hyprland binds, read when the popup opens.
var BINDS_COMMAND = ["hyprctl", "binds", "-j"]

// The bind list from `hyprctl binds -j` output; null when it is not a JSON
// array (hyprctl missing or failing), so "no shortcut" is never claimed
// without having read the binds.
function parseBinds(text) {
  try {
    var binds = JSON.parse(text)
    return Array.isArray(binds) ? binds : null
  } catch (e) {
    return null
  }
}

// Hyprland's modmask bits, in the order shortcuts are usually written.
var MODIFIERS = [
  [64, "Super"], [4, "Ctrl"], [8, "Alt"], [1, "Shift"],
  [2, "Caps"], [16, "Mod2"], [32, "Mod3"], [128, "Mod5"]
]

function modifierNames(modmask) {
  var mask = Number(modmask) || 0
  var names = []
  for (var i = 0; i < MODIFIERS.length; i++) {
    if (mask & MODIFIERS[i][0]) names.push(MODIFIERS[i][1])
  }
  return names
}

// The key of a bind: "L", "Return", "code:201" for a keycode bind; "" when
// the bind names no key.
function keyName(bind) {
  var key = typeof bind.key === "string" ? bind.key.trim() : ""
  if (key === "") return Number(bind.keycode) > 0 ? "code:" + Number(bind.keycode) : ""
  return key.charAt(0).toUpperCase() + key.slice(1)
}

// "Super + Ctrl + L"; "" when the bind names no key.
function shortcutText(bind) {
  var key = keyName(bind)
  return key === "" ? "" : modifierNames(bind.modmask).concat([key]).join(" + ")
}

function runsCommand(bind, name) {
  if (bind.dispatcher !== "exec" || typeof bind.arg !== "string") return false
  var words = bind.arg.split(/[\s;&|()]+/)
  for (var i = 0; i < words.length; i++) {
    if (words[i] === name || words[i].slice(-name.length - 1) === "/" + name) return true
  }
  return false
}

function matchesAction(bind, action) {
  if (!bind || typeof bind !== "object") return false
  // A bind inside a submap needs another key first.
  if (typeof bind.submap === "string" && bind.submap !== "") return false
  var description = typeof bind.description === "string" ? bind.description.trim().toLowerCase() : ""
  return action.descriptions.indexOf(description) >= 0 || runsCommand(bind, action.command[0])
}

// Every shortcut bound to the action, in bind order, each once.
function shortcutsFor(binds, action) {
  var found = []
  for (var i = 0; i < (binds ? binds.length : 0); i++) {
    if (!matchesAction(binds[i], action)) continue
    var text = shortcutText(binds[i])
    if (text !== "" && found.indexOf(text) < 0) found.push(text)
  }
  return found
}

// The button's tooltip: "Lock screen: Super + Ctrl + L or Super + Ctrl + Q",
// "Lock screen: no keyboard shortcut" when the binds have none, and the hint
// alone when the binds could not be read (null).
function actionTooltip(action, binds) {
  if (!binds) return action.hint
  var shortcuts = shortcutsFor(binds, action)
  return action.hint + ": " + (shortcuts.length ? shortcuts.join(" or ") : "no keyboard shortcut")
}

if (typeof module !== "undefined") {
  module.exports = {
    STOPS: STOPS,
    DEFAULT_SCREENSAVER: DEFAULT_SCREENSAVER,
    DEFAULT_LOCK: DEFAULT_LOCK,
    SAVE_SCRIPT: SAVE_SCRIPT,
    RESTART_COMMAND: RESTART_COMMAND,
    parseIdle: parseIdle,
    secondsOr: secondsOr,
    screensaverSeconds: screensaverSeconds,
    lockSeconds: lockSeconds,
    indexFor: indexFor,
    sameStop: sameStop,
    label: label,
    withScreensaver: withScreensaver,
    withLock: withLock,
    forSet: forSet,
    saveCommand: saveCommand,
    ACTIONS: ACTIONS,
    BINDS_COMMAND: BINDS_COMMAND,
    parseBinds: parseBinds,
    modifierNames: modifierNames,
    keyName: keyName,
    shortcutText: shortcutText,
    matchesAction: matchesAction,
    shortcutsFor: shortcutsFor,
    actionTooltip: actionTooltip
  }
}
