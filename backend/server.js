const express = require('express');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');
//const sharp = require('sharp'); // chưa dùng đến

dotenv.config();
const app = express();

// Cho phép Frontend (chạy trên port 5173) gọi API tới Backend (chạy trên port 3000)
app.use(cors());
app.use(express.json());

// Lưu file ảnh tạm vào bộ nhớ RAM (memoryStorage) để chuyển tiếp đi ngay
const upload = multer({ storage: multer.memoryStorage() });

// API 1: Xử lý ảnh nguồn + pose (nếu có) -> gửi lên Tripo -> trả về Task ID
app.post('/api/create-task', upload.fields([{ name: 'source', maxCount: 1 }, { name: 'pose', maxCount: 1 }]), async (req, res) => {
  try {
    const mode = req.body.mode;
    const sourceFile = req.files['source']?.[0];
    const poseFile = req.files['pose']?.[0];

    if (!sourceFile) throw new Error("Thiếu ảnh nguồn bắt buộc");

    let finalBuffer = sourceFile.buffer;
    let finalName = sourceFile.originalname;
    let finalMime = sourceFile.mimetype;

    // Chỉ chạy Fal.ai nếu đang ở single mode và có pose image
    if (mode === 'single' && poseFile) {
      console.log("Đang kích hoạt Fal.ai Nano Banana 2...");

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

      if (!falRes.ok) {
        const errorText = await falRes.text();
        console.error("--- LỖI TỪ FAL.AI ---", errorText);
        throw new Error("Fal.ai từ chối yêu cầu. Kiểm tra log Terminal Backend.");
      }

      const falData = await falRes.json();

      if (falData.images && falData.images.length > 0) {
        console.log("Fal.ai đã tạo xong ảnh ghép:", falData.images[0].url);

        const combinedImageRes = await fetch(falData.images[0].url);
        if (!combinedImageRes.ok) {
          throw new Error("Không tải được ảnh kết quả từ Fal.ai");
        }

        const arrayBuffer = await combinedImageRes.arrayBuffer();
        let imageBuffer = Buffer.from(arrayBuffer);
        
        finalBuffer = Buffer.from(arrayBuffer);
        finalName = "fal_combined_pose.jpg";
        finalMime = "image/jpeg";
      }
    }

    // 1. Upload ảnh cuối cùng lên Tripo3D
    console.log("Đang tải ảnh lên Tripo3D...");
    const formData = new FormData();
    const blob = new Blob([finalBuffer], { type: finalMime });
    formData.append("file", blob, finalName);

    const uploadRes = await fetch("https://api.tripo3d.ai/v2/openapi/upload", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.TRIPO_API_KEY}` },
      body: formData
    });
    const uploadData = await uploadRes.json();
    if (uploadData.code !== 0) throw new Error("Tripo từ chối ảnh upload");

    // 2. Tạo task 3D
    const taskRes = await fetch("https://api.tripo3d.ai/v2/openapi/task", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.TRIPO_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "image_to_model",
        file: { type: "jpg", file_token: uploadData.data.image_token }
      })
    });

    const taskData = await taskRes.json();
    res.json(taskData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// API 2: Kiểm tra phần trăm hoàn thành của Task
app.get('/api/task-status/:taskId', async (req, res) => {
  try {
    const statusRes = await fetch(`https://api.tripo3d.ai/v2/openapi/task/${req.params.taskId}`, {
      headers: { "Authorization": `Bearer ${process.env.TRIPO_API_KEY}` }
    });
    const statusData = await statusRes.json();
    res.json(statusData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend Server đang chạy tại http://localhost:${PORT}`));