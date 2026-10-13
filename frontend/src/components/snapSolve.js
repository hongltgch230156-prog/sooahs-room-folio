// frontend/src/components/snapSolve.js
import { captureMemeSnapshot, resetAutoScan, setOnHandTracking } from "./memeDetector.js";

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
            `L ${endX} ${endY}`            // kết thúc tại điểm bắt đầu cung bo góc
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

// .p-lift  = bóng đổ + độ dày  (chỉ hiện khi mảnh chưa đúng chỗ -> "nhấc lên")
// .p-bevel = vát sáng + rãnh   (LUÔN hiện, kể cả khi đã ghép khít -> vẫn 3D)
function buildPieceSvg(id, row, col, shapePath, imageSrc) {
    return `
    <svg class="puzzle-piece-svg" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"
         style="overflow: visible;" aria-hidden="true">
      <defs>
        <clipPath id="pc-${id}"><path d="${shapePath}"/></clipPath>

        <linearGradient id="pb-${id}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.35"/>
          <stop offset="35%"  stop-color="#ffffff" stop-opacity="0.12"/>
          <stop offset="65%"  stop-color="#5b3f78" stop-opacity="0.10"/>
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

// Level nào chưa có trong bảng này = "Coming soon" (hiện khóa 🔒)
const LEVELS = {
    1: {
        name: "Classic",
        rotate: false,
        hint: "Make a FIST ✊ to grab, OPEN PALM 🖐️ to drop!"
    },
    2: {
        name: "Twist & Lock",
        rotate: true,
        hint: "✊ Grab a piece, TILT your wrist ↺ ↻ to rotate it, 🖐️ open palm to drop!"
    }
};

const STORAGE_KEY = "handlab.snapSolve.progress.v1";

function loadProgress() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const p = raw ? JSON.parse(raw) : null;
        if (p && Array.isArray(p.completed)) {
            return {
                completed: p.completed.filter((n) => Number.isInteger(n)),
                best: p.best && typeof p.best === "object" ? p.best : {}
            };
        }
    } catch (e) { /* localStorage bị chặn / JSON hỏng -> bỏ qua */ }
    return { completed: [], best: {} };
}

function saveProgress() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (e) { /* ignore */ }
}

let progress = loadProgress();
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

    currentImage = imageSrc;
    if (levelId == null) levelId = selectedLevel;
    if (!isPlayable(levelId)) levelId = highestPlayableLevel();
    selectedLevel = levelId;
    levelPage = Math.floor((levelId - 1) / LEVELS_PER_PAGE);

    const level = LEVELS[levelId];
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
    board.innerHTML = "";

    const cols = 4;
    const rows = 3;
    const totalPieces = cols * rows;
    const pieces = [];

    for (let i = 0; i < totalPieces; i++) { pieces.push(i); }
    pieces.sort(() => Math.random() - 0.5);

    pieces.forEach((pieceIndex, i) => {
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

    const cursor = document.getElementById("virtual-cursor");
    const boardContainer = document.getElementById("puzzle-board-container");

    // ---- Tinh chỉnh độ "nhạy" ----
    const HAND_MARGIN_X = 0.12;   // bỏ 12% mép trái/phải của webcam (tay sát mép thường mất tracking)
    const HAND_MARGIN_Y = 0.12;   // bỏ 12% mép trên/dưới
    const GRAB_FRAMES   = 2;      // cần 2 frame liên tiếp là "fist" mới gắp
    const DROP_FRAMES   = 3;      // cần 3 frame liên tiếp KHÔNG phải fist mới thả
    const LOST_FRAMES   = 12;     // mất tay quá 12 frame mới hủy thao tác
    const SMOOTH        = 0.35;   // 0..1, càng lớn con trỏ càng bám sát (càng nhạy, càng rung)
    // ---- Xoay bằng cổ tay (level Twist & Lock) ----
    const TILT_ON       = 30;     // nghiêng quá 30° so với lúc gắp => xoay 1 nấc 90°
    const TILT_RESET    = 15;     // phải quay về trong ±15° mới được xoay nấc tiếp theo
    const ROLL_SMOOTH   = 0.5;    // làm mượt góc cổ tay (0..1)

    let isGrabbing = false;
    let grabbedPiece = null;
    let isGameWon = false;

    let hasHand = false, justAppeared = true, lostFrames = 0;
    let fistFrames = 0, openFrames = 0;
    let targetX = 0, targetY = 0, curX = 0, curY = 0;
    let grabStartX = 0, grabStartY = 0;
    let rafId = 0;

    let rollSm = null, tiltBase = 0, tiltArmed = true, tiltPreview = 0;
    const startTime = performance.now();

    // ---- Cache kích thước (KHÔNG gọi getBoundingClientRect mỗi frame) ----
    let L = { bx: 0, by: 0, bw: 1, bh: 1 };
    function measure() {
        const c = boardContainer.getBoundingClientRect();
        const b = board.getBoundingClientRect();
        L = {
            bx: b.left - c.left - boardContainer.clientLeft,
            by: b.top  - c.top  - boardContainer.clientTop,
            bw: b.width,
            bh: b.height
        };
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(boardContainer);
    ro.observe(board);

    renderLevelSelect();
    updateProgress();

    // tay (0..1 trong webcam) -> toạ độ trên BẢNG ghép (đã bỏ mép)
    const remap = (v, m) => Math.max(0, Math.min(1, (v - m) / (1 - 2 * m)));

    // roll = góc nghiêng cổ tay (độ, + = nghiêng sang phải trên màn hình), do memeDetector tính
    setOnHandTracking((x, y, gesture, roll) => {
        if (isGameWon) return;

        if (x === null || y === null) {
            lostFrames++;
            if (lostFrames > LOST_FRAMES) {
                hasHand = false;
                justAppeared = true;
                fistFrames = openFrames = 0;
                rollSm = null;
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
        if (!hasHand) return;

        curX += (targetX - curX) * SMOOTH;
        curY += (targetY - curY) * SMOOTH;
        cursor.style.transform = `translate3d(${curX}px, ${curY}px, 0)`;

        if (grabbedPiece) {
            grabbedPiece.style.transform =
                `translate3d(${curX - grabStartX}px, ${curY - grabStartY}px, 0) scale(1.04) rotate(${tiltPreview}deg)`;
        }
    }
    rafId = requestAnimationFrame(tick);

    function grab() {
        const piece = getPieceAt(curX, curY);
        if (!piece) return;
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
        const from = grabbedPiece;
        const target = getPieceAt(curX, curY);
        isGrabbing = false;
        grabbedPiece = null;
        releasePieceVisual(from);

        if (target && target !== from) swapPieces(from, target);
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
        releasePiece();
        grabbedPiece = null;
        updateProgress();
    }

    // Tính ô theo đúng khung BẢNG
    function getPieceAt(px, py) {
        const col = Math.floor(((px - L.bx) / L.bw) * cols);
        const row = Math.floor(((py - L.by) / L.bh) * rows);
        const safeCol = Math.max(0, Math.min(cols - 1, col));
        const safeRow = Math.max(0, Math.min(rows - 1, row));
        return board.children[safeRow * cols + safeCol];
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
        const allPieces = document.querySelectorAll(".puzzle-piece");
        let correctCount = 0;

        allPieces.forEach(p => {
            // ĐÚNG = đúng chỗ VÀ đúng chiều (level thường luôn đúng chiều)
            const ok = p.dataset.index === p.dataset.current && isUpright(p);
            p.classList.toggle("is-placed", ok);
            if (ok) correctCount++;
        });

        document.getElementById("puzzle-score").textContent = correctCount;
        document.getElementById("puzzle-progress").style.width = `${(correctCount / totalPieces) * 100}%`;

        if (correctCount === totalPieces && !isGameWon) onWin();
    }

    function onWin() {
        isGameWon = true;
        cursor.style.display = "none";
        cancelAnimationFrame(rafId);

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
        currentHint = `🎉 PERFECT! ${formatTime(secs)} 🎉`;
        if (helperText) helperText.innerHTML = msg;

        if (nextBtn && isPlayable(next)) {
            nextBtn.style.display = "";
            nextBtn.onclick = () => startPuzzleGame(currentImage, next);
        }
    }

    function cleanup() {
        cancelAnimationFrame(rafId);
        ro.disconnect();
        setOnHandTracking(null);
        stopPrevGame = null;
    }
    stopPrevGame = cleanup;

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