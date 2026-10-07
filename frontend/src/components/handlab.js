// frontend/src/components/handlab.js
import {
    startMemeDetector,
    stopMemeDetector,
    captureMemeSnapshot,
    setOnGestureStable,
    resetAutoScan
} from "./memeDetector.js";

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
    if (targetTabId === "meme-search") {
      await startMemeDetector();
      resetAutoScan();
    } else {
      // Rời Meme Search -> tắt camera
      stopMemeDetector();
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

  // Nút CAPTURE VIBE
//   const captureButton =
//       document.querySelector(".hl-rescan-btn");

//   if (captureButton) {
//       captureButton.addEventListener(
//           "click",
//           async () => {
//               await startMemeCaptureFlow();
//           }
//       );
//   }

    // LẮNG NGHE SỰ KIỆN TỰ ĐỘNG CHỤP TỪ MEDIA PIPE
    setOnGestureStable(async () => {
        const memeTab = document.getElementById("tab-meme-search");
        const resultsPanel = document.querySelector(".hl-results-panel");
        const isResultsHidden = window.getComputedStyle(resultsPanel).display === 'none';

        if (memeTab && memeTab.classList.contains("is-active") && isResultsHidden) {
            await startMemeCaptureFlow();
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

  // Nếu Meme Search là tab mặc định
  const memeTab =
    document.getElementById(
      "tab-meme-search"
    );

  if (
    memeTab &&
    memeTab.classList.contains("is-active")
  ) {
    startMemeDetector();
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
 * Gọi Giphy lấy 50 kết quả và tự động tách Động/Tĩnh bằng Frames
 */
async function searchMemes(analysis, userImageFrame) {
  const apiKey = import.meta.env.VITE_GIPHY_API_KEY;
  if (!apiKey) throw new Error("Missing VITE_GIPHY_API_KEY.");

  const query = Array.isArray(analysis.searchQueries) ? analysis.searchQueries[0] : "funny reaction meme";
  const url = new URL("https://api.giphy.com/v1/gifs/search");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "50"); // Lấy hẳn 50 cái để tha hồ bộ lọc lựa chọn
  url.searchParams.set("rating", "pg-13");
  url.searchParams.set("lang", "en");

  const helperText = document.querySelector("#tab-meme-search .hl-helper-text");
  
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GIPHY error: ${response.status}`);
  const data = await response.json();
  let allItems = data.data || [];

  if (allItems.length === 0) {
    renderUnifiedResults([], "#hl-gifs-panel .hl-meme-grid", true);
    renderUnifiedResults([], "#hl-memes-panel .hl-meme-grid", false);
    return;
  }

  if (helperText) helperText.textContent = "AI is sorting GIFs and Memes...";

  // 1. PHÂN LOẠI ẢNH ĐỘNG VÀ ẢNH TĨNH DỰA VÀO SỐ KHUNG HÌNH (FRAMES)
  const animatedGifs = [];
  const staticMemes = [];

  allItems.forEach(item => {
    // Quét số khung hình ở cả 2 định dạng (original và fixed_width) để chống Giphy nói dối
    const framesOriginal = parseInt(item.images?.original?.frames || "0");
    const framesFixedWidth = parseInt(item.images?.fixed_width?.frames || "0");
    const maxFrames = Math.max(framesOriginal, framesFixedWidth);

    if (maxFrames > 1) {
      animatedGifs.push(item);
    } else {
      staticMemes.push(item);
    }
  });

  // 2. Lấy 9 tấm tốt nhất cho mỗi Tab
  let finalGifs = animatedGifs.slice(0, 9);
  let finalMemes = staticMemes.slice(0, 9);

  // Nếu Giphy không có đủ ảnh tĩnh (thiếu dưới 9 cái), ta mượn tạm ảnh động và dán nhãn "cần đóng băng"
  if (finalMemes.length < 9) {
    const needed = 9 - finalMemes.length;
    const fallbacks = animatedGifs.slice(9, 9 + needed);
    fallbacks.forEach(f => f.forceStill = true); // Đánh dấu cờ chống cháy
    finalMemes = [...finalMemes, ...fallbacks];
  }

  finalGifs = finalGifs.map(m => ({ ...m, matchRate: null }));
  finalMemes = finalMemes.map(m => ({ ...m, matchRate: null }));

  // 3. Gửi cả 18 cái lên Gemini để chấm điểm (Ép dùng link tĩnh cho AI đọc nhanh gọn)
  const candidatesForAI = [...finalGifs, ...finalMemes].map(m => ({
    id: m.id,
    url: m.images?.original_still?.url || m.images?.fixed_width_still?.url 
  })).filter(c => c.url);

  try {
    const rerankRes = await fetch("/api/meme/rerank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userImage: userImageFrame, candidates: candidatesForAI })
    });
    
    if (rerankRes.ok) {
      const rerankData = await rerankRes.json();
      const rankedResults = rerankData.rankedResults || [];
      
      const applyMatchRate = (list) => {
        list.forEach(meme => {
          const rankInfo = rankedResults.find(r => r.id === meme.id);
          if (rankInfo) meme.matchRate = rankInfo.matchRate;
        });
        // Sắp xếp lại để đứa nào điểm cao nhất thì lên đầu
        list.sort((a, b) => (b.matchRate || 0) - (a.matchRate || 0));
      };

      applyMatchRate(finalGifs);
      applyMatchRate(finalMemes);
    }
  } catch (err) {
    console.warn("[Meme Rerank] Failed", err);
  }

  // 4. RENDER LÊN 2 TAB RẠCH RÒI
  renderUnifiedResults(finalGifs, "#hl-gifs-panel .hl-meme-grid", true);
  renderUnifiedResults(finalMemes, "#hl-memes-panel .hl-meme-grid", false);
  
  if (helperText) helperText.textContent = "Found your vibe ✨";
}

/**
 * Hàm Render thông minh (Ép buộc tuyệt đối định dạng)
 */
function renderUnifiedResults(items, containerSelector, isAnimatedTab) {
  const grid = document.querySelector(containerSelector);
  if (!grid) return;
  grid.innerHTML = "";
  
  if (!items.length) {
    grid.innerHTML = `<p class="hl-empty-result">No matching memes found.</p>`;
    return;
  }

  items.forEach((item) => {
    let imageUrl = "";
    
    if (isAnimatedTab) {
      // TAB GIF: ÉP LẤY LINK ẢNH ĐỘNG
      imageUrl = item.images?.downsized?.url || item.images?.original?.url;
    } else {
      // TAB MEME: BÀN TAY SẮT - BẤT CHẤP ẢNH GỐC LÀ GÌ, CHỈ LẤY LINK ĐÓNG BĂNG (_still)
      // Điều này ngăn chặn 100% khả năng ảnh bị nhúc nhích trong tab Meme
      imageUrl = item.images?.downsized_still?.url || item.images?.original_still?.url || item.images?.fixed_width_still?.url;
    }
    
    if (!imageUrl) return;

    const card = document.createElement("a");
    card.className = "hl-meme-card";
    card.href = item.url || `https://giphy.com/gifs/${item.id}`;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
    
    const badgeHTML = item.matchRate ? `<div class="hl-match-badge">${item.matchRate}%</div>` : '';
    card.innerHTML = `
      ${badgeHTML}
      <img src="${imageUrl}" alt="GIPHY reaction" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.style.display='none';" />
    `;
    grid.appendChild(card);
  });
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