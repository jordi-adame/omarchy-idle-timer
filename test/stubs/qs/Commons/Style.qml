pragma Singleton
import QtQuick

// Omarchy's Style at the default 12 px base size: space() is identity,
// the font tokens are the shell's defaults.
QtObject {
  function space(px) { var n = Number(px); return n > 0 ? Math.max(1, Math.round(n)) : 0 }
  function duration(ms) { return ms }
  function selectedFillFor(foreground) { return Qt.rgba(foreground.r, foreground.g, foreground.b, 0.18) }
  readonly property QtObject font: QtObject {
    readonly property string family: "monospace"
    readonly property int caption: 10
    readonly property int bodySmall: 11
  }
  readonly property QtObject spacing: QtObject {
    readonly property int md: 6
    readonly property int controlHeight: 28
    readonly property int popupPadding: 14
  }
}
