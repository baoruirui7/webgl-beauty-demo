/**
 * WebGL 美颜滤镜主程序
 *
 * 功能：
 * - 使用 MediaPipe Face Mesh 进行人脸检测
 * - 利用 WebGL 实现视频美颜滤镜效果（支持视频文件）
 * - 包括磨皮、亮度调整和饱和度增强
 * - 支持人脸局部美颜处理
 * - 支持美颜效果开关控制
 *
 * 作者：WebGL 技术团队
 * 日期：2023
 */
import { vertexShaderSrc, fragmentShaderSrc } from "./shaders.js";

// 获取DOM元素
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
// 获取WebGL上下文 - 核心步骤1：初始化WebGL渲染环境
// 尝试使用标准WebGL上下文，如果不支持则回退到实验版本
const gl =
  canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
if (!gl) {
  console.error("您的浏览器不支持WebGL");
}

// 美颜开关控制变量（全局）
let beautyEnabled = true;
// 人脸识别开关控制变量（全局）
let faceDetectionEnabled = true;

// 美颜参数控制变量（全局，初始值为当前默认值）
let sharpnessVal = 0.5; // 锐化强度 (0-1，0表示模糊，1表示最大锐化)
let brightnessVal = 0.05; // 亮度提升
let saturationVal = 1.2; // 饱和度调整
let contrastVal = 1.0; // 对比度调整（1.0为原始对比度）
let hueVal = 0.0; // 色调调整（以角度为单位，0为原始色调）

// 初始化视频文件
async function initVideo() {
  try {
    // 直接加载文件夹中的test.mp4视频文件作为默认视频
    video.src = "test.mp4";

    // 设置视频加载完成事件
    video.onloadedmetadata = function () {
      // 根据视频尺寸设置画布大小
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      console.log(
        "视频加载成功，尺寸:",
        video.videoWidth,
        "x",
        video.videoHeight
      );

      // 不自动播放，等待用户交互后再播放
      console.log("默认视频已加载，请点击播放按钮开始播放");
    };
  } catch (e) {
    console.error("视频初始化失败:", e);
  }
}

// 核心函数1：创建着色器 - WebGL渲染管线构建步骤之一
function createShader(gl, type, source) {
  // 创建着色器对象 - 可以是顶点着色器(gl.VERTEX_SHADER)或片元着色器(gl.FRAGMENT_SHADER)
  const shader = gl.createShader(type);
  // 设置着色器源码
  gl.shaderSource(shader, source);
  // 编译着色器
  gl.compileShader(shader);
  // 检查编译是否成功
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader编译失败:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

// 核心函数2：创建着色器程序 - WebGL渲染管线构建步骤之二
function createProgram(gl, vShader, fShader) {
  // 创建着色器程序对象 - 着色器程序是连接顶点着色器和片元着色器的容器
  const program = gl.createProgram();
  // 附加顶点着色器到程序
  gl.attachShader(program, vShader);
  // 附加片元着色器到程序
  gl.attachShader(program, fShader);
  // 链接着色器程序，使其成为可执行的渲染管线
  gl.linkProgram(program);
  // 检查链接是否成功
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program链接失败:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

async function main() {
  await initVideo();

  // 核心步骤2：编译着色器并创建着色器程序
  // 创建顶点着色器 - 负责处理顶点坐标和纹理映射
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSrc);
  // 创建片元着色器 - 负责实现美颜算法和像素级处理
  const fragmentShader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentShaderSrc
  );
  // 创建并链接着色器程序
  const program = createProgram(gl, vertexShader, fragmentShader);
  // 核心步骤3：激活着色器程序，使其成为当前渲染状态的一部分
  gl.useProgram(program);

  // 核心步骤4：设置顶点数据 - 创建覆盖整个Canvas的矩形
  // 创建顶点缓冲区对象(VBO) - WebGL中数据存储的基本单元
  const positionBuffer = gl.createBuffer();
  // 绑定缓冲区到目标
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  // 填充顶点数据 - 使用Float32Array创建顶点数组
  // 这里定义了一个覆盖整个标准化设备坐标系的矩形（左上角、左下角、右上角、右下角）
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]),
    gl.STATIC_DRAW // 数据不会频繁变化，提示GPU优化
  );
  // 获取着色器中顶点位置属性的索引
  const a_position = gl.getAttribLocation(program, "a_position");
  // 启用顶点属性数组
  gl.enableVertexAttribArray(a_position);
  // 定义顶点属性的格式和数据源
  // 参数：属性索引，每个顶点的分量数，数据类型，是否归一化，步长，偏移量
  gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);

  // 核心步骤5：设置纹理坐标数据 - 用于将视频帧映射到矩形上
  // 创建纹理坐标缓冲区
  const texCoordBuffer = gl.createBuffer();
  // 绑定到目标
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  // 填充纹理坐标数据 - 纹理坐标范围是[0,1]，对应视频的四个角落
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]),
    gl.STATIC_DRAW
  );
  // 获取着色器中纹理坐标属性的索引
  const a_texCoord = gl.getAttribLocation(program, "a_texCoord");
  // 启用纹理坐标属性数组
  gl.enableVertexAttribArray(a_texCoord);
  // 定义纹理坐标属性的格式和数据源
  gl.vertexAttribPointer(a_texCoord, 2, gl.FLOAT, false, 0, 0);

  // 核心步骤6：创建和配置视频纹理 - WebGL中处理图像数据的关键
  // 创建纹理对象 - 纹理是存储图像数据的容器
  const videoTexture = gl.createTexture();
  // 绑定纹理对象到目标
  gl.bindTexture(gl.TEXTURE_2D, videoTexture);
  // 设置纹理环绕模式 - 当纹理坐标超出[0,1]范围时的行为
  // CLAMP_TO_EDGE：超出部分使用纹理边缘的像素颜色
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // 设置纹理过滤模式 - 当纹理被放大或缩小时的采样方式
  // LINEAR：使用线性插值，生成更平滑的结果
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // 缩小过滤
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); // 放大过滤

  // 核心步骤7：获取uniform变量位置 - 这些变量用于从JavaScript向着色器传递数据
  // 纹理采样器uniform
  const u_texture = gl.getUniformLocation(program, "u_texture");
  // 人脸中心点坐标
  const u_faceCenter = gl.getUniformLocation(program, "u_faceCenter");
  // 人脸处理椭圆半径（长轴和短轴）
  const u_faceRadiusMajor = gl.getUniformLocation(program, "u_faceRadiusMajor");
  const u_faceRadiusMinor = gl.getUniformLocation(program, "u_faceRadiusMinor");
  // 锐化强度参数
  const u_sharpness = gl.getUniformLocation(program, "u_sharpness");
  // 亮度提升参数
  const u_brightness = gl.getUniformLocation(program, "u_brightness");
  // 饱和度调整参数
  const u_saturation = gl.getUniformLocation(program, "u_saturation");
  // 对比度调整参数
  const u_contrast = gl.getUniformLocation(program, "u_contrast");
  // 色调调整参数
  const u_hue = gl.getUniformLocation(program, "u_hue");
  // 画布分辨率（用于纹理采样偏移计算）
  const u_resolution = gl.getUniformLocation(program, "u_resolution");

  // 初始化MediaPipe Face Mesh
  const faceMesh = new FaceMesh({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  let faceLandmarks = null;
  faceMesh.onResults((results) => {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      faceLandmarks = results.multiFaceLandmarks[0];
      console.log("检测到人脸关键点");
    } else {
      faceLandmarks = null;
    }
  });

  // 定期进行人脸检测（每秒约15次，可根据需要调整）
  let lastDetectionTime = 0;
  const detectionInterval = 1000 / 15; // 检测间隔（毫秒）

  // 使用全局美颜参数变量（已在外部定义）

  // 核心步骤8：实现渲染循环 - WebGL动画和实时处理的核心
  function render(timestamp) {
    // 确保视频已加载足够数据
    if (video.readyState >= 2) {
      // 设置视口 - 定义WebGL如何映射到Canvas
      gl.viewport(0, 0, canvas.width, canvas.height);

      // 渲染步骤1：上传当前视频帧到纹理
      gl.bindTexture(gl.TEXTURE_2D, videoTexture);
      // 将视频帧数据复制到纹理
      // 参数：目标纹理，mipmap级别，内部格式，格式，类型，数据源
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        video
      );

      // 渲染步骤2：传入画布分辨率，用于纹理采样偏移计算
      gl.uniform2f(u_resolution, canvas.width, canvas.height);

      // 移除宽高比校正，因为现在使用椭圆来适应人脸形状

      // 3. 定期进行人脸检测
      if (timestamp - lastDetectionTime > detectionInterval) {
        faceMesh.send({ image: video }).catch((err) => {
          console.warn("人脸检测失败:", err);
        });
        lastDetectionTime = timestamp;
      }

      // 渲染步骤3-7：处理人脸检测数据并传递给着色器
      if (faceDetectionEnabled) {
        // 人脸识别开启状态：使用人脸关键点控制美颜范围
        if (faceLandmarks) {
          // 根据人脸关键点动态计算美颜范围，使用椭圆来匹配人脸形状
          // 取鼻尖关键点作为脸部中心（索引1对应鼻尖）
          const noseTip = faceLandmarks[1];

          // 使用多个关键点来动态计算人脸大小
          // 利用额头顶部(10)、下巴(152)、左眼外角(234)和右眼外角(454)计算人脸尺寸
          const forehead = faceLandmarks[10]; // 额头顶部
          const chin = faceLandmarks[152]; // 下巴位置
          const leftEyeCorner = faceLandmarks[234]; // 左眼外角
          const rightEyeCorner = faceLandmarks[454]; // 右眼外角

          // 计算人脸垂直方向长度（额头到下巴）
          const faceHeight = Math.abs(forehead.y - chin.y);
          // 计算人脸水平方向长度（左眼外角到右眼外角）
          const faceWidth = Math.abs(rightEyeCorner.x - leftEyeCorner.x);

          // 计算人脸自然长宽比，不受视频比例影响
          // 先计算人脸的比例系数
          const faceRatio = faceWidth / faceHeight;

          // 以人脸高度作为基准（通常更稳定），根据实际比例计算椭圆参数
          // 这样椭圆形状只由人脸本身决定，不受视频比例影响
          const baseSize = faceHeight * 1.2; // 以高度为基准，确保完整覆盖
          const majorAxis = baseSize * Math.max(faceRatio);
          const minorAxis = baseSize;

          // 设置人脸中心点
          gl.uniform2f(u_faceCenter, noseTip.x, noseTip.y - 0.05);

          // 设置椭圆的长轴和短轴半径
          gl.uniform1f(u_faceRadiusMajor, majorAxis / 2);
          gl.uniform1f(u_faceRadiusMinor, minorAxis / 2);

          console.log(
            `动态计算的椭圆参数 - 长轴半径: ${(majorAxis / 2).toFixed(
              3
            )}, 短轴半径: ${(minorAxis / 2).toFixed(3)}`
          );
        } else {
          // 如果没检测到人脸，关闭局部处理（半径设为极小值）
          gl.uniform1f(u_faceRadiusMajor, 0.0001);
          gl.uniform1f(u_faceRadiusMinor, 0.0001);
        }
      } else {
        // 人脸识别关闭状态：将美颜应用到整个画布
        // 设置足够大的椭圆参数以覆盖整个画布
        gl.uniform1f(u_faceRadiusMajor, 1.5);
        gl.uniform1f(u_faceRadiusMinor, 1.5);
        // 即使不需要中心点，也设置一个默认值避免着色器错误
        gl.uniform2f(u_faceCenter, 0.5, 0.5);
      }

      // 渲染步骤8：根据美颜开关状态设置美颜滤镜参数
      if (beautyEnabled) {
        // 开启美颜模式：设置磨皮强度、亮度提升和饱和度增强
        gl.uniform1f(u_sharpness, sharpnessVal);
        gl.uniform1f(u_brightness, brightnessVal);
        gl.uniform1f(u_saturation, saturationVal);
        gl.uniform1f(u_contrast, contrastVal);
        gl.uniform1f(u_hue, hueVal);
      } else {
        // 关闭美颜模式：使用默认参数
        gl.uniform1f(u_sharpness, 0.5); // 中性值，既不锐化也不模糊
        gl.uniform1f(u_brightness, 0.0); // 不调整亮度
        gl.uniform1f(u_saturation, 1.0); // 原始饱和度
        gl.uniform1f(u_contrast, 1.0); // 原始对比度
        gl.uniform1f(u_hue, 0.0); // 原始色调
      }

      // 渲染步骤9：绑定纹理单元并传递给着色器
      gl.uniform1i(u_texture, 0); // 将纹理单元0绑定到采样器

      // 渲染步骤10：执行绘制命令，触发整个渲染管线
      // 使用TRIANGLE_STRIP模式，从索引0开始绘制4个顶点（形成一个矩形）
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // 这里的gl.TRIANGLE_STRIP是一种高效的图元绘制模式，4个顶点只需要一次绘制调用
    }

    // 12. 循环调用，保持实时渲染
    requestAnimationFrame(render);
  }

  // 启动渲染循环，传入初始时间戳
  requestAnimationFrame(render);

  // 后续可用 canvas.captureStream() 获取处理后流推流
  // const processedStream = canvas.captureStream(30);
}

// 设置视频控制功能（支持本地视频选择）
function setupVideoSelection() {
  // 设置视频自动重播
  video.loop = true;
  console.log("视频已设置为自动重播模式");
  // 添加本地视频选择按钮
  const selectVideoBtn = document.createElement("button");
  selectVideoBtn.textContent = "选择本地视频";
  selectVideoBtn.style.position = "fixed";
  selectVideoBtn.style.top = "20px";
  selectVideoBtn.style.right = "20px";
  selectVideoBtn.style.zIndex = "1000";
  selectVideoBtn.style.padding = "10px 15px";
  selectVideoBtn.style.backgroundColor = "#2196F3";
  selectVideoBtn.style.color = "white";
  selectVideoBtn.style.border = "none";
  selectVideoBtn.style.borderRadius = "5px";
  selectVideoBtn.style.cursor = "pointer";
  selectVideoBtn.style.fontSize = "14px";
  selectVideoBtn.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";

  // 添加隐藏的文件输入元素
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "video/*";
  fileInput.style.display = "none";
  document.body.appendChild(fileInput);

  // 加载本地视频文件
  function loadLocalVideo(file) {
    // 创建视频URL
    const videoURL = URL.createObjectURL(file);

    // 停止当前视频播放
    video.pause();
    video.src = videoURL;

    // 确保设置为自动重播
    video.loop = true;
    // 视频加载完成后自动播放
    video.onloadeddata = function () {
      // 根据视频尺寸设置画布大小
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      console.log(
        "视频加载成功，尺寸:",
        video.videoWidth,
        "x",
        video.videoHeight
      );

      // 尝试播放视频
      video.play().catch((err) => {
        console.error("自动播放失败，需要用户交互:", err);
      });
    };

    // 处理视频加载错误
    video.onerror = function () {
      console.error("视频加载失败");
      // 释放URL对象
      URL.revokeObjectURL(videoURL);
    };

    // 视频结束时释放URL对象
    video.onended = function () {
      URL.revokeObjectURL(videoURL);
    };
  }

  // 绑定按钮点击事件，触发文件选择
  selectVideoBtn.onclick = () => {
    fileInput.click();
  };

  // 监听文件选择事件
  fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) {
      loadLocalVideo(file);
    }
  });

  // 添加到页面
  document.body.appendChild(selectVideoBtn);

  // 添加视频控制（播放/暂停）
  const playPauseBtn = document.createElement("button");
  // 初始状态设为"播放"，因为视频初始是暂停的
  playPauseBtn.textContent = "播放";
  playPauseBtn.style.position = "fixed";
  playPauseBtn.style.top = "60px";
  playPauseBtn.style.right = "20px";
  playPauseBtn.style.zIndex = "1000";
  playPauseBtn.style.padding = "8px 12px";
  playPauseBtn.style.backgroundColor = "#2196F3";
  playPauseBtn.style.color = "white";
  playPauseBtn.style.border = "none";
  playPauseBtn.style.borderRadius = "5px";
  playPauseBtn.style.cursor = "pointer";
  playPauseBtn.style.fontSize = "14px";
  playPauseBtn.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";

  playPauseBtn.onclick = () => {
    if (video.paused) {
      // 用户交互后播放视频
      video
        .play()
        .then(() => {
          playPauseBtn.textContent = "暂停";
          console.log("视频开始播放");
        })
        .catch((err) => {
          console.error("播放失败:", err);
        });
    } else {
      video.pause();
      playPauseBtn.textContent = "播放";
      console.log("视频已暂停");
    }
  };

  // 添加全局点击事件监听器，确保在任何用户交互后尝试播放
  document.addEventListener(
    "click",
    function initPlay() {
      // 尝试播放视频，但不报错（如果已经播放则忽略）
      video.play().catch(() => {});
      // 移除监听器，避免重复尝试
      document.removeEventListener("click", initPlay);
    },
    { once: true }
  );

  document.body.appendChild(playPauseBtn);

  // 添加美颜开关按钮
  const beautyToggleBtn = document.createElement("button");
  beautyToggleBtn.textContent = "关闭美颜";
  beautyToggleBtn.style.position = "fixed";
  beautyToggleBtn.style.top = "100px";
  beautyToggleBtn.style.right = "20px";
  beautyToggleBtn.style.zIndex = "1000";
  beautyToggleBtn.style.padding = "8px 12px";
  beautyToggleBtn.style.backgroundColor = "#FF9800";
  beautyToggleBtn.style.color = "white";
  beautyToggleBtn.style.border = "none";
  beautyToggleBtn.style.borderRadius = "5px";
  beautyToggleBtn.style.cursor = "pointer";
  beautyToggleBtn.style.fontSize = "14px";
  beautyToggleBtn.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";

  beautyToggleBtn.onclick = () => {
    beautyEnabled = !beautyEnabled;
    beautyToggleBtn.textContent = beautyEnabled ? "关闭美颜" : "开启美颜";
    beautyToggleBtn.style.backgroundColor = beautyEnabled
      ? "#FF9800"
      : "#795548";
    console.log(beautyEnabled ? "美颜已开启" : "美颜已关闭");
  };

  document.body.appendChild(beautyToggleBtn);

  // 添加人脸识别开关按钮
  const faceDetectionToggleBtn = document.createElement("button");
  faceDetectionToggleBtn.textContent = "关闭人脸识别"; // 初始状态为开启
  faceDetectionToggleBtn.style.position = "fixed";
  faceDetectionToggleBtn.style.top = "140px";
  faceDetectionToggleBtn.style.right = "20px";
  faceDetectionToggleBtn.style.zIndex = "1000";
  faceDetectionToggleBtn.style.padding = "8px 12px";
  faceDetectionToggleBtn.style.backgroundColor = "#4CAF50";
  faceDetectionToggleBtn.style.color = "white";
  faceDetectionToggleBtn.style.border = "none";
  faceDetectionToggleBtn.style.borderRadius = "5px";
  faceDetectionToggleBtn.style.cursor = "pointer";
  faceDetectionToggleBtn.style.fontSize = "14px";
  faceDetectionToggleBtn.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";

  faceDetectionToggleBtn.onclick = () => {
    faceDetectionEnabled = !faceDetectionEnabled;
    faceDetectionToggleBtn.textContent = faceDetectionEnabled
      ? "关闭人脸识别"
      : "开启人脸识别";
    faceDetectionToggleBtn.style.backgroundColor = faceDetectionEnabled
      ? "#4CAF50"
      : "#795548";
    console.log(faceDetectionEnabled ? "人脸识别已开启" : "人脸识别已关闭");
  };

  document.body.appendChild(faceDetectionToggleBtn);

  // 添加美颜参数调整控件容器
  const controlsContainer = document.createElement("div");
  controlsContainer.style.position = "fixed";
  controlsContainer.style.top = "180px";
  controlsContainer.style.right = "20px";
  controlsContainer.style.zIndex = "1000";
  controlsContainer.style.width = "200px";
  controlsContainer.style.backgroundColor = "rgba(255, 255, 255, 0.9)";
  controlsContainer.style.padding = "15px";
  controlsContainer.style.borderRadius = "8px";
  controlsContainer.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)";
  controlsContainer.style.fontFamily = "Arial, sans-serif";
  controlsContainer.style.color = "#333";

  // 创建进度条控件的函数
  function createSliderControl(label, min, max, step, initialValue, onChange) {
    const controlDiv = document.createElement("div");
    controlDiv.style.marginBottom = "15px";

    const labelElement = document.createElement("label");
    labelElement.textContent = `${label}: ${initialValue}`;
    labelElement.style.display = "block";
    labelElement.style.marginBottom = "5px";
    labelElement.style.fontSize = "14px";
    labelElement.style.fontWeight = "bold";

    const sliderElement = document.createElement("input");
    sliderElement.type = "range";
    sliderElement.min = min;
    sliderElement.max = max;
    sliderElement.step = step;
    sliderElement.value = initialValue;
    sliderElement.style.width = "100%";
    sliderElement.style.cursor = "pointer";

    // 添加滑块交互样式
    sliderElement.style.height = "6px";
    sliderElement.style.borderRadius = "3px";
    sliderElement.style.background = "#ddd";
    sliderElement.style.outline = "none";

    // 事件处理
    sliderElement.addEventListener("input", function () {
      const value = parseFloat(this.value);
      labelElement.textContent = `${label}: ${value.toFixed(2)}`;
      onChange(value);
    });

    controlDiv.appendChild(labelElement);
    controlDiv.appendChild(sliderElement);
    return controlDiv;
  }

  // 创建锐化强度进度条
  const sharpnessControl = createSliderControl(
    "锐化强度",
    0.0,
    1.0,
    0.05,
    sharpnessVal,
    (value) => {
      sharpnessVal = value;
      console.log("锐化强度调整为:", value);
    }
  );

  // 创建亮度调整进度条
  const brightnessControl = createSliderControl(
    "亮度调整",
    0.0,
    0.5,
    0.01,
    brightnessVal,
    (value) => {
      brightnessVal = value;
      console.log("亮度调整为:", value);
    }
  );

  // 创建饱和度调整进度条
  const saturationControl = createSliderControl(
    "饱和度",
    0.5,
    2.0,
    0.1,
    saturationVal,
    (value) => {
      saturationVal = value;
      console.log("饱和度调整为:", value);
    }
  );

  // 添加标题
  const controlsTitle = document.createElement("h3");
  controlsTitle.textContent = "美颜参数调整";
  controlsTitle.style.marginTop = "0";
  controlsTitle.style.marginBottom = "15px";
  controlsTitle.style.fontSize = "16px";
  controlsTitle.style.textAlign = "center";
  controlsTitle.style.color = "#2196F3";

  // 创建对比度调整进度条
  const contrastControl = createSliderControl(
    "对比度",
    0.5,
    2.0,
    0.1,
    contrastVal,
    (value) => {
      contrastVal = value;
      console.log("对比度调整为:", value);
    }
  );

  // 创建色调调整进度条
  const hueControl = createSliderControl(
    "色调调整",
    -90,
    90,
    5,
    hueVal,
    (value) => {
      hueVal = value;
      console.log("色调调整为:", value);
    }
  );

  // 将所有控件添加到容器
  controlsContainer.appendChild(controlsTitle);
  controlsContainer.appendChild(sharpnessControl);
  controlsContainer.appendChild(brightnessControl);
  controlsContainer.appendChild(saturationControl);
  controlsContainer.appendChild(contrastControl);
  controlsContainer.appendChild(hueControl);

  // 添加到页面
  document.body.appendChild(controlsContainer);
}

// 在main函数中调用视频选择设置
function initializeApp() {
  main()
    .then(() => {
      setupVideoSelection();
    })
    .catch((error) => {
      console.error("应用初始化失败:", error);
      // 如果默认视频加载失败，可以直接显示视频选择功能
      setupVideoSelection();
    });
}

// 启动应用
initializeApp();
