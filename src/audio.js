// Procedural WebAudio: fluorescent hum, footsteps, drone, screech, heartbeat. No assets.
export class AudioEngine {
  constructor() {
    this.ctx = null; this.master = null; this.humGain = null;
    this.muted = false; this.started = false;
  }
  start() {
    if (this.started) return;
    this.started = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    // Fluorescent hum: 120Hz + 240 + filtered noise
    this.humGain = this.ctx.createGain(); this.humGain.gain.value = 0.05;
    this.humGain.connect(this.master);
    for (const f of [119, 121, 239, 358]) {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = this.ctx.createGain(); g.gain.value = f > 200 ? 0.15 : 0.4;
      o.connect(g); g.connect(this.humGain); o.start();
    }
    // air noise bed
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    const ns = this.ctx.createBufferSource(); ns.buffer = buf; ns.loop = true;
    const nf = this.ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 900;
    const ng = this.ctx.createGain(); ng.gain.value = 0.05;
    ns.connect(nf); nf.connect(ng); ng.connect(this.humGain); ns.start();
    // deep drone
    const drone = this.ctx.createOscillator(); drone.type = 'sawtooth'; drone.frequency.value = 41;
    const df = this.ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 120;
    const dg = this.ctx.createGain(); dg.gain.value = 0.05;
    drone.connect(df); df.connect(dg); dg.connect(this.master); drone.start();
    this._noiseBuf = buf;
  }
  setHum(intensity) {
    if (!this.ctx || !this.humGain) return;
    const t = this.ctx.currentTime;
    this.humGain.gain.cancelScheduledValues(t);
    this.humGain.gain.setTargetAtTime(0.02 + intensity * 0.09, t, 0.4);
  }
  footstep(surface = 'carpet', sprint = false) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.5;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = surface === 'pool' ? 1400 : surface === 'concrete' ? 700 : 380;
    const g = this.ctx.createGain();
    const v = sprint ? 0.5 : 0.28;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 1.5, 0.2);
  }
  splash() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random(), 0.5);
  }
  pickup() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(880, t + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.45);
  }
  descend() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(38, t + 1.4);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.7);
  }
  screech() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.7);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 1.2);
  }
  heartbeat() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    for (const dt of [0, 0.22]) {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 58;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.5, t + dt); g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.18);
      o.connect(g); g.connect(this.master); o.start(t + dt); o.stop(t + dt + 0.2);
    }
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }
}
