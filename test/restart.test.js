// The idle restart, run for real under bash against a fake omarchy-shell
// (first on PATH) that logs its arguments and answers `idle status` with the
// JSON in $STATUS. Omarchy's `idle disable` / `idle enable` IPC calls are its
// Stay Awake toggle and persist it, so a restart must never run while Stay
// Awake is on, or it would turn Stay Awake off.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { Model, tmpdir } = require("./helpers.js")

const hasJq = spawnSync("jq", ["--version"]).status === 0

function restart(status) {
  const dir = tmpdir("restart")
  const bin = path.join(dir, "bin")
  fs.mkdirSync(bin)
  const log = path.join(dir, "calls.log")
  fs.writeFileSync(path.join(bin, "omarchy-shell"), `#!/bin/bash
printf '%s\\n' "$*" >> "${log}"
if [[ "$*" == "idle status" ]]; then
  [[ -n $STATUS ]] || exit 1
  printf '%s\\n' "$STATUS"
fi
`, { mode: 0o755 })
  const [cmd, ...args] = Model.RESTART_COMMAND
  const res = spawnSync(cmd, args, { encoding: "utf8", env: { PATH: bin + ":" + process.env.PATH, HOME: dir, STATUS: status } })
  const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : []
  return { res, calls }
}

test("restart: idle on, the service is toggled off and on", { skip: !hasJq && "jq not installed" }, () => {
  const { res, calls } = restart(JSON.stringify({ enabled: true, stayAwake: false }))
  assert.equal(res.status, 0, res.stderr)
  assert.deepEqual(calls, ["idle status", "idle disable", "idle enable"])
})

test("restart: Stay Awake on, nothing is toggled, so Stay Awake stays on", { skip: !hasJq && "jq not installed" }, () => {
  const { res, calls } = restart(JSON.stringify({ enabled: false, stayAwake: true }))
  assert.equal(res.status, 0, res.stderr)
  assert.deepEqual(calls, ["idle status"])
})

test("restart: no idle service answering, nothing is toggled", { skip: !hasJq && "jq not installed" }, () => {
  const { calls } = restart("")
  assert.deepEqual(calls, ["idle status"])
})
