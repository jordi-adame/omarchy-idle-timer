// The manifest and the shipped tree: one version folder, the id everywhere.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { PLUGIN, MANIFEST, VERSION_DIR, PANEL } = require("./helpers.js")

const ID = "io.github.jordi-adame.idle-timer"

test("manifest: id, version, author and the bar widget block", () => {
  assert.equal(MANIFEST.schemaVersion, 1)
  assert.equal(MANIFEST.id, ID)
  assert.match(MANIFEST.version, /^\d+\.\d+\.\d+$/)
  assert.equal(MANIFEST.author, "Jordi Adame")
  assert.deepEqual(MANIFEST.kinds, ["bar-widget"])
  assert.equal(MANIFEST.barWidget.category, "System")
  assert.equal(MANIFEST.barWidget.allowMultiple, false)
  assert.equal(MANIFEST.barWidget.defaultSection, "right")
})

test("manifest: the entry point exists and is the only version folder", () => {
  assert.ok(fs.existsSync(PANEL), PANEL)
  const versions = fs.readdirSync(PLUGIN).filter((f) => /^v\d+$/.test(f))
  assert.deepEqual(versions, [path.basename(VERSION_DIR)])
  assert.equal(fs.existsSync(path.join(PLUGIN, "Panel.qml")), false, "no stray root Panel.qml")
})

test("Panel.qml: moduleName, ipcTarget and the IpcHandler use the plugin id", () => {
  const qml = fs.readFileSync(PANEL, "utf8")
  assert.match(qml, new RegExp('moduleName: "' + ID.replace(/\./g, "\\.") + '"'))
  assert.match(qml, new RegExp('ipcTarget: "' + ID.replace(/\./g, "\\.") + '"'))
  assert.match(qml, new RegExp('target: "' + ID.replace(/\./g, "\\.") + '"'))
  const ids = qml.match(/"[a-z0-9.-]*idle-timer"/g)
  assert.deepEqual([...new Set(ids)], ['"' + ID + '"'])
})
