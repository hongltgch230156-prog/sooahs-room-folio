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

let stopPrevGame = null;   // dọn game cũ trước khi mở game mới

export function startPuzzleGame(imageSrc) {
    const snapView = document.getElementById("hl-snap-view");
    const levelView = document.getElementById("hl-level-view");
    const helperText = document.querySelector("#tab-snap-solve .hl-helper-text");
    
    if(snapView) snapView.style.display = "none";
    if(levelView) levelView.style.display = "flex"; 
    if(helperText) helperText.textContent = "Make a FIST ✊ to grab, OPEN PALM 🖐️ to drop!";
    
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
        // Tọa độ GỐC của mảnh ghép để vẽ viền Jigsaw khớp nhau
        const row = Math.floor(pieceIndex / cols);
        const col = pieceIndex % cols;
        const shapePath = createJigsawPath(row, col, cols, rows);
        
        const piece = document.createElement("div");
        piece.className = "puzzle-piece";
        piece.dataset.index = pieceIndex; 
        piece.dataset.current = i;        
        
        // VẼ 3D UI BẰNG SVG (Đổ bóng + Bevel phát sáng góc)
        piece.innerHTML = buildPieceSvg(pieceIndex, row, col, shapePath, imageSrc);   
        board.appendChild(piece);
    });

    if (stopPrevGame) stopPrevGame();

    const cursor = document.getElementById("virtual-cursor");
    const boardContainer = document.getElementById("puzzle-board-container");

    // ---- Tinh chỉnh độ "nhạy" ----
    const HAND_MARGIN_X = 0.12;   // bỏ 12% mép trái/phải của webcam (tay sát mép thường mất tracking)
    const HAND_MARGIN_Y = 0.12;   // bỏ 12% mép trên/dưới
    const GRAB_FRAMES   = 2;      // cần 2 frame liên tiếp là "fist" mới gắp
    const DROP_FRAMES   = 3;      // cần 3 frame liên tiếp KHÔNG phải fist mới thả
    const LOST_FRAMES   = 12;     // mất tay quá 12 frame mới hủy thao tác
    const SMOOTH        = 0.35;   // 0..1, càng lớn con trỏ càng bám sát (càng nhạy, càng rung)

    let isGrabbing = false;
    let grabbedPiece = null;
    let isGameWon = false;

    let hasHand = false, justAppeared = true, lostFrames = 0;
    let fistFrames = 0, openFrames = 0;
    let targetX = 0, targetY = 0, curX = 0, curY = 0;
    let grabStartX = 0, grabStartY = 0;
    let rafId = 0;

    // ---- Cache kích thước (KHÔNG gọi getBoundingClientRect mỗi frame nữa) ----
    let L = { bx: 0, by: 0, bw: 1, bh: 1 };
    function measure() {
        const c = boardContainer.getBoundingClientRect();
        const b = board.getBoundingClientRect();
        // cursor nằm trong container (position:absolute) nên tọa độ tính từ mép trong của container
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

    updateProgress();

    // tay (0..1 trong webcam) -> toạ độ trên BẢNG ghép (đã bỏ mép)
    const remap = (v, m) => Math.max(0, Math.min(1, (v - m) / (1 - 2 * m)));

    setOnHandTracking((x, y, gesture) => {
        if (isGameWon) return;

        if (x === null || y === null) {
            lostFrames++;
            if (lostFrames > LOST_FRAMES) {
                hasHand = false;
                justAppeared = true;
                fistFrames = openFrames = 0;
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

        // chống nhiễu cử chỉ: phải ổn định vài frame mới đổi trạng thái
        if (gesture === "fist") { fistFrames++; openFrames = 0; }
        else                    { openFrames++; fistFrames = 0; }

        if (!isGrabbing && fistFrames >= GRAB_FRAMES) grab();
        else if (isGrabbing && openFrames >= DROP_FRAMES) drop();
    });

    // Vòng lặp 60fps: con trỏ + mảnh đang kéo mượt dù tracking chỉ ~15-30fps
    function tick() {
        rafId = requestAnimationFrame(tick);
        if (!hasHand) return;

        curX += (targetX - curX) * SMOOTH;
        curY += (targetY - curY) * SMOOTH;
        cursor.style.transform = `translate3d(${curX}px, ${curY}px, 0)`;

        if (grabbedPiece) {
            grabbedPiece.style.transform =
                `translate3d(${curX - grabStartX}px, ${curY - grabStartY}px, 0) scale(1.04)`;
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
        piece.classList.add("is-grabbed");
        cursor.classList.add("is-grabbing");
    }

    function releasePiece() {
        cursor.classList.remove("is-grabbing");
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
        cursor.classList.remove("is-grabbing");
        from.classList.remove("is-grabbed");
        from.style.transform = "";

        if (target && target !== from) {
            swapPieces(from, target);
            updateProgress();
        }
    }

    function cancelGrab() {
        isGrabbing = false;
        releasePiece();
        grabbedPiece = null;
    }

    // Tính ô theo đúng khung BẢNG (trước đây tính theo cả container nên lệch, nhất là cột trái)
    function getPieceAt(px, py) {
        const col = Math.floor(((px - L.bx) / L.bw) * cols);
        const row = Math.floor(((py - L.by) / L.bh) * rows);
        const safeCol = Math.max(0, Math.min(cols - 1, col));
        const safeRow = Math.max(0, Math.min(rows - 1, row));
        return board.children[safeRow * cols + safeCol];
    }

    // Đổi chỗ bằng cách DI CHUYỂN node SVG (không parse lại HTML + dựng lại filter như innerHTML)
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
            const ok = p.dataset.index === p.dataset.current;
            p.classList.toggle("is-placed", ok);
            if (ok) correctCount++;
        });

        document.getElementById("puzzle-score").textContent = correctCount;
        document.getElementById("puzzle-progress").style.width = `${(correctCount / totalPieces) * 100}%`;

        if (correctCount === totalPieces) {
            isGameWon = true;
            cursor.style.display = "none";
            cancelAnimationFrame(rafId);
            if (helperText) helperText.innerHTML = "🎉 <strong>PERFECT! YOU SOLVED IT!</strong> 🎉";
        }
    }

    function cleanup() {
        cancelAnimationFrame(rafId);
        ro.disconnect();
        setOnHandTracking(null);
        stopPrevGame = null;
    }
    stopPrevGame = cleanup;

    // dùng onclick (gán đè) thay vì addEventListener để không bị chồng handler qua mỗi ván
    document.getElementById("btn-restart-puzzle").onclick = () => {
        cleanup();
        if (snapView) snapView.style.display = "flex";
        if (levelView) levelView.style.display = "none";

        const scanOverlay = document.querySelector("#tab-snap-solve .hl-scan-overlay");
        if (scanOverlay) scanOverlay.style.display = 'flex';
        if (helperText) helperText.textContent = "Use 2 hands to frame your face. Expand to capture.";

        resetAutoScan();
    };
}