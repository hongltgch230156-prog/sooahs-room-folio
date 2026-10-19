import { SCENE_SVG } from "./authScene.js";
import { mountAccountButton } from "./account.js";
import { configureProgress } from "./gameProgress.js";

/* ------------------------------------------------------------------ */
/*  Cấu hình                                                           */
/* ------------------------------------------------------------------ */
const ENV = import.meta.env || {};
export const API_BASE = (ENV.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "");
const GOOGLE_CLIENT_ID = ENV.VITE_GOOGLE_CLIENT_ID || "";
const TOKEN_KEY = "forge_auth_token";
const BRAND = { name: "Wondera", tagline: "CREATE · EXPLORE · INTERACT" }; // đổi tên thương hiệu ở đây

/* ------------------------------------------------------------------ */
/*  Token                                                              */
/* ------------------------------------------------------------------ */
export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
const setToken = (t) => {
  try { localStorage.setItem(TOKEN_KEY, t); } catch { /* bỏ qua */ }
};
const clearToken = () => {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* bỏ qua */ }
};
export function logout() {
  clearToken();
  window.location.reload();
}

/* ------------------------------------------------------------------ */
/*  Tự gắn "Authorization: Bearer <token>" cho mọi request /api/...    */
/*  => các file cũ (forge.js, handlab.js, ChatbotUI.js...) KHÔNG phải  */
/*  sửa gì. Nếu server trả 401 (token hết hạn) thì tự đăng xuất.       */
/* ------------------------------------------------------------------ */
function installFetchAuth() {
  if (window.__authFetchPatched) return;
  window.__authFetchPatched = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const isApi = url.startsWith(`${API_BASE}/api`) || url.startsWith("/api");
    const isAuthApi = isApi && url.includes("/api/auth/");
    const token = getToken();

    if (isApi && !isAuthApi && token) {
      const headers = new Headers(init.headers || (typeof input !== "string" ? input.headers : undefined));
      if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
      init = { ...init, headers };
    }
    const res = await nativeFetch(input, init);
    if (res.status === 401 && isApi && !isAuthApi) logout();
    return res;
  };
}

async function authRequest(path, body) {
  let res;
  try {
    res = await fetch(`${API_BASE}/api/auth${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Không kết nối được máy chủ. Hãy kiểm tra backend đã chạy chưa.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Có lỗi xảy ra, vui lòng thử lại.");
    err.code = data.code;
    throw err;
  }
  return data;
}

async function fetchMe(token) {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) { clearToken(); return null; }
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch {
    return null; // backend đang tắt -> bắt đăng nhập lại cho chắc
  }
}

/* ------------------------------------------------------------------ */
/*  Font + Google Identity                                             */
/* ------------------------------------------------------------------ */
function injectFonts() {
  if (document.getElementById("auth-fonts")) return;
  const link = document.createElement("link");
  link.id = "auth-fonts";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Poppins:wght@600;700;800&family=JetBrains+Mono:wght@400;500&display=swap";
  document.head.appendChild(link);
}

let gsiPromise = null;
function loadGsi() {
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gsiPromise = null; reject(new Error("Không tải được Google Sign-In.")); };
    document.head.appendChild(s);
  });
  return gsiPromise;
}

/* ------------------------------------------------------------------ */
/*  SVG nhỏ                                                            */
/* ------------------------------------------------------------------ */
const ICONS = {
  logo: `<svg class="auth-logo" viewBox="0 0 40 40" aria-hidden="true">
    <polygon points="20,6 33,13.5 20,21 7,13.5" fill="#a58cea"/>
    <polygon points="7,13.5 20,21 20,36 7,28.5" fill="#7a5fcb"/>
    <polygon points="33,13.5 20,21 20,36 33,28.5" fill="#5a43a8"/>
    <circle cx="33.5" cy="8.5" r="3" fill="#8f74d6"/></svg>`,
  mail: `<svg class="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/></svg>`,
  lock: `<svg class="auth-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>`,
  eye: `<svg class="ic-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  torch: `<svg class="ic-torch" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h10l-1.5 5h-7z"/><path d="M8.5 8h7v11a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2z"/><path d="M12 12v2"/></svg>`,
  google: `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>`,
};

// Nhân vật mascot: đứng vẫy tay (sáng) / nằm ngủ (tối)
const MASCOT = `
<svg viewBox="0 0 90 60" aria-hidden="true">
  <g class="m-awake">
    <ellipse cx="45" cy="57" rx="9" ry="1.8" fill="rgba(80,60,120,.18)"/>
    <rect x="40" y="48" width="3.4" height="7" rx="1.2" fill="#f3c59c"/><rect x="46.6" y="48" width="3.4" height="7" rx="1.2" fill="#f3c59c"/>
    <rect x="38.6" y="53" width="6.2" height="3.4" rx="1.6" fill="#3a2a5a"/><rect x="45.2" y="53" width="6.2" height="3.4" rx="1.6" fill="#3a2a5a"/>
    <path d="M37.5 31.5h15l4 18.5h-23z" fill="#8f75da"/>
    <path d="M37.5 31.5h15l1 4.5h-17z" fill="#a38be6"/>
    <rect x="33.6" y="33" width="3.6" height="11" rx="1.8" fill="#f3c59c" transform="rotate(8 35 34)"/>
    <g class="m-arm"><rect x="53" y="22" width="3.6" height="13" rx="1.8" fill="#f3c59c" transform="rotate(24 54.5 34)"/><circle cx="59.5" cy="21.5" r="2.8" fill="#f7cfa6"/></g>
    <circle cx="45" cy="17.5" r="12" fill="#2e2347"/>
    <circle cx="45" cy="21" r="10" fill="#f8d2a9"/>
    <path d="M34.5 19c1.5-8.5 19.5-8.5 21 0c-4-3-10-4.5-21 0z" fill="#2e2347"/>
    <circle cx="41.2" cy="22" r="1.3" fill="#2e2347"/><circle cx="48.8" cy="22" r="1.3" fill="#2e2347"/>
    <path d="M42.6 25.2q2.4 2 4.8 0" stroke="#c0675b" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <circle cx="38.8" cy="24.6" r="1.7" fill="#f4a7a0" opacity=".6"/><circle cx="51.2" cy="24.6" r="1.7" fill="#f4a7a0" opacity=".6"/>
  </g>
  <g class="m-asleep">
    <rect x="6" y="40" width="20" height="9" rx="4.5" fill="#d9d2ee"/>
    <rect x="30" y="38.5" width="38" height="10.5" rx="5" fill="#8f75da"/>
    <rect x="66" y="42" width="11" height="3.6" rx="1.8" fill="#f3c59c"/><rect x="66" y="46.4" width="11" height="3.2" rx="1.6" fill="#f3c59c"/>
    <rect x="76" y="41.4" width="4.6" height="4.4" rx="2" fill="#3a2a5a"/><rect x="76" y="45.8" width="4.6" height="4" rx="2" fill="#3a2a5a"/>
    <circle cx="23" cy="42" r="10.5" fill="#2e2347"/>
    <circle cx="23.5" cy="44.2" r="9" fill="#f8d2a9"/>
    <path d="M13.5 42c2-8 19-8 20 0c-4-3-12-3.5-20 0z" fill="#2e2347"/>
    <path d="M18.4 45.2q1.8 1.7 3.6 0M25 45.2q1.8 1.7 3.6 0" stroke="#2e2347" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <circle cx="23.5" cy="49.2" r="1.1" fill="#c0675b"/>
    <g class="m-zz" fill="#8e7ad8" font-family="Poppins,sans-serif" font-weight="700"><text x="32" y="30" font-size="7">z</text><text x="38" y="24" font-size="9">z</text></g>
  </g>
</svg>`;

const OWL = `
<svg class="auth-owl" viewBox="0 0 28 36" aria-hidden="true">
  <path d="M5 8 8 2l4 4h4l4-4 3 6c1 2 1 4 1 6v12c0 5-4 8-10 8S4 33 4 28V14c0-2 0-4 1-6z" fill="#1a1536" stroke="#2a2350" stroke-width="1"/>
  <circle cx="10" cy="14" r="4.4" fill="#fff4dc"/><circle cx="18" cy="14" r="4.4" fill="#fff4dc"/>
  <circle cx="10" cy="14.4" r="1.9" fill="#1a1536"/><circle cx="18" cy="14.4" r="1.9" fill="#1a1536"/>
  <path d="m12.6 18.5 1.4 2 1.4-2z" fill="#e0b85a"/>
  <path d="M10 33v3M18 33v3" stroke="#e0b85a" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

/* ------------------------------------------------------------------ */
/*  Template HTML                                                      */
/* ------------------------------------------------------------------ */
function pwField(id, label, autocomplete, extraRow = "", collapsed = false) {
  const body = `
    <div class="auth-group">
      <div class="auth-label-row">
        <label class="auth-label" for="${id}">${label}</label>${extraRow}
      </div>
      <div class="auth-field" data-field="${id}">
        ${ICONS.lock}
        <input class="auth-input" id="${id}" name="${id}" type="password" placeholder="••••••••"
               autocomplete="${autocomplete}" ${collapsed ? "disabled" : ""} />
        <div class="auth-reveal" aria-hidden="true"></div>
        <button class="auth-eye" type="button" aria-label="Bật đèn pin để xem mật khẩu"
                aria-pressed="false" data-tip="Bật đèn">${ICONS.eye}${ICONS.torch}</button>
      </div>
    </div>`;
  return collapsed
    ? `<div class="auth-collapse"><div class="auth-collapse-inner">${body}</div></div>`
    : body;
}

function buildMarkup() {
  return `
  <div class="auth-bg auth-bg-light"></div>
  <div class="auth-bg auth-bg-dark"><i class="auth-stars"></i></div>

  <div class="auth-layout">
    <section class="auth-card" aria-label="Đăng nhập hoặc đăng ký">
      <header class="auth-brand">
        ${ICONS.logo}
        <div>
          <h1 class="auth-brand-name">${BRAND.name}</h1>
          <p class="auth-brand-tag">${BRAND.tagline}</p>
        </div>
      </header>

      <div class="auth-mascot">${MASCOT}</div>

      <button class="auth-google" type="button">${ICONS.google}<span>Tiếp tục với Google</span></button>
      <div class="auth-divider"><span>HOẶC</span></div>

      <form class="auth-form" novalidate>
        <div class="auth-group">
          ${OWL}
          <div class="auth-label-row"><label class="auth-label" for="auth-email">Email</label></div>
          <div class="auth-field" data-field="auth-email">
            ${ICONS.mail}
            <input class="auth-input" id="auth-email" name="email" type="email" placeholder="ban@wondera.app"
                   autocomplete="email" inputmode="email" style="padding-right:16px" />
          </div>
        </div>

        ${pwField("auth-password", "Mật khẩu", "current-password",
          `<button class="auth-forgot" type="button">Quên mật khẩu?</button>`)}
        ${pwField("auth-confirm", "Xác nhận mật khẩu", "new-password", "", true)}

        <p class="auth-error" role="alert"></p>
        <button class="auth-submit" type="submit">Đăng nhập</button>
      </form>

      <form class="auth-reset" novalidate>
        <h2 class="auth-reset-title">Quên mật khẩu</h2>
        <p class="auth-reset-hint"></p>
        <div class="auth-group">
          <div class="auth-label-row"><label class="auth-label" for="auth-reset-email">Email</label></div>
          <div class="auth-field" data-field="auth-reset-email">
            ${ICONS.mail}
            <input class="auth-input" id="auth-reset-email" type="email" placeholder="ban@wondera.app"
                   autocomplete="email" inputmode="email" style="padding-right:16px" />
          </div>
        </div>
        <div class="auth-reset-step2">
          <div class="auth-group">
            <div class="auth-label-row">
              <label class="auth-label" for="auth-reset-code">Mã xác nhận</label>
              <button class="auth-forgot auth-resend" type="button">Gửi lại mã</button>
            </div>
            <div class="auth-field" data-field="auth-reset-code">
              ${ICONS.lock}
              <input class="auth-input" id="auth-reset-code" type="text" inputmode="numeric" maxlength="6"
                     placeholder="123456" autocomplete="one-time-code" style="padding-right:16px" />
            </div>
          </div>
          ${pwField("auth-reset-password", "Mật khẩu mới", "new-password")}
          ${pwField("auth-reset-confirm", "Xác nhận mật khẩu mới", "new-password")}
        </div>
        <p class="auth-error" role="alert"></p>
        <button class="auth-submit auth-reset-submit" type="submit">Gửi mã xác nhận</button>
        <p class="auth-switch"><button class="auth-back" type="button">← Quay lại đăng nhập</button></p>
      </form>

      <p class="auth-switch"><span class="auth-switch-text">Chưa có tài khoản?</span> <button class="auth-switch-btn" type="button">Đăng ký ngay</button></p>
    </section>

    <div class="auth-scene">${SCENE_SVG}</div>
  </div>

  <svg class="auth-beam" aria-hidden="true">
    <defs>
      <linearGradient id="authBeamGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff2d8" stop-opacity="0.95"/>
        <stop offset="0.55" stop-color="#ffe8c4" stop-opacity="0.6"/>
        <stop offset="1" stop-color="#ffe2b4" stop-opacity="0.34"/>
      </linearGradient>
    </defs>
    <polygon class="auth-beam-poly" points="0,0 0,0 0,0" fill="url(#authBeamGrad)"/>
  </svg>`;
}

/* ------------------------------------------------------------------ */
/*  Giao diện + hành vi                                                */
/* ------------------------------------------------------------------ */
function createAuthUI(onSuccess) {
  const root = document.createElement("div");
  root.className = "auth-root is-checking";
  root.dataset.mode = "login";
  root.innerHTML = buildMarkup();
  document.body.appendChild(root);

  const $ = (sel) => root.querySelector(sel);
  const form = $(".auth-form");
  const emailInput = $("#auth-email");
  const pwInput = $("#auth-password");
  const confirmInput = $("#auth-confirm");
  const errorBox = $(".auth-error");
  const submitBtn = $(".auth-submit");
  const googleBtn = $(".auth-google");
  const switchText = $(".auth-switch-text");
  const switchBtn = $(".auth-switch-btn");
  const forgotBtn = $(".auth-forgot");
  const resetForm = $(".auth-reset");
  const resetHint = $(".auth-reset-hint");
  const resetEmail = $("#auth-reset-email");
  const resetCode = $("#auth-reset-code");
  const resetPw = $("#auth-reset-password");
  const resetConfirm = $("#auth-reset-confirm");
  const resetErrorBox = resetForm.querySelector(".auth-error");
  const resetSubmit = $(".auth-reset-submit");
  const resendBtn = $(".auth-resend");
  const backBtn = $(".auth-back");
  const eyeBtns = [...root.querySelectorAll(".auth-eye")];
  const reveals = [...root.querySelectorAll(".auth-field")]
    .map((f) => ({ input: f.querySelector("input[type=password]"), el: f.querySelector(".auth-reveal") }))
    .filter((r) => r.input);
  const beamPoly = $(".auth-beam-poly");
  const beamGrad = $("#authBeamGrad");

  let mode = "login";
  let busy = false;
  let dark = false;
  let apexBtn = eyeBtns[0];
  let pointer = null;
  let raf = null;
  const beam = { ang: Math.PI, len: 220 };

  /* ---------- thông báo ---------- */
  function showError(msg, info = false) {
    const box = mode === "forgot" ? resetErrorBox : errorBox;
    box.textContent = msg;
    box.classList.remove("show");
    void box.offsetWidth; // restart animation
    box.classList.add("show");
    box.classList.toggle("is-info", info);
  }
  function clearErrors() {
    [errorBox, resetErrorBox].forEach((box) => {
      box.classList.remove("show", "is-info");
      box.textContent = "";
    });
    root.querySelectorAll(".auth-field.is-invalid").forEach((f) => f.classList.remove("is-invalid"));
  }
  function markInvalid(input) {
    input.closest(".auth-field")?.classList.add("is-invalid");
    input.focus();
  }

  /* ---------- chuyển Đăng nhập <-> Đăng ký ---------- */
  function setMode(next) {
    mode = next;
    root.dataset.mode = next;
    const isLogin = next === "login";
    submitBtn.textContent = isLogin ? "Đăng nhập" : "Đăng ký";
    switchText.textContent = isLogin ? "Chưa có tài khoản?" : "Đã có tài khoản?";
    switchBtn.textContent = isLogin ? "Đăng ký ngay" : "Đăng nhập";
    pwInput.autocomplete = isLogin ? "current-password" : "new-password";
    confirmInput.disabled = isLogin;
    confirmInput.value = "";
    syncReveals();
    clearErrors();
  }
  switchBtn.addEventListener("click", () => setMode(mode === "login" ? "register" : "login"));
  /* ---------- Quên mật khẩu ---------- */
  let resetStep = 1;
  let resendTimer = null;

  function setResetStep(step) {
    resetStep = step;
    root.dataset.step = String(step);
    resetEmail.readOnly = step === 2;
    resetSubmit.textContent = step === 1 ? "Gửi mã xác nhận" : "Đặt lại mật khẩu";
    resetHint.textContent =
      step === 1
        ? "Nhập email đã đăng ký, chúng mình sẽ gửi mã xác nhận 6 số."
        : "Nhập mã vừa nhận qua email và đặt mật khẩu mới.";
    (step === 1 ? resetEmail : resetCode).focus();
  }

  function startResendCountdown(sec = 60) {
    clearInterval(resendTimer);
    let left = sec;
    resendBtn.disabled = true;
    const tick = () => {
      resendBtn.textContent = left > 0 ? `Gửi lại sau ${left}s` : "Gửi lại mã";
      if (left-- <= 0) {
        clearInterval(resendTimer);
        resendBtn.disabled = false;
      }
    };
    tick();
    resendTimer = setInterval(tick, 1000);
  }

  function openForgot() {
    setLights(false);
    clearErrors();
    resetEmail.value = emailInput.value.trim();
    resetCode.value = resetPw.value = resetConfirm.value = "";
    syncReveals();
    mode = "forgot";
    root.dataset.mode = "forgot";
    setResetStep(1);
  }

  function closeForgot(prefillEmail) {
    clearInterval(resendTimer);
    setMode("login");
    if (prefillEmail) emailInput.value = prefillEmail;
    pwInput.value = "";
    syncReveals();
  }

  function setResetBusy(v) {
    busy = v;
    resetSubmit.disabled = v;
    resetSubmit.classList.toggle("is-loading", v);
  }

  forgotBtn.addEventListener("click", openForgot);
  backBtn.addEventListener("click", () => closeForgot());

  resendBtn.addEventListener("click", async () => {
    if (busy || resendBtn.disabled) return;
    clearErrors();
    try {
      const data = await authRequest("/forgot-password", { email: resetEmail.value.trim() });
      startResendCountdown();
      showError(data.message, true);
    } catch (err) {
      showError(err.message);
    }
  });

  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    clearErrors();
    const email = resetEmail.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      markInvalid(resetEmail);
      return showError("Vui lòng nhập một địa chỉ email hợp lệ.");
    }

    // Bước 1: xin mã
    if (resetStep === 1) {
      setResetBusy(true);
      try {
        const data = await authRequest("/forgot-password", { email });
        setResetStep(2);
        startResendCountdown();
        showError(data.message, true);
      } catch (err) {
        showError(err.message);
      }
      return setResetBusy(false);
    }

    // Bước 2: nhập mã + mật khẩu mới
    const code = resetCode.value.trim();
    const password = resetPw.value;
    if (!/^\d{6}$/.test(code)) {
      markInvalid(resetCode);
      return showError("Mã xác nhận gồm 6 chữ số.");
    }
    if (password.length < 8) {
      markInvalid(resetPw);
      return showError("Mật khẩu cần ít nhất 8 ký tự.");
    }
    if (password !== resetConfirm.value) {
      markInvalid(resetConfirm);
      return showError("Mật khẩu xác nhận không khớp.");
    }
    setResetBusy(true);
    try {
      const data = await authRequest("/reset-password", { email, code, password });
      closeForgot(email);
      showError(data.message || "Đặt lại mật khẩu thành công. Hãy đăng nhập.", true);
    } catch (err) {
      showError(err.message);
    }
    setResetBusy(false);
  });

  /* ---------- đèn pin ---------- */
  function syncReveals() {
    reveals.forEach(({ input, el }) => (el.textContent = input.value));
  }
  reveals.forEach(({ input }) => input.addEventListener("input", syncReveals));

  function beamFrame() {
    const r = apexBtn.getBoundingClientRect();
    const ax = r.left + r.width / 2;
    const ay = r.top + r.height / 2;
    const t = pointer || { x: ax - 260, y: ay - 70 };
    const dx = t.x - ax;
    const dy = t.y - ay;
    const targetAng = Math.atan2(dy, dx);
    const targetLen = Math.max(150, Math.hypot(dx, dy));

    let d = targetAng - beam.ang;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    beam.ang += d * 0.3;
    beam.len += (targetLen - beam.len) * 0.3;

    const half = Math.tan((11 * Math.PI) / 180) * beam.len;
    const ex = ax + Math.cos(beam.ang) * beam.len;
    const ey = ay + Math.sin(beam.ang) * beam.len;
    const nx = -Math.sin(beam.ang) * half;
    const ny = Math.cos(beam.ang) * half;
    const P = [
      [ax, ay],
      [ex + nx, ey + ny],
      [ex - nx, ey - ny],
    ];

    beamPoly.setAttribute("points", P.map((p) => p.join(",")).join(" "));
    beamGrad.setAttribute("x1", ax);
    beamGrad.setAttribute("y1", ay);
    beamGrad.setAttribute("x2", ex);
    beamGrad.setAttribute("y2", ey);

    // Mật khẩu thật chỉ lộ ra trong vùng chùm sáng quét qua
    reveals.forEach(({ el }) => {
      const b = el.getBoundingClientRect();
      el.style.clipPath =
        "polygon(" + P.map(([x, y]) => `${(x - b.left).toFixed(1)}px ${(y - b.top).toFixed(1)}px`).join(",") + ")";
    });
    raf = requestAnimationFrame(beamFrame);
  }

  function setLights(nextDark, btn) {
    dark = nextDark;
    if (btn) apexBtn = btn;
    root.classList.toggle("is-dark", dark);
    eyeBtns.forEach((b) => {
      b.setAttribute("aria-pressed", String(dark));
      b.dataset.tip = dark ? "Bật đèn" : "Tắt đèn";
      b.setAttribute("aria-label", dark ? "Bật đèn phòng" : "Tắt đèn, dùng đèn pin để xem mật khẩu");
    });
    cancelAnimationFrame(raf);
    if (dark) {
      syncReveals();
      beam.ang = Math.PI;
      beam.len = 160;
      raf = requestAnimationFrame(beamFrame);
    } else {
      reveals.forEach(({ el }) => (el.style.clipPath = ""));
    }
  }
  eyeBtns.forEach((b) => b.addEventListener("click", () => setLights(!dark, b)));
  window.addEventListener("pointermove", (e) => (pointer = { x: e.clientX, y: e.clientY }), { passive: true });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && dark) setLights(false); });

  /* ---------- submit ---------- */
  function setBusy(v) {
    busy = v;
    submitBtn.disabled = v;
    googleBtn.disabled = v;
    submitBtn.classList.toggle("is-loading", v);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    clearErrors();

    const email = emailInput.value.trim();
    const password = pwInput.value;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      markInvalid(emailInput);
      return showError("Vui lòng nhập một địa chỉ email hợp lệ.");
    }
    if (password.length < 8) {
      markInvalid(pwInput);
      return showError(mode === "login" ? "Vui lòng nhập mật khẩu (tối thiểu 8 ký tự)." : "Mật khẩu cần ít nhất 8 ký tự.");
    }
    if (mode === "register" && password !== confirmInput.value) {
      markInvalid(confirmInput);
      return showError("Mật khẩu xác nhận không khớp.");
    }

    setBusy(true);
    try {
      const data = await authRequest(mode === "login" ? "/login" : "/register", { email, password });
      finish(data);
    } catch (err) {
      showError(err.message);
      setBusy(false);
    }
  });

  /* ---------- Google ---------- */
  let googleClient = null;
  googleBtn.addEventListener("click", async () => {
    if (busy) return;
    clearErrors();
    if (!GOOGLE_CLIENT_ID) {
      return showError("Chưa cấu hình VITE_GOOGLE_CLIENT_ID trong frontend/.env");
    }
    try {
      await loadGsi();
      if (!googleClient) {
        googleClient = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: "openid email profile",
          callback: async (resp) => {
            if (resp.error || !resp.access_token) return showError("Đăng nhập Google không thành công.");
            setBusy(true);
            try {
              finish(await authRequest("/google", { accessToken: resp.access_token }));
            } catch (err) {
              showError(err.message);
              setBusy(false);
            }
          },
          error_callback: (err) => {
            if (err?.type !== "popup_closed") showError("Không mở được cửa sổ đăng nhập Google (trình duyệt có thể đang chặn popup).");
          },
        });
      }
      googleClient.requestAccessToken({ prompt: "select_account" });
    } catch (err) {
      showError(err.message);
    }
  });

  /* ---------- kết thúc ---------- */
  function finish(data) {
    setToken(data.token);
    setLights(false);
    root.classList.add("is-leaving");
    setTimeout(() => {
      cancelAnimationFrame(raf);
      root.remove();
    }, 900);
    onSuccess(data.user);
  }

  return {
    root,
    show() {
      root.classList.remove("is-checking");
      if (GOOGLE_CLIENT_ID) loadGsi().catch(() => {}); // tải sẵn để popup không bị chặn
    },
    dismiss() {
      root.classList.add("is-leaving");
      setTimeout(() => root.remove(), 800);
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Nút đăng xuất (hiện sau khi vào web)                               */
/* ------------------------------------------------------------------ */
function mountAccount(user) {
  configureProgress({ userId: user.id, apiBase: API_BASE, getToken });
  mountAccountButton({ user, apiBase: API_BASE, getToken, onLogout: logout });
}

/* ------------------------------------------------------------------ */
/*  API chính                                                          */
/* ------------------------------------------------------------------ */
let initPromise = null;

/** Trả về Promise<user> – resolve khi người dùng đã đăng nhập. */
export function initAuth() {
  if (initPromise) return initPromise;
  installFetchAuth();
  injectFonts();

  initPromise = new Promise((resolve) => {
    const ui = createAuthUI((user) => {
      mountAccount(user);
      resolve(user);
    });

    const token = getToken();
    if (!token) return ui.show();

    fetchMe(token).then((user) => {
      if (user) {
        ui.dismiss();
        mountAccount(user);
        resolve(user);
      } else {
        ui.show();
      }
    });
  });
  return initPromise;
}