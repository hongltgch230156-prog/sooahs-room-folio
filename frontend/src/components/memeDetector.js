// frontend/src/components/memeDetector.js

export function setOnGestureStable(callback) {
    onGestureStableCallback = callback;
}
import {
  FilesetResolver,
  GestureRecognizer,
  FaceLandmarker,
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

// BIẾN DÀNH CHO TÍNH NĂNG "CAMERA FRAME"
let cameraFrameBox = null;
let isFraming = false;
let framingSince = 0;
const FRAMING_STABLE_DURATION = 800; // 0.8 giây giữ khung ảnh để kích hoạt chụp

const STABLE_DURATION = 700;

/**
 * Khởi tạo MediaPipe
 */
async function initializeMediaPipe() {
  const vision = await FilesetResolver.forVisionTasks(
    VISION_WASM_URL
  );

  gestureRecognizer = await GestureRecognizer.createFromOptions(
    vision,
    {
      baseOptions: {
        modelAssetPath: GESTURE_MODEL_URL,
      },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }
  );

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
        ideal: 1280,
      },
      height: {
        ideal: 720,
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
  } else {
    currentGesture = "None";
    currentGestureScore = 0;
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
    detectGesture(timestamp);
    detectFace(timestamp);
    lastVideoTime = videoElement.currentTime;
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
  const scanText = document.querySelector(".hl-scan-text");
  const progressFill = document.querySelector("#tab-meme-search .hl-progress-fill");
  const helperText = document.querySelector("#tab-meme-search .hl-helper-text");

  // Tạo (nếu chưa có) và cập nhật thẻ div làm Khung Ảnh
  let frameEl = document.querySelector(".hl-gesture-frame");
  if (!frameEl) {
    frameEl = document.createElement("div");
    frameEl.className = "hl-gesture-frame";
    const viewport = document.querySelector(".hl-meme-viewport");
    if (viewport) viewport.appendChild(frameEl); // Chèn vào trong camera
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
export async function startMemeDetector() {
  if (isRunning) {
    return;
  }

  videoElement =
    document.getElementById("hl-webcam-meme");

  if (!videoElement) {
    console.warn(
      "[Meme Search] Webcam element not found."
    );

    return;
  }

  try {
    await initializeMediaPipe();
    await startCamera();

    isRunning = true;

    processFrame();

    console.log(
      "[Meme Search] Detector started."
    );
  } catch (error) {
    console.error(
      "[Meme Search] Failed to start:",
      error
    );

    const helperText =
      document.querySelector(
        "#tab-meme-search .hl-helper-text"
      );

    if (helperText) {
      helperText.textContent =
        "Camera or AI initialization failed.";
    }
  }
}

/**
 * Stop Meme Search detector
 */
export function stopMemeDetector() {
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