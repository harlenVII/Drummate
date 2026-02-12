import { useRef, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

const MIN_BPM = 30;
const MAX_BPM = 300;

const CX = 140;
const CY = 140;
const RADIUS = 120;
const TICK_INNER = 108;
const TICK_OUTER = 118;
const HANDLE_RADIUS = 14;
const NUM_TICKS = 36; // Evenly spaced tick marks around the circle

// For infinite turn, we just track the visual angle based on BPM
// Each full rotation represents 60 BPM (5 rotations for 30-300 range)
const BPM_PER_ROTATION = 60;

function bpmToAngle(bpm) {
  const clamped = Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));
  // Convert BPM to degrees (continuous rotation)
  return ((clamped - MIN_BPM) / BPM_PER_ROTATION) * 360;
}

function polarToCartesian(cx, cy, radius, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function describeArc(cx, cy, radius, startAngle, endAngle) {
  if (endAngle - startAngle < 0.5) return '';
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function getTempoName(bpm, t) {
  if (bpm < 40) return t('tempoNames.grave');
  if (bpm < 60) return t('tempoNames.largo');
  if (bpm < 66) return t('tempoNames.larghetto');
  if (bpm < 76) return t('tempoNames.adagio');
  if (bpm < 108) return t('tempoNames.andante');
  if (bpm < 120) return t('tempoNames.moderato');
  if (bpm < 156) return t('tempoNames.allegro');
  if (bpm < 176) return t('tempoNames.vivace');
  if (bpm < 200) return t('tempoNames.presto');
  return t('tempoNames.prestissimo');
}

// Pre-compute tick marks evenly around the circle
const ticks = Array.from({ length: NUM_TICKS }, (_, i) => {
  const angle = (i / NUM_TICKS) * 360;
  const inner = polarToCartesian(CX, CY, TICK_INNER, angle);
  const outer = polarToCartesian(CX, CY, TICK_OUTER, angle);
  const isMajor = i % 6 === 0; // Every 6th tick is major (6 major ticks total)
  return { ...inner, x2: outer.x, y2: outer.y, isMajor };
});

function BpmDial({ bpm, onBpmChange }) {
  const { t } = useLanguage();
  const svgRef = useRef(null);
  const isDragging = useRef(false);
  const lastAngle = useRef(null);
  const accumulatedRotation = useRef(0);

  const getAngleFromPointer = useCallback((clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (angle < 0) angle += 360;
    return angle;
  }, []);

  const handlePointerDown = useCallback(
    (e) => {
      isDragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      const angle = getAngleFromPointer(e.clientX, e.clientY);
      lastAngle.current = angle;
      accumulatedRotation.current = 0;
    },
    [getAngleFromPointer],
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!isDragging.current) return;
      const angle = getAngleFromPointer(e.clientX, e.clientY);

      if (lastAngle.current !== null) {
        let delta = angle - lastAngle.current;

        // Handle wrapping around 0/360
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;

        accumulatedRotation.current += delta;

        // Convert rotation to BPM change
        const bpmChange = (accumulatedRotation.current / 360) * BPM_PER_ROTATION;
        const newBpm = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm + bpmChange)));

        if (newBpm !== bpm) {
          onBpmChange(newBpm);
          accumulatedRotation.current = 0;
        }
      }

      lastAngle.current = angle;
    },
    [getAngleFromPointer, onBpmChange, bpm],
  );

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
    lastAngle.current = null;
    accumulatedRotation.current = 0;
  }, []);

  const handleIncrement = useCallback(() => {
    const newBpm = Math.min(MAX_BPM, bpm + 1);
    onBpmChange(newBpm);
  }, [bpm, onBpmChange]);

  const handleDecrement = useCallback(() => {
    const newBpm = Math.max(MIN_BPM, bpm - 1);
    onBpmChange(newBpm);
  }, [bpm, onBpmChange]);

  const currentAngle = bpmToAngle(bpm);
  const handle = polarToCartesian(CX, CY, RADIUS, currentAngle);

  // For infinite turn, show a short arc segment (45 degrees) leading up to the handle
  const arcStartAngle = currentAngle - 45;
  const arcPath = describeArc(CX, CY, RADIUS, arcStartAngle, currentAngle);

  return (
    <div className="flex items-center gap-4">
      {/* Decrement button */}
      <button
        onClick={handleDecrement}
        className="w-12 h-12 flex items-center justify-center bg-white border-2 border-gray-300 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
        aria-label="Decrease BPM"
      >
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <line x1="5" y1="12" x2="19" y2="12" className="text-gray-700" />
        </svg>
      </button>

      {/* SVG Dial */}
      <svg
        ref={svgRef}
        viewBox="0 0 280 280"
        className="w-64 h-64 touch-none select-none cursor-pointer"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Background track */}
        <circle
          cx={CX}
          cy={CY}
          r={RADIUS}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="8"
          strokeLinecap="round"
        />

        {/* Tick marks */}
        {ticks.map((tick, i) => (
          <line
            key={i}
            x1={tick.x}
            y1={tick.y}
            x2={tick.x2}
            y2={tick.y2}
            stroke={tick.isMajor ? '#9ca3af' : '#d1d5db'}
            strokeWidth={tick.isMajor ? 2 : 1}
          />
        ))}

        {/* Active arc segment */}
        {arcPath && (
          <path
            d={arcPath}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="8"
            strokeLinecap="round"
          />
        )}

        {/* Drag handle */}
        <circle
          cx={handle.x}
          cy={handle.y}
          r={HANDLE_RADIUS}
          fill="#3b82f6"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
        />

        {/* Center text */}
        <text
          x={CX}
          y={CY - 12}
          textAnchor="middle"
          style={{ fontSize: '48px', fontWeight: '700' }}
          fill="#1f2937"
        >
          {bpm}
        </text>
        <text
          x={CX}
          y={CY + 16}
          textAnchor="middle"
          style={{ fontSize: '16px', fontWeight: '500' }}
          fill="#6b7280"
        >
          {getTempoName(bpm, t)}
        </text>
        <text
          x={CX}
          y={CY + 36}
          textAnchor="middle"
          style={{ fontSize: '12px' }}
          fill="#9ca3af"
        >
          {t('bpm')}
        </text>
      </svg>

      {/* Increment button */}
      <button
        onClick={handleIncrement}
        className="w-12 h-12 flex items-center justify-center bg-white border-2 border-gray-300 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
        aria-label="Increase BPM"
      >
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" className="text-gray-700" />
          <line x1="5" y1="12" x2="19" y2="12" className="text-gray-700" />
        </svg>
      </button>
    </div>
  );
}

export default BpmDial;
