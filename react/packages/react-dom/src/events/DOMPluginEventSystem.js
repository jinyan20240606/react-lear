/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {DOMEventName} from './DOMEventNames';
import {
  type EventSystemFlags,
  SHOULD_NOT_DEFER_CLICK_FOR_FB_SUPPORT_MODE,
  IS_LEGACY_FB_SUPPORT_MODE,
  SHOULD_NOT_PROCESS_POLYFILL_EVENT_PLUGINS,
} from './EventSystemFlags';
import type {AnyNativeEvent} from './PluginModuleType';
import type {
  KnownReactSyntheticEvent,
  ReactSyntheticEvent,
} from './ReactSyntheticEventType';
import type {Fiber} from 'react-reconciler/src/ReactInternalTypes';

import {registrationNameDependencies, allNativeEvents} from './EventRegistry';
import {
  IS_CAPTURE_PHASE,
  IS_EVENT_HANDLE_NON_MANAGED_NODE,
  IS_NON_DELEGATED,
} from './EventSystemFlags';

import {
  HostRoot,
  HostPortal,
  HostComponent,
  HostText,
  ScopeComponent,
} from 'react-reconciler/src/ReactWorkTags';

import getEventTarget from './getEventTarget';
import {
  getClosestInstanceFromNode,
  getEventListenerSet,
  getEventHandlerListeners,
} from '../client/ReactDOMComponentTree';
import {COMMENT_NODE} from '../shared/HTMLNodeType';
import {batchedEventUpdates} from './ReactDOMUpdateBatching';
import getListener from './getListener';
import {passiveBrowserEventsSupported} from './checkPassiveEvents';

import {
  enableLegacyFBSupport,
  enableCreateEventHandleAPI,
  enableScopeAPI,
  enableEagerRootListeners,
} from 'shared/ReactFeatureFlags';
import {
  invokeGuardedCallbackAndCatchFirstError,
  rethrowCaughtError,
} from 'shared/ReactErrorUtils';
import {DOCUMENT_NODE} from '../shared/HTMLNodeType';
import {createEventListenerWrapperWithPriority} from './ReactDOMEventListener';
import {
  removeEventListener,
  addEventCaptureListener,
  addEventBubbleListener,
  addEventBubbleListenerWithPassiveFlag,
  addEventCaptureListenerWithPassiveFlag,
} from './EventListener';
import * as BeforeInputEventPlugin from './plugins/BeforeInputEventPlugin';
import * as ChangeEventPlugin from './plugins/ChangeEventPlugin';
import * as EnterLeaveEventPlugin from './plugins/EnterLeaveEventPlugin';
import * as SelectEventPlugin from './plugins/SelectEventPlugin';
import * as SimpleEventPlugin from './plugins/SimpleEventPlugin';

type DispatchListener = {|
  instance: null | Fiber,
  listener: Function,
  currentTarget: EventTarget,
|};

type DispatchEntry = {|
  event: ReactSyntheticEvent,
  listeners: Array<DispatchListener>,
|};

export type DispatchQueue = Array<DispatchEntry>;

// TODO: remove top-level side effect.
SimpleEventPlugin.registerEvents();
EnterLeaveEventPlugin.registerEvents();
ChangeEventPlugin.registerEvents();
SelectEventPlugin.registerEvents();
BeforeInputEventPlugin.registerEvents();

/**
 * 收集 fiber节点上的所有listener到dispatchQueue队列中
 * - 在Plugin.extractEvents过程中, 从当前fiber节点向上遍历整个fiber树找到所有对应的domEventName的listener之后, 初始化SyntheticEvent合成事件的事件对象实例, 加入到dispatchQueue中, 等待派发
 * - dispatchEvent函数的调用链路中, 通过不同的插件, 处理不同的事件. 其中最常见的事件都会由SimpleEventPlugin.extractEvents进行处理
 *    - 简单事件插件
 *    - EnterLeaveEventPlugin
 *    - ChangeEventPlugin
 *    - SelectEventPlugin
 *    - BeforeInputEventPlugin
 * @param {*} domEventName
 */
function extractEvents(
  dispatchQueue: DispatchQueue,
  domEventName: DOMEventName,
  /** 一般情况下就是触发的目标DOM对应的fiber节点 */
  targetInst: null | Fiber,
  nativeEvent: AnyNativeEvent,
  nativeEventTarget: null | EventTarget,
  eventSystemFlags: EventSystemFlags,
  targetContainer: EventTarget,
) {
  // TODO: we should remove the concept of a "SimpleEventPlugin".
  // This is the basic functionality of the event system. All
  // the other plugins are essentially polyfills. So the plugin
  // should probably be inlined somewhere and have its logic
  // be core the to event system. This would potentially allow
  // us to ship builds of React without the polyfilled plugins below.
  SimpleEventPlugin.extractEvents(
    dispatchQueue,
    domEventName,
    targetInst,
    nativeEvent,
    nativeEventTarget,
    eventSystemFlags,
    targetContainer,
  );
  // 是否处理某些polyfill事件插件，兼容旧浏览器或特定事件类型
  const shouldProcessPolyfillPlugins =
    (eventSystemFlags & SHOULD_NOT_PROCESS_POLYFILL_EVENT_PLUGINS) === 0;
  // We don't process these events unless we are in the
  // event's native "bubble" phase, which means that we're
  // not in the capture phase. That's because we emulate
  // the capture phase here still. This is a trade-off,
  // because in an ideal world we would not emulate and use
  // the phases properly, like we do with the SimpleEvent
  // plugin. However, the plugins below either expect
  // emulation (EnterLeave) or use state localized to that
  // plugin (BeforeInput, Change, Select). The state in
  // these modules complicates things, as you'll essentially
  // get the case where the capture phase event might change
  // state, only for the following bubble event to come in
  // later and not trigger anything as the state now
  // invalidates the heuristics of the event plugin. We
  // could alter all these plugins to work in such ways, but
  // that might cause other unknown side-effects that we
  // can't forsee right now.
  if (shouldProcessPolyfillPlugins) {
    EnterLeaveEventPlugin.extractEvents(
      dispatchQueue,
      domEventName,
      targetInst,
      nativeEvent,
      nativeEventTarget,
      eventSystemFlags,
      targetContainer,
    );
    ChangeEventPlugin.extractEvents(
      dispatchQueue,
      domEventName,
      targetInst,
      nativeEvent,
      nativeEventTarget,
      eventSystemFlags,
      targetContainer,
    );
    SelectEventPlugin.extractEvents(
      dispatchQueue,
      domEventName,
      targetInst,
      nativeEvent,
      nativeEventTarget,
      eventSystemFlags,
      targetContainer,
    );
    BeforeInputEventPlugin.extractEvents(
      dispatchQueue,
      domEventName,
      targetInst,
      nativeEvent,
      nativeEventTarget,
      eventSystemFlags,
      targetContainer,
    );
  }
}

// List of events that need to be individually attached to media elements.
/**
 * 各种媒体事件，也是属于不冒泡的事件
 */
export const mediaEventTypes: Array<DOMEventName> = [
  'abort',
  'canplay',
  'canplaythrough',
  'durationchange',
  'emptied',
  'encrypted',
  'ended',
  'error',
  'loadeddata',
  'loadedmetadata',
  'loadstart',
  'pause',
  'play',
  'playing',
  'progress',
  'ratechange',
  'seeked',
  'seeking',
  'stalled',
  'suspend',
  'timeupdate',
  'volumechange',
  'waiting',
];

// We should not delegate代理 these events to the container, but rather而是应该
// set them on the actual target element itself. This is primarily
// because these events do not consistently bubble in the DOM.
/**
 * 这些事件被直接设置在目标元素本身上，而不是委托给容器元素。
 * 这是因为所列出的事件在 DOM 中可能不会一直地冒泡
 */
export const nonDelegatedEvents: Set<DOMEventName> = new Set([
  'cancel',// 当一个表单的提交被取消时触发
  'close',// 当 <dialog> 元素关闭时触发
  'invalid', //当尝试提交表单时，如果存在一个或多个无效字段，则会在每个无效字段上触发
  'load',// 当文档、图像或其他资源已完成加载时触发
  'scroll',// 当文档视图或元素的内容滚动时触发
  'toggle',// 当 <details> 元素的状态改变（打开或关闭）时触发
  // In order to reduce bytes, we insert the above array of media events
  // into this Set. Note: the "error" event isn't an exclusive media event,
  // and can occur on other elements too. Rather than duplicate that event,
  // we just take it from the media events array.
  ...mediaEventTypes,
]);

function executeDispatch(
  event: ReactSyntheticEvent,
  listener: Function,
  currentTarget: EventTarget,
): void {
  const type = event.type || 'unknown-event';
  event.currentTarget = currentTarget;
  invokeGuardedCallbackAndCatchFirstError(type, listener, undefined, event);
  event.currentTarget = null;
}

/**
 * 按顺序执行事件监听器，根据事件阶段（捕获或冒泡）决定遍历监听器的顺序
 * 
 * 1. 如果处于捕获阶段（inCapturePhase = true），则逆序遍历 dispatchListeners（从后往前）。
 * 2. 如果处于冒泡阶段（inCapturePhase = false），则正序遍历 dispatchListeners（从前往后）。
 */
function processDispatchQueueItemsInOrder(
  event: ReactSyntheticEvent,
  dispatchListeners: Array<DispatchListener>,
  inCapturePhase: boolean,
): void {
  let previousInstance;
  if (inCapturePhase) {
    for (let i = dispatchListeners.length - 1; i >= 0; i--) {
      const {instance, currentTarget, listener} = dispatchListeners[i];
      if (instance !== previousInstance && event.isPropagationStopped()) {
        return;
      }
      executeDispatch(event, listener, currentTarget);
      previousInstance = instance;
    }
  } else {
    for (let i = 0; i < dispatchListeners.length; i++) {
      const {instance, currentTarget, listener} = dispatchListeners[i];
      if (instance !== previousInstance && event.isPropagationStopped()) {
        return;
      }
      executeDispatch(event, listener, currentTarget);
      previousInstance = instance;
    }
  }
}

/**
 * 实际派发事件
 * @param {*} dispatchQueue: 事件队列，包含待处理的事件对象和对应的监听器列表
 * @param {*} eventSystemFlags 用于标识事件的当前阶段（如捕获阶段或冒泡阶段
 */
export function processDispatchQueue(
  dispatchQueue: DispatchQueue,
  eventSystemFlags: EventSystemFlags,
): void {
  // 是否处于捕获阶段
  const inCapturePhase = (eventSystemFlags & IS_CAPTURE_PHASE) !== 0;
  // 遍历队列中的每个事件-监听器对，调用 processDispatchQueueItemsInOrder 按顺序执行监听器
  for (let i = 0; i < dispatchQueue.length; i++) {
    const {event, listeners} = dispatchQueue[i];
    processDispatchQueueItemsInOrder(event, listeners, inCapturePhase);
    //  event system doesn't use pooling.
  }
  // 处理完所有事件后，重新抛出之前捕获的错误（如果有的话）
  // This would be a good time to rethrow if any of the event handlers threw.
  rethrowCaughtError();
}

/**
 * ## 实际派发事件给插件系统
 * 1. extractEvents方法提取所有合成事件
 *    - 在Plugin.extractEvents过程中, 遍历fiber树找到所有对应的domEventName的listener之后, 就会创建SyntheticEvent, 加入到dispatchQueue中, 等待派发.
 * 2. 调用 processDispatchQueue 函数来实际执行上面提取的所有事件分发
 * @param {*} domEventName 
 * @param {*} eventSystemFlags 
 * @param {*} nativeEvent 
 * @param {*} targetInst 一般情况下就是触发的目标DOM对应的fiber节点
 * @param {*} targetContainer 
 */
function dispatchEventsForPlugins(
  domEventName: DOMEventName,
  eventSystemFlags: EventSystemFlags,
  nativeEvent: AnyNativeEvent,
  targetInst: null | Fiber, // 一般情况下就是触发的目标DOM对应的fiber节点
  targetContainer: EventTarget,
): void {
  const nativeEventTarget = getEventTarget(nativeEvent);
  // 1. 创建一个空数组 dispatchQueue，用来存储即将被分发的事件对象。这个队列将在稍后用于批量处理所有需要触发的事件
  const dispatchQueue: DispatchQueue = [];
  // 2. extractEvents方法：targetInst目标节点向上遍历fiber树，提取fiber树上所有domEventName对应的listenr，并将它们添加到 dispatchQueue 中
  extractEvents(
    dispatchQueue,
    domEventName,
    targetInst,
    nativeEvent,
    nativeEventTarget,
    eventSystemFlags,
    targetContainer,
  );
  // 3. 调用 processDispatchQueue 函数来实际执行事件分发
  processDispatchQueue(dispatchQueue, eventSystemFlags);
}

export function listenToNonDelegatedEvent(
  domEventName: DOMEventName,
  targetElement: Element,
): void {
  const isCapturePhaseListener = false;
  const listenerSet = getEventListenerSet(targetElement);
  const listenerSetKey = getListenerSetKey(
    domEventName,
    isCapturePhaseListener,
  );
  if (!listenerSet.has(listenerSetKey)) {
    addTrappedEventListener(
      targetElement,
      domEventName,
      IS_NON_DELEGATED,
      isCapturePhaseListener,
    );
    listenerSet.add(listenerSetKey);
  }
}

const listeningMarker =
  '_reactListening' +
  Math.random()
    .toString(36)
    .slice(2);

/**
 * 完成react的合成事件的总代理委托（16版本是在document上委托，17后在根dom容器）
 * 
 * 在一个给定的根容器元素上监听所有支持的原生事件的重要部分
 * 1. 节流优化, 保证全局注册只被调用一次.
 * 2. 遍历allNativeEvents, 调用listenToNativeEvent监听冒泡和捕获阶段的事件.
      - allNativeEvents包括了大量的原生事件名称, 它是在DOMPluginEventSystem.js中被初始化
 * 
 * @params {*} rootContainerElement 目标dom容器 div#root
 */
export function listenToAllSupportedEvents(rootContainerElement: EventTarget) {
  if (enableEagerRootListeners) {
    // 是否已监听过，是则跳出
    // 节流优化, 保证全局注册只被调用一次
    if ((rootContainerElement: any)[listeningMarker]) {
      // Performance optimization: don't iterate through events
      // for the same portal container or root node more than once.
      // TODO: once we remove the flag, we may be able to also
      // remove some of the bookkeeping maps used for laziness.
      return;
    }
    (rootContainerElement: any)[listeningMarker] = true;
    // 初始化时已全部添加好事件名字的set集合了
    // 遍历allNativeEvents 监听冒泡和捕获阶段的事件
    allNativeEvents.forEach(domEventName => {
      // 包含不需要代理的事件名称的集合
      if (!nonDelegatedEvents.has(domEventName)) {
        listenToNativeEvent(
          domEventName,
          false,// 冒泡阶段监听
          ((rootContainerElement: any): Element),
          null,
        );
      }
      listenToNativeEvent(
        domEventName,
        true,// 捕获阶段监听
        ((rootContainerElement: any): Element),
        null,
      );
    });
  }
}

/**
 * 目标元素上监听原生事件
 * @param {*} domEventName 要注册的事件名
 * @param {*} isCapturePhaseListener 是否捕获阶段监听
 * @param {*} rootContainerElement  目标DOM 容器
 * @param {*} targetElement 事件触发的实际目标元素，传null为走事件代理，不为null则注册到实际元素上
 * @param {*} eventSystemFlags 
 * @returns 
 */
export function listenToNativeEvent(
  domEventName: DOMEventName,
  isCapturePhaseListener: boolean,
  rootContainerElement: EventTarget,
  targetElement: Element | null,
  eventSystemFlags?: EventSystemFlags = 0,
): void {
  let target = rootContainerElement;

  // 1、判断SelectionChange事件 需要附加到document中
  // 否则它不会捕获因为是仅在docuemnt上触发的事件。
  if (
    domEventName === 'selectionchange' &&
    (rootContainerElement: any).nodeType !== DOCUMENT_NODE
  ) {
    target = (rootContainerElement: any).ownerDocument;
  }
  // If the event can be delegated (or is capture phase), we can
  // register it to the root container. Otherwise, we should
  // register the event to the target element and mark it as
  // a non-delegated event.
  // 2、处理非代理事件 ---> 非代理事件需要直接注册到实际目标元素上即targetElement
  if (
    targetElement !== null &&
    !isCapturePhaseListener &&
    nonDelegatedEvents.has(domEventName)
  ) {
    // For all non-delegated events, apart from scroll, we attach
    // their event listeners to the respective elements that their
    // events fire on. That means we can skip this step, as event
    // listener has already been added previously. However, we
    // special case the scroll event because the reality is that any
    // element can scroll.
    // TODO: ideally, we'd eventually apply the same logic to all
    // events from the nonDelegatedEvents list. Then we can remove
    // this special case and use the same logic for all events.
    // 对于所有非代理事件（除了 scroll），我们将它们的事件监听器附加到
    // 事件触发的相应元素上。因此，我们可以跳过这一步，因为事件监听器
    // 已经在之前添加了。然而，我们对 scroll 事件进行特殊处理，因为现实中
    // 任何元素都可以滚动。
    // TODO: 最终，我们希望对 nonDelegatedEvents 列表中的所有事件应用相同的逻辑。
    // 然后我们可以移除这个特殊处理并使用相同的逻辑处理所有事件。
    if (domEventName !== 'scroll') {
      return;
    }
    eventSystemFlags |= IS_NON_DELEGATED;
    target = targetElement;
  }
  // 3、获取dom关联的事件监听器集合
  const listenerSet = getEventListenerSet(target);
  const listenerSetKey = getListenerSetKey(
    domEventName,
    isCapturePhaseListener,
  );
  // If the listener entry is empty or we should upgrade, then
  // we need to trap an event listener onto the target.
  // 4、注册事件到target，同时往集合里添加已注册的事件名，避免重复注册
  // 利用set数据结构, 保证相同的事件类型只会被注册一次.
  if (!listenerSet.has(listenerSetKey)) {
    if (isCapturePhaseListener) {
      eventSystemFlags |= IS_CAPTURE_PHASE;
    }
    // 4-1、注册事件监听
    addTrappedEventListener(
      target,
      domEventName,
      eventSystemFlags,
      isCapturePhaseListener,
    );
    listenerSet.add(listenerSetKey);
  }
}

export function listenToReactEvent(
  reactEvent: string,
  rootContainerElement: Element,
  targetElement: Element | null,
): void {
  if (!enableEagerRootListeners) {
    const dependencies = registrationNameDependencies[reactEvent];
    const dependenciesLength = dependencies.length;
    // If the dependencies length is 1, that means we're not using a polyfill
    // plugin like ChangeEventPlugin, BeforeInputPlugin, EnterLeavePlugin
    // and SelectEventPlugin. We always use the native bubble event phase for
    // these plugins and emulate two phase event dispatching. SimpleEventPlugin
    // always only has a single dependency and SimpleEventPlugin events also
    // use either the native capture event phase or bubble event phase, there
    // is no emulation (except for focus/blur, but that will be removed soon).
    const isPolyfillEventPlugin = dependenciesLength !== 1;

    if (isPolyfillEventPlugin) {
      const listenerSet = getEventListenerSet(rootContainerElement);
      // When eager listeners are off, this Set has a dual purpose: it both
      // captures which native listeners we registered (e.g. "click__bubble")
      // and *React* lazy listeners (e.g. "onClick") so we don't do extra checks.
      // This second usage does not exist in the eager mode.
      if (!listenerSet.has(reactEvent)) {
        listenerSet.add(reactEvent);
        for (let i = 0; i < dependenciesLength; i++) {
          listenToNativeEvent(
            dependencies[i],
            false,
            rootContainerElement,
            targetElement,
          );
        }
      }
    } else {
      const isCapturePhaseListener =
        reactEvent.substr(-7) === 'Capture' &&
        // Edge case: onGotPointerCapture and onLostPointerCapture
        // end with "Capture" but that's part of their event names.
        // The Capture versions would end with CaptureCapture.
        // So we have to check against that.
        // This check works because none of the events we support
        // end with "Pointer".
        reactEvent.substr(-14, 7) !== 'Pointer';
      listenToNativeEvent(
        dependencies[0],
        isCapturePhaseListener,
        rootContainerElement,
        targetElement,
      );
    }
  }
}

/** 
 * 在目标DOM容器上注册原生事件监听器
 * 1. 构造统一的listener
 *    - 确定isPassiveListener变量：是否属于要passive监听事件
 *    - 处理旧版facebook支持
 * 2. 注册事件监听
 *    - 根据是否冒泡类型和是否isPassiveListener来注册事件监听
 *    - 调用addEventBubbleListener|addEventBubbleListenerWithPassiveFlag和addEventCaptureListener|addEventCaptureListenerWithPassiveFlag监听了原生事件
 * */
function addTrappedEventListener(
  targetContainer: EventTarget,
  domEventName: DOMEventName,
  eventSystemFlags: EventSystemFlags,
  isCapturePhaseListener: boolean,
  isDeferredListenerForLegacyFBSupport?: boolean,
) {
  // 1. 构造listener
  let listener = createEventListenerWrapperWithPriority(
    targetContainer,
    domEventName,
    eventSystemFlags,
  );
  // If passive option is not supported, then the event will be
  // active and not passive.
  // 1-1. 确定是否是被动监听器变量bool值：告诉浏览器在处理某些特定类型的事件（如 touchstart 和 touchmove）时，不会阻止页面的默认行为。这种机制主要用于提高触摸设备上的滚动性能
  let isPassiveListener = undefined;
  if (passiveBrowserEventsSupported) {
    // Browsers introduced an intervention, making these events
    // passive by default on document. React doesn't bind them
    // to document anymore, but changing this now would undo
    // the performance wins from the change. So we emulate
    // the existing behavior manually on the roots now.
    // https://github.com/facebook/react/issues/19651
    if (
      domEventName === 'touchstart' ||
      domEventName === 'touchmove' ||
      domEventName === 'wheel'
    ) {
      isPassiveListener = true;
    }
  }

  // 1-2. 处理旧版 Facebook 支持:enableLegacyFBSupport 就是旧版facebook支持
  targetContainer =
    enableLegacyFBSupport && isDeferredListenerForLegacyFBSupport
      ? (targetContainer: any).ownerDocument
      : targetContainer;

  // 处理延迟监听器: 确保事件监听器只在首次触发后被移除
  let unsubscribeListener;
  // 当启用legacyFBSupport时，它是为了当我们
  // 想要向容器添加一次性事件侦听器。
  // 这只能与enableLegacyFBSupport一起使用
  // 由于需要提供兼容性
  // 内部 FB www 事件工具。这可以通过删除来实现
  // 事件侦听器一旦被调用。我们可以
  // 还尝试使用 {once: true} 参数
  // addEventListener，但这需要支持和一些
  // 目前浏览器不支持此功能，并且鉴于此
  // 为了支持遗留代码模式，所以兼容支持。
  if (enableLegacyFBSupport && isDeferredListenerForLegacyFBSupport) {
    const originalListener = listener;
    listener = function(...p) {
      removeEventListener(
        targetContainer,
        domEventName,
        unsubscribeListener,
        isCapturePhaseListener,
      );
      return originalListener.apply(this, p);
    };
  }

  // 如果没有启用延迟，则添加事件监听器
  // 2. 注册事件监听
  if (isCapturePhaseListener) {// 捕获阶段
    if (isPassiveListener !== undefined) {
      unsubscribeListener = addEventCaptureListenerWithPassiveFlag(
        targetContainer,
        domEventName,
        listener,
        isPassiveListener,
      );
    } else {
      unsubscribeListener = addEventCaptureListener(
        targetContainer,
        domEventName,
        listener,
      );
    }
  } else { // 冒泡阶段
    if (isPassiveListener !== undefined) {
      unsubscribeListener = addEventBubbleListenerWithPassiveFlag(
        targetContainer,
        domEventName,
        listener,
        isPassiveListener,
      );
    } else {
      unsubscribeListener = addEventBubbleListener(
        targetContainer,
        domEventName,
        listener,
      );
    }
  }
}

function deferClickToDocumentForLegacyFBSupport(
  domEventName: DOMEventName,
  targetContainer: EventTarget,
): void {
  // We defer all click events with legacy FB support mode on.
  // This means we add a one time event listener to trigger
  // after the FB delegated listeners fire.
  const isDeferredListenerForLegacyFBSupport = true;
  addTrappedEventListener(
    targetContainer,
    domEventName,
    IS_LEGACY_FB_SUPPORT_MODE,
    false,
    isDeferredListenerForLegacyFBSupport,
  );
}

function isMatchingRootContainer(
  grandContainer: Element,
  targetContainer: EventTarget,
): boolean {
  return (
    grandContainer === targetContainer ||
    (grandContainer.nodeType === COMMENT_NODE &&
      grandContainer.parentNode === targetContainer)
  );
}

/**
 * 入口：派发事件给插件系统:
 * 1. 基于当前触发的目标fiber节点-初始化赋值 ancestorInst 变量
 *    - 若当前节点是HostRoot或HostPortal时，---> 处理下跨根的边界情况
 *        - HostRoot时：正好对应targetContainer目标容器，则不处理
 *            - 若不对应即跨根：找最近祖先元素的fiber实例，赋值给ancestorInst变量
 *        - HostPortal时：处理portal事件传播的跨根问题
 *    - 否则其他普通节点时，ancestorInst 变量不改变：还是当前触发的目标fiber节点
 * 2. 传参ancestorInst值，调用 dispatchEventsForPlugins 函数来真正分发事件给插件系统，完成事件处理过程
 * @param {*} nativeEvent 原生事件对象event
 * @param {*} targetInst event.target-dom节点对应的Fiber节点实例
 * @param {*} targetContainer 目标容器
 * @returns
 */
export function dispatchEventForPluginEventSystem(
  domEventName: DOMEventName,// 原生 DOM 事件的名称，例如 click、keydown 等。
  eventSystemFlags: EventSystemFlags,// 事件系统的标志位，用于表示事件的一些特性，如是否是捕获阶段、是否是非委托事件等
  nativeEvent: AnyNativeEvent,// 原生浏览器事件对象。
  targetInst: null | Fiber,// 事件触发的目标 Fiber 节点实例
  targetContainer: EventTarget,// 目标容器，通常是 React 根节点或 Portal 节点对应的 DOM 元素
): void {
  let ancestorInst = targetInst;
  // 如果不是非管理节点且非委托事件
  debugger;
  if (
    (eventSystemFlags & IS_EVENT_HANDLE_NON_MANAGED_NODE) === 0 &&
    (eventSystemFlags & IS_NON_DELEGATED) === 0
  ) {
    const targetContainerNode = ((targetContainer: any): Node);

    // If we are using the legacy FB support flag, we
    // defer the event to the null with a one
    // time event listener so we can defer the event.
    // 处理 Facebook 遗留支持模式
    if (
      enableLegacyFBSupport &&
      // If our event flags match the required flags for entering
      // FB legacy mode and we are prcocessing the "click" event,
      // then we can defer the event to the "document", to allow
      // for legacy FB support, where the expected behavior was to
      // match React < 16 behavior of delegated clicks to the doc.
      domEventName === 'click' &&
      (eventSystemFlags & SHOULD_NOT_DEFER_CLICK_FOR_FB_SUPPORT_MODE) === 0
    ) {
      deferClickToDocumentForLegacyFBSupport(domEventName, targetContainer);
      return;
    }
    // 查找正确的祖先 Fiber
    // 主循环遍历 Fiber 树，寻找与当前 targetContainer 匹配的根边界（Root 或 Portal）
    if (targetInst !== null) {
      // 如果 targetInst 不为空，则进入主循环，尝试找到正确的祖先 Fiber 实例

      // The below logic attempts to work out if we need to change
      // the target fiber to a different ancestor. We had similar logic
      // in the legacy event system, except the big difference between
      // systems is that the modern event system now has an event listener
      // attached to each React Root and React Portal Root. Together,
      // the DOM nodes representing these roots are the "rootContainer".
      // To figure out which ancestor instance we should use, we traverse
      // up the fiber tree from the target instance and attempt to find
      // root boundaries that match that of our current "rootContainer".
      // If we find that "rootContainer", we find the parent fiber
      // sub-tree for that root and make that our ancestor instance.
      let node = targetInst;
      mainLoop: while (true) {
        if (node === null) {
          return;
        }
        const nodeTag = node.tag;
        if (nodeTag === HostRoot || nodeTag === HostPortal) {
          let container = node.stateNode.containerInfo;
          if (isMatchingRootContainer(container, targetContainerNode)) {
            break;
          }
          // Portal的跨根问题：目标是 Portal，但容器不匹配：
          // 当前遍历到的 Fiber 节点是 HostPortal 类型，但其对应的容器（containerInfo）与 targetContainer（目标根容器）不匹配。
          // 例如：Portal 的宿主容器是 #modal，而 targetContainer 是 #app，说明该 Portal 属于其他根。
          if (nodeTag === HostPortal) {
            // The target is a portal, but it's not the rootContainer we're looking for.
            // Normally portals handle their own events all the way down to the root.
            // So we should be able to stop now. However, we don't know if this portal
            // was part of *our* root.
            let grandNode = node.return;
            while (grandNode !== null) {// 向上遍历父节点
              const grandTag = grandNode.tag;
              if (grandTag === HostRoot || grandTag === HostPortal) {
                const grandContainer = grandNode.stateNode.containerInfo;
                // 找到匹配的根容器，说明该 Portal 属于当前根
                // 因此无需调整，直接return
                if (
                  isMatchingRootContainer(grandContainer, targetContainerNode)
                ) {
                  // This is the rootContainer we're looking for and we found it as
                  // a parent of the Portal. That means we can ignore it because the
                  // Portal will bubble through to us.
                  return;
                }
              }
              grandNode = grandNode.return;
            }
          }
          // Now we need to find it's corresponding host fiber in the other
          // tree. To do this we can use getClosestInstanceFromNode, but we
          // need to validate that the fiber is a host instance, otherwise
          // we need to traverse up through the DOM till we find the correct
          // node that is from the other tree.
          // 当没找到HostRoot和HostPortal合适的根，我们需要向上遍历DOM，找到对应的宿主Fiber节点。
          while (container !== null) {
            // 找container-DOM对应的向上找最近的fiber节点
            const parentNode = getClosestInstanceFromNode(container);
            if (parentNode === null) {
              return;
            }
            const parentTag = parentNode.tag;
            if (parentTag === HostComponent || parentTag === HostText) {
              node = ancestorInst = parentNode;
              continue mainLoop;
            }
            container = container.parentNode;
          }
        }
        node = node.return;
      }
    }
  }

  batchedEventUpdates(() =>
    // 调用 dispatchEventsForPlugins 函数来真正分发事件给插件系统，完成事件处理过程
    dispatchEventsForPlugins(
      domEventName,
      eventSystemFlags,
      nativeEvent,
      ancestorInst,
      targetContainer,
    ),
  );
}

function createDispatchListener(
  instance: null | Fiber,
  listener: Function,
  currentTarget: EventTarget,
): DispatchListener {
  return {
    instance,
    listener,
    currentTarget,
  };
}

/**
 * 从targetFiber开始, 向上遍历, 直到 root 为止, 收集所有的 listener到listeners数组中
 * - 遍历时每轮收集过程
 *    1. 只处理宿主组件节点：当节点类型是HostComponent时(如: div, span, button等类型
 *      - 实验性功能的事件类型：通过 createEventHandle API 定义的事件（React 实验性功能）：用getEventHandlerListeners获取到数组遍历push进listeners
 *      - react事件类型：getListener获取单项值push
 *    2. 额外处理作用域组件实验性功能：处理通过 useScope 创建的作用域组件
 * 
 * 如果只收集目标节点, 则不用向上遍历, 直接退出循环
 * @param {*} targetFiber 起始的 Fiber 节点，从此节点开始向上遍历
 * @param {*} reactName React 事件名称，如 onClick
 * @param {*} nativeEventType 原生事件类型，如 click
 * @param {*} inCapturePhase 是否处于捕获阶段
 * @param {*} accumulateTargetOnly 是否只收集目标节点的事件监听器
 * @returns 返回listeners数组
 */
export function accumulateSinglePhaseListeners(
  targetFiber: Fiber | null,
  reactName: string | null,
  nativeEventType: string,
  inCapturePhase: boolean,
  accumulateTargetOnly: boolean,
): Array<DispatchListener> {
  const captureName = reactName !== null ? reactName + 'Capture' : null;
  const reactEventName = inCapturePhase ? captureName : reactName;
  /** 用于存储收集到的事件监听器 */
  const listeners: Array<DispatchListener> = [];
  /** 当前遍历到的 Fiber 节点，初始值为 targetFiber */
  let instance = targetFiber;
  /** 最后一个遇到的宿主组件节点，初始值为 null。 */
  let lastHostComponent = null;

  // Accumulate all instances and listeners via the target -> root path.
  // 从targetFiber开始, 向上遍历, 直到 root 为止, 收集所有的 listeners
  while (instance !== null) {
    // stateNode：Fiber 节点对应的 DOM 节点(宿主组件)或组件实例(非宿主组件)。
    // tag：Fiber 节点的类型标签
    const {stateNode, tag} = instance;
    // Handle listeners that are on HostComponents (i.e. <div>)
    // 1. 处理宿主组件节点：当节点类型是HostComponent时(如: div, span, button等类型)
    if (tag === HostComponent && stateNode !== null) {
      lastHostComponent = stateNode;

      // createEventHandle listeners
      // 原生事件类型时
      if (enableCreateEventHandleAPI) {
        const eventHandlerListeners = getEventHandlerListeners(
          lastHostComponent,
        );
        if (eventHandlerListeners !== null) {
          eventHandlerListeners.forEach(entry => {
            if (
              entry.type === nativeEventType &&
              entry.capture === inCapturePhase
            ) {
              listeners.push(
                createDispatchListener(
                  instance,
                  entry.callback,
                  (lastHostComponent: any),
                ),
              );
            }
          });
        }
      }

      // 标准react事件类型时：Standard React on* listeners, i.e. onClick or onClickCapture
      if (reactEventName !== null) {
        const listener = getListener(instance, reactEventName);
        if (listener != null) {
          listeners.push(
            createDispatchListener(instance, listener, lastHostComponent),
          );
        }
      }
    }
    // 处理作用域组件节点
    else if (
      enableCreateEventHandleAPI &&
      enableScopeAPI &&
      tag === ScopeComponent &&
      lastHostComponent !== null &&
      stateNode !== null
    ) {
      // Scopes
      const reactScopeInstance = stateNode;
      const eventHandlerListeners = getEventHandlerListeners(
        reactScopeInstance,
      );
      if (eventHandlerListeners !== null) {
        eventHandlerListeners.forEach(entry => {
          if (
            entry.type === nativeEventType &&
            entry.capture === inCapturePhase
          ) {
            listeners.push(
              createDispatchListener(
                instance,
                entry.callback,
                (lastHostComponent: any),
              ),
            );
          }
        });
      }
    }
    // If we are only accumulating events for the target, then we don't
    // continue to propagate through the React fiber tree to find other
    // listeners.
    // 如果只收集目标节点, 则不用向上遍历, 直接退出
    if (accumulateTargetOnly) {
      break;
    }
    instance = instance.return;
  }
  return listeners;
}

// We should only use this function for:
// - BeforeInputEventPlugin
// - ChangeEventPlugin
// - SelectEventPlugin
// This is because we only process these plugins
// in the bubble phase, so we need to accumulate two
// phase event listeners (via emulation).
export function accumulateTwoPhaseListeners(
  targetFiber: Fiber | null,
  reactName: string,
): Array<DispatchListener> {
  const captureName = reactName + 'Capture';
  const listeners: Array<DispatchListener> = [];
  let instance = targetFiber;

  // Accumulate all instances and listeners via the target -> root path.
  while (instance !== null) {
    const {stateNode, tag} = instance;
    // Handle listeners that are on HostComponents (i.e. <div>)
    if (tag === HostComponent && stateNode !== null) {
      const currentTarget = stateNode;
      const captureListener = getListener(instance, captureName);
      if (captureListener != null) {
        listeners.unshift(
          createDispatchListener(instance, captureListener, currentTarget),
        );
      }
      const bubbleListener = getListener(instance, reactName);
      if (bubbleListener != null) {
        listeners.push(
          createDispatchListener(instance, bubbleListener, currentTarget),
        );
      }
    }
    instance = instance.return;
  }
  return listeners;
}

function getParent(inst: Fiber | null): Fiber | null {
  if (inst === null) {
    return null;
  }
  do {
    inst = inst.return;
    // TODO: If this is a HostRoot we might want to bail out.
    // That is depending on if we want nested subtrees (layers) to bubble
    // events to their parent. We could also go through parentNode on the
    // host node but that wouldn't work for React Native and doesn't let us
    // do the portal feature.
  } while (inst && inst.tag !== HostComponent);
  if (inst) {
    return inst;
  }
  return null;
}

/**
 * Return the lowest common ancestor of A and B, or null if they are in
 * different trees.
 */
function getLowestCommonAncestor(instA: Fiber, instB: Fiber): Fiber | null {
  let nodeA = instA;
  let nodeB = instB;
  let depthA = 0;
  for (let tempA = nodeA; tempA; tempA = getParent(tempA)) {
    depthA++;
  }
  let depthB = 0;
  for (let tempB = nodeB; tempB; tempB = getParent(tempB)) {
    depthB++;
  }

  // If A is deeper, crawl up.
  while (depthA - depthB > 0) {
    nodeA = getParent(nodeA);
    depthA--;
  }

  // If B is deeper, crawl up.
  while (depthB - depthA > 0) {
    nodeB = getParent(nodeB);
    depthB--;
  }

  // Walk in lockstep until we find a match.
  let depth = depthA;
  while (depth--) {
    if (nodeA === nodeB || (nodeB !== null && nodeA === nodeB.alternate)) {
      return nodeA;
    }
    nodeA = getParent(nodeA);
    nodeB = getParent(nodeB);
  }
  return null;
}

function accumulateEnterLeaveListenersForEvent(
  dispatchQueue: DispatchQueue,
  event: KnownReactSyntheticEvent,
  target: Fiber,
  common: Fiber | null,
  inCapturePhase: boolean,
): void {
  const registrationName = event._reactName;
  const listeners: Array<DispatchListener> = [];

  let instance = target;
  while (instance !== null) {
    if (instance === common) {
      break;
    }
    const {alternate, stateNode, tag} = instance;
    if (alternate !== null && alternate === common) {
      break;
    }
    if (tag === HostComponent && stateNode !== null) {
      const currentTarget = stateNode;
      if (inCapturePhase) {
        const captureListener = getListener(instance, registrationName);
        if (captureListener != null) {
          listeners.unshift(
            createDispatchListener(instance, captureListener, currentTarget),
          );
        }
      } else if (!inCapturePhase) {
        const bubbleListener = getListener(instance, registrationName);
        if (bubbleListener != null) {
          listeners.push(
            createDispatchListener(instance, bubbleListener, currentTarget),
          );
        }
      }
    }
    instance = instance.return;
  }
  if (listeners.length !== 0) {
    dispatchQueue.push({event, listeners});
  }
}

// We should only use this function for:
// - EnterLeaveEventPlugin
// This is because we only process this plugin
// in the bubble phase, so we need to accumulate two
// phase event listeners.
export function accumulateEnterLeaveTwoPhaseListeners(
  dispatchQueue: DispatchQueue,
  leaveEvent: KnownReactSyntheticEvent,
  enterEvent: null | KnownReactSyntheticEvent,
  from: Fiber | null,
  to: Fiber | null,
): void {
  const common = from && to ? getLowestCommonAncestor(from, to) : null;

  if (from !== null) {
    accumulateEnterLeaveListenersForEvent(
      dispatchQueue,
      leaveEvent,
      from,
      common,
      false,
    );
  }
  if (to !== null && enterEvent !== null) {
    accumulateEnterLeaveListenersForEvent(
      dispatchQueue,
      enterEvent,
      to,
      common,
      true,
    );
  }
}

export function accumulateEventHandleNonManagedNodeListeners(
  reactEventType: DOMEventName,
  currentTarget: EventTarget,
  inCapturePhase: boolean,
): Array<DispatchListener> {
  const listeners: Array<DispatchListener> = [];

  const eventListeners = getEventHandlerListeners(currentTarget);
  if (eventListeners !== null) {
    eventListeners.forEach(entry => {
      if (entry.type === reactEventType && entry.capture === inCapturePhase) {
        listeners.push(
          createDispatchListener(null, entry.callback, currentTarget),
        );
      }
    });
  }
  return listeners;
}

export function getListenerSetKey(
  domEventName: DOMEventName,
  capture: boolean,
): string {
  return `${domEventName}__${capture ? 'capture' : 'bubble'}`;
}
