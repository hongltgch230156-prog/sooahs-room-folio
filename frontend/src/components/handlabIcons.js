/* =====================================================================
 * handlabIcons.js – bộ icon SVG + hiệu ứng ăn mừng cho Hand Lab
 * Đặt cùng thư mục với snapSolve.js, rồi:
 *   import { icon, POSE_SVG, LOCK_SVG, launchCelebration } from "./handlabIcons.js";
 * ===================================================================== */

// ---------- 1. Icon cử chỉ (bàn tay) ----------
const POSE_INK = "#6C3F7C", POSE_FILL = "#F6ECFB";
export const POSE_SVG = (() => {
    const cx = [18.6, 25.2, 31.8, 38.4], W = 4.7;
    const up   = (c, top) => `<rect x="${c - W / 2}" y="${top}" width="${W}" height="${30 - top}" rx="2.7"/>`;
    const cur  = (c) => `<rect x="${c - W / 2}" y="19" width="${W}" height="11" rx="2.6"/>`;
    const palm = (y = 22, h = 20) => `<rect x="16" y="${y}" width="25" height="${h}" rx="8"/>`;
    const gaps = (xs) => xs.map((x) => `<path d="M${x} 21V26"/>`).join("");
    const side = `<rect x="14.5" y="24" width="5.4" height="15" rx="2.7" transform="rotate(-42 17 38)"/>`;
    const draw = (shapes, front = "", lines = "") =>
        `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
        `<g fill="${POSE_INK}" stroke="${POSE_INK}" stroke-width="4.4" stroke-linejoin="round">${shapes}</g>` +
        `<g fill="${POSE_FILL}">${shapes}</g>` +
        `<g fill="none" stroke="${POSE_INK}" stroke-width="1.6" stroke-linecap="round">${lines}</g>` +
        `<g fill="${POSE_FILL}" stroke="${POSE_INK}" stroke-width="1.8" stroke-linejoin="round">${front}</g></svg>`;
    const curled = cx.map(cur).join("");
    return {
        open_palm: draw(palm() + up(18.6, 8) + up(25.2, 4) + up(31.8, 7) + up(38.4, 12) + side),
        fist:      draw(palm() + curled, `<rect x="17" y="28.5" width="17" height="6.4" rx="3.2"/>`, gaps([21.9, 28.5, 35.1])),
        // ✌ chữ V: hai ngón tách rộng, ngón áp út + út gập, ngón cái đè lên
        peace:     draw(
            `<rect x="16" y="24" width="25" height="19" rx="8"/>` +
            `<rect x="20.6" y="6" width="4.8" height="24" rx="2.4" transform="rotate(-13 23 30)"/>` +
            `<rect x="27.6" y="5" width="4.8" height="25" rx="2.4" transform="rotate(13 30 30)"/>` +
            `<rect x="32.8" y="20.5" width="4.4" height="11" rx="2.2"/><rect x="37.2" y="22" width="4" height="10" rx="2"/>`,
            `<rect x="18" y="30.5" width="21" height="6" rx="3"/>`),
        // 👍 ngón cái to, dựng đứng; bốn ngón gập thành các vạch ngang bên phải
        thumbs_up: draw(
            `<rect x="15" y="22" width="26" height="21" rx="7"/>` +
            `<rect x="16.5" y="4.5" width="8.5" height="25" rx="4.25"/>`,
            "", `<path d="M27 29H40M27 34.3H40M27 39.6H39"/>`),
        love:      draw(palm() + up(18.6, 8) + cur(25.2) + cur(31.8) + up(38.4, 12) + side, "", gaps([28.5]))
    };
})();
export const LOCK_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><rect x="5.5" y="11" width="13" height="10" rx="3.2" fill="#fff"/><circle cx="12" cy="16" r="1.6" fill="${POSE_INK}"/></svg>`;

// ---------- 2. Icon giao diện (nét tròn 2px, đổi màu bằng CSS `color`) ----------
const PATHS = {
    star: `<path d="M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.2l-5.7 3.1 1.1-6.3L2.8 9.5l6.4-.9z" fill="currentColor"/>`,
    "chevron-left": `<path d="M15 5l-7 7 7 7"/>`,
    "chevron-right": `<path d="M9 5l7 7-7 7"/>`,
    lock: `<path d="M8 11V8a4 4 0 0 1 8 0v3"/><rect x="5" y="11" width="14" height="10" rx="3" fill="currentColor"/>`,
    bulb: `<path d="M9 17.5h6M10 21h4"/><path d="M12 3a6.2 6.2 0 0 0-3.7 11.2c.8.6 1.2 1.3 1.2 2.3h5c0-1 .4-1.7 1.2-2.3A6.2 6.2 0 0 0 12 3z" fill="currentColor" fill-opacity=".3"/>`,
    sparkle: `<path d="M11 3c.7 4.6 2 5.9 6.5 6.5C13 10.2 11.7 11.5 11 16c-.7-4.5-2-5.8-6.5-6.5C9 8.9 10.3 7.6 11 3z" fill="currentColor"/><path d="M18.5 14c.3 2 .9 2.7 2.5 3-1.6.3-2.2 1-2.5 3-.3-2-.9-2.7-2.5-3 1.6-.3 2.2-1 2.5-3z" fill="currentColor"/>`,
    eye: `<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="currentColor"/>`,
    heart: `<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z" fill="currentColor"/>`,
    "heart-off": `<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>`,
    "heart-crack": `<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/><path d="M12.5 5.5L10 10l3 2.5-2 4"/>`,
    "x-circle": `<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>`,
    party: `<path d="M3.5 20.5l5-12 7 7z" fill="currentColor" fill-opacity=".3"/><path d="M12 4v2.5M17.5 6.5L16 8.3M20 11.5h-2.4M15.5 3.2l.6 1.5M20.5 7.4l1.3-.7"/>`,
    camera: `<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>`,
    download: `<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14"/>`,
    image: `<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="M21 16l-5-5-9 9"/>`,
    flashlight: `<path d="M6.5 3h11l-2.2 5H8.7z" fill="currentColor" fill-opacity=".3"/><rect x="8.7" y="8" width="6.6" height="13.5" rx="1.8"/><path d="M12 12v3.2"/>`,
    basket: `<path d="M3 10h18l-2 10H5z" fill="currentColor" fill-opacity=".25"/><path d="M7 10a5 5 0 0 1 10 0M8.5 10l.8 10M15.5 10l-.8 10M12 10v10"/>`,
    rotate: `<path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.9 1 6.7 2.7L21 8"/><path d="M21 3v5h-5"/>`
};
/** icon("bulb") → chuỗi SVG; icon("fist") → icon bàn tay; truyền thêm class nếu cần */
export function icon(name, extra = "") {
    if (POSE_SVG[name]) return `<span class="hl-pose-ico ${extra}">${POSE_SVG[name]}</span>`;
    return `<svg class="hl-ico hl-ico--${name} ${extra}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ""}</svg>`;
}

// ---------- 3. Ăn mừng: pháo giấy + pháo hoa (canvas, tự dọn sau ~5 giây) ----------
export function launchCelebration(host, { duration = 5200 } = {}) {
    if (!host || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return () => {};
    const cv = document.createElement("canvas");
    cv.className = "ss-celebrate";
    host.appendChild(cv);
    const ctx = cv.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = host.getBoundingClientRect();
    const W = r.width, H = r.height;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const COLORS = ["#6C3F7C", "#A97BC4", "#F2A93B", "#FFD36B", "#F59FC0", "#6FC3F2", "#8EE0B8"];
    const rnd = (a, b) => a + Math.random() * (b - a);
    const pick = () => COLORS[(Math.random() * COLORS.length) | 0];
    const confetti = [], sparks = [];

    // pháo giấy bắn từ góc dưới
    function cannon(x, y, angle, n) {
        for (let i = 0; i < n; i++) {
            const a = angle + rnd(-0.5, 0.5), sp = rnd(8, 17) * (H / 520 + 0.4);
            const k = Math.random();
            confetti.push({
                x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                w: rnd(6, 11), h: rnd(4, 7), rot: rnd(0, 6.28), vr: rnd(-0.3, 0.3),
                flip: rnd(0, 6.28), vf: rnd(0.1, 0.3), c: pick(),
                shape: k < 0.22 ? "dot" : k < 0.38 ? "streamer" : "rect"
            });
        }
    }
    // mưa pháo giấy rơi từ trên xuống
    function rain(n) {
        for (let i = 0; i < n; i++) {
            const k = Math.random();
            confetti.push({
                x: rnd(0, W), y: rnd(-30, -5), vx: rnd(-1, 1), vy: rnd(1, 3),
                w: rnd(6, 10), h: rnd(4, 7), rot: rnd(0, 6.28), vr: rnd(-0.2, 0.2),
                flip: rnd(0, 6.28), vf: rnd(0.1, 0.25), c: pick(),
                shape: k < 0.25 ? "dot" : k < 0.4 ? "streamer" : "rect"
            });
        }
    }
    // pháo hoa nổ tại (x, y)
    function firework(x, y) {
        const c1 = pick(), c2 = pick(), n = 54;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + rnd(-0.04, 0.04);
            const sp = (i % 2 ? 2.2 : 4.4) * rnd(0.8, 1.15);
            sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: rnd(0.011, 0.017), c: i % 2 ? c1 : c2, trail: [] });
        }
    }
    // kịch bản
    const timeline = [
        [0,    () => { cannon(0, H, -Math.PI / 3, 60); cannon(W, H, (-2 * Math.PI) / 3, 60); }],
        [250,  () => firework(W * 0.3, H * 0.3)],
        [650,  () => firework(W * 0.7, H * 0.25)],
        [1100, () => firework(W * 0.5, H * 0.38)],
        [1500, () => { cannon(0, H, -Math.PI / 3, 45); cannon(W, H, (-2 * Math.PI) / 3, 45); }],
        [1900, () => firework(W * 0.2, H * 0.4)],
        [2300, () => firework(W * 0.8, H * 0.35)],
        [2800, () => firework(W * 0.5, H * 0.25)]
    ];
    let t0 = performance.now(), last = t0, rafId = 0, step = 0, stopped = false;

    function frame(now) {
        if (stopped) return;
        const el = now - t0, dt = Math.min(2, (now - last) / 16.67);
        last = now;
        while (step < timeline.length && el >= timeline[step][0]) timeline[step++][1]();
        if (el > 600 && el < 3600) rain(Math.random() < 0.7 * dt ? 2 : 0);
        ctx.clearRect(0, 0, W, H);
        // nền "trời đêm" nhẹ để pháo hoa nổi bật, mờ dần ở cuối
        const env = Math.min(1, el / 400, (duration - el) / 900);
        ctx.fillStyle = `rgba(28,14,46,${Math.max(0, 0.42 * env)})`;
        ctx.fillRect(0, 0, W, H);
        // pháo giấy
        for (let i = confetti.length - 1; i >= 0; i--) {
            const p = confetti[i];
            p.vy += 0.28 * dt; p.vx *= 0.985; p.vy *= 0.992;
            p.x += p.vx * dt + Math.sin(p.flip) * 0.5; p.y += p.vy * dt;
            p.rot += p.vr * dt; p.flip += p.vf * dt;
            if (p.y > H + 30) { confetti.splice(i, 1); continue; }
            ctx.save();
            ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.fillStyle = p.c;
            const sq = Math.abs(Math.cos(p.flip));
            if (p.shape === "dot") { ctx.beginPath(); ctx.arc(0, 0, p.w / 2.2, 0, 6.28); ctx.fill(); }
            else if (p.shape === "streamer") { ctx.fillRect(-1.5, -p.w * 1.3 * sq, 3, p.w * 2.6 * sq + 1); }
            else { ctx.fillRect(-p.w / 2, (-p.h / 2) * sq, p.w, p.h * sq + 0.5); }
            ctx.restore();
        }
        // pháo hoa
        ctx.lineCap = "round";
        for (let i = sparks.length - 1; i >= 0; i--) {
            const s = sparks[i];
            s.trail.push(s.x, s.y); if (s.trail.length > 12) s.trail.splice(0, 2);
            s.vy += 0.045 * dt; s.vx *= 0.986; s.vy *= 0.986;
            s.x += s.vx * dt; s.y += s.vy * dt; s.life -= s.decay * dt;
            if (s.life <= 0) { sparks.splice(i, 1); continue; }
            ctx.strokeStyle = s.c; ctx.fillStyle = s.c;
            ctx.globalAlpha = Math.max(0, s.life);
            ctx.shadowColor = s.c; ctx.shadowBlur = 10;
            ctx.lineWidth = 3 * s.life + 0.8;
            ctx.beginPath(); ctx.moveTo(s.trail[0], s.trail[1]);
            for (let k = 2; k < s.trail.length; k += 2) ctx.lineTo(s.trail[k], s.trail[k + 1]);
            ctx.lineTo(s.x, s.y); ctx.stroke();
            ctx.beginPath(); ctx.arc(s.x, s.y, 1.6 * s.life + 0.8, 0, 6.28); ctx.fill();
            ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        }
        if (el < duration || confetti.length || sparks.length) rafId = requestAnimationFrame(frame);
        else stop();
    }
    function stop() {
        stopped = true;
        cancelAnimationFrame(rafId);
        cv.remove();
    }
    rafId = requestAnimationFrame(frame);
    return stop;      // gọi để dừng sớm (khi chơi lại / đóng)
}