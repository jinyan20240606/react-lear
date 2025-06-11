# react-learn

学习react源码,  先从读代码开始，从react17.0源码细读

> 参考 [build-your-own-react，构建迷你react，仅几百行代码](https://pomb.us/build-your-own-react/)
> [参考github源码](https://github.com/chinanf-boy/didact)

## babel知识补充

> 掘金课程体系最全：https://juejin.cn/book/6946117847848321055/section/6956174385904353288?enter_from=course_center&utm_source=course_center
> babel整体的介绍：https://juejin.cn/post/6998156876462424095#heading-5

> 对应项目练习见`babel-prac`文件夹

1. babel所有相关包的介绍文档：https://github.com/babel/babel/blob/781e23e85e5c1b2165d4cfabcaf98c9ab699240a/packages/README.md
2. @babel/types的共3种用途介绍：https://juejin.cn/post/6984945589859385358
   1. 类型集合：含有所有的AST节点类型，如Identifier、StringLiteral、NumericLiteral等。
      1. 官方文档中的Aliases别名就相当于所有ast类型的一个分类，有助于理解，如ts类型，jsx类型等
         1. https://www.babeljs.cn/docs/babel-types#node-builders
   2. 类型判断：提供了一系列的函数来判断AST节点的类型，如isIdentifier、isStringLiteral等。
      1. 包含ts类型保护的功能
   3. 创建节点：提供了一系列的函数来创建AST节点，如identifier、stringLiteral，jsx节点等。
      1. 可以直接底层通过编程ast节点由gen生成目标前端代码，博客有示例。
      2. 这包里面大概可以知道jsx一共有哪些节点类型，以及如何创建jsx节点。
      3. 详细AST常见节点的构建示例：https://segmentfault.com/a/1190000015660623#item-5
3. babel核心解析器是自己写的babylon(https://github.com/babel/babylon)解析器，通过babylon生成AST，后来移到现在的@babel/parser库里了
   1. 基于acorn(https://github.com/acornjs/acorn)基础上做了一些修改，比如支持jsx，支持typescript等
   2. eslint的parser叫espree，也是基于acorn

### 插件开发相关概念

> 官方文档的插件开发教程：https://github.com/jamiebuilds/babel-handbook/blob/master/translations/zh-Hans/plugin-handbook.md
> > 快速熟悉参考：https://juejin.cn/post/7165912843315839012

> 开发示例讲解：https://juejin.cn/post/7143921535445631012

1. babel插件的类型见这个官方包：https://github.com/babel/babel/blob/main/packages/babel-core/src/config/validation/plugins.ts#L82
```js
// 插件基本结构
export default function createPlugin({ name, development }) {
  return declare((_, options) => ({
    name, // 插件名称
    inherits: jsx, // 继承JSX语法解析能力，通过 Object.assign 的方式，和当前插件的 options 合并
    visitor: { // AST访问器
      Program: { /* 处理全局配置 */ },
      JSXElement: { /* 转换JSX元素 */ },
      JSXFragment: { /* 转换Fragment */ }
    },
    pre() { /* 插件初始化 */ },
    post() { /* 插件结束 */ },
    manipulateOptions(opts, parserOpts) { /* 用于修改 options，是在插件里面修改配置的方式 */ },
    parse(code, options) { /* 解析代码 */ },
  }))
}
```
1. babel 在使用 @babel/traverse 对 AST 进行深度遍历时，会 访问 每个 AST 节点，这个便是跟我们的 visitor 有关。babel 会在 访问 AST 节点的时候，调用 visitor  中对应 节点类型 的方法，这便是 babel 插件暴露给开发者的核心
2. AST语法树中常见节点类型
   1. https://juejin.cn/book/6946117847848321055/section/6946582409664004133?enter_from=course_center&utm_source=course_center
      1. 官网最全alias列举：https://www.babeljs.cn/docs/babel-types#aliases
   2. 字面量节点
      1. NumericLiteral：数值字面量，如 123。
      2. StringLiteral：字符串字面量，如 'hello'。
      3. BooleanLiteral：布尔值字面量，如 true、false。
      4. NullLiteral：null 字面量。
      5. RegExpLiteral：正则表达式字面量，如 /abc/。
   3. 声明节点
      1. VariableDeclaration：变量声明，如 const a = 1;。
      2. FunctionDeclaration：函数声明，如 function foo() {}。
      3. ClassDeclaration：类声明，如 class MyClass {}。
   4. 表达式节点
      1. Identifier：标识符，标识符一般是变量名、函数名、属性名等。
      2. CallExpression：函数调用表达式，如 foo()。
      3. MemberExpression：成员表达式(即表示引用对象成员的语句)，如 obj.property。
      4. ArrowFunctionExpression：箭头函数表达式，如 () => {}。
      5. BinaryExpression：二元表达式，如 1 + 2。
      6. 数组表达式
      7. 赋值表达式
      8. 一元表达式
      9. class表达式
   5. 语句节点
      1. ExpressionStatement：表达式语句，如 console.log('hello');。
      2. IfStatement：if 语句，如 if (condition) { ... }。
      3. ForStatement：for 循环语句。
      4. ReturnStatement：return 语句。
   6. JSX 节点
      1. JSXElement：JSX 元素，如 <div></div>。
      2. JSXIdentifier：JSX 标识符，如 div。
      3. JSXAttribute：JSX 属性，如 className="test"。
   7. 其他节点
      1. Program：代表整个程序，是 AST 的根节点。
      2. BlockStatement：代码块，如 { ... }。
   8. 注释节点
3. visitor 对象属性中的 path 参数是一个至关重要的对象，它代表了抽象语法树（AST）中节点的连接路径，封装了节点的大量信息与操作方法，能帮助开发者在遍历 AST 时对节点进行访问和修改
4. 插件开发相关api可以参考@babel/traverse即babel-traverse包，@babel/types 包也就是babel-types包的类型定义，好像没有专门的api文档
5. 插件执行顺序在preset前，从前往后依次执行，preset是从后往前依次执行

#### API积累

1. path对象
   1. get(key) 获取某个属性的 path
   2. set(key, node) 设置某个属性的值
   3. path.container 当前 AST 节点所在的父节点属性的属性值
   4. path.key 当前 AST 节点所在父节点属性的属性名或所在数组的下标
   5. path.listkey 当前 AST 节点所在父节点属性的属性值为数组时 listkey 为该属性名，否则为 undefined
   6. `path.pushContainer(key, nodes);`：将属性节点添加到 JSX 元素的当前节点容器的attr数组列表中。
      1. key: 目标节点上的某个属性名，通常是数组类型的字段（如 "body"、"arguments"、"attributes" 等
      2. nodes: 要插入的一个或多个 AST 节点（可以是数组）
   7. path.replaceWith(node)：将当前路径指向的 AST 节点替换为你传入的新节点
2. babel-types方法
   1.  t.inherits(newNode, oldNode)
       1.  将 oldNode（原始 JSX 节点）上的所有元信息（如源码位置 loc、注释、leading/trailing 空格等）复制到新的 AST 节点 newNode（即 callExpr）上
   2.  t.isJSXElement (node)：检查节点是否为 JSX 元素。
   3.  path.node.value = t.jsxExpressionContainer(path.node.value);  
       1. 表示这是一个“表达式”而不是普通的文本或属性值

### 开发过程
1. 插件开发时，我们需要在 visitor访问器中，针对不同的节点类型，编写对应的处理逻辑。
   1. 可以通过babel-playground在线广场中可视化ast树，对照着ast进行开发
2. 运行命令：`yarn example`

## jsx编译原理

> 见jsx-compile项目实践

## 百行代码构建mini-react

### 1. 创建createElement方法

### 2. 创建render方法

### 3. 实现Concurrent Mode

```javascript
/**
 * 3. 实现并发模式 Concurrent Mode
 *   3.1 上面的render里的递归实现问题：一旦我们开始渲染，我们就不会停止，直到我们渲染了完整的元素树。如果元素树很大，
 *       它可能会阻塞主线程太长时间。如果浏览器需要做一些高优先级的事情，比如处理用户输入或保持动画流畅，它将不得不等待渲染完成
 *   因此，我们需要将把工作分解成小单元，在我们完成每个单元后，如果还有其他需要完成的工作，我们将让浏览器中断渲染。
 */
let nextUnitOfWork = null;
function workLoop(deadline) {
  // deadline参数：我们可以使用它来检查在浏览器需要再次控制之前还有多少时间
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    // 判断浏览器有没有空闲时间，若小于1ms，我们认为应该阻断当前渲染，及时让权浏览器渲染绘制
    shouldYield = deadline.timeRemaining() < 1;
  }
  // 我们使用requestIdleCallback来进行循环。您可以将requestIdleCallback看作一个setTimeout，
  // 但是不是我们告诉它什么时候运行，而是浏览器在主线程空闲时运行回调。
  requestIdleCallback(workLoop);
}

requestIdleCallback(workLoop);

function performUnitOfWork(nextUnitOfWork) {
  // TODO
}
```

### 4. 实现Fiber架构

### 5. 实现 Render(协调器) 与Commit(渲染器) 两大核心阶段

### 6. 实现diff算法 - Reconcilation

### 7. 实现函数式组件化

### 8. 实现 Hooks 能力
