import QtQuick
import Stub

// Records the command when started; the test ends it with finish().
QtObject {
  id: root
  property var command: []
  property bool running: false
  signal exited(int exitCode, int exitStatus)

  Component.onCompleted: Recorder.processes = Recorder.processes.concat([root])
  onRunningChanged: if (running) Recorder.started = Recorder.started.concat([command])
  function finish(code) {
    running = false
    exited(code, 0)
  }
}
