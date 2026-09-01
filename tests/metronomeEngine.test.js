import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MetronomeEngine } from '../src/audio/metronomeEngine.js';

// --- Fakes -----------------------------------------------------------------
// The engine's only route to the speakers is a MediaStream piped into an
// <audio> element, so the fakes model the two behaviours that matter:
//   1. AudioContext.currentTime may stall even while state === 'running'
//      (the Safari/Chrome symptom the recovery path exists to handle).
//   2. Per the HTML media element load algorithm, assigning `srcObject`
//      pauses the element — it must be re-play()ed afterwards.

let streamSeq = 0;

class FakeAudioContext {
  constructor() {
    FakeAudioContext.instances.push(this);
    this.sampleRate = 48000;
    this.state = 'suspended';
    this._t = 0;
    // Advance the clock on read unless this instance is pinned as "stuck".
    this.stuck = FakeAudioContext.stuckInstances.includes(FakeAudioContext.instances.length - 1);
  }
  get currentTime() {
    if (!this.stuck) this._t += 0.008;
    return this._t;
  }
  addEventListener() {}
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  createAnalyser() {
    return {
      fftSize: 256,
      connect: () => {},
      getFloatTimeDomainData: (arr) => arr.fill(0),
    };
  }
  createMediaStreamDestination() {
    streamSeq += 1;
    return {
      stream: {
        id: `stream-${streamSeq}`,
        active: true,
        getAudioTracks: () => [{ readyState: 'live', enabled: true }],
      },
    };
  }
  createBuffer(ch, len) {
    const data = new Float32Array(len);
    return { getChannelData: () => data, length: len };
  }
  createBufferSource() {
    return { buffer: null, connect: () => {}, start: () => {} };
  }
}
FakeAudioContext.instances = [];
FakeAudioContext.stuckInstances = [];

class FakeAudioElement {
  constructor() {
    this.paused = true;
    this.muted = false;
    this.volume = 1;
    this.readyState = 4;
    this.currentTime = 0;
    this._srcObject = null;
  }
  setAttribute() {}
  // Assigning srcObject runs the media element load algorithm, which sets
  // `paused` to true. This is the behaviour that silences the metronome.
  set srcObject(v) { this._srcObject = v; this.paused = true; }
  get srcObject() { return this._srcObject; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}

describe('MetronomeEngine audio sink', () => {
  let engine;

  beforeEach(() => {
    FakeAudioContext.instances = [];
    FakeAudioContext.stuckInstances = [];
    streamSeq = 0;
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('webkitAudioContext', undefined);
    vi.stubGlobal('Audio', FakeAudioElement);
    vi.stubGlobal('Worker', undefined);
    engine = new MetronomeEngine();
  });

  afterEach(() => {
    engine.stop();
    engine.destroy();
    vi.unstubAllGlobals();
  });

  it('leaves the audio element playing after a normal start', async () => {
    await engine.start();
    expect(engine._audioEl.paused).toBe(false);
    expect(engine._audioEl.srcObject).toBe(engine._streamDest.stream);
  });

  it('leaves the audio element playing after the stuck-clock recovery path', async () => {
    // Pin the first context so its currentTime never advances, forcing the
    // recovery rebuild — the exact state seen in the [MDIAG #21] log.
    FakeAudioContext.stuckInstances = [0];

    await engine.start();

    expect(FakeAudioContext.instances.length).toBe(2); // recovery ran
    expect(engine._audioEl.srcObject).toBe(engine._streamDest.stream);
    expect(engine._audioEl.paused).toBe(false);
  });
});
