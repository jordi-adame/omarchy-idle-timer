import QtQuick
import qs.Commons
import Stub

// The bordered text button as Omarchy draws it at rest and under the
// keyboard cursor; clicked() is emitted by the tests, not by a pointer.
Rectangle {
  id: root
  property string text: ""
  property string tooltipText: ""
  property bool hasCursor: false
  property bool bordered: false
  property color foreground: "#cdd6f4"
  property string fontFamily: Style.font.family
  property real fontSize: Style.font.body
  signal clicked()

  implicitWidth: label.implicitWidth + 2 * (Style.spacing.controlPaddingX + 1)
  implicitHeight: label.implicitHeight + 2 * (Style.spacing.controlPaddingY + 1)
  color: hasCursor ? Style.selectedFillFor(foreground) : "transparent"
  border.width: bordered || hasCursor ? 1 : 0
  border.color: hasCursor ? foreground : Qt.rgba(foreground.r, foreground.g, foreground.b, 0.35)
  Component.onCompleted: Recorder.buttons = Recorder.buttons.concat([root])

  Text {
    id: label
    anchors.centerIn: parent
    textFormat: Text.PlainText
    text: root.text
    color: root.foreground
    font.family: root.fontFamily
    font.pixelSize: root.fontSize
  }
}
