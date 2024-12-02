/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * 
 * React 调度器（Scheduler）的核心功能
 * 
 * 用于管理和调度异步任务，确保在主线程上有足够的时间来处理高优先级的任务，如用户输入和界面更新
 */

import { enableIsInputPending } from '../SchedulerFeatureFlags';

// 导出的函数，用于调度任务和管理时间
export let requestHostCallback; // 请求及时回调: port.postMessage
export let cancelHostCallback; // 取消及时回调: scheduledHostCallback = null
export let requestHostTimeout; // 请求延时回调: setTimeout
export let cancelHostTimeout; // 取消延时回调: cancelTimeout
export let shouldYieldToHost; // 是否让出主线程(currentTime >= deadline && needsPaint): 让浏览器能够执行更高优先级的任务(如ui绘制, 用户输入等)
export let requestPaint; // 请求绘制: 设置 needsPaint = true
export let getCurrentTime; // 获取当前时间
export let forceFrameRate; // 强制设置 yieldInterval (让出主线程的周期). 这个函数虽然存在, 但是从源码来看, 几乎没有用到

// 检查浏览器是否支持 performance.now()
const hasPerformanceNow =
  typeof performance === 'object' && typeof performance.now === 'function';

if (hasPerformanceNow) {
  // 使用本地引用的 performance 对象来获取当前时间
  const localPerformance = performance;
  getCurrentTime = () => localPerformance.now();
} else {
  // 如果没有 performance.now()，使用 Date.now() 作为替代
  const localDate = Date;
  const initialTime = localDate.now();
  getCurrentTime = () => localDate.now() - initialTime;
}

if (
  // 如果在非 DOM 环境中（如 Node.js），或者不支持 MessageChannel，
  // 则回退到使用 setTimeout 的简单实现
  typeof window === 'undefined' ||
  typeof MessageChannel !== 'function'
) {
  // 如果意外在非浏览器环境中导入此模块，使用简单的 setTimeout 实现
  let _callback = null;
  let _timeoutID = null;
  const _flushCallback = function() {
    if (_callback !== null) {
      try {
        const currentTime = getCurrentTime();
        const hasRemainingTime = true;
        _callback(hasRemainingTime, currentTime);
        _callback = null;
      } catch (e) {
        setTimeout(_flushCallback, 0);
        throw e;
      }
    }
  };
  requestHostCallback = function(cb) {
    if (_callback !== null) {
      // 保护防止重入
      setTimeout(requestHostCallback, 0, cb);
    } else {
      _callback = cb;
      setTimeout(_flushCallback, 0);
    }
  };
  cancelHostCallback = function() {
    _callback = null;
  };
  requestHostTimeout = function(cb, ms) {
    _timeoutID = setTimeout(cb, ms);
  };
  cancelHostTimeout = function() {
    clearTimeout(_timeoutID);
  };
  shouldYieldToHost = function() {
    return false;
  };
  requestPaint = forceFrameRate = function() {};
} else {
  // 捕获对原生 API 的本地引用，以防被 polyfill 覆盖
  const setTimeout = window.setTimeout;
  const clearTimeout = window.clearTimeout;

  if (typeof console !== 'undefined') {
    // 检查浏览器是否支持 requestAnimationFrame 和 cancelAnimationFrame
    const requestAnimationFrame = window.requestAnimationFrame;
    const cancelAnimationFrame = window.cancelAnimationFrame;

    if (typeof requestAnimationFrame !== 'function') {
      // 使用 console['error'] 以避开 Babel 和 ESLint
      console['error'](
        "This browser doesn't support requestAnimationFrame. " +
          'Make sure that you load a ' +
          'polyfill in older browsers. https://reactjs.org/link/react-polyfills',
      );
    }
    if (typeof cancelAnimationFrame !== 'function') {
      // 使用 console['error'] 以避开 Babel 和 ESLint
      console['error'](
        "This browser doesn't support cancelAnimationFrame. " +
          'Make sure that you load a ' +
          'polyfill in older browsers. https://reactjs.org/link/react-polyfills',
      );
    }
  }

  let isMessageLoopRunning = false;
  let scheduledHostCallback = null;
  let taskTimeoutID = -1;

  // 调度器定期让出主线程，以便浏览器执行其他高优先级任务，如用户输入和绘制
  let yieldInterval = 5;
  let deadline = 0;

  // 最大让出间隔时间
  const maxYieldInterval = 300;
  let needsPaint = false;

  if (
    enableIsInputPending &&
    navigator !== undefined &&
    navigator.scheduling !== undefined &&
    navigator.scheduling.isInputPending !== undefined
  ) {
    const scheduling = navigator.scheduling;
    shouldYieldToHost = function() {
      const currentTime = getCurrentTime();
      if (currentTime >= deadline) {
        // 如果当前时间超过了截止时间，检查是否有待处理的绘制或输入
        if (needsPaint || scheduling.isInputPending()) {
          // 有待处理的绘制或输入
          return true;
        }
        // 没有待处理的输入，只有在最大让出间隔时间到达时才让出
        return currentTime >= maxYieldInterval;
      } else {
        // 当前帧内还有剩余时间
        return false;
      }
    };

    requestPaint = function() {
      needsPaint = true;
    };
  } else {
    // 如果不支持 isInputPending，始终在每帧结束时让出
    shouldYieldToHost = function() {
      return getCurrentTime() >= deadline;
    };

    // 由于总是每帧让出，requestPaint 没有实际效果
    requestPaint = function() {};
  }

  forceFrameRate = function(fps) {
    if (fps < 0 || fps > 125) {
      // 使用 console['error'] 以避开 Babel 和 ESLint
      console['error'](
        'forceFrameRate takes a positive int between 0 and 125, ' +
          'forcing frame rates higher than 125 fps is not supported',
      );
      return;
    }
    if (fps > 0) {
      yieldInterval = Math.floor(1000 / fps);
    } else {
      // 重置帧率
      yieldInterval = 5;
    }
  };

  const performWorkUntilDeadline = () => {
    if (scheduledHostCallback !== null) {
      const currentTime = getCurrentTime();
      // 每隔 yieldInterval 毫秒让出一次，无论当前处于垂直同步周期的哪个位置
      deadline = currentTime + yieldInterval;
      const hasTimeRemaining = true;
      try {
        const hasMoreWork = scheduledHostCallback(
          hasTimeRemaining,
          currentTime,
        );
        if (!hasMoreWork) {
          isMessageLoopRunning = false;
          scheduledHostCallback = null;
        } else {
          // 如果还有更多工作，安排下一个消息事件
          port.postMessage(null);
        }
      } catch (error) {
        // 如果调度任务抛出异常，退出当前浏览器任务以便捕获异常
        port.postMessage(null);
        throw error;
      }
    } else {
      isMessageLoopRunning = false;
    }
    // 让出给浏览器绘制的机会
    needsPaint = false;
  };

  const channel = new MessageChannel();
  const port = channel.port2;
  channel.port1.onmessage = performWorkUntilDeadline;

  requestHostCallback = function(callback) {
    scheduledHostCallback = callback;
    if (!isMessageLoopRunning) {
      isMessageLoopRunning = true;
      port.postMessage(null);
    }
  };

  cancelHostCallback = function() {
    scheduledHostCallback = null;
  };

  requestHostTimeout = function(callback, ms) {
    taskTimeoutID = setTimeout(() => {
      callback(getCurrentTime());
    }, ms);
  };

  cancelHostTimeout = function() {
    clearTimeout(taskTimeoutID);
    taskTimeoutID = -1;
  };
}
