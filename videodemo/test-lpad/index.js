function loadImage(imageSource) {
    return new Promise((resolve, reject) => {
      if (typeof imageSource === 'string') {
        // 判断是否是视频文件
        if (imageSource.match(/\.(mp4|webm|ogg|mov)$/i)) {
          const video = document.createElement('video')
          video.crossOrigin = 'Anonymous'
          video.src = imageSource
          video.onloadeddata = () => resolve(video)
          video.onerror = (err) => reject(err)
        } else {
          const img = new Image()
          img.crossOrigin = 'Anonymous'
          img.src = imageSource
          if (img.complete) {
            resolve(img)
          } else {
            img.onload = () => resolve(img)
            img.onerror = (err) => reject(err)
          }
        }
      } else {
        // 直接传入的 HTMLImageElement 或 HTMLVideoElement
        if (imageSource instanceof HTMLVideoElement) {
          if (imageSource.readyState >= 1) { // HAVE_METADATA = 1
            resolve(imageSource)
          } else {
            imageSource.addEventListener('loadeddata', () => {
              if (imageSource.readyState >= 1) {
                resolve(imageSource)
              }
            })
            imageSource.onerror = (err) => reject(err)
          }
        } else {
          if (imageSource.complete) {
            resolve(imageSource)
          } else {
            imageSource.onload = () => resolve(imageSource)
            imageSource.onerror = (err) => reject(err)
          }
        }
      }
    })
  }