export class MetronomeEngine {
  constructor() {
    this.audioCtx = null;
    this.worker = null;
    this.timerID = null;
    this.nextNoteTime = 0.0;
    this.currentBeat = 0;
    this.isPlaying = false;

    this.bpm = 120;
    this.beatsPerMeasure = 4;
    this.onBeat = null;

    this._lookaheadMs = 25.0;
    this._scheduleAhead = 0.1;
    this._workerFallbackID = null;

    // Create worker
    try {
      this.worker = new Worker('/metronome-worker.js');
      this.worker.onmessage = () => {
        clearTimeout(this._workerFallbackID);
        this._scheduler();
      };
      this.worker.onerror = () => {
        console.warn('Web Worker failed to load, falling back to setInterval');
        this.worker.terminate();
        this.worker = null;
      };
    } catch (e) {
      console.warn('Web Worker not available, falling back to setInterval');
    }
  }

  _initAudioContext() {
    if (this.audioCtx) return;

    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Safari uses a non-standard "interrupted" state when the tab loses focus,
    // phone calls come in, etc. Listen for state changes and auto-resume.
    this.audioCtx.addEventListener('statechange', () => {
      if (this.isPlaying && this.audioCtx.state !== 'running') {
        this.audioCtx.resume().catch(() => {});
      }
    });
  }

  // Safari requires a user-gesture-triggered "warm-up" to unlock audio.
  // Play a silent buffer to ensure the context is truly unlocked.
  _warmUpAudioContext() {
    const buffer = this.audioCtx.createBuffer(1, 1, this.audioCtx.sampleRate);
    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioCtx.destination);
    source.start(0);
  }

  async start() {
    if (this.isPlaying) return;

    // Create AudioContext inside user gesture for Safari compatibility
    this._initAudioContext();

    // Always call resume() — after a long idle period, the browser may have
    // silently suspended the context while still reporting state as "running".
    await this.audioCtx.resume();

    // If resume didn't work, recreate the AudioContext from scratch
    if (this.audioCtx.state !== 'running') {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
      this._initAudioContext();
      await this.audioCtx.resume();
    }

    // Warm up with a silent buffer (unlocks audio on Safari/iOS)
    this._warmUpAudioContext();

    this.currentBeat = 0;
    // Small buffer to avoid scheduling notes in the past
    this.nextNoteTime = this.audioCtx.currentTime + 0.05;
    this.isPlaying = true;

    if (this.worker) {
      this.worker.postMessage('start');
      // Safety: if worker doesn't produce a tick within 200ms, fall back
      this._workerFallbackID = setTimeout(() => {
        if (this.isPlaying && this.worker && this.nextNoteTime <= this.audioCtx.currentTime + this._scheduleAhead) {
          console.warn('Worker not responding, falling back to setInterval');
          this.worker.terminate();
          this.worker = null;
          this.timerID = setInterval(() => this._scheduler(), this._lookaheadMs);
        }
      }, 200);
    } else {
      this.timerID = setInterval(() => this._scheduler(), this._lookaheadMs);
    }
  }

  stop() {
    if (!this.isPlaying) return;

    clearTimeout(this._workerFallbackID);

    if (this.worker) {
      this.worker.postMessage('stop');
    }
    if (this.timerID) {
      clearInterval(this.timerID);
      this.timerID = null;
    }
    this.isPlaying = false;
  }

  setBpm(newBpm) {
    this.bpm = Math.max(30, Math.min(300, newBpm));
  }

  setBeatsPerMeasure(n) {
    this.beatsPerMeasure = n;
    this.currentBeat = 0;
  }

  destroy() {
    this.stop();
    clearTimeout(this._workerFallbackID);
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }

  _scheduler() {
    if (!this.audioCtx || !this.isPlaying) return;

    while (this.nextNoteTime < this.audioCtx.currentTime + this._scheduleAhead) {
      this._scheduleNote(this.nextNoteTime, this.currentBeat);
      this._advanceBeat();
    }
  }

  _scheduleNote(time, beat) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    const isAccent = beat === 0;
    osc.frequency.value = isAccent ? 1000 : 800;
    osc.type = 'sine';

    const volume = isAccent ? 0.8 : 0.5;
    const duration = 0.05;

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.start(time);
    osc.stop(time + duration);

    const delay = Math.max(0, (time - this.audioCtx.currentTime) * 1000);
    setTimeout(() => {
      this.onBeat?.(beat);
    }, delay);
  }

  _advanceBeat() {
    const secondsPerBeat = 60.0 / this.bpm;
    this.nextNoteTime += secondsPerBeat;
    this.currentBeat = (this.currentBeat + 1) % this.beatsPerMeasure;
  }
}
