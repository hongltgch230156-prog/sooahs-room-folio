// src/components/forge.js

export function initForge() {
  const forgeModeButtons = document.querySelectorAll(".forge-mode-btn");
  const forgeUploadCards = document.querySelectorAll(".forge-upload-card.optional");
  const forgeInputFields = document.querySelectorAll(".forge-input");
  const forgeViewer = document.getElementById("forge-viewer");
  const forgeExportBtn = document.querySelector(".forge-export-btn");
  const forgeSubmitBtn = document.querySelector(".forge-submit-btn");
  const forgeOutputStage = document.querySelector(".forge-output-stage");

  const setForgeMode = (mode) => {
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

  forgeInputFields.forEach((input) => {
    input.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      const card = event.target.closest(".forge-upload-card");
      const preview = card?.querySelector(".forge-preview");
      if (!file || !preview) return;
      const reader = new FileReader();
      reader.onload = () => {
        preview.src = reader.result;
        card.classList.add("is-filled");
      };
      reader.readAsDataURL(file);
    });
  });

  forgeSubmitBtn?.addEventListener("click", () => {
    const requiredInput = document.querySelector('.forge-input[data-slot="source"]');
    const requiredCard = requiredInput?.closest(".forge-upload-card");
    const requiredPreview = requiredCard?.querySelector(".forge-preview");
    if (!requiredPreview?.src) return;
    forgeOutputStage?.classList.add("is-ready");
    forgeOutputStage?.style.setProperty("--result-image", `url(${requiredPreview.src})`);
    forgeOutputStage?.setAttribute("data-status", "ready");
  });

  let viewerRotationX = 25;
  let viewerRotationY = -20;
  let viewerScale = 1.1;
  let isDraggingViewer = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  const updateForgeViewer = () => {
    if (!forgeViewer) return;
    const model = forgeViewer.querySelector(".forge-model");
    if (!model) return;
    model.style.transform = `rotateX(${viewerRotationX}deg) rotateY(${viewerRotationY}deg) scale(${viewerScale})`;
  };

  forgeViewer?.addEventListener("pointerdown", (event) => {
    isDraggingViewer = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    forgeViewer.setPointerCapture(event.pointerId);
  });

  forgeViewer?.addEventListener("pointermove", (event) => {
    if (!isDraggingViewer) return;
    const deltaX = event.clientX - lastPointerX;
    const deltaY = event.clientY - lastPointerY;
    viewerRotationY += deltaX * 0.35;
    viewerRotationX -= deltaY * 0.35;
    viewerRotationX = Math.min(80, Math.max(-80, viewerRotationX));
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    updateForgeViewer();
  });

  forgeViewer?.addEventListener("pointerup", () => {
    isDraggingViewer = false;
  });

  forgeViewer?.addEventListener("pointerleave", () => {
    isDraggingViewer = false;
  });

  forgeViewer?.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      viewerScale += event.deltaY * -0.0008;
      viewerScale = Math.min(1.8, Math.max(0.8, viewerScale));
      updateForgeViewer();
    },
    { passive: false }
  );

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
  updateForgeViewer();
}