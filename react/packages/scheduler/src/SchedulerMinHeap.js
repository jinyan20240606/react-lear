/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * 
 * peek函数: 查看堆的顶点, 也就是优先级最高的task或timer.
   pop函数: 将堆的顶点提取出来, 并删除顶点之后, 需要调用siftDown函数向下调整堆.
   push函数: 添加新节点, 添加之后, 需要调用siftUp函数向上调整堆.
   siftDown函数: 向下调整堆结构, 保证数组是一个最小堆.
   siftUp函数: 当尾部插入节点之后, 需要向上调整堆结构, 保证数组是一个最小堆.
 *
 * @flow strict
 */
// 最小堆 数据结构
type Heap = Array<Node>;
type Node = {|
  id: number,
  sortIndex: number,
|};

/**
 * 尾部添加新节点, 添加之后, 需要调用`siftUp`函数向上调整堆.
 * @param {*} heap 
 * @param {*} node 
 */
export function push(heap: Heap, node: Node): void {
  const index = heap.length;
  heap.push(node);
  siftUp(heap, node, index);
}

/** 
 * 查看堆的顶点, 也就是优先级最高的`task`或`timer`
*/
export function peek(heap: Heap): Node | null {
  const first = heap[0];
  return first === undefined ? null : first;
}

// 将堆的顶点提取出来, 并删除顶点之后, 需要调用`siftDown`函数向下调整堆.
export function pop(heap: Heap): Node | null {
  const first = heap[0];
  if (first !== undefined) {
    const last = heap.pop();
    if (last !== first) {
      heap[0] = last;
      siftDown(heap, last, 0);
    }
    return first;
  } else {
    return null;
  }
}

/**
 * 当插入节点之后, 需要向上调整堆结构, 保证数组是一个最小堆.
 */
function siftUp(heap, node, i) {
  let index = i;
  while (true) {
    const parentIndex = (index - 1) >>> 1;
    const parent = heap[parentIndex];
    if (parent !== undefined && compare(parent, node) > 0) {
      // The parent is larger. Swap positions.
      heap[parentIndex] = node;
      heap[index] = parent;
      index = parentIndex;
    } else {
      // The parent is smaller. Exit.
      return;
    }
  }
}

/**
 * 向下调整堆结构, 保证数组是一个最小堆.
 * @param {*} heap 
 * @param {*} node 
 * @param {*} i 
 * @returns 
 */
function siftDown(heap, node, i) {
  let index = i;
  const length = heap.length;
  while (index < length) {
    const leftIndex = (index + 1) * 2 - 1;
    const left = heap[leftIndex];
    const rightIndex = leftIndex + 1;
    const right = heap[rightIndex];

    // If the left or right node is smaller, swap with the smaller of those.
    if (left !== undefined && compare(left, node) < 0) {
      if (right !== undefined && compare(right, left) < 0) {
        heap[index] = right;
        heap[rightIndex] = node;
        index = rightIndex;
      } else {
        heap[index] = left;
        heap[leftIndex] = node;
        index = leftIndex;
      }
    } else if (right !== undefined && compare(right, node) < 0) {
      heap[index] = right;
      heap[rightIndex] = node;
      index = rightIndex;
    } else {
      // Neither child is smaller. Exit.
      return;
    }
  }
}

function compare(a, b) {
  // Compare sort index first, then task id.
  const diff = a.sortIndex - b.sortIndex;
  return diff !== 0 ? diff : a.id - b.id;
}
