import QtQuick

// Holds the output a test hands to Process.finish().
QtObject {
  property bool waitForEnd: false
  property string text: ""
  signal streamFinished()
}
