/**
 * 视频背景自动取色Demo (聚类算法版)
 * 基于Lab色彩空间的颜色聚类，实现更符合人眼感知的背景色提取
 */

// 全局变量
const videoPlayer = document.getElementById('videoPlayer');
const videoCanvas = document.getElementById('videoCanvas');
const videoContainer = document.getElementById('videoContainer');
const videoInput = document.getElementById('videoInput');
let canvasContext = null;
let isProcessing = false;
let lastProcessTime = 0;
let processingInterval = 500; // 颜色分析间隔(ms)
let samplingStep = 8; // 像素采样间隔
let performanceData = {
    lastFrameTime: 0,
    frameCount: 0,
    fps: 0
};

// 边缘区域定义
const edgeRegions = {
    left: { name: 'left', color: null },
    right: { name: 'right', color: null },
    top: { name: 'top', color: null },
    bottom: { name: 'bottom', color: null }
};

// 初始化
function init() {
    // 设置Canvas上下文
    canvasContext = videoCanvas.getContext('2d', { willReadFrequently: true });
    
    // 视频文件选择事件
    videoInput.addEventListener('change', handleVideoSelect);
    
    // 视频事件监听
    videoPlayer.addEventListener('play', startColorAnalysis);
    videoPlayer.addEventListener('pause', () => isProcessing = false);
    videoPlayer.addEventListener('ended', () => isProcessing = false);
    
    // 添加性能监控
    createPerformanceMonitor();
}

// 处理视频选择
function handleVideoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const videoURL = URL.createObjectURL(file);
    videoPlayer.src = videoURL;
    
    // 重置状态
    isProcessing = false;
    Object.keys(edgeRegions).forEach(key => edgeRegions[key].color = null);
    
    // 设置初始背景色
    videoContainer.style.backgroundColor = '#000';
    
    // 添加加载中样式
    videoContainer.classList.add('loading');
    
    // 视频加载完成后移除加载样式
    videoPlayer.onloadeddata = () => {
        videoContainer.classList.remove('loading');
        console.log('视频已加载，尺寸:', videoPlayer.videoWidth, 'x', videoPlayer.videoHeight);
    };
}

// 开始颜色分析
function startColorAnalysis() {
    if (isProcessing) return;
    isProcessing = true;
    
    // 调整Canvas尺寸
    videoCanvas.width = videoPlayer.videoWidth;
    videoCanvas.height = videoPlayer.videoHeight;
    
    // 开始分析循环
    requestAnimationFrame(analyzeFrame);
}

// 分析视频帧
function analyzeFrame(timestamp) {
    if (!isProcessing) return;
    
    // 计算FPS
    calculateFPS(timestamp);
    
    // 限制处理频率
    const now = Date.now();
    if (now - lastProcessTime > processingInterval) {
        lastProcessTime = now;
        
        // 绘制当前帧到Canvas
        canvasContext.drawImage(videoPlayer, 0, 0, videoCanvas.width, videoCanvas.height);
        
        // 提取边缘区域颜色
        extractEdgeColors();
        
        // 应用背景颜色
        applyBackgroundColor();
        
        // 动态调整采样参数
        adjustSamplingParameters();
    }
    
    // 继续下一帧
    requestAnimationFrame(analyzeFrame);
}

// 提取边缘区域颜色
function extractEdgeColors() {
    const width = videoCanvas.width;
    const height = videoCanvas.height;
    
    // 边缘区域大小（百分比）
    const edgeSize = 0.1; // 10%的边缘区域
    
    // 定义边缘区域的范围
    const regions = {
        left: {
            x: 0,
            y: 0,
            width: Math.max(10, Math.floor(width * edgeSize)),
            height: height,
            pixels: []
        },
        right: {
            x: Math.floor(width * (1 - edgeSize)),
            y: 0,
            width: Math.max(10, Math.floor(width * edgeSize)),
            height: height,
            pixels: []
        },
        top: {
            x: 0,
            y: 0,
            width: width,
            height: Math.max(10, Math.floor(height * edgeSize)),
            pixels: []
        },
        bottom: {
            x: 0,
            y: Math.floor(height * (1 - edgeSize)),
            width: width,
            height: Math.max(10, Math.floor(height * edgeSize)),
            pixels: []
        }
    };
    
    // 为每个边缘区域提取像素
    Object.keys(regions).forEach(regionName => {
        const region = regions[regionName];
        const imageData = canvasContext.getImageData(region.x, region.y, region.width, region.height);
        const pixels = imageData.data;
        
        // 采样像素（减少处理量）
        for (let i = 0; i < pixels.length; i += 4 * samplingStep) {
            // 跳过完全透明的像素
            if (pixels[i + 3] === 0) continue;
            
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            
            // 跳过接近黑色的像素（可能是视频边缘的黑边）
            if (r < 15 && g < 15 && b < 15) continue;
            
            // 转换为Lab颜色空间
            const lab = rgbToLab(r, g, b);
            region.pixels.push({ r, g, b, lab });
        }
    });
    
    // 对每个区域进行颜色聚类
    Object.keys(regions).forEach(regionName => {
        const clusters = clusterColors(regions[regionName].pixels);
        if (clusters.length > 0) {
            // 找出最大的簇
            let maxCluster = clusters[0];
            for (let i = 1; i < clusters.length; i++) {
                if (clusters[i].pixels.length > maxCluster.pixels.length) {
                    maxCluster = clusters[i];
                }
            }
            
            // 更新该边缘区域的颜色
            if (maxCluster.pixels.length > 0) {
                const avgColor = calculateAverageColor(maxCluster.pixels);
                edgeRegions[regionName].color = avgColor;
            }
        }
    });
}

// 颜色聚类算法
function clusterColors(pixels) {
    if (pixels.length === 0) return [];
    
    const clusters = [];
    const threshold = 15; // Lab空间中的距离阈值
    
    // 遍历所有像素
    for (const pixel of pixels) {
        let foundCluster = false;
        
        // 尝试将像素添加到现有簇
        for (const cluster of clusters) {
            const distance = calculateLabDistance(pixel.lab, cluster.center);
            if (distance < threshold) {
                cluster.pixels.push(pixel);
                // 更新簇中心
                updateClusterCenter(cluster);
                foundCluster = true;
                break;
            }
        }
        
        // 如果没有找到匹配的簇，创建新簇
        if (!foundCluster) {
            clusters.push({
                center: {...pixel.lab},
                pixels: [pixel]
            });
        }
    }
    
    // 过滤掉太小的簇（可能是噪点）
    return clusters.filter(cluster => cluster.pixels.length > pixels.length * 0.05);
}

// 更新簇中心
function updateClusterCenter(cluster) {
    const pixels = cluster.pixels;
    let sumL = 0, sumA = 0, sumB = 0;
    
    for (const pixel of pixels) {
        sumL += pixel.lab.l;
        sumA += pixel.lab.a;
        sumB += pixel.lab.b;
    }
    
    cluster.center = {
        l: sumL / pixels.length,
        a: sumA / pixels.length,
        b: sumB / pixels.length
    };
}

// 计算Lab空间中的欧几里得距离
function calculateLabDistance(lab1, lab2) {
    return Math.sqrt(
        Math.pow(lab1.l - lab2.l, 2) +
        Math.pow(lab1.a - lab2.a, 2) +
        Math.pow(lab1.b - lab2.b, 2)
    );
}

// 计算平均颜色
function calculateAverageColor(pixels) {
    let sumR = 0, sumG = 0, sumB = 0;
    
    for (const pixel of pixels) {
        sumR += pixel.r;
        sumG += pixel.g;
        sumB += pixel.b;
    }
    
    return {
        r: Math.round(sumR / pixels.length),
        g: Math.round(sumG / pixels.length),
        b: Math.round(sumB / pixels.length)
    };
}

// 应用背景颜色
function applyBackgroundColor() {
    // 收集所有有效的边缘颜色
    const validColors = Object.values(edgeRegions)
        .filter(region => region.color !== null)
        .map(region => region.color);
    
    if (validColors.length === 0) return;
    
    // 计算所有有效边缘颜色的平均值
    let sumR = 0, sumG = 0, sumB = 0;
    for (const color of validColors) {
        sumR += color.r;
        sumG += color.g;
        sumB += color.b;
    }
    
    const avgColor = {
        r: Math.round(sumR / validColors.length),
        g: Math.round(sumG / validColors.length),
        b: Math.round(sumB / validColors.length)
    };
    
    // 应用背景颜色（带过渡效果）
    videoContainer.style.backgroundColor = `rgb(${avgColor.r}, ${avgColor.g}, ${avgColor.b})`;
    
    // 更新边缘指示器的颜色（用于可视化）
    Object.keys(edgeRegions).forEach(regionName => {
        const region = edgeRegions[regionName];
        const indicator = document.querySelector(`.edge-indicator.${regionName}`);
        if (indicator && region.color) {
            indicator.style.backgroundColor = `rgba(${region.color.r}, ${region.color.g}, ${region.color.b}, 0.5)`;
        }
    });
}

// RGB转Lab颜色空间
function rgbToLab(r, g, b) {
    // 标准化RGB值到[0,1]
    r /= 255;
    g /= 255;
    b /= 255;
    
    // RGB到XYZ的转换
    r = (r > 0.04045) ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = (g > 0.04045) ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = (b > 0.04045) ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
    
    r *= 100;
    g *= 100;
    b *= 100;
    
    const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const z = r * 0.0193 + g * 0.1192 + b * 0.9505;
    
    // XYZ到Lab的转换
    const xRef = 95.047;
    const yRef = 100.0;
    const zRef = 108.883;
    
    let xNorm = x / xRef;
    let yNorm = y / yRef;
    let zNorm = z / zRef;
    
    xNorm = (xNorm > 0.008856) ? Math.pow(xNorm, 1/3) : (7.787 * xNorm) + (16/116);
    yNorm = (yNorm > 0.008856) ? Math.pow(yNorm, 1/3) : (7.787 * yNorm) + (16/116);
    zNorm = (zNorm > 0.008856) ? Math.pow(zNorm, 1/3) : (7.787 * zNorm) + (16/116);
    
    const l = (116 * yNorm) - 16;
    const a = 500 * (xNorm - yNorm);
    const b_value = 200 * (yNorm - zNorm);
    
    return { l, a, b: b_value };
}

// 计算FPS
function calculateFPS(timestamp) {
    if (!performanceData.lastFrameTime) {
        performanceData.lastFrameTime = timestamp;
        return;
    }
    
    const elapsed = timestamp - performanceData.lastFrameTime;
    performanceData.frameCount++;
    
    // 每秒更新一次FPS
    if (elapsed >= 1000) {
        performanceData.fps = Math.round((performanceData.frameCount * 1000) / elapsed);
        performanceData.frameCount = 0;
        performanceData.lastFrameTime = timestamp;
        
        // 更新性能指示器
        updatePerformanceIndicator();
    }
}

// 创建性能监控指示器
function createPerformanceMonitor() {
    const indicator = document.createElement('div');
    indicator.className = 'performance-indicator';
    indicator.id = 'performanceIndicator';
    document.body.appendChild(indicator);
}

// 更新性能指示器
function updatePerformanceIndicator() {
    const indicator = document.getElementById('performanceIndicator');
    if (indicator) {
        indicator.textContent = `FPS: ${performanceData.fps} | 采样间隔: ${samplingStep}`;
    }
}

// 动态调整采样参数
function adjustSamplingParameters() {
    // 根据FPS动态调整采样步长和处理间隔
    if (performanceData.fps < 30) {
        // FPS低，增加采样间隔和处理间隔
        samplingStep = Math.min(samplingStep + 2, 16);
        processingInterval = Math.min(processingInterval + 50, 1000);
    } else if (performanceData.fps > 55) {
        // FPS高，可以减少采样间隔和处理间隔
        samplingStep = Math.max(samplingStep - 1, 4);
        processingInterval = Math.max(processingInterval - 50, 250);
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', init);
