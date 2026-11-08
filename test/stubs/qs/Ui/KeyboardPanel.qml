import QtQuick
import qs.Commons
import Stub

// The popup card only: background, 2 px border, padding, content. Shown at
// the origin of the harness window instead of a layer-shell surface.
Item {
  id: root
  property Item anchorItem: null
  property Item owner: null
  property QtObject bar: null
  property bool open: false
  property Item focusTarget: null
  property real contentWidth: 0
  property real contentHeight: 0
  readonly property int padding: Style.spacing.popupPadding
  readonly property int borderWidth: Style.space(2)
  readonly property real verticalContentInset: 2 * (padding + borderWidth)
  default property alias content: inner.data

  function fittedContentWidth(width) { return Math.round(Math.max(1, Number(width) || 1)) }
  function fittedContentHeight(height) { return Math.round((Number(height) || 0) + verticalContentInset) }

  Rectangle {
    id: card
    parent: Recorder.card ? Recorder.card : root
    visible: root.open
    width: root.contentWidth
    height: root.contentHeight
    color: root.bar ? root.bar.background : "#1e1e2e"
    border.width: root.borderWidth
    border.color: root.bar ? root.bar.border : "#45475a"

    Item {
      id: inner
      x: root.padding + root.borderWidth
      y: root.padding + root.borderWidth
      width: root.contentWidth - root.verticalContentInset
      height: root.contentHeight - root.verticalContentInset
    }
  }
}
