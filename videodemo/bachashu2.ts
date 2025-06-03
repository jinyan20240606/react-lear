// @ts-ignore
import { getDataList, mainColorNumber, PixelData, rgb2Hex } from "./shared.ts";

/** 原始数据集, 保存了4个 ImgPixels 数组*/
const dataList = await getDataList();

/********************/
/*      octree      */
/********************/

/**
 * 0. 层级和索引算法可以直接参考bachashu.js中的方法。将每个点的 RGB 表示为二进制的一行, 堆叠后将每一列的不同编码对应成数字, 共 8 种组合
 *    RGB 通道逐列黏合之后的值就是其在某一层节点的子节点
 * 1. 建立一棵空八叉树, 设置一个叶子节点个数上限
 * 2. 依次将像素按 0. 的算法插入树中
 *     (1) 若插入后叶子节点数小于上限maxColors, 则什么也不做
 *     (2) 若大于上限, 则对最底层的一个非叶子节点进行合并
 *         将其转换为叶子节点 rgb 值的平均数, 并清除其子节点
 *  根据颜色分布合并体积最小的节点（保留体积大的颜色）。
    最终保留 maxColors 种颜色（如 maxColors = 5）
 * 3. 依此类推, 直到最后插入所有的像素, 所得八叉树的叶子节点即为主色调
 */

class Node {
  static leafNum = 0;
  static toReduce: Node[][] = new Array(8).fill(0).map(() => []);

  children: (Node | null)[] = new Array(8).fill(null);
  isLeaf = false;
  r = 0;
  g = 0;
  b = 0;
  childrenCount = 0;

  constructor(info?: { index: number; level: number }) {
    if (!info) return;
    if (info.level === 7) {
      this.isLeaf = true;
      Node.leafNum++;
    } else {
      Node.toReduce[info.level].push(this);
      Node.toReduce[info.level].sort(
        (a, b) => a.childrenCount - b.childrenCount
      );
    }
  }

  addColor(color: PixelData, level: number) {
    if (this.isLeaf) {
      this.childrenCount++;
      this.r += color[0];
      this.g += color[1];
      this.b += color[2];
    } else {
      let str = "";
      const r = color[0].toString(2).padStart(8, "0");
      const g = color[1].toString(2).padStart(8, "0");
      const b = color[2].toString(2).padStart(8, "0");

      str += r[level];
      str += g[level];
      str += b[level];
      const index = parseInt(str, 2);

      if (this.children[index] === null) {
        this.children[index] = new Node({
          index,
          level: level + 1,
        });
      }
      (this.children[index] as Node).addColor(color, level + 1);
    }
  }
}
function reduceTree() {
  // find the deepest level of node
  let lv = 6;

  while (lv >= 0 && Node.toReduce[lv].length === 0) lv--;
  if (lv < 0) return;

  const node = Node.toReduce[lv].pop() as Node;

  // merge children
  node.isLeaf = true;
  node.r = 0;
  node.g = 0;
  node.b = 0;
  node.childrenCount = 0;
  for (let i = 0; i < 8; i++) {
    if (node.children[i] === null) continue;
    const child = node.children[i] as Node;
    node.r += child.r;
    node.g += child.g;
    node.b += child.b;
    node.childrenCount += child.childrenCount;
    Node.leafNum--;
  }

  Node.leafNum++;
}

function colorsStats(node: Node, record: Record<string, number>) {
  if (node.isLeaf) {
    const r = (~~(node.r / node.childrenCount))
      .toString(16)
      .padStart(2, "0");
    const g = (~~(node.g / node.childrenCount))
      .toString(16)
      .padStart(2, "0");
    const b = (~~(node.b / node.childrenCount))
      .toString(16)
      .padStart(2, "0");

    const color = "#" + r + g + b;
    if (record[color]) record[color] += node.childrenCount;
    else record[color] = node.childrenCount;

    return;
  }

  for (let i = 0; i < 8; i++) {
    if (node.children[i] !== null) {
      colorsStats(node.children[i] as Node, record);
    }
  }
}

dataList.forEach((data, index) => {
  console.log(`\n*** processing img ${index + 1} ***\n`);
  const root = new Node();

  Node.toReduce = new Array(8).fill(0).map(() => []);
  Node.leafNum = 0;

  data.forEach((pixel, index) => {
    root.addColor(pixel, 0);

    while (Node.leafNum > 16) reduceTree();
  });

  const record: Record<string, number> = {};
  colorsStats(root, record);
  const result = Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  console.log(result.map(([color, _]) => color));

  /* 
    *** processing img 1 ***

    [ "#0c0e1e", "#bab2a6", "#5a5e65", "#263448" ]

    *** processing img 2 ***

    [ "#4c4148", "#75b2b1", "#d2d2d1", "#a2a1a2" ]

    *** processing img 3 ***

    [ "#393144", "#d5bba7", "#9b5c69", "#d29370" ]

    *** processing img 4 ***

    [ "#4e1c2f", "#a11227", "#c21b2a", "#c95e28" ]
  */
});