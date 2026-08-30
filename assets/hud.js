// Visuelles: Wellenform im Reaktor, Log, Boot-Sequenz, Fensterverwaltung.
import { onVoice } from "./voice.js";

const $ = (sel, root = document) => root.querySelector(sel);

/* ------------------------------ Wellenform -------------------------------- */
// SpeechSynthesis liefert keinen Audiostream, den man analysieren koennte.
// Deshalb wird die Huellkurve simuliert und an den Wortgrenzen angestossen -
// optisch laeuft die Anzeige damit synchron zum Gesprochenen.
export class Waveform {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.bars = new Array(64).fill(0);
    this.energy = 0;
    this.active = false;
    this.raf = null;
    this._resize();
    window.addEventListener("resize", () => this._resize());
    onVoice("speakstart", () => this.start());
    onVoice("speakend", () => this.stop());
    onVoice("boundary", () => { this.energy = Math.min(1, this.energy + 0.55); });
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, r.width * dpr);
    this.canvas.height = Math.max(1, r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width; this.h = r.height;
  }

  start() { if (this.active) return; this.active = true; this._loop(); }
  stop() { this.active = false; }

  _loop() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);
      this.energy *= this.active ? 0.93 : 0.85;
      if (this.active) this.energy = Math.max(this.energy, 0.18 + Math.random() * 0.12);

      const cx = this.w / 2, cy = this.h / 2;
      const radius = Math.min(this.w, this.h) * 0.235;
      const n = this.bars.length;
      for (let i = 0; i < n; i++) {
        const target = this.energy * (0.35 + Math.random() * 0.65);
        this.bars[i] += (target - this.bars[i]) * 0.3;
        const len = this.bars[i] * Math.min(this.w, this.h) * 0.085;
        if (len < 0.4) continue;
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const x1 = cx + Math.cos(a) * radius, y1 = cy + Math.sin(a) * radius;
        const x2 = cx + Math.cos(a) * (radius + len), y2 = cy + Math.sin(a) * (radius + len);
        ctx.strokeStyle = `rgba(41,243,255,${0.25 + this.bars[i] * 0.65})`;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      if (this.active || this.energy > 0.01) this.raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, this.w, this.h);
    };
    tick();
  }
}

/* --------------------------------- Log ------------------------------------ */
export class Log {
  constructor(el, max = 60) { this.el = el; this.max = max; }
  add(text, kind = "j") {
    const line = document.createElement("div");
    line.className = kind;
    const tag = { j: "[JARVIS]", u: "[DU]", s: "[SYSTEM]" }[kind] || "[JARVIS]";
    line.textContent = `${tag} ${text}`;
    this.el.appendChild(line);
    while (this.el.childElementCount > this.max) this.el.firstElementChild.remove();
    this.el.scrollTop = this.el.scrollHeight;
  }
}

/* ----------------------------- Boot-Sequenz ------------------------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class BootSequence {
  constructor(root) {
    this.root = root;
    this.logEl = $(".boot-log", root);
    this.npEl = $(".now-playing", root);
    this.npText = $(".np-text", root);
  }

  show() {
    this.logEl.innerHTML = "";
    this.npEl.classList.add("hidden");
    this.root.classList.remove("hidden", "out");
  }

  /** Schreibt eine Zeile zeichenweise - der "Terminal"-Effekt. */
  async line(text, cls = "", speed = 11) {
    const div = document.createElement("div");
    if (cls) div.className = cls;
    this.logEl.appendChild(div);
    for (const ch of text) {
      div.textContent += ch;
      if (speed) await sleep(speed);
    }
    this.logEl.scrollTop = this.logEl.scrollHeight;
    return div;
  }

  nowPlaying(text) {
    this.npText.textContent = text;
    this.npEl.classList.remove("hidden");
  }

  async hide() {
    this.root.classList.add("out");
    await sleep(900);
    this.root.classList.add("hidden");
    this.root.classList.remove("out");
  }
}

/* --------------------------- Verschiebbares Fenster ------------------------ */
/** Macht ein Fenster per Titelleiste ziehbar - Maus und Touch. */
export function makeDraggable(win, handle) {
  let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;

  const point = (e) => (e.touches ? e.touches[0] : e);
  const down = (e) => {
    dragging = true;
    const p = point(e);
    const r = win.getBoundingClientRect();
    win.style.left = `${r.left}px`;
    win.style.top = `${r.top}px`;
    win.style.right = "auto";
    win.style.bottom = "auto";
    sx = p.clientX; sy = p.clientY; ox = r.left; oy = r.top;
    e.preventDefault();
  };
  const move = (e) => {
    if (!dragging) return;
    const p = point(e);
    const r = win.getBoundingClientRect();
    const x = Math.min(window.innerWidth - r.width, Math.max(0, ox + p.clientX - sx));
    const y = Math.min(window.innerHeight - 40, Math.max(0, oy + p.clientY - sy));
    win.style.left = `${x}px`;
    win.style.top = `${y}px`;
    e.preventDefault();
  };
  const up = () => { dragging = false; };

  handle.addEventListener("mousedown", down);
  handle.addEventListener("touchstart", down, { passive: false });
  window.addEventListener("mousemove", move);
  window.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("mouseup", up);
  window.addEventListener("touchend", up);
}
