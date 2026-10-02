const express = require('express');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');
const { fal } = require("@fal-ai/client");

dotenv.config();
const app = express();

// Cho phép Frontend (chạy trên port 5173) gọi API tới Backend (chạy trên port 3000)
app.use(cors());
app.use(express.json());

// Lưu file ảnh tạm vào bộ nhớ RAM (memoryStorage) để chuyển tiếp đi ngay
const upload = multer({ storage: multer.memoryStorage() });

// API 1: Xử lý ảnh nguồn + pose (nếu có) -> gửi lên Fal.ai TRELLIS -> trả về Task ID
app.post('/api/create-task', upload.fields([{ name: 'source', maxCount: 1 }, { name: 'pose', maxCount: 1 }]), async (req, res) => {
  try {
    const mode = req.body.mode;
    const sourceFile = req.files['source']?.[0];
    const poseFile = req.files['pose']?.[0];
    if (!sourceFile) throw new Error("Thiếu ảnh nguồn bắt buộc");

    let finalBuffer = sourceFile.buffer;
    let finalMime = sourceFile.mimetype;

    // Vẫn giữ tính năng ghép Pose siêu việt của bạn bằng Nano Banana 2
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

    // --- TỪ ĐÂY BẮT ĐẦU ĐỔI SANG DÙNG TRELLIS THAY VÌ TRIPO3D ---
    console.log("Đang đẩy ảnh lên Fal.ai TRELLIS để nặn 3D...");
    
    // Đóng gói ảnh thành dạng Base64 để truyền thẳng vào Fal
    const finalBase64 = `data:${finalMime};base64,${finalBuffer.toString('base64')}`;

    // Ném task vào hàng đợi (queue) của Fal thay vì Tripo
    const { request_id } = await fal.queue.submit("fal-ai/trellis-2", {
      input: {
        image_url: finalBase64
      }
    });

    // Trả về cho Frontend đúng cấu trúc mà nó quen thuộc của Tripo
    res.json({
        code: 0,
        data: { task_id: request_id }
    });

  } catch (error) {
    console.error("Lỗi Create Task:", error);
    res.status(500).json({ error: error.message });
  }
});

// API 2: Kiểm tra phần trăm hoàn thành của Task (Giả lập format Tripo3D chuẩn xác)
app.get('/api/task-status/:taskId', async (req, res) => {
  try {
    const taskId = req.params.taskId;
    
    // Hỏi Fal xem task xử lý tới đâu rồi
    const status = await fal.queue.status("fal-ai/trellis-2", {
      requestId: taskId,
      logs: false
    });

    // Giả lập trạng thái và phần trăm tiến độ (% progress) cho Frontend
    let mappedStatus = "queued";
    let mappedProgress = 0;

    if (status.status === "IN_PROGRESS") {
        mappedStatus = "running";
        mappedProgress = 50; // Giả lập 50% khi đang xử lý
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
            progress: mappedProgress // Đã bổ sung progress để nút bấm không bị UNDEFINED
        }
    };

    // Nếu Fal làm xong, lấy kết quả
    if (status.status === "COMPLETED") {
        const result = await fal.queue.result("fal-ai/trellis-2", {
            requestId: taskId
        });
        
        // 1. Tương thích mọi phiên bản thư viện fal-ai/client
        const dataObj = result.data || result;
        
        // 2. Tìm link ở tất cả các tên biến mà Fal có thể đổi
        let fileUrl = dataObj?.model_glb?.url || dataObj?.model_mesh?.url || dataObj?.model_file?.url;
        
        // 3. Lưới an toàn cuối cùng: Quét sạch văn bản dữ liệu để gắp link .glb ra
        if (!fileUrl) {
            const resultStr = JSON.stringify(result);
            const glbMatch = resultStr.match(/https?:\/\/[^"'\s]+\.glb/i);
            if (glbMatch) {
                fileUrl = glbMatch[0];
            }
        }

        responseData.data.output = {
            model: fileUrl
        };
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend Server đang chạy tại http://localhost:${PORT}`));