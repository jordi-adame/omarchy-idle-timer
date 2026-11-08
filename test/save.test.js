// The save script, run for real under bash and jq against a fake
// omarchy-shell-config (first on PATH) whose commit() writes jq's output to a
// file in a temp dir. The real helper is never sourced, so neither the user's
// shell.json nor the running shell is touched; its NORMALIZE is copied as
// text for one test when Omarchy is installed.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { Model, tmpdir } = require("./helpers.js")

const hasJq = spawnSync("jq", ["--version"]).status === 0

// The fake helper: NORMALIZE is a no-op, commit mirrors the real one's
// argument order (jq -S -e <extra args> <program> <file>).
const FAKE = `NORMALIZE='.'
commit() {
  local program="$1"
  shift
  jq -S -e "$@" "$program" "$CONFIG_FILE" > "$CONFIG_FILE.out"
}
`

// Omarchy's own NORMALIZE, copied as text out of the installed helper (never
// sourced: its commit reloads the running shell). null when not installed.
const HELPER = ["/usr/share/omarchy/bin/omarchy-shell-config", process.env.OMARCHY_PATH && path.join(process.env.OMARCHY_PATH, "bin", "omarchy-shell-config")]
  .find((p) => p && fs.existsSync(p))
const REAL_NORMALIZE = HELPER ? (fs.readFileSync(HELPER, "utf8").match(/^NORMALIZE='[^']*'$/m) || [null])[0] : null

function save(config, screensaver, lock, normalize = "NORMALIZE='.'") {
  const dir = tmpdir("save")
  const bin = path.join(dir, "bin")
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, "omarchy-shell-config"), FAKE.replace("NORMALIZE='.'", normalize))
  const file = path.join(dir, "shell.json")
  fs.writeFileSync(file, JSON.stringify(config))
  const [cmd, ...args] = Model.saveCommand(screensaver, lock)
  const res = spawnSync(cmd, args, {
    cwd: dir, encoding: "utf8",
    env: { PATH: bin + ":" + process.env.PATH, HOME: dir, CONFIG_FILE: file }
  })
  const out = fs.existsSync(file + ".out") && fs.statSync(file + ".out").size > 0 ? JSON.parse(fs.readFileSync(file + ".out", "utf8")) : null
  return { res, out, dir }
}

test("save: writes both values as numbers and keeps the rest of the file", { skip: !hasJq && "jq not installed" }, () => {
  const { res, out } = save({ version: 1, bar: { layout: { right: ["omarchy.clock"] } }, idle: { other: true, screensaver: 60 } }, 150, 300)
  assert.equal(res.status, 0, res.stderr)
  assert.deepEqual(out, { version: 1, bar: { layout: { right: ["omarchy.clock"] } }, idle: { other: true, screensaver: 150, lock: 300 } })
})

test("save: no idle block, or an idle that is not an object, becomes a fresh idle block", { skip: !hasJq && "jq not installed" }, () => {
  assert.deepEqual(save({ version: 1 }, 45, 90).out, { version: 1, idle: { screensaver: 45, lock: 90 } })
  assert.deepEqual(save({ idle: "x" }, 45, 90).out, { idle: { screensaver: 45, lock: 90 } })
})

test("save: values are data for jq, never shell or jq code", { skip: !hasJq && "jq not installed" }, () => {
  const { res, out, dir } = save({ idle: {} }, "$(touch pwned)", "1) | .owned = true | (1")
  assert.notEqual(res.status, 0, "jq rejects a value that is not JSON")
  assert.equal(out, null, "nothing written")
  assert.equal(fs.existsSync(path.join(dir, "pwned")), false, "no command substitution")
})

test("save: composes with Omarchy's own NORMALIZE", { skip: (!hasJq && "jq not installed") || (!REAL_NORMALIZE && "Omarchy not installed") }, () => {
  const { res, out } = save({ idle: { screensaver: 60 }, bar: {} }, 150, 300, REAL_NORMALIZE)
  assert.equal(res.status, 0, res.stderr)
  assert.deepEqual(out.idle, { screensaver: 150, lock: 300 })
  assert.equal(out.version, 1, "normalized")
})
