# jsx编译原理

> 参考博客https://juejin.cn/post/6959948160525565960

## 启动调试

1. `npx babel ./index.jsx -w -o ./index.js`

## 经验记录

1. jsx编译原理,实际react项目中一般使用Babel来编译JSX，Babel会将JSX转换为React.createElement函数调用。
```js
 * 例如，下面的JSX：
 *           <div>Hello, world!</div>
 *       会被Babel编译为：
 *           React.createElement("div", null, "Hello, world!");
```

## babel编译jsx原理

> 参考https://juejin.cn/post/7186132321219641400
> 见preset-react-sourcecode文件夹

1. babel对于react16版本17版本后，新旧版本转换jsx的逻辑稍有不同：https://juejin.cn/post/7121397773911457822?from=search-suggest
   1. 官网中提到：目前，旧的转换的默认选项为 {"runtime": "classic"}。如需启用新的转换，你可以使用 {"runtime": "automatic"} 作为 @babel/plugin-transform-react-jsx 或 @babel/preset-react 的选项
2. babel的preset-react插件源码：`https://github.com/babel/babel/tree/main/packages/babel-preset-react/src`
   1. 重点梳理下这个源码逻辑即可
   2. 文件中可以看到，这是一个preset预设的插件组合，核心转换jsx的插件是@babel/plugin-transform-react-jsx这个包
3. 详细看@babel/plugin-transform-react-jsx这个包转化流程
   1. 插件源码：`https://github.com/babel/babel/tree/main/packages/babel-plugin-transform-react-jsx`