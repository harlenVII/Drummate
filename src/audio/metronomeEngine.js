export class MetronomeEngine {
  constructor() {
    this.audioCtx = null;
    this._analyser = null;
    this._streamDest = null;
    this._audioEl = null;
    this._clickBuffers = null;
    this.worker = null;
    this.timerID = null;
    this.nextNoteTime = 0.0;
    this.currentBeat = 0;
    this.isPlaying = false;

    this.bpm = 120;
    this.beatsPerMeasure = 4;
    this.subdivisionPattern = [0]; // quarter notes only by default
    this.subdivisionIndex = 0;
    this.soundType = 'click';
    this.onBeat = null;

    // Sequence mode: array of subdivision patterns, one per beat.
    // When null, uses the single subdivisionPattern for all beats (normal mode).
    this.sequencePatterns = null;
    this.sequenceBeatIndex = 0;

    // Callback fired when sequence beat advances (for UI highlight).
    this.onSequenceBeat = null;

    // Flag for rest beats (no sound)
    this._isRestBeat = false;

    // When false, beat 0 uses the normal buffer instead of the accent buffer
    this.accentFirstBeat = true;

    // One-shot accent for cases like practice-mode step transitions:
    // the next scheduled downbeat (beat 0, subIndex 0) plays the accent
    // sound regardless of `accentFirstBeat`.
    this._oneShotAccent = false;

    // Meter track mode: cycles beatsPerMeasure bar-by-bar through a slot list.
    // null = mode off. meterClickTypes is an optional parallel 2D array
    // [barIdx][beatIdx] of 'accent' | 'normal' | 'sub' to override per-click sound.
    this.meterTrack = null;
    this.meterTrackIndex = 0;
    this.meterClickTypes = null;
    this.onMeterSlot = null;

    this._lookaheadMs = 25.0;
    this._scheduleAhead = 0.1;
    this._workerFallbackID = null;

    // Reusable <audio> element for MediaStream output (Safari workaround).
    // Created once to avoid accumulating elements across start/stop cycles.
    this._audioEl = new Audio();
    this._audioEl.setAttribute('playsinline', '');

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
    } catch {
      console.warn('Web Worker not available, falling back to setInterval');
    }
  }

  _initAudioContext() {
    if (this.audioCtx) return;

    // On iOS, set audio session to "playback" so audio plays even when the
    // physical silent-mode switch is on.  Safari 17+ exposes the standard
    // navigator.audioSession API; for older iOS we fall back to a silent
    // <audio> element that forces the audio session category to "playback".
    if (typeof navigator !== 'undefined' && navigator.audioSession) {
      try { navigator.audioSession.type = 'playback'; } catch { /* ignore */ }
    } else {
      this._ensureSilentPlaybackElement();
    }

    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // AnalyserNode for monitoring audio flow (diagnostic).
    this._analyser = this.audioCtx.createAnalyser();
    this._analyser.fftSize = 256;

    // Route audio through MediaStreamDestination → <audio> element instead
    // of AudioContext.destination.  Safari can silently disconnect destination
    // from the speakers; the <audio> element uses a separate, more reliable
    // output pipeline.
    this._streamDest = this.audioCtx.createMediaStreamDestination();
    this._analyser.connect(this._streamDest);
    this._audioEl.srcObject = this._streamDest.stream;

    // Pre-compute click buffers — using AudioBufferSourceNode instead of
    // OscillatorNode because it uses a more reliable code path in Safari.
    this._createClickBuffers();

    // Safari uses a non-standard "interrupted" state when the tab loses focus,
    // phone calls come in, etc. Listen for state changes and auto-resume.
    this.audioCtx.addEventListener('statechange', () => {
      if (this.isPlaying && this.audioCtx.state !== 'running') {
        this.audioCtx.resume().catch(() => {});
      }
    });
  }

  // Pre-compute click waveforms as AudioBuffers.  Each buffer contains a
  // short burst with an exponential decay baked in, so playback only needs
  // a single BufferSourceNode (no gain automation required).
  _createClickBuffers() {
    const generators = {
      click: () => this._createClickSound(),
      woodBlock: () => this._createWoodSound(),
      hiHat: () => this._createHiHatSound(),
      rimshot: () => this._createRimshotSound(),
      beep: () => this._createBeepSound(),
    };
    const gen = generators[this.soundType] || generators.click;
    this._clickBuffers = gen();
  }

  // Click: boosted sine wave
  _createClickSound() {
    const sr = this.audioCtx.sampleRate;
    const numSamples = Math.ceil(sr * 0.05);
    const make = (freq, vol) => {
      const buf = this.audioCtx.createBuffer(1, numSamples, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < numSamples; i++) {
        const t = i / sr;
        d[i] = vol * Math.exp(-t / 0.015) * Math.sin(2 * Math.PI * freq * t);
      }
      return buf;
    };
    return { accent: make(1000, 1.5), normal: make(800, 1.2), sub: make(600, 0.9) };
  }

  // Wood Block: sharp attack with harmonic overtones
  _createWoodSound() {
    const sr = this.audioCtx.sampleRate;
    const numSamples = Math.ceil(sr * 0.04);
    const make = (freq, vol) => {
      const buf = this.audioCtx.createBuffer(1, numSamples, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < numSamples; i++) {
        const t = i / sr;
        const env = vol * Math.exp(-t / 0.008);
        const f1 = Math.sin(2 * Math.PI * freq * t);
        const f2 = 0.6 * Math.sin(2 * Math.PI * freq * 2 * t);
        const f3 = 0.3 * Math.sin(2 * Math.PI * freq * 3.5 * t);
        d[i] = env * (f1 + f2 + f3);
      }
      return buf;
    };
    return { accent: make(1200, 1.5), normal: make(1000, 1.2), sub: make(800, 0.9) };
  }

  // Hi-Hat: white noise burst with fast decay
  _createHiHatSound() {
    const sr = this.audioCtx.sampleRate;
    const numSamples = Math.ceil(sr * 0.04);
    const make = (vol, decay) => {
      const buf = this.audioCtx.createBuffer(1, numSamples, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < numSamples; i++) {
        const t = i / sr;
        const env = vol * Math.exp(-t / decay);
        d[i] = env * (Math.random() * 2 - 1);
      }
      return buf;
    };
    return { accent: make(1.5, 0.012), normal: make(1.2, 0.009), sub: make(0.9, 0.007) };
  }

  // Rimshot: noise + tone blend for a snappy hit
  _createRimshotSound() {
    const sr = this.audioCtx.sampleRate;
    const numSamples = Math.ceil(sr * 0.05);
    const make = (freq, vol) => {
      const buf = this.audioCtx.createBuffer(1, numSamples, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < numSamples; i++) {
        const t = i / sr;
        const env = vol * Math.exp(-t / 0.012);
        const tone = Math.sin(2 * Math.PI * freq * t);
        const noise = Math.random() * 2 - 1;
        d[i] = env * (tone * 0.6 + noise * 0.4);
      }
      return buf;
    };
    return { accent: make(1500, 1.5), normal: make(1200, 1.2), sub: make(1000, 0.9) };
  }

  // Beep: square wave for a sharp digital sound
  _createBeepSound() {
    const sr = this.audioCtx.sampleRate;
    const numSamples = Math.ceil(sr * 0.04);
    const make = (freq, vol) => {
      const buf = this.audioCtx.createBuffer(1, numSamples, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < numSamples; i++) {
        const t = i / sr;
        const env = vol * Math.exp(-t / 0.015);
        d[i] = env * (Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1);
      }
      return buf;
    };
    return { accent: make(1000, 1.3), normal: make(800, 1.0), sub: make(600, 0.7) };
  }

  // Create a looping silent <audio> element.  On older iOS (< 17) this forces
  // the Web Audio session into the "playback" category, which bypasses the
  // hardware silent-mode switch.  The element is shared across instances and
  // harmless on non-iOS browsers (it simply plays silence).
  _ensureSilentPlaybackElement() {
    if (MetronomeEngine._silentAudioEl) return;

    try {
      // Minimal silent WAV: 1 sample, 8-bit mono, 8 kHz  (58 bytes base64)
      const silentWav =
        'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==';
      const el = document.createElement('audio');
      el.src = silentWav;
      el.loop = true;
      el.setAttribute('playsinline', '');
      el.play().catch(() => {});
      MetronomeEngine._silentAudioEl = el;
    } catch { /* ignore */ }
  }

  async start() {
    if (this.isPlaying) return;

    // ----------------------------------------------------------------
    // SYNCHRONOUS PHASE — everything here must stay within the user
    // gesture so Safari grants audio output permission.  No `await`
    // before audioEl.play() and audioCtx.resume().
    // ----------------------------------------------------------------

    // Close old context WITHOUT awaiting.  The old context releases its
    // resources asynchronously; creating a new one immediately is fine
    // because they use separate audio graph instances.
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
      this._analyser = null;
      this._streamDest = null;
      this._clickBuffers = null;
    }

    // Create fresh AudioContext + audio graph (sync).
    this._initAudioContext();

    // Start the <audio> element — MUST happen in user gesture on Safari.
    this._audioEl.play().catch(() => {});

    // Resume the AudioContext — call (not await) must be in user gesture.
    const resumePromise = this.audioCtx.resume();

    // ----------------------------------------------------------------
    // ASYNC PHASE — user gesture may be consumed after first await.
    // ----------------------------------------------------------------

    await resumePromise;

    // Verify the context is truly alive: currentTime must advance.
    const t0 = this.audioCtx.currentTime;
    await new Promise((r) => setTimeout(r, 60));
    const t1 = this.audioCtx.currentTime;

    if (t1 === t0) {
      console.warn('[Metronome] currentTime stuck, recreating AudioContext');
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
      this._analyser = null;
      this._streamDest = null;
      this._clickBuffers = null;
      this._initAudioContext();
      this._audioEl.srcObject = this._streamDest.stream;
      await this.audioCtx.resume();
      await new Promise((r) => setTimeout(r, 60));
    }

    this.currentBeat = 0;
    this.subdivisionIndex = 0;
    this.isPlaying = true;

    // Reset sequence to first slot
    if (this.sequencePatterns && this.sequencePatterns.length > 0) {
      this.sequenceBeatIndex = 0;
      const firstPattern = this.sequencePatterns[0];
      if (firstPattern === null) {
        this.subdivisionPattern = [0];
        this._isRestBeat = true;
      } else {
        this.subdivisionPattern = firstPattern;
        this._isRestBeat = false;
      }
    }

    // Reset meter track to first slot on each start
    if (this.meterTrack && this.meterTrack.length > 0) {
      this.meterTrackIndex = 0;
      this.beatsPerMeasure = this.meterTrack[0];
    }

    this.nextNoteTime = this.audioCtx.currentTime + 0.05;

    if (this.worker) {
      this.worker.postMessage('start');
      this._workerFallbackID = setTimeout(() => {
        if (this.isPlaying && this.worker && this.nextNoteTime <= this.audioCtx.currentTime + this._scheduleAhead) {
          console.warn('[Metronome] Worker not responding, falling back to setInterval');
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
    if (this.beatsPerMeasure === n) return;
    this.beatsPerMeasure = n;
    this.currentBeat = 0;
    this.subdivisionIndex = 0;
  }

  setSubdivision(pattern) {
    if (this.subdivisionPattern.length === pattern.length &&
        this.subdivisionPattern.every((v, i) => v === pattern[i])) return;
    this.subdivisionPattern = pattern;
    this.subdivisionIndex = 0;
  }

  /**
   * Enable sequence mode.
   * @param {Array<Array<number>>|null} patterns - Array of subdivision patterns,
   *   one per "slot". Pass null to return to normal (single-pattern) mode.
   */
  setSequence(patterns) {
    if (!patterns) {
      this.sequencePatterns = null;
      this._isRestBeat = false;
      return;
    }
    this.sequencePatterns = patterns;
    // Clamp sequenceBeatIndex if the array shrank
    if (this.sequenceBeatIndex >= patterns.length) {
      this.sequenceBeatIndex = 0;
    }
    // Update current subdivision to match the current slot
    const currentPattern = patterns[this.sequenceBeatIndex];
    if (currentPattern === null) {
      this.subdivisionPattern = [0];
      this._isRestBeat = true;
    } else {
      this.subdivisionPattern = currentPattern;
      this._isRestBeat = false;
    }
    this.subdivisionIndex = 0;
  }

  setAccentFirstBeat(enabled) {
    this.accentFirstBeat = enabled;
  }

  triggerOneShotAccent() {
    this._oneShotAccent = true;
  }

  setSoundType(type) {
    if (this.soundType === type) return;
    this.soundType = type;
    if (this.isPlaying && this.audioCtx) {
      this._createClickBuffers();
    }
  }

  /**
   * Enable meter-track mode.
   * @param {number[]|null} track - Array of beatsPerMeasure values, one per bar slot.
   *   Pass null to return to normal (fixed beatsPerMeasure) mode.
   */
  setMeterTrack(track) {
    if (!track || track.length === 0) {
      this.meterTrack = null;
      this.meterTrackIndex = 0;
      this.meterClickTypes = null;
      return;
    }
    this.meterTrack = track;
    this.meterTrackIndex = 0;
    this.beatsPerMeasure = track[0];
  }

  /**
   * Optional override for per-click sound in meter-track mode. Pass a 2D array
   * shaped [barIdx][beatIdx] with values 'accent' | 'normal' | 'sub', or null
   * to clear. Pass alongside setMeterTrack — cleared automatically when
   * setMeterTrack(null) is called.
   */
  setMeterClickTypes(types) {
    this.meterClickTypes = (types && types.length > 0) ? types : null;
  }

  destroy() {
    this.stop();
    clearTimeout(this._workerFallbackID);
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this._audioEl) {
      this._audioEl.pause();
      this._audioEl.srcObject = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
      this._analyser = null;
      this._streamDest = null;
      this._clickBuffers = null;
    }
  }

  _scheduler() {
    if (!this.audioCtx || !this.isPlaying) return;

    while (this.nextNoteTime < this.audioCtx.currentTime + this._scheduleAhead) {
      this._scheduleNote(this.nextNoteTime, this.currentBeat, this.subdivisionIndex);
      this._advanceBeat();
    }
  }

  _scheduleNote(time, beat, subIndex) {
    // Skip audio for rest beats or per-note rests (negative offsets), but still fire callback
    const isPerNoteRest = this.subdivisionPattern[subIndex] < 0;
    if (this._isRestBeat || isPerNoteRest) {
      const delay = Math.max(0, (time - this.audioCtx.currentTime) * 1000);
      setTimeout(() => {
        this.onBeat?.({ beat, subdivisionIndex: subIndex });
      }, delay);
      return;
    }

    const isMainBeat = subIndex === 0;
    const isDownbeat = beat === 0 && isMainBeat;
    const isOneShot = this._oneShotAccent && isDownbeat;
    const isAccent = isDownbeat && (this.accentFirstBeat || isOneShot);
    if (isOneShot) this._oneShotAccent = false;

    const typeOverride = this.meterClickTypes && isMainBeat
      ? this.meterClickTypes[this.meterTrackIndex]?.[beat] ?? null
      : null;

    let buffer;
    if (typeOverride === 'accent' || (typeOverride === null && isAccent)) {
      buffer = this._clickBuffers.accent;
    } else if (typeOverride === 'normal' || (typeOverride === null && isMainBeat)) {
      buffer = this._clickBuffers.normal;
    } else {
      buffer = this._clickBuffers.sub;
    }


    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this._analyser);
    source.start(time);

    const delay = Math.max(0, (time - this.audioCtx.currentTime) * 1000);
    setTimeout(() => {
      this.onBeat?.({ beat, subdivisionIndex: subIndex });
    }, delay);
  }

  _advanceBeat() {
    const secondsPerBeat = 60.0 / this.bpm;
    const pattern = this.subdivisionPattern;

    this.subdivisionIndex++;

    if (this.subdivisionIndex >= pattern.length) {
      const lastOffset = Math.abs(pattern[pattern.length - 1]);
      this.nextNoteTime += (1 - lastOffset) * secondsPerBeat;
      this.subdivisionIndex = 0;
      this.currentBeat = (this.currentBeat + 1) % this.beatsPerMeasure;

      // Sequence mode: advance to next slot and load its pattern
      if (this.sequencePatterns && this.sequencePatterns.length > 0) {
        this.sequenceBeatIndex =
          (this.sequenceBeatIndex + 1) % this.sequencePatterns.length;
        const nextPattern = this.sequencePatterns[this.sequenceBeatIndex];
        if (nextPattern === null) {
          this.subdivisionPattern = [0];
          this._isRestBeat = true;
        } else {
          this.subdivisionPattern = nextPattern;
          this._isRestBeat = false;
        }

        // Fire callback for UI to highlight current slot.
        // Capture index now — by the time setTimeout fires, the scheduler
        // may have already advanced sequenceBeatIndex past this slot.
        if (!this.audioCtx) return;
        const slotIdx = this.sequenceBeatIndex;
        const delay = Math.max(0, (this.nextNoteTime - this.audioCtx.currentTime) * 1000);
        setTimeout(() => {
          this.onSequenceBeat?.(slotIdx);
        }, delay);
      }

      // Meter track mode: at bar boundary (currentBeat just wrapped to 0),
      // advance to the next slot's beatsPerMeasure and fire onMeterSlot callback.
      if (this.currentBeat === 0 && this.meterTrack && this.meterTrack.length > 0) {
        this.meterTrackIndex = (this.meterTrackIndex + 1) % this.meterTrack.length;
        this.beatsPerMeasure = this.meterTrack[this.meterTrackIndex];
        if (!this.audioCtx) return;
        const slotIdx = this.meterTrackIndex;
        const delay = Math.max(0, (this.nextNoteTime - this.audioCtx.currentTime) * 1000);
        setTimeout(() => {
          this.onMeterSlot?.(slotIdx);
        }, delay);
      }

    } else {
      const prevOffset = Math.abs(pattern[this.subdivisionIndex - 1]);
      const nextOffset = Math.abs(pattern[this.subdivisionIndex]);
      this.nextNoteTime += (nextOffset - prevOffset) * secondsPerBeat;
    }
  }
}
