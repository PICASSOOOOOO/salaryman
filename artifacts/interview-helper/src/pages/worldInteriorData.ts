import { CITY_NAME } from '../gameSystems';

export interface InventoryItem {
  id: string;
  name: string;
  desc: string;
  icon: string;
  stackable: boolean;
  qty: number;
  value: number;
}

export const INVENTORY_GRID_COLS = 6;
export const INVENTORY_GRID_ROWS = 4;
export const INVENTORY_MAX_SLOTS = INVENTORY_GRID_COLS * INVENTORY_GRID_ROWS;

export interface NewspaperIssue {
  issue: number;
  season: string;
  headline: string;
  subhead: string;
  articles: { title: string; body: string }[];
  ads: string[];
  weather: string;
  editorial: string;
}

export type FurnitureCategory = 'seating' | 'beds' | 'desks' | 'storage' | 'lighting' | 'wall_art' | 'plants' | 'electronics' | 'rugs' | 'kitchen' | 'decor';

export interface FurnitureVariant {
  id: string;
  label: string;
  color: string;
  accent?: string;
}

export interface FurnitureItemDef {
  id: string;
  name: string;
  category: FurnitureCategory;
  gridW: number;
  gridH: number;
  price: number;
  desc: string;
  variants: FurnitureVariant[];
  wallMounted?: boolean;
}

export interface PlacedFurnitureItem {
  id: string;
  furnitureId: string;
  variantId: string;
  gridX: number;
  gridY: number;
  rotation: 0 | 90 | 180 | 270;
}

export const FURNITURE_GRID_SIZE = 16;

export const FURNITURE_CATALOG: FurnitureItemDef[] = [
  // ── SEATING ───────────────────────────────────────────────────────────────
  { id: 'sofa_2seat', name: 'SOFA (2-SEAT)', category: 'seating', gridW: 3, gridH: 2, price: 4500, desc: 'A compact two-seater sofa. Comfortable.',
    variants: [
      { id: 'grey', label: 'GREY', color: 'rgb(90,90,95)', accent: 'rgb(110,110,115)' },
      { id: 'red', label: 'RED', color: 'rgb(120,30,30)', accent: 'rgb(150,40,40)' },
      { id: 'green', label: 'GREEN', color: 'rgb(30,90,50)', accent: 'rgb(40,110,60)' },
      { id: 'blue', label: 'BLUE', color: 'rgb(30,50,120)', accent: 'rgb(40,65,150)' },
    ] },
  { id: 'armchair', name: 'ARMCHAIR', category: 'seating', gridW: 2, gridH: 2, price: 2200, desc: 'A plush single armchair.',
    variants: [
      { id: 'brown', label: 'BROWN', color: 'rgb(100,65,30)', accent: 'rgb(130,85,40)' },
      { id: 'black', label: 'BLACK', color: 'rgb(25,25,30)', accent: 'rgb(40,40,45)' },
      { id: 'cream', label: 'CREAM', color: 'rgb(200,190,170)', accent: 'rgb(220,210,190)' },
    ] },
  { id: 'stool', name: 'BAR STOOL', category: 'seating', gridW: 1, gridH: 1, price: 800, desc: 'Metal bar stool. Stackable.',
    variants: [
      { id: 'metal', label: 'METAL', color: 'rgb(140,140,145)', accent: 'rgb(160,160,165)' },
      { id: 'black', label: 'BLACK', color: 'rgb(30,30,35)', accent: 'rgb(50,50,55)' },
    ] },
  { id: 'bench', name: 'WOODEN BENCH', category: 'seating', gridW: 3, gridH: 1, price: 1800, desc: 'Simple wooden bench seating.',
    variants: [
      { id: 'oak', label: 'OAK', color: 'rgb(130,90,45)', accent: 'rgb(110,75,35)' },
      { id: 'dark', label: 'DARK WOOD', color: 'rgb(60,40,20)', accent: 'rgb(80,55,25)' },
    ] },
  { id: 'office_chair', name: 'OFFICE CHAIR', category: 'seating', gridW: 1, gridH: 1, price: 3000, desc: 'Ergonomic office chair with lumbar support.',
    variants: [
      { id: 'black', label: 'BLACK', color: 'rgb(30,30,35)', accent: 'rgb(50,50,55)' },
      { id: 'white', label: 'WHITE', color: 'rgb(220,220,225)', accent: 'rgb(200,200,205)' },
    ] },
  // ── BEDS ──────────────────────────────────────────────────────────────────
  { id: 'single_bed', name: 'SINGLE BED', category: 'beds', gridW: 2, gridH: 3, price: 5000, desc: 'A compact single bed. Rest here to recover.',
    variants: [
      { id: 'blue', label: 'BLUE SHEETS', color: 'rgb(80,110,140)', accent: 'rgb(65,85,110)' },
      { id: 'green', label: 'GREEN SHEETS', color: 'rgb(50,100,60)', accent: 'rgb(40,80,50)' },
      { id: 'red', label: 'RED SHEETS', color: 'rgb(120,40,40)', accent: 'rgb(90,30,30)' },
    ] },
  { id: 'double_bed', name: 'DOUBLE BED', category: 'beds', gridW: 3, gridH: 4, price: 9000, desc: 'A full double bed. Premium rest bonus.',
    variants: [
      { id: 'white', label: 'WHITE LINEN', color: 'rgb(230,230,235)', accent: 'rgb(110,80,50)' },
      { id: 'navy', label: 'NAVY SHEETS', color: 'rgb(20,40,90)', accent: 'rgb(100,70,40)' },
      { id: 'charcoal', label: 'CHARCOAL', color: 'rgb(50,50,55)', accent: 'rgb(80,65,45)' },
    ] },
  { id: 'bunk_bed', name: 'BUNK BED', category: 'beds', gridW: 2, gridH: 3, price: 6500, desc: 'Stacked bunks for compact spaces.',
    variants: [
      { id: 'metal', label: 'METAL FRAME', color: 'rgb(80,90,100)', accent: 'rgb(60,90,120)' },
      { id: 'wood', label: 'WOOD FRAME', color: 'rgb(100,70,40)', accent: 'rgb(60,100,120)' },
    ] },
  // ── DESKS ─────────────────────────────────────────────────────────────────
  { id: 'writing_desk', name: 'WRITING DESK', category: 'desks', gridW: 3, gridH: 2, price: 3500, desc: 'A simple writing desk. Classic.',
    variants: [
      { id: 'oak', label: 'OAK', color: 'rgb(130,90,45)', accent: 'rgb(110,75,35)' },
      { id: 'metal', label: 'METAL', color: 'rgb(80,85,90)', accent: 'rgb(100,105,110)' },
      { id: 'white', label: 'WHITE', color: 'rgb(210,210,215)', accent: 'rgb(190,190,195)' },
    ] },
  { id: 'corner_desk', name: 'CORNER DESK', category: 'desks', gridW: 4, gridH: 4, price: 7000, desc: 'L-shaped corner desk. Max workspace.',
    variants: [
      { id: 'black', label: 'BLACK', color: 'rgb(30,30,35)', accent: 'rgb(50,50,55)' },
      { id: 'walnut', label: 'WALNUT', color: 'rgb(80,50,25)', accent: 'rgb(100,65,35)' },
    ] },
  { id: 'standing_desk', name: 'STANDING DESK', category: 'desks', gridW: 3, gridH: 2, price: 8500, desc: 'Height-adjustable standing desk.',
    variants: [
      { id: 'white', label: 'WHITE/CHROME', color: 'rgb(210,210,215)', accent: 'rgb(160,160,165)' },
      { id: 'black', label: 'BLACK/CHROME', color: 'rgb(25,25,30)', accent: 'rgb(160,160,165)' },
    ] },
  // ── STORAGE ───────────────────────────────────────────────────────────────
  { id: 'wardrobe', name: 'WARDROBE', category: 'storage', gridW: 2, gridH: 1, price: 6000, desc: 'A large wardrobe for clothes storage.',
    variants: [
      { id: 'white', label: 'WHITE', color: 'rgb(210,210,215)', accent: 'rgb(180,180,185)' },
      { id: 'dark', label: 'DARK OAK', color: 'rgb(60,40,20)', accent: 'rgb(80,55,30)' },
    ] },
  { id: 'bookcase', name: 'BOOKCASE', category: 'storage', gridW: 2, gridH: 1, price: 3800, desc: 'A tall bookcase. Fill it with lore.',
    variants: [
      { id: 'oak', label: 'OAK', color: 'rgb(120,85,45)', accent: 'rgb(100,70,35)' },
      { id: 'black', label: 'BLACK', color: 'rgb(25,25,30)', accent: 'rgb(40,40,45)' },
    ] },
  { id: 'storage_box', name: 'STORAGE BOX', category: 'storage', gridW: 1, gridH: 1, price: 900, desc: 'Stackable storage cube.',
    variants: [
      { id: 'grey', label: 'GREY', color: 'rgb(120,120,125)', accent: 'rgb(100,100,105)' },
      { id: 'black', label: 'BLACK', color: 'rgb(30,30,35)', accent: 'rgb(50,50,55)' },
      { id: 'white', label: 'WHITE', color: 'rgb(230,230,235)', accent: 'rgb(200,200,205)' },
    ] },
  { id: 'dresser', name: 'DRESSER', category: 'storage', gridW: 2, gridH: 1, price: 4200, desc: 'Chest of drawers for personal items.',
    variants: [
      { id: 'white', label: 'WHITE', color: 'rgb(210,210,215)', accent: 'rgb(180,180,185)' },
      { id: 'walnut', label: 'WALNUT', color: 'rgb(80,50,25)', accent: 'rgb(60,40,20)' },
    ] },
  // ── LIGHTING ──────────────────────────────────────────────────────────────
  { id: 'floor_lamp', name: 'FLOOR LAMP', category: 'lighting', gridW: 1, gridH: 1, price: 2000, desc: 'Arc floor lamp. Warm ambient glow.',
    variants: [
      { id: 'gold', label: 'GOLD', color: 'rgb(180,140,30)', accent: 'rgb(255,220,100)' },
      { id: 'chrome', label: 'CHROME', color: 'rgb(160,160,165)', accent: 'rgb(220,220,225)' },
      { id: 'black', label: 'MATTE BLACK', color: 'rgb(25,25,30)', accent: 'rgb(255,200,80)' },
    ] },
  { id: 'neon_tube', name: 'NEON TUBE', category: 'lighting', gridW: 2, gridH: 1, price: 3500, desc: 'Glowing neon tube. Wall-mounted. Very cyberpunk.',
    wallMounted: true,
    variants: [
      { id: 'pink', label: 'PINK', color: 'rgb(255,60,150)', accent: 'rgba(255,60,150,0.3)' },
      { id: 'blue', label: 'BLUE', color: 'rgb(60,130,255)', accent: 'rgba(60,130,255,0.3)' },
      { id: 'green', label: 'GREEN', color: 'rgb(0,255,65)', accent: 'rgba(0,255,65,0.3)' },
      { id: 'orange', label: 'ORANGE', color: 'rgb(255,140,0)', accent: 'rgba(255,140,0,0.3)' },
    ] },
  { id: 'table_lamp', name: 'TABLE LAMP', category: 'lighting', gridW: 1, gridH: 1, price: 1200, desc: 'Small bedside table lamp.',
    variants: [
      { id: 'white', label: 'WHITE', color: 'rgb(210,210,215)', accent: 'rgb(255,230,160)' },
      { id: 'brass', label: 'BRASS', color: 'rgb(160,120,40)', accent: 'rgb(255,220,100)' },
    ] },
  // ── WALL ART ──────────────────────────────────────────────────────────────
  { id: 'framed_print', name: 'FRAMED PRINT', category: 'wall_art', gridW: 2, gridH: 1, price: 1800, desc: 'A framed art print. Hang it on your wall.',
    wallMounted: true,
    variants: [
      { id: 'cityscape', label: 'CITYSCAPE', color: 'rgb(30,40,60)', accent: 'rgb(0,200,255)' },
      { id: 'abstract', label: 'ABSTRACT', color: 'rgb(60,20,80)', accent: 'rgb(200,60,255)' },
      { id: 'wasteland', label: 'WASTELAND', color: 'rgb(60,45,20)', accent: 'rgb(200,150,50)' },
      { id: 'propaganda', label: 'PROPAGANDA', color: 'rgb(120,10,10)', accent: 'rgb(255,220,0)' },
    ] },
  { id: 'graffiti_panel', name: 'GRAFFITI PANEL', category: 'wall_art', gridW: 3, gridH: 1, price: 2500, desc: 'A spray-painted graffiti canvas.',
    wallMounted: true,
    variants: [
      { id: 'cyan', label: 'CYAN TAG', color: 'rgb(0,200,200)', accent: 'rgb(0,255,220)' },
      { id: 'red', label: 'RED TAG', color: 'rgb(220,40,40)', accent: 'rgb(255,80,60)' },
      { id: 'yellow', label: 'YELLOW TAG', color: 'rgb(220,200,0)', accent: 'rgb(255,240,60)' },
    ] },
  { id: 'neon_sign_wall', name: 'NEON SIGN', category: 'wall_art', gridW: 3, gridH: 1, price: 5000, desc: 'Custom neon sign. Glows all night.',
    wallMounted: true,
    variants: [
      { id: 'open', label: 'OPEN', color: 'rgb(0,255,65)', accent: 'rgba(0,255,65,0.4)' },
      { id: 'no_vacancy', label: 'NO VACANCY', color: 'rgb(255,60,60)', accent: 'rgba(255,60,60,0.4)' },
      { id: 'coffee', label: 'COFFEE', color: 'rgb(255,180,60)', accent: 'rgba(255,180,60,0.4)' },
      { id: 'bar', label: 'BAR', color: 'rgb(200,60,255)', accent: 'rgba(200,60,255,0.4)' },
    ] },
  { id: 'clock_wall', name: 'WALL CLOCK', category: 'wall_art', gridW: 1, gridH: 1, price: 1500, desc: 'A round wall clock.',
    wallMounted: true,
    variants: [
      { id: 'white', label: 'WHITE', color: 'rgb(230,230,235)', accent: 'rgb(20,20,25)' },
      { id: 'wood', label: 'WOOD', color: 'rgb(130,90,45)', accent: 'rgb(20,20,25)' },
    ] },
  // ── PLANTS ────────────────────────────────────────────────────────────────
  { id: 'potted_plant_sm', name: 'SMALL PLANT', category: 'plants', gridW: 1, gridH: 1, price: 600, desc: 'A small potted plant. Low maintenance.',
    variants: [
      { id: 'green', label: 'GREEN', color: 'rgb(40,110,50)', accent: 'rgb(130,90,45)' },
      { id: 'succulent', label: 'SUCCULENT', color: 'rgb(60,130,60)', accent: 'rgb(140,100,50)' },
    ] },
  { id: 'potted_plant_lg', name: 'LARGE PLANT', category: 'plants', gridW: 2, gridH: 2, price: 2200, desc: 'A tall leafy plant. Statement piece.',
    variants: [
      { id: 'green', label: 'TROPICAL GREEN', color: 'rgb(30,100,40)', accent: 'rgb(120,80,35)' },
      { id: 'dark', label: 'DARK LEAF', color: 'rgb(20,60,30)', accent: 'rgb(100,70,30)' },
    ] },
  { id: 'hanging_plant', name: 'HANGING PLANT', category: 'plants', gridW: 1, gridH: 1, price: 1400, desc: 'A trailing plant hung from the ceiling.',
    wallMounted: true,
    variants: [
      { id: 'green', label: 'IVY', color: 'rgb(40,130,50)', accent: 'rgb(30,90,40)' },
      { id: 'purple', label: 'PURPLE VINE', color: 'rgb(100,40,130)', accent: 'rgb(70,30,90)' },
    ] },
  { id: 'bonsai', name: 'BONSAI TREE', category: 'plants', gridW: 1, gridH: 1, price: 3500, desc: 'A carefully cultivated miniature tree.',
    variants: [
      { id: 'pine', label: 'PINE', color: 'rgb(20,70,30)', accent: 'rgb(80,60,30)' },
      { id: 'flowering', label: 'FLOWERING', color: 'rgb(20,70,30)', accent: 'rgb(180,60,100)' },
    ] },
  // ── ELECTRONICS ───────────────────────────────────────────────────────────
  { id: 'tv_unit', name: 'WALL TV', category: 'electronics', gridW: 3, gridH: 1, price: 12000, desc: 'A large flat-panel TV. Wall-mountable.',
    wallMounted: true,
    variants: [
      { id: 'black', label: 'BLACK BEZEL', color: 'rgb(15,15,20)', accent: 'rgb(30,80,180)' },
      { id: 'silver', label: 'SILVER BEZEL', color: 'rgb(160,160,165)', accent: 'rgb(30,80,180)' },
    ] },
  { id: 'gaming_setup', name: 'GAMING SETUP', category: 'electronics', gridW: 3, gridH: 2, price: 18000, desc: 'Full gaming rig. Triple monitors. RGB.',
    variants: [
      { id: 'rgb', label: 'RGB GLOW', color: 'rgb(20,20,30)', accent: 'rgb(255,50,255)' },
      { id: 'mono', label: 'MONOCHROME', color: 'rgb(20,20,25)', accent: 'rgb(0,255,65)' },
    ] },
  { id: 'speaker_system', name: 'SPEAKER SYSTEM', category: 'electronics', gridW: 1, gridH: 1, price: 6500, desc: 'High-fidelity speaker system.',
    variants: [
      { id: 'black', label: 'BLACK', color: 'rgb(20,20,25)', accent: 'rgb(60,60,65)' },
      { id: 'wood', label: 'WOOD PANEL', color: 'rgb(100,70,35)', accent: 'rgb(40,40,45)' },
    ] },
  { id: 'mini_fridge', name: 'MINI FRIDGE', category: 'electronics', gridW: 1, gridH: 1, price: 3500, desc: 'Compact refrigerator unit.',
    variants: [
      { id: 'white', label: 'WHITE', color: 'rgb(210,210,215)', accent: 'rgb(180,180,185)' },
      { id: 'black', label: 'BLACK', color: 'rgb(25,25,30)', accent: 'rgb(50,50,55)' },
    ] },
  { id: 'security_panel', name: 'SECURITY PANEL', category: 'electronics', gridW: 1, gridH: 1, price: 8000, desc: 'Home security monitoring panel.',
    wallMounted: true,
    variants: [
      { id: 'black', label: 'BLACK', color: 'rgb(20,20,25)', accent: 'rgb(0,255,65)' },
    ] },
  // ── RUGS ──────────────────────────────────────────────────────────────────
  { id: 'rug_sm', name: 'AREA RUG (S)', category: 'rugs', gridW: 2, gridH: 2, price: 1500, desc: 'Small area rug. Adds warmth to any room.',
    variants: [
      { id: 'red', label: 'RED', color: 'rgba(160,40,40,0.8)', accent: 'rgb(200,50,50)' },
      { id: 'blue', label: 'BLUE', color: 'rgba(30,60,150,0.8)', accent: 'rgb(50,90,200)' },
      { id: 'grey', label: 'GREY', color: 'rgba(90,90,95,0.8)', accent: 'rgb(120,120,125)' },
      { id: 'green', label: 'GREEN', color: 'rgba(30,90,50,0.8)', accent: 'rgb(50,120,70)' },
    ] },
  { id: 'rug_lg', name: 'AREA RUG (L)', category: 'rugs', gridW: 4, gridH: 3, price: 3800, desc: 'Large area rug. Room-defining.',
    variants: [
      { id: 'persian', label: 'PERSIAN', color: 'rgba(120,30,30,0.85)', accent: 'rgb(180,140,50)' },
      { id: 'modern', label: 'MODERN GREY', color: 'rgba(80,80,85,0.85)', accent: 'rgb(150,150,155)' },
      { id: 'teal', label: 'TEAL', color: 'rgba(20,100,110,0.85)', accent: 'rgb(40,160,170)' },
    ] },
  // ── KITCHEN ───────────────────────────────────────────────────────────────
  { id: 'coffee_table', name: 'COFFEE TABLE', category: 'kitchen', gridW: 2, gridH: 1, price: 2000, desc: 'Low coffee table for the lounge area.',
    variants: [
      { id: 'wood', label: 'WOOD', color: 'rgb(120,85,45)', accent: 'rgb(100,70,35)' },
      { id: 'glass', label: 'GLASS', color: 'rgba(180,210,230,0.6)', accent: 'rgb(140,160,165)' },
      { id: 'marble', label: 'MARBLE', color: 'rgb(220,215,210)', accent: 'rgb(180,175,170)' },
    ] },
  { id: 'kitchen_counter', name: 'KITCHEN COUNTER', category: 'kitchen', gridW: 4, gridH: 1, price: 8500, desc: 'Sleek kitchen counter unit with sink.',
    variants: [
      { id: 'white', label: 'WHITE', color: 'rgb(210,210,215)', accent: 'rgb(150,150,155)' },
      { id: 'black', label: 'GRAPHITE', color: 'rgb(40,40,45)', accent: 'rgb(60,60,65)' },
    ] },
  { id: 'dining_table', name: 'DINING TABLE', category: 'kitchen', gridW: 3, gridH: 2, price: 5500, desc: 'A rectangular dining table for four.',
    variants: [
      { id: 'wood', label: 'NATURAL WOOD', color: 'rgb(130,95,50)', accent: 'rgb(100,75,40)' },
      { id: 'black', label: 'BLACK', color: 'rgb(25,25,30)', accent: 'rgb(50,50,55)' },
    ] },
  // ── DECOR ─────────────────────────────────────────────────────────────────
  { id: 'mirror', name: 'FULL MIRROR', category: 'decor', gridW: 1, gridH: 1, price: 2500, desc: 'A full-length standing mirror.',
    variants: [
      { id: 'gold', label: 'GOLD FRAME', color: 'rgba(190,220,230,0.7)', accent: 'rgb(180,140,30)' },
      { id: 'black', label: 'BLACK FRAME', color: 'rgba(190,220,230,0.7)', accent: 'rgb(20,20,25)' },
    ] },
  { id: 'side_table', name: 'SIDE TABLE', category: 'decor', gridW: 1, gridH: 1, price: 1200, desc: 'Small bedside or side table.',
    variants: [
      { id: 'wood', label: 'WOOD', color: 'rgb(130,90,45)', accent: 'rgb(110,75,35)' },
      { id: 'white', label: 'WHITE', color: 'rgb(210,210,215)', accent: 'rgb(190,190,195)' },
    ] },
  { id: 'fireplace', name: 'ELECTRIC FIREPLACE', category: 'decor', gridW: 3, gridH: 1, price: 15000, desc: 'A decorative electric fireplace unit.',
    variants: [
      { id: 'white', label: 'WHITE SURROUND', color: 'rgb(210,210,215)', accent: 'rgb(255,120,30)' },
      { id: 'black', label: 'BLACK SURROUND', color: 'rgb(25,25,30)', accent: 'rgb(255,120,30)' },
      { id: 'stone', label: 'STONE SURROUND', color: 'rgb(140,130,120)', accent: 'rgb(255,120,30)' },
    ] },
  { id: 'trophy_shelf', name: 'TROPHY SHELF', category: 'decor', gridW: 2, gridH: 1, price: 1800, desc: 'A display shelf for trophies and collectibles.',
    wallMounted: true,
    variants: [
      { id: 'gold', label: 'GOLD TRIM', color: 'rgb(100,75,40)', accent: 'rgb(200,160,40)' },
      { id: 'white', label: 'WHITE', color: 'rgb(210,210,215)', accent: 'rgb(160,160,165)' },
    ] },
];

export const FURNITURE_CATALOG_BY_ID: Record<string, FurnitureItemDef> = Object.fromEntries(FURNITURE_CATALOG.map(f => [f.id, f]));

export const HOME_DEFAULT_FURNITURE: PlacedFurnitureItem[] = [
  { id: 'df_0', furnitureId: 'single_bed', variantId: 'blue', gridX: 1, gridY: 1, rotation: 0 },
  { id: 'df_1', furnitureId: 'side_table', variantId: 'wood', gridX: 3, gridY: 1, rotation: 0 },
  { id: 'df_2', furnitureId: 'table_lamp', variantId: 'white', gridX: 3, gridY: 1, rotation: 0 },
  { id: 'df_3', furnitureId: 'writing_desk', variantId: 'oak', gridX: 1, gridY: 6, rotation: 0 },
  { id: 'df_4', furnitureId: 'office_chair', variantId: 'black', gridX: 1, gridY: 8, rotation: 0 },
  { id: 'df_5', furnitureId: 'potted_plant_sm', variantId: 'green', gridX: 6, gridY: 6, rotation: 0 },
  { id: 'df_6', furnitureId: 'storage_box', variantId: 'grey', gridX: 8, gridY: 1, rotation: 0 },
  { id: 'df_7', furnitureId: 'rug_sm', variantId: 'blue', gridX: 1, gridY: 9, rotation: 0 },
];

export interface InteriorObject {
  x: number; y: number; w: number; h: number;
  type: 'bed' | 'desk' | 'chair' | 'nightstand' | 'window' | 'medical_bed' | 'reception' | 'equipment' | 'shelf' | 'counter' | 'table' | 'crate' | 'locker' | 'terminal' | 'plant' | 'couch' | 'vending_machine' | 'filing_cabinet' | 'water_cooler' | 'whiteboard' | 'photocopier' | 'bookshelf' | 'tv_screen' | 'security_gate' | 'flag' | 'portrait' | 'arcade_machine' | 'newspaper' | 'elevator' | 'conference_table' | 'door_lock' | 'server';
  gameId?: string;
  label?: string;
  color?: string;
}
export interface InteriorWorker { x: number; y: number; name: string; role: string; hostile?: boolean; dialogue?: string; }

export interface InteriorDef {
  id: string;
  width: number; height: number;
  wallColor: string; floorColor: string; accentColor: string;
  exitX: number; exitY: number; exitW: number; exitH: number;
  objects: InteriorObject[];
  label: string;
  ambientText?: string;
  workers?: InteriorWorker[];
  buildingSize?: 'small' | 'medium' | 'large' | 'tower';
}

export const INTERIOR_DEFS: Record<string, InteriorDef> = {
  minx_arms: {
    id: 'minx_arms', label: 'MINX ARMS HOTEL — ROOM 408',
    width: 280, height: 220,
    wallColor: 'rgba(20,30,20,.95)', floorColor: 'rgba(8,14,8,.9)', accentColor: 'rgba(0,255,65,.3)',
    exitX: 130, exitY: 205, exitW: 30, exitH: 15,
    ambientText: 'Fluorescent light buzzes. The curtains don\'t fully close. Hotel room. Nightly rate.',
    workers: [
      { x: 180, y: 80, name: 'MAID UNIT', role: 'Cleaning Bot', hostile: false },
    ],
    objects: [
      { x: 20, y: 30, w: 60, h: 35, type: 'bed', label: 'YOUR BED', color: 'rgba(60,80,60,.6)' },
      { x: 90, y: 30, w: 25, h: 20, type: 'nightstand', label: 'NIGHTSTAND', color: 'rgba(50,60,40,.5)' },
      { x: 220, y: 25, w: 45, h: 50, type: 'window', label: 'WINDOW', color: 'rgba(0,40,60,.4)' },
      { x: 20, y: 100, w: 40, h: 30, type: 'desk', label: 'DESK', color: 'rgba(40,50,35,.5)' },
      { x: 20, y: 140, w: 25, h: 25, type: 'chair', color: 'rgba(40,45,35,.4)' },
      { x: 200, y: 150, w: 50, h: 35, type: 'terminal', label: 'PABLO CORP DEVICE', color: 'rgba(0,80,30,.4)' },
      { x: 130, y: 30, w: 30, h: 20, type: 'shelf', label: 'SHELF', color: 'rgba(45,55,40,.4)' },
      { x: 105, y: 195, w: 50, h: 15, type: 'door_lock', label: 'DOOR LOCK', color: 'rgba(0,200,100,.35)' },
    ],
  },
  clinic: {
    id: 'clinic', label: 'CITY CLINIC — EMERGENCY WARD',
    width: 320, height: 240,
    wallColor: 'rgba(20,25,30,.95)', floorColor: 'rgba(10,14,18,.9)', accentColor: 'rgba(100,200,255,.3)',
    exitX: 145, exitY: 225, exitW: 30, exitH: 15,
    ambientText: 'Monitors beep steadily. The antiseptic smell is overwhelming.',
    workers: [
      { x: 60, y: 50, name: 'DR. VOSS', role: 'Physician', hostile: false },
      { x: 200, y: 100, name: 'NURSE KAI', role: 'Nurse', hostile: false },
    ],
    objects: [
      { x: 20, y: 30, w: 55, h: 30, type: 'reception', label: 'RECEPTION', color: 'rgba(60,80,100,.5)' },
      { x: 20, y: 90, w: 50, h: 25, type: 'medical_bed', label: 'BED A', color: 'rgba(80,100,120,.5)' },
      { x: 20, y: 130, w: 50, h: 25, type: 'medical_bed', label: 'BED B', color: 'rgba(80,100,120,.5)' },
      { x: 20, y: 170, w: 50, h: 25, type: 'medical_bed', label: 'BED C', color: 'rgba(80,100,120,.5)' },
      { x: 240, y: 30, w: 55, h: 40, type: 'equipment', label: 'MED EQUIPMENT', color: 'rgba(50,100,80,.4)' },
      { x: 240, y: 90, w: 55, h: 30, type: 'equipment', label: 'VITAL MONITOR', color: 'rgba(50,100,80,.4)' },
      { x: 240, y: 140, w: 55, h: 30, type: 'locker', label: 'SUPPLY LOCKER', color: 'rgba(60,70,80,.5)' },
      { x: 130, y: 30, w: 60, h: 25, type: 'counter', label: 'TRIAGE COUNTER', color: 'rgba(70,80,90,.5)' },
      { x: 130, y: 170, w: 40, h: 30, type: 'terminal', label: 'MED TERMINAL', color: 'rgba(0,80,60,.4)' },
    ],
  },
  arcade: {
    id: 'arcade', label: 'PIXEL ARCADE — GAME FLOOR',
    width: 340, height: 260,
    wallColor: 'rgba(10,5,20,.95)', floorColor: 'rgba(5,3,12,.9)', accentColor: 'rgba(255,0,255,.3)',
    exitX: 155, exitY: 245, exitW: 30, exitH: 15,
    ambientText: 'Neon hums. Screens flicker. Insert FIAT to play.',
    objects: [
      { x: 20, y: 25, w: 40, h: 55, type: 'arcade_machine' as const, label: 'CYBER SERPENT', color: 'rgba(0,255,65,.5)', gameId: 'cyber_serpent' },
      { x: 80, y: 25, w: 40, h: 55, type: 'arcade_machine' as const, label: 'VOID INVADERS', color: 'rgba(255,60,60,.5)', gameId: 'void_invaders' },
      { x: 220, y: 25, w: 40, h: 55, type: 'arcade_machine' as const, label: 'BARREL RUNNER', color: 'rgba(255,170,0,.5)', gameId: 'barrel_runner' },
      { x: 280, y: 25, w: 40, h: 55, type: 'arcade_machine' as const, label: 'NEON BREAKER', color: 'rgba(255,60,255,.5)', gameId: 'neon_breaker' },
      { x: 140, y: 30, w: 60, h: 40, type: 'counter' as const, label: 'PRIZE COUNTER', color: 'rgba(80,60,40,.5)' },
      { x: 20, y: 120, w: 35, h: 50, type: 'couch' as const, label: 'SEAT', color: 'rgba(60,30,60,.4)' },
      { x: 285, y: 120, w: 35, h: 50, type: 'couch' as const, label: 'SEAT', color: 'rgba(60,30,60,.4)' },
      { x: 140, y: 180, w: 60, h: 30, type: 'vending_machine' as const, label: 'SNACKS', color: 'rgba(40,80,40,.4)' },
    ],
  },
  _shop: {
    id: '_shop', label: 'SHOP INTERIOR',
    width: 260, height: 200,
    wallColor: 'rgba(25,30,20,.95)', floorColor: 'rgba(10,14,8,.9)', accentColor: 'rgba(255,200,60,.25)',
    exitX: 115, exitY: 185, exitW: 30, exitH: 15,
    ambientText: 'Goods line the walls. The register hums.',
    workers: [{ x: 60, y: 45, name: 'SHOPKEEP', role: 'Cashier', hostile: false }],
    objects: [
      { x: 20, y: 25, w: 80, h: 20, type: 'counter', label: 'COUNTER', color: 'rgba(80,70,40,.5)' },
      { x: 20, y: 60, w: 30, h: 60, type: 'shelf', label: 'SHELF A', color: 'rgba(60,55,35,.4)' },
      { x: 60, y: 60, w: 30, h: 60, type: 'shelf', label: 'SHELF B', color: 'rgba(60,55,35,.4)' },
      { x: 190, y: 25, w: 45, h: 30, type: 'terminal', label: 'REGISTER', color: 'rgba(0,80,30,.4)' },
      { x: 190, y: 70, w: 45, h: 50, type: 'crate', label: 'STOCK', color: 'rgba(50,50,30,.4)' },
      { x: 120, y: 140, w: 30, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
    ],
  },
  _office: {
    id: '_office', label: 'OFFICE INTERIOR',
    width: 340, height: 260,
    wallColor: 'rgba(20,22,30,.95)', floorColor: 'rgba(8,10,16,.9)', accentColor: 'rgba(0,200,255,.2)',
    exitX: 155, exitY: 245, exitW: 30, exitH: 15,
    ambientText: 'Terminal screens glow. Conference room in the back. The air conditioning is too cold.',
    workers: [{ x: 60, y: 50, name: 'OFFICER', role: 'Staff', hostile: false }],
    objects: [
      { x: 20, y: 30, w: 50, h: 30, type: 'desk', label: 'DESK 1', color: 'rgba(50,55,70,.5)' },
      { x: 20, y: 80, w: 50, h: 30, type: 'desk', label: 'DESK 2', color: 'rgba(50,55,70,.5)' },
      { x: 20, y: 130, w: 50, h: 30, type: 'desk', label: 'DESK 3', color: 'rgba(50,55,70,.5)' },
      { x: 260, y: 30, w: 55, h: 40, type: 'terminal', label: 'MAIN TERMINAL', color: 'rgba(0,60,80,.4)' },
      { x: 260, y: 90, w: 55, h: 30, type: 'locker', label: 'FILE CABINET', color: 'rgba(50,55,65,.5)' },
      { x: 100, y: 30, w: 120, h: 70, type: 'conference_table', label: 'CONFERENCE ROOM', color: 'rgba(45,55,75,.5)' },
      { x: 105, y: 32, w: 100, h: 12, type: 'whiteboard', label: 'WHITEBOARD', color: 'rgba(200,200,200,.15)' },
      { x: 225, y: 32, w: 30, h: 22, type: 'tv_screen', label: 'DISPLAY', color: 'rgba(0,50,100,.4)' },
      { x: 100, y: 130, w: 55, h: 28, type: 'couch', label: 'BREAK AREA', color: 'rgba(60,50,70,.4)' },
      { x: 260, y: 140, w: 45, h: 35, type: 'vending_machine', label: 'COFFEE', color: 'rgba(60,40,20,.5)' },
      { x: 20, y: 200, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
      { x: 260, y: 200, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
    ],
  },
  admin_bureau: {
    id: 'admin_bureau', label: 'MINX ADMINISTRATION BUILDING — LOBBY',
    width: 380, height: 280,
    wallColor: 'rgba(18,20,28,.95)', floorColor: 'rgba(6,8,14,.9)', accentColor: 'rgba(255,200,60,.25)',
    exitX: 175, exitY: 265, exitW: 30, exitH: 15,
    ambientText: 'Bureaucrats shuffle papers. The queue never ends.',
    workers: [
      { x: 50, y: 45, name: 'CLERK DARA', role: 'Admin Clerk', hostile: false },
      { x: 200, y: 80, name: 'OFFICER KELL', role: 'Registry Officer', hostile: false },
    ],
    objects: [
      { x: 20, y: 25, w: 70, h: 25, type: 'reception', label: 'FRONT DESK', color: 'rgba(70,65,40,.5)' },
      { x: 20, y: 65, w: 55, h: 30, type: 'desk', label: 'CLERK STATION A', color: 'rgba(55,55,45,.5)' },
      { x: 20, y: 110, w: 55, h: 30, type: 'desk', label: 'CLERK STATION B', color: 'rgba(55,55,45,.5)' },
      { x: 100, y: 25, w: 50, h: 20, type: 'security_gate', label: 'SECURITY CHECK', color: 'rgba(80,60,30,.4)' },
      { x: 290, y: 25, w: 65, h: 35, type: 'terminal', label: 'REGISTRATION KIOSK', color: 'rgba(0,80,50,.4)' },
      { x: 290, y: 75, w: 65, h: 30, type: 'filing_cabinet', label: 'RECORDS', color: 'rgba(50,55,50,.5)' },
      { x: 290, y: 120, w: 65, h: 30, type: 'filing_cabinet', label: 'ARCHIVES', color: 'rgba(50,55,50,.5)' },
      { x: 170, y: 65, w: 60, h: 25, type: 'couch', label: 'WAITING AREA', color: 'rgba(50,45,30,.4)' },
      { x: 170, y: 100, w: 40, h: 20, type: 'table', label: 'FORMS TABLE', color: 'rgba(55,50,40,.4)' },
      { x: 20, y: 170, w: 45, h: 40, type: 'vending_machine', label: 'VENDING', color: 'rgba(40,80,40,.4)' },
      { x: 290, y: 170, w: 30, h: 30, type: 'water_cooler', label: 'WATER', color: 'rgba(40,60,80,.3)' },
      { x: 170, y: 220, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
      { x: 110, y: 25, w: 40, h: 65, type: 'flag', label: 'CITY FLAG', color: 'rgba(80,60,20,.3)' },
    ],
  },
  police_hq: {
    id: 'police_hq', label: 'POLICE HEADQUARTERS — PRECINCT 1',
    width: 400, height: 300,
    wallColor: 'rgba(15,18,25,.95)', floorColor: 'rgba(5,8,14,.9)', accentColor: 'rgba(100,150,255,.25)',
    exitX: 185, exitY: 285, exitW: 30, exitH: 15,
    ambientText: 'Radios crackle. Wanted posters line the walls. Coffee is always old.',
    workers: [
      { x: 60, y: 50, name: 'SGT. MORROW', role: 'Desk Sergeant', hostile: false },
      { x: 250, y: 90, name: 'DET. YASHIDA', role: 'Detective', hostile: false },
    ],
    objects: [
      { x: 20, y: 25, w: 75, h: 28, type: 'reception', label: 'INTAKE DESK', color: 'rgba(50,55,80,.5)' },
      { x: 20, y: 70, w: 55, h: 28, type: 'desk', label: 'OFFICER DESK 1', color: 'rgba(45,50,70,.5)' },
      { x: 20, y: 115, w: 55, h: 28, type: 'desk', label: 'OFFICER DESK 2', color: 'rgba(45,50,70,.5)' },
      { x: 20, y: 160, w: 55, h: 28, type: 'desk', label: 'DETECTIVE DESK', color: 'rgba(45,50,70,.5)' },
      { x: 110, y: 25, w: 50, h: 20, type: 'security_gate', label: 'METAL DETECTOR', color: 'rgba(80,80,100,.4)' },
      { x: 300, y: 25, w: 75, h: 35, type: 'terminal', label: 'DISPATCH TERMINAL', color: 'rgba(0,50,100,.4)' },
      { x: 300, y: 75, w: 75, h: 30, type: 'tv_screen', label: 'SURVEILLANCE FEED', color: 'rgba(0,40,80,.4)' },
      { x: 300, y: 120, w: 75, h: 30, type: 'locker', label: 'EVIDENCE LOCKER', color: 'rgba(50,50,65,.5)' },
      { x: 300, y: 165, w: 75, h: 30, type: 'locker', label: 'ARMORY CAGE', color: 'rgba(60,50,50,.5)' },
      { x: 170, y: 70, w: 60, h: 25, type: 'whiteboard', label: 'CASE BOARD', color: 'rgba(80,80,90,.4)' },
      { x: 170, y: 110, w: 50, h: 30, type: 'table', label: 'BRIEFING TABLE', color: 'rgba(45,50,60,.4)' },
      { x: 20, y: 220, w: 45, h: 35, type: 'vending_machine', label: 'COFFEE MACHINE', color: 'rgba(60,40,20,.4)' },
      { x: 100, y: 220, w: 60, h: 28, type: 'couch', label: 'WAITING BENCH', color: 'rgba(40,40,55,.4)' },
      { x: 300, y: 220, w: 30, h: 25, type: 'photocopier', label: 'COPIER', color: 'rgba(50,55,60,.4)' },
    ],
  },
  realestate_office: {
    id: 'realestate_office', label: `${CITY_NAME} REAL ESTATE — LISTINGS FLOOR`,
    width: 340, height: 260,
    wallColor: 'rgba(22,18,28,.95)', floorColor: 'rgba(10,8,16,.9)', accentColor: 'rgba(200,100,255,.25)',
    exitX: 155, exitY: 245, exitW: 30, exitH: 15,
    ambientText: 'Property maps cover every surface. A broker adjusts her collar.',
    workers: [{ x: 50, y: 45, name: 'AGENT VALE', role: 'Real Estate Broker', hostile: false }],
    objects: [
      { x: 20, y: 25, w: 70, h: 25, type: 'reception', label: 'AGENT DESK', color: 'rgba(80,50,90,.5)' },
      { x: 20, y: 65, w: 50, h: 30, type: 'desk', label: 'BROKER STATION', color: 'rgba(60,45,70,.5)' },
      { x: 260, y: 25, w: 55, h: 40, type: 'terminal', label: 'LISTINGS TERMINAL', color: 'rgba(80,0,100,.4)' },
      { x: 260, y: 80, w: 55, h: 30, type: 'filing_cabinet', label: 'DEED RECORDS', color: 'rgba(55,45,60,.5)' },
      { x: 260, y: 125, w: 55, h: 30, type: 'filing_cabinet', label: 'CONTRACTS', color: 'rgba(55,45,60,.5)' },
      { x: 140, y: 25, w: 70, h: 45, type: 'whiteboard', label: 'PROPERTY MAP', color: 'rgba(90,80,100,.4)' },
      { x: 20, y: 115, w: 60, h: 25, type: 'couch', label: 'CLIENT SEATING', color: 'rgba(60,40,60,.4)' },
      { x: 140, y: 85, w: 50, h: 20, type: 'table', label: 'SIGNING TABLE', color: 'rgba(55,50,60,.4)' },
      { x: 20, y: 180, w: 45, h: 35, type: 'vending_machine', label: 'REFRESHMENTS', color: 'rgba(40,60,80,.4)' },
      { x: 260, y: 180, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
      { x: 140, y: 200, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
    ],
  },
  nexus_hub: {
      id: 'nexus_hub', label: 'NEXUS HUB — CO-WORKING SPACE',
      width: 320, height: 240,
      wallColor: 'rgba(15,20,25,.95)', floorColor: 'rgba(8,12,18,.9)', accentColor: 'rgba(0,200,255,.25)',
      exitX: 145, exitY: 225, exitW: 30, exitH: 15,
      ambientText: 'Open floor plan. Shared desks and private booths. Coffee machine hums.',
      workers: [{ x: 60, y: 45, name: 'HOST', role: 'Space Manager', hostile: false }],
      objects: [
        { x: 20, y: 25, w: 70, h: 25, type: 'reception', label: 'FRONT DESK', color: 'rgba(0,120,180,.4)' },
        { x: 20, y: 65, w: 50, h: 28, type: 'desk', label: 'HOT DESK A', color: 'rgba(45,60,80,.5)' },
        { x: 20, y: 110, w: 50, h: 28, type: 'desk', label: 'HOT DESK B', color: 'rgba(45,60,80,.5)' },
        { x: 20, y: 155, w: 50, h: 28, type: 'desk', label: 'HOT DESK C', color: 'rgba(45,60,80,.5)' },
        { x: 240, y: 25, w: 55, h: 40, type: 'terminal', label: 'MEETING ROOM', color: 'rgba(0,80,120,.4)' },
        { x: 240, y: 80, w: 55, h: 35, type: 'whiteboard', label: 'WHITEBOARD', color: 'rgba(200,200,200,.15)' },
        { x: 240, y: 130, w: 55, h: 35, type: 'couch', label: 'LOUNGE AREA', color: 'rgba(60,50,80,.4)' },
        { x: 130, y: 25, w: 60, h: 25, type: 'counter', label: 'COFFEE BAR', color: 'rgba(80,60,40,.5)' },
        { x: 130, y: 65, w: 50, h: 28, type: 'desk', label: 'PRIVATE BOOTH 1', color: 'rgba(45,60,80,.5)' },
        { x: 130, y: 110, w: 50, h: 28, type: 'desk', label: 'PRIVATE BOOTH 2', color: 'rgba(45,60,80,.5)' },
        { x: 240, y: 180, w: 35, h: 30, type: 'vending_machine', label: 'SNACK STATION', color: 'rgba(40,60,50,.4)' },
        { x: 20, y: 195, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
        { x: 130, y: 155, w: 28, h: 25, type: 'water_cooler', label: 'WATER', color: 'rgba(40,60,80,.3)' },
      ],
    },
    gold_exchange: {
    id: 'gold_exchange', label: 'GOLD EXCHANGE — TRADING FLOOR',
    width: 320, height: 240,
    wallColor: 'rgba(25,22,15,.95)', floorColor: 'rgba(12,10,6,.9)', accentColor: 'rgba(255,200,60,.3)',
    exitX: 145, exitY: 225, exitW: 30, exitH: 15,
    ambientText: 'Gold tickers flash. The vault hum is constant.',
    workers: [{ x: 60, y: 45, name: 'BROKER SATO', role: 'Gold Trader', hostile: false }],
    objects: [
      { x: 20, y: 25, w: 70, h: 25, type: 'reception', label: 'TELLER WINDOW', color: 'rgba(80,70,30,.5)' },
      { x: 20, y: 65, w: 50, h: 30, type: 'desk', label: 'EXCHANGE DESK', color: 'rgba(70,60,25,.5)' },
      { x: 240, y: 25, w: 55, h: 35, type: 'terminal', label: 'RATE TERMINAL', color: 'rgba(100,80,0,.4)' },
      { x: 240, y: 75, w: 55, h: 30, type: 'tv_screen', label: 'PRICE TICKER', color: 'rgba(80,60,0,.4)' },
      { x: 240, y: 120, w: 55, h: 40, type: 'locker', label: 'VAULT DOOR', color: 'rgba(80,70,30,.5)' },
      { x: 120, y: 25, w: 60, h: 25, type: 'security_gate', label: 'SECURITY', color: 'rgba(80,70,20,.4)' },
      { x: 120, y: 65, w: 50, h: 25, type: 'couch', label: 'WAITING', color: 'rgba(60,50,20,.4)' },
      { x: 20, y: 160, w: 30, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
    ],
  },
  oxide_labs: {
    id: 'oxide_labs', label: 'OXIDE LABS — RESEARCH WING',
    width: 380, height: 280,
    wallColor: 'rgba(12,18,22,.97)', floorColor: 'rgba(5,8,12,.95)', accentColor: 'rgba(0,200,255,.3)',
    exitX: 175, exitY: 265, exitW: 30, exitH: 15,
    ambientText: 'Fluorescent hum. Research logs transmit to Floor 40. The walls know something.',
    workers: [
      { x: 60, y: 50, name: 'DR. CHEN', role: 'Lead Researcher', hostile: false },
      { x: 200, y: 80, name: 'TECH RORI', role: 'Lab Technician', hostile: false },
    ],
    objects: [
      { x: 20, y: 25, w: 70, h: 25, type: 'reception', label: 'LAB RECEPTION', color: 'rgba(0,100,160,.5)' },
      { x: 20, y: 65, w: 55, h: 30, type: 'desk', label: 'RESEARCH DESK A', color: 'rgba(30,55,80,.5)' },
      { x: 20, y: 110, w: 55, h: 30, type: 'desk', label: 'RESEARCH DESK B', color: 'rgba(30,55,80,.5)' },
      { x: 20, y: 155, w: 55, h: 30, type: 'equipment', label: 'CHEM ANALYZER', color: 'rgba(0,80,120,.4)' },
      { x: 100, y: 25, w: 80, h: 60, type: 'counter', label: 'LAB BENCH', color: 'rgba(20,40,60,.5)' },
      { x: 100, y: 100, w: 60, h: 40, type: 'server', label: 'DATA SERVERS', color: 'rgba(0,60,100,.4)' },
      { x: 100, y: 155, w: 80, h: 50, type: 'equipment', label: 'MIXING STATION', color: 'rgba(0,80,120,.4)' },
      { x: 210, y: 25, w: 80, h: 70, type: 'terminal', label: 'RESEARCH TERMINAL', color: 'rgba(0,180,255,.35)' },
      { x: 310, y: 25, w: 50, h: 50, type: 'elevator', label: 'ELEVATOR', color: 'rgba(30,60,100,.6)' },
      { x: 210, y: 110, w: 55, h: 30, type: 'tv_screen', label: 'RESEARCH DISPLAY', color: 'rgba(0,60,100,.4)' },
      { x: 210, y: 155, w: 55, h: 35, type: 'locker', label: 'SAMPLE VAULT', color: 'rgba(25,50,75,.5)' },
      { x: 310, y: 100, w: 50, h: 35, type: 'filing_cabinet', label: 'COMPOUND LOG', color: 'rgba(30,50,70,.5)' },
      { x: 310, y: 155, w: 40, h: 30, type: 'vending_machine', label: 'CHEM DISPENSER', color: 'rgba(0,80,120,.4)' },
      { x: 20, y: 210, w: 25, h: 25, type: 'plant', color: 'rgba(0,80,100,.3)' },
      { x: 310, y: 210, w: 25, h: 25, type: 'plant', color: 'rgba(0,80,100,.3)' },
    ],
  },
  picassoo_hq: {
    id: 'picassoo_hq', label: 'PICASSOO.AI — HEADQUARTERS',
    width: 340, height: 260,
    wallColor: 'rgba(18,12,28,.95)', floorColor: 'rgba(10,6,18,.9)', accentColor: 'rgba(180,80,255,.25)',
    exitX: 155, exitY: 245, exitW: 30, exitH: 15,
    ambientText: 'Holographic art swirls on every wall. Servers hum behind frosted glass.',
    workers: [
      { x: 70, y: 50, name: 'ARIA CHEN', role: 'Lead Engineer', hostile: false },
      { x: 200, y: 80, name: 'DEV-K', role: 'AI Researcher', hostile: false },
      { x: 150, y: 140, name: 'RECEPTIONIST', role: 'Front Desk', hostile: false },
    ],
    objects: [
      { x: 20, y: 25, w: 70, h: 28, type: 'reception', label: 'RECEPTION DESK', color: 'rgba(120,60,180,.5)' },
      { x: 20, y: 70, w: 55, h: 30, type: 'terminal', label: 'AI DEMO STATION', color: 'rgba(100,40,160,.5)' },
      { x: 20, y: 115, w: 55, h: 30, type: 'desk', label: 'ENGINEERING BAY', color: 'rgba(80,30,140,.5)' },
      { x: 260, y: 25, w: 55, h: 40, type: 'server', label: 'GPU CLUSTER', color: 'rgba(60,20,100,.6)' },
      { x: 260, y: 80, w: 55, h: 35, type: 'terminal', label: 'MODEL DASHBOARD', color: 'rgba(100,40,160,.4)' },
      { x: 260, y: 130, w: 55, h: 30, type: 'tv_screen', label: 'GALLERY DISPLAY', color: 'rgba(120,60,200,.4)' },
      { x: 130, y: 25, w: 60, h: 25, type: 'couch', label: 'CREATOR LOUNGE', color: 'rgba(80,40,120,.4)' },
      { x: 130, y: 65, w: 50, h: 25, type: 'whiteboard', label: 'ROADMAP BOARD', color: 'rgba(200,200,200,.15)' },
      { x: 20, y: 200, w: 25, h: 25, type: 'plant', color: 'rgba(60,30,90,.3)' },
      { x: 280, y: 200, w: 25, h: 25, type: 'plant', color: 'rgba(60,30,90,.3)' },
    ],
  },
  megabank: {
    id: 'megabank', label: 'BANCO OMBRA — MAIN FLOOR',
    width: 340, height: 260,
    wallColor: 'rgba(16,18,24,.95)', floorColor: 'rgba(6,8,12,.9)', accentColor: 'rgba(180,200,255,.2)',
    exitX: 155, exitY: 245, exitW: 30, exitH: 15,
    ambientText: 'Marble floors. Armed guards. The kind of quiet only money buys.',
    workers: [
      { x: 60, y: 45, name: 'TELLER', role: 'Bank Teller', hostile: false },
      { x: 200, y: 100, name: 'GUARD', role: 'Security', hostile: false },
    ],
    objects: [
      { x: 20, y: 25, w: 75, h: 28, type: 'reception', label: 'TELLER ROW', color: 'rgba(60,65,80,.5)' },
      { x: 20, y: 70, w: 55, h: 25, type: 'desk', label: 'ACCOUNTS DESK', color: 'rgba(50,55,70,.5)' },
      { x: 20, y: 110, w: 55, h: 25, type: 'desk', label: 'LOANS DESK', color: 'rgba(50,55,70,.5)' },
      { x: 270, y: 25, w: 50, h: 50, type: 'elevator', label: 'ELEVATOR', color: 'rgba(80,85,100,.6)' },
      { x: 270, y: 90, w: 50, h: 35, type: 'locker', label: 'SAFE DEPOSIT', color: 'rgba(60,60,70,.5)' },
      { x: 270, y: 140, w: 50, h: 30, type: 'security_gate', label: 'VAULT GATE', color: 'rgba(80,80,90,.4)' },
      { x: 140, y: 25, w: 60, h: 25, type: 'couch', label: 'VIP LOUNGE', color: 'rgba(50,45,60,.4)' },
      { x: 140, y: 65, w: 50, h: 20, type: 'table', label: 'DOCUMENTS TABLE', color: 'rgba(45,50,60,.4)' },
      { x: 140, y: 100, w: 55, h: 35, type: 'terminal', label: 'ATM', color: 'rgba(0,50,100,.4)' },
      { x: 20, y: 180, w: 30, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
      { x: 260, y: 180, w: 30, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
      { x: 140, y: 100, w: 28, h: 25, type: 'water_cooler', label: 'WATER', color: 'rgba(40,60,80,.3)' },
    ],
  },
  dojo: {
    id: 'dojo', label: 'IRON DOJO — TRAINING HALL',
    width: 340, height: 260,
    wallColor: 'rgba(25,18,15,.95)', floorColor: 'rgba(14,8,6,.9)', accentColor: 'rgba(255,100,60,.25)',
    exitX: 155, exitY: 245, exitW: 30, exitH: 15,
    ambientText: 'Sweat and iron. The mats are stained. Someone is always training.',
    workers: [
      { x: 70, y: 80, name: 'SENSEI', role: 'Instructor', hostile: false },
      { x: 200, y: 100, name: 'FIGHTER', role: 'Sparring', hostile: false },
    ],
    objects: [
      { x: 20, y: 25, w: 50, h: 25, type: 'reception', label: 'SIGN-IN', color: 'rgba(80,50,30,.5)' },
      { x: 260, y: 25, w: 55, h: 40, type: 'locker', label: 'GEAR LOCKERS', color: 'rgba(60,40,30,.5)' },
      { x: 260, y: 80, w: 55, h: 30, type: 'equipment', label: 'WEIGHTS', color: 'rgba(70,50,30,.4)' },
      { x: 260, y: 125, w: 55, h: 30, type: 'equipment', label: 'HEAVY BAG', color: 'rgba(70,50,30,.4)' },
      { x: 20, y: 80, w: 50, h: 30, type: 'equipment', label: 'PRACTICE DUMMIES', color: 'rgba(70,50,30,.4)' },
      { x: 20, y: 130, w: 50, h: 30, type: 'shelf', label: 'WEAPONS RACK', color: 'rgba(60,40,25,.4)' },
      { x: 140, y: 25, w: 70, h: 25, type: 'whiteboard', label: 'TECHNIQUE CHART', color: 'rgba(80,60,40,.4)' },
      { x: 20, y: 200, w: 30, h: 25, type: 'water_cooler', label: 'WATER', color: 'rgba(40,60,80,.3)' },
      { x: 260, y: 200, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
    ],
  },
  nightclub: {
    id: 'nightclub', label: 'CLUB NEON — MAIN FLOOR',
    width: 320, height: 240,
    wallColor: 'rgba(15,8,25,.95)', floorColor: 'rgba(6,3,14,.9)', accentColor: 'rgba(255,0,200,.3)',
    exitX: 145, exitY: 225, exitW: 30, exitH: 15,
    ambientText: 'Bass thumps through the floor. Neon pink washes everything.',
    workers: [
      { x: 50, y: 45, name: 'BARTENDER', role: 'Bar Staff', hostile: false },
      { x: 200, y: 50, name: 'DJ PULSE', role: 'DJ', hostile: false },
    ],
    objects: [
      { x: 20, y: 25, w: 60, h: 25, type: 'counter', label: 'BAR', color: 'rgba(100,20,80,.5)' },
      { x: 20, y: 65, w: 40, h: 30, type: 'couch', label: 'VIP BOOTH', color: 'rgba(80,10,60,.4)' },
      { x: 20, y: 110, w: 40, h: 30, type: 'couch', label: 'BOOTH 2', color: 'rgba(80,10,60,.4)' },
      { x: 250, y: 25, w: 50, h: 50, type: 'elevator', label: 'ELEVATOR', color: 'rgba(90,30,80,.6)' },
      { x: 250, y: 90, w: 50, h: 30, type: 'tv_screen', label: 'HOLO DISPLAY', color: 'rgba(100,0,120,.4)' },
      { x: 140, y: 25, w: 50, h: 20, type: 'table', label: 'DANCE FLOOR', color: 'rgba(60,0,80,.3)' },
      { x: 140, y: 60, w: 50, h: 30, type: 'terminal', label: 'DJ BOOTH', color: 'rgba(80,0,100,.4)' },
      { x: 250, y: 160, w: 30, h: 25, type: 'vending_machine', label: 'DRINK DISPENSER', color: 'rgba(80,20,60,.4)' },
    ],
  },
  armory: {
    id: 'armory', label: 'ARMORY — WEAPONS DEPOT',
    width: 320, height: 240,
    wallColor: 'rgba(20,18,15,.95)', floorColor: 'rgba(10,8,6,.9)', accentColor: 'rgba(255,80,40,.25)',
    exitX: 145, exitY: 225, exitW: 30, exitH: 15,
    ambientText: 'Gun oil and cordite. Every surface is reinforced steel.',
    workers: [{ x: 50, y: 45, name: 'DEALER', role: 'Arms Dealer', hostile: false }],
    objects: [
      { x: 20, y: 25, w: 60, h: 25, type: 'counter', label: 'SALES COUNTER', color: 'rgba(80,50,30,.5)' },
      { x: 20, y: 65, w: 50, h: 60, type: 'shelf', label: 'RIFLES', color: 'rgba(70,40,25,.4)' },
      { x: 240, y: 25, w: 55, h: 60, type: 'shelf', label: 'PISTOLS', color: 'rgba(70,40,25,.4)' },
      { x: 240, y: 100, w: 55, h: 40, type: 'locker', label: 'AMMO LOCKER', color: 'rgba(60,40,25,.5)' },
      { x: 130, y: 25, w: 60, h: 30, type: 'crate', label: 'CRATE — HEAVY ORD.', color: 'rgba(55,35,20,.4)' },
      { x: 130, y: 70, w: 60, h: 30, type: 'crate', label: 'CRATE — EXPLOSIVES', color: 'rgba(55,35,20,.4)' },
      { x: 20, y: 160, w: 45, h: 35, type: 'terminal', label: 'INVENTORY SYSTEM', color: 'rgba(0,60,40,.4)' },
    ],
  },
  hotel: {
    id: 'hotel', label: 'HOTEL NEON — LOBBY',
    width: 320, height: 240,
    wallColor: 'rgba(18,15,22,.95)', floorColor: 'rgba(8,6,12,.9)', accentColor: 'rgba(255,160,60,.25)',
    exitX: 145, exitY: 225, exitW: 30, exitH: 15,
    ambientText: 'The lobby is warm. Elevator music plays from a broken speaker.',
    workers: [{ x: 90, y: 50, name: 'CLERK', role: 'Hotel Clerk', hostile: false }],
    objects: [
      { x: 20, y: 25, w: 70, h: 25, type: 'reception', label: 'FRONT DESK', color: 'rgba(70,55,40,.5)' },
      { x: 20, y: 65, w: 55, h: 30, type: 'couch', label: 'LOBBY SEATING', color: 'rgba(60,45,30,.4)' },
      { x: 20, y: 110, w: 55, h: 30, type: 'couch', label: 'READING NOOK', color: 'rgba(60,45,30,.4)' },
      { x: 250, y: 25, w: 50, h: 50, type: 'elevator', label: 'ELEVATOR', color: 'rgba(80,75,65,.6)' },
      { x: 140, y: 25, w: 50, h: 20, type: 'table', label: 'CONCIERGE TABLE', color: 'rgba(55,45,35,.4)' },
      { x: 250, y: 100, w: 50, h: 30, type: 'locker', label: 'LUGGAGE HOLD', color: 'rgba(50,40,35,.5)' },
      { x: 250, y: 160, w: 45, h: 35, type: 'vending_machine', label: 'SNACK MACHINE', color: 'rgba(40,60,50,.4)' },
      { x: 20, y: 180, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
      { x: 140, y: 180, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
      { x: 240, y: 120, w: 28, h: 25, type: 'water_cooler', label: 'WATER', color: 'rgba(40,60,80,.3)' },
    ],
  },
  machine_bunker: {
    id: 'machine_bunker', label: 'MACHINE BUNKER — SUB-LEVEL 1',
    width: 380, height: 300,
    wallColor: 'rgba(12,14,20,.95)', floorColor: 'rgba(4,6,10,.9)', accentColor: 'rgba(80,120,255,.25)',
    exitX: 175, exitY: 285, exitW: 30, exitH: 15,
    ambientText: 'Hydraulic hiss. Blue diode strips along the floor. Coolant and ozone. Packed with replicants, refugees, and displaced workers sleeping on every surface.',
    workers: [
      { x: 100, y: 50, name: 'UNIT-7', role: 'Maintenance Drone', hostile: false },
      { x: 50, y: 110, name: 'REPLICANT-K9', role: 'Refugee', hostile: false },
      { x: 200, y: 50, name: 'SYNTHIA', role: 'Medic Unit', hostile: false },
      { x: 290, y: 90, name: 'BOLT', role: 'Salvage Worker', hostile: false },
      { x: 50, y: 170, name: 'SHELL', role: 'Displaced Replicant', hostile: false },
      { x: 150, y: 130, name: 'VERA QUINN', role: 'Human Refugee', hostile: false },
      { x: 280, y: 170, name: 'JACKS', role: 'Scrap Dealer', hostile: false },
      { x: 150, y: 220, name: 'AXE', role: 'Guard', hostile: false },
      { x: 50, y: 240, name: 'SLEEPER', role: 'Vagrant', hostile: false },
      { x: 280, y: 240, name: 'WREN', role: 'Engineer', hostile: false },
    ],
    objects: [
      { x: 20, y: 25, w: 60, h: 35, type: 'equipment', label: 'RECHARGE BAY', color: 'rgba(40,60,120,.5)' },
      { x: 20, y: 80, w: 60, h: 35, type: 'equipment', label: 'DIAGNOSTIC RIG', color: 'rgba(40,60,120,.5)' },
      { x: 20, y: 135, w: 60, h: 30, type: 'medical_bed', label: 'REPAIR SLAB', color: 'rgba(50,70,110,.5)' },
      { x: 20, y: 185, w: 60, h: 25, type: 'bed', label: 'SLEEP POD ROW', color: 'rgba(30,40,70,.5)' },
      { x: 300, y: 25, w: 55, h: 40, type: 'terminal', label: 'CORE TERMINAL', color: 'rgba(0,50,120,.5)' },
      { x: 300, y: 80, w: 55, h: 35, type: 'locker', label: 'PARTS LOCKER', color: 'rgba(40,50,70,.5)' },
      { x: 300, y: 135, w: 55, h: 30, type: 'crate', label: 'COOLANT SUPPLY', color: 'rgba(30,50,80,.4)' },
      { x: 300, y: 185, w: 55, h: 25, type: 'bed', label: 'SLEEP POD ROW', color: 'rgba(30,40,70,.5)' },
      { x: 140, y: 25, w: 60, h: 25, type: 'table', label: 'WORK BENCH', color: 'rgba(35,45,60,.4)' },
      { x: 140, y: 70, w: 60, h: 25, type: 'counter', label: 'MESS COUNTER', color: 'rgba(35,45,60,.4)' },
      { x: 140, y: 180, w: 50, h: 25, type: 'crate', label: 'SALVAGE BIN', color: 'rgba(30,40,55,.4)' },
      { x: 140, y: 120, w: 40, h: 25, type: 'water_cooler', label: 'WATER STATION', color: 'rgba(40,60,80,.3)' },
    ],
  },
  _lobby: {
    id: '_lobby', label: 'LOBBY',
    width: 380, height: 280,
    wallColor: 'rgba(18,20,28,.95)', floorColor: 'rgba(8,10,16,.9)', accentColor: 'rgba(0,200,255,.25)',
    exitX: 175, exitY: 265, exitW: 30, exitH: 15,
    ambientText: 'Polished floors. Directory board by the elevator. Two businesses share this floor.',
    workers: [{ x: 60, y: 50, name: 'RECEPTIONIST', role: 'Front Desk', hostile: false }],
    objects: [
      { x: 20, y: 25, w: 75, h: 28, type: 'reception', label: 'LOBBY DESK', color: 'rgba(60,70,90,.5)' },
      { x: 20, y: 70, w: 140, h: 75, type: 'counter', label: 'BUSINESS A', color: 'rgba(50,65,80,.5)' },
      { x: 20, y: 160, w: 60, h: 25, type: 'couch', label: 'WAITING AREA', color: 'rgba(50,45,60,.4)' },
      { x: 200, y: 70, w: 140, h: 75, type: 'counter', label: 'BUSINESS B', color: 'rgba(50,65,80,.5)' },
      { x: 200, y: 160, w: 45, h: 35, type: 'vending_machine', label: 'VENDING', color: 'rgba(40,80,60,.4)' },
      { x: 260, y: 160, w: 30, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
      { x: 310, y: 25, w: 50, h: 50, type: 'elevator', label: 'ELEVATOR', color: 'rgba(80,85,100,.6)' },
      { x: 130, y: 25, w: 50, h: 20, type: 'whiteboard', label: 'DIRECTORY', color: 'rgba(200,200,200,.15)' },
      { x: 120, y: 200, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
    ],
  },
  _office_floor: {
    id: '_office_floor', label: 'OFFICE FLOOR',
    width: 380, height: 300,
    wallColor: 'rgba(18,22,30,.95)', floorColor: 'rgba(8,12,18,.92)', accentColor: 'rgba(0,180,255,.25)',
    exitX: 175, exitY: 285, exitW: 30, exitH: 15,
    ambientText: 'Open plan office. Conference room in the back. Elevator to lobby.',
    objects: [
      { x: 20, y: 30, w: 55, h: 28, type: 'desk', label: 'DESK 1', color: 'rgba(50,60,80,.5)' },
      { x: 20, y: 75, w: 55, h: 28, type: 'desk', label: 'DESK 2', color: 'rgba(50,60,80,.5)' },
      { x: 20, y: 120, w: 55, h: 28, type: 'desk', label: 'DESK 3', color: 'rgba(50,60,80,.5)' },
      { x: 90, y: 30, w: 45, h: 28, type: 'terminal', label: 'TERMINAL', color: 'rgba(0,80,120,.5)' },
      { x: 90, y: 75, w: 45, h: 28, type: 'terminal', label: 'WORKSTATION', color: 'rgba(0,80,120,.5)' },
      { x: 310, y: 30, w: 50, h: 50, type: 'elevator', label: 'ELEVATOR', color: 'rgba(80,85,100,.6)' },
      { x: 170, y: 30, w: 100, h: 70, type: 'conference_table', label: 'CONFERENCE ROOM', color: 'rgba(45,55,75,.5)' },
      { x: 170, y: 35, w: 90, h: 10, type: 'whiteboard', label: 'WHITEBOARD', color: 'rgba(200,200,200,.15)' },
      { x: 275, y: 35, w: 30, h: 25, type: 'tv_screen', label: 'DISPLAY', color: 'rgba(0,50,100,.4)' },
      { x: 20, y: 175, w: 50, h: 35, type: 'filing_cabinet', label: 'FILES', color: 'rgba(50,55,65,.5)' },
      { x: 90, y: 175, w: 45, h: 35, type: 'bookshelf', label: 'REFERENCE', color: 'rgba(80,60,35,.5)' },
      { x: 310, y: 100, w: 50, h: 35, type: 'locker', label: 'SUPPLY ROOM', color: 'rgba(50,55,65,.5)' },
      { x: 170, y: 175, w: 60, h: 28, type: 'couch', label: 'BREAK AREA', color: 'rgba(60,50,70,.4)' },
      { x: 250, y: 175, w: 40, h: 35, type: 'vending_machine', label: 'COFFEE', color: 'rgba(60,40,20,.5)' },
      { x: 310, y: 175, w: 25, h: 25, type: 'water_cooler', label: 'WATER', color: 'rgba(40,60,80,.3)' },
      { x: 20, y: 230, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
      { x: 310, y: 230, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
    ],
  },
  eastside_flat: {
    id: 'eastside_flat', label: 'EASTSIDE FLATS — HALLWAY',
    width: 300, height: 220,
    wallColor: 'rgba(22,18,15,.95)', floorColor: 'rgba(12,10,8,.9)', accentColor: 'rgba(255,180,80,.2)',
    exitX: 135, exitY: 205, exitW: 30, exitH: 15,
    ambientText: 'Flickering hallway light. Mailboxes line the wall. Someone is cooking upstairs.',
    workers: [{ x: 80, y: 60, name: 'SUPER', role: 'Building Super', hostile: false }],
    objects: [
      { x: 20, y: 25, w: 60, h: 25, type: 'reception', label: 'MAILBOXES', color: 'rgba(60,50,35,.5)' },
      { x: 20, y: 65, w: 50, h: 30, type: 'locker', label: 'UTILITY CLOSET', color: 'rgba(50,45,35,.5)' },
      { x: 230, y: 25, w: 50, h: 50, type: 'elevator', label: 'ELEVATOR', color: 'rgba(80,75,65,.6)' },
      { x: 120, y: 25, w: 60, h: 20, type: 'whiteboard', label: 'NOTICE BOARD', color: 'rgba(200,200,200,.15)' },
      { x: 20, y: 130, w: 55, h: 30, type: 'couch', label: 'LOBBY BENCH', color: 'rgba(50,40,30,.4)' },
      { x: 230, y: 130, w: 40, h: 35, type: 'vending_machine', label: 'SODA MACHINE', color: 'rgba(40,60,50,.4)' },
      { x: 120, y: 130, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
    ],
  },
  _npc_apartment: {
    id: '_npc_apartment', label: 'APARTMENT',
    width: 240, height: 180,
    wallColor: 'rgba(25,20,18,.95)', floorColor: 'rgba(14,12,10,.9)', accentColor: 'rgba(255,120,60,.2)',
    exitX: 105, exitY: 165, exitW: 30, exitH: 15,
    ambientText: 'Someone else\'s home. They don\'t look happy to see you.',
    workers: [{ x: 120, y: 80, name: 'RESIDENT', role: 'Tenant', hostile: true }],
    objects: [
      { x: 20, y: 25, w: 55, h: 30, type: 'bed', label: 'BED', color: 'rgba(60,50,40,.5)' },
      { x: 20, y: 70, w: 35, h: 25, type: 'nightstand', label: 'NIGHTSTAND', color: 'rgba(50,40,30,.4)' },
      { x: 170, y: 25, w: 45, h: 40, type: 'window', label: 'WINDOW', color: 'rgba(0,40,60,.4)' },
      { x: 100, y: 25, w: 40, h: 30, type: 'desk', label: 'DESK', color: 'rgba(45,40,30,.5)' },
      { x: 170, y: 80, w: 40, h: 30, type: 'shelf', label: 'SHELF', color: 'rgba(50,45,35,.4)' },
      { x: 20, y: 120, w: 35, h: 25, type: 'chair', color: 'rgba(40,35,25,.4)' },
    ],
  },
  scrap: {
    id: 'scrap', label: 'SCRAP YARD — PROCESSING FLOOR',
    width: 360, height: 260,
    wallColor: 'rgba(20,18,12,.95)', floorColor: 'rgba(10,8,5,.9)', accentColor: 'rgba(255,160,40,.2)',
    exitX: 165, exitY: 245, exitW: 30, exitH: 15,
    ambientText: 'Metal grinding. Sparks fly. The foreman watches everything.',
    workers: [
      { x: 80, y: 50, name: 'GRINDER', role: 'Metal Worker', hostile: false },
      { x: 250, y: 120, name: 'FOREMAN', role: 'Yard Foreman', hostile: false },
    ],
    objects: [
      { x: 20, y: 25, w: 70, h: 40, type: 'equipment', label: 'CRUSHER', color: 'rgba(80,60,30,.5)' },
      { x: 20, y: 80, w: 70, h: 40, type: 'equipment', label: 'SMELTER', color: 'rgba(90,50,20,.5)' },
      { x: 20, y: 140, w: 60, h: 35, type: 'crate', label: 'SALVAGE PILE', color: 'rgba(60,50,25,.4)' },
      { x: 270, y: 25, w: 65, h: 35, type: 'terminal', label: 'INVENTORY LOG', color: 'rgba(0,70,40,.4)' },
      { x: 270, y: 80, w: 65, h: 40, type: 'crate', label: 'RAW SCRAP', color: 'rgba(55,45,20,.4)' },
      { x: 150, y: 25, w: 60, h: 25, type: 'counter', label: 'WEIGH STATION', color: 'rgba(70,60,35,.5)' },
      { x: 150, y: 140, w: 50, h: 30, type: 'locker', label: 'TOOL STORAGE', color: 'rgba(50,50,40,.5)' },
      { x: 270, y: 200, w: 25, h: 25, type: 'water_cooler', label: 'WATER', color: 'rgba(40,60,80,.3)' },
    ],
  },
  radio: {
    id: 'radio', label: 'PIRATE RADIO — BROADCAST STUDIO',
    width: 300, height: 220,
    wallColor: 'rgba(15,12,20,.95)', floorColor: 'rgba(6,4,10,.9)', accentColor: 'rgba(255,80,200,.25)',
    exitX: 135, exitY: 205, exitW: 30, exitH: 15,
    ambientText: 'ON AIR light glows red. Vinyl records stacked everywhere. Bass vibrates the floor.',
    workers: [{ x: 100, y: 50, name: 'DJ KRUX', role: 'Radio Host', hostile: false }],
    objects: [
      { x: 20, y: 25, w: 80, h: 35, type: 'desk', label: 'MIXING DESK', color: 'rgba(60,30,70,.5)' },
      { x: 20, y: 75, w: 50, h: 40, type: 'equipment', label: 'TURNTABLES', color: 'rgba(50,25,60,.5)' },
      { x: 220, y: 25, w: 55, h: 40, type: 'terminal', label: 'BROADCAST TERMINAL', color: 'rgba(80,0,60,.4)' },
      { x: 220, y: 80, w: 55, h: 35, type: 'shelf', label: 'VINYL COLLECTION', color: 'rgba(50,30,55,.4)' },
      { x: 120, y: 25, w: 50, h: 20, type: 'equipment', label: 'MICROPHONE', color: 'rgba(70,40,80,.4)' },
      { x: 120, y: 130, w: 45, h: 30, type: 'couch', label: 'GUEST COUCH', color: 'rgba(50,30,50,.4)' },
      { x: 20, y: 160, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
    ],
  },
  overlook: {
    id: 'overlook', label: 'THE PINNACLE — LOBBY',
    width: 320, height: 240,
    wallColor: 'rgba(20,18,25,.95)', floorColor: 'rgba(10,8,14,.9)', accentColor: 'rgba(200,160,255,.25)',
    exitX: 145, exitY: 225, exitW: 30, exitH: 15,
    ambientText: 'Upscale lobby. Crystal chandelier buzzes. The concierge watches you.',
    workers: [{ x: 90, y: 50, name: 'CONCIERGE', role: 'Front Desk', hostile: false }],
    objects: [
      { x: 20, y: 25, w: 70, h: 25, type: 'reception', label: 'CONCIERGE DESK', color: 'rgba(70,55,80,.5)' },
      { x: 20, y: 65, w: 55, h: 30, type: 'couch', label: 'LOBBY SEATING', color: 'rgba(60,50,70,.4)' },
      { x: 250, y: 25, w: 50, h: 50, type: 'elevator', label: 'ELEVATOR', color: 'rgba(90,85,100,.6)' },
      { x: 130, y: 25, w: 55, h: 20, type: 'whiteboard', label: 'TENANT BOARD', color: 'rgba(200,200,200,.15)' },
      { x: 250, y: 100, w: 50, h: 35, type: 'locker', label: 'PACKAGE ROOM', color: 'rgba(55,50,60,.5)' },
      { x: 20, y: 130, w: 40, h: 35, type: 'vending_machine', label: 'VENDING', color: 'rgba(40,60,50,.4)' },
      { x: 130, y: 130, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
      { x: 250, y: 180, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
    ],
  },
  depot_south: {
    id: 'depot_south', label: 'TRANSIT DEPOT — DISPATCH',
    width: 320, height: 240,
    wallColor: 'rgba(20,20,18,.95)', floorColor: 'rgba(10,10,6,.9)', accentColor: 'rgba(255,200,60,.2)',
    exitX: 145, exitY: 225, exitW: 30, exitH: 15,
    ambientText: 'Engine oil and diesel fumes. Dispatch board shows delays across all lines.',
    workers: [
      { x: 80, y: 50, name: 'DISPATCH', role: 'Controller', hostile: false },
      { x: 220, y: 120, name: 'MECHANIC', role: 'Vehicle Tech', hostile: false },
    ],
    objects: [
      { x: 20, y: 25, w: 70, h: 25, type: 'reception', label: 'DISPATCH DESK', color: 'rgba(60,60,40,.5)' },
      { x: 20, y: 65, w: 55, h: 35, type: 'terminal', label: 'ROUTE TERMINAL', color: 'rgba(0,70,40,.4)' },
      { x: 240, y: 25, w: 55, h: 40, type: 'equipment', label: 'TOOL RACK', color: 'rgba(60,55,30,.5)' },
      { x: 240, y: 80, w: 55, h: 35, type: 'crate', label: 'PARTS BIN', color: 'rgba(50,45,25,.4)' },
      { x: 130, y: 25, w: 60, h: 20, type: 'whiteboard', label: 'SCHEDULE BOARD', color: 'rgba(200,200,200,.15)' },
      { x: 130, y: 65, w: 50, h: 30, type: 'locker', label: 'DRIVER LOCKERS', color: 'rgba(50,50,40,.5)' },
      { x: 20, y: 150, w: 45, h: 30, type: 'couch', label: 'BREAK ROOM', color: 'rgba(50,45,30,.4)' },
      { x: 130, y: 150, w: 30, h: 25, type: 'vending_machine', label: 'COFFEE', color: 'rgba(60,40,20,.4)' },
    ],
  },
  north_gate: {
    id: 'north_gate', label: 'NORTH GATE — CHECKPOINT',
    width: 260, height: 180,
    wallColor: 'rgba(18,18,22,.95)', floorColor: 'rgba(8,8,12,.9)', accentColor: 'rgba(100,150,255,.2)',
    exitX: 115, exitY: 165, exitW: 30, exitH: 15,
    ambientText: 'Concrete barriers. Scanner hums. Guard watches the line.',
    workers: [{ x: 80, y: 50, name: 'GATE GUARD', role: 'Security', hostile: false }],
    objects: [
      { x: 20, y: 25, w: 60, h: 25, type: 'reception', label: 'CHECK DESK', color: 'rgba(50,55,70,.5)' },
      { x: 20, y: 65, w: 45, h: 25, type: 'security_gate', label: 'SCANNER', color: 'rgba(60,60,80,.4)' },
      { x: 190, y: 25, w: 45, h: 35, type: 'terminal', label: 'ID TERMINAL', color: 'rgba(0,50,100,.4)' },
      { x: 190, y: 75, w: 45, h: 30, type: 'locker', label: 'CONFISCATED', color: 'rgba(50,50,65,.5)' },
      { x: 110, y: 25, w: 40, h: 20, type: 'tv_screen', label: 'CAMERA FEED', color: 'rgba(0,40,80,.4)' },
      { x: 110, y: 120, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
    ],
  },
  _subway: {
    id: '_subway', label: 'METRO STATION',
    width: 300, height: 200,
    wallColor: 'rgba(15,15,20,.95)', floorColor: 'rgba(6,6,10,.9)', accentColor: 'rgba(0,200,255,.2)',
    exitX: 135, exitY: 185, exitW: 30, exitH: 15,
    ambientText: 'Train rumbles below. Turnstile clicks. Stale air from the tunnels.',
    workers: [{ x: 80, y: 50, name: 'ATTENDANT', role: 'Station Worker', hostile: false }],
    objects: [
      { x: 20, y: 25, w: 60, h: 25, type: 'reception', label: 'TICKET BOOTH', color: 'rgba(50,60,80,.5)' },
      { x: 20, y: 65, w: 40, h: 20, type: 'security_gate', label: 'TURNSTILE', color: 'rgba(60,65,80,.4)' },
      { x: 220, y: 25, w: 55, h: 35, type: 'terminal', label: 'ROUTE MAP', color: 'rgba(0,60,100,.4)' },
      { x: 220, y: 75, w: 55, h: 30, type: 'vending_machine', label: 'TICKET MACHINE', color: 'rgba(40,60,80,.4)' },
      { x: 120, y: 25, w: 60, h: 20, type: 'whiteboard', label: 'DEPARTURE BOARD', color: 'rgba(200,200,200,.15)' },
      { x: 120, y: 100, w: 50, h: 25, type: 'couch', label: 'PLATFORM BENCH', color: 'rgba(40,40,50,.4)' },
      { x: 20, y: 130, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
    ],
  },
  _checkpoint: {
    id: '_checkpoint', label: 'CHECKPOINT',
    width: 260, height: 180,
    wallColor: 'rgba(20,18,15,.95)', floorColor: 'rgba(10,8,6,.9)', accentColor: 'rgba(255,100,60,.2)',
    exitX: 115, exitY: 165, exitW: 30, exitH: 15,
    ambientText: 'Sandbags. Razor wire in the distance. The guard inspects every face.',
    workers: [{ x: 80, y: 50, name: 'BORDER GUARD', role: 'Checkpoint Officer', hostile: false }],
    objects: [
      { x: 20, y: 25, w: 60, h: 25, type: 'reception', label: 'INSPECTION DESK', color: 'rgba(60,50,35,.5)' },
      { x: 20, y: 65, w: 45, h: 25, type: 'security_gate', label: 'BODY SCANNER', color: 'rgba(70,60,40,.4)' },
      { x: 190, y: 25, w: 45, h: 30, type: 'terminal', label: 'ID CHECK', color: 'rgba(0,60,40,.4)' },
      { x: 190, y: 70, w: 45, h: 30, type: 'locker', label: 'WEAPONS HOLD', color: 'rgba(55,45,30,.5)' },
      { x: 110, y: 25, w: 40, h: 20, type: 'tv_screen', label: 'SCANNER DISPLAY', color: 'rgba(0,50,60,.4)' },
      { x: 20, y: 120, w: 40, h: 25, type: 'crate', label: 'SUPPLY CRATE', color: 'rgba(50,45,25,.4)' },
    ],
  },
  _outpost: {
    id: '_outpost', label: 'OUTPOST',
    width: 340, height: 260,
    wallColor: 'rgba(22,18,12,.95)', floorColor: 'rgba(12,8,5,.9)', accentColor: 'rgba(255,140,40,.2)',
    exitX: 155, exitY: 245, exitW: 30, exitH: 15,
    ambientText: 'Corrugated walls rattle. Generator hums. Dozens of people packed into every corner. Cots line the walls.',
    workers: [
      { x: 100, y: 50, name: 'WARDEN BRIGGS', role: 'Outpost Chief', hostile: false },
      { x: 40, y: 90, name: 'JUNO VALE', role: 'Medic', hostile: false },
      { x: 200, y: 50, name: 'GUS RENO', role: 'Cook', hostile: false },
      { x: 260, y: 90, name: 'TALIA MARSH', role: 'Scavenger', hostile: false },
      { x: 150, y: 130, name: 'DRIFTER', role: 'Displaced Worker', hostile: false },
      { x: 80, y: 170, name: 'OLD MAN KENJI', role: 'Elder', hostile: false },
      { x: 220, y: 170, name: 'NITA CROSS', role: 'Mechanic', hostile: false },
      { x: 150, y: 200, name: 'KID SPARKS', role: 'Runner', hostile: false },
    ],
    objects: [
      { x: 20, y: 25, w: 55, h: 30, type: 'counter', label: 'TRADE POST', color: 'rgba(60,50,30,.5)' },
      { x: 20, y: 70, w: 50, h: 25, type: 'bed', label: 'COT ROW A', color: 'rgba(50,40,25,.4)' },
      { x: 20, y: 110, w: 50, h: 25, type: 'bed', label: 'COT ROW B', color: 'rgba(50,40,25,.4)' },
      { x: 20, y: 150, w: 50, h: 25, type: 'bed', label: 'COT ROW C', color: 'rgba(50,40,25,.4)' },
      { x: 270, y: 25, w: 45, h: 35, type: 'terminal', label: 'COMM RADIO', color: 'rgba(0,60,40,.4)' },
      { x: 270, y: 75, w: 45, h: 30, type: 'locker', label: 'GUN LOCKER', color: 'rgba(55,50,30,.5)' },
      { x: 270, y: 120, w: 45, h: 30, type: 'equipment', label: 'GENERATOR', color: 'rgba(60,55,25,.5)' },
      { x: 270, y: 165, w: 45, h: 25, type: 'crate', label: 'SUPPLY CRATE', color: 'rgba(55,45,20,.4)' },
      { x: 130, y: 25, w: 55, h: 20, type: 'shelf', label: 'RATIONS SHELF', color: 'rgba(50,45,25,.4)' },
      { x: 130, y: 60, w: 40, h: 25, type: 'table', label: 'MESS TABLE', color: 'rgba(45,40,20,.4)' },
      { x: 130, y: 100, w: 30, h: 25, type: 'water_cooler', label: 'WATER JUG', color: 'rgba(40,60,80,.3)' },
      { x: 20, y: 200, w: 45, h: 25, type: 'equipment', label: 'CAMP STOVE', color: 'rgba(60,40,15,.4)' },
    ],
  },
  _wasteland_shelter: {
    id: '_wasteland_shelter', label: 'SHELTER',
    width: 320, height: 250,
    wallColor: 'rgba(20,16,10,.95)', floorColor: 'rgba(10,7,4,.9)', accentColor: 'rgba(200,120,40,.2)',
    exitX: 145, exitY: 235, exitW: 30, exitH: 15,
    ambientText: 'Bare concrete. Water stains. Scratched tallies on every wall. Packed with bodies. Coughing echoes down the corridor.',
    workers: [
      { x: 80, y: 40, name: 'GUARD HOLT', role: 'Shelter Watch', hostile: false },
      { x: 200, y: 40, name: 'NURSE ADLER', role: 'Field Medic', hostile: false },
      { x: 40, y: 100, name: 'SQUATTER', role: 'Drifter', hostile: true },
      { x: 160, y: 100, name: 'MARA FINCH', role: 'Displaced Worker', hostile: false },
      { x: 250, y: 100, name: 'DRUNK PETE', role: 'Vagrant', hostile: false },
      { x: 80, y: 160, name: 'SILA ORTEZ', role: 'Forager', hostile: false },
      { x: 200, y: 160, name: 'YOUNG GIRL', role: 'Orphan', hostile: false },
      { x: 130, y: 200, name: 'OLD BONES', role: 'Elder', hostile: false },
    ],
    objects: [
      { x: 20, y: 25, w: 55, h: 25, type: 'bed', label: 'BUNK ROW 1', color: 'rgba(50,40,20,.5)' },
      { x: 20, y: 65, w: 55, h: 25, type: 'bed', label: 'BUNK ROW 2', color: 'rgba(50,40,20,.5)' },
      { x: 20, y: 105, w: 55, h: 25, type: 'bed', label: 'BUNK ROW 3', color: 'rgba(50,40,20,.5)' },
      { x: 20, y: 145, w: 55, h: 25, type: 'bed', label: 'BUNK ROW 4', color: 'rgba(50,40,20,.5)' },
      { x: 240, y: 25, w: 50, h: 30, type: 'crate', label: 'SUPPLY CACHE', color: 'rgba(55,40,18,.4)' },
      { x: 240, y: 70, w: 50, h: 30, type: 'locker', label: 'FOOTLOCKER', color: 'rgba(50,45,25,.5)' },
      { x: 240, y: 115, w: 50, h: 25, type: 'shelf', label: 'RATIONS', color: 'rgba(50,45,25,.4)' },
      { x: 240, y: 155, w: 50, h: 30, type: 'equipment', label: 'CAMP STOVE', color: 'rgba(60,40,15,.4)' },
      { x: 130, y: 25, w: 50, h: 25, type: 'table', label: 'MAKESHIFT TABLE', color: 'rgba(45,40,20,.4)' },
      { x: 130, y: 65, w: 35, h: 25, type: 'water_cooler', label: 'WATER BARREL', color: 'rgba(40,60,80,.3)' },
      { x: 130, y: 120, w: 40, h: 20, type: 'counter', label: 'NOTICE BOARD', color: 'rgba(60,50,30,.4)' },
    ],
  },
  _house: {
    id: '_house', label: 'ROWHOUSE INTERIOR',
    width: 380, height: 290,
    buildingSize: 'medium',
    wallColor: 'rgba(20,28,22,.95)', floorColor: 'rgba(8,14,10,.9)', accentColor: 'rgba(80,200,120,.2)',
    exitX: 175, exitY: 275, exitW: 30, exitH: 15,
    ambientText: 'Private rowhouse. Two floors. Separate entrance. The silence is unfamiliar — no shared walls, no neighbours coughing through the plaster.',
    objects: [
      { x: 20, y: 30, w: 70, h: 40, type: 'bed', label: 'BED', color: 'rgba(60,80,60,.6)' },
      { x: 100, y: 30, w: 30, h: 25, type: 'nightstand', label: 'NIGHTSTAND', color: 'rgba(50,65,50,.5)' },
      { x: 300, y: 25, w: 55, h: 60, type: 'window', label: 'WINDOW — STREET VIEW', color: 'rgba(0,50,70,.4)' },
      { x: 20, y: 100, w: 55, h: 35, type: 'desk', label: 'HOME DESK', color: 'rgba(45,60,45,.5)' },
      { x: 20, y: 150, w: 30, h: 25, type: 'chair', color: 'rgba(40,50,40,.4)' },
      { x: 140, y: 30, w: 70, h: 35, type: 'couch', label: 'SOFA', color: 'rgba(60,70,50,.4)' },
      { x: 140, y: 80, w: 45, h: 30, type: 'table', label: 'COFFEE TABLE', color: 'rgba(55,65,45,.4)' },
      { x: 220, y: 30, w: 60, h: 30, type: 'tv_screen', label: 'DISPLAY — CITY FEED', color: 'rgba(0,60,80,.4)' },
      { x: 220, y: 75, w: 40, h: 25, type: 'terminal', label: 'HOME TERMINAL', color: 'rgba(0,80,40,.4)' },
      { x: 140, y: 130, w: 55, h: 30, type: 'counter', label: 'KITCHEN COUNTER', color: 'rgba(70,75,55,.5)' },
      { x: 140, y: 170, w: 30, h: 25, type: 'shelf', label: 'PANTRY', color: 'rgba(60,65,50,.4)' },
      { x: 300, y: 100, w: 55, h: 30, type: 'bookshelf', label: 'BOOKSHELF', color: 'rgba(70,60,40,.5)' },
      { x: 300, y: 145, w: 55, h: 35, type: 'locker', label: 'STORAGE', color: 'rgba(55,60,50,.5)' },
      { x: 20, y: 200, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
      { x: 340, y: 200, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
      { x: 80, y: 200, w: 50, h: 30, type: 'terminal', label: 'LOCK TERMINAL', color: 'rgba(0,100,50,.35)' },
    ],
  },
  _villa: {
    id: '_villa', label: 'VILLA INTERIOR',
    width: 500, height: 380,
    buildingSize: 'large',
    wallColor: 'rgba(14,18,24,.97)', floorColor: 'rgba(5,8,14,.95)', accentColor: 'rgba(180,100,255,.25)',
    exitX: 235, exitY: 365, exitW: 30, exitH: 15,
    ambientText: 'Floor-to-ceiling glass. The city is visible from every room. Climate-controlled. The address is the point. Whoever gave you this address made a decision about who you are.',
    workers: [{ x: 100, y: 60, name: 'CONCIERGE UNIT', role: 'AI Butler', hostile: false, dialogue: 'Good evening. Your schedule is clear. All systems nominal. Three messages held per your standing instruction.' }],
    objects: [
      { x: 20, y: 30, w: 90, h: 50, type: 'bed', label: 'KING BED', color: 'rgba(40,50,70,.6)' },
      { x: 120, y: 30, w: 35, h: 30, type: 'nightstand', label: 'STAND', color: 'rgba(45,55,75,.5)' },
      { x: 370, y: 20, w: 80, h: 100, type: 'window', label: 'FULL-WALL GLASS', color: 'rgba(0,30,80,.4)' },
      { x: 20, y: 110, w: 70, h: 45, type: 'desk', label: 'EXECUTIVE DESK', color: 'rgba(40,50,70,.5)' },
      { x: 20, y: 170, w: 35, h: 30, type: 'chair', color: 'rgba(35,45,65,.4)' },
      { x: 170, y: 30, w: 80, h: 40, type: 'couch', label: 'SECTIONAL SOFA', color: 'rgba(50,55,80,.4)' },
      { x: 170, y: 80, w: 60, h: 35, type: 'table', label: 'GLASS TABLE', color: 'rgba(40,50,70,.3)' },
      { x: 260, y: 30, w: 80, h: 40, type: 'tv_screen', label: 'HOLODISPLAY — PANORAMIC', color: 'rgba(0,40,100,.5)' },
      { x: 260, y: 85, w: 55, h: 35, type: 'terminal', label: 'COMMAND TERMINAL', color: 'rgba(60,0,100,.5)' },
      { x: 170, y: 135, w: 80, h: 35, type: 'counter', label: 'PRIVATE BAR', color: 'rgba(60,55,80,.5)' },
      { x: 170, y: 185, w: 55, h: 30, type: 'shelf', label: 'WINE RACK', color: 'rgba(60,50,40,.4)' },
      { x: 20, y: 240, w: 60, h: 40, type: 'couch', label: 'READING AREA', color: 'rgba(50,45,70,.4)' },
      { x: 100, y: 240, w: 50, h: 35, type: 'bookshelf', label: 'LIBRARY WALL', color: 'rgba(70,60,40,.5)' },
      { x: 170, y: 240, w: 55, h: 35, type: 'server', label: 'PRIVATE SERVER', color: 'rgba(40,0,80,.6)' },
      { x: 260, y: 140, w: 55, h: 35, type: 'security_gate', label: 'BIOMETRIC ENTRY', color: 'rgba(60,40,80,.5)' },
      { x: 370, y: 140, w: 80, h: 35, type: 'locker', label: 'SAFE ROOM DOOR', color: 'rgba(50,45,70,.5)' },
      { x: 370, y: 190, w: 80, h: 35, type: 'elevator', label: 'PRIVATE LIFT', color: 'rgba(60,55,80,.6)' },
      { x: 20, y: 310, w: 30, h: 30, type: 'plant', color: 'rgba(30,70,50,.3)' },
      { x: 430, y: 310, w: 30, h: 30, type: 'plant', color: 'rgba(30,70,50,.3)' },
      { x: 260, y: 240, w: 60, h: 35, type: 'portrait', label: 'PORTRAIT', color: 'rgba(80,40,60,.4)' },
    ],
  },
  public_office: {
    id: 'public_office', label: 'PUBLIC OFFICE — CO-WORKING FLOOR',
    width: 440, height: 340,
    wallColor: 'rgba(18,22,30,.95)', floorColor: 'rgba(8,12,18,.92)', accentColor: 'rgba(0,180,255,.25)',
    exitX: 205, exitY: 325, exitW: 30, exitH: 15,
    ambientText: 'Keyboards click. Fluorescent hum. The smell of old coffee and ozone. Terminals available for rent — ƒ50/minute.',
    workers: [{ x: 60, y: 50, name: 'ADMIN', role: 'Office Manager', hostile: false }],
    objects: [
      { x: 20, y: 30, w: 90, h: 28, type: 'reception', label: 'FRONT DESK', color: 'rgba(60,80,100,.5)' },
      { x: 20, y: 80, w: 55, h: 30, type: 'desk', label: 'DESK A', color: 'rgba(50,60,80,.5)' },
      { x: 20, y: 125, w: 55, h: 30, type: 'desk', label: 'DESK B', color: 'rgba(50,60,80,.5)' },
      { x: 20, y: 170, w: 55, h: 30, type: 'desk', label: 'DESK C', color: 'rgba(50,60,80,.5)' },
      { x: 80, y: 80, w: 45, h: 30, type: 'terminal', label: 'TERMINAL 1', color: 'rgba(0,80,120,.5)' },
      { x: 80, y: 125, w: 45, h: 30, type: 'terminal', label: 'TERMINAL 2', color: 'rgba(0,80,120,.5)' },
      { x: 80, y: 170, w: 45, h: 30, type: 'terminal', label: 'TERMINAL 3', color: 'rgba(0,80,120,.5)' },
      { x: 160, y: 80, w: 55, h: 30, type: 'desk', label: 'DESK D', color: 'rgba(50,60,80,.5)' },
      { x: 160, y: 125, w: 55, h: 30, type: 'desk', label: 'DESK E', color: 'rgba(50,60,80,.5)' },
      { x: 220, y: 80, w: 45, h: 30, type: 'terminal', label: 'TERMINAL 4', color: 'rgba(0,80,120,.5)' },
      { x: 220, y: 125, w: 45, h: 30, type: 'terminal', label: 'TERMINAL 5', color: 'rgba(0,80,120,.5)' },
      { x: 300, y: 30, w: 55, h: 40, type: 'terminal', label: 'ADMIN TERMINAL', color: 'rgba(0,60,100,.5)' },
      { x: 300, y: 85, w: 55, h: 35, type: 'whiteboard', label: 'JOB BOARD', color: 'rgba(200,200,200,.15)' },
      { x: 300, y: 135, w: 55, h: 30, type: 'filing_cabinet', label: 'RECORDS', color: 'rgba(50,55,65,.5)' },
      { x: 370, y: 30, w: 50, h: 65, type: 'bookshelf', label: 'REFERENCE', color: 'rgba(80,60,35,.5)' },
      { x: 370, y: 110, w: 50, h: 50, type: 'locker', label: 'STORAGE', color: 'rgba(50,55,65,.5)' },
      { x: 20, y: 230, w: 50, h: 45, type: 'vending_machine', label: 'VENDING', color: 'rgba(40,80,60,.5)' },
      { x: 90, y: 230, w: 50, h: 45, type: 'vending_machine', label: 'COFFEE', color: 'rgba(60,40,20,.5)' },
      { x: 160, y: 230, w: 60, h: 28, type: 'couch', label: 'BREAK AREA', color: 'rgba(60,50,70,.4)' },
      { x: 160, y: 270, w: 40, h: 20, type: 'table', label: 'COFFEE TABLE', color: 'rgba(55,50,60,.4)' },
      { x: 300, y: 200, w: 30, h: 25, type: 'water_cooler', label: 'WATER', color: 'rgba(40,60,80,.3)' },
      { x: 370, y: 200, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
      { x: 20, y: 290, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
      { x: 240, y: 30, w: 45, h: 25, type: 'photocopier', label: 'COPIER', color: 'rgba(50,55,60,.4)' },
      { x: 140, y: 30, w: 80, h: 25, type: 'counter', label: 'CHECK-IN COUNTER', color: 'rgba(60,70,80,.5)' },
      { x: 300, y: 250, w: 55, h: 30, type: 'desk', label: 'PRIVATE DESK', color: 'rgba(50,60,80,.5)' },
      { x: 360, y: 250, w: 45, h: 30, type: 'terminal', label: 'TERMINAL 6', color: 'rgba(0,80,120,.5)' },
    ],
  },
};


export const BUILDING_INTERIOR_MAP: Record<string, string> = {
  minx_arms: 'minx_arms',
  clinic: 'clinic',
  pablo_store: '_shop',
  noodle_bar: '_shop',
  pawn_shop: '_shop',
  market: '_shop',
  food_court: '_shop',
  print_shop: '_lobby',
  call_home: '_lobby',
  terminal_shop: '_lobby',
  data_vault: '_lobby',
  oxide_labs: 'oxide_labs',
  admin_bureau: 'admin_bureau',
  police_hq: 'police_hq',
  realestate_office: 'realestate_office',
  nexus_hub: 'nexus_hub',
  public_office: 'public_office',
  gold_exchange: 'gold_exchange',
  megabank: 'megabank',
  dojo: 'dojo',
  nightclub: 'nightclub',
  armory: 'armory',
  hotel: 'hotel',
  arcade: 'arcade',
  bunker: '_wasteland_shelter',
  east_bunker: '_wasteland_shelter',
  north_bunker: '_wasteland_shelter',
  pablo_tower: '_lobby',
  safe_house: '_house',
  vehicle_dealer: '_shop',
  plaza_market: '_shop',
  machine_bunker: 'machine_bunker',
  eastside_flat: 'eastside_flat',
  overlook: 'overlook',
  scrap: 'scrap',
  radio: 'radio',
  depot_south: 'depot_south',
  north_gate: 'north_gate',
  sub_west: '_subway',
  sub_central: '_subway',
  sub_east: '_subway',
  sub_north: '_subway',
  checkpoint_w: '_checkpoint',
  checkpoint_c: '_checkpoint',
  checkpoint_e: '_checkpoint',
  outpost_alpha: '_outpost',
  rust_porch: '_outpost',
  eastern_gate: '_checkpoint',
  outpost_beta: '_outpost',
  supply_cache: '_wasteland_shelter',
  deep_bunker: '_wasteland_shelter',
  ashfield_hostel: '_wasteland_shelter',
  terminus: '_wasteland_shelter',
  bastion_keep: '_outpost',
  waste_exchange: '_shop',
  deep_camp: '_wasteland_shelter',
  ruins_alpha: '_wasteland_shelter',
  southern_hub: '_outpost',
  picassoo_hq: 'picassoo_hq',
};

export const THE_MINX_ISSUES: NewspaperIssue[] = [
  {
    issue: 1, season: 'WINTER',
    headline: 'SHADOW TOWER POWER SURGE BLACKS OUT 4 SECTORS',
    subhead: 'PABLO CORP denies involvement as grid failures spread to south industrial zone',
    articles: [
      { title: 'TOWER SURGE LEAVES THOUSANDS IN DARK',
        body: 'A massive electromagnetic pulse originating from the upper floors of Shadow Tower disrupted power across Sectors 1, 6, 10, and 11 late Tuesday evening. PABLO CORP spokesperson UNIT-7 issued a statement attributing the outage to "routine atmospheric calibration." Residents report flickering lights and data corruption lasting six hours. City Clinic treated 14 cases of implant malfunction. Infrastructure Manager Dorian Krall called the official explanation "physically impossible" before being escorted from the press briefing by two PABLO CORP security units.' },
      { title: 'IRON DOJO ANNOUNCES OPEN ENROLLMENT',
        body: 'The Iron Dojo in Sector 3 will accept new students for the first time in two years. Head instructor has waived the usual 500 FIAT registration fee through end of season. "The city needs fighters," the instructor said. "Not corporate ones. Real ones." PABLO CORP has filed a zoning complaint against the dojo, citing "unauthorized combat instruction within municipal limits."' },
      { title: 'CHECKPOINT DELAYS QUADRUPLE AS BORDER TIGHTENS',
        body: 'Wait times at Checkpoints W, C, and E have increased to four hours on average. Sgt. Callow Briggs confirmed that new scanning equipment donated by PABLO CORP requires all travelers to submit to biometric registration. Wasteland traders report losing perishable cargo. Three merchants have been detained for carrying "unregistered organic material" — identified by witnesses as vegetables.' },
      { title: 'REPLICANT SIGHTINGS SPIKE IN SOUTH GRID',
        body: 'Blade Runner units responded to 23 reports of unauthorized replicant activity in Sector 11 this month, up from 7 last quarter. Detective Ingrid Thorn noted that "most reports are false alarms triggered by paranoid citizens." Machine Bunker access has been restricted pending investigation. Dr. Elara Kern stated the bunker\'s automated systems are "functioning within parameters" but declined to specify whose parameters.' },
      { title: 'NOODLE BAR BROTH RECIPE CONTROVERSY',
        body: 'The Noodle Bar in Sector 8 faces backlash after food critic Callum Birch published a column alleging the signature broth contains "recycled atmospheric condensate." Owner denies the claim. "It\'s rain water," they clarified. "Collected before it hits the ground. Perfectly safe." City Health Bureau has not responded to requests for testing.' },
    ],
    ads: [
      'BANCO OMBRA — Your FIAT is safe with us. (Terms apply. PABLO CORP reserves right to freeze accounts.)',
      'PABLO CORP TERMINAL — Stay connected. Stay compliant. Available at all authorized retail locations.',
      'SCRAP YARD — WE BUY ANYTHING. No questions. South Industrial. Open 24hrs.',
      'CITY CLINIC — Implant repair. Poison treatment. Bullet removal. Walk-ins welcome.',
      'PIXEL ARCADE — 4 classic games. 1 FIAT per play. Escape reality for less.',
    ],
    weather: 'ACID RAIN WARNING through Thursday. Visibility poor. Radiation index: MODERATE. Temperature: -4°C. Wind: NW 35km/h. Stay indoors if possible.',
    editorial: 'EDITORIAL — This newspaper exists because the truth still matters. PABLO CORP owns the power grid, the police, the banks, and the tower. They do not own the ink. Not yet. — THE MINX EDITORIAL BOARD',
  },
  {
    issue: 2, season: 'SPRING',
    headline: 'METRO WORKERS STRIKE — ALL 3 STATIONS CLOSED',
    subhead: 'Commuters stranded as union demands hazard pay for tunnel anomalies',
    articles: [
      { title: 'METRO STRIKE ENTERS SECOND WEEK',
        body: 'Metro West, Central, and East stations remain shuttered as tunnel workers refuse to return without hazard pay. Union representative cited "unexplained electromagnetic interference" in the deep tunnels that causes equipment failure and disorientation. PABLO CORP offered a 2% raise and a commemorative pin. The union declined.' },
      { title: 'BLACK MARKET PRICES SURGE ON SUPPLY SHORTAGE',
        body: 'With border delays and metro closures choking supply lines, Black Market commodity prices have spiked 40% across the board. Water trades at 890 FIAT per unit, up from 620 last month. Fuel prices doubled. Market vendor Finn Corvane warns hoarding will only make things worse.' },
      { title: 'MYSTERIOUS SIGNAL DETECTED IN POWER GRID',
        body: 'Electrician Oren Sharpe presented three years of data to the City Admin Bureau showing a repeating pattern in the power grid that matches no known engineering specification. The Bureau classified his findings and reassigned him to night shift maintenance in the South Industrial zone.' },
      { title: 'PIRATE RADIO RAIDED — EQUIPMENT SEIZED',
        body: 'PABLO CORP security units raided the Pirate Radio station in Sector 11, confiscating broadcast equipment worth an estimated 12,000 FIAT. The station was back on air within 48 hours using salvaged components from the Scrap Yard. "You cannot silence static," said an anonymous operator.' },
    ],
    ads: [
      'BUNKER-09 — Secure storage. Fortified walls. Ask no questions, hear no lies.',
      'GOLD EXCHANGE — Convert FIAT to GOLD. Hedge against inflation. Walk-in rates posted daily.',
      'CALL HOME — Long-range communication booths. 50 FIAT per minute. Signal not guaranteed.',
      'MOTOR DEPOT — Vehicles for sale or rent. Hover scooters now in stock.',
    ],
    weather: 'Intermittent acid drizzle. Radiation index: LOW. Temperature: 8°C. Pollen count: EXTREME (mutant ragweed). Wear masks outdoors.',
    editorial: 'EDITORIAL — They raided our colleagues at Pirate Radio. They seized three years of evidence from an honest electrician. They want silence. We want answers. — THE MINX EDITORIAL BOARD',
  },
  {
    issue: 3, season: 'SUMMER',
    headline: 'HEATWAVE KILLS 9 — WATER RATIONS IMPOSED',
    subhead: 'Shadow Tower AC runs 24/7 while city residents boil',
    articles: [
      { title: 'DEADLY HEAT EXPOSES INFRASTRUCTURE FAILURE',
        body: 'Nine residents died this week from heat exposure as temperatures exceeded 48°C for five consecutive days. City Clinic reported 200+ cases of heat stroke. Shadow Tower, the only building with functioning climate control, declined to open its doors to the public. A PABLO CORP memo leaked to THE MINX states: "Public access would compromise security protocols and void our insurance."' },
      { title: 'WATER RATIONS: 2 LITERS PER PERSON PER DAY',
        body: 'City Admin Bureau imposed strict water rationing effective immediately. Each registered citizen receives 2 liters per day from designated distribution points. Unregistered residents — estimated at 30% of the population — receive nothing. The Vending Machine network has been reprogrammed to dispense water at 500 FIAT per bottle.' },
      { title: 'DATA VAULT BREACH SUSPECTED',
        body: 'Data Vault security detected unauthorized access attempts on servers containing citizen biometric records. Vault administrator Juno Vale stated the intrusion was "sophisticated, patient, and originated from inside the city network." PABLO CORP offered to "assist" the investigation by assuming temporary control of the Vault\'s security systems. The offer was declined.' },
    ],
    ads: [
      'PAWN SHOP — Cash for your junk. No ID required. East District.',
      'PRINT SHOP & LIBRARY — Knowledge is the only weapon they cannot confiscate.',
      'SAFE HOUSE — Secure lodging. No PABLO CORP surveillance. References required.',
      'FOOD COURT — Hot meals. Cold drinks. Sector 7. We accept barter.',
    ],
    weather: 'EXTREME HEAT WARNING. Temperature: 48°C. UV index: DANGEROUS. Radiation index: HIGH. No acid rain expected. Hydrate or die.',
    editorial: 'EDITORIAL — Nine dead. The tower has air conditioning. Do the math. — THE MINX EDITORIAL BOARD',
  },
  {
    issue: 4, season: 'AUTUMN',
    headline: 'ELECTIONS CANCELLED — PABLO CORP CITES "SECURITY CONCERNS"',
    subhead: 'City Admin Bureau dissolved; all governance transferred to corporate authority',
    articles: [
      { title: 'PABLO CORP ASSUMES DIRECT CONTROL',
        body: 'In a pre-dawn announcement, PABLO CORP declared the upcoming municipal elections "suspended indefinitely" due to unspecified security threats. The City Admin Bureau has been dissolved. All administrative functions will be handled by PABLO CORP Corporate Governance Division. Bureau staff were given 24 hours to vacate. Former clerk Tally Marsh was seen carrying a box of personal items past the checkpoint at 6 AM.' },
      { title: 'PROTEST AT SHADOW TOWER DISPERSED',
        body: 'An estimated 400 residents gathered at the base of Shadow Tower to protest the election cancellation. PABLO CORP security deployed sound cannons at 14:00. By 14:07 the crowd had dispersed. Three protesters were detained. Their current status is unknown.' },
      { title: 'OUTPOST ALPHA GOES DARK',
        body: 'Communication with Outpost Alpha in the northern wasteland was lost Tuesday evening. The last transmission was a partial message: "They are not what they—" followed by static. A reconnaissance team dispatched from the North Gate has not reported back.' },
      { title: 'UNDERGROUND NEWSPAPER CIRCULATION DOUBLES',
        body: 'THE MINX has reached a circulation of 2,000 copies per issue, double our spring numbers. We thank our readers, our distributors, and especially the android vendors who risk confiscation daily. Your 100 FIAT keeps the press alive.' },
    ],
    ads: [
      'ASHFIELD HOSTEL — Beds available. South wasteland. Bring your own blanket.',
      'OXIDE LABS — Custom implants. Experimental procedures. Liability waiver required.',
      'THE PINNACLE — Rooftop bar. Best view in the city. Live music Fridays.',
      'TERMINUS SHELTER — Last stop before the deep waste. Supplies available.',
    ],
    weather: 'Overcast. Acid rain probability: 60%. Temperature: 2°C. First frost expected. Radiation index: MODERATE. Stock winter supplies.',
    editorial: 'EDITORIAL — They cancelled the election. They dissolved the bureau. They silenced the protest. But they have not cancelled this newspaper. Not yet. Not ever. — THE MINX EDITORIAL BOARD',
  },
];

export const NEWSPAPER_WORLD_SPOTS = [
  { x: 5700, y: 5580, id: 'np_bench1' },
  { x: 6200, y: 5960, id: 'np_bench2' },
  { x: 6680, y: 5580, id: 'np_road1' },
  { x: 7160, y: 6350, id: 'np_crate1' },
  { x: 5600, y: 6600, id: 'np_metro1' },
  { x: 6500, y: 6780, id: 'np_chkpt1' },
  { x: 7300, y: 5280, id: 'np_gate1' },
  { x: 6060, y: 6100, id: 'np_alley1' },
];

export interface Door { x: number; y: number; w: number; h: number; }
export const DOOR_W = 40;
export const mkDoorS = (bx: number, by: number, bw: number, bh: number): Door[] => [{ x: bx + (bw - DOOR_W) / 2, y: by + bh - 4, w: DOOR_W, h: 8 }];
export const mkDoorN = (bx: number, by: number, bw: number): Door[] => [{ x: bx + (bw - DOOR_W) / 2, y: by - 4, w: DOOR_W, h: 8 }];
export const mkDoorW = (bx: number, by: number, _bw: number, bh: number): Door[] => [{ x: bx - 4, y: by + (bh - DOOR_W) / 2, w: 8, h: DOOR_W }];
export const mkDoorE = (bx: number, by: number, bw: number, bh: number): Door[] => [{ x: bx + bw - 4, y: by + (bh - DOOR_W) / 2, w: 8, h: DOOR_W }];

export const BUILDINGS = [
  // ═══ BLOCK A — NORTH-WEST (Shadow District) — faces south onto y=5960 road ══
  { id: 'minx_arms',    x: 5690, y: 5840, w: 100, h: 100, label: 'MINX ARMS HOTEL',        bright: false, doors: mkDoorS(5690,5840,100,100) },
  { id: 'clinic',       x: 5800, y: 5850, w: 130, h: 90,  label: 'CITY CLINIC',      bright: false, doors: mkDoorS(5800,5850,130,90) },
  { id: 'nexus_hub',    x: 5690, y: 5755, w: 140, h: 70,  label: 'NEXUS HUB',        bright: true,  doors: mkDoorS(5690,5755,140,70) },
  // ═══ BLOCK B — NORTH CENTER (Tower Quarter) — faces south onto y=5960 road ═
  { id: 'pablo_tower',  x: 6240, y: 5780, w: 240, h: 150, label: 'SHADOW TOWER',     bright: true,  doors: mkDoorS(6240,5780,240,150) },
  { id: 'hotel',        x: 6490, y: 5830, w: 130, h: 110, label: 'HOTEL NEON',        bright: false, doors: mkDoorS(6490,5830,130,110), radio: true },
  // ═══ BLOCK C — NORTH-EAST (Iron Row) — faces south onto y=5960 road ════════
  { id: 'dojo',         x: 6670, y: 5820, w: 130, h: 110, label: 'IRON DOJO',         bright: false, doors: mkDoorS(6670,5820,130,110) },
  { id: 'data_vault',   x: 6810, y: 5820, w: 130, h: 100, label: 'DATA VAULT',        bright: true,  doors: mkDoorS(6810,5820,130,100) },
  { id: 'nightclub',    x: 6950, y: 5830, w: 130, h: 110, label: 'CLUB NEON',         bright: true,  doors: mkDoorS(6950,5830,130,110), radio: true },
  // ═══ BLOCK D — FAR NORTH-EAST (Military/Gate) — faces south onto y=5960 road
  { id: 'police_hq',    x: 7090, y: 5820, w: 150, h: 110, label: 'POLICE HQ',         bright: false, doors: mkDoorS(7090,5820,150,110) },
  { id: 'armory',       x: 7250, y: 5820, w: 130, h: 110, label: 'ARMORY',            bright: false, doors: mkDoorS(7250,5820,130,110) },
  { id: 'north_gate',   x: 7390, y: 5820, w: 100, h: 110, label: 'NORTH GATE',        bright: false, doors: [...mkDoorN(7390,5820,100), ...mkDoorS(7390,5820,100,110)] },
  { id: 'sub_north',    x: 7290, y: 5760, w: 90,  h: 55,  label: 'METRO NORTH',       bright: true,  doors: mkDoorS(7290,5760,90,55) },
  // ═══ BLOCK E — MID-WEST (Market Row) — faces south onto y=6100 road ════════
  { id: 'pablo_store',  x: 5690, y: 5990, w: 130, h: 80,  label: 'PABLO',             bright: true,  doors: mkDoorS(5690,5990,130,80) },
  { id: 'megabank',     x: 5830, y: 5990, w: 130, h: 80,  label: 'BANCO OMBRA',        bright: false, doors: mkDoorS(5830,5990,130,80) },
  { id: 'vend',         x: 5970, y: 6000, w: 70,  h: 65,  label: 'VENDING MACHINE',   bright: true,  doors: mkDoorS(5970,6000,70,65) },
  // ═══ BLOCK F — MID-CENTER (Commerce Hub) — south of y=5960, facing y=6100 ═
  { id: 'market',       x: 6240, y: 5990, w: 130, h: 80,  label: 'BLACK MARKET',      bright: false, doors: mkDoorS(6240,5990,130,80) },
  { id: 'food_court',   x: 6380, y: 5990, w: 140, h: 80,  label: 'FOOD COURT',        bright: true,  doors: mkDoorS(6380,5990,140,80) },
  { id: 'gold_exchange',x: 6530, y: 5990, w: 120, h: 80,  label: 'GOLD EXCHANGE',     bright: true,  doors: mkDoorS(6530,5990,120,80) },
  { id: 'crystal',      x: 6400, y: 6070, w: 28,  h: 28,  label: 'SAVE POINT',        bright: true,  doors: [] as Door[] },
  { id: 'public_office',x: 6250, y: 6120, w: 160, h: 80,  label: 'PUBLIC OFFICE',     bright: true,  doors: mkDoorN(6250,6120,160) },
  // ═══ BLOCK G — MID-EAST (Corporate Row) — south of y=5960, facing y=6100 ══
  { id: 'call_home',    x: 6870, y: 5990, w: 130, h: 80,  label: 'CALL HOME',         bright: true,  doors: mkDoorS(6870,5990,130,80) },
  { id: 'noodle_bar',   x: 7010, y: 5990, w: 130, h: 80,  label: 'NOODLE BAR',        bright: true,  doors: mkDoorS(7010,5990,130,80) },
  { id: 'admin_bureau', x: 7150, y: 5990, w: 130, h: 80,  label: 'MINX ADMIN BUILDING', bright: true,  doors: mkDoorS(7150,5990,130,80) },
  { id: 'plaza_market', x: 6870, y: 6120, w: 120, h: 80,  label: 'CENTRAL PLAZA',     bright: true,  doors: mkDoorN(6870,6120,120) },
  { id: 'eastside_flat',x: 7000, y: 6120, w: 130, h: 80,  label: 'EASTSIDE FLATS',    bright: false, doors: mkDoorN(7000,6120,130) },
  // ═══ BLOCK H — SOUTH-WEST (Industrial) — north of y=6310, facing y=6310 ═══
  { id: 'arcade',       x: 5700, y: 6145, w: 130, h: 85,  label: 'PIXEL ARCADE',      bright: true,  doors: mkDoorS(5700,6145,130,85), radio: true },
  { id: 'bunker',       x: 5840, y: 6145, w: 130, h: 90,  label: 'BUNKER-09',         bright: false, doors: mkDoorS(5840,6145,130,90), radio: true },
  { id: 'scrap',        x: 5970, y: 6145, w: 130, h: 80,  label: 'SCRAP YARD',        bright: false, doors: mkDoorS(5970,6145,130,80) },
  { id: 'machine_bunker',x: 5700, y: 6240, w: 100, h: 60, label: 'MACHINE BUNKER',    bright: false, doors: mkDoorN(5700,6240,100), radio: true },
  // ═══ BLOCK I — SOUTH-CENTER (Neon Strip) — north of y=6310 road ══════════
  { id: 'safe_house',   x: 6240, y: 6145, w: 110, h: 80,  label: 'SAFE HOUSE',        bright: true,  doors: mkDoorS(6240,6145,110,80), radio: true },
  { id: 'radio',        x: 6360, y: 6145, w: 120, h: 80,  label: 'PIRATE RADIO',      bright: false, doors: mkDoorS(6360,6145,120,80) },
  { id: 'oxide_labs',   x: 6490, y: 6145, w: 110, h: 80,  label: 'OXIDE LABS',        bright: false, doors: mkDoorS(6490,6145,110,80) },
  { id: 'crystal2',     x: 6390, y: 6238, w: 28,  h: 28,  label: 'SAVE POINT',        bright: true,  doors: [] as Door[] },
  // ═══ BLOCK J — SOUTH-EAST (Transit & Commerce) — north of y=6310 road ═════
  { id: 'realestate_office', x: 6870, y: 6145, w: 130, h: 80, label: 'REAL ESTATE OFFICE', bright: true, doors: mkDoorS(6870,6145,130,80) },
  { id: 'print_shop',   x: 7010, y: 6145, w: 120, h: 75,  label: 'PRINT SHOP & LIBRARY', bright: false, doors: mkDoorS(7010,6145,120,75) },
  { id: 'pawn_shop',    x: 7140, y: 6145, w: 120, h: 80,  label: 'PAWN SHOP',         bright: false, doors: mkDoorS(7140,6145,120,80) },
  { id: 'vehicle_dealer',x: 6870, y: 6338, w: 130, h: 80, label: 'MOTOR DEPOT',       bright: true,  doors: mkDoorN(6870,6338,130) },
  { id: 'terminal_shop',x: 7010, y: 6338, w: 130, h: 80,  label: 'PABLO CORP TERMINAL',    bright: true,  doors: mkDoorN(7010,6338,130) },
  // ═══ SOUTH ROW — Bunkers adjacent to y=6510 road ═════════════════════════
  { id: 'overlook',     x: 5700, y: 6345, w: 120, h: 80,  label: 'THE PINNACLE',      bright: true,  doors: mkDoorN(5700,6345,120), radio: true },
  { id: 'depot_south',  x: 5830, y: 6345, w: 120, h: 80,  label: 'TRANSIT DEPOT',     bright: false, doors: mkDoorN(5830,6345,120) },
  { id: 'east_bunker',  x: 5960, y: 6345, w: 130, h: 80,  label: 'EAST BUNKER',       bright: false, doors: mkDoorN(5960,6345,130) },
  { id: 'north_bunker', x: 6100, y: 6345, w: 130, h: 80,  label: 'NORTH BUNKER',      bright: false, doors: mkDoorS(6100,6345,130,80), radio: true },
  { id: 'crystal4',     x: 5870, y: 6540, w: 28,  h: 28,  label: 'SAVE POINT',        bright: true,  doors: [] as Door[] },
  // ═══ METRO STATIONS (along y=6710 road) ═══════════════════════════════════
  { id: 'sub_west',     x: 5700, y: 6675, w: 90,  h: 65,  label: 'METRO WEST',        bright: true,  doors: mkDoorS(5700,6675,90,65) },
  { id: 'sub_central',  x: 6285, y: 6675, w: 90,  h: 65,  label: 'METRO CENTRAL',     bright: true,  doors: mkDoorS(6285,6675,90,65) },
  { id: 'sub_east',     x: 7050, y: 6675, w: 90,  h: 65,  label: 'METRO EAST',        bright: true,  doors: mkDoorS(7050,6675,90,65) },
  // ═══ CHECKPOINTS (city border — wasteland entry, south of y=6710 road) ════
  { id: 'checkpoint_w', x: 5700, y: 6780, w: 100, h: 55,  label: 'WEST GATE',      bright: false, doors: [...mkDoorW(5700,6780,100,55), ...mkDoorE(5700,6780,100,55)] },
  { id: 'checkpoint_c', x: 6310, y: 6780, w: 100, h: 55,  label: 'SOUTH GATE',        bright: false, doors: [...mkDoorW(6310,6780,100,55), ...mkDoorE(6310,6780,100,55)] },
  { id: 'checkpoint_e', x: 7050, y: 6780, w: 100, h: 55,  label: 'EAST GATE',      bright: false, doors: [...mkDoorW(7050,6780,100,55), ...mkDoorE(7050,6780,100,55)] },
  { id: 'crystal5',     x: 7350, y: 6680, w: 28,  h: 28,  label: 'SAVE POINT',        bright: true,  doors: [] as Door[] },
  // ═══ WASTELAND OUTPOSTS ═══════════════════════════════════════════════════
  { id: 'outpost_alpha', x: 2000, y: 1500, w: 120, h: 80, label: 'OUTPOST ALPHA',     bright: true,  doors: mkDoorS(2000,1500,120,80), radio: true },
  { id: 'rust_porch',   x: 3000, y: 1200, w: 110, h: 75,  label: 'THE RUST PORCH',    bright: true,  doors: mkDoorE(3000,1200,110,75), radio: true },
  { id: 'eastern_gate', x: 12000, y: 1500, w: 100, h: 70, label: 'EASTERN GATE',      bright: false, doors: [...mkDoorW(12000,1500,100,70), ...mkDoorE(12000,1500,100,70)] },
  { id: 'outpost_beta', x: 7200, y: 8000, w: 100, h: 70,  label: 'OUTPOST BETA',      bright: true,  doors: mkDoorS(7200,8000,100,70), radio: true },
  { id: 'supply_cache', x: 3500, y: 9500, w: 130, h: 80,  label: 'SUPPLY CACHE',      bright: false, doors: mkDoorN(3500,9500,130) },
  { id: 'deep_bunker',  x: 10500, y: 9000, w: 120, h: 80, label: 'DEEP BUNKER',       bright: false, doors: mkDoorN(10500,9000,120), radio: true },
  { id: 'crystal3',     x: 5500, y: 10000, w: 28, h: 28,  label: 'SAVE POINT',        bright: true,  doors: [] as Door[] },
  { id: 'ashfield_hostel', x: 4000, y: 8200, w: 120, h: 80, label: 'ASHFIELD HOSTEL', bright: false, doors: mkDoorS(4000,8200,120,80), radio: true },
  { id: 'terminus',     x: 2500, y: 9000, w: 120, h: 80,  label: 'TERMINUS SHELTER',  bright: false, doors: mkDoorE(2500,9000,120,80), radio: true },
  { id: 'bastion_keep', x: 9500, y: 8500, w: 100, h: 100, label: 'BASTION KEEP',      bright: true,  doors: mkDoorW(9500,8500,100,100), radio: true },
  { id: 'waste_exchange',x: 4000, y: 8500, w: 130, h: 80, label: 'BLACK EXCHANGE',    bright: true,  doors: mkDoorN(4000,8500,130) },
  { id: 'deep_camp',    x: 11500, y: 8200, w: 120, h: 80, label: 'DEEP CAMP',         bright: false, doors: mkDoorS(11500,8200,120,80), radio: true },
  { id: 'ruins_alpha',  x: 12500, y: 9500, w: 130, h: 90, label: 'RUINS ALPHA',       bright: false, doors: [...mkDoorN(12500,9500,130), ...mkDoorS(12500,9500,130,90)] },
  { id: 'crystal6',     x: 12000, y: 10000, w: 28, h: 28, label: 'SAVE POINT',        bright: true,  doors: [] as Door[] },
  { id: 'southern_hub', x: 7200, y: 11000, w: 130, h: 90, label: 'SOUTHERN HUB',      bright: true,  doors: mkDoorN(7200,11000,130), radio: true },
  { id: 'crystal7',     x: 7500, y: 11200, w: 28, h: 28,  label: 'SAVE POINT',        bright: true,  doors: [] as Door[] },
  // ═══ PUBLIC TERMINALS (street kiosks along roads) ═════════════════════════
  { id: 'term_west',      x: 5700, y: 5970, w: 18, h: 24, label: 'TERMINAL',          bright: true,  doors: [] as Door[] },
  { id: 'term_central',   x: 6310, y: 5970, w: 18, h: 24, label: 'TERMINAL',          bright: true,  doors: [] as Door[] },
  { id: 'term_east',      x: 6650, y: 5970, w: 18, h: 24, label: 'TERMINAL',          bright: true,  doors: [] as Door[] },
  { id: 'term_neon',      x: 6310, y: 6320, w: 18, h: 24, label: 'TERMINAL',          bright: true,  doors: [] as Door[] },
  { id: 'term_north',     x: 7010, y: 5970, w: 18, h: 24, label: 'TERMINAL',          bright: true,  doors: [] as Door[] },
  { id: 'term_outpost_a', x: 2030, y: 1530, w: 18, h: 24, label: 'TERMINAL',          bright: true,  doors: [] as Door[] },
  { id: 'term_outpost_b', x: 7230, y: 8030, w: 18, h: 24, label: 'TERMINAL',          bright: true,  doors: [] as Door[] },
  { id: 'van_west',       x: 2200, y: 2000, w: 40, h: 28, label: 'TERMINAL VAN',      bright: true,  doors: [] as Door[] },
  { id: 'van_central',    x: 5500, y: 8500, w: 40, h: 28, label: 'TERMINAL VAN',      bright: true,  doors: [] as Door[] },
  { id: 'van_east',       x: 11000, y: 2000, w: 40, h: 28, label: 'TERMINAL VAN',     bright: true,  doors: [] as Door[] },
  { id: 'picassoo_hq',    x: 7345, y: 6225, w: 130, h: 85,  label: 'PICASSOO.AI HQ',   bright: true,  doors: mkDoorS(7345,6225,130,85) },
];

export const RADIO_BUILDINGS = new Set(BUILDINGS.filter(b => 'radio' in b && b.radio).map(b => b.id));

export const INTERIOR_NPCS: Record<string, { name: string; role: string; x: number; y: number; dialogue: string[] }[]> = {
  gold_exchange: [
    { name: 'AGENT KIRA', role: 'TELLER', x: 55, y: 38, dialogue: ['Gold rates shift hourly. Buy low, sell never.', 'PABLO CORP controls the reserve. We just move it.', 'The vault below holds more gold than the surface deserves.'] },
    { name: 'MR. SATO', role: 'MANAGER', x: 250, y: 45, dialogue: ['Every transaction is logged. Every. Single. One.', 'The board wants 15% margins this quarter. Impossible, but I\'ll deliver.', 'You look like someone who understands value.'] },
  ],
  admin_bureau: [
    { name: 'CLERK VOSS', role: 'REGISTRAR', x: 40, y: 78, dialogue: ['Form 77-B. In triplicate. Next.', 'Your papers are... adequate. Barely.', 'Citizenship renewal costs have doubled. Directive from above.'] },
    { name: 'DIRECTOR LANE', role: 'DIRECTOR', x: 300, y: 40, dialogue: ['This bureau runs the city. Not the gangs. Not PABLO CORP. Us.', 'I\'ve filed more permits than you\'ve had meals.', 'The archives hold secrets that would topple empires.'] },
  ],
  police_hq: [
    { name: 'SGT. NAKAMURA', role: 'OFFICER', x: 40, y: 75, dialogue: ['Crime in Sector 7 is up 40%. Budget is down 60%.', 'We don\'t patrol the wasteland. That\'s a death sentence.', 'The gangs own the streets. We own the paperwork.'] },
    { name: 'CHIEF MORA', role: 'CHIEF', x: 310, y: 45, dialogue: ['Justice is a luxury in Minx City. We trade in order.', 'PABLO CORP funds half our operations. Draw your own conclusions.', 'Every officer here chose this life. Most regret it.'] },
  ],
  megabank: [
    { name: 'MS. CHEN', role: 'TELLER', x: 45, y: 38, dialogue: ['Account balance inquiries are free. Everything else costs.', 'Iron Trust has survived three city wars. We\'ll survive the fourth.', 'Wire transfers require Level 3 clearance. Do you have it?'] },
    { name: 'VP STERLING', role: 'EXECUTIVE', x: 270, y: 90, dialogue: ['Money is the only language this city speaks fluently.', 'Our vault is deeper than the subway. Literally.', 'I\'ve seen fortunes made and lost in a single trade cycle.'] },
  ],
  nexus_hub: [
    { name: 'TECH RAMOS', role: 'ENGINEER', x: 45, y: 70, dialogue: ['The network backbone runs through here. One cut and the city goes dark.', 'Signal interference from the wasteland is getting worse.', 'I patched the firewall yesterday. Someone punched through it today.'] },
  ],
  realestate_office: [
    { name: 'BROKER HAYES', role: 'AGENT', x: 45, y: 50, dialogue: ['Property values in Sector 7 are volatile. Good for flippers.', 'Every building has a history. Most of them are bloody.', 'The best investments are the ones nobody else wants.'] },
  ],
};

export const AMBIENT_RADIO_SPOTS = [
  { x: 6400, y: 6200 },
  { x: 7200, y: 6500 },
  { x: 5800, y: 6000 },
  { x: 8000, y: 6300 },
  { x: 6600, y: 6800 },
];

export const REAL_ESTATE_LISTINGS = [
  { id: 'lot_wasteland_north', name: 'Wasteland Lot — North Perimeter', desc: 'Open terrain near the northern border. No utilities. Suitable for outpost.', price: 5, zone: 'WASTELAND', income: 2000, sqft: 800 },
  { id: 'lot_wasteland_south', name: 'Wasteland Lot — Southern Ridge', desc: 'Elevated position. Natural defense advantage. Remote.', price: 5, zone: 'WASTELAND', income: 2000, sqft: 650 },
  { id: 'studio_sector_3', name: 'Studio — Sector 3', desc: 'Single room. Shared bathroom. Close to Iron Dojo.', price: 10, zone: CITY_NAME, income: 5000, sqft: 350 },
  { id: 'studio_sector_7', name: 'Studio — Sector 7', desc: 'Ground floor. Street-facing window. Near market.', price: 10, zone: CITY_NAME, income: 5000, sqft: 400 },
  { id: 'office_tower_12', name: 'Corporate Office — Floor 12', desc: 'Shadow Tower sublease. Premium address. Climate control included.', price: 25, zone: 'SHADOW TOWER', income: 15000, sqft: 1200 },
  { id: 'office_tower_8', name: 'Corporate Office — Floor 8', desc: 'Mid-level Shadow Tower space. Meeting room access.', price: 25, zone: 'SHADOW TOWER', income: 15000, sqft: 950 },
  { id: 'penthouse_pinnacle', name: 'Penthouse — The Pinnacle', desc: 'Top floor. Panoramic views. High security.', price: 50, zone: CITY_NAME, income: 30000, sqft: 2500 },
  { id: 'warehouse_east', name: 'Warehouse — East Industrial', desc: 'Large floorplan. Loading dock. Former shipping facility.', price: 15, zone: 'INDUSTRIAL', income: 8000, sqft: 3000 },
];
