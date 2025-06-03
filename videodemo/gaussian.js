/**
 * 高斯滤波器实现
 * 用于图像降噪和平滑处理
 * 
 * ## 高斯滤波算法步骤
 * 1. 指定图像的均值和标准差。
 * 2. 根据标准差计算高斯滤波器的卷积核（加权求和）。
 * 3. 对图像进行卷积操作，得到平滑后的图像
 * 
 * ## 输入输出示例
 * ```js
 * // 输入：
 * const filter = new GaussianFilter(1, 1.0);  // 半径=1, σ=1.0
 * const kernel = filter.kernel;
 * // 输出
 *  // 3×3 高斯卷积核 (近似值)
    [
        [0.077, 0.123, 0.077],
        [0.123, 0.196, 0.123],
        [0.077, 0.123, 0.077]
    ]
 // 输入示例：
    // 假设我们有一个4×4像素的简单图像数据
    const imageData = {
    width: 4,
    height: 4,
    data: new Uint8ClampedArray([
        // 第一行像素 (R,G,B,A 值)
        255, 0, 0, 255,    0, 255, 0, 255,    0, 0, 255, 255,    255, 255, 0, 255,
        // 第二行像素
        0, 255, 255, 255,  255, 0, 255, 255,  255, 255, 255, 255, 0, 0, 0, 255,
        // 第三行像素
        100, 100, 100, 255, 150, 150, 150, 255, 200, 200, 200, 255, 50, 50, 50, 255,
        // 第四行像素
        255, 0, 0, 255,    0, 255, 0, 255,    0, 0, 255, 255,    255, 255, 0, 255
    ])
    };

    const filter = new GaussianFilter(1, 1.0);
    const result = filter.apply(imageData);

  // 输出示例
  {
    width: 4,
    height: 4,
    data: Uint8ClampedArray [
        // 第一个像素 (原来是纯红色) 现在混合了周围的颜色
        // 例如第一个像素 [255,0,0] 会变成约 [196,59,22]
        196, 59, 22, 255, 
        // ...剩余像素数据
        ]
   }
 * ```
 */
class GaussianFilter {
    /**
     * 初始化高斯滤波器：设置半径和标准差
     * @param {number} radius - 滤波半径：决定了卷积核的大小，半径越大，考虑的周围像素范围越广
     * 决定卷积核的大小：size = 2 * radius + 1。较大的半径会考虑更多的周围像素，但计算量也会增加
     * @param {number} sigma - 高斯分布的标准差 (默认值: 1.0)：控制高斯分布的"宽度"，影响模糊的程度
     * sigma越大，中心像素与远处像素的权重差异越小，模糊效果越强
     * 
     * 参数设置建议
     * 去除噪点：较小的sigma (0.5-1.0)
     * 一般平滑：中等sigma (1.0-2.0)
     * 创造模糊效果：较大的sigma (2.0以上)
     * 
     * 一般理想情况下《radius=3*sigma》
     * 轻微模糊：radius=1-2, sigma=0.5-1.0
     * 中等模糊：radius=2-3, sigma=1.0-2.0
     * 强烈模糊：radius=4-6, sigma=2.0-5.0
     * 
     * 半径和矩阵 的关系
     * 半径为2的5x5矩阵：中心点为8，距离周围各个边界点的半径都为2
     * [[0, 1, 2, 3, 4],
     * [1, 1, 2, 3, 4],
     * [2, 1, 8, 3, 4],
     * [3, 1, 2, 3, 4],
     * [4, 1, 2, 3, 4]]
     */
    constructor(radius = 2, sigma = 1.0) {
        this.radius = radius;
        this.sigma = sigma;
        this.kernel = this.generateKernel();
    }

    /**
     * 更新滤波器参数
     * @param {number} radius - 新的滤波半径
     * @param {number} sigma - 新的标准差值
     */
    updateParameters(radius, sigma) {
        this.radius = radius;
        this.sigma = sigma;
        this.kernel = this.generateKernel();
    }

    /**
     * 生成高斯卷积核
     * 1. 主要就是基于指定的初始空矩阵大小和标准差，由空矩阵的下标作为xy坐标点与中心半径的距离平方
     * 2. 计算出初始矩阵中每个位置的权重即概率分布密度
     * 3. 归一化，使所有权重之和为1
     * 4. 得到二维高斯卷积核
     *      - 最后通过这个初始矩阵核的各个位置权重与目标图像矩阵作卷积即可。
     *      - 其实重要的是各位置的权重，而不是具体各位置的初始坐标值，取啥都行，最后权重都是一样的
     * 
     * **注意点**
     * 1. 均值滤波和高斯滤波本质不同就是卷积核不同，均值滤波卷积核都是1，归一化是1/size*size，
     *      高斯滤波卷积核是高斯概率分布公式代入后的权重值，然后再归一化
     * @returns {Array<Array<number>>} 二维高斯卷积核
     */
    generateKernel() {
        const size = this.radius * 2 + 1;
        const kernel = new Array(size);
        
        // 计算高斯函数的分母部分 (2*sigma^2)
        const denominator = 2 * this.sigma * this.sigma;
        
        // 用于归一化的总和
        let sum = 0;
        
        // 生成二维高斯核矩阵
        for (let y = 0; y < size; y++) {
            kernel[y] = new Array(size);
            for (let x = 0; x < size; x++) {
                // 计算当前位置到中心的距离的平方
                const distanceX = x - this.radius;
                const distanceY = y - this.radius;
                // 欧式距离平方
                const distanceSquared = distanceX * distanceX + distanceY * distanceY;
                
                // 计算二维卷积核公式右侧的高斯函数值: e^(-distance^2/(2*sigma^2))
                // 没有乘以左边的归一化系数，因为我们稍后会对其整体进行归一化，乘不乘都会抵消效果一样
                kernel[y][x] = Math.exp(-distanceSquared / denominator);
                sum += kernel[y][x];
            }
        }
        
        // 归一化卷积核，使所有权重之和为1
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                kernel[y][x] /= sum;
            }
        }
        
        return kernel;
    }

    /**
     * 应用高斯滤波到图像数据（二维卷积）
     * @param {ImageData} imageData - 原始图像数据
     * @returns {ImageData} 滤波后的图像数据
     */
    apply(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        
        // 创建结果图像数据
        const resultData = new Uint8ClampedArray(data.length);
        
        // 卷积核大小
        const kernelSize = this.radius * 2 + 1;
        
        // 对每个像素点应用高斯滤波
        for (let y = 0; y < height; y++) {   // 遍历图像每一行
            for (let x = 0; x < width; x++) { // 遍历行内每个像素列
                // 对每个像素点，进行卷积核对应的x周围的像素点进行加权求和得到新值，一个挨着一个点卷积操作
                let r = 0, g = 0, b = 0, a = 0;
                
                // 卷积核遍历： 对每个颜色通道进行卷积计算
                for (let ky = 0; ky < kernelSize; ky++) { // 垂直方向遍历卷积核
                    for (let kx = 0; kx < kernelSize; kx++) { // 水平方向遍历卷积核
                        // 1. 坐标映射： 将卷积核的位置 (kx, ky) 映射到原始图像的坐标 (pixelX, pixelY)
                            // 汇报时就说用重复法
                            // 这是偏移量：kx - this.radius。图像数据相加偏移量得到的是卷积核对应原始图像位置的像素
                            // 目的：每个卷积核位置都能正确映射到图像上的对应区域
                        // 2. 边界处理：使用 Math.min(Math.max(...)) 确保 pixelX 和 pixelY 在有效范围内（[0, width-1] 和 [0, height-1]），即 Clamp to Edge（边缘像素重复）
                            // 用的重复法，当x相加偏移量后超出图像边界时，就取边缘0位的值
                        const pixelX = Math.min(Math.max(x + (kx - this.radius), 0), width - 1);
                        const pixelY = Math.min(Math.max(y + (ky - this.radius), 0), height - 1);
                        
                        // 3. 计算像素在数据数组中的索引
                        const pixelIndex = (pixelY * width + pixelX) * 4;
                        
                        // 获取卷积核权重
                        const weight = this.kernel[ky][kx];
                        
                        // 4. 累加加权像素值
                        r += data[pixelIndex] * weight;
                        g += data[pixelIndex + 1] * weight;
                        b += data[pixelIndex + 2] * weight;
                        a += data[pixelIndex + 3] * weight;
                    }
                }
                
                // 设置结果像素值
                const index = (y * width + x) * 4;
                resultData[index] = Math.round(r);
                resultData[index + 1] = Math.round(g);
                resultData[index + 2] = Math.round(b);
                resultData[index + 3] = Math.round(a);
            }
        }
        
        // 返回新的ImageData对象
        return new ImageData(resultData, width, height);
    }

    /**
     * 优化版本的高斯滤波应用
     * 将二维卷积分解为两个一维卷积，提高性能
     * @param {ImageData} imageData - 原始图像数据
     * @returns {ImageData} 滤波后的图像数据
     */
    applySeparable(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        
        // 创建中间结果和最终结果
        const tempData = new Uint8ClampedArray(data.length);
        const resultData = new Uint8ClampedArray(data.length);
        
        // 生成一维高斯核
        const kernelSize = this.radius * 2 + 1;
        const kernel1D = new Array(kernelSize);
        
        // 计算一维高斯核
        let sum = 0;
        for (let i = 0; i < kernelSize; i++) {
            const distance = i - this.radius;
            kernel1D[i] = Math.exp(-(distance * distance) / (2 * this.sigma * this.sigma));
            sum += kernel1D[i];
        }
        
        // 归一化一维核
        for (let i = 0; i < kernelSize; i++) {
            kernel1D[i] /= sum;
        }
        
        // 水平方向卷积
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let r = 0, g = 0, b = 0, a = 0;
                
                for (let k = 0; k < kernelSize; k++) {
                    const pixelX = Math.min(Math.max(x + k - this.radius, 0), width - 1);
                    const index = (y * width + pixelX) * 4;
                    const weight = kernel1D[k];
                    
                    r += data[index] * weight;
                    g += data[index + 1] * weight;
                    b += data[index + 2] * weight;
                    a += data[index + 3] * weight;
                }
                
                const index = (y * width + x) * 4;
                tempData[index] = Math.round(r);
                tempData[index + 1] = Math.round(g);
                tempData[index + 2] = Math.round(b);
                tempData[index + 3] = Math.round(a);
            }
        }
        
        // 垂直方向卷积
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let r = 0, g = 0, b = 0, a = 0;
                
                for (let k = 0; k < kernelSize; k++) {
                    const pixelY = Math.min(Math.max(y + k - this.radius, 0), height - 1);
                    const index = (pixelY * width + x) * 4;
                    const weight = kernel1D[k];
                    
                    r += tempData[index] * weight;
                    g += tempData[index + 1] * weight;
                    b += tempData[index + 2] * weight;
                    a += tempData[index + 3] * weight;
                }
                
                const index = (y * width + x) * 4;
                resultData[index] = Math.round(r);
                resultData[index + 1] = Math.round(g);
                resultData[index + 2] = Math.round(b);
                resultData[index + 3] = Math.round(a);
            }
        }
        
        return new ImageData(resultData, width, height);
    }
}

/**
 * 剔除颜色边界
 * @param {*} imgData 
 * @returns 
 */
function convertToPixelsArray(imgData) {
    const { data } = imgData;
    const pixels = [];
    const BLACK_THRESHOLD = 5;   // 黑边阈值
    const WHITE_THRESHOLD = 250; // 白边阈值

    let i = 0;
    const length = data.length;
    while (i < length) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        const isTooDark = Math.max(r, g, b) <= BLACK_THRESHOLD;
        const isTooBright = Math.min(r, g, b) >= WHITE_THRESHOLD;
        // 像素点RGB值不在此范围内的进行过滤        
        if (!isTooDark && !isTooBright) {
            pixels.push([r, g, b]);
        }
        i += 4; // 明确步进值
    }
    return pixels;
 }

export default GaussianFilter;