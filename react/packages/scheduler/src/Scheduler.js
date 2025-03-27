/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/* eslint-disable no-var */

import {
  enableSchedulerDebugging,
  enableProfiling,
} from './SchedulerFeatureFlags';
import {
  requestHostCallback,
  requestHostTimeout,
  cancelHostTimeout,
  shouldYieldToHost,
  getCurrentTime,
  forceFrameRate,
  requestPaint,
} from './SchedulerHostConfig';
import {push, pop, peek} from './SchedulerMinHeap';

// TODO: Use symbols?
import {
  ImmediatePriority,
  UserBlockingPriority,
  NormalPriority,
  LowPriority,
  IdlePriority,
} from './SchedulerPriorities';
import {
  sharedProfilingBuffer,
  markTaskRun,
  markTaskYield,
  markTaskCompleted,
  markTaskCanceled,
  markTaskErrored,
  markSchedulerSuspended,
  markSchedulerUnsuspended,
  markTaskStart,
  stopLoggingProfilingEvents,
  startLoggingProfilingEvents,
} from './SchedulerProfiling';

// Max 31 bit integer. The max integer size in V8 for 32-bit systems.
// Math.pow(2, 30) - 1
// 0b111111111111111111111111111111
var maxSigned31BitInt = 1073741823;

// Times out immediately
var IMMEDIATE_PRIORITY_TIMEOUT = -1;
// Eventually times out
var USER_BLOCKING_PRIORITY_TIMEOUT = 250;
var NORMAL_PRIORITY_TIMEOUT = 5000;
var LOW_PRIORITY_TIMEOUT = 10000;
// Never times out
var IDLE_PRIORITY_TIMEOUT = maxSigned31BitInt;

// Tasks are stored on a min heap
var taskQueue = [];
var timerQueue = [];

// Incrementing id counter. Used to maintain insertion order.
var taskIdCounter = 1;

// Pausing the scheduler is useful for debugging.
var isSchedulerPaused = false;

var currentTask = null;
var currentPriorityLevel = NormalPriority;

// This is set while performing work, to prevent re-entrancy.
var isPerformingWork = false;

var isHostCallbackScheduled = false;
var isHostTimeoutScheduled = false;

/**
 * 检查timerQueue最小堆队列，将到期的计时器从 timerQueue 移动到 taskQueue 中
 */
function advanceTimers(currentTime) {
  // Check for tasks that are no longer delayed and add them to the queue.
  let timer = peek(timerQueue);
  while (timer !== null) {
    if (timer.callback === null) {
      // Timer was cancelled.
      pop(timerQueue);
    } else if (timer.startTime <= currentTime) {
      // Timer fired. Transfer to the task queue.
      pop(timerQueue);
      timer.sortIndex = timer.expirationTime;
      // push进taskQueue最小堆队列
      push(taskQueue, timer);
      if (enableProfiling) {
        markTaskStart(timer, currentTime);
        timer.isQueued = true;
      }
    } else {
      // Remaining timers are pending.
      return;
    }
    timer = peek(timerQueue);
  }
}

function handleTimeout(currentTime) {
  // isHostTimeoutScheduled 设置为 false，表示当前没有定时器被安排
  isHostTimeoutScheduled = false;
  // 检查所有计时器，将到期的计时器从 timerQueue 移动到 taskQueue 中
  advanceTimers(currentTime);

  // 检查主机回调是否已安排
  if (!isHostCallbackScheduled) {
    // 如果任务队列 taskQueue 不为空，表示有任务需要立即执行
    if (peek(taskQueue) !== null) {
      isHostCallbackScheduled = true;
      // 调用 requestHostCallback(flushWork) 请求主机回调，flushWork 函数将处理任务队列中的任务。
      requestHostCallback(flushWork);
    } else {
      // 检查定时器队列
      const firstTimer = peek(timerQueue);
      if (firstTimer !== null) {
        // 请求主机延时器
        requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
      }
    }
  }
}

/**
 * 执行Work：执行taskQueue中的立即执行任务
 * @param {*} hasTimeRemaining 
 * @param {*} initialTime 
 * @returns 
 */
function flushWork(hasTimeRemaining, initialTime) {
  if (enableProfiling) {
    markSchedulerUnsuspended(initialTime);
  }

  // We'll need a host callback the next time work is scheduled.
  isHostCallbackScheduled = false;
  if (isHostTimeoutScheduled) {
    // We scheduled a timeout but it's no longer needed. Cancel it.
    isHostTimeoutScheduled = false;
    cancelHostTimeout();
  }

  isPerformingWork = true;
  const previousPriorityLevel = currentPriorityLevel;
  try {
    if (enableProfiling) {
      try {
        return workLoop(hasTimeRemaining, initialTime);
      } catch (error) {
        if (currentTask !== null) {
          const currentTime = getCurrentTime();
          markTaskErrored(currentTask, currentTime);
          currentTask.isQueued = false;
        }
        throw error;
      }
    } else {
      // No catch in prod code path.
      return workLoop(hasTimeRemaining, initialTime);
    }
  } finally {
    currentTask = null;
    currentPriorityLevel = previousPriorityLevel;
    isPerformingWork = false;
    if (enableProfiling) {
      const currentTime = getCurrentTime();
      markSchedulerSuspended(currentTime);
    }
  }
}

function workLoop(hasTimeRemaining, initialTime) {
  let currentTime = initialTime;
  advanceTimers(currentTime);
  currentTask = peek(taskQueue);
  while (
    currentTask !== null &&
    !(enableSchedulerDebugging && isSchedulerPaused)
  ) {
    if (
      currentTask.expirationTime > currentTime &&
      (!hasTimeRemaining || shouldYieldToHost())
    ) {
      // This currentTask hasn't expired, and we've reached the deadline.
      break;
    }
    const callback = currentTask.callback;
    if (typeof callback === 'function') {
      currentTask.callback = null;
      currentPriorityLevel = currentTask.priorityLevel;
      const didUserCallbackTimeout = currentTask.expirationTime <= currentTime;
      markTaskRun(currentTask, currentTime);
      const continuationCallback = callback(didUserCallbackTimeout);
      currentTime = getCurrentTime();
      if (typeof continuationCallback === 'function') {
        currentTask.callback = continuationCallback;
        markTaskYield(currentTask, currentTime);
      } else {
        if (enableProfiling) {
          markTaskCompleted(currentTask, currentTime);
          currentTask.isQueued = false;
        }
        if (currentTask === peek(taskQueue)) {
          pop(taskQueue);
        }
      }
      advanceTimers(currentTime);
    } else {
      pop(taskQueue);
    }
    currentTask = peek(taskQueue);
  }
  // Return whether there's additional work
  if (currentTask !== null) {
    return true;
  } else {
    const firstTimer = peek(timerQueue);
    if (firstTimer !== null) {
      requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
    }
    return false;
  }
}

function unstable_runWithPriority(priorityLevel, eventHandler) {
  switch (priorityLevel) {
    case ImmediatePriority:
    case UserBlockingPriority:
    case NormalPriority:
    case LowPriority:
    case IdlePriority:
      break;
    default:
      priorityLevel = NormalPriority;
  }

  var previousPriorityLevel = currentPriorityLevel;
  currentPriorityLevel = priorityLevel;

  try {
    return eventHandler();
  } finally {
    currentPriorityLevel = previousPriorityLevel;
  }
}

function unstable_next(eventHandler) {
  var priorityLevel;
  switch (currentPriorityLevel) {
    case ImmediatePriority:
    case UserBlockingPriority:
    case NormalPriority:
      // Shift down to normal priority
      priorityLevel = NormalPriority;
      break;
    default:
      // Anything lower than normal priority should remain at the current level.
      priorityLevel = currentPriorityLevel;
      break;
  }

  var previousPriorityLevel = currentPriorityLevel;
  currentPriorityLevel = priorityLevel;

  try {
    return eventHandler();
  } finally {
    currentPriorityLevel = previousPriorityLevel;
  }
}

function unstable_wrapCallback(callback) {
  var parentPriorityLevel = currentPriorityLevel;
  return function() {
    // This is a fork of runWithPriority, inlined for performance.
    var previousPriorityLevel = currentPriorityLevel;
    currentPriorityLevel = parentPriorityLevel;

    try {
      return callback.apply(this, arguments);
    } finally {
      currentPriorityLevel = previousPriorityLevel;
    }
  };
}

/**
 * 用于根据给定的优先级和选项调度回调任务。
 * 这个函数会将回调任务添加到任务队列中，并根据系统调度机制任务的优先级和开始时间来决定何时执行任务
 * 执行时：通过requestHostCallback(flushWork) 执行传入的callback回调
 * @param {*} priorityLevel 
 * @param {*} callback 调度的callback
 * @param {*} options 
 * @returns 
 */
function unstable_scheduleCallback(priorityLevel, callback, options) {
  // 获取当前时间戳
  var currentTime = getCurrentTime();

  // 1. 计算任务的开始时间
  var startTime;
  if (typeof options === 'object' && options !== null) {
    var delay = options.delay;
    if (typeof delay === 'number' && delay > 0) {
      // 如果提供了延迟时间且大于0，任务的开始时间为当前时间加上延迟时间
      startTime = currentTime + delay;
    } else {
      // 如果没有提供延迟时间或者延迟时间小于等于0，任务的开始时间就是当前时间
      startTime = currentTime;
    }
  } else {
    // 如果没有提供选项，任务的开始时间就是当前时间
    startTime = currentTime;
  }

  // 2. 根据任务的6大优先级确定任务的过期时间
  var timeout; // 毫秒延时时间
  switch (priorityLevel) {
    case ImmediatePriority:
      timeout = IMMEDIATE_PRIORITY_TIMEOUT; // 立即执行的优先级
      break;
    case UserBlockingPriority:
      timeout = USER_BLOCKING_PRIORITY_TIMEOUT; // 用户阻塞优先级
      break;
    case IdlePriority:
      timeout = IDLE_PRIORITY_TIMEOUT; // 空闲优先级
      break;
    case LowPriority:
      timeout = LOW_PRIORITY_TIMEOUT; // 低优先级
      break;
    case NormalPriority:
    default:
      timeout = NORMAL_PRIORITY_TIMEOUT; // 默认优先级
      break;
  }

  // 计算任务的到期时间
  var expirationTime = startTime + timeout;

  // 3. 创建调度任务
  var newTask = {
    id: taskIdCounter++, // 任务的唯一ID
    callback, // 任务的回调函数
    priorityLevel, // 任务的优先级
    startTime, // 任务的开始时间
    expirationTime, // 任务的到期时间
    sortIndex: -1, // 任务的排序索引，初始化为-1后面为startTime ===> 用于最小堆timerQueue的排序比较下标
  };

  // 如果启用了性能分析，设置任务的排队状态
  if (enableProfiling) {
    newTask.isQueued = false;
  }

  // 处理延迟任务
  if (startTime > currentTime) {
    // 这是一个延迟任务
    newTask.sortIndex = startTime; // 设置任务的排序索引为开始时间
    // 推入最小堆数组结构：比较sortIndex为堆的顺序
    push(timerQueue, newTask); // 将任务推入定时器队列

    // 检查任务队列是否为空且当前任务是最早到期的延迟任务
    if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
      if (isHostTimeoutScheduled) {
        // 如果已经有一个定时器被安排，取消它
        cancelHostTimeout();
      } else {
        isHostTimeoutScheduled = true; // 标记定时器已安排
      }
      // 安排定时器：就是用setTimeout延时startTime - currentTime执行
      // 执行timerQueue中到期的任务---统一放进taskQueue中执行
      requestHostTimeout(handleTimeout, startTime - currentTime);
    }
  } else {
    // 这是一个立即执行的任务。直接push进taskQueue队列中安排执行
    newTask.sortIndex = expirationTime; // 设置任务的排序索引为到期时间
    // 4. 推进任务队列 
    push(taskQueue, newTask); // 将任务推入任务队列

    // 如果启用了性能分析，标记任务开始时间和排队状态
    if (enableProfiling) {
      markTaskStart(newTask, currentTime);
      newTask.isQueued = true;
    }

    // 5. 请求调度，消费任务
    if (!isHostCallbackScheduled && !isPerformingWork) {
      isHostCallbackScheduled = true; // 标记调度任务已安排
      requestHostCallback(flushWork); // 请求调度任务队列
    }
  }

  // 返回新创建的任务对象
  return newTask;
}

function unstable_pauseExecution() {
  isSchedulerPaused = true;
}

function unstable_continueExecution() {
  isSchedulerPaused = false;
  if (!isHostCallbackScheduled && !isPerformingWork) {
    isHostCallbackScheduled = true;
    requestHostCallback(flushWork);
  }
}

function unstable_getFirstCallbackNode() {
  return peek(taskQueue);
}

function unstable_cancelCallback(task) {
  if (enableProfiling) {
    if (task.isQueued) {
      const currentTime = getCurrentTime();
      markTaskCanceled(task, currentTime);
      task.isQueued = false;
    }
  }

  // Null out the callback to indicate the task has been canceled. (Can't
  // remove from the queue because you can't remove arbitrary nodes from an
  // array based heap, only the first one.)
  task.callback = null;
}

function unstable_getCurrentPriorityLevel() {
  return currentPriorityLevel;
}

const unstable_requestPaint = requestPaint;

export {
  ImmediatePriority as unstable_ImmediatePriority,
  UserBlockingPriority as unstable_UserBlockingPriority,
  NormalPriority as unstable_NormalPriority,
  IdlePriority as unstable_IdlePriority,
  LowPriority as unstable_LowPriority,
  unstable_runWithPriority,
  unstable_next,
  unstable_scheduleCallback,
  unstable_cancelCallback,
  unstable_wrapCallback,
  unstable_getCurrentPriorityLevel,
  shouldYieldToHost as unstable_shouldYield,
  unstable_requestPaint,
  unstable_continueExecution,
  unstable_pauseExecution,
  unstable_getFirstCallbackNode,
  getCurrentTime as unstable_now,
  forceFrameRate as unstable_forceFrameRate,
};

export const unstable_Profiling = enableProfiling
  ? {
      startLoggingProfilingEvents,
      stopLoggingProfilingEvents,
      sharedProfilingBuffer,
    }
  : null;
