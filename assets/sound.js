// Lokaler Boot-Sound.
//
// Warum Web Audio statt eines <audio>-Elements: iOS ignoriert
// HTMLMediaElement.volume komplett - Setzen bleibt wirkungslos. Ein GainNode
// laesst sich dagegen auch auf dem iPad regeln, und nur so kann die Musik
// weich abblenden, sobald JARVIS zu sprechen anfaengt.

// Optionale eigene Datei. Liegt sie nicht vor, erzeugt JARVIS den Startklang
// selbst - siehe synth(). Die Datei ist bewusst nicht Teil des Repositories:
// eine gekaufte Aufnahme gehoert nicht in ein oeffentliches Repo.
const SRC = "assets/boot-intro.mp3";

export class BootSound {
  constructor(src = SRC) {
    this.src = src;
    this.ctx = null;
    this.buffer = null;
    this.node = null;
    this.gain = null;
    this.loadError = null;
  }

  get available() { return Boolean(this.ctx); }
  get playing() { return Boolean(this.node); }

  /**
   * Muss aus einer echten Nutzer-Geste heraus laufen: iOS gibt Audio sonst
   * nicht frei. Laedt die Datei gleich mit vor, damit das Hochfahren spaeter
   * ohne Verzoegerung startet.
   */
  async unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.loadError = "Web Audio wird hier nicht unterstützt."; return false; }
    if (!this.ctx) this.ctx = new AC();
    if (this.ctx.state === "suspended") await this.ctx.resume().catch(() => {});
    if (!this.buffer && !this.loading) await this.load();
    return this.available;
  }

  async load() {
    if (this.buffer || this.loading) return this.buffer;
    this.loading = (async () => {
      try {
        const res = await fetch(this.src, { cache: "force-cache" });
        if (!res.ok) throw new Error(String(res.status));
        const bytes = await res.arrayBuffer();
        // Safari kennt die Promise-Form von decodeAudioData teils nicht.
        this.buffer = await new Promise((resolve, reject) => {
          const p = this.ctx.decodeAudioData(bytes, resolve, reject);
          if (p?.then) p.then(resolve, reject);
        });
        this.source = "file";
      } catch {
        // Keine eigene Datei hinterlegt - das ist der Normalfall.
        this.buffer = null;
        this.source = "synth";
      } finally {
        this.loading = null;
      }
      return this.buffer;
    })();
    return this.loading;
  }

  get label() {
    return this.source === "file" ? "Eigenes Intro" : "Arc-Reaktor hochgefahren";
  }

  /** Startet das Intro. Gibt false zurueck, wenn nichts abgespielt werden konnte. */
  play({ volume = 0.85, fadeIn = 0.25 } = {}) {
    if (!this.ctx) return false;
    if (!this.buffer) return this.synth({ volume });
    this.stop(0);
    const node = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    node.buffer = this.buffer;
    node.connect(gain).connect(this.ctx.destination);

    const t = this.ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), t + fadeIn);

    node.onended = () => { if (this.node === node) { this.node = null; this.gain = null; } };
    node.start();
    this.node = node;
    this.gain = gain;
    return true;
  }

  /** Blendet auf einen Pegel herunter, damit JARVIS darueber verstaendlich bleibt. */
  duck(level = 0.16, seconds = 1.2) {
    if (!this.gain) return;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), t);
    // exponentiell klingt fuers Ohr gleichmaessiger als linear
    this.gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), t + seconds);
  }

  stop(seconds = 1.2) {
    const node = this.node;
    const gain = this.gain;
    if (!node || !gain) return;
    this.node = null;
    this.gain = null;
    if (seconds <= 0) { try { node.stop(); } catch { /* schon beendet */ } return; }
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    setTimeout(() => { try { node.stop(); } catch { /* schon beendet */ } }, seconds * 1000 + 80);
  }

  /**
   * Startklang ohne Audiodatei: ein aufsteigender Sweep mit tiefem Anschwellen
   * und hellem Nachklang - der Arc-Reaktor, der hochfaehrt. Rein synthetisch,
   * damit nichts Fremdes mitgeliefert werden muss.
   */
  synth({ volume = 0.5, duration = 4.2 } = {}) {
    if (!this.ctx) return false;
    this.stop(0);
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t);
    master.gain.exponentialRampToValueAtTime(volume, t + 0.5);
    master.connect(ctx.destination);

    const voices = [];
    const voice = (type, from, to, peak, start, len) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t + start);
      osc.frequency.exponentialRampToValueAtTime(to, t + start + len);
      g.gain.setValueAtTime(0.0001, t + start);
      g.gain.exponentialRampToValueAtTime(peak, t + start + len * 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + len);
      osc.connect(g).connect(master);
      osc.start(t + start);
      osc.stop(t + start + len + 0.05);
      voices.push(osc);
    };

    voice("sawtooth", 55, 440, 0.30, 0, duration * 0.78);   // Hauptsweep
    voice("sine", 40, 110, 0.42, 0, duration * 0.9);        // Fundament
    voice("triangle", 880, 2400, 0.12, 0.55, duration * 0.6); // Schimmer
    voice("sine", 1320, 1320, 0.16, duration * 0.72, 0.9);  // Bestaetigungston

    // Der Master-Gain ist der Griff, an dem duck() und stop() spaeter drehen.
    this.gain = master;
    this.node = {
      stop: () => voices.forEach((v) => { try { v.stop(); } catch { /* schon aus */ } }),
    };
    setTimeout(() => { if (this.gain === master) { this.node = null; this.gain = null; } }, (duration + 0.4) * 1000);
    return true;
  }
}
