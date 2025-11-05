/**
 * WebGL 美颜滤镜着色器程序
 * 
 * 功能：
 * - 提供顶点着色器用于处理顶点坐标和纹理映射
 * - 提供片元着色器实现美颜算法，包括：
 *   - 双边滤波实现磨皮效果
 *   - RGB与HSV颜色空间转换
 *   - 亮度调整和饱和度增强
 *   - 基于人脸位置的局部美颜处理
 * 
 * 作者：WebGL 技术团队
 * 日期：2023
 */

// 顶点着色器源码 - WebGL渲染管线的第一阶段，负责处理顶点数据
// 顶点着色器的主要职责：
// 1. 接收顶点位置和纹理坐标数据
// 2. 处理坐标变换（本例中使用标准化设备坐标系，无需额外变换）
// 3. 将数据传递给片元着色器
export const vertexShaderSrc = `
  // 顶点位置属性 - 从JavaScript传入的顶点坐标
  attribute vec4 a_position;  // vec4类型：(x,y,z,w)，w通常为1.0
  // 纹理坐标属性 - 从JavaScript传入的纹理坐标
  attribute vec2 a_texCoord;  // vec2类型：(s,t)或(u,v)，范围通常是[0,1]
  // 变化量 - 用于将纹理坐标从顶点着色器传递到片元着色器
  varying vec2 v_texCoord;    // 片元着色器会对顶点间的值进行插值
  
  void main() {
    // 设置顶点的最终位置（在标准化设备坐标系中）
    // 这里直接使用传入的位置值，因为我们已经提供了标准化坐标
    gl_Position = a_position;
    
    // 将纹理坐标传递给片元着色器
    // 片元着色器在处理像素时，会根据像素在三角形中的位置对纹理坐标进行插值
    v_texCoord = a_texCoord;
  }
`;

// 片元着色器源码 - WebGL渲染管线的第二阶段，负责像素级处理
// 片元着色器的主要职责：
// 1. 处理每个像素的颜色
// 2. 实现美颜算法（磨皮、亮度调整、饱和度增强、对比度调整、色调调整）
// 3. 基于人脸位置进行局部美颜
// 4. 输出最终像素颜色
export const fragmentShaderSrc = `
  // 精度声明 - 指定浮点数的精度为中等（平衡性能和精度）
  precision mediump float;

  // 纹理采样器 - 用于从视频纹理中采样颜色
  uniform sampler2D u_texture;
  // 画布分辨率 - 用于计算像素坐标偏移
  uniform vec2 u_resolution;
  // 人脸中心点 - 从人脸检测结果获得
  uniform vec2 u_faceCenter;
  // 人脸处理长轴半径 - 控制美颜效果的应用范围
  uniform float u_faceRadiusMajor;
  // 人脸处理短轴半径 - 控制美颜效果的应用范围
  uniform float u_faceRadiusMinor;
  // 磨皮强度参数 - 控制磨皮效果的强度
  uniform float u_smoothness;
  // 亮度提升参数 - 控制亮度增加的程度
  uniform float u_brightness;
  // 饱和度调整参数 - 控制颜色饱和度的调整比例
  uniform float u_saturation;
  // 对比度调整参数 - 控制颜色对比度的调整
  uniform float u_contrast;
  // 色调调整参数 - 控制颜色色调的调整
  uniform float u_hue;

  // 变化量 - 从顶点着色器接收并插值后的纹理坐标
  varying vec2 v_texCoord;

  // 辅助函数1：RGB颜色空间转换到HSV颜色空间
  // 这是美颜算法中调整饱和度的关键步骤
  // 参数：
  //   - c: RGB颜色值，范围[0,1]
  // 返回：
  //   - vec3(h, s, v): 色相(0-360度)，饱和度(0-1)，明度(0-1)
  vec3 rgb2hsv(vec3 c) {
    // 找出RGB通道中的最大值和最小值
    float cMax = max(c.r, max(c.g, c.b));
    float cMin = min(c.r, min(c.g, c.b));
    // 计算色彩范围（chroma）
    float delta = cMax - cMin;
    
    // 计算色相(hue)：
    // 根据RGB通道的大小关系确定色相角度
    float h = 0.0;
    if (delta == 0.0) h = 0.0;  // 灰度值，色相任意
    else if (cMax == c.r) h = mod((60.0 * ((c.g - c.b) / delta) + 360.0), 360.0);  // 红色主色调
    else if (cMax == c.g) h = mod((60.0 * ((c.b - c.r) / delta) + 120.0), 360.0);  // 绿色主色调
    else h = mod((60.0 * ((c.r - c.g) / delta) + 240.0), 360.0);  // 蓝色主色调
    
    // 计算饱和度(saturation)：
    // 饱和度 = chroma / 明度（当明度不为0时）
    float s = (cMax == 0.0) ? 0.0 : delta / cMax;
    
    // 明度(value)：直接使用RGB中的最大值
    float v = cMax;
    
    return vec3(h, s, v);
  }

  // 辅助函数2：HSV颜色空间转换回RGB颜色空间
  // 这是调整饱和度后恢复到显示格式的必要步骤
  // 参数：
  //   - c: HSV颜色值，h范围0-360度，s和v范围0-1
  // 返回：
  //   - vec3(r, g, b): RGB颜色值，范围[0,1]
  vec3 hsv2rgb(vec3 c) {
    float h = c.x;  // 色相
    float s = c.y;  // 饱和度
    float v = c.z;  // 明度
    
    // 计算chroma（色彩浓度）
    float c1 = v * s;
    // 计算辅助值x，用于分段线性插值
    float x = c1 * (1.0 - abs(mod(h / 60.0, 2.0) - 1.0));
    // 计算m值，用于偏移RGB分量
    float m = v - c1;
    
    vec3 rgb;
    // 根据色相角度，选择RGB分量的分配方式
    // 色相环被分为6个区段，每个区段30度
    if (h < 60.0) rgb = vec3(c1, x, 0.0);     // 红→黄
    else if (h < 120.0) rgb = vec3(x, c1, 0.0);  // 黄→绿
    else if (h < 180.0) rgb = vec3(0.0, c1, x);  // 绿→青
    else if (h < 240.0) rgb = vec3(0.0, x, c1);  // 青→蓝
    else if (h < 300.0) rgb = vec3(x, 0.0, c1);  // 蓝→紫
    else rgb = vec3(c1, 0.0, x);              // 紫→红
    
    // 添加m值偏移，确保正确的明度
    return rgb + vec3(m);
  }

  // 计算亮度值
  float luminance(vec3 color) {
    return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
  }
  
  // 核心美颜算法：改进的双边滤波 - 更好地保留亮度信息
  // 参数：
  //   - uv: 纹理坐标
  // 返回：
  //   - vec4: 经过磨皮处理后的颜色值
  vec4 bilateralFilter(vec2 uv) {
    // 空间域标准差 - 控制滤波核的空间范围
    float sigma_d = 4.0;
    // 亮度域标准差 - 控制亮度相似性的权重
    float sigma_r = 0.1;
    // 色彩域标准差 - 控制色彩相似性的权重
    float sigma_c = 0.15;
    
    // 获取当前像素颜色
    vec4 centerColor = texture2D(u_texture, uv);
    // 计算当前像素亮度
    float centerLum = luminance(centerColor.rgb);
    
    // 用于累积加权平均的变量
    float sum = 0.0;        // 权重总和
    vec4 result = vec4(0.0); // 加权颜色总和

    // 5x5的滤波核（从-2到2）
    for (int x = -2; x <= 2; x++) {
      for (int y = -2; y <= 2; y++) {
        // 计算采样偏移量，转换为纹理坐标单位
        vec2 offset = vec2(float(x), float(y)) / u_resolution;
        // 获取采样点颜色
        vec4 sampleColor = texture2D(u_texture, uv + offset);
        // 计算采样点亮度
        float sampleLum = luminance(sampleColor.rgb);

        // 计算空间距离权重 - 基于高斯分布
        float dist = length(offset) / sigma_d;
        // 计算亮度距离权重 - 基于亮度差异
        float lumDist = abs(sampleLum - centerLum) / sigma_r;
        // 计算颜色距离权重 - 基于归一化到亮度的颜色差异
        // 这样可以在保留亮度信息的同时平滑颜色
        vec3 colorDiff = (sampleColor.rgb / max(sampleLum, 0.01)) - (centerColor.rgb / max(centerLum, 0.01));
        float colorDist = length(colorDiff) / sigma_c;

        // 计算总权重 - 空间权重、亮度权重和颜色权重的乘积（指数衰减）
        float weight = exp(-(dist * dist + lumDist * lumDist + colorDist * colorDist));
        // 累积加权颜色
        result += sampleColor * weight;
        // 累积权重
        sum += weight;
      }
    }
    
    // 返回加权平均后的颜色
    return result / sum;
  }

  // 片元着色器主函数 - 每个像素都会执行一次
  void main() {
    // 获取当前像素的纹理坐标（已从顶点着色器插值）
    vec2 uv = v_texCoord;
    
    // 计算当前像素到人脸中心的距离
    // 这个距离用于确定是否对该像素应用美颜处理
    // 计算椭圆距离 - 使用标准椭圆方程判断点是否在椭圆内
    // 椭圆方程: ((x-centerX)/a)^2 + ((y-centerY)/b)^2 <= 1
    // 其中a是长轴半径，b是短轴半径
    // 计算到人脸中心的距离，使用预计算的椭圆参数
    // 由于main.js中已经根据人脸比例计算了合适的椭圆参数，这里直接使用即可
    // 椭圆参数只与人脸特征相关，不受视频比例影响
    vec2 diff = uv - u_faceCenter;
    float ellipseDist = pow(diff.x / u_faceRadiusMajor, 2.0) + pow(diff.y / u_faceRadiusMinor, 2.0);
    
    // 当椭圆距离小于1时，点在椭圆内

    // 从视频纹理中采样原始颜色
    vec4 color = texture2D(u_texture, uv);

    // 关键步骤：只有当像素在人脸区域内时才应用美颜处理
    // 这实现了局部美颜的效果，只处理面部区域
    if (ellipseDist < 1.0) {
      // 步骤1：应用双边滤波进行磨皮处理
      vec4 smoothColor = bilateralFilter(uv);

      // 步骤2：亮度提升
      // 直接在RGB空间增加每个通道的值
      smoothColor.rgb += vec3(u_brightness);

      // 步骤3：对比度调整
      // 对比度公式：output = (input - 0.5) * contrast + 0.5
      smoothColor.rgb = (smoothColor.rgb - 0.5) * u_contrast + 0.5;
      smoothColor.rgb = clamp(smoothColor.rgb, 0.0, 1.0); // 确保结果在有效范围内
      
      // 步骤4：饱和度和色调调整
      // 1. 先转换到HSV颜色空间
      vec3 hsv = rgb2hsv(smoothColor.rgb);
      // 2. 调整饱和度分量（乘以系数）
      hsv.y = clamp(hsv.y * u_saturation, 0.0, 1.0); // 确保结果在有效范围内
      // 3. 调整色调分量（增加角度）
      hsv.x = mod(hsv.x + u_hue, 360.0); // 确保色相值在0-360度范围内
      // 4. 转回RGB颜色空间
      smoothColor.rgb = hsv2rgb(hsv);

      // 步骤4：根据磨皮强度参数混合原始颜色和处理后颜色
      // u_smoothness=0：不磨皮，u_smoothness=1：完全磨皮
      color.rgb = mix(color.rgb, smoothColor.rgb, u_smoothness);
    }

    // 输出最终像素颜色
    // gl_FragColor是片元着色器的内置输出变量
    gl_FragColor = color;
  }
`;
