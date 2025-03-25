/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {AnyNativeEvent} from '../events/PluginModuleType';
import type {FiberRoot} from 'react-reconciler/src/ReactInternalTypes';
import type {Container, SuspenseInstance} from '../client/ReactDOMHostConfig';
import type {DOMEventName} from '../events/DOMEventNames';

// Intentionally not named imports because Rollup would use dynamic dispatch for
// CommonJS interop named imports.
import * as Scheduler from 'scheduler';

import {
  isReplayableDiscreteEvent,
  queueDiscreteEvent,
  hasQueuedDiscreteEvents,
  clearIfContinuousEvent,
  queueIfContinuousEvent,
} from './ReactDOMEventReplaying';
import {
  getNearestMountedFiber,
  getContainerFromFiber,
  getSuspenseInstanceFromFiber,
} from 'react-reconciler/src/ReactFiberTreeReflection';
import {HostRoot, SuspenseComponent} from 'react-reconciler/src/ReactWorkTags';
import {
  type EventSystemFlags,
  IS_CAPTURE_PHASE,
  IS_LEGACY_FB_SUPPORT_MODE,
} from './EventSystemFlags';

import getEventTarget from './getEventTarget';
import {getClosestInstanceFromNode} from '../client/ReactDOMComponentTree';

import {
  enableLegacyFBSupport,
  enableEagerRootListeners,
  decoupleUpdatePriorityFromScheduler,
} from 'shared/ReactFeatureFlags';
import {
  UserBlockingEvent,
  ContinuousEvent,
  DiscreteEvent,
} from 'shared/ReactTypes';
import {getEventPriorityForPluginSystem} from './DOMEventProperties';
import {dispatchEventForPluginEventSystem} from './DOMPluginEventSystem';
import {
  flushDiscreteUpdatesIfNeeded,
  discreteUpdates,
} from './ReactDOMUpdateBatching';
import {
  InputContinuousLanePriority,
  getCurrentUpdateLanePriority,
  setCurrentUpdateLanePriority,
} from 'react-reconciler/src/ReactFiberLane';

const {
  unstable_UserBlockingPriority: UserBlockingPriority,
  unstable_runWithPriority: runWithPriority,
} = Scheduler;

// TODO: can we stop exporting these?
export let _enabled = true;

// This is exported in FB builds for use by legacy FB layer infra.
// We'd like to remove this but it's not clear if this is safe.
export function setEnabled(enabled: ?boolean) {
  _enabled = !!enabled;
}

export function isEnabled() {
  return _enabled;
}

export function createEventListenerWrapper(
  targetContainer: EventTarget,
  domEventName: DOMEventName,
  eventSystemFlags: EventSystemFlags,
): Function {
  return dispatchEvent.bind(
    null,
    domEventName,
    eventSystemFlags,
    targetContainer,
  );
}

/**
 * 创建一个带有优先级的事件监听器包装器
 * 
 * 1. 根据指定的事件名称映射出事件优先级，如 DiscreteEvent
 * 2. 不同事件优先级拿到不同的事件包装器，并调用返回
 * 
 * 
 * 可以看到, 不同的domEventName调用getEventPriorityForPluginSystem后返回不同的优先级, 最终会有 3 种情况:

    - DiscreteEvent: 优先级最高, 包括click, keyDown, input等事件, 源码
      对应的listener是dispatchDiscreteEvent
    - UserBlockingEvent: 优先级适中, 包括drag, scroll等事件, 源码
      对应的listener是dispatchUserBlockingUpdate
    - ContinuousEvent: 优先级最低,包括animation, load等事件, 源码
      对应的listener是dispatchEvent
 * 
 * @param {*} targetContainer 目标容器，即事件监听器将被绑定到的DOM元素
 * @param {*} domEventName  DOM事件名称，用于确定事件的优先级
 * @param {*} eventSystemFlags 
 * @returns 返回事件包装器的调用结果
 */
export function createEventListenerWrapperWithPriority(
  targetContainer: EventTarget,
  domEventName: DOMEventName,
  eventSystemFlags: EventSystemFlags,
): Function {
  // 1. 根据优先级设置 listenerWrapper
  const eventPriority = getEventPriorityForPluginSystem(domEventName);
  let listenerWrapper;
  switch (eventPriority) {
    case DiscreteEvent:
      listenerWrapper = dispatchDiscreteEvent;
      break;
    case UserBlockingEvent:
      listenerWrapper = dispatchUserBlockingUpdate;
      break;
    case ContinuousEvent:
    default:
      listenerWrapper = dispatchEvent;
      break;
  }
  // 2. 返回 listenerWrapper
  return listenerWrapper.bind(
    null,
    domEventName,
    eventSystemFlags,
    targetContainer,
  );
}

function dispatchDiscreteEvent(
  domEventName,
  eventSystemFlags,
  container,
  nativeEvent,
) {
  if (
    !enableLegacyFBSupport ||
    // If we are in Legacy FB support mode, it means we've already
    // flushed for this event and we don't need to do it again.
    (eventSystemFlags & IS_LEGACY_FB_SUPPORT_MODE) === 0
  ) {
    flushDiscreteUpdatesIfNeeded(nativeEvent.timeStamp);
  }
  discreteUpdates(
    dispatchEvent,
    domEventName,
    eventSystemFlags,
    container,
    nativeEvent,
  );
}

function dispatchUserBlockingUpdate(
  domEventName,
  eventSystemFlags,
  container,
  nativeEvent,
) {
  if (decoupleUpdatePriorityFromScheduler) {
    const previousPriority = getCurrentUpdateLanePriority();
    try {
      // TODO: Double wrapping is necessary while we decouple Scheduler priority.
      setCurrentUpdateLanePriority(InputContinuousLanePriority);
      runWithPriority(
        UserBlockingPriority,
        dispatchEvent.bind(
          null,
          domEventName,
          eventSystemFlags,
          container,
          nativeEvent,
        ),
      );
    } finally {
      setCurrentUpdateLanePriority(previousPriority);
    }
  } else {
    runWithPriority(
      UserBlockingPriority,
      dispatchEvent.bind(
        null,
        domEventName,
        eventSystemFlags,
        container,
        nativeEvent,
      ),
    );
  }
}

/**
 * 调度DOM事件的包装器函数：主要执行attemptToDispatchEvent
 * 
 * 接收原生事件（nativeEvent），根据一定的规则和条件来决定如何以及何时将这些事件分发给相应的监听器或处理器
 * 1. 先允许重播且有离散事件队列且当前事件是可重播的离散事件，---- 则将其加入队列，以确保事件按顺序派发
 * 2. 否则，尝试分发事件：attemptToDispatchEvent 核心函数
 *    - 成功：
 *    - 失败：
 * @param {*} domEventName 
 * @param {*} eventSystemFlags 
 * @param {*} targetContainer 
 * @param {*} nativeEvent 
 * @returns 
 */
export function dispatchEvent(
  domEventName: DOMEventName,
  eventSystemFlags: EventSystemFlags,
  targetContainer: EventTarget,
  nativeEvent: AnyNativeEvent,
): void {
  if (!_enabled) {
    return;
  }
  /** 默认允许重播true，当事件标记为捕获时为false */
  let allowReplay = true;
  if (enableEagerRootListeners) {
    // TODO: replaying capture phase events is currently broken
    // because we used to do it during top-level native bubble handlers
    // but now we use different bubble and capture handlers.
    // In eager mode, we attach capture listeners early, so we need
    // to filter them out until we fix the logic to handle them correctly.
    // This could've been outside the flag but I put it inside to reduce risk.
    // 当前实现中对于捕获阶段事件的重播存在问题，因此暂时禁用
    allowReplay = (eventSystemFlags & IS_CAPTURE_PHASE) === 0;
  }
  // 1、允许重播且有离散事件队列且当前事件是可重播的离散事件，---- 则将其加入队列，以确保事件按顺序派发
  if (
    allowReplay &&
    hasQueuedDiscreteEvents() &&
    isReplayableDiscreteEvent(domEventName)
  ) {
    // If we already have a queue of discrete events, and this is another discrete
    // event, then we can't dispatch it regardless of its target, since they
    // need to dispatch in order.
    // 加入队列
    queueDiscreteEvent(
      null, // Flags that we're not actually blocked on anything as far as we know.
      domEventName,
      eventSystemFlags,
      targetContainer,
      nativeEvent,
    );
    return;
  }

  // 2、尝试分发事件
  const blockedOn = attemptToDispatchEvent(
    domEventName,
    eventSystemFlags,
    targetContainer,
    nativeEvent,
  );

  // 2-1、若成功：返回null代表成功
  if (blockedOn === null) {
    // We successfully dispatched this event.
    // 允许重播，则清除连续事件的记录
    if (allowReplay) {
      clearIfContinuousEvent(domEventName, nativeEvent);
    }
    return;
  }

  // 2-2、若失败：处理无法立即分发的情况: 就加入队列
  
  // 允许重播：根据事件类型决定是将其加入离散事件队列还是连续事件队列。如果事件既不是离散也不是连续类型的，则直接清除其记录
  if (allowReplay) {
    if (isReplayableDiscreteEvent(domEventName)) {
      // This this to be replayed later once the target is available.
      queueDiscreteEvent(
        blockedOn,
        domEventName,
        eventSystemFlags,
        targetContainer,
        nativeEvent,
      );
      return;
    }
    if (
      queueIfContinuousEvent(
        blockedOn,
        domEventName,
        eventSystemFlags,
        targetContainer,
        nativeEvent,
      )
    ) {
      return;
    }
    // We need to clear only if we didn't queue because
    // queueing is accummulative.
    clearIfContinuousEvent(domEventName, nativeEvent);
  }

  // This is not replayable so we'll invoke it but without a target,
  // in case the event system needs to trace it.
  // 不允许重播：
  dispatchEventForPluginEventSystem(
    domEventName,
    eventSystemFlags,
    nativeEvent,
    null,
    targetContainer,
  );
}

// Attempt dispatching an event. Returns a SuspenseInstance or Container if it's blocked.
/**
 * dispatchEvent的核心函数：尝试派发事件
 * 1. 定位原生DOM节点
 * 2. 获取与DOM节点对应的fiber节点
 * 3. 通过插件系统, 派发事件：核心执行 dispatchEventForPluginEventSystem
 * @param {*} domEventName 
 * @param {*} eventSystemFlags 
 * @param {*} targetContainer rootFiber容器
 * @param {*} nativeEvent 
 * @returns 
 */
export function attemptToDispatchEvent(
  domEventName: DOMEventName,
  /** 是否捕获阶段，冒泡阶段 */
  eventSystemFlags: EventSystemFlags,
  targetContainer: EventTarget,
  nativeEvent: AnyNativeEvent,
): null | Container | SuspenseInstance {
  // TODO: Warn if _enabled is false.
  // 1. 定位原生DOM节点
  const nativeEventTarget = getEventTarget(nativeEvent);
  // 2. 获取与DOM节点对应的fiber节点
  let targetInst = getClosestInstanceFromNode(nativeEventTarget);
  // 2-1、筛选targetInst
  if (targetInst !== null) {
    const nearestMounted = getNearestMountedFiber(targetInst);
    if (nearestMounted === null) {
      // This tree has been unmounted already. Dispatch without a target.
      targetInst = null;
    } else {
      const tag = nearestMounted.tag;
      if (tag === SuspenseComponent) {
        const instance = getSuspenseInstanceFromFiber(nearestMounted);
        if (instance !== null) {
          // Queue the event to be replayed later. Abort dispatching since we
          // don't want this event dispatched twice through the event system.
          // TODO: If this is the first discrete event in the queue. Schedule an increased
          // priority for this boundary.
          return instance;
        }
        // This shouldn't happen, something went wrong but to avoid blocking
        // the whole system, dispatch the event without a target.
        // TODO: Warn.
        targetInst = null;
      } else if (tag === HostRoot) {
        const root: FiberRoot = nearestMounted.stateNode;
        if (root.hydrate) {
          // If this happens during a replay something went wrong and it might block
          // the whole system.
          return getContainerFromFiber(nearestMounted);
        }
        targetInst = null;
      } else if (nearestMounted !== targetInst) {
        // If we get an event (ex: img onload) before committing that
        // component's mount, ignore it for now (that is, treat it as if it was an
        // event on a non-React tree). We might also consider queueing events and
        // dispatching them after the mount.
        targetInst = null;
      }
    }
  }
  // 3. 通过插件系统, 派发事件
  dispatchEventForPluginEventSystem(
    domEventName,
    eventSystemFlags,
    nativeEvent,
    targetInst,
    targetContainer,
  );
  // We're not blocked on anything.
  return null;
}
