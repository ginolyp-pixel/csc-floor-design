/** Flake finishes — order and split match flake-colors.html on the marketing site. */
export type FlakeCategory = "standard" | "custom";

export type FloorFinish = {
  id: string;
  name: string;
  category: FlakeCategory;
  /** Square sample used for floor tiling and UI thumb */
  texture: string;
  /** Approximate base tint if image fails to load */
  fallbackHex: string;
};

const STANDARD: FloorFinish[] = [
  { id: "outback",    name: "Outback",     category: "standard", texture: "/images/flake-colors/outback/FB-517_OUTBACK_1.8.jpg",          fallbackHex: "#8b7355" },
  { id: "gravel",     name: "Gravel",      category: "standard", texture: "/images/flake-colors/gravel/FB-414_GRAVEL_1.8.jpg",            fallbackHex: "#9a9a96" },
  { id: "domino",     name: "Domino",      category: "standard", texture: "/images/flake-colors/domino/FB-411_DOMINO_1.8.jpg",            fallbackHex: "#e8e8e6" },
  { id: "cabinfever", name: "Cabin Fever", category: "standard", texture: "/images/flake-colors/cabinfever/FB-127_CABINFEVER_1.8.jpg",    fallbackHex: "#8b6f4e" },
  { id: "orbit",      name: "Orbit",       category: "standard", texture: "/images/flake-colors/orbit/FB-310_ORBIT_1.8.jpg",              fallbackHex: "#7a7d82" },
  { id: "wombat",     name: "Wombat",      category: "standard", texture: "/images/flake-colors/wombat/FB-616_WOMBAT_1.8.jpg",            fallbackHex: "#6e6055" },
  { id: "tidalwave",  name: "Tidalwave",   category: "standard", texture: "/images/flake-colors/tidalwave/FB-807_TIDALWAVE_1.8.jpg",      fallbackHex: "#5d6970" },
  { id: "coyote",     name: "Coyote",      category: "standard", texture: "/images/flake-colors/coyote/FB-513_COYOTE_1.8.jpg",            fallbackHex: "#b89a73" },
  { id: "creekbed",   name: "Creekbed",    category: "standard", texture: "/images/flake-colors/creekbed/FB-716_CREEKBED_1.8.jpg",        fallbackHex: "#6b6458" },
  { id: "shoreline",  name: "Shoreline",   category: "standard", texture: "/images/flake-colors/shoreline/FB-421_SHORELINE_1.8.jpg",      fallbackHex: "#a8aeb2" },
  { id: "nightfall",  name: "Nightfall",   category: "standard", texture: "/images/flake-colors/nightfall/FB-715_NIGHTFALL_1.8.jpg",      fallbackHex: "#3d4550" },
];

const CUSTOM: FloorFinish[] = [
  { id: "thyme",           name: "Thyme",            category: "custom", texture: "/images/flake-colors/thyme/FB-977_THYME_1.8.jpg",                     fallbackHex: "#6b7461" },
  { id: "hog",             name: "Hog",              category: "custom", texture: "/images/flake-colors/hog/FB-606_HOG_1.8.jpg",                         fallbackHex: "#7a7068" },
  { id: "carbon",          name: "Carbon",           category: "custom", texture: "/images/flake-colors/carbon/F9202_CARBON_1.8.jpg",                    fallbackHex: "#4a4a4a" },
  { id: "waxwing",         name: "Waxwing",          category: "custom", texture: "/images/flake-colors/waxwing/FB-968_WAXWING_1.8.jpg",                 fallbackHex: "#c4a06b" },
  { id: "robin",           name: "Robin",            category: "custom", texture: "/images/flake-colors/robin/FB-973_ROBIN_1.8.jpg",                     fallbackHex: "#82959f" },
  { id: "pumice",          name: "Pumice",           category: "custom", texture: "/images/flake-colors/pumice/F9303_PUMICE_1.8.jpg",                    fallbackHex: "#c5c8c9" },
  { id: "basalt",          name: "Basalt",           category: "custom", texture: "/images/flake-colors/basalt/F9309_BASALT_1.8.jpg",                    fallbackHex: "#5c5e61" },
  { id: "blacktop",        name: "Blacktop",         category: "custom", texture: "/images/flake-colors/blacktop/FB-4112_BLACKTOP_18.jpg",               fallbackHex: "#2a2a2c" },
  { id: "loon",            name: "Loon",             category: "custom", texture: "/images/flake-colors/loon/FB-966_LOON_1.8.jpg",                       fallbackHex: "#8b8d8f" },
  { id: "merino",          name: "Merino",           category: "custom", texture: "/images/flake-colors/merino/FB-971_MERINO_1.8.jpg",                   fallbackHex: "#d4cfc7" },
  { id: "bambi",           name: "Bambi",            category: "custom", texture: "/images/flake-colors/bambi/FB-959_BAMBI_1.8.jpg",                     fallbackHex: "#c4b8a8" },
  { id: "woodland",        name: "Woodland",         category: "custom", texture: "/images/flake-colors/woodland/FB-516_WOODLAND_1.8.jpg",               fallbackHex: "#6e7556" },
  { id: "yellowjacket",    name: "Yellowjacket",     category: "custom", texture: "/images/flake-colors/yellowjacket/FB-332_YELLOWJACKET_1.8.jpg",       fallbackHex: "#a8965a" },
  { id: "bean",            name: "Bean",             category: "custom", texture: "/images/flake-colors/bean/FB-960_BEAN_1.8.jpg",                       fallbackHex: "#6e5944" },
  { id: "comet",           name: "Comet",            category: "custom", texture: "/images/flake-colors/comet/FB-711_COMET_1.8.jpg",                     fallbackHex: "#969ca2" },
  { id: "coldwatercanyon", name: "Coldwater Canyon", category: "custom", texture: "/images/flake-colors/coldwatercanyon/FB-304_COLDWATERCANYON_1.8.jpg", fallbackHex: "#7a8fa3" },
  { id: "dingo",           name: "Dingo",            category: "custom", texture: "/images/flake-colors/dingo/FB-980_DINGO_1.8.jpg",                     fallbackHex: "#a78268" },
];

export const FLOOR_FINISHES: FloorFinish[] = [...STANDARD, ...CUSTOM];
export const STANDARD_FINISHES: FloorFinish[] = STANDARD;
export const CUSTOM_FINISHES: FloorFinish[] = CUSTOM;

export function getFinishById(id: string): FloorFinish | undefined {
  return FLOOR_FINISHES.find((f) => f.id === id);
}
