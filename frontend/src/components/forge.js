// frontend/src/components/forge.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { FBXExporter } from '@comfyorg/fbx-exporter-three';

export function initForge() {
  const forgeModeButtons = document.querySelectorAll(".forge-mode-btn");
  const forgeUploadCards = document.querySelectorAll(".forge-upload-card.optional");
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
  const forgeSubmitBtn = document.querySelector(".forge-submit-btn");
  const forgeOutputStage = document.querySelector(".forge-output-stage");
  const placeholderModel = forgeViewer?.querySelector(".forge-model");

  let currentFileToUpload = null; // Chứa ảnh Nguồn
  let currentPoseFile = null; // Chứa ảnh Dáng (nếu có)
  let currentMode = "single"; // Lưu trạng thái mode hiện tại
  let isActualModelReady = false;
  let currentModel = null;
  let currentRenderer = null;
  let modelControls = null;
  let isAutoRotateEnabled = true;

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
      if (!isActualModelReady && isAutoRotateEnabled && !isDragging) {
        rotationY += 0.08;
        applyPlaceholderTransform(rotationX, rotationY, scaleValue);
      }

      requestAnimationFrame(animatePlaceholder);
    };

    requestAnimationFrame(animatePlaceholder);
    applyPlaceholderTransform(rotationX, rotationY, scaleValue);
  }

  // 1. Xử lý UI Tab Mode
  const setForgeMode = (mode) => {
    currentMode = mode;
    forgeModeButtons.forEach((button) => {
      const isActive = button.dataset.mode === mode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    const isSingleMode = mode === "single";
    forgeUploadCards.forEach((card) => {
      card.classList.toggle("is-disabled", !isSingleMode);
    });
  };

  forgeModeButtons.forEach((button) => {
    button.addEventListener("click", () => setForgeMode(button.dataset.mode));
  });

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
    if (!forgeExportMenuWrap?.contains(event.target)) {
      setExportMenuOpen(false);
    }
    if (!forgeExport2DMenuWrap?.contains(event.target)) {
      setExport2DMenuOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (forgeExportMenu && !forgeExportMenu.hidden) {
        setExportMenuOpen(false);
        forgeExportModelBtn?.focus();
      }
      if (forgeExport2DMenu && !forgeExport2DMenu.hidden) {
        setExport2DMenuOpen(false);
        forgeExport2DBtn?.focus();
      }
    }
  });

  forgeAutoRotateToggle?.addEventListener("click", () => {
    isAutoRotateEnabled = !isAutoRotateEnabled;
    if (modelControls) modelControls.autoRotate = isAutoRotateEnabled;
    forgeAutoRotateToggle.classList.toggle("is-on", isAutoRotateEnabled);
    forgeAutoRotateToggle.setAttribute("aria-checked", String(isAutoRotateEnabled));
    if (forgeAutoRotateState) {
      forgeAutoRotateState.textContent = isAutoRotateEnabled ? "ON" : "OFF";
    }
  });

  // Sửa lại logic chọn ảnh để phân biệt input nào đang được thao tác
  forgeInputFields.forEach((input) => {
    input.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      const card = event.target.closest(".forge-upload-card");
      const preview = card?.querySelector(".forge-preview");
      if (!file || !preview) return;
      
      // Phân loại lưu trữ file
      if (input.dataset.slot === "source") {
        currentFileToUpload = file; 
      } else if (input.dataset.slot === "pose") {
        currentPoseFile = file;
      }

      const reader = new FileReader();
      reader.onload = () => {
        preview.src = reader.result;
        card.classList.add("is-filled");
      };
      reader.readAsDataURL(file);
    });
  });

  forgeSubmitBtn?.addEventListener("click", async () => {
    if (!currentFileToUpload) {
      alert("Vui lòng tải lên ảnh nguồn trước!");
      return;
    }

    try {
      forgeSubmitBtn.disabled = true;
      forgeOutputStage?.classList.add("is-ready");
      forgeSubmitBtn.textContent = "Đang phối hợp AI...";
      currentModel = null;
      currentRenderer = null;
      modelControls = null;

      const formData = new FormData();
      formData.append("mode", currentMode);
      formData.append("source", currentFileToUpload);

      if (currentPoseFile) {
        formData.append("pose", currentPoseFile);
      }

      const taskRes = await fetch("/api/create-task", {
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
          const statusRes = await fetch(`/api/task-status/${taskId}`);
          const statusData = await statusRes.json();

          if (!statusRes.ok || statusData.error) {
            clearInterval(checkInterval);
            throw new Error(statusData.error || "Không lấy được trạng thái task");
          }

          const status = statusData.data.status;
          const progress = statusData.data.progress;

          forgeSubmitBtn.textContent = `Đang tạo hình: ${progress}%`;

          if (status === "success") {
            clearInterval(checkInterval);
            forgeSubmitBtn.textContent = "Hoàn tất!";
            forgeSubmitBtn.disabled = false;

            const outputData = statusData.data.output || {};
            let modelUrl = outputData.model?.url || outputData.model || outputData.pbr || outputData.base_model;

            if (!modelUrl || typeof modelUrl !== 'string') {
              JSON.stringify(outputData, (key, value) => {
                if (typeof value === 'string' && (value.endsWith('.glb') || value.includes('.glb'))) {
                  modelUrl = value;
                }
                return value;
              });
            }

            if (modelUrl) {
              renderThreeJSModel(modelUrl);
            } else {
              alert("Lỗi: Không lấy được file 3D từ hệ thống.");
            }
          } else if (status === "failed" || status === "cancelled") {
            clearInterval(checkInterval);
            throw new Error("Tripo3D xử lý mô hình bị lỗi");
          }
        } catch (error) {
          clearInterval(checkInterval);
          console.error(error);
          alert("Lỗi: " + error.message);
          forgeSubmitBtn.disabled = false;
          forgeSubmitBtn.textContent = "GENERATE 3D";
        }
      }, 3000);
    } catch (error) {
      console.error(error);
      alert("Lỗi: " + error.message);
      forgeSubmitBtn.disabled = false;
      forgeSubmitBtn.textContent = "GENERATE 3D";
    }
  });

  // 4. Môi trường Three.js Render Mô Hình
  function renderThreeJSModel(glbUrl) {
    if (!forgeViewer) return;
    isActualModelReady = true;
    forgeViewer.innerHTML = ''; 
    forgeViewer.style.cursor = 'grab';

    const scene = new THREE.Scene();
    
    const camera = new THREE.PerspectiveCamera(45, forgeViewer.clientWidth / forgeViewer.clientHeight, 0.1, 100);
    camera.position.set(0, 1.5, 4);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    currentRenderer = renderer;
    renderer.setSize(forgeViewer.clientWidth, forgeViewer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    forgeViewer.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);


    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = isAutoRotateEnabled;
    controls.autoRotateSpeed = 2.0;
    modelControls = controls;

    const loader = new GLTFLoader();
    loader.load(
      glbUrl,
      (gltf) => {
        const model = gltf.scene;

        model.traverse((child) => {
          if (child.isMesh) {
            // Tính toán lại bề mặt để xóa các góc cạnh thô ráp
            child.geometry.computeVertexNormals();
            if (child.material) {
              child.material.flatShading = false; // Tắt kiểu render khối vuông
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

        currentModel = model;
        scene.add(previewRoot);
        if (forgeExportStatus) forgeExportStatus.hidden = true;
      },
      undefined,
      (error) => console.error("Lỗi tải GLB:", error)
    );

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    window.addEventListener('resize', () => {
      camera.aspect = forgeViewer.clientWidth / forgeViewer.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(forgeViewer.clientWidth, forgeViewer.clientHeight);
    });
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
      forgeExportStatus.textContent = `Preparing ${format.toUpperCase()} export...`;
      forgeExportStatus.hidden = false;
    }

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
      if (forgeExportStatus) forgeExportStatus.hidden = true;
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