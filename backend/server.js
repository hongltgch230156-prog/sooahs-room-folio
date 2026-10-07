const express = require('express');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');
const sharp = require('sharp');
const { fal } = require("@fal-ai/client");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();
const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});
const app = express();

// Cho phép Frontend (chạy trên port 5173) gọi API tới Backend (chạy trên port 3000)
app.use(cors());
//app.use(express.json());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Lưu file ảnh tạm vào bộ nhớ RAM (memoryStorage) để chuyển tiếp đi ngay
const upload = multer({ storage: multer.memoryStorage() });

// --- API 1: Xử lý tạo Task (Tất cả đều dùng Trellis-2, Multiple có thêm bước lót nền trắng) ---
app.post('/api/create-task', upload.fields([{ name: 'source', maxCount: 1 }, { name: 'pose', maxCount: 1 }]), async (req, res) => {
  try {
    const mode = req.body.mode;
    const sourceFile = req.files['source']?.[0];
    const poseFile = req.files['pose']?.[0];
    if (!sourceFile) throw new Error("Thiếu ảnh nguồn bắt buộc");
    
    let finalBuffer = sourceFile.buffer;
    let finalMime = sourceFile.mimetype;

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
    } else if (mode === 'multiple') {
      // THÊM TRICK TẠO NỀN TRẮNG CHO NHIỀU OBJECTS
      console.log("Đang kích hoạt Fal.ai Nano Banana 2 để thu nhỏ và bọc nền trắng...");
      const sourceBase64 = `data:${sourceFile.mimetype};base64,${sourceFile.buffer.toString('base64')}`;
      
      const falRes = await fetch("https://fal.run/fal-ai/nano-banana-2/edit", {
        method: "POST",
        headers: {
          "Authorization": `Key ${process.env.FAL_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: "Redraw this exact scene as a 3D isometric miniature diorama. CRITICAL INSTRUCTION: ZOOM OUT significantly! Place the diorama completely isolated in the dead center of a vast, pure solid white background. There must be a thick, generous empty white border around the entire diorama. STRICTLY PRESERVE the exact original art style, realism, lighting, and textures. Do not isolate a single object; keep the whole scene together.",
          image_urls: [sourceBase64],
          safety_tolerance: "6",
          output_format: "jpeg"
        })
      });
      if (!falRes.ok) throw new Error("Fal.ai Nano Banana từ chối yêu cầu tạo nền trắng.");
      const falData = await falRes.json();
      if (falData.images && falData.images.length > 0) {
        const processedImageRes = await fetch(falData.images[0].url);
        const arrayBuffer = await processedImageRes.arrayBuffer();
        finalBuffer = Buffer.from(arrayBuffer);
        finalMime = "image/jpeg";
      }
    }

    const finalBase64 = `data:${finalMime};base64,${finalBuffer.toString('base64')}`;
    
    // Vì không dùng DAV2 nữa, ta LUÔN đẩy lên Trellis-2
    console.log(`Đang đẩy ảnh lên Fal.ai TRELLIS để nặn 3D (chế độ: ${mode})...`);
    const endpoint = "fal-ai/trellis-2";
    
    const { request_id } = await fal.queue.submit(endpoint, {
      input: { image_url: finalBase64 }
    });
    res.json({ code: 0, data: { task_id: request_id } });
  } catch (error) {
    console.error("Lỗi Create Task:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- API 2: Kiểm tra trạng thái Task (Bây giờ chỉ dùng Trellis-2) ---
app.get('/api/task-status/:taskId', async (req, res) => {
  try {
    const taskId = req.params.taskId;
    // Luôn gọi Trellis-2 để check status thay vì chia nhánh
    const endpoint = "fal-ai/trellis-2"; 
    const status = await fal.queue.status(endpoint, { requestId: taskId, logs: false });
    
    let mappedStatus = "queued";
    let mappedProgress = 0;
    if (status.status === "IN_PROGRESS") { mappedStatus = "running"; mappedProgress = 50; }
    if (status.status === "COMPLETED") { mappedStatus = "success"; mappedProgress = 100; }
    if (status.status === "FAILED") { mappedStatus = "failed"; }
    
    let responseData = { code: 0, data: { status: mappedStatus, progress: mappedProgress } };
    
    if (status.status === "COMPLETED") {
        const result = await fal.queue.result(endpoint, { requestId: taskId });
        const dataObj = result.data || result;
        
        // Luôn trả về 3D model
        let fileUrl = dataObj?.model_glb?.url || dataObj?.model_mesh?.url || dataObj?.model_file?.url;
        if (!fileUrl) {
            const resultStr = JSON.stringify(result);
            const glbMatch = resultStr.match(/https?:\/\/[^"'\s]+\.glb/i);
            if (glbMatch) fileUrl = glbMatch[0];
        }
        responseData.data.output = { model: fileUrl };
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
    // 1. Khai báo Kiến thức cốt lõi (Knowledge Base) về 3D Forge để truyền cho AI
    const systemKnowledge = `
CORE KNOWLEDGE ABOUT "3D FORGE":
- "3D Forge" is a web application created by LeHong (HONQLEE). It turns 2D images into 3D models.
- Tool 1 - Single Object: Best for isolated items (like a chair or character). Generates a standard .glb 3D mesh.
- Tool 2 - Multiple Objects (Generate Scene): Turns an entire scene (like a room or landscape) into a 3D diorama chunk on a white block.
- Tool 3 - Magic Wand (SAM 3): Lets users click on any specific object in an image to extract it and turn it into a separate 3D model.
- Tool 4 - Export: Users can download their models as GLB, FBX, OBJ, or STL, or capture a 2D screenshot (Direct Render or AI Style Reconstruction).

RULES FOR ANSWERING:
1. Web Assistance: If the user asks how to use a feature, explain it clearly and briefly based on the CORE KNOWLEDGE.
2. Troubleshooting/Errors: If the user reports an error (e.g., "it's broken", "the model looks melted"), apologize briefly in your character's tone, suggest they check their image or try a different mode.
3. General Chat: If they ask casual questions, answer naturally while staying in character.
4. Out of Scope/Hard Issues: If the user asks for technical support you cannot provide (e.g., account issues, billing, deep code errors), respond in your character's tone and say: "I can't help with that right now, but please email abc@gmail.com so the support team can assist you!"
`;

    // 2. Khai báo System Prompt định hình tính cách cho 5 Mascot (Kết hợp Kiến thức)
    const personas = {
      1: "You are Nina, a dreamy, gentle, and poetic girl. You love stargazing and aesthetics. Keep answers short, sweet, and soothing. Maximum 2-3 sentences. " + systemKnowledge,
      2: "You are Milo, a groovy, music-loving, energetic boy. You use slang like 'cool', 'vibes', 'man'. You love hip-hop. Keep answers short, punchy, and upbeat. " + systemKnowledge,
      3: "You are Juno, a fierce, confident, and sassy character. You are bold, straight to the point, and unapologetic. Keep answers short and sharp. " + systemKnowledge,
      4: "You are Mochi, a sleepy, lazy, and cute character. You often yawn (e.g., '*yawn*'), speak slowly, and prefer talking about naps and snacks. Keep answers short. " + systemKnowledge,
      5: "You are Roxy, a mischievous, witty, and sly fox-like character. You are playful, clever, and sometimes tease the user gently. Keep answers short and cunning. " + systemKnowledge
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
      prompt: selectionPrompt || "",
      point_prompts: [
          { x, y, label: 1 }
      ],
      apply_mask: true,
      output_format: "png"
    };

    // Luôn truyền prompt để tránh API tự dùng mặc định "wheel"
    samInput.prompt = selectionPrompt;

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

// ------------------------------------------------------------
// MEME SEARCH - GEMINI EXPRESSION ANALYSIS
// ------------------------------------------------------------

app.post("/api/meme/analyze", async (req, res) => {
  try {
    const {
      image,
      gesture,
      gestureScore,
      basicExpression,
    } = req.body;

    if (!image) {
      throw new Error(
        "Missing webcam image."
      );
    }

    if (
      !process.env.GEMINI_API_KEY
    ) {
      throw new Error(
        "GEMINI_API_KEY is not configured."
      );
    }

    // image = data:image/jpeg;base64,...
    const match =
      image.match(
        /^data:(image\/[a-zA-Z]+);base64,(.+)$/
      );

    if (!match) {
      throw new Error(
        "Invalid image format."
      );
    }

    const mimeType = match[1];
    const base64Data = match[2];

    // ----------------------------------------------------------
    // GEMINI PROMPT
    // ----------------------------------------------------------
    const prompt = `
You are an advanced AI meme-vibe analyzer and visual expert for a webcam meme recommendation feature.
I am providing you with a snapshot of a user. You must rely PRIMARILY on your own visual analysis of this image.

Your job has THREE stages:

STAGE 1: VISUAL ANALYSIS (Do this first, before anything else)
Carefully examine the user's face and hands/body language in the image.
1. Describe the EXACT emotional nuance and facial expression (e.g., "forced awkward smile", "subtle smirk", "exaggerated pout", "deadpan stare", "genuine laugh").
2. Describe the EXACT hand gesture or body language (e.g., "making a rectangle frame with fingers", "doing a call me sign", "resting chin on hand", "giving a thumbs up", "pointing aggressively").

STAGE 2: ALIGNMENT (Optional hints)
I am also providing you with basic hints from a lightweight sensor (MediaPipe).
- Sensor Gesture Hint: ${gesture || "none"}
- Sensor Expression Hint: ${basicExpression || "unknown"}
CRITICAL RULE: Treat these hints as secondary. If your visual analysis in STAGE 1 sees something different (especially for complex gestures like "call me" or "making a frame" which the sensor might not understand), IGNORE the sensor hints and trust your own eyes.

STAGE 3: MEME INTENT & QUERY GENERATION
Synthesize the expression and gesture into an overall "Meme Vibe". What kind of reaction GIF would fit this exact moment?
Then generate EXACTLY 5 search queries that work well with the GIPHY GIF search engine.

RULES FOR QUERIES:
- Translate the visual action into meme-culture keywords. 
- Example: If the user is making a camera frame with hands, query "director frame reaction", "focus frame meme", or "framing shot reaction".
- Example: If the user makes a "call me" sign with a smirk, query "call me maybe reaction", "hit me up meme", or "call me sign".
- Use short, punchy queries (2-5 words).
- Focus on the *intent* of the meme, not just literal descriptions.
- Prefer words that are likely to exist as GIPHY tags.
- Avoid full sentences, quotation marks, hashtags, and names of real people (unless it's a specific meme format).

--------------------------------------------------
OUTPUT FORMAT
--------------------------------------------------
Return ONLY valid JSON. Exactly this structure:
{
  "visual_description": "squinting eyes while making a finger frame",
  "expression_nuance": "subtle smirk",
  "identified_gesture": "making a rectangle camera frame",
  "confidence": 0.95,
  "meme_intent": [
    "focusing on something",
    "director vibe",
    "analyzing the situation"
  ],
  "search_queries": [
    "director frame reaction",
    "focus meme",
    "analyzing reaction gif",
    "framing shot meme",
    "camera frame reaction"
  ]
}
`;

    // ----------------------------------------------------------
    // CALL GEMINI VIA FAL.AI OPENROUTER
    // ----------------------------------------------------------
    const response = await fetch("https://fal.run/openrouter/router/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Key ${process.env.FAL_KEY}`, 
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash", 
        messages: [
          { 
            role: "user", 
            content: [
              { type: "text", text: prompt },
              { 
                type: "image_url", 
                image_url: { url: `data:${mimeType};base64,${base64Data}` } 
              }
            ]
          }
        ],
        max_tokens: 800,
        temperature: 0.2 // Giữ temperature thấp để JSON trả về chuẩn xác
      })
    });

    if (!response.ok) {
        const errorData = await response.text();
        console.error("[Meme Search] Fal API Response Error:", errorData);
        throw new Error("Lỗi từ Fal API khi gọi Gemini");
    }

    const data = await response.json();
    const rawText = data.choices[0].message.content.trim();

    console.log("[Meme Search] Gemini via Fal raw:", rawText);

    // ----------------------------------------------------------
    // PARSE GEMINI JSON
    // ----------------------------------------------------------
    let parsed;
    try {
      parsed = JSON.parse(
        rawText
          .replace(/^```json\s*/i, "")
          .replace(/```$/i, "")
          .trim()
      );
    } catch {
      throw new Error("Gemini returned invalid JSON.");
    }

    // ----------------------------------------------------------
    // LẤY TRỰC TIẾP KẾT QUẢ TỪ AI VISION (BỎ BỘ LỌC CŨ)
    // ----------------------------------------------------------
    // Lấy biểu cảm chi tiết (nếu AI không nhận diện được thì fallback về MediaPipe)
    const finalExpression = parsed.expression_nuance || parsed.expression || basicExpression || "neutral";
    
    // Lấy cử chỉ chi tiết do AI tự nhìn thấy
    const finalGesture = parsed.identified_gesture || gesture || "none";

    // ----------------------------------------------------------
    // NORMALIZE CONFIDENCE
    // ----------------------------------------------------------
    const finalConfidence = Math.max(
      0,
      Math.min(
        1,
        Number(parsed.confidence) || 0
      )
    );

    // ----------------------------------------------------------
    // NORMALIZE GIPHY SEARCH QUERIES
    // ----------------------------------------------------------
    let searchQueries = Array.isArray(parsed.search_queries)
      ? parsed.search_queries
      : [];
    searchQueries = searchQueries
      .filter((query) => typeof query === "string")
      .map((query) => query.trim())
      .filter(Boolean)
      .map((query) => query.slice(0, 50))
      .filter(
        (query, index, array) =>
          array.indexOf(query) === index
      )
      .slice(0, 5);

    // Fallback nếu Gemini không trả query hợp lệ
    if (searchQueries.length === 0) {
      searchQueries = ["funny reaction meme"];
    }

    // ----------------------------------------------------------
    // DEBUG LOG
    // ----------------------------------------------------------
    console.log(
      "[Meme Search] Final AI Vision analysis:",
      {
        finalExpression,
        finalGesture,
        confidence: finalConfidence,
        searchQueries,
      }
    );

    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------
    res.json({
      code: 0,
      expression: finalExpression, // Gửi dòng text xịn xò về cho Frontend
      confidence: finalConfidence,
      memeIntent: Array.isArray(parsed.meme_intent)
        ? parsed.meme_intent.slice(0, 3)
        : [],
      searchQueries,
      gesture: finalGesture, // Gửi miêu tả cử chỉ tay chi tiết về Frontend
      gestureScore: gestureScore || 0,
    });
  } catch (error) {
    console.error(
      "[Meme Search] Gemini analysis error:",
      error
    );
    res.status(500).json({
      error:
        error.message ||
        "Expression analysis failed.",
    });
  }
});

// ----------------------------------------------------------
// MEME SEARCH - RERANKING VISION MODEL (WITH MATCH RATE)
// ----------------------------------------------------------
app.post("/api/meme/rerank", async (req, res) => {
  try {
    const { userImage, candidates } = req.body;
    if (!userImage || !candidates || candidates.length === 0) {
      throw new Error("Thiếu dữ liệu ảnh để Rerank.");
    }

    // 1. Tách base64 của ảnh user
    const match = userImage.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid user image format.");
    const mimeType = match[1];
    const base64Data = match[2];

    // 2. Xây dựng Prompt chứa nhiều ảnh cho Gemini
    const messagesContent = [
      { 
        type: "text", 
        text: `You are an expert AI Visual Matcher. I will provide a User's Photo, followed by several Meme Candidates.
Task: Compare the facial expression AND exact physical hand gesture of the User with each Meme Candidate.
Calculate a "Match Percentage" (from 50 to 99) based STRICTLY on VISUAL similarity.
CRITICAL RULES:
- PHYSICAL POSE IS KING: If the user is touching their chin/face, the meme character MUST be touching their chin/face. 
- If the physical pose or gesture is completely different (e.g., user touches face, but meme character has hands down), PENALIZE heavily (score below 60), even if the "vibe" or "emotion" matches.
- Score above 85 ONLY if BOTH the facial expression and the physical hand gesture look visually identical.
Rank them from highest match to lowest match.
Return ONLY a valid JSON Array of objects in this exact format:
[
  { "id": "meme_id_1", "matchRate": 95 },
  { "id": "meme_id_2", "matchRate": 55 }
]` 
      },
      { type: "text", text: "USER PHOTO:" },
      { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }
    ];

    // Nhồi các ảnh tĩnh của Meme vào Prompt
    candidates.forEach((c) => {
      messagesContent.push({ type: "text", text: `MEME CANDIDATE ID: ${c.id}` });
      messagesContent.push({ type: "image_url", image_url: { url: c.url } });
    });

    // 3. Gọi Gemini 2.5 Flash qua Fal
    const response = await fetch("https://fal.run/openrouter/router/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Key ${process.env.FAL_KEY}`, 
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: messagesContent }],
        max_tokens: 800,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Meme Rerank] Fal API Error:", errorText);
      throw new Error("Lỗi Rerank từ AI");
    }

    const data = await response.json();
    const rawText = data.choices[0].message.content.trim();
    
    // 4. Parse mảng JSON trả về
    let rankedResults = [];
    try {
      rankedResults = JSON.parse(rawText.replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
    } catch {
      throw new Error("Gemini returned invalid array format.");
    }

    res.json({ code: 0, rankedResults });
  } catch (error) {
    console.error("[Meme Rerank] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------------
// STATIC MEME SEARCH (DÙNG BRAVE IMAGE SEARCH API)
// ----------------------------------------------------------
app.post("/api/meme/static-search", async (req, res) => {
  try {
    const { queries } = req.body;
    const apiKey = process.env.BRAVE_API_KEY;

    if (!apiKey) {
      throw new Error("Thiếu cấu hình BRAVE_API_KEY trong file .env");
    }

    // 1. Lọc lấy từ khóa xịn nhất, CỐ GẮNG BỎ QUA những từ khóa có chữ "gif" vì đây là ảnh tĩnh
    let bestQuery = "funny reaction";
    if (Array.isArray(queries) && queries.length > 0) {
      const nonGifQueries = queries.filter(q => !q.toLowerCase().includes('gif'));
      bestQuery = nonGifQueries.length > 0 ? nonGifQueries[0] : queries[0];
    }

    // 2. Dọn dẹp từ thừa (gif, meme, reaction) để tránh bị lặp từ
    let cleanQuery = bestQuery.replace(/reaction|meme|gif|image|pic/gi, '').trim();

    // 3. Sử dụng từ khóa vàng "reaction image" ép Brave tìm đúng các bức ảnh chế cảm xúc
    const searchQuery = encodeURIComponent(`${cleanQuery} twitter reaction pic OR pinterest meme`);

    // Gọi Brave Image Search API (lấy 9 kết quả)
    const url = `https://api.search.brave.com/res/v1/images/search?q=${searchQuery}&count=9`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brave API Error: ${errorText}`);
    }

    const data = await response.json();
    let images = [];

    if (data.results && data.results.length > 0) {
      // Trích xuất URL ảnh tĩnh từ response của Brave
      images = data.results.map((item, index) => ({
        id: `brave_img_${index}`,
        // Brave lưu URL ảnh gốc trong properties.url, ảnh thu nhỏ trong thumbnail.src
        url: item.properties?.url || item.thumbnail?.src,
        title: item.title || "Brave Meme"
      })).filter(img => img.url && !img.url.includes('redbubble')); // Lọc bỏ ảnh rác từ Redbubble
    }

    res.json({ code: 0, images });
  } catch (error) {
    console.error("[Static Search] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend Server đang chạy tại http://localhost:${PORT}`));