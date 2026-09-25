// frontend/src/components/forge.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function initForge() {
  const forgeModeButtons = document.querySelectorAll(".forge-mode-btn");
  const forgeUploadCards = document.querySelectorAll(".forge-upload-card.optional");
  const forgeInputFields = document.querySelectorAll(".forge-input");
  const forgeViewer = document.getElementById("forge-viewer");
  const forgeExportBtn = document.querySelector(".forge-export-btn");
  const forgeSubmitBtn = document.querySelector(".forge-submit-btn");
  const forgeOutputStage = document.querySelector(".forge-output-stage");
  const placeholderModel = forgeViewer?.querySelector(".forge-model");

  let currentFileToUpload = null; // Chứa ảnh Nguồn
  let currentPoseFile = null; // Chứa ảnh Dáng (nếu có)
  let currentMode = "single"; // Lưu trạng thái mode hiện tại
  let isActualModelReady = false;

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
      if (!isActualModelReady && !isDragging) {
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
            let modelUrl = outputData.model || outputData.pbr || outputData.base_model;

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

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(forgeViewer.clientWidth, forgeViewer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    forgeViewer.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true; 
    controls.autoRotateSpeed = 2.0;

    const loader = new GLTFLoader();
    loader.load(
      glbUrl,
      (gltf) => {
        const model = gltf.scene;
        
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        const maxAxis = Math.max(size.x, size.y, size.z);
        model.scale.multiplyScalar(2.0 / maxAxis);
        
        box.setFromObject(model);
        box.getCenter(center);
        model.position.sub(center);

        scene.add(model);
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

  // 5. Tính năng Export ra ảnh 2D giữ nguyên thuật toán Canvas
  forgeExportBtn?.addEventListener("click", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f3edf4";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = "#eee0f4";
    ctx.strokeStyle = "#6e5e9c";
    ctx.lineWidth = 6;
    const panelX = 260;
    const panelY = 110;
    const panelW = 680;
    const panelH = 520;
    roundedRect(ctx, panelX, panelY, panelW, panelH, 28);
    ctx.fill();
    ctx.stroke();
    
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-18 * (Math.PI / 180));
    ctx.fillStyle = "#d4c0e5";
    ctx.strokeStyle = "#6e5e9c";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-130, 40);
    ctx.lineTo(-10, -120);
    ctx.lineTo(140, -30);
    ctx.lineTo(25, 120);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = "#f5f2f6";
    ctx.fillRect(-92, -62, 175, 140);
    ctx.strokeRect(-92, -62, 175, 140);
    ctx.restore();
    
    ctx.fillStyle = "#6c3f7c";
    ctx.font = '700 70px "Trebuchet MS", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("3D", canvas.width / 2, canvas.height / 2 + 20);
    
    ctx.fillStyle = "#6c3f7c";
    ctx.font = '500 36px "Trebuchet MS", sans-serif';
    ctx.fillText("Mô hình 3D sẽ hiển thị ở đây", canvas.width / 2, canvas.height / 2 + 110);
    
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "3d-forge-export.png";
    link.click();
  });

  function roundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
  }

  // Khởi chạy trạng thái mặc định
  setForgeMode("single");
}