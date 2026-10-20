// frontend/src/components/handlab.js
import { initSnapSolve, startPuzzleCaptureFlow } from "./snapSolve.js";
import {
    startDetector,
    stopDetector,
    captureMemeSnapshot,
    setOnGestureStable,
    setOnHandTracking,
    resetAutoScan
} from "./memeDetector.js";

// =====================================================================
// CẤU HÌNH KẾT QUẢ TÌM KIẾM (GIF / MEME)
// =====================================================================
// Số kết quả MỖI TAB. 45 = 9 hàng x 5 cột, đồng thời chia hết cho 3 nên màn hình điện thoại
// (3 cột) cũng đầy hàng. Muốn 35 (7 hàng) hay 50 (10 hàng) thì chỉ cần đổi số này.
const RESULTS_PER_TAB = 45;
const GIPHY_PAGE_SIZE = 50;        // Giphy trả tối đa 50 kết quả cho mỗi lần gọi => tự gọi thêm trang khi cần
const RERANK_BATCH_SIZE = 20;      // mỗi lần nhờ Gemini chấm điểm tối đa 20 ảnh (chia lô chạy song song)
const SEARCH_QUERY_MAX_LENGTH = 80;

// Mỗi tab có tới ~45 ảnh nên ưu tiên bản ảnh nhỏ (rộng 200px) cho nhẹ và tải nhanh.
// Muốn ảnh nét hơn (nhưng nặng hơn): đổi "fixed_width" thành "downsized" ở đầu mảng.
const GIF_RENDITIONS = ["fixed_width", "downsized", "original"];
const STILL_RENDITIONS = ["fixed_width_still", "downsized_still", "original_still"];

const GIF_GRID = "#hl-gifs-panel .hl-meme-grid";
const MEME_GRID = "#hl-memes-panel .hl-meme-grid";

// Mỗi lần tìm mới (quét bằng tay HOẶC gõ chữ) tăng token lên 1.
// Kết quả của lần tìm cũ về trễ sẽ bị bỏ, và request cũ bị huỷ => không bao giờ ghi đè kết quả mới.
let searchToken = 0;
let searchController = null;

export function initHandLab() {
  const tabButtons =
    document.querySelectorAll(".hl-tab-btn");
  const tabContents =
    document.querySelectorAll(".hl-tab-content");
  const tabsContainer =
    document.querySelector(".hl-tabs");
  if (
    tabButtons.length === 0 ||
    tabContents.length === 0 ||
    !tabsContainer
  ) {
    return;
  }
  const resultTabs =
    document.querySelectorAll(".hl-result-tab");
  const resultTabsContainer =
    document.querySelector(".hl-result-tabs");
  const resultPanels = {
    gifs: document.getElementById("hl-gifs-panel"),
    memes: document.getElementById("hl-memes-panel"),
  };
  resultTabs.forEach((button) => {
    button.addEventListener("click", () => {
      const selectedType = button.dataset.resultTab;
      if (selectedType !== "gifs" && selectedType !== "memes") {
        return;
      }
      resultTabsContainer?.classList.toggle(
        "is-meme-active",
        selectedType === "memes"
      );
      resultTabs.forEach((tab) => {
        const isSelected = tab === button;
        tab.classList.toggle("is-active", isSelected);
        tab.setAttribute("aria-selected", String(isSelected));
      });
      Object.entries(resultPanels).forEach(([type, panel]) => {
        if (panel) {
          panel.hidden = type !== selectedType;
        }
      });
    });
  });
  const switchTab = async (targetTabId) => {
    const targetContent =
      document.getElementById(
        `tab-${targetTabId}`
      );
    const targetIndex =
      Array.from(tabContents).indexOf(
        targetContent
      );
    if (targetIndex === -1) {
      return;
    }
    tabButtons.forEach((button) => {
      button.classList.toggle(
        "is-active",
        button.dataset.tab === targetTabId
      );
    });
    tabsContainer.classList.toggle(
      "is-snap-active",
      targetTabId === "snap-solve"
    );
    tabContents.forEach((content, index) => {
      content.classList.toggle(
        "is-active",
        index === targetIndex
      );
      content.classList.toggle(
        "is-before",
        index < targetIndex
      );
      content.classList.toggle(
        "is-after",
        index > targetIndex
      );
    });
    // Meme Search vừa được mở
    stopDetector(); // Dừng camera cũ
    if (targetTabId === "meme-search") {
      setOnHandTracking(null); // Reset lại cấu hình nhận diện 2 tay
      await startDetector("meme-search");
      resetAutoScan();
    } else if (targetTabId === "snap-solve") {
      await startDetector("snap-solve");
      resetAutoScan();
      initSnapSolve();
    }
  };
  tabButtons.forEach((button) => {
    button.addEventListener("click", async (e) => {
      e.preventDefault();
      const targetTabId =
        button.dataset.tab;
      if (
        button.classList.contains("is-active")
      ) {
        return;
      }
      await switchTab(targetTabId);
    });
  });
    // LẮNG NGHE SỰ KIỆN TỰ ĐỘNG CHỤP TỪ MEDIA PIPE
    setOnGestureStable(async () => {
        const activeTabBtn = document.querySelector(".hl-tab-btn.is-active");
        if (!activeTabBtn) return;
        const activeTab = activeTabBtn.dataset.tab;
        
        if (activeTab === "meme-search") {
            // Thay vì check bảng kết quả, ta check xem Overlay Quét có đang hiển thị không
            const scanOverlay = document.querySelector("#tab-meme-search .hl-scan-overlay");
            if (scanOverlay && window.getComputedStyle(scanOverlay).display !== 'none') {
                await startMemeCaptureFlow();
            }
        } else if (activeTab === "snap-solve") {
            const snapView = document.getElementById("hl-snap-view");
            if (snapView && window.getComputedStyle(snapView).display !== 'none') {
                await startPuzzleCaptureFlow(); 
            }
        }
    });
    // SỬA NÚT RE-SCAN (Bỏ Capture Vibe)
    const rescanButton = document.querySelector(".hl-rescan-btn");
    if (rescanButton) {
        rescanButton.addEventListener("click", async (e) => {
            e.preventDefault();
            const ui = getMemeCaptureUI();
            
            // 1. Dọn dẹp UI: Ẩn panel kết quả, hiện lại overlay quét
            const resultsPanel = document.querySelector(".hl-results-panel");
            if(resultsPanel) resultsPanel.style.display = 'none';
            
            const scanOverlay = document.querySelector(".hl-scan-overlay");
            if(scanOverlay) scanOverlay.style.display = 'flex';
            cancelActiveSearch();
            clearResults(); // xoá cả 2 tab + trạng thái
            if (ui.memeGrid) ui.memeGrid.innerHTML = "";
            if (ui.snapshotImage) {
                //ui.snapshotImage.src = "";
                ui.snapshotImage.classList.remove("is-visible");
            }
            if (ui.helperText) ui.helperText.textContent = "Show a gesture and make a face.";
            // 2. Bật lại Camera
            if (ui.video && ui.video.paused) {
                await ui.video.play();
            }
            // 3. Reset cờ đếm ngược trong MediaPipe
            resetAutoScan(); 
        });
    }
  // Thanh tìm kiếm bằng chữ
  initMemeTextSearch();
  // Nếu Meme Search là tab mặc định
  const memeTab =
    document.getElementById(
      "tab-meme-search"
    );
  if (
    memeTab &&
    memeTab.classList.contains("is-active")
  ) {
    startDetector("meme-search");
    resetAutoScan();
  }
}
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
function getMemeCaptureUI() {
    return {
        video: document.getElementById(
            "hl-webcam-meme"
        ),
        countdown: document.querySelector(
            "#tab-meme-search .hl-countdown-number"
        ),
        scanText: document.querySelector(
            "#tab-meme-search .hl-scan-text"
        ),
        helperText: document.querySelector(
            "#tab-meme-search .hl-helper-text"
        ),
        progressFill: document.querySelector(
            "#tab-meme-search .hl-progress-fill"
        ),
        captureButton: document.querySelector(
            "#tab-meme-search .hl-rescan-btn"
        ),
        memeGrid: document.querySelector(
            "#tab-meme-search .hl-meme-grid"
        ),
        snapshotImage: document.getElementById(
            "hl-meme-snapshot"
        ),
    };
}
async function startMemeCaptureFlow() {
    const ui = getMemeCaptureUI();
    if (!ui.video) {
        return;
    }
    if (!ui.video.srcObject) {
        console.warn(
            "[Meme Search] Camera is not ready."
        );
        return;
    }
    // Không cho bấm nhiều lần trong lúc countdown
    if (ui.captureButton) {
        ui.captureButton.disabled = true;
    }
    // Nếu camera đang freeze từ lần trước,
    // bật camera live trở lại.
    if (ui.video.paused) {
        try {
            await ui.video.play();
        } catch (error) {
            console.error(
                "[Meme Search] Could not resume camera:",
                error
            );
        }
    }
    // Xóa kết quả cũ
    if (ui.memeGrid) {
        ui.memeGrid.innerHTML = "";
    }
    cancelActiveSearch();
    clearResults();
    if (ui.helperText) {
        ui.helperText.textContent =
            "Get ready — hold your pose!";
    }
    // Countdown
    if (ui.countdown) {
        ui.countdown.textContent = "3";
        ui.countdown.classList.add(
            "is-visible"
        );
    }
    await sleep(1000);
    if (ui.countdown) {
        ui.countdown.textContent = "2";
    }
    await sleep(1000);
    if (ui.countdown) {
        ui.countdown.textContent = "1";
    }
    await sleep(1000);
    // ==========================================
    // CAPTURE ĐÚNG KHOẢNH KHẮC NÀY
    // ==========================================
    const snapshot = captureMemeSnapshot();
    if (!snapshot) {
        console.warn(
            "[Meme Search] Cannot capture snapshot."
        );
        if (ui.helperText) {
            ui.helperText.textContent =
                "Couldn't capture the pose. Try again.";
        }
        if (ui.captureButton) {
            ui.captureButton.disabled = false;
        }
        return;
    }
    const {
        frame,
        detection,
    } = snapshot;
    if (ui.snapshotImage) {
      ui.snapshotImage.src = frame;
      ui.snapshotImage.classList.add(
        "is-visible"
      );
    }
ui.video.pause();
    console.log(
        "[Meme Search] Captured snapshot:",
        detection
    );
    // Ẩn số countdown
    if (ui.countdown) {
        ui.countdown.textContent = "";
        ui.countdown.classList.remove(
            "is-visible"
        );
    }
    // ==========================================
    // KIỂM TRA GESTURE
    // ==========================================
    // const hasGesture =
    //     detection.gesture &&
    //     detection.gesture !== "None" &&
    //     detection.gesture !== "unknown";
    // if (!hasGesture) {
    //     if (ui.helperText) {
    //         ui.helperText.textContent =
    //             "I couldn't catch your hand gesture. Try again!";
    //     }
    //     if (ui.captureButton) {
    //         ui.captureButton.disabled = false;
    //     }
    //     return;
    // }
    // ==========================================
    // FREEZE CAMERA
    // ==========================================
    ui.video.pause();
    // ==========================================
    // UI SAU KHI CHỤP
    // ==========================================
    // Ẩn Overlay đang quét đi
    const scanOverlay = document.querySelector(".hl-scan-overlay");
    if(scanOverlay) scanOverlay.style.display = 'none';
    // Hiện bảng kết quả lên (Dù chưa có ảnh, nhưng để lấy header báo "Reading your vibe")
    const resultsPanel = document.querySelector(".hl-results-panel");
    if(resultsPanel) resultsPanel.style.display = 'flex';
    if (ui.helperText) {
        ui.helperText.textContent =
            "Reading your vibe...";
    }
    if (ui.progressFill) {
        ui.progressFill.style.width =
            "100%";
    }
    // ==========================================
    // GỬI ẢNH ĐÃ CHỤP CHO GEMINI
    // ==========================================
    await runMemeSearch(
        frame,
        detection
    );
    // Cho phép TRY AGAIN
    if (ui.captureButton) {
        ui.captureButton.disabled = false;
    }
}
/**
 * Chụp frame + gửi sang backend để
 * Gemini phân tích biểu cảm nâng cao.
 */
async function runMemeSearch(
    frame,
    detection
) {
    if (!frame) {
        console.warn(
            "[Meme Search] No captured frame."
        );
        return;
    }
    if (!detection) {
        console.warn(
            "[Meme Search] No detection data."
        );
        return;
    }
    const helperText = document.querySelector(
        "#tab-meme-search .hl-helper-text"
    );
    if (helperText) {
        helperText.textContent =
            "Reading your expression...";
    }
    try {
        const response = await fetch(
            "/api/meme/analyze",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json",
                },
                body: JSON.stringify({
                    image: frame,
                    gesture:
                        detection.gesture,
                    gestureScore:
                        detection.gestureScore,
                    basicExpression:
                        detection.basicExpression,
                }),
            }
        );
        if (!response.ok) {
            const error =
                await response
                    .json()
                    .catch(() => ({}));
            throw new Error(
                error.error ||
                "Meme analysis failed."
            );
        }
        const data =
            await response.json();
        console.log(
            "[Meme Search] AI result:",
            data
        );
        // Hiển thị chính xác trạng thái
        // mà Gemini vừa phân tích
        const scanText =
            document.querySelector(
                "#tab-meme-search .hl-scan-text"
            );
        if (scanText) {
            scanText.textContent =
                `${data.gesture.toUpperCase()} + ${data.expression.toUpperCase()}`;
        }
        if (helperText) {
            helperText.textContent =
                "Finding memes that match your vibe...";
        }
        // Gọi GIPHY 
        await searchMemes(data, frame);
    } catch (error) {
        console.error(
            "[Meme Search] Search failed:",
            error
        );
        if (helperText) {
            helperText.textContent =
                "Couldn't read that expression. Try again.";
        }
    }
}
/**
 * Quản lý "lượt tìm" hiện tại
 */
function beginSearch() {
  searchController?.abort();
  searchController = new AbortController();
  searchToken += 1;
  return { token: searchToken, signal: searchController.signal };
}

function cancelActiveSearch() {
  searchController?.abort();
  searchController = null;
  searchToken += 1;
}

function isStale(token) {
  return token !== searchToken;
}

function chunk(list, size) {
  const batches = [];
  for (let i = 0; i < list.length; i += size) batches.push(list.slice(i, i + size));
  return batches;
}

function pickRendition(item, names) {
  for (const name of names) {
    const url = item.images?.[name]?.url;
    if (url) return url;
  }
  return "";
}

/**
 * Gọi Giphy lấy đủ ảnh cho cả 2 tab. Mỗi lần gọi tối đa 50 kết quả nên gọi song song nhiều trang
 * (offset 0, 50, ...). Trang đầu lỗi => báo lỗi; các trang sau lỗi (vd. hết quota) => dùng phần đã có.
 */
async function fetchGiphyPool(query, signal) {
  const apiKey = import.meta.env.VITE_GIPHY_API_KEY;
  if (!apiKey) throw new Error("Missing VITE_GIPHY_API_KEY.");

  // Tab Meme chủ yếu là ảnh GIF bị "đóng băng", nên cần ~2 lần số kết quả của một tab
  const pages = Math.ceil((RESULTS_PER_TAB * 2) / GIPHY_PAGE_SIZE);
  const requests = Array.from({ length: pages }, async (_, pageIndex) => {
    const url = new URL("https://api.giphy.com/v1/gifs/search");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(GIPHY_PAGE_SIZE));
    url.searchParams.set("offset", String(pageIndex * GIPHY_PAGE_SIZE));
    url.searchParams.set("rating", "pg-13");
    url.searchParams.set("lang", "en");
    const response = await fetch(url, { signal });
    if (!response.ok) {
      const error = new Error(`GIPHY error: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  });

  const settled = await Promise.allSettled(requests);
  if (settled[0].status === "rejected") throw settled[0].reason;

  // Gộp theo đúng thứ tự trang và loại ảnh trùng giữa các trang
  const seen = new Set();
  const items = [];
  settled.forEach((result) => {
    if (result.status !== "fulfilled") return;
    (result.value?.data || []).forEach((item) => {
      if (!item?.id || seen.has(item.id)) return;
      seen.add(item.id);
      items.push(item);
    });
  });
  return items;
}

/**
 * Phân loại ảnh ĐỘNG / ẢNH TĨNH dựa vào số khung hình (frames)
 */
function classifyGiphyItems(items) {
  const animated = [];
  const still = [];
  items.forEach((item) => {
    // Quét số khung hình ở cả 2 định dạng (original và fixed_width) để chống Giphy nói dối
    const framesOriginal = parseInt(item.images?.original?.frames || "0", 10);
    const framesFixedWidth = parseInt(item.images?.fixed_width?.frames || "0", 10);
    if (Math.max(framesOriginal, framesFixedWidth) > 1) animated.push(item);
    else still.push(item);
  });
  return { animated, still };
}

/**
 * Chọn ảnh cho mỗi tab. Giphy hầu như chỉ trả ảnh động, nên nếu thiếu ảnh tĩnh thì mượn các ảnh động
 * CHƯA dùng ở tab GIF và hiển thị khung hình đóng băng của chúng (không bao giờ trùng với tab GIF).
 */
function pickResultsForTabs(animated, still, perTab = RESULTS_PER_TAB) {
  const gifs = animated.slice(0, perTab);
  let memes = still.slice(0, perTab);
  if (memes.length < perTab) {
    const needed = perTab - memes.length;
    const fallbacks = animated
      .slice(perTab, perTab + needed)
      .map((item) => ({ ...item, forceStill: true }));
    memes = [...memes, ...fallbacks];
  }
  return { gifs, memes };
}

/**
 * Nhờ Gemini chấm điểm độ giống với ảnh của người dùng.
 * Chia thành nhiều lô nhỏ chạy SONG SONG (mỗi lô tối đa 20 ảnh) để vẫn nhanh dù có gần 90 ảnh.
 * Lô nào lỗi thì các ảnh trong lô đó chỉ không có % và nằm sau những ảnh đã chấm.
 */
async function rerankMatchRates(userImage, items, signal) {
  const scores = new Map();
  const candidates = items
    .map((item) => ({
      id: item.id,
      // Ép dùng link tĩnh cho AI đọc nhanh gọn
      url: item.images?.original_still?.url || item.images?.fixed_width_still?.url,
    }))
    .filter((candidate) => candidate.id && candidate.url);
  if (!userImage || candidates.length === 0) return scores;

  const settled = await Promise.allSettled(
    chunk(candidates, RERANK_BATCH_SIZE).map(async (batch) => {
      const response = await fetch("/api/meme/rerank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userImage, candidates: batch }),
        signal,
      });
      if (!response.ok) throw new Error(`Rerank failed (${response.status})`);
      const data = await response.json();
      return Array.isArray(data.rankedResults) ? data.rankedResults : [];
    })
  );

  settled.forEach((result) => {
    if (result.status === "rejected") {
      if (result.reason?.name !== "AbortError") console.warn("[Meme Rerank] Batch failed", result.reason);
      return;
    }
    result.value.forEach((entry) => {
      const rate = Number(entry?.matchRate);
      // Ép id về chuỗi để khớp dù Gemini trả id dạng số
      if (entry?.id != null && Number.isFinite(rate)) scores.set(String(entry.id), Math.round(rate));
    });
  });
  return scores;
}

/**
 * Gắn % giống và xếp lại: điểm cao lên đầu (sort ổn định nên ảnh chưa có điểm giữ nguyên thứ tự Giphy)
 */
function applyMatchRates(list, scores) {
  return list
    .map((item) => ({ ...item, matchRate: scores.get(String(item.id)) ?? null }))
    .sort((a, b) => (b.matchRate || 0) - (a.matchRate || 0));
}

/**
 * TÌM BẰNG ẢNH QUÉT: nhận từ khóa do Gemini phân tích, lấy ảnh từ Giphy rồi chấm điểm độ giống
 */
async function searchMemes(analysis, userImageFrame) {
  const suggested = Array.isArray(analysis.searchQueries) ? analysis.searchQueries[0] : "";
  const query = (typeof suggested === "string" && suggested.trim()) || "funny reaction meme";
  const helperText = document.querySelector("#tab-meme-search .hl-helper-text");

  const { token, signal } = beginSearch();
  setResultsLabel("YOUR VIBE");
  setResultsStatus("");

  try {
    const items = await fetchGiphyPool(query, signal);
    if (isStale(token)) return; // người dùng đã tìm kiểu khác / quét lại

    if (items.length === 0) {
      renderUnifiedResults([], GIF_GRID, true);
      renderUnifiedResults([], MEME_GRID, false);
      if (helperText) helperText.textContent = "No matching memes found. Try again.";
      return;
    }

    if (helperText) helperText.textContent = "AI is sorting GIFs and Memes...";
    const { animated, still } = classifyGiphyItems(items);
    const picked = pickResultsForTabs(animated, still);

    const scores = await rerankMatchRates(userImageFrame, [...picked.gifs, ...picked.memes], signal);
    if (isStale(token)) return;

    renderUnifiedResults(applyMatchRates(picked.gifs, scores), GIF_GRID, true);
    renderUnifiedResults(applyMatchRates(picked.memes, scores), MEME_GRID, false);
    if (helperText) helperText.textContent = "Found your vibe ✨";
  } catch (error) {
    if (error?.name === "AbortError" || isStale(token)) return; // bị huỷ có chủ đích, không phải lỗi
    throw error;
  }
}

/**
 * TÌM BẰNG CHỮ: người dùng gõ từ khóa => đưa thẳng lên Giphy (không cần ảnh, không cần Gemini)
 */
async function runTextSearch(rawQuery) {
  const query = String(rawQuery || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_QUERY_MAX_LENGTH);
  if (!query) return;

  const { token, signal } = beginSearch();

  // Đang dở một lượt quét bằng tay (AI đang chấm điểm) thì lượt đó bị thay thế bởi lượt gõ chữ này,
  // nên đổi dòng hướng dẫn dưới camera để nó không bị kẹt ở "AI is sorting..."
  const helperText = document.querySelector("#tab-meme-search .hl-helper-text");
  if (helperText && /Reading|Finding|AI is sorting/i.test(helperText.textContent)) {
    helperText.textContent = "Showing your text search below.";
  }

  showResultsPanel();
  setResultsLabel("SEARCH");
  setResultsStatus(`Searching “${query}”…`);
  renderSkeletons(GIF_GRID);
  renderSkeletons(MEME_GRID);
  scrollResultsIntoView();

  try {
    const items = await fetchGiphyPool(query, signal);
    if (isStale(token)) return;

    if (items.length === 0) {
      const message = `No results for “${query}”.`;
      renderUnifiedResults([], GIF_GRID, true, message);
      renderUnifiedResults([], MEME_GRID, false, message);
      setResultsStatus(`${message} Try another keyword.`);
      return;
    }

    const { animated, still } = classifyGiphyItems(items);
    const { gifs, memes } = pickResultsForTabs(animated, still);
    renderUnifiedResults(gifs, GIF_GRID, true);
    renderUnifiedResults(memes, MEME_GRID, false);
    setResultsStatus(`${gifs.length} GIFs · ${memes.length} memes for “${query}”`);
  } catch (error) {
    if (error?.name === "AbortError" || isStale(token)) return;
    console.error("[Meme Search] Text search failed:", error);
    const message =
      error?.status === 429
        ? "GIPHY is busy right now. Please try again in a minute."
        : "Couldn't reach GIPHY. Please try again.";
    renderUnifiedResults([], GIF_GRID, true, message);
    renderUnifiedResults([], MEME_GRID, false, message);
    setResultsStatus(message);
  }
}

/**
 * Thanh tìm kiếm bằng chữ (JS tự tạo, đặt ở đầu tab Meme Search nên không cần sửa HTML)
 */
function initMemeTextSearch() {
  const tab = document.getElementById("tab-meme-search");
  if (!tab || document.getElementById("hl-search-form")) return;

  const form = document.createElement("form");
  form.id = "hl-search-form";
  form.className = "hl-search-bar";
  form.setAttribute("role", "search");
  form.noValidate = true;
  form.innerHTML = `
    <div class="hl-search-field">
      <svg class="hl-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <input
        id="hl-search-input"
        class="hl-search-input"
        type="search"
        name="q"
        maxlength="${SEARCH_QUERY_MAX_LENGTH}"
        placeholder="Or type to search GIFs &amp; memes…"
        aria-label="Search GIFs and memes"
        enterkeyhint="search"
        autocomplete="off"
        spellcheck="false"
      />
      <button type="button" class="hl-search-clear" aria-label="Clear search" hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <button type="submit" class="hl-search-submit">SEARCH</button>
  `;
  tab.prepend(form);

  const input = form.querySelector(".hl-search-input");
  const clearButton = form.querySelector(".hl-search-clear");

  const syncClearButton = () => {
    clearButton.hidden = input.value.length === 0;
  };
  input.addEventListener("input", syncClearButton);

  // Đang gõ chữ thì không để phím lọt ra các phím tắt chung của trang (trừ Esc để vẫn đóng được modal)
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") event.stopPropagation();
  });

  clearButton.addEventListener("click", () => {
    input.value = "";
    syncClearButton();
    input.focus();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!input.value.trim()) {
      input.focus();
      return;
    }
    runTextSearch(input.value);
    // Trên điện thoại: ẩn bàn phím để thấy kết quả
    if (window.matchMedia("(max-width: 640px)").matches) input.blur();
  });
}

/**
 * Các hàm giao diện cho khu vực kết quả
 */
function getResultsPanel() {
  return document.querySelector("#tab-meme-search .hl-results-panel");
}

function showResultsPanel() {
  const panel = getResultsPanel();
  if (panel) panel.style.display = "flex";
}

function scrollResultsIntoView() {
  const panel = getResultsPanel();
  if (!panel) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  panel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

// Đổi chữ "YOUR VIBE" / "SEARCH" mà không cần sửa HTML (chữ này là text node nằm sau icon)
function setResultsLabel(text) {
  const label = document.querySelector("#tab-meme-search .hl-section-label");
  if (!label) return;
  const textNode = [...label.childNodes]
    .reverse()
    .find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  if (textNode) textNode.textContent = `\n${text}\n`;
}

function ensureResultsStatus() {
  let status = document.getElementById("hl-results-status");
  if (status) return status;
  const header = document.querySelector("#tab-meme-search .hl-results-header");
  if (!header) return null;
  status = document.createElement("div");
  status.id = "hl-results-status";
  status.className = "hl-results-status";
  status.setAttribute("role", "status"); // đọc to cho trình đọc màn hình
  status.hidden = true;
  header.after(status);
  return status;
}

function setResultsStatus(text) {
  const status = ensureResultsStatus();
  if (!status) return;
  status.textContent = text || "";
  status.hidden = !text;
}

function clearResults() {
  [GIF_GRID, MEME_GRID].forEach((selector) => {
    const grid = document.querySelector(selector);
    if (grid) grid.replaceChildren();
  });
  setResultsStatus("");
  setResultsLabel("YOUR VIBE");
}

// Ô xám nhấp nháy trong lúc chờ kết quả
function renderSkeletons(containerSelector, count = 10) {
  const grid = document.querySelector(containerSelector);
  if (!grid) return;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) {
    const card = document.createElement("div");
    card.className = "hl-meme-card is-skeleton";
    card.setAttribute("aria-hidden", "true");
    fragment.append(card);
  }
  grid.replaceChildren(fragment);
}

/**
 * Hàm Render thông minh (Ép buộc tuyệt đối định dạng)
 */
function renderUnifiedResults(items, containerSelector, isAnimatedTab, emptyMessage = "No matching memes found.") {
  const grid = document.querySelector(containerSelector);
  if (!grid) return;
  grid.replaceChildren();

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "hl-empty-result";
    empty.textContent = emptyMessage;
    grid.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    // TAB GIF: ép lấy link ảnh ĐỘNG. TAB MEME: bất chấp ảnh gốc là gì, chỉ lấy link ĐÓNG BĂNG (_still)
    // để ngăn 100% khả năng ảnh bị nhúc nhích trong tab Meme.
    const imageUrl = pickRendition(item, isAnimatedTab ? GIF_RENDITIONS : STILL_RENDITIONS);
    if (!imageUrl) return;

    const card = document.createElement("a");
    card.className = "hl-meme-card";
    card.href = item.url || `https://giphy.com/gifs/${item.id}`;
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    if (item.matchRate) {
      const badge = document.createElement("div");
      badge.className = "hl-match-badge";
      badge.textContent = `${item.matchRate}%`;
      card.append(badge);
    }

    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = item.title || "GIPHY reaction";
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => { card.style.display = "none"; });
    card.append(image);

    fragment.append(card);
  });
  grid.append(fragment);
}

/**
 * Escape text trước khi đưa vào HTML
 */
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}