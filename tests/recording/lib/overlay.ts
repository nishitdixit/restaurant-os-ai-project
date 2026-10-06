// Injected into the recording browser only (Playwright addInitScript). Draws a visible cursor, click
// ripples, a caption bar and chapter title cards on top of the page. pointer-events: none everywhere,
// so it never changes how the app behaves.
export function overlayInit() {
  const w = window as unknown as Record<string, unknown>;
  if (w.__rosOverlay) return;
  w.__rosOverlay = true;
  const css = [
    "#ros-cursor{position:fixed;z-index:2147483646;width:22px;height:22px;margin:-3px 0 0 -3px;pointer-events:none;transition:transform .08s ease-out;left:0;top:0}",
    "#ros-cursor svg{filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}",
    ".ros-ripple{position:fixed;z-index:2147483645;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:3px solid #f59e0b;pointer-events:none;animation:ros-ripple .55s ease-out forwards}",
    "@keyframes ros-ripple{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}",
    "#ros-caption{position:fixed;z-index:2147483644;left:50%;bottom:18px;transform:translateX(-50%);width:max-content;max-width:min(92vw,900px);padding:10px 16px;border-radius:12px;background:rgba(17,24,39,.9);color:#fff;font:600 15px/1.35 system-ui,-apple-system,sans-serif;text-align:center;pointer-events:none;opacity:0;transition:opacity .25s}",
    "#ros-caption.show{opacity:1}",
    "@media (max-width:600px){#ros-caption{bottom:96px;font-size:14px}}",
    "#ros-card{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:#111827;color:#fff;font-family:system-ui,-apple-system,sans-serif;pointer-events:none;opacity:0;transition:opacity .3s;text-align:center;padding:24px}",
    "#ros-card.show{opacity:1}",
    "#ros-card small{font:600 14px system-ui;letter-spacing:.12em;text-transform:uppercase;color:#f59e0b}",
    "#ros-card h1{font:700 30px/1.2 system-ui;margin:0}",
    "#ros-card p{font:400 16px/1.4 system-ui;margin:0;color:#d1d5db;max-width:640px}",
    "nextjs-portal{display:none!important}",
  ].join("\n");

  const install = () => {
    if (!document.body || !document.head) { requestAnimationFrame(install); return; }
    if (document.getElementById("ros-cursor")) return;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    const cursor = document.createElement("div");
    cursor.id = "ros-cursor";
    cursor.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 2l7 19 2.5-7.5L20 11z" fill="#111" stroke="#fff" stroke-width="1.6"/></svg>';
    const caption = document.createElement("div");
    caption.id = "ros-caption";
    const card = document.createElement("div");
    card.id = "ros-card";
    document.body.append(cursor, caption, card);
    try {
      const last = JSON.parse(sessionStorage.getItem("ros-cursor") || "null") as { x: number; y: number } | null;
      if (last) cursor.style.transform = `translate(${last.x}px,${last.y}px)`;
      const saved = sessionStorage.getItem("ros-caption-text");
      if (saved) { caption.textContent = saved; caption.classList.add("show"); }
    } catch { /* storage unavailable */ }
  };
  document.addEventListener("mousemove", (e) => {
    const cursor = document.getElementById("ros-cursor");
    if (cursor) cursor.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
    try { sessionStorage.setItem("ros-cursor", JSON.stringify({ x: e.clientX, y: e.clientY })); } catch { /* ignore */ }
  }, true);
  document.addEventListener("mousedown", (e) => {
    const r = document.createElement("div");
    r.className = "ros-ripple";
    r.style.left = `${e.clientX}px`;
    r.style.top = `${e.clientY}px`;
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 600);
  }, true);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
  // Next.js client navigations can replace body children; re-install if our nodes disappear.
  setInterval(install, 1000);

  w.__rosCaption = (text: string) => {
    install();
    const el = document.getElementById("ros-caption");
    if (!el) return;
    try {
      if (text) sessionStorage.setItem("ros-caption-text", text); else sessionStorage.removeItem("ros-caption-text");
    } catch { /* ignore */ }
    if (text) { el.textContent = text; el.classList.add("show"); } else el.classList.remove("show");
  };
  w.__rosCard = (kicker: string, title: string, body: string) => {
    install();
    const el = document.getElementById("ros-card");
    if (!el) return;
    if (!title) { el.classList.remove("show"); return; }
    el.innerHTML = "";
    const k = document.createElement("small"); k.textContent = kicker;
    const h = document.createElement("h1"); h.textContent = title;
    const p = document.createElement("p"); p.textContent = body || "";
    el.append(k, h, p);
    el.classList.add("show");
  };
}
