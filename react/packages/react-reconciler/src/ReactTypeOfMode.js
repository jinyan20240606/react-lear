/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */
/**
 * react应用的启动模式
NoMode = 0b00000：表示没有任何特殊模式，二进制表示为 00000，十进制为 0。
StrictMode = 0b00001：表示严格模式，二进制表示为 00001，十进制为 1。 ========= 严格模式启动
BlockingMode = 0b00010：表示阻塞模式，二进制表示为 00010，十进制为 2。======== 阻塞模式启动
ConcurrentMode = 0b00100：表示并发模式，二进制表示为 00100，十进制为 4。====== 并发模式启动
ProfileMode = 0b01000：表示性能分析模式，二进制表示为 01000，十进制为 8。===== 传统模式：ReactDOM.render方式启动的应用
DebugTracingMode = 0b10000：表示调试追踪模式，二进制表示为 10000，十进制为 16。
 */
export type TypeOfMode = number;

export const NoMode = 0b00000; // 0
export const StrictMode = 0b00001;// 1
// TODO: Remove BlockingMode and ConcurrentMode by reading from the root
// tag instead
export const BlockingMode = 0b00010;// 2
export const ConcurrentMode = 0b00100; // 4
/** 启用性能分析模式，帮助开发者了解组件的渲染性能和时间消耗
 * 
 * 通常在开发环境中或者当开发者工具存在时启用
 * 
 * ProfileMode = 0b01000：表示性能分析模式，二进制表示为 01000，十进制为 8。 */
export const ProfileMode = 0b01000;
export const DebugTracingMode = 0b10000;
