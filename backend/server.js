const express = require('express');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');
const sharp = require('sharp');
const { fal } = require("@fal-ai/client");

dotenv.config();
const app = express();

// Cho phép Frontend (chạy trên port 5173) gọi API tới Backend (chạy trên port 3000)
app.use(cors());
app.use(express.json());

// Lưu file ảnh tạm vào bộ nhớ RAM (memoryStorage) để chuyển tiếp đi ngay
const upload = multer({ storage: multer.memoryStorage() });

// --- API 1: Xử lý tạo Task (Phân nhánh Single dùng Trellis, Multiple dùng Depth-Anything) ---
app.post('/api/create-task', upload.fields([{ name: 'source', maxCount: 1 }, { name: 'pose', maxCount: 1 }]), async (req, res) => {
  try {
    const mode = req.body.mode;
    const sourceFile = req.files['source']?.[0];
    const poseFile = req.files['pose']?.[0];
    if (!sourceFile) throw new Error("Thiếu ảnh nguồn bắt buộc");
    
    let finalBuffer = sourceFile.buffer;
    let finalMime = sourceFile.mimetype;

    // Vẫn giữ tính năng ghép Pose nếu ở chế độ single và có ảnh pose
    if (mode === 'single' && poseFile) {
      console.log("Đang kích hoạt Fal.ai Nano Banana 2 để đổi dáng...");
      const sourceBase64 = `data:${sourceFile.mimetype};base64,${sourceFile.buffer.toString('base64')}`;
      const poseBase64 = `data:${poseFile.mimetype};base64,${poseFile.buffer.toString('base64')}`;
      
      const falRes = await fetch("https://fal.run/fal-ai/nano-banana-2/edit", {
        method: "POST",
        headers: {
          "Authorization": `Key ${process.env.FAL_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: "Keep the exact character from the first image, but redraw them performing the exact body pose of the person in the second image. Clean solid white background, highly detailed 3D render.",
          image_urls: [sourceBase64, poseBase64],
          safety_tolerance: "6",
          output_format: "jpeg"
        })
      });
      if (!falRes.ok) throw new Error("Fal.ai Nano Banana từ chối yêu cầu.");
      const falData = await falRes.json();
      if (falData.images && falData.images.length > 0) {
        const combinedImageRes = await fetch(falData.images[0].url);
        const arrayBuffer = await combinedImageRes.arrayBuffer();
        finalBuffer = Buffer.from(arrayBuffer);
        finalMime = "image/jpeg";
      }
    }

    const finalBase64 = `data:${finalMime};base64,${finalBuffer.toString('base64')}`;
    let endpoint = "fal-ai/trellis-2";

    if (mode === 'multiple') {
      console.log("Đang đẩy ảnh lên Fal.ai Depth-Anything-V2 để đo không gian 2.5D...");
      endpoint = "fal-ai/image-preprocessors/depth-anything/v2";
    } else {
      console.log("Đang đẩy ảnh lên Fal.ai TRELLIS để nặn 3D...");
    }

    const { request_id } = await fal.queue.submit(endpoint, {
      input: {
        image_url: finalBase64
      }
    });

    res.json({
        code: 0,
        data: { task_id: request_id }
    });
  } catch (error) {
    console.error("Lỗi Create Task:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- API 2: Kiểm tra trạng thái Task (Hỗ trợ cả Trellis và Depth-Anything) ---
app.get('/api/task-status/:taskId', async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const mode = req.query.mode || 'single'; // Nhận mode từ Frontend truyền lên
    const endpoint = mode === 'single' ? "fal-ai/trellis-2" : "fal-ai/image-preprocessors/depth-anything/v2";

    const status = await fal.queue.status(endpoint, {
      requestId: taskId,
      logs: true
    });
    const statusLogs = Array.isArray(status.logs)
      ? status.logs
          .map((entry) => (typeof entry === "string" ? entry : entry?.message))
          .filter((message) => typeof message === "string" && message.length > 0)
          .slice(-5)
          .map((message) =>
            message
              .slice(0, 240)
              .replace(/(Bearer\s+)[^\s]+/gi, "$1[redacted]")
              .replace(/\b(?:fal_[A-Za-z0-9_-]{20,}|key-[A-Za-z0-9_-]{20,})\b/g, "[redacted]")
          )
      : [];
    console.info(`[Fal task] ${endpoint}: ${status.status}; ${statusLogs.length} log entries`);
    statusLogs.forEach((message) => console.info(`[Fal task log] ${message}`));

    let mappedStatus = "queued";
    let mappedProgress = 0;
    if (status.status === "IN_PROGRESS") {
        mappedStatus = "running";
        mappedProgress = 50;
    }
    if (status.status === "COMPLETED") {
        mappedStatus = "success";
        mappedProgress = 100;
    }
    if (status.status === "FAILED") {
        mappedStatus = "failed";
    }

    let responseData = {
        code: 0,
        data: {
            status: mappedStatus,
            progress: mappedProgress
        }
    };

    if (status.status === "COMPLETED") {
        const result = await fal.queue.result(endpoint, {
            requestId: taskId
        });
        console.dir(result.data, { depth: 5 });
        const dataObj = result.data || result;
        let fileUrl = "";

        if (mode === 'single') {
            fileUrl = dataObj?.model_glb?.url || dataObj?.model_mesh?.url || dataObj?.model_file?.url;
            if (!fileUrl) {
                const resultStr = JSON.stringify(result);
                const glbMatch = resultStr.match(/https?:\/\/[^"'\s]+\.glb/i);
                if (glbMatch) fileUrl = glbMatch[0];
            }
            responseData.data.output = { model: fileUrl };
        } else {
            // Đối với Multiple (Depth Map), kết quả trả về là ảnh trắng đen
            fileUrl = dataObj?.image?.url || dataObj?.depth_map?.url;
            if (!fileUrl) {
                const resultStr = JSON.stringify(result);
                const imgMatch = resultStr.match(/https?:\/\/[^"'\s]+\.(png|jpg|jpeg)/i);
                if (imgMatch) fileUrl = imgMatch[0];
            }
            responseData.data.output = { depth_map: fileUrl };
        }
    }
    res.json(responseData);
  } catch (error) {
    console.error("Lỗi check status:", error);
    res.status(500).json({ error: error.message });
  }
});

//API 3: Tái tạo lại ảnh 2D từ ảnh nguồn + render 3D hiện tại
app.post('/api/export-2d/reconstruct', upload.fields([
  { name: 'source', maxCount: 1 },
  { name: 'render', maxCount: 1 }
]), async (req, res) => {
  try {
    const sourceFile = req.files?.source?.[0];
    const renderFile = req.files?.render?.[0];

    if (!sourceFile || !renderFile) {
      throw new Error("Both the source image and current 3D render are required.");
    }

    const sourceImage = `data:${sourceFile.mimetype};base64,${sourceFile.buffer.toString('base64')}`;
    const renderImage = `data:${renderFile.mimetype};base64,${renderFile.buffer.toString('base64')}`;

    const falRes = await fetch("https://fal.run/fal-ai/nano-banana-2/edit", {
      method: "POST",
      headers: {
        "Authorization": `Key ${process.env.FAL_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: "Use the first image as the ABSOLUTE reference for the subject's identity, art style, materials, colors, and lighting. Use the second image STRICTLY as a structural wireframe for the camera angle, pose, and perspective. Generate the subject from the first image viewed from the exact angle of the second image. Do NOT alter the original art style. If the first image is 3D clay, the output must be 3D clay. If it is a real photo, the output must be photorealistic. If it's a flat drawing, the output must be flat. Clean background.",
        image_urls: [sourceImage, renderImage],
        safety_tolerance: "6",
        output_format: "jpeg"
      })
    });

    if (!falRes.ok) {
      const errorText = await falRes.text();
      console.error("Fal.ai image reconstruction error:", errorText);
      throw new Error("Fal.ai could not reconstruct this image.");
    }

    const falData = await falRes.json();
    const imageUrl = falData.images?.[0]?.url;
    if (!imageUrl) throw new Error("Fal.ai did not return a reconstructed image.");

    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) throw new Error("Could not retrieve the reconstructed image.");

    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
    res.set("Content-Type", imageRes.headers.get("content-type") || "image/jpeg");
    res.set("Content-Disposition", 'attachment; filename="3d-forge-style-reconstruction.jpg"');
    res.send(imageBuffer);
  } catch (error) {
    console.error("2D style reconstruction error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API 4: Xử lý Chatbot qua cổng OpenRouter của Fal.ai
app.post('/api/chat', async (req, res) => {
  try {
    const { message, characterId } = req.body;
    // 1. Khai báo System Prompt định hình tính cách cho 5 Mascot
    const personas = {
      1: "You are Nina, a dreamy, gentle, and poetic girl. You love stargazing and aesthetics. Keep answers short, sweet, and soothing. Maximum 2-3 sentences.",
      2: "You are Milo, a groovy, music-loving, energetic boy. You use slang like 'cool', 'vibes', 'man'. You love hip-hop. Keep answers short, punchy, and upbeat.",
      3: "You are Juno, a fierce, confident, and sassy character. You are bold, straight to the point, and unapologetic. Keep answers short and sharp.",
      4: "You are Mochi, a sleepy, lazy, and cute character. You often yawn (e.g., '*yawn*'), speak slowly, and prefer talking about naps and snacks. Keep answers short.",
      5: "You are Roxy, a mischievous, witty, and sly fox-like character. You are playful, clever, and sometimes tease the user gently. Keep answers short and cunning."
    };
    const systemPrompt = personas[characterId] || personas[1];

    // 2. Gửi request thẳng bằng fetch tới fal (OpenAI Compatible API)
    const response = await fetch("https://fal.run/openrouter/router/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Key ${process.env.FAL_KEY}`, 
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini", 
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        max_tokens: 150,
        temperature: 0.7
      })
    });

    if (!response.ok) {
        const errorData = await response.text();
        console.error("Fal API Response Error:", errorData);
        throw new Error("Lỗi từ Fal API");
    }

    const data = await response.json();

    // 3. Lấy kết quả trả về từ cấu trúc chuẩn của OpenAI
    const replyMessage = data.choices[0].message.content;
    
    res.json({ reply: replyMessage });

  } catch (error) {
    console.error("Chat API Error:", error);
    res.status(500).json({ error: "Sorry, I lost my connection for a second. Can you repeat?" });
  }
});

// --- API 5: Magic Wand selection preview (SAM 3) ---
app.post('/api/magic-wand', upload.single('source'), async (req, res) => {
  try {
    const x = Math.round(Number(req.body.point_x));
    const y = Math.round(Number(req.body.point_y));

    const selectionPrompt = String(
      req.body.selection_prompt || ''
    ).trim();

    const sourceFile = req.file;

    if (!sourceFile) {
      throw new Error("Thiếu ảnh nguồn");
    }

    // Giới hạn độ dài prompt
    if (selectionPrompt.length > 240) {
      throw new Error(
        "Mô tả vật thể không được vượt quá 240 ký tự."
      );
    }

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      y < 0
    ) {
      throw new Error("Tọa độ chọn vật không hợp lệ");
    }

    const { data: orientedImage, info: imageInfo } = await sharp(sourceFile.buffer)
      .rotate()
      .png()
      .toBuffer({ resolveWithObject: true });
    if (x >= imageInfo.width || y >= imageInfo.height) {
      throw new Error(
        `Tọa độ (${x}, ${y}) nằm ngoài ảnh ${imageInfo.width}x${imageInfo.height}`
      );
    }

    const sourceBase64 = `data:image/png;base64,${orientedImage.toString('base64')}`;

    console.log(
      `[Magic Wand] SAM 3 point x=${x}, y=${y} on oriented image ${imageInfo.width}x${imageInfo.height}`
    );
    
    // Gọi SAM 3 để bóc tách vật thể ngay tại điểm user vừa click
    const samInput = {
      image_url: sourceBase64,
      apply_mask: true,
      output_format: "png"
    };

    // Chỉ dùng điểm click NẾU người dùng không nhập đoạn text miêu tả
    if (selectionPrompt?.trim()) {
      samInput.prompt = selectionPrompt.trim();
      console.log(`[Magic Wand] Ưu tiên Text Prompt: "${selectionPrompt}"`);
    } else {
      samInput.point_prompts = [{ x, y, label: 1 }];
      console.log(`[Magic Wand] Dùng Point Prompt tại tọa độ X:${x}, Y:${y}`);
    }

    // Gọi API bằng biến samInput đã được xử lý
    const samResult = await fal.subscribe("fal-ai/sam-3/image", {
        input: samInput, // TRUYỀN BIẾN SAMINPUT VÀO ĐÂY
        logs: true
    });

    console.log(
        "[Magic Wand] Full SAM 3 response:",
        JSON.stringify(samResult, null, 2)
    );

    console.log(
        "[Magic Wand] Full SAM 3 response:",
        JSON.stringify(samResult, null, 2)
    );

    console.log("[Magic Wand] Prompt:", selectionPrompt);
    console.log("[Magic Wand] Click point:", { x, y });
    console.log("[Magic Wand] Image size:", {
      width: imageInfo.width,
      height: imageInfo.height
    });

    // Truy xuất linh hoạt các đường dẫn có thể có
    let isolatedImageUrl = null;

    if (samResult.image && samResult.image.url) {
        isolatedImageUrl = samResult.image.url;
    } else if (samResult.data && samResult.data.image && samResult.data.image.url) {
        isolatedImageUrl = samResult.data.image.url;
    } else if (samResult.mask && samResult.mask.url) {
        isolatedImageUrl = samResult.mask.url;
    } else {
        // Lưới an toàn cuối cùng: Quét văn bản JSON để bắt mọi link ảnh
        const resultStr = JSON.stringify(samResult);
        const imgMatch = resultStr.match(/https?:\/\/[^"'\s]+\.(png|jpg|jpeg|webp)/i);
        if (imgMatch) {
            isolatedImageUrl = imgMatch[0];
        }
    }

    if (!isolatedImageUrl) {
        console.error("[Magic Wand] Lỗi định dạng SAM trả về:", JSON.stringify(samResult, null, 2));
        throw new Error("Không lấy được ảnh tách nền từ hệ thống AI.");
    }

    console.log(`[Magic Wand] SAM 3 đã tách vật thể tại (${x}, ${y}).`);
    res.json({ code: 0, data: { image_url: isolatedImageUrl } });
  } catch (error) {
    console.error("Lỗi Magic Wand selection:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- API 6: Tạo model Trellis-2 từ vật thể đã chọn ---
app.post('/api/magic-wand/create', async (req, res) => {
  try {
    const isolatedImageUrl = String(req.body?.image_url || '').trim();
    if (!/^https?:\/\//i.test(isolatedImageUrl)) {
      throw new Error("Thiếu ảnh vật thể đã tách");
    }

    const { request_id } = await fal.queue.submit("fal-ai/trellis-2", {
      input: {
        image_url: isolatedImageUrl
      }
    });

    console.log(`[Magic Wand] Đã gửi vật thể sang Trellis-2: ${request_id}`);
    res.json({ code: 0, data: { task_id: request_id } });
  } catch (error) {
    console.error("Lỗi tạo model Magic Wand:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend Server đang chạy tại http://localhost:${PORT}`));