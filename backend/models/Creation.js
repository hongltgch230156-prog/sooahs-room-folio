// backend/models/Creation.js
// Một "tác phẩm" của user: model 3D đã tạo hoặc ảnh 2D đã export.
const mongoose = require('mongoose');

const creationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['model', 'export'], required: true },
    // model: 'single' | 'scene' | 'magic'      export: 'render' | 'ai-style'
    kind: { type: String, default: '' },
    name: { type: String, trim: true, maxlength: 60, default: '' },
    // model: 'pending' (đang tạo) -> 'ready' (xong). export luôn là 'ready'.
    status: { type: String, enum: ['pending', 'ready'], default: 'ready' },
    // id nhiệm vụ Trellis của fal (chỉ model) – để biết task nào thuộc về user nào
    taskId: { type: String },
    // đường dẫn tương đối trong backend/storage, ví dụ "models/ab12....glb"
    file: { type: String, default: '' },
    thumb: { type: String, default: '' },
    // link gốc trên fal CDN: dùng tạm khi file chưa tải về xong (fal chỉ giữ file tối thiểu 7 ngày)
    remoteUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

creationSchema.index({ user: 1, type: 1, createdAt: -1 });
// mỗi user chỉ có 1 bản ghi cho mỗi taskId (chống tạo trùng khi client poll nhiều lần)
creationSchema.index(
  { user: 1, taskId: 1 },
  { unique: true, partialFilterExpression: { taskId: { $type: 'string' } } }
);

module.exports = mongoose.models.Creation || mongoose.model('Creation', creationSchema);