// 导入Babel核心类型定义
//  import type { PluginPass, NodePath, Scope, Visitor } from "@babel/core";

const updateParamNameVisitor = {
  Identifier(path, state) {
    console.log(state,'8=====',this.paramName)
    if (path.node.name === this.paramName) {
      path.node.name = 'jinX';
    }
  }
};

// 获取原型链上的所有属性和方法（不包括 constructor）
function getAllPropertyNames(obj) {
  const props = new Set();
  let current = obj;
  while (current && current !== Object.prototype) {
    Reflect.ownKeys(current).forEach(prop => {
      if (prop !== 'constructor') {
        props.add(prop);
      }
    });
    current = Object.getPrototypeOf(current);
  }
  return [...props];
}

module.exports = function(e, t) {
    // 1e参是babel对象，提供了一些工具方法和API，例如parse、transform等。
    // 2t参是一个对象，包含了插件的传参的配置选项。
    // types属性：应该是继承的babel-types中的属性，用于操作AST节点类型的一些便捷方法，例如判断节点类型，创建节点等。
    console.log(Object.keys(e),Object.keys(t),'4=====')
    return {
      // 插件的名称，用于标识插件
      name: 'myPlugin',
      pre: function pre() {
        // 插件的预处理阶段，可以在这里执行一些初始化操作。
        console.log('pre=====') 
      },
      post: function post() {
        // 插件的后处理阶段，可以在这里执行一些清理操作。
        console.log('post=====')
      },
      // 该属性下可写对应的各种遍历到的节点类型
      // 当你有一个 Identifier() 成员方法的访问者时，你实际上是在访问路径而非节点,路径是个响应式的操作ast树的对象，表明ast树中的位置。
      // 路径对象还包含添加、更新、移动和删除节点有关的其他很多方法 
      // 通过这种方式，你操作的就是节点的响应式表示（译注：即路径）而非节点本身（https://github.com/jamiebuilds/babel-handbook/blob/master/translations/zh-Hans/plugin-handbook.md#paths-in-visitors%E5%AD%98%E5%9C%A8%E4%BA%8E%E8%AE%BF%E9%97%AE%E8%80%85%E4%B8%AD%E7%9A%84%E8%B7%AF%E5%BE%84）
      visitor: {
        // 标识符类型
        Identifier: {
          enter(path, state) {
            // state.opts 是插件的配置选项，例如：{ name: 'myPlugin' }
            // state.file 是当前文件的上下文对象，例如：文件名、路径、AST等。 
            // state是PluginPass的实例一般含有以下属性：源码位于https://github.com/babel/babel/blob/76c9cb754a29cf5adf1dd7dcf79d2f91de1e0eed/packages/babel-core/src/transformation/plugin-pass.ts#L4
            // code：文件的原始代码
            // ast：文件的AST
            // opts：插件的配置选项
            // metadata：文件的元数据，例如：文件名、路径等。
            // _map：是状态对象，state对象内置的一个Map字典，可以通过set，get方法存取自定义属性值
            // console.log(path.node.name,'3=====', state.opts, Object.keys(state.file), Object.keys(state.file.ast), state.file.code)
          },
        },
        // 声明节点：变量声明类型
        VariableDeclaration (path, state) {
          const allProps = getAllPropertyNames(state);
            console.log(path.node,'6=====', allProps, Reflect.ownKeys(state))
        },
        FunctionDeclaration(path, state) {
            // console.log(path.node,'7=====')
            const param = path.node.params[0];
            const paramName = param.name;
            param.name = "jinX";
            path.traverse(updateParamNameVisitor, { paramName });
        }
      }
    }
  }