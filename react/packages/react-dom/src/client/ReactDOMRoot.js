/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Container} from './ReactDOMHostConfig';
import type {RootTag} from 'react-reconciler/src/ReactRootTags';
import type {MutableSource, ReactNodeList} from 'shared/ReactTypes';
import type {FiberRoot} from 'react-reconciler/src/ReactInternalTypes';

export type RootType = {
  render(children: ReactNodeList): void,
  unmount(): void,
  _internalRoot: FiberRoot,
  ...
};

export type RootOptions = {
  hydrate?: boolean,
  hydrationOptions?: {
    onHydrated?: (suspenseNode: Comment) => void,
    onDeleted?: (suspenseNode: Comment) => void,
    mutableSources?: Array<MutableSource<any>>,
    ...
  },
  ...
};

import {
  isContainerMarkedAsRoot,
  markContainerAsRoot,
  unmarkContainerAsRoot,
} from './ReactDOMComponentTree';
import {listenToAllSupportedEvents} from '../events/DOMPluginEventSystem';
import {eagerlyTrapReplayableEvents} from '../events/ReactDOMEventReplaying';
import {
  ELEMENT_NODE,
  COMMENT_NODE,
  DOCUMENT_NODE,
  DOCUMENT_FRAGMENT_NODE,
} from '../shared/HTMLNodeType';
import {ensureListeningTo} from './ReactDOMComponent';

import {
  createContainer,
  updateContainer,
  findHostInstanceWithNoPortals,
  registerMutableSourceForHydration,
} from 'react-reconciler/src/ReactFiberReconciler';
import invariant from 'shared/invariant';
import {enableEagerRootListeners} from 'shared/ReactFeatureFlags';
import {
  BlockingRoot,
  ConcurrentRoot,
  LegacyRoot,
} from 'react-reconciler/src/ReactRootTags';

function ReactDOMRoot(container: Container, options: void | RootOptions) {
  this._internalRoot = createRootImpl(container, ConcurrentRoot, options);
}

/**
 * 构造render实例对象（含_internalRoot：新建fiberRoot）
 * @param {*} container 目标DOM容器 div#root
 * @param {*} tag 标识根实例的类型。常见的标签值包括 LegacyRoot 和 ConcurrentRoot 
 * @param {*} options 配置
 * @returns {{render:Function, unmount:Function,_internalRoot: FiberRoot}} RootType
 */
function ReactDOMBlockingRoot(
  /** 目标DOM容器 div#root */
  container: Container,
  /** 标识根实例的类型。常见的标签值包括 LegacyRoot 和 ConcurrentRoot */
  tag: RootTag,
  /** 配置 */
  options: void | RootOptions,
) {
  this._internalRoot = createRootImpl(container, tag, options);
}

/** 将React 元素渲染到指定的容器中 */
ReactDOMRoot.prototype.render = ReactDOMBlockingRoot.prototype.render = function(
  children: ReactNodeList,
): void {
  const root = this._internalRoot;
  if (__DEV__) {
    if (typeof arguments[1] === 'function') {
      console.error(
        'render(...): does not support the second callback argument. ' +
          'To execute a side effect after rendering, declare it in a component body with useEffect().',
      );
    }
    // 获取容器元素
    const container = root.containerInfo;

    // 检查容器节点类型
    if (container.nodeType !== COMMENT_NODE) {
      // 查找当前rootFiber根节点的宿主DOM，校验宿主DOM是否与container同一个DOM，若不是则为多实例渲染报错
      const hostInstance = findHostInstanceWithNoPortals(root.current);
      if (hostInstance) {
        if (hostInstance.parentNode !== container) {
          console.error(
            'render(...): It looks like the React-rendered content of the ' +
              'root container was removed without using React. This is not ' +
              'supported and will cause errors. Instead, call ' +
              "root.unmount() to empty a root's container.",
          );
        }
      }
    }
  }
  // 更新容器中的内容
  updateContainer(children, root, null, null);
};

ReactDOMRoot.prototype.unmount = ReactDOMBlockingRoot.prototype.unmount = function(): void {
  if (__DEV__) {
    if (typeof arguments[0] === 'function') {
      console.error(
        'unmount(...): does not support a callback argument. ' +
          'To execute a side effect after rendering, declare it in a component body with useEffect().',
      );
    }
  }
  const root = this._internalRoot;
  const container = root.containerInfo;
  updateContainer(null, root, null, () => {
    unmarkContainerAsRoot(container);
  });
};

/** 
 * 创建根实例fiberRoot：返回fiberRoot：整个React应用的根
 * 1. 创建根实例
 * 2. 处理react合成事件的委托绑定
 * 
 * @param {*} container 目标DOM容器，div#root 
 * */
function createRootImpl(
  container: Container,
  tag: RootTag,
  options: void | RootOptions,
) {
  // 1、解析选项
  const hydrate = options != null && options.hydrate === true;
  const hydrationCallbacks =
    (options != null && options.hydrationOptions) || null;
  /** 水合的可变数据源 */
  const mutableSources =
    (options != null &&
      options.hydrationOptions != null &&
      options.hydrationOptions.mutableSources) ||
    null;

  // 2、创建容器
  // 初始化根Fiber节点
  const root = createContainer(container, tag, hydrate, hydrationCallbacks);
  // 标记容器DOM的根属性为当前rootFiber根节点
  markContainerAsRoot(root.current, container);
  // 获取容器节点类型
  const containerNodeType = container.nodeType;

  // 3、处理DOM容器节点的事件委托 --- 根容器的react合成事件委托
  if (enableEagerRootListeners) {
    const rootContainerElement =
      container.nodeType === COMMENT_NODE ? container.parentNode : container;
    listenToAllSupportedEvents(rootContainerElement);
  } else {
    if (hydrate && tag !== LegacyRoot) {
      const doc =
        containerNodeType === DOCUMENT_NODE
          ? container
          : container.ownerDocument;
      // We need to cast this because Flow doesn't work
      // with the hoisted containerNodeType. If we inline
      // it, then Flow doesn't complain. We intentionally
      // hoist it to reduce code-size.
      eagerlyTrapReplayableEvents(container, ((doc: any): Document));
    } else if (
      containerNodeType !== DOCUMENT_FRAGMENT_NODE &&
      containerNodeType !== DOCUMENT_NODE
    ) {
      ensureListeningTo(container, 'onMouseEnter', null);
    }
  }

  // 4、ssr水合相关：类似于useMustableSource 可变源-新钩子的特性 参考：https://juejin.cn/post/7026210002042011655#heading-10
  // 注册可变源：可变源是指那些在组件渲染过程中可能会发生变化的外部数据源。
  if (mutableSources) {
    for (let i = 0; i < mutableSources.length; i++) {
      const mutableSource = mutableSources[i];
      registerMutableSourceForHydration(root, mutableSource);
    }
  }

  return root;
}

export function createRoot(
  container: Container,
  options?: RootOptions,
): RootType {
  invariant(
    isValidContainer(container),
    'createRoot(...): Target container is not a DOM element.',
  );
  warnIfReactDOMContainerInDEV(container);
  return new ReactDOMRoot(container, options);
}

export function createBlockingRoot(
  container: Container,
  options?: RootOptions,
): RootType {
  invariant(
    isValidContainer(container),
    'createRoot(...): Target container is not a DOM element.',
  );
  warnIfReactDOMContainerInDEV(container);
  return new ReactDOMBlockingRoot(container, BlockingRoot, options);
}

/**
 * 创建根实例
 * 
 * 该函数用于创建一个根实例，主要服务于 `ReactDOM.render()` 这个传统方法并固定传入LegacyRoot Tag表明当前是传统模式。
 * 
 * 创建的根实例包含 `render` 和 `unmount` 方法，用于管理和控制组件的渲染和卸载。
 * 
 * @param {Element} container 容器元素，通常是 DOM 元素，用于存放 React 组件的渲染结果。
 * @param {Object} options 渲染选项，可以包含一些配置项，例如并发模式、严格模式等。
 * @returns {RootType} 返回一个包含 `render`、`unmount` 和 `_internalRoot` 属性的对象。
 *                    - `render(element)`: 将 React 元素渲染到根容器中。
 *                    - `unmount()`: 卸载根容器中的所有内容。
 *                    - `_internalRoot`: 内部使用的 Fiber 根对象。
 */
export function createLegacyRoot(
  container: Container,
  options?: RootOptions,
): RootType {
  return new ReactDOMBlockingRoot(container, LegacyRoot, options);
}

export function isValidContainer(node: mixed): boolean {
  return !!(
    node &&
    (node.nodeType === ELEMENT_NODE ||
      node.nodeType === DOCUMENT_NODE ||
      node.nodeType === DOCUMENT_FRAGMENT_NODE ||
      (node.nodeType === COMMENT_NODE &&
        (node: any).nodeValue === ' react-mount-point-unstable '))
  );
}

function warnIfReactDOMContainerInDEV(container) {
  if (__DEV__) {
    if (
      container.nodeType === ELEMENT_NODE &&
      ((container: any): Element).tagName &&
      ((container: any): Element).tagName.toUpperCase() === 'BODY'
    ) {
      console.error(
        'createRoot(): Creating roots directly with document.body is ' +
          'discouraged, since its children are often manipulated by third-party ' +
          'scripts and browser extensions. This may lead to subtle ' +
          'reconciliation issues. Try using a container element created ' +
          'for your app.',
      );
    }
    if (isContainerMarkedAsRoot(container)) {
      if (container._reactRootContainer) {
        console.error(
          'You are calling ReactDOM.createRoot() on a container that was previously ' +
            'passed to ReactDOM.render(). This is not supported.',
        );
      } else {
        console.error(
          'You are calling ReactDOM.createRoot() on a container that ' +
            'has already been passed to createRoot() before. Instead, call ' +
            'root.render() on the existing root instead if you want to update it.',
        );
      }
    }
  }
}
