import GaussianFilter from './gaussian';

document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const videoPlayer = document.getElementById('videoPlayer');
    const videoCanvas = document.getElementById('videoCanvas');
    const videoContainer = document.getElementById('videoContainer');
    const videoInput = document.getElementById('videoInput');
    
    // 高斯滤波相关元素
    const gaussianEnabled = document.getElementById('gaussianEnabled');
    const gaussianRadius = document.getElementById('gaussianRadius');
    const radiusValue = document.getElementById('radiusValue');
    const gaussianSigma = document.getElementById('gaussianSigma');
    const sigmaValue = document.getElementById('sigmaValue');
    const applyFilterBtn = document.getElementById('applyFilter');
    const resetFilterBtn = document.getElementById('resetFilter');
    const originalPreview = document.getElementById('originalPreview');
    const filteredPreview = document.getElementById('filteredPreview');
    
    // 初始化高斯滤波器
    let gaussianFilter = new GaussianFilter();
    let isFilterApplied = false;
    
    // 设置Canvas上下文
    const ctx = videoCanvas.getContext('2d', { willReadFrequently: true });
    const originalCtx = originalPreview.getContext('2d');
    const filteredCtx = filteredPreview.getContext('2d');
    
    // 高斯滤波控制面板事件
    gaussianRadius.addEventListener('input', function() {
        radiusValue.textContent = this.value;
    });
    
    gaussianSigma.addEventListener('input', function() {
        sigmaValue.textContent = this.value;
    });
    
    applyFilterBtn.addEventListener('click', function() {
        const radius = parseInt(gaussianRadius.value);
        const sigma = parseFloat(gaussianSigma.value);
        gaussianFilter.updateParameters(radius, sigma);
        isFilterApplied = gaussianEnabled.checked;
        updatePreviews();
    });
    
    resetFilterBtn.addEventListener('click', function() {
        gaussianEnabled.checked = false;
        gaussianRadius.value = 2;
        radiusValue.textContent = '2';
        gaussianSigma.value = 1.0;
        sigmaValue.textContent = '1.0';
        isFilterApplied = false;
        updatePreviews();
    });
    
    // 更新预览画布
    function updatePreviews() {
        if (videoPlayer.paused || videoPlayer.ended) return;
        
        // 绘制原始帧到预览画布
        originalCtx.drawImage(videoPlayer, 0, 0, originalPreview.width, originalPreview.height);
        
        if (isFilterApplied) {
            // 应用高斯滤波
            const imageData = originalCtx.getImageData(0, 0, originalPreview.width, originalPreview.height);
            const filteredData = gaussianFilter.apply(imageData);
            filteredCtx.putImageData(filteredData, 0, 0);
        } else {
            // 直接复制原始图像
            filteredCtx.drawImage(originalPreview, 0, 0);
        }
    }
    
    // 颜色分析的频率（毫秒）
    const colorAnalysisInterval = 300;
    let lastAnalysisTime = 0;
    let animationFrameId = null;
    
    // 用于颜色过渡的变量
    let currentColor = { r: 0, g: 0, b: 0 };
    let targetColor = { r: 0, g: 0, b: 0 };
    const transitionSpeed = 0.1;
    
    // 视频文件选择处理
    videoInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const videoURL = URL.createObjectURL(file);
            videoPlayer.crossOrigin = 'Anonymous'
            // 直接使用url不行：https://static.pinpai.360.cn/advip/940e6a223c922b6ec661abf541da8200.mp4
            // 有canvasgetImageData跨域问题，必须使用Blob解决
            videoPlayer.src = 'https://static.pinpai.360.cn/advip/940e6a223c922b6ec661abf541da8200.mp4'
            videoPlayer.load();
            videoPlayer.play();
        }
    });
    
    // 视频元数据加载完成后设置Canvas尺寸
    videoPlayer.addEventListener('loadedmetadata', function() {
        videoCanvas.width = videoPlayer.videoWidth;
        videoCanvas.height = videoPlayer.videoHeight;
    });
    
    // 视频播放时开始颜色分析
    videoPlayer.addEventListener('play', function() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        analyzeVideoColor();
    });
    
    // 视频暂停或结束时停止颜色分析
    videoPlayer.addEventListener('pause', function() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    });
    
    videoPlayer.addEventListener('ended', function() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    });
    
    // Main：分析视频颜色的主函数
    function analyzeVideoColor() {
        if (videoPlayer.paused || videoPlayer.ended) {
            return;
        }
        
        const now = Date.now();
        
        // 限制颜色分析的频率
        if (now - lastAnalysisTime >= colorAnalysisInterval) {
            lastAnalysisTime = now;
            
            // 将当前视频帧绘制到Canvas上
            ctx.drawImage(videoPlayer, 0, 0, videoCanvas.width, videoCanvas.height);
            
            // 获取图像数据
            const imageData = ctx.getImageData(0, 0, videoCanvas.width, videoCanvas.height);
            let filteredImageData = imageData;
            
            // 应用高斯滤波
            if (isFilterApplied) {
                filteredImageData = gaussianFilter.apply(imageData);
            }
            
            const pixels = filteredImageData.data;
            console.log(imageData,'pixels========79=====')
            // 分析颜色
            const color = analyzeFrameColor(pixels);
            
            // 更新预览
            updatePreviews();
            
            // 应用颜色到视频容器背景
            applyBackgroundColor(color);
        }
        
        // 继续下一帧分析
        animationFrameId = requestAnimationFrame(analyzeVideoColor);
    }
    
    // 分析帧颜色的方法（只分析左右两侧区域）
    function analyzeFrameColor(pixels) {
        const width = videoCanvas.width;
        const height = videoCanvas.height;
        
        // 分别存储左右两侧的像素
        const leftSidePixels = [];
        const rightSidePixels = [];
        
        // 定义左右两侧区域的宽度（视频宽度的10%）
        const sideWidth = Math.round(width * 0.1);
        
        // 采样间隔（提高性能）
        const sampleInterval = 4;
        
        // 遍历图像像素，只收集左右两侧的像素
        for (let y = 0; y < height; y += sampleInterval) {
            // 左侧区域
            for (let x = 0; x < sideWidth; x += sampleInterval) {
                const index = (y * width + x) * 4;
                const r = pixels[index];
                const g = pixels[index + 1];
                const b = pixels[index + 2];
                
                // 忽略接近黑色的像素（可能是黑边）
                const brightness = (r + g + b) / 3;
                if (brightness > 30) { // 提高亮度阈值
                    leftSidePixels.push({ r, g, b });
                }
            }
            
            // 右侧区域
            for (let x = width - sideWidth; x < width; x += sampleInterval) {
                const index = (y * width + x) * 4;
                const r = pixels[index];
                const g = pixels[index + 1];
                const b = pixels[index + 2];
                
                // 忽略接近黑色的像素
                const brightness = (r + g + b) / 3;
                if (brightness > 30) {
                    rightSidePixels.push({ r, g, b });
                }
            }
        }
        
        // 如果没有足够的有效像素，返回默认颜色
        if (leftSidePixels.length < 50 && rightSidePixels.length < 50) {
            return { r: 0, g: 0, b: 0 };
        }
        
        // 计算左右两侧的平均颜色
        let leftColor = calculateAverageColor(leftSidePixels);
        let rightColor = calculateAverageColor(rightSidePixels);
        
        // 如果其中一侧没有有效像素，使用另一侧的颜色
        if (leftSidePixels.length < 50) leftColor = rightColor;
        if (rightSidePixels.length < 50) rightColor = leftColor;
        
        // 返回左右两侧颜色的混合结果
        return {
            r: Math.round((leftColor.r + rightColor.r) / 2),
            g: Math.round((leftColor.g + rightColor.g) / 2),
            b: Math.round((leftColor.b + rightColor.b) / 2)
        };
    }
    
    // 计算像素数组的平均颜色，并进行HSL调整
    function calculateAverageColor(pixels) {
        if (pixels.length === 0) return { r: 0, g: 0, b: 0 };
        
        let totalR = 0, totalG = 0, totalB = 0;
        pixels.forEach(pixel => {
            totalR += pixel.r;
            totalG += pixel.g;
            totalB += pixel.b;
        });
        
        const avgR = Math.round(totalR / pixels.length);
        const avgG = Math.round(totalG / pixels.length);
        const avgB = Math.round(totalB / pixels.length);
        
        // 将RGB转换为HSL以便更精确地控制颜色属性
        const hslColor = rgbToHsl(avgR, avgG, avgB);
        
        // 调整HSL值以获得更好的视觉效果
        // 降低饱和度，使颜色更柔和
        hslColor.s = Math.min(hslColor.s * 0.85, 0.7);
        
        // 调整亮度，避免太亮或太暗
        hslColor.l = Math.max(Math.min(hslColor.l * 0.9, 0.6), 0.2);
        
        // 将调整后的HSL转换回RGB
        const adjustedRgb = hslToRgb(hslColor.h, hslColor.s, hslColor.l);
        
        return {
            r: adjustedRgb.r,
            g: adjustedRgb.g,
            b: adjustedRgb.b
        };
    }
    
    // RGB转HSL颜色空间
    function rgbToHsl(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        
        if (max === min) {
            h = s = 0; // 灰色
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            
            h /= 6;
        }
        
        return { h, s, l };
    }
    
    // HSL转RGB颜色空间
    function hslToRgb(h, s, l) {
        let r, g, b;
        
        if (s === 0) {
            r = g = b = l; // 灰色
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        
        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }
    
    // 应用背景颜色到视频容器（带平滑过渡）
    function applyBackgroundColor(color) {
        // 更新目标颜色
        targetColor = color;
        
        // 如果还没有设置当前颜色，立即设置
        if (currentColor.r === 0 && currentColor.g === 0 && currentColor.b === 0) {
            currentColor = {...targetColor};
        }
        
        // 启动颜色过渡动画
        if (!transitionAnimationId) {
            transitionAnimationId = requestAnimationFrame(updateBackgroundColor);
        }
        
        // 存储当前视频帧的主色调，用于业务策略选择
        lastFrameColor = color;
    }
    
    
    // 颜色过渡动画
    let transitionAnimationId = null;
    
    function updateBackgroundColor() {
        // 计算当前颜色向目标颜色过渡的下一步
        currentColor.r += (targetColor.r - currentColor.r) * transitionSpeed;
        currentColor.g += (targetColor.g - currentColor.g) * transitionSpeed;
        currentColor.b += (targetColor.b - currentColor.b) * transitionSpeed;
        
        // 应用颜色
        const r = Math.round(currentColor.r);
        const g = Math.round(currentColor.g);
        const b = Math.round(currentColor.b);
        
        // 获取HSL值，用于更精确的颜色控制
        const hsl = rgbToHsl(r, g, b);
        
        // 创建半透明蒙层效果的渐变背景
        // 使用rgba来添加透明度，创造更柔和的过渡效果
        const gradient = `linear-gradient(to right, 
            rgba(${r}, ${g}, ${b}, 0.9) 0%, 
            rgba(${r}, ${g}, ${b}, 0.7) 5%, 
            rgba(${r}, ${g}, ${b}, 0.4) 10%, 
            rgba(${r}, ${g}, ${b}, 0.1) 20%, 
            rgba(0, 0, 0, 0) 30%, 
            rgba(0, 0, 0, 0) 70%, 
            rgba(${r}, ${g}, ${b}, 0.1) 80%, 
            rgba(${r}, ${g}, ${b}, 0.4) 90%, 
            rgba(${r}, ${g}, ${b}, 0.7) 95%, 
            rgba(${r}, ${g}, ${b}, 0.9) 100%)`;
        
        // 应用渐变背景
        videoContainer.style.background = gradient;
        
        // 添加模糊效果的伪元素
        if (!videoContainer.querySelector('.blur-overlay')) {
            const blurOverlay = document.createElement('div');
            blurOverlay.className = 'blur-overlay';
            blurOverlay.style.position = 'absolute';
            blurOverlay.style.top = '0';
            blurOverlay.style.left = '0';
            blurOverlay.style.width = '100%';
            blurOverlay.style.height = '100%';
            blurOverlay.style.pointerEvents = 'none';
            blurOverlay.style.zIndex = '0';
            videoContainer.appendChild(blurOverlay);
            
            // 确保视频在蒙层上方
            videoPlayer.style.position = 'relative';
            videoPlayer.style.zIndex = '1';
        }
        
        // 更新模糊蒙层的样式
        const blurOverlay = videoContainer.querySelector('.blur-overlay');
        if (blurOverlay) {
            // 创建更复杂的模糊效果渐变
            const blurGradient = `linear-gradient(to right, 
                rgba(${r}, ${g}, ${b}, 0.8) 0%, 
                rgba(${r}, ${g}, ${b}, 0.6) 3%, 
                rgba(${r}, ${g}, ${b}, 0.3) 7%, 
                rgba(${r}, ${g}, ${b}, 0.1) 12%, 
                rgba(0, 0, 0, 0) 20%, 
                rgba(0, 0, 0, 0) 80%, 
                rgba(${r}, ${g}, ${b}, 0.1) 88%, 
                rgba(${r}, ${g}, ${b}, 0.3) 93%, 
                rgba(${r}, ${g}, ${b}, 0.6) 97%, 
                rgba(${r}, ${g}, ${b}, 0.8) 100%)`;
                
            blurOverlay.style.background = blurGradient;
            blurOverlay.style.backdropFilter = 'blur(5px)';
            blurOverlay.style.WebkitBackdropFilter = 'blur(5px)';
        }
        
        // 检查是否接近目标颜色
        const isCloseEnough = 
            Math.abs(currentColor.r - targetColor.r) < 0.5 && 
            Math.abs(currentColor.g - targetColor.g) < 0.5 && 
            Math.abs(currentColor.b - targetColor.b) < 0.5;
        
        // 如果还没有达到目标颜色，继续动画
        if (!isCloseEnough) {
            transitionAnimationId = requestAnimationFrame(updateBackgroundColor);
        } else {
            transitionAnimationId = null;
        }
    }
    
    // 添加示例视频加载错误处理
    videoPlayer.addEventListener('error', function() {
        console.error('视频加载失败');
        alert('视频加载失败，请选择其他视频文件');
    });
    
    // 视频大小变化时更新容器样式
    videoPlayer.addEventListener('loadedmetadata', function() {
        // 设置视频容器的高度，以确保视频居中显示
        const videoRatio = videoPlayer.videoWidth / videoPlayer.videoHeight;
        const containerWidth = videoContainer.clientWidth;
        const containerHeight = containerWidth / videoRatio;
        
        // 更新视频容器的样式
        videoContainer.style.height = containerHeight + 'px';
        
        // 添加过渡效果
        videoContainer.style.transition = 'background 0.5s ease';
    });
});
