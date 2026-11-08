// Idle timer model: slider stops, labels, the lock >= screensaver rule, the
// shell.json reader and the save command. Plain JS so Node tests can load it
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
    label: label,
    withScreensaver: withScreensaver,
    withLock: withLock,
    forSet: forSet,
    saveCommand: saveCommand
  }
}
