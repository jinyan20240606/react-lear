/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {MutableSource, MutableSourceVersion} from 'shared/ReactTypes';
import type {FiberRoot} from './ReactInternalTypes';

import {isPrimaryRenderer} from './ReactFiberHostConfig';

// Work in progress version numbers only apply to a single render,
// and should be reset before starting a new render.
// This tracks which mutable sources need to be reset after a render.
const workInProgressSources: Array<MutableSource<any>> = [];

let rendererSigil;
if (__DEV__) {
  // Used to detect multiple renderers using the same mutable source.
  rendererSigil = {};
}

export function markSourceAsDirty(mutableSource: MutableSource<any>): void {
  workInProgressSources.push(mutableSource);
}

export function resetWorkInProgressVersions(): void {
  for (let i = 0; i < workInProgressSources.length; i++) {
    const mutableSource = workInProgressSources[i];
    if (isPrimaryRenderer) {
      mutableSource._workInProgressVersionPrimary = null;
    } else {
      mutableSource._workInProgressVersionSecondary = null;
    }
  }
  workInProgressSources.length = 0;
}

export function getWorkInProgressVersion(
  mutableSource: MutableSource<any>,
): null | MutableSourceVersion {
  if (isPrimaryRenderer) {
    return mutableSource._workInProgressVersionPrimary;
  } else {
    return mutableSource._workInProgressVersionSecondary;
  }
}

export function setWorkInProgressVersion(
  mutableSource: MutableSource<any>,
  version: MutableSourceVersion,
): void {
  if (isPrimaryRenderer) {
    mutableSource._workInProgressVersionPrimary = version;
  } else {
    mutableSource._workInProgressVersionSecondary = version;
  }
  workInProgressSources.push(mutableSource);
}

export function warnAboutMultipleRenderersDEV(
  mutableSource: MutableSource<any>,
): void {
  if (__DEV__) {
    if (isPrimaryRenderer) {
      if (mutableSource._currentPrimaryRenderer == null) {
        mutableSource._currentPrimaryRenderer = rendererSigil;
      } else if (mutableSource._currentPrimaryRenderer !== rendererSigil) {
        console.error(
          'Detected multiple renderers concurrently rendering the ' +
            'same mutable source. This is currently unsupported.',
        );
      }
    } else {
      if (mutableSource._currentSecondaryRenderer == null) {
        mutableSource._currentSecondaryRenderer = rendererSigil;
      } else if (mutableSource._currentSecondaryRenderer !== rendererSigil) {
        console.error(
          'Detected multiple renderers concurrently rendering the ' +
            'same mutable source. This is currently unsupported.',
        );
      }
    }
  }
}

// Eager reads the version of a mutable source and stores it on the root.
// This ensures that the version used for server rendering matches the one
// that is eventually read during hydration.
// If they don't match there's a potential tear and a full deopt render is required.
/**
 * 服务端渲染（SSR）和客户端水合（hydration）过程中处理可变源的版本问题
 *
 * 确保了服务端渲染和客户端水合时使用的数据版本是一致的
 * 
 * 服务端渲染过程中，React 会读取并记录所有可变源的当前版本。
  在客户端水合过程中，React 会再次读取这些可变源的版本，并与服务端记录的版本进行比较。
  如果版本不一致，React 可能会触发一个完整的重新渲染（deopt render），以确保数据的一致性
 * @param {*} root 
 * @param {*} mutableSource 
 */
export function registerMutableSourceForHydration(
  root: FiberRoot,
  mutableSource: MutableSource<any>,
): void {
  // 获取版本
  const getVersion = mutableSource._getVersion;
  const version = getVersion(mutableSource._source);

  // TODO Clear this data once all pending hydration work is finished.
  // Retaining it forever may interfere with GC.
  // 存储版本信息：mutableSourceEagerHydrationData：存储所有已注册的可变源及其版本信息
  if (root.mutableSourceEagerHydrationData == null) {
    root.mutableSourceEagerHydrationData = [mutableSource, version];
  } else {
    root.mutableSourceEagerHydrationData.push(mutableSource, version);
  }
}
