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