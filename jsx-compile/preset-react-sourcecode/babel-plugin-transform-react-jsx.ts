/**
 * 这是babel-plugin-transform-react-jsx插件源码核心文件：https://github.com/babel/babel/blob/main/packages/babel-plugin-transform-react-jsx/src/create-plugin.ts
 * 
 * 1. 主要功能是将 JSX 语法转换为 React 函数调用，支持经典（classic）和自动（automatic）两种运行时模式
 */
// @ts-nocheck
// 导入JSX语法解析插件
import jsx from "@babel/plugin-syntax-jsx";
// 导入插件工具声明函数
import { declare } from "@babel/helper-plugin-utils";
// 导入Babel核心模板和类型工具
import { template, types as t } from "@babel/core";
// 导入Babel核心类型定义
import type { PluginPass, NodePath, Scope, Visitor } from "@babel/core";
// 导入模块导入相关的辅助函数
import {
  // 添加具名导入节点
  addNamed,
  // 添加命名空间导入节点
  addNamespace,
  // 判断当前文件是否使用了 import/export，即是否为 ESM模块语法
  isModule
} from "@babel/helper-module-imports";//https://www.babeljs.cn/docs/babel-helper-module-imports
// 导入纯函数注解工具
import annotateAsPure from "@babel/helper-annotate-as-pure";
// 导入Babel类型定义
import type {
  CallExpression,
  Class,
  Expression,
  Identifier,
  JSXAttribute,
  JSXElement,
  JSXFragment,
  JSXOpeningElement,
  JSXSpreadAttribute,
  MemberExpression,
  ObjectExpression,
  Program,
} from "@babel/types";

// 默认配置常量
const DEFAULT = {
  importSource: "react", // 默认导入源为react
  runtime: "automatic", // 默认运行时模式为automatic
  /** 编译指示：React.createElement */
  pragma: "React.createElement", // 默认pragma为React.createElement
  /** 编译指示 React.fragment */
  pragmaFrag: "React.Fragment", // 默认pragmaFrag为React.Fragment
};

// 正则表达式，用于从注释中提取JSX导入源
// const comment = "  * @jsxImportSource vue-jsx  ";
// 直接正则的comment.match(regex)[1]取到vue-jsx的内容
const JSX_SOURCE_ANNOTATION_REGEX =
  /^\s*(?:\*\s*)?@jsxImportSource\s+(\S+)\s*$/m;
// 正则表达式，用于从注释中提取JSX运行时模式
const JSX_RUNTIME_ANNOTATION_REGEX = /^\s*(?:\*\s*)?@jsxRuntime\s+(\S+)\s*$/m;

// 正则表达式，用于从注释中提取JSX pragma
const JSX_ANNOTATION_REGEX = /^\s*(?:\*\s*)?@jsx\s+(\S+)\s*$/m;
// 正则表达式，用于从注释中提取JSX fragment pragma
const JSX_FRAG_ANNOTATION_REGEX = /^\s*(?:\*\s*)?@jsxFrag\s+(\S+)\s*$/m;

// 获取插件状态中的值
const get = (pass: PluginPass, name: string) =>
  pass.get(`@babel/plugin-react-jsx/${name}`);
/** 设置插件状态中的值 */
const set = (pass: PluginPass, name: string, v: any) =>
  pass.set(`@babel/plugin-react-jsx/${name}`, v);

// 检查对象表达式是否包含__proto__属性
function hasProto(node: t.ObjectExpression) {
  return node.properties.some(
    value =>
      t.isObjectProperty(value, { computed: false, shorthand: false }) &&
      (t.isIdentifier(value.key, { name: "__proto__" }) ||
        t.isStringLiteral(value.key, { value: "__proto__" })),
  );
}

// 插件选项接口定义
export interface Options {
  filter?: (node: t.Node, pass: PluginPass) => boolean; // 过滤函数
  importSource?: string; // 导入源
  pragma?: string; // pragma配置
  pragmaFrag?: string; // pragmaFrag配置
  pure?: string; // 纯函数标记
  runtime?: "automatic" | "classic"; // 运行时模式
  throwIfNamespace?: boolean; // 是否在命名空间时抛出错误
  useBuiltIns: boolean; // 是否使用内置函数
  useSpread?: boolean; // 是否使用展开语法
}

// 创建插件的主函数
export default function createPlugin({
  name, // 插件名称
  development, // 是否为开发环境
}: {
  name: string;
  development: boolean;
}) {
  // 声明并返回插件
  return declare((_, options: Options) => {
    // 解构插件选项
    const {
      pure: PURE_ANNOTATION, // 纯函数注解

      throwIfNamespace = true, // 默认在命名空间时抛出错误

      filter, // 过滤函数

      // 根据环境确定默认运行时模式
      runtime: RUNTIME_DEFAULT = process.env.BABEL_8_BREAKING
        ? "automatic"
        : development
          ? "automatic"
          : "classic",

      // 默认导入源和pragma配置
      importSource: IMPORT_SOURCE_DEFAULT = DEFAULT.importSource,
      pragma: PRAGMA_DEFAULT = DEFAULT.pragma,
      pragmaFrag: PRAGMA_FRAG_DEFAULT = DEFAULT.pragmaFrag,
    } = options;

    // Babel 8特定的选项检查和错误处理
    if (process.env.BABEL_8_BREAKING) {
      // 在Babel 8中，useSpread选项不再可用
      if ("useSpread" in options) {
        throw new Error(
          '@babel/plugin-transform-react-jsx: Since Babel 8, an inline object with spread elements is always used, and the "useSpread" option is no longer available. Please remove it from your config.',
        );
      }

      // 在Babel 8中，useBuiltIns选项不再可用
      if ("useBuiltIns" in options) {
        const useBuiltInsFormatted = JSON.stringify(options.useBuiltIns);
        throw new Error(
          `@babel/plugin-transform-react-jsx: Since "useBuiltIns" is removed in Babel 8, you can remove it from the config.
- Babel 8 now transforms JSX spread to object spread. If you need to transpile object spread with
\`useBuiltIns: ${useBuiltInsFormatted}\`, you can use the following config
{
  "plugins": [
    "@babel/plugin-transform-react-jsx"
    ["@babel/plugin-transform-object-rest-spread", { "loose": true, "useBuiltIns": ${useBuiltInsFormatted} }]
  ]
}`,
        );
      }

      // 在automatic运行时模式下，filter选项不可用
      if (filter != null && RUNTIME_DEFAULT === "automatic") {
        throw new Error(
          '@babel/plugin-transform-react-jsx: "filter" option can not be used with automatic runtime. If you are upgrading from Babel 7, please specify `runtime: "classic"`.',
        );
      }
    } else {
      // Babel 7的选项处理
      // eslint-disable-next-line no-var
      var { useSpread = false, useBuiltIns = false } = options;

      // 在classic运行时模式下的选项验证
      if (RUNTIME_DEFAULT === "classic") {
        // 验证useSpread选项
        if (typeof useSpread !== "boolean") {
          throw new Error(
            "transform-react-jsx currently only accepts a boolean option for " +
              "useSpread (defaults to false)",
          );
        }

        // 验证useBuiltIns选项
        if (typeof useBuiltIns !== "boolean") {
          throw new Error(
            "transform-react-jsx currently only accepts a boolean option for " +
              "useBuiltIns (defaults to false)",
          );
        }

        // useSpread和useBuiltIns不能同时为true
        if (useSpread && useBuiltIns) {
          throw new Error(
            "transform-react-jsx currently only accepts useBuiltIns or useSpread " +
              "but not both",
          );
        }
      }
    }

    /**
     * 注入元属性的访问者
     * 
     * 这个访问者的作用是仅在JSX元素的开始标签中注入一些元属性，这些属性通常用于调试和性能优化。
     */
    const injectMetaPropertiesVisitor: Visitor<PluginPass> = {
      // 处理JSX开始标签
      JSXOpeningElement(path, state) {
        const attributes = [];
        // 如果允许使用this，添加__self属性
        if (isThisAllowed(path.scope)) {
          attributes.push(
            // 构建一个JSX属性节点，属性名为__self，值为this表达式
            // 示例：__self={this}
            t.jsxAttribute(
              t.jsxIdentifier("__self"),
              // 创建一个 this 表达式节点，表示 JavaScript 中的 this 关键字
              t.jsxExpressionContainer(t.thisExpression()),
            ),
          );
        }
        // 添加__source属性：表示源码位置信息
        // 结果如： __source={{ fileName: "MyApp.js", lineNumber: 10, columnNumber: 4 }}
        attributes.push(
          t.jsxAttribute(
            t.jsxIdentifier("__source"),
            t.jsxExpressionContainer(makeSource(path, state)),
          ),
        );
        // 将属性添加到JSX开始标签
        path.pushContainer("attributes", attributes);
      },
    };

    // 返回插件对象
    return {
      name, // 插件名称
      inherits: jsx, // 继承JSX语法插件
      visitor: {
        // 处理JSX命名空间名称
        JSXNamespacedName(path) {
          // 若 throwIfNamespace 为 true，遇到命名空间标签时抛出错误
          /**
           * 当你在 JSX 中使用了类似 svg:text 或 xlink:href 这样类似xml的“命名空间”语法时，就会生成 JSXNamespacedName 节点
           * <svg xmlns="http://www.w3.org/2000/svg">
              <svg:text>Text in SVG</svg:text>
             </svg>

           React 的 JSX 实现 并不支持命名空间标签，它的设计哲学是让 JSX 更贴近 JavaScript 表达式，而不是严格遵循 XML 规范
           */
          if (throwIfNamespace) {
            // 抛出错误：见插件开发手册https://juejin.cn/post/6844904055945314312
            throw path.buildCodeFrameError(
              `Namespace tags are not supported by default. React's JSX doesn't support namespace tags. \
You can set \`throwIfNamespace: false\` to bypass this warning.`,
            );
          }
        },

        // 处理JSX展开子元素（不支持）
        /**
         * 这就是jsx展开语法
         * <MyComponent>{...children}</MyComponent>
         * {
              "type": "JSXElement",
              "children": [
                {
                  "type": "JSXSpreadChild",
                  "expression": { "type": "Identifier", "name": "children" }
                }
              ]
            }
         *  
          为什么不支持：可读性差、无法分配子元素key、不利于静态分析优化
          正确用法是用children.map(li=><li key={li.id}>{li.name}</li>)
         */
        JSXSpreadChild(path) {
          throw path.buildCodeFrameError(
            "Spread children are not supported in React.",
          );
        },
        // 处理程序节点，只预生成表达式节点存起来，不做具体转换操作。----- 具体转化在后面的每个元素类型中操作
        // 在进入程序节点时执行以下操作：
        /**
         *  1、初始化运行时模式、ImportSource、pragma 和 pragmaFrag 配置。
            2、从文件注释中解析 @jsxImportSource、@jsxRuntime、@jsx 和 @jsxFrag 注释，更新配置。
            3、根据运行时模式进行不同处理：
              经典模式（classic）：直接生成替换importName对应的表达式节点，存入状态对象'@babel/plugin-react-jsx/id'下。
              自动模式（automatic）：额外处理自动导入的逻辑，再生成对应的表达式节点，存入状态对象'@babel/plugin-react-jsx/id'下。
            4、在开发环境下注入元信息，如文件路径，行号， __source 和 __self 元属性等
         */
        Program: {
          enter(path, state) {
            // 从state中拿到file上下文对象
            const { file } = state;
            let runtime: string = RUNTIME_DEFAULT; // 运行时模式

            // 初始化配置
            let source: string = IMPORT_SOURCE_DEFAULT; // 导入源
            let pragma: string = PRAGMA_DEFAULT; // pragma
            let pragmaFrag: string = PRAGMA_FRAG_DEFAULT; // pragmaFrag

            // 跟踪是否设置了配置: 布尔值
            let sourceSet = !!options.importSource;
            let pragmaSet = !!options.pragma;
            let pragmaFragSet = !!options.pragmaFrag;

            // 从文件注释中解析配置
            /**
             * 例如：
             *    /** @jsx My.createElement */
                  /** @jsxFrag My.Fragment */
                  /** @jsxImportSource vue-jsx */
                  /** @jsxRuntime automatic */
                  // 这些注释会被解析成对应的配置项。这样做的好处是：可以在不修改 Babel 配置的前提下，对单个文件定制 JSX 行为
             /**/
            if (file.ast.comments) {
              for (const comment of file.ast.comments) {
                // 正则匹配解析@jsxImportSource注释
                // "  * @jsxImportSource vue-jsx  "; 得到vue-jsx值
                const sourceMatches = JSX_SOURCE_ANNOTATION_REGEX.exec(
                  comment.value,
                );
                if (sourceMatches) {
                  source = sourceMatches[1];
                  sourceSet = true;
                }

                // 解析@jsxRuntime注释
                // 如：@jsxRuntime automatic
                const runtimeMatches = JSX_RUNTIME_ANNOTATION_REGEX.exec(
                  comment.value,
                );
                if (runtimeMatches) {
                  runtime = runtimeMatches[1];
                }

                // 解析@jsx注释
                // 如：@jsxImportSource preact
                const jsxMatches = JSX_ANNOTATION_REGEX.exec(comment.value);
                if (jsxMatches) {
                  pragma = jsxMatches[1];
                  pragmaSet = true;
                }
                // 解析@jsxFrag注释
                // 如：@jsxFrag Fragment
                const jsxFragMatches = JSX_FRAG_ANNOTATION_REGEX.exec(
                  comment.value,
                );
                if (jsxFragMatches) {
                  pragmaFrag = jsxFragMatches[1];
                  pragmaFragSet = true;
                }
              }
            }

            // 设置运行时模式
            // 将运行时模式配置参数设置到state的map状态对象中，方便后续使用
            set(state, "runtime", runtime);
            // 若经典模式
            if (runtime === "classic") {
              // classic模式下不能设置importSource
              if (sourceSet) {
                /**
                 * 经典模式下：Babel 不负责导入函数，只做字符串替换
                 * 
                 * 如：<div>Hello</div>    ====> 会被编译成React.createElement("div", null, "Hello");
                 * 如果你的代码中没有 import React from 'react';，那么运行时就会报错：React is not defined
                 * 原因：
                 * 1. 历史原因：模块系统还不统一（CommonJS vs ES Modules），为了灵活性和兼容性，React 团队决定让开发者 显式引入 React
                 * 2. 开发者可以选择使用哪个库作为 JSX 的运行时
                 */
                throw path.buildCodeFrameError(
                  `importSource cannot be set when runtime is classic.`,
                );
              }

              // 将 pragma 和 pragmaFrag 转换为 AST 成员表达式：创建createElement和fragment表达式
              // 如：React.createElement 转换为AST中的成员表达式对应ast节点
              const createElement = toMemberExpression(pragma);
              // 如：React.Fragment 转换为AST中的成员表达式对应的ast节点
              const fragment = toMemberExpression(pragmaFrag);

              // 克隆上面节点缓存到状态对象里
              set(state, "id/createElement", () => t.cloneNode(createElement));
              set(state, "id/fragment", () => t.cloneNode(fragment));

              // 设置是否是默认纯函数标记
              set(state, "defaultPure", pragma === DEFAULT.pragma);
            }
            // 若自动模式：需要额外处理导入逻辑
            else if (runtime === "automatic") {
              // automatic模式下不能设置pragma和pragmaFrag，即不能自定义React.createElement和React.fragment,后面都会自动注入新运行时函数
              // 即禁用的这些只试用于经典模式场景
              if (pragmaSet || pragmaFragSet) {
                throw path.buildCodeFrameError(
                  `pragma and pragmaFrag cannot be set when runtime is automatic.`,
                );
              }

              // 定义导入函数ast节点对象存入到状态对象中
              const define = (name: string, id: string) =>
                set(state, name, createImportLazily(state, path, id, source));

              // 根据环境定义不同的导入，
              define("id/jsx", development ? "jsxDEV" : "jsx");
              define("id/jsxs", development ? "jsxDEV" : "jsxs");
              define("id/createElement", "createElement");
              define("id/fragment", "Fragment");

              // 设置默认纯函数标记
              set(state, "defaultPure", source === DEFAULT.importSource);
            }
            // 若不是classic也不是automatic，则抛出错误
            else {
              // 运行时模式必须是classic或automatic
              throw path.buildCodeFrameError(
                `Runtime must be either "classic" or "automatic".`,
              );
            }

            // 在开发环境下注入元属性
            if (development) {
              path.traverse(injectMetaPropertiesVisitor, state);
            }
          },
        },

        // 处理JSX片段：处理<>...</>语法
        JSXFragment: {
          /**
           * 在 AST 遍历过程中，当遇到一个 JSXFragment 节点（即 <></> 这种没有标签名的 JSX 结构），
           * 在退出该节点时将其替换为一个函数调用表达式（如 React.createElement() 或 _jsxFragment() 等），以便在运行时创建虚拟 DOM
           */
          exit(path, file) {
            let callExpr;
            // 根据运行时模式选择不同的转换方法
            // 经典模式下：使用createElement函数创建虚拟DOM
            if (get(file, "runtime") === "classic") {
              callExpr = buildCreateElementFragmentCall(path, file);
            }
            // 自动模式下：使用jsxs函数创建虚拟DOM
            else {
              callExpr = buildJSXFragmentCall(path, file);
            }

            // 替换JSX片段为函数调用
            /**
             *  t.inherits(newNode, oldNode)：将 oldNode（原始 JSX 节点）上的所有元信息（如源码位置 loc、注释、leading/trailing 空格等）复制到新的 AST 节点 newNode（即 callExpr）上
             */
            path.replaceWith(t.inherits(callExpr, path.node));
          },
        },

        // 处理JSX元素的转换
        JSXElement: {
          /**
           * 将 JSX 元素（如 <div />、<MyComponent />）转换为对应的运行时函数调用（如 React.createElement(...) 或 _jsx(...)），以便在运行时创建虚拟 DOM
           */
          exit(path, file) {
            let callExpr;
            // 根据运行时模式和条件选择不同的转换方法
            if (
              // 经典模式下
              get(file, "runtime") === "classic" ||
              shouldUseCreateElement(path)
            ) {
              callExpr = buildCreateElementCall(path, file);
            }
            // 自动模式下
            else {
              callExpr = buildJSXElementCall(path, file);
            }

            // 替换JSX元素为函数调用
            path.replaceWith(t.inherits(callExpr, path.node));
          },
        },

        // 处理JSX属性：处理属性值中的jsx元素
        JSXAttribute(path) {
          /**
           * 当 JSX 属性值是一个 JSX 元素时，Babel 插件会自动将其包装为 JSXExpressionContainer，以
           * 便后续阶段能正确识别为表达式并转换为 React.createElement(...) 调用。否则元素的话后续的转换会命不中逻辑
           * 
           */
          if (t.isJSXElement(path.node.value)) {
            path.node.value = t.jsxExpressionContainer(path.node.value);
          }
        },
      },
    };

    // Returns whether the class has specified a superclass.
    /**
     * 判断给定的类是否是派生类(即是否有extends子句)
     */
    function isDerivedClass(classPath: NodePath<Class>) {
      return classPath.node.superClass !== null;
    }

    /** 
     * ast中判断当前作用域是否允许使用this
     * 
     * 原理：通过遍历作用域链（从当前作用域一直向上查找），通过几种场景判断 this 是否有效
     * 1. 允许使用this的情况
     *    1. 非箭头函数的函数体内部
     *    2. 类的方法(非构造函数)，即使是在构造函数中但不是派生类
     *    4. 全局作用域或模块顶层作用域之外
     * 2. 不允许使用this的情况
     *    1. 箭头函数
     *    2. TS模块块中
     *    3. 派生类（子类）的构造函数中
     *        - 在 ES6 类中，派生类（使用 extends）的构造函数中，必须先调用 super() 才能使用 this
     */
    function isThisAllowed(scope: Scope) {
      // This specifically skips arrow functions as they do not rewrite `this`.
      do {
        const { path } = scope;
        // 是否是一个函数节点且不是箭头函数
        if (path.isFunctionParent() && !path.isArrowFunctionExpression()) {
          if (!path.isMethod()) {
            // 如果不是类方法，说明是一个普通函数，允许使用 this
            // If the closest parent is a regular function, `this` will be rebound, therefore it is fine to use `this`.
            return true;
          }
          // Current node is within a method, so we need to check if the method is a constructor.
          // 如果是类方法，继续检查是不是构造函数
          if (path.node.kind !== "constructor") {
            // We are not in a constructor, therefore it is always fine to use `this`.
            return true;
          }
          // Now we are in a constructor. If it is a derived class, we do not reference `this`.
          return !isDerivedClass(path.parentPath.parentPath as NodePath<Class>);
        }
        if (path.isTSModuleBlock()) {
          // If the closest parent is a TS Module block, `this` will not be allowed.
          return false;
        }
      } while ((scope = scope.parent));
      // We are not in a method or function. It is fine to use `this`.
      return true;
    }

    /**
     * call(...) 是一个辅助函数，用来创建 React.createElement(...[args]) 的 AST 表达式。
     */
    function call(
      pass: PluginPass,
      name: string,
      args: CallExpression["arguments"],
    ) {
      // 1参是成员表达式，2参是数组参数。得到一个函数调用表达式节点 node
      const node = t.callExpression(get(pass, `id/${name}`)(), args);
      if (PURE_ANNOTATION ?? get(pass, "defaultPure")) annotateAsPure(node);
      return node;
    }

    // We want to use React.createElement, even in the case of
    // jsx, for <div {...props} key={key} /> to distinguish it
    // from <div key={key} {...props} />. This is an intermediary
    // step while we deprecate key spread from props. Afterwards,
    // we will stop using createElement in the transform.
    /**
     * 决定是否强制使用 createElement 模式
     * 
     * key 出现在 ...props 前面 → ✅ 可以用 _jsx()
     * 
     * key 出现在 ...props 后面 → ❌ 必须降级使用 React.createElement(...)
     * 
     * @param path 
     * @returns 
     */
    function shouldUseCreateElement(path: NodePath<JSXElement>) {
      const openingPath = path.get("openingElement");
      const attributes = openingPath.node.attributes;

      let seenPropsSpread = false;
      for (let i = 0; i < attributes.length; i++) {
        const attr = attributes[i];
        if (
          seenPropsSpread &&
          t.isJSXAttribute(attr) &&
          attr.name.name === "key"
        ) {
          return true;
        } else if (t.isJSXSpreadAttribute(attr)) {
          seenPropsSpread = true;
        }
      }
      return false;
    }

    /**
     * 将 JSX 中的 JSXIdentifier、JSXMemberExpression 和 JSXNamespacedName 类型节点，
     * 统一转换为 Babel 标准的 AST 表达式节点（如 Identifier、MemberExpression、StringLiteral 等），以便后续进行编译和运行时处理
     * 
     * - 为什么先先转化再提取标签名？
     *   1. JSXAST中openingPath.node.name 字段是一个多元的JSX节点类型（如 JSXIdentifier, JSXMemberExpression, JSXNamespacedName
     *      - JSXIdentifier 有 .name 字符串
     *      - JSXMemberExpression 没有 .name，而是 .object 和 .property
     *      - JSXNamespacedName 更是包含 .namespace 和 .name），
     *   2. 所以无法统一用.name 字符串来提取标签名，需要先转换为标准的AST节点类型，再提取标签名
     * 
     * @returns t.ThisExpression | t.StringLiteral | t.MemberExpression | t.Identifier
     *    1. "<div \/\>" -----> t.identifier("div")
     *    2. "<MyComponent \/\>" ------> t.identifier("MyComponent")
     *    3. "<my-component \/\>"" → stringLiteral("my-component")
     *    4. "<My.Component />" ------> t.memberExpression(t.identifier("My"), t.identifier("Component"))
     */
    function convertJSXIdentifier(
      node: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
      parent: t.JSXOpeningElement | t.JSXMemberExpression,
    ): t.ThisExpression | t.StringLiteral | t.MemberExpression | t.Identifier {
      // 若节点是JSXIdentifier
      if (t.isJSXIdentifier(node)) {
        // 类组件中组件名可以用this开头，如点一个属性时，this.props.xxx
        if (node.name === "this" && t.isReferenced(node, parent)) {
          return t.thisExpression();
        } else if (t.isValidIdentifier(node.name, false)) {
          // @ts-expect-error cast AST type to Identifier
          node.type = "Identifier";
          return node as unknown as t.Identifier;
        } else {
          return t.stringLiteral(node.name);
        }
      }
      // 若节点是JSXMemberExpression
      else if (t.isJSXMemberExpression(node)) {
        return t.memberExpression(
          convertJSXIdentifier(node.object, node),
          convertJSXIdentifier(node.property, node),
        );
      }
      // 若节点是JSXNamespacedName
      else if (t.isJSXNamespacedName(node)) {
        /**
         * If the flag "throwIfNamespace" is false
         * print XMLNamespace like string literal
         */
        return t.stringLiteral(`${node.namespace.name}:${node.name.name}`);
      }

      // todo: this branch should be unreachable
      return node;
    }

    function convertAttributeValue(
      node: t.JSXAttribute["value"] | t.BooleanLiteral,
    ) {
      if (t.isJSXExpressionContainer(node)) {
        return node.expression;
      } else {
        return node;
      }
    }

    function accumulateAttribute(
      array: ObjectExpression["properties"],
      attribute: NodePath<JSXAttribute | JSXSpreadAttribute>,
    ) {
      if (t.isJSXSpreadAttribute(attribute.node)) {
        const arg = attribute.node.argument;
        // Collect properties into props array if spreading object expression
        if (t.isObjectExpression(arg) && !hasProto(arg)) {
          array.push(...arg.properties);
        } else {
          array.push(t.spreadElement(arg));
        }
        return array;
      }

      const value = convertAttributeValue(
        attribute.node.name.name !== "key"
          ? attribute.node.value || t.booleanLiteral(true)
          : attribute.node.value,
      );

      if (attribute.node.name.name === "key" && value === null) {
        throw attribute.buildCodeFrameError(
          'Please provide an explicit key value. Using "key" as a shorthand for "key={true}" is not allowed.',
        );
      }

      if (
        t.isStringLiteral(value) &&
        !t.isJSXExpressionContainer(attribute.node.value)
      ) {
        value.value = value.value.replace(/\n\s+/g, " ");

        // "raw" JSXText should not be used from a StringLiteral because it needs to be escaped.
        delete value.extra?.raw;
      }

      if (t.isJSXNamespacedName(attribute.node.name)) {
        // @ts-expect-error mutating AST
        attribute.node.name = t.stringLiteral(
          attribute.node.name.namespace.name +
            ":" +
            attribute.node.name.name.name,
        );
      } else if (t.isValidIdentifier(attribute.node.name.name, false)) {
        // @ts-expect-error mutating AST
        attribute.node.name.type = "Identifier";
      } else {
        // @ts-expect-error mutating AST
        attribute.node.name = t.stringLiteral(attribute.node.name.name);
      }

      array.push(
        t.inherits(
          t.objectProperty(
            // @ts-expect-error The attribute.node.name is an Identifier now
            attribute.node.name,
            value,
          ),
          attribute.node,
        ),
      );
      return array;
    }

    function buildChildrenProperty(children: Expression[]) {
      let childrenNode;
      if (children.length === 1) {
        childrenNode = children[0];
      } else if (children.length > 1) {
        childrenNode = t.arrayExpression(children);
      } else {
        return undefined;
      }

      return t.objectProperty(t.identifier("children"), childrenNode);
    }

    // Builds JSX into:
    // Production: React.jsx(type, arguments, key)
    // Development: React.jsxDEV(type, arguments, key, isStaticChildren, source, self)
    /**
     * 自动模式下：将 JSX 元素转换为 React.jsx() 或 React.jsxDEV() 函数调用的核心函数
     */
    function buildJSXElementCall(path: NodePath<JSXElement>, file: PluginPass) {
      const openingPath = path.get("openingElement");
      // 1、使用 getTag(...) 获取 JSX 标签名
      const args: t.Expression[] = [getTag(openingPath)];

      const attribsArray = [];
      const extracted = Object.create(null);

      // for React.jsx, key, __source (dev), and __self (dev) is passed in as
      // a separate argument rather than in the args object. We go through the
      // props and filter out these three keywords so we can pass them in
      // as separate arguments later
      // 2、提取属性（attributes）
      for (const attr of openingPath.get("attributes")) {
        if (attr.isJSXAttribute() && t.isJSXIdentifier(attr.node.name)) {
          const { name } = attr.node.name;
          switch (name) {
            // __source 和 __self 是 React 在开发模式下用于调试的信息（例如显示组件的文件位置和调用栈）。如果重复定义这些属性，则会抛出错误
            case "__source":
            case "__self":
              if (extracted[name]) throw sourceSelfError(path, name);
            // key 属性是 React 中非常重要的一个属性，特别是在列表渲染时用于标识唯一性。它不能省略值（即不能只写 key 而不赋值），否则会抛出错误
            case "key": {
              const keyValue = convertAttributeValue(attr.node.value);
              if (keyValue === null) {
                throw attr.buildCodeFrameError(
                  'Please provide an explicit key value. Using "key" as a shorthand for "key={true}" is not allowed.',
                );
              }

              extracted[name] = keyValue;
              break;
            }
            // 其他所有非特殊属性被收集到 attribsArray 中，以便后续构造为对象表达式
            default:
              attribsArray.push(attr);
          }
        } else {
          attribsArray.push(attr);
        }
      }

      // 3、构建子元素（children）
      const children = t.react.buildChildren(path.node);

      // 4、构造props对象
      let attribs: t.ObjectExpression;

      if (attribsArray.length || children.length) {
        attribs = buildJSXOpeningElementAttributes(
          attribsArray,
          //@ts-expect-error The children here contains JSXSpreadChild,
          // which will be thrown later
          children,
        );
      } else {
        // attributes should never be null
        attribs = t.objectExpression([]);
      }

      // 5、构造最终参数集合
      args.push(attribs);

      if (development) {
        // isStaticChildren, __source, and __self are only used in development
        // automatically include __source and __self in this plugin
        // so we can eliminate the need for separate Babel plugins in Babel 8
        args.push(
          extracted.key ?? path.scope.buildUndefinedNode(),
          t.booleanLiteral(children.length > 1),
        );
        if (extracted.__source) {
          args.push(extracted.__source);
          if (extracted.__self) args.push(extracted.__self);
        } else if (extracted.__self) {
          args.push(path.scope.buildUndefinedNode(), extracted.__self);
        }
      } else if (extracted.key !== undefined) {
        args.push(extracted.key);
      }
      // 6、返回最终的函数调用表达式
      return call(file, children.length > 1 ? "jsxs" : "jsx", args);
    }

    // Builds props for React.jsx. This function adds children into the props
    // and ensures that props is always an object
    function buildJSXOpeningElementAttributes(
      attribs: NodePath<JSXAttribute | JSXSpreadAttribute>[],
      children: Expression[],
    ) {
      const props = attribs.reduce(accumulateAttribute, []);

      // In React.jsx, children is no longer a separate argument, but passed in
      // through the argument object
      if (children?.length > 0) {
        props.push(buildChildrenProperty(children));
      }

      return t.objectExpression(props);
    }

    // Builds JSX Fragment <></> into
    // Production: React.jsx(type, arguments)
    // Development: React.jsxDEV(type, { children })
    /**
     * 自动模式下的：将 JSX 的 <></> 片段转换为 jsx(type, arguments) 调用表达式节点 的一个函数
     */
    function buildJSXFragmentCall(
      path: NodePath<JSXFragment>,
      file: PluginPass,
    ) {
      const args = [get(file, "id/fragment")()];

      const children = t.react.buildChildren(path.node);

      args.push(
        t.objectExpression(
          children.length > 0
            ? [
                buildChildrenProperty(
                  //@ts-expect-error The children here contains JSXSpreadChild,
                  // which will be thrown later
                  children,
                ),
              ]
            : [],
        ),
      );

      if (development) {
        args.push(
          path.scope.buildUndefinedNode(),
          t.booleanLiteral(children.length > 1),
        );
      }

      return call(file, children.length > 1 ? "jsxs" : "jsx", args);
    }

    // Builds JSX Fragment <></> into
    // React.createElement(React.Fragment, null, ...children)
    /**
     * 经典模式下：将 JSX 的 <></> 片段转换为 React.createElement(React.Fragment, null, children) 调用表达式节点 的一个函数
     */
    function buildCreateElementFragmentCall(
      path: NodePath<JSXFragment>,
      file: PluginPass,
    ) {
      if (filter && !filter(path.node, file)) return;

      return call(file, "createElement", [
        // 从插件上下文中获取 React.Fragment 的成员表达式节点
        get(file, "id/fragment")(),
        // 表示第二个参数 props，对于 Fragment 来说通常为 null，因为不需要任何 props
        t.nullLiteral(),
        // 遍历当前 JSXFragment 的所有子节点（children），并转换为合法的 AST 表达式
        ...t.react.buildChildren(path.node),
      ]);
    }

    // Builds JSX into:
    // Production: React.createElement(type, arguments, children)
    // Development: React.createElement(type, arguments, children, source, self)
    /**
     * JSX 元素（如 <div />）转换为 React.createElement(...) 调用表达式节点的一个函数
     */
    function buildCreateElementCall(
      path: NodePath<JSXElement>,
      file: PluginPass,
    ) {
      // 获取openingElement属性对应的path路径值
      const openingPath = path.get("openingElement");

      return call(file, "createElement", [
        getTag(openingPath),// 第一个参数：组件类型（如 "div", MyComponent等）
        buildCreateElementOpeningElementAttributes(
          file,
          path,
          openingPath.get("attributes"),
        ),
        // @ts-expect-error JSXSpreadChild has been transformed in convertAttributeValue
        // 遍历当前 JSXFragment 的所有子节点（children），并转换为合法的 AST 表达式
        ...t.react.buildChildren(path.node),
      ]);
    }

    /**
     * 提取并返回 JSX 元素的标签（如 "div", MyComponent等）
     * 
     * @returns 返回ast节点
     * 1. 如果是react兼容的html原生标签（如 div, input, svg）→ 返回字符串字面量 "div"；
     * 2. 如果是自定义组件或 Web Components或成员表达式嵌套组件 → 返回原始 AST 表达式（如 MyComponent, My.Component, "my-component"）
     */
    function getTag(openingPath: NodePath<JSXOpeningElement>) {
      const tagExpr = convertJSXIdentifier(
        openingPath.node.name,
        openingPath.node,
      );

      let tagName: string;
      if (t.isIdentifier(tagExpr)) {
        tagName = tagExpr.name;
      } else if (t.isStringLiteral(tagExpr)) {
        tagName = tagExpr.value;
      }
      // 判断是否是“兼容标签”（HTML 原生标签）
      // 兼容标签：React 内置的一些标签，如 div, span, a, img 等
      if (t.react.isCompatTag(tagName)) {
        return t.stringLiteral(tagName);
      } else {
        return tagExpr;
      }
    }

    /**
     * The logic for this is quite terse. It's because we need to
     * support spread elements. We loop over all attributes,
     * breaking on spreads, we then push a new object containing
     * all prior attributes to an array for later processing.
     */
    /**
     * 将 JSX 中的属性（如 className="foo"、{...props} 等）转换为一个 JavaScript 对象表达式，或者多个对象合并的结果
     *   - 普通属性（如 id="app"）
     *   - 动态属性（如 {...props}）
     *   - 多个对象合并（通过 Object.assign 或 _extends）
     * 
     * 用到的api：
     * t.isSpreadElement(prop)：检查属性是否是一个 spread 元素（即 {...props}）
     * 创建对象表达式：t.objectExpression(props)
     * @param file 
     * @param path 
     * @param attribs 
     * @returns t.objectExpression(props)对象表达式ast节点
     */
    function buildCreateElementOpeningElementAttributes(
      file: PluginPass,
      path: NodePath<JSXElement>,
      attribs: NodePath<JSXAttribute | JSXSpreadAttribute>[],
    ) {
      const runtime = get(file, "runtime");
      if (!process.env.BABEL_8_BREAKING) {
        if (runtime !== "automatic") {
          const objs = [];
          const props = attribs.reduce(accumulateAttribute, []);

          if (!useSpread) {
            // Convert syntax to use multiple objects instead of spread
            let start = 0;
            props.forEach((prop, i) => {
              if (t.isSpreadElement(prop)) {
                if (i > start) {
                  objs.push(t.objectExpression(props.slice(start, i)));
                }
                objs.push(prop.argument);
                start = i + 1;
              }
            });
            if (props.length > start) {
              objs.push(t.objectExpression(props.slice(start)));
            }
          } else if (props.length) {
            objs.push(t.objectExpression(props));
          }

          if (!objs.length) {
            return t.nullLiteral();
          }

          if (objs.length === 1) {
            if (
              !(
                t.isSpreadElement(props[0]) &&
                // If an object expression is spread element's argument
                // it is very likely to contain __proto__ and we should stop
                // optimizing spread element
                t.isObjectExpression(props[0].argument)
              )
            ) {
              return objs[0];
            }
          }

          // looks like we have multiple objects
          if (!t.isObjectExpression(objs[0])) {
            objs.unshift(t.objectExpression([]));
          }

          const helper = useBuiltIns
            ? t.memberExpression(t.identifier("Object"), t.identifier("assign"))
            : file.addHelper("extends");

          // spread it
          return t.callExpression(helper, objs);
        }
      }

      const props: ObjectExpression["properties"] = [];
      const found = Object.create(null);

      for (const attr of attribs) {
        const { node } = attr;
        const name =
          t.isJSXAttribute(node) &&
          t.isJSXIdentifier(node.name) &&
          node.name.name;

        if (
          runtime === "automatic" &&
          (name === "__source" || name === "__self")
        ) {
          if (found[name]) throw sourceSelfError(path, name);
          found[name] = true;
        }

        accumulateAttribute(props, attr);
      }

      return props.length === 1 &&
        t.isSpreadElement(props[0]) &&
        // If an object expression is spread element's argument
        // it is very likely to contain __proto__ and we should stop
        // optimizing spread element
        !t.isObjectExpression(props[0].argument)
        ? props[0].argument
        : props.length > 0
          ? t.objectExpression(props)
          : t.nullLiteral();
    }
  });

  /**
   * 获取importName对应的实际导入源，如'react'或'react/jsx-runtime'
   * @param source 
   * @param importName 
   * @returns 
   */
  function getSource(source: string, importName: string) {
    switch (importName) {
      case "Fragment":
        return `${source}/${development ? "jsx-dev-runtime" : "jsx-runtime"}`;
      case "jsxDEV":
        return `${source}/jsx-dev-runtime`;
      case "jsx":
      case "jsxs":
        return `${source}/jsx-runtime`;
      case "createElement":
        return source;
    }
  }

  /**
   *  **1、核心就是利用@babel/helper-module-imports包的方法按需创建导入语句的ast节点**
   * - 当需要使用某个导入变量时，才动态地添加对应的 import 或 require 语句，并返回一个 AST 节点表示该变量引用
   * 
   * **2、示例**
   * 1. ESM模式
   * import { createElement } from 'react';
   * 返回 t.identifier("createElement")
   * 2. CommonJS模式
   * const react = require('react');
   * 返回t.memberExpression(t.identifier("react"), t.identifier("createElement"))
   * @param pass state状态对象
   * @param path 当前访问的根节点
   * @param importName 要引入的变量名如 'jsx', 'createElement' 或 'Fragment'
   * @param source 引入的模块来源，如 'react/jsx-runtime' 或 'react'
   * @returns 返回一个 AST 节点表示该变量引用的最终ast节点
   */
  function createImportLazily(
    pass: PluginPass,
    path: NodePath<Program>,
    importName: string,
    source: string,
  ): () => Identifier | MemberExpression {
    // 返回一个惰性函数，需要时才会执行
    return () => {
      // 获取importName实际的源导入路径
      const actualSource = getSource(source, importName);
      // 通常判断当前文件是否使用了 import/export，即是否为 ESM模块语法
      if (isModule(path)) {
        /** importName对应的具名导入AST节点 */
        let reference = get(pass, `imports/${importName}`);
        // 使用 t.cloneNode() 防止 AST 节点重复使用导致错误。
        if (reference) return t.cloneNode(reference);
        // 创建具名导入的ast节点，返回值为 Identifier 类型，如 import {createElement} from 'react'，中的createElement值节点
        reference = addNamed(path, importName, actualSource, {
          importedInterop: "uncompiled",// 表示不进行额外的互操作处理（适用于现代编译环境）
          importPosition: "after",// 控制导入语句插入的位置（放在其他 import 之后）
        });
        // 将引入变量名的引用路径存储状态对象中
        set(pass, `imports/${importName}`, reference);

        return reference;
      } else {
        // 添加类似 const react1 = require('react1') 的语句
        let reference = get(pass, `requires/${actualSource}`);
        if (reference) {
          reference = t.cloneNode(reference);
        } else {
          // 返回值为赋值的变量标识符节点
          reference = addNamespace(path, actualSource, {
            importedInterop: "uncompiled",
          });
          set(pass, `requires/${actualSource}`, reference);
        }
        // 再返回react1.createElement这样的成员表达式节点
        return t.memberExpression(reference, t.identifier(importName));
      }
    };
  }
}

/**
 * 转换成AST的成员表达式
 * @param id 成员表达式字符串
 * @returns 成员表达式AST
 * 
 * @example
 * toMemberExpression("MyLib.utils.createElement")
 * ==> MyLib.utils.createElement
 * 创建成员表达式
 */
function toMemberExpression(id: string): Identifier | MemberExpression {
  return (
    id
      .split(".")// 拆分字符串为数组 ["React", "createElement"]
      .map(name => t.identifier(name))// 将每个部分转成 AST 的 identifier 节点
      // @ts-expect-error - The Array#reduce does not have a signature
      // where the type of initial value differs from callback return type
      // ruduce中没初始值，第一个object取第一项为React标识符节点，第二个property为createElement标识符节点
      .reduce((object, property) => t.memberExpression(object, property)) // 构建嵌套的 member 表达式
  );
}

function makeSource(path: NodePath, state: PluginPass) {
  const location = path.node.loc;
  if (!location) {
    // the element was generated and doesn't have location information
    return path.scope.buildUndefinedNode();
  }

  // @ts-expect-error todo: avoid mutating PluginPass
  if (!state.fileNameIdentifier) {
    const { filename = "" } = state;

    const fileNameIdentifier = path.scope.generateUidIdentifier("_jsxFileName");
    path.scope.getProgramParent().push({
      id: fileNameIdentifier,
      init: t.stringLiteral(filename),
    });
    // @ts-expect-error todo: avoid mutating PluginPass
    state.fileNameIdentifier = fileNameIdentifier;
  }

  return makeTrace(
    t.cloneNode(
      // @ts-expect-error todo: avoid mutating PluginPass
      state.fileNameIdentifier,
    ),
    location.start.line,
    location.start.column,
  );
}

function makeTrace(
  fileNameIdentifier: Identifier,
  lineNumber?: number,
  column0Based?: number,
) {
  const fileLineLiteral =
    lineNumber != null ? t.numericLiteral(lineNumber) : t.nullLiteral();

  const fileColumnLiteral =
    column0Based != null ? t.numericLiteral(column0Based + 1) : t.nullLiteral();

  return template.expression.ast`{
    fileName: ${fileNameIdentifier},
    lineNumber: ${fileLineLiteral},
    columnNumber: ${fileColumnLiteral},
  }`;
}

function sourceSelfError(path: NodePath, name: string) {
  const pluginName = `transform-react-jsx-${name.slice(2)}`;

  return path.buildCodeFrameError(
    `Duplicate ${name} prop found. You are most likely using the deprecated ${pluginName} Babel plugin. Both __source and __self are automatically set when using the automatic runtime. Please remove transform-react-jsx-source and transform-react-jsx-self from your Babel config.`,
  );
}