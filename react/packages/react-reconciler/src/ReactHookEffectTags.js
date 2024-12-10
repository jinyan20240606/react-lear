/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

export type HookFlags = number;

export const NoFlags = /*  */ 0b000;

// Represents whether effect should fire.
/** 表示 Effect 存在 */
export const HasEffect = /* */ 0b001;

// Represents the phase in which the effect (not the clean-up) fires.
/** 布局阶段执行的 Effect：useLayoutEffect类的钩子会添加这个标记 */
export const Layout = /*    */ 0b010;
/** 被动阶段执行的 Effect：就是useEffect类的钩子会添加这个标记 */
export const Passive = /*   */ 0b100;
