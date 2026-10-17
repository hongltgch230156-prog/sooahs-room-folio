/**
 * src/components/account.js
 * Nút Account (thay cho nút Logout) + trang hồ sơ người dùng.
 *
 * Gắn từ auth.js:
 *   import { mountAccountButton } from "./account.js";
 *   mountAccountButton({ user, apiBase: API_BASE, getToken, onLogout: logout });
 *
 * File này KHÔNG import auth.js (tránh import vòng) – mọi thứ cần dùng được truyền vào.
 *
 * API backend mà trang này gọi:
 *   PATCH  /api/auth/me                      { name }            -> { user }
 *   GET    /api/account/models               -> { items: [{ id, name, thumbnail, url, createdAt }] }
 *   GET    /api/account/exports              -> { items: [...] }
 *   PATCH  /api/account/{models|exports}/:id { name }
 *   DELETE /api/account/{models|exports}/:id
 * (thumbnail / url có thể là đường dẫn tương đối "/files/..." -> tự ghép với apiBase)
 *
 * Tiến độ Snap & Solve đọc từ gameProgress.js (theo từng tài khoản, có đồng bộ với server).
 *
 * Xem thử giao diện khi chưa có backend: thêm  ?accountDemo=1  vào URL.
 */

import { readProgress, syncProgress } from "./gameProgress.js";

const DEMO = typeof location !== "undefined" && new URLSearchParams(location.search).has("accountDemo");

/* ------------------------------------------------------------------ */
/*  Icon                                                               */
/* ------------------------------------------------------------------ */
const stroke = (inner, cls = "") =>
  `<svg class="acc-ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const IC = {
  // nút trên thanh góc phải: icon người ĐẶC (giống ảnh thiết kế)
  userBtn: `<svg class="account-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.6" r="4.2"/><path d="M4.2 19.2c0-3.1 2.5-5.1 7.8-5.1s7.8 2 7.8 5.1c0 .9-.7 1.5-1.5 1.5H5.7c-.8 0-1.5-.6-1.5-1.5z"/></svg>`,
  close: stroke(`<path d="M6 6l12 12M18 6 6 18"/>`),
  edit: stroke(`<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>`),
  check: stroke(`<path d="m5 12.5 4.5 4.5L19 7.5"/>`),
  eye: stroke(`<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>`),
  trash: stroke(`<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>`),
  cube: stroke(`<path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10"/>`),
  image: stroke(`<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-5-5L5 21"/>`),
  card: stroke(`<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6.5 15h3"/>`),
  crown: stroke(`<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>`),
  download: stroke(`<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>`),
  puzzle: stroke(`<path d="M10 3a2 2 0 1 1 4 0v1.5h3.5A1.5 1.5 0 0 1 19 6v3.5h1.5a2 2 0 1 1 0 4H19V17a1.5 1.5 0 0 1-1.5 1.5H14V17a2 2 0 1 0-4 0v1.5H6.5A1.5 1.5 0 0 1 5 17v-3.5h1.5a2 2 0 1 0 0-4H5V6a1.5 1.5 0 0 1 1.5-1.5H10z"/>`),
  logout: stroke(`<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>`),
};

/* ------------------------------------------------------------------ */
/*  Tiện ích                                                           */
/* ------------------------------------------------------------------ */
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

// chỉ cho phép http(s), blob và ảnh data: -> không để URL lạ chui vào thuộc tính src
const safeUrl = (u) => (typeof u === "string" && /^(https?:|blob:|data:image\/)/i.test(u) ? u : "");

const fmtDate = (v) => {
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const displayName = (u) => (u?.name || u?.displayName || (u?.email ? u.email.split("@")[0] : "") || "Creative User");

const initials = (u) => {
  const parts = displayName(u).trim().split(/\s+/);
  return ((parts[0]?.[0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};

// ảnh minh họa tạm khi mục chưa có thumbnail
const placeholderThumb = (seed, kind) => {
  const hues = [265, 285, 305, 245, 325];
  const h = hues[Math.abs([...String(seed)].reduce((a, c) => a + c.charCodeAt(0), 0)) % hues.length];
  const glyph = kind === "exports"
    ? `<rect x="-22" y="-18" width="44" height="36" rx="7"/><circle cx="-9" cy="-6" r="4" fill="#fff" stroke="none"/><path d="m22 8-11-11L-14 18" fill="none"/>`
    : `<path d="M0-26 22-13v26L0 26-22 13v-26z"/><path d="M-22-13 0 0l22-13M0 0v26" fill="none"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 70% 86%)"/><stop offset="1" stop-color="hsl(${h + 20} 60% 72%)"/></linearGradient></defs><rect width="160" height="120" fill="url(#g)"/><g transform="translate(80 60)" fill="hsl(${h} 45% 55%)" fill-opacity=".85" stroke="hsl(${h} 45% 40%)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${glyph}</g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

/* ------------------------------------------------------------------ */
/*  Tiến độ Snap & Solve (đọc từ localStorage do snapSolve.js ghi)     */
/* ------------------------------------------------------------------ */
// Thứ tự + tên trùng với bảng LEVELS trong snapSolve.js
const GAME_LEVELS = ["Classic", "Twist & Lock", "Spotlight", "Catch & Build", "Pose Lock"];

// Tiến độ của TÀI KHOẢN đang đăng nhập (xem gameProgress.js). Chỉ ở chế độ ?accountDemo mới có số liệu mẫu.
function readGameProgress() {
  const p = readProgress();
  if (DEMO && !p.completed.length) return { completed: [1, 2, 3], best: { 1: 41.2, 2: 78.9, 3: 95.4 } };
  return p;
}

const fmtTime = (secs) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;

const safeFileName = (name) =>
  String(name || "creation").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 50) || "creation";

/* ------------------------------------------------------------------ */
/*  Xem model 3D (three.js nạp lười – chỉ tải khi bấm xem)             */
/* ------------------------------------------------------------------ */
async function mountModelViewer(host, url) {
  const [THREE, { GLTFLoader }, { OrbitControls }, { RoomEnvironment }] = await Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/controls/OrbitControls.js"),
    import("three/examples/jsm/environments/RoomEnvironment.js"),
  ]);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "account-viewer-canvas";
  host.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(3, 5, 4);
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0x9a8bc0, 0.8));

  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.6;
  controls.addEventListener("start", () => { controls.autoRotate = false; });

  let disposed = false;
  let raf = 0;
  const ro = new ResizeObserver(() => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  ro.observe(host);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    controls.dispose();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      mats.forEach((m) => {
        Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); });
        m.dispose();
      });
    });
    envTex.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    if (disposed) return dispose;
    const obj = gltf.scene;
    // đưa model về giữa, co về cỡ chuẩn rồi đặt camera vừa khung
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    obj.position.sub(center);
    const wrap = new THREE.Group();
    wrap.add(obj);
    wrap.scale.setScalar(2 / maxDim);
    scene.add(wrap);
    camera.position.set(2.6, 1.6, 3.6);
    controls.target.set(0, 0, 0);
    controls.update();
  } catch (err) {
    dispose();
    throw err;
  }

  const loop = () => {
    raf = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  };
  loop();
  return dispose;
}

/* ------------------------------------------------------------------ */
/*  Dữ liệu demo (chỉ dùng với ?accountDemo=1)                         */
/* ------------------------------------------------------------------ */
const demoItems = () => ({
  models: [
    { id: "d1", name: "Cozy Room Diorama", createdAt: "2025-10-12" },
    { id: "d2", name: "Pastel Chair", createdAt: "2025-10-08" },
    { id: "d3", name: "Plant Lamp", createdAt: "2025-10-05" },
  ],
  exports: Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, name: `Export #${i + 1}`, createdAt: `2025-10-${String(14 - i).padStart(2, "0")}` })),
});

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
let mounted = false;

export function mountAccountButton({ user, apiBase = "", getToken = () => null, onLogout = () => {} }) {
  if (mounted || document.querySelector(".account-button")) return;
  mounted = true;

  const state = {
    user: { ...user },
    tab: "models",             // "models" | "exports"
    lists: { models: null, exports: null },   // null = chưa tải
    loading: false,
    failed: false,
    editingProfile: false,
    renamingId: null,
    confirmId: null,
  };
  let confirmTimer = 0;
  let toastTimer = 0;

  /* ---------- nút trên thanh góc phải ---------- */
  const btn = document.createElement("button");
  btn.className = "account-button toggle-buttons";
  btn.type = "button";
  btn.title = "Account";
  btn.setAttribute("aria-label", "Open account");
  btn.setAttribute("aria-haspopup", "dialog");
  btn.innerHTML = IC.userBtn;
  document.body.appendChild(btn);

  /* ---------- khung modal (dựng 1 lần) ---------- */
  const root = document.createElement("div");
  root.className = "account-root";
  root.innerHTML = `
    <div class="account-backdrop"></div>
    <section class="account-card" role="dialog" aria-modal="true" aria-labelledby="account-title">
      <header class="account-head">
        <h2 id="account-title">Account</h2>
        <button class="account-close" type="button" aria-label="Close">${IC.close}</button>
      </header>
      <div class="account-scroll">
        <div class="account-profile"></div>
        <div class="account-stats"></div>
        <div class="account-tabs" role="tablist">
          <button class="account-tab" role="tab" data-tab="models" type="button">${IC.cube}<span>My 3D Models</span></button>
          <button class="account-tab" role="tab" data-tab="exports" type="button">${IC.image}<span>My 2D Exports</span></button>
        </div>
        <div class="account-grid" role="tabpanel"></div>
        <div class="account-game"></div>
        <div class="account-plan">
          <div class="account-plan-icon">${IC.card}</div>
          <div class="account-plan-text">
            <p class="account-plan-title">Plan &amp; Billing <span class="account-badge">Coming soon</span></p>
            <p class="account-plan-sub">Upgrade your plan and unlock more features.</p>
          </div>
          <button class="account-upgrade" type="button" disabled>${IC.crown}<span>Upgrade plan</span></button>
        </div>
      </div>
      <div class="account-toast" role="status" aria-live="polite"></div>
    </section>
    <div class="account-viewer" hidden>
      <div class="account-viewer-backdrop"></div>
      <figure class="account-viewer-box" role="dialog" aria-modal="true" aria-label="Preview">
        <header class="account-viewer-head">
          <h3 class="account-viewer-title"></h3>
          <button class="account-pill" type="button" data-act="download">${IC.download}<span>Download</span></button>
          <button class="account-close account-viewer-close" type="button" aria-label="Close preview">${IC.close}</button>
        </header>
        <div class="account-viewer-stage"></div>
        <figcaption class="account-viewer-hint"></figcaption>
      </figure>
    </div>`;
  document.body.appendChild(root);

  const $ = (s) => root.querySelector(s);
  const elProfile = $(".account-profile");
  const elStats = $(".account-stats");
  const elGrid = $(".account-grid");
  const elToast = $(".account-toast");
  const elGame = $(".account-game");
  const viewer = $(".account-viewer");
  const viewerStage = $(".account-viewer-stage");
  const viewerTitle = $(".account-viewer-title");
  const viewerHint = $(".account-viewer-hint");
  const tabs = [...root.querySelectorAll(".account-tab")];

  /* ---------- gọi API ---------- */
  async function api(path, opts = {}) {
    const res = await fetch(`${apiBase}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken() || ""}`,
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return res.status === 204 ? null : res.json().catch(() => null);
  }
  // "/files/abc.glb" (đường dẫn tương đối từ backend) -> "http://localhost:3000/files/abc.glb"
  const asset = (u) => (typeof u === "string" && u ? safeUrl(u.startsWith("/") ? apiBase + u : u) : "");
  const pickItems = (data, key) => (Array.isArray(data) ? data : data?.items || data?.[key] || []);

  function toast(msg, isError = false) {
    elToast.textContent = msg;
    elToast.classList.toggle("is-error", isError);
    elToast.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elToast.classList.remove("is-show"), 2600);
  }

  // silent = true: đã có dữ liệu cũ -> tải lại ngầm (không hiện skeleton), lỗi thì giữ nguyên dữ liệu cũ
  async function load(silent = false) {
    if (state.loading) return;
    if (!silent) {
      state.loading = true;
      state.failed = false;
      renderAll();
    }
    if (DEMO) {
      if (!silent) await new Promise((r) => setTimeout(r, 450));
      if (!state.lists.models) {
        const d = demoItems();
        state.lists.models = d.models;
        state.lists.exports = d.exports;
      }
    } else {
      const [m, e] = await Promise.allSettled([api("/api/account/models"), api("/api/account/exports")]);
      if (m.status === "fulfilled") state.lists.models = pickItems(m.value, "models");
      else if (!silent) state.lists.models = null;
      if (e.status === "fulfilled") state.lists.exports = pickItems(e.value, "exports");
      else if (!silent) state.lists.exports = null;
      if (!silent) state.failed = m.status === "rejected" && e.status === "rejected";
    }
    state.loading = false;
    // đang đổi tên / chờ xác nhận xóa thì đừng vẽ lại làm mất thao tác của user
    if (silent && (state.renamingId || state.confirmId)) return renderStats();
    renderAll();
  }

  /* ---------- render ---------- */
  function renderProfile() {
    const u = state.user;
    const pic = safeUrl(u.avatar || u.picture || u.photo || u.avatarUrl);
    const avatar = pic
      ? `<img src="${esc(pic)}" alt="" referrerpolicy="no-referrer">`
      : `<span>${esc(initials(u))}</span>`;
    const name = state.editingProfile
      ? `<input class="account-name-input" type="text" maxlength="40" value="${esc(displayName(u))}" aria-label="Display name">`
      : `<h3 class="account-name">${esc(displayName(u))}</h3>`;
    elProfile.innerHTML = `
      <div class="account-avatar">${avatar}</div>
      <div class="account-info">
        ${name}
        <p class="account-email">${esc(u.email || "")}</p>
        <div class="account-actions">
          <button class="account-pill" type="button" data-act="edit-profile">
            ${state.editingProfile ? IC.check : IC.edit}<span>${state.editingProfile ? "Save" : "Edit profile"}</span>
          </button>
          ${state.editingProfile
            ? `<button class="account-pill is-ghost" type="button" data-act="cancel-profile"><span>Cancel</span></button>`
            : `<button class="account-pill is-ghost" type="button" data-act="logout">${IC.logout}<span>Log out</span></button>`}
        </div>
      </div>`;
    if (state.editingProfile) {
      const input = elProfile.querySelector(".account-name-input");
      input.focus();
      input.select();
    }
  }

  function renderStats() {
    const m = state.lists.models, e = state.lists.exports;
    const a = m ? m.length : 0, b = e ? e.length : 0;
    const val = (v, loaded) => (loaded ? v : "–");
    elStats.innerHTML = `
      <div class="account-stat"><strong>${val(a, !!m)}</strong><span>3D Models</span></div>
      <div class="account-stat"><strong>${val(b, !!e)}</strong><span>2D Exports</span></div>
      <div class="account-stat"><strong>${val(a + b, !!m || !!e)}</strong><span>Creations</span></div>`;
  }

  function renderTabs() {
    tabs.forEach((t) => {
      const on = t.dataset.tab === state.tab;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", String(on));
    });
  }

  function renderGrid() {
    const list = state.lists[state.tab];
    if (state.loading) {
      elGrid.className = "account-grid";
      elGrid.innerHTML = Array.from({ length: 3 }, () =>
        `<div class="account-item is-skeleton"><div class="account-thumb"></div><i></i><i class="short"></i></div>`).join("");
      return;
    }
    if (state.failed || list === null) {
      elGrid.className = "account-grid is-empty";
      elGrid.innerHTML = `
        <div class="account-empty">
          <p>Couldn't load your creations.</p>
          <button class="account-pill" type="button" data-act="retry"><span>Try again</span></button>
        </div>`;
      return;
    }
    if (!list.length) {
      elGrid.className = "account-grid is-empty";
      elGrid.innerHTML = `
        <div class="account-empty">
          ${state.tab === "models" ? IC.cube : IC.image}
          <p>${state.tab === "models"
            ? "No 3D models yet. Create one in 3D Forge and it will show up here."
            : "No exports yet. Your exported images will show up here."}</p>
        </div>`;
      return;
    }
    elGrid.className = "account-grid";
    elGrid.innerHTML = list.map((it) => {
      const thumb = asset(it.thumbnail || it.thumbnailUrl || it.image) || placeholderThumb(it.id || it.name, state.tab);
      const renaming = state.renamingId === it.id;
      const confirming = state.confirmId === it.id;
      const title = renaming
        ? `<input class="account-rename-input" type="text" maxlength="60" value="${esc(it.name)}" aria-label="Name">`
        : `<h3 class="account-item-name" title="${esc(it.name)}">${esc(it.name || "Untitled")}</h3>`;
      return `
        <article class="account-item" data-id="${esc(it.id)}">
          <div class="account-thumb"><img src="${esc(thumb)}" alt="" loading="lazy"></div>
          ${title}
          <p class="account-item-date">${esc(fmtDate(it.createdAt || it.created_at))}</p>
          <div class="account-item-actions">
            <button type="button" data-act="view" aria-label="View" title="View">${IC.eye}</button>
            <button type="button" data-act="rename" aria-label="Rename" title="Rename">${renaming ? IC.check : IC.edit}</button>
            <button type="button" data-act="delete" class="${confirming ? "is-confirm" : ""}" aria-label="Delete"
                    title="${confirming ? "Click again to delete" : "Delete"}">${confirming ? "<span>Sure?</span>" : IC.trash}</button>
          </div>
        </article>`;
    }).join("");
    if (state.renamingId) {
      const input = elGrid.querySelector(".account-rename-input");
      input?.focus();
      input?.select();
    }
  }

  function renderGame() {
    const g = readGameProgress();
    const done = GAME_LEVELS.filter((_, i) => g.completed.includes(i + 1)).length;
    elGame.innerHTML = `
      <div class="account-game-head">
        <div class="account-plan-icon">${IC.puzzle}</div>
        <div class="account-plan-text">
          <p class="account-plan-title">Hand Lab · Snap &amp; Solve</p>
          <p class="account-plan-sub">${done ? "Your best time on each level." : "Play Snap &amp; Solve in Hand Lab to earn stars."}</p>
        </div>
        <div class="account-game-stars" aria-label="${done} of ${GAME_LEVELS.length} levels completed">⭐ ${done}/${GAME_LEVELS.length}</div>
      </div>
      <div class="account-levels">
        ${GAME_LEVELS.map((name, i) => {
          const id = i + 1;
          const isDone = g.completed.includes(id);
          const t = Number(g.best[id]);
          return `<div class="account-level${isDone ? " is-done" : ""}">
            <span class="account-level-no">${isDone ? "★" : id}</span>
            <span class="account-level-name">${esc(name)}</span>
            <span class="account-level-time">${isDone && Number.isFinite(t) ? fmtTime(t) : "—"}</span>
          </div>`;
        }).join("")}
      </div>`;
  }

  function renderAll() {
    renderProfile();
    renderStats();
    renderTabs();
    renderGrid();
    renderGame();
  }

  /* ---------- hành động ---------- */
  async function saveProfile() {
    const input = elProfile.querySelector(".account-name-input");
    const name = input ? input.value.trim() : "";
    if (!name) return toast("Please enter a name.", true);
    if (name === displayName(state.user)) { state.editingProfile = false; return renderProfile(); }
    try {
      if (!DEMO) {
        const data = await api("/api/auth/me", { method: "PATCH", body: JSON.stringify({ name }) });
        state.user = { ...state.user, ...(data?.user || {}), name: data?.user?.name ?? name };
      } else {
        state.user.name = name;
      }
      state.editingProfile = false;
      renderProfile();
      toast("Profile updated ✨");
    } catch (err) {
      toast(err.message, true);
    }
  }

  const itemById = (id) => (state.lists[state.tab] || []).find((x) => String(x.id) === String(id));

  async function saveRename(id) {
    const input = elGrid.querySelector(".account-rename-input");
    const item = itemById(id);
    const name = input ? input.value.trim() : "";
    if (!item || !name || name === item.name) { state.renamingId = null; return renderGrid(); }
    try {
      if (!DEMO) await api(`/api/account/${state.tab}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ name }) });
      item.name = name;
      state.renamingId = null;
      renderGrid();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function deleteItem(id) {
    try {
      if (!DEMO) await api(`/api/account/${state.tab}/${encodeURIComponent(id)}`, { method: "DELETE" });
      state.lists[state.tab] = state.lists[state.tab].filter((x) => String(x.id) !== String(id));
      state.confirmId = null;
      renderStats();
      renderGrid();
      toast("Deleted.");
    } catch (err) {
      state.confirmId = null;
      renderGrid();
      toast(err.message, true);
    }
  }

  /* ---------- xem trước ---------- */
  let disposeViewer = null;
  let viewerToken = 0;

  function closeViewer() {
    viewerToken++;
    if (disposeViewer) { disposeViewer(); disposeViewer = null; }
    viewer.hidden = true;
    viewerStage.replaceChildren();
    viewerItem = null;
  }
  let viewerItem = null;

  async function openViewer(type, item) {
    const url = asset(item.url);
    if (!url) return toast(DEMO ? "No preview in demo mode." : "No preview available yet.");
    const token = ++viewerToken;
    viewerItem = { type, item, url };
    viewerTitle.textContent = item.name || "Untitled";
    viewerHint.textContent = "";
    viewerStage.innerHTML = `<div class="account-viewer-msg">Loading…</div>`;
    viewer.hidden = false;
    if (type === "exports") {
      const img = new Image();
      img.alt = item.name || "";
      img.onload = () => { if (token === viewerToken) viewerStage.replaceChildren(img); };
      img.onerror = () => { if (token === viewerToken) viewerStage.innerHTML = `<div class="account-viewer-msg">Couldn't load this image.</div>`; };
      img.src = url;
      return;
    }
    try {
      const dispose = await mountModelViewer(viewerStage, url);
      if (token !== viewerToken) { dispose(); return; }
      disposeViewer = dispose;
      viewerHint.textContent = "Drag to rotate · scroll to zoom";
    } catch (err) {
      console.error("[Account] model preview failed:", err);
      if (token === viewerToken) viewerStage.innerHTML = `<div class="account-viewer-msg">Couldn't load this model.</div>`;
    }
  }

  async function downloadCurrent() {
    if (!viewerItem) return;
    const { type, item, url } = viewerItem;
    const ext = (/\.([a-z0-9]{2,4})(?:$|\?)/i.exec(url) || [])[1] || (type === "models" ? "glb" : "png");
    try {
      // fetch -> blob: thuộc tính download bị bỏ qua với link khác domain (backend :3000 vs frontend :5173)
      const blob = await (await fetch(url)).blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${safeFileName(item.name)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch {
      window.open(url, "_blank", "noopener");
    }
  }

  function viewItem(item) {
    // App có thể lắng nghe sự kiện này (và preventDefault) để tự xử lý việc xem
    const ev = new CustomEvent("account:view", { detail: { type: state.tab, item }, cancelable: true });
    if (window.dispatchEvent(ev)) openViewer(state.tab, item);
    else close();
  }

  /* ---------- sự kiện ---------- */
  elProfile.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "edit-profile") {
      if (state.editingProfile) saveProfile();
      else { state.editingProfile = true; renderProfile(); }
    } else if (b.dataset.act === "cancel-profile") {
      state.editingProfile = false;
      renderProfile();
    } else if (b.dataset.act === "logout") {
      onLogout();
    }
  });
  elProfile.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.classList.contains("account-name-input")) { e.preventDefault(); saveProfile(); }
  });

  tabs.forEach((t) => t.addEventListener("click", () => {
    state.tab = t.dataset.tab;
    state.renamingId = state.confirmId = null;
    renderTabs();
    renderGrid();
  }));

  elGrid.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "retry") return load();
    const card = b.closest(".account-item");
    const id = card?.dataset.id;
    const item = itemById(id);
    if (!item) return;
    if (b.dataset.act === "view") viewItem(item);
    else if (b.dataset.act === "rename") {
      if (state.renamingId === id) saveRename(id);
      else { state.renamingId = id; state.confirmId = null; renderGrid(); }
    } else if (b.dataset.act === "delete") {
      if (state.confirmId === id) { clearTimeout(confirmTimer); deleteItem(id); }
      else {
        state.confirmId = id;
        state.renamingId = null;
        renderGrid();
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => { state.confirmId = null; renderGrid(); }, 3000);
      }
    }
  });
  elGrid.addEventListener("keydown", (e) => {
    if (!e.target.classList.contains("account-rename-input")) return;
    if (e.key === "Enter") { e.preventDefault(); saveRename(state.renamingId); }
    else if (e.key === "Escape") { e.stopPropagation(); state.renamingId = null; renderGrid(); }
  });

  /* ---------- mở / đóng ---------- */
  let lastFocus = null;
  function open() {
    if (root.classList.contains("is-open")) return;
    lastFocus = document.activeElement;
    state.editingProfile = false;
    state.renamingId = state.confirmId = null;
    root.classList.remove("is-closing");
    root.classList.add("is-open");
    btn.setAttribute("aria-expanded", "true");
    renderAll();
    $(".account-close").focus({ preventScroll: true });
    // lần đầu / lần trước lỗi: tải có skeleton; các lần sau: làm mới ngầm để thấy model mới vừa tạo
    const firstLoad = state.lists.models === null || state.lists.exports === null || state.failed;
    load(!firstLoad);
    // kéo tiến độ game mới nhất từ server (vd. vừa chơi ở máy khác), xong thì vẽ lại khối Snap & Solve
    if (!DEMO) syncProgress().then(() => { if (root.classList.contains("is-open")) renderGame(); });
  }
  function close() {
    if (!root.classList.contains("is-open") || root.classList.contains("is-closing")) return;
    closeViewer();
    root.classList.add("is-closing");
    btn.setAttribute("aria-expanded", "false");
    setTimeout(() => root.classList.remove("is-open", "is-closing"), 180);
    (lastFocus && lastFocus.focus ? lastFocus : btn).focus?.({ preventScroll: true });
  }

  document.addEventListener("keydown", (e) => {
    // bấm vào vùng trống làm mất focus -> Esc vẫn phải đóng được
    if (e.key === "Escape" && root.classList.contains("is-open") && !root.contains(document.activeElement)) {
      if (!viewer.hidden) closeViewer();
      else close();
    }
  });

  $(".account-viewer-backdrop").addEventListener("click", closeViewer);
  $(".account-viewer-close").addEventListener("click", closeViewer);
  $('[data-act="download"]').addEventListener("click", downloadCurrent);

  btn.addEventListener("click", open);
  $(".account-close").addEventListener("click", close);
  $(".account-backdrop").addEventListener("click", close);

  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (!viewer.hidden) { closeViewer(); return; }
      if (state.editingProfile) { state.editingProfile = false; renderProfile(); }
      else close();
      return;
    }
    if (e.key === "Tab") {                                  // giữ focus trong hộp thoại
      const f = [...root.querySelectorAll("button:not([disabled]), input, [href]")].filter((n) => n.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}