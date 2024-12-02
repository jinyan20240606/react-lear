# react-learn

学习react源码,  先从读代码开始，从react17.0源码细读

通过卡颂源码和图解react配合学习，可以轻松领悟

1. [卡颂参考链接](https://react.iamkasong.com/#%E7%AB%A0%E8%8A%82%E5%88%97%E8%A1%A8)
2. [图解react](https://7km.top/)
2. 个人xmind笔记(wps)
3. [build-your-own-react，构建迷你react，仅几百行代码](https://pomb.us/build-your-own-react/)

## 概念经验

### 易混淆的关键变量

1. workInProgressRoot = root;// 当前要渲染的fiberRoot节点
2. workInProgress = createWorkInProgress(root.current, null); // 双缓存的rootFiber节点，存在这个变量和rootFiber的alternate属性上
3. workInProgressRootRenderLanes = subtreeRenderLanes = workInProgressRootIncludedLanes = lanes; 

### 常见概念

1. fiber树，每个fiber节点存着一个Update链表，这个链表就是更新队列，里面保存着所有的更新操作，当fiber树更新时，会遍历这个链表，依次执行更新操作，完成更新。
    - 还存着一个effects 链表，保存着此次更新所有需要执行的effect，在commit阶段，会遍历这个链表，依次执行effect。
2. fiber根节点结构：从ReactDOM.render开始
    - fiberRoot：一个 React 根实例的内部表示，管理整个应用的根节点，包括初始化、更新和生命周期管理，有current属性，被赋予于container容器dom的一个私有属性
      - 不是fiber节点类型对象
      - 更新时双缓存树就用这个current属性来切换
    - rootFiber：上面current值。fiberRoot 中的一个 Fiber 节点，表示 React 应用的根节点，作为整个 Fiber 树的起点
      - 也叫HostRoot 类型组件
    ```js
    import React from 'react';
    import ReactDOM from 'react-dom/client';
    const container = document.getElementById('root');
    const root = ReactDOM.createRoot(container);
    root.render(<App />);
    // 关系如下：
      fiberRoot
      |
      +---> current: rootFiber
          |
          +---> tag: HostRoot
          |
          +---> stateNode: fiberRoot
          |
          +---> child: appFiber 即 <App /> react元素树对应的fiber链表树
    ```
3. 两大workLoop工作循环：
  - 协调器workLoop：构造fiber树时，beginWork，completeWork
  - 调度器workLoop：整体调度更新任务队列
4. 双缓存技术
  - 双缓存是缓存rootFiber根节点开始。rootFiber的alternate值就是缓存的另一份B版rootFiber。B版rootFiber节点为方便赋值全局变量workInProgress：当前缓存rootFiber节点
    - workInProgress的创建见workLoop阶段的方法定义处：react/packages/react-reconciler/src/ReactFiberWorkLoop.old.js
    - performSyncWorkOnRoot --> renderRootSync  --> prepareFreshStack ---> createWorkInProgress方法
5. 执行工作循环 performUnitOfWork时，beginWork里有处理sibling返回wip.child,而归时completeWork时也会处理sibling，待细看？
  - 整个fiber树的diff对比是深度优先遍历
  - beginWork里处理的sibling，是为了提前找出当前同级所有节点，然后工作循环不断执行beginWOrk的是其child属性：从外到内的方向
    - beginWork中只处理child属性不处理sibling属性，只生成sibling属性不处理sibling属性，
  - 当前一直深度优先child时，如果child为null，开始执行completeWork，这方法中会处理sibling属性：从内到外的方向
### mode与优先级和通道lanes概念

> 参考图解react[启动模式](https://7km.top/main/bootstrap) + [lanes](https://7km.top/main/priority) 基本可以懂
> 通过fiber上的lane优先级的灵活运用, React实现了可中断渲染,时间切片(time slicing),异步渲染(suspense)等特性

1. 共有3种优先级模型贯穿于整个react体系。
    - fiber优先级(LanePriority): 位于react-reconciler包, 也就是Lane(车道模型).
      - 18个lane通道定义：packages/react-reconciler/src/ReactFiberLane.js#L74-L103
      - 使用31个比特位来表示
      - 每个lane通道都有对应的优先级所以：18个通道优先级：lanePriority: react/packages/react-reconciler/src/ReactFiberLane.js
    - 调度优先级(SchedulerPriority): 位于scheduler包.
      - 6大调度优先级Prority：packages/scheduler/src/SchedulerPriorities.js
    - 优先级等级(ReactPriorityLevel) : 位于react-reconciler包中的SchedulerWithReactIntegration.js, 负责上述 2 套优先级体系的转换.
      - 协同调度中心(scheduler包)和 fiber 树构造(react-reconciler包)中对优先级的使用, 则需要转换SchedulerPriority和LanePriority, 转换的桥梁正是ReactPriorityLevel
2. 优先级的使用处：主要用来控制调度器中 任务调度循环中循环的顺序

## react17学习

直接在react源码中标注研究即可

### 常见数据结构

```js
// 数据结构详见：https://7km.top/main/object-structure 解读。

// ReactElement 对象结构 todu
function List () {
  return (
    <ul>
      <li key="0">0</li>
      <li key="1">1</li>
      <li key="2">2</li>
      <li key="3">3</li>
    </ul>
  )
}
// ==== 对应下面的reactElement 元素类型 ====
{
  $$typeof: Symbol(react.element),
  key: null,
  props: {
    children: [
      {$$typeof: Symbol(react.element), type: "li", key: "0", ref: null, props: {…}, …}
      {$$typeof: Symbol(react.element), type: "li", key: "1", ref: null, props: {…}, …}
      {$$typeof: Symbol(react.element), type: "li", key: "2", ref: null, props: {…}, …}
      {$$typeof: Symbol(react.element), type: "li", key: "3", ref: null, props: {…}, …}
    ]
  },
  ref: null,
  type: "ul"
}

// fiberRoot结构 定义见react/packages/react-reconciler/src/ReactInternalTypes.js
export type FiberRoot = {
  ...BaseFiberRootProperties,
  ...ProfilingOnlyFiberRootProperties,
  ...SuspenseCallbackOnlyFiberRootProperties,
  // 如下面是BaseFiberRootProperties部分属性
  ...{// 这些lanes相关属性只在fiberRoot节点有，用于统一计算fiber树的更新优先级
  pendingLanes: Lanes,
  suspendedLanes: Lanes,
  pingedLanes: Lanes,
  expiredLanes: Lanes,
  mutableReadLanes: Lanes,

  finishedLanes: Lanes,

  entangledLanes: Lanes,
  entanglements: LaneMap<Lanes>,
  }
};

// 创建fiber节点定义处包括rootFiber：react/packages/react-reconciler/src/ReactFiber.old.js
// fiber 数据结构，了解了他，react基本上也懂差不多了
function FiberNode(// fiber类型声明：react/packages/react-reconciler/src/ReactInternalTypes.js
  tag: WorkTag,
  pendingProps: mixed,
  key: null | string,
  mode: TypeOfMode,
) {
  // 作为静态数据结构的属性
  // HostRoot (3)：根节点。
  // ClassComponent (1)：类组件。
  // FunctionComponent (0)：函数组件。
  // ContextProvider (8)：上下文提供者。
  // ContextConsumer (7)：上下文消费者。
  // HostComponent (5)：原生 DOM 节点。
  // HostText (6)：文本节点。
  this.tag = tag; // 定义见react/packages/react-reconciler/src/ReactWorkTags.js
  this.key = key;
  // elementType就是reactElement对象的type类型，存储在fiber的elementType上
  this.elementType = null;
  // 存储的组件原声明对象：如Appclasscomponent或AppFunction, 要是react内部提供的组件则有单独的类型定义用16进制表示：react/packages/shared/ReactSymbols.js
  this.type = null;
  // 类组件 (ClassComponent)：stateNode 存储的是类组件的实例。
  // 函数组件 (FunctionComponent)：stateNode 通常是 null。
  // 根组件 (HostRoot就是rootFiber节点)：stateNode 存储的是一个包含上下文信息的对象。定义见react/packages/react-reconciler/src/ReactInternalTypes.js
  // 文本节点 (HostText)：stateNode 存储的是实际的文本内容。
  // 原生 DOM 节点 (HostComponent)：stateNode 存储的是对应的 DOM 元素
  this.stateNode = null; // 存储的组件实例

  // 用于连接其他Fiber节点形成Fiber树
  this.return = null;
  // workInProgress.child值就是App起始的fiber树了
  this.child = null;
  this.sibling = null;
  // 标识当前Fiber 节点在其父节点的子节点列表中的位置
  this.index = 0;

  this.ref = null;

  // 作为动态的工作单元的属性
  //  // 等待更新的props：1-在TODO创建fiber节点时（react/packages/react-reconciler/src/ReactFiber.old.js）中定义。2-processUpdateQueue中处理
  // // ReactElements树创建fiber节点时
  // // 1. props.children 可以直接传入当作pendingProps
  // // 2. element.props作为pendingProps【const pendingProps = element.props】
  this.pendingProps = pendingProps;
  this.memoizedProps = null; // 计算好的最终props新值

  // class组件宿主组件存储 某个组件状态更新产生的 Updates链表 的地方，是以queue为类型保存的
  this.updateQueue: queue = null; // 状态更新创建Update链表，然后推入到这个updateQueue，等待再beginWork中处理，处理方法在react/packages/react-reconciler/src/ReactUpdateQueue.old.js:processUpdateQueue

  // 保存当前组件状态更新计算后准备更新的state
  // fiber.memoizedState指向fiber节点的内存状态. 在function类型的组件中, fiber.memoizedState就指向Hook队列(Hook队列保存了function类型的组件状态).
  // 所以classComponent和Hook都不能脱离fiber而存在
  this.memoizedState: hook = null; // fiber.updateQueue最新计算后的memoizedState同时也赋值给了fiber.memoizedState

  this.dependencies = null;

  this.mode = mode;

  // Effect 标记，对fiber到commit阶段的DOM操作标记：增删改等
  this.flags = Flags; // 定义：react/packages/react-reconciler/src/ReactFiberFlags.js
  this.subtreeFlags = Flags;

  // reconcileChildFibers更新阶段会为生成的Fiber节点带上effectTag属性，而mount阶段mountChildFibers不会，
  // 在mount时只有rootFiber会赋值Placement effectTag，在commit阶段只会执行一次插入操作
  this.effectTag = NoEffect; // 这个是针对于单个fiber节点上要副作用的标记类型，如Update标记，Placement标记
  // 这个链表一般针对于rootFiber根节点上：存储effectList链表的，commit阶段只要遍历这个链表，即可完成渲染dom,
  this.nextEffect = null; // 链表链接的是fiber节点类型
  this.firstEffect = null;
  this.lastEffect = null;

  // 调度优先级相关
  this.lanes = NoLanes; // 当前节点的一组更新通道：默认值是ob0000000 无优先级通道
  /**
   * 当一个更新请求被调度到某个 Fiber 节点的子节点时，新的车道会被合并到父节点的 childLanes 属性中
   * 
   * 一直向上遍历到根节点，给所有父节点都合并当前节点的lane属性，原因如下：
   * 1. 父节点统一管理更新： App 节点有多个子节点，每个子节点都可能有独立的更新请求。通过更新 childLanes，App 节点可以集中管理这些更新请求，确保在一次渲染周期中处理所有相关的更新
   * 2. 优先级管理：如果 Header 节点和 Footer 节点都有更新请求，但 Header 节点的更新请求优先级更高，父节点可以通过 childLanes 属性来决定先处理 Header 节点的更新
   * 3. 传递更新信息：当一个子节点接收到更新请求时，仅更新该子节点的 lanes 属性是不够的。父节点也需要知道这个更新请求的存在，以便在需要时重新渲染整个子树
   */
  this.childLanes = NoLanes;// 所有子树节点的更新通道

  /**
   *初始渲染：
      当初次渲染组件时，React 会构建一个 Fiber 树，这些 Fiber 节点的 alternate 属性初始为 null。
    更新过程：
      当组件需要更新时，React 会创建一个新的 Fiber 树（work-in-progress tree），这个新树中的每个 Fiber 节点都会有一个 alternate 属性，指向当前 Fiber 树（current tree）中的相应节点。
      在新的 Fiber 树构建完成后，React 会将 current 树指针切换到新的 Fiber 树，完成更新。
    交替指针：
      每个 Fiber 节点的 alternate 属性会在每次更新时交换指向，确保当前树和工作树之间的双向链接。
   */
  this.alternate = null; // 用于双缓存技术，指向上一次渲染的fiber节点
}

const hook = {
  // 保存update的queue，即上文介绍的queue
  queue: {
    pending: null// pending连接的就是环状单向update组成的链表。为什么环状方便遍历
  },
  // 保存hook对应的state或effects链表
  memoizedState: initialState,
  // 与下一个Hook连接形成单向无环链表
  next: null
}

```

### 调试源码

> https://www.twotwoba.site/blog/frame/react-source-debug

1. 根据文档教程，先构建完包，react内link一下，再去cra项目中link下你构建完的17版的包即可
  - yarn安装依赖坑
    - 需要node14版本+java-jdk环境
  - 打包命令：`yarn build react/index,react/jsx,react-dom/index,scheduler --type=NODE`
2. 新脚手架用得react18语法，所以改成17的语法就行

### API入手

#### 状态更新流程

主要发生在react/packages/react-reconciler/src/ReactFiberReconciler.old.js-updateContainer函数里

触发状态更新（根据场景调用不同方法）
    |
    |
    v
创建Update对象
    |
    |
    v
从fiber到root ---- 在调度更新函数中执行的（`markUpdateLaneFromFiberToRoot`）
    |找到rootFiber
    |
    v
调度更新（`ensureRootIsScheduled`）
    |根据Update的优先级调度此次异步更新还是同步更新
    |
    v
render阶段（`performSyncWorkOnRoot` 或 `performConcurrentWorkOnRoot`）
    |beginWork阶段：
      |剪掉queue.share.pending单项环状链表，并赋值给queue.baseUpdate
      |依据queue.baseUpdate和queue.baseState计算新的state赋值给fiber.memoizedState
    |completeWork阶段
      |创建effect链表即effectTag

    v
commit阶段（`commitRoot`）

- Update对象：Update对象组成UpdateQueue链表，
- UpdateQueue结构
  - HostComponent组件：数组结构;UpdateQueue格式为 名叫updatePayload为数组形式，他的偶数索引的值为变化的prop key，奇数索引的值为变化的prop value
  - ClassComponent和HostRoot组件：链表结构
      ```js
      const update: Update<*> = {
        eventTime,
        lane, // 此次更新事务的优先级
        suspenseConfig,
        /**
         * 初次mount时，update的tag为 0：定义在 react/packages/react-reconciler/src/ReactUpdateQueue.old.js
         *  export const UpdateState = 0;
            export const ReplaceState = 1;
            export const ForceUpdate = 2;
            export const CaptureUpdate = 3;
         */
        tag: UpdateState, 
        payload: null,
        callback: null,
        next: null,
      };
      const queue: UpdateQueue<State> = {
        baseState: fiber.memoizedState,
        firstBaseUpdate: null, // 保存上次更新遗留的update链表
        lastBaseUpdate: null,
        shared: {
          pending: update,// 保存此次更新的update的链表
          // 
        },
        effects: null,
      };
      // beginWork时：遍历baseUpdate链表在baseState基础上计算最终要更新的state, 并赋值给fiber.memoizedState
      ```
  - FunctionComponent组件：

#### 深入理解优先级
- react为产生的不同的状态更新类型赋予不同的优先级：
  生命周期方法：同步执行。
  受控的用户输入：比如输入框内输入文字，同步执行。
  交互事件：比如动画，高优先级执行。
  其他：比如数据请求，低优先级执行

- 优先级字段是Update对象的lane字段

#### ReactDOM.render流程

1. 创建fiberRootNode和rootFiber和初始化UpdateQueue ====== 后面都主要发生在react/packages/react-reconciler/src/ReactFiberReconciler.old.js updateContainer函数里
2. 创建Update对象，并赋值给rootFiber.updateQueue,来触发一次更新
3. 从fiber到root  --- 在调度更新函数中执行的
4. 调度更新
5. render阶段
6. commit阶段

#### this.setState
1. this.setState内会调用this.updater.enqueueSetState
2. 方法内部：创建Update对象，并赋值给rootFiber.updateQueue,来触发一次更新
3. 从fiber到root
4. 调度更新
5. render阶段
6. commit阶段

### Hooks

#### 极简useState-hook的实现

```js
/**
 * 大体思路
 * 1. 通过一些途径产生更新，更新会造成组件render
 * 2. 组件render时useState返回的num为更新后的结果。
 */
function useState(initialState) {
  // 当前useState使用的hook会被赋值该该变量
  let hook;

  if (isMount) {
    // ...mount时需要生成hook对象
  } else {
    // ...update时从workInProgressHook中取出该useState对应的hook
  }

  let baseState = hook.memoizedState;
  if (hook.queue.pending) {
    // ...根据queue.pending中保存的update更新state
  }
  hook.memoizedState = baseState;

  return [baseState, dispatchAction.bind(null, hook.queue)];
}
```

fiber的结构上有一个memoizedState属性，用来存放hooks链表（存放不同hook产生的hook对象）
每个链节点即hook对象上有一个memoizedState属性，用来存放hook的待更新的计算state

- 确定Update与queue队列存放位置的对象的数据结构
  - 类组件中updateQueue队列存放在实例里的，hook组件中UpdateQueue队列直接存放在hook对象上，hook对象以链表形式存放在当前fiber节点中。
    - hook对象：包含pending属性update链表和 memoizedState(计算后将要更新的state)属性
  - hook与Update关系区别
    - 每个useState等hook就对应一个hook对象，用来存该hook的Update链表（相当于类组件中固定的setState这个全局hook对象）
- dispatchAction方法：模拟react调度更新流程
  - 过workInProgressHook变量指向当前正在工作的hook
  - 触发组件render
- 组件render时，再次执行useState方法，并计算最新的state值返回

#### hooks的数据结构

```js
const hook: Hook = {
  memoizedState: null,

  baseState: null,
  baseQueue: null,
  queue: null,

  next: null,
};
```

#### useState的实际流程

### 源码阅读

#### ReactDOM.render启动API入手

> 相关博客解读可参考https://7km.top/main/bootstrap和 卡颂的章节

1. 入口文件：react/packages/react-dom/src/client/ReactDOM.js 的render方法
2. render方法定义路径：react/packages/react-dom/src/client/ReactDOMLegacy.js
  1. 调用legacyRenderSubtreeIntoContainer 为render的1级核心方法
  2. 先legacyCreateRootFromDOMContainer初始化fiberRoot应用根节点
  3. 再调用协调器的updateContainer 为render的2级核心方法
    - 该方法任何render相关的API最终都会调用它 
    - performUnitOfWork react方法：/packages/react-reconciler/src/ReactFiberWorkLoop.old.js
      - beginWork：定义react/packages/react-reconciler/src/ReactFiberBeginWork.old.js
        - 核心是reconcileChildren方法
      - completeWork
3. 核心逻辑：updateContainer方法定义路径：react/packages/react-reconciler/src/ReactFiberReconciler.old.js

##### mount阶段

ReactDOM.render API 初次挂载阶段

```js
// 初次挂载时的fiber节点对象
const rootFiberNode = {
  actualDuration: 0,
  actualStartTime: -1,
  alternate: null,
  child: null,
  childLanes: 0,
  dependencies: null,
  elementType: null,
  firstEffect: null,
  flags: 0,
  index: 0,
  key: null,
  lanes: 0,
  lastEffect: null,
  memoizedProps: null,
  memoizedState: null,
  mode: 8,
  nextEffect: null,
  pendingProps: null,
  ref: null,
  return: null,
  selfBaseDuration: 0,
  sibling: null,
  stateNode: fiberRootNode,
  tag: 3,
  treeBaseDuration: 0,
  type: null,
  updateQueue: {
    baseState: null,
    effects: null,
    firstBaseUpdate: null,
    lastBaseUpdate: null,
    shared: {
      pending: {
        callback: null,
        eventTime: 47211.39999999851,
        lane: 1,
        next: {
          eventTime: 47211.39999999851,
          lane: 1,
          tag: 0,
          payload: { element: {...} },
          callback: null,
          next: null
        },
        payload: { element: {...} },
        tag: 0
      }
    }
  },
  _debugHookTypes: null,
  _debugID: 1,
  _debugNeedsRemount: false,
  _debugOwner: null,
  _debugSource: null
};
```

## react16版本对比

## react18对比
