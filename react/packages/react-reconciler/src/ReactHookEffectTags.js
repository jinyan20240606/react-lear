/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

export type HookFlags = number;
/** 0 */
export const NoFlags = /*  */ 0b000;

// Represents whether effect should fire.
/** 1-表示有副作用, 可以被触发 */
export const HasEffect = /* */ 0b001;

// Represents the phase in which the effect (not the clean-up) fires.
/** 2- Layout, dom突变后同步触发：布局阶段执行的 Effect：useLayoutEffect类的钩子会添加这个标记 */
export const Layout = /*    */ 0b010;
/**  4-Passive, dom突变前异步触发：被动阶段执行的 Effect：就是useEffect类的钩子会添加这个标记 */
export const Passive = /*   */ 0b100;
