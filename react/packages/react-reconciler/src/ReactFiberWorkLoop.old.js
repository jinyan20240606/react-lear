/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Thenable, Wakeable} from 'shared/ReactTypes';
import type {Fiber, FiberRoot} from './ReactInternalTypes';
import type {Lanes, Lane} from './ReactFiberLane';
import type {ReactPriorityLevel} from './ReactInternalTypes';
import type {Interaction} from 'scheduler/src/Tracing';
import type {SuspenseState} from './ReactFiberSuspenseComponent.old';
import type {Effect as HookEffect} from './ReactFiberHooks.old';
import type {StackCursor} from './ReactFiberStack.old';

import {
  warnAboutDeprecatedLifecycles,
  enableSuspenseServerRenderer,
  replayFailedUnitOfWorkWithInvokeGuardedCallback,
  enableProfilerTimer,
  enableProfilerCommitHooks,
  enableSchedulerTracing,
  warnAboutUnmockedScheduler,
  deferRenderPhaseUpdateToNextBatch,
  decoupleUpdatePriorityFromScheduler,
  enableDebugTracing,
  enableSchedulingProfiler,
  enableScopeAPI,
} from 'shared/ReactFeatureFlags';
import ReactSharedInternals from 'shared/ReactSharedInternals';
import invariant from 'shared/invariant';

import {
  scheduleCallback,
  cancelCallback,
  getCurrentPriorityLevel,
  runWithPriority,
  shouldYield,
  requestPaint,
  now,
  NoPriority as NoSchedulerPriority,
  ImmediatePriority as ImmediateSchedulerPriority,
  UserBlockingPriority as UserBlockingSchedulerPriority,
  NormalPriority as NormalSchedulerPriority,
  flushSyncCallbackQueue,
  scheduleSyncCallback,
} from './SchedulerWithReactIntegration.old';
import {
  logCommitStarted,
  logCommitStopped,
  logLayoutEffectsStarted,
  logLayoutEffectsStopped,
  logPassiveEffectsStarted,
  logPassiveEffectsStopped,
  logRenderStarted,
  logRenderStopped,
} from './DebugTracing';
import {
  markCommitStarted,
  markCommitStopped,
  markLayoutEffectsStarted,
  markLayoutEffectsStopped,
  markPassiveEffectsStarted,
  markPassiveEffectsStopped,
  markRenderStarted,
  markRenderYielded,
  markRenderStopped,
} from './SchedulingProfiler';

// The scheduler is imported here *only* to detect whether it's been mocked
import * as Scheduler from 'scheduler';

import {__interactionsRef, __subscriberRef} from 'scheduler/tracing';

import {
  prepareForCommit,
  resetAfterCommit,
  scheduleTimeout,
  cancelTimeout,
  noTimeout,
  warnsIfNotActing,
  beforeActiveInstanceBlur,
  afterActiveInstanceBlur,
  clearContainer,
} from './ReactFiberHostConfig';

import {
  createWorkInProgress,
  assignFiberPropertiesInDEV,
} from './ReactFiber.old';
import {
  NoMode,
  StrictMode,
  ProfileMode,
  BlockingMode,
  ConcurrentMode,
} from './ReactTypeOfMode';
import {
  HostRoot,
  IndeterminateComponent,
  ClassComponent,
  SuspenseComponent,
  SuspenseListComponent,
  FunctionComponent,
  ForwardRef,
  MemoComponent,
  SimpleMemoComponent,
  Block,
  OffscreenComponent,
  LegacyHiddenComponent,
  ScopeComponent,
} from './ReactWorkTags';
import {LegacyRoot} from './ReactRootTags';
import {
  NoFlags,
  PerformedWork,
  Placement,
  Update,
  PlacementAndUpdate,
  Deletion,
  Ref,
  ContentReset,
  Snapshot,
  Callback,
  Passive,
  PassiveUnmountPendingDev,
  Incomplete,
  HostEffectMask,
  Hydrating,
  HydratingAndUpdate,
} from './ReactFiberFlags';
import {
  NoLanePriority,
  SyncLanePriority,
  SyncBatchedLanePriority,
  InputDiscreteLanePriority,
  DefaultLanePriority,
  NoLanes,
  NoLane,
  SyncLane,
  SyncBatchedLane,
  OffscreenLane,
  NoTimestamp,
  findUpdateLane,
  findTransitionLane,
  findRetryLane,
  includesSomeLane,
  isSubsetOfLanes,
  mergeLanes,
  removeLanes,
  pickArbitraryLane,
  hasDiscreteLanes,
  includesNonIdleWork,
  includesOnlyRetries,
  includesOnlyTransitions,
  getNextLanes,
  returnNextLanesPriority,
  setCurrentUpdateLanePriority,
  getCurrentUpdateLanePriority,
  markStarvedLanesAsExpired,
  getLanesToRetrySynchronouslyOnError,
  getMostRecentEventTime,
  markRootUpdated,
  markRootSuspended as markRootSuspended_dontCallThisOneDirectly,
  markRootPinged,
  markRootExpired,
  markDiscreteUpdatesExpired,
  markRootFinished,
  schedulerPriorityToLanePriority,
  lanePriorityToSchedulerPriority,
} from './ReactFiberLane';
import {requestCurrentTransition, NoTransition} from './ReactFiberTransition';
import {beginWork as originalBeginWork} from './ReactFiberBeginWork.old';
import {completeWork} from './ReactFiberCompleteWork.old';
import {unwindWork, unwindInterruptedWork} from './ReactFiberUnwindWork.old';
import {
  throwException,
  createRootErrorUpdate,
  createClassErrorUpdate,
} from './ReactFiberThrow.old';
import {
  commitBeforeMutationLifeCycles as commitBeforeMutationEffectOnFiber,
  commitLifeCycles as commitLayoutEffectOnFiber,
  commitPlacement,
  commitWork,
  commitDeletion,
  commitDetachRef,
  commitAttachRef,
  commitPassiveEffectDurations,
  commitResetTextContent,
  isSuspenseBoundaryBeingHidden,
} from './ReactFiberCommitWork.old';
import {enqueueUpdate} from './ReactUpdateQueue.old';
import {resetContextDependencies} from './ReactFiberNewContext.old';
import {
  resetHooksAfterThrow,
  ContextOnlyDispatcher,
  getIsUpdatingOpaqueValueInRenderPhaseInDEV,
} from './ReactFiberHooks.old';
import {createCapturedValue} from './ReactCapturedValue';
import {
  push as pushToStack,
  pop as popFromStack,
  createCursor,
} from './ReactFiberStack.old';

import {
  recordCommitTime,
  recordPassiveEffectDuration,
  startPassiveEffectTimer,
  startProfilerTimer,
  stopProfilerTimerIfRunningAndRecordDelta,
} from './ReactProfilerTimer.old';

// DEV stuff
import getComponentName from 'shared/getComponentName';
import ReactStrictModeWarnings from './ReactStrictModeWarnings.old';
import {
  isRendering as ReactCurrentDebugFiberIsRenderingInDEV,
  current as ReactCurrentFiberCurrent,
  resetCurrentFiber as resetCurrentDebugFiberInDEV,
  setCurrentFiber as setCurrentDebugFiberInDEV,
} from './ReactCurrentFiber';
import {
  invokeGuardedCallback,
  hasCaughtError,
  clearCaughtError,
} from 'shared/ReactErrorUtils';
import {onCommitRoot as onCommitRootDevTools} from './ReactFiberDevToolsHook.old';
import {onCommitRoot as onCommitRootTestSelector} from './ReactTestSelectors';

// Used by `act`
import enqueueTask from 'shared/enqueueTask';
import {doesFiberContain} from './ReactFiberTreeReflection';

const ceil = Math.ceil;

const {
  /** 在FunctionComponent render前，会根据FunctionComponent对应fiber的以下条件区分mount与update。
current === null || current.memoizedState === null
并将不同情况对应的dispatcher赋值给全局变量ReactCurrentDispatcher的current属性。 */
  ReactCurrentDispatcher,
  ReactCurrentOwner,
  IsSomeRendererActing,
} = ReactSharedInternals;

type ExecutionContext = number;

export const NoContext = /*             */ 0b0000000;
const BatchedContext = /*               */ 0b0000001;
/** 事件上下文 */
const EventContext = /*                 */ 0b0000010;
/** 
 * 离散事件上下文
 * 
 * 用户交互或其他外部事件触发时，导致组件状态或属性发生变化的事件。这些事件在时间上是离散的，
 * 即它们在特定的时间点发生，而不是连续地变化
 * 例如每次点击按钮时增加计数器的值。这个点击事件就是一个离散事件。鼠标事件表单元素事件键盘事件生命周期事件等
 * 
 *  */
const DiscreteEventContext = /*     4    */ 0b0000100;
const LegacyUnbatchedContext = /*   8    */ 0b0001000;
const RenderContext = /*             16   */ 0b0010000;
const CommitContext = /*            32    */ 0b0100000;
export const RetryAfterError = /*    64   */ 0b1000000;

// 构造fiber树的完成后的退出状态
type RootExitStatus = 0 | 1 | 2 | 3 | 4 | 5;
const RootIncomplete = 0;
const RootFatalErrored = 1;
const RootErrored = 2;
const RootSuspended = 3;
const RootSuspendedWithDelay = 4;
const RootCompleted = 5;

// 描述我们在 React 执行堆栈中的上下文标志
let executionContext: ExecutionContext = NoContext;
// The root we're working on
/** WIP的 fiberRoot节点 */
let workInProgressRoot: FiberRoot | null = null;
// The fiber we're working on
let workInProgress: Fiber | null = null;
// The lanes we're rendering
let workInProgressRootRenderLanes: Lanes = NoLanes;

// Stack that allows components to change the render lanes for its subtree
// This is a superset of the lanes we started working on at the root. The only
// case where it's different from `workInProgressRootRenderLanes` is when we
// enter a subtree that is hidden and needs to be unhidden: Suspense and
// Offscreen component.
//
// Most things in the work loop should deal with workInProgressRootRenderLanes.
// Most things in begin/complete phases should deal with subtreeRenderLanes.
let subtreeRenderLanes: Lanes = NoLanes;
const subtreeRenderLanesCursor: StackCursor<Lanes> = createCursor(NoLanes);

/** renderRootSync构造fiber树后完成的返回状态 */
let workInProgressRootExitStatus: RootExitStatus = RootIncomplete;
// A fatal error, if one is thrown
let workInProgressRootFatalError: mixed = null;
// "Included" lanes refer to lanes that were worked on during this render. It's
// slightly different than `renderLanes` because `renderLanes` can change as you
// enter and exit an Offscreen tree. This value is the combination of all render
// lanes for the entire render phase.
/** 记录在整个渲染阶段中处理的所有通道（lanes）: 整个渲染过程中保持不变，rendersLanes会变 */
let workInProgressRootIncludedLanes: Lanes = NoLanes;
// The work left over by components that were visited during this render. Only
// includes unprocessed updates, not work in bailed out children.
let workInProgressRootSkippedLanes: Lanes = NoLanes;
// Lanes that were updated (in an interleaved event) during this render.
let workInProgressRootUpdatedLanes: Lanes = NoLanes;
// Lanes that were pinged (in an interleaved event) during this render.
let workInProgressRootPingedLanes: Lanes = NoLanes;

let mostRecentlyUpdatedRoot: FiberRoot | null = null;

// The most recent time we committed a fallback. This lets us ensure a train
// model where we don't commit new loading states in too quick succession.
let globalMostRecentFallbackTime: number = 0;
const FALLBACK_THROTTLE_MS: number = 500;

// The absolute time for when we should start giving up on rendering
// more and prefer CPU suspense heuristics instead.
let workInProgressRootRenderTargetTime: number = Infinity;
// How long a render is supposed to take before we start following CPU
// suspense heuristics and opt out of rendering more content.
const RENDER_TIMEOUT_MS = 500;

function resetRenderTimer() {
  workInProgressRootRenderTargetTime = now() + RENDER_TIMEOUT_MS;
}

export function getRenderTargetTime(): number {
  return workInProgressRootRenderTargetTime;
}

let nextEffect: Fiber | null = null;
let hasUncaughtError = false;
let firstUncaughtError = null;
let legacyErrorBoundariesThatAlreadyFailed: Set<mixed> | null = null;

let rootDoesHavePassiveEffects: boolean = false;
let rootWithPendingPassiveEffects: FiberRoot | null = null;
let pendingPassiveEffectsRenderPriority: ReactPriorityLevel = NoSchedulerPriority;
let pendingPassiveEffectsLanes: Lanes = NoLanes;
let pendingPassiveHookEffectsMount: Array<HookEffect | Fiber> = [];
let pendingPassiveHookEffectsUnmount: Array<HookEffect | Fiber> = [];
let pendingPassiveProfilerEffects: Array<Fiber> = [];

let rootsWithPendingDiscreteUpdates: Set<FiberRoot> | null = null;

// Use these to prevent an infinite loop of nested updates
const NESTED_UPDATE_LIMIT = 50;
let nestedUpdateCount: number = 0;
let rootWithNestedUpdates: FiberRoot | null = null;

const NESTED_PASSIVE_UPDATE_LIMIT = 50;
let nestedPassiveUpdateCount: number = 0;

// Marks the need to reschedule pending interactions at these lanes
// during the commit phase. This enables them to be traced across components
// that spawn new work during render. E.g. hidden boundaries, suspended SSR
// hydration or SuspenseList.
// TODO: Can use a bitmask instead of an array
let spawnedWorkDuringRender: null | Array<Lane | Lanes> = null;

// If two updates are scheduled within the same event, we should treat their
// event times as simultaneous, even if the actual clock time has advanced
// between the first and second call.
let currentEventTime: number = NoTimestamp;
/** 当前正在进行的工作中与事件处理相关的优先级通道: 
 * 
 * 当前正在进行的工作（Work-In-Progress, WIP)
 * 
 * 主要用于处理离散事件（如用户输入事件）时，确保这些事件能够在合适的优先级下被处理 */
let currentEventWipLanes: Lanes = NoLanes;
let currentEventPendingLanes: Lanes = NoLanes;

// Dev only flag that tracks if passive effects are currently being flushed.
// We warn about state updates for unmounted components differently in this case.
let isFlushingPassiveEffects = false;

let focusedInstanceHandle: null | Fiber = null;
let shouldFireAfterActiveInstanceBlur: boolean = false;

export function getWorkInProgressRoot(): FiberRoot | null {
  return workInProgressRoot;
}

export function requestEventTime() {
  if ((executionContext & (RenderContext | CommitContext)) !== NoContext) {
    // We're inside React, so it's fine to read the actual time.
    return now();
  }
  // We're not inside React, so we may be in the middle of a browser event.
  if (currentEventTime !== NoTimestamp) {
    // Use the same start time for all updates until we enter React again.
    return currentEventTime;
  }
  // This is the first update since React yielded. Compute a new start time.
  currentEventTime = now();
  return currentEventTime;
}

export function getCurrentTime() {
  return now();
}

/**
 * 请求优先级通道：根据当前fiber节点的mode模式、渲染阶段、优先级和上下文来决定应该选择哪个更新通道
 * 共18种alnes通道进行赛道完成跑圈
 * 确保更新能够在合适的时间点被调度和执行
 * @params {*} fiber 当前的 Fiber 节点，表示要更新的组件或元素
 */
export function requestUpdateLane(fiber: Fiber): Lane {
  // 1、检查 Fiber 节点的启动模式：
  // // 如果非阻塞模式（BlockingMode），直接返回同步通道（SyncLane）。
  // // 如果非并发模式（ConcurrentMode），根据当前的调度优先级返回同步通道或批量同步通道。
  const mode = fiber.mode;
  // 检查当前渲染模式是不是阻塞模式，等于NoMode表示不是，则使用同步模式渲染
  // 使用ReactDOM.render 是legacy传统模式，这种情况首先就会进入该分支选择同步更新通道
  if ((mode & BlockingMode) === NoMode) {
    return (SyncLane: Lane);
  }
  // 不是并发模式时，使用同步或批量同步车道lane
  else if ((mode & ConcurrentMode) === NoMode) {
    // 当前调度器是否是立即优先级
    return getCurrentPriorityLevel() === ImmediateSchedulerPriority
      // 同步通道：1环最内环 最优先  
    ? (SyncLane: Lane)
      // 同步批量通道：2环优先级赛道通道
      : (SyncBatchedLane: Lane);
  } 
  // 如果当前处于渲染阶段，并且允许渲染阶段更新，从当前正在渲染的通道中选择一个任意的通道。
  else if (
    // 延迟渲染阶段更新到下一个批次的标志
    !deferRenderPhaseUpdateToNextBatch &&
    // 当前执行上下文是否包含渲染上下文（RenderContext）。如果包含，则表示当前处于渲染阶段
    (executionContext & RenderContext) !== NoContext &&
    // 当前正在进行的根渲染通道是否不为空。如果不为空，则表示有正在进行的渲染任务
    workInProgressRootRenderLanes !== NoLanes
  ) {
    // This is a render phase update. These are not officially supported. The
    // old behavior is to give this the same "thread" (expiration time) as
    // whatever is currently rendering. So if you call `setState` on a component
    // that happens later in the same render, it will flush. Ideally, we want to
    // remove the special case and treat them as if they came from an
    // interleaved event. Regardless, this pattern is not officially supported.
    // This behavior is only a fallback. The flag only exists until we can roll
    // out the setState warning, since existing code might accidentally rely on
    // the current behavior.
    // 从当前正在进行的根渲染通道集中选择一个任意的通道
    return pickArbitraryLane(workInProgressRootRenderLanes);
  }

  // The algorithm for assigning an update to a lane should be stable for all
  // updates at the same priority within the same event. To do this, the inputs
  // to the algorithm must be the same. For example, we use the `renderLanes`
  // to avoid choosing a lane that is already in the middle of rendering.
  //
  // However, the "included" lanes could be mutated in between updates in the
  // same event, like if you perform an update inside `flushSync`. Or any other
  // code path that might call `prepareFreshStack`.
  //
  // The trick we use is to cache the first of each of these inputs within an
  // event. Then reset the cached values once we can be sure the event is over.
  // Our heuristic for that is whenever we enter a concurrent work loop.
  //
  // We'll do the same for `currentEventPendingLanes` below.
  // 2、算法稳定性：缓存当前事件的工作进度通道（currentEventWipLanes），确保在同一个事件中选择的通道是一致的
  if (currentEventWipLanes === NoLanes) {
    currentEventWipLanes = workInProgressRootIncludedLanes;
  }

  // 3、过渡更新处理：检查是否有过渡更新（isTransition），如果有，从当前事件的工作进度通道和待处理通道中选择一个合适的过渡通道。
  const isTransition = requestCurrentTransition() !== NoTransition;
  if (isTransition) {
    if (currentEventPendingLanes !== NoLanes) {
      currentEventPendingLanes =
        mostRecentlyUpdatedRoot !== null
          ? mostRecentlyUpdatedRoot.pendingLanes
          : NoLanes;
    }
    return findTransitionLane(currentEventWipLanes, currentEventPendingLanes);
  }

  // TODO: Remove this dependency on the Scheduler priority.
  // To do that, we're replacing it with an update lane priority.
  // 4、调度优先级处理
  // 获取当前的调度优先级（schedulerPriority
  const schedulerPriority = getCurrentPriorityLevel();

  // The old behavior was using the priority level of the Scheduler.
  // This couples React to the Scheduler internals, so we're replacing it
  // with the currentUpdateLanePriority above. As an example of how this
  // could be problematic, if we're not inside `Scheduler.runWithPriority`,
  // then we'll get the priority of the current running Scheduler task,
  // which is probably not what we want.
  let lane;
  if (
    // TODO: Temporary. We're removing the concept of discrete updates.
    // 如果当前处于离散事件上下文中且调度优先级为用户阻塞优先级（UserBlockingSchedulerPriority）
    // 选择输入离散通道优先级（InputDiscreteLanePriority）
    (executionContext & DiscreteEventContext) !== NoContext &&
    schedulerPriority === UserBlockingSchedulerPriority
  ) {
    lane = findUpdateLane(InputDiscreteLanePriority, currentEventWipLanes);
  } else {
    // 否则，将调度优先级转换为调度通道优先级（schedulerLanePriority），并根据当前策略选择一个合适的通道。
    const schedulerLanePriority = schedulerPriorityToLanePriority(
      schedulerPriority,
    );

    if (decoupleUpdatePriorityFromScheduler) {
      // In the new strategy, we will track the current update lane priority
      // inside React and use that priority to select a lane for this update.
      // For now, we're just logging when they're different so we can assess.
      const currentUpdateLanePriority = getCurrentUpdateLanePriority();

      if (
        // 如果启用了解耦更新优先级和调度优先级的功能，检查当前的调度通道优先级和更新通道优先级是否一致，并在不一致时发出警告
        schedulerLanePriority !== currentUpdateLanePriority &&
        currentUpdateLanePriority !== NoLanePriority
      ) {
        if (__DEV__) {
          console.error(
            'Expected current scheduler lane priority %s to match current update lane priority %s',
            schedulerLanePriority,
            currentUpdateLanePriority,
          );
        }
      }
    }

    lane = findUpdateLane(schedulerLanePriority, currentEventWipLanes);
  }

  return lane;
}

function requestRetryLane(fiber: Fiber) {
  // This is a fork of `requestUpdateLane` designed specifically for Suspense
  // "retries" — a special update that attempts to flip a Suspense boundary
  // from its placeholder state to its primary/resolved state.

  // Special cases
  const mode = fiber.mode;
  if ((mode & BlockingMode) === NoMode) {
    return (SyncLane: Lane);
  } else if ((mode & ConcurrentMode) === NoMode) {
    return getCurrentPriorityLevel() === ImmediateSchedulerPriority
      ? (SyncLane: Lane)
      : (SyncBatchedLane: Lane);
  }

  // See `requestUpdateLane` for explanation of `currentEventWipLanes`
  if (currentEventWipLanes === NoLanes) {
    currentEventWipLanes = workInProgressRootIncludedLanes;
  }
  return findRetryLane(currentEventWipLanes);
}

/**
 * 统一调度更新：将更新请求添加到 React 的更新队列中，并根据当前的上下文和优先级决定何时处理这些更新
 * 1. 标记更新通道：拿到新的fiberRoot节点：从传入的fiber向上追溯到根节点rootFiber以及fiberRoot，标记更新通道lane
 *    - 这个新的fiberRoot：包含了lane优先级和rootFiber节点上的update对象负载的reactElement树
 * 2. 调度更新：传fiberRoot参到ensureRootIsScheduled调度更新
 *    - fiberRoot根实例调度：ensureRootIsScheduled(root, eventTime)  => 调度核心perform[Sync|Concurrent]WorkOnRoot(root)回调任务;
 *        - 执行performSyncWorkOnRoot回调时，就会实际使用这个update对象负载渲染到页面上去
 *    - 调度fiberRoot的pendingInteractions：schedulePendingInteractions(root, lane);
 * @param {*} fiber fiberRoot.current即HostRootFiber
 */
export function scheduleUpdateOnFiber(
  /** fiberRoot.current即HostRootFiber */
  fiber: Fiber,
  /** 请求的更新的优先级通道 */
  lane: Lane,
  /** 事件发生的时间戳 */
  eventTime: number,
) {
  // 检查是否有嵌套的更新请求，以防止潜在的无限循环
  checkForNestedUpdates();
  // 开发环境中，如果在渲染阶段进行更新，会发出警告
  warnAboutRenderPhaseUpdatesInDEV(fiber);

  // 1. 标记更新通道：从给定的 Fiber 节点向上追溯到根节点，并给每个追溯的父节点都标记更新车道。如果根节点已经卸载，则发出警告并返回 null
  // 正常返回rootFiber根节点的stateNode值即根实例对象: fiberRoot
  const root = markUpdateLaneFromFiberToRoot(fiber, lane);
  // 如果向上遍历时没有找到根节点HostRoot即rootFiber，直接警告return
  if (root === null) {
    warnAboutUpdateOnUnmountedFiberInDEV(fiber);
    return null;
  }

  // Mark that the root has a pending update.
  // 最后标记根实例有新的更新请求
  markRootUpdated(root, lane, eventTime);

  // 处理特殊情况：处理正在渲染的树的更新 ---- 初次渲染时workInProgressRoot为null，不可能与root相等
  // // 如果 deferRenderPhaseUpdateToNextBatch 标志为真，或者当前不在渲染上下文中，则将更新车道合并到正在进行的渲染树中。
  // // 如果当前渲染树已经处于延迟挂起状态，则标记根节点为挂起状态，并中断当前渲染
  if (root === workInProgressRoot) {
    // Received an update to a tree that's in the middle of rendering. Mark
    // that there was an interleaved update work on this root. Unless the
    // `deferRenderPhaseUpdateToNextBatch` flag is off and this is a render
    // phase update. In that case, we don't treat render phase updates as if
    // they were interleaved, for backwards compat reasons.
    if (
      deferRenderPhaseUpdateToNextBatch ||
      (executionContext & RenderContext) === NoContext
    ) {
      workInProgressRootUpdatedLanes = mergeLanes(
        workInProgressRootUpdatedLanes,
        lane,
      );
    }
    if (workInProgressRootExitStatus === RootSuspendedWithDelay) {
      // The root already suspended with a delay, which means this render
      // definitely won't finish. Since we have a new update, let's mark it as
      // suspended now, right before marking the incoming update. This has the
      // effect of interrupting the current render and switching to the update.
      // TODO: Make sure this doesn't override pings that happen while we've
      // already started rendering.
      markRootSuspended(root, workInProgressRootRenderLanes);
    }
  }

  // 获取当前优先级
  const priorityLevel = getCurrentPriorityLevel();

  // 2. 调度更新
  // 如果更新请求是同步的：  初次挂载时当前上下文为LegacyUnbatchedContext即8进入第一个条件分支：初次挂载时会`function legacyRenderSubtreeIntoContainer(`中的unbatchedUpdates函数改变上下文为8
  // // 如果当前在非批量更新上下文中且不在渲染或提交上下文中，则不需要调度更新，直接执行工作循环。
  // // 否则，执行根节点调度，并调度待处理的交互。如果当前没有上下文，则重置渲染计时器并刷新同步回调队列。
  if (lane === SyncLane) {
    if (
      // Check if we're inside unbatchedUpdates
      (executionContext & LegacyUnbatchedContext) !== NoContext &&
      // Check if we're not already rendering
      (executionContext & (RenderContext | CommitContext)) === NoContext
    ) {
      // 性能追踪相关：处理fiberRoot的pendingInteractions属性。注册根节点的待处理交互，以避免丢失追踪的交互数据.
      schedulePendingInteractions(root, lane);

      // 立即执行同步工作 --- 进入render阶段+commit阶段的入口方法
      performSyncWorkOnRoot(root);
    } else {// 在批量上下文中或渲染上下文时，则需要调度更新
      // 根节点调度
      ensureRootIsScheduled(root, eventTime);
      // 调度追踪相关：处理fiberRoot的pendingInteractions属性。注册根节点的待处理交互，以避免丢失追踪的交互数据
      schedulePendingInteractions(root, lane);
      if (executionContext === NoContext) {
        // 重置渲染计时器
        resetRenderTimer();
        // 刷新同步回调队列
        flushSyncCallbackQueue();
      }
    }
  }
  // 如果更新请求是异步的：更应该去调度器去异步调度
  // // 如果当前在离散事件上下文中且优先级为用户阻塞或立即优先级，则将根节点添加到待处理的离散更新集合中。
  // // 确保根节点已被调度，并调度待处理的交互。
  else {
    // Schedule a discrete update but only if it's not Sync.
    if (
      (executionContext & DiscreteEventContext) !== NoContext &&
      // Only updates at user-blocking priority or greater are considered
      // discrete, even inside a discrete event.
      (priorityLevel === UserBlockingSchedulerPriority ||
        priorityLevel === ImmediateSchedulerPriority)
    ) {
      // This is the result of a discrete event. Track the lowest priority
      // discrete update per root so we can flush them early, if needed.
      if (rootsWithPendingDiscreteUpdates === null) {
        rootsWithPendingDiscreteUpdates = new Set([root]);
      } else {
        rootsWithPendingDiscreteUpdates.add(root);
      }
    }
    // Schedule other updates after in case the callback is sync.
    // 根节点调度
    ensureRootIsScheduled(root, eventTime);
    schedulePendingInteractions(root, lane);
  }

  // We use this when assigning a lane for a transition inside
  // `requestUpdateLane`. We assume it's the same as the root being updated,
  // since in the common case of a single root app it probably is. If it's not
  // the same root, then it's not a huge deal, we just might batch more stuff
  // together more than necessary.
  mostRecentlyUpdatedRoot = root;
}

// This is split into a separate function so we can mark a fiber with pending
// work without treating it as a typical update that originates from an event;
// e.g. retrying a Suspense boundary isn't an update, but it does schedule work
// on a fiber.
/**
 * 函数主要用于确保更新请求能够正确地传播到根节点，从而触发相应的更新流程
 * 
 * 1. 以sourceFiber为起点, 设置起点的fiber.lanes
 * 2. 从起点开始, 直到HostRootFiber, 设置父路径上所有节点(也包括fiber.alternate)的fiber.childLanes.
 * 3. 通过设置fiber.lanes和fiber.childLanes就可以辅助判断子树是否需要更新(在下文循环构造中详细说明).
 * 
   一直向上遍历到根节点，给所有父节点都合并当前节点的lane属性，原因如下：
   * 1. 父节点统一管理更新： App 节点有多个子节点，每个子节点都可能有独立的更新请求。通过更新 childLanes，App 节点可以集中管理这些更新请求，确保在一次渲染周期中处理所有相关的更新
   * 2. 优先级管理：如果 Header 节点和 Footer 节点都有更新请求，但 Header 节点的更新请求优先级更高，父节点可以通过 childLanes 属性来决定先处理 Header 节点的更新
   * 3. 传递更新信息：当一个子节点接收到更新请求时，仅更新该子节点的 lanes 属性是不够的。父节点也需要知道这个更新请求的存在，以便在需要时重新渲染整个子树
   @param {*} sourceFiber 就是传入的current级别当前实际页面中触发更新的fiber节点
   @returns 返回FiberRoot 根节点
*/
function markUpdateLaneFromFiberToRoot(
  sourceFiber: Fiber,
  /** 请求的更新通道 */
  lane: Lane,
): FiberRoot | null {
  // Update the source fiber's lanes
  // 1. 更新源 Fiber 节点的 lanes 属性，将其与新的车道合并。
  // 如果源 Fiber 节点有交替节点（alternate），也更新交替节点的 lanes 属性。
  sourceFiber.lanes = mergeLanes(sourceFiber.lanes, lane);
  let alternate = sourceFiber.alternate;
  if (alternate !== null) {
    alternate.lanes = mergeLanes(alternate.lanes, lane);
  }
  if (__DEV__) {
    if (
      alternate === null &&
      (sourceFiber.flags & (Placement | Hydrating)) !== NoFlags
    ) {
      warnAboutUpdateOnNotYetMountedFiberInDEV(sourceFiber);
    }
  }
  // Walk the parent path to the root and update the child expiration time.
  // 2. 向上追溯到根节点,并给沿途父节点更新lanes通道：
  let node = sourceFiber;
  let parent = sourceFiber.return;
  while (parent !== null) {
    parent.childLanes = mergeLanes(parent.childLanes, lane);
    alternate = parent.alternate;
    if (alternate !== null) {
      alternate.childLanes = mergeLanes(alternate.childLanes, lane);
    } else {
      if (__DEV__) {
        if ((parent.flags & (Placement | Hydrating)) !== NoFlags) {
          warnAboutUpdateOnNotYetMountedFiberInDEV(sourceFiber);
        }
      }
    }
    node = parent;
    parent = parent.return;
  }
  // 如果最终到达的节点是根节点（HostRoot），则返回该根节点的 stateNode。
  // 如果没有到达根节点，则返回 null
  if (node.tag === HostRoot) {
    const root: FiberRoot = node.stateNode;
    return root;
  } else {
    return null;
  }
}

/**
与schedule包通信：(调度中心`scheduler`只能异步调用，因为是靠MessageChannel管理的事件循环) 
* 
根节点调度：根据传入的 FiberRoot 的next lanes 和 优先级，塞进Schedule包调度器调度 performWork 任务
 * 
 * 1-同步or批量同步：最终调度performSyncWorkOnRoot.bind(null, root) 回调任务--塞进调度器Schedule维护的任务队列小顶堆等待执行
 * 
 * 2-其他为异步的：调度performConcurrentWorkOnRoot.bind(null, root) 回调任务--塞进调度器Schedule维护的任务队列小顶堆等待执行
 */
function ensureRootIsScheduled(root: FiberRoot, currentTime: number) {
  const existingCallbackNode = root.callbackNode;

  // 检查是否有车道因其他工作而被饿死（长时间未被处理）。如果有，将这些车道标记为过期，以便优先处理。
  markStarvedLanesAsExpired(root, currentTime);

  // 确定下一个要处理的车道及其优先级。
  const nextLanes = getNextLanes(
    root,
    root === workInProgressRoot ? workInProgressRootRenderLanes : NoLanes,
  );
  // 获取在 `getNextLanes` 调用中计算的优先级。
  const newCallbackPriority = returnNextLanesPriority();

  if (nextLanes === NoLanes) {
    // 特殊情况：没有任何车道需要处理。
    if (existingCallbackNode !== null) {
      cancelCallback(existingCallbackNode);
      root.callbackNode = null;
      root.callbackPriority = NoLanePriority;
    }
    return;
  }

  // 多次调度的节流防抖机制：检查是否存在现有的任务。如果存在，是否可以复用。
  // 例如多次setState触发的连续调度情况
  if (existingCallbackNode !== null) {
    const existingCallbackPriority = root.callbackPriority;
    // 如果现有任务的优先级与新任务的优先级相同，直接复用现有任务
    if (existingCallbackPriority === newCallbackPriority) {
      // 优先级没有变化。可以复用现有的任务。退出。
      return;
    }
    // 优先级变化。取消现有的回调任务。我们将在下面调度新的任务。
    cancelCallback(existingCallbackNode);
  }

  // 调度新的回调任务。
  // 根据新任务的优先级，选择合适的调度方法：
  // // 同步优先级：使用 scheduleSyncCallback 调度为同步任务。
  // // 同步批量优先级：使用 scheduleCallback 调度为异步任务。
  // // 其他异步类优先级：将车道优先级转换为调度器优先级，使用 scheduleCallback 调度并发任务
  let newCallbackNode; // 回调节点
  if (newCallbackPriority === SyncLanePriority) {
    // 特殊情况：同步 React 回调任务被调度到一个特殊的内部队列。
    newCallbackNode = scheduleSyncCallback(
      performSyncWorkOnRoot.bind(null, root),
    );
  } else if (newCallbackPriority === SyncBatchedLanePriority) {
    newCallbackNode = scheduleCallback(
      ImmediateSchedulerPriority,
      performSyncWorkOnRoot.bind(null, root),
    );
  } else {
    const schedulerPriorityLevel = lanePriorityToSchedulerPriority(
      newCallbackPriority,
    );
    newCallbackNode = scheduleCallback(
      schedulerPriorityLevel,
      performConcurrentWorkOnRoot.bind(null, root),
    );
  }

  root.callbackPriority = newCallbackPriority;
  root.callbackNode = newCallbackNode;
}

/**
 * 触发根节点 Concurrent Work 的回调任务
 * 1. 执行 renderRootConcurrent，进入 renderer协调器阶段 构建 fiber树
 * 2. 执行 commitRoot，进入commit渲染器阶段，将fiber树渲染到页面上
 */
function performConcurrentWorkOnRoot(root) {
  // Since we know we're in a React event, we can clear the current
  // event time. The next update will compute a new event time.
  currentEventTime = NoTimestamp;
  currentEventWipLanes = NoLanes;
  currentEventPendingLanes = NoLanes;

  invariant(
    (executionContext & (RenderContext | CommitContext)) === NoContext,
    'Should not already be working.',
  );

  // Flush any pending passive effects before deciding which lanes to work on,
  // in case they schedule additional work.
  const originalCallbackNode = root.callbackNode;
  const didFlushPassiveEffects = flushPassiveEffects();
  if (didFlushPassiveEffects) {
    // Something in the passive effect phase may have canceled the current task.
    // Check if the task node for this root was changed.
    if (root.callbackNode !== originalCallbackNode) {
      // The current task was canceled. Exit. We don't need to call
      // `ensureRootIsScheduled` because the check above implies either that
      // there's a new task, or that there's no remaining work on this root.
      return null;
    } else {
      // Current task was not canceled. Continue.
    }
  }

  // Determine the next expiration time to work on, using the fields stored
  // on the root.
  let lanes = getNextLanes(
    root,
    root === workInProgressRoot ? workInProgressRootRenderLanes : NoLanes,
  );
  if (lanes === NoLanes) {
    // Defensive coding. This is never expected to happen.
    return null;
  }

  let exitStatus = renderRootConcurrent(root, lanes);

  if (
    includesSomeLane(
      workInProgressRootIncludedLanes,
      workInProgressRootUpdatedLanes,
    )
  ) {
    // The render included lanes that were updated during the render phase.
    // For example, when unhiding a hidden tree, we include all the lanes
    // that were previously skipped when the tree was hidden. That set of
    // lanes is a superset of the lanes we started rendering with.
    //
    // So we'll throw out the current work and restart.
    prepareFreshStack(root, NoLanes);
  } else if (exitStatus !== RootIncomplete) {
    if (exitStatus === RootErrored) {
      executionContext |= RetryAfterError;

      // If an error occurred during hydration,
      // discard server response and fall back to client side render.
      if (root.hydrate) {
        root.hydrate = false;
        clearContainer(root.containerInfo);
      }

      // If something threw an error, try rendering one more time. We'll render
      // synchronously to block concurrent data mutations, and we'll includes
      // all pending updates are included. If it still fails after the second
      // attempt, we'll give up and commit the resulting tree.
      lanes = getLanesToRetrySynchronouslyOnError(root);
      if (lanes !== NoLanes) {
        exitStatus = renderRootSync(root, lanes);
      }
    }

    if (exitStatus === RootFatalErrored) {
      const fatalError = workInProgressRootFatalError;
      prepareFreshStack(root, NoLanes);
      markRootSuspended(root, lanes);
      ensureRootIsScheduled(root, now());
      throw fatalError;
    }

    // We now have a consistent tree. The next step is either to commit it,
    // or, if something suspended, wait to commit it after a timeout.
    const finishedWork: Fiber = (root.current.alternate: any);
    root.finishedWork = finishedWork;
    root.finishedLanes = lanes;
    finishConcurrentRender(root, exitStatus, lanes);
  }

  ensureRootIsScheduled(root, now());
  if (root.callbackNode === originalCallbackNode) {
    // The task node scheduled for this root is the same one that's
    // currently executed. Need to return a continuation.
    return performConcurrentWorkOnRoot.bind(null, root);
  }
  return null;
}

function finishConcurrentRender(root, exitStatus, lanes) {
  switch (exitStatus) {
    case RootIncomplete:
    case RootFatalErrored: {
      invariant(false, 'Root did not complete. This is a bug in React.');
    }
    // Flow knows about invariant, so it complains if I add a break
    // statement, but eslint doesn't know about invariant, so it complains
    // if I do. eslint-disable-next-line no-fallthrough
    case RootErrored: {
      // We should have already attempted to retry this tree. If we reached
      // this point, it errored again. Commit it.
      commitRoot(root);
      break;
    }
    case RootSuspended: {
      markRootSuspended(root, lanes);

      // We have an acceptable loading state. We need to figure out if we
      // should immediately commit it or wait a bit.

      if (
        includesOnlyRetries(lanes) &&
        // do not delay if we're inside an act() scope
        !shouldForceFlushFallbacksInDEV()
      ) {
        // This render only included retries, no updates. Throttle committing
        // retries so that we don't show too many loading states too quickly.
        const msUntilTimeout =
          globalMostRecentFallbackTime + FALLBACK_THROTTLE_MS - now();
        // Don't bother with a very short suspense time.
        if (msUntilTimeout > 10) {
          const nextLanes = getNextLanes(root, NoLanes);
          if (nextLanes !== NoLanes) {
            // There's additional work on this root.
            break;
          }
          const suspendedLanes = root.suspendedLanes;
          if (!isSubsetOfLanes(suspendedLanes, lanes)) {
            // We should prefer to render the fallback of at the last
            // suspended level. Ping the last suspended level to try
            // rendering it again.
            // FIXME: What if the suspended lanes are Idle? Should not restart.
            const eventTime = requestEventTime();
            markRootPinged(root, suspendedLanes, eventTime);
            break;
          }

          // The render is suspended, it hasn't timed out, and there's no
          // lower priority work to do. Instead of committing the fallback
          // immediately, wait for more data to arrive.
          root.timeoutHandle = scheduleTimeout(
            commitRoot.bind(null, root),
            msUntilTimeout,
          );
          break;
        }
      }
      // The work expired. Commit immediately.
      commitRoot(root);
      break;
    }
    case RootSuspendedWithDelay: {
      markRootSuspended(root, lanes);

      if (includesOnlyTransitions(lanes)) {
        // This is a transition, so we should exit without committing a
        // placeholder and without scheduling a timeout. Delay indefinitely
        // until we receive more data.
        break;
      }

      if (!shouldForceFlushFallbacksInDEV()) {
        // This is not a transition, but we did trigger an avoided state.
        // Schedule a placeholder to display after a short delay, using the Just
        // Noticeable Difference.
        // TODO: Is the JND optimization worth the added complexity? If this is
        // the only reason we track the event time, then probably not.
        // Consider removing.

        const mostRecentEventTime = getMostRecentEventTime(root, lanes);
        const eventTimeMs = mostRecentEventTime;
        const timeElapsedMs = now() - eventTimeMs;
        const msUntilTimeout = jnd(timeElapsedMs) - timeElapsedMs;

        // Don't bother with a very short suspense time.
        if (msUntilTimeout > 10) {
          // Instead of committing the fallback immediately, wait for more data
          // to arrive.
          root.timeoutHandle = scheduleTimeout(
            commitRoot.bind(null, root),
            msUntilTimeout,
          );
          break;
        }
      }

      // Commit the placeholder.
      commitRoot(root);
      break;
    }
    case RootCompleted: {
      // The work completed. Ready to commit.
      commitRoot(root);
      break;
    }
    default: {
      invariant(false, 'Unknown root exit status.');
    }
  }
}

function markRootSuspended(root, suspendedLanes) {
  // When suspending, we should always exclude lanes that were pinged or (more
  // rarely, since we try to avoid it) updated during the render phase.
  // TODO: Lol maybe there's a better way to factor this besides this
  // obnoxiously named function :)
  suspendedLanes = removeLanes(suspendedLanes, workInProgressRootPingedLanes);
  suspendedLanes = removeLanes(suspendedLanes, workInProgressRootUpdatedLanes);
  markRootSuspended_dontCallThisOneDirectly(root, suspendedLanes);
}

/**
 * 处理React元素树的渲染和提交过程，确保在同步模式下完成所有必要的工作
 * 
 * 一般用作调度器的调度回调单元
 * 
 * 0. flushPassiveEffects调度处理副作用
 * 1. 执行 renderRootSync
 *    - 执行前：先getNextLanes获取本次高优lanes，然后传入执行renderRootSync
 *    - 进入 renderer协调器阶段 构建 fiber树
 * 2. 执行 commitRoot ，进入commit渲染器阶段，将fiber树渲染到页面上
 * 3. 最后：继续调度下一轮 ensureRootIsScheduled
 * @param {*} root fiberRoot
 */
function performSyncWorkOnRoot(root) {
  // 检查警告：确保在调用 performSyncWorkOnRoot 时，当前上下文中没有正在进行的渲染或提交操作
  invariant(
    (executionContext & (RenderContext | CommitContext)) === NoContext,
    'Should not already be working.',
  );

  // 处理被动副作用：生命周期，钩子相关
  flushPassiveEffects();

  // 确定本次渲染的lanes 优先级通道
  let lanes;
  let exitStatus;
  if (
    // 初次挂载渲染时，wipRoot为null，条件不可能成立
    root === workInProgressRoot &&
    includesSomeLane(root.expiredLanes, workInProgressRootRenderLanes)
  ) {
    // 如果 root 是（workInProgressRoot），并且其中某些通道已过期（expiredLanes），则使用这些通道进行渲染
    lanes = workInProgressRootRenderLanes;
    // 调用 renderRootSync 函数以同步方式渲染根节点
    exitStatus = renderRootSync(root, lanes);
    if (
      // 如果在render过程中产生了新的update, 且新update的优先级与最初render的优先级有交集
      // 那么最初render无效, 丢弃最初render的结果, 重新执行renderRootSync
      includesSomeLane(
        workInProgressRootIncludedLanes,
        workInProgressRootUpdatedLanes,
      )
    ) {
      lanes = getNextLanes(root, lanes);
      exitStatus = renderRootSync(root, lanes);
    }
  } else {
    // 否则，获取新本次渲染的优先级通道并进行同步渲染。
    lanes = getNextLanes(root, NoLanes);
    exitStatus = renderRootSync(root, lanes);
  }

  // 错误处理
  if (root.tag !== LegacyRoot && exitStatus === RootErrored) {
    executionContext |= RetryAfterError;

    // If an error occurred during hydration,
    // discard server response and fall back to client side render.
    if (root.hydrate) {
      root.hydrate = false;
      clearContainer(root.containerInfo);
    }

    // If something threw an error, try rendering one more time. We'll render
    // synchronously to block concurrent data mutations, and we'll includes
    // all pending updates are included. If it still fails after the second
    // attempt, we'll give up and commit the resulting tree.
    lanes = getLanesToRetrySynchronouslyOnError(root);
    if (lanes !== NoLanes) {
      exitStatus = renderRootSync(root, lanes);
    }
  }

  // 致命错误处理
  if (exitStatus === RootFatalErrored) {
    const fatalError = workInProgressRootFatalError;
    // 刷新栈帧
    prepareFreshStack(root, NoLanes);
    markRootSuspended(root, lanes);
    // 等待下次调度
    ensureRootIsScheduled(root, now());
    throw fatalError;
  }

  // render结果更新到fiberRoot的finishedWork相关属性，提交渲染结果commitRoot
  // finishedWork就是取的双缓存B版的HostRootFiber构造好的根节点起的fiber树
  const finishedWork: Fiber = (root.current.alternate: any);
  root.finishedWork = finishedWork;
  root.finishedLanes = lanes;
  commitRoot(root);

  // 调度下一个任务
  ensureRootIsScheduled(root, now());

  return null;
}

export function flushRoot(root: FiberRoot, lanes: Lanes) {
  markRootExpired(root, lanes);
  ensureRootIsScheduled(root, now());
  if ((executionContext & (RenderContext | CommitContext)) === NoContext) {
    resetRenderTimer();
    flushSyncCallbackQueue();
  }
}

export function getExecutionContext(): ExecutionContext {
  return executionContext;
}

export function flushDiscreteUpdates() {
  // TODO: Should be able to flush inside batchedUpdates, but not inside `act`.
  // However, `act` uses `batchedUpdates`, so there's no way to distinguish
  // those two cases. Need to fix this before exposing flushDiscreteUpdates
  // as a public API.
  if (
    (executionContext & (BatchedContext | RenderContext | CommitContext)) !==
    NoContext
  ) {
    if (__DEV__) {
      if ((executionContext & RenderContext) !== NoContext) {
        console.error(
          'unstable_flushDiscreteUpdates: Cannot flush updates when React is ' +
            'already rendering.',
        );
      }
    }
    // We're already rendering, so we can't synchronously flush pending work.
    // This is probably a nested event dispatch triggered by a lifecycle/effect,
    // like `el.focus()`. Exit.
    return;
  }
  flushPendingDiscreteUpdates();
  // If the discrete updates scheduled passive effects, flush them now so that
  // they fire before the next serial event.
  flushPassiveEffects();
}

export function deferredUpdates<A>(fn: () => A): A {
  if (decoupleUpdatePriorityFromScheduler) {
    const previousLanePriority = getCurrentUpdateLanePriority();
    try {
      setCurrentUpdateLanePriority(DefaultLanePriority);
      return runWithPriority(NormalSchedulerPriority, fn);
    } finally {
      setCurrentUpdateLanePriority(previousLanePriority);
    }
  } else {
    return runWithPriority(NormalSchedulerPriority, fn);
  }
}

function flushPendingDiscreteUpdates() {
  if (rootsWithPendingDiscreteUpdates !== null) {
    // For each root with pending discrete updates, schedule a callback to
    // immediately flush them.
    const roots = rootsWithPendingDiscreteUpdates;
    rootsWithPendingDiscreteUpdates = null;
    roots.forEach(root => {
      markDiscreteUpdatesExpired(root);
      ensureRootIsScheduled(root, now());
    });
  }
  // Now flush the immediate queue.
  flushSyncCallbackQueue();
}

export function batchedUpdates<A, R>(fn: A => R, a: A): R {
  const prevExecutionContext = executionContext;
  executionContext |= BatchedContext;
  try {
    return fn(a);
  } finally {
    executionContext = prevExecutionContext;
    if (executionContext === NoContext) {
      // Flush the immediate callbacks that were scheduled during this batch
      resetRenderTimer();
      flushSyncCallbackQueue();
    }
  }
}

export function batchedEventUpdates<A, R>(fn: A => R, a: A): R {
  const prevExecutionContext = executionContext;
  executionContext |= EventContext;
  try {
    return fn(a);
  } finally {
    executionContext = prevExecutionContext;
    if (executionContext === NoContext) {
      // Flush the immediate callbacks that were scheduled during this batch
      resetRenderTimer();
      flushSyncCallbackQueue();
    }
  }
}

export function discreteUpdates<A, B, C, D, R>(
  fn: (A, B, C) => R,
  a: A,
  b: B,
  c: C,
  d: D,
): R {
  const prevExecutionContext = executionContext;
  executionContext |= DiscreteEventContext;

  if (decoupleUpdatePriorityFromScheduler) {
    const previousLanePriority = getCurrentUpdateLanePriority();
    try {
      setCurrentUpdateLanePriority(InputDiscreteLanePriority);
      return runWithPriority(
        UserBlockingSchedulerPriority,
        fn.bind(null, a, b, c, d),
      );
    } finally {
      setCurrentUpdateLanePriority(previousLanePriority);
      executionContext = prevExecutionContext;
      if (executionContext === NoContext) {
        // Flush the immediate callbacks that were scheduled during this batch
        resetRenderTimer();
        flushSyncCallbackQueue();
      }
    }
  } else {
    try {
      return runWithPriority(
        UserBlockingSchedulerPriority,
        fn.bind(null, a, b, c, d),
      );
    } finally {
      executionContext = prevExecutionContext;
      if (executionContext === NoContext) {
        // Flush the immediate callbacks that were scheduled during this batch
        resetRenderTimer();
        flushSyncCallbackQueue();
      }
    }
  }
}

/** 非批量更新，即立即执行更新而不是将其批量处理 */
export function unbatchedUpdates<A, R>(fn: (a: A) => R, a: A): R {
  const prevExecutionContext = executionContext;
  // 修改执行上下文，清除批量更新标志并设置非批量更新标志
  executionContext &= ~BatchedContext;
  executionContext |= LegacyUnbatchedContext;
  try {
    return fn(a);
  } finally {
    // 恢复之前的执行上下文
    executionContext = prevExecutionContext;
    // 如果当前执行上下文为空（即没有其他批量更新正在进行）
    if (executionContext === NoContext) {
      // Flush the immediate callbacks that were scheduled during this batch
      // 重置渲染计时器
      resetRenderTimer();
      // 刷新同步回调队列，确保所有即时回调都被执行
      flushSyncCallbackQueue();
    }
  }
}

export function flushSync<A, R>(fn: A => R, a: A): R {
  const prevExecutionContext = executionContext;
  if ((prevExecutionContext & (RenderContext | CommitContext)) !== NoContext) {
    if (__DEV__) {
      console.error(
        'flushSync was called from inside a lifecycle method. React cannot ' +
          'flush when React is already rendering. Consider moving this call to ' +
          'a scheduler task or micro task.',
      );
    }
    return fn(a);
  }
  executionContext |= BatchedContext;

  if (decoupleUpdatePriorityFromScheduler) {
    const previousLanePriority = getCurrentUpdateLanePriority();
    try {
      setCurrentUpdateLanePriority(SyncLanePriority);
      if (fn) {
        return runWithPriority(ImmediateSchedulerPriority, fn.bind(null, a));
      } else {
        return (undefined: $FlowFixMe);
      }
    } finally {
      setCurrentUpdateLanePriority(previousLanePriority);
      executionContext = prevExecutionContext;
      // Flush the immediate callbacks that were scheduled during this batch.
      // Note that this will happen even if batchedUpdates is higher up
      // the stack.
      flushSyncCallbackQueue();
    }
  } else {
    try {
      if (fn) {
        return runWithPriority(ImmediateSchedulerPriority, fn.bind(null, a));
      } else {
        return (undefined: $FlowFixMe);
      }
    } finally {
      executionContext = prevExecutionContext;
      // Flush the immediate callbacks that were scheduled during this batch.
      // Note that this will happen even if batchedUpdates is higher up
      // the stack.
      flushSyncCallbackQueue();
    }
  }
}

export function flushControlled(fn: () => mixed): void {
  const prevExecutionContext = executionContext;
  executionContext |= BatchedContext;
  if (decoupleUpdatePriorityFromScheduler) {
    const previousLanePriority = getCurrentUpdateLanePriority();
    try {
      setCurrentUpdateLanePriority(SyncLanePriority);
      runWithPriority(ImmediateSchedulerPriority, fn);
    } finally {
      setCurrentUpdateLanePriority(previousLanePriority);

      executionContext = prevExecutionContext;
      if (executionContext === NoContext) {
        // Flush the immediate callbacks that were scheduled during this batch
        resetRenderTimer();
        flushSyncCallbackQueue();
      }
    }
  } else {
    try {
      runWithPriority(ImmediateSchedulerPriority, fn);
    } finally {
      executionContext = prevExecutionContext;
      if (executionContext === NoContext) {
        // Flush the immediate callbacks that were scheduled during this batch
        resetRenderTimer();
        flushSyncCallbackQueue();
      }
    }
  }
}

export function pushRenderLanes(fiber: Fiber, lanes: Lanes) {
  pushToStack(subtreeRenderLanesCursor, subtreeRenderLanes, fiber);
  subtreeRenderLanes = mergeLanes(subtreeRenderLanes, lanes);
  workInProgressRootIncludedLanes = mergeLanes(
    workInProgressRootIncludedLanes,
    lanes,
  );
}

export function popRenderLanes(fiber: Fiber) {
  subtreeRenderLanes = subtreeRenderLanesCursor.current;
  popFromStack(subtreeRenderLanesCursor, fiber);
}

/**
 * 刷新栈帧----> 主要就是重置初始化全局变量workInProgress为fiberRoot.current即rootFiber副本及其相关变量
 * 
 * 
 * 更新前还没有缓存树，workInProgress默认是null，这个主要是新一轮初始化workInProgress的child，flags 和effects 这3个核心属性
 * 
 * 1. 初始化根节点fiberRoot的状态，取消之前的超时处理，清理中断的工作
 * 2. 初始化相关 workInProgress 和 workInProgressRootXXXX 全局状态变量即新的工作栈
 *      - 初始化新建workInProgress值
 *      - 设置rootFiber的alternate属性  ---> rootFiber开始的双缓存工作
 *      - 初始化child，flags 和effects 这3个核心属性
 */
function prepareFreshStack(root: FiberRoot, lanes: Lanes) {
  // 初始化根节点标记：完成的工作为null和完成的通道为null
  root.finishedWork = null;
  root.finishedLanes = NoLanes;

  // 取消超时处理
  const timeoutHandle = root.timeoutHandle;
  if (timeoutHandle !== noTimeout) {
    // The root previous suspended and scheduled a timeout to commit a fallback
    // state. Now that we have additional work, cancel the timeout.
    root.timeoutHandle = noTimeout;
    // $FlowFixMe Complains noTimeout is not a TimeoutID, despite the check above
    cancelTimeout(timeoutHandle);
  }

  // 处理中断的工作
  if (workInProgress !== null) {
    // 如果当前有正在进行的工作（workInProgress 不为 null），则遍历中断的工作链表，
    // 调用 unwindInterruptedWork 函数来清理中断的工作
    let interruptedWork = workInProgress.return;
    while (interruptedWork !== null) {
      unwindInterruptedWork(interruptedWork);
      interruptedWork = interruptedWork.return;
    }
  }
  // 设置新的工作栈======全局变量
  workInProgressRoot = root;// workInProgressRoot 设置为当前的根节点
  workInProgress = createWorkInProgress(root.current, null);// workInProgress 表示初始化新建workInProgress
  workInProgressRootRenderLanes = subtreeRenderLanes = workInProgressRootIncludedLanes = lanes; // 各种车道（lanes）相关的信息被初始化
  workInProgressRootExitStatus = RootIncomplete;// workInProgressRootExitStatus 设置为 RootIncomplete，表示根节点的工作尚未完成。
  workInProgressRootFatalError = null;
  workInProgressRootSkippedLanes = NoLanes;
  workInProgressRootUpdatedLanes = NoLanes;
  workInProgressRootPingedLanes = NoLanes;

  if (enableSchedulerTracing) {
    spawnedWorkDuringRender = null;
  }

  if (__DEV__) {
    ReactStrictModeWarnings.discardPendingWarnings();
  }
}

function handleError(root, thrownValue): void {
  do {
    let erroredWork = workInProgress;
    try {
      // Reset module-level state that was set during the render phase.
      resetContextDependencies();
      resetHooksAfterThrow();
      resetCurrentDebugFiberInDEV();
      // TODO: I found and added this missing line while investigating a
      // separate issue. Write a regression test using string refs.
      ReactCurrentOwner.current = null;

      if (erroredWork === null || erroredWork.return === null) {
        // Expected to be working on a non-root fiber. This is a fatal error
        // because there's no ancestor that can handle it; the root is
        // supposed to capture all errors that weren't caught by an error
        // boundary.
        workInProgressRootExitStatus = RootFatalErrored;
        workInProgressRootFatalError = thrownValue;
        // Set `workInProgress` to null. This represents advancing to the next
        // sibling, or the parent if there are no siblings. But since the root
        // has no siblings nor a parent, we set it to null. Usually this is
        // handled by `completeUnitOfWork` or `unwindWork`, but since we're
        // intentionally not calling those, we need set it here.
        // TODO: Consider calling `unwindWork` to pop the contexts.
        workInProgress = null;
        return;
      }

      if (enableProfilerTimer && erroredWork.mode & ProfileMode) {
        // Record the time spent rendering before an error was thrown. This
        // avoids inaccurate Profiler durations in the case of a
        // suspended render.
        stopProfilerTimerIfRunningAndRecordDelta(erroredWork, true);
      }

      throwException(
        root,
        erroredWork.return,
        erroredWork,
        thrownValue,
        workInProgressRootRenderLanes,
      );
      completeUnitOfWork(erroredWork);
    } catch (yetAnotherThrownValue) {
      // Something in the return path also threw.
      thrownValue = yetAnotherThrownValue;
      if (workInProgress === erroredWork && erroredWork !== null) {
        // If this boundary has already errored, then we had trouble processing
        // the error. Bubble it to the next boundary.
        erroredWork = erroredWork.return;
        workInProgress = erroredWork;
      } else {
        erroredWork = workInProgress;
      }
      continue;
    }
    // Return to the normal work loop.
    return;
  } while (true);
}

/**
 * ### 重置 ReactCurrentDispatcher 全局变量值为ContextOnlyDispatcher：该变量用作Hooks渲染时区分挂载更新阶段用的统一分发器Dispatcher
 * 
 * 每一个dispathcher对象管理所有类型的hook钩子，如{useState，useReducer，...}
 * ContextOnlyDispatcher这个dispathcer主要处理异常用
 * 
 * 在FunctionComponent render前，会根据FunctionComponent对应fiber的以下条件区分mount与update。
    current === null || current.memoizedState === null
  并将不同情况对应的dispatcher赋值给全局变量ReactCurrentDispatcher的current属性。
  @returns 重置后，返回之前的分发器
 */
function pushDispatcher() {
  const prevDispatcher = ReactCurrentDispatcher.current;
  ReactCurrentDispatcher.current = ContextOnlyDispatcher;
  if (prevDispatcher === null) {
    // The React isomorphic package does not include a default dispatcher.
    // Instead the first renderer will lazily attach one, in order to give
    // nicer error messages.
    return ContextOnlyDispatcher;
  } else {
    return prevDispatcher;
  }
}

function popDispatcher(prevDispatcher) {
  ReactCurrentDispatcher.current = prevDispatcher;
}

function pushInteractions(root) {
  if (enableSchedulerTracing) {
    const prevInteractions: Set<Interaction> | null = __interactionsRef.current;
    __interactionsRef.current = root.memoizedInteractions;
    return prevInteractions;
  }
  return null;
}

function popInteractions(prevInteractions) {
  if (enableSchedulerTracing) {
    __interactionsRef.current = prevInteractions;
  }
}

export function markCommitTimeOfFallback() {
  globalMostRecentFallbackTime = now();
}

export function markSkippedUpdateLanes(lane: Lane | Lanes): void {
  workInProgressRootSkippedLanes = mergeLanes(
    lane,
    workInProgressRootSkippedLanes,
  );
}

export function renderDidSuspend(): void {
  if (workInProgressRootExitStatus === RootIncomplete) {
    workInProgressRootExitStatus = RootSuspended;
  }
}

export function renderDidSuspendDelayIfPossible(): void {
  if (
    workInProgressRootExitStatus === RootIncomplete ||
    workInProgressRootExitStatus === RootSuspended
  ) {
    workInProgressRootExitStatus = RootSuspendedWithDelay;
  }

  // Check if there are updates that we skipped tree that might have unblocked
  // this render.
  if (
    workInProgressRoot !== null &&
    (includesNonIdleWork(workInProgressRootSkippedLanes) ||
      includesNonIdleWork(workInProgressRootUpdatedLanes))
  ) {
    // Mark the current render as suspended so that we switch to working on
    // the updates that were skipped. Usually we only suspend at the end of
    // the render phase.
    // TODO: We should probably always mark the root as suspended immediately
    // (inside this function), since by suspending at the end of the render
    // phase introduces a potential mistake where we suspend lanes that were
    // pinged or updated while we were rendering.
    markRootSuspended(workInProgressRoot, workInProgressRootRenderLanes);
  }
}

export function renderDidError() {
  if (workInProgressRootExitStatus !== RootCompleted) {
    workInProgressRootExitStatus = RootErrored;
  }
}

// Called during render to determine if anything has suspended.
// Returns false if we're not sure.
export function renderHasNotSuspendedYet(): boolean {
  // If something errored or completed, we can't really be sure,
  // so those are false.
  return workInProgressRootExitStatus === RootIncomplete;
}

/**
 * ## 工作循环的入口：主要执行workLoopSync 构建fiber树和dom树和effectList链表
 * 1. 处理执行上下文
 * 2. 重置Hook Dispatcher
 * 3. 刷新栈帧：prepareFreshStack(root, lanes);
 * 4. 开始执行workLoopSync
 * 
 * @param {*} FiberRoot 当前根节点的 FiberRoot 树
 * @param {*} lanes 需要处理的高优通道
 * @return 渲染完成后的退出状态（RootExitStatus）
 */
function renderRootSync(root: FiberRoot, lanes: Lanes) {
  // 1、保存当前执行上下文
  const prevExecutionContext = executionContext;
  executionContext |= RenderContext; // 当前上下文设置为渲染上下文
  // 2、重置当前hook分发器，返回之前的分发器
  const prevDispatcher = pushDispatcher(); // 推入当前调度器，

  // 3、检查是否需要准备新的栈
  // 如果fiberRoot变动, 或者update.lane变动, 都会刷新栈帧, 丢弃上一次渲染进度
  if (workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes) {
    // 刷新栈帧
    prepareFreshStack(root, lanes);
    // 调度追踪功能：开始处理待处理的交互
    startWorkOnPendingInteractions(root, lanes);
  }

  // 调度追踪功能：推入交互上下文
  const prevInteractions = pushInteractions(root);

  if (__DEV__) {
    if (enableDebugTracing) {
      logRenderStarted(lanes);
    }
  }

  // 调度性能分析功能相关
  if (enableSchedulingProfiler) {
    markRenderStarted(lanes);
  }

  // 4、开启同步的工作循环 - workLoopSync
  do {
    try {
      workLoopSync(); // 从上到下；完成Fiber树的构建
      break;
    } catch (thrownValue) {
      handleError(root, thrownValue);
    }
  } while (true);
  // 重置上下文依赖
  resetContextDependencies();
  if (enableSchedulerTracing) {
    popInteractions(((prevInteractions: any): Set<Interaction>));
  }
  // 恢复之前的执行上下文
  executionContext = prevExecutionContext;
  // 恢复hook分发器
  popDispatcher(prevDispatcher);

  // 检查渲染是否完成
  if (workInProgress !== null) {
    // This is a sync render, so we should have finished the whole tree.
    invariant(
      false,
      'Cannot commit an incomplete root. This error is likely caused by a ' +
        'bug in React. Please file an issue.',
    );
  }

  if (__DEV__) {
    if (enableDebugTracing) {
      logRenderStopped();
    }
  }

  if (enableSchedulingProfiler) {
    markRenderStopped();
  }

  // 清理WIP相关全局变量标记
  workInProgressRoot = null; // 设置当前工作根节点为 null，表示没有正在进行的渲染
  workInProgressRootRenderLanes = NoLanes; // 设置当前工作优先级通道为 NoLanes

  // 返回退出状态
  return workInProgressRootExitStatus;
}

/**
 * 上级方法：renderRootSync
 * 从workInProgress起从上到下循环执行 performUnitOfWork
 * 
 * @param workInProgress 全局变量 wip的rootFiber 缓存根节点，不管mount还是update都是从根节点开始向下遍历
 */
function workLoopSync() {
  // 判断workInProgress值，从rootFiber内存fiber节点开始，不断赋值workInProgress变量， 一直向下深度优先遍历
  while (workInProgress !== null) {
    performUnitOfWork(workInProgress);
  }
}

/**
 * 主要执行workLoopConcurrent，开启构建最新fiber树
 */
function renderRootConcurrent(root: FiberRoot, lanes: Lanes) {
  const prevExecutionContext = executionContext;
  executionContext |= RenderContext;
  const prevDispatcher = pushDispatcher();

  // If the root or lanes have changed, throw out the existing stack
  // and prepare a fresh one. Otherwise we'll continue where we left off.
  if (workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes) {
    resetRenderTimer();
    prepareFreshStack(root, lanes);
    startWorkOnPendingInteractions(root, lanes);
  }

  const prevInteractions = pushInteractions(root);

  if (__DEV__) {
    if (enableDebugTracing) {
      logRenderStarted(lanes);
    }
  }

  if (enableSchedulingProfiler) {
    markRenderStarted(lanes);
  }

  do {
    try {
      workLoopConcurrent();
      break;
    } catch (thrownValue) {
      handleError(root, thrownValue);
    }
  } while (true);
  resetContextDependencies();
  if (enableSchedulerTracing) {
    popInteractions(((prevInteractions: any): Set<Interaction>));
  }

  popDispatcher(prevDispatcher);
  executionContext = prevExecutionContext;

  if (__DEV__) {
    if (enableDebugTracing) {
      logRenderStopped();
    }
  }

  // Check if the tree has completed.
  if (workInProgress !== null) {
    // Still work remaining.
    if (enableSchedulingProfiler) {
      markRenderYielded();
    }
    return RootIncomplete;
  } else {
    // Completed the tree.
    if (enableSchedulingProfiler) {
      markRenderStopped();
    }

    // Set this to null to indicate there's no in-progress render.
    workInProgressRoot = null;
    workInProgressRootRenderLanes = NoLanes;

    // Return the final exit status.
    return workInProgressRootExitStatus;
  }
}

/** @noinline */
/**
 * 异步可中断循环执行 performUnitOfWork 方法
 */
function workLoopConcurrent() {
  // Perform work until Scheduler asks us to yield
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }
}

/**
 * 渲染器工作循环 workLoopSync 方法的循环执行的工作单元
 * 
 * 不管mount还是update都是，自顶向下循环处理每个 Fiber 节点的渲染任务
 * 1. beginWork，结果值赋给next变量
 * 2. 判断next为null(即递到叶子节点时)时开始向上归completeWork。非null改变workInProgress为next触发上层while循环
 * 
 * @param {*} unitOfWork WIP的内存fiber节点 首次循环时不管mount还是update阶段，首次workInProgress 值都为顶部根节点rootFiber开始的
 */
function performUnitOfWork(unitOfWork: Fiber): void {
  /** 获取当前unitOfWork对应的上次渲染的真实fiber节点 */
  const current = unitOfWork.alternate;
  // ---调试阶段用
  setCurrentDebugFiberInDEV(unitOfWork);

  // 执行工作单元 beginWork
  /** 缓存beginWork结果：unitOfWork.child fiber树 */
  let next;
  // 性能分析模式逻辑
  if (enableProfilerTimer && (unitOfWork.mode & ProfileMode) !== NoMode) {
    startProfilerTimer(unitOfWork);
    next = beginWork(current, unitOfWork, subtreeRenderLanes);
    stopProfilerTimerIfRunningAndRecordDelta(unitOfWork, true);
  } else {
    // 直接进入beginWork， 得到构造好的unitOfWork.child （fiber树）
    next = beginWork(current, unitOfWork, subtreeRenderLanes);
  }

  // ---调试相关
  resetCurrentDebugFiberInDEV();
  // 更新unitOfWork的memoizedProps属性
  unitOfWork.memoizedProps = unitOfWork.pendingProps;
  // 当递到最后一个叶子fiber节点时，再向上执行completeUnitOfWork归方法
  // 归方法中如果发现父节点有sibling节点，直接return内部赋值workInProgress 触发工作循环
  if (next === null) {
    // If this doesn't spawn new work, complete the current work.
    completeUnitOfWork(unitOfWork);
  } else {
    // 指针指向下一个，触发下次工作循环工作单元执行
    workInProgress = next;
  }

  ReactCurrentOwner.current = null;
}

/**
 * performUnitOfWork 递归的归方法 (核心就一个do-while循环)
 * 1. 调用completeWork ---> fiber树驱动构建dom树
 *    - 主要给fiber节点(tag=HostComponent, HostText)创建 DOM 实例, 设置fiber.stateNode局部状态(如tag=HostComponent, HostText节点: fiber.stateNode 指向这个 DOM 实例).
 *        - 如果是更新，只处理更新pendingprops值到updateQueue
          - 为 DOM 节点设置属性, 绑定事件(这里先说明有这个步骤, 详细的事件处理流程, 在合成事件原理中详细说明).
      - 设置fiber.flags标记
 * 2. 把当前 fiber 对象的副作用队列(firstEffect和lastEffect)添加到父节点的副作用队列之后, 更新父节点的firstEffect和lastEffect指针
      - beginWork中只有在删除操作时，才会更新firstEffect，其他情况默认是没有firstEffect链表的，只会增加flags标记如Deletion等
 * 3. 识别beginWork阶段设置的fiber.flags, 判断当前 fiber 是否有副作用(增,删,改), 如果有, 需要将当前 fiber 加入到父节点的effects队列, 等待commit阶段处理
 * 
 * @param {*} unitOfWork 当前要完成的fiber节点
 * @return 只维护更新beginWork得到的fiber树属性，不做返回值处理
 */
function completeUnitOfWork(unitOfWork: Fiber): void {
  // completedWork 被设置为 unitOfWork，表示当前正在处理的工作单元
  let completedWork = unitOfWork;
  do {
    // alternate，代表之前即页面上的 fiber 树状态。
    const current = completedWork.alternate;
    // 父级 fiber，用来在处理完当前 fiber 后返回到父级继续处理
    const returnFiber = completedWork.return;

    // 1、工作work为完成状态时
    if ((completedWork.flags & Incomplete) === NoFlags) {
      // 如果 completedWork.flags 中有 Incomplete 标记，则表示该 fiber 还未完成它的任务
      // 如果启用了调试模式，设置当前调试 fiber。
      setCurrentDebugFiberInDEV(completedWork);
      let next;
      // 是否启用性能分析器来决定是否记录性能数据
      if (
        !enableProfilerTimer ||
        (completedWork.mode & ProfileMode) === NoMode
      ) {
        // 1-1. 处理Fiber节点, 会调用渲染器(调用react-dom包, 关联Fiber节点和dom对象, 绑定事件，更新updateQueue等)
        next = completeWork(current, completedWork, subtreeRenderLanes);
      } else {
        startProfilerTimer(completedWork);
        next = completeWork(current, completedWork, subtreeRenderLanes);
        // Update render duration assuming we didn't error.
        stopProfilerTimerIfRunningAndRecordDelta(completedWork, false);
      }
      // 重置调试信息。
      resetCurrentDebugFiberInDEV();

      // 如果派生出其他的子节点, 则回到`beginWork`阶段进行处理。
      if (next !== null) {
        // Completing this fiber spawned new work. Work on that next.
        workInProgress = next;
        return;
      }
      // 重置子节点的优先级
      resetChildLanes(completedWork);

      // 2. 收集当前Fiber节点以及其子树的副作用effects
      // 2.1 把子节点的副作用队列添加到父节点上
      // 将当前 fiber 和其子树的副作用添加到父 fiber 的副作用列表中，确保父 fiber 知道所有子 fiber 的变化。
      if (
        returnFiber !== null &&
        // 如果不包含未完成
        (returnFiber.flags & Incomplete) === NoFlags
      ) {
        if (returnFiber.firstEffect === null) {
          returnFiber.firstEffect = completedWork.firstEffect;
        }
        if (completedWork.lastEffect !== null) {
          if (returnFiber.lastEffect !== null) {
            returnFiber.lastEffect.nextEffect = completedWork.firstEffect;
          }
          returnFiber.lastEffect = completedWork.lastEffect;
        }

        const flags = completedWork.flags;

        // 识别beginWork阶段设置的fiber.flags, 判断当前 fiber 是否有副作用(增,删,改), 如果有, 需要将当前 fiber 加入到父节点的effects队列, 等待commit阶段处理
        // 2.2 如果当前fiber节点有副作用, 将其添加到子节点的副作用队列之后.
        if (flags > PerformedWork) {
          if (returnFiber.lastEffect !== null) {
            returnFiber.lastEffect.nextEffect = completedWork;
          } else {
            returnFiber.firstEffect = completedWork;
          }
          returnFiber.lastEffect = completedWork;
        }
      }
    }
    // 如果包含未完成则未完成状态
    // 2、// 异常处理, 本节不讨论如果当前 fiber 没有成功完成（例如发生了错误），则会执行特定的清理和错误处理逻辑
    else {
      const next = unwindWork(completedWork, subtreeRenderLanes);

      // Because this fiber did not complete, don't reset its expiration time.

      if (next !== null) {
        // If completing this work spawned new work, do that next. We'll come
        // back here again.
        // Since we're restarting, remove anything that is not a host effect
        // from the effect tag.
        next.flags &= HostEffectMask;
        workInProgress = next;
        return;
      }

      // 性能模式下逻辑
      if (
        enableProfilerTimer &&
        (completedWork.mode & ProfileMode) !== NoMode
      ) {
        // Record the render duration for the fiber that errored.
        stopProfilerTimerIfRunningAndRecordDelta(completedWork, false);

        // Include the time spent working on failed children before continuing.
        let actualDuration = completedWork.actualDuration;
        let child = completedWork.child;
        while (child !== null) {
          actualDuration += child.actualDuration;
          child = child.sibling;
        }
        completedWork.actualDuration = actualDuration;
      }

      if (returnFiber !== null) {
        // Mark the parent fiber as incomplete and clear its effect list.
        returnFiber.firstEffect = returnFiber.lastEffect = null;
        returnFiber.flags |= Incomplete;
      }
    }
    
    // 3、最后，判断指针，继续workInProgress工作循环
    // 如果存在兄弟节点，则移动到兄弟节点继续处理--执行工作循环beginWork开始。
    // 如果没有兄弟节点，则返回到父节点，继续处理父节点的其他孩子或者父节点本身。
    const siblingFiber = completedWork.sibling;
    if (siblingFiber !== null) {
      // 如果有兄弟节点, 返回之后再次进入`beginWork`阶段
      workInProgress = siblingFiber;
      return;
    }
    completedWork = returnFiber;
    workInProgress = completedWork;
  } while (completedWork !== null);

  // We've reached the root.
  // 如果根节点的状态是 RootIncomplete，那么将其改为 RootCompleted，表明整个更新过程已经完成
  if (workInProgressRootExitStatus === RootIncomplete) {
    workInProgressRootExitStatus = RootCompleted;
  }
}

function resetChildLanes(completedWork: Fiber) {
  if (
    // TODO: Move this check out of the hot path by moving `resetChildLanes`
    // to switch statement in `completeWork`.
    (completedWork.tag === LegacyHiddenComponent ||
      completedWork.tag === OffscreenComponent) &&
    completedWork.memoizedState !== null &&
    !includesSomeLane(subtreeRenderLanes, (OffscreenLane: Lane)) &&
    (completedWork.mode & ConcurrentMode) !== NoLanes
  ) {
    // The children of this component are hidden. Don't bubble their
    // expiration times.
    return;
  }

  let newChildLanes = NoLanes;

  // Bubble up the earliest expiration time.
  if (enableProfilerTimer && (completedWork.mode & ProfileMode) !== NoMode) {
    // In profiling mode, resetChildExpirationTime is also used to reset
    // profiler durations.
    let actualDuration = completedWork.actualDuration;
    let treeBaseDuration = ((completedWork.selfBaseDuration: any): number);

    // When a fiber is cloned, its actualDuration is reset to 0. This value will
    // only be updated if work is done on the fiber (i.e. it doesn't bailout).
    // When work is done, it should bubble to the parent's actualDuration. If
    // the fiber has not been cloned though, (meaning no work was done), then
    // this value will reflect the amount of time spent working on a previous
    // render. In that case it should not bubble. We determine whether it was
    // cloned by comparing the child pointer.
    const shouldBubbleActualDurations =
      completedWork.alternate === null ||
      completedWork.child !== completedWork.alternate.child;

    let child = completedWork.child;
    while (child !== null) {
      newChildLanes = mergeLanes(
        newChildLanes,
        mergeLanes(child.lanes, child.childLanes),
      );
      if (shouldBubbleActualDurations) {
        actualDuration += child.actualDuration;
      }
      treeBaseDuration += child.treeBaseDuration;
      child = child.sibling;
    }

    const isTimedOutSuspense =
      completedWork.tag === SuspenseComponent &&
      completedWork.memoizedState !== null;
    if (isTimedOutSuspense) {
      // Don't count time spent in a timed out Suspense subtree as part of the base duration.
      const primaryChildFragment = completedWork.child;
      if (primaryChildFragment !== null) {
        treeBaseDuration -= ((primaryChildFragment.treeBaseDuration: any): number);
      }
    }

    completedWork.actualDuration = actualDuration;
    completedWork.treeBaseDuration = treeBaseDuration;
  } else {
    let child = completedWork.child;
    while (child !== null) {
      newChildLanes = mergeLanes(
        newChildLanes,
        mergeLanes(child.lanes, child.childLanes),
      );
      child = child.sibling;
    }
  }

  completedWork.childLanes = newChildLanes;
}

/**
 * 提交阶段：立即优先级调度执行commitRootImpl方法
 *
 *  performSyncWorkOnRoot中的commitRoot方法
 * @param {*} root fiberRootNode会作为传参
 */
function commitRoot(root) {
  // 在commitRoot中同时使用到了渲染优先级等级和调度优先级
  const renderPriorityLevel = getCurrentPriorityLevel();
  runWithPriority(
    ImmediateSchedulerPriority,
    commitRootImpl.bind(null, root, renderPriorityLevel),
  );
  return null;
}

/**
 * commitRootImpl函数中, 渲染阶段的主要逻辑是处理副作用队列, 将最新的 DOM 节点(已经在内存中, 只是还没渲染)渲染到界面上.
 * 
 * 整个渲染过程被分为 3 个函数分布实现。
 * 1. before mutation 阶段（执行DOM操作前）
 *    - dom 变更之前, 处理副作用队列中带有Snapshot,Passive标记的fiber节点.
 * 2. mutation 阶段（执行DOM操作）
 *    - dom 变更, 界面得到更新. 处理副作用队列中带有Placement, Update, Deletion, Hydrating标记的fiber节点
 * 3. layout 阶段（执行DOM操作后）
 *    - dom 变更后, 处理副作用队列中带有Update | Callback标记的fiber节点.
 * 
 * 这 3 个函数处理的对象就是 firstEffect 变量：副作用队列和DOM对象。
 * 所以无论fiber树结构有多么复杂, 到了commitRoot阶段, 实际起作用的只有 2 个节点:
    - 副作用队列所在节点: 根节点, 即HostRootFiber节点.
    - DOM对象所在节点: 从上至下首个HostComponent类型的fiber节点, 此节点 fiber.stateNode实际上指向最新的 DOM 树
 * @param {*} root fiberRootNode会作为传参，且其rootFiber.firstEffect上保存了一条需要执行副作用的Fiber节点的单向链表effectList，这些Fiber节点的保存flags标记和updateQueue中保存了变化的props
 * @param {*} renderPriorityLevel 优先级等级
 */
function commitRootImpl(root, renderPriorityLevel) {
  // ============== before mutation 之前 ===========================   主要做一些变量赋值，状态重置的工作
  // 设置全局状态(如: 更新fiberRoot上的属性)
  // 重置全局变量(如: workInProgressRoot, workInProgress等)
  // 再次更新副作用队列: 只针对根节点fiberRoot.finishedWork
  // // 默认情况下根节点的副作用队列是不包括自身的, 如果根节点有副作用, 则将根节点添加到副作用队列的末尾
  // // 注意只是延长了副作用队列, 但是fiberRoot.lastEffect指针并没有改变.
  // //比如首次构造时, 根节点拥有Snapshot标记:
  do {
    // 触发useEffect回调，mount，unmount与其他同步任务。由于这些任务可能触发新的渲染，所以这里要一直遍历执行直到没有任务
    flushPassiveEffects();
  } while (rootWithPendingPassiveEffects !== null);
  flushRenderPhaseStrictModeWarningsInDEV();

  invariant(
    (executionContext & (RenderContext | CommitContext)) === NoContext,
    'Should not already be working.',
  );
  // root指 fiberRootNode
  // root.finishedWork指当前应用的rootFiber
  const finishedWork = root.finishedWork;
  const lanes = root.finishedLanes;

  if (__DEV__) {
    if (enableDebugTracing) {
      logCommitStarted(lanes);
    }
  }

  if (enableSchedulingProfiler) {
    markCommitStarted(lanes);
  }

  if (finishedWork === null) {
    if (__DEV__) {
      if (enableDebugTracing) {
        logCommitStopped();
      }
    }

    if (enableSchedulingProfiler) {
      markCommitStopped();
    }

    return null;
  }
  // 清空FiberRoot对象上的属性
  root.finishedWork = null;
  root.finishedLanes = NoLanes;

  invariant(
    finishedWork !== root.current,
    'Cannot commit the same tree as before. This error is likely caused by ' +
      'a bug in React. Please file an issue.',
  );

  // commitRoot never returns a continuation; it always finishes synchronously.
  // So we can clear these now to allow a new callback to be scheduled.
  root.callbackNode = null;

  // Update the first and last pending times on this root. The new first
  // pending time is whatever is left on the root fiber.
  let remainingLanes = mergeLanes(finishedWork.lanes, finishedWork.childLanes);
  markRootFinished(root, remainingLanes);

  // Clear already finished discrete updates in case that a later call of
  // `flushDiscreteUpdates` starts a useless render pass which may cancels
  // a scheduled timeout.
  if (rootsWithPendingDiscreteUpdates !== null) {
    if (
      !hasDiscreteLanes(remainingLanes) &&
      rootsWithPendingDiscreteUpdates.has(root)
    ) {
      rootsWithPendingDiscreteUpdates.delete(root);
    }
  }
  // 重置全局变量
  if (root === workInProgressRoot) {
    // We can reset these now that they are finished.
    workInProgressRoot = null;
    workInProgress = null;
    workInProgressRootRenderLanes = NoLanes;
  } else {
    // This indicates that the last root we worked on is not the same one that
    // we're committing now. This most commonly happens when a suspended root
    // times out.
  }

  // Get the list of effects.
  // 再次更新副作用队列,将根节点自身也检查flags变化的话插到链表里
  let firstEffect;
  if (finishedWork.flags > PerformedWork) {
    if (finishedWork.lastEffect !== null) {
      finishedWork.lastEffect.nextEffect = finishedWork;
      firstEffect = finishedWork.firstEffect;
    } else {
      firstEffect = finishedWork;
    }
  } else {
    // There is no effect on the root.
    firstEffect = finishedWork.firstEffect;
  }

  // ================================== before Mutation 阶段 ======================================== 
  // 阶段传参只为firstEffect：当前构建好的fiber树
  if (firstEffect !== null) {
    let previousLanePriority;
    if (decoupleUpdatePriorityFromScheduler) {
      // 保存之前的优先级，以同步优先级执行，执行完毕后恢复之前优先级
      previousLanePriority = getCurrentUpdateLanePriority();
      setCurrentUpdateLanePriority(SyncLanePriority);
    }

    // 设置executionContext为包含CommitContext，表示现在处于提交阶段。
    const prevExecutionContext = executionContext;
    executionContext |= CommitContext;
    const prevInteractions = pushInteractions(root);

    // 在开始调用生命周期方法之前，将ReactCurrentOwner设为null，防止意外使用旧的上下文信息。
    ReactCurrentOwner.current = null;

    // 准备工作：负责保存当前的事件交互状态和焦点focus元素类的选择信息，以确保在更新过程中不会触发不必要的事件，并且可以在更新后恢复这些状态
    // 返回是当前获得焦点的活跃react元素实例
    focusedInstanceHandle = prepareForCommit(root.containerInfo);
    shouldFireAfterActiveInstanceBlur = false;

    nextEffect = firstEffect;
    // 遍历effectList失败重试执行 commitBeforeMutationEffects
    do {
      if (__DEV__) {
        // 使用invokeGuardedCallback包裹对commitBeforeMutationEffects的调用，以便于错误捕获。
        invokeGuardedCallback(null, commitBeforeMutationEffects, null);
        if (hasCaughtError()) {
          invariant(nextEffect !== null, 'Should be working on an effect.');
          const error = clearCaughtError();
          captureCommitPhaseError(nextEffect, error);
          nextEffect = nextEffect.nextEffect;
        }
      } else {
        try {
          // beforeMutation阶段的主函数
          commitBeforeMutationEffects();
        } catch (error) {
          invariant(nextEffect !== null, 'Should be working on an effect.');
          captureCommitPhaseError(nextEffect, error);
          nextEffect = nextEffect.nextEffect;
        }
      }
    } while (nextEffect !== null);

    // We no longer need to track the active instance fiber
    focusedInstanceHandle = null;

    if (enableProfilerTimer) {
      // Mark the current commit time to be shared by all Profilers in this
      // batch. This enables them to be grouped later.
      recordCommitTime();
    }

    // =============================== Mutation阶段： dom突变, 界面发生改变 ===================================================
    // 多次遍历失败重试执行 commitBeforeMutationEffects
    nextEffect = firstEffect;
    do {
      if (__DEV__) {
        invokeGuardedCallback(
          null,
          commitMutationEffects,
          null,
          root,
          renderPriorityLevel,
        );
        if (hasCaughtError()) {
          invariant(nextEffect !== null, 'Should be working on an effect.');
          const error = clearCaughtError();
          captureCommitPhaseError(nextEffect, error);
          nextEffect = nextEffect.nextEffect;
        }
      } else {
        try {
          commitMutationEffects(root, renderPriorityLevel);
        } catch (error) {
          invariant(nextEffect !== null, 'Should be working on an effect.');
          captureCommitPhaseError(nextEffect, error);
          nextEffect = nextEffect.nextEffect;
        }
      }
    } while (nextEffect !== null);

    if (shouldFireAfterActiveInstanceBlur) {
      afterActiveInstanceBlur();
    }
    // 恢复界面状态
    resetAfterCommit(root.containerInfo);

    /**
     * workInProgress Fiber树在commit阶段完成渲染后会变为current Fiber树。这行代码的作用就是切换fiberRootNode指向的current Fiber树。

      那么这行代码为什么在这里呢？（在mutation阶段结束后，layout阶段开始前。）

      我们知道componentWillUnmount会在mutation阶段执行。此时current Fiber树还指向前一次更新的Fiber树，在生命周期钩子内获取的DOM还是更新前的。

      componentDidMount和componentDidUpdate会在layout阶段执行。此时current Fiber树已经指向更新后的Fiber树，在生命周期钩子内获取的DOM就是更新后的
     */
    // 切换current指针
    root.current = finishedWork;

    // ================== layout阶段: 调用生命周期componentDidUpdate和回调函数等 ===============================
    // 主要执行 commitLayoutEffects
    nextEffect = firstEffect;
    do {
      if (__DEV__) {
        invokeGuardedCallback(null, commitLayoutEffects, null, root, lanes);
        if (hasCaughtError()) {
          invariant(nextEffect !== null, 'Should be working on an effect.');
          const error = clearCaughtError();
          captureCommitPhaseError(nextEffect, error);
          nextEffect = nextEffect.nextEffect;
        }
      } else {
        try {
          commitLayoutEffects(root, lanes);
        } catch (error) {
          invariant(nextEffect !== null, 'Should be working on an effect.');
          captureCommitPhaseError(nextEffect, error);
          nextEffect = nextEffect.nextEffect;
        }
      }
    } while (nextEffect !== null);

    nextEffect = null;

    // Tell Scheduler to yield at the end of the frame, so the browser has an
    // opportunity to paint.
    requestPaint();

    if (enableSchedulerTracing) {
      popInteractions(((prevInteractions: any): Set<Interaction>));
    }
    executionContext = prevExecutionContext;

    if (decoupleUpdatePriorityFromScheduler && previousLanePriority != null) {
      // Reset the priority to the previous non-sync value.
      setCurrentUpdateLanePriority(previousLanePriority);
    }
  } else {
    // No effects.
    root.current = finishedWork;
    // Measure these anyway so the flamegraph explicitly shows that there were
    // no effects.
    // TODO: Maybe there's a better way to report this.
    if (enableProfilerTimer) {
      recordCommitTime();
    }
  }

  // =================================== layout阶段后: 重置与清理 ==================================
  // 1. 清除副作用队列
  // 由于副作用队列是一个链表, 由于单个fiber对象的引用关系, 无法被gc回收.
  // 将链表全部拆开, 当fiber对象不再使用的时候, 可以被gc回收
  // 2. 检测更新
  // 在整个渲染过程中, 有可能产生新的update(比如在componentDidMount函数中, 再次调用setState()).
  // 如果是常规(异步)任务, 不用特殊处理, 调用ensureRootIsScheduled确保任务已经注册到调度中心即可.
  // 如果是同步任务, 则主动调用flushSyncCallbackQueue(无需再次等待 scheduler 调度), 再次进入 fiber 树构造循环
  const rootDidHavePassiveEffects = rootDoesHavePassiveEffects;

  if (rootDoesHavePassiveEffects) {
    rootDoesHavePassiveEffects = false;
    rootWithPendingPassiveEffects = root;
    pendingPassiveEffectsLanes = lanes;
    pendingPassiveEffectsRenderPriority = renderPriorityLevel;
  } else {
    // 1-----将链表全部拆开，才可以被gc回收
    nextEffect = firstEffect;
    while (nextEffect !== null) {
      const nextNextEffect = nextEffect.nextEffect;
      nextEffect.nextEffect = null;
      if (nextEffect.flags & Deletion) {
        detachFiberAfterEffects(nextEffect);
      }
      nextEffect = nextNextEffect;
    }
  }

  // Read this again, since an effect might have updated it
  remainingLanes = root.pendingLanes;

  // Check if there's remaining work on this root
  if (remainingLanes !== NoLanes) {
    if (enableSchedulerTracing) {
      if (spawnedWorkDuringRender !== null) {
        const expirationTimes = spawnedWorkDuringRender;
        spawnedWorkDuringRender = null;
        for (let i = 0; i < expirationTimes.length; i++) {
          scheduleInteractions(
            root,
            expirationTimes[i],
            root.memoizedInteractions,
          );
        }
      }
      schedulePendingInteractions(root, remainingLanes);
    }
  } else {
    // If there's no remaining work, we can clear the set of already failed
    // error boundaries.
    legacyErrorBoundariesThatAlreadyFailed = null;
  }

  if (enableSchedulerTracing) {
    if (!rootDidHavePassiveEffects) {
      // If there are no passive effects, then we can complete the pending interactions.
      // Otherwise, we'll wait until after the passive effects are flushed.
      // Wait to do this until after remaining work has been scheduled,
      // so that we don't prematurely signal complete for interactions when there's e.g. hidden work.
      finishPendingInteractions(root, lanes);
    }
  }

  if (remainingLanes === SyncLane) {
    // Count the number of times the root synchronously re-renders without
    // finishing. If there are too many, it indicates an infinite update loop.
    if (root === rootWithNestedUpdates) {
      nestedUpdateCount++;
    } else {
      nestedUpdateCount = 0;
      rootWithNestedUpdates = root;
    }
  } else {
    nestedUpdateCount = 0;
  }

  onCommitRootDevTools(finishedWork.stateNode, renderPriorityLevel);

  if (__DEV__) {
    onCommitRootTestSelector();
  }

  // 2----下面代码用于检测是否有新的更新任务
  // 比如在componentDidMount函数中, 再次调用setState()
  // 1. 检测常规(异步)任务, 如果有则会发起异步调度(调度中心`scheduler`只能异步调用)
  ensureRootIsScheduled(root, now());

  if (hasUncaughtError) {
    hasUncaughtError = false;
    const error = firstUncaughtError;
    firstUncaughtError = null;
    throw error;
  }

  if ((executionContext & LegacyUnbatchedContext) !== NoContext) {
    if (__DEV__) {
      if (enableDebugTracing) {
        logCommitStopped();
      }
    }

    if (enableSchedulingProfiler) {
      markCommitStopped();
    }

    // This is a legacy edge case. We just committed the initial mount of
    // a ReactDOM.render-ed root inside of batchedUpdates. The commit fired
    // synchronously, but layout updates should be deferred until the end
    // of the batch.
    return null;
  }

  // If layout work was scheduled, flush it now.
  // 2. 检测同步任务, 如果有则主动调用flushSyncCallbackQueue(无需再次等待scheduler调度), 再次进入fiber树构造循环
  flushSyncCallbackQueue();

  if (__DEV__) {
    if (enableDebugTracing) {
      logCommitStopped();
    }
  }

  if (enableSchedulingProfiler) {
    markCommitStopped();
  }

  return null;
}

/**
 * 整体可以分为三部分：
 * 1. 处理DOM节点渲染/删除后的 autoFocus、blur 逻辑。
 * 2. commitBeforeMutationEffectOnFiber方法处理flags:`Snapshot`标记：调用getSnapshotBeforeUpdate生命周期钩子。
 * 3. 处理flags:`Passive`标记：以NormalSchedulerPriority调度flushPassiveEffects（对应useEffect）
 *    - 该useEffect标记，会在beginWork-fiber树构造过程中的renderWithHooks中的useEffect函数执行逻辑中会向fiber节点添加fiber-Passive-flags
 *        - 见Hooks章节的mountEffectImpl源码
 *    - scheduleCallback(NormalSchedulerPriority, () => {
          flushPassiveEffects();
          return null;
        });
 */
function commitBeforeMutationEffects() {
  while (nextEffect !== null) {
    const current = nextEffect.alternate;

    // 1、...focus blur相关
    if (!shouldFireAfterActiveInstanceBlur && focusedInstanceHandle !== null) {
      if ((nextEffect.flags & Deletion) !== NoFlags) {
        if (doesFiberContain(nextEffect, focusedInstanceHandle)) {
          shouldFireAfterActiveInstanceBlur = true;
          beforeActiveInstanceBlur();
        }
      } else {
        // TODO: Move this out of the hot path using a dedicated effect tag.
        if (
          nextEffect.tag === SuspenseComponent &&
          isSuspenseBoundaryBeingHidden(current, nextEffect) &&
          doesFiberContain(nextEffect, focusedInstanceHandle)
        ) {
          shouldFireAfterActiveInstanceBlur = true;
          beforeActiveInstanceBlur();
        }
      }
    }

    const flags = nextEffect.flags;
    // 2、处理`Snapshot`标记。。调用getSnapshotBeforeUpdate
    if ((flags & Snapshot) !== NoFlags) {
      setCurrentDebugFiberInDEV(nextEffect);

      commitBeforeMutationEffectOnFiber(current, nextEffect);

      resetCurrentDebugFiberInDEV();
    }
    // 3、处理`Passive`标记。。 调度useEffect
    if ((flags & Passive) !== NoFlags) {
      // Passive标记只在使用了hook, useEffect会出现. 所以此处是针对hook对象的处理
      if (!rootDoesHavePassiveEffects) {
        rootDoesHavePassiveEffects = true;
        scheduleCallback(NormalSchedulerPriority, () => {
          flushPassiveEffects();
          return null;
        });
      }
    }
    nextEffect = nextEffect.nextEffect;
  }
}

/**
 * 遍历effectList处理ContentReset，Ref ，Placement | Update | Deletion | Hydrating 6类flags标记
 */
function commitMutationEffects(
  root: FiberRoot,
  renderPriorityLevel: ReactPriorityLevel,
) {
  // TODO: Should probably move the bulk of this function to commitWork.
  while (nextEffect !== null) {
    setCurrentDebugFiberInDEV(nextEffect);

    const flags = nextEffect.flags;

    // 处理 ContentReset 标记： 根据 ContentReset effectTag重置文字节点
    if (flags & ContentReset) {
      commitResetTextContent(nextEffect);
    }

    // 处理 Ref 标记
    if (flags & Ref) {
      const current = nextEffect.alternate;
      if (current !== null) {
        commitDetachRef(current);
      }
      if (enableScopeAPI) {
        // TODO: This is a temporary solution that allowed us to transition away
        // from React Flare on www.
        if (nextEffect.tag === ScopeComponent) {
          commitAttachRef(nextEffect);
        }
      }
    }

    const primaryFlags = flags & (Placement | Update | Deletion | Hydrating);
    switch (primaryFlags) {
      // 插入：Fiber节点对应的DOM节点需要插入到页面中
      case Placement: {
        commitPlacement(nextEffect);
        // Clear the "placement" from effect tag so that we know that this is
        // inserted, before any life-cycles like componentDidMount gets called.
        // TODO: findDOMNode doesn't rely on this any more but isMounted does
        // and isMounted is deprecated anyway so we should be able to kill this.
        // 删除placement标记
        nextEffect.flags &= ~Placement;
        break;
      }
      case PlacementAndUpdate: {
        // Placement
        commitPlacement(nextEffect);
        // Clear the "placement" from effect tag so that we know that this is
        // inserted, before any life-cycles like componentDidMount gets called.
        nextEffect.flags &= ~Placement;

        // Update
        const current = nextEffect.alternate;
        commitWork(current, nextEffect);
        break;
      }
      case Hydrating: {
        nextEffect.flags &= ~Hydrating;
        break;
      }
      case HydratingAndUpdate: {
        nextEffect.flags &= ~Hydrating;

        // Update
        const current = nextEffect.alternate;
        commitWork(current, nextEffect);
        break;
      }
      // 更新：该Fiber节点需要更新。调用的方法为commitWork
      // // useEffect,useLayoutEffect都会设置Update标记
      case Update: {
        const current = nextEffect.alternate;
        commitWork(current, nextEffect);
        break;
      }
      // 删除：意味着该Fiber节点对应的DOM节点需要从页面中删除。调用的方法为commitDeletion
      case Deletion: {
        commitDeletion(root, nextEffect, renderPriorityLevel);
        break;
      }
    }

    resetCurrentDebugFiberInDEV();
    nextEffect = nextEffect.nextEffect;
  }
}

/**
 * commitLayoutEffects遍历effectList链表，并一共做了两件事： 主要处理flags标记：Update | Callback
    1. commitLayoutEffectOnFiber（调用生命周期钩子和hook相关操作）
    2. commitAttachRef（赋值 ref）
 */
function commitLayoutEffects(root: FiberRoot, committedLanes: Lanes) {
  if (__DEV__) {
    if (enableDebugTracing) {
      logLayoutEffectsStarted(committedLanes);
    }
  }

  if (enableSchedulingProfiler) {
    markLayoutEffectsStarted(committedLanes);
  }

  // TODO: Should probably move the bulk of this function to commitWork.
  while (nextEffect !== null) {
    setCurrentDebugFiberInDEV(nextEffect);

    const flags = nextEffect.flags;

    // 1-调用生命周期钩子和hook
    // useEffect,useLayoutEffect都会设置Update标记
    if (flags & (Update | Callback)) {
      const current = nextEffect.alternate;
      commitLayoutEffectOnFiber(root, current, nextEffect, committedLanes);
    }

    // 2-赋值 新的ref
    if (enableScopeAPI) {
      // TODO: This is a temporary solution that allowed us to transition away
      // from React Flare on www.
      if (flags & Ref && nextEffect.tag !== ScopeComponent) {
        commitAttachRef(nextEffect);
      }
    } else {
      if (flags & Ref) {
        commitAttachRef(nextEffect);
      }
    }

    resetCurrentDebugFiberInDEV();
    nextEffect = nextEffect.nextEffect;
  }

  if (__DEV__) {
    if (enableDebugTracing) {
      logLayoutEffectsStopped();
    }
  }

  if (enableSchedulingProfiler) {
    markLayoutEffectsStopped();
  }
}

/**
 * 主要任务：内部runWithPriority优先级调度useEffect回调函数。
 *  - 主要使用 runWithPriority 调度执行 flushPassiveEffectsImpl，因为一次渲染过程中副作用中产生新的更新副作用，所有加个优先级按序执行
 * 
 * 执行时机：被调度在提交阶段之后、浏览器绘制之前
 * 
 * 关于flushPassiveEffects的具体讲解参照卡颂的useEffect与useLayoutEffect一节
 */
export function flushPassiveEffects(): boolean {
  // Returns whether passive effects were flushed.
  // 检查是否有待处理的被动副作用
  if (pendingPassiveEffectsRenderPriority !== NoSchedulerPriority) {
    // endingPassiveEffectsRenderPriority：表示当前有待处理的被动副作用的优先级。如果没有待处理的被动副作用，则该值为 NoSchedulerPriority
    // 确定执行优先级
    // 如果待处理的优先级高于 NormalSchedulerPriority，则将其降为 NormalSchedulerPriority，以防止过高的优先级影响用户体验
    const priorityLevel =
      pendingPassiveEffectsRenderPriority > NormalSchedulerPriority
        ? NormalSchedulerPriority
        : pendingPassiveEffectsRenderPriority;
    pendingPassiveEffectsRenderPriority = NoSchedulerPriority;
    // 处理优先级与调度器解耦的情况
    if (decoupleUpdatePriorityFromScheduler) {
      // 获取当前的更新优先级
      const previousLanePriority = getCurrentUpdateLanePriority();
      try {
        // 设置新的优先级
        setCurrentUpdateLanePriority(
          schedulerPriorityToLanePriority(priorityLevel),
        );
        // 使用 runWithPriority 和 flushPassiveEffectsImpl 来执行被动副作用
        return runWithPriority(priorityLevel, flushPassiveEffectsImpl);
      } finally {
        setCurrentUpdateLanePriority(previousLanePriority);
      }
    } else {
      // 如果不解耦，则直接使用 runWithPriority 执行 flushPassiveEffectsImpl
      return runWithPriority(priorityLevel, flushPassiveEffectsImpl);
    }
  }
  return false;
}

export function enqueuePendingPassiveProfilerEffect(fiber: Fiber): void {
  if (enableProfilerTimer && enableProfilerCommitHooks) {
    pendingPassiveProfilerEffects.push(fiber);
    if (!rootDoesHavePassiveEffects) {
      rootDoesHavePassiveEffects = true;
      scheduleCallback(NormalSchedulerPriority, () => {
        flushPassiveEffects();
        return null;
      });
    }
  }
}

/** 
 * pendingPassiveHookEffectsMount 全局变量填充create函数
 */
export function enqueuePendingPassiveHookEffectMount(
  fiber: Fiber,
  effect: HookEffect,
): void {
  pendingPassiveHookEffectsMount.push(effect, fiber);
  if (!rootDoesHavePassiveEffects) {
    rootDoesHavePassiveEffects = true;
    scheduleCallback(NormalSchedulerPriority, () => {
      flushPassiveEffects();
      return null;
    });
  }
}

/** pendingPassiveHookEffectsUnmount 全局变量填充销毁函数 */
export function enqueuePendingPassiveHookEffectUnmount(
  fiber: Fiber,
  effect: HookEffect,
): void {
  pendingPassiveHookEffectsUnmount.push(effect, fiber);
  if (__DEV__) {
    fiber.flags |= PassiveUnmountPendingDev;
    const alternate = fiber.alternate;
    if (alternate !== null) {
      alternate.flags |= PassiveUnmountPendingDev;
    }
  }
  if (!rootDoesHavePassiveEffects) {
    rootDoesHavePassiveEffects = true;
    scheduleCallback(NormalSchedulerPriority, () => {
      flushPassiveEffects();
      return null;
    });
  }
}

function invokePassiveEffectCreate(effect: HookEffect): void {
  const create = effect.create;
  effect.destroy = create();
}

/**
 * 
 * 针对函数组件Hooks代码的useEffect异步调用：整个useEffect异步调用分为三步：
      - before mutation阶段在scheduleCallback中调度flushPassiveEffects
      - layout段之后将effectList赋值给rootWithPendingPassiveEffects，所以在此之前调用时都是null，直接return了不会实际执行
      - scheduleCallback触发flushPassiveEffects，flushPassiveEffects内部遍历rootWithPendingPassiveEffects
 * 
    大体就是执行上次useEffect回调执行后得到的destroy函数，执行这次新的useEffect回调，赋值新的destroy回调
 * 1. 遍历 pendingPassiveHookEffectsUnmount 列表，逐个调用每个副作用的 destroy 方法。
 * 2. 遍历 pendingPassiveHookEffectsMount 列表，逐个调用每个副作用的 create 方法。
      将返回值赋给 effect.destroy，以便在将来可以销毁这些副作用
 */
function flushPassiveEffectsImpl() {
  if (rootWithPendingPassiveEffects === null) {
    return false;
  }

  const root = rootWithPendingPassiveEffects;
  const lanes = pendingPassiveEffectsLanes;
  rootWithPendingPassiveEffects = null;
  pendingPassiveEffectsLanes = NoLanes;

  invariant(
    (executionContext & (RenderContext | CommitContext)) === NoContext,
    'Cannot flush passive effects while already rendering.',
  );

  if (__DEV__) {
    if (enableDebugTracing) {
      logPassiveEffectsStarted(lanes);
    }
  }

  if (enableSchedulingProfiler) {
    markPassiveEffectsStarted(lanes);
  }

  if (__DEV__) {
    isFlushingPassiveEffects = true;
  }

  const prevExecutionContext = executionContext;
  executionContext |= CommitContext;
  const prevInteractions = pushInteractions(root);

  // It's important that ALL pending passive effect destroy functions are called
  // before ANY passive effect create functions are called.
  // Otherwise effects in sibling components might interfere with each other.
  // e.g. a destroy function in one component may unintentionally override a ref
  // value set by a create function in another component.
  // Layout effects have the same constraint.

  // First pass: Destroy stale passive effects.
  // 第一遍：销毁旧的被动副作用：对应执行 effect.destroy()
  // 遍历 pendingPassiveHookEffectsUnmount 列表，逐个调用每个副作用的 destroy 方法。
  const unmountEffects = pendingPassiveHookEffectsUnmount;
  pendingPassiveHookEffectsUnmount = [];
  for (let i = 0; i < unmountEffects.length; i += 2) {
    const effect = ((unmountEffects[i]: any): HookEffect);
    const fiber = ((unmountEffects[i + 1]: any): Fiber);
    const destroy = effect.destroy;
    effect.destroy = undefined;

    if (__DEV__) {
      fiber.flags &= ~PassiveUnmountPendingDev;
      const alternate = fiber.alternate;
      if (alternate !== null) {
        alternate.flags &= ~PassiveUnmountPendingDev;
      }
    }

    if (typeof destroy === 'function') {
      if (__DEV__) {
        setCurrentDebugFiberInDEV(fiber);
        if (
          enableProfilerTimer &&
          enableProfilerCommitHooks &&
          fiber.mode & ProfileMode
        ) {
          startPassiveEffectTimer();
          invokeGuardedCallback(null, destroy, null);
          recordPassiveEffectDuration(fiber);
        } else {
          invokeGuardedCallback(null, destroy, null);
        }
        if (hasCaughtError()) {
          invariant(fiber !== null, 'Should be working on an effect.');
          const error = clearCaughtError();
          captureCommitPhaseError(fiber, error);
        }
        resetCurrentDebugFiberInDEV();
      } else {
        try {
          if (
            enableProfilerTimer &&
            enableProfilerCommitHooks &&
            fiber.mode & ProfileMode
          ) {
            try {
              startPassiveEffectTimer();
              destroy();
            } finally {
              recordPassiveEffectDuration(fiber);
            }
          } else {
            destroy();
          }
        } catch (error) {
          invariant(fiber !== null, 'Should be working on an effect.');
          captureCommitPhaseError(fiber, error);
        }
      }
    }
  }
  // Second pass: Create new passive effects.
  const mountEffects = pendingPassiveHookEffectsMount;
  pendingPassiveHookEffectsMount = [];
  // 第二遍：创建新的被动副作用：对应执行新 effect.create(), 重新赋值到 effect.destroy
  // 遍历 pendingPassiveHookEffectsMount 列表，逐个调用每个副作用的 create 方法
  for (let i = 0; i < mountEffects.length; i += 2) {
    const effect = ((mountEffects[i]: any): HookEffect);
    const fiber = ((mountEffects[i + 1]: any): Fiber);
    if (__DEV__) {
      setCurrentDebugFiberInDEV(fiber);
      if (
        enableProfilerTimer &&
        enableProfilerCommitHooks &&
        fiber.mode & ProfileMode
      ) {
        startPassiveEffectTimer();
        invokeGuardedCallback(null, invokePassiveEffectCreate, null, effect);
        recordPassiveEffectDuration(fiber);
      } else {
        invokeGuardedCallback(null, invokePassiveEffectCreate, null, effect);
      }
      if (hasCaughtError()) {
        invariant(fiber !== null, 'Should be working on an effect.');
        const error = clearCaughtError();
        captureCommitPhaseError(fiber, error);
      }
      resetCurrentDebugFiberInDEV();
    } else {
      try {
        const create = effect.create;
        if (
          enableProfilerTimer &&
          enableProfilerCommitHooks &&
          fiber.mode & ProfileMode
        ) {
          try {
            startPassiveEffectTimer();
            effect.destroy = create();
          } finally {
            recordPassiveEffectDuration(fiber);
          }
        } else {
          effect.destroy = create();
        }
      } catch (error) {
        invariant(fiber !== null, 'Should be working on an effect.');
        captureCommitPhaseError(fiber, error);
      }
    }
  }

  // Note: This currently assumes there are no passive effects on the root fiber
  // because the root is not part of its own effect list.
  // This could change in the future.
  let effect = root.current.firstEffect;
  while (effect !== null) {
    const nextNextEffect = effect.nextEffect;
    // Remove nextEffect pointer to assist GC
    effect.nextEffect = null;
    if (effect.flags & Deletion) {
      detachFiberAfterEffects(effect);
    }
    effect = nextNextEffect;
  }

  if (enableProfilerTimer && enableProfilerCommitHooks) {
    const profilerEffects = pendingPassiveProfilerEffects;
    pendingPassiveProfilerEffects = [];
    for (let i = 0; i < profilerEffects.length; i++) {
      const fiber = ((profilerEffects[i]: any): Fiber);
      commitPassiveEffectDurations(root, fiber);
    }
  }

  if (enableSchedulerTracing) {
    popInteractions(((prevInteractions: any): Set<Interaction>));
    finishPendingInteractions(root, lanes);
  }

  if (__DEV__) {
    isFlushingPassiveEffects = false;
  }

  if (__DEV__) {
    if (enableDebugTracing) {
      logPassiveEffectsStopped();
    }
  }

  if (enableSchedulingProfiler) {
    markPassiveEffectsStopped();
  }

  executionContext = prevExecutionContext;

  flushSyncCallbackQueue();

  // If additional passive effects were scheduled, increment a counter. If this
  // exceeds the limit, we'll fire a warning.
  nestedPassiveUpdateCount =
    rootWithPendingPassiveEffects === null ? 0 : nestedPassiveUpdateCount + 1;

  return true;
}

export function isAlreadyFailedLegacyErrorBoundary(instance: mixed): boolean {
  return (
    legacyErrorBoundariesThatAlreadyFailed !== null &&
    legacyErrorBoundariesThatAlreadyFailed.has(instance)
  );
}

export function markLegacyErrorBoundaryAsFailed(instance: mixed) {
  if (legacyErrorBoundariesThatAlreadyFailed === null) {
    legacyErrorBoundariesThatAlreadyFailed = new Set([instance]);
  } else {
    legacyErrorBoundariesThatAlreadyFailed.add(instance);
  }
}

function prepareToThrowUncaughtError(error: mixed) {
  if (!hasUncaughtError) {
    hasUncaughtError = true;
    firstUncaughtError = error;
  }
}
export const onUncaughtError = prepareToThrowUncaughtError;

function captureCommitPhaseErrorOnRoot(
  rootFiber: Fiber,
  sourceFiber: Fiber,
  error: mixed,
) {
  const errorInfo = createCapturedValue(error, sourceFiber);
  const update = createRootErrorUpdate(rootFiber, errorInfo, (SyncLane: Lane));
  enqueueUpdate(rootFiber, update);
  const eventTime = requestEventTime();
  const root = markUpdateLaneFromFiberToRoot(rootFiber, (SyncLane: Lane));
  if (root !== null) {
    markRootUpdated(root, SyncLane, eventTime);
    ensureRootIsScheduled(root, eventTime);
    schedulePendingInteractions(root, SyncLane);
  }
}

export function captureCommitPhaseError(sourceFiber: Fiber, error: mixed) {
  if (sourceFiber.tag === HostRoot) {
    // Error was thrown at the root. There is no parent, so the root
    // itself should capture it.
    captureCommitPhaseErrorOnRoot(sourceFiber, sourceFiber, error);
    return;
  }

  let fiber = sourceFiber.return;

  while (fiber !== null) {
    if (fiber.tag === HostRoot) {
      captureCommitPhaseErrorOnRoot(fiber, sourceFiber, error);
      return;
    } else if (fiber.tag === ClassComponent) {
      const ctor = fiber.type;
      const instance = fiber.stateNode;
      if (
        typeof ctor.getDerivedStateFromError === 'function' ||
        (typeof instance.componentDidCatch === 'function' &&
          !isAlreadyFailedLegacyErrorBoundary(instance))
      ) {
        const errorInfo = createCapturedValue(error, sourceFiber);
        const update = createClassErrorUpdate(
          fiber,
          errorInfo,
          (SyncLane: Lane),
        );
        enqueueUpdate(fiber, update);
        const eventTime = requestEventTime();
        const root = markUpdateLaneFromFiberToRoot(fiber, (SyncLane: Lane));
        if (root !== null) {
          markRootUpdated(root, SyncLane, eventTime);
          ensureRootIsScheduled(root, eventTime);
          schedulePendingInteractions(root, SyncLane);
        } else {
          // This component has already been unmounted.
          // We can't schedule any follow up work for the root because the fiber is already unmounted,
          // but we can still call the log-only boundary so the error isn't swallowed.
          //
          // TODO This is only a temporary bandaid for the old reconciler fork.
          // We can delete this special case once the new fork is merged.
          if (
            typeof instance.componentDidCatch === 'function' &&
            !isAlreadyFailedLegacyErrorBoundary(instance)
          ) {
            try {
              instance.componentDidCatch(error, errorInfo);
            } catch (errorToIgnore) {
              // TODO Ignore this error? Rethrow it?
              // This is kind of an edge case.
            }
          }
        }
        return;
      }
    }
    fiber = fiber.return;
  }
}

export function pingSuspendedRoot(
  root: FiberRoot,
  wakeable: Wakeable,
  pingedLanes: Lanes,
) {
  const pingCache = root.pingCache;
  if (pingCache !== null) {
    // The wakeable resolved, so we no longer need to memoize, because it will
    // never be thrown again.
    pingCache.delete(wakeable);
  }

  const eventTime = requestEventTime();
  markRootPinged(root, pingedLanes, eventTime);

  if (
    workInProgressRoot === root &&
    isSubsetOfLanes(workInProgressRootRenderLanes, pingedLanes)
  ) {
    // Received a ping at the same priority level at which we're currently
    // rendering. We might want to restart this render. This should mirror
    // the logic of whether or not a root suspends once it completes.

    // TODO: If we're rendering sync either due to Sync, Batched or expired,
    // we should probably never restart.

    // If we're suspended with delay, or if it's a retry, we'll always suspend
    // so we can always restart.
    if (
      workInProgressRootExitStatus === RootSuspendedWithDelay ||
      (workInProgressRootExitStatus === RootSuspended &&
        includesOnlyRetries(workInProgressRootRenderLanes) &&
        now() - globalMostRecentFallbackTime < FALLBACK_THROTTLE_MS)
    ) {
      // Restart from the root.
      prepareFreshStack(root, NoLanes);
    } else {
      // Even though we can't restart right now, we might get an
      // opportunity later. So we mark this render as having a ping.
      workInProgressRootPingedLanes = mergeLanes(
        workInProgressRootPingedLanes,
        pingedLanes,
      );
    }
  }

  ensureRootIsScheduled(root, eventTime);
  schedulePendingInteractions(root, pingedLanes);
}

function retryTimedOutBoundary(boundaryFiber: Fiber, retryLane: Lane) {
  // The boundary fiber (a Suspense component or SuspenseList component)
  // previously was rendered in its fallback state. One of the promises that
  // suspended it has resolved, which means at least part of the tree was
  // likely unblocked. Try rendering again, at a new expiration time.
  if (retryLane === NoLane) {
    retryLane = requestRetryLane(boundaryFiber);
  }
  // TODO: Special case idle priority?
  const eventTime = requestEventTime();
  const root = markUpdateLaneFromFiberToRoot(boundaryFiber, retryLane);
  if (root !== null) {
    markRootUpdated(root, retryLane, eventTime);
    ensureRootIsScheduled(root, eventTime);
    schedulePendingInteractions(root, retryLane);
  }
}

export function retryDehydratedSuspenseBoundary(boundaryFiber: Fiber) {
  const suspenseState: null | SuspenseState = boundaryFiber.memoizedState;
  let retryLane = NoLane;
  if (suspenseState !== null) {
    retryLane = suspenseState.retryLane;
  }
  retryTimedOutBoundary(boundaryFiber, retryLane);
}

export function resolveRetryWakeable(boundaryFiber: Fiber, wakeable: Wakeable) {
  let retryLane = NoLane; // Default
  let retryCache: WeakSet<Wakeable> | Set<Wakeable> | null;
  if (enableSuspenseServerRenderer) {
    switch (boundaryFiber.tag) {
      case SuspenseComponent:
        retryCache = boundaryFiber.stateNode;
        const suspenseState: null | SuspenseState = boundaryFiber.memoizedState;
        if (suspenseState !== null) {
          retryLane = suspenseState.retryLane;
        }
        break;
      case SuspenseListComponent:
        retryCache = boundaryFiber.stateNode;
        break;
      default:
        invariant(
          false,
          'Pinged unknown suspense boundary type. ' +
            'This is probably a bug in React.',
        );
    }
  } else {
    retryCache = boundaryFiber.stateNode;
  }

  if (retryCache !== null) {
    // The wakeable resolved, so we no longer need to memoize, because it will
    // never be thrown again.
    retryCache.delete(wakeable);
  }

  retryTimedOutBoundary(boundaryFiber, retryLane);
}

// Computes the next Just Noticeable Difference (JND) boundary.
// The theory is that a person can't tell the difference between small differences in time.
// Therefore, if we wait a bit longer than necessary that won't translate to a noticeable
// difference in the experience. However, waiting for longer might mean that we can avoid
// showing an intermediate loading state. The longer we have already waited, the harder it
// is to tell small differences in time. Therefore, the longer we've already waited,
// the longer we can wait additionally. At some point we have to give up though.
// We pick a train model where the next boundary commits at a consistent schedule.
// These particular numbers are vague estimates. We expect to adjust them based on research.
function jnd(timeElapsed: number) {
  return timeElapsed < 120
    ? 120
    : timeElapsed < 480
    ? 480
    : timeElapsed < 1080
    ? 1080
    : timeElapsed < 1920
    ? 1920
    : timeElapsed < 3000
    ? 3000
    : timeElapsed < 4320
    ? 4320
    : ceil(timeElapsed / 1960) * 1960;
}

function checkForNestedUpdates() {
  if (nestedUpdateCount > NESTED_UPDATE_LIMIT) {
    nestedUpdateCount = 0;
    rootWithNestedUpdates = null;
    invariant(
      false,
      'Maximum update depth exceeded. This can happen when a component ' +
        'repeatedly calls setState inside componentWillUpdate or ' +
        'componentDidUpdate. React limits the number of nested updates to ' +
        'prevent infinite loops.',
    );
  }

  if (__DEV__) {
    if (nestedPassiveUpdateCount > NESTED_PASSIVE_UPDATE_LIMIT) {
      nestedPassiveUpdateCount = 0;
      console.error(
        'Maximum update depth exceeded. This can happen when a component ' +
          "calls setState inside useEffect, but useEffect either doesn't " +
          'have a dependency array, or one of the dependencies changes on ' +
          'every render.',
      );
    }
  }
}

function flushRenderPhaseStrictModeWarningsInDEV() {
  if (__DEV__) {
    ReactStrictModeWarnings.flushLegacyContextWarning();

    if (warnAboutDeprecatedLifecycles) {
      ReactStrictModeWarnings.flushPendingUnsafeLifecycleWarnings();
    }
  }
}

let didWarnStateUpdateForNotYetMountedComponent: Set<string> | null = null;
function warnAboutUpdateOnNotYetMountedFiberInDEV(fiber) {
  if (__DEV__) {
    if ((executionContext & RenderContext) !== NoContext) {
      // We let the other warning about render phase updates deal with this one.
      return;
    }

    if (!(fiber.mode & (BlockingMode | ConcurrentMode))) {
      return;
    }

    const tag = fiber.tag;
    if (
      tag !== IndeterminateComponent &&
      tag !== HostRoot &&
      tag !== ClassComponent &&
      tag !== FunctionComponent &&
      tag !== ForwardRef &&
      tag !== MemoComponent &&
      tag !== SimpleMemoComponent &&
      tag !== Block
    ) {
      // Only warn for user-defined components, not internal ones like Suspense.
      return;
    }

    // We show the whole stack but dedupe on the top component's name because
    // the problematic code almost always lies inside that component.
    const componentName = getComponentName(fiber.type) || 'ReactComponent';
    if (didWarnStateUpdateForNotYetMountedComponent !== null) {
      if (didWarnStateUpdateForNotYetMountedComponent.has(componentName)) {
        return;
      }
      didWarnStateUpdateForNotYetMountedComponent.add(componentName);
    } else {
      didWarnStateUpdateForNotYetMountedComponent = new Set([componentName]);
    }

    const previousFiber = ReactCurrentFiberCurrent;
    try {
      setCurrentDebugFiberInDEV(fiber);
      console.error(
        "Can't perform a React state update on a component that hasn't mounted yet. " +
          'This indicates that you have a side-effect in your render function that ' +
          'asynchronously later calls tries to update the component. Move this work to ' +
          'useEffect instead.',
      );
    } finally {
      if (previousFiber) {
        setCurrentDebugFiberInDEV(fiber);
      } else {
        resetCurrentDebugFiberInDEV();
      }
    }
  }
}

let didWarnStateUpdateForUnmountedComponent: Set<string> | null = null;
function warnAboutUpdateOnUnmountedFiberInDEV(fiber) {
  if (__DEV__) {
    const tag = fiber.tag;
    if (
      tag !== HostRoot &&
      tag !== ClassComponent &&
      tag !== FunctionComponent &&
      tag !== ForwardRef &&
      tag !== MemoComponent &&
      tag !== SimpleMemoComponent &&
      tag !== Block
    ) {
      // Only warn for user-defined components, not internal ones like Suspense.
      return;
    }

    // If there are pending passive effects unmounts for this Fiber,
    // we can assume that they would have prevented this update.
    if ((fiber.flags & PassiveUnmountPendingDev) !== NoFlags) {
      return;
    }

    // We show the whole stack but dedupe on the top component's name because
    // the problematic code almost always lies inside that component.
    const componentName = getComponentName(fiber.type) || 'ReactComponent';
    if (didWarnStateUpdateForUnmountedComponent !== null) {
      if (didWarnStateUpdateForUnmountedComponent.has(componentName)) {
        return;
      }
      didWarnStateUpdateForUnmountedComponent.add(componentName);
    } else {
      didWarnStateUpdateForUnmountedComponent = new Set([componentName]);
    }

    if (isFlushingPassiveEffects) {
      // Do not warn if we are currently flushing passive effects!
      //
      // React can't directly detect a memory leak, but there are some clues that warn about one.
      // One of these clues is when an unmounted React component tries to update its state.
      // For example, if a component forgets to remove an event listener when unmounting,
      // that listener may be called later and try to update state,
      // at which point React would warn about the potential leak.
      //
      // Warning signals are the most useful when they're strong.
      // (So we should avoid false positive warnings.)
      // Updating state from within an effect cleanup function is sometimes a necessary pattern, e.g.:
      // 1. Updating an ancestor that a component had registered itself with on mount.
      // 2. Resetting state when a component is hidden after going offscreen.
    } else {
      const previousFiber = ReactCurrentFiberCurrent;
      try {
        setCurrentDebugFiberInDEV(fiber);
        console.error(
          "Can't perform a React state update on an unmounted component. This " +
            'is a no-op, but it indicates a memory leak in your application. To ' +
            'fix, cancel all subscriptions and asynchronous tasks in %s.',
          tag === ClassComponent
            ? 'the componentWillUnmount method'
            : 'a useEffect cleanup function',
        );
      } finally {
        if (previousFiber) {
          setCurrentDebugFiberInDEV(fiber);
        } else {
          resetCurrentDebugFiberInDEV();
        }
      }
    }
  }
}

/**
 * 全局变量beginWork函数：主要是基于current.child与nextChildren进行diff对比构造生成workInProgress.child新fiber节点链表
 * 1. 开发模式下且启用重试失败特性的工作单元时加点逻辑包装下originalBeginWork原方法
 * 2. 否则直接引用 originalBeginWork 方法
 * 
 *  根据 ReactElement对象创建所有的fiber节点, 最终构造出fiber树形结构(设置return和sibling指针)
    设置fiber.flags(二进制形式变量, 用来标记 fiber节点 的增,删,改状态, 等待completeWork阶段处理)
    设置fiber.stateNode局部状态(如Class类型节点: fiber.stateNode=new Class())
 * @returns 生成好的workInProgress.child
 */
let beginWork;
// 开发模式下且启用重试失败特性的工作单元时加点逻辑下originalBeginWork原方法
if (__DEV__ && replayFailedUnitOfWorkWithInvokeGuardedCallback) {
  const dummyFiber = null;
  beginWork = (current, unitOfWork, lanes) => {
    // If a component throws an error, we replay it again in a synchronously
    // dispatched event, so that the debugger will treat it as an uncaught
    // error See ReactErrorUtils for more information.

    // Before entering the begin phase, copy the work-in-progress onto a dummy
    // fiber. If beginWork throws, we'll use this to reset the state.
    const originalWorkInProgressCopy = assignFiberPropertiesInDEV(
      dummyFiber,
      unitOfWork,
    );
    try {
      return originalBeginWork(current, unitOfWork, lanes);
    } catch (originalError) {
      if (
        originalError !== null &&
        typeof originalError === 'object' &&
        typeof originalError.then === 'function'
      ) {
        // Don't replay promises. Treat everything else like an error.
        throw originalError;
      }

      // Keep this code in sync with handleError; any changes here must have
      // corresponding changes there.
      resetContextDependencies();
      resetHooksAfterThrow();
      // Don't reset current debug fiber, since we're about to work on the
      // same fiber again.

      // Unwind the failed stack frame
      unwindInterruptedWork(unitOfWork);

      // Restore the original properties of the fiber.
      assignFiberPropertiesInDEV(unitOfWork, originalWorkInProgressCopy);

      if (enableProfilerTimer && unitOfWork.mode & ProfileMode) {
        // Reset the profiler timer.
        startProfilerTimer(unitOfWork);
      }

      // Run beginWork again.
      invokeGuardedCallback(
        null,
        originalBeginWork,
        null,
        current,
        unitOfWork,
        lanes,
      );

      if (hasCaughtError()) {
        const replayError = clearCaughtError();
        // `invokeGuardedCallback` sometimes sets an expando `_suppressLogging`.
        // Rethrow this error instead of the original one.
        throw replayError;
      } else {
        // This branch is reachable if the render phase is impure.
        throw originalError;
      }
    }
  };
} else {
  // 直接是originalBeginWork
  beginWork = originalBeginWork;
}

let didWarnAboutUpdateInRender = false;
let didWarnAboutUpdateInRenderForAnotherComponent;
if (__DEV__) {
  didWarnAboutUpdateInRenderForAnotherComponent = new Set();
}

function warnAboutRenderPhaseUpdatesInDEV(fiber) {
  if (__DEV__) {
    if (
      ReactCurrentDebugFiberIsRenderingInDEV &&
      (executionContext & RenderContext) !== NoContext &&
      !getIsUpdatingOpaqueValueInRenderPhaseInDEV()
    ) {
      switch (fiber.tag) {
        case FunctionComponent:
        case ForwardRef:
        case SimpleMemoComponent: {
          const renderingComponentName =
            (workInProgress && getComponentName(workInProgress.type)) ||
            'Unknown';
          // Dedupe by the rendering component because it's the one that needs to be fixed.
          const dedupeKey = renderingComponentName;
          if (!didWarnAboutUpdateInRenderForAnotherComponent.has(dedupeKey)) {
            didWarnAboutUpdateInRenderForAnotherComponent.add(dedupeKey);
            const setStateComponentName =
              getComponentName(fiber.type) || 'Unknown';
            console.error(
              'Cannot update a component (`%s`) while rendering a ' +
                'different component (`%s`). To locate the bad setState() call inside `%s`, ' +
                'follow the stack trace as described in https://reactjs.org/link/setstate-in-render',
              setStateComponentName,
              renderingComponentName,
              renderingComponentName,
            );
          }
          break;
        }
        case ClassComponent: {
          if (!didWarnAboutUpdateInRender) {
            console.error(
              'Cannot update during an existing state transition (such as ' +
                'within `render`). Render methods should be a pure ' +
                'function of props and state.',
            );
            didWarnAboutUpdateInRender = true;
          }
          break;
        }
      }
    }
  }
}

// a 'shared' variable that changes when act() opens/closes in tests.
export const IsThisRendererActing = {current: (false: boolean)};

export function warnIfNotScopedWithMatchingAct(fiber: Fiber): void {
  if (__DEV__) {
    if (
      warnsIfNotActing === true &&
      IsSomeRendererActing.current === true &&
      IsThisRendererActing.current !== true
    ) {
      const previousFiber = ReactCurrentFiberCurrent;
      try {
        setCurrentDebugFiberInDEV(fiber);
        console.error(
          "It looks like you're using the wrong act() around your test interactions.\n" +
            'Be sure to use the matching version of act() corresponding to your renderer:\n\n' +
            '// for react-dom:\n' +
            // Break up imports to avoid accidentally parsing them as dependencies.
            'import {act} fr' +
            "om 'react-dom/test-utils';\n" +
            '// ...\n' +
            'act(() => ...);\n\n' +
            '// for react-test-renderer:\n' +
            // Break up imports to avoid accidentally parsing them as dependencies.
            'import TestRenderer fr' +
            "om react-test-renderer';\n" +
            'const {act} = TestRenderer;\n' +
            '// ...\n' +
            'act(() => ...);',
        );
      } finally {
        if (previousFiber) {
          setCurrentDebugFiberInDEV(fiber);
        } else {
          resetCurrentDebugFiberInDEV();
        }
      }
    }
  }
}

export function warnIfNotCurrentlyActingEffectsInDEV(fiber: Fiber): void {
  if (__DEV__) {
    if (
      warnsIfNotActing === true &&
      (fiber.mode & StrictMode) !== NoMode &&
      IsSomeRendererActing.current === false &&
      IsThisRendererActing.current === false
    ) {
      console.error(
        'An update to %s ran an effect, but was not wrapped in act(...).\n\n' +
          'When testing, code that causes React state updates should be ' +
          'wrapped into act(...):\n\n' +
          'act(() => {\n' +
          '  /* fire events that update state */\n' +
          '});\n' +
          '/* assert on the output */\n\n' +
          "This ensures that you're testing the behavior the user would see " +
          'in the browser.' +
          ' Learn more at https://reactjs.org/link/wrap-tests-with-act',
        getComponentName(fiber.type),
      );
    }
  }
}

function warnIfNotCurrentlyActingUpdatesInDEV(fiber: Fiber): void {
  if (__DEV__) {
    if (
      warnsIfNotActing === true &&
      executionContext === NoContext &&
      IsSomeRendererActing.current === false &&
      IsThisRendererActing.current === false
    ) {
      const previousFiber = ReactCurrentFiberCurrent;
      try {
        setCurrentDebugFiberInDEV(fiber);
        console.error(
          'An update to %s inside a test was not wrapped in act(...).\n\n' +
            'When testing, code that causes React state updates should be ' +
            'wrapped into act(...):\n\n' +
            'act(() => {\n' +
            '  /* fire events that update state */\n' +
            '});\n' +
            '/* assert on the output */\n\n' +
            "This ensures that you're testing the behavior the user would see " +
            'in the browser.' +
            ' Learn more at https://reactjs.org/link/wrap-tests-with-act',
          getComponentName(fiber.type),
        );
      } finally {
        if (previousFiber) {
          setCurrentDebugFiberInDEV(fiber);
        } else {
          resetCurrentDebugFiberInDEV();
        }
      }
    }
  }
}

export const warnIfNotCurrentlyActingUpdatesInDev = warnIfNotCurrentlyActingUpdatesInDEV;

// In tests, we want to enforce a mocked scheduler.
let didWarnAboutUnmockedScheduler = false;
// TODO Before we release concurrent mode, revisit this and decide whether a mocked
// scheduler is the actual recommendation. The alternative could be a testing build,
// a new lib, or whatever; we dunno just yet. This message is for early adopters
// to get their tests right.

export function warnIfUnmockedScheduler(fiber: Fiber) {
  if (__DEV__) {
    if (
      didWarnAboutUnmockedScheduler === false &&
      Scheduler.unstable_flushAllWithoutAsserting === undefined
    ) {
      if (fiber.mode & BlockingMode || fiber.mode & ConcurrentMode) {
        didWarnAboutUnmockedScheduler = true;
        console.error(
          'In Concurrent or Sync modes, the "scheduler" module needs to be mocked ' +
            'to guarantee consistent behaviour across tests and browsers. ' +
            'For example, with jest: \n' +
            // Break up requires to avoid accidentally parsing them as dependencies.
            "jest.mock('scheduler', () => require" +
            "('scheduler/unstable_mock'));\n\n" +
            'For more info, visit https://reactjs.org/link/mock-scheduler',
        );
      } else if (warnAboutUnmockedScheduler === true) {
        didWarnAboutUnmockedScheduler = true;
        console.error(
          'Starting from React v18, the "scheduler" module will need to be mocked ' +
            'to guarantee consistent behaviour across tests and browsers. ' +
            'For example, with jest: \n' +
            // Break up requires to avoid accidentally parsing them as dependencies.
            "jest.mock('scheduler', () => require" +
            "('scheduler/unstable_mock'));\n\n" +
            'For more info, visit https://reactjs.org/link/mock-scheduler',
        );
      }
    }
  }
}

function computeThreadID(root: FiberRoot, lane: Lane | Lanes) {
  // Interaction threads are unique per root and expiration time.
  // NOTE: Intentionally unsound cast. All that matters is that it's a number
  // and it represents a batch of work. Could make a helper function instead,
  // but meh this is fine for now.
  return (lane: any) * 1000 + root.interactionThreadID;
}

export function markSpawnedWork(lane: Lane | Lanes) {
  if (!enableSchedulerTracing) {
    return;
  }
  if (spawnedWorkDuringRender === null) {
    spawnedWorkDuringRender = [lane];
  } else {
    spawnedWorkDuringRender.push(lane);
  }
}

function scheduleInteractions(
  root: FiberRoot,
  lane: Lane | Lanes,
  interactions: Set<Interaction>,
) {
  if (!enableSchedulerTracing) {
    return;
  }

  if (interactions.size > 0) {
    const pendingInteractionMap = root.pendingInteractionMap;
    const pendingInteractions = pendingInteractionMap.get(lane);
    if (pendingInteractions != null) {
      interactions.forEach(interaction => {
        if (!pendingInteractions.has(interaction)) {
          // Update the pending async work count for previously unscheduled interaction.
          interaction.__count++;
        }

        pendingInteractions.add(interaction);
      });
    } else {
      pendingInteractionMap.set(lane, new Set(interactions));

      // Update the pending async work count for the current interactions.
      interactions.forEach(interaction => {
        interaction.__count++;
      });
    }

    const subscriber = __subscriberRef.current;
    if (subscriber !== null) {
      const threadID = computeThreadID(root, lane);
      subscriber.onWorkScheduled(interactions, threadID);
    }
  }
}

/**
 * enableSchedulerTracing 模式，没启用就退出
 */
function schedulePendingInteractions(root: FiberRoot, lane: Lane | Lanes) {
  // This is called when work is scheduled on a root.
  // It associates the current interactions with the newly-scheduled expiration.
  // They will be restored when that expiration is later committed.
  if (!enableSchedulerTracing) {
    return;
  }

  scheduleInteractions(root, lane, __interactionsRef.current);
}

/**
 * 属于调度追踪的功能（开始处理root.pendingInteractionMap属性值(待处理的交互)）
 * 
 * 1. 更新root.memoizedInteractions 属性
 * 2. 事件发布订阅通知订阅交互的订阅者
 * 
 * @param {*} root fiberRoot
 * @param {*} lanes 当前批次的lanes 
 * 
 */
function startWorkOnPendingInteractions(root: FiberRoot, lanes: Lanes) {
  // This is called when new work is started on a root.
  // 检查是否启用调度追踪
  if (!enableSchedulerTracing) {
    return;
  }

  // Determine which interactions this batch of work currently includes, So that
  // we can accurately attribute time spent working on it, And so that cascading
  // work triggered during the render phase will be associated with it.
  // 初始化交互集合:存储当前批次工作的交互
  const interactions: Set<Interaction> = new Set();
  // root.pendingInteractionMap 是一个映射，键是车道（lane），值是一个交互集合（Set<Interaction>）。
  // forEach 方法遍历这个映射的每一项。
  // includesSomeLane(lanes, scheduledLane) 检查当前批次的工作车道（lanes）是否包含某个特定的车道（scheduledLane）。
  // 如果包含，则将该车道对应的交互添加到 interactions 集合中
  root.pendingInteractionMap.forEach((scheduledInteractions, scheduledLane) => {
    if (includesSomeLane(lanes, scheduledLane)) {
      scheduledInteractions.forEach(interaction =>
        interactions.add(interaction),
      );
    }
  });

  // 更新到root.memoizedInteractions 值，作为最终待处理的交互
  root.memoizedInteractions = interactions;

  // 用于开发者的性能订阅调度追踪功能：确定好待处理的交互后，进行事件订阅通知
  if (interactions.size > 0) {
    // 从 __subscriberRef 中获取当前的订阅者。__subscriberRef 是一个 React Ref，用于存储订阅者的引用
    const subscriber = __subscriberRef.current;
    if (subscriber !== null) {
      // 计算当前渲染任务的线程ID。线程ID是一个唯一的标识符，用于区分不同的渲染任务
      const threadID = computeThreadID(root, lanes);
      // 通知订阅者新的渲染任务已经开始
      try {
        subscriber.onWorkStarted(interactions, threadID);
      } catch (error) {
        // If the subscriber throws, rethrow it in a separate task
        scheduleCallback(ImmediateSchedulerPriority, () => {
          throw error;
        });
      }
    }
  }
}

function finishPendingInteractions(root, committedLanes) {
  if (!enableSchedulerTracing) {
    return;
  }

  const remainingLanesAfterCommit = root.pendingLanes;

  let subscriber;

  try {
    subscriber = __subscriberRef.current;
    if (subscriber !== null && root.memoizedInteractions.size > 0) {
      // FIXME: More than one lane can finish in a single commit.
      const threadID = computeThreadID(root, committedLanes);
      subscriber.onWorkStopped(root.memoizedInteractions, threadID);
    }
  } catch (error) {
    // If the subscriber throws, rethrow it in a separate task
    scheduleCallback(ImmediateSchedulerPriority, () => {
      throw error;
    });
  } finally {
    // Clear completed interactions from the pending Map.
    // Unless the render was suspended or cascading work was scheduled,
    // In which case– leave pending interactions until the subsequent render.
    const pendingInteractionMap = root.pendingInteractionMap;
    pendingInteractionMap.forEach((scheduledInteractions, lane) => {
      // Only decrement the pending interaction count if we're done.
      // If there's still work at the current priority,
      // That indicates that we are waiting for suspense data.
      if (!includesSomeLane(remainingLanesAfterCommit, lane)) {
        pendingInteractionMap.delete(lane);

        scheduledInteractions.forEach(interaction => {
          interaction.__count--;

          if (subscriber !== null && interaction.__count === 0) {
            try {
              subscriber.onInteractionScheduledWorkCompleted(interaction);
            } catch (error) {
              // If the subscriber throws, rethrow it in a separate task
              scheduleCallback(ImmediateSchedulerPriority, () => {
                throw error;
              });
            }
          }
        });
      }
    });
  }
}

// `act` testing API
//
// TODO: This is mostly a copy-paste from the legacy `act`, which does not have
// access to the same internals that we do here. Some trade offs in the
// implementation no longer make sense.

let isFlushingAct = false;
let isInsideThisAct = false;

function shouldForceFlushFallbacksInDEV() {
  // Never force flush in production. This function should get stripped out.
  return __DEV__ && actingUpdatesScopeDepth > 0;
}

const flushMockScheduler = Scheduler.unstable_flushAllWithoutAsserting;
const isSchedulerMocked = typeof flushMockScheduler === 'function';

// Returns whether additional work was scheduled. Caller should keep flushing
// until there's no work left.
function flushActWork(): boolean {
  if (flushMockScheduler !== undefined) {
    const prevIsFlushing = isFlushingAct;
    isFlushingAct = true;
    try {
      return flushMockScheduler();
    } finally {
      isFlushingAct = prevIsFlushing;
    }
  } else {
    // No mock scheduler available. However, the only type of pending work is
    // passive effects, which we control. So we can flush that.
    const prevIsFlushing = isFlushingAct;
    isFlushingAct = true;
    try {
      let didFlushWork = false;
      while (flushPassiveEffects()) {
        didFlushWork = true;
      }
      return didFlushWork;
    } finally {
      isFlushingAct = prevIsFlushing;
    }
  }
}

function flushWorkAndMicroTasks(onDone: (err: ?Error) => void) {
  try {
    flushActWork();
    enqueueTask(() => {
      if (flushActWork()) {
        flushWorkAndMicroTasks(onDone);
      } else {
        onDone();
      }
    });
  } catch (err) {
    onDone(err);
  }
}

// we track the 'depth' of the act() calls with this counter,
// so we can tell if any async act() calls try to run in parallel.

let actingUpdatesScopeDepth = 0;
let didWarnAboutUsingActInProd = false;

export function act(callback: () => Thenable<mixed>): Thenable<void> {
  if (!__DEV__) {
    if (didWarnAboutUsingActInProd === false) {
      didWarnAboutUsingActInProd = true;
      // eslint-disable-next-line react-internal/no-production-logging
      console.error(
        'act(...) is not supported in production builds of React, and might not behave as expected.',
      );
    }
  }

  const previousActingUpdatesScopeDepth = actingUpdatesScopeDepth;
  actingUpdatesScopeDepth++;

  const previousIsSomeRendererActing = IsSomeRendererActing.current;
  const previousIsThisRendererActing = IsThisRendererActing.current;
  const previousIsInsideThisAct = isInsideThisAct;
  IsSomeRendererActing.current = true;
  IsThisRendererActing.current = true;
  isInsideThisAct = true;

  function onDone() {
    actingUpdatesScopeDepth--;
    IsSomeRendererActing.current = previousIsSomeRendererActing;
    IsThisRendererActing.current = previousIsThisRendererActing;
    isInsideThisAct = previousIsInsideThisAct;
    if (__DEV__) {
      if (actingUpdatesScopeDepth > previousActingUpdatesScopeDepth) {
        // if it's _less than_ previousActingUpdatesScopeDepth, then we can assume the 'other' one has warned
        console.error(
          'You seem to have overlapping act() calls, this is not supported. ' +
            'Be sure to await previous act() calls before making a new one. ',
        );
      }
    }
  }

  let result;
  try {
    result = batchedUpdates(callback);
  } catch (error) {
    // on sync errors, we still want to 'cleanup' and decrement actingUpdatesScopeDepth
    onDone();
    throw error;
  }

  if (
    result !== null &&
    typeof result === 'object' &&
    typeof result.then === 'function'
  ) {
    // setup a boolean that gets set to true only
    // once this act() call is await-ed
    let called = false;
    if (__DEV__) {
      if (typeof Promise !== 'undefined') {
        //eslint-disable-next-line no-undef
        Promise.resolve()
          .then(() => {})
          .then(() => {
            if (called === false) {
              console.error(
                'You called act(async () => ...) without await. ' +
                  'This could lead to unexpected testing behaviour, interleaving multiple act ' +
                  'calls and mixing their scopes. You should - await act(async () => ...);',
              );
            }
          });
      }
    }

    // in the async case, the returned thenable runs the callback, flushes
    // effects and  microtasks in a loop until flushPassiveEffects() === false,
    // and cleans up
    return {
      then(resolve, reject) {
        called = true;
        result.then(
          () => {
            if (
              actingUpdatesScopeDepth > 1 ||
              (isSchedulerMocked === true &&
                previousIsSomeRendererActing === true)
            ) {
              onDone();
              resolve();
              return;
            }
            // we're about to exit the act() scope,
            // now's the time to flush tasks/effects
            flushWorkAndMicroTasks((err: ?Error) => {
              onDone();
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          },
          err => {
            onDone();
            reject(err);
          },
        );
      },
    };
  } else {
    if (__DEV__) {
      if (result !== undefined) {
        console.error(
          'The callback passed to act(...) function ' +
            'must return undefined, or a Promise. You returned %s',
          result,
        );
      }
    }

    // flush effects until none remain, and cleanup
    try {
      if (
        actingUpdatesScopeDepth === 1 &&
        (isSchedulerMocked === false || previousIsSomeRendererActing === false)
      ) {
        // we're about to exit the act() scope,
        // now's the time to flush effects
        flushActWork();
      }
      onDone();
    } catch (err) {
      onDone();
      throw err;
    }

    // in the sync case, the returned thenable only warns *if* await-ed
    return {
      then(resolve) {
        if (__DEV__) {
          console.error(
            'Do not await the result of calling act(...) with sync logic, it is not a Promise.',
          );
        }
        resolve();
      },
    };
  }
}

function detachFiberAfterEffects(fiber: Fiber): void {
  fiber.sibling = null;
  fiber.stateNode = null;
}
