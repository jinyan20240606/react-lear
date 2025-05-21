# AutoHue 边缘聚类分析

## K-means 聚类算法在边缘像素聚类中的应用

AutoHue.ts 文件中的 `clusterPixelsByCondition` 函数使用 K-means 聚类算法对图像边缘进行聚类，以提取代表性颜色。以下是该算法的详细分析：

### 1. 聚类基本原理

K-means 是一种无监督学习算法，通过将数据点分配到最近的簇中心，然后重新计算簇中心，不断迭代直到收敛，从而将数据分为 K 个簇。在 AutoHue 中，我们将像素的颜色值作为数据点，使用 Lab 色彩空间进行聚类，因为 Lab 空间的欧氏距离更接近人类感知的颜色差异。

### 2. 边缘像素的选择

边缘像素通过条件函数进行筛选：

```typescript
// 上边缘
const topClusters = clusterPixelsByCondition(imageData, (_x, y) => y < margin, threshold.top)

// 右边缘
const rightClusters = clusterPixelsByCondition(imageData, (x, _y) => x >= width - margin, threshold.right)

// 下边缘
const bottomClusters = clusterPixelsByCondition(imageData, (_x, y) => y >= height - margin, threshold.bottom)

// 左边缘
const leftClusters = clusterPixelsByCondition(imageData, (x, _y) => x < margin, threshold.left)
```

这里的 `margin` 定义了边缘的宽度（默认为10像素），通过条件函数筛选出位于图像四个边缘的像素。

### 3. K-means 聚类实现步骤

#### 3.1 像素收集

首先收集满足条件的像素点：

```typescript
const pixels: [number, number, number][] = []
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (!condition(x, y)) continue
    const index = (y * width + x) * 4
    if (data[index + 3] === 0) continue  // 跳过透明像素
    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    pixels.push([r, g, b])
  }
}
```

#### 3.2 初始簇数估计

根据像素数量动态确定初始簇数：

```typescript
let k = Math.min(10, Math.max(2, Math.floor(pixels.length / 100)))
```

这确保了簇数在2到10之间，并且与像素数量成比例。

#### 3.3 簇中心初始化

随机选择 k 个像素作为初始簇中心：

```typescript
const centers: [number, number, number][] = []
for (let i = 0; i < k; i++) {
  const idx = Math.floor(Math.random() * pixels.length)
  centers.push(pixels[idx])
}
```

#### 3.4 迭代聚类过程

K-means 的核心迭代过程包括：

1. **分配阶段**：将每个像素分配到最近的簇中心
   ```typescript
   for (const pixel of pixels) {
     const lab = rgbToLab(pixel[0], pixel[1], pixel[2])
     let minDistance = Infinity
     let closestClusterIndex = 0

     for (let i = 0; i < newClusters.length; i++) {
       const distance = labDistance(lab, newClusters[i].averageLab)
       if (distance < minDistance) {
         minDistance = distance
         closestClusterIndex = i
       }
     }
     
     // ... 分配像素到簇
   }
   ```

2. **自适应簇数调整**：如果像素与最近的簇中心距离太远，可能增加新的簇
   ```typescript
   if (minDistance > threshold && k < 10) {
     k++
     centers.push(pixel)
     newClusters.push({
       count: 1,
       sumRgb: [pixel[0], pixel[1], pixel[2]],
       sumLab: lab,
       averageRgb: [pixel[0], pixel[1], pixel[2]],
       averageLab: lab
     })
     changed = true
     break
   }
   ```

3. **更新阶段**：重新计算每个簇的中心
   ```typescript
   for (let i = 0; i < newClusters.length; i++) {
     const cluster = newClusters[i]
     if (cluster.count > 0) {
       const newAverageRgb: [number, number, number] = [
         cluster.sumRgb[0] / cluster.count,
         cluster.sumRgb[1] / cluster.count,
         cluster.sumRgb[2] / cluster.count
       ]
       const newAverageLab = rgbToLab(newAverageRgb[0], newAverageRgb[1], newAverageRgb[2])
       
       // 检查簇中心是否移动
       if (labDistance(cluster.averageLab, newAverageLab) > 0.1) {
         changed = true
       }
       
       cluster.averageRgb = newAverageRgb
       cluster.averageLab = newAverageLab
     }
   }
   ```

4. **收敛检查**：如果簇中心不再移动或达到最大迭代次数，则停止迭代
   ```typescript
   while (changed && iterations < maxIterations) {
     // 迭代过程
     iterations++
     // ...
   }
   ```

### 4. 阈值的作用

阈值参数 `threshold` 在两个方面起作用：

1. **自适应簇数调整**：当像素与最近簇中心的距离大于阈值时，可能创建新的簇
2. **颜色差异容忍度**：较小的阈值会导致更多的簇，捕捉更细微的颜色差异；较大的阈值会导致更少的簇，合并相似的颜色

### 5. Lab 色彩空间的优势

使用 Lab 色彩空间而不是 RGB 进行聚类的主要原因：

1. **感知均匀性**：Lab 空间中的欧氏距离更接近人类感知的颜色差异
2. **亮度与色度分离**：L 通道表示亮度，a 和 b 通道表示色度，使得聚类更符合人眼感知
3. **设备独立性**：Lab 是一个设备无关的色彩空间，不受显示设备特性的影响

### 6. 边缘聚类的应用

边缘聚类的结果用于确定背景色：

```typescript
return {
  primaryColor,
  secondaryColor,
  backgroundColor: {
    top: topColor,
    right: rightColor,
    bottom: bottomColor,
    left: leftColor
  }
}
```

这种方法特别适用于：

1. **自适应UI设计**：根据图像边缘颜色调整UI元素，提高视觉协调性
2. **视频播放器背景**：为视频播放器创建与视频内容匹配的背景色
3. **图像展示优化**：为图像创建渐变或纯色背景，增强视觉体验

### 7. 优化考虑

当前实现的一些优化点：

1. **动态簇数**：根据像素数量和颜色复杂度自适应调整簇数
2. **早期终止**：当簇中心稳定或达到最大迭代次数时终止
3. **Lab色彩空间**：使用更符合人类感知的色彩空间
4. **透明像素过滤**：忽略透明像素，只聚类可见部分

### 总结

AutoHue 中的边缘聚类算法通过 K-means 在 Lab 色彩空间中对图像边缘进行聚类，提取代表性颜色。该方法结合了色彩感知理论和聚类算法，实现了高效、准确的颜色提取，为自适应UI设计和视觉体验优化提供了有力支持。
