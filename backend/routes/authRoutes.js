// backend/routes/authRoutes.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const crypto = require('crypto');
const { sendResetCode } = require('../utils/mailer');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

// Chống dò mật khẩu: tối đa 30 lần thử / 15 phút / mỗi IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Bạn thử quá nhiều lần, vui lòng đợi vài phút rồi thử lại.' },
});

const signToken = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

const publicUser = (u) => ({ id: u._id, email: u.email, name: u.name, avatar: u.avatar });

// Hash giả để thời gian phản hồi khi "email không tồn tại" gần bằng khi "sai mật khẩu"
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

/* ----------------------------- Cấu hình quên mật khẩu ----------------------------- */
const RESET_TTL_MS = 10 * 60 * 1000;   // mã sống 10 phút
const RESET_COOLDOWN_MS = 60 * 1000;   // gửi lại tối thiểu cách nhau 60 giây
const RESET_MAX_ATTEMPTS = 5;          // nhập sai tối đa 5 lần

// Giới hạn riêng cho việc xin mã: 5 lần / 15 phút / IP (chống spam mail)
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'You have made too many requests, please wait a few minutes and try again.' },
});

const hashCode = (code) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET).update(code).digest('hex');

/* ----------------------------- Đăng ký ----------------------------- */
router.post('/register', limiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email không hợp lệ.' });
    if (password.length < MIN_PASSWORD)
      return res.status(400).json({ error: `Mật khẩu cần ít nhất ${MIN_PASSWORD} ký tự.` });
    if (password.length > 72)
      return res.status(400).json({ error: 'Mật khẩu quá dài (tối đa 72 ký tự).' });

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({
        error: existing.googleId && !existing.password
          ? 'Email này đã đăng ký bằng Google, hãy bấm "Tiếp tục với Google".'
          : 'Email này đã được đăng ký. Hãy đăng nhập nhé.',
      });
    }

    const user = await User.create({
      email,
      password: await bcrypt.hash(password, 12),
      name: email.split('@')[0],
    });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email này đã được đăng ký.' });
    console.error('[auth/register]', err);
    res.status(500).json({ error: 'Lỗi máy chủ, vui lòng thử lại sau.' });
  }
});

/* ----------------------------- Đăng nhập ----------------------------- */
router.post('/login', limiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!EMAIL_RE.test(email) || !password)
      return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu.' });

    const user = await User.findOne({ email }).select('+password');
    const ok = await bcrypt.compare(password, user?.password || DUMMY_HASH);

    if (!user || !user.password || !ok) {
      if (user && !user.password && user.googleId)
        return res.status(401).json({ error: 'Tài khoản này đăng nhập bằng Google. Hãy bấm "Tiếp tục với Google".' });
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });
    }

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Lỗi máy chủ, vui lòng thử lại sau.' });
  }
});

/* ----------------------------- Google ----------------------------- */
// Frontend gửi access_token (lấy từ popup Google). Backend kiểm tra token đó
// đúng là cấp cho app của mình, rồi lấy email/tên/ảnh từ Google.
router.post('/google', limiter, async (req, res) => {
  try {
    const accessToken = String(req.body.accessToken || '');
    if (!accessToken) return res.status(400).json({ error: 'Thiếu token Google.' });
    if (!process.env.GOOGLE_CLIENT_ID)
      return res.status(500).json({ error: 'Server chưa cấu hình GOOGLE_CLIENT_ID.' });

    // 1) Token phải được cấp cho đúng Client ID của mình
    const infoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!infoRes.ok) return res.status(401).json({ error: 'Token Google không hợp lệ.' });
    const tokenInfo = await infoRes.json();
    if (tokenInfo.aud !== process.env.GOOGLE_CLIENT_ID)
      return res.status(401).json({ error: 'Token Google không thuộc ứng dụng này.' });

    // 2) Lấy thông tin tài khoản
    const profRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!profRes.ok) return res.status(401).json({ error: 'Không lấy được thông tin từ Google.' });
    const profile = await profRes.json();
    if (!profile.email || !profile.email_verified)
      return res.status(401).json({ error: 'Email Google chưa được xác minh.' });

    const email = profile.email.toLowerCase();
    let user = await User.findOne({ $or: [{ googleId: profile.sub }, { email }] });

    if (!user) {
      user = await User.create({ email, googleId: profile.sub, name: profile.name || email.split('@')[0], avatar: profile.picture || '' });
    } else {
      // Liên kết Google vào tài khoản email đã có
      let dirty = false;
      if (!user.googleId) { user.googleId = profile.sub; dirty = true; }
      if (!user.avatar && profile.picture) { user.avatar = profile.picture; dirty = true; }
      if (!user.name && profile.name) { user.name = profile.name; dirty = true; }
      if (dirty) await user.save();
    }

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error('[auth/google]', err);
    res.status(500).json({ error: 'Đăng nhập Google thất bại, vui lòng thử lại.' });
  }
});

/* ----------------------------- Ai đang đăng nhập? ----------------------------- */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

/* ----------------------------- Đổi tên hiển thị ----------------------------- */
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const name = String(req.body?.name ?? '').trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: 'Tên không được để trống.' });
    const user = await User.findByIdAndUpdate(req.user._id, { name }, { new: true });
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('[auth/patch-me]', err);
    res.status(500).json({ error: 'Lỗi máy chủ, vui lòng thử lại sau.' });
  }
});

/* ----------------------------- Quên mật khẩu: xin mã ----------------------------- */
router.post('/forgot-password', forgotLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email không hợp lệ.' });

    const user = await User.findOne({ email }).select('+resetSentAt');
    if (!user) {
      return res.status(404).json({
        code: 'EMAIL_NOT_FOUND',
        error: 'Email này chưa được đăng ký. Hãy đăng ký tài khoản mới hoặc dùng email khác.',
      });
    }

    const inCooldown =
      user.resetSentAt && Date.now() - user.resetSentAt.getTime() < RESET_COOLDOWN_MS;

    if (!inCooldown) {
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      user.resetCodeHash = hashCode(code);
      user.resetCodeExpires = new Date(Date.now() + RESET_TTL_MS);
      user.resetAttempts = 0;
      user.resetSentAt = new Date();
      await user.save();
      sendResetCode(email, code).catch((err) => console.error('[auth/forgot-mail]', err.message));
    }
    res.json({ message: 'Mã xác nhận đã được gửi tới email của bạn. Mã có hiệu lực 10 phút.' });
  } catch (err) {
    console.error('[auth/forgot-password]', err);
    res.status(500).json({ error: 'Lỗi máy chủ, vui lòng thử lại sau.' });
  }
});

/* ----------------------------- Quên mật khẩu: đặt mật khẩu mới ----------------------------- */
router.post('/reset-password', limiter, async (req, res) => {
  const BAD = { error: 'Mã không đúng hoặc đã hết hạn.' };
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    const password = String(req.body.password || '');

    if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) return res.status(400).json(BAD);
    if (password.length < MIN_PASSWORD)
      return res.status(400).json({ error: `Mật khẩu cần ít nhất ${MIN_PASSWORD} ký tự.` });
    if (password.length > 72)
      return res.status(400).json({ error: 'Mật khẩu quá dài (tối đa 72 ký tự).' });

    const user = await User.findOne({ email }).select('+resetCodeHash +resetCodeExpires +resetAttempts');
    if (!user || !user.resetCodeHash || !user.resetCodeExpires || user.resetCodeExpires < new Date())
      return res.status(400).json(BAD);
    if (user.resetAttempts >= RESET_MAX_ATTEMPTS)
      return res.status(429).json({ error: 'Bạn đã nhập sai quá nhiều lần, hãy yêu cầu mã mới.' });

    const ok = crypto.timingSafeEqual(Buffer.from(hashCode(code)), Buffer.from(user.resetCodeHash));
    if (!ok) {
      user.resetAttempts += 1;
      await user.save();
      return res.status(400).json(BAD);
    }

    user.password = await bcrypt.hash(password, 12);
    user.passwordChangedAt = new Date();
    // Dùng xong là xóa mã (mã chỉ dùng được 1 lần)
    user.resetCodeHash = undefined;
    user.resetCodeExpires = undefined;
    user.resetAttempts = 0;
    user.resetSentAt = undefined;
    await user.save();

    res.json({ message: 'Đặt lại mật khẩu thành công. Hãy đăng nhập bằng mật khẩu mới.' });
  } catch (err) {
    console.error('[auth/reset-password]', err);
    res.status(500).json({ error: 'Lỗi máy chủ, vui lòng thử lại sau.' });
  }
});

module.exports = router;