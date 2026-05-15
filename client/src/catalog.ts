/** Flake finishes — texture paths match flake-colors.html (site root). */
export type FloorFinish = {
  id: string;
  name: string;
  /** Square sample used for floor tiling and UI thumb */
  texture: string;
  /** Approximate base tint if image fails to load */
  fallbackHex: string;
};

export const FLOOR_FINISHES: FloorFinish[] = [
  { id: 'pumice', name: 'Pumice', texture: '/images/flake-colors/pumice/F9303_PUMICE_1.8.jpg', fallbackHex: '#c5c8c9' },
  { id: 'gravel', name: 'Gravel', texture: '/images/flake-colors/gravel/FB-414_GRAVEL_1.8.jpg', fallbackHex: '#9a9a96' },
  { id: 'outback', name: 'Outback', texture: '/images/flake-colors/outback/FB-517_OUTBACK_1.8.jpg', fallbackHex: '#8b7355' },
  { id: 'carbon', name: 'Carbon', texture: '/images/flake-colors/carbon/F9202_CARBON_1.8.jpg', fallbackHex: '#4a4a4a' },
  { id: 'domino', name: 'Domino', texture: '/images/flake-colors/domino/FB-411_DOMINO_1.8.jpg', fallbackHex: '#e8e8e6' },
  { id: 'nightfall', name: 'Nightfall', texture: '/images/flake-colors/nightfall/FB-715_NIGHTFALL_1.8.jpg', fallbackHex: '#3d4550' },
  { id: 'orbit', name: 'Orbit', texture: '/images/flake-colors/orbit/FB-310_ORBIT_1.8.jpg', fallbackHex: '#7a7d82' },
  { id: 'basalt', name: 'Basalt', texture: '/images/flake-colors/basalt/F9309_BASALT_1.8.jpg', fallbackHex: '#5c5e61' },
  { id: 'creekbed', name: 'Creekbed', texture: '/images/flake-colors/creekbed/FB-716_CREEKBED_1.8.jpg', fallbackHex: '#6b6458' },
  { id: 'shoreline', name: 'Shoreline', texture: '/images/flake-colors/shoreline/FB-421_SHORELINE_1.8.jpg', fallbackHex: '#a8aeb2' },
  { id: 'merino', name: 'Merino', texture: '/images/flake-colors/merino/FB-971_MERINO_1.8.jpg', fallbackHex: '#d4cfc7' },
  { id: 'bambi', name: 'Bambi', texture: '/images/flake-colors/bambi/FB-959_BAMBI_1.8.jpg', fallbackHex: '#c4b8a8' },
];

export function getFinishById(id: string): FloorFinish | undefined {
  return FLOOR_FINISHES.find((f) => f.id === id);
}
