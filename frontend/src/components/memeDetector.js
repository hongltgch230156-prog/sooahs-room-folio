// frontend/src/components/memeDetector.js

export function setOnGestureStable(callback) {
    onGestureStableCallback = callback;
}
import {
  FilesetResolver,
  GestureRecognizer,
  FaceLandmarker,
  DrawingUtils
} from "@mediapipe/tasks-vision";

const VISION_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";

const GESTURE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let gestureRecognizer = null;
let faceLandmarker = null;
let videoElement = null;

let isRunning = false;
let animationFrameId = null;

let lastVideoTime = -1;

let currentGesture = "None";
let currentGestureScore = 0;

let latestFaceBlendshapes = null;

let lastStableGesture = "None";
let stableGestureSince = 0;

let lastAutoScanGesture = "None";
let autoScanTriggered = false;
let onGestureStableCallback = null;

let miniCanvas = null;
let miniCtx = null;
let drawingUtils = null;

let cameraFrameBox = null;
let isFraming = false;
let framingSince = 0;
let onHandTrackingCallback = null;
export function setOnHandTracking(callback) {
    onHandTrackingCallback = callback;

    // Đang chơi ghép hình chỉ cần 1 tay (nhanh hơn, và không bị nhảy qua lại giữa 2 tay).
    // Hết game -> trả về 2 tay cho động tác "khung ảnh".
    try {
        gestureRecognizer?.setOptions({ numHands: callback ? 1 : 2 });
    } catch (e) {
        console.warn("[Hand Lab] setOptions failed:", e);
    }
}
const FRAMING_STABLE_DURATION = 800; // 0.8 giây giữ khung ảnh để kích hoạt chụp

const STABLE_DURATION = 700;

/**
 * Khởi tạo MediaPipe
 */
async function initializeMediaPipe() {
  const vision = await FilesetResolver.forVisionTasks(
    VISION_WASM_URL
  );

  const createGestureRecognizer = (delegate) =>
    GestureRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: GESTURE_MODEL_URL,
        delegate, // "GPU" nhanh hơn rất nhiều so với "CPU"
      },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

  try {
    gestureRecognizer = await createGestureRecognizer("GPU");
  } catch (e) {
    console.warn("[Hand Lab] GPU delegate failed, falling back to CPU:", e);
    gestureRecognizer = await createGestureRecognizer("CPU");
  }

  faceLandmarker = await FaceLandmarker.createFromOptions(
    vision,
    {
      baseOptions: {
        modelAssetPath: FACE_MODEL_URL,
      },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,

      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
    }
  );

  console.log("[Meme Search] MediaPipe initialized.");
}

/**
 * Lấy webcam
 */
async function startCamera() {
  if (!videoElement) {
    throw new Error("Meme webcam element not found.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: {
        ideal: 640,
      },
      height: {
        ideal: 480,
      },
      frameRate: {
        ideal: 30,
      },
    },
    audio: false,
  });

  videoElement.srcObject = stream;

  await videoElement.play();

  console.log("[Meme Search] Camera started.");
}

/**
 * Dừng webcam
 */
function stopCamera() {
  const stream = videoElement?.srcObject;

  if (stream) {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
  }

  if (videoElement) {
    videoElement.srcObject = null;
  }
}

/**
 * Chuyển gesture của MediaPipe thành tên dễ dùng
 */
function normalizeGesture(rawGesture) {
  const gestureMap = {
    Closed_Fist: "fist",
    Open_Palm: "open_palm",
    Pointing_Up: "point",
    Thumb_Down: "thumbs_down",
    Thumb_Up: "thumbs_up",
    Victory: "peace",
    ILoveYou: "love",
  };

  return gestureMap[rawGesture] || "unknown";
}

/**
 * Đọc gesture và tính toán khung hình Camera Frame
 */
function detectGesture(timestamp) {
  if (!gestureRecognizer || !videoElement) return;
  const result = gestureRecognizer.recognizeForVideo(videoElement, timestamp);

  // 1. Đọc gesture cơ bản
  if (result.gestures && result.gestures.length > 0 && result.gestures[0].length > 0) {
    const bestGesture = result.gestures[0][0];
    currentGesture = normalizeGesture(bestGesture.categoryName);
    currentGestureScore = bestGesture.score || 0;

    // --- THÊM ĐOẠN XUẤT TỌA ĐỘ VÀO ĐÂY ---
    if (result.landmarks && result.landmarks.length > 0) {
    const hand = result.landmarks[0];
    const pointer = hand[9]; 
    
    // --- Vẽ Khung Xương (Landmarks) lên Mini Canvas ---
    if (activeTabId === "snap-solve") {
      if (!miniCanvas || !miniCanvas.isConnected) {
        miniCanvas = document.getElementById("hl-canvas-mini");
        miniCtx = null;
        drawingUtils = null;
      }
      if (miniCanvas) {
        if (!miniCtx) miniCtx = miniCanvas.getContext("2d");
        if (!drawingUtils) drawingUtils = new DrawingUtils(miniCtx);
        
        // Khớp kích thước canvas với video — CHỈ khi đổi (gán width/height xóa + cấp phát lại canvas)
        if (miniCanvas.width !== videoElement.videoWidth) miniCanvas.width = videoElement.videoWidth;
        if (miniCanvas.height !== videoElement.videoHeight) miniCanvas.height = videoElement.videoHeight;
        
        miniCtx.save();
        miniCtx.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
        
        // Vẽ xương tay (Landmarks và Connections)
        for (const landmarks of result.landmarks) {
          drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, {
            color: "#00FF00", // Màu xanh lá cho đường nối
            lineWidth: 3
          });
          drawingUtils.drawLandmarks(landmarks, {
            color: "#FF0000", // Màu đỏ cho các khớp
            lineWidth: 2,
            radius: 4
          });
        }
        miniCtx.restore();
      }
    }
    // ------------------------------------------------

    if (onHandTrackingCallback) {
        onHandTrackingCallback(1 - pointer.x, pointer.y, currentGesture);
    }
  } else {
    currentGesture = "None";
    currentGestureScore = 0;
    
    // Xóa canvas khi không thấy tay
    if (miniCtx && miniCanvas) {
        miniCtx.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
    }

    if (onHandTrackingCallback) onHandTrackingCallback(null, null, "None");
  }
    // -------------------------------------

  } else {
    currentGesture = "None";
    currentGestureScore = 0;
    // Báo cho UI biết là mất dấu tay
    if (onHandTrackingCallback) onHandTrackingCallback(null, null, "None");
  }

  // 2. TÍNH TOÁN KHUNG HÌNH TỪ 2 BÀN TAY (CAMERA FRAME)
  cameraFrameBox = null;
  isFraming = false;

  // Nếu MediaPipe phát hiện được từ 2 bàn tay trở lên
  if (result.landmarks && result.landmarks.length >= 2) {
    const hand1 = result.landmarks[0];
    const hand2 = result.landmarks[1];

    // Điểm số 4 là đỉnh Ngón Cái, số 8 là đỉnh Ngón Trỏ
    const p1 = hand1[4];
    const p2 = hand1[8];
    const p3 = hand2[4];
    const p4 = hand2[8];

    // Tìm ranh giới của khung (Bounding Box)
    const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
    const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
    const minY = Math.min(p1.y, p2.y, p3.y, p4.y);
    const maxY = Math.max(p1.y, p2.y, p3.y, p4.y);

    const width = maxX - minX;
    const height = maxY - minY;

    // Nếu khoảng cách giữa các ngón tay đủ để tạo thành 1 khung (loại trừ trường hợp chắp tay)
    if (width > 0.1 && height > 0.05) {
      cameraFrameBox = { x: minX, y: minY, width, height };

      // Nếu user kéo khung đủ rộng (>25% chiều ngang màn hình) -> Ghi nhận đây là động tác chụp
      if (width > 0.25) {
        isFraming = true;
        currentGesture = "framing"; // Báo cho AI biết user đang làm dáng chụp ảnh
        currentGestureScore = 1.0;
      }
    }
  }
}

/**
 * Đọc biểu cảm khuôn mặt
 */
function detectFace(timestamp) {
  if (!faceLandmarker || !videoElement) {
    return;
  }

  const result = faceLandmarker.detectForVideo(
    videoElement,
    timestamp
  );

  if (
    result.faceBlendshapes &&
    result.faceBlendshapes.length > 0
  ) {
    latestFaceBlendshapes =
      result.faceBlendshapes[0].categories;
  } else {
    latestFaceBlendshapes = null;
  }
}

/**
 * Lấy score của một blendshape
 */
function getBlendshapeScore(name) {
  if (!latestFaceBlendshapes) {
    return 0;
  }

  const item = latestFaceBlendshapes.find(
    (category) => category.categoryName === name
  );

  return item?.score || 0;
}

/**
 * Phân loại biểu cảm cơ bản.
 *
 * Đây chưa phải AI cloud.
 * Đây là lớp rule-based dựa trên blendshape.
 */
function classifyBasicExpression() {
  const smileLeft = getBlendshapeScore("mouthSmileLeft");
  const smileRight = getBlendshapeScore("mouthSmileRight");

  const jawOpen = getBlendshapeScore("jawOpen");

  const mouthPucker = getBlendshapeScore("mouthPucker");

  const eyeSquintLeft =
    getBlendshapeScore("eyeSquintLeft");

  const eyeSquintRight =
    getBlendshapeScore("eyeSquintRight");

  const browDownLeft =
    getBlendshapeScore("browDownLeft");

  const browDownRight =
    getBlendshapeScore("browDownRight");

  const smile = (smileLeft + smileRight) / 2;

  const eyeSquint =
    (eyeSquintLeft + eyeSquintRight) / 2;

  const browDown =
    (browDownLeft + browDownRight) / 2;

  if (jawOpen > 0.55) {
    return "surprised";
  }

  if (smile > 0.55 && eyeSquint > 0.25) {
    return "laughing";
  }

  if (smile > 0.35) {
    return "smile";
  }

  if (mouthPucker > 0.45) {
    return "pout";
  }

  if (browDown > 0.45) {
    return "angry";
  }

  return "neutral";
}

/**
 * Kiểm tra gesture có ổn định chưa
 */
function checkStableGesture(timestamp) {
  if (
    currentGesture === "None" ||
    currentGesture === "unknown" ||
    currentGestureScore < 0.6
  ) {
    lastStableGesture = "None";
    stableGestureSince = 0;
    return false;
  }

  if (currentGesture !== lastStableGesture) {
    lastStableGesture = currentGesture;
    stableGestureSince = timestamp;
    return false;
  }

  return (
    timestamp - stableGestureSince >= STABLE_DURATION
  );
}

/**
 * Lấy trạng thái hiện tại
 */
function getCurrentDetection() {
  return {
    gesture: currentGesture,
    gestureScore: currentGestureScore,
    basicExpression: classifyBasicExpression(),
    blendshapes: latestFaceBlendshapes,
  };
}

/**
 * Render vòng lặp
 */
function processFrame() {
  if (!isRunning) return;

  if (videoElement.readyState >= 2 && videoElement.currentTime !== lastVideoTime) {
    const timestamp = performance.now();
    lastVideoTime = videoElement.currentTime;

    // setOnHandTracking(callback) chỉ khác null khi đang chơi ghép hình
    const isPlayingPuzzle = !!onHandTrackingCallback;

    detectGesture(timestamp);

    if (isPlayingPuzzle) {
      // Chỉ cần theo dõi tay: bỏ nhận diện khuôn mặt, cập nhật UI "khung ảnh" và đếm giờ chụp
      animationFrameId = requestAnimationFrame(processFrame);
      return;
    }

    detectFace(timestamp);
    updateMemeUI();

    // KIỂM TRA TỰ ĐỘNG CHỤP: Kích hoạt khi user giơ khung ảnh (isFraming)
    if (isFraming && !autoScanTriggered) {
      if (framingSince === 0) framingSince = timestamp;
      
      // Nếu giữ nguyên khung ảnh đủ 0.8 giây -> Chụp!
      if (timestamp - framingSince >= FRAMING_STABLE_DURATION) {
        autoScanTriggered = true;
        if (typeof onGestureStableCallback === 'function') {
          onGestureStableCallback();
        }
      }
    } else if (!isFraming) {
      framingSince = 0; // Hủy đếm nếu user bỏ tay xuống
    }
  }
  animationFrameId = requestAnimationFrame(processFrame);
}

export function resetAutoScan() {
    autoScanTriggered = false;
    lastStableGesture = "None";
    stableGestureSince = performance.now();
    autoScanTriggered = false;
    framingSince = 0;
    cameraFrameBox = null;
    isFraming = false;
}

/**
 * Cập nhật UI camera và vẽ Real-time Frame
 */
function updateMemeUI() {
  const tabSelector = `#tab-${activeTabId}`; // Trỏ đúng tab
  const scanText = document.querySelector(`${tabSelector} .hl-scan-text`);
  const progressFill = document.querySelector(`${tabSelector} .hl-progress-fill`);
  const helperText = document.querySelector(`${tabSelector} .hl-helper-text`);

  // Tạo (nếu chưa có) và cập nhật thẻ div làm Khung Ảnh
  let frameEl = document.querySelector(`${tabSelector} .hl-gesture-frame`);
  if (!frameEl) {
    frameEl = document.createElement("div");
    frameEl.className = "hl-gesture-frame";
    // Nhét khung lưới vào đúng viewport
    const viewport = document.querySelector(`${tabSelector} .hl-camera-viewport`);
    if (viewport) viewport.appendChild(frameEl); 
  }

  // Nếu nhận diện được khung tay, gắn tọa độ CSS vào thẻ div
  if (cameraFrameBox && !autoScanTriggered) {
    frameEl.classList.add("is-visible");
    
    // Vì Camera bị lật gương (scaleX(-1)), trục X bị ngược. Phải đảo lại leftPct
    const leftPct = (1 - (cameraFrameBox.x + cameraFrameBox.width)) * 100;
    const topPct = cameraFrameBox.y * 100;
    const widthPct = cameraFrameBox.width * 100;
    const heightPct = cameraFrameBox.height * 100;

    frameEl.style.left = `${leftPct}%`;
    frameEl.style.top = `${topPct}%`;
    frameEl.style.width = `${widthPct}%`;
    frameEl.style.height = `${heightPct}%`;
  } else {
    frameEl.classList.remove("is-visible");
  }

  if (!scanText) return;

  // Cập nhật dòng chữ hướng dẫn dựa trên trạng thái kéo tay
  if (isFraming) {
    scanText.textContent = "HOLD TO CAPTURE...";
    if (progressFill) progressFill.style.width = "100%";
    if (helperText) helperText.textContent = "Keep your hands steady...";
  } else if (cameraFrameBox) {
    scanText.textContent = "EXPAND THE FRAME...";
    if (progressFill) progressFill.style.width = "50%";
    if (helperText) helperText.textContent = "Pull your hands apart to take a photo";
  } else {
    scanText.textContent = "MAKE A CAMERA FRAME";
    if (progressFill) progressFill.style.width = "10%";
    if (helperText) helperText.textContent = "Use 2 hands to frame your face";
  }
}

/**
 * Start Meme Search detector
 */
let activeTabId = "meme-search"; 

export async function startDetector(tabId = "meme-search") {
  activeTabId = tabId; // Lưu lại tab hiện tại
  if (isRunning) return;

  // Tự động nhận diện video của tab tương ứng
  const videoId = tabId === "meme-search" ? "hl-webcam-meme" : "hl-webcam-puzzle";
  videoElement = document.getElementById(videoId);

  if (!videoElement) return;

  try {
    await initializeMediaPipe();
    await startCamera();
    isRunning = true;
    processFrame();
  } catch (error) {
    console.error("Camera failed:", error);
  }
}

/**
 * Stop Meme Search detector
 */
export function stopDetector() {
  isRunning = false;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  stopCamera();
}

/**
 * Chụp frame hiện tại của webcam
 */
export function captureMemeFrame() {
    if (!videoElement) {
        return null;
    }

    const canvas = document.createElement("canvas");

    const maxWidth = 640;
    const scale = Math.min(
        1,
        maxWidth / videoElement.videoWidth
    );

    canvas.width = Math.round(
        videoElement.videoWidth * scale
    );

    canvas.height = Math.round(
        videoElement.videoHeight * scale
    );

    const context = canvas.getContext("2d");

    context.drawImage(
        videoElement,
        0,
        0,
        canvas.width,
        canvas.height
    );

    return canvas.toDataURL(
        "image/jpeg",
        0.75
    );
}

export function captureMemeSnapshot() {
    const frame = captureMemeFrame();

    if (!frame) {
        return null;
    }

    return {
        frame,
        detection: getCurrentDetection(),
    };
}