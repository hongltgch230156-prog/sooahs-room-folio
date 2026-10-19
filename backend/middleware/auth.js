// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Yêu cầu header:  Authorization: Bearer <token>
 * Hợp lệ -> gắn req.user rồi cho đi tiếp, sai/hết hạn -> 401.
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Bạn cần đăng nhập để tiếp tục.' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).select('email name avatar passwordChangedAt');
    if (!user) return res.status(401).json({ error: 'Tài khoản không còn tồn tại.' });
    if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime())
      return res.status(401).json({ error: 'Mật khẩu đã thay đổi, vui lòng đăng nhập lại.' });

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.' });
  }
}

module.exports = { requireAuth };