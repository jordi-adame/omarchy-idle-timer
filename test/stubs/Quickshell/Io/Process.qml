import QtQuick
import Stub

// Records the command when started; the test ends it with finish(), handing
// over the output a stdout collector would have read.
QtObject {
  id: root
  property var command: []
  property bool running: false
  property QtObject stdout: null
  signal exited(int exitCode, int exitStatus)

  Component.onCompleted: Recorder.processes = Recorder.processes.concat([root])
  onRunningChanged: if (running) Recorder.started = Recorder.started.concat([command])
  function finish(code, output) {
    running = false
    if (stdout) {
      stdout.text = output === undefined ? "" : output
      stdout.streamFinished()
    }
    exited(code, 0)
  }
}
