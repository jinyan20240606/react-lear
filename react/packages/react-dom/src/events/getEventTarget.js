/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {TEXT_NODE} from '../shared/HTMLNodeType';

/**
 * 处理了一些特定浏览器的行为差异，确保在所有环境中都能正确获取事件的目标元素
 *
 * @param {object} nativeEvent 原生浏览器事件对象
 * @return {DOMEventTarget} Target node.
 */
function getEventTarget(nativeEvent) {
  // Fallback to nativeEvent.srcElement for IE9
  // https://github.com/facebook/react/issues/12506
  let target = nativeEvent.target || nativeEvent.srcElement || window;

  // Normalize SVG <use> element events #4963
  // 处理 SVG <use> 元素事件标准化
  // 原因：在某些情况下，特别是与 SVG 的 <use> 元素相关时，事件目标可能是 use 元素引用的实际元素，而不是 use 元素本身。为了标准化这种情况，检查 target.correspondingUseElement 并相应地更新 target
  if (target.correspondingUseElement) {
    target = target.correspondingUseElement;
  }

  // Safari may fire events on text nodes (Node.TEXT_NODE is 3).
  // @see http://www.quirksmode.org/js/events_properties.html
  // Safari 浏览器可能会将事件触发在文本节点上（Node.TEXT_NODE 的值为 3）。为了避免直接操作文本节点，如果事件目标是文本节点，则返回其父节点
  return target.nodeType === TEXT_NODE ? target.parentNode : target;
}

export default getEventTarget;
