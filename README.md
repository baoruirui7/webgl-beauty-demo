# WebGL 美颜滤镜 Demo

## 功能

- 摄像头采集视频流
- MediaPipe Face Mesh 人脸关键点检测
- WebGL 实时美颜滤镜（磨皮、亮肤、饱和度调整）
- 局部处理，仅对人脸区域应用滤镜
- 可扩展为直播推流前端美颜处理

## 运行

1. 使用支持模块的本地服务器（如 `http-server` 或 VSCode Live Server）
2. 访问 `index.html`
3. 允许摄像头权限
4. 观看美颜处理后的视频效果

## 依赖

- MediaPipe Face Mesh CDN
- 现代浏览器支持 WebGL 和 MediaStream

## 扩展建议

- 优化滤镜算法，提升磨皮效果
- 增加动态贴纸、表情识别等特效
- 集成推流 SDK，实现端到端直播美颜
