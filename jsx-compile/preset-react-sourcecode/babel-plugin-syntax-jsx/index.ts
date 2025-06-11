
/**
 * 在插件中说明需要 parse 时候识别 jsx,核心还是parse包中内置对jsx解析，这里只是提供识别jsx的开关
 * 
 * 
 */
// @ts-nocheck
import { declare } from "@babel/helper-plugin-utils";

export default declare(api => {
  // 通过 api.assertVersion 确保 Babel 版本至少为 7.x
  api.assertVersion(REQUIRED_VERSION(7));

  return {
    name: "syntax-jsx",
    // 用于修改解析器选项
    manipulateOptions(opts, parserOpts) {
      // 在非 Babel 8 环境下（!process.env.BABEL_8_BREAKING），检查是否已启用 TypeScript 插件（名称为 "typescript"）。
      // 如果已启用，则直接返回，避免重复添加 JSX 支持（因为 TypeScript 插件会处理 JSX）。
      if (!process.env.BABEL_8_BREAKING) {
        // If the Typescript plugin already ran, it will have decided whether
        // or not this is a TSX file.
        if (
          parserOpts.plugins.some(
            p => (Array.isArray(p) ? p[0] : p) === "typescript",
          )
        ) {
          return;
        }
      }
      // 向解析器的插件列表添加 "jsx"，启用 JSX 语法解析
      parserOpts.plugins.push("jsx");
    },
  };
});