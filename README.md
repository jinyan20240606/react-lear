# react-learn

学习react源码,  先从读代码开始，从react17.0源码细读

> [导学](https://www.bilibili.com/video/BV1Ki4y1u7Vr/?vd_source=dabdcdd419ed3bc022bc41c4fd99a0be)

1. [参考链接](https://react.iamkasong.com/#%E7%AB%A0%E8%8A%82%E5%88%97%E8%A1%A8)
2. 个人xmind笔记(wps)
3. [build-your-own-react，构建迷你react，仅几百行代码](https://pomb.us/build-your-own-react/)

## react17学习

直接在react源码中标注研究即可

```js
// fiber 数据结构，了解了他，react基本上也懂差不多了
function FiberNode(
  tag: WorkTag,
  pendingProps: mixed,
  key: null | string,
  mode: TypeOfMode,
) {
  // 作为静态数据结构的属性
  this.tag = tag;
  this.key = key;
  this.elementType = null;
  this.type = null;
  this.stateNode = null;

  // 用于连接其他Fiber节点形成Fiber树
  this.return = null;
  this.child = null;
  this.sibling = null;
  this.index = 0;

  this.ref = null;

  // 作为动态的工作单元的属性
  this.pendingProps = pendingProps; // 等待更新的props
  this.memoizedProps = null; // 计算好的最终props新值

  // class组件宿主组件存储 某个组件状态更新产生的 Updates链表 的地方，是以queue为类型保存的
  this.updateQueue: queue = null; // 1. 先存放completeWork阶段的updatePayload数组  2. 再存放该节点要更新的Update链表的queue链表即下文的 queue 值

  // 保存当前组件状态更新计算后准备更新的state
  this.memoizedState: hook = null; 

  this.dependencies = null;

  this.mode = mode;

  this.effectTag = NoEffect; // 如Update标记，Placement标记
  this.nextEffect = null;

  this.firstEffect = null; // 存储effectList链表的，commit阶段只要遍历这个链表，即可完成渲染dom
  this.lastEffect = null;

  // 调度优先级相关
  this.lanes = NoLanes;
  this.childLanes = NoLanes;

  // 指向该fiber在另一次更新时对应的fiber
  this.alternate = null;
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

1. 根据文档教程，先构建完包，react内link一下，再去cra项目中link下你构建完的17版的包即可
2. 新脚手架用得react18语法，所以改成17的语法就行

### 概念经验

1. fiber树，每个fiber节点存着一个Update链表，这个链表就是更新队列，里面保存着所有的更新操作，当fiber树更新时，会遍历这个链表，依次执行更新操作，完成更新。
    - 还存着一个effects 链表，保存着此次更新所有需要执行的effect，在commit阶段，会遍历这个链表，依次执行effect。

### API入手

#### 状态更新流程

触发状态更新（根据场景调用不同方法）
    |
    |
    v
创建Update对象
    |
    |
    v
从fiber到root（`markUpdateLaneFromFiberToRoot`）
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


## react16版本对比

## react18对比
