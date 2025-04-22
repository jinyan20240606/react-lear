# react中的算法学习

> 参考https://7km.top/algorithm/diff

## diff算法

> https://7km.top/algorithm/diff  图解比较清晰，可参考
> https://react.iamkasong.com/diff/multi.html#%E6%A6%82%E8%A7%88  理论更清晰
> 自己的代码注释  也更易懂

整体环节定位回顾fiber树构造过程章节: `react-lear/README.md`，具体diff算法细节见该章节及代码注释吧，就不在这里赘述了。

- 它的主要作用:

  - 给新增,移动,和删除节点设置fiber.flags(新增, 移动: Placement, 删除: Deletion)
    - diff算法里只会新增这2种标记。
  - 如果是需要删除的fiber, 除了自身打上Deletion之外, 还要将其添加到父节点的effects链表中(正常副作用队列的处理是在completeWork函数, 但是该节点(被删除)会脱离fiber树, 不会再进入completeWork阶段, 所以在beginWork阶段提前加入副作用队列).

### 特性

算法复杂度低, 从上至下比较整个树形结构, 时间复杂度被缩短到 O(n)

#### 传统diff实践复杂度为什么为n的3次方
传统Diff算法的 总时间复杂度是O(n²) × O(n) = O(n³)，因为：

- 比较阶段`（O(n²））`：每个节点都需要与另一棵树的所有节点比较，导致二次方的时间复杂度。
  - A树3个节点，循环遍历比较B树所有3个节点，3x3就是3的二次方
- 编辑操作阶段`（O(n)）`：每次比较后需要执行线性时间的操作（如移动、删除或创建节点）。


### 基本原理

> 具体见代码注释`react/packages/react-reconciler/src/ReactChildFiber.old.js@reconcileChildFibers`

- 比较对象: fiber对象与ReactElement对象相比较.
  - 注意: 此处有一个误区, 并不是两棵 fiber 树相比较, 而是旧fiber对象与新ReactElement对象向比较, 结果生成新的fiber子节点.
    可以理解为输入ReactElement, 经过reconcileChildren()之后, 输出fiber.
- 比较方案:
  - 单节点比较
  - 可迭代节点比较

#### 个人理解

1. 为什么diff算法对比，只需要更新flags标记即可,判断移动时也是只需要将移动的节点flags标记为Placement, 而不是将真的将页面上的移动节点。
   1. 因为为了复用当前页面上已生成的fiber节点和dom节点，需要下次更新内容，尽可能不改动页面上dom。得需要你的wip中的dom尽量都是复用的，需要移动的话，固定页面某个dom不移动，然后移动其他的dom
      1. dom不需移动的以基准，不用添加移动标记，在commit中也不用特殊处理他，直接按他为基础操作即可
      2. 怎么移动？需要将wip的新fiber节点都会关联上已有的dom，新fiber节点是按nextCHildren最新的顺序组织的，肯定与页面上顺序不一样，在commit阶段处理Placement标记时，会操作页面上关联dom移动到wip顺序--dom不移动的后面中。

#### 单节点比较思路

1. 如果是新增节点, 直接新建 fiber, 没有多余的逻辑
2. 如果是对比更新
   1. 如果key和type都相同(即: ReactElement.key === Fiber.key 且 Fiber.elementType === ReactElement.type), 则复用
3. 否则新建

注意: 复用过程是调用useFiber(child, element.props)创建新的fiber对象, 这个新fiber对象.stateNode = currentFirstChild.stateNode, 即stateNode属性得到了复用, 故 DOM 节点得到了复用

#### 多节点比较思路

具体见代码注释`react/packages/react-reconciler/src/ReactChildFiber.old.js@reconcileChildrenArray` 

或：https://react.iamkasong.com/diff/multi.html#%E6%A6%82%E8%A7%88

1. 判断当前节点的更新属于哪种情况
  - 如果是新增，执行新增逻辑
  - 如果是删除，执行删除逻辑
  - 如果是更新，执行更新逻辑
2. 同级多个节点的Diff，一定属于以上三种情况中的一种或多种
3. 按优先级进行逻辑处理
   1. 因为：在日常开发中，相较于新增和删除，更新组件发生的频率更高。所以Diff会优先判断当前节点是否属于更新
   2. 基于以上原因，Diff算法的整体逻辑会经历两轮遍历：
      1. 第一轮遍历：处理更新的节点。
         1. 注意：
            1. 第一轮遍历中，仅当遇到key不同时这一种情况才会提前中途退出遍历，key相同时不管type同不同都会一直遍历完毕。
            2. 博客链接中这块描述的不太完整，完整的见代码注释
         2. 缺点：
            1. key相同，type不同的直接无脑新建，并没有考虑节点移动复用的问题。他这个节点移动只考虑(在key不同时才跳出第一轮，)在第二轮才考虑节点移动
               1. 虽然也调用了判断移动节点函数,但只是
         3. 第一轮遍历结束有4种情况，情况234这3种情况都算作进入第二轮遍历
      2. 第二轮遍历：处理剩下的不属于更新的节点
         1. 问题
            1. 判断移动节点函数中：可复用且不需要移动的：不添加Placement标记，只更新lastPlacedIndex值；可复用且需要移动的或新建的：都只添加Placement标记。做这些后就diff结束了，那后续是怎么实际把节点移动到指定新位置的呢？？？
               1. 回答：参考https://7km.top/main/fibertree-update图解 fiber树构造对比更新章节
                  1. 这个图解例子下的div下的ABC更新成CAX过程中，就对应情况4。
                     1. 第一轮遍历A不等C，进入第二轮遍历，C可复用不移动，A为可复用需要移动，X为新建,所以第一轮遍历结束后，C的不加flas标记,A的flags为Placement, X的flags为Placement，这是WIPfiber树下的节点，然后current的BC的flags为Deletion，得同步挂到WIPfiber的effects链表中。----- 这个后续commit阶段会current级别的Deletion标记删掉，wip级别的标记新增
               2. 因为每次遍历，都会生成新newChild节点(包括复用的要移动的和复用不移动的，和不能复用新建的)
                  1. 可复用移动的和不能复用新建的只是给newCHild多加个Placement标记，后续commit阶段会根据Placement标记来生成插入节点
                     1. 新建的，其flags等肯定也会先重置的。
                  2. 可复用不移动的：不添加Palce标记意味着直接就是克隆这个节点
                     1. 复用的节点：在克隆时会提前重置新节点的flags属性和firstEffect标记，其他的stateNode等属性都是复用保留的，所以页面上dom是有的，commit阶段-----如果复用的，就保留页面上的dom节点，如果不是复用的，就新建dom节点，删除掉页面上的节点。
         2. 第二轮遍历完毕后，oldFiber中移动后剩余的不能复用的节点剩余在existingChildren里，统一进行添加Deletion标记
            1. Deletion标记：先在`react/packages/react-reconciler/src/ReactChildFiber.old.js@deleteChild`，这个deleteChild函数里。
               1. 先将页面级的fiber节点的flags标记为Deletion, 然后再将其添加到WIP-Fiber父节点的effects链表中, 这样在commit阶段就会删除这个fiber节点了--两边共享这个节点标记。

## React 算法之位运算

网络上介绍位运算的文章非常多(如[MDN 上的介绍](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators)就很仔细).

本文的目的:

1. 温故知新, 对位运算的基本使用做一下简单的总结.
2. 归纳在`javascript`中使用位运算的注意事项.
3. 列举在`react`源码中, 对于位运算的高频使用场景.

### 概念

位运算直接处理每一个比特位(bit), 是非常底层的运算, 优势是速度快, 劣势就是不直观且只支持整数运算.

### 前置知识

1. 整数分为有符号整数(可以表示正数负数和0)和无符号整数(只能表示非负整数和0)，
2. 浮点数是一种表示实数的方式，适用于非常大或非常小的数值，支持小数点后数字的存在。
3. 单精度和双精度是计算机科学中用于表示浮点数的两种主要格式，它们遵循IEEE 754标准来存储数值。这两种格式主要用于描述数字在内存中的精确度和范围
   1. 单精度32位
      1. 位数：单精度使用32位（4字节）来存储一个浮点数。
      2. 组成：
         1. 1位符号位（S）：表示数字的正负号，0代表正数，1代表负数。
         2. 8位指数位（E）：用来表示该数的指数部分。
         3. 23位尾数（也称为小数或分数）位（M）：用于表示有效数字部分。实际上，由于隐含的前导1（即所谓的“隐藏位”），它提供了24位的有效精度。
      3. 数值范围：大约为±1.18×10^-38 到 ±3.4×10^38。
      4. 精度：大约6-9位十进制数字。
   2. 双精度64位
      1. 位数：双精度使用64位（8字节）来存储一个浮点数。
      2. 组成：
         1. 1位符号位（S）：同样用于表示正负号。
         2. 11位指数位（E）：提供更大的指数范围。
         3. 52位尾数位（M）：加上隐含的前导1，总共提供53位的有效精度。
      3. 数值范围：大约为±2.23×10^-308 到 ±1.80×10^308。
      4. 精度：大约15-17位十进制数字。
   3. javascript 中的IEEE 754双精度是如何对数字进行存储的转换的： https://zhuanlan.zhihu.com/p/351127362
4. js中Number底层存储是双精度64位的，js中位运算是32位的，使用的补码（two's complement）形式的`有符号32位整数`。

### 特性

| 位运算            | 用法      | 描述                                                                        |
| ----------------- | --------- | --------------------------------------------------------------------------- |
| 按位与(`&`)       | `a & b`   | 对于每一个比特位,两个操作数都为 1 时, 结果为 1, 否则为 0                    |
| 按位或(`\|`)      | `a \| b`  | 对于每一个比特位,两个操作数都为 0 时, 结果为 0, 否则为 1                    |
| 按位异或(`^`)     | `a ^ b`   | 对于每一个比特位,两个操作数相同时, 结果为 0, 否则为 1                       |
| 按位非(`~`)       | `~ a`     | 反转操作数的比特位, 即 0 变成 1, 1 变成 0                                   |
| 左移(`<<`)        | `a << b`  | 将 a 的二进制形式向左移 b (< 32) 比特位, 右边用 0 填充                      |
| 有符号右移(`>>`)  | `a >> b`  | 将 a 的二进制形式向右移 b (< 32) 比特位, 丢弃被移除的位, 左侧以最高位来填充 |
| 无符号右移(`>>>`) | `a >>> b` | 将 a 的二进制形式向右移 b (< 32) 比特位, 丢弃被移除的位, 并用 0 在左侧填充  |

- 位运算：在[`ES5`规范中](https://www.ecma-international.org/ecma-262/5.1/#sec-11.10), 对二进制位运算的说明如下:
意思是会将位运算中的左右操作数都转换为`有符号32位整型`, 且返回结果也是`有符号32位整型`
  - 所以当操作数是浮点型时首先会被转换成整型, 再进行位运算
  - 当操作数过大, 超过了`Int32`范围, 超过的部分会被截取

- 通过以上知识的回顾, 要点如下:
  1. 位运算只能在整型变量之间进行运算
  2. js 中的`Number`类型在底层都是以浮点数(参考 IEEE754 标准)进行存储.
  3. js 中所有的按位操作符的操作数都会被[转成补码（two's complement）](https://www.ecma-international.org/ecma-262/5.1/#sec-9.5)形式的`有符号32位整数`.

- 所以在 js 中使用位运算时, 有 2 种情况会造成结果异常:

  1. 操作数为浮点型(虽然底层都是浮点型, 此处理解为显示性的浮点型)
   - 转换流程: 浮点数 -> 整数(丢弃小数位) -> 位运算
  2. 操作数的大小超过`Int32`范围(`-2^31 ~ 2^31-1`). 超过范围的二进制位会被截断, 取`低位32bit`.

   ```
         Before: 11100110111110100000000000000110000000000001
         After:              10100000000000000110000000000001
   ```

另外由于 js 语言的[隐式转换](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Equality_comparisons_and_sameness), 对非`Number`类型使用位运算操作符时会发生隐式转换, 相当于先使用`Number(xxx)`将其转换为`number`类型, 再进行位运算:

```js
'str' >>> 0; //  ===> Number('str') >>> 0  ===> NaN >>> 0 = 0
```

### 基本使用

为了方便比较, 以下演示代码中的注释, 都写成了 8 位二进制数(上文已经说明, 事实上在 js 中, 位运算最终的结果都是 Int32).

枚举属性:

通过位移的方式, 定义一些枚举常量

```js
const A = 1 << 0; // 0b00000001
const B = 1 << 1; // 0b00000010
const C = 1 << 2; // 0b00000100
```

位掩码:

通过位移定义的一组枚举常量, 可以利用位掩码的特性, 快速操作这些枚举产量(增加, 删除, 比较).

1. 属性增加`|`
   1. `ABC = A | B | C`
2. 属性删除`& ~`
   1. `AB = ABC & ~C`
3. 属性比较
   1. AB 当中包含 B: `AB & B === B`
   2. AB 当中不包含 C: `AB & C === 0`
   3. A 和 B 相等: `A === B`

```js
const A = 1 << 0; // 0b00000001
const B = 1 << 1; // 0b00000010
const C = 1 << 2; // 0b00000100

// 增加属性
const ABC = A | B | C; // 0b00000111
// 删除属性
const AB = ABC & ~C; // 0b00000011

// 属性比较
// 1. AB当中包含B
console.log((AB & B) === B); // true
// 2. AB当中不包含C
console.log((AB & C) === 0); // true
// 3. A和B相等
console.log(A === B); // false
```

### React 当中的使用场景

在 react 核心包中, 位运算使用的场景非常多. 此处只列举出了使用频率较高的示例.

#### 优先级管理 lanes

lanes 是`17.x`版本中开始引入的重要概念, 代替了`16.x`版本中的`expirationTime`, 作为`fiber`对象的一个属性(位于`react-reconciler`包), 主要控制 fiber 树在构造过程中的优先级(这里只介绍位运算的应用, 对于 lanes 的深入分析在[`优先级管理`](../main/priority.md)章节深入解读).

变量定义:

首先看源码[ReactFiberLane.js](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberLane.js#L74-L103)中的定义

```js
//类型定义
export opaque type Lanes = number;
export opaque type Lane = number;

// 变量定义
export const NoLanes: Lanes = /*                        */ 0b0000000000000000000000000000000;
export const NoLane: Lane = /*                          */ 0b0000000000000000000000000000000;

export const SyncLane: Lane = /*                        */ 0b0000000000000000000000000000001;
export const SyncBatchedLane: Lane = /*                 */ 0b0000000000000000000000000000010;

export const InputDiscreteHydrationLane: Lane = /*      */ 0b0000000000000000000000000000100;
const InputDiscreteLanes: Lanes = /*                    */ 0b0000000000000000000000000011000;

const InputContinuousHydrationLane: Lane = /*           */ 0b0000000000000000000000000100000;
const InputContinuousLanes: Lanes = /*                  */ 0b0000000000000000000000011000000;
// ...
// ...

const NonIdleLanes = /*                                 */ 0b0000111111111111111111111111111;

export const IdleHydrationLane: Lane = /*               */ 0b0001000000000000000000000000000;
const IdleLanes: Lanes = /*                             */ 0b0110000000000000000000000000000;

export const OffscreenLane: Lane = /*                   */ 0b1000000000000000000000000000000;
```

源码中`Lanes`和`Lane`都是`number`类型, 并且将所有变量都使用二进制位来表示.

注意: 源码中变量只列出了 31 位, 由于 js 中位运算都会转换成`Int32`(上文已经解释), 最多为 32 位, 且最高位是符号位. 所以除去符号位, 最多只有 31 位可以参与运算.

[方法定义](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberLane.js#L121-L194):

```js
function getHighestPriorityLanes(lanes: Lanes | Lane): Lanes {
  // 判断 lanes中是否包含 SyncLane
  if ((SyncLane & lanes) !== NoLanes) {
    return_highestLanePriority = SyncLanePriority;
    return SyncLane;
  }
  // 判断 lanes中是否包含 SyncBatchedLane
  if ((SyncBatchedLane & lanes) !== NoLanes) {
    return_highestLanePriority = SyncBatchedLanePriority;
    return SyncBatchedLane;
  }
  // ...
  // ... 省略其他代码
  return lanes;
}
```

在方法定义中, 也是通过位掩码的特性来判断二进制形式变量之间的关系. 除了常规的位掩码操作外, 特别说明其中 2 个技巧性强的函数:

1. `getHighestPriorityLane`: 分离出最高优先级

```js
function getHighestPriorityLane(lanes: Lanes) {
  return lanes & -lanes;
}
```

通过`lanes & -lanes`可以分离出所有比特位中最右边的 1, 具体来讲:

- 假设 `lanes(InputDiscreteLanes) = 0b0000000000000000000000000011000`
- 那么 `-lanes = 0b1111111111111111111111111101000`
- 所以 `lanes & -lanes = 0b0000000000000000000000000001000`
- 相比最初的 InputDiscreteLanes, 分离出来了`最右边的1`
- 通过 lanes 的定义, 数字越小的优先级越高, 所以此方法可以获取`最高优先级的lane`
-

2. `getLowestPriorityLane`: 分离出最低优先级

```js
function getLowestPriorityLane(lanes: Lanes): Lane {
  // This finds the most significant non-zero bit.
  const index = 31 - clz32(lanes);
  return index < 0 ? NoLanes : 1 << index;
}
```

`clz32(lanes)`返回一个数字在转换成 32 无符号整形数字的二进制形式后, 前导 0 的个数([MDN 上的解释](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32))

- 假设 `lanes(InputDiscreteLanes) = 0b0000000000000000000000000011000`
- 那么 `clz32(lanes) = 27`, 由于 InputDiscreteLanes 在源码中被书写成了 31 位, 虽然在字面上前导 0 是 26 个, 但是转成标准 32 位后是 27 个
- `index = 31 - clz32(lanes) = 4`
- 最后 `1 << index = 0b0000000000000000000000000010000`
- 相比最初的 InputDiscreteLanes, 分离出来了`最左边的1`
- 通过 lanes 的定义, 数字越小的优先级越高, 所以此方法可以获取最低优先级的 lane

#### 执行上下文 ExecutionContext

`ExecutionContext`定义与`react-reconciler`包中, 代表`reconciler`在运行时的上下文状态(在`reconciler 执行上下文`章节中深入解读, 此处介绍位运算的应用).

[变量定义](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberWorkLoop.old.js#L247-L256):

```js
export const NoContext = /*             */ 0b0000000;
const BatchedContext = /*               */ 0b0000001;
const EventContext = /*                 */ 0b0000010;
const DiscreteEventContext = /*         */ 0b0000100;
const LegacyUnbatchedContext = /*       */ 0b0001000;
const RenderContext = /*                */ 0b0010000;
const CommitContext = /*                */ 0b0100000;
export const RetryAfterError = /*       */ 0b1000000;

// ...

// Describes where we are in the React execution stack
let executionContext: ExecutionContext = NoContext;
```

注意: 和`lanes`的定义不同, `ExecutionContext`类型的变量, 在定义的时候采取的是 8 位二进制表示(因为变量的数量少, 8 位就够了, 没有必要写成 31 位).

使用(由于使用的地方较多, 所以举一个[代表性强的例子](https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberWorkLoop.old.js#L517-L619), `scheduleUpdateOnFiber` 函数是`react-reconciler`包对`react`包暴露出来的 api, 每一次更新都会调用, 所以比较特殊):

```js
// scheduleUpdateOnFiber函数中包含了好多关于executionContext的判断(都是使用位运算)
export function scheduleUpdateOnFiber(
  fiber: Fiber,
  lane: Lane,
  eventTime: number,
) {
  if (root === workInProgressRoot) {
    // 判断: executionContext 不包含 RenderContext
    if (
      deferRenderPhaseUpdateToNextBatch ||
      (executionContext & RenderContext) === NoContext
    ) {
      // ...
    }
  }
  if (lane === SyncLane) {
    if (
      // 判断: executionContext 包含 LegacyUnbatchedContext
      (executionContext & LegacyUnbatchedContext) !== NoContext &&
      // 判断: executionContext 不包含 RenderContext或CommitContext
      (executionContext & (RenderContext | CommitContext)) === NoContext
    ) {
      // ...
    }
  }
  // ...
}
```

### 总结

本节介绍了位运算的基本使用, 并列举了位运算在`react`源码中的高频应用. 在特定的情况下, 使用位运算不仅是提高运算速度, 且位掩码能简洁和清晰的表示出二进制变量之间的关系. 二进制变量虽然有优势, 但是缺点也很明显, 不够直观, 扩展性不好(在 js 当中的二进制变量, 除去符号位, 最多只能使用 31 位, 当变量的数量超过 31 位就需要组合, 此时就会变得复杂). 在阅读源码时, 我们需要了解二级制变量和位掩码的使用. 但在实际开发中, 需要视情况而定, 不能盲目使用.

### 参考资料

[ECMAScript® Language Specification(Standard ECMA-262 5.1 Edition) Binary Bitwise Operators](https://www.ecma-international.org/ecma-262/5.1/#sec-11.10)

[浮点数的二进制表示](https://www.ruanyifeng.com/blog/2010/06/ieee_floating-point_representation.html)

[IEEE 754](https://zh.wikipedia.org/wiki/IEEE_754)


## React算法之深度优先遍历

对于树或图结构的搜索(或遍历)来讲, 分为深度优先(DFS)和广度优先(BFS).

### 递归和栈的关系扩展

> 具体递归和栈的关系扩展讲解：https://zh.javascript.info/recursion
> > 递归的本质也是个压栈出栈的过程：https://juejin.cn/post/6844903699584647176

1. 递归的应用
   1. 应用1：递归调用（如求x的n次方的计算函数、函数调用堆栈等）
      1. 递归的本质也是个压栈出栈的过程：https://juejin.cn/post/6844903699584647176
   2. 应用2：递归遍历（如深度优先搜索、前序遍历、中序遍历、后序遍历等）
      1. 也可以用递归本质栈的方式实现遍历：https://juejin.cn/post/6844903699584647176
2. 任何递归都可以用循环来重写。通常循环变体更有效\ 
   1. 但有时重写很难，尤其是函数根据条件使用不同的子调用，然后合并它们的结果，或者分支比较复杂时。而且有些优化可能没有必要，完全不值得。
   2. 递归可以使代码更短，更易于理解和维护。并不是每个地方都需要优化，大多数时候我们需要一个好代码，这就是为什么要使用它。

### 实现方式

DFS 的主流实现方式有 2 种.

- 递归(简单粗暴)
- 利用栈存储遍历路径(需要额外的空间)

> 具体递归和栈的关系扩展讲解：https://zh.javascript.info/recursion

```js
/**
 *优点：
  代码简洁：逻辑直接对应DFS的递归思想，代码量少且易于理解（如知识库[4]中的Python示例）。
  自然表达：对于树或图的遍历，递归天然符合“先深入子节点再回溯”的过程。
  
  缺点：
  栈溢出风险：递归深度过大时，系统栈可能溢出（如知识库[2]和[6]提到的阶乘或深度过大时的问题）。
  性能开销：递归涉及函数调用的压栈和弹栈操作，时间效率可能低于栈方式（尤其是重复计算的问题，如斐波那契数列）。
  调试困难：递归的多层嵌套可能导致调试复杂
 */
function Node() {
  this.name = '';
  this.children = [];
}

function dfs(node) {
  console.log('探寻阶段: ', node.name);
  node.children.forEach((child) => {
    dfs(child);
  });
  console.log('回溯阶段: ', node.name);
}
```
```js
/**
 *优点：
  避免栈溢出风险：递归深度过大时可能导致系统栈溢出（如处理超大递归深度），而手动管理的栈可通过动态内存或数组扩展容量。
  可控性更高：可以灵活调整栈的大小或优化遍历顺序（例如按需调整子节点的压栈顺序）。
  性能优化：避免递归函数调用的额外开销（如函数调用栈的维护、参数传递等），尤其在大规模数据时更高效。

  缺点：
  代码复杂度高：需要手动维护栈的入栈、出栈操作，逻辑相对递归更复杂。
  可读性差：递归的代码更简洁直观，而栈方式需要显式管理节点状态（如 visited 标记）。
 */
function Node() {
  this.name = '';
  this.children = [];

  // 因为要分辨探寻阶段和回溯阶段, 所以必须要一个属性来记录是否已经访问过该节点
  // 如果不打印探寻和回溯, 就不需要此属性
  this.visited = false;
}
/**
 * 初始栈：[A] 
 *  A
 *  |
 * B- C
 * 将子节点倒叙送入栈中
 * 探寻阶段后：[A,C,B]----while循环的执行顺序：ABC
 */
function dfs(node) {
  const stack = [];
  stack.push(node);
  // 栈顶元素还存在, 就继续循环
  while ((node = stack[stack.length - 1])) {
    if (node.visited) {
      console.log('回溯阶段: ', node.name);
      // 回溯完成, 弹出该元素
      stack.pop();
    } else {
      console.log('探寻阶段: ', node.name);
      node.visited = true;
      // 利用栈的先进后出的特性, 倒序将节点送入栈中
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }
}
```

### React 当中的使用场景

深度优先遍历在react当中的使用非常典型, 最主要的使用时在ReactElement和fiber树的构造过程. 其次是在使用context时, 需要深度优先地查找消费context的节点

#### ReactElement "树"的构造

在react-reconciler包中, ReactElement的构造过程实际上是嵌套在fiber树构造循环过程中的, 与fiber树的构造是相互交替进行的(在fiber 树构建章节中详细解读, 本节只介绍深度优先遍历的使用场景).

ReactElement树的构造, 实际上就是各级组件render之后的总和. 整个过程体现在reconciler工作循环之中.

源码位于ReactFiberWorkLoop.js中, 此处为了简明, 已经将源码中与 dfs 无关的旁支逻辑去掉

```js
function workLoopSync() {
  // 1. 最外层循环, 保证每一个节点都能遍历, 不会遗漏
  while (workInProgress !== null) {
    performUnitOfWork(workInProgress);
  }
}

function performUnitOfWork(unitOfWork: Fiber): void {
  const current = unitOfWork.alternate;
  let next;
  // 2. beginWork是向下探寻阶段
  next = beginWork(current, unitOfWork, subtreeRenderLanes);
  if (next === null) {
    // 3. completeUnitOfWork 是回溯阶段
    completeUnitOfWork(unitOfWork);
  } else {
    workInProgress = next;
  }
}

function completeUnitOfWork(unitOfWork: Fiber): void {
  let completedWork = unitOfWork;
  do {
    const current = completedWork.alternate;
    const returnFiber = completedWork.return;
    let next;
    // 3.1 回溯并处理节点
    next = completeWork(current, completedWork, subtreeRenderLanes);
    if (next !== null) {
      // 判断在处理节点的过程中, 是否派生出新的节点
      workInProgress = next;
      return;
    }
    const siblingFiber = completedWork.sibling;
    // 3.2 判断是否有旁支
    if (siblingFiber !== null) {
      workInProgress = siblingFiber;
      return;
    }
    // 3.3 没有旁支 继续回溯
    completedWork = returnFiber;
    workInProgress = completedWork;
  } while (completedWork !== null);
}
```

#### fiber 树的构造

#### 查找 context 的消费节点

## React算法之堆排序

二叉堆是一种特殊的堆, 二叉堆是完全二叉树或者近似完全二叉树.

堆排序是利用二叉堆的特性, 对根节点(最大或最小)进行循环提取, 从而达到排序目的(堆排序本质上是一种选择排序), 时间复杂度为O(nlog n).

1. 二叉树和堆的图解概念见：https://zhuanlan.zhihu.com/p/683361016
2. 堆的应用
   1. 堆排序
   2. 优先队列
      1. 下方的react调度器的优先级队列就是使用的堆排序的优先队列应用，每次构建最大堆时，最大的条件就是比较优先级最大的提到最顶部


### 特性

- 父节点的值>=子节点的值(最大堆), 父节点的值<=子节点的值(最小堆). 每个节点的左子树和右子树都是一个二叉堆.
- 假设一个数组[k0, k1, k2, ...kn]下标从 0 开始. 
  - 则ki <= k2i+1,ki <= k2i+2 或者 ki >= k2i+1,ki >= k2i+2 (i = 0,1,2,3 .. n/2)
  - 该公式适用于二叉树的数组表示法.
  - 若k(i) <= k(2i+1)且k(i) <= k(2i+2)，则称为小顶堆。
  - 若k(i) >= k(2i+1)且k(i) >= k(2i+2)，则称为大顶堆。
### 实现

#### 排序过程

利用二叉堆的特性, 排序就是循环提取根节点的过程. 循环执行步骤 3, 直到将所有的节点都提取完成, 被提取的节点构成的数组就是一个有序数组.

注意:

如需升序排序, 应该构造最大堆. 因为最大的元素最先被提取出来, 被放置到了数组的最后, 最终数组中最后一个元素为最大元素.
如需降序排序, 应该构造最小堆. 因为最小的元素最先被提取出来, 被放置到了数组的最后, 最终数组中最后一个元素为最小元素.
堆排序是一种不稳定排序(对于相同大小的元素, 在排序之后有可能和排序前的先后次序被打乱)

#### 代码演示

将乱序数组[5,8,0,10,4,6,1]降序排列

详见： `heap.js文件`

### React当中使用场景

对于二叉堆的应用是在scheduler包中, 有 2 个数组taskQueue和timerQueue, 它们都是以最小堆的形式进行存储, 这样就能保证以O(1)的时间复杂度, 取到数组顶端的对象(优先级最高的 task).

具体的调用过程被封装到了SchedulerMinHeap.js, 其中有 2 个函数siftUp,siftDown分别对应向上调整和向下调整.

`react/packages/scheduler/src/SchedulerMinHeap.js`
```js
// SchedulerMinHeap.js

// peek函数: 查看堆的顶点, 也就是优先级最高的task或timer.
// pop函数: 将堆的顶点提取出来, 并删除顶点之后, 需要调用siftDown函数向下调整堆.
// push函数: 添加新节点, 添加之后, 需要调用siftUp函数向上调整堆.
// siftDown函数: 向下调整堆结构, 保证数组是一个最小堆.
// siftUp函数: 当插入节点之后, 需要向上调整堆结构, 保证数组是一个最小堆
```

## React算法之链表
## React算法之栈操作