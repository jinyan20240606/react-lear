# react-learn

学习react源码,  先从读代码开始，从react17.0源码细读

> 参考 [build-your-own-react，构建迷你react，仅几百行代码](https://pomb.us/build-your-own-react/)
> [参考github源码](https://github.com/chinanf-boy/didact)

## babel知识补充


> 快速熟悉参考：https://juejin.cn/post/7165912843315839012
> 对应项目练习见`babel-prac`文件夹


### 插件开发相关概念

> 开发示例讲解：https://juejin.cn/post/7143921535445631012

```js
// 插件基本结构
export default function createPlugin({ name, development }) {
  return declare((_, options) => ({
    name, // 插件名称
    inherits: jsx, // 继承JSX语法解析能力
    visitor: { // AST访问器
      Program: { /* 处理全局配置 */ },
      JSXElement: { /* 转换JSX元素 */ },
      JSXFragment: { /* 转换Fragment */ }
    }
  }))
}
```
1. babel 在使用 @babel/traverse 对 AST 进行深度遍历时，会 访问 每个 AST 节点，这个便是跟我们的 visitor 有关。babel 会在 访问 AST 节点的时候，调用 visitor  中对应 节点类型 的方法，这便是 babel 插件暴露给开发者的核心
2. AST语法树中常见节点类型
   1. 字面量节点
      1. NumericLiteral：数值字面量，如 123。
      2. StringLiteral：字符串字面量，如 'hello'。
      3. BooleanLiteral：布尔值字面量，如 true、false。
      4. NullLiteral：null 字面量。
      5. RegExpLiteral：正则表达式字面量，如 /abc/。
   2. 声明节点
      1. VariableDeclaration：变量声明，如 const a = 1;。
      2. FunctionDeclaration：函数声明，如 function foo() {}。
      3. ClassDeclaration：类声明，如 class MyClass {}。
   3. 表达式节点
      1. Identifier：标识符，标识符一般是变量名、函数名、属性名等。
      2. CallExpression：函数调用表达式，如 foo()。
      3. MemberExpression：成员表达式，如 obj.property。
      4. ArrowFunctionExpression：箭头函数表达式，如 () => {}。
      5. BinaryExpression：二元表达式，如 1 + 2。
   4. 语句节点
      1. ExpressionStatement：表达式语句，如 console.log('hello');。
      2. IfStatement：if 语句，如 if (condition) { ... }。
      3. ForStatement：for 循环语句。
      4. ReturnStatement：return 语句。
   5. JSX 节点
      1. JSXElement：JSX 元素，如 <div></div>。
      2. JSXIdentifier：JSX 标识符，如 div。
      3. JSXAttribute：JSX 属性，如 className="test"。
   6. 其他节点
      1. Program：代表整个程序，是 AST 的根节点。
      2. BlockStatement：代码块，如 { ... }。
   7. 注释节点
3. visitor 对象属性中的 path 参数是一个至关重要的对象，它代表了抽象语法树（AST）中节点的连接路径，封装了节点的大量信息与操作方法，能帮助开发者在遍历 AST 时对节点进行访问和修改

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
