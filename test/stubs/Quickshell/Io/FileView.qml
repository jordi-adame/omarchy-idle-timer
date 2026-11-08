import QtQuick

// Reads `path` once after creation (and on reload()) with a synchronous
// file:// request; needs QML_XHR_ALLOW_FILE_READ=1.
QtObject {
  id: root
  property string path: ""
  property bool watchChanges: false
  property bool printErrors: true
  property string _text: ""
  signal loaded()
  signal loadFailed(var error)
  signal fileChanged()

  function text() { return _text }
  function reload() {
    var xhr = new XMLHttpRequest()
    try {
      xhr.open("GET", "file://" + path, false)
      xhr.send()
    } catch (e) {
      loadFailed(2)
      return
    }
    if (xhr.status !== 0 && xhr.status !== 200 || xhr.responseText === null) { loadFailed(2); return }
    _text = xhr.responseText
    loaded()
  }
  Component.onCompleted: Qt.callLater(reload)
}
