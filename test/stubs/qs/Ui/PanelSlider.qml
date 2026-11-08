import QtQuick
import qs.Commons
import Stub

// Track, fill, notches and knob as Omarchy draws them; moved()/released()
// are emitted by the tests, not by a pointer.
Item {
  id: root
  property QtObject bar: null
  property real value: 0
  property real minimum: 0
  property real maximum: 1
  property real step: 0.05
  property bool integer: false
  property int tickCount: 0
  signal moved(real value)
  signal released(real value)

  readonly property real trackHeight: Math.max(4, Math.round(Style.spacing.controlHeight * 0.11))
  readonly property real knobSize: Math.max(14, Math.round(Style.spacing.controlHeight * 0.38))
  readonly property real progress: Math.max(0, Math.min(1, (value - minimum) / Math.max(0.0001, maximum - minimum)))
  readonly property color foreground: bar ? bar.foreground : "#cdd6f4"
  readonly property color background: bar ? bar.background : "#1e1e2e"

  implicitWidth: Style.space(200)
  implicitHeight: Math.max(Style.space(22), knobSize + Style.spacing.md)
  Component.onCompleted: Recorder.sliders = Recorder.sliders.concat([root])

  Rectangle {
    id: track
    anchors.verticalCenter: parent.verticalCenter
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.leftMargin: root.knobSize / 2
    anchors.rightMargin: root.knobSize / 2
    height: root.trackHeight
    radius: height / 2
    color: Style.selectedFillFor(root.foreground)
  }
  Rectangle {
    anchors.verticalCenter: track.verticalCenter
    anchors.left: track.left
    height: track.height
    radius: track.radius
    color: root.foreground
    width: track.width * root.progress
  }
  Repeater {
    model: root.tickCount > 1 ? root.tickCount : 0
    Rectangle {
      required property int index
      width: Math.max(1, Style.space(2))
      height: root.trackHeight + Style.space(4)
      radius: 1
      color: root.background
      anchors.verticalCenter: track.verticalCenter
      x: track.x + track.width * index / (root.tickCount - 1) - width / 2
    }
  }
  Rectangle {
    width: root.knobSize
    height: root.knobSize
    radius: width / 2
    color: root.foreground
    border.width: Math.max(1, Style.space(2))
    border.color: root.background
    anchors.verticalCenter: track.verticalCenter
    x: track.x + track.width * root.progress - width / 2
  }
}
