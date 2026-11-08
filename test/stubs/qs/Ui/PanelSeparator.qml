import QtQuick

Rectangle {
  property color foreground: "#cdd6f4"
  property real strength: 0.12
  width: parent ? parent.width : implicitWidth
  implicitWidth: 100
  implicitHeight: 1
  height: 1
  color: Qt.rgba(foreground.r, foreground.g, foreground.b, strength)
}
