// backend/routes/accountRoutes.js
// Mount SAU `app.use('/api', requireAuth)` để req.user đã có.
//   GET    /api/account/models | /exports
//   POST   /api/account/exports          (multipart: image, kind)
//   PATCH  /api/account/models|exports/:id   { name }
//   DELETE /api/account/models|exports/:id
//   PUT    /api/account/game/snap-solve  { completed, best }  -> { snapSolve }  (tiến độ game theo tài khoản)
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const mongoose = require('mongoose');
const Creation = require('../models/Creation');
const User = require('../models/User');
const storage = require('../utils/storage');

const router = express.Router();

const MAX_EXPORTS_PER_USER = 200;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const STALE_PENDING_MS = 2 * 24 * 60 * 60 * 1000; // task treo/lỗi quá 2 ngày thì dọn

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

// Express 5 không còn hỗ trợ regex trong tham số (":type(models|exports)"),
// nên đăng ký route riêng cho từng loại.
const SEGMENTS = { models: 'model', exports: 'export' };

const toJson = (c) => ({
  id: c._id,
  name: c.name || 'Untitled',
  kind: c.kind,
  thumbnail: storage.publicPath(c.thumb),
  url: c.file ? storage.publicPath(c.file) : c.remoteUrl || '',
  createdAt: c.createdAt,
});

const serverError = (res, tag, err) => {
  console.error(`[account/${tag}]`, err);
  res.status(500).json({ error: 'Lỗi máy chủ, vui lòng thử lại sau.' });
};

for (const [segment, type] of Object.entries(SEGMENTS)) {
  /* ------------------------------ Danh sách ------------------------------ */
  router.get(`/${segment}`, async (req, res) => {
    try {
      if (type === 'model') {
        // dọn các task không bao giờ hoàn tất (lỗi / user đóng tab)
        const stale = await Creation.find({
          user: req.user._id,
          type: 'model',
          status: 'pending',
          createdAt: { $lt: new Date(Date.now() - STALE_PENDING_MS) },
        });
        for (const s of stale) {
          await storage.removeFiles(s.thumb);
          await s.deleteOne();
        }
      }
      const items = await Creation.find({ user: req.user._id, type, status: 'ready' })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
      res.json({ items: items.map(toJson) });
    } catch (err) {
      serverError(res, `list-${segment}`, err);
    }
  });

  /* ------------------------------ Đổi tên ------------------------------ */
  router.patch(`/${segment}/:id`, async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy.' });
      const name = String(req.body?.name ?? '').trim().slice(0, 60);
      if (!name) return res.status(400).json({ error: 'Tên không được để trống.' });
      const doc = await Creation.findOne({ _id: req.params.id, user: req.user._id, type, status: 'ready' });
      if (!doc) return res.status(404).json({ error: 'Không tìm thấy.' });
      doc.name = name;
      await doc.save();
      res.json({ item: toJson(doc) });
    } catch (err) {
      serverError(res, `rename-${segment}`, err);
    }
  });

  /* ------------------------------ Xóa ------------------------------ */
  router.delete(`/${segment}/:id`, async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy.' });
      const doc = await Creation.findOne({ _id: req.params.id, user: req.user._id, type });
      if (!doc) return res.status(404).json({ error: 'Không tìm thấy.' });
      await storage.removeFiles(doc.file, doc.thumb);
      await doc.deleteOne();
      res.status(204).end();
    } catch (err) {
      serverError(res, `delete-${segment}`, err);
    }
  });
}

/* ------------------------------ Lưu ảnh export 2D ------------------------------ */
const handleUpload = (req, res, next) =>
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooBig ? 413 : 400).json({
      error: tooBig ? 'Ảnh quá lớn (tối đa 12MB).' : 'Không đọc được ảnh tải lên.',
    });
  });

router.post('/exports', handleUpload, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Thiếu ảnh.' });

    const count = await Creation.countDocuments({ user: req.user._id, type: 'export' });
    if (count >= MAX_EXPORTS_PER_USER) {
      return res.status(409).json({ error: `Bạn đã lưu tối đa ${MAX_EXPORTS_PER_USER} ảnh. Hãy xóa bớt ảnh cũ.` });
    }

    // Kiểm tra đó thật sự là ảnh (không tin vào mimetype do client gửi)
    let meta;
    try {
      meta = await sharp(req.file.buffer).metadata();
    } catch {
      return res.status(400).json({ error: 'File không phải ảnh hợp lệ.' });
    }
    const ext = { png: '.png', jpeg: '.jpg', webp: '.webp' }[meta.format];
    if (!ext) return res.status(400).json({ error: 'Chỉ hỗ trợ ảnh PNG, JPG hoặc WebP.' });

    const kind = req.body?.kind === 'ai-style' ? 'ai-style' : 'render';
    const file = await storage.saveBuffer('exports', ext, req.file.buffer);
    let thumb = '';
    try {
      thumb = await storage.saveThumb(req.file.buffer);
    } catch (e) {
      console.warn('[account/exports] thumbnail:', e.message);
    }

    const doc = await Creation.create({
      user: req.user._id,
      type: 'export',
      kind,
      status: 'ready',
      name: kind === 'ai-style' ? 'AI style image' : '3D render',
      file,
      thumb,
    });
    res.status(201).json({ item: toJson(doc) });
  } catch (err) {
    serverError(res, 'save-export', err);
  }
});

/* ------------------------------ Tiến độ Snap & Solve ------------------------------ */
const MAX_GAME_LEVEL = 50;

// Chỉ nhận số nguyên level hợp lệ và thời gian hợp lý (0 < t < 24h)
function sanitizeSnap(raw) {
  const completed = [];
  const best = {};
  if (Array.isArray(raw?.completed)) {
    for (const n of raw.completed) {
      if (Number.isInteger(n) && n >= 1 && n <= MAX_GAME_LEVEL && !completed.includes(n)) completed.push(n);
    }
  }
  if (raw?.best && typeof raw.best === 'object') {
    for (const [k, v] of Object.entries(raw.best)) {
      const id = Number(k);
      const t = Number(v);
      if (Number.isInteger(id) && id >= 1 && id <= MAX_GAME_LEVEL && Number.isFinite(t) && t > 0 && t < 86400) {
        best[id] = Math.round(t * 100) / 100;
      }
    }
  }
  return { completed: completed.sort((a, b) => a - b), best };
}

// Client gửi bản của mình, server GỘP vào bản đã lưu (hợp level đã xong, thời gian nhỏ hơn thắng)
// rồi trả lại bản đã gộp. Dùng toán tử nguyên tử ($addToSet / $min) nên 2 request cùng lúc không ghi đè nhau.
router.put('/game/snap-solve', async (req, res) => {
  try {
    const incoming = sanitizeSnap(req.body);
    const update = {};
    if (incoming.completed.length) update.$addToSet = { 'snapSolve.completed': { $each: incoming.completed } };
    const minOps = {};
    for (const [id, t] of Object.entries(incoming.best)) minOps[`snapSolve.best.${id}`] = t;
    if (Object.keys(minOps).length) update.$min = minOps;
    if (Object.keys(update).length) await User.updateOne({ _id: req.user._id }, update);

    const user = await User.findById(req.user._id).select('snapSolve').lean();
    res.json({ snapSolve: sanitizeSnap(user?.snapSolve) });
  } catch (err) {
    serverError(res, 'snap-solve', err);
  }
});

module.exports = router;