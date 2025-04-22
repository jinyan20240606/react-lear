/**
 * 构造堆的公式有两种
 * 1. 从0位开始的（主要用这个）
 * 2. 从1位开始的
 * 
 * 公式如下：
 * 1. 从0位开始的
 *  1. 父节点索引：Math.floor((i - 1) / 2)
    2. 左子节点索引：2 * i + 1
    3. 右子节点索引：2 * i + 2
    4. 最后一个父节点索引：Math.floor(arr.length / 2 - 1)
 * 2. 从1位开始的
 *  1. 父节点索引：Math.floor(i / 2)
    2. 左子节点索引：2 * i
    3. 右子节点索引：2 * i + 1
    4. 最后一个父节点索引：Math.floor(arr.length / 2)
 */
/**
 * 步骤:
    1. 构造最小堆
    2. 循环提取根节点, 直到全部提取完，提取后构成的新数组就是排序结果
 */

/**
 * ## 1- 主排序入口函数
 * 
 * 1. 构造最小堆
   2. 最小堆排序：循环提取根节点, 直到全部提取完，提取后构成的新数组就是排序结果
 * @param {*} arr 

   - 传进来arr的变化
   初始：[0,4,1,10,8,6,5]为标准的最小堆结构
   - 从末尾索引为6，开始遍历循环
   1. 交换arr[0]和arr[6]：[5,4,1,10,8,6,0]
   2. 从0到5位的范围，进行siftDown操作，构建0到5范围的最小堆（因为第6位是提取出的最小值，单独放在数组末尾，等待排序）
   3. 把[5,4,1,10,8,6]构建最小堆，结果为[1,4,5,10,8,6]
   4. 交换arr[0]和arr[5]：[6,4,5,10,8,1]
   5. 从0到4位的范围，进行siftDown操作，构建0到4范围的最小堆（因为第5位是提取出的最小值，单独放在数组末尾，紧跟6位前面，积累从大到小排序）
   6. 以此类推，直到全部提取完，提取后构成的数组arr就是排序结果：[10,8,6,5,4,1]
  

 */
const minHeapSort = (arr) => {
  console.log("arr0", arr);
  // debugger;
  // 1. 构造最小堆
  buildMinHeap(arr);
  console.log("arr1", arr);
  // 2. 最小堆排序：循环提取根节点arr[0], 直到全部提取完,提取后构成的新数组就是排序结果
  for (let i = arr.length - 1; i > 0; i--) {
    let tmp = arr[0];
    arr[0] = arr[i];
    arr[i] = tmp;
    // 每提取出一个顶部节点，就触发一次siftDown操作，限定处理范围为0~i-1，
    // 因为arr[i]是最小堆顶提取的最小值，单独放在数组末尾，等待排序
    // 重新调整堆，确保时刻为最小堆
    siftDown(arr, 0, i - 1);
  }
  console.log("arr2", arr);
};

/**
 * 2- 将一个普通数组构造成最小堆
 *  --- 思路：从最后一个父节点开始倒叙遍历，循环执行siftDown操作，最终构成最小堆
 * @param {*} arr 这个传入的arr是一个普通数组，需要将其构建成一个最小堆
 * @returns 
 */
const buildMinHeap = (arr) => {
  // 如果数组长度小于2，直接返回（已经是堆）
  if (arr.length < 2) {
    return arr;
  }
  // 计算出最后一个父节点的索引：Math.floor(arr.length / 2 - 1).
  // 这个应该是从数组0位开始的，所以需要-1，要是从1开始的话，就不需要-1了---> Math.floor(arr.length / 2 )。
  const startIndex = Math.floor(arr.length / 2 - 1);
  // 从最后一个父节点开始，依次向前调整堆，目标调整为最小堆
  for (let i = startIndex; i >= 0; i--) {
    siftDown(arr, i, arr.length - 1);
  }
};

/**
 * 递归向下调整：从startIndex指定索引开始, 向上调整最小堆特性
 * @param {*} arr 前提传入的arr已经是一个最小堆了，该函数只是要在这个最小堆元素变动的基础上二次构造，
 * @param {*} startIndex 指定父节点索引(初始为最后一个父节点的索引)
 * @param {*} endIndex 
 */
const siftDown = (arr, startIndex, endIndex) => {
  // 1. 计算当前节点的左右子节点索引，下面是特定的公式
  const leftChildIndx = 2 * startIndex + 1;
  const rightChildIndx = 2 * startIndex + 2;
  /** 进度下标 */
  let swapIndex = startIndex;
  // 2. 找出当前节点、左子节点和右子节点中的最小值
  /** 当前节点的值 */
  let tmpNode = arr[startIndex];
  // 当算出来的leftChildIndx > endIndex时，说明子节点不存在，可以跳过
  if (leftChildIndx <= endIndex) {
    // 当前节点的左子节的值小于当前节点的值 =====> 需要交换
    if (arr[leftChildIndx] < tmpNode) {
      // 更新tmpNode为左子节点
      tmpNode = arr[leftChildIndx];
      // 更新进度下标swapIndex
      swapIndex = leftChildIndx;
    }
  }
  if (rightChildIndx <= endIndex) {
    // 当前节点的右子节的值也小于(当前节点|左子节点)的值 =====> 需要交换
    if (arr[rightChildIndx] < tmpNode) {
      // 更新tmpNode为右子节点
      tmpNode = arr[rightChildIndx];
      // 更新进度下标swapIndex
      swapIndex = rightChildIndx;
    }
  }
  // 如果此时的进度下标和startIndex一样，说明当前节点已经是最小值，没有交换任何子节点值， =====>  不需要交换
  // 若不一样，则交换过某个子节点值  =======> 需要交换
  if (swapIndex !== startIndex) {
    // 3. 直接替换arr中下标值，进行操作替换
    arr[swapIndex] = arr[startIndex];
    arr[startIndex] = tmpNode;

    // 2. 交换后，向下递归的下钻到交换后的子节点位置继续执行siftDown向上堆特性构建操作
    siftDown(arr, swapIndex, endIndex);
  }
};

// 测试下列数组最小堆排序
// 普通数组表示成二叉树结构为：
//         5(0)
//     8(1)        0(2)
//  10(3)  4(4)   6(5)   1(6)
// 
/**
 * 
 前置条件：用0位堆顶的公式：公式适用于二叉树的数组表示法
 1. 父节点索引：Math.floor((i - 1) / 2)
 2. 左子节点索引：2 * i + 1
 3. 右子节点索引：2 * i + 2
 4. 最后一个父节点节点索引：Math.floor(arr.length / 2 - 1)

普通数组构建成最小堆数组变化过程如下：
01：
          5(0)
     8(1)        0(2)
  10(3)  4(4)   6(5)   1(6)

02：startIndex第一次遍历，此时startIndex为初始值最后一个父节点的索引为0(2)，此时倒数第一个父节点符合最小堆，不用交换
03：-- 回到上层startIndex遍历，此时startIndex为8(1)，倒数第二个父节点进行交换，交换后：
           5(0)
     4(1)        0(2)
  10(3)  8(4)   6(5)   1(6)

04：交换后，进行下钻到8(4)递归子节点进行向上堆构建，此时没有子节点所以跳出函数，递归结束
05：-- 再回到上层startIndex遍历，此时startIndex为5(0),构造得到下面arr结构
           0(0)
     4(1)        5(2)
  10(3)  8(4)   6(5)   1(6)
06：交换后，下钻到5(2)递归子节点，有子节点，进行堆构建：比较后代子节点与5(2)节点谁大谁小，保持该子树下面为最小堆的特性
           0(0)
     4(1)        1(2)
  10(3)  8(4)   6(5)   5(6)
07：5和1交换操作后，再递归其5(6)节点，发现没有子节点，跳出递归
08：-- 再回到上层startIndex遍历，此时startIndex为NaN(-1),遍历结束,得到了一个最小堆
 */

var arr1 = [5, 8, 0, 10, 4, 6, 1];
minHeapSort(arr1);
console.log(arr1); // [10, 8, 6, 5,4, 1, 0]

// var arr2 = [5];
// minHeapSort(arr2);
// console.log(arr2); // [ 5 ]

// var arr3 = [5, 1];
// minHeapSort(arr3);
// console.log(arr3); //[ 5, 1 ]
