/**
 * preset-react 是 Babel 的一个预设，用于支持编译 React 应用程序中的 JSX 语法。它包含了多个插件，用于处理 JSX 到 JavaScript 的转换。
 * 1. 转换jsx的插件：主要是@babel/plugin-transform-react-jsx 这个包，可以详细看下他的转化过程
 * 
 * 
 * 以下是对 preset-react 的详细解释：
 * 1. 插件列表：
 *    - transform-react-jsx：用于转换 JSX 到 React.createElement 的调用。
 *    - transform-react-jsx-development：用于开发环境下的 JSX 转换，包含了额外的错误检查和调试信息。
 *    - transform-react-display-name：用于为组件添加 displayName 属性，方便调试和错误报告。
 *    - transform-react-pure-annotations：用于添加 @pure 注解到函数组件，以提高性能。
 */
// @ts-nocheck
// 导入必要的Babel工具和插件
import { declarePreset } from "@babel/helper-plugin-utils"; // 用于声明Babel预设的工具函数
import transformReactJSX from "@babel/plugin-transform-react-jsx"; // 用于转换React JSX的插件（生产环境）
import transformReactJSXDevelopment from "@babel/plugin-transform-react-jsx-development"; // 用于转换React JSX的插件（开发环境）
import transformReactDisplayName from "@babel/plugin-transform-react-display-name"; // 用于添加组件displayName的插件
import transformReactPure from "@babel/plugin-transform-react-pure-annotations"; // 用于添加纯组件标记的插件
import normalizeOptions from "./normalize-options.ts"; // 本地工具函数，用于规范化配置选项

// 定义规范化Options接口，描述所有可用的配置选项
export interface Options {
  development?: boolean; // 用于指定是否启用开发模式下的 JSX 转换（默认为false）
  importSource?: string; // 用于指定导入 React 的模块路径（默认为'@babel/runtime/helpers/esm/react'）
  pragma?: string; // 用于指定 JSX 转换时使用的函数名（默认为'React.createElement'）
  pragmaFrag?: string; // 用于指定 Fragment 组件的函数名
  pure?: string; // 用于指定是否启用 @pure 注解
  runtime?: "automatic" | "classic"; // 指定 JSX 转换时使用的运行时模式（默认为'automatic'）
  throwIfNamespace?: boolean; // 指定是否在遇到 XML 命名空间时抛出错误
  useBuiltIns?: boolean; // 指定是否使用内建的 React 函数
  useSpread?: boolean; // 指定是否使用展开运算符
}

// 导出默认预设主体函数
export default declarePreset((api, opts: Options) => {
  // 断言Babel版本必须>=7
  api.assertVersion(REQUIRED_VERSION(7));

  // 解构并规范化配置选项
  const {
    development = process.env.BABEL_8_BREAKING
      ? api.env((env) => env === "development") // Babel 8中根据环境自动判断
      : false, // Babel 7及以下默认为false
    importSource,
    pragma,
    pragmaFrag,
    pure,
    runtime,
    throwIfNamespace,
  } = normalizeOptions(opts);

  // 返回预设配置对象
  return {
    plugins: [
      // 第一个插件：根据环境选择JSX转换器
      [
        development ? transformReactJSXDevelopment : transformReactJSX, // 根据开发环境选择插件
        process.env.BABEL_8_BREAKING
          ? {
              // Babel 8的配置
              importSource,
              pragma,
              pragmaFrag,
              runtime,
              throwIfNamespace,
              pure,
            }
          : {
              // Babel 7及以下的配置
              importSource,
              pragma,
              pragmaFrag,
              runtime,
              throwIfNamespace,
              pure,
              useBuiltIns: !!opts.useBuiltIns, // 强制转换为布尔值
              useSpread: opts.useSpread,
            },
      ],
      // 第二个插件：添加displayName
      transformReactDisplayName,
      // 第三个插件：如果pure不为false则添加纯组件标记
      pure !== false && transformReactPure,
    ].filter(Boolean), // 过滤掉可能存在的false值
  };
});
