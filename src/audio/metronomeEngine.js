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

    this._lookaheadMs = 25.0;
    this._scheduleAhead = 0.1;
    this._workerFallbackID = null;
    this._schedulerCallCount = 0;
    this._noteCount = 0;

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
      console.log('[Metronome] AudioContext statechange →', this.audioCtx.state,
        'isPlaying:', this.isPlaying, 'currentTime:', this.audioCtx.currentTime);
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

  // Check AnalyserNode for non-zero audio data to verify output is alive.
  _checkAudioFlowing() {
    if (!this._analyser) return 0;
    const data = new Float32Array(this._analyser.fftSize);
    this._analyser.getFloatTimeDomainData(data);
    return data.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
  }

  async start() {
    if (this.isPlaying) return;

    this._schedulerCallCount = 0;
    this._noteCount = 0;

    // ----------------------------------------------------------------
    // SYNCHRONOUS PHASE — everything here must stay within the user
    // gesture so Safari grants audio output permission.  No `await`
    // before audioEl.play() and audioCtx.resume().
    // ----------------------------------------------------------------

    // Close old context WITHOUT awaiting.  The old context releases its
    // resources asynchronously; creating a new one immediately is fine
    // because they use separate audio graph instances.
    if (this.audioCtx) {
      console.log('[Metronome] Closing old AudioContext — state:', this.audioCtx.state,
        'currentTime:', this.audioCtx.currentTime);
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

    console.log('[Metronome] New AudioContext created — state:', this.audioCtx.state,
      'sampleRate:', this.audioCtx.sampleRate, 'currentTime:', this.audioCtx.currentTime,
      'dest.channels:', this.audioCtx.destination.channelCount + '/' + this.audioCtx.destination.maxChannelCount,
      'baseLatency:', this.audioCtx.baseLatency,
      'outputLatency:', this.audioCtx.outputLatency);

    // ----------------------------------------------------------------
    // ASYNC PHASE — user gesture may be consumed after first await.
    // ----------------------------------------------------------------

    await resumePromise;
    console.log('[Metronome] After resume — state:', this.audioCtx.state,
      'currentTime:', this.audioCtx.currentTime);

    // Verify the context is truly alive: currentTime must advance.
    const t0 = this.audioCtx.currentTime;
    await new Promise((r) => setTimeout(r, 60));
    const t1 = this.audioCtx.currentTime;
    console.log('[Metronome] currentTime check — t0:', t0, 't1:', t1,
      'delta:', (t1 - t0).toFixed(4), 'advancing:', t1 > t0);

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
      console.log('[Metronome] Second context — state:', this.audioCtx.state,
        'currentTime:', this.audioCtx.currentTime);
    }

    this.currentBeat = 0;
    this.subdivisionIndex = 0;
    this.nextNoteTime = this.audioCtx.currentTime + 0.05;
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

    console.log('[Metronome] Scheduling start — nextNoteTime:', this.nextNoteTime.toFixed(4),
      'ctxTime:', this.audioCtx.currentTime.toFixed(4),
      'worker:', !!this.worker);

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

    // Diagnostic: health check at 1s
    setTimeout(() => {
      if (this.isPlaying) {
        const amp = this._checkAudioFlowing();
        console.log('[Metronome] Health check @1s — schedulerCalls:', this._schedulerCallCount,
          'notesScheduled:', this._noteCount,
          'ctxState:', this.audioCtx?.state,
          'ctxTime:', this.audioCtx?.currentTime?.toFixed(4),
          'amplitude:', amp?.toFixed(6));
      }
    }, 1000);
  }

  stop() {
    if (!this.isPlaying) return;

    console.log('[Metronome] stop() — schedulerCalls:', this._schedulerCallCount,
      'notesScheduled:', this._noteCount,
      'ctxState:', this.audioCtx?.state,
      'ctxTime:', this.audioCtx?.currentTime?.toFixed(4));

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

  setSoundType(type) {
    if (this.soundType === type) return;
    this.soundType = type;
    if (this.isPlaying && this.audioCtx) {
      this._createClickBuffers();
    }
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

    this._schedulerCallCount++;
    if (this._schedulerCallCount <= 3) {
      console.log('[Metronome] _scheduler #' + this._schedulerCallCount,
        '— ctxTime:', this.audioCtx.currentTime.toFixed(4),
        'nextNote:', this.nextNoteTime.toFixed(4),
        'state:', this.audioCtx.state);
    }

    while (this.nextNoteTime < this.audioCtx.currentTime + this._scheduleAhead) {
      this._scheduleNote(this.nextNoteTime, this.currentBeat, this.subdivisionIndex);
      this._advanceBeat();
    }
  }

  _scheduleNote(time, beat, subIndex) {
    this._noteCount++;

    // Skip audio for rest beats, but still fire callback
    if (this._isRestBeat) {
      const delay = Math.max(0, (time - this.audioCtx.currentTime) * 1000);
      setTimeout(() => {
        this.onBeat?.({ beat, subdivisionIndex: subIndex });
      }, delay);
      return;
    }

    const isMainBeat = subIndex === 0;
    const isAccent = beat === 0 && isMainBeat;

    let buffer;
    if (isAccent) {
      buffer = this._clickBuffers.accent;
    } else if (isMainBeat) {
      buffer = this._clickBuffers.normal;
    } else {
      buffer = this._clickBuffers.sub;
    }

    if (this._noteCount <= 3) {
      console.log('[Metronome] _scheduleNote #' + this._noteCount,
        '— time:', time.toFixed(4), 'beat:', beat, 'sub:', subIndex,
        'ctxTime:', this.audioCtx.currentTime.toFixed(4),
        'ctxState:', this.audioCtx.state,
        'bufferType:', isAccent ? 'accent' : isMainBeat ? 'normal' : 'sub');
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this._analyser);
    source.start(time);

    // Check analyser DURING the first note to verify audio is flowing
    if (this._noteCount === 1) {
      const checkDelay = Math.max(10, (time + 0.025 - this.audioCtx.currentTime) * 1000);
      setTimeout(() => {
        const amp = this._checkAudioFlowing();
        console.log('[Metronome] During-note audio check — amplitude:', amp?.toFixed(6),
          'audioFlowing:', amp > 0, 'ctxTime:', this.audioCtx?.currentTime?.toFixed(4));
      }, checkDelay);
    }

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
      const lastOffset = pattern[pattern.length - 1];
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

        // Fire callback for UI to highlight current slot
        if (!this.audioCtx) return;
        const delay = Math.max(0, (this.nextNoteTime - this.audioCtx.currentTime) * 1000);
        setTimeout(() => {
          this.onSequenceBeat?.(this.sequenceBeatIndex);
        }, delay);
      }
    } else {
      const prevOffset = pattern[this.subdivisionIndex - 1];
      const nextOffset = pattern[this.subdivisionIndex];
      this.nextNoteTime += (nextOffset - prevOffset) * secondsPerBeat;
    }
  }
}
