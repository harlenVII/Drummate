import { useState, useEffect, useRef } from 'react';
import NoSleep from 'nosleep.js';
import { MetronomeEngine } from '../audio/metronomeEngine';
import { SUBDIVISIONS } from '../constants/subdivisions';
import { getItem, setItem } from '../utils/safeStorage';

export function useMetronomeState() {
  // Refs
  const noSleepRef = useRef(new NoSleep());
  const metronomeEngineRef = useRef(null);

  // Metronome state (persists across tab changes and page reloads)
  const [metronomeBpm, setMetronomeBpm] = useState(() => {
    const saved = getItem('drummate_metronome_bpm');
    const bpm = saved ? Number(saved) : 120;
    return bpm >= 30 && bpm <= 300 ? bpm : 120;
  });
  const [metronomeIsPlaying, setMetronomeIsPlaying] = useState(false);
  const [metronomeCurrentBeat, setMetronomeCurrentBeat] = useState(-1);
  const [metronomeTimeSignature, setMetronomeTimeSignature] = useState(() => {
    const saved = getItem('drummate_metronome_time_signature');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 2 &&
            typeof parsed[0] === 'number' && typeof parsed[1] === 'number') {
          return parsed;
        }
      } catch {
        // ignore malformed data
      }
    }
    return [4, 4];
  });
  const [metronomeSubdivision, setMetronomeSubdivision] = useState(() => {
    const saved = getItem('drummate_metronome_subdivision');
    const validSubdivisions = SUBDIVISIONS.map((s) => s.key);
    return saved && validSubdivisions.includes(saved) ? saved : 'quarter';
  });
  const [metronomeSoundType, setMetronomeSoundType] = useState(() => {
    const saved = getItem('drummate_metronome_sound_type');
    const validTypes = ['click', 'woodBlock', 'hiHat', 'rimshot', 'beep'];
    return saved && validTypes.includes(saved) ? saved : 'click';
  });

  const [metronomeAccentFirstBeat, setMetronomeAccentFirstBeat] = useState(() => {
    const saved = getItem('drummate_metronome_accent_first_beat');
    return saved === null ? true : saved === 'true';
  });

  // Sequencer state (persists across tab changes and page reloads)
  const [sequencerBpm, setSequencerBpm] = useState(() => {
    const saved = getItem('drummate_sequencer_bpm');
    const bpm = saved ? Number(saved) : 120;
    return bpm >= 30 && bpm <= 300 ? bpm : 120;
  });
  const [sequencerSoundType, setSequencerSoundType] = useState(() => {
    const saved = getItem('drummate_sequencer_sound_type');
    const validTypes = ['click', 'woodBlock', 'hiHat', 'rimshot', 'beep'];
    return saved && validTypes.includes(saved) ? saved : 'click';
  });
  const [sequencerSlots, setSequencerSlots] = useState(() => {
    const saved = getItem('drummate_sequencer_slots');
    if (!saved) return [];
    try {
      return JSON.parse(saved);
    } catch {
      return [];
    }
  });
  const [sequencerPlayingSlot, setSequencerPlayingSlot] = useState(-1);

  const sequencerNextIdRef = useRef(null);
  if (sequencerNextIdRef.current === null) {
    const saved = getItem('drummate_sequencer_next_id');
    sequencerNextIdRef.current = saved ? Number(saved) : 1;
  }

  // Multi-Meter state (persists across tab changes and page reloads)
  const [multiMeterBpm, setMultiMeterBpm] = useState(() => {
    const saved = getItem('drummate_multimeter_bpm');
    const bpm = saved ? Number(saved) : 120;
    return bpm >= 30 && bpm <= 300 ? bpm : 120;
  });
  const [multiMeterSoundType, setMultiMeterSoundType] = useState(() => {
    const saved = getItem('drummate_multimeter_sound_type');
    const validTypes = ['click', 'woodBlock', 'hiHat', 'rimshot', 'beep'];
    return saved && validTypes.includes(saved) ? saved : 'click';
  });
  const [multiMeterSlots, setMultiMeterSlots] = useState(() => {
    const saved = getItem('drummate_multimeter_slots');
    if (!saved) return [];
    try {
      return JSON.parse(saved);
    } catch {
      return [];
    }
  });
  const [multiMeterPlayingSlot, setMultiMeterPlayingSlot] = useState(-1);

  // Persist metronome settings to localStorage
  useEffect(() => {
    setItem('drummate_metronome_bpm', String(metronomeBpm));
  }, [metronomeBpm]);

  useEffect(() => {
    setItem('drummate_metronome_sound_type', metronomeSoundType);
  }, [metronomeSoundType]);

  useEffect(() => {
    setItem('drummate_metronome_time_signature', JSON.stringify(metronomeTimeSignature));
  }, [metronomeTimeSignature]);

  useEffect(() => {
    setItem('drummate_metronome_subdivision', metronomeSubdivision);
  }, [metronomeSubdivision]);

  useEffect(() => {
    setItem('drummate_metronome_accent_first_beat', String(metronomeAccentFirstBeat));
  }, [metronomeAccentFirstBeat]);

  useEffect(() => {
    setItem('drummate_multimeter_bpm', String(multiMeterBpm));
  }, [multiMeterBpm]);
  useEffect(() => {
    setItem('drummate_multimeter_sound_type', multiMeterSoundType);
  }, [multiMeterSoundType]);
  useEffect(() => {
    setItem('drummate_multimeter_slots', JSON.stringify(multiMeterSlots));
  }, [multiMeterSlots]);

  // Persist sequencer settings to localStorage
  useEffect(() => {
    setItem('drummate_sequencer_bpm', String(sequencerBpm));
  }, [sequencerBpm]);

  useEffect(() => {
    setItem('drummate_sequencer_sound_type', sequencerSoundType);
  }, [sequencerSoundType]);

  useEffect(() => {
    setItem('drummate_sequencer_slots', JSON.stringify(sequencerSlots));
    setItem('drummate_sequencer_next_id', String(sequencerNextIdRef.current));
  }, [sequencerSlots]);

  // Initialize metronome engine once
  useEffect(() => {
    metronomeEngineRef.current = new MetronomeEngine();
    metronomeEngineRef.current.onBeat = ({ beat, subdivisionIndex }) => {
      if (subdivisionIndex === 0) {
        setMetronomeCurrentBeat(beat);
      }
    };
    metronomeEngineRef.current.onSequenceBeat = (slotIndex) => {
      setSequencerPlayingSlot(slotIndex);
    };
    metronomeEngineRef.current.onMeterSlot = (slotIndex) => {
      setMultiMeterPlayingSlot(slotIndex);
    };

    return () => {
      if (metronomeEngineRef.current) {
        metronomeEngineRef.current.destroy();
        metronomeEngineRef.current = null;
      }
    };
  }, []);

  return {
    engineRef: metronomeEngineRef,
    noSleepRef,
    bpm: metronomeBpm, setBpm: setMetronomeBpm,
    isPlaying: metronomeIsPlaying, setIsPlaying: setMetronomeIsPlaying,
    currentBeat: metronomeCurrentBeat, setCurrentBeat: setMetronomeCurrentBeat,
    timeSignature: metronomeTimeSignature, setTimeSignature: setMetronomeTimeSignature,
    subdivision: metronomeSubdivision, setSubdivision: setMetronomeSubdivision,
    soundType: metronomeSoundType, setSoundType: setMetronomeSoundType,
    accentFirstBeat: metronomeAccentFirstBeat, setAccentFirstBeat: setMetronomeAccentFirstBeat,
    sequencerBpm, setSequencerBpm, sequencerSoundType, setSequencerSoundType,
    sequencerSlots, setSequencerSlots, sequencerPlayingSlot, setSequencerPlayingSlot,
    sequencerNextIdRef,
    multiMeterBpm, setMultiMeterBpm, multiMeterSoundType, setMultiMeterSoundType,
    multiMeterSlots, setMultiMeterSlots, multiMeterPlayingSlot, setMultiMeterPlayingSlot,
  };
}
