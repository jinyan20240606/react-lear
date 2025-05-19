module.exports = function(e) {
    return {
      // 该属性下可写对应的各种遍历到的节点类型
      visitor: {
        // 表达式节点：标识符类型
        Identifier (path) {
            console.log(path.name,'5=====')

        }
      }
    }
  }