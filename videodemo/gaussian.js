/**
 * 高斯滤波器实现
 * 用于图像降噪和平滑处理
 */
class GaussianFilter {
    /**
     * 初始化高斯滤波器
     * @param {number} radius - 滤波半径
     * @param {number} sigma - 高斯分布的标准差 (默认值: 1.0)
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
     * @returns {Array<Array<number>>} 二维高斯卷积核
     */
    generateKernel() {
        const size = this.radius * 2 + 1;
        const kernel = new Array(size);
        
        // 计算高斯函数的分母部分 (2*sigma^2)
        const denominator = 2 * this.sigma * this.sigma;
        
        // 用于归一化的总和
        let sum = 0;
        
        // 生成高斯核矩阵
        for (let y = 0; y < size; y++) {
            kernel[y] = new Array(size);
            for (let x = 0; x < size; x++) {
                // 计算当前位置到中心的距离的平方
                const distanceX = x - this.radius;
                const distanceY = y - this.radius;
                const distanceSquared = distanceX * distanceX + distanceY * distanceY;
                
                // 计算高斯函数值: e^(-distance^2/(2*sigma^2))
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
     * 应用高斯滤波到图像数据
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
        
        // 对每个像素应用高斯滤波
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let r = 0, g = 0, b = 0, a = 0;
                
                // 应用卷积核
                for (let ky = 0; ky < kernelSize; ky++) {
                    for (let kx = 0; kx < kernelSize; kx++) {
                        // 计算相邻像素的坐标
                        const pixelX = Math.min(Math.max(x + kx - this.radius, 0), width - 1);
                        const pixelY = Math.min(Math.max(y + ky - this.radius, 0), height - 1);
                        
                        // 计算像素在数据数组中的索引
                        const pixelIndex = (pixelY * width + pixelX) * 4;
                        
                        // 获取卷积核权重
                        const weight = this.kernel[ky][kx];
                        
                        // 累加加权像素值
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
 