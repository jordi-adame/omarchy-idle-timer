pragma Singleton
import QtQuick

// What the stubs saw: the HOME the panel reads, the commands handed to
// Process and execDetached (recorded, never run), and the rendered parts.
QtObject {
  property string home: ""
  property var processes: []
  property var started: []
  property var detached: []
  property var sliders: []
  property Item card: null
}
