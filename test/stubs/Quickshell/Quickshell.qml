pragma Singleton
import QtQuick
import Stub

QtObject {
  function env(name) { return name === "HOME" ? Recorder.home : "" }
  function execDetached(command) { Recorder.detached = Recorder.detached.concat([command]) }
}
