const updateParamNameVisitor = {
  Identifier(path, state) {
    console.log(state,'8=====',this.paramName)
    if (path.node.name === this.paramName) {
      path.node.name = 'jinX';
    }
  }
};

module.exports = function(e) {
    // types属性：应该是继承的babel-types中的属性，用于操作AST节点类型的一些便捷方法，例如判断节点类型，创建节点等。
    console.log(e.types,'4=====')
    return {
      // 该属性下可写对应的各种遍历到的节点类型
      // 当你有一个 Identifier() 成员方法的访问者时，你实际上是在访问路径而非节点,路径是个响应式的操作ast树的对象，表明ast树中的位置。
      // 路径对象还包含添加、更新、移动和删除节点有关的其他很多方法 
      // 通过这种方式，你操作的就是节点的响应式表示（译注：即路径）而非节点本身（https://github.com/jamiebuilds/babel-handbook/blob/master/translations/zh-Hans/plugin-handbook.md#paths-in-visitors%E5%AD%98%E5%9C%A8%E4%BA%8E%E8%AE%BF%E9%97%AE%E8%80%85%E4%B8%AD%E7%9A%84%E8%B7%AF%E5%BE%84）
      visitor: {
        // 标识符类型
        Identifier (path, state) {
            console.log(path.node.name,'5=====')
        },
        // 声明节点：变量声明类型
        VariableDeclaration (path, state) {
            console.log(path.node,'6=====')
        },
        FunctionDeclaration(path, state) {
            console.log(path.node,'7=====')
            const param = path.node.params[0];
            const paramName = param.name;
            param.name = "jinX";
            path.traverse(updateParamNameVisitor, { paramName });
        }
      }
    }
  }