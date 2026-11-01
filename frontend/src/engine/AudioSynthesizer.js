/**
 * AudioSynthesizer.js — Tactical Web Audio sound synthesizer for Dhruva Jaal
 * Generates procedural RF hops, distress beacons, and Base Camp two-way ACK pings.
 */

export class AudioSynthesizer {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.initAudioContext();
  }

  initAudioContext() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    } catch (e) {
      this.enabled = false;
    }

    // Auto-resume AudioContext on first user interaction to satisfy browser autoplay policies
    const unlock = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);
  }

  ensureReady() {
    if (!this.enabled || !this.ctx) return false;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return true;
  }

  /**
   * Short crisp RF chirp when packet hops across a node (433 MHz LoRa hop)
   */
  playHop() {
    if (!this.ensureReady()) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, this.ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1174, this.ctx.currentTime + 0.04); // D6

      gain.gain.setValueAtTime(0.045, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.045);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch (err) {}
  }

  /**
   * Ascending tactical chime when SOS arrives at Base Camp N8
   */
  playDelivered() {
    if (!this.ensureReady()) return;
    try {
      const now = this.ctx.currentTime;
      [
        { freq: 523.25, time: now },        // C5
        { freq: 659.25, time: now + 0.09 }, // E5
        { freq: 783.99, time: now + 0.18 }  // G5
      ].forEach(note => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.freq, note.time);

        gain.gain.setValueAtTime(0.08, note.time);
        gain.gain.exponentialRampToValueAtTime(0.001, note.time + 0.18);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(note.time);
        osc.stop(note.time + 0.19);
      });
    } catch (err) {}
  }

  /**
   * Radiant double-ping when Survivor Dongle receives reverse two-way ACK
   */
  playAck() {
    if (!this.ensureReady()) return;
    try {
      const now = this.ctx.currentTime;
      [
        { freq: 1046.5, time: now },        // C6
        { freq: 1318.5, time: now + 0.08 }  // E6
      ].forEach(note => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, note.time);

        gain.gain.setValueAtTime(0.09, note.time);
        gain.gain.exponentialRampToValueAtTime(0.001, note.time + 0.22);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(note.time);
        osc.stop(note.time + 0.23);
      });
    } catch (err) {}
  }

  /**
   * Pulsing beacon alert when survivor transmits distress
   */
  playBeacon() {
    if (!this.ensureReady()) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(330, now + 0.08);

      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);
    } catch (err) {}
  }
}

export const soundFx = new AudioSynthesizer();
