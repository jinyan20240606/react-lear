/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactElement} from 'shared/ReactElementType';
import type {ReactPortal} from 'shared/ReactTypes';
import type {BlockComponent} from 'react/src/ReactBlock';
import type {LazyComponent} from 'react/src/ReactLazy';
import type {Fiber} from './ReactInternalTypes';
import type {Lanes} from './ReactFiberLane';

import getComponentName from 'shared/getComponentName';
import {Placement, Deletion} from './ReactFiberFlags';
import {
  getIteratorFn,
  REACT_ELEMENT_TYPE,
  REACT_FRAGMENT_TYPE,
  REACT_PORTAL_TYPE,
  REACT_LAZY_TYPE,
  REACT_BLOCK_TYPE,
} from 'shared/ReactSymbols';
import {
  FunctionComponent,
  ClassComponent,
  HostText,
  HostPortal,
  ForwardRef,
  Fragment,
  SimpleMemoComponent,
  Block,
} from './ReactWorkTags';
import invariant from 'shared/invariant';
import {
  warnAboutStringRefs,
  enableBlocksAPI,
  enableLazyElements,
} from 'shared/ReactFeatureFlags';

import {
  createWorkInProgress,
  resetWorkInProgress,
  createFiberFromElement,
  createFiberFromFragment,
  createFiberFromText,
  createFiberFromPortal,
} from './ReactFiber.old';
import {emptyRefsObject} from './ReactFiberClassComponent.old';
import {isCompatibleFamilyForHotReloading} from './ReactFiberHotReloading.old';
import {StrictMode} from './ReactTypeOfMode';

let didWarnAboutMaps;
let didWarnAboutGenerators;
let didWarnAboutStringRefs;
let ownerHasKeyUseWarning;
let ownerHasFunctionTypeWarning;
let warnForMissingKey = (child: mixed, returnFiber: Fiber) => {};

if (__DEV__) {
  didWarnAboutMaps = false;
  didWarnAboutGenerators = false;
  didWarnAboutStringRefs = {};

  /**
   * Warn if there's no key explicitly set on dynamic arrays of children or
   * object keys are not valid. This allows us to keep track of children between
   * updates.
   */
  ownerHasKeyUseWarning = {};
  ownerHasFunctionTypeWarning = {};

  warnForMissingKey = (child: mixed, returnFiber: Fiber) => {
    if (child === null || typeof child !== 'object') {
      return;
    }
    if (!child._store || child._store.validated || child.key != null) {
      return;
    }
    invariant(
      typeof child._store === 'object',
      'React Component in warnForMissingKey should have a _store. ' +
        'This error is likely caused by a bug in React. Please file an issue.',
    );
    child._store.validated = true;

    const componentName = getComponentName(returnFiber.type) || 'Component';

    if (ownerHasKeyUseWarning[componentName]) {
      return;
    }
    ownerHasKeyUseWarning[componentName] = true;

    console.error(
      'Each child in a list should have a unique ' +
        '"key" prop. See https://reactjs.org/link/warning-keys for ' +
        'more information.',
    );
  };
}

const isArray = Array.isArray;

/**
 * 格式化react元素上的ref值，赋值到fiber节点上
 * 
 * 根据传入的 ref 类型，将其转换为合适的函数ref的格式，并处理一些特殊情况
 * @param {*} returnFiber 
 * @param {*} current 
 * @param {*} element 
 * @returns 
 */
function coerceRef(
  returnFiber: Fiber,
  current: Fiber | null,
  element: ReactElement,
) {
  const mixedRef = element.ref;
  if (
    mixedRef !== null &&
    typeof mixedRef !== 'function' &&
    typeof mixedRef !== 'object'
  ) {
    if (__DEV__) {
      // TODO: Clean this up once we turn on the string ref warning for
      // everyone, because the strict mode case will no longer be relevant
      if (
        (returnFiber.mode & StrictMode || warnAboutStringRefs) &&
        // We warn in ReactElement.js if owner and self are equal for string refs
        // because these cannot be automatically converted to an arrow function
        // using a codemod. Therefore, we don't have to warn about string refs again.
        !(
          element._owner &&
          element._self &&
          element._owner.stateNode !== element._self
        )
      ) {
        const componentName = getComponentName(returnFiber.type) || 'Component';
        if (!didWarnAboutStringRefs[componentName]) {
          if (warnAboutStringRefs) {
            console.error(
              'Component "%s" contains the string ref "%s". Support for string refs ' +
                'will be removed in a future major release. We recommend using ' +
                'useRef() or createRef() instead. ' +
                'Learn more about using refs safely here: ' +
                'https://reactjs.org/link/strict-mode-string-ref',
              componentName,
              mixedRef,
            );
          } else {
            console.error(
              'A string ref, "%s", has been found within a strict mode tree. ' +
                'String refs are a source of potential bugs and should be avoided. ' +
                'We recommend using useRef() or createRef() instead. ' +
                'Learn more about using refs safely here: ' +
                'https://reactjs.org/link/strict-mode-string-ref',
              mixedRef,
            );
          }
          didWarnAboutStringRefs[componentName] = true;
        }
      }
    }

    if (element._owner) {
      const owner: ?Fiber = (element._owner: any);
      let inst;
      if (owner) {
        const ownerFiber = ((owner: any): Fiber);
        invariant(
          ownerFiber.tag === ClassComponent,
          'Function components cannot have string refs. ' +
            'We recommend using useRef() instead. ' +
            'Learn more about using refs safely here: ' +
            'https://reactjs.org/link/strict-mode-string-ref',
        );
        inst = ownerFiber.stateNode;
      }
      invariant(
        inst,
        'Missing owner for string ref %s. This error is likely caused by a ' +
          'bug in React. Please file an issue.',
        mixedRef,
      );
      const stringRef = '' + mixedRef;
      // Check if previous string ref matches new string ref
      if (
        current !== null &&
        current.ref !== null &&
        typeof current.ref === 'function' &&
        current.ref._stringRef === stringRef
      ) {
        return current.ref;
      }
      const ref = function(value) {
        let refs = inst.refs;
        if (refs === emptyRefsObject) {
          // This is a lazy pooled frozen object, so we need to initialize.
          refs = inst.refs = {};
        }
        if (value === null) {
          delete refs[stringRef];
        } else {
          refs[stringRef] = value;
        }
      };
      ref._stringRef = stringRef;
      return ref;
    } else {
      invariant(
        typeof mixedRef === 'string',
        'Expected ref to be a function, a string, an object returned by React.createRef(), or null.',
      );
      invariant(
        element._owner,
        'Element ref was specified as a string (%s) but no owner was set. This could happen for one of' +
          ' the following reasons:\n' +
          '1. You may be adding a ref to a function component\n' +
          "2. You may be adding a ref to a component that was not created inside a component's render method\n" +
          '3. You have multiple copies of React loaded\n' +
          'See https://reactjs.org/link/refs-must-have-owner for more information.',
        mixedRef,
      );
    }
  }
  return mixedRef;
}

function throwOnInvalidObjectType(returnFiber: Fiber, newChild: Object) {
  if (returnFiber.type !== 'textarea') {
    invariant(
      false,
      'Objects are not valid as a React child (found: %s). ' +
        'If you meant to render a collection of children, use an array ' +
        'instead.',
      Object.prototype.toString.call(newChild) === '[object Object]'
        ? 'object with keys {' + Object.keys(newChild).join(', ') + '}'
        : newChild,
    );
  }
}

function warnOnFunctionType(returnFiber: Fiber) {
  if (__DEV__) {
    const componentName = getComponentName(returnFiber.type) || 'Component';

    if (ownerHasFunctionTypeWarning[componentName]) {
      return;
    }
    ownerHasFunctionTypeWarning[componentName] = true;

    console.error(
      'Functions are not valid as a React child. This may happen if ' +
        'you return a Component instead of <Component /> from render. ' +
        'Or maybe you meant to call this function rather than return it.',
    );
  }
}

// We avoid inlining this to avoid potential deopts from using try/catch.
/** @noinline */
function resolveLazyType<T, P>(
  lazyComponent: LazyComponent<T, P>,
): LazyComponent<T, P> | T {
  try {
    // If we can, let's peek at the resulting type.
    const payload = lazyComponent._payload;
    const init = lazyComponent._init;
    return init(payload);
  } catch (x) {
    // Leave it in place and let it throw again in the begin phase.
    return lazyComponent;
  }
}

// This wrapper function exists because I expect to clone the code in each path
// to be able to optimize each path individually by branching early. This needs
// a compiler or we can do it manually. Helpers that don't need this branching
// live outside of this function.
/**
 * 核心方法：协调子树用
 * 
 * 协调过程的主要目的是比较虚拟 DOM 树的新旧版本，以确定哪些部分需要更新、插入或删除（以在后续阶段将这些变更应用到实际的 DOM 中）
 * 
 * @param {*} shouldTrackSideEffects 是否更新阶段的标记
 * @returns 返回reconcileChildFibers 函数
 */
function ChildReconciler(shouldTrackSideEffects) {
  /** 
   * 删除fiber节点操作：只是标记不是真的删除fiber树上的节点
   * 1. 更新根节点上的effectList链表
   * 2. 标记当前childToDelete节点flags标记为删除
   * @param returnFiber: 父 Fiber 节点。
   * @param childToDelete: 要删除的子 Fiber 节点。
   */
  function deleteChild(returnFiber: Fiber, childToDelete: Fiber): void {
    // 如果 shouldTrackSideEffects 为 false，则直接返回，不做任何操作
    if (!shouldTrackSideEffects) {
      // Noop.
      return;
    }
    // 将子节点添加到effectList链表中
    const last = returnFiber.lastEffect;
    if (last !== null) {
      last.nextEffect = childToDelete;
      returnFiber.lastEffect = childToDelete;
    } else {
      returnFiber.firstEffect = returnFiber.lastEffect = childToDelete;
    }
    childToDelete.nextEffect = null;
    childToDelete.flags = Deletion;
  }

  /**
   * 遍历标记删除剩下的currentFirstChild及所有sibling子节点
   * @param {*} returnFiber 
   * @param {*} currentFirstChild 
   * @returns 
   */
  function deleteRemainingChildren(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
  ): null {
    if (!shouldTrackSideEffects) {
      // Noop.
      return null;
    }

    // TODO: For the shouldClone case, this could be micro-optimized a bit by
    // assuming that after the first child we've already added everything.
    let childToDelete = currentFirstChild;
    while (childToDelete !== null) {
      deleteChild(returnFiber, childToDelete);
      childToDelete = childToDelete.sibling;
    }
    return null;
  }

  /**
   * 将剩余的oldFiber转成Map：以key|index为key，oldFiber为Value，方便第二轮遍历
   * @param {*} returnFiber 
   * @param {*} currentFirstChild 
   * @returns 
   */
  function mapRemainingChildren(
    returnFiber: Fiber,
    currentFirstChild: Fiber,
  ): Map<string | number, Fiber> {

    const existingChildren: Map<string | number, Fiber> = new Map();

    let existingChild = currentFirstChild;
    while (existingChild !== null) {
      if (existingChild.key !== null) {
        existingChildren.set(existingChild.key, existingChild);
      } else {
        existingChildren.set(existingChild.index, existingChild);
      }
      // 只比较同级即sibling
      existingChild = existingChild.sibling;
    }
    return existingChildren;
  }

  /**
   * 复用克隆child这个key相同且type相同的fiber节点
   * 
   * @param {*} fiber 要复用的目标fiber节点
   * @param {*} pendingProps 新的reactElement元素上的props值
   */
  function useFiber(fiber: Fiber, pendingProps: mixed): Fiber {
    const clone = createWorkInProgress(fiber, pendingProps);
    clone.index = 0;
    clone.sibling = null;
    return clone;
  }

  /**
   * 移动节点判断：
   * 1. newFiber.alternate存在且判断oldIndex < lastPlacedIndex，小于是需要移动，且添加placement标记，大于等于就不需要移动
   * 2. newFiber.alternate不存在说明不可复用是插入新节点，直接添加Placement标记
   * @param {*} newFiber 
   * @param {*} lastPlacedIndex 
   * @param {*} newIndex 
   * @returns 只在不需要移动时，才会改变lastPlacedIndex值为oldIndex
   * 1. 不需要移动的返回oldIndex:newFiber.alternate.index
   * 2. 需要移动的或不可复用的，都返回未变的lastPlacedIndex
   */
  function placeChild(
    /** 新的子节点 Fiber */
    newFiber: Fiber,
    /** 上一个放置的子节点的索引 */
    lastPlacedIndex: number,
    /** 当前子节点的新索引 */
    newIndex: number,
  ): number {
    // 设置新子节点的索引
    newFiber.index = newIndex;
    // 挂载阶段，直接return
    if (!shouldTrackSideEffects) {
      // Noop.
      return lastPlacedIndex;
    }
    // 处理页面dom上的现有子节点
    const current = newFiber.alternate;
    // 现有dom上现有的子节点current存在，说明可以考虑复用
    if (current !== null) {
      // 判断是否需要移动
      // 如果 oldIndex 小于 lastPlacedIndex，说明需要移动子节点。
      // 设置 newFiber 的 flags 为 Placement，表示需要移动
      const oldIndex = current.index;
      if (oldIndex < lastPlacedIndex) {
        // 需要移动
        newFiber.flags = Placement;
        return lastPlacedIndex;
      } else {
        // 不需要移动.
        return oldIndex;
      }
    } 
    // 不能复用，处理新插入的子节点
    else {
      // This is an insertion.
      newFiber.flags = Placement;
      return lastPlacedIndex;
    }
  }

  /**
   * 主要是标记这个（非复用的）新节点的flags标记为插入placement
   * @param {*} newFiber 
   * @returns 
   */
  function placeSingleChild(newFiber: Fiber): Fiber {
    // This is simpler for the single child case. We only need to do a
    // placement for inserting new children.
    // 标记新节点为“待插入”；alternate为null为不是复用的纯新建的
    if (shouldTrackSideEffects && newFiber.alternate === null) {
      newFiber.flags = Placement;
    }
    return newFiber;
  }

  function updateTextNode(
    returnFiber: Fiber,
    current: Fiber | null,
    textContent: string,
    lanes: Lanes,
  ) {
    if (current === null || current.tag !== HostText) {
      // Insert
      const created = createFiberFromText(textContent, returnFiber.mode, lanes);
      created.return = returnFiber;
      return created;
    } else {
      // Update
      const existing = useFiber(current, textContent);
      existing.return = returnFiber;
      return existing;
    }
  }

  /**
   * type相同：返回复用的fiber节点
   * type不同：返回新建的fiber节点，待插入的
   */
  function updateElement(
    returnFiber: Fiber,
    current: Fiber | null,
    element: ReactElement,
    lanes: Lanes,
  ): Fiber {
    if (current !== null) {
      if (
        current.elementType === element.type ||
        // Keep this check inline so it only runs on the false path:
        (__DEV__ ? isCompatibleFamilyForHotReloading(current, element) : false)
      ) {
        // Move based on index
        const existing = useFiber(current, element.props);
        existing.ref = coerceRef(returnFiber, current, element);
        existing.return = returnFiber;
        if (__DEV__) {
          existing._debugSource = element._source;
          existing._debugOwner = element._owner;
        }
        return existing;
      } else if (enableBlocksAPI && current.tag === Block) {
        // The new Block might not be initialized yet. We need to initialize
        // it in case initializing it turns out it would match.
        let type = element.type;
        if (type.$$typeof === REACT_LAZY_TYPE) {
          type = resolveLazyType(type);
        }
        if (
          type.$$typeof === REACT_BLOCK_TYPE &&
          ((type: any): BlockComponent<any, any>)._render ===
            (current.type: BlockComponent<any, any>)._render
        ) {
          // Same as above but also update the .type field.
          const existing = useFiber(current, element.props);
          existing.return = returnFiber;
          existing.type = type;
          if (__DEV__) {
            existing._debugSource = element._source;
            existing._debugOwner = element._owner;
          }
          return existing;
        }
      }
    }
    // Insert
    const created = createFiberFromElement(element, returnFiber.mode, lanes);
    created.ref = coerceRef(returnFiber, current, element);
    created.return = returnFiber;
    return created;
  }

  function updatePortal(
    returnFiber: Fiber,
    current: Fiber | null,
    portal: ReactPortal,
    lanes: Lanes,
  ): Fiber {
    if (
      current === null ||
      current.tag !== HostPortal ||
      current.stateNode.containerInfo !== portal.containerInfo ||
      current.stateNode.implementation !== portal.implementation
    ) {
      // Insert
      const created = createFiberFromPortal(portal, returnFiber.mode, lanes);
      created.return = returnFiber;
      return created;
    } else {
      // Update
      const existing = useFiber(current, portal.children || []);
      existing.return = returnFiber;
      return existing;
    }
  }

  function updateFragment(
    returnFiber: Fiber,
    current: Fiber | null,
    fragment: Iterable<*>,
    lanes: Lanes,
    key: null | string,
  ): Fiber {
    if (current === null || current.tag !== Fragment) {
      // Insert
      const created = createFiberFromFragment(
        fragment,
        returnFiber.mode,
        lanes,
        key,
      );
      created.return = returnFiber;
      return created;
    } else {
      // Update
      const existing = useFiber(current, fragment);
      existing.return = returnFiber;
      return existing;
    }
  }

  /**
   * 创建新增节点，非复用
   * @param {*} returnFiber 
   * @param {*} newChild 
   * @param {*} lanes 
   * @returns 
   */
  function createChild(
    returnFiber: Fiber,
    newChild: any,
    lanes: Lanes,
  ): Fiber | null {
    if (typeof newChild === 'string' || typeof newChild === 'number') {
      // Text nodes don't have keys. If the previous node is implicitly keyed
      // we can continue to replace it without aborting even if it is not a text
      // node.
      const created = createFiberFromText(
        '' + newChild,
        returnFiber.mode,
        lanes,
      );
      created.return = returnFiber;
      return created;
    }

    if (typeof newChild === 'object' && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE: {
          const created = createFiberFromElement(
            newChild,
            returnFiber.mode,
            lanes,
          );
          created.ref = coerceRef(returnFiber, null, newChild);
          created.return = returnFiber;
          return created;
        }
        case REACT_PORTAL_TYPE: {
          const created = createFiberFromPortal(
            newChild,
            returnFiber.mode,
            lanes,
          );
          created.return = returnFiber;
          return created;
        }
        case REACT_LAZY_TYPE: {
          if (enableLazyElements) {
            const payload = newChild._payload;
            const init = newChild._init;
            return createChild(returnFiber, init(payload), lanes);
          }
        }
      }

      if (isArray(newChild) || getIteratorFn(newChild)) {
        const created = createFiberFromFragment(
          newChild,
          returnFiber.mode,
          lanes,
          null,
        );
        created.return = returnFiber;
        return created;
      }

      throwOnInvalidObjectType(returnFiber, newChild);
    }

    if (__DEV__) {
      if (typeof newChild === 'function') {
        warnOnFunctionType(returnFiber);
      }
    }

    return null;
  }

  /**
   * 通过 updateSlot 来 diff oldFiber 和新的 child，生成新的 Fiber
   * 
   * 返回null或可复用的节点或不可复用新创建的节点
   * @returns updateElement的函数结果
   */
  function updateSlot(
    returnFiber: Fiber,
    oldFiber: Fiber | null,
    newChild: any,
    lanes: Lanes,
  ): Fiber | null {
    // Update the fiber if the keys match, otherwise return null.

    const key = oldFiber !== null ? oldFiber.key : null;

    // 处理文本节点
    // 如果旧子节点有键值，则不能复用，返回 null。
    // 否则，调用 updateTextNode 函数更新文本节点
    if (typeof newChild === 'string' || typeof newChild === 'number') {
      // Text nodes don't have keys. If the previous node is implicitly keyed
      // we can continue to replace it without aborting even if it is not a text
      // node.
      if (key !== null) {
        return null;
      }
      return updateTextNode(returnFiber, oldFiber, '' + newChild, lanes);
    }

    // 处理对象类型的子节点：
    if (typeof newChild === 'object' && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE: {
          // 判断key是否相同
          if (newChild.key === key) {
            if (newChild.type === REACT_FRAGMENT_TYPE) {
              return updateFragment(
                returnFiber,
                oldFiber,
                newChild.props.children,
                lanes,
                key,
              );
            }
            // 返回可复用或新创建的节点
            return updateElement(returnFiber, oldFiber, newChild, lanes);
          }
          // 不同则直接返回null
          else {
            return null;
          }
        }
        case REACT_PORTAL_TYPE: {
          if (newChild.key === key) {
            return updatePortal(returnFiber, oldFiber, newChild, lanes);
          } else {
            return null;
          }
        }
        case REACT_LAZY_TYPE: {
          if (enableLazyElements) {
            const payload = newChild._payload;
            const init = newChild._init;
            return updateSlot(returnFiber, oldFiber, init(payload), lanes);
          }
        }
      }

      if (isArray(newChild) || getIteratorFn(newChild)) {
        if (key !== null) {
          return null;
        }

        return updateFragment(returnFiber, oldFiber, newChild, lanes, null);
      }

      throwOnInvalidObjectType(returnFiber, newChild);
    }

    if (__DEV__) {
      if (typeof newChild === 'function') {
        warnOnFunctionType(returnFiber);
      }
    }

    return null;
  }

  /**
   * diff对比，返回可复用的newFiber----
   * 
   * 这个需要针对当前newChildren[newIdx]去循环查找所有匹配的oldFiber，为避免循环性能损耗，所以提前转成existingChildren-map结构提升性能
   * @param {*} existingChildren Map结构
   * @param {*} returnFiber 
   * @param {*} newIdx 
   * @param {*} newChild 
   * @param {*} lanes 
   * @returns updateElement的函数结果
   */
  function updateFromMap(
    existingChildren: Map<string | number, Fiber>,
    returnFiber: Fiber,
    newIdx: number,
    newChild: any,
    lanes: Lanes,
  ): Fiber | null {
    if (typeof newChild === 'string' || typeof newChild === 'number') {
      // Text nodes don't have keys, so we neither have to check the old nor
      // new node for the key. If both are text nodes, they match.
      const matchedFiber = existingChildren.get(newIdx) || null;
      return updateTextNode(returnFiber, matchedFiber, '' + newChild, lanes);
    }

    if (typeof newChild === 'object' && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE: {
          const matchedFiber =
            existingChildren.get(
              newChild.key === null ? newIdx : newChild.key,
            ) || null;
          if (newChild.type === REACT_FRAGMENT_TYPE) {
            return updateFragment(
              returnFiber,
              matchedFiber,
              newChild.props.children,
              lanes,
              newChild.key,
            );
          }
          return updateElement(returnFiber, matchedFiber, newChild, lanes);
        }
        case REACT_PORTAL_TYPE: {
          const matchedFiber =
            existingChildren.get(
              newChild.key === null ? newIdx : newChild.key,
            ) || null;
          return updatePortal(returnFiber, matchedFiber, newChild, lanes);
        }
        case REACT_LAZY_TYPE:
          if (enableLazyElements) {
            const payload = newChild._payload;
            const init = newChild._init;
            return updateFromMap(
              existingChildren,
              returnFiber,
              newIdx,
              init(payload),
              lanes,
            );
          }
      }

      if (isArray(newChild) || getIteratorFn(newChild)) {
        const matchedFiber = existingChildren.get(newIdx) || null;
        return updateFragment(returnFiber, matchedFiber, newChild, lanes, null);
      }

      throwOnInvalidObjectType(returnFiber, newChild);
    }

    if (__DEV__) {
      if (typeof newChild === 'function') {
        warnOnFunctionType(returnFiber);
      }
    }

    return null;
  }

  /**
   * Warns if there is a duplicate or missing key
   */
  function warnOnInvalidKey(
    child: mixed,
    knownKeys: Set<string> | null,
    returnFiber: Fiber,
  ): Set<string> | null {
    if (__DEV__) {
      if (typeof child !== 'object' || child === null) {
        return knownKeys;
      }
      switch (child.$$typeof) {
        case REACT_ELEMENT_TYPE:
        case REACT_PORTAL_TYPE:
          warnForMissingKey(child, returnFiber);
          const key = child.key;
          if (typeof key !== 'string') {
            break;
          }
          if (knownKeys === null) {
            knownKeys = new Set();
            knownKeys.add(key);
            break;
          }
          if (!knownKeys.has(key)) {
            knownKeys.add(key);
            break;
          }
          console.error(
            'Encountered two children with the same key, `%s`. ' +
              'Keys should be unique so that components maintain their identity ' +
              'across updates. Non-unique keys may cause children to be ' +
              'duplicated and/or omitted — the behavior is unsupported and ' +
              'could change in a future version.',
            key,
          );
          break;
        case REACT_LAZY_TYPE:
          if (enableLazyElements) {
            const payload = child._payload;
            const init = (child._init: any);
            warnOnInvalidKey(init(payload), knownKeys, returnFiber);
            break;
          }
        // We intentionally fallthrough here if enableLazyElements is not on.
        // eslint-disable-next-lined no-fallthrough
        default:
          break;
      }
    }
    return knownKeys;
  }

  /**
   * 多个一级子元素协调diff对比: 比对oldFiber:currentForstChild于newChildren,由2轮for循环完成
   * 
   * 算法看不懂，直接按照在线博客文档理解，配合看[链接](https://react.iamkasong.com/diff/multi.html)
   * 
   * - 第一轮遍历：处理更新的节点。
   * - 第二轮遍历(剩余的newChildren)：处理剩余不属于更新的节点
   * 
   * **注意**
   * 1. 只比较同级即sibling
   * 2. 每轮遍历，都是用的同一个newIdx，是连续遍历，非重新遍历
   * 3. newCHildren的每一遍历项都对应一个newFiber的创建（可能为复用也可能为新建）---> 最终生成的一定是符合newChildren规格的resultingFirstChild新fiber树
   * @param {*} returnFiber 父 Fiber 节点
   * @param {*} currentFirstChild 当前已存在的第一个子 Fiber 节点
   * @param {*} newChildren 新的子节点数组
   * @param {*} lanes 优先级信息，用于调度
   * @returns 返回 resultingFirstChild 为构造后的新fiber树链表结构，首位节点就是第一个newFiber，然后sibling依次链接
   */
  function reconcileChildrenArray(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    newChildren: Array<*>,
    lanes: Lanes,
  ): Fiber | null {
    if (__DEV__) {
      // First, validate keys.
      let knownKeys = null;
      for (let i = 0; i < newChildren.length; i++) {
        const child = newChildren[i];
        knownKeys = warnOnInvalidKey(child, knownKeys, returnFiber);
      }
    }
    // 初始化一些变量，用于追踪新的子节点和旧的子节点
    /** 新fiber树链表的开头节点 */
    let resultingFirstChild: Fiber | null = null;
    /** 缓存上一次的newFiber，用于其sibling属性链接 */
    let previousNewFiber: Fiber | null = null;

    let oldFiber = currentFirstChild;
    /** 记录上次插入节点的旧fiber树中位置，判断节点是否需要移动 */
    let lastPlacedIndex = 0;
    /** newChildren是数组，newIdx就是遍历数组用的下标 */
    let newIdx = 0;
    let nextOldFiber = null;
    // 第一轮遍历：新老VDOM都是从左边开始遍历，按位比较，如果节点可以复用，那么都往后移一位，否则中止本轮循环
    for (; oldFiber !== null && newIdx < newChildren.length; newIdx++) {
      // oldFiber的下标大于新的，本轮循环中止
      if (oldFiber.index > newIdx) {
        nextOldFiber = oldFiber;
        oldFiber = null;
      } else {
        nextOldFiber = oldFiber.sibling;
      }
      // 通过 updateSlot 来 diff oldFiber 和新的 child，生成新的 Fiber
      const newFiber = updateSlot(
        returnFiber,
        oldFiber,
        newChildren[newIdx],
        lanes,
      );
      // key不同，newFiber 为 null 说明不可复用，退出第一轮的循环（如key不相同）
      if (newFiber === null) {
        if (oldFiber === null) {
          oldFiber = nextOldFiber;
        }
        break;
      }
      // 如果newFiber存在：
      // key相同type不同导致不可复用，会将oldFiber标记为DELETION，并继续遍历
      if (shouldTrackSideEffects) {
        if (oldFiber && newFiber.alternate === null) {
          deleteChild(returnFiber, oldFiber);
        }
      }
      // 后面newFiber.alternate不为null的情况，是可复用则继续遍历
      // 情况1：newChildren与oldFiber同时遍历完，第一轮遍历就完成任务了
      lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
      if (previousNewFiber === null) {
        resultingFirstChild = newFiber;
      } else {
        previousNewFiber.sibling = newFiber;
      }
      previousNewFiber = newFiber;
      oldFiber = nextOldFiber;
    }
    // 上面第一轮遍历结束后，4种情况:1都遍历完了，2,3一个遍历完一个没遍历完，4都没遍历完
    // ===================================== =============================================
    // 情况3：newChildren遍历完，oldFiber没遍历完: oldFiber剩余的都可以放心删除
    if (newIdx === newChildren.length) {
      // We've reached the end of the new children. We can delete the rest.
      deleteRemainingChildren(returnFiber, oldFiber);
      return resultingFirstChild;
    }
    // 情况2：newChildren没遍历完，oldFiber遍历完：遍历剩余的newChildren全部
    if (oldFiber === null) {
      for (; newIdx < newChildren.length; newIdx++) {
        // 每项都是新增创建newFiber
        const newFiber = createChild(returnFiber, newChildren[newIdx], lanes);
        if (newFiber === null) {
          continue;
        }
        // 判断移动节点函数：全为新增节点-->增加Placement标记
        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
        if (previousNewFiber === null) {
          // TODO: Move out of the loop. This only happens for the first run.
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }
        previousNewFiber = newFiber;
      }
      return resultingFirstChild;
    }

    // 情况4：newChildren与oldFiber都没遍历完：需要判断移动了
    // Add all children to a key map for quick lookups.
    const existingChildren = mapRemainingChildren(returnFiber, oldFiber);
    // Keep scanning and use the map to restore deleted items as moves.
    // 第二轮遍历
    for (; newIdx < newChildren.length; newIdx++) {
      // diff对比，返回可复用或新创建的newFiber----这个需要针对当前newChildren[newIdx]去循环查找所有匹配的oldFiber，为避免循环性能损耗，所以提前转成map结构提升性能
      const newFiber = updateFromMap(
        existingChildren,
        returnFiber,
        newIdx,
        newChildren[newIdx],
        lanes,
      );
      if (newFiber !== null) {
        if (shouldTrackSideEffects) {
          // 可复用的节点，alternate为页面已存在节点
          if (newFiber.alternate !== null) {
            // 删除map里对应值
            existingChildren.delete(
              newFiber.key === null ? newIdx : newFiber.key,
            );
          }
        }
        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
        if (previousNewFiber === null) {
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }
        previousNewFiber = newFiber;
      }
    }

    if (shouldTrackSideEffects) {
      existingChildren.forEach(child => deleteChild(returnFiber, child));
    }

    return resultingFirstChild;
  }

  function reconcileChildrenIterator(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    newChildrenIterable: Iterable<*>,
    lanes: Lanes,
  ): Fiber | null {
    // This is the same implementation as reconcileChildrenArray(),
    // but using the iterator instead.

    const iteratorFn = getIteratorFn(newChildrenIterable);
    invariant(
      typeof iteratorFn === 'function',
      'An object is not an iterable. This error is likely caused by a bug in ' +
        'React. Please file an issue.',
    );

    if (__DEV__) {
      // We don't support rendering Generators because it's a mutation.
      // See https://github.com/facebook/react/issues/12995
      if (
        typeof Symbol === 'function' &&
        // $FlowFixMe Flow doesn't know about toStringTag
        newChildrenIterable[Symbol.toStringTag] === 'Generator'
      ) {
        if (!didWarnAboutGenerators) {
          console.error(
            'Using Generators as children is unsupported and will likely yield ' +
              'unexpected results because enumerating a generator mutates it. ' +
              'You may convert it to an array with `Array.from()` or the ' +
              '`[...spread]` operator before rendering. Keep in mind ' +
              'you might need to polyfill these features for older browsers.',
          );
        }
        didWarnAboutGenerators = true;
      }

      // Warn about using Maps as children
      if ((newChildrenIterable: any).entries === iteratorFn) {
        if (!didWarnAboutMaps) {
          console.error(
            'Using Maps as children is not supported. ' +
              'Use an array of keyed ReactElements instead.',
          );
        }
        didWarnAboutMaps = true;
      }

      // First, validate keys.
      // We'll get a different iterator later for the main pass.
      const newChildren = iteratorFn.call(newChildrenIterable);
      if (newChildren) {
        let knownKeys = null;
        let step = newChildren.next();
        for (; !step.done; step = newChildren.next()) {
          const child = step.value;
          knownKeys = warnOnInvalidKey(child, knownKeys, returnFiber);
        }
      }
    }

    const newChildren = iteratorFn.call(newChildrenIterable);
    invariant(newChildren != null, 'An iterable object provided no iterator.');

    let resultingFirstChild: Fiber | null = null;
    let previousNewFiber: Fiber | null = null;

    let oldFiber = currentFirstChild;
    let lastPlacedIndex = 0;
    let newIdx = 0;
    let nextOldFiber = null;

    let step = newChildren.next();
    for (
      ;
      oldFiber !== null && !step.done;
      newIdx++, step = newChildren.next()
    ) {
      if (oldFiber.index > newIdx) {
        nextOldFiber = oldFiber;
        oldFiber = null;
      } else {
        nextOldFiber = oldFiber.sibling;
      }
      const newFiber = updateSlot(returnFiber, oldFiber, step.value, lanes);
      if (newFiber === null) {
        // TODO: This breaks on empty slots like null children. That's
        // unfortunate because it triggers the slow path all the time. We need
        // a better way to communicate whether this was a miss or null,
        // boolean, undefined, etc.
        if (oldFiber === null) {
          oldFiber = nextOldFiber;
        }
        break;
      }
      if (shouldTrackSideEffects) {
        if (oldFiber && newFiber.alternate === null) {
          // We matched the slot, but we didn't reuse the existing fiber, so we
          // need to delete the existing child.
          deleteChild(returnFiber, oldFiber);
        }
      }
      lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
      if (previousNewFiber === null) {
        // TODO: Move out of the loop. This only happens for the first run.
        resultingFirstChild = newFiber;
      } else {
        // TODO: Defer siblings if we're not at the right index for this slot.
        // I.e. if we had null values before, then we want to defer this
        // for each null value. However, we also don't want to call updateSlot
        // with the previous one.
        previousNewFiber.sibling = newFiber;
      }
      previousNewFiber = newFiber;
      oldFiber = nextOldFiber;
    }

    if (step.done) {
      // We've reached the end of the new children. We can delete the rest.
      deleteRemainingChildren(returnFiber, oldFiber);
      return resultingFirstChild;
    }

    if (oldFiber === null) {
      // If we don't have any more existing children we can choose a fast path
      // since the rest will all be insertions.
      for (; !step.done; newIdx++, step = newChildren.next()) {
        const newFiber = createChild(returnFiber, step.value, lanes);
        if (newFiber === null) {
          continue;
        }
        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
        if (previousNewFiber === null) {
          // TODO: Move out of the loop. This only happens for the first run.
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }
        previousNewFiber = newFiber;
      }
      return resultingFirstChild;
    }

    // Add all children to a key map for quick lookups.
    const existingChildren = mapRemainingChildren(returnFiber, oldFiber);

    // Keep scanning and use the map to restore deleted items as moves.
    for (; !step.done; newIdx++, step = newChildren.next()) {
      const newFiber = updateFromMap(
        existingChildren,
        returnFiber,
        newIdx,
        step.value,
        lanes,
      );
      if (newFiber !== null) {
        if (shouldTrackSideEffects) {
          if (newFiber.alternate !== null) {
            // The new fiber is a work in progress, but if there exists a
            // current, that means that we reused the fiber. We need to delete
            // it from the child list so that we don't add it to the deletion
            // list.
            existingChildren.delete(
              newFiber.key === null ? newIdx : newFiber.key,
            );
          }
        }
        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
        if (previousNewFiber === null) {
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }
        previousNewFiber = newFiber;
      }
    }

    if (shouldTrackSideEffects) {
      // Any existing children that weren't consumed above were deleted. We need
      // to add them to the deletion list.
      existingChildren.forEach(child => deleteChild(returnFiber, child));
    }

    return resultingFirstChild;
  }

  function reconcileSingleTextNode(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    textContent: string,
    lanes: Lanes,
  ): Fiber {
    // There's no need to check for keys on text nodes since we don't have a
    // way to define them.
    if (currentFirstChild !== null && currentFirstChild.tag === HostText) {
      // We already have an existing node so let's just update it and delete
      // the rest.
      deleteRemainingChildren(returnFiber, currentFirstChild.sibling);
      const existing = useFiber(currentFirstChild, textContent);
      existing.return = returnFiber;
      return existing;
    }
    // The existing first child is not a text node so we need to create one
    // and delete the existing ones.
    deleteRemainingChildren(returnFiber, currentFirstChild);
    const created = createFiberFromText(textContent, returnFiber.mode, lanes);
    created.return = returnFiber;
    return created;
  }

  /**
   * 单元素子树diff：WIP的是单元素，页面上已渲染的可能是多元素
   * 1. currentFirstChild有值即更新时：判断是否可复用fiber节点，不能复用则标记删除旧的跳出循环，继续走下面的新建逻辑
   * 2. currentFirstChild无值即挂载时：只创建fiber节点，关联return属性即可
   * @param {*} returnFiber workInProgress 
   * @param {*} currentFirstChild mount时为null，update时为current.child
   * @param {*} element 上层传入的 newchild 待更新的react元素子树
   * @param {*} lanes renderLanes
   * @returns 返回diff后的新fiber节点作为赋值workInProgress.child用（复用的或新建的）
   */
  function reconcileSingleElement(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    element: ReactElement,
    lanes: Lanes,
  ): Fiber {
    // 获取子元素的key
    const key = element.key;
    // 如果currentFirstChild有值，则遍历现有的子节点为（多元素类型）
    let child = currentFirstChild;
    while (child !== null) {
      // 上一次更新存在DOM节点，接下来判断是否可复用fiber节点
      // 首先比较key是否相同
      if (child.key === key) {
        switch (child.tag) {
          // 处理 Fragment 类型的子节点
          case Fragment: {
            // key相同，接下来比较type是否相同
            if (element.type === REACT_FRAGMENT_TYPE) {
              deleteRemainingChildren(returnFiber, child.sibling);
              const existing = useFiber(child, element.props.children);
              existing.return = returnFiber;
              if (__DEV__) {
                existing._debugSource = element._source;
                existing._debugOwner = element._owner;
              }
              return existing;
            }
            break;
          }
          // 处理 Block 类型的子节点（如果启用了 Blocks API）
          case Block:
            if (enableBlocksAPI) {
              let type = element.type;
              if (type.$$typeof === REACT_LAZY_TYPE) {
                type = resolveLazyType(type);
              }
              if (type.$$typeof === REACT_BLOCK_TYPE) {
                // The new Block might not be initialized yet. We need to initialize
                // it in case initializing it turns out it would match.
                if (
                  ((type: any): BlockComponent<any, any>)._render ===
                  (child.type: BlockComponent<any, any>)._render
                ) {
                  deleteRemainingChildren(returnFiber, child.sibling);
                  const existing = useFiber(child, element.props);
                  existing.type = type;
                  existing.return = returnFiber;
                  if (__DEV__) {
                    existing._debugSource = element._source;
                    existing._debugOwner = element._owner;
                  }
                  return existing;
                }
              }
            }
          // We intentionally fallthrough here if enableBlocksAPI is not on.
          // eslint-disable-next-lined no-fallthrough
          default: {
            // 处理其他类型的子节点
            // key相同，接下来比较type是否相同
            if (
              // type相同则表示可以复用，返回复用的fiber
              child.elementType === element.type ||
              (__DEV__
                // 开发模式下进行热重载兼容性检查
                ? isCompatibleFamilyForHotReloading(child, element)
                : false)
            ) {
              // 标记删除剩余fiber
              deleteRemainingChildren(returnFiber, child.sibling);
              // 复用child这个key相同且type相同的fiber节点，传入新的pendingProps即element.props
              const existing = useFiber(child, element.props);
              // 格式化ref
              existing.ref = coerceRef(returnFiber, child, element);
              existing.return = returnFiber;
              if (__DEV__) {
                existing._debugSource = element._source;
                existing._debugOwner = element._owner;
              }
              return existing;
            }
            // type不同则跳出switch
            break;
          }
        }
        // 代码执行到这里代表：key相同但是type不同
        // 将该fiber及其兄弟fiber标记为删除
        deleteRemainingChildren(returnFiber, child);
        break;
      } else {
        // key不同，将该fiber标记为删除，继续遍历下个节点
        deleteChild(returnFiber, child);
      }
      child = child.sibling;
    }

    // 否则，mount阶段---创建新的子节点
    // 进一步如果首个element是fragment类型
    if (element.type === REACT_FRAGMENT_TYPE) {
      // 1、创建fiber节点：
      //   1-如果 element 是 React.Fragment 类型，调用 createFiberFromFragment 创建新的 Fiber 节点。
      //   2-否则，调用 createFiberFromElement 创建新的 Fiber 节点
      const created = createFiberFromFragment(
        element.props.children,
        returnFiber.mode,
        lanes,
        element.key,
      );
      created.return = returnFiber;
      // 2、直接return出这个新建fiber节点
      return created;
    }
    // 其他类型
    else {
      // 创建fiber节点
      const created = createFiberFromElement(element, returnFiber.mode, lanes);
      // 格式化react元素上的ref值，赋值到fiber节点上
      created.ref = coerceRef(returnFiber, currentFirstChild, element);
      created.return = returnFiber;
      return created;
    }
  }

  function reconcileSinglePortal(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    portal: ReactPortal,
    lanes: Lanes,
  ): Fiber {
    const key = portal.key;
    let child = currentFirstChild;
    while (child !== null) {
      // TODO: If key === null and child.key === null, then this only applies to
      // the first item in the list.
      if (child.key === key) {
        if (
          child.tag === HostPortal &&
          child.stateNode.containerInfo === portal.containerInfo &&
          child.stateNode.implementation === portal.implementation
        ) {
          deleteRemainingChildren(returnFiber, child.sibling);
          const existing = useFiber(child, portal.children || []);
          existing.return = returnFiber;
          return existing;
        } else {
          deleteRemainingChildren(returnFiber, child);
          break;
        }
      } else {
        deleteChild(returnFiber, child);
      }
      child = child.sibling;
    }

    const created = createFiberFromPortal(portal, returnFiber.mode, lanes);
    created.return = returnFiber;
    return created;
  }

  // This API will tag the children with the side-effect of the reconciliation
  // itself. They will be added to the side-effect list as we pass through the
  // children and the parent.
  /**
   * 主要是协调nextchidlren进行diff对比，高效更新，计算生成子fiber节点（returnFiber的child值）
   * 
   * 1. 对于children是单个一级子元素：主要执行 reconcileSingleXXXElement 方法
   * 2. 对于children是多个一级子元素：主要执行 reconcileChildrenArray
   * 3. 删除标记的会加到workInProgress的effectList链表里，插入的更新的只加flags标记（后续在completeWork中会统一将flags标记的fiber节点追加到加到父节点的effectList链表里，一直追到rootFiber）
   * 4. 每个fiber节点都会对应加上flags标记
   * @param {*} returnFiber workInProgress
   * @param {*} currentFirstChild 
   * @param {*} newChild 上层传入的nextChildren
   * @param {*} lanes 
   * @returns 返回diff后的新fiber链表节点或null---作为生成workInProgress.child
   */
  function reconcileChildFibers(
    /** workInProgress */
    returnFiber: Fiber,
    /** mount时为null */
    currentFirstChild: Fiber | null,
    /** 要更新的react元素子树 */
    newChild: any,
    /** 本次渲染的 优先级通道：renderLanes */
    lanes: Lanes,
  ): Fiber | null {
    // 这个函数不是递归的。
    // 如果顶级项是数组，我们将其视为一组子节点，而不是片段节点。递归在正常流程中发生

    // 处理顶级的react fragments组件 如<>...</>，就像它们是数组一样
    /** 是否是顶级的ReactFragment元素类型 */
    const isUnkeyedTopLevelFragment =
      typeof newChild === 'object' &&
      newChild !== null &&
      newChild.type === REACT_FRAGMENT_TYPE &&
      newChild.key === null;
    // 如果是,则重新指定下newChild值
    if (isUnkeyedTopLevelFragment) {
      newChild = newChild.props.children;
    }

    // 如果是对象类型，分类处理直接ｒｅｔｕｒｎ
    const isObject = typeof newChild === 'object' && newChild !== null;

    if (isObject) {
      // 如果 newChild 是对象类型，进一步检查其具体类型（如 ReactElement、ReactPortal、ReactLazy 等
      // 根据不同类型调用相应的处理函数（如 reconcileSingleElement、reconcileSinglePortal、reconcileChildFibers
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE:
          return placeSingleChild(
            reconcileSingleElement(
              returnFiber,
              currentFirstChild,
              newChild,
              lanes,
            ),
          );
        case REACT_PORTAL_TYPE:
          return placeSingleChild(
            reconcileSinglePortal(
              returnFiber,
              currentFirstChild,
              newChild,
              lanes,
            ),
          );
        case REACT_LAZY_TYPE:
          if (enableLazyElements) {
            const payload = newChild._payload;
            const init = newChild._init;
            // TODO: This function is supposed to be non-recursive.
            return reconcileChildFibers(
              returnFiber,
              currentFirstChild,
              init(payload),
              lanes,
            );
          }
      }
    }

    // 如果是字符串或数值类型，直接逻辑ｒｅｔｕｒｎ
    if (typeof newChild === 'string' || typeof newChild === 'number') {
      return placeSingleChild(
        reconcileSingleTextNode(
          returnFiber,
          currentFirstChild,
          '' + newChild,
          lanes,
        ),
      );
    }

    // 如果是数组类型，ｒｅｔｕｒｎ相应逻辑
    if (isArray(newChild)) {
      return reconcileChildrenArray(
        returnFiber,
        currentFirstChild,
        newChild,
        lanes,
      );
    }
    // 处理迭代器类型：如果 newChild 是可迭代对象，调用 reconcileChildrenIterator 处理迭代器中的每个子节点
    if (getIteratorFn(newChild)) {
      return reconcileChildrenIterator(
        returnFiber,
        currentFirstChild,
        newChild,
        lanes,
      );
    }

    // 处理无效对象类型
    if (isObject) {
      throwOnInvalidObjectType(returnFiber, newChild);
    }

    // 处理未定义类型：
    if (__DEV__) {
      if (typeof newChild === 'function') {
        warnOnFunctionType(returnFiber);
      }
    }
    if (typeof newChild === 'undefined' && !isUnkeyedTopLevelFragment) {
      // If the new child is undefined, and the return fiber is a composite
      // component, throw an error. If Fiber return types are disabled,
      // we already threw above.
      switch (returnFiber.tag) {
        case ClassComponent: {
          if (__DEV__) {
            const instance = returnFiber.stateNode;
            if (instance.render._isMockFunction) {
              // We allow auto-mocks to proceed as if they're returning null.
              break;
            }
          }
        }
        // Intentionally fall through to the next case, which handles both
        // functions and classes
        // eslint-disable-next-lined no-fallthrough
        case Block:
        case FunctionComponent:
        case ForwardRef:
        case SimpleMemoComponent: {
          invariant(
            false,
            '%s(...): Nothing was returned from render. This usually means a ' +
              'return statement is missing. Or, to render nothing, ' +
              'return null.',
            getComponentName(returnFiber.type) || 'Component',
          );
        }
      }
    }

    // Remaining cases are all treated as empty.
    // 处理空情况：
    return deleteRemainingChildren(returnFiber, currentFirstChild);
  }

  return reconcileChildFibers;
}

/**
 * update阶段用：协调子树
 */
export const reconcileChildFibers = ChildReconciler(true);
/**
 * mount阶段用：协调子树
 */
export const mountChildFibers = ChildReconciler(false);

/**
 * 不是递归克隆，关于fiber构造相关的都是下钻到子一级的child及sibling级别的，非递归子树
 */
export function cloneChildFibers(
  current: Fiber | null,
  workInProgress: Fiber,
): void {
  invariant(
    current === null || workInProgress.child === current.child,
    'Resuming work not yet implemented.',
  );

  if (workInProgress.child === null) {
    return;
  }

  let currentChild = workInProgress.child;
  let newChild = createWorkInProgress(currentChild, currentChild.pendingProps);
  workInProgress.child = newChild;

  newChild.return = workInProgress;
  while (currentChild.sibling !== null) {
    currentChild = currentChild.sibling;
    newChild = newChild.sibling = createWorkInProgress(
      currentChild,
      currentChild.pendingProps,
    );
    newChild.return = workInProgress;
  }
  newChild.sibling = null;
}

// Reset a workInProgress child set to prepare it for a second pass.
export function resetChildFibers(workInProgress: Fiber, lanes: Lanes): void {
  let child = workInProgress.child;
  while (child !== null) {
    resetWorkInProgress(child, lanes);
    child = child.sibling;
  }
}
