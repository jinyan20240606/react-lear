// 模拟React大对象
const MyReact = {
  createElement,
  render,
  concurrentRender,
  concurrentRender2,
  useState,
};

/**
 * 1. 创建createElement函数
 * @param {*} type
 * @param {*} props
 * @param  {...any} children
 * @returns
 */
function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === "object" ? child : createTextElement(child)
      ),
    },
  };
}
function createTextElement(text) {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: [],
    },
  };
}

/**
 * 2. render
 * @param {*} element
 * @param {*} container
 */
function render(element, container) {
  const dom =
    element.type == "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(element.type);
  const isProperty = (key) => key !== "children";
  Object.keys(element.props)
    .filter(isProperty)
    .forEach((name) => {
      dom[name] = element.props[name];
    });
  element.props.children.forEach((child) => render(child, dom));
  container.appendChild(dom);
}

/**
 * 4. 为了组建工作单元，我们需要将上面render里的element数据结构改变为一个新的数据结构：fiber树结构（链表型siblingreturnchild...）
 *  4-1、每一个元素都是fibr节点，每个fiber节点都对应一个工作单元
 *
 *  4-2. 在渲染中，我们将从根节点开始创建根fiber，并将其设置为初始nextUnitOfWork。剩下的工作将发生在performUnitOfWork函数上，
 * 
 * 在那里我们将为每个光纤做三件事:
 *      a、将元素添加到DOM中
        b、为元素的子元素创建fiber节点
        c、返回下一个工作单元
    4-3. 这种数据结构的目标之一是使查找下一个工作单元变得容易。这就是为什么每根纤维都与它的第一个孩子、下一个兄弟姐妹和它的父母有联系

    4-4. 接下来我们用工作单元重构render函数
 */
function createDom(fiber) {
  const dom =
    fiber.type == "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type);

  const isProperty = (key) => key !== "children";
  Object.keys(fiber.props)
    .filter(isProperty)
    .forEach((name) => {
      dom[name] = fiber.props[name];
    });

  return dom;
}

/**
 * 重构为异步可中断的 render，执行此函数就是设置全局变量 nextUnitOfWork 的执行初始值
 * @param {*} element
 * @param {*} container
 * 在渲染函数中，我们将nextUnitOfWork设置为fiber树的根
 */
function concurrentRender(element, container) {
  // TODO set next unit of work
  // 赋值fiber树的链表头部fiber即根节点，暂时将fiber结构简写为包含dom和props两个属性
  nextUnitOfWork = {
    dom: container,
    props: {
      children: [element],
    },
    // 此时没有child属性
  };
}

// ================================ 全局变量区 START ================================
/** 每个工作单元存放的就是fiber节点结构-链表 */
let nextUnitOfWork = null;
/** 新增内存中正在进行的工作根节点fiber树 */
let wipRoot = null;
/** 当前屏幕上fiber树的根节点引用--方便后面新旧对比 */
let currentRoot = null;
/** 需要一个数组来跟踪我们想要移除的节点。 */
let deletions = null;
// ================================ 全局变量区 END ====================================

function workLoop(deadline) {
  // 实现异步可中断递归
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    // 小于1毫秒，说明需要中断下，让出执行权，让浏览器有时间处理其他任务
    shouldYield = deadline.timeRemaining() < 1;
  }
  // 一旦我们完成了所有的工作(我们知道这一点，因为没有下一个工作单元)，我们就将整个fiber树提交给专门的批量DOM操作方法-----即不让他在performUnitOfWork中串行的操作dom了。
  if (!nextUnitOfWork && wipRoot) {
    // 将根fiber树交给dom操作方法
    commitRoot();
  }

  requestIdleCallback(workLoop);
}

// 浏览器空闲事件，仿造react的调度器实现
requestIdleCallback(workLoop);

/**
 * 实现异步中断渲染的最核心的方法---代替上面的render
 * 目的：就是将你写的组件里的虚拟dom更高效的挂载到页面dom容器中
 * 主要做3件事：
 *  1. 添加dom节点
 *  2. 创建fiber节点
 *  3. 返回下一个工作单元（孩子兄弟叔叔的顺序）
 */
function performUnitOfWork(fiber) {
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }
  if (fiber.child) {
    return fiber.child;
  }
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }
}

/**
 * 5. 创建Render与Commit两大阶段
 *    5-1: 解决目前问题：上面performUnitOfWork方法每次处理一个元素时，我们都会向DOM添加一个新节点。而且，请记住，浏览器可能会在我们完成渲染整个树
 *         之前中断我们的工作。在这种情况下，用户将看到一个不完整的UI。我们不希望这样。
 *    5-2: 我们需要从performUnitOfWork里删除改变DOM的部分。需要重构下改变dom的部分
 */
function concurrentRender2(element, container) {
  // 先改名wipRoot：正在进行的工作根节点
  wipRoot = {
    dom: container,
    props: {
      children: [element],
    },
    // 根节点添加交替属性
    alternate: currentRoot,
  };
  deletions = [];
  nextUnitOfWork = wipRoot;
}

/**
 * 创建commitRoot方法
 * 目的：我们在commitRoot函数中执行。这里我们递归地将所有节点附加到dom。
 */
function commitRoot() {
  deletions.forEach(commitWork);
  commitWork(wipRoot.child);
  currentRoot = wipRoot;
  wipRoot = null;
}

function commitWork(fiber) {
  if (!fiber) {
    return;
  }

  let domParentFiber = fiber.parent;
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }
  const domParent = domParentFiber.dom;

  if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    commitDeletion(fiber, domParent);
  }

  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

/**
 * 【6节】实现Reconcilor：协调器Diff算法（主要就是解决更新dom的高效算法）
 * 1. 问题：到目前为止，我们只是向DOM添加了一些东西，那么更新或删除节点呢?
 * 2. 要做的：我们需要比较我们在渲染函数中接收到的元素和我们提交给DOM的最后一个fiber树，达到更新删除的功能
 * ACTION
 * 1. 创建currentRoot全局变量：我们需要在完成提交后保存对“我们提交给DOM的最后一棵fiber树”的引用。我们称之为currentRoot。
 * 2. 将正在进行fiber树根节点：加了交替属性。此属性是到旧fiber树的链接，即我们在前一个提交阶段提交给DOM的fiber树。
 */

// 6.1 重构performUnitOfWork
//     1. 从中提取创建fiber节点的代码
//     2. 重构：在这里协调新旧元素，尽可能的复用已有的节点，最后产出新旧混合的新fiber树
/**
 * 协调思路：
 * 1. 同时遍历2个数据结构：旧fiber树的子树链表 和 新的jsx对应的reactElements元素数组
 * 
 * 1参：是fiber节点
 * 2参：是element子元素数组，待更新到页面上的
 * 
 */
function reconcileChildren(wipFiber, elements) {
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling = null;

  // 0. 同时遍历，以elements数组为基准遍历
  while (index < elements.length || oldFiber != null) {
    const element = elements[index];
    let newFiber = null;

    // 1. compare oldFiber to element
    const sameType = oldFiber && element && element.type == oldFiber.type;

    if (sameType) {
      // 1-1. update the node
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: "UPDATE",
      };
    }
    if (element && !sameType) {
      // 1-2 add this node
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: "PLACEMENT",
      };
    }
    if (oldFiber && !sameType) {
      // 1-3 delete the oldFiber's node
      oldFiber.effectTag = "DELETION";
      deletions.push(oldFiber);
    }

    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }

    if (index === 0) {
      wipFiber.child = newFiber;
    } else if (element) {
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
    index++;
  }
}

const isEvent = (key) => key.startsWith("on");
const isProperty = (key) => key !== "children" && !isEvent(key);
const isNew = (prev, next) => (key) => prev[key] !== next[key];
const isGone = (prev, next) => (key) => !(key in next);
/**
 * 如果它是一个UPDATE，我们需要用已更改的props更新现有的DOM节点。--
 * 我们将旧纤维中的道具与新纤维中的道具进行比较，删除已经消失的道具，并设置新的或更改的道具。
 */
function updateDom(dom, prevProps, nextProps) {
  //Remove old or changed event listeners
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });
  // Remove old properties
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = "";
    });

  // Set new or changed properties
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = nextProps[name];
    });
  // Add event listeners
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });
}

/**
 * [8节] 实现支持函数时组件化
 * 8.1 函数组件有两个不同之处:
    1. 来自函数组件的fiber没有DOM节点
    2. 子函数来自于运行函数，而不是直接从props中获取
 */
// ================= END： 使用react渲染组件到页面上 ================================================================
let wipFiber = null;
let hookIndex = null;
function updateFunctionComponent(fiber) {
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = [];
  const children = [fiber.type(fiber.props)];
  reconcileChildren(fiber, children);
}

function updateHostComponent(fiber) {
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  // 1参是fiber节点 2参是element子元素数组，待更新到页面上的
  reconcileChildren(fiber, fiber.props.children);
}

function commitDeletion(fiber, domParent) {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    commitDeletion(fiber.child, domParent);
  }
}

/** @jsx Didact.createElement 使用函数组件 */
// function Counter() {
//   const [state, setState] = Didact.useState(1);
//   return <h1 onClick={() => setState((c) => c + 1)}>Count: {state}</h1>;
// }
// const element = <Counter />;
//   const container = document.getElementById("root")
//   Didact.render(element, container)

/**
 * 【8节】增加hooks状态
 * 1. 现在我们有了函数组件，让我们添加状态。
 */

function useState(initial) {
  const oldHook =
    wipFiber.alternate &&
    wipFiber.alternate.hooks &&
    wipFiber.alternate.hooks[hookIndex];
  const hook = {
    state: oldHook ? oldHook.state : initial,
    queue: [],
  };

  // 我们在下次渲染组件时这样做，我们从旧钩子队列中获得所有的动作，
  // 然后将它们一个接一个地应用到新的钩子状态，所以当我们返回状态时，它就更新了。
  const actions = oldHook ? oldHook.queue : [];
  actions.forEach((action) => {
    hook.state = action(hook.state);
  });

  const setState = (action) => {
    hook.queue.push(action);
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot,
    };
    nextUnitOfWork = wipRoot;
    deletions = [];
  };

  wipFiber.hooks.push(hook);
  hookIndex++;
  return [hook.state, setState];
}
