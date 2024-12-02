/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {FiberRoot, SuspenseHydrationCallbacks} from './ReactInternalTypes';
import type {RootTag} from './ReactRootTags';

import {noTimeout, supportsHydration} from './ReactFiberHostConfig';
import {createHostRootFiber} from './ReactFiber.old';
import {
  NoLanes,
  NoLanePriority,
  NoTimestamp,
  createLaneMap,
} from './ReactFiberLane';
import {
  enableSchedulerTracing,
  enableSuspenseCallback,
} from 'shared/ReactFeatureFlags';
import {unstable_getThreadID} from 'scheduler/tracing';
import {initializeUpdateQueue} from './ReactUpdateQueue.old';
import {LegacyRoot, BlockingRoot, ConcurrentRoot} from './ReactRootTags';


/** 创建整个React应用的根fiber节点：FiberRootNode */
function FiberRootNode(containerInfo, tag, hydrate) {
  this.tag = tag;
  this.containerInfo = containerInfo;
  this.pendingChildren = null;
  // 当前的组件的根Fiber节点
  this.current = null;
  this.pingCache = null;
  // 已完成的work
  this.finishedWork = null;
  this.timeoutHandle = noTimeout;
  // 当前上下文
  this.context = null;
  // 待处理的上下文
  this.pendingContext = null;
  this.hydrate = hydrate;
  // 回调节点
  this.callbackNode = null;
  // 回调优先级
  this.callbackPriority = NoLanePriority;

  // 初始化优先级相关属性
  this.eventTimes = createLaneMap(NoLanes);
  this.expirationTimes = createLaneMap(NoTimestamp);

  this.pendingLanes = NoLanes;
  this.suspendedLanes = NoLanes;
  this.pingedLanes = NoLanes;
  this.expiredLanes = NoLanes;
  this.mutableReadLanes = NoLanes;
  this.finishedLanes = NoLanes;

  // 初始化entangled相关属性
  this.entangledLanes = NoLanes;
  this.entanglements = createLaneMap(NoLanes);

  // 初始化水和相关属性
  if (supportsHydration) {
    this.mutableSourceEagerHydrationData = null;
  }

  // 初始化调度跟踪相关属性
  if (enableSchedulerTracing) {
    this.interactionThreadID = unstable_getThreadID();
    this.memoizedInteractions = new Set();
    this.pendingInteractionMap = new Map();
  }
  // 初始化suspense相关属性
  if (enableSuspenseCallback) {
    this.hydrationCallbacks = null;
  }

  if (__DEV__) {
    switch (tag) {
      case BlockingRoot:
        this._debugRootType = 'createBlockingRoot()';
        break;
      case ConcurrentRoot:
        this._debugRootType = 'createRoot()';
        break;
      case LegacyRoot:
        this._debugRootType = 'createLegacyRoot()';
        break;
    }
  }
}

/** 
 * 创建和初始化一个新的 fiberRoot 根实例，并给current初始化一个rootFiber节点
 * @returns 返回一个 FiberRoot 实例对象
 */
export function createFiberRoot(
  containerInfo: any,
  tag: RootTag,
  hydrate: boolean,
  hydrationCallbacks: null | SuspenseHydrationCallbacks,
): FiberRoot {
  // fiberRoot：根Fiber实例对象
  const root: FiberRoot = (new FiberRootNode(containerInfo, tag, hydrate): any);
  if (enableSuspenseCallback) {
    root.hydrationCallbacks = hydrationCallbacks;
  }

  // rootFiber：赋值current属性为宿主树根 Fiber 节点
  const uninitializedFiber = createHostRootFiber(tag);
  // 双指向缓存机制：初始化时，current 指向 当前rootFiber节点
  root.current = uninitializedFiber;
  uninitializedFiber.stateNode = root;

  // 初始化rootFiber节点updateQueue链表
  initializeUpdateQueue(uninitializedFiber);

  return root;
}
