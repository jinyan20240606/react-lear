

/**
 * 八叉树类
 * 
 * 1. x << n 等价于 x * (2 ** n)
 * 2. x >> n 等价于 x / (2 ** n)
 * 3. 结合下https://juejin.cn/post/7276798688899072060
 */
class Octree {
    constructor() {
        this.root = null;// 八叉树的根节点，初始为 null
        this.maxDepth = 5; // 八叉树的最大深度
        this.colorMap = {}; // 存储最终的颜色映射
    }

    /**
     * 添加颜色到八叉树
     * 1. 若根节点不存在，则创建一个新的 OctreeNode 作为根节点
     * 2. 调用根节点的 insert 方法，将颜色插入到八叉树中
     * @param {Object} color - 包含r, g, b属性的颜色对象
     */
    addColor(color) {
        if (!this.root) {
            this.root = new OctreeNode(0);
        }
        this.root.insert(color, 0);
    }

    /**
     * 减少颜色数量
     * 1. 调用 getLeafNodes 方法获取所有叶子节点，并按照体积从大到小排序
     * 2. 若叶子节点数量超过 maxColors，则弹出体积最小的节点，调用 reduce 方法合并该节点，并更新其父节点的体积
     * 3. 调用 buildColorMap 方法构建颜色映射，返回最终的颜色数组
     * @param {number} maxColors - 最终想要得到的颜色数量
     * @returns {Array} - 返回一个包含最终颜色的数组
     */
    reduceColors(maxColors) {
        const nodes = this.getLeafNodes(this.root);
        nodes.sort((a, b) => b.volume - a.volume);

        while (nodes.length > maxColors) {
            const node = nodes.pop();
            node.reduce();
            this.updateParentVolumes(node.parent);
        }

        this.buildColorMap(this.root);
        return Object.values(this.colorMap);
    }

    /**
     * 获取所有叶子节点: 递归获取八叉树中所有叶子节点
     * @param {OctreeNode} node - 当前节点
     * @returns {Array} - 返回所有叶子节点的数组
     */
    getLeafNodes(node) {
        if (!node.children) {
            return [node];
        }

        let leafNodes = [];
        for (let child of node.children) {
            leafNodes = leafNodes.concat(this.getLeafNodes(child));
        }
        return leafNodes;
    }

    /**
     * 更新父节点的体积：该方法递归更新当前节点及其所有父节点的体积
     * @param {OctreeNode} node - 当前节点
     */
    updateParentVolumes(node) {
        if (node) {
            node.calculateVolume();
            this.updateParentVolumes(node.parent);
        }
    }

    /**
     * 构建颜色映射
     * 1. 若当前节点没有子节点，表明它是叶子节点，将其平均颜色添加到 colorMap 对象中
     * 2. 若当前节点有子节点，递归调用 buildColorMap 方法，处理每个子节点
     * @param {OctreeNode} node - 当前节点
     */
    buildColorMap(node) {
        if (!node.children) {
            this.colorMap[node.averageColor] = node.averageColor;
        } else {
            for (let child of node.children) {
                this.buildColorMap(child);
            }
        }
    }
}

/**
 * 八叉树节点类
 * 
 * 代表八叉树中的一个节点。
 * 类中包含节点深度、子节点、体积、颜色总和、像素计数等属性，以及插入颜色、计算体积、获取颜色索引等方法
 */
class OctreeNode {
    constructor(depth) {
        this.depth = depth;// 节点的深度
        this.children = null;
        this.volume = 0;// 节点的体积
        this.totalR = 0;// 节点的红色总和
        this.totalG = 0;// 节点的绿色总和
        this.totalB = 0;// 节点的蓝色总和
        this.pixelCount = 0;// 节点的像素计数
    }

    /**
     * 插入颜色到节点
     * @param {Object} color - 包含r, g, b属性的颜色对象
     * @param {number} level - 当前深度
     */
    insert(color, level) {
        // 当插入到最大层级节点时，将颜色信息累加到节点的属性中，并计算节点的体积
        if (level === this.depth || !this.children) {
            this.totalR += color.r;
            this.totalG += color.g;
            this.totalB += color.b;
            this.pixelCount++;
            this.calculateVolume();
            return;
        }

        if (!this.children) {
            this.children = [];
            for (let i = 0; i < 8; i++) {
                this.children.push(new OctreeNode(this.depth + 1));
            }
        }
        // 获取当前颜色在当前层级的索引位
        const index = this.getIndex(color, level);
        // 将当前color颜色递归（递归一直判断子索引位）插入到子层级中，最终插入到叶子节点中，最小的小立方体
        this.children[index].insert(color, level + 1);
    }

    /**
     * 计算节点的体积
     */
    calculateVolume() {
        this.volume = this.pixelCount;
    }

    /**
     * 充分利用位运算原理：获取颜色要划分在当前层级的哪个索引位（8个索引中的哪一个）
     * 
     * 充分利用二进制避免了复杂的逻辑判断，而是直接通过位运算来确定索引
     * 
     * 先不必深究，知道做什么事就行
     * @param {Object} color - 包含r, g, b属性的颜色对象
     * @param {number} level - 当前深度
     * @returns {number} - 返回当前color值在当前深度层级中索引位 0-7
     */
    getIndex(color, level) {
        // 初始值：0x80 是十六进制的128就是rgb立方体的边长的一半，就是为0层级的中线，对应的二进制是 10000000
        // 右移位就说明深度level个层级的中位数如
        const mask = 0x80 >> level;
        // 获取颜色的每个分量的二进制值，然后与掩码进行按位与操作，得到对应的索引值
        const r = Boolean(color.r & mask);
        const g = Boolean(color.g & mask);
        const b = Boolean(color.b & mask);
        // 将三个布尔值（r, g, b）视为三位二进制数的每一位，得到的划分到当前层级中的0-7中哪个索引处
        return (r << 2) | (g << 1) | b;
    }

    /**
     * 减少节点
     */
    reduce() {
        this.children = null;
        this.calculateVolume();
    }

    /**
     * 获取节点的平均颜色
     * @returns {Object} - 包含r, g, b属性的颜色对象
     */
    get averageColor() {
        return {
            r: Math.round(this.totalR / this.pixelCount),
            g: Math.round(this.totalG / this.pixelCount),
            b: Math.round(this.totalB / this.pixelCount)
        };
    }
}


document.addEventListener('DOMContentLoaded', function () {
    const canvas = document.getElementById('myCanvas');
    const ctx = canvas.getContext('2d');

    // 假设这里已经有一张图片绘制在canvas上
    // 例如：ctx.drawImage(image, 0, 0);

    // 获取图像数据
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // 提取颜色数据：在这个步骤可以提前过滤边缘区域的颜色进行八叉树的边缘取色
    const colors = [];
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // 可以选择忽略透明度为0的像素
        if (data[i + 3] !== 0) {
            colors.push({ r, g, b });
        }
    }

    // 1. 构建八叉树并遍历添加所有颜色
    //    该处步骤有误：按2版和博客掘金思路是，添加完颜色后，就去判断是否需要合并颜色，否则都添加完后再合并增加复杂度
    const octree = new Octree();
    colors.forEach(color => octree.addColor(color));
    // 2. 根据颜色分布合并体积最小的节点（保留体积大的颜色）。最终保留 maxColors 种颜色（如 maxColors = 5）
    // 减少颜色数量并获取最终的颜色数组，结束
    const resultColors = octree.reduceColors(5); // 假设我们希望得到5种主要颜色
    console.log(resultColors);
});