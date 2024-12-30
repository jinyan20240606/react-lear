/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactContext} from 'shared/ReactTypes';
import type {Fiber, ContextDependency} from './ReactInternalTypes';
import type {StackCursor} from './ReactFiberStack.old';
import type {Lanes} from './ReactFiberLane';

import {isPrimaryRenderer} from './ReactFiberHostConfig';
import {createCursor, push, pop} from './ReactFiberStack.old';
import {MAX_SIGNED_31_BIT_INT} from './MaxInts';
import {
  ContextProvider,
  ClassComponent,
  DehydratedFragment,
} from './ReactWorkTags';
import {
  NoLanes,
  NoTimestamp,
  isSubsetOfLanes,
  includesSomeLane,
  mergeLanes,
  pickArbitraryLane,
} from './ReactFiberLane';

import invariant from 'shared/invariant';
import is from 'shared/objectIs';
import {createUpdate, enqueueUpdate, ForceUpdate} from './ReactUpdateQueue.old';
import {markWorkInProgressReceivedUpdate} from './ReactFiberBeginWork.old';
import {enableSuspenseServerRenderer} from 'shared/ReactFeatureFlags';

const valueCursor: StackCursor<mixed> = createCursor(null);

let rendererSigil;
if (__DEV__) {
  // Use this to detect multiple renderers using the same context
  rendererSigil = {};
}

let currentlyRenderingFiber: Fiber | null = null;
let lastContextDependency: ContextDependency<mixed> | null = null;
let lastContextWithAllBitsObserved: ReactContext<any> | null = null;

let isDisallowedContextReadInDEV: boolean = false;

export function resetContextDependencies(): void {
  // This is called right before React yields execution, to ensure `readContext`
  // cannot be called outside the render phase.
  currentlyRenderingFiber = null;
  lastContextDependency = null;
  lastContextWithAllBitsObserved = null;
  if (__DEV__) {
    isDisallowedContextReadInDEV = false;
  }
}

export function enterDisallowedContextReadInDEV(): void {
  if (__DEV__) {
    isDisallowedContextReadInDEV = true;
  }
}

export function exitDisallowedContextReadInDEV(): void {
  if (__DEV__) {
    isDisallowedContextReadInDEV = false;
  }
}

/**
 * 主要是更新Provider组件中对应的context对象中的_currentValue值（用于Context.Provider 组件的）
 * 
 * 还有利用栈存储来快速恢复上次值：pushProvider实际上是一个存储函数, 利用栈的特性, 先把context._currentValue压栈, 之后更新context._currentValue = nextValue.
        与pushProvider对应的还有popProvider, 同样利用栈的特性, 把栈中的值弹出, 还原到context._currentValue中.
        本节重点分析Context Api在fiber树构造过程中的作用. 有关pushProvider/popProvider的具体实现过程(栈存储), 在React 算法之栈操作中有详细图解
 * 
 * ```js
 * // 示例结构如下
  context.Provider = {
     $$typeof: REACT_PROVIDER_TYPE,
     _context: context,
   };
  ```
 * @param {*} providerFiber workInProgress 传入的provider fiber 节点
 * @param {*} nextValue  newValue Provider组件的value
 */
export function pushProvider<T>(providerFiber: Fiber, nextValue: T): void {
  const context: ReactContext<T> = providerFiber.type._context;

  if (isPrimaryRenderer) {
    push(valueCursor, context._currentValue, providerFiber);

    context._currentValue = nextValue;
    if (__DEV__) {
      if (
        context._currentRenderer !== undefined &&
        context._currentRenderer !== null &&
        context._currentRenderer !== rendererSigil
      ) {
        console.error(
          'Detected multiple renderers concurrently rendering the ' +
            'same context provider. This is currently unsupported.',
        );
      }
      context._currentRenderer = rendererSigil;
    }
  } else {
    push(valueCursor, context._currentValue2, providerFiber);

    context._currentValue2 = nextValue;
    if (__DEV__) {
      if (
        context._currentRenderer2 !== undefined &&
        context._currentRenderer2 !== null &&
        context._currentRenderer2 !== rendererSigil
      ) {
        console.error(
          'Detected multiple renderers concurrently rendering the ' +
            'same context provider. This is currently unsupported.',
        );
      }
      context._currentRenderer2 = rendererSigil;
    }
  }
}

export function popProvider(providerFiber: Fiber): void {
  const currentValue = valueCursor.current;

  pop(valueCursor, providerFiber);

  const context: ReactContext<any> = providerFiber.type._context;
  if (isPrimaryRenderer) {
    context._currentValue = currentValue;
  } else {
    context._currentValue2 = currentValue;
  }
}

/**
 * 若新旧相同则返回0，否则返回changedBits
 * @param {*} context 
 * @param {*} newValue 
 * @param {*} oldValue 
 * @returns 
 */
export function calculateChangedBits<T>(
  context: ReactContext<T>,
  newValue: T,
  oldValue: T,
) {
  if (is(oldValue, newValue)) {
    // No change
    return 0;
  } else {
    const changedBits =
      typeof context._calculateChangedBits === 'function'
        ? context._calculateChangedBits(oldValue, newValue)
        : MAX_SIGNED_31_BIT_INT;

    if (__DEV__) {
      if ((changedBits & MAX_SIGNED_31_BIT_INT) !== changedBits) {
        console.error(
          'calculateChangedBits: Expected the return value to be a ' +
            '31-bit integer. Instead received: %s',
          changedBits,
        );
      }
    }
    return changedBits | 0;
  }
}

/**
 * 确保路径上的所有父节点都被正确地标记为有工作待做
 * @param {*} parent 
 * @param {*} renderLanes 
 */
export function scheduleWorkOnParentPath(
  parent: Fiber | null,
  renderLanes: Lanes,
) {
  // Update the child lanes of all the ancestors, including the alternates.
  let node = parent;
  while (node !== null) {
    const alternate = node.alternate;
    if (!isSubsetOfLanes(node.childLanes, renderLanes)) {
      node.childLanes = mergeLanes(node.childLanes, renderLanes);
      if (alternate !== null) {
        alternate.childLanes = mergeLanes(alternate.childLanes, renderLanes);
      }
    } else if (
      alternate !== null &&
      !isSubsetOfLanes(alternate.childLanes, renderLanes)
    ) {
      alternate.childLanes = mergeLanes(alternate.childLanes, renderLanes);
    } else {
      // Neither alternate was updated, which means the rest of the
      // ancestor path already has sufficient priority.
      break;
    }
    node = node.return;
  }
}

/**
 * 当一个 <Context.Provider> 的值发生变化时，React 需要通知所有订阅了该上下文的消费者组件去更新它们自己。
 * 这个函数负责遍历整个Fiber树，找到所有依赖于特定上下文的组件，并为这些组件安排一次新的渲染
 * 
 * 优化的逻辑：不是无脑的渲染当前Context.Provider下的所有子树，而是只渲染那些依赖于该Context的组件。
 * 
 * 核心逻辑如下:
 * 
 * - 向下遍历: 从ContextProvider类型的节点开始, 向下查找所有fiber.dependencies依赖该context的节点(假设叫做consumer)，执行scheduleWorkOnParentPath
 * - 向上遍历: scheduleWorkOnParentPath中：从consumer节点开始, 向上遍历, 修改父路径上所有节点的fiber.childLanes属性, 表明其子节点有改动, 子节点会进入更新逻辑.

通过以上 2 个步骤, 保证了所有消费该context的子节点都会被重新构造, 进而保证了状态的一致性, 实现了context更新
 */
export function propagateContextChange(
  workInProgress: Fiber,
  context: ReactContext<mixed>,
  changedBits: number,
  renderLanes: Lanes,
): void {
  let fiber = workInProgress.child;
  if (fiber !== null) {
    // Set the return pointer of the child to the work-in-progress fiber.
    fiber.return = workInProgress;
  }
  // 主循环：遍历整个Fiber树
  while (fiber !== null) {
    let nextFiber;

    // Visit this fiber.
    // 获取当前节点的依赖关系列表
    const list = fiber.dependencies;
    // 如果当前节点有依赖项
    if (list !== null) {
      // 准备向下遍历子节点
      nextFiber = fiber.child;

      let dependency = list.firstContext;
      while (dependency !== null) {
        // Check if the context matches.
        if (
          dependency.context === context &&
          (dependency.observedBits & changedBits) !== 0
        ) {
          // Match! Schedule an update on this fiber.
          // 匹配！为这个节点强制安排一次新的渲染
          if (fiber.tag === ClassComponent) {
            // Schedule a force update on the work-in-progress.
            const update = createUpdate(
              NoTimestamp,
              pickArbitraryLane(renderLanes),
            );
            update.tag = ForceUpdate;
            // TODO: Because we don't have a work-in-progress, this will add the
            // update to the current fiber, too, which means it will persist even if
            // this render is thrown away. Since it's a race condition, not sure it's
            // worth fixing.
            enqueueUpdate(fiber, update);
          }
          // 更新当前节点及其交替节点的渲染优先级
          fiber.lanes = mergeLanes(fiber.lanes, renderLanes);
          const alternate = fiber.alternate;
          if (alternate !== null) {
            alternate.lanes = mergeLanes(alternate.lanes, renderLanes);
          }
          // 确保路径上的所有父节点都被正确地标记为有工作待做
          scheduleWorkOnParentPath(fiber.return, renderLanes);

          // 更新依赖项列表的渲染优先级
          list.lanes = mergeLanes(list.lanes, renderLanes);

          // 找到匹配后停止遍历依赖项列表
          break;
        }
        // 继续检查下一个依赖项
        dependency = dependency.next;
      }
    }
    // 如果是另一个 ContextProvider，决定是否继续深入遍历其子节点
    else if (fiber.tag === ContextProvider) {
      // Don't scan deeper if this is a matching provider
      nextFiber = fiber.type === workInProgress.type ? null : fiber.child;
    }
    // 处理脱水状态下的 Suspense 边界
    else if (
      enableSuspenseServerRenderer &&
      fiber.tag === DehydratedFragment
    ) {
      // If a dehydrated suspense boundary is in this subtree, we don't know
      // if it will have any context consumers in it. The best we can do is
      // mark it as having updates.
      const parentSuspense = fiber.return;
      invariant(
        parentSuspense !== null,
        'We just came from a parent so we must have had a parent. This is a bug in React.',
      );
      parentSuspense.lanes = mergeLanes(parentSuspense.lanes, renderLanes);
      const alternate = parentSuspense.alternate;
      if (alternate !== null) {
        alternate.lanes = mergeLanes(alternate.lanes, renderLanes);
      }
      // This is intentionally passing this fiber as the parent
      // because we want to schedule this fiber as having work
      // on its children. We'll use the childLanes on
      // this fiber to indicate that a context has changed.
      scheduleWorkOnParentPath(parentSuspense, renderLanes);
      nextFiber = fiber.sibling;
    }
    // 向下遍历子节点,找到有依赖关系属性的列表
    else {
      // Traverse down.
      nextFiber = fiber.child;
    }

    // 设置子节点或兄弟节点的 return 指针
    if (nextFiber !== null) {
      // Set the return pointer of the child to the work-in-progress fiber.
      nextFiber.return = fiber;
    } else {
      // 如果没有子节点或兄弟节点，回溯到父节点
      nextFiber = fiber;
      while (nextFiber !== null) {
        if (nextFiber === workInProgress) {
          // 回到根节点，退出循环
          nextFiber = null;
          break;
        }
        const sibling = nextFiber.sibling;
        if (sibling !== null) {
          // Set the return pointer of the sibling to the work-in-progress fiber.
          sibling.return = nextFiber.return;
          nextFiber = sibling;
          break;
        }
        // No more siblings. Traverse up.
        // 没有兄弟节点，继续回溯到父节点
        nextFiber = nextFiber.return;
      }
    }
    // 更新 fiber 变量为下一个需要处理的节点
    fiber = nextFiber;
  }
}

/**
 * updateContextConsumer --> prepareToReadContext
 * 
 * 主要逻辑：设置currentlyRenderingFiber = workInProgress, 并重置lastContextDependency等全局变量.
 * @param {*} workInProgress 
 * @param {*} renderLanes 
 */
export function prepareToReadContext(
  workInProgress: Fiber,
  renderLanes: Lanes,
): void {
  currentlyRenderingFiber = workInProgress;
  lastContextDependency = null;
  lastContextWithAllBitsObserved = null;

  const dependencies = workInProgress.dependencies;
  if (dependencies !== null) {
    const firstContext = dependencies.firstContext;
    if (firstContext !== null) {
      if (includesSomeLane(dependencies.lanes, renderLanes)) {
        // Context list has a pending update. Mark that this fiber performed work.
        markWorkInProgressReceivedUpdate();
      }
      // Reset the work-in-progress list
      dependencies.firstContext = null;
    }
  }
}

/**
 * 返回context._currentValue, 并构造一个contextItem添加到workInProgress.dependencies链表之后.
 * 
 * 这个readContext并不是纯函数, 它还有一些副作用, 会更改workInProgress.dependencies, 
 * 其中contextItem.context保存了当前context的引用. 这个dependencies属性会在更新时使用, 用于判定是否依赖了ContextProvider中的值.
 * 返回context._currentValue之后, 之后继续进行fiber树构造直到全部完成即可.
 */
export function readContext<T>(
  context: ReactContext<T>,
  observedBits: void | number | boolean,
): T {
  if (__DEV__) {
    // This warning would fire if you read context inside a Hook like useMemo.
    // Unlike the class check below, it's not enforced in production for perf.
    if (isDisallowedContextReadInDEV) {
      console.error(
        'Context can only be read while React is rendering. ' +
          'In classes, you can read it in the render method or getDerivedStateFromProps. ' +
          'In function components, you can read it directly in the function body, but not ' +
          'inside Hooks like useReducer() or useMemo().',
      );
    }
  }

  if (lastContextWithAllBitsObserved === context) {
    // Nothing to do. We already observe everything in this context.
  } else if (observedBits === false || observedBits === 0) {
    // Do not observe any updates.
  } else {
    let resolvedObservedBits; // Avoid deopting on observable arguments or heterogeneous types.
    if (
      typeof observedBits !== 'number' ||
      observedBits === MAX_SIGNED_31_BIT_INT
    ) {
      // Observe all updates.
      lastContextWithAllBitsObserved = ((context: any): ReactContext<mixed>);
      resolvedObservedBits = MAX_SIGNED_31_BIT_INT;
    } else {
      resolvedObservedBits = observedBits;
    }

    const contextItem = {
      context: ((context: any): ReactContext<mixed>),
      observedBits: resolvedObservedBits,
      next: null,
    };

    if (lastContextDependency === null) {
      invariant(
        currentlyRenderingFiber !== null,
        'Context can only be read while React is rendering. ' +
          'In classes, you can read it in the render method or getDerivedStateFromProps. ' +
          'In function components, you can read it directly in the function body, but not ' +
          'inside Hooks like useReducer() or useMemo().',
      );

      // This is the first dependency for this component. Create a new list.
      lastContextDependency = contextItem;
      currentlyRenderingFiber.dependencies = {
        lanes: NoLanes,
        firstContext: contextItem,
        responders: null,
      };
    } else {
      // Append a new context item.
      lastContextDependency = lastContextDependency.next = contextItem;
    }
  }
  return isPrimaryRenderer ? context._currentValue : context._currentValue2;
}
