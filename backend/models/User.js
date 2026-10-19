// backend/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Không bao giờ trả password ra ngoài trừ khi chủ động .select('+password')
    password: { type: String, select: false },
    name: { type: String, trim: true, default: '' },
    avatar: { type: String, default: '' },
    // Có giá trị khi tài khoản được tạo/liên kết bằng Google
    googleId: { type: String, unique: true, sparse: true },
    // Tiến độ Snap & Solve của riêng tài khoản này
    snapSolve: {
      completed: { type: [Number], default: [] },
      best: { type: mongoose.Schema.Types.Mixed, default: {} },
    },

        // Quên mật khẩu: chỉ lưu mã đã băm, không lưu mã gốc
    resetCodeHash: { type: String, select: false },
    resetCodeExpires: { type: Date, select: false },
    resetAttempts: { type: Number, default: 0, select: false },
    resetSentAt: { type: Date, select: false },
    // Dùng để vô hiệu hóa token cũ sau khi đổi mật khẩu
    passwordChangedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);