/**
 * src/components/gameProgress.js
 * Tiến độ Snap & Solve THEO TỪNG TÀI KHOẢN.
 *
 *  - Bản đệm trong localStorage, key riêng cho mỗi user:  handlab.snapSolve.progress.v1:<userId>
 *  - Đồng bộ lên backend (PUT /api/account/game/snap-solve) để đổi máy / đổi trình duyệt vẫn còn.
 *    Server gộp theo quy tắc: level đã xong = hợp của 2 bên, thời gian tốt nhất = số nhỏ hơn.
 *    => tiến độ chỉ có thể tăng, không bao giờ bị ghi đè lùi.
 *
 * File này không import gì khác (tránh import vòng). auth.js gọi configureProgress() ngay khi biết user.
 */
const BASE_KEY = "handlab.snapSolve.progress.v1";
const MAX_LEVEL = 50;

let ctx = { userId: null, apiBase: "", getToken: () => null };

const userKey = () => (ctx.userId ? `${BASE_KEY}:${ctx.userId}` : null);

/** Chuẩn hóa dữ liệu bất kỳ về { completed: number[], best: { [level]: seconds } } */
export function normalize(raw) {
  const completed = [];
  const best = {};
  if (raw && Array.isArray(raw.completed)) {
    for (const n of raw.completed) {
      if (Number.isInteger(n) && n >= 1 && n <= MAX_LEVEL && !completed.includes(n)) completed.push(n);
    }
  }
  if (raw && raw.best && typeof raw.best === "object") {
    for (const [k, v] of Object.entries(raw.best)) {
      const id = Number(k), t = Number(v);
      if (Number.isInteger(id) && id >= 1 && id <= MAX_LEVEL && Number.isFinite(t) && t > 0) best[id] = t;
    }
  }
  return { completed: completed.sort((a, b) => a - b), best };
}

/** Gộp 2 bản tiến độ: hợp các level đã xong, lấy thời gian nhỏ hơn. */
export function mergeProgress(a, b) {
  const x = normalize(a), y = normalize(b);
  const completed = [...new Set([...x.completed, ...y.completed])].sort((p, q) => p - q);
  const best = { ...x.best };
  for (const [k, v] of Object.entries(y.best)) best[k] = k in best ? Math.min(best[k], v) : v;
  return { completed, best };
}

function readLocal(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null; // localStorage bị chặn / JSON hỏng
  }
}

/** Đọc tiến độ của tài khoản đang đăng nhập (chưa đăng nhập -> rỗng). */
export function readProgress() {
  const key = userKey();
  return (key && readLocal(key)) || { completed: [], best: {} };
}

export function writeProgress(progress) {
  const key = userKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(normalize(progress)));
  } catch { /* ignore */ }
}

/**
 * Gọi 1 lần khi đã biết user (từ auth.js).
 * Tiến độ cũ lưu chung ở key không có userId (trước khi có tính năng này) sẽ được giao cho
 * TÀI KHOẢN ĐẦU TIÊN đăng nhập trên trình duyệt này, rồi xóa key cũ -> các tài khoản khác bắt đầu từ 0.
 */
export function configureProgress({ userId, apiBase = "", getToken = () => null }) {
  ctx = { userId: userId ? String(userId) : null, apiBase, getToken };
  const key = userKey();
  if (!key) return;
  try {
    const legacy = readLocal(BASE_KEY);
    if (legacy && !localStorage.getItem(key)) {
      writeProgress(legacy);
      localStorage.removeItem(BASE_KEY);
    }
  } catch { /* ignore */ }
}

/**
 * Đẩy tiến độ local lên server và nhận lại bản đã gộp (1 request làm cả 2 việc).
 * Lỗi mạng -> giữ nguyên bản local, lần sau đồng bộ lại.
 * Luôn trả về tiến độ mới nhất sau khi gộp.
 */
export async function syncProgress() {
  if (!ctx.userId) return readProgress();
  const sent = readProgress();
  try {
    const res = await fetch(`${ctx.apiBase}/api/account/game/snap-solve`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.getToken() || ""}`,
      },
      body: JSON.stringify(sent),
    });
    if (!res.ok) return readProgress();
    const data = await res.json();
    // gộp với bản local HIỆN TẠI (có thể vừa thắng thêm level trong lúc chờ phản hồi)
    const merged = mergeProgress(readProgress(), data && data.snapSolve);
    writeProgress(merged);
    return merged;
  } catch {
    return readProgress();
  }
}