import QtQuick

Item {
  property QtObject bar: null
  property string text: ""
  property string tooltipText: ""
  signal pressed(var button)
  implicitWidth: 24
  implicitHeight: 24
}
