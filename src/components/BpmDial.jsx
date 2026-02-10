import { useRef, useCallback } from 'react';

const MIN_ANGLE = 135;
const MAX_ANGLE = 405;
const ANGLE_RANGE = MAX_ANGLE - MIN_ANGLE; // 270
const MIN_BPM = 30;
const MAX_BPM = 300;
const BPM_RANGE = MAX_BPM - MIN_BPM; // 270

const CX = 140;
const CY = 140;
const RADIUS = 120;
const TICK_INNER = 108;
const TICK_OUTER = 118;
const HANDLE_RADIUS = 14;
const NUM_TICKS = 54;

function bpmToAngle(bpm) {
  const clamped = Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));
  return MIN_ANGLE + ((clamped - MIN_BPM) / BPM_RANGE) * ANGLE_RANGE;
}

function angleToBpm(angleDeg) {
  let normalized = angleDeg - MIN_ANGLE;
  if (normalized < 0) normalized += 360;
  if (normalized > ANGLE_RANGE) {
    normalized = normalized > ANGLE_RANGE + 45 ? 0 : ANGLE_RANGE;
  }
  const ratio = Math.max(0, Math.min(1, normalized / ANGLE_RANGE));
  return Math.round(MIN_BPM + ratio * BPM_RANGE);
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

function getTempoName(bpm) {
  if (bpm < 40) return 'Grave';
  if (bpm < 60) return 'Largo';
  if (bpm < 66) return 'Larghetto';
  if (bpm < 76) return 'Adagio';
  if (bpm < 108) return 'Andante';
  if (bpm < 120) return 'Moderato';
  if (bpm < 156) return 'Allegro';
  if (bpm < 176) return 'Vivace';
  if (bpm < 200) return 'Presto';
  return 'Prestissimo';
}

// Pre-compute tick marks
const ticks = Array.from({ length: NUM_TICKS }, (_, i) => {
  const angle = MIN_ANGLE + (i / (NUM_TICKS - 1)) * ANGLE_RANGE;
  const inner = polarToCartesian(CX, CY, TICK_INNER, angle);
  const outer = polarToCartesian(CX, CY, TICK_OUTER, angle);
  const isMajor = i % 9 === 0;
  return { ...inner, x2: outer.x, y2: outer.y, isMajor };
});

function BpmDial({ bpm, onBpmChange }) {
  const svgRef = useRef(null);
  const isDragging = useRef(false);

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
      onBpmChange(angleToBpm(angle));
    },
    [getAngleFromPointer, onBpmChange],
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!isDragging.current) return;
      const angle = getAngleFromPointer(e.clientX, e.clientY);
      onBpmChange(angleToBpm(angle));
    },
    [getAngleFromPointer, onBpmChange],
  );

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const currentAngle = bpmToAngle(bpm);
  const handle = polarToCartesian(CX, CY, RADIUS, currentAngle);
  const arcPath = describeArc(CX, CY, RADIUS, MIN_ANGLE, currentAngle);

  return (
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

      {/* Active arc */}
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
        {getTempoName(bpm)}
      </text>
      <text
        x={CX}
        y={CY + 36}
        textAnchor="middle"
        style={{ fontSize: '12px' }}
        fill="#9ca3af"
      >
        BPM
      </text>
    </svg>
  );
}

export default BpmDial;
