// backend/utils/modelTasks.js
// Tự ghi lại model 3D của user ngay khi họ bấm Generate (không cần sửa forge.js).
//  - trackModelTask:    gọi sau khi gửi task lên fal  -> tạo bản ghi "pending" + thumbnail
//  - finalizeModelTask: gọi khi task hoàn tất         -> chuyển "ready" và tải file .glb về server
const Creation = require('../models/Creation');
const storage = require('./storage');

const MAX_GLB_BYTES = 150 * 1024 * 1024;
const MAX_THUMB_SOURCE_BYTES = 15 * 1024 * 1024;

const DEFAULT_NAMES = { single: '3D Object', scene: '3D Scene', magic: 'Magic Wand object' };

function cleanName(raw, kind) {
  const base = String(raw || '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, 60);
  return base || DEFAULT_NAMES[kind] || '3D Model';
}

/** Không bao giờ ném lỗi: việc lưu lịch sử không được làm hỏng việc tạo model. */
async function trackModelTask(userId, taskId, { kind, name, thumbBuffer, thumbUrl }) {
  try {
    let thumb = '';
    try {
      if (thumbBuffer) {
        thumb = await storage.saveThumb(thumbBuffer);
      } else if (thumbUrl && storage.isFalUrl(thumbUrl)) {
        thumb = await storage.saveThumb(await storage.fetchBuffer(thumbUrl, MAX_THUMB_SOURCE_BYTES));
      }
    } catch (e) {
      console.warn('[Account] Không tạo được thumbnail:', e.message);
    }
    await Creation.create({
      user: userId,
      type: 'model',
      kind,
      name: cleanName(name, kind),
      status: 'pending',
      taskId,
      thumb,
    });
  } catch (e) {
    if (e.code !== 11000) console.error('[Account] trackModelTask:', e.message);
  }
}

/** Gọi mỗi lần client hỏi trạng thái. Chỉ lần đầu tiên (pending -> ready) mới tải file về. */
async function finalizeModelTask(userId, taskId, glbUrl) {
  try {
    const doc = await Creation.findOneAndUpdate(
      { user: userId, type: 'model', taskId, status: 'pending' },
      { status: 'ready', remoteUrl: glbUrl },
      { new: true }
    );
    if (!doc) return; // đã xử lý rồi, hoặc task này không phải của user
    if (!storage.isFalUrl(glbUrl)) return;
    const buf = await storage.fetchBuffer(glbUrl, MAX_GLB_BYTES);
    doc.file = await storage.saveBuffer('models', '.glb', buf);
    await doc.save();
  } catch (e) {
    // Không sao: bản ghi vẫn "ready" và dùng tạm link fal (còn sống tối thiểu 7 ngày)
    console.error('[Account] finalizeModelTask:', e.message);
  }
}

module.exports = { trackModelTask, finalizeModelTask };