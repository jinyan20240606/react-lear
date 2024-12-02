/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Dispatcher} from 'react-reconciler/src/ReactInternalTypes';

/**
 * Keeps track of the current dispatcher.
 * 
 * 在FunctionComponent render前，会根据FunctionComponent对应fiber的以下条件区分mount与update。
current === null || current.memoizedState === null
并将不同情况对应的dispatcher赋值给全局变量ReactCurrentDispatcher的current属性。
 */
const ReactCurrentDispatcher = {
  /**
   * @internal
   * @type {ReactComponent}
   */
  current: (null: null | Dispatcher),
};

export default ReactCurrentDispatcher;
