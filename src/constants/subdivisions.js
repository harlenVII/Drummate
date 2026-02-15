export const SUBDIVISIONS = [
  { key: 'quarter', pattern: [0] },
  { key: 'eighth', pattern: [0, 0.5] },
  { key: 'triplet', pattern: [0, 1 / 3, 2 / 3] },
  { key: 'sextuplet', pattern: [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6] },
  { key: 'sixteenth', pattern: [0, 0.25, 0.5, 0.75] },
  { key: 'eighthTwoSixteenths', pattern: [0, 0.5, 0.75] },
  { key: 'twoSixteenthsEighth', pattern: [0, 0.25, 0.5] },
  { key: 'sixteenthEighthSixteenth', pattern: [0, 0.25, 0.75] },
  { key: 'rest', pattern: null },
];
