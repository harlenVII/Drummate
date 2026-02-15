// Noteheads are filled ellipses, tilted slightly. Stems go up from the right side.
// Beams connect stems horizontally. All use currentColor for theming.

function Notehead({ cx, cy }) {
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={3.5}
      ry={2.5}
      fill="currentColor"
      transform={`rotate(-20 ${cx} ${cy})`}
    />
  );
}

function Stem({ x, bottom, top }) {
  return <line x1={x} y1={bottom} x2={x} y2={top} stroke="currentColor" strokeWidth={1.5} />;
}

function Beam({ x1, x2, y }) {
  return (
    <rect x={x1} y={y} width={x2 - x1} height={2.5} fill="currentColor" rx={0.5} />
  );
}

// Quarter note: single note with stem
function Quarter() {
  return (
    <svg viewBox="0 0 16 32" className="w-4 h-8" fill="none">
      <Stem x={11} bottom={24} top={6} />
      <Notehead cx={8} cy={24} />
    </svg>
  );
}

// Two beamed eighth notes
function Eighth() {
  return (
    <svg viewBox="0 0 32 32" className="w-8 h-8" fill="none">
      <Beam x1={9.5} x2={25.5} y={6} />
      <Stem x={9.5} bottom={24} top={6} />
      <Stem x={25.5} bottom={24} top={6} />
      <Notehead cx={7} cy={24} />
      <Notehead cx={23} cy={24} />
    </svg>
  );
}

// Three beamed notes with triplet bracket and "3"
function Triplet() {
  return (
    <svg viewBox="0 0 44 36" className="w-11 h-9" fill="none">
      {/* Bracket */}
      <line x1={5} y1={3} x2={5} y2={6} stroke="currentColor" strokeWidth={1} />
      <line x1={5} y1={3} x2={17} y2={3} stroke="currentColor" strokeWidth={1} />
      <text x={22} y={5.5} textAnchor="middle" fill="currentColor" fontSize={7} fontWeight="bold" fontStyle="italic">3</text>
      <line x1={27} y1={3} x2={39} y2={3} stroke="currentColor" strokeWidth={1} />
      <line x1={39} y1={3} x2={39} y2={6} stroke="currentColor" strokeWidth={1} />
      {/* Notes */}
      <Beam x1={8.5} x2={36.5} y={10} />
      <Stem x={8.5} bottom={28} top={10} />
      <Stem x={22.5} bottom={28} top={10} />
      <Stem x={36.5} bottom={28} top={10} />
      <Notehead cx={6} cy={28} />
      <Notehead cx={20} cy={28} />
      <Notehead cx={34} cy={28} />
    </svg>
  );
}

// Six beamed sextuplet notes (two beams)
function Sextuplet() {
  return (
    <svg viewBox="0 0 60 36" className="w-15 h-9" fill="none">
      {/* Bracket */}
      <line x1={5} y1={3} x2={5} y2={6} stroke="currentColor" strokeWidth={1} />
      <line x1={5} y1={3} x2={19} y2={3} stroke="currentColor" strokeWidth={1} />
      <text x={27} y={5.5} textAnchor="middle" fill="currentColor" fontSize={7} fontWeight="bold" fontStyle="italic">6</text>
      <line x1={35} y1={3} x2={55} y2={3} stroke="currentColor" strokeWidth={1} />
      <line x1={55} y1={3} x2={55} y2={6} stroke="currentColor" strokeWidth={1} />
      {/* Notes */}
      <Beam x1={8.5} x2={51.5} y={10} />
      <Stem x={8.5} bottom={28} top={10} />
      <Stem x={18} bottom={28} top={10} />
      <Stem x={27.5} bottom={28} top={10} />
      <Stem x={37} bottom={28} top={10} />
      <Stem x={46.5} bottom={28} top={10} />
      <Stem x={56} bottom={28} top={10} />
      <Notehead cx={6} cy={28} />
      <Notehead cx={15.5} cy={28} />
      <Notehead cx={25} cy={28} />
      <Notehead cx={34.5} cy={28} />
      <Notehead cx={44} cy={28} />
      <Notehead cx={53.5} cy={28} />
    </svg>
  );
}

// Four beamed sixteenth notes (two beams)
function Sixteenth() {
  return (
    <svg viewBox="0 0 48 32" className="w-12 h-8" fill="none">
      <Beam x1={7.5} x2={43.5} y={6} />
      <Beam x1={7.5} x2={43.5} y={10} />
      <Stem x={7.5} bottom={24} top={6} />
      <Stem x={19.5} bottom={24} top={6} />
      <Stem x={31.5} bottom={24} top={6} />
      <Stem x={43.5} bottom={24} top={6} />
      <Notehead cx={5} cy={24} />
      <Notehead cx={17} cy={24} />
      <Notehead cx={29} cy={24} />
      <Notehead cx={41} cy={24} />
    </svg>
  );
}

// One eighth + two sixteenths: beam across all, double beam on last two
function EighthTwoSixteenths() {
  return (
    <svg viewBox="0 0 44 32" className="w-11 h-8" fill="none">
      <Beam x1={8.5} x2={38.5} y={6} />
      <Beam x1={24.5} x2={38.5} y={10} />
      <Stem x={8.5} bottom={24} top={6} />
      <Stem x={24.5} bottom={24} top={6} />
      <Stem x={38.5} bottom={24} top={6} />
      <Notehead cx={6} cy={24} />
      <Notehead cx={22} cy={24} />
      <Notehead cx={36} cy={24} />
    </svg>
  );
}

// Two sixteenths + one eighth: double beam on first two, single beam across all
function TwoSixteenthsEighth() {
  return (
    <svg viewBox="0 0 44 32" className="w-11 h-8" fill="none">
      <Beam x1={8.5} x2={38.5} y={6} />
      <Beam x1={8.5} x2={22.5} y={10} />
      <Stem x={8.5} bottom={24} top={6} />
      <Stem x={22.5} bottom={24} top={6} />
      <Stem x={38.5} bottom={24} top={6} />
      <Notehead cx={6} cy={24} />
      <Notehead cx={20} cy={24} />
      <Notehead cx={36} cy={24} />
    </svg>
  );
}

// Sixteenth + eighth + sixteenth: double beam on first, single across all, double beam on last
function SixteenthEighthSixteenth() {
  return (
    <svg viewBox="0 0 44 32" className="w-11 h-8" fill="none">
      <Beam x1={8.5} x2={38.5} y={6} />
      {/* Left partial beam */}
      <Beam x1={8.5} x2={16} y={10} />
      {/* Right partial beam */}
      <Beam x1={31} x2={38.5} y={10} />
      <Stem x={8.5} bottom={24} top={6} />
      <Stem x={22.5} bottom={24} top={6} />
      <Stem x={38.5} bottom={24} top={6} />
      <Notehead cx={6} cy={24} />
      <Notehead cx={20} cy={24} />
      <Notehead cx={36} cy={24} />
    </svg>
  );
}

// Quarter rest symbol
function Rest() {
  return (
    <svg viewBox="0 0 16 32" className="w-4 h-8" fill="none">
      {/* Quarter rest zigzag path */}
      <path
        d="M 10 8 L 6 12 L 10 16 L 6 20 L 10 24"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Rest hook at bottom */}
      <circle cx={10} cy={26} r={2} fill="currentColor" />
    </svg>
  );
}

const ICONS = {
  quarter: Quarter,
  eighth: Eighth,
  triplet: Triplet,
  sextuplet: Sextuplet,
  sixteenth: Sixteenth,
  eighthTwoSixteenths: EighthTwoSixteenths,
  twoSixteenthsEighth: TwoSixteenthsEighth,
  sixteenthEighthSixteenth: SixteenthEighthSixteenth,
  rest: Rest,
};

function SubdivisionIcon({ type }) {
  const Icon = ICONS[type];
  if (!Icon) return null;
  return <Icon />;
}

export default SubdivisionIcon;
