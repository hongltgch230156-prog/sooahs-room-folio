// frontend/src/components/snapSolve.js
import { captureMemeSnapshot, resetAutoScan, setOnHandTracking } from "./memeDetector.js";
import { readProgress, writeProgress, syncProgress } from "./gameProgress.js";

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------
// THUẬT TOÁN TẠO ĐƯỜNG CẮT JIGSAW HOÀN HẢO
// ---------------------------------------------------------
function createJigsawPath(row, col, cols, rows) {
    const horizontalEdges = [[1, -1, 1, -1], [-1, 1, -1, 1]];
    const verticalEdges = [[1, -1, 1], [-1, 1, -1], [1, -1, 1]];
    // Bo góc MỌI mảnh (góc ngoài của bảng bo to hơn) -> khi ghép khít sẽ tạo rãnh nhỏ như ảnh mẫu
    const r = 3.5;
    const R = 7;
    const rTL = row === 0 && col === 0 ? R : r;
    const rTR = row === 0 && col === cols - 1 ? R : r;
    const rBR = row === rows - 1 && col === cols - 1 ? R : r;
    const rBL = row === rows - 1 && col === 0 ? R : r;
    function edge(sx, sy, dx, dy, nx, ny, dir, endX, endY) {
        if (dir === 0) return `L ${endX} ${endY}`;
        const P = (t, o) =>
            `${(sx + dx * t + nx * o * dir).toFixed(2)} ${(sy + dy * t + ny * o * dir).toFixed(2)}`;
        return [
            `L ${P(0.35, 0)}`,
            `C ${P(0.40, 0)} ${P(0.41, 2)} ${P(0.41, 6)}`,
            `C ${P(0.41, 10)} ${P(0.355, 8.5)} ${P(0.355, 13.5)}`,
            `C ${P(0.355, 18.5)} ${P(0.42, 21)} ${P(0.50, 21)}`,
            `C ${P(0.58, 21)} ${P(0.645, 18.5)} ${P(0.645, 13.5)}`,
            `C ${P(0.645, 8.5)} ${P(0.59, 10)} ${P(0.59, 6)}`,
            `C ${P(0.59, 2)} ${P(0.60, 0)} ${P(0.65, 0)}`,
            `L ${endX} ${endY}`            // kết thúc tại điểm bắt đầu cung bo góc
        ].join(" ");
    }
    const top = row === 0 ? 0 : -horizontalEdges[row - 1][col];
    const right = col === cols - 1 ? 0 : verticalEdges[row][col];
    const bottom = row === rows - 1 ? 0 : horizontalEdges[row][col];
    const left = col === 0 ? 0 : -verticalEdges[row][col - 1];
    return [
        `M ${rTL} 0`,
        edge(0, 0, 100, 0, 0, -1, top, 100 - rTR, 0),
        `Q 100 0 100 ${rTR}`,
        edge(100, 0, 0, 100, 1, 0, right, 100, 100 - rBR),
        `Q 100 100 ${100 - rBR} 100`,
        edge(100, 100, -100, 0, 0, 1, bottom, rBL, 100),
        `Q 0 100 0 ${100 - rBL}`,
        edge(0, 100, 0, -100, -1, 0, left, 0, rTL),
        `Q 0 0 ${rTL} 0`,
        "Z"
    ].join(" ");
}

// .p-lift  = bóng đổ + độ dày  (chỉ hiện khi mảnh chưa đúng chỗ -> "nhấc lên")
// .p-bevel = vát sáng + rãnh   (LUÔN hiện, kể cả khi đã ghép khít -> vẫn 3D)

function buildPieceSvg(id, row, col, shapePath, imageSrc) {
    return `
    <svg class="puzzle-piece-svg" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"
         style="overflow: visible;" aria-hidden="true">
      <defs>
        <clipPath id="pc-${id}"><path d="${shapePath}"/></clipPath>
        <linearGradient id="pb-${id}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.35"/>
          <stop offset="35%"  stop-color="#ffffff" stop-opacity="0.12"/>
          <stop offset="65%"  stop-color="#5b3f78" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="#4a3263" stop-opacity="0.28"/>
        </linearGradient>
        <filter id="pf-${id}" filterUnits="userSpaceOnUse" x="-30" y="-30" width="160" height="170">
          <feGaussianBlur stdDeviation="2.2"/>
        </filter>
        <filter id="pbl-${id}" filterUnits="userSpaceOnUse" x="-30" y="-30" width="160" height="170">
          <feGaussianBlur stdDeviation="1"/>
        </filter>
      </defs>
      <path class="p-lift" d="${shapePath}" transform="translate(0 3.2)"
            fill="#4a3263" opacity="0.38" filter="url(#pf-${id})"/>
      <path class="p-lift" d="${shapePath}" transform="translate(0 2)"
            fill="#9d86b6" stroke="#9d86b6" stroke-width="0.8" stroke-linejoin="round"/>
      <image href="${imageSrc}" x="${-col * 100}" y="${-row * 100}" width="400" height="300"
             preserveAspectRatio="xMidYMid slice" clip-path="url(#pc-${id})"/>
      <g class="p-bevel" clip-path="url(#pc-${id})">
        <!-- 1) viền sáng ĐỀU quanh mảnh (không phụ thuộc hướng) -->
        <path d="${shapePath}" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="5"
              stroke-linejoin="round" filter="url(#pbl-${id})"/>
        <!-- 2) bóng nhẹ theo hướng ánh sáng, rất yếu để rãnh vẫn đều -->
        <path d="${shapePath}" fill="none" stroke="url(#pb-${id})" stroke-width="4"
              stroke-linejoin="round" filter="url(#pbl-${id})"/>
        <!-- 3) rãnh tối ĐỀU, độ dày cố định ở mọi cạnh -->
        <path d="${shapePath}" fill="none" stroke="#7a5f9c" stroke-opacity="0.75"
              stroke-width="2.2" stroke-linejoin="round"/>
      </g>
    </svg>`;
}

export function initSnapSolve() {
    console.log("[Snap & Solve] Initialized.");
}

export async function startPuzzleCaptureFlow() {
    const video = document.getElementById("hl-webcam-puzzle");
    const countdown = document.querySelector("#tab-snap-solve .hl-countdown-number");
    const helperText = document.querySelector("#tab-snap-solve .hl-helper-text");
    if (!video || video.paused) return;
    if (helperText) helperText.textContent = "Hold steady!";
    if (countdown) {
        countdown.textContent = "3";
        countdown.classList.add("is-visible");
    }
    await sleep(1000);
    if (countdown) countdown.textContent = "2";
    await sleep(1000);
    if (countdown) countdown.textContent = "1";
    await sleep(1000);
    const snapshot = captureMemeSnapshot();
    if (countdown) {
        countdown.textContent = "";
        countdown.classList.remove("is-visible");
    }
    if (snapshot && snapshot.frame) {
        const scanOverlay = document.querySelector("#tab-snap-solve .hl-scan-overlay");
        if(scanOverlay) scanOverlay.style.display = 'none';
        startPuzzleGame(snapshot.frame);
    } else {
        if (helperText) helperText.textContent = "Failed to capture. Try again.";
    }
}

// =========================================================
// LEVELS + TIẾN TRÌNH (lưu localStorage)
// =========================================================
const TOTAL_LEVELS = 5;
const LEVELS_PER_PAGE = 3;

// mode: "swap"      -> level 1-2: hoán đổi mảnh (có/không xoay)
//       "spotlight" -> level 3: bảng tối, tay là đèn pin
//       "catch"     -> level 4: mảnh rơi từ trên xuống, bắt rồi thả đúng ô
//       "pose"      -> level 5: mỗi ô gắn 1 cử chỉ, đặt đúng + làm đúng cử chỉ mới khóa
const LEVELS = {
    1: {
        name: "Classic",
        mode: "swap",
        rotate: false,
        hint: "Make a FIST ✊ to grab, OPEN PALM 🖐️ to drop!"
    },
    2: {
        name: "Twist & Lock",
        mode: "swap",
        rotate: true,
        hint: "✊ Grab a piece, TILT your wrist ↺ ↻ to rotate it, 🖐️ open palm to drop!"
    },
    3: {
        name: "Spotlight",
        mode: "spotlight",
        rotate: false,
        hint: "🔦 Your hand is the flashlight! ✊ grab, 🖐️ drop. Hold 🖐️ still for 1s to switch the big lamp on 💡"
    },
    4: {
        name: "Catch & Build",
        mode: "catch",
        rotate: false,
        hint: "🧺 ✊ Catch a falling piece, carry it to its square and 🖐️ drop it before it hits the floor!"
    },
    5: {
        name: "Pose Lock",
        mode: "pose",
        rotate: false,
        hint: "✊ Put each piece on its square, then strike the pose on that square to 🔒 lock it!"
    }
};

// ---- Tinh chỉnh các level mới (đổi số ở đây để chỉnh độ khó) ----
const PREVIEW_MS          = 3000;  // L3 + L4: ảnh mẫu hiện 3 giây rồi tắt

// Level 3 - Spotlight
const SPOT_RADIUS_CELLS   = 0.85;  // bán kính đèn pin (tính theo chiều rộng 1 ô)
const LAMP_HOLD_MS        = 1000;  // xòe tay + giữ yên 1s => bật đèn lớn
const LAMP_STILL_CELLS    = 0.4;   // "giữ yên" = tay lệch không quá 0.4 ô
const LAMP_ON_MS          = 1800;  // đèn lớn sáng 1.8s
const LAMP_COOLDOWN_MS    = 9000;  // hồi chiêu 9s

// Level 4 - Catch & Build
const CATCH_LIVES         = 5;     // số mạng (mảnh chạm đáy = mất 1 mạng)
const CATCH_MAX_ACTIVE    = 3;     // tối đa 3 mảnh rơi cùng lúc
const FALL_SECONDS_START  = 9;     // lúc đầu 1 mảnh rơi hết chiều cao bảng trong 9s
const FALL_SECONDS_MIN    = 5.5;   // rơi nhanh dần tới mức này
const FALL_RAMP           = 0.3;   // mỗi mảnh ghép đúng rút ngắn thêm 0.3s
const SPAWN_GAP_START     = 2600;  // ms giữa 2 mảnh được thả xuống
const SPAWN_GAP_MIN       = 1500;
const CATCH_GHOST_OPACITY = 0.12;  // bóng ảnh mờ gợi ý sau bảng; đặt 0 để khó hơn (thuần trí nhớ)

// Level 5 - Pose Lock (key = tên đã chuẩn hóa trong normalizeGesture của memeDetector.js)
const POSES = [
    { key: "peace",     icon: "✌️" },   // Victory
    { key: "thumbs_up", icon: "👍" },   // Thumb_Up
    { key: "love",      icon: "🤟" },   // ILoveYou
    { key: "fist",      icon: "✊" },   // Closed_Fist
    { key: "open_palm", icon: "🖐️" }    // Open_Palm
];
const POSE_HOLD_MS   = 700;  // giữ đúng cử chỉ 0.7s liên tục mới khóa
const POSE_MIN_SCORE = 0.6;  // độ tin cậy tối thiểu của MediaPipe

// Tiến độ theo TỪNG TÀI KHOẢN (đọc/ghi + đồng bộ server nằm trong gameProgress.js)
let progress = readProgress();

function saveProgress() {
    writeProgress(progress);
    syncProgress();            // đẩy lên server (không chờ, không chặn game)
}

let selectedLevel = null;     // level đang chơi
let levelPage = 0;            // trang của thanh chọn level
let currentImage = null;      // ảnh vừa chụp (đổi level không cần chụp lại)
let currentHint = "";

const isCompleted = (id) => progress.completed.includes(id);
// Level 1 luôn mở. Level n mở khi đã xong level n-1. Level đã xong luôn chơi lại được.
const isUnlocked = (id) => id === 1 || isCompleted(id) || isCompleted(id - 1);
const isPlayable = (id) => !!LEVELS[id] && isUnlocked(id);

function highestPlayableLevel() {
    let best = 1;
    for (let id = 1; id <= TOTAL_LEVELS; id++) if (isPlayable(id)) best = id;
    return best;
}

function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

// Góc chênh lệch ngắn nhất giữa 2 góc (độ), trong khoảng -180..180
function angleDiff(a, b) {
    return ((a - b + 540) % 360) - 180;
}

// ---- Xoay mảnh: lưu GÓC TÍCH LŨY trên thẻ <svg> của mảnh (đi theo mảnh khi đổi chỗ) ----
function getRot(piece) {
    const svg = piece.firstElementChild;
    return svg ? Number(svg.dataset.rot || 0) : 0;
}

function setRot(piece, deg) {
    const svg = piece.firstElementChild;
    if (!svg) return;
    svg.dataset.rot = String(deg);
    svg.style.transform = `rotate(${deg}deg)`;
}

function isUpright(piece) {
    return ((Math.round(getRot(piece) / 90) % 4) + 4) % 4 === 0;
}

// ---- Tiện ích nhỏ cho các level mới ----
function el(tag, className, html) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (html != null) n.innerHTML = html;
    return n;
}

// Xáo trộn Fisher–Yates. noFixedPoints = true -> không mảnh nào nằm sẵn đúng chỗ lúc bắt đầu.
function shuffledOrder(n, noFixedPoints) {
    const a = Array.from({ length: n }, (_, i) => i);
    do {
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
    } while (noFixedPoints && a.some((v, i) => v === i));
    return a;
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = src;
    });
}

function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// ---------------------------------------------------------
// PHẦN THƯỞNG LEVEL 5: ảnh selfie được đóng khung (trả về blob: URL để hiển thị/tải về)
// ---------------------------------------------------------
async function buildFramedPhoto(imageSrc, secs) {
    const img = await loadImage(imageSrc);
    const W = 1200, H = 1160, M = 80;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d");

    // khung ngoài (gradient tím)
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#b98ad0");
    g.addColorStop(0.5, "#6c3f7c");
    g.addColorStop(1, "#a56fbd");
    roundRectPath(ctx, 0, 0, W, H, 48);
    ctx.fillStyle = g;
    ctx.fill();

    // nền giấy bên trong
    roundRectPath(ctx, 28, 28, W - 56, H - 56, 28);
    ctx.fillStyle = "#fff8f0";
    ctx.fill();

    // ảnh (cắt kiểu "cover" 4:3)
    const pw = W - 2 * M;
    const ph = Math.round((pw * 3) / 4);
    ctx.save();
    ctx.shadowColor = "rgba(60,35,70,0.35)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 10;
    roundRectPath(ctx, M, M, pw, ph, 18);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRectPath(ctx, M, M, pw, ph, 18);
    ctx.clip();
    const s = Math.max(pw / img.width, ph / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    ctx.drawImage(img, M + (pw - dw) / 2, M + (ph - dh) / 2, dw, dh);
    ctx.restore();
    roundRectPath(ctx, M, M, pw, ph, 18);
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    // băng keo ở 2 góc
    ctx.save();
    ctx.fillStyle = "rgba(251,191,36,0.75)";
    ctx.translate(M + 20, M + 6);
    ctx.rotate(-0.6);
    ctx.fillRect(-70, -18, 140, 36);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = "rgba(251,191,36,0.75)";
    ctx.translate(M + pw - 20, M + 6);
    ctx.rotate(0.6);
    ctx.fillRect(-70, -18, 140, 36);
    ctx.restore();

    // chữ ký
    const date = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    ctx.textAlign = "center";
    ctx.fillStyle = "#6c3f7c";
    ctx.font = '800 66px "Baloo 2","Nunito",system-ui,sans-serif';
    ctx.fillText("POSE LOCK · SOLVED!", W / 2, M + ph + 88);
    ctx.fillStyle = "#9a7bb0";
    ctx.font = '700 36px "Nunito",system-ui,sans-serif';
    ctx.fillText(`Hand Lab  ·  ${formatTime(secs)}  ·  ${date}`, W / 2, M + ph + 144);

    // hàng 5 cử chỉ đã dùng để khóa
    ctx.font = '60px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    POSES.forEach((p, i) => {
        ctx.fillText(p.icon, W / 2 + (i - 2) * 112, M + ph + 232);
    });

    const blob = await new Promise((resolve) => cv.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Cannot export framed photo");
    return URL.createObjectURL(blob);
}

// ---------------------------------------------------------
// Thanh chọn level (render bằng JS từ trạng thái tiến trình)
// ---------------------------------------------------------
function setHint(text) {
    currentHint = text;
    const el = document.querySelector("#tab-snap-solve .hl-helper-text");
    if (el) el.textContent = text;
}

function flashHint(text) {
    const el = document.querySelector("#tab-snap-solve .hl-helper-text");
    if (!el) return;
    el.textContent = text;
    setTimeout(() => {
        if (el.textContent === text) el.textContent = currentHint;
    }, 1800);
}

function renderLevelSelect() {
    const wrap = document.querySelector("#hl-level-view .level-dots");
    const stars = document.getElementById("level-stars");
    if (stars) stars.textContent = `⭐ ${progress.completed.length}/${TOTAL_LEVELS}`;
    if (!wrap) return;

    const pages = Math.ceil(TOTAL_LEVELS / LEVELS_PER_PAGE);
    const first = levelPage * LEVELS_PER_PAGE + 1;
    const last = Math.min(first + LEVELS_PER_PAGE - 1, TOTAL_LEVELS);

    let html = `<button class="level-arrow" data-nav="-1" ${levelPage <= 0 ? "disabled" : ""}>❮</button>`;
    for (let id = first; id <= last; id++) {
        const playable = isPlayable(id);
        const cls = ["level-dot"];
        if (id === selectedLevel) cls.push("is-active");
        if (isCompleted(id)) cls.push("is-done");
        if (!playable) cls.push("is-locked");
        const title = !LEVELS[id]
            ? "Coming soon"
            : !playable
                ? `Complete level ${id - 1} first`
                : LEVELS[id].name;
        html += `<div class="level-dot ${cls.slice(1).join(" ")}" data-level="${id}" role="button" title="${title}">${playable ? id : "🔒"}</div>`;
    }
    html += `<button class="level-arrow" data-nav="1" ${levelPage >= pages - 1 ? "disabled" : ""}>❯</button>`;
    wrap.innerHTML = html;

    wrap.onclick = (e) => {
        const nav = e.target.closest("[data-nav]");
        if (nav) {
            if (nav.disabled) return;
            levelPage = Math.max(0, Math.min(pages - 1, levelPage + Number(nav.dataset.nav)));
            renderLevelSelect();
            return;
        }
        const dot = e.target.closest("[data-level]");
        if (!dot) return;
        const id = Number(dot.dataset.level);
        if (!isPlayable(id)) {
            dot.classList.remove("is-shake");
            void dot.offsetWidth;            // restart animation
            dot.classList.add("is-shake");
            flashHint(!LEVELS[id] ? "✨ This level is coming soon!" : `🔒 Complete level ${id - 1} first!`);
            return;
        }
        if (currentImage) startPuzzleGame(currentImage, id);
    };
}

let stopPrevGame = null;   // dọn game cũ trước khi mở game mới

export function startPuzzleGame(imageSrc, levelId) {
    if (stopPrevGame) stopPrevGame();

    // Đọc lại tiến độ của tài khoản đang đăng nhập + kéo bản mới nhất từ server (đổi máy vẫn còn)
    progress = readProgress();
    syncProgress().then((p) => { progress = p; renderLevelSelect(); });

    currentImage = imageSrc;
    if (levelId == null) levelId = selectedLevel;
    if (!isPlayable(levelId)) levelId = highestPlayableLevel();
    selectedLevel = levelId;
    levelPage = Math.floor((levelId - 1) / LEVELS_PER_PAGE);

    const level = LEVELS[levelId];
    const mode = level.mode || "swap";
    const rotateEnabled = !!level.rotate;

    const snapView = document.getElementById("hl-snap-view");
    const levelView = document.getElementById("hl-level-view");
    const helperText = document.querySelector("#tab-snap-solve .hl-helper-text");
    const nextBtn = document.getElementById("btn-next-level");

    if (snapView) snapView.style.display = "none";
    if (levelView) levelView.style.display = "flex";
    if (nextBtn) nextBtn.style.display = "none";
    setHint(level.hint);

    const bigVideo = document.getElementById("hl-webcam-puzzle");
    const miniVideo = document.getElementById("hl-webcam-mini");
    if (bigVideo && miniVideo && bigVideo.srcObject) {
        miniVideo.srcObject = bigVideo.srcObject;
    }

    const board = document.getElementById("puzzle-board");
    const cursor = document.getElementById("virtual-cursor");
    const boardContainer = document.getElementById("puzzle-board-container");
    board.innerHTML = "";
    board.classList.remove("is-complete");
    boardContainer.querySelectorAll(".ss-extra").forEach((n) => n.remove());   // dọn overlay của game trước

    const cols = 4;
    const rows = 3;
    const totalPieces = cols * rows;

    // ---- Dựng bảng ----
    if (mode === "catch") {
        // Level 4: bảng bắt đầu RỖNG, mảnh ghép sẽ rơi xuống rồi được thả vào đúng ô
        for (let i = 0; i < totalPieces; i++) {
            const slot = document.createElement("div");
            slot.className = "puzzle-piece is-empty";
            slot.dataset.index = "-1";          // chưa có mảnh nào
            slot.dataset.current = String(i);
            board.appendChild(slot);
        }
    } else {
        const order = shuffledOrder(totalPieces, mode !== "swap");
        order.forEach((pieceIndex, i) => {
            const row = Math.floor(pieceIndex / cols);
            const col = pieceIndex % cols;
            const shapePath = createJigsawPath(row, col, cols, rows);

            const piece = document.createElement("div");
            piece.className = "puzzle-piece";
            piece.dataset.index = pieceIndex;
            piece.dataset.current = i;
            piece.innerHTML = buildPieceSvg(pieceIndex, row, col, shapePath, imageSrc);

            // Level xoay: ~70% mảnh bị xoay lệch 90° / 180° / 270°
            if (rotateEnabled) {
                const steps = Math.random() < 0.7 ? 1 + Math.floor(Math.random() * 3) : 0;
                setRot(piece, steps * 90);
            }
            board.appendChild(piece);
        });
    }

    // ---- Tinh chỉnh độ "nhạy" ----
    const HAND_MARGIN_X = 0.12;   // bỏ 12% mép trái/phải của webcam (tay sát mép thường mất tracking)
    const HAND_MARGIN_Y = 0.12;   // bỏ 12% mép trên/dưới
    const GRAB_FRAMES   = 2;      // cần 2 frame liên tiếp là "fist" mới gắp
    const DROP_FRAMES   = 3;      // cần 3 frame liên tiếp KHÔNG phải fist mới thả
    const LOST_FRAMES   = 12;     // mất tay quá 12 frame mới hủy thao tác
    const SMOOTH        = 0.35;   // 0..1, càng lớn con trỏ càng bám sát (càng nhạy, càng rung)
    const GESTURE_CONFIRM_FRAMES = 3;   // cử chỉ phải giữ 3 frame mới được coi là "ổn định" (chống nhiễu)

    // ---- Xoay bằng cổ tay (level Twist & Lock) ----
    const TILT_ON       = 30;     // nghiêng quá 30° so với lúc gắp => xoay 1 nấc 90°
    const TILT_RESET    = 15;     // phải quay về trong ±15° mới được xoay nấc tiếp theo
    const ROLL_SMOOTH   = 0.5;    // làm mượt góc cổ tay (0..1)

    let isGrabbing = false;
    let grabbedPiece = null;
    let isGameWon = false;
    let isGameOver = false;
    let isDisposed = false;
    let hasHand = false, justAppeared = true, lostFrames = 0;
    let fistFrames = 0, openFrames = 0;
    let targetX = 0, targetY = 0, curX = 0, curY = 0;
    let grabStartX = 0, grabStartY = 0;
    let rafId = 0;
    let rollSm = null, tiltBase = 0, tiltArmed = true, tiltPreview = 0;
    let startTime = performance.now();
    let lastT = performance.now();

    // L3 + L4 bắt đầu bằng pha "preview" (ảnh mẫu hiện 3 giây), sau đó mới "play"
    let phase = mode === "spotlight" || mode === "catch" ? "preview" : "play";
    let previewEl = null, previewLabel = null, previewEnd = 0;

    // Cử chỉ đã "chốt" sau vài frame ổn định (dùng cho đèn lớn ở L3 và khóa pose ở L5)
    let rawGesture = "None", rawFrames = 0;
    let stableGesture = "None", stableSince = 0, stableScore = 0;

    // ---- Cache kích thước (KHÔNG gọi getBoundingClientRect mỗi frame) ----
    let L = { bx: 0, by: 0, bw: 1, bh: 1 };
    let cellW = 1, cellH = 1;
    const boardOverlays = [];   // overlay phủ đúng khung bảng (được canh lại mỗi khi đổi kích thước)
    const extras = [];          // mọi phần tử overlay game này tạo ra -> cleanup xóa hết

    function layoutOverlays() {
        cellW = L.bw / cols;
        cellH = L.bh / rows;
        for (const n of boardOverlays) {
            n.style.left = `${L.bx}px`;
            n.style.top = `${L.by}px`;
            n.style.width = `${L.bw}px`;
            n.style.height = `${L.bh}px`;
        }
    }

    function measure() {
        const c = boardContainer.getBoundingClientRect();
        const b = board.getBoundingClientRect();
        L = {
            bx: b.left - c.left - boardContainer.clientLeft,
            by: b.top  - c.top  - boardContainer.clientTop,
            bw: b.width,
            bh: b.height
        };
        layoutOverlays();
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(boardContainer);
    ro.observe(board);

    function addExtra(node, before) {
        if (before) boardContainer.insertBefore(node, before);
        else boardContainer.appendChild(node);
        extras.push(node);
        return node;
    }
    // overlay phủ đúng khung bảng
    function addOverlay(node, before) {
        addExtra(node, before);
        boardOverlays.push(node);
        layoutOverlays();
        return node;
    }

    // Ô nào (0..11) đang nằm dưới điểm (px, py) – tọa độ theo container
    function cellIndexAt(px, py) {
        const col = Math.max(0, Math.min(cols - 1, Math.floor(((px - L.bx) / L.bw) * cols)));
        const row = Math.max(0, Math.min(rows - 1, Math.floor(((py - L.by) / L.bh) * rows)));
        return row * cols + col;
    }
    function getPieceAt(px, py) {
        return board.children[cellIndexAt(px, py)];
    }

    // =====================================================
    // CÁC THÀNH PHẦN RIÊNG CỦA TỪNG LEVEL
    // =====================================================

    // ---- Ảnh mẫu 3 giây (L3, L4) ----
    if (phase === "preview") {
        previewEl = addOverlay(el("div", "ss-extra ss-preview", `<div class="ss-preview-label"></div>`));
        previewEl.style.backgroundImage = `url("${imageSrc}")`;
        previewLabel = previewEl.firstElementChild;
        previewEnd = performance.now() + PREVIEW_MS;
        setHint("👀 Memorize the picture!");
    }
    function endPreview() {
        phase = "play";
        const t = performance.now();
        startTime = t;                          // đồng hồ chỉ chạy từ lúc hết thời gian xem ảnh
        lampReadyAt = t;                        // (L3) phải xòe tay MỚI, không tính lúc đang xem ảnh mẫu
        lastSpawn = t - SPAWN_GAP_START + 400;  // (L4) mảnh đầu tiên rơi sau ~0.4s
        if (previewEl) {
            const p = previewEl;
            p.classList.add("is-off");
            setTimeout(() => p.remove(), 500);
        }
        setHint(level.hint);
    }

    // ---- Level 3: Spotlight ----
    let darkEl = null, lampEl = null, lampBar = null, lampTxt = null;
    let spotR = 1;
    let lampState = "ready", lampT0 = 0, lampReadyAt = 0;
    let stillX = 0, stillY = 0, stillSince = performance.now();
    if (mode === "spotlight") {
        darkEl = addOverlay(el("div", "ss-extra ss-dark"));
        lampEl = addExtra(el("div", "ss-extra ss-lamp",
            `<span>💡</span><div class="ss-lamp-bar"><i></i></div><span class="ss-lamp-txt"></span>`));
        lampBar = lampEl.querySelector("i");
        lampTxt = lampEl.querySelector(".ss-lamp-txt");
    }

    function spotlightTick(now, dt) {
        let targetR = hasHand ? Math.max(48, cellW * SPOT_RADIUS_CELLS) : 1;

        // "giữ yên": tay không lệch quá LAMP_STILL_CELLS ô kể từ mốc gần nhất
        if (Math.hypot(targetX - stillX, targetY - stillY) > cellW * LAMP_STILL_CELLS) {
            stillX = targetX;
            stillY = targetY;
            stillSince = now;
        }

        let holdPct = 0;
        if (phase === "play" && !isGameWon) {
            if (lampState === "ready") {
                const ok = hasHand && !isGrabbing && stableGesture === "open_palm";
                const held = ok ? now - Math.max(stableSince, stillSince, lampReadyAt) : 0;
                holdPct = Math.max(0, Math.min(1, held / LAMP_HOLD_MS));
                if (holdPct >= 1) {
                    lampState = "on";
                    lampT0 = now;
                    flashHint("💡 Lamp ON!");
                }
            } else if (lampState === "on") {
                if (now - lampT0 >= LAMP_ON_MS) { lampState = "cooldown"; lampT0 = now; }
            } else if (now - lampT0 >= LAMP_COOLDOWN_MS) {
                lampState = "ready";
                lampReadyAt = now;       // phải xòe tay MỚI, không tính lần xòe cũ
            }
        }

        // đèn lớn: bán kính đủ lớn để vùng sáng hoàn toàn (58% bán kính) phủ cả bảng
        if (lampState === "on") targetR = Math.hypot(L.bw, L.bh) / 0.58;
        spotR += (targetR - spotR) * Math.min(1, dt * 9);

        darkEl.style.setProperty("--sx", `${(curX - L.bx).toFixed(1)}px`);
        darkEl.style.setProperty("--sy", `${(curY - L.by).toFixed(1)}px`);
        darkEl.style.setProperty("--sr", `${Math.max(1, spotR).toFixed(1)}px`);

        // HUD đèn
        let pct, txt;
        if (lampState === "ready") {
            pct = holdPct > 0 ? holdPct * 100 : 100;
            txt = holdPct > 0 ? "Hold still…" : "Hold 🖐️ still";
        } else if (lampState === "on") {
            pct = 100 * (1 - (now - lampT0) / LAMP_ON_MS);
            txt = "LAMP ON!";
        } else {
            pct = 100 * Math.min(1, (now - lampT0) / LAMP_COOLDOWN_MS);
            txt = "Recharging…";
        }
        lampBar.style.width = `${Math.max(0, pct).toFixed(1)}%`;
        if (lampTxt.textContent !== txt) lampTxt.textContent = txt;
        lampEl.dataset.state = lampState;
    }

    // ---- Level 4: Catch & Build ----
    let fallLayer = null, hudEl = null;
    const falling = [];          // các mảnh đang rơi: { el, idx, x, y, vx, vy, state, offX, offY, w, h }
    const queue = mode === "catch" ? shuffledOrder(totalPieces, false) : [];
    let heldFall = null;
    let lives = CATCH_LIVES;
    let placed = 0;
    let lastSpawn = 0;
    if (mode === "catch") {
        const ghost = el("div", "ss-extra ss-ghost");
        ghost.style.backgroundImage = `url("${imageSrc}")`;
        ghost.style.opacity = String(CATCH_GHOST_OPACITY);
        addOverlay(ghost, board);                       // nằm SAU bảng (chèn trước #puzzle-board)
        fallLayer = addExtra(el("div", "ss-extra ss-fall-layer"));
        addOverlay(el("div", "ss-extra ss-floor"));     // vạch đỏ "đáy"
        hudEl = addExtra(el("div", "ss-extra ss-hud"));
        renderHud();
    }
    function renderHud() {
        if (hudEl) hudEl.textContent = "❤️".repeat(lives) + "🖤".repeat(CATCH_LIVES - lives);
    }
    const fallSpeed = () => L.bh / Math.max(FALL_SECONDS_MIN, FALL_SECONDS_START - placed * FALL_RAMP);   // px/giây

    function spawnPiece(now) {
        const idx = queue.shift();
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        const wrap = el("div", "puzzle-piece fall-piece",
            buildPieceSvg(idx, row, col, createJigsawPath(row, col, cols, rows), imageSrc));
        wrap.style.width = `${cellW}px`;
        wrap.style.height = `${cellH}px`;
        fallLayer.appendChild(wrap);

        // chọn cột rơi: thử vài lần để không đè lên mảnh khác còn ở gần mép trên
        let x = 0;
        for (let t = 0; t < 6; t++) {
            x = L.bx + Math.random() * Math.max(1, L.bw - cellW);
            if (!falling.some((q) => q.y < L.by + cellH && Math.abs(q.x - x) < cellW * 0.9)) break;
        }
        const p = { el: wrap, idx, x, y: L.by - cellH, vx: 0, vy: 0, state: "fall", offX: 0, offY: 0, w: cellW, h: cellH };
        falling.push(p);
        lastSpawn = now;
        wrap.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    }

    function catchTick(now, dt) {
        if (phase !== "play" || isGameOver || isGameWon) return;

        const gap = Math.max(SPAWN_GAP_MIN, SPAWN_GAP_START - placed * 90);
        if (queue.length && falling.length < CATCH_MAX_ACTIVE && now - lastSpawn >= gap) spawnPiece(now);

        const sp = fallSpeed();
        const g = L.bh * 4.5;   // "trọng lực" của cú bật ra
        for (let i = falling.length - 1; i >= 0; i--) {
            const p = falling[i];
            if (p.w !== cellW || p.h !== cellH) {      // bảng bị đổi kích thước
                p.w = cellW;
                p.h = cellH;
                p.el.style.width = `${cellW}px`;
                p.el.style.height = `${cellH}px`;
            }
            if (p.state === "held") {
                // mảnh trượt dần về chính giữa con trỏ
                p.offX *= 0.8;
                p.offY *= 0.8;
                p.x = curX - cellW / 2 - p.offX;
                p.y = curY - cellH / 2 - p.offY;
            } else {
                if (p.state === "bounce") {
                    p.vy += g * dt;
                    p.x += p.vx * dt;
                    p.vx *= Math.max(0, 1 - 3 * dt);
                    p.x = Math.max(L.bx, Math.min(L.bx + L.bw - cellW, p.x));
                    if (p.vy >= sp) { p.vy = sp; p.state = "fall"; }
                    p.y += p.vy * dt;
                } else {
                    p.y += sp * dt;
                }
                if (p.y + cellH >= L.by + L.bh) {        // chạm đáy
                    missPiece(p, i);
                    continue;
                }
            }
            p.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)` +
                (p.state === "held" ? " scale(1.06)" : "");
        }
    }

    function missPiece(p, i) {
        falling.splice(i, 1);
        p.el.classList.add("is-missed");
        setTimeout(() => p.el.remove(), 380);
        queue.push(p.idx);          // mảnh này sẽ rơi lại sau
        lives--;
        renderHud();
        if (lives <= 0) gameOver();
        else flashHint("💔 It hit the floor!");
    }

    function gameOver() {
        isGameOver = true;
        if (isGrabbing) cancelGrab();
        cursor.style.display = "none";
        setHint("💥 Out of lives!");
        showCard("💥 Out of lives!", `You placed ${placed}/${totalPieces} pieces.`, [
            { label: "TRY AGAIN", onClick: () => startPuzzleGame(currentImage, levelId) }
        ]);
    }

    function showCard(title, text, buttons) {
        const card = addExtra(el("div", "ss-extra ss-card",
            `<h3>${title}</h3><p>${text}</p><div class="ss-card-actions"></div>`));
        const actions = card.querySelector(".ss-card-actions");
        buttons.forEach((b) => {
            const btn = el("button", "hl-action-btn hl-rescan-btn", b.label);
            btn.onclick = b.onClick;
            actions.appendChild(btn);
        });
        return card;
    }

    function findFallingAt(px, py) {
        const PAD = Math.max(10, cellW * 0.12);     // dễ tính một chút cho dễ bắt
        let best = null, bestD = Infinity;
        for (const p of falling) {
            if (p.state === "held") continue;
            const cx = p.x + cellW / 2;
            const cy = p.y + cellH / 2;
            if (Math.abs(px - cx) <= cellW / 2 + PAD && Math.abs(py - cy) <= cellH / 2 + PAD) {
                const d = Math.hypot(px - cx, py - cy);
                if (d < bestD) { bestD = d; best = p; }
            }
        }
        return best;
    }

    function placeInSlot(p) {
        const slot = board.children[p.idx];
        slot.replaceChildren(p.el.firstElementChild);       // chuyển nguyên node SVG vào ô
        slot.classList.remove("is-empty");
        slot.classList.add("is-snap");
        slot.dataset.index = String(p.idx);
        falling.splice(falling.indexOf(p), 1);
        p.el.remove();
        placed++;
        updateProgress();
    }

    function bounceOut(p) {
        p.state = "bounce";
        p.vy = -Math.sqrt(2 * (L.bh * 4.5) * cellH * 0.9);   // bật lên ~0.9 ô
        p.vx = (Math.random() < 0.5 ? -1 : 1) * cellW * 2.2;
        flashHint("❌ Wrong square — it bounced out!");
    }

    // ---- Level 5: Pose Lock ----
    let poseOf = [];                                   // poseOf[ô] = { key, icon }
    let chips = [], chipProg = [];
    const locked = new Array(totalPieces).fill(false);
    let hoverCell = -1, hoverSince = 0;
    let rewardUrl = null, rewardEl = null, fabEl = null;
    if (mode === "pose") {
        // mỗi cử chỉ xuất hiện ít nhất 2 lần, 2 ô còn lại random
        const bag = [];
        POSES.forEach((p) => bag.push(p, p));
        while (bag.length < totalPieces) bag.push(POSES[Math.floor(Math.random() * POSES.length)]);
        poseOf = shuffledOrder(totalPieces, false).map((i) => bag[i]);

        const layer = addOverlay(el("div", "ss-extra ss-pose-layer"));
        poseOf.forEach((p) => {
            layer.appendChild(el("div", "ss-pose-cell", `<div class="ss-chip"><span>${p.icon}</span></div>`));
        });
        chips = Array.from(layer.querySelectorAll(".ss-chip"));
        chipProg = chips.map(() => 0);
    }

    const isCorrect = (piece) => piece.dataset.index === piece.dataset.current;

    function poseTick(now) {
        if (phase !== "play" || isGameWon) return;
        let holdCell = -1, prog = 0;
        if (hasHand && !isGrabbing) {
            const cell = cellIndexAt(curX, curY);
            if (cell !== hoverCell) { hoverCell = cell; hoverSince = now; }
            const piece = board.children[cell];
            if (!locked[cell] && isCorrect(piece) &&
                stableGesture === poseOf[cell].key && stableScore >= POSE_MIN_SCORE) {
                // đúng ô + đúng cử chỉ: phải giữ liên tục POSE_HOLD_MS (tính từ lúc cả hai điều kiện cùng đúng)
                const held = now - Math.max(stableSince, hoverSince);
                prog = Math.min(1, held / POSE_HOLD_MS);
                holdCell = cell;
                if (prog >= 1) {
                    lockCell(cell);
                    holdCell = -1;
                    prog = 0;
                }
            }
        } else {
            hoverCell = -1;
        }
        chips.forEach((chip, i) => {
            const v = i === holdCell ? prog : 0;
            if (chipProg[i] !== v) {
                chipProg[i] = v;
                chip.style.setProperty("--deg", `${(v * 360).toFixed(0)}deg`);
                chip.classList.toggle("is-holding", v > 0);
            }
        });
    }

    function lockCell(cell) {
        locked[cell] = true;
        board.children[cell].classList.add("is-locked");
        const chip = chips[cell];
        chip.classList.remove("is-ready", "is-holding");
        chip.classList.add("is-locked");
        chip.firstElementChild.textContent = "🔒";
        flashHint(`🔒 Locked! ${locked.filter(Boolean).length}/${totalPieces}`);
        updateProgress();
    }

    async function showReward(secs) {
        await sleep(1100);                       // cho người chơi nhìn bức ảnh hoàn chỉnh một chút
        if (isDisposed) return;
        let url;
        try {
            url = await buildFramedPhoto(imageSrc, secs);
        } catch (e) {
            console.warn("[Snap & Solve] Cannot build framed photo:", e);
            return;
        }
        if (isDisposed) { URL.revokeObjectURL(url); return; }
        rewardUrl = url;
        rewardEl = addExtra(el("div", "ss-extra ss-reward", `
            <img class="ss-reward-img" src="${url}" alt="Your framed Pose Lock photo">
            <div class="ss-card-actions">
                <a class="hl-action-btn hl-rescan-btn" href="${url}" download="handlab-pose-lock.png">⬇ SAVE PHOTO</a>
                <button class="hl-action-btn hl-rescan-btn" data-close>CLOSE</button>
            </div>`));
        fabEl = addExtra(el("button", "ss-extra ss-photo-fab is-hidden", "🖼 PHOTO"));
        rewardEl.querySelector("[data-close]").onclick = () => {
            rewardEl.classList.add("is-hidden");
            fabEl.classList.remove("is-hidden");
        };
        fabEl.onclick = () => {
            rewardEl.classList.remove("is-hidden");
            fabEl.classList.add("is-hidden");
        };
    }

    // =====================================================
    // ĐIỀU KHIỂN BẰNG TAY
    // =====================================================

    // tay (0..1 trong webcam) -> toạ độ trên BẢNG ghép (đã bỏ mép)
    const remap = (v, m) => Math.max(0, Math.min(1, (v - m) / (1 - 2 * m)));

    // Lọc nhiễu cử chỉ: phải giữ vài frame liên tiếp mới đổi "cử chỉ ổn định"
    function trackGesture(g, score, now) {
        stableScore = score;
        if (g === rawGesture) rawFrames++;
        else { rawGesture = g; rawFrames = 1; }
        if (rawFrames >= GESTURE_CONFIRM_FRAMES && g !== stableGesture) {
            stableGesture = g;
            stableSince = now;
        }
    }

    // roll = góc nghiêng cổ tay (độ, + = nghiêng sang phải trên màn hình), do memeDetector tính
    // score = độ tin cậy của cử chỉ (0..1), do memeDetector truyền thêm
    setOnHandTracking((x, y, gesture, roll, score) => {
        if (isGameWon || isGameOver) return;

        if (x === null || y === null) {
            lostFrames++;
            if (lostFrames > LOST_FRAMES) {
                hasHand = false;
                justAppeared = true;
                fistFrames = openFrames = 0;
                rollSm = null;
                rawGesture = "None";
                stableGesture = "None";
                rawFrames = 0;
                cursor.style.display = "none";
                if (isGrabbing) cancelGrab();
            }
            return;
        }
        lostFrames = 0;
        if (!hasHand) {
            hasHand = true;
            cursor.style.display = "flex";
        }

        targetX = L.bx + remap(x, HAND_MARGIN_X) * L.bw;
        targetY = L.by + remap(y, HAND_MARGIN_Y) * L.bh;
        if (justAppeared) { curX = targetX; curY = targetY; justAppeared = false; }

        // làm mượt góc cổ tay
        if (typeof roll === "number") {
            rollSm = rollSm === null ? roll : rollSm + angleDiff(roll, rollSm) * ROLL_SMOOTH;
        }

        trackGesture(gesture, typeof score === "number" ? score : 1, performance.now());

        // chống nhiễu cử chỉ: phải ổn định vài frame mới đổi trạng thái
        if (gesture === "fist") { fistFrames++; openFrames = 0; }
        else                    { openFrames++; fistFrames = 0; }

        if (!isGrabbing && fistFrames >= GRAB_FRAMES) grab();
        else if (isGrabbing && openFrames >= DROP_FRAMES) drop();

        if (rotateEnabled && isGrabbing) updateTilt();
    });

    // Nghiêng cổ tay trái/phải (so với góc lúc gắp) => xoay mảnh từng nấc 90°
    function updateTilt() {
        if (rollSm === null || !grabbedPiece) return;
        const diff = angleDiff(rollSm, tiltBase);
        // mảnh "nghiêng nhẹ" theo tay để người chơi thấy phản hồi trước khi nấc xoay xảy ra
        tiltPreview = Math.max(-TILT_ON, Math.min(TILT_ON, diff)) * 0.4;
        if (tiltArmed && Math.abs(diff) >= TILT_ON) {
            setRot(grabbedPiece, getRot(grabbedPiece) + (diff > 0 ? 90 : -90));
            tiltArmed = false;
        } else if (!tiltArmed && Math.abs(diff) <= TILT_RESET) {
            tiltArmed = true;
        }
    }

    // Vòng lặp 60fps: con trỏ + mảnh đang kéo mượt dù tracking chỉ ~15-30fps
    function tick() {
        rafId = requestAnimationFrame(tick);
        const now = performance.now();
        const dt = Math.min(0.05, (now - lastT) / 1000);
        lastT = now;

        if (hasHand) {
            curX += (targetX - curX) * SMOOTH;
            curY += (targetY - curY) * SMOOTH;
            cursor.style.transform = `translate3d(${curX}px, ${curY}px, 0)`;
            if (grabbedPiece) {
                grabbedPiece.style.transform =
                    `translate3d(${curX - grabStartX}px, ${curY - grabStartY}px, 0) scale(1.04) rotate(${tiltPreview}deg)`;
            }
        }

        if (phase === "preview") {
            const left = previewEnd - now;
            if (previewLabel) previewLabel.textContent = `👀 Memorize it!  ${Math.max(1, Math.ceil(left / 1000))}`;
            if (left <= 0) endPreview();
        }

        if (mode === "spotlight") spotlightTick(now, dt);
        else if (mode === "catch") catchTick(now, dt);
        else if (mode === "pose") poseTick(now);
    }
    rafId = requestAnimationFrame(tick);

    function grab() {
        if (phase !== "play" || isGameOver) return;

        if (mode === "catch") {
            const p = findFallingAt(curX, curY);
            if (!p) return;
            isGrabbing = true;
            heldFall = p;
            p.state = "held";
            p.offX = curX - (p.x + cellW / 2);
            p.offY = curY - (p.y + cellH / 2);
            p.el.classList.add("is-grabbed");
            cursor.classList.add("is-grabbing");
            return;
        }

        const cell = cellIndexAt(curX, curY);
        const piece = board.children[cell];
        if (!piece) return;
        if (mode === "pose") {
            if (locked[cell]) return;                                   // mảnh đã khóa thì không nhấc được nữa
            // mảnh đúng chỗ ở ô yêu cầu ✊: nắm tay ở đây là cử chỉ KHÓA, không phải gắp
            if (isCorrect(piece) && poseOf[cell].key === "fist") return;
        }
        isGrabbing = true;
        grabbedPiece = piece;
        grabStartX = curX;
        grabStartY = curY;
        tiltBase = rollSm === null ? 0 : rollSm;   // góc "trung tính" = góc cổ tay lúc nắm
        tiltArmed = true;
        tiltPreview = 0;
        piece.classList.add("is-grabbed");
        cursor.classList.add("is-grabbing");
    }

    function releasePiece() {
        cursor.classList.remove("is-grabbing");
        tiltPreview = 0;
        if (grabbedPiece) {
            grabbedPiece.classList.remove("is-grabbed");
            grabbedPiece.style.transform = "";
        }
    }

    function drop() {
        if (mode === "catch") {
            const p = heldFall;
            isGrabbing = false;
            heldFall = null;
            cursor.classList.remove("is-grabbing");
            if (!p) return;
            p.el.classList.remove("is-grabbed");
            if (cellIndexAt(curX, curY) === p.idx) placeInSlot(p);   // đúng ô -> khớp vào
            else bounceOut(p);                                       // sai ô -> bật ra, rơi lại
            return;
        }

        const from = grabbedPiece;
        const target = getPieceAt(curX, curY);
        isGrabbing = false;
        grabbedPiece = null;
        releasePieceVisual(from);
        const targetLocked = mode === "pose" && target && target.classList.contains("is-locked");
        if (target && target !== from && !targetLocked) swapPieces(from, target);
        updateProgress();   // luôn cập nhật: xoay cũng có thể làm mảnh đúng chỗ
    }

    function releasePieceVisual(piece) {
        cursor.classList.remove("is-grabbing");
        tiltPreview = 0;
        piece.classList.remove("is-grabbed");
        piece.style.transform = "";
    }

    function cancelGrab() {
        isGrabbing = false;
        if (mode === "catch") {
            cursor.classList.remove("is-grabbing");
            if (heldFall) {                       // mất tay giữa chừng: mảnh lại tiếp tục rơi
                heldFall.state = "fall";
                heldFall.el.classList.remove("is-grabbed");
                heldFall = null;
            }
            return;
        }
        releasePiece();
        grabbedPiece = null;
        updateProgress();
    }

    // Đổi chỗ bằng cách DI CHUYỂN node SVG (giữ nguyên góc xoay của từng mảnh)
    function swapPieces(p1, p2) {
        const a = p1.firstElementChild;
        const b = p2.firstElementChild;
        p1.replaceChildren(b);
        p2.replaceChildren(a);
        const tempIdx = p1.dataset.index;
        p1.dataset.index = p2.dataset.index;
        p2.dataset.index = tempIdx;
    }

    function updateProgress() {
        let correctCount = 0;
        Array.from(board.children).forEach((p, i) => {
            // ĐÚNG = đúng chỗ VÀ đúng chiều (level thường luôn đúng chiều)
            const ok = isCorrect(p) && isUpright(p);
            // Level 5: chỉ tính mảnh đã KHÓA bằng cử chỉ; mảnh đúng chỗ nhưng chưa khóa chỉ phát sáng
            const counted = mode === "pose" ? ok && locked[i] : ok;
            p.classList.toggle("is-placed", counted);
            if (mode === "pose") {
                const ready = ok && !locked[i];
                p.classList.toggle("is-ready", ready);
                if (chips[i]) chips[i].classList.toggle("is-ready", ready);
            }
            if (counted) correctCount++;
        });
        document.getElementById("puzzle-score").textContent = correctCount;
        document.getElementById("puzzle-progress").style.width = `${(correctCount / totalPieces) * 100}%`;

        if (correctCount === totalPieces && !isGameWon) onWin();
    }

    function onWin() {
        isGameWon = true;
        cursor.style.display = "none";
        cancelAnimationFrame(rafId);
        board.classList.add("is-complete");
        if (darkEl) darkEl.classList.add("is-off");       // L3: bật sáng cả bảng để xem ảnh selfie hoàn chỉnh
        if (lampEl) lampEl.style.display = "none";

        // ---- Lưu tiến trình ----
        const secs = (performance.now() - startTime) / 1000;
        const prevBest = progress.best[levelId];
        const isNewBest = prevBest == null || secs < prevBest;
        if (isNewBest) progress.best[levelId] = secs;
        if (!isCompleted(levelId)) progress.completed.push(levelId);
        saveProgress();
        renderLevelSelect();

        let msg = `🎉 <strong>PERFECT! ${formatTime(secs)}</strong>`;
        if (prevBest != null) msg += isNewBest ? " · NEW BEST!" : ` · best ${formatTime(prevBest)}`;
        msg += " 🎉";
        const next = levelId + 1;
        if (next <= TOTAL_LEVELS && !LEVELS[next]) msg += " ✨ More levels coming soon!";
        if (mode === "pose") msg += " 📸 Your framed photo is ready!";
        currentHint = `🎉 PERFECT! ${formatTime(secs)} 🎉`;
        if (helperText) helperText.innerHTML = msg;

        if (nextBtn && isPlayable(next)) {
            nextBtn.style.display = "";
            nextBtn.onclick = () => startPuzzleGame(currentImage, next);
        }

        if (mode === "pose") showReward(secs);
    }

    function cleanup() {
        isDisposed = true;
        cancelAnimationFrame(rafId);
        ro.disconnect();
        setOnHandTracking(null);
        stopPrevGame = null;
        extras.forEach((n) => n.remove());
        if (rewardUrl) URL.revokeObjectURL(rewardUrl);
        cursor.classList.remove("is-grabbing");
    }
    stopPrevGame = cleanup;

    // ---- Khởi động ----
    renderLevelSelect();
    updateProgress();

    // PLAY AGAIN = chụp lại ảnh mới (level đang chọn được giữ nguyên)
    document.getElementById("btn-restart-puzzle").onclick = () => {
        cleanup();
        if (nextBtn) nextBtn.style.display = "none";
        if (snapView) snapView.style.display = "flex";
        if (levelView) levelView.style.display = "none";
        const scanOverlay = document.querySelector("#tab-snap-solve .hl-scan-overlay");
        if (scanOverlay) scanOverlay.style.display = 'flex';
        setHint("Use 2 hands to frame your face. Expand to capture.");
        resetAutoScan();
    };
}