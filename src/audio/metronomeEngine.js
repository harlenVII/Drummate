export class MetronomeEngine {
  constructor() {
    this.audioCtx = null;
    this.timerID = null;
    this.nextNoteTime = 0.0;
    this.currentBeat = 0;
    this.isPlaying = false;

    this.bpm = 120;
    this.beatsPerMeasure = 4;
    this.onBeat = null;

    this._lookaheadMs = 25.0;
    this._scheduleAhead = 0.1;
  }

  start() {
    if (this.isPlaying) return;

    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    this.currentBeat = 0;
    this.nextNoteTime = this.audioCtx.currentTime;
    this.isPlaying = true;

    this.timerID = setInterval(() => this._scheduler(), this._lookaheadMs);
  }

  stop() {
    if (!this.isPlaying) return;

    clearInterval(this.timerID);
    this.timerID = null;
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
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }

  _scheduler() {
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
