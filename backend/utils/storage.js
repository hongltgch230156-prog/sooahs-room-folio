// backend/utils/storage.js
// Lưu file (model .glb, ảnh export, thumbnail) lên ổ đĩa của server, trong backend/storage/.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
['models', 'exports', 'thumbs'].forEach((d) =>
  fs.mkdirSync(path.join(STORAGE_DIR, d), { recursive: true })
);

// Tên file ngẫu nhiên 32 ký tự hex => không đoán được link của người khác
const randomName = () => crypto.randomBytes(16).toString('hex');

// Chặn đường dẫn thoát ra ngoài thư mục storage
function resolveSafe(rel) {
  const abs = path.resolve(STORAGE_DIR, rel);
  if (!abs.startsWith(STORAGE_DIR + path.sep)) throw new Error('Đường dẫn không hợp lệ');
  return abs;
}

async function saveBuffer(subdir, ext, buffer) {
  const rel = `${subdir}/${randomName()}${ext}`;
  await fsp.writeFile(resolveSafe(rel), buffer);
  return rel;
}

// Ảnh thu nhỏ 360x300 (JPEG) dùng cho thẻ trong trang Account
async function saveThumb(buffer) {
  const jpg = await sharp(buffer)
    .rotate()
    .resize(360, 300, { fit: 'cover' })
    .flatten({ background: '#ffffff' }) // ảnh PNG trong suốt -> nền trắng
    .jpeg({ quality: 78 })
    .toBuffer();
  return saveBuffer('thumbs', '.jpg', jpg);
}

async function removeFiles(...rels) {
  for (const rel of rels) {
    if (!rel) continue;
    try {
      await fsp.unlink(resolveSafe(rel));
    } catch {
      /* file đã mất thì thôi */
    }
  }
}

// Chỉ tải về từ CDN của fal (tránh để client bắt server tải một link bất kỳ)
function isFalUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:') return false;
    return (
      u.hostname === 'fal.media' ||
      u.hostname.endsWith('.fal.media') ||
      (u.hostname === 'storage.googleapis.com' && u.pathname.startsWith('/falserverless/'))
    );
  } catch {
    return false;
  }
}

async function fetchBuffer(url, maxBytes) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tải file thất bại (${res.status})`);
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared && declared > maxBytes) throw new Error('File quá lớn');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error('File quá lớn');
  return buf;
}

// "/files/models/abc.glb" – đường dẫn công khai (được phục vụ bởi express.static ở server.js)
const publicPath = (rel) => (rel ? `/files/${rel}` : '');

module.exports = { STORAGE_DIR, saveBuffer, saveThumb, removeFiles, isFalUrl, fetchBuffer, publicPath };