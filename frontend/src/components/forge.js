// frontend/src/components/forge.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { FBXExporter } from '@comfyorg/fbx-exporter-three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

export function initForge() {
  const forgeModeButtons = document.querySelectorAll(".forge-mode-btn");
  const forgeSourcePanel = document.getElementById("forge-source-panel");
  const helperText = document.getElementById("forge-helper-text");
  const forgeSelectionPrompt = document.getElementById("forge-selection-prompt");
  const forgeInputFields = document.querySelectorAll(".forge-input");
  const forgeViewer = document.getElementById("forge-viewer");
  const forgeExport2DBtn = document.querySelector(".forge-export-2d-btn");
  const forgeExport2DMenu = document.querySelector(".forge-export-2d-menu");
  const forgeExport2DMenuWrap = document.querySelector(".forge-export-2d-menu-wrap");
  const forgeExport2DOptions = document.querySelectorAll(".forge-export-image-option");
  const forgeExport2DStatus = document.querySelector(".forge-export-2d-status");
  const forgeExportModelBtn = document.querySelector(".forge-export-model-btn");
  const forgeExportMenu = document.querySelector(".forge-export-menu");
  const forgeExportMenuWrap = document.querySelector(".forge-export-menu-wrap");
  const forgeExportOptions = document.querySelectorAll(".forge-export-option");
  const forgeExportStatus = document.querySelector(".forge-export-status");
  const forgeAutoRotateToggle = document.querySelector(".forge-auto-rotate-toggle");
  const forgeAutoRotateState = document.querySelector(".forge-auto-rotate-state");
  const forgeSubmitBtn = document.getElementById("btn-single-gen"); // Nút Generate 3D cũ (Single)
  const forgeParallaxBtn = document.getElementById("btn-parallax"); // Nút Parallax Space mới
  const forgeOutputStage = document.querySelector(".forge-output-stage");
  const sourceRequiredDialog = document.querySelector(".forge-source-required-dialog");
  const placeholderModel = forgeViewer?.querySelector(".forge-model");
  const showSourceRequiredDialog = () => {
    if (!sourceRequiredDialog || sourceRequiredDialog.open) return;
    sourceRequiredDialog.showModal();
  };

  let currentFileToUpload = null; 
  let currentPoseFile = null; 
  let currentMode = "single"; 
  const modeStates = {
    single: {
      sourceFile: null,
      sourcePreviewUrl: null,
      poseFile: null,
      posePreviewUrl: null,
      modelUrl: null,
    },
    multiple: {
      sourceFile: null,
      sourcePreviewUrl: null,
      depthMapUrl: null,
      magicModelUrls: [],
    },
  };
  let previewVersion = 0;
  let isMagicWandExpanded = false;
  const magicWandMaxCredits = 2;
  let magicWandCredits = magicWandMaxCredits;
  let isMagicWandActive = false;
  let isMagicWandPending = false;
  let isGenerationInProgress = false;
  let activeGenerationButton = null;
  let selectedMagicPoint = null;
  let selectedIsolatedImageUrl = null;
  let isActualModelReady = false;
  let currentModel = null;
  let currentRenderer = null;
  let modelControls = null;
  let activeScene = null;
  let activeCamera = null;
  let activeRenderer = null;
  let masterExportGroup = null;
  let animationFrameId = null;
  let resizeHandler = null;
  let isAutoRotateEnabled = true;
  let helperTextTimer;
  let magicPromptTimer;

  // Quản lý các vật thể được tạo bằng Magic Wand
  let magicObjectsGroup = null;
  let selectedMagicObject = null;
  let magicTransformControls = null;
  let magicRaycaster = new THREE.Raycaster();
  let magicPointer = new THREE.Vector2();

  const forgeMagicBtn = document.getElementById("btn-magic");
  const forgeMagicCreationBtn = document.getElementById("btn-magic-creation");
  const forgeMultiActions = document.querySelector(".forge-multi-actions");
  const forgeBody = document.querySelector(".forge-body");
  const forgeMagicCredits = document.querySelector(".forge-magic-credits");
  const forgeMagicCreditsLabel = document.querySelector(".forge-magic-credits-label");
  const forgeMagicCreditsTrack = document.querySelector(".forge-magic-credits-track");
  const forgeMagicCreditsFill = document.querySelector(".forge-magic-credits-fill");
  const sourcePreviewImg = document.querySelector(".forge-upload-card.required .forge-preview");
  const sourceSelectionImg = document.querySelector(".forge-upload-card.required .forge-selection-preview");
  const sourceLabelCard = document.querySelector(".forge-upload-card.required");
  const sourceUploadInput = document.querySelector('.forge-input[data-slot="source"]');
  const poseUploadInput = document.querySelector('.forge-input[data-slot="pose"]');
  const posePreviewImg = poseUploadInput?.closest(".forge-upload-card")?.querySelector(".forge-preview");
  const poseLabelCard = poseUploadInput?.closest(".forge-upload-card");
  const forgeMagicCreationBtnLabel = forgeMagicCreationBtn?.querySelector("span");

  const setGenerationBusy = (isBusy, activeButton = null) => {
    isGenerationInProgress = isBusy;
    activeGenerationButton = isBusy ? activeButton : null;
    [forgeSubmitBtn, forgeParallaxBtn].forEach((button) => {
      if (!button) return;
      button.disabled = isBusy;
      button.classList.toggle("is-processing", isBusy && button === activeButton);
    });
    updateMagicWandState();
  };

  const createProgressEstimator = (button, labelPrefix) => {
    const label = button?.querySelector("span");
    if (!button || !label) return null;

    const startedAt = Date.now();
    let lastProgress = -1;
    const setProgress = (progress) => {
      if (progress === lastProgress) return;
      lastProgress = progress;
      button.style.setProperty("--forge-progress", `${progress}%`);
      label.textContent = `${labelPrefix} ~${progress}%`;
    };
    const updateProgress = () => {
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      const estimatedProgress = Math.min(95, Math.max(1, Math.floor((elapsedSeconds / 70) * 95)));
      setProgress(estimatedProgress);
    };

    updateProgress();
    const timer = window.setInterval(updateProgress, 100);
    return {
      complete() {
        window.clearInterval(timer);
        lastProgress = -1;
        button.style.setProperty("--forge-progress", "100%");
        label.textContent = `${labelPrefix} 100%`;
      },
      reset() {
        window.clearInterval(timer);
        button.style.removeProperty("--forge-progress");
      },
    };
  };

  const updateMagicWandCredits = () => {
    if (forgeMagicCreditsLabel) {
      forgeMagicCreditsLabel.textContent = `${magicWandCredits}/${magicWandMaxCredits} generations left`;
    }
    if (forgeMagicCreditsTrack) {
      forgeMagicCreditsTrack.setAttribute("aria-valuemax", String(magicWandMaxCredits));
      forgeMagicCreditsTrack.setAttribute("aria-valuenow", String(magicWandCredits));
    }
    if (forgeMagicCreditsFill) {
      forgeMagicCreditsFill.style.transform = `scaleX(${magicWandCredits / magicWandMaxCredits})`;
    }
  };

  const applyPlaceholderTransform = (rotationX, rotationY, scaleValue) => {
    if (!placeholderModel) return;
    placeholderModel.style.transform = `rotateX(${rotationX}deg) rotateY(${rotationY}deg) scale(${scaleValue})`;
  };

  if (placeholderModel) {
    let rotationX = 25;
    let rotationY = -20;
    let scaleValue = 1.1;
    let isDragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    const resetPlaceholderPointer = () => {
      isDragging = false;
      forgeViewer.style.cursor = "grab";
    };
    forgeViewer.addEventListener("pointerdown", (event) => {
      if (isActualModelReady) return;
      isDragging = true;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      forgeViewer.style.cursor = "grabbing";
    });
    forgeViewer.addEventListener("pointermove", (event) => {
      if (!isDragging || isActualModelReady) return;
      const deltaX = event.clientX - lastPointerX;
      const deltaY = event.clientY - lastPointerY;
      rotationY += deltaX * 0.35;
      rotationX -= deltaY * 0.25;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      applyPlaceholderTransform(rotationX, rotationY, scaleValue);
    });
    forgeViewer.addEventListener("pointerup", resetPlaceholderPointer);
    forgeViewer.addEventListener("pointerleave", resetPlaceholderPointer);
    forgeViewer.addEventListener("pointercancel", resetPlaceholderPointer);
    forgeViewer.addEventListener(
      "wheel",
      (event) => {
        if (isActualModelReady) return;
        event.preventDefault();
        const delta = event.deltaY * -0.001;
        scaleValue = Math.min(1.8, Math.max(0.7, scaleValue + delta));
        applyPlaceholderTransform(rotationX, rotationY, scaleValue);
      },
      { passive: false }
    );
    const animatePlaceholder = () => {
      if (!isActualModelReady && currentMode === "single" && isAutoRotateEnabled && !isDragging) {
        rotationY += 0.08;
        applyPlaceholderTransform(rotationX, rotationY, scaleValue);
      }
      requestAnimationFrame(animatePlaceholder);
    };
    requestAnimationFrame(animatePlaceholder);
    applyPlaceholderTransform(rotationX, rotationY, scaleValue);
  }

  // 1. Xử lý UI Tab Mode
  const updateForgeHelperText = () => {
    if (!helperText) return;

    const isSingleMode = currentMode === "single";
    const nextText = isSingleMode
      ? "You only need <strong>a pose image</strong> when you want the subject in the source image to switch to a different pose."
      : isMagicWandExpanded
        ? ""
        : "Select <strong>Generate Scene</strong> to turn the entire setting into a 3D model, or choose <strong>Magic Wand</strong> to isolate specific objects!";

    if (helperText.innerHTML === nextText) return;

    helperText.classList.add("is-changing");
    window.clearTimeout(helperTextTimer);
    helperTextTimer = window.setTimeout(() => {
      helperText.innerHTML = nextText;
      requestAnimationFrame(() => helperText.classList.remove("is-changing"));
    }, 180);
  };

  const setUploadPreview = (preview, card, previewUrl) => {
    if (!preview || !card) return;
    if (previewUrl) {
      preview.src = previewUrl;
      card.classList.add("is-filled");
    } else {
      preview.removeAttribute("src");
      card.classList.remove("is-filled");
    }
  };

  const clearModeResult = (mode) => {
    if (mode === "single") {
      modeStates.single.modelUrl = null;
    } else {
      modeStates.multiple.depthMapUrl = null;
      modeStates.multiple.magicModelUrls = [];
    }
  };

  const setForgeMode = (mode) => {
    if (!modeStates[mode]) return;
    const isModeChange = currentMode !== mode;
    if (isModeChange) {
      clearThreeJSPreview();
      isMagicWandActive = false;
      isMagicWandExpanded = false;
      selectedMagicPoint = null;
      selectedIsolatedImageUrl = null;
    }
    currentMode = mode;
    const isSingleMode = mode === "single";
    const modeState = modeStates[mode];
    currentFileToUpload = modeState.sourceFile;
    currentPoseFile = isSingleMode ? modeState.poseFile : null;
    if (sourceUploadInput) sourceUploadInput.value = "";
    if (poseUploadInput) poseUploadInput.value = "";
    setUploadPreview(sourcePreviewImg, sourceLabelCard, modeState.sourcePreviewUrl);
    setUploadPreview(
      posePreviewImg,
      poseLabelCard,
      isSingleMode ? modeStates.single.posePreviewUrl : null
    );
    if (modelControls) modelControls.autoRotate = isSingleMode && isAutoRotateEnabled;
    if (isSingleMode) {
      isMagicWandActive = false;
      isMagicWandExpanded = false;
      selectedMagicPoint = null;
      selectedIsolatedImageUrl = null;
      updateMagicWandState();
    }
    forgeModeButtons.forEach((button) => {
      const isActive = button.dataset.mode === mode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    forgeSourcePanel?.classList.toggle("multiple-mode-active", !isSingleMode);
    const outputPanel = forgeViewer?.closest(".forge-output-panel");
    const autoRotateControl = outputPanel?.querySelector(".forge-auto-rotate-control");
    outputPanel?.classList.toggle("multiple-mode-active", !isSingleMode);
    autoRotateControl?.setAttribute("aria-hidden", String(!isSingleMode));
    autoRotateControl?.toggleAttribute("inert", !isSingleMode);
    if (isModeChange) restoreModePreview(mode);
    updateForgeHelperText();
    updateMagicWandState();
  };

  const updateMagicWandState = () => {
    forgeMultiActions?.classList.toggle("is-magic-layout", isMagicWandExpanded);
    forgeSourcePanel?.classList.toggle("is-magic-prompt-active", isMagicWandExpanded);
    window.clearTimeout(magicPromptTimer);
    magicPromptTimer = window.setTimeout(updateForgeHelperText, 180);
    forgeMagicBtn?.setAttribute("aria-pressed", String(isMagicWandActive));
    if (forgeMagicBtn) forgeMagicBtn.disabled = isMagicWandPending || isGenerationInProgress;
    if (forgeMagicCreationBtn) {
      forgeMagicCreationBtn.disabled =
        !selectedMagicPoint ||
        !selectedIsolatedImageUrl ||
        isMagicWandPending ||
        isGenerationInProgress;
    }
    forgeMagicBtn?.classList.toggle(
      "is-processing",
      isGenerationInProgress && activeGenerationButton === forgeMagicBtn
    );
    forgeMagicCreationBtn?.classList.toggle(
      "is-processing",
      isGenerationInProgress && activeGenerationButton === forgeMagicCreationBtn
    );
    if (sourceSelectionImg) {
      sourceSelectionImg.hidden = !selectedIsolatedImageUrl;
      if (selectedIsolatedImageUrl && sourceSelectionImg.src !== selectedIsolatedImageUrl) {
        sourceSelectionImg.src = selectedIsolatedImageUrl;
      } else if (!selectedIsolatedImageUrl) {
        sourceSelectionImg.removeAttribute("src");
      }
    }
    if (sourceLabelCard) {
      sourceLabelCard.style.cursor = isMagicWandActive ? "crosshair" : "pointer";
    }
    const showCredits = currentMode === "multiple" && isMagicWandExpanded;
    forgeMagicCredits?.setAttribute("aria-hidden", String(!showCredits));
    forgeViewer?.closest(".forge-output-panel")?.classList.toggle("magic-wand-active", showCredits);
    forgeBody?.classList.toggle("magic-wand-active", showCredits);
    updateMagicWandCredits();
  };

  forgeModeButtons.forEach((button) => {
    button.addEventListener("click", () => setForgeMode(button.dataset.mode));
  });

  // Quản lý các menu export và auto rotate (giữ nguyên logic cũ của bạn)
  const setExportMenuOpen = (isOpen) => {
    if (!forgeExportMenu || !forgeExportModelBtn) return;
    forgeExportMenu.hidden = !isOpen;
    forgeExportModelBtn.setAttribute("aria-expanded", String(isOpen));
  };
  forgeExportModelBtn?.addEventListener("click", () => {
    setExportMenuOpen(forgeExportMenu?.hidden ?? false);
  });
  const setExport2DMenuOpen = (isOpen) => {
    if (!forgeExport2DMenu || !forgeExport2DBtn) return;
    forgeExport2DMenu.hidden = !isOpen;
    forgeExport2DBtn.setAttribute("aria-expanded", String(isOpen));
  };
  forgeExport2DBtn?.addEventListener("click", () => {
    setExport2DMenuOpen(forgeExport2DMenu?.hidden ?? false);
  });
  document.addEventListener("click", (event) => {
    if (!forgeExportMenuWrap?.contains(event.target)) setExportMenuOpen(false);
    if (!forgeExport2DMenuWrap?.contains(event.target)) setExport2DMenuOpen(false);
  });

  forgeAutoRotateToggle?.addEventListener("click", () => {
    isAutoRotateEnabled = !isAutoRotateEnabled;
    if (modelControls) {
      modelControls.autoRotate = currentMode === "single" && isAutoRotateEnabled;
    }
    forgeAutoRotateToggle.classList.toggle("is-on", isAutoRotateEnabled);
    forgeAutoRotateToggle.setAttribute("aria-checked", String(isAutoRotateEnabled));
    if (forgeAutoRotateState) {
      forgeAutoRotateState.textContent = isAutoRotateEnabled ? "ON" : "OFF";
    }
  });

  forgeInputFields.forEach((input) => {
    input.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      const card = event.target.closest(".forge-upload-card");
      const preview = card?.querySelector(".forge-preview");
      if (!file || !preview) return;

      const modeState = modeStates[currentMode];
      if (input.dataset.slot === "source") {
        if (modeState.sourcePreviewUrl) URL.revokeObjectURL(modeState.sourcePreviewUrl);
        modeState.sourceFile = file;
        modeState.sourcePreviewUrl = URL.createObjectURL(file);
        currentFileToUpload = file;
        clearModeResult(currentMode);
        clearThreeJSPreview();
        selectedMagicPoint = null;
        selectedIsolatedImageUrl = null;
        isMagicWandActive = false;
        updateMagicWandState();
      } else if (input.dataset.slot === "pose") {
        const singleState = modeStates.single;
        if (singleState.posePreviewUrl) URL.revokeObjectURL(singleState.posePreviewUrl);
        singleState.poseFile = file;
        singleState.posePreviewUrl = URL.createObjectURL(file);
        currentPoseFile = file;
      }
      setUploadPreview(preview, card, input.dataset.slot === "pose"
        ? modeStates.single.posePreviewUrl
        : modeState.sourcePreviewUrl);
    });
  });

  forgeMagicBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (isMagicWandPending || isGenerationInProgress) return;
    if (!currentFileToUpload) {
      showSourceRequiredDialog();
      return;
    }
    if (magicWandCredits <= 0) {
      alert("Bạn đã hết năng lượng Magic Wand! Vui lòng nâng cấp Pro.");
      return;
    }

    if (isMagicWandActive) {
      isMagicWandActive = false;
      isMagicWandExpanded = false;
      selectedMagicPoint = null;
      selectedIsolatedImageUrl = null;
    } else {
      isMagicWandActive = true;
      isMagicWandExpanded = true;
      selectedMagicPoint = null;
      selectedIsolatedImageUrl = null;
    }
    updateMagicWandState();
  });

  sourcePreviewImg?.addEventListener("click", (event) => {
    if (!isMagicWandActive || isMagicWandPending || magicWandCredits <= 0 || !currentFileToUpload) return;
    
    event.preventDefault();
    event.stopPropagation();

    // 1. Kích thước thật của bức ảnh gốc (ví dụ: 1536x1024)
    const imgNaturalWidth = sourcePreviewImg.naturalWidth;
    const imgNaturalHeight = sourcePreviewImg.naturalHeight;

    if (!imgNaturalWidth || !imgNaturalHeight) return;

    // 2. Kích thước của THẺ IMG trên trình duyệt (đã bị ép bởi CSS)
    const rect = sourcePreviewImg.getBoundingClientRect();
    
    // Lưu ý: rect.width và rect.height lúc này là kích thước của thẻ IMG,
    // chứ KHÔNG phải phần diện tích hình ảnh đang hiển thị bên trong.
    const cssWidth = rect.width;
    const cssHeight = rect.height;

    // Match the browser's object-fit sizing so Magic Wand coordinates remain accurate.
    const scaleX = cssWidth / imgNaturalWidth;
    const scaleY = cssHeight / imgNaturalHeight;
    const objectFit = window.getComputedStyle(sourcePreviewImg).objectFit;
    const actualScale = objectFit === "cover"
      ? Math.max(scaleX, scaleY)
      : Math.min(scaleX, scaleY);

    // 4. Tính toán kích thước thật sự mà "điểm ảnh" chiếm dụng trên màn hình
    const renderedWidth = imgNaturalWidth * actualScale;
    const renderedHeight = imgNaturalHeight * actualScale;

    // 5. Tính khoảng viền trống (letterbox) do phần ảnh bị thu nhỏ tạo ra bên trong thẻ img
    const offsetX = (cssWidth - renderedWidth) / 2;
    const offsetY = (cssHeight - renderedHeight) / 2;

    // 6. Tính tọa độ chuột TƯƠNG ĐỐI so với góc trên cùng bên trái của thẻ img
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // 7. Khử khoảng trống letterbox để lấy tọa độ click trên "vùng ảnh hiển thị"
    const imageClickX = clickX - offsetX;
    const imageClickY = clickY - offsetY;

    // Nếu click rơi vào vùng viền trống (letterbox), hủy bỏ
    if (imageClickX < 0 || imageClickX > renderedWidth || imageClickY < 0 || imageClickY > renderedHeight) {
        console.warn("[Magic Wand] Click ra vùng letterbox (khoảng viền trống).");
        return;
    }

    // 8. Chuyển đổi ngược lại sang hệ tọa độ của ảnh gốc
    const finalX = Math.floor(imageClickX / actualScale);
    const finalY = Math.floor(imageClickY / actualScale);

    console.log(`[Frontend] Mapped Exact Coordinate: X=${finalX}, Y=${finalY} on Original Image`);

    selectedMagicPoint = { x: finalX, y: finalY };
    isMagicWandActive = false;
    isMagicWandPending = true;
    setGenerationBusy(true, forgeMagicBtn);
    
    // Gửi tọa độ chuẩn xác lên SAM 3
    handleMagicWandSelection(finalX, finalY);
  });

  const handleMagicWandSelection = async (x, y) => {
    const sourceFile = currentFileToUpload;
    try {
      const formData = new FormData();
      formData.append("source", sourceFile);
      formData.append("point_x", String(x));
      formData.append("point_y", String(y));
      formData.append("selection_prompt", forgeSelectionPrompt?.value.trim() ?? "");

      const response = await fetch("http://localhost:3000/api/magic-wand", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok || result.error || result.code !== 0) {
        throw new Error(result.error || "SAM 3 không tách được vật thể");
      }

      if (currentMode !== "multiple" || modeStates.multiple.sourceFile !== sourceFile) return;
      selectedIsolatedImageUrl = result.data?.image_url;
      if (!selectedIsolatedImageUrl) throw new Error("SAM 3 không trả về ảnh vật thể");
      console.log("[Magic Wand] SAM 3 selection ready", { x, y, image: selectedIsolatedImageUrl });
    } catch (error) {
      selectedMagicPoint = null;
      selectedIsolatedImageUrl = null;
      alert(`Lỗi chọn vật bằng SAM 3: ${error.message}`);
    } finally {
      isMagicWandPending = false;
      setGenerationBusy(false);
    }
  };

  const handleMagicWandGeneration = async (x, y) => {
    let progressEstimator = null;
    const generationMode = currentMode;
    const sourceFile = modeStates.multiple.sourceFile;
    const finishMagicWand = (label = "Magic Wand") => {
      progressEstimator?.reset();
      isMagicWandPending = false;
      setGenerationBusy(false);
      if (forgeMagicCreationBtnLabel) forgeMagicCreationBtnLabel.textContent = "3D Creation";
    };

    try {
      progressEstimator = createProgressEstimator(forgeMagicCreationBtn, "Generating 3D");
      const taskRes = await fetch("http://localhost:3000/api/magic-wand/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: selectedIsolatedImageUrl }),
      });
      const taskData = await taskRes.json();
      if (!taskRes.ok || taskData.error || taskData.code !== 0) {
        throw new Error(taskData.error || "Tạo task Magic Wand thất bại");
      }

      const taskId = taskData.data?.task_id;
      if (!taskId) throw new Error("Server không trả về task ID");

      let isCheckingStatus = false;
      const checkInterval = window.setInterval(async () => {
        if (isCheckingStatus) return;
        isCheckingStatus = true;
        try {
          const statusRes = await fetch(`http://localhost:3000/api/task-status/${taskId}?mode=single`);
          const statusData = await statusRes.json();
          if (!statusRes.ok || statusData.error) {
            throw new Error(statusData.error || "Không lấy được trạng thái task");
          }

          const taskStatus = statusData.data?.status;

          if (taskStatus === "success") {
            window.clearInterval(checkInterval);
            progressEstimator?.complete();
            const modelUrl = statusData.data?.output?.model;
            if (!modelUrl) throw new Error("Không lấy được file 3D");
            if (modeStates.multiple.sourceFile !== sourceFile) {
              window.clearInterval(checkInterval);
              window.setTimeout(finishMagicWand, 700);
              return;
            }
            modeStates.multiple.magicModelUrls.push(modelUrl);
            if (currentMode === generationMode) {
              renderThreeJSModel(modelUrl, "single", true);
            }
            selectedMagicPoint = null;
            selectedIsolatedImageUrl = null;
            window.setTimeout(finishMagicWand, 700);
          } else if (taskStatus === "failed" || taskStatus === "cancelled") {
            throw new Error("AI xử lý thất bại");
          }
        } catch (error) {
          window.clearInterval(checkInterval);
          alert(error.message);
          finishMagicWand();
        } finally {
          isCheckingStatus = false;
        }
      }, 3000);
    } catch (error) {
      alert("Lỗi Magic Wand: " + error.message);
      finishMagicWand();
    }
  };

  forgeMagicCreationBtn?.addEventListener("click", () => {
    if (!selectedMagicPoint || !selectedIsolatedImageUrl || isMagicWandPending || isGenerationInProgress) return;
    if (magicWandCredits <= 0) {
      alert("You have run out of Magic Wand energy! Please upgrade to Pro.");
      return;
    }

    magicWandCredits--;
    updateMagicWandCredits();
    isMagicWandPending = true;
    setGenerationBusy(true, forgeMagicCreationBtn);
    if (forgeMagicCreationBtnLabel) forgeMagicCreationBtnLabel.textContent = "Generating 3D...";
    handleMagicWandGeneration(selectedMagicPoint.x, selectedMagicPoint.y);
  });

  // --- HÀM CHUNG XỬ LÝ GỬI REQUEST LÊN SERVER (Dùng chung cho cả Single và Parallax) ---
  const handleGeneration = async (activeButton, endpointMode) => {
    if (!currentFileToUpload) {
      showSourceRequiredDialog();
      return;
    }
    if (isGenerationInProgress || isMagicWandPending) return;
    let progressEstimator = null;
    const defaultLabel = endpointMode === "single" ? "Generate 3D" : "Generate Scene";
    const buttonLabel = activeButton.querySelector("span");
    const sourceFile = currentFileToUpload;
    const poseFile = endpointMode === "single" ? currentPoseFile : null;
    try {
      setGenerationBusy(true, activeButton);
      forgeOutputStage?.classList.add("is-ready");
      progressEstimator = createProgressEstimator(activeButton, "Generating 3D");

      const formData = new FormData();
      formData.append("mode", endpointMode);
      formData.append("source", sourceFile);
      if (poseFile) {
        formData.append("pose", poseFile);
      }

      const taskRes = await fetch("http://localhost:3000/api/create-task", {
        method: "POST",
        body: formData
      });
      const taskData = await taskRes.json();
      if (!taskRes.ok || taskData.error || taskData.code !== 0) {
        throw new Error(taskData.error || "Tạo task thất bại từ server");
      }

      const taskId = taskData.data.task_id;
      const checkInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`http://localhost:3000/api/task-status/${taskId}?mode=${endpointMode}`);
          const statusData = await statusRes.json();
          if (!statusRes.ok || statusData.error) {
            clearInterval(checkInterval);
            throw new Error(statusData.error || "Không lấy được trạng thái task");
          }

          const status = statusData.data.status;

          if (status === "success") {
            clearInterval(checkInterval);
            progressEstimator?.complete();
            
            const outputData = statusData.data.output || {};
            // Bây giờ cả 2 mode đều trả về file .glb trong biến "model"
            let modelUrl = outputData.model; 
            
            if (!modelUrl) {
                alert("Lỗi: Không lấy được file 3D.");
            } else if (endpointMode === "single") {
                if (modeStates.single.sourceFile === sourceFile && modeStates.single.poseFile === poseFile) {
                    modeStates.single.modelUrl = modelUrl;
                    if (currentMode === endpointMode) {
                      clearThreeJSPreview();
                      forgeOutputStage?.classList.add("is-ready");
                      renderThreeJSModel(modelUrl, "single");
                    }
                }
            } else {
                // Chế độ multiple giờ cũng tải mô hình 3D thay vì Point Cloud
                if (modeStates.multiple.sourceFile === sourceFile) {
                    modeStates.multiple.depthMapUrl = modelUrl; // Tạm dùng biến cũ lưu URL model cho nhanh
                    modeStates.multiple.magicModelUrls = [];
                    if (currentMode === endpointMode) {
                      clearThreeJSPreview();
                      forgeOutputStage?.classList.add("is-ready");
                      renderThreeJSModel(modelUrl, "multiple"); 
                    }
                }
            }
            
            window.setTimeout(() => {
              progressEstimator?.reset();
              setGenerationBusy(false);
              if (buttonLabel) buttonLabel.textContent = defaultLabel;
            }, 700);
          } else if (status === "failed" || status === "cancelled") {
            clearInterval(checkInterval);
            throw new Error("AI xử lý thất bại");
          }
        } catch (error) {
          clearInterval(checkInterval);
          console.error(error);
          alert("Lỗi: " + error.message);
          progressEstimator?.reset();
          setGenerationBusy(false);
          if (buttonLabel) buttonLabel.textContent = defaultLabel;
        }
      }, 3000);
    } catch (error) {
      console.error(error);
      alert("Lỗi: " + error.message);
      progressEstimator?.reset();
      setGenerationBusy(false);
      if (buttonLabel) buttonLabel.textContent = defaultLabel;
    }
  };

  // Gắn sự kiện cho nút Single Mode
  forgeSubmitBtn?.addEventListener("click", () => handleGeneration(forgeSubmitBtn, "single"));
  
  // Gắn sự kiện cho nút Parallax Space (Multiple Mode)
  forgeParallaxBtn?.addEventListener("click", () => handleGeneration(forgeParallaxBtn, "multiple"));

  // Thêm thao tác click chọn model trong preview
  function selectMagicObjectFromPointer(event) {
    if (
      !activeRenderer ||
      !activeCamera ||
      !magicObjectsGroup ||
      !magicTransformControls
    ) {
      return;
    }

    const canvas = activeRenderer.domElement;
    const rect = canvas.getBoundingClientRect();

    magicPointer.x =
      ((event.clientX - rect.left) / rect.width) * 2 - 1;

    magicPointer.y =
      -((event.clientY - rect.top) / rect.height) * 2 + 1;

    magicRaycaster.setFromCamera(magicPointer, activeCamera);

    const hits = magicRaycaster.intersectObjects(
      magicObjectsGroup.children,
      true
    );

    if (hits.length === 0) {
      selectedMagicObject = null;
      magicTransformControls.detach();
      return;
    }

    // Đi ngược từ mesh được click về root của vật thể
    let root = hits[0].object;

    while (
      root.parent &&
      root.parent !== magicObjectsGroup
    ) {
      root = root.parent;
    }

    if (root.parent !== magicObjectsGroup) return;

    selectedMagicObject = root;
    magicTransformControls.attach(selectedMagicObject);
    magicTransformControls.setMode("translate");
  }
  // Thêm code phím tắt
  function handleMagicTransformShortcut(event) {
    if (event.repeat) return;
    // Không xử lý phím khi đang nhập liệu
    const target = event.target;

    if (
      target instanceof HTMLElement &&
      (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      )
    ) {
      return;
    }

    // Không xử lý khi đang giữ Ctrl, Alt hoặc Meta
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    // Chỉ hoạt động khi đã chọn vật thể Magic Wand
    if (!selectedMagicObject || !magicTransformControls) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case "w":
        magicTransformControls.setMode("translate");
        break;

      case "e":
        magicTransformControls.setMode("rotate");
        break;

      case "r":
        magicTransformControls.setMode("scale");
        break;

      default:
        return;
    }

    event.preventDefault();
  }
  
  window.addEventListener(
    "keydown",
    handleMagicTransformShortcut
  );

  const disposeSceneResources = (root) => {
    root?.traverse((object) => {
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (!material) return;
        Object.values(material).forEach((value) => {
          if (value?.isTexture) value.dispose();
        });
        material.dispose();
      });
    });
  };

  function clearThreeJSPreview() {
    previewVersion++;
    if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId);
    if (resizeHandler) window.removeEventListener("resize", resizeHandler);
    modelControls?.dispose();
    magicTransformControls?.detach();
    magicTransformControls?.dispose();
    disposeSceneResources(activeScene);
    activeRenderer?.dispose();

    animationFrameId = null;
    resizeHandler = null;
    currentModel = null;
    currentRenderer = null;
    modelControls = null;
    activeScene = null;
    activeCamera = null;
    activeRenderer = null;
    magicObjectsGroup = null;
    magicTransformControls = null;
    masterExportGroup = null;
    selectedMagicObject = null;
    isActualModelReady = false;

    if (forgeViewer && placeholderModel) {
      forgeViewer.replaceChildren(placeholderModel);
      forgeViewer.style.cursor = "grab";
    }
    forgeOutputStage?.classList.remove("is-ready");
    if (forgeExportStatus) forgeExportStatus.hidden = true;
    if (forgeExport2DStatus) forgeExport2DStatus.hidden = true;
  }

  function restoreModePreview(mode) {
    const renderVersion = previewVersion;
    if (mode === "single") {
      const modelUrl = modeStates.single.modelUrl;
      if (!modelUrl) return;
      forgeOutputStage?.classList.add("is-ready");
      renderThreeJSModel(modelUrl, "single", false, renderVersion);
      return;
    }

    const { depthMapUrl, magicModelUrls } = modeStates.multiple;
    if (!depthMapUrl && magicModelUrls.length === 0) return;
    forgeOutputStage?.classList.add("is-ready");
    if (depthMapUrl) {
      renderThreeJSModel(depthMapUrl, "multiple", false, renderVersion);
      magicModelUrls.forEach((modelUrl) => {
        renderThreeJSModel(modelUrl, "single", true, renderVersion);
      });
      return;
    }
    magicModelUrls.forEach((modelUrl) => {
      renderThreeJSModel(modelUrl, "single", true, renderVersion);
    });
  }

  // --- MÔI TRƯỜNG THREE.JS (Hỗ trợ cả GLB Model và 2.5D Parallax Depth-to-Mesh) ---
  function renderThreeJSModel(assetUrl, mode, isAddingToScene = false, renderVersion = previewVersion) {
    if (!forgeViewer || renderVersion !== previewVersion) return;
    isActualModelReady = true;
    forgeViewer.style.cursor = 'grab';
    const shouldCreateScene = !isAddingToScene || !activeScene || !activeCamera || !activeRenderer;

    if (shouldCreateScene) {
      if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId);
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      modelControls?.dispose();

      magicTransformControls?.detach();
      magicTransformControls?.dispose();
      magicTransformControls = null;
      selectedMagicObject = null;
      magicObjectsGroup = null;

      activeRenderer?.dispose();
      forgeViewer.innerHTML = "";
      activeScene = new THREE.Scene();

      // TẠO NHÓM TỔNG CHỨA MỌI VẬT THỂ
      masterExportGroup = new THREE.Group();
      masterExportGroup.name = "MasterExportGroup";
      activeScene.add(masterExportGroup);
      
      // Chốt cứng currentModel luôn là nhóm tổng này
      currentModel = masterExportGroup; 

      activeCamera = new THREE.PerspectiveCamera(45, forgeViewer.clientWidth / forgeViewer.clientHeight, 0.1, 100);
      magicObjectsGroup = new THREE.Group();
      magicObjectsGroup.name = "MagicWandObjects";
      activeScene.add(magicObjectsGroup);
      activeCamera.position.set(0, 0, 4);
      activeRenderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      });
      currentRenderer = activeRenderer;
      activeRenderer.setSize(forgeViewer.clientWidth, forgeViewer.clientHeight);
      activeRenderer.setPixelRatio(window.devicePixelRatio);
      activeRenderer.outputColorSpace = THREE.SRGBColorSpace;
      forgeViewer.appendChild(activeRenderer.domElement);

      activeRenderer.domElement.addEventListener(
        "pointerdown",
        selectMagicObjectFromPointer
      );

      activeScene.add(new THREE.AmbientLight(0xffffff, 2.0));
      const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
      dirLight.position.set(5, 5, 5);
      activeScene.add(dirLight);

      const controls = new OrbitControls(activeCamera, activeRenderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.autoRotate = currentMode === "single" && isAutoRotateEnabled;
      controls.autoRotateSpeed = 1.5;

      if (forgeExportStatus) {
        forgeExportStatus.textContent = "Loading 3D Model...";
        forgeExportStatus.hidden = false;
    }
    
    const loader = new GLTFLoader();
    loader.load(
        assetUrl,
        (gltf) => {
            if (renderVersion !== previewVersion) {
              disposeSceneResources(gltf.scene);
              return;
            }
            const model = gltf.scene;
            model.traverse((child) => {
              if (child.isMesh) {
                child.geometry.computeVertexNormals();
                if (child.material) {
                  child.material.flatShading = false;
                  child.material.needsUpdate = true;
                }
              }
            });
            
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            
            const maxAxis = Math.max(size.x, size.y, size.z);
            const previewScale = 2.0 / maxAxis;
            const previewRoot = new THREE.Group();
            previewRoot.scale.setScalar(previewScale);
            previewRoot.position.copy(center).multiplyScalar(-previewScale);
            previewRoot.add(model);
            
            if (isAddingToScene) {
              if (!magicObjectsGroup) {
                magicObjectsGroup = new THREE.Group();
                magicObjectsGroup.name = "MagicWandObjects";
                masterExportGroup.add(magicObjectsGroup);
                //activeScene.add(magicObjectsGroup);
              }
              const objectIndex = magicObjectsGroup.children.length;
              const spacing = 2.2;
              previewRoot.position.x += objectIndex * spacing;
              magicObjectsGroup.add(previewRoot);
              //currentModel = magicObjectsGroup;
            } else {
              masterExportGroup.add(previewRoot);
              //currentModel = previewRoot;
              //activeScene.add(previewRoot);
            }
            if (forgeExportStatus) forgeExportStatus.hidden = true;
        },
        undefined,
        (error) => console.error("Lỗi tải GLB:", error)
    );
      modelControls = controls;

      // Magic Wand: cho phép chọn và biến đổi từng vật thể
      if (!magicTransformControls) {
        magicTransformControls = new TransformControls(
          activeCamera,
          activeRenderer.domElement
        );

        activeScene.add(magicTransformControls.getHelper());

        magicTransformControls.addEventListener(
          "dragging-changed",
          (event) => {
            if (modelControls) {
              modelControls.enabled = !event.value;
            }
          }
        );
      }

      const animate = () => {
        animationFrameId = window.requestAnimationFrame(animate);
        if (modelControls) modelControls.update();
        if (activeRenderer && activeScene && activeCamera) {
          activeRenderer.render(activeScene, activeCamera);
        }
      };
      animate();

      resizeHandler = () => {
        if (!activeCamera || !activeRenderer) return;
        activeCamera.aspect = forgeViewer.clientWidth / forgeViewer.clientHeight;
        activeCamera.updateProjectionMatrix();
        activeRenderer.setSize(forgeViewer.clientWidth, forgeViewer.clientHeight);
      };
      window.addEventListener("resize", resizeHandler);
    }
  }

  const canvasToBlob = (canvas) =>
    new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not capture the current 3D view."));
      }, "image/png");
    });

  const downloadExport = (data, format, mimeType, filename = `3d-forge-model.${format}`) => {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportModel = async (format) => {
    forgeExportOptions.forEach((option) => {
      const isSelected = option.dataset.format === format;
      option.classList.toggle("is-selected", isSelected);
      option.setAttribute("aria-pressed", String(isSelected));
    });

    if (!currentModel) {
      if (forgeExportStatus) {
        forgeExportStatus.textContent = "Generate a 3D model first to export.";
        forgeExportStatus.hidden = false;
      }
      return;
    }

    forgeExportOptions.forEach((option) => { option.disabled = true; });
    if (forgeExportStatus) {
      forgeExportStatus.textContent = currentMode === "multiple" 
          ? `Your 3D model ${format.toUpperCase()} (might take a few seconds)...`
          : `Preparing ${format.toUpperCase()} export...`;
      forgeExportStatus.hidden = false;
    }

    if (magicTransformControls) {
        magicTransformControls.detach();
    }
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      let data;
      let mimeType;

      if (format === "glb") {
        data = await new Promise((resolve, reject) => {
          new GLTFExporter().parse(currentModel, resolve, reject, { binary: true });
        });
        mimeType = "model/gltf-binary";
      } else if (format === "fbx") {
        data = await new FBXExporter().parseAsync(currentModel);
        mimeType = "application/octet-stream";
      } else if (format === "obj") {
        data = new OBJExporter().parse(currentModel);
        mimeType = "text/plain";
      } else if (format === "stl") {
        data = new STLExporter().parse(currentModel, { binary: true });
        mimeType = "model/stl";
      } else {
        throw new Error("Unsupported export format.");
      }

      downloadExport(data, format, mimeType);
      if (forgeExportStatus) {
          forgeExportStatus.textContent = "Export successful!";
          // Ẩn thông báo thành công sau 3 giây
          setTimeout(() => { forgeExportStatus.hidden = true; }, 3000);
      }
      setExportMenuOpen(false);
    } catch (error) {
      console.error("3D model export failed:", error);
      if (forgeExportStatus) {
        forgeExportStatus.textContent = `Could not export ${format.toUpperCase()}. Try GLB instead.`;
        forgeExportStatus.hidden = false;
      }
    } finally {
      forgeExportOptions.forEach((option) => { option.disabled = false; });
    }
  };

  forgeExportOptions.forEach((option) => {
    option.addEventListener("click", () => exportModel(option.dataset.format));
  });

  const export2D = async (mode) => {
    forgeExport2DOptions.forEach((option) => {
      const isSelected = option.dataset.exportMode === mode;
      option.classList.toggle("is-selected", isSelected);
      option.setAttribute("aria-pressed", String(isSelected));
    });

    if (!currentRenderer || !currentModel) {
      if (forgeExport2DStatus) {
        forgeExport2DStatus.textContent = "Generate a 3D model first to export this view.";
        forgeExport2DStatus.hidden = false;
      }
      return;
    }

    if (mode === "ai" && !currentFileToUpload) {
      if (forgeExport2DStatus) {
        forgeExport2DStatus.textContent = "Upload the source image again to use AI style reconstruction.";
        forgeExport2DStatus.hidden = false;
      }
      return;
    }

    forgeExport2DOptions.forEach((option) => { option.disabled = true; });
    if (forgeExport2DStatus) {
      forgeExport2DStatus.textContent = mode === "ai"
        ? "Reconstructing the image with AI..."
        : "Capturing the current 3D view...";
      forgeExport2DStatus.hidden = false;
    }

    try {
      const renderBlob = await canvasToBlob(currentRenderer.domElement);

      if (mode === "direct") {
        downloadExport(renderBlob, "png", "image/png", "3d-forge-render.png");
      } else {
        const formData = new FormData();
        formData.append("source", currentFileToUpload, currentFileToUpload.name || "source-image");
        formData.append("render", renderBlob, "3d-forge-current-view.png");

        const response = await fetch("/api/export-2d/reconstruct", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "AI image reconstruction failed.");
        }

        const imageBlob = await response.blob();
        downloadExport(imageBlob, "jpg", "image/jpeg", "3d-forge-style-reconstruction.jpg");
      }

      if (forgeExport2DStatus) forgeExport2DStatus.hidden = true;
      setExport2DMenuOpen(false);
    } catch (error) {
      console.error("2D export failed:", error);
      if (forgeExport2DStatus) {
        forgeExport2DStatus.textContent = error.message || "Could not export this 2D image.";
        forgeExport2DStatus.hidden = false;
      }
    } finally {
      forgeExport2DOptions.forEach((option) => { option.disabled = false; });
    }
  };

  forgeExport2DOptions.forEach((option) => {
    option.addEventListener("click", () => export2D(option.dataset.exportMode));
  });

  // Khởi chạy trạng thái mặc định
  setForgeMode("single");
}