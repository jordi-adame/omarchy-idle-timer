// Renders the popup (both sliders) from the real Panel.qml the manifest loads,
// with the Qt offscreen platform and the stubs in test/stubs, and saves a PNG. No window,
// no compositor; nothing is written or restarted.
//
//   TMPDIR=<scratch> node tools/render-preview.js <out.png> [screensaver] [lock]
//
// Seconds default to Omarchy's 150 and 300. The image is drawn at 2x.
const path = require("node:path")
const { runPanel } = require(path.resolve(__dirname, "..", "test", "helpers.js"))

const out = process.argv[2] && path.resolve(process.argv[2])
const screensaver = Number(process.argv[3] || 150)
const lock = Number(process.argv[4] || 300)
if (!out || !(screensaver > 0) || !(lock > 0) || process.argv.length > 5) {
  console.error("usage: render-preview.js <out.png> [screensaver seconds] [lock seconds]")
  process.exit(2)
}

const { result, output } = runPanel({
  shellJson: JSON.stringify({ version: 1, idle: { screensaver, lock } }),
  env: { QT_SCALE_FACTOR: "2" },
  script: `
    panel.open()
    var card = Recorder.card.children[0]
    var win = Recorder.card.parent
    win.width = card.width + 24
    win.height = card.height + 24
    after(300, function () {
      win.grabToImage(function (image) {
        done({ ok: image.saveToFile(${JSON.stringify(out)}), card: [card.width, card.height],
               started: Recorder.started.length, detached: Recorder.detached.length })
      })
    })`
})
if (!result || !result.ok) { console.error(output); process.exit(1) }
console.log("PREVIEW " + JSON.stringify(result))
