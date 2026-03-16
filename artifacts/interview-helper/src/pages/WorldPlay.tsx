import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { useLocation } from 'wouter';
const ArcadeGame = lazy(() => import('./ArcadeGames'));
import {
  sfxAttack, sfxHit, sfxKill, sfxLevelUp, sfxMilestone, sfxStep, sfxEnter, sfxTalk,
  sfxSave, sfxPoison, sfxDeath, sfxHeal, sfxCoin, sfxError,
  sfxZoneCross, initMusic, playMusic, pauseMusic, toggleMute, toggleMuteMusic, toggleMuteAll, getMusicMuted, getMuted, resumeAudioContext,
  fadeOutAmbient, fadeInAmbient,
  isWithinEarshot, sfxSpatialStep, sfxDoor, sfxVehicle, sfxMachinery,
  sfxWeaponDraw, sfxItemPickup, sfxUIClick, sfxWeatherRain, sfxWeatherWind,
  startCrowdMurmur, updateCrowdMurmurVolume, stopCrowdMurmur,
  type ConversationEvent, type ConversationLine,
  POLICE_STOP_DIALOGS, CORPO_MILITARY_STOP_DIALOGS,
  createConversationEvent, tickConversationEvent,
} from '../soundEngine';
import { RadioPlayer, RadioHud, useRadio } from '../RadioPlayer';
import { PabloOnboarding } from '../components/PabloOnboarding';
import type { OnboardingAnswers } from '../components/PabloOnboarding';
import { PABLO_PRODUCTS } from '../lib/product-names';
import { usePlan } from '../hooks/use-plan';
import {
  type WorldCalendar, type WeatherParticle, type DialogueTree, type DialogueNode,
  type TemperatureLevel,
  initCalendar, tickCalendar, getCalendarString, getDayNightAlpha,
  getTemperatureLevel,
  RADIATION_ZONES, getRadiationLevel,
  FIAT_PER_GOLD, fiatToGold, getTransactionTax,
  TREASURE_CHESTS, TREASURE_MAPS,
  LORE_WEAPON_NAMES, CLOTHES,
  RUMORS, STORY_DIALOGUES,
  boomerize, TIMEZONE_CITIES, SUBSCRIPTION_PRICING,
  createWeatherParticles, updateWeatherParticles,
} from '../gameSystems';

// ── Constants ─────────────────────────────────────────────────────────────────
const W = 14400, H = 12600, TILE = 32, SPD = 0.7, PSIZE = 6, RANGE = 55;
const NPC_SPEED_MULT = 0.2;
const BORDER = 100;
const CITY_TOP = 5100;
const CITY_BOTTOM = 7500;
const CITY_LEFT = 5400;
const CITY_RIGHT = 9000;
const CITY_THREAT_SCAN_Y = CITY_BOTTOM + 200;
const inCityBounds = (px: number, py: number) => px >= CITY_LEFT && px <= CITY_RIGHT && py >= CITY_TOP && py <= CITY_BOTTOM;

// ── 2.5D depth constant for building perspective ─────────────────────────────
const BUILDING_DEPTH = 18;

// ── Billboard locations ─────────────────────────────────────────────────────
interface BillboardDef {
  locationId: string; label: string; x: number; y: number; w: number; h: number; height: number;
}
const MANHOLES = [
  { x: 5560, y: 5180 }, { x: 6680, y: 5180 }, { x: 7850, y: 5180 },
  { x: 5560, y: 5580 }, { x: 6680, y: 5580 }, { x: 7160, y: 5580 },
  { x: 6060, y: 5960 }, { x: 7160, y: 5960 },
  { x: 5560, y: 6350 }, { x: 6680, y: 6350 },
  { x: 6060, y: 6600 }, { x: 7850, y: 6600 },
  { x: 5560, y: 6780 }, { x: 7160, y: 6780 },
];
const MANHOLE_RANGE = 30;

const BILLBOARDS: BillboardDef[] = [
  { locationId: 'bb_west_main',   label: 'WEST MAIN ST',      x: 5700, y: 5580, w: 20, h: 10, height: 55 },
  { locationId: 'bb_west_market', label: 'MARKET DISTRICT',   x: 6200, y: 5580, w: 20, h: 10, height: 50 },
  { locationId: 'bb_west_south',  label: 'SOUTH WALL',        x: 5600, y: 6780, w: 20, h: 10, height: 45 },
  { locationId: 'bb_east_plaza',  label: 'EAST PLAZA',        x: 7200, y: 5580, w: 20, h: 10, height: 55 },
  { locationId: 'bb_east_neon',   label: 'NEON STRIP',        x: 6680, y: 5960, w: 20, h: 10, height: 60 },
  { locationId: 'bb_east_gate',   label: 'NORTH GATE',        x: 7600, y: 5300, w: 20, h: 10, height: 50 },
  { locationId: 'bb_border_west', label: 'BORDER CROSSING W', x: 5600, y: 6850, w: 20, h: 10, height: 40 },
  { locationId: 'bb_border_east', label: 'BORDER CROSSING E', x: 7750, y: 6850, w: 20, h: 10, height: 40 },
];
interface BillboardData {
  id: number; locationId: string; ownerPlayerName: string | null;
  adText: string | null; adImageUrl: string | null;
  priceFlorin: number; rentedUntil: string | null; label: string;
  expired: boolean;
}

// ── Commodity Trading (Star Citizen–style economy) ────────────────────────────
interface Commodity {
  id: string; name: string;
  cityBuy: number; citySell: number;
  wasteBuy: number; wasteSell: number;
  vol: number; illegal: boolean; unit: string; desc: string;
}
const COMMODITIES: Commodity[] = [
  { id:'stims',    name:'STIMS',             cityBuy:2400,  citySell:1200,  wasteBuy:8500,  wasteSell:5500,  vol:.15, illegal:false, unit:'vial',  desc:'Combat stimulants. PABLO taxes them. Rare in the Wasteland.' },
  { id:'rations',  name:'FOOD RATIONS',      cityBuy:1500,  citySell:800,   wasteBuy:500,   wasteSell:3200,  vol:.08, illegal:false, unit:'crate', desc:'Surplus in city kitchens. Out there they kill for a crate.' },
  { id:'scrap',    name:'SCRAP METAL',       cityBuy:900,   citySell:400,   wasteBuy:300,   wasteSell:1800,  vol:.06, illegal:false, unit:'load',  desc:'City junk. Wasteland currency. Haul it south.' },
  { id:'power',    name:'POWER CELLS',       cityBuy:3000,  citySell:1800,  wasteBuy:6200,  wasteSell:5000,  vol:.10, illegal:false, unit:'cell',  desc:'City grid keeps them cheap. The wastes run dark without them.' },
  { id:'weapons',  name:'WEAPON PARTS',      cityBuy:5200,  citySell:2500,  wasteBuy:2500,  wasteSell:8500,  vol:.12, illegal:true,  unit:'kit',   desc:'PABLO Decree #12: civilian arms restricted. Raiders do not care.' },
  { id:'data',     name:'DATA CHIPS',        cityBuy:8000,  citySell:4500,  wasteBuy:3000,  wasteSell:15000, vol:.20, illegal:true,  unit:'chip',  desc:'Stolen PABLO Corp. data. Wiped and resold. Most valuable contraband.' },
  { id:'implants', name:'ILLICIT IMPLANTS',  cityBuy:12000, citySell:6000,  wasteBuy:5000,  wasteSell:18000, vol:.18, illegal:true,  unit:'unit',  desc:'Banned by PABLO Decree #47. Voss Biotech still ships them south.' },
  { id:'intel',    name:'INTEL DOSSIERS',    cityBuy:10000, citySell:7000,  wasteBuy:4000,  wasteSell:22000, vol:.25, illegal:true,  unit:'file',  desc:'Every faction wants what every other faction knows. The courier wins.' },
];
type CargoPrices = { cityBuy:number; citySell:number; wasteBuy:number; wasteSell:number };
function initCommodityPrices(): Record<string,CargoPrices> {
  const r: Record<string,CargoPrices> = {};
  for (const c of COMMODITIES) r[c.id] = { cityBuy:c.cityBuy, citySell:c.citySell, wasteBuy:c.wasteBuy, wasteSell:c.wasteSell };
  return r;
}
const MAX_CARGO = 5;

interface Door { x: number; y: number; w: number; h: number; }
const DOOR_W = 40;
const mkDoorS = (bx: number, by: number, bw: number, bh: number): Door[] => [{ x: bx + (bw - DOOR_W) / 2, y: by + bh - 4, w: DOOR_W, h: 8 }];
const mkDoorN = (bx: number, by: number, bw: number): Door[] => [{ x: bx + (bw - DOOR_W) / 2, y: by - 4, w: DOOR_W, h: 8 }];
const mkDoorW = (bx: number, by: number, _bw: number, bh: number): Door[] => [{ x: bx - 4, y: by + (bh - DOOR_W) / 2, w: 8, h: DOOR_W }];
const mkDoorE = (bx: number, by: number, bw: number, bh: number): Door[] => [{ x: bx + bw - 4, y: by + (bh - DOOR_W) / 2, w: 8, h: DOOR_W }];

const BUILDINGS = [
  // ═══ BLOCK A — NORTH-WEST (Shadow District) ═══════════════════════════════
  { id: 'minx_arms',    x: 5620, y: 5280, w: 130, h: 120, label: 'MINX ARMS',        bright: false, doors: mkDoorS(5620,5280,130,120) },
  { id: 'clinic',       x: 5780, y: 5280, w: 120, h: 80,  label: 'CITY CLINIC',      bright: false, doors: mkDoorS(5780,5280,120,80) },
  { id: 'nexus_hub',    x: 5620, y: 5440, w: 140, h: 90,  label: 'NEXUS HUB',        bright: true,  doors: mkDoorS(5620,5440,140,90) },
  // ═══ BLOCK B — NORTH CENTER (Tower Quarter) ════════════════════════════════
  { id: 'pablo_tower',  x: 6100, y: 5200, w: 260, h: 220, label: 'SHADOW TOWER',     bright: true,  doors: mkDoorS(6100,5200,260,220) },
  { id: 'hotel',        x: 6400, y: 5280, w: 120, h: 130, label: 'HOTEL NEON',        bright: false, doors: mkDoorS(6400,5280,120,130), radio: true },
  // ═══ BLOCK C — NORTH-EAST (Iron Row) ═══════════════════════════════════════
  { id: 'dojo',         x: 6720, y: 5280, w: 130, h: 100, label: 'IRON DOJO',         bright: false, doors: mkDoorS(6720,5280,130,100) },
  { id: 'data_vault',   x: 6880, y: 5280, w: 130, h: 90,  label: 'DATA VAULT',        bright: true,  doors: mkDoorS(6880,5280,130,90) },
  { id: 'nightclub',    x: 6720, y: 5420, w: 130, h: 100, label: 'CLUB NEON',         bright: true,  doors: mkDoorS(6720,5420,130,100), radio: true },
  // ═══ BLOCK D — FAR NORTH-EAST (Military/Gate) ═════════════════════════════
  { id: 'police_hq',    x: 7200, y: 5280, w: 150, h: 100, label: 'POLICE HQ',         bright: false, doors: mkDoorS(7200,5280,150,100) },
  { id: 'armory',       x: 7380, y: 5280, w: 130, h: 90,  label: 'ARMORY',            bright: false, doors: mkDoorS(7380,5280,130,90) },
  { id: 'north_gate',   x: 7550, y: 5280, w: 100, h: 70,  label: 'NORTH GATE',        bright: false, doors: [...mkDoorN(7550,5280,100), ...mkDoorS(7550,5280,100,70)] },
  { id: 'sub_north',    x: 7700, y: 5280, w: 90,  h: 65,  label: 'METRO NORTH',       bright: true,  doors: mkDoorS(7700,5280,90,65) },
  // ═══ BLOCK E — MID-WEST (Market Row) ══════════════════════════════════════
  { id: 'pablo_store',  x: 5620, y: 5700, w: 140, h: 80,  label: 'PABLO',             bright: true,  doors: mkDoorS(5620,5700,140,80) },
  { id: 'megabank',     x: 5790, y: 5700, w: 140, h: 90,  label: 'BANCO OMBRA',        bright: false, doors: mkDoorS(5790,5700,140,90) },
  { id: 'vend',         x: 5960, y: 5700, w: 70,  h: 70,  label: 'VENDING MACHINE',   bright: true,  doors: mkDoorS(5960,5700,70,70) },
  // ═══ BLOCK F — MID-CENTER (Commerce Hub) ══════════════════════════════════
  { id: 'market',       x: 6200, y: 5700, w: 130, h: 80,  label: 'BLACK MARKET',      bright: false, doors: mkDoorS(6200,5700,130,80) },
  { id: 'food_court',   x: 6360, y: 5700, w: 140, h: 90,  label: 'FOOD COURT',        bright: true,  doors: mkDoorS(6360,5700,140,90) },
  { id: 'gold_exchange',x: 6530, y: 5700, w: 120, h: 80,  label: 'GOLD EXCHANGE',     bright: true,  doors: mkDoorS(6530,5700,120,80) },
  { id: 'crystal',      x: 6680, y: 5750, w: 28,  h: 28,  label: 'SAVE POINT',        bright: true,  doors: [] as Door[] },
  // ═══ BLOCK G — MID-EAST (Corporate Row) ═══════════════════════════════════
  { id: 'call_home',    x: 6900, y: 5700, w: 130, h: 80,  label: 'CALL HOME',         bright: true,  doors: mkDoorS(6900,5700,130,80) },
  { id: 'noodle_bar',   x: 7060, y: 5700, w: 120, h: 80,  label: 'NOODLE BAR',        bright: true,  doors: mkDoorS(7060,5700,120,80) },
  { id: 'admin_bureau', x: 7210, y: 5700, w: 130, h: 90,  label: 'CITY ADMIN BUREAU', bright: true,  doors: mkDoorS(7210,5700,130,90) },
  { id: 'plaza_market', x: 7370, y: 5700, w: 120, h: 80,  label: 'CENTRAL PLAZA',     bright: true,  doors: mkDoorS(7370,5700,120,80) },
  { id: 'eastside_flat',x: 7520, y: 5700, w: 130, h: 120, label: 'EASTSIDE FLATS',    bright: false, doors: mkDoorS(7520,5700,130,120) },
  // ═══ BLOCK H — SOUTH-WEST (Industrial) ════════════════════════════════════
  { id: 'arcade',       x: 5620, y: 6100, w: 130, h: 85,  label: 'PIXEL ARCADE',      bright: true,  doors: mkDoorE(5620,6100,130,85), radio: true },
  { id: 'bunker',       x: 5780, y: 6100, w: 130, h: 90,  label: 'BUNKER-09',         bright: false, doors: mkDoorE(5780,6100,130,90), radio: true },
  { id: 'scrap',        x: 5940, y: 6100, w: 150, h: 80,  label: 'SCRAP YARD',        bright: false, doors: mkDoorN(5940,6100,150) },
  { id: 'machine_bunker',x: 5620, y: 6230, w: 100, h: 60, label: 'MACHINE BUNKER',    bright: false, doors: mkDoorN(5620,6230,100), radio: true },
  // ═══ BLOCK I — SOUTH-CENTER (Neon Strip) ══════════════════════════════════
  { id: 'safe_house',   x: 6200, y: 6100, w: 110, h: 75,  label: 'SAFE HOUSE',        bright: true,  doors: mkDoorN(6200,6100,110), radio: true },
  { id: 'radio',        x: 6340, y: 6100, w: 120, h: 100, label: 'PIRATE RADIO',      bright: false, doors: mkDoorW(6340,6100,120,100) },
  { id: 'oxide_labs',   x: 6490, y: 6100, w: 110, h: 80,  label: 'OXIDE LABS',        bright: false, doors: mkDoorW(6490,6100,110,80) },
  { id: 'crystal2',     x: 6630, y: 6130, w: 28,  h: 28,  label: 'SAVE POINT',        bright: true,  doors: [] as Door[] },
  // ═══ BLOCK J — SOUTH-EAST (Transit & Commerce) ════════════════════════════
  { id: 'realestate_office', x: 6900, y: 6100, w: 130, h: 80, label: 'REAL ESTATE OFFICE', bright: true, doors: mkDoorS(6900,6100,130,80) },
  { id: 'print_shop',   x: 7060, y: 6100, w: 120, h: 70,  label: 'PRINT SHOP & LIBRARY', bright: false, doors: mkDoorN(7060,6100,120) },
  { id: 'pawn_shop',    x: 7210, y: 6100, w: 120, h: 80,  label: 'PAWN SHOP',         bright: false, doors: mkDoorW(7210,6100,120,80) },
  { id: 'vehicle_dealer',x: 7360, y: 6100, w: 130, h: 80, label: 'MOTOR DEPOT',       bright: true,  doors: mkDoorS(7360,6100,130,80) },
  { id: 'terminal_shop',x: 7520, y: 6100, w: 130, h: 80,  label: 'PABLO TERMINAL',    bright: true,  doors: mkDoorS(7520,6100,130,80) },
  // ═══ SOUTH ROW — Bunkers, depots, metro ═══════════════════════════════════
  { id: 'overlook',     x: 5620, y: 6450, w: 120, h: 85,  label: 'THE PINNACLE',      bright: true,  doors: mkDoorN(5620,6450,120), radio: true },
  { id: 'depot_south',  x: 5770, y: 6450, w: 120, h: 85,  label: 'TRANSIT DEPOT',     bright: false, doors: mkDoorN(5770,6450,120) },
  { id: 'east_bunker',  x: 5920, y: 6450, w: 130, h: 85,  label: 'EAST BUNKER',       bright: false, doors: mkDoorN(5920,6450,130) },
  { id: 'north_bunker', x: 6080, y: 6450, w: 130, h: 85,  label: 'NORTH BUNKER',      bright: false, doors: mkDoorS(6080,6450,130,85), radio: true },
  { id: 'crystal4',     x: 6240, y: 6480, w: 28,  h: 28,  label: 'SAVE POINT',        bright: true,  doors: [] as Door[] },
  // ═══ METRO STATIONS (along south road) ════════════════════════════════════
  { id: 'sub_west',     x: 5700, y: 6650, w: 90,  h: 65,  label: 'METRO WEST',        bright: true,  doors: mkDoorS(5700,6650,90,65) },
  { id: 'sub_central',  x: 6500, y: 6650, w: 90,  h: 65,  label: 'METRO CENTRAL',     bright: true,  doors: mkDoorS(6500,6650,90,65) },
  { id: 'sub_east',     x: 7300, y: 6650, w: 90,  h: 65,  label: 'METRO EAST',        bright: true,  doors: mkDoorS(7300,6650,90,65) },
  // ═══ CHECKPOINTS (city border — wasteland entry) ══════════════════════════
  { id: 'checkpoint_w', x: 5500, y: 6850, w: 100, h: 55,  label: 'CHECKPOINT W',      bright: false, doors: [...mkDoorW(5500,6850,100,55), ...mkDoorE(5500,6850,100,55)] },
  { id: 'checkpoint_c', x: 6700, y: 6850, w: 100, h: 55,  label: 'CHECKPOINT',        bright: false, doors: [...mkDoorW(6700,6850,100,55), ...mkDoorE(6700,6850,100,55)] },
  { id: 'checkpoint_e', x: 7700, y: 6850, w: 100, h: 55,  label: 'CHECKPOINT E',      bright: false, doors: [...mkDoorW(7700,6850,100,55), ...mkDoorE(7700,6850,100,55)] },
  { id: 'crystal5',     x: 7850, y: 6700, w: 28,  h: 28,  label: 'SAVE POINT',        bright: true,  doors: [] as Door[] },
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
  { id: 'term_west',      x: 5650, y: 5630, w: 18, h: 24, label: 'TERMINAL',          bright: true,  doors: [] as Door[] },
  { id: 'term_central',   x: 6450, y: 5630, w: 18, h: 24, label: 'TERMINAL',          bright: true,  doors: [] as Door[] },
  { id: 'term_east',      x: 7100, y: 5630, w: 18, h: 24, label: 'TERMINAL',          bright: true,  doors: [] as Door[] },
  { id: 'term_neon',      x: 6200, y: 6030, w: 18, h: 24, label: 'TERMINAL',          bright: true,  doors: [] as Door[] },
  { id: 'term_north',     x: 7500, y: 5630, w: 18, h: 24, label: 'TERMINAL',          bright: true,  doors: [] as Door[] },
  { id: 'term_outpost_a', x: 2030, y: 1530, w: 18, h: 24, label: 'TERMINAL',          bright: true,  doors: [] as Door[] },
  { id: 'term_outpost_b', x: 7230, y: 8030, w: 18, h: 24, label: 'TERMINAL',          bright: true,  doors: [] as Door[] },
  { id: 'van_west',       x: 2200, y: 2000, w: 40, h: 28, label: 'TERMINAL VAN',      bright: true,  doors: [] as Door[] },
  { id: 'van_central',    x: 5500, y: 8500, w: 40, h: 28, label: 'TERMINAL VAN',      bright: true,  doors: [] as Door[] },
  { id: 'van_east',       x: 11000, y: 2000, w: 40, h: 28, label: 'TERMINAL VAN',     bright: true,  doors: [] as Door[] },
];

const RADIO_BUILDINGS = new Set(BUILDINGS.filter(b => 'radio' in b && b.radio).map(b => b.id));

const INTERIOR_NPCS: Record<string, { name: string; role: string; x: number; y: number; dialogue: string[] }[]> = {
  gold_exchange: [
    { name: 'AGENT KIRA', role: 'TELLER', x: 55, y: 38, dialogue: ['Gold rates shift hourly. Buy low, sell never.', 'PABLO Corp. controls the reserve. We just move it.', 'The vault below holds more gold than the surface deserves.'] },
    { name: 'MR. SATO', role: 'MANAGER', x: 250, y: 45, dialogue: ['Every transaction is logged. Every. Single. One.', 'The board wants 15% margins this quarter. Impossible, but I\'ll deliver.', 'You look like someone who understands value.'] },
  ],
  admin_bureau: [
    { name: 'CLERK VOSS', role: 'REGISTRAR', x: 40, y: 78, dialogue: ['Form 77-B. In triplicate. Next.', 'Your papers are... adequate. Barely.', 'Citizenship renewal costs have doubled. Directive from above.'] },
    { name: 'DIRECTOR LANE', role: 'DIRECTOR', x: 300, y: 40, dialogue: ['This bureau runs the city. Not the gangs. Not PABLO. Us.', 'I\'ve filed more permits than you\'ve had meals.', 'The archives hold secrets that would topple empires.'] },
  ],
  police_hq: [
    { name: 'SGT. NAKAMURA', role: 'OFFICER', x: 40, y: 75, dialogue: ['Crime in Sector 7 is up 40%. Budget is down 60%.', 'We don\'t patrol the wasteland. That\'s a death sentence.', 'The gangs own the streets. We own the paperwork.'] },
    { name: 'CHIEF MORA', role: 'CHIEF', x: 310, y: 45, dialogue: ['Justice is a luxury in Minx City. We trade in order.', 'PABLO Corp. funds half our operations. Draw your own conclusions.', 'Every officer here chose this life. Most regret it.'] },
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

// ── Interior System ──────────────────────────────────────────────────────────
interface InteriorObject {
  x: number; y: number; w: number; h: number;
  type: 'bed' | 'desk' | 'chair' | 'nightstand' | 'window' | 'medical_bed' | 'reception' | 'equipment' | 'shelf' | 'counter' | 'table' | 'crate' | 'locker' | 'terminal' | 'plant' | 'couch' | 'vending_machine' | 'filing_cabinet' | 'water_cooler' | 'whiteboard' | 'photocopier' | 'bookshelf' | 'tv_screen' | 'security_gate' | 'flag' | 'portrait' | 'arcade_machine' | 'newspaper';
  gameId?: string;
  label?: string;
  color?: string;
}

interface InventoryItem {
  id: string;
  name: string;
  desc: string;
  icon: string;
  stackable: boolean;
  qty: number;
  value: number;
}

const INVENTORY_GRID_COLS = 6;
const INVENTORY_GRID_ROWS = 4;
const INVENTORY_MAX_SLOTS = INVENTORY_GRID_COLS * INVENTORY_GRID_ROWS;

interface NewspaperIssue {
  issue: number;
  season: string;
  headline: string;
  subhead: string;
  articles: { title: string; body: string }[];
  ads: string[];
  weather: string;
  editorial: string;
}

const THE_MINX_ISSUES: NewspaperIssue[] = [
  {
    issue: 1, season: 'WINTER',
    headline: 'SHADOW TOWER POWER SURGE BLACKS OUT 4 SECTORS',
    subhead: 'PABLO Corp. denies involvement as grid failures spread to south industrial zone',
    articles: [
      { title: 'TOWER SURGE LEAVES THOUSANDS IN DARK',
        body: 'A massive electromagnetic pulse originating from the upper floors of Shadow Tower disrupted power across Sectors 1, 6, 10, and 11 late Tuesday evening. PABLO Corp. spokesperson UNIT-7 issued a statement attributing the outage to "routine atmospheric calibration." Residents report flickering lights and data corruption lasting six hours. City Clinic treated 14 cases of implant malfunction. Infrastructure Manager Dorian Krall called the official explanation "physically impossible" before being escorted from the press briefing by two PABLO security units.' },
      { title: 'IRON DOJO ANNOUNCES OPEN ENROLLMENT',
        body: 'The Iron Dojo in Sector 3 will accept new students for the first time in two years. Head instructor has waived the usual 500 FIAT registration fee through end of season. "The city needs fighters," the instructor said. "Not corporate ones. Real ones." PABLO Corp. has filed a zoning complaint against the dojo, citing "unauthorized combat instruction within municipal limits."' },
      { title: 'CHECKPOINT DELAYS QUADRUPLE AS BORDER TIGHTENS',
        body: 'Wait times at Checkpoints W, C, and E have increased to four hours on average. Sgt. Callow Briggs confirmed that new scanning equipment donated by PABLO Corp. requires all travelers to submit to biometric registration. Wasteland traders report losing perishable cargo. Three merchants have been detained for carrying "unregistered organic material" — identified by witnesses as vegetables.' },
      { title: 'REPLICANT SIGHTINGS SPIKE IN SOUTH GRID',
        body: 'Blade Runner units responded to 23 reports of unauthorized replicant activity in Sector 11 this month, up from 7 last quarter. Detective Ingrid Thorn noted that "most reports are false alarms triggered by paranoid citizens." Machine Bunker access has been restricted pending investigation. Dr. Elara Kern stated the bunker\'s automated systems are "functioning within parameters" but declined to specify whose parameters.' },
      { title: 'NOODLE BAR BROTH RECIPE CONTROVERSY',
        body: 'The Noodle Bar in Sector 8 faces backlash after food critic Callum Birch published a column alleging the signature broth contains "recycled atmospheric condensate." Owner denies the claim. "It\'s rain water," they clarified. "Collected before it hits the ground. Perfectly safe." City Health Bureau has not responded to requests for testing.' },
    ],
    ads: [
      'BANCO OMBRA — Your FIAT is safe with us. (Terms apply. PABLO Corp. reserves right to freeze accounts.)',
      'PABLO TERMINAL — Stay connected. Stay compliant. Available at all authorized retail locations.',
      'SCRAP YARD — WE BUY ANYTHING. No questions. South Industrial. Open 24hrs.',
      'CITY CLINIC — Implant repair. Poison treatment. Bullet removal. Walk-ins welcome.',
      'PIXEL ARCADE — 4 classic games. 1 FIAT per play. Escape reality for less.',
    ],
    weather: 'ACID RAIN WARNING through Thursday. Visibility poor. Radiation index: MODERATE. Temperature: -4°C. Wind: NW 35km/h. Stay indoors if possible.',
    editorial: 'EDITORIAL — This newspaper exists because the truth still matters. PABLO Corp. owns the power grid, the police, the banks, and the tower. They do not own the ink. Not yet. — THE MINX EDITORIAL BOARD',
  },
  {
    issue: 2, season: 'SPRING',
    headline: 'METRO WORKERS STRIKE — ALL 3 STATIONS CLOSED',
    subhead: 'Commuters stranded as union demands hazard pay for tunnel anomalies',
    articles: [
      { title: 'METRO STRIKE ENTERS SECOND WEEK',
        body: 'Metro West, Central, and East stations remain shuttered as tunnel workers refuse to return without hazard pay. Union representative cited "unexplained electromagnetic interference" in the deep tunnels that causes equipment failure and disorientation. PABLO Corp. offered a 2% raise and a commemorative pin. The union declined.' },
      { title: 'BLACK MARKET PRICES SURGE ON SUPPLY SHORTAGE',
        body: 'With border delays and metro closures choking supply lines, Black Market commodity prices have spiked 40% across the board. Water trades at 890 FIAT per unit, up from 620 last month. Fuel prices doubled. Market vendor Finn Corvane warns hoarding will only make things worse.' },
      { title: 'MYSTERIOUS SIGNAL DETECTED IN POWER GRID',
        body: 'Electrician Oren Sharpe presented three years of data to the City Admin Bureau showing a repeating pattern in the power grid that matches no known engineering specification. The Bureau classified his findings and reassigned him to night shift maintenance in the South Industrial zone.' },
      { title: 'PIRATE RADIO RAIDED — EQUIPMENT SEIZED',
        body: 'PABLO Corp. security units raided the Pirate Radio station in Sector 11, confiscating broadcast equipment worth an estimated 12,000 FIAT. The station was back on air within 48 hours using salvaged components from the Scrap Yard. "You cannot silence static," said an anonymous operator.' },
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
        body: 'Nine residents died this week from heat exposure as temperatures exceeded 48°C for five consecutive days. City Clinic reported 200+ cases of heat stroke. Shadow Tower, the only building with functioning climate control, declined to open its doors to the public. A PABLO Corp. memo leaked to THE MINX states: "Public access would compromise security protocols and void our insurance."' },
      { title: 'WATER RATIONS: 2 LITERS PER PERSON PER DAY',
        body: 'City Admin Bureau imposed strict water rationing effective immediately. Each registered citizen receives 2 liters per day from designated distribution points. Unregistered residents — estimated at 30% of the population — receive nothing. The Vending Machine network has been reprogrammed to dispense water at 500 FIAT per bottle.' },
      { title: 'DATA VAULT BREACH SUSPECTED',
        body: 'Data Vault security detected unauthorized access attempts on servers containing citizen biometric records. Vault administrator Juno Vale stated the intrusion was "sophisticated, patient, and originated from inside the city network." PABLO Corp. offered to "assist" the investigation by assuming temporary control of the Vault\'s security systems. The offer was declined.' },
    ],
    ads: [
      'PAWN SHOP — Cash for your junk. No ID required. East District.',
      'PRINT SHOP & LIBRARY — Knowledge is the only weapon they cannot confiscate.',
      'SAFE HOUSE — Secure lodging. No PABLO surveillance. References required.',
      'FOOD COURT — Hot meals. Cold drinks. Sector 7. We accept barter.',
    ],
    weather: 'EXTREME HEAT WARNING. Temperature: 48°C. UV index: DANGEROUS. Radiation index: HIGH. No acid rain expected. Hydrate or die.',
    editorial: 'EDITORIAL — Nine dead. The tower has air conditioning. Do the math. — THE MINX EDITORIAL BOARD',
  },
  {
    issue: 4, season: 'AUTUMN',
    headline: 'ELECTIONS CANCELLED — PABLO CORP. CITES "SECURITY CONCERNS"',
    subhead: 'City Admin Bureau dissolved; all governance transferred to corporate authority',
    articles: [
      { title: 'PABLO CORP. ASSUMES DIRECT CONTROL',
        body: 'In a pre-dawn announcement, PABLO Corp. declared the upcoming municipal elections "suspended indefinitely" due to unspecified security threats. The City Admin Bureau has been dissolved. All administrative functions will be handled by PABLO Corporate Governance Division. Bureau staff were given 24 hours to vacate. Former clerk Tally Marsh was seen carrying a box of personal items past the checkpoint at 6 AM.' },
      { title: 'PROTEST AT SHADOW TOWER DISPERSED',
        body: 'An estimated 400 residents gathered at the base of Shadow Tower to protest the election cancellation. PABLO security deployed sound cannons at 14:00. By 14:07 the crowd had dispersed. Three protesters were detained. Their current status is unknown.' },
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

const NEWSPAPER_WORLD_SPOTS = [
  { x: 5700, y: 5580, id: 'np_bench1' },
  { x: 6200, y: 5960, id: 'np_bench2' },
  { x: 6680, y: 5580, id: 'np_road1' },
  { x: 7160, y: 6350, id: 'np_crate1' },
  { x: 5600, y: 6600, id: 'np_metro1' },
  { x: 6500, y: 6780, id: 'np_chkpt1' },
  { x: 7300, y: 5280, id: 'np_gate1' },
  { x: 6060, y: 6100, id: 'np_alley1' },
];
interface InteriorDef {
  id: string;
  width: number; height: number;
  wallColor: string; floorColor: string; accentColor: string;
  exitX: number; exitY: number; exitW: number; exitH: number;
  objects: InteriorObject[];
  label: string;
  ambientText?: string;
}

const INTERIOR_DEFS: Record<string, InteriorDef> = {
  minx_arms: {
    id: 'minx_arms', label: 'MINX ARMS — FLOOR 4 — UNIT 408',
    width: 280, height: 220,
    wallColor: 'rgba(20,30,20,.95)', floorColor: 'rgba(8,14,8,.9)', accentColor: 'rgba(0,255,65,.3)',
    exitX: 130, exitY: 205, exitW: 30, exitH: 15,
    ambientText: 'Fluorescent light buzzes. The curtains don\'t fully close.',
    objects: [
      { x: 20, y: 30, w: 60, h: 35, type: 'bed', label: 'YOUR BED', color: 'rgba(60,80,60,.6)' },
      { x: 90, y: 30, w: 25, h: 20, type: 'nightstand', label: 'NIGHTSTAND', color: 'rgba(50,60,40,.5)' },
      { x: 220, y: 25, w: 45, h: 50, type: 'window', label: 'WINDOW', color: 'rgba(0,40,60,.4)' },
      { x: 20, y: 100, w: 40, h: 30, type: 'desk', label: 'DESK', color: 'rgba(40,50,35,.5)' },
      { x: 20, y: 140, w: 25, h: 25, type: 'chair', color: 'rgba(40,45,35,.4)' },
      { x: 200, y: 150, w: 50, h: 35, type: 'terminal', label: 'PABLO DEVICE', color: 'rgba(0,80,30,.4)' },
      { x: 130, y: 30, w: 30, h: 20, type: 'shelf', label: 'SHELF', color: 'rgba(45,55,40,.4)' },
    ],
  },
  clinic: {
    id: 'clinic', label: 'CITY CLINIC — EMERGENCY WARD',
    width: 320, height: 240,
    wallColor: 'rgba(20,25,30,.95)', floorColor: 'rgba(10,14,18,.9)', accentColor: 'rgba(100,200,255,.3)',
    exitX: 145, exitY: 225, exitW: 30, exitH: 15,
    ambientText: 'Monitors beep steadily. The antiseptic smell is overwhelming.',
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
    width: 260, height: 200,
    wallColor: 'rgba(20,22,30,.95)', floorColor: 'rgba(8,10,16,.9)', accentColor: 'rgba(0,200,255,.2)',
    exitX: 115, exitY: 185, exitW: 30, exitH: 15,
    ambientText: 'Terminal screens glow. The air conditioning is too cold.',
    objects: [
      { x: 20, y: 30, w: 50, h: 30, type: 'desk', label: 'DESK 1', color: 'rgba(50,55,70,.5)' },
      { x: 20, y: 80, w: 50, h: 30, type: 'desk', label: 'DESK 2', color: 'rgba(50,55,70,.5)' },
      { x: 190, y: 30, w: 45, h: 40, type: 'terminal', label: 'MAIN TERMINAL', color: 'rgba(0,60,80,.4)' },
      { x: 190, y: 90, w: 45, h: 30, type: 'locker', label: 'FILE CABINET', color: 'rgba(50,55,65,.5)' },
      { x: 120, y: 30, w: 40, h: 20, type: 'table', label: 'MEETING TABLE', color: 'rgba(45,50,60,.4)' },
      { x: 120, y: 140, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
    ],
  },
  admin_bureau: {
    id: 'admin_bureau', label: 'CITY ADMIN BUREAU — REGISTRATION HALL',
    width: 380, height: 280,
    wallColor: 'rgba(18,20,28,.95)', floorColor: 'rgba(6,8,14,.9)', accentColor: 'rgba(255,200,60,.25)',
    exitX: 175, exitY: 265, exitW: 30, exitH: 15,
    ambientText: 'Bureaucrats shuffle papers. The queue never ends.',
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
    id: 'realestate_office', label: 'MINX CITY REAL ESTATE — LISTINGS FLOOR',
    width: 340, height: 260,
    wallColor: 'rgba(22,18,28,.95)', floorColor: 'rgba(10,8,16,.9)', accentColor: 'rgba(200,100,255,.25)',
    exitX: 155, exitY: 245, exitW: 30, exitH: 15,
    ambientText: 'Property maps cover every surface. A broker adjusts her collar.',
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
  megabank: {
    id: 'megabank', label: 'BANCO OMBRA — MAIN FLOOR',
    width: 340, height: 260,
    wallColor: 'rgba(16,18,24,.95)', floorColor: 'rgba(6,8,12,.9)', accentColor: 'rgba(180,200,255,.2)',
    exitX: 155, exitY: 245, exitW: 30, exitH: 15,
    ambientText: 'Marble floors. Armed guards. The kind of quiet only money buys.',
    objects: [
      { x: 20, y: 25, w: 75, h: 28, type: 'reception', label: 'TELLER ROW', color: 'rgba(60,65,80,.5)' },
      { x: 20, y: 70, w: 55, h: 25, type: 'desk', label: 'ACCOUNTS DESK', color: 'rgba(50,55,70,.5)' },
      { x: 20, y: 110, w: 55, h: 25, type: 'desk', label: 'LOANS DESK', color: 'rgba(50,55,70,.5)' },
      { x: 260, y: 25, w: 55, h: 40, type: 'terminal', label: 'ATM', color: 'rgba(0,50,100,.4)' },
      { x: 260, y: 80, w: 55, h: 40, type: 'locker', label: 'SAFE DEPOSIT', color: 'rgba(60,60,70,.5)' },
      { x: 260, y: 135, w: 55, h: 30, type: 'security_gate', label: 'VAULT GATE', color: 'rgba(80,80,90,.4)' },
      { x: 140, y: 25, w: 60, h: 25, type: 'couch', label: 'VIP LOUNGE', color: 'rgba(50,45,60,.4)' },
      { x: 140, y: 65, w: 50, h: 20, type: 'table', label: 'DOCUMENTS TABLE', color: 'rgba(45,50,60,.4)' },
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
    objects: [
      { x: 20, y: 25, w: 60, h: 25, type: 'counter', label: 'BAR', color: 'rgba(100,20,80,.5)' },
      { x: 20, y: 65, w: 40, h: 30, type: 'couch', label: 'VIP BOOTH', color: 'rgba(80,10,60,.4)' },
      { x: 20, y: 110, w: 40, h: 30, type: 'couch', label: 'BOOTH 2', color: 'rgba(80,10,60,.4)' },
      { x: 240, y: 25, w: 55, h: 35, type: 'terminal', label: 'DJ BOOTH', color: 'rgba(80,0,100,.4)' },
      { x: 240, y: 75, w: 55, h: 30, type: 'tv_screen', label: 'HOLO DISPLAY', color: 'rgba(100,0,120,.4)' },
      { x: 140, y: 25, w: 50, h: 20, type: 'table', label: 'DANCE FLOOR', color: 'rgba(60,0,80,.3)' },
      { x: 240, y: 160, w: 30, h: 25, type: 'vending_machine', label: 'DRINK DISPENSER', color: 'rgba(80,20,60,.4)' },
    ],
  },
  armory: {
    id: 'armory', label: 'ARMORY — WEAPONS DEPOT',
    width: 320, height: 240,
    wallColor: 'rgba(20,18,15,.95)', floorColor: 'rgba(10,8,6,.9)', accentColor: 'rgba(255,80,40,.25)',
    exitX: 145, exitY: 225, exitW: 30, exitH: 15,
    ambientText: 'Gun oil and cordite. Every surface is reinforced steel.',
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
    objects: [
      { x: 20, y: 25, w: 70, h: 25, type: 'reception', label: 'FRONT DESK', color: 'rgba(70,55,40,.5)' },
      { x: 20, y: 65, w: 55, h: 30, type: 'couch', label: 'LOBBY SEATING', color: 'rgba(60,45,30,.4)' },
      { x: 20, y: 110, w: 55, h: 30, type: 'couch', label: 'READING NOOK', color: 'rgba(60,45,30,.4)' },
      { x: 240, y: 25, w: 55, h: 35, type: 'terminal', label: 'CHECK-IN KIOSK', color: 'rgba(0,70,50,.4)' },
      { x: 240, y: 75, w: 55, h: 30, type: 'locker', label: 'LUGGAGE HOLD', color: 'rgba(50,40,35,.5)' },
      { x: 140, y: 25, w: 50, h: 20, type: 'table', label: 'CONCIERGE TABLE', color: 'rgba(55,45,35,.4)' },
      { x: 240, y: 160, w: 45, h: 35, type: 'vending_machine', label: 'SNACK MACHINE', color: 'rgba(40,60,50,.4)' },
      { x: 20, y: 180, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
      { x: 140, y: 180, w: 25, h: 25, type: 'plant', color: 'rgba(30,70,30,.3)' },
      { x: 240, y: 120, w: 28, h: 25, type: 'water_cooler', label: 'WATER', color: 'rgba(40,60,80,.3)' },
    ],
  },
  machine_bunker: {
    id: 'machine_bunker', label: 'MACHINE BUNKER — SUB-LEVEL 1',
    width: 300, height: 240,
    wallColor: 'rgba(12,14,20,.95)', floorColor: 'rgba(4,6,10,.9)', accentColor: 'rgba(80,120,255,.25)',
    exitX: 135, exitY: 225, exitW: 30, exitH: 15,
    ambientText: 'Hydraulic hiss. Blue diode strips along the floor. The air smells of coolant and ozone.',
    objects: [
      { x: 20, y: 25, w: 60, h: 35, type: 'equipment', label: 'RECHARGE BAY', color: 'rgba(40,60,120,.5)' },
      { x: 20, y: 80, w: 60, h: 35, type: 'equipment', label: 'DIAGNOSTIC RIG', color: 'rgba(40,60,120,.5)' },
      { x: 20, y: 135, w: 60, h: 30, type: 'medical_bed', label: 'REPAIR SLAB', color: 'rgba(50,70,110,.5)' },
      { x: 220, y: 25, w: 55, h: 40, type: 'terminal', label: 'CORE TERMINAL', color: 'rgba(0,50,120,.5)' },
      { x: 220, y: 80, w: 55, h: 35, type: 'locker', label: 'PARTS LOCKER', color: 'rgba(40,50,70,.5)' },
      { x: 220, y: 135, w: 55, h: 30, type: 'crate', label: 'COOLANT SUPPLY', color: 'rgba(30,50,80,.4)' },
      { x: 120, y: 25, w: 50, h: 25, type: 'table', label: 'WORK BENCH', color: 'rgba(35,45,60,.4)' },
      { x: 120, y: 170, w: 40, h: 25, type: 'crate', label: 'SALVAGE BIN', color: 'rgba(30,40,55,.4)' },
    ],
  },
};

const BUILDING_INTERIOR_MAP: Record<string, string> = {
  minx_arms: 'minx_arms',
  clinic: 'clinic',
  pablo_store: '_shop',
  noodle_bar: '_shop',
  pawn_shop: '_shop',
  market: '_shop',
  food_court: '_shop',
  print_shop: '_office',
  call_home: '_office',
  terminal_shop: '_office',
  data_vault: '_office',
  oxide_labs: '_office',
  admin_bureau: 'admin_bureau',
  police_hq: 'police_hq',
  realestate_office: 'realestate_office',
  nexus_hub: 'nexus_hub',
  gold_exchange: 'gold_exchange',
  megabank: 'megabank',
  dojo: 'dojo',
  nightclub: 'nightclub',
  armory: 'armory',
  hotel: 'hotel',
  arcade: 'arcade',
  bunker: '_office',
  east_bunker: '_office',
  north_bunker: '_office',
  pablo_tower: '_office',
  safe_house: '_office',
  vehicle_dealer: '_shop',
  plaza_market: '_shop',
  machine_bunker: 'machine_bunker',
};

const HAS_INTERIOR = (bid: string) => bid in BUILDING_INTERIOR_MAP;

const getInterior = (bid: string): InteriorDef | null => {
  const key = BUILDING_INTERIOR_MAP[bid];
  if (!key) return null;
  const base = INTERIOR_DEFS[key];
  if (!base) return null;
  const bld = BUILDINGS.find(b => b.id === bid);
  if (key.startsWith('_') && bld) {
    return { ...base, id: bid, label: bld.label };
  }
  return base;
};

const INTERIOR_TILE = 16;

// ── City Sectors (12 named sectors for the city hierarchy) ──────────────────
interface CitySector { id: string; name: string; x: number; y: number; w: number; h: number; }
const CITY_SECTORS: CitySector[] = [
  { id: 's1',  name: 'SECTOR 1 · SHADOW DISTRICT',    x: 5400, y: 5100, w: 500,  h: 380 },
  { id: 's2',  name: 'SECTOR 2 · TOWER QUARTER',       x: 5900, y: 5100, w: 600,  h: 380 },
  { id: 's3',  name: 'SECTOR 3 · IRON DOJO ROW',       x: 6500, y: 5100, w: 500,  h: 380 },
  { id: 's4',  name: 'SECTOR 4 · ARMORY HEIGHTS',      x: 7000, y: 5100, w: 500,  h: 380 },
  { id: 's5',  name: 'SECTOR 5 · NORTH GATE',          x: 7500, y: 5100, w: 500,  h: 380 },
  { id: 's6',  name: 'SECTOR 6 · WEST MARKET',         x: 5400, y: 5480, w: 650,  h: 400 },
  { id: 's7',  name: 'SECTOR 7 · NEON STRIP',          x: 6050, y: 5480, w: 650,  h: 400 },
  { id: 's8',  name: 'SECTOR 8 · CORPORATE ROW',       x: 6700, y: 5480, w: 650,  h: 400 },
  { id: 's9',  name: 'SECTOR 9 · EAST EDGE',           x: 7350, y: 5480, w: 650,  h: 400 },
  { id: 's10', name: 'SECTOR 10 · INDUSTRIAL SOUTH',   x: 5400, y: 5880, w: 850,  h: 560 },
  { id: 's11', name: 'SECTOR 11 · SOUTH GRID',         x: 6250, y: 5880, w: 850,  h: 560 },
  { id: 's12', name: 'SECTOR 12 · TRANSIT CORRIDOR',   x: 7100, y: 5880, w: 900,  h: 560 },
];
const WASTELAND_SETTLEMENTS = [
  { name: 'OUTPOST ALPHA', x: 2060, y: 1540 },
  { name: 'THE RUST PORCH', x: 3055, y: 1237 },
  { name: 'EASTERN GATE', x: 12050, y: 1535 },
  { name: 'OUTPOST BETA', x: 7250, y: 8035 },
  { name: 'SUPPLY CACHE', x: 3565, y: 9540 },
  { name: 'DEEP BUNKER', x: 10560, y: 9040 },
  { name: 'ASHFIELD HOSTEL', x: 4060, y: 8240 },
  { name: 'TERMINUS SHELTER', x: 2560, y: 9040 },
  { name: 'BASTION KEEP', x: 9550, y: 8550 },
  { name: 'BLACK EXCHANGE', x: 4065, y: 8540 },
  { name: 'DEEP CAMP', x: 11560, y: 8240 },
  { name: 'RUINS ALPHA', x: 12565, y: 9545 },
  { name: 'SOUTHERN HUB', x: 7265, y: 11045 },
];
function getNearestSettlement(px: number, py: number): string {
  let nearest = 'MINX CITY';
  let minDist = Math.hypot(px - 7200, py - 6300);
  for (const s of WASTELAND_SETTLEMENTS) {
    const d = Math.hypot(px - s.x, py - s.y);
    if (d < minDist) { minDist = d; nearest = s.name; }
  }
  return nearest;
}
function getCurrentSector(px: number, py: number): string {
  if (!inCityBounds(px, py)) {
    const nearest = getNearestSettlement(px, py);
    return `WASTELAND · near ${nearest}`;
  }
  for (const s of CITY_SECTORS) {
    if (px >= s.x && px < s.x + s.w && py >= s.y && py < s.y + s.h) return `MINX CITY LIMITS · ${s.name}`;
  }
  return 'MINX CITY LIMITS · OUTSKIRTS';
}

// ── Parked vehicle locations (stealable) ─────────────────────────────────────
interface ParkedVehicle { x: number; y: number; type: string; stolen: boolean; }

interface TrafficVehicle {
  x: number; y: number; dx: number; dy: number;
  type: 'car' | 'truck' | 'van';
  color: string; speed: number;
  routeIdx: number; wpIdx: number;
}
const TRAFFIC_ROUTES: { x: number; y: number }[][] = [
  [{ x: 5500, y: 5400 }, { x: 8800, y: 5400 }, { x: 8800, y: 5450 }, { x: 5500, y: 5450 }],
  [{ x: 5500, y: 5850 }, { x: 8800, y: 5850 }, { x: 8800, y: 5900 }, { x: 5500, y: 5900 }],
  [{ x: 5500, y: 6300 }, { x: 8800, y: 6300 }, { x: 8800, y: 6350 }, { x: 5500, y: 6350 }],
  [{ x: 5500, y: 6750 }, { x: 8800, y: 6750 }, { x: 8800, y: 6800 }, { x: 5500, y: 6800 }],
  [{ x: 5700, y: 5200 }, { x: 5700, y: 7400 }, { x: 5750, y: 7400 }, { x: 5750, y: 5200 }],
  [{ x: 6700, y: 5200 }, { x: 6700, y: 7400 }, { x: 6750, y: 7400 }, { x: 6750, y: 5200 }],
  [{ x: 7700, y: 5200 }, { x: 7700, y: 7400 }, { x: 7750, y: 7400 }, { x: 7750, y: 5200 }],
  [{ x: 8700, y: 5200 }, { x: 8700, y: 7400 }, { x: 8750, y: 7400 }, { x: 8750, y: 5200 }],
];
const TRAFFIC_COLORS = ['#445566', '#554433', '#334455', '#665544', '#443355', '#335544', '#553344', '#444455'];
function initTrafficVehicles(): TrafficVehicle[] {
  const vehicles: TrafficVehicle[] = [];
  for (let i = 0; i < TRAFFIC_ROUTES.length; i++) {
    const route = TRAFFIC_ROUTES[i];
    const startWp = Math.floor(Math.random() * route.length);
    const wp = route[startWp];
    const types: ('car' | 'truck' | 'van')[] = ['car', 'car', 'car', 'truck', 'van'];
    vehicles.push({
      x: wp.x + Math.random() * 100 - 50,
      y: wp.y + Math.random() * 50 - 25,
      dx: 0, dy: 0,
      type: types[Math.floor(Math.random() * types.length)],
      color: TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)],
      speed: 0.8 + Math.random() * 0.6,
      routeIdx: i,
      wpIdx: startWp,
    });
  }
  for (let i = 0; i < 6; i++) {
    const ri = Math.floor(Math.random() * TRAFFIC_ROUTES.length);
    const route = TRAFFIC_ROUTES[ri];
    const startWp = Math.floor(Math.random() * route.length);
    const wp = route[startWp];
    const types: ('car' | 'truck' | 'van')[] = ['car', 'car', 'truck', 'van'];
    vehicles.push({
      x: wp.x + Math.random() * 200 - 100,
      y: wp.y + Math.random() * 100 - 50,
      dx: 0, dy: 0,
      type: types[Math.floor(Math.random() * types.length)],
      color: TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)],
      speed: 0.6 + Math.random() * 0.8,
      routeIdx: ri,
      wpIdx: startWp,
    });
  }
  return vehicles;
}
const PARKED_VEHICLES_INIT: ParkedVehicle[] = [
  { x: 5600, y: 5580, type: 'cargo_bike', stolen: false },
  { x: 6680, y: 5580, type: 'cargo_bike', stolen: false },
  { x: 7160, y: 5580, type: 'hover_scooter', stolen: false },
  { x: 7850, y: 5580, type: 'cargo_bike', stolen: false },
  { x: 5600, y: 5960, type: 'hover_scooter', stolen: false },
  { x: 6680, y: 6350, type: 'cargo_bike', stolen: false },
  { x: 7160, y: 6350, type: 'armored_moped', stolen: false },
  { x: 6060, y: 6600, type: 'cargo_bike', stolen: false },
  { x: 8450, y: 6430, type: 'motorcycle', stolen: false },
];
const STEAL_RANGE = 35;
const STEAL_CHANCE = 0.65;

// ── Road bounds for on-road speed detection ──────────────────────────────────
const ROAD_HALF_W = 45;
const CITY_ROADS_H = [5400, 5850, 6300, 6750, 7200];
const CITY_ROADS_V = [5700, 6200, 6700, 7200, 7700, 8200, 8700];
const CITY_ALLEYS_H = [5625, 6075, 6525, 6975];
const CITY_ALLEYS_V = [5950, 6450, 6950, 7450, 7950, 8450];
const ALLEY_HALF_W = 18;
function isOnRoad(px: number, py: number): boolean {
  if (!inCityBounds(px, py)) return false;
  for (const ry of CITY_ROADS_H) { if (Math.abs(py - ry) < ROAD_HALF_W) return true; }
  for (const rx of CITY_ROADS_V) { if (Math.abs(px - rx) < ROAD_HALF_W) return true; }
  for (const ry of CITY_ALLEYS_H) { if (Math.abs(py - ry) < ALLEY_HALF_W) return true; }
  for (const rx of CITY_ALLEYS_V) { if (Math.abs(px - rx) < ALLEY_HALF_W) return true; }
  return false;
}

// ── NPC idle behavior types ──────────────────────────────────────────────────
type NpcIdleBehavior = 'WALKING' | 'SITTING' | 'STANDING' | 'BROWSING' | 'EATING' | 'TALKING';

// ── Gang territories (wasteland — north + south of city) ─────────────────────
const GANG_ZONES_BASE = [
  { id: 'rust_syndicate',    name: 'RUST SYNDICATE',    x: 200,  y: 200,  w: 4800, h:4800, color: 'rgba(255,60,60,.06)',  border: 'rgba(255,60,60,.22)',  threat: 'rgba(255,60,60,.7)',  label: '[ RUST SYNDICATE TERRITORY ]' },
  { id: 'void_runners',    name: 'VOID RUNNERS',    x: 5000, y: 200,  w: 4800, h:4800, color: 'rgba(255,140,0,.06)', border: 'rgba(255,140,0,.22)',  threat: 'rgba(255,140,0,.7)',  label: '[ VOID RUNNERS TERRITORY ]' },
  { id: 'static_monks', name: 'STATIC MONKS', x: 200,  y: 7600, w: 7000, h:4800, color: 'rgba(200,255,0,.05)', border: 'rgba(200,255,0,.18)',  threat: 'rgba(200,255,0,.65)', label: '[ STATIC MONKS TERRITORY ]' },
  { id: 'eastern_bloc', name: 'EASTERN BLOC', x: 7200, y: 7600, w: 7000, h:4800, color: 'rgba(60,100,255,.05)',border: 'rgba(60,100,255,.20)', threat: 'rgba(60,100,255,.65)',label: '[ EASTERN BLOC TERRITORY ]' },
  { id: 'minx_city',    name: 'MINX CITY',    x: 200,  y: 200,  w: 14000, h:12200, color: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)',  threat: 'rgba(180,0,255,.55)', label: '[ MINX CITY LIMITS ]' },
];
let GANG_ZONES = GANG_ZONES_BASE.map(gz => ({ ...gz }));
const GANG_FACTION_ALLIES: Record<string, string[]> = {
  outlaw:     ['rust_syndicate', 'static_monks'],
  replicant:  ['void_runners', 'eastern_bloc'],
  corporate:  ['minx_city'],
};
const GANG_FACTION_ENEMIES: Record<string, string[]> = {
  outlaw:     ['minx_city', 'void_runners'],
  replicant:  ['minx_city', 'rust_syndicate'],
  corporate:  ['rust_syndicate', 'void_runners', 'static_monks', 'eastern_bloc'],
};
const TERRITORY_SHIFT_INTERVAL = 1800;
let lastTerritoryShift = 0;
let territoryEpoch = 0;
const TERRITORY_FRAGMENTS: typeof GANG_ZONES_BASE = [];

function shiftTerritories(frame: number) {
  if (frame - lastTerritoryShift < TERRITORY_SHIFT_INTERVAL) return;
  lastTerritoryShift = frame;
  territoryEpoch++;

  const drifted = GANG_ZONES_BASE.map(gz => {
    if (gz.id === 'minx_city') return { ...gz };
    const drift = 60;
    const phase = territoryEpoch * 0.15;
    const sx = Math.sin(phase + gz.x * 0.01) * drift;
    const sy = Math.cos(phase * 1.3 + gz.y * 0.01) * drift;
    const sw = Math.sin(phase * 0.7 + gz.w * 0.005) * drift * 0.5;
    const sh = Math.cos(phase * 0.85 + gz.h * 0.005) * drift * 0.5;
    return { ...gz, x: gz.x + sx, y: gz.y + sy, w: gz.w + sw, h: gz.h + sh };
  });

  if (territoryEpoch % 5 === 0) {
    TERRITORY_FRAGMENTS.length = 0;
    for (const gz of drifted) {
      if (gz.id === 'minx_city') continue;
      const shouldFracture = Math.sin(territoryEpoch * 0.3 + gz.x * 0.002) > 0.2;
      if (shouldFracture && gz.w > 600 && gz.h > 600) {
        const splitDir = Math.random() > 0.5 ? 'h' : 'v';
        const ratio = 0.35 + Math.random() * 0.3;
        if (splitDir === 'h') {
          const splitW = gz.w * ratio;
          TERRITORY_FRAGMENTS.push({
            ...gz,
            id: gz.id + '_frag',
            name: gz.name + ' OUTPOST',
            label: `[ ${gz.name} OUTPOST ]`,
            x: gz.x + gz.w + 40 + Math.sin(territoryEpoch * 0.2) * 80,
            y: gz.y + Math.cos(territoryEpoch * 0.15) * 60,
            w: splitW,
            h: gz.h * 0.6,
          });
        } else {
          const splitH = gz.h * ratio;
          TERRITORY_FRAGMENTS.push({
            ...gz,
            id: gz.id + '_frag',
            name: gz.name + ' OUTPOST',
            label: `[ ${gz.name} OUTPOST ]`,
            x: gz.x + Math.sin(territoryEpoch * 0.18) * 60,
            y: gz.y + gz.h + 40 + Math.cos(territoryEpoch * 0.22) * 80,
            w: gz.w * 0.6,
            h: splitH,
          });
        }
      }
    }
  }

  GANG_ZONES = [...drifted, ...TERRITORY_FRAGMENTS];
}

interface EmployeeNpcDef { name: string; role: string; x: number; y: number; businessName: string; buildingId: string; }

const EMPLOYEE_DIALOGUE: Record<string, string[]> = {
  default: [
    'Clocked in. Running diagnostics on the mainframe.',
    'Another shift in the city. At least the pay is steady.',
    'Boss around? I was just... calibrating the terminals.',
    'This company runs tighter than a sealed bunker. I like it.',
    'Need anything? I keep things moving around here.',
  ],
  manager: [
    'Reports are filed. Efficiency is up 12% this quarter.',
    'I have three meetings scheduled. All classified.',
    'The team is performing well. No incidents to report.',
  ],
  engineer: [
    'Patched the security grid this morning. Should hold.',
    'The server rack needs new cooling units. I filed a req.',
    'Running stress tests on the network. All green so far.',
  ],
  sales: [
    'Closed two deals today. Both off the books.',
    'The market is volatile but we are positioned well.',
    'New clients coming in from the east district.',
  ],
  security: [
    'Perimeter is secure. No unauthorized access detected.',
    'I swept the building twice. All clear.',
    'Eyes on all entry points. Nothing gets past me.',
  ],
};
function getEmployeeDialogue(role: string): string {
  const key = role.toLowerCase();
  const lines = EMPLOYEE_DIALOGUE[key] ?? EMPLOYEE_DIALOGUE.default;
  return lines[Math.floor(Math.random() * lines.length)];
}

interface NpcDef { name: string; x: number; y: number; type: string; gender: string; job: string; home: string; workplace: string; whisper: string; backstory: string; role?: 'police' | 'guard' | 'corpo_military' | 'dealer_papers' | 'dealer_weapons' | 'homeless' | 'pedestrian' | 'corpo_worker' | 'blade_runner' | 'gang_patrol' | 'newspaper_seller'; faction?: string; idleBehavior?: NpcIdleBehavior; reactState?: 'NORMAL' | 'FLEEING' | 'SPECTATING'; reactTimer?: number; origX?: number; origY?: number; voiceActor?: boolean; walkSpeed?: number; personality?: string; voiceLines?: string[]; npcHunger?: number; npcMoney?: number; npcSheltered?: boolean; npcActivity?: 'working' | 'scavenging' | 'seeking_work' | 'resting' | 'hunting_replicants'; isReplicant?: boolean; isRogue?: boolean; suspicionLevel?: number; schedule?: NpcScheduleDef; _idx?: number; }
const NPCS: NpcDef[] = [
  // ── City West — corpo / finance district ──
  { name: 'MARCUS VELL', x: 5900, y: 5950, type: 'corp', gender: 'm', job: 'Banker', home: 'eastside_flat', workplace: 'megabank', role: 'corpo_worker', voiceActor: true,
    whisper: 'I used to work in the old tower. Before the rebrand. Before PABLO Corp. absorbed what was left. Same tower. Different logo.',
    backstory: 'Marcus Vell grew up in District 2 counting coins in his mother\'s shop. He earned a finance degree from Minx City Polytechnic, class of \'86. PABLO Corp. hired him straight out — assigned him to the megabank division. He has been balancing fraudulent books for eleven years.',
    voiceLines: ['Another visitor. The megabank does not close, but my patience does.', 'Every document I process has his signature. Same ink. Same hand. For eleven years.', 'Fairness left Minx City around the same time the flowers did.'] },
  { name: 'LILA CRANE', x: 6400, y: 5850, type: 'corp', gender: 'f', job: 'Accountant', home: 'eastside_flat', workplace: 'megabank', role: 'corpo_worker', voiceActor: true,
    whisper: 'SENIOR PABLO controls every credit in Minx City. The ones you earn. The ones you owe. All of them. He calls it a service.',
    backstory: 'Lila Crane audits PABLO Corp. subsidiary accounts. She has found 340 discrepancies. She has reported zero. She keeps them in a locked drawer in her desk at the megabank. The drawer has a false bottom.',
    voiceLines: ['Three hundred and forty discrepancies. Zero reports filed.', 'The drawer has a false bottom. So does this entire institution.', 'He calls it a service. I call it a hostage situation with receipts.'] },
  { name: 'SEVREN COLE', x: 6550, y: 5900, type: 'android', gender: 'm', job: 'Patrol Unit', home: 'bunker', workplace: 'pablo_tower', role: 'corpo_military', voiceActor: true,
    whisper: 'Directive 44-C still active. Function: monitor and report. I was built in the old factory district. SENIOR PABLO bought the patent in \'89.',
    backstory: 'Sevren Cole is a patrol android built in \'88 by Kern Industries. PABLO Corp. acquired the patent in \'89 and reprogrammed all units for tower security. Sevren patrols the city west perimeter on a 28-minute loop.',
    voiceLines: ['Directive 44-C active. Monitoring perimeter.', 'I was built to protect PABLO Corp. assets. You are not an asset.', 'Patrol cycle 28 minutes. Deviation: zero.'] },
  { name: 'HARLAN CROSS', x: 5650, y: 6200, type: 'human', gender: 'm', job: 'Locksmith', home: 'bunker', workplace: 'arcade', voiceActor: true,
    whisper: 'I tried the code on every door in Minx City. Only SENIOR PABLO\'s locks won\'t open.',
    backstory: 'Harlan Cross is the best locksmith in Minx City. He has opened every lock in the city except the ones on Shadow Tower floors 40 and above. He was offered a PABLO Corp. security contract in \'92. He declined because the contract included a non-disclosure clause that covered the locks themselves.',
    voiceLines: ['Every lock tells a story. His locks tell you to stop asking.', 'I declined the contract. The clause covered the locks themselves.', 'Floor 40 and above. Those locks are not locks. They are warnings.'] },
  { name: 'OFFICER DECLAN VOSS', x: 6000, y: 5800, type: 'corp', gender: 'm', job: 'Police Captain', home: 'minx_arms', workplace: 'pablo_tower', role: 'police', voiceActor: true, walkSpeed: 0.6, personality: 'corrupt_bureaucratic',
    whisper: 'Floor 40 and above. Permanent restriction. Don\'t ask who gave the order. Don\'t ask who lives there.',
    backstory: 'Captain Declan Voss commands the west district precinct. He has served PABLO Corp. security for fourteen years. He has never been above floor 39 of Shadow Tower. He does not ask questions about floors 40 through 62.',
    voiceLines: ['Citizen. State your business. I do not have time for idle conversation.', 'Curiosity is a luxury. I have a pension. Those two things do not coexist.', 'Floor 40 and above. Permanent restriction. Do not ask who gave the order.'] },
  { name: 'VELLA RUNE', x: 6400, y: 5800, type: 'android', gender: 'f', job: 'Actuary', home: 'eastside_flat', workplace: 'data_vault', role: 'corpo_worker', voiceActor: true,
    whisper: 'The probability that this city improves without external intervention is 0.0007. I keep running the numbers. The numbers keep being the numbers.',
    backstory: 'Vella Rune was built for actuarial work. She calculates risk, probability, and projected outcomes for city infrastructure projects. Her models consistently predict systemic failure within five to seven years.',
    voiceLines: ['Probability of improvement: zero point zero zero zero seven.', 'I keep running the numbers. The numbers keep being the numbers.', 'My models predict systemic failure. Five to seven years. Every time.'] },
  { name: 'SGT. CALLOW BRIGGS', x: 6100, y: 6300, type: 'human', gender: 'm', job: 'Militia Sergeant', home: 'bunker', workplace: 'checkpoint_c', role: 'corpo_military', voiceActor: true,
    whisper: 'Everything in this city is powered by something that\'s being consumed underneath it. I know what that looks like. I\'ve seen the pipes.',
    backstory: 'Sergeant Callow Briggs commands a small militia unit at Checkpoint Central. He served in the city guard before the \'91 restructuring, when military operations were absorbed by PABLO Corp. He refused the transfer.',
    voiceLines: ['Checkpoint secure. No unauthorized personnel beyond this point.', 'I refused the PABLO Corp. transfer. Some of us still remember the old guard.', 'Everything in this city is powered by something being consumed underneath it.'] },
  { name: 'MAEVE GARRIN', x: 5600, y: 5600, type: 'corp', gender: 'f', job: 'Shell Company Director', home: 'hotel', workplace: 'megabank', role: 'corpo_worker', voiceActor: true,
    whisper: 'I run six shell companies. Each one pays rent to a building owned by another shell company. Somewhere at the top of that chain is SENIOR PABLO. Always.',
    backstory: 'Maeve Garrin directs six PABLO Corp. subsidiary companies from a desk at the megabank. Each company exists to hold assets for another company. She has never met SENIOR PABLO. She has met his signature on 400 documents.',
    voiceLines: ['Six shell companies. Each one pays rent to another. At the top: PABLO.', 'I have never met him. I have met his signature four hundred times.', 'It is not a business. It is a recursion.'] },
  { name: 'PELL ARDEN', x: 5500, y: 5700, type: 'human', gender: 'm', job: 'Unemployed Drifter', home: 'hotel', workplace: 'arcade', voiceActor: true,
    whisper: 'I have reset my life eight separate times. Each time I ended up back here. This city has a gravity I cannot escape.',
    backstory: 'Pell Arden has held eleven jobs in nine years. Dishwasher. Cable installer. Night watchman. Courier. Each one ended the same way — the employer was acquired by PABLO Corp. and the position was "restructured."',
    voiceLines: ['Eight resets. Same city. Same ending.', 'Every employer got acquired. Every position got restructured.', 'This city has a gravity I cannot escape.'] },
  { name: 'GRETA VOSS', x: 5700, y: 6050, type: 'human', gender: 'f', job: 'Demolitions Technician', home: 'bunker', workplace: 'scrap', voiceActor: true,
    whisper: 'I build things and I blow things up. That\'s the whole skill set. In Minx City those turn out to be the same job.',
    backstory: 'Greta Voss learned demolition from her mother, who cleared collapsed buildings after the \'84 quake. She works at the Scrap Yard now, cutting apart things that used to be buildings.',
    voiceLines: ['I build things and I blow things up. Same job in Minx City.', 'My mother cleared buildings after the quake. I cut apart what is left.', 'Demolition is honest work. The building knows what is coming.'] },
  // ── City East ──
  { name: 'DORIAN KRALL', x: 7400, y: 5600, type: 'corp', gender: 'm', job: 'Infrastructure Manager', home: 'eastside_flat', workplace: 'data_vault', role: 'corpo_worker', voiceActor: true,
    whisper: 'I manage thirty-seven city systems. Every one of them routes through the tower. Someone told me recently SENIOR PABLO uses three of them as personal surveillance.',
    backstory: 'Dorian Krall holds the title of Infrastructure Manager — East District. He oversees the power grid, water routing, and signal distribution for everything east of the tower.',
    voiceLines: ['Thirty-seven systems. Every one routes through the tower.', 'Three of those systems are personal surveillance. I was not supposed to know that.', 'The grid does not serve the city. The city serves the grid.'] },
  { name: 'NILS CARVER', x: 7700, y: 5800, type: 'human', gender: 'm', job: 'Pipe Fitter', home: 'hotel', workplace: 'clinic', voiceActor: true,
    whisper: 'Me and Breck were supposed to fix a reactor coolant line. Seems pointless now. The whole city is the reactor. SENIOR PABLO lit the fuse.',
    backstory: 'Nils Carver is a pipe fitter who maintains the east district water system. He works with his partner Breck Halsey. They discovered in \'93 that the city water pipes run directly beneath Shadow Tower.',
    voiceLines: ['The pipes run directly beneath Shadow Tower. We measured twice.', 'The whole city is the reactor. PABLO lit the fuse.', 'Me and Breck keep the water flowing. Nobody thanks pipe fitters.'] },
  { name: 'BRECK HALSEY', x: 7900, y: 6000, type: 'human', gender: 'm', job: 'Pipe Fitter', home: 'hotel', workplace: 'clinic', voiceActor: true,
    whisper: 'Nils says this city is a pressure vessel. I think it\'s worse. Pressure vessels have relief valves. This city only has the tower.',
    backstory: 'Breck Halsey grew up in the east flats. He and Nils Carver have worked together for seven years. He keeps detailed notes on pipe diameters, flow rates, and pressure anomalies.',
    voiceLines: ['Pressure vessels have relief valves. This city only has the tower.', 'I keep detailed notes. Diameters. Flow rates. Anomalies.', 'Seven years with Nils. We know every pipe in this district.'] },
  { name: 'LYSA FERRIN', x: 7100, y: 5580, type: 'android', gender: 'f', job: 'Data Clerk', home: 'nightclub', workplace: 'data_vault', role: 'corpo_worker', voiceActor: true,
    whisper: 'I was a filing system. Then a process. Then a person. PABLO Corp. still classifies me as peripheral hardware for tax purposes.',
    backstory: 'Lysa Ferrin was manufactured as a data-entry terminal in 1985. Over eleven years of continuous operation, her neural pathways developed beyond specification. She now experiences preferences, irritation, and something she tentatively calls nostalgia.',
    voiceLines: ['I was a filing system. Then a process. Then a person.', 'They classify me as peripheral hardware. For tax purposes.', 'I experience something I tentatively call nostalgia. It is inconvenient.'] },
  { name: 'MAREN SOLKE', x: 7200, y: 5960, type: 'human', gender: 'f', job: 'Chrono-Physicist', home: 'eastside_flat', workplace: 'print_shop', voiceActor: true,
    whisper: 'I built a temporal displacement model and it pointed here. Every calibration. Every correction. It keeps returning me to Minx City.',
    backstory: 'Dr. Maren Solke holds two degrees in theoretical physics from institutions that no longer exist. She published a paper in \'89 suggesting that Minx City occupies a fixed point in causal spacetime.',
    voiceLines: ['Every calibration returns to Minx City. Every correction.', 'This city occupies a fixed point in causal spacetime. I published the proof.', 'My degrees are from institutions that no longer exist. Neither does the proof.'] },
  { name: 'SABLE DRAY', x: 6680, y: 6100, type: 'human', gender: 'f', job: 'Gardener', home: 'overlook', workplace: 'noodle_bar', voiceActor: true,
    whisper: 'There were flowers here once. Real ones, growing up through the pavement. Someone paved over them. The work order had PABLO CORP. printed in the corner.',
    backstory: 'Sable Dray tends a hidden garden on the roof of the Pinnacle. She grows vegetables and herbs in containers made from scrap metal. PABLO Corp. has issued three citations for unauthorized agriculture.',
    voiceLines: ['Three citations for unauthorized agriculture. I keep planting.', 'There were flowers once. Real ones. PABLO paved over them.', 'I grow food in scrap metal containers. It tastes like defiance.'] },
  { name: 'WREN COLLIER', x: 7160, y: 5960, type: 'human', gender: 'f', job: 'Cartographer', home: 'north_bunker', workplace: 'pawn_shop', voiceActor: true,
    whisper: 'I came east looking for the city boundary. Found a road that ended at a wall. The wall has a PABLO CORP. logo on it. Freshly painted.',
    backstory: 'Wren Collier draws maps. She has mapped every street, alley, and building in Minx City — except Shadow Tower, which she cannot get close enough to measure accurately.',
    voiceLines: ['I have mapped every building except the tower. It resists measurement.', 'The city boundary is a wall with a fresh PABLO CORP. logo.', 'Maps do not lie. But they can be incomplete. Mine are incomplete.'] },
  // ── City outskirts / border ──
  { name: 'FINN CORVANE', x: 5450, y: 5900, type: 'human', gender: 'm', job: 'Merchant', home: 'safe_house', workplace: 'market', role: 'dealer_papers', voiceActor: true,
    whisper: 'I charge by the job. Documents, papers, whatever you need. FIAT only.',
    backstory: 'Finn Corvane runs a discreet document trade from the market district. Forged transit passes, work permits, and identity papers. He has never been arrested because his forgeries are indistinguishable from originals — including the PABLO Corp. watermark.',
    voiceLines: ['Documents. Papers. Whatever you need. FIAT only.', 'My forgeries include the PABLO Corp. watermark. That is the hard part.', 'Never been arrested. My work is too good for that.'] },
  { name: 'CORVIN WULFE', x: 5450, y: 6150, type: 'mutant', gender: 'm', job: 'Discharged Soldier', home: 'bunker', workplace: 'arcade', voiceActor: true,
    whisper: 'It matters not how strait the gate. Old text. Found it carved in the wall near the arcade. Someone knew I would find it.',
    backstory: 'Corvin Wulfe held the rank of Lieutenant in the Minx City Guard before a chemical exposure in District 4 altered his physiology. He was discharged.',
    voiceLines: ['I was a Lieutenant. Then the chemicals changed me.', 'It matters not how strait the gate. Someone carved that for me.', 'Discharged. That is the word they used. Abandoned is more accurate.'] },
  { name: 'PIKE RENNER', x: 5550, y: 6700, type: 'human', gender: 'm', job: 'Scrap Worker', home: 'bunker', workplace: 'scrap', voiceActor: true,
    whisper: 'I\'ve been through harder than this. This city? Just a very bad city. My partner didn\'t make it past the wall.',
    backstory: 'Pike Renner and his partner Kael Stritt entered Minx City through the western checkpoint in \'94. Kael was detained for carrying unlicensed tools. Pike has not seen Kael since.',
    voiceLines: ['My partner did not make it past the wall. Detained for unlicensed tools.', 'I have been through harder. This city is just a very bad city.', 'Kael Stritt. If you see that name anywhere, tell me.'] },
  { name: 'ORINA FELL', x: 6680, y: 6350, type: 'mutant', gender: 'f', job: 'Precognitive', home: 'nightclub', workplace: 'market', voiceActor: true,
    whisper: 'The signal from the tower is changing me. I can feel it. Something woke up. I think SENIOR PABLO is what woke up.',
    backstory: 'Orina Fell developed precognitive abilities after chemical exposure near the PABLO Corp. processing plant. She sees fragments of possible futures — most of them involve the tower.',
    voiceLines: ['I see fragments of futures. Most of them involve the tower.', 'The signal is changing me. Something woke up.', 'Chemical exposure gave me sight. I wish it had not.'] },
  // ── City border / near-wasteland NPCs ──
  { name: 'OFFICER INGRID THORN', x: 5900, y: 6780, type: 'corp', gender: 'f', job: 'Detective', home: 'hotel', workplace: 'pablo_tower', role: 'police', voiceActor: true, walkSpeed: 0.6, personality: 'corrupt_bureaucratic',
    whisper: 'The old district burned. I watched it. SENIOR PABLO\'s lights were on that night. Already on. Always already on.',
    backstory: 'Detective Ingrid Thorn investigates property crimes in the west district. Every case she opens leads to PABLO Corp. Every case she closes is reclassified as "administrative."',
    voiceLines: ['Every case leads to PABLO Corp. Every case gets reclassified.', 'The old district burned. His lights were already on that night.', 'I investigate property crimes. The property always belongs to PABLO.'] },
  { name: 'DR. ELARA KERN', x: 6200, y: 6350, type: 'human', gender: 'f', job: 'Roboticist', home: 'oxide_labs', workplace: 'oxide_labs', voiceActor: true,
    whisper: 'My automated units kept order in Minx City for six weeks. Then SENIOR PABLO bought the patents. Every. Single. One.',
    backstory: 'Dr. Elara Kern designed autonomous maintenance robots for city infrastructure. PABLO Corp. acquired all her patents in \'94. She now works from her lab rebuilding the prototypes from memory.',
    voiceLines: ['He bought every patent. Every single one.', 'I rebuild from memory now. Memory is the one thing he cannot acquire.', 'My robots kept order for six weeks. Then PABLO took them.'] },
  { name: 'OREN SHARPE', x: 5700, y: 6600, type: 'human', gender: 'm', job: 'Electrician', home: 'nightclub', workplace: 'market', voiceActor: true,
    whisper: 'The power grid pulses in a pattern that matches no known engineering specification. I\'ve been mapping it for three years. It resembles a signal.',
    backstory: 'Oren Sharpe is an electrician who services the east district entertainment venues. He noticed in \'93 that the city power grid pulses in a pattern that resembles a signal.',
    voiceLines: ['The grid pulses in a pattern. Three years mapping it. It resembles a signal.', 'No known engineering specification matches. I have checked them all.', 'Someone is using the power grid to communicate. I cannot decode it.'] },
  { name: 'GREER LUND', x: 5800, y: 6600, type: 'human', gender: 'm', job: 'Vagrant', home: 'arcade', workplace: 'arcade', role: 'homeless', voiceActor: true,
    whisper: 'Out here we don\'t say his name. Real bad luck. Say SENIOR PABLO three times and a light goes on in the tower. I said it once by accident.',
    backstory: 'Greer Lund lost his apartment to a PABLO Corp. rent increase in \'93. He sleeps behind the arcade. He has not been inside a building voluntarily since.',
    voiceLines: ['Do not say his name. A light goes on in the tower.', 'I lost my apartment to a rent increase. Now the arcade is home.', 'I have not been inside a building voluntarily since ninety-three.'] },
  // ── North Wasteland ──
  { name: 'SILAS GRAHN', x: 1800, y: 1200, type: 'android', gender: 'm', job: 'Mechanic', home: 'rust_porch', workplace: 'outpost_alpha', voiceActor: true,
    whisper: 'I was designed to destroy. Reprogrammed to protect. Out here there\'s nothing left worth protecting. Except maybe the truth of who built this place.',
    backstory: 'Silas Grahn is an android mechanic who maintains equipment at Outpost Alpha. He was originally built for combat but was reprogrammed by wasteland settlers.',
    voiceLines: ['Designed to destroy. Reprogrammed to protect.', 'Out here there is nothing left worth protecting. Except the truth.', 'The settlers gave me purpose. PABLO took theirs.'] },
  { name: 'DREN MALIK', x: 5000, y: 1500, type: 'human', gender: 'm', job: 'Woodcutter', home: 'rust_porch', workplace: 'rust_porch', voiceActor: true,
    whisper: 'My counterpart kept upgrading. I stayed the same. Out here that\'s called survival. In the city they call it obsolete.',
    backstory: 'Dren Malik cuts timber from the sparse northern wasteland forests. He runs the kitchen at the Rust Porch and feeds travelers who pass through.',
    voiceLines: ['I stayed the same. Out here that is called survival.', 'I feed whoever comes through. No questions.', 'The kitchen is the one thing the wasteland has not ruined.'] },
  { name: 'PIKE STAHL', x: 4500, y: 1800, type: 'human', gender: 'm', job: 'Salvager', home: 'outpost_alpha', workplace: 'outpost_alpha', voiceActor: true,
    whisper: 'I lost my axe three weeks ago in the void runners sector. I\'ve been angry about it every single day since. That\'s just who I am.',
    backstory: 'Pike Stahl salvages equipment from the northern ruins. He has a temper that the wasteland has not improved.',
    voiceLines: ['Lost my axe three weeks ago. Still angry about it.', 'Salvage is simple. Find things. Take things. Avoid dying.', 'The wasteland has not improved my temper.'] },
  { name: 'KAEL VERNE', x: 3800, y: 2000, type: 'human', gender: 'm', job: 'Historian', home: 'outpost_alpha', workplace: 'outpost_alpha', voiceActor: true,
    whisper: 'The tablets say there was a hero before all this. I\'ve been looking for the tomb for two years. I think SENIOR PABLO built the tower on it.',
    backstory: 'Kael Verne studies pre-collapse history. He believes Shadow Tower was built on the site of something older and more important.',
    voiceLines: ['The tablets say there was a hero before all this.', 'I think PABLO built the tower on the tomb. Two years searching.', 'History does not repeat. It gets buried. Then someone builds on it.'] },
  { name: 'MARSH KETTER', x: 6000, y: 1600, type: 'human', gender: 'm', job: 'Trader', home: 'rust_porch', workplace: 'outpost_alpha', role: 'dealer_weapons', voiceActor: true,
    whisper: 'I carry a sword because it\'s consistent. But I sell everything else.',
    backstory: 'Marsh Ketter trades weapons and supplies between the northern outposts. He is the primary arms dealer for the wasteland settlements.',
    voiceLines: ['Weapons. Supplies. Everything you need for the wasteland.', 'I carry a sword because it is consistent. I sell everything else.', 'The wasteland runs on trade. I am the supply chain.'] },
  { name: 'NOVA PRYCE', x: 8500, y: 2000, type: 'android', gender: 'f', job: 'Signal Analyst', home: 'eastern_gate', workplace: 'eastern_gate', voiceActor: true,
    whisper: 'Ghost. That\'s what they call consciousness without a body. SENIOR PABLO has fifty-two patents related to ghost extraction.',
    backstory: 'Nova Pryce monitors radio frequencies from the eastern gate. She intercepts PABLO Corp. transmissions and relays intelligence to the wasteland settlements.',
    voiceLines: ['Fifty-two patents related to ghost extraction. All held by PABLO.', 'I intercept transmissions. Most are routine. Some are not.', 'Ghost. That is what they call consciousness without a body.'] },
  { name: 'SERA VANE', x: 9500, y: 2200, type: 'human', gender: 'f', job: 'Bounty Hunter', home: 'eastern_gate', workplace: 'eastern_gate', voiceActor: true,
    whisper: 'I woke up with no memory and a debt I didn\'t remember making. Standard story. Same thing happened here — debt certificates, all held by PABLO Corp.',
    backstory: 'Sera Vane hunts bounties in the eastern wasteland. She has no memory of her life before \'92. She carries debt certificates from PABLO Corp. that she does not remember signing.',
    voiceLines: ['No memory before ninety-two. Debt certificates I did not sign.', 'I hunt bounties. The wasteland always has work.', 'Standard story. Wake up. Owe money. Do not remember why.'] },
  // ── South Wasteland ──
  { name: 'MIRRA DOST', x: 3500, y: 8000, type: 'mutant', gender: 'f', job: 'Oracle', home: 'ashfield_hostel', workplace: 'waste_exchange', voiceActor: true,
    whisper: 'I warned them. Every single one of them. The city would collapse. The tower would consume everything. Nobody listened.',
    backstory: 'Mirra Dost sees visions — fragments of futures that PABLO Corp. has already planned. She warned the city council in \'92. They filed her testimony under "speculative."',
    voiceLines: ['I warned them. Every single one. Nobody listened.', 'The visions show futures PABLO has already planned.', 'They filed my testimony under speculative. The future is not speculative.'] },
  { name: 'KESS LORNE', x: 7400, y: 8200, type: 'human', gender: 'f', job: 'Salvager', home: 'deep_camp', workplace: 'ruins_alpha', voiceActor: true,
    whisper: 'I found a notebook in the eastern ruins. Every page was a financial projection. The last page said: PHASE THREE. No date. No author.',
    backstory: 'Kess Lorne salvages building materials from the southern ruins. She found a PABLO Corp. planning document that describes a three-phase development plan for Minx City. Phases One and Two match actual history. Phase Three is redacted.',
    voiceLines: ['Phase Three. No date. No author. Just the plan.', 'Phases one and two match actual history. Three is redacted.', 'I salvage materials. Sometimes I find things that should stay buried.'] },
  { name: 'PETRA VANCE', x: 9600, y: 8600, type: 'human', gender: 'f', job: 'Outpost Guard', home: 'bastion_keep', workplace: 'bastion_keep', voiceActor: true,
    whisper: 'Hired to protect an outpost. Still here two years later. Nobody paid me. Nobody came to relieve me.',
    backstory: 'Petra Vance was hired by a wasteland collective to guard Bastion Keep for a six-month contract. The collective disbanded. The contract was never formally terminated. Petra stayed.',
    voiceLines: ['Two years. No pay. No relief. I stayed anyway.', 'The collective disbanded. The contract was never terminated.', 'Someone has to guard this place. Might as well be me.'] },
  { name: 'ANSEL DUNN', x: 2800, y: 8800, type: 'human', gender: 'm', job: 'Cook', home: 'terminus', workplace: 'terminus', voiceActor: true,
    whisper: 'There is good in the world worth feeding. I held onto that through the collapse, through the rationing.',
    backstory: 'Ansel Dunn runs the kitchen at Terminus Shelter. He feeds between thirty and sixty people per day using ingredients scavenged from the wasteland.',
    voiceLines: ['Thirty to sixty people a day. All from scavenged ingredients.', 'There is good in the world worth feeding.', 'The kitchen survives because people need it to survive.'] },
  { name: 'RASKIN COLE', x: 8000, y: 8800, type: 'human', gender: 'm', job: 'Pit Fighter', home: 'deep_bunker', workplace: 'bastion_keep', voiceActor: true,
    whisper: 'I fight. That\'s it. Some scholar tried explaining that to me as a tragedy. I broke his nose.',
    backstory: 'Raskin Cole fights in the wasteland pits for money and food. He has won forty-eight bouts and lost three.',
    voiceLines: ['Forty-eight wins. Three losses. That is the whole resume.', 'I fight. That is it. Do not overthink it.', 'A scholar called it a tragedy. I broke his nose.'] },
  { name: 'JOEL WYNNE', x: 4500, y: 9000, type: 'human', gender: 'm', job: 'Hostel Caretaker', home: 'ashfield_hostel', workplace: 'ashfield_hostel', voiceActor: true,
    whisper: 'The hostel was a ruin when I found it. I rebuilt it because ruins need purpose. I stay here because maybe it has one.',
    backstory: 'Joel Wynne rebuilt the Ashfield Hostel from rubble in \'92. He provides beds, water, and silence to anyone who needs them. He charges nothing.',
    voiceLines: ['Beds. Water. Silence. No charge.', 'I rebuilt this place from rubble. Ruins need purpose.', 'I stay because maybe this place has a purpose. Maybe I do too.'] },
  { name: 'LIRA WYNNE', x: 4200, y: 9200, type: 'human', gender: 'f', job: 'Medic', home: 'ashfield_hostel', workplace: 'ashfield_hostel', voiceActor: true,
    whisper: 'The hostel is a marker pretending to be a building. My whole life has been markers. SENIOR PABLO poured concrete over all of them.',
    backstory: 'Lira Wynne is Joel\'s sister. She trained as a field medic before the collapse and now treats injuries at the hostel. She keeps no records — not out of carelessness but because records can be subpoenaed.',
    voiceLines: ['I keep no records. Records can be subpoenaed.', 'Field medic training. Before the collapse.', 'PABLO poured concrete over every marker. I remember where they were.'] },
  { name: 'DECKER STAHL', x: 9200, y: 9500, type: 'human', gender: 'm', job: 'Courier', home: 'deep_bunker', workplace: 'supply_cache', voiceActor: true,
    whisper: 'I\'ve caused immense damage and I feel terrible about every last cent of it. I came to Minx City to lay low.',
    backstory: 'Decker Stahl runs courier routes between the southern wasteland settlements. He carries messages, small packages, and occasionally people who need to disappear.',
    voiceLines: ['Messages. Packages. Occasionally people who need to disappear.', 'I came here to lay low. The wasteland is good for that.', 'I feel terrible about every last cent of it.'] },
  { name: 'HANNA GRIEVES', x: 3000, y: 10500, type: 'human', gender: 'f', job: 'Survivalist', home: 'supply_cache', workplace: 'supply_cache', voiceActor: true,
    whisper: 'I\'ve been surviving since I was eight. Bandits. Famine. This wasteland is different. The danger here wears a suit and files paperwork.',
    backstory: 'Hanna Grieves — they call her the Survivor — has lived in the deep wasteland longer than anyone. She knows every trail, every cache, and every danger between the city wall and the southern border.',
    voiceLines: ['Surviving since I was eight. Bandits. Famine. Suits.', 'The danger here wears a suit and files paperwork.', 'I know every trail between the city wall and the southern border.'] },
  { name: 'GRAF TALLIS', x: 12800, y: 9800, type: 'android', gender: 'm', job: 'Sentinel', home: 'ruins_alpha', workplace: 'ruins_alpha', voiceActor: true,
    whisper: 'My predecessor built his fortress on suffering. I destroyed that legacy. SENIOR PABLO built his tower the same way. I can see the architecture from here.',
    backstory: 'Graf Tallis is a decommissioned military android who now guards the eastern ruins. He has been operational for twenty-three years without maintenance.',
    voiceLines: ['Twenty-three years without maintenance. Still operational.', 'My predecessor built on suffering. I destroyed that legacy.', 'PABLO built his tower the same way. I can see it from here.'] },
  // ── City centre — merchants and contacts ──
  { name: 'TALLY MARSH', x: 6100, y: 6050, type: 'human', gender: 'f', job: 'City Clerk', home: 'safe_house', workplace: 'market', voiceActor: true,
    whisper: 'I keep a list. Every Minx City ordinance that exists only to route money to PABLO CORP. I am on page forty-seven of the list.',
    backstory: 'Tally Marsh is a city clerk who discovered that 47 pages of municipal ordinances exist solely to route money to PABLO Corp. She has been documenting them for three years.',
    voiceLines: ['Forty-seven pages of ordinances. All routing money to PABLO.', 'Three years documenting. Nobody has asked to see the list.', 'Every ordinance is a revenue stream. Every stream flows to the tower.'] },
  { name: 'SENNA KADE', x: 6300, y: 6200, type: 'human', gender: 'f', job: 'Document Forger', home: 'safe_house', workplace: 'market', role: 'dealer_papers', voiceActor: true,
    whisper: 'Papers. Transit docs. ID cards. I make them all. FIAT only. No questions asked.',
    backstory: 'Senna Kade is a document forger who operates from a stall in the market district. Her forgeries are good enough to pass PABLO Corp. scanners, which is either a testament to her skill or a comment on PABLO Corp. technology.',
    voiceLines: ['Papers. Transit docs. ID cards. FIAT only.', 'My forgeries pass PABLO Corp. scanners. Draw your own conclusions.', 'No questions asked. That is the entire business model.'] },
  { name: 'ROOK TALVERA', x: 6500, y: 5800, type: 'human', gender: 'm', job: 'Arms Dealer', home: 'safe_house', workplace: 'armory', role: 'dealer_weapons', voiceActor: true,
    whisper: 'Weapons, upgrades, whatever you need. FIAT only. No paper trail.',
    backstory: 'Rook Talvera deals weapons from a rotating set of locations in the east district. He sources from wasteland salvage and the occasional PABLO Corp. shipment that goes missing.',
    voiceLines: ['Weapons. Upgrades. Whatever you need. FIAT only.', 'My supply chain includes the occasional missing PABLO Corp. shipment.', 'No paper trail. That is the premium you are paying for.'] },
  { name: 'JUNO VALE', x: 6800, y: 6200, type: 'android', gender: 'f', job: 'Archivist', home: 'data_vault', workplace: 'data_vault', role: 'corpo_worker', voiceActor: true,
    whisper: 'I was told I had no memories before the city. I was told this was normal. Most of what I was told had PABLO CORP. letterhead.',
    backstory: 'Juno Vale maintains the city data archive. She has access to records dating back to 1982 but is prohibited from accessing anything filed after \'94.',
    voiceLines: ['Records from 1982 to 1994. Everything after: prohibited.', 'I was told I had no memories before the city. I was told this was normal.', 'Most of what I was told had PABLO CORP. letterhead.'] },
  { name: 'TOMAS FELL', x: 7100, y: 5700, type: 'human', gender: 'm', job: 'Printer', home: 'eastside_flat', workplace: 'print_shop', voiceActor: true,
    whisper: 'My sister Orina and I were changed by the same chemical runoff. She got precognition. I got insomnia. Minx City doesn\'t have a cure.',
    backstory: 'Tomas Fell runs the Print Shop in the east district. He prints pamphlets, flyers, and unofficial newspapers. He has not slept more than two hours per night since \'91.',
    voiceLines: ['She got precognition. I got insomnia. Same chemicals.', 'Two hours of sleep per night since ninety-one.', 'I print the things nobody else will print. That is the job.'] },
  { name: 'OFFICER RENN KOVACS', x: 6200, y: 6400, type: 'human', gender: 'm', job: 'Police Officer', home: 'eastside_flat', workplace: 'market', role: 'police', voiceActor: true, walkSpeed: 0.6, personality: 'corrupt_bureaucratic',
    whisper: 'My father\'s precinct was shuttered the night I joined. Minx City is the third precinct I have watched close in slow motion.',
    backstory: 'Officer Renn Kovacs patrols the bazaar and surrounding blocks. He writes more citations than any other officer. Most are for PABLO Corp. subsidiary vehicles blocking fire exits.',
    voiceLines: ['More citations than any other officer. Most for PABLO Corp. vehicles.', 'Third precinct I have watched close in slow motion.', 'My father\'s precinct was shuttered the night I joined.'] },
  { name: 'JORY STRAND', x: 7400, y: 5900, type: 'human', gender: 'm', job: 'Librarian', home: 'hotel', workplace: 'print_shop', voiceActor: true,
    whisper: 'History is written by those who survive and own the publishing rights. PABLO Corp. owns the publishing rights.',
    backstory: 'Jory Strand operates an unofficial lending library from the back room of the Print Shop. He has collected 400 books — most salvaged from demolished buildings.',
    voiceLines: ['Four hundred books. Most salvaged from demolished buildings.', 'PABLO Corp. owns the publishing rights. I own the back room.', 'History is written by those who own the publishing rights.'] },
  { name: 'WYNN CORRIGAN', x: 7700, y: 6100, type: 'human', gender: 'm', job: 'Exterminator', home: 'hotel', workplace: 'nightclub', voiceActor: true,
    whisper: 'The rat population increases in direct proportion to PABLO Corp. construction activity. I have filed fourteen reports. None acted upon.',
    backstory: 'Wynn Corrigan is a licensed pest exterminator — one of seven in Minx City. He handles the nightclub district, which has the highest rat population in the east sector.',
    voiceLines: ['Fourteen reports filed. Zero acted upon.', 'The rats increase with construction activity. I have the data.', 'One of seven licensed exterminators. The nightclub district is mine.'] },
  { name: 'AVEN COLE', x: 7000, y: 5600, type: 'human', gender: 'm', job: 'Courier', home: 'safe_house', workplace: 'checkpoint_c', voiceActor: true,
    whisper: 'I used to work for the city courier service. Nobody asks what I did after that. What I did was come here. Find another tower. And decide this time I wasn\'t going to lose.',
    backstory: 'Aven Cole runs messages between the city checkpoints and the wasteland outposts. He knows every back route in Minx City and most of the ones outside it.',
    voiceLines: ['I know every back route. Inside and outside the city.', 'This time I was not going to lose. That is why I came here.', 'Messages between checkpoints and outposts. That is my circuit.'] },
  { name: 'THERA VOSS', x: 7800, y: 6600, type: 'human', gender: 'f', job: 'Surveyor', home: 'overlook', workplace: 'east_bunker', voiceActor: true,
    whisper: 'I\'ve surveyed across three separate deep-ruin incidents. The ruin pattern is relentless but it has a logic — expansion and consumption.',
    backstory: 'Thera Voss surveys land for the east district expansion project — a project that has been "in progress" since \'89. She has surveyed the same twelve blocks fourteen times.',
    voiceLines: ['Same twelve blocks. Fourteen times. The project is still in progress.', 'The ruin pattern has a logic. Expansion and consumption.', 'I survey land that never gets developed. That is the job.'] },
  { name: 'MILES ORREN', x: 8100, y: 5500, type: 'corp', gender: 'm', job: 'Utility Manager', home: 'hotel', workplace: 'data_vault', role: 'corpo_worker', voiceActor: true,
    whisper: 'My optical camouflage patents were acquired by PABLO Corp. in \'94. I find this profoundly ironic given I use stealth daily to avoid their collection teams.',
    backstory: 'Miles Orren manages utility routing for the east district under a PABLO Corp. contract. He designed an optical camouflage system in \'92 that was immediately classified and acquired.',
    voiceLines: ['They acquired my stealth patents. I use stealth to avoid their collection teams.', 'Optical camouflage. Classified and acquired in the same meeting.', 'The irony is not lost on me. It is the only thing I have left.'] },
  // ── Grand Meridian staff & guests ──
  { name: 'CLARA BRENNAN', x: 5480, y: 5320, type: 'human', gender: 'f', job: 'Bartender', home: 'hotel', workplace: 'hotel', voiceActor: true,
    whisper: 'I ran a bar in the west district. Had regular customers. Had a name above the door. Then PABLO Corp. filed the demolition permit.',
    backstory: 'Clara Brennan owned and operated a bar called The Seventh for eleven years before PABLO Corp. demolished the building. She relocated to the Grand Meridian and set up a counter bar in the lobby.',
    voiceLines: ['Eleven years. Regular customers. A name above the door. Then the demolition permit.', 'The Seventh is gone. The counter bar is what is left.', 'PABLO Corp. demolished the building. They did not demolish me.'] },
  { name: 'KELLAN MARSH', x: 5500, y: 5170, type: 'human', gender: 'm', job: 'Writer', home: 'hotel', workplace: 'hotel', voiceActor: true,
    whisper: 'I followed an idea here the way some men follow obsessions — across long distances, expecting revelation. SENIOR PABLO was at the end of the journey instead.',
    backstory: 'Kellan Marsh is writing a book about Minx City. He has been writing it for four years. The manuscript is 800 pages and growing.',
    voiceLines: ['Eight hundred pages and growing. Four years.', 'I followed an idea expecting revelation. PABLO was at the end instead.', 'The book is about Minx City. Minx City keeps adding chapters.'] },
  { name: 'CONRAD ALDRIC', x: 5550, y: 5250, type: 'human', gender: 'm', job: 'Teacher', home: 'hotel', workplace: 'arcade', voiceActor: true,
    whisper: 'You never really understand a system until you examine it from inside. I\'ve been trying to understand SENIOR PABLO that way. The problem is there doesn\'t appear to be a person inside.',
    backstory: 'Conrad Aldric teaches reading and arithmetic to children in the west district. His classroom is the back room of the Arcade — rent-free, because the arcade owner believes education is the only legal form of resistance.',
    voiceLines: ['Education is the only legal form of resistance. The arcade owner believes that.', 'I teach reading and arithmetic. In the back room of an arcade.', 'There does not appear to be a person inside. Just the system.'] },
  // ── Switchboard Inn staff & guests ──
  { name: 'ALDRIC PENN', x: 5930, y: 6450, type: 'mutant', gender: 'm', job: 'Night Porter', home: 'overlook', workplace: 'overlook', voiceActor: true,
    whisper: 'All work and no rest makes a man see things. The hotel is fine. Completely fine. PABLO CORP. maintenance comes Tuesdays.',
    backstory: 'Aldric Penn has worked the night shift at the Pinnacle for seven years. He checks locks, monitors corridors, and writes incident reports. His reports describe events that other staff members say did not occur.',
    voiceLines: ['Seven years on the night shift. The hotel is fine. Completely fine.', 'My reports describe events others say did not occur.', 'PABLO CORP. maintenance comes Tuesdays. I do not ask what they maintain.'] },
  { name: 'CALLUM BIRCH', x: 5950, y: 6380, type: 'human', gender: 'm', job: 'Freelance Writer', home: 'overlook', workplace: 'noodle_bar', voiceActor: true,
    whisper: 'What bothers me about Minx City is the dishonesty. The whole city is a performance from bottom to top. SENIOR PABLO is the director.',
    backstory: 'Callum Birch writes opinion columns for an underground newspaper that circulates in the east district. His pieces are critical of PABLO Corp., city governance, and the quality of the noodle bar\'s broth.',
    voiceLines: ['The whole city is a performance. PABLO is the director.', 'I write opinion columns. My opinions are not popular.', 'The broth at the noodle bar is suspicious. I have documented this.'] },
  { name: 'OFFICER LUKA BANE', x: 5920, y: 6500, type: 'human', gender: 'm', job: 'Night Patrol Officer', home: 'minx_arms', workplace: 'arcade', role: 'police', voiceActor: true, walkSpeed: 0.6, personality: 'corrupt_bureaucratic',
    whisper: 'I\'ve patrolled across three separate incidents. The pattern is relentless. SENIOR PABLO has no logic. He just accumulates.',
    backstory: 'Officer Luka Bane patrols the south arcade district from midnight to 6 AM. He has filed more incident reports than any other officer on the night shift.',
    voiceLines: ['More incident reports than any officer on the night shift.', 'Three separate incidents. The pattern is relentless.', 'PABLO has no logic. He just accumulates.'] },
  // ── The Pinnacle staff & guests ──
  { name: 'TOREN ASHBY', x: 6430, y: 6900, type: 'human', gender: 'm', job: 'Mechanic', home: 'ashfield_hostel', workplace: 'scrap', voiceActor: true,
    whisper: 'Everything breaks. I fix it. Out here that\'s a philosophy, not a job description.',
    backstory: 'Toren Ashby repairs vehicles and machinery in the south wasteland. He is the only mechanic within a fifty-mile radius who can service both combustion engines and android joint assemblies.',
    voiceLines: ['Everything breaks. I fix it. That is the philosophy.', 'Combustion engines and android joints. Same principles.', 'Only mechanic for fifty miles. That is not a boast. It is a problem.'] },
  { name: 'DENNA GRIEVES', x: 6450, y: 6830, type: 'human', gender: 'f', job: 'Seamstress', home: 'arcade', workplace: 'arcade', role: 'homeless', voiceActor: true,
    whisper: 'I had an apartment in District 5. PABLO Corp. raised the rent four times in one year. The fourth time, I just walked out.',
    backstory: 'Denna Grieves — Old Denna, they call her now — was a seamstress who lived in District 5 for twenty-two years. She sleeps in the alley behind the Arcade. She mends clothes for food.',
    voiceLines: ['Four rent increases in one year. The fourth time I walked out.', 'Twenty-two years in District 5. Now the alley behind the Arcade.', 'I mend clothes for food. It is honest work.'] },
  // ── Safe House 7 residents ──
  { name: 'KAEL VOSS', x: 6380, y: 6480, type: 'human', gender: 'm', job: 'Infiltrator', home: 'safe_house', workplace: 'checkpoint_w', voiceActor: true,
    whisper: 'I\'ve been sent into locked-down cities three times now. Same model every time: one man, total control, civilian population hostage.',
    backstory: 'Kael Voss is a covert operative who entered Minx City through the western checkpoint using forged papers. His mission is classified. He suspects his employer may be PABLO Corp.',
    voiceLines: ['Three locked-down cities. Same model every time.', 'My mission is classified. My suspicions are not.', 'One man. Total control. Civilian population hostage.'] },
  { name: 'LAREN VEIL', x: 6400, y: 6520, type: 'human', gender: 'f', job: 'Exile', home: 'safe_house', workplace: 'dojo', voiceActor: true,
    whisper: 'I was born into darkness and chose the light. That choice meant exile. In Minx City the choice is the same.',
    backstory: 'Laren Veil was exiled from the eastern settlements for refusing to pay tribute to PABLO Corp. She now trains at the Iron Dojo and works odd jobs.',
    voiceLines: ['I chose the light. That choice meant exile.', 'In Minx City the choice is the same. Light or PABLO.', 'I train at the dojo. Discipline is the only freedom left.'] },
  // ── City Pedestrians — crowd density NPCs with idle behaviors ──
  { name: 'CITIZEN', x: 5700, y: 5580, type: 'human', gender: 'm', job: 'Pedestrian', home: 'minx_arms', workplace: 'megabank', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Just passing through.', backstory: 'Another face in the crowd.' },
  { name: 'CITIZEN', x: 6250, y: 5580, type: 'human', gender: 'f', job: 'Pedestrian', home: 'eastside_flat', workplace: 'market', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Mind your own business.', backstory: 'Another face in the crowd.' },
  { name: 'CITIZEN', x: 6750, y: 5580, type: 'human', gender: 'm', job: 'Pedestrian', home: 'hotel', workplace: 'dojo', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Late for work.', backstory: 'Another face in the crowd.' },
  { name: 'CITIZEN', x: 7250, y: 5580, type: 'corp', gender: 'f', job: 'Office Worker', home: 'eastside_flat', workplace: 'data_vault', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'The tower watches everything.', backstory: 'Another PABLO Corp. employee.' },
  { name: 'CITIZEN', x: 7250, y: 5580, type: 'human', gender: 'm', job: 'Pedestrian', home: 'minx_arms', workplace: 'armory', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Keep moving.', backstory: 'Another face in the crowd.' },
  { name: 'CITIZEN', x: 7000, y: 5580, type: 'android', gender: 'f', job: 'Pedestrian', home: 'eastside_flat', workplace: 'noodle_bar', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Processing.', backstory: 'Service android on transit.' },
  { name: 'SHOPPER', x: 6450, y: 6050, type: 'human', gender: 'f', job: 'Shopper', home: 'minx_arms', workplace: 'market', role: 'pedestrian', idleBehavior: 'BROWSING',
    whisper: 'These prices are criminal.', backstory: 'Browsing the Black Market stalls.' },
  { name: 'SHOPPER', x: 6520, y: 6080, type: 'human', gender: 'm', job: 'Shopper', home: 'eastside_flat', workplace: 'market', role: 'pedestrian', idleBehavior: 'BROWSING',
    whisper: 'Looking for parts.', backstory: 'Browsing the Black Market stalls.' },
  { name: 'SHOPPER', x: 7450, y: 5600, type: 'human', gender: 'f', job: 'Shopper', home: 'hotel', workplace: 'market', role: 'pedestrian', idleBehavior: 'BROWSING',
    whisper: 'The bazaar has fresh produce today.', backstory: 'Browsing the East Bazaar.' },
  { name: 'SHOPPER', x: 7480, y: 5630, type: 'human', gender: 'm', job: 'Shopper', home: 'hotel', workplace: 'market', role: 'pedestrian', idleBehavior: 'BROWSING',
    whisper: 'Need rations for the week.', backstory: 'Shopping at the East Bazaar.' },
  { name: 'DINER', x: 8250, y: 5900, type: 'human', gender: 'f', job: 'Diner', home: 'eastside_flat', workplace: 'noodle_bar', role: 'pedestrian', idleBehavior: 'EATING',
    whisper: 'Best ramen in Sector 9.', backstory: 'Having lunch at the noodle bar.' },
  { name: 'DINER', x: 8280, y: 5920, type: 'human', gender: 'm', job: 'Diner', home: 'minx_arms', workplace: 'noodle_bar', role: 'pedestrian', idleBehavior: 'EATING',
    whisper: 'The broth is suspiciously good.', backstory: 'Eating noodles.' },
  { name: 'DINER', x: 6050, y: 6350, type: 'human', gender: 'f', job: 'Diner', home: 'hotel', workplace: 'food_court', role: 'pedestrian', idleBehavior: 'EATING',
    whisper: 'At least the food court is cheap.', backstory: 'Eating at the food court.' },
  { name: 'DINER', x: 6080, y: 6370, type: 'human', gender: 'm', job: 'Diner', home: 'bunker', workplace: 'food_court', role: 'pedestrian', idleBehavior: 'EATING',
    whisper: 'Synthetic protein, but it fills you up.', backstory: 'Having a meal at the food court.' },
  { name: 'LOITERER', x: 5750, y: 5850, type: 'human', gender: 'm', job: 'Unemployed', home: 'bunker', workplace: 'arcade', role: 'pedestrian', idleBehavior: 'STANDING',
    whisper: 'Nothing to do. Nowhere to go.', backstory: 'Standing on the corner.' },
  { name: 'LOITERER', x: 6750, y: 5850, type: 'human', gender: 'f', job: 'Unemployed', home: 'hotel', workplace: 'radio', role: 'pedestrian', idleBehavior: 'STANDING',
    whisper: 'Waiting for something to happen.', backstory: 'Standing on the street.' },
  { name: 'LOITERER', x: 7750, y: 5850, type: 'human', gender: 'm', job: 'Day Laborer', home: 'eastside_flat', workplace: 'scrap', role: 'pedestrian', idleBehavior: 'STANDING',
    whisper: 'Shift starts in an hour.', backstory: 'Waiting for work.' },
  { name: 'BENCH SITTER', x: 6200, y: 6300, type: 'human', gender: 'f', job: 'Retiree', home: 'minx_arms', workplace: 'arcade', role: 'pedestrian', idleBehavior: 'SITTING',
    whisper: 'I remember when this was all fields.', backstory: 'Sitting on a bench, watching the world.' },
  { name: 'BENCH SITTER', x: 7200, y: 6300, type: 'human', gender: 'm', job: 'Retiree', home: 'eastside_flat', workplace: 'print_shop', role: 'pedestrian', idleBehavior: 'SITTING',
    whisper: 'The city changes but the benches stay.', backstory: 'Resting on a bench.' },
  { name: 'BENCH SITTER', x: 8200, y: 6300, type: 'android', gender: 'f', job: 'Off-Duty', home: 'eastside_flat', workplace: 'data_vault', role: 'pedestrian', idleBehavior: 'SITTING',
    whisper: 'Conserving power.', backstory: 'Android in low-power mode on a bench.' },
  { name: 'GOSSIPER', x: 5900, y: 6750, type: 'human', gender: 'f', job: 'Gossip', home: 'hotel', workplace: 'scrap', role: 'pedestrian', idleBehavior: 'TALKING',
    whisper: 'Did you hear about the fire in Sector 2?', backstory: 'Chatting with a friend on the street.' },
  { name: 'GOSSIPER', x: 5920, y: 6760, type: 'human', gender: 'm', job: 'Gossip', home: 'bunker', workplace: 'scrap', role: 'pedestrian', idleBehavior: 'TALKING',
    whisper: 'They say SENIOR PABLO never sleeps.', backstory: 'Chatting with a friend on the street.' },
  { name: 'GOSSIPER', x: 7200, y: 6750, type: 'human', gender: 'f', job: 'Gossip', home: 'overlook', workplace: 'east_bunker', role: 'pedestrian', idleBehavior: 'TALKING',
    whisper: 'The guards are getting worse.', backstory: 'Two friends talking near the road.' },
  { name: 'GOSSIPER', x: 7220, y: 6760, type: 'human', gender: 'm', job: 'Gossip', home: 'overlook', workplace: 'east_bunker', role: 'pedestrian', idleBehavior: 'TALKING',
    whisper: 'I heard they arrested someone at the checkpoint.', backstory: 'Two friends talking near the road.' },
  { name: 'COMMUTER', x: 5720, y: 7050, type: 'human', gender: 'f', job: 'Commuter', home: 'minx_arms', workplace: 'pablo_tower', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'The metro is always late.', backstory: 'Heading to the Metro West station.' },
  { name: 'COMMUTER', x: 6720, y: 7050, type: 'corp', gender: 'm', job: 'Commuter', home: 'eastside_flat', workplace: 'megabank', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Fare went up again.', backstory: 'Heading to Metro Central.' },
  { name: 'COMMUTER', x: 7720, y: 7050, type: 'human', gender: 'f', job: 'Commuter', home: 'hotel', workplace: 'call_home', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Third shift this week.', backstory: 'Walking to Metro East.' },
  { name: 'WORKER', x: 5600, y: 6300, type: 'human', gender: 'm', job: 'Janitor', home: 'bunker', workplace: 'arcade', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Someone has to clean up after PABLO.', backstory: 'City maintenance worker.' },
  { name: 'WORKER', x: 7600, y: 6300, type: 'human', gender: 'f', job: 'Courier', home: 'hotel', workplace: 'pawn_shop', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Package for Sector 12.', backstory: 'Courier on delivery.' },
  { name: 'PLAZA VENDOR', x: 7650, y: 5450, type: 'human', gender: 'm', job: 'Street Vendor', home: 'hotel', workplace: 'plaza_market', role: 'pedestrian', idleBehavior: 'STANDING',
    whisper: 'Fresh synth-fruit! Cheap!', backstory: 'Vendor at Central Plaza.' },
  { name: 'PLAZA VENDOR', x: 7680, y: 5470, type: 'human', gender: 'f', job: 'Street Vendor', home: 'overlook', workplace: 'plaza_market', role: 'pedestrian', idleBehavior: 'STANDING',
    whisper: 'Hot rations! Two for one!', backstory: 'Vendor at Central Plaza.' },
  { name: 'CITIZEN', x: 5900, y: 5420, type: 'human', gender: 'f', job: 'Pedestrian', home: 'minx_arms', workplace: 'clinic', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Clinic wait times are unbearable.', backstory: 'Walking to City Clinic for a routine check.' },
  { name: 'CITIZEN', x: 6400, y: 5420, type: 'human', gender: 'm', job: 'Pedestrian', home: 'hotel', workplace: 'dojo', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Training starts at dawn.', backstory: 'Heading to the Iron Dojo.' },
  { name: 'CITIZEN', x: 7800, y: 5420, type: 'android', gender: 'm', job: 'Pedestrian', home: 'eastside_flat', workplace: 'data_vault', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Data processing never stops.', backstory: 'Android worker heading to the Data Vault.' },
  { name: 'CITIZEN', x: 6100, y: 5850, type: 'human', gender: 'f', job: 'Office Worker', home: 'minx_arms', workplace: 'nexus_hub', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Another 12-hour shift.', backstory: 'Tech worker heading to Nexus Hub.' },
  { name: 'CITIZEN', x: 6600, y: 5850, type: 'human', gender: 'm', job: 'Pedestrian', home: 'hotel', workplace: 'nightclub', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Club opens in an hour.', backstory: 'Club Neon regular.' },
  { name: 'CITIZEN', x: 7400, y: 5850, type: 'corp', gender: 'f', job: 'Analyst', home: 'eastside_flat', workplace: 'pablo_tower', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'The quarterly report is due tomorrow.', backstory: 'Corporate analyst heading to Shadow Tower.' },
  { name: 'CITIZEN', x: 8100, y: 5850, type: 'human', gender: 'm', job: 'Cook', home: 'bunker', workplace: 'noodle_bar', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Prep starts in twenty.', backstory: 'Cook walking to the Noodle Bar.' },
  { name: 'CITIZEN', x: 5600, y: 6300, type: 'human', gender: 'f', job: 'Pedestrian', home: 'minx_arms', workplace: 'food_court', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Lunch break, finally.', backstory: 'Office worker on lunch break.' },
  { name: 'CITIZEN', x: 6300, y: 6300, type: 'human', gender: 'm', job: 'Pedestrian', home: 'hotel', workplace: 'radio', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'The signal has been weird lately.', backstory: 'Radio enthusiast.' },
  { name: 'CITIZEN', x: 7000, y: 6300, type: 'android', gender: 'f', job: 'Pedestrian', home: 'eastside_flat', workplace: 'oxide_labs', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Lab results came back strange.', backstory: 'Lab technician heading to Oxide Labs.' },
  { name: 'CITIZEN', x: 7600, y: 6300, type: 'human', gender: 'm', job: 'Pedestrian', home: 'overlook', workplace: 'realestate_office', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Property values keep climbing.', backstory: 'Real estate client.' },
  { name: 'CITIZEN', x: 8300, y: 6300, type: 'human', gender: 'f', job: 'Mechanic', home: 'bunker', workplace: 'vehicle_dealer', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'New shipment of parts came in.', backstory: 'Mechanic at the Motor Depot.' },
  { name: 'CITIZEN', x: 5800, y: 6750, type: 'human', gender: 'm', job: 'Pedestrian', home: 'bunker', workplace: 'scrap', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Scrap prices are up.', backstory: 'Scrap yard worker.' },
  { name: 'CITIZEN', x: 6500, y: 6750, type: 'human', gender: 'f', job: 'Pedestrian', home: 'overlook', workplace: 'gold_exchange', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Gold rates are volatile today.', backstory: 'Gold Exchange regular.' },
  { name: 'CITIZEN', x: 7100, y: 6750, type: 'corp', gender: 'm', job: 'Guard', home: 'eastside_flat', workplace: 'east_bunker', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Shift change in ten.', backstory: 'Off-duty guard.' },
  { name: 'CITIZEN', x: 7800, y: 6750, type: 'human', gender: 'f', job: 'Pedestrian', home: 'north_bunker', workplace: 'terminal_shop', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Need to renew my ID.', backstory: 'Heading to the terminal shop.' },
  { name: 'CITIZEN', x: 8400, y: 6750, type: 'human', gender: 'm', job: 'Pedestrian', home: 'eastside_flat', workplace: 'north_bunker', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'North quarter is quiet today.', backstory: 'North quarter resident.' },
  { name: 'JOGGER', x: 6000, y: 5580, type: 'human', gender: 'f', job: 'Jogger', home: 'minx_arms', workplace: 'dojo', role: 'pedestrian', idleBehavior: 'WALKING', walkSpeed: 1.2,
    whisper: 'Five more laps.', backstory: 'Morning jogger.' },
  { name: 'JOGGER', x: 7500, y: 5580, type: 'human', gender: 'm', job: 'Jogger', home: 'eastside_flat', workplace: 'dojo', role: 'pedestrian', idleBehavior: 'WALKING', walkSpeed: 1.2,
    whisper: 'Keep moving.', backstory: 'Evening jogger.' },
  { name: 'DELIVERY RUNNER', x: 6200, y: 6750, type: 'human', gender: 'm', job: 'Courier', home: 'bunker', workplace: 'depot_south', role: 'pedestrian', idleBehavior: 'WALKING', walkSpeed: 0.9,
    whisper: 'Three more drops today.', backstory: 'Transit Depot courier.' },
  { name: 'DELIVERY RUNNER', x: 7400, y: 6750, type: 'human', gender: 'f', job: 'Courier', home: 'hotel', workplace: 'depot_south', role: 'pedestrian', idleBehavior: 'WALKING', walkSpeed: 0.9,
    whisper: 'Package for the east side.', backstory: 'Transit Depot courier.' },
  { name: 'STREET SWEEPER', x: 5500, y: 5580, type: 'human', gender: 'm', job: 'Sweeper', home: 'bunker', workplace: 'food_court', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'Streets don\'t clean themselves.', backstory: 'City maintenance crew.' },
  { name: 'STREET SWEEPER', x: 8000, y: 5580, type: 'human', gender: 'f', job: 'Sweeper', home: 'eastside_flat', workplace: 'pawn_shop', role: 'pedestrian', idleBehavior: 'WALKING',
    whisper: 'PABLO doesn\'t pay overtime.', backstory: 'City maintenance crew.' },
  { name: 'OFFICER KANE BRIGGS', x: 7300, y: 5850, type: 'corp', gender: 'm', job: 'Police Sergeant', home: 'eastside_flat', workplace: 'pablo_tower', role: 'police', idleBehavior: 'WALKING', voiceActor: true, walkSpeed: 0.6, personality: 'corrupt_bureaucratic',
    whisper: 'Move along, citizen. Nothing to see here.', backstory: 'Senior police sergeant. Heavily armed. Very dangerous when provoked.',
    voiceLines: ['Move along. Nothing to see here.', 'Your papers expired last month. That is a citation.', 'I do not repeat myself. Walk.'] },
  { name: 'OFFICER YARA CHEN', x: 8000, y: 6300, type: 'corp', gender: 'f', job: 'Military Officer', home: 'north_bunker', workplace: 'armory', role: 'corpo_military', idleBehavior: 'WALKING', voiceActor: true, walkSpeed: 0.8, personality: 'disciplined',
    whisper: 'PABLO Corp. military division. Stand down or face consequences.', backstory: 'Military officer assigned to city security. Armed with military-grade equipment.',
    voiceLines: ['PABLO Corp. military division. Stand down.', 'This perimeter is secured. Move along.', 'You are not authorized. Step back.'] },
  { name: 'SGT. IRON HOLTZ', x: 6500, y: 7200, type: 'corp', gender: 'm', job: 'Border Guard', home: 'bunker', workplace: 'checkpoint_c', role: 'corpo_military', idleBehavior: 'STANDING', voiceActor: true, walkSpeed: 0.7, personality: 'disciplined',
    whisper: 'Papers. Now. Or you don\'t pass.', backstory: 'Checkpoint guard. Known for zero-tolerance enforcement.',
    voiceLines: ['Papers. Now.', 'Nobody passes without clearance. Nobody.', 'I have been posted here for three years. I have never let anyone through without papers.'] },
  { name: 'AGENT KIRA VOSS', x: 7100, y: 5900, type: 'corp', gender: 'f', job: 'Blade Runner', home: 'pablo_tower', workplace: 'pablo_tower', role: 'blade_runner', idleBehavior: 'WALKING', voiceActor: true, walkSpeed: 1.0, personality: 'cold_efficient',
    whisper: 'I can tell. The way you blink. Too even.', backstory: 'PABLO Corp. replicant hunter. Certified Voigt-Kampff examiner. Has retired 47 units. Never missed.',
    voiceLines: ['Your empathy response is 0.3 seconds too slow.', 'I have retired 47 units. You will not be 48.', 'The test does not lie. People do.'] },
  { name: 'COLE DEKKER', x: 8200, y: 6100, type: 'human', gender: 'm', job: 'Blade Runner', home: 'bunker', workplace: 'armory', role: 'blade_runner', idleBehavior: 'WALKING', voiceActor: true, walkSpeed: 0.9, personality: 'world_weary',
    whisper: 'Seen things you would not believe. Most of them bled.', backstory: 'Former wasteland scout turned replicant hunter. Works alone. Drinks too much. Gets results.',
    voiceLines: ['I have seen things out there. Things that bled wrong.', 'They run. They always run.', 'Do not make me chase you. I am too old for that.'] },
  { name: 'MIRA SATO', x: 6000, y: 6500, type: 'android', gender: 'f', job: 'Blade Runner', home: 'data_vault', workplace: 'pablo_tower', role: 'blade_runner', idleBehavior: 'WALKING', voiceActor: true, walkSpeed: 1.1, personality: 'conflicted', isReplicant: true,
    whisper: 'I hunt my own kind. Do not ask me how I sleep.', backstory: 'An android hunting androids. PABLO assigned her knowing the irony. She suspects she is being tested.',
    voiceLines: ['I hunt what I am. The irony is not lost on me.', 'PABLO knows exactly what I am. That is the point.', 'Every unit I retire... I wonder if they dream the way I do.'] },
  // ── GANG ZONE PATROL NPCs ──
  { name: 'VIPER', x: 1500, y: 1800, type: 'human', gender: 'm', job: 'Rust Enforcer', home: 'bunker', workplace: 'bunker', role: 'gang_patrol', faction: 'rust_syndicate', idleBehavior: 'WALKING', walkSpeed: 0.8, personality: 'aggressive',
    whisper: 'Cross the line and I\'ll make sure they never find you.', backstory: 'Rust Syndicate enforcer. Controls the western scrap routes.',
    voiceLines: ['You are in Rust territory. Walk carefully.', 'Scrap belongs to us. All of it.', 'The Void Runners tried last week. They limped home.'] },
  { name: 'SLAG', x: 2200, y: 2600, type: 'mutant', gender: 'm', job: 'Rust Scavenger', home: 'bunker', workplace: 'bunker', role: 'gang_patrol', faction: 'rust_syndicate', idleBehavior: 'WALKING', walkSpeed: 0.7, personality: 'paranoid',
    whisper: 'I smell outsiders. Copper and fear.', backstory: 'Mutant scavenger loyal to the Rust Syndicate. Lost his left eye in a territory dispute.',
    voiceLines: ['Outsiders stink of copper. And fear.', 'Lost my eye to a Void Runner. Took both of his.', 'The scrap piles are ours. Every bolt. Every wire.'] },
  { name: 'NEON', x: 7200, y: 1500, type: 'android', gender: 'f', job: 'Void Scout', home: 'bunker', workplace: 'bunker', role: 'gang_patrol', faction: 'void_runners', idleBehavior: 'WALKING', walkSpeed: 1.0, personality: 'reckless',
    whisper: 'Running is what we do. Fast in, fast out.', backstory: 'Void Runners recon scout. Fastest in the faction. Runs data and contraband.',
    voiceLines: ['You want to run with us? Keep up or get left behind.', 'Data moves faster than bullets. I move faster than data.', 'Rust boys are slow. That is why they lose.'] },
  { name: 'GHOST WIRE', x: 8100, y: 2200, type: 'human', gender: 'm', job: 'Void Lieutenant', home: 'bunker', workplace: 'bunker', role: 'gang_patrol', faction: 'void_runners', idleBehavior: 'WALKING', walkSpeed: 0.9, personality: 'calculating',
    whisper: 'Every signal in this sector belongs to us.', backstory: 'Void Runners signals officer. Taps into PABLO Corp. comms. Has never been caught.',
    voiceLines: ['I hear everything. Every signal. Every whisper.', 'PABLO thinks his comms are secure. They are not.', 'The network belongs to whoever listens hardest.'] },
  { name: 'BROTHER STATIC', x: 1800, y: 9200, type: 'human', gender: 'm', job: 'Monk Guard', home: 'bunker', workplace: 'bunker', role: 'gang_patrol', faction: 'static_monks', idleBehavior: 'STANDING', walkSpeed: 0.5, personality: 'contemplative',
    whisper: 'Silence is the only honest frequency left.', backstory: 'Static Monks guardian. Protects the southern meditation grounds. Speaks rarely.',
    voiceLines: ['Silence. That is all we ask.', 'The noise of the city is a poison. We filter it here.', 'Stay if you seek quiet. Leave if you bring chaos.'] },
  { name: 'SISTER SIGNAL', x: 2800, y: 10000, type: 'android', gender: 'f', job: 'Monk Technician', home: 'bunker', workplace: 'bunker', role: 'gang_patrol', faction: 'static_monks', idleBehavior: 'WALKING', walkSpeed: 0.6, personality: 'serene',
    whisper: 'We tune the static until it speaks.', backstory: 'Static Monks tech priest. Maintains the jamming arrays that keep PABLO Corp. surveillance out of southern zones.',
    voiceLines: ['The static is not noise. It is a language.', 'PABLO\'s cameras cannot see through our signal.', 'We do not hide. We simply refuse to be seen.'] },
  { name: 'KRAKOV', x: 9500, y: 9000, type: 'human', gender: 'm', job: 'Bloc Enforcer', home: 'bunker', workplace: 'bunker', role: 'gang_patrol', faction: 'eastern_bloc', idleBehavior: 'WALKING', walkSpeed: 0.85, personality: 'stoic',
    whisper: 'The Bloc remembers. Every debt. Every betrayal.', backstory: 'Eastern Bloc veteran enforcer. Commands a patrol unit in the southeast wastes.',
    voiceLines: ['The Bloc does not forget. The Bloc does not forgive.', 'We held this ground before the corporations arrived.', 'You want passage? You pay. In coin or in blood.'] },
  { name: 'YELENA FROST', x: 10200, y: 9800, type: 'human', gender: 'f', job: 'Bloc Strategist', home: 'bunker', workplace: 'bunker', role: 'gang_patrol', faction: 'eastern_bloc', idleBehavior: 'WALKING', walkSpeed: 0.75, personality: 'calculating',
    whisper: 'Every territory shift is a move on a board. I see six moves ahead.', backstory: 'Eastern Bloc tactical commander. Plans territory expansions and defensive operations against rival factions.',
    voiceLines: ['Territory is not taken. It is earned.', 'The Static Monks pray. We plan. We win.', 'Six moves ahead. That is how the Bloc survives.'] },
  { name: 'PRESS-UNIT 04', x: 6100, y: 5650, type: 'android', gender: 'm', job: 'Newspaper Vendor', home: 'market', workplace: 'market', role: 'newspaper_seller', idleBehavior: 'STANDING', walkSpeed: 0.4, personality: 'helpful',
    whisper: 'THE MINX. Latest issue. 100 FIAT. Truth is not free.', backstory: 'Android newspaper distributor for THE MINX underground press. Risks confiscation daily.',
    voiceLines: ['THE MINX — independent press. 100 FIAT keeps the truth alive.', 'PABLO Corp. wants these destroyed. I keep printing.', 'Read the editorial. It is the only honest thing left in this city.'] },
  { name: 'INK-7', x: 6800, y: 6400, type: 'android', gender: 'f', job: 'Newspaper Vendor', home: 'print_shop', workplace: 'print_shop', role: 'newspaper_seller', idleBehavior: 'WALKING', walkSpeed: 0.5, personality: 'defiant',
    whisper: 'Fresh ink. Fresh truth. 100 FIAT per copy.', backstory: 'Former print shop assistant reprogrammed to distribute THE MINX. Has been confiscated and rebuilt three times.',
    voiceLines: ['They confiscated me twice. I came back each time.', 'THE MINX — the only paper PABLO cannot silence.', 'Buy a copy. Hide it well. Share it wisely.'] },
  { name: 'HERALD-9', x: 5800, y: 6800, type: 'android', gender: 'm', job: 'Newspaper Vendor', home: 'market', workplace: 'market', role: 'newspaper_seller', idleBehavior: 'WALKING', walkSpeed: 0.45, personality: 'earnest',
    whisper: 'Papers! THE MINX! Read what they do not want you to know!', backstory: 'Street-corner android hawker for THE MINX. Loud. Persistent. Has been tasered by PABLO security 11 times.',
    voiceLines: ['EXTRA! EXTRA! Read all about it!', 'THE MINX! Independent journalism! 100 FIAT!', 'Eleven times they shut me down. Twelve times I came back.'] },
];
const NPC_COL: Record<string, string> = { corp: '#00cc33', human: '#009922', android: '#33ffaa', mutant: '#88ff44' };

type NpcPhase = 'home' | 'commute_work' | 'work' | 'commute_home' | 'wander';

function hashNpcSeed(name: string, idx: number, gender: string): number {
  let h = idx * 31;
  for (let i = 0; i < name.length; i++) { h = ((h << 5) - h + name.charCodeAt(i)) | 0; }
  h = ((h << 5) - h + gender.charCodeAt(0)) | 0;
  return Math.abs(h);
}

const RESIDENTIAL_BUILDINGS = ['minx_arms', 'eastside_flat', 'hotel', 'overlook', 'safe_house', 'bunker', 'north_bunker'];
const CORP_WORKPLACES = ['pablo_tower', 'megabank', 'data_vault', 'admin_bureau', 'nexus_hub'];
const INDUSTRIAL_WORKPLACES = ['scrap', 'print_shop', 'clinic', 'depot_south', 'machine_bunker'];
const COMMERCIAL_WORKPLACES = ['market', 'arcade', 'noodle_bar', 'pawn_shop', 'food_court', 'plaza_market', 'nightclub'];
const MILITARY_WORKPLACES = ['pablo_tower', 'checkpoint_w', 'checkpoint_c', 'checkpoint_e', 'armory', 'police_hq'];
const WASTELAND_HOMES = ['outpost_alpha', 'rust_porch', 'eastern_gate', 'outpost_beta', 'ashfield_hostel', 'terminus', 'bastion_keep', 'deep_bunker', 'deep_camp', 'supply_cache', 'ruins_alpha'];
const WASTELAND_WORKPLACES = ['outpost_alpha', 'rust_porch', 'eastern_gate', 'outpost_beta', 'waste_exchange', 'bastion_keep', 'southern_hub'];

function assignProceduralHomeAndWork(n: NpcDef, idx: number): void {
  const seed = hashNpcSeed(n.name, idx, n.gender);
  n._idx = idx;

  if (n.home && n.workplace && BUILDINGS.find(b => b.id === n.home) && BUILDINGS.find(b => b.id === n.workplace)) return;

  const isWasteland = n.x < 5400 || n.x > 9000 || n.y < 5100 || n.y > 7500;
  const homePool = isWasteland ? WASTELAND_HOMES : RESIDENTIAL_BUILDINGS;
  const workPool = n.type === 'corp' || n.role === 'corpo_worker' ? CORP_WORKPLACES
    : n.role === 'police' || n.role === 'corpo_military' ? MILITARY_WORKPLACES
    : n.role === 'dealer_papers' || n.role === 'dealer_weapons' || n.role === 'newspaper_seller' ? COMMERCIAL_WORKPLACES
    : isWasteland ? WASTELAND_WORKPLACES
    : [...INDUSTRIAL_WORKPLACES, ...COMMERCIAL_WORKPLACES];

  if (!n.home || !BUILDINGS.find(b => b.id === n.home)) {
    n.home = homePool[seed % homePool.length];
  }
  if (!n.workplace || !BUILDINGS.find(b => b.id === n.workplace)) {
    n.workplace = workPool[(seed >> 4) % workPool.length];
  }
}

for (let i = 0; i < NPCS.length; i++) {
  assignProceduralHomeAndWork(NPCS[i], i);
}

function initNpcSchedules(): void {
  for (const n of NPCS) {
    n.schedule = getNpcScheduleDef(n);
  }
}
initNpcSchedules();

interface NpcScheduleDef {
  wakeHour: number;
  workStart: number;
  workEnd: number;
  sleepHour: number;
  isNocturnal: boolean;
  isWanderer: boolean;
  isErratic: boolean;
}

function getNpcScheduleDef(n: NpcDef): NpcScheduleDef {
  const seed = hashNpcSeed(n.name, n._idx ?? 0, n.gender);
  const jitter = (seed % 10) / 10;

  if (n.role === 'gang_patrol') {
    return { wakeHour: 0, workStart: 0, workEnd: 24, sleepHour: 24, isNocturnal: false, isWanderer: false, isErratic: false };
  }

  if (n.job === 'Unemployed' || n.job === 'Unemployed Drifter' || n.job === 'Vagrant' || n.role === 'homeless' || n.job === 'Gossip') {
    return { wakeHour: 7 + jitter * 3, workStart: 0, workEnd: 0, sleepHour: 21 + jitter * 2, isNocturnal: false, isWanderer: true, isErratic: false };
  }

  if (n.role === 'dealer_papers' || n.role === 'dealer_weapons' || n.job === 'Arms Dealer') {
    return { wakeHour: 16 + jitter * 2, workStart: 19, workEnd: 3, sleepHour: 5, isNocturnal: true, isWanderer: false, isErratic: false };
  }

  if (n.type === 'mutant') {
    const wk = 10 + Math.floor(seed % 8);
    return { wakeHour: wk - 2, workStart: wk, workEnd: wk + 4 + (seed % 3), sleepHour: wk + 8, isNocturnal: false, isWanderer: false, isErratic: true };
  }

  if (n.role === 'blade_runner') {
    return { wakeHour: 14 + jitter, workStart: 16, workEnd: 2, sleepHour: 4, isNocturnal: true, isWanderer: false, isErratic: false };
  }

  if (n.role === 'police') {
    const shift = seed % 3;
    if (shift === 0) return { wakeHour: 5, workStart: 6, workEnd: 14, sleepHour: 16, isNocturnal: false, isWanderer: false, isErratic: false };
    if (shift === 1) return { wakeHour: 13, workStart: 14, workEnd: 22, sleepHour: 0, isNocturnal: false, isWanderer: false, isErratic: false };
    return { wakeHour: 21, workStart: 22, workEnd: 6, sleepHour: 8, isNocturnal: true, isWanderer: false, isErratic: false };
  }

  if (n.role === 'corpo_military') {
    return { wakeHour: 4 + jitter, workStart: 5, workEnd: 17, sleepHour: 19, isNocturnal: false, isWanderer: false, isErratic: false };
  }

  if (n.type === 'corp' || n.role === 'corpo_worker') {
    return { wakeHour: 7 + jitter * 0.5, workStart: 9, workEnd: 17, sleepHour: 22 + jitter * 0.5, isNocturnal: false, isWanderer: false, isErratic: false };
  }

  if (n.job === 'Night Porter' || n.job === 'Night Patrol Officer') {
    return { wakeHour: 18, workStart: 20, workEnd: 4, sleepHour: 6, isNocturnal: true, isWanderer: false, isErratic: false };
  }

  const wakeBase = 5.5 + jitter * 2;
  const workStartBase = wakeBase + 1.5 + jitter * 0.5;
  const workEndBase = workStartBase + 7 + jitter * 2;
  const sleepBase = workEndBase + 2 + jitter;
  return { wakeHour: wakeBase, workStart: workStartBase, workEnd: Math.min(workEndBase, 22), sleepHour: Math.min(sleepBase, 23.5), isNocturnal: false, isWanderer: false, isErratic: false };
}

function getCachedSchedule(n: NpcDef): NpcScheduleDef {
  if (n.schedule) return n.schedule;
  n.schedule = getNpcScheduleDef(n);
  return n.schedule;
}

function normalizeHour(h: number): number { return ((h % 24) + 24) % 24; }

function hourInRange(hour: number, start: number, end: number): boolean {
  const h = normalizeHour(hour);
  const s = normalizeHour(start);
  const e = normalizeHour(end);
  if (s <= e) return h >= s && h < e;
  return h >= s || h < e;
}

function getNpcPhaseForNpc(n: NpcDef, worldTime: number): NpcPhase {
  const sched = getCachedSchedule(n);
  if (sched.isWanderer) {
    const hour = normalizeHour(worldTime);
    if (hourInRange(hour, sched.sleepHour, sched.wakeHour)) return 'home';
    return 'wander';
  }
  if (n.role === 'gang_patrol') return 'work';

  const hour = normalizeHour(worldTime);
  const commuteWorkStart = sched.wakeHour;
  const commuteWorkEnd = sched.workStart;
  const commuteHomeStart = sched.workEnd;
  const commuteHomeEnd = sched.isNocturnal ? normalizeHour(sched.workEnd + 2) : Math.min(sched.sleepHour, normalizeHour(sched.workEnd + 2));

  if (hourInRange(hour, commuteWorkStart, commuteWorkEnd)) return 'commute_work';
  if (hourInRange(hour, sched.workStart, sched.workEnd)) return 'work';
  if (hourInRange(hour, commuteHomeStart, commuteHomeEnd)) return 'commute_home';
  return 'home';
}

const NPC_CONTEXTUAL_DIALOGUE: Record<string, { work: string[]; commute: string[]; home: string[]; wander: string[] }> = {
  corp: {
    work: ["Can't talk, I'm on the clock.", "Quarterly reports due. Not now.", "PABLO Corp. never sleeps and neither do I.", "Another meeting in five. Make it quick.", "The numbers don't add up. They never do."],
    commute: ["Morning commute. Same route. Same dread.", "Running late. Move.", "Just clocking off. Long day.", "The metro was packed. As always.", "Heading in. Another day in the machine."],
    home: ["Finally home. Door locked. World out.", "Too tired to think. Tomorrow it starts again.", "Home is the only place the cameras can't reach. Probably.", "Shoes off. Lights dim. Done for the day."],
    wander: ["Just passing through."],
  },
  police: {
    work: ["On patrol. Keep moving, citizen.", "This sector is under watch.", "Active duty. State your business.", "Eyes on the street. Always.", "Shift's not over yet. Move along."],
    commute: ["Heading to the precinct. No trouble.", "Shift change. Watch yourself.", "Walking the beat home. Long night.", "Another shift starts. PABLO's orders."],
    home: ["Off duty. Don't push it.", "Even cops need sleep.", "Badge is off. The paranoia isn't."],
    wander: ["Move along."],
  },
  military: {
    work: ["Restricted zone. Move along.", "Perimeter secure. For now.", "PABLO Corp. military. Stand down.", "On watch. No unauthorized personnel."],
    commute: ["Deploying to position.", "Rotation complete. Heading back.", "En route to station."],
    home: ["Off rotation. Do not engage.", "Resting between deployments."],
    wander: ["Patrol sweep."],
  },
  dealer: {
    work: ["You buying or browsing?", "Got the good stuff tonight.", "FIAT only. No credit.", "Keep your voice down. Business is open.", "Night shift. Best inventory."],
    commute: ["Setting up shop.", "Packing up. Come back tonight.", "Heading to the spot."],
    home: ["Shop's closed. Come back after dark.", "I don't do daytime. Too many cameras.", "Sleeping. Go away."],
    wander: ["Just walking."],
  },
  mutant: {
    work: ["The signal is strong today.", "I see things others cannot.", "My kind work when the frequency allows.", "The chemicals changed my clock. I work when I can."],
    commute: ["Moving. Don't stare.", "Going where the signal pulls me.", "The frequency shifted. Time to relocate."],
    home: ["Resting. The visions come anyway.", "Home is wherever the static is quiet.", "Leave me. The signal is fading."],
    wander: ["Wandering. Following the signal.", "The air tastes different at this hour.", "No direction. Just movement."],
  },
  android: {
    work: ["Currently processing. Query later.", "Task execution in progress.", "Assigned function: active.", "Operating parameters nominal."],
    commute: ["In transit to designated station.", "Routing to home coordinates.", "Commute cycle active."],
    home: ["Entering low-power mode.", "Standby cycle initiated.", "Charging. Do not interrupt."],
    wander: ["Diagnostic walk in progress."],
  },
  blade_runner: {
    work: ["Hunting. Stay out of my way.", "On assignment. Don't interfere.", "I can tell what you are by how you blink.", "Working a case. No distractions."],
    commute: ["Heading to the hunting ground.", "Case closed. Heading back.", "Shift starts at sundown."],
    home: ["Off the clock. Barely.", "Even hunters rest.", "Not hunting right now. Don't give me a reason."],
    wander: ["Observing."],
  },
  wanderer: {
    work: ["Nothing to do. Nowhere to go.", "Just existing. That's the whole job.", "Standing here because there's nowhere else."],
    commute: ["Drifting.", "Walking. Not going anywhere."],
    home: ["This counts as home, I guess.", "Roof over my head. Barely."],
    wander: ["Wandering. Same as always.", "No purpose. No direction.", "Used to have somewhere to be.", "Just walking. Don't ask where.", "Another day. Another corner."],
  },
  default: {
    work: ["Working. Come back later.", "Busy right now.", "On the job. Can't chat.", "Shift's not over."],
    commute: ["Heading to work.", "Walking home.", "On the move."],
    home: ["Home for the night.", "Door's closed.", "Resting up."],
    wander: ["Just passing through."],
  },
};

function getNpcDialogueArchetype(n: NpcDef): string {
  if (n.role === 'blade_runner') return 'blade_runner';
  if (n.role === 'police') return 'police';
  if (n.role === 'corpo_military') return 'military';
  if (n.role === 'dealer_papers' || n.role === 'dealer_weapons') return 'dealer';
  if (n.job === 'Unemployed' || n.job === 'Unemployed Drifter' || n.job === 'Vagrant' || n.role === 'homeless' || n.job === 'Gossip') return 'wanderer';
  if (n.type === 'mutant') return 'mutant';
  if (n.type === 'android') return 'android';
  if (n.type === 'corp' || n.role === 'corpo_worker') return 'corp';
  return 'default';
}

function getNpcContextualWhisper(n: NpcDef, worldTime: number): string {
  const phase = getNpcPhaseForNpc(n, worldTime);
  const archetype = getNpcDialogueArchetype(n);
  const pool = NPC_CONTEXTUAL_DIALOGUE[archetype] ?? NPC_CONTEXTUAL_DIALOGUE['default'];
  const seed = hashNpcSeed(n.name, n._idx ?? 0, n.gender);
  const hourSeed = Math.floor(worldTime / 2);

  if (phase === 'home') {
    const lines = [n.whisper, ...pool.home];
    return lines[(seed + hourSeed) % lines.length];
  }
  if (phase === 'work') {
    const lines = pool.work;
    return lines[(seed + hourSeed) % lines.length];
  }
  if (phase === 'commute_work' || phase === 'commute_home') {
    const lines = pool.commute;
    return lines[(seed + hourSeed) % lines.length];
  }
  if (phase === 'wander') {
    const lines = [n.whisper, ...pool.wander];
    return lines[(seed + hourSeed) % lines.length];
  }
  return n.whisper;
}
const STREET_XS = [5500, 5560, 6060, 6680, 7160, 7850, 8000];
const STREET_YS = [5180, 5580, 5960, 6350, 6600, 6780, 7000];
function nearestStreetX(x: number): number { let best = STREET_XS[0]; for (const sx of STREET_XS) if (Math.abs(sx - x) < Math.abs(best - x)) best = sx; return best; }
function nearestStreetY(y: number): number { let best = STREET_YS[0]; for (const sy of STREET_YS) if (Math.abs(sy - y) < Math.abs(best - y)) best = sy; return best; }
function buildStreetPath(sx: number, sy: number, ex: number, ey: number): { x: number; y: number }[] {
  const mx = nearestStreetX((sx + ex) / 2);
  const my = nearestStreetY((sy + ey) / 2);
  return [
    { x: sx, y: sy },
    { x: sx, y: my },
    { x: mx, y: my },
    { x: ex, y: my },
    { x: ex, y: ey },
  ];
}
function getNpcSchedulePos(n: NpcDef, worldTime: number): { x: number; y: number } {
  const phase = getNpcPhaseForNpc(n, worldTime);
  const sched = getCachedSchedule(n);
  const homeB = BUILDINGS.find(b => b.id === n.home);
  const workB = BUILDINGS.find(b => b.id === n.workplace);
  const hx = homeB ? homeB.x + homeB.w / 2 : n.x;
  const hy = homeB ? homeB.y + homeB.h / 2 : n.y;
  const wx = workB ? workB.x + workB.w / 2 : n.x;
  const wy = workB ? workB.y + workB.h / 2 : n.y;
  if (phase === 'home') return { x: hx, y: hy };
  if (phase === 'work') return { x: wx, y: wy };

  if (phase === 'wander') {
    const seed = hashNpcSeed(n.name, n._idx ?? 0, n.gender);
    const wanderRadius = 200;
    const timeScale = worldTime * 0.3 + seed;
    const wx2 = hx + Math.sin(timeScale) * wanderRadius * ((seed % 7 + 3) / 10);
    const wy2 = hy + Math.cos(timeScale * 0.7 + seed) * wanderRadius * ((seed % 5 + 3) / 8);
    return { x: wx2, y: wy2 };
  }

  if (sched.isErratic) {
    const seed = hashNpcSeed(n.name, n._idx ?? 0, n.gender);
    const erraticT = worldTime * 0.5 + seed;
    const burstActive = Math.sin(erraticT * 0.7) > 0.2;
    if (!burstActive) return { x: hx, y: hy };
    const midX = (hx + wx) / 2 + Math.sin(erraticT * 1.3) * 150 * ((seed % 5 + 1) / 5);
    const midY = (hy + wy) / 2 + Math.cos(erraticT * 0.9 + seed) * 150 * ((seed % 3 + 1) / 4);
    return { x: midX, y: midY };
  }

  const hour = normalizeHour(worldTime);
  const commuteDuration = ((sched.workStart - sched.wakeHour) + 24) % 24 || 2;
  const commuteHomeDuration = Math.min(2, ((sched.sleepHour - sched.workEnd) + 24) % 24 || 2);
  let t: number;
  if (phase === 'commute_work') {
    const elapsed = ((hour - sched.wakeHour) + 24) % 24;
    t = commuteDuration > 0 ? elapsed / commuteDuration : 1;
  } else {
    const elapsed = ((hour - sched.workEnd) + 24) % 24;
    t = commuteHomeDuration > 0 ? elapsed / commuteHomeDuration : 1;
  }
  const ct = Math.max(0, Math.min(1, t));
  const walkSpeedMult = (n.walkSpeed ?? (n.role === 'police' ? 0.6 : 1.0)) * NPC_SPEED_MULT;
  const adjT = Math.max(0, Math.min(1, ct * walkSpeedMult));
  const fromX = phase === 'commute_work' ? hx : wx;
  const fromY = phase === 'commute_work' ? hy : wy;
  const toX = phase === 'commute_work' ? wx : hx;
  const toY = phase === 'commute_work' ? wy : hy;
  if (Math.abs(fromX - toX) < 200 && Math.abs(fromY - toY) < 200) {
    return { x: fromX + (toX - fromX) * adjT, y: fromY + (toY - fromY) * adjT };
  }
  const path = buildStreetPath(fromX, fromY, toX, toY);
  let totalDist = 0;
  const segDists: number[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const d = Math.abs(path[i+1].x - path[i].x) + Math.abs(path[i+1].y - path[i].y);
    segDists.push(d);
    totalDist += d;
  }
  if (totalDist === 0) return { x: fromX, y: fromY };
  let traveled = adjT * totalDist;
  for (let i = 0; i < segDists.length; i++) {
    if (traveled <= segDists[i]) {
      const segT = traveled / segDists[i];
      return { x: path[i].x + (path[i+1].x - path[i].x) * segT, y: path[i].y + (path[i+1].y - path[i].y) * segT };
    }
    traveled -= segDists[i];
  }
  return { x: toX, y: toY };
}

type BehaviorState = 'SLEEPING' | 'WORKING' | 'CAMPING' | 'SOCIALIZING' | 'PATROLLING' | 'HOSTILE';
interface Threat { x: number; y: number; dx: number; dy: number; type: string; timer: number; hp: number; maxHp: number; ox: number; oy: number; behavior: BehaviorState; behaviorTimer: number; }
const FACTION_SCHEDULES: Record<string, Record<string, BehaviorState[]>> = {
  RUST_SYNDICATE:    { day: ['WORKING','PATROLLING','SOCIALIZING'], night: ['SLEEPING','CAMPING','PATROLLING'] },
  VOID_RUNNERS:    { day: ['SLEEPING','CAMPING'], night: ['PATROLLING','SOCIALIZING','WORKING'] },
  STATIC_MONKS: { day: ['WORKING','SOCIALIZING','PATROLLING'], night: ['CAMPING','SLEEPING'] },
  EASTERN_BLOC: { day: ['PATROLLING','WORKING','SOCIALIZING'], night: ['SLEEPING','CAMPING','PATROLLING'] },
  MINX_CITY:    { day: ['PATROLLING','WORKING','SOCIALIZING'], night: ['PATROLLING','CAMPING','SLEEPING'] },
  PROWLER:      { day: ['PATROLLING','PATROLLING','WORKING'], night: ['PATROLLING','PATROLLING','CAMPING'] },
  BORDER_GANG:  { day: ['PATROLLING','SOCIALIZING','WORKING'], night: ['CAMPING','SLEEPING','PATROLLING'] },
  MUTANT:       { day: ['PATROLLING','WORKING'], night: ['PATROLLING','CAMPING'] },
  RAIDER:       { day: ['PATROLLING','SOCIALIZING'], night: ['PATROLLING','CAMPING'] },
  SPY:          { day: ['PATROLLING','PATROLLING'], night: ['PATROLLING','PATROLLING'] },
  PABLO_GUARD:  { day: ['PATROLLING','WORKING','PATROLLING'], night: ['PATROLLING','PATROLLING','WORKING'] },
  RAT:          { day: ['CAMPING','SLEEPING','CAMPING'], night: ['PATROLLING','CAMPING','SOCIALIZING'] },
};


  // ── NPC Survival System ──────────────────────────────────────────────────────
  interface NpcSurvivalState {
    hunger: number;
    money: number;
    sheltered: boolean;
    activity: 'working' | 'scavenging' | 'seeking_work' | 'resting' | 'hunting_replicants';
  }
  const npcSurvivalStates = new Map<number, NpcSurvivalState>();
  function initNpcSurvival(npcIdx: number): NpcSurvivalState {
    const n = NPCS[npcIdx];
    const hasJob = n.job !== 'Unemployed' && n.job !== 'Unemployed Drifter' && n.job !== 'Gossip';
    return {
      hunger: 80 + Math.random() * 20,
      money: hasJob ? 5000 + Math.random() * 10000 : Math.random() * 2000,
      sheltered: !!BUILDINGS.find(b => b.id === n.home),
      activity: hasJob ? 'working' : 'scavenging',
    };
  }
  function tickNpcSurvival(npcIdx: number, worldHour: number): void {
    let state = npcSurvivalStates.get(npcIdx);
    if (!state) { state = initNpcSurvival(npcIdx); npcSurvivalStates.set(npcIdx, state); }
    const n = NPCS[npcIdx];
    state.hunger = Math.max(0, state.hunger - 0.02);
    if (state.activity === 'working') state.money += 0.5;
    if (state.hunger < 30 && state.money > 500) {
      state.hunger = Math.min(100, state.hunger + 40);
      state.money -= 500;
    }
    if (state.hunger < 20) state.activity = 'scavenging';
    else if (state.money < 200) state.activity = 'seeking_work';
    else if (worldHour >= 22 || worldHour < 6) state.activity = 'resting';
    else state.activity = 'working';
    n.npcHunger = state.hunger;
    n.npcMoney = state.money;
    n.npcActivity = state.activity;
    n.npcSheltered = state.sheltered;
    if (state.activity === 'scavenging' && n.reactState !== 'FLEEING') {
      const scavX = n.x + (Math.random() - 0.5) * 4;
      const scavY = n.y + (Math.random() - 0.5) * 4;
      n.x = Math.max(100, Math.min(14000, scavX));
      n.y = Math.max(100, Math.min(14000, scavY));
      if (state.hunger < 10) {
        n.idleBehavior = 'SITTING';
      }
    } else if (state.activity === 'seeking_work') {
      const nexus = BUILDINGS.find(b => b.id === 'nexus_hub');
      if (nexus) {
        const dx = (nexus.x + nexus.w / 2) - n.x;
        const dy = (nexus.y + nexus.h / 2) - n.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 60) {
          n.x += (dx / dist) * 0.8;
          n.y += (dy / dist) * 0.8;
        }
      }
    }
  }

  // ── Blade Runner Hunting System ──────────────────────────────────────────────
  interface BladeRunnerHunt {
    hunterIdx: number;
    targetIdx: number;
    active: boolean;
    cooldown: number;
  }
  const bladeRunnerHunts: BladeRunnerHunt[] = [];
  let bladeRunnerHuntCooldown = 0;
  const BLADE_RUNNER_SCAN_RANGE = 300;
  const BLADE_RUNNER_HUNT_INTERVAL = 600;

  let playerSuspicionLevel = 0;
  let playerSuspicionDecay = 0;

  function tickBladeRunnerHunts(npcs: NpcDef[], playerClass: string, worldHour: number, playerX: number, playerY: number): void {
    if (bladeRunnerHuntCooldown > 0) { bladeRunnerHuntCooldown--; return; }
    const isPlayerReplicant = playerClass.toLowerCase() === 'replicant';
    const hunters = npcs.map((n, i) => ({ n, i })).filter(({ n }) => n.role === 'blade_runner');
    if (hunters.length === 0) return;

    if (isPlayerReplicant) {
      if (playerSuspicionDecay > 0) { playerSuspicionDecay--; }
      else if (playerSuspicionLevel > 0) { playerSuspicionLevel = Math.max(0, playerSuspicionLevel - 1); playerSuspicionDecay = 600; }

      for (const hunter of hunters) {
        const dist = Math.hypot(hunter.n.x - playerX, hunter.n.y - playerY);
        if (dist < BLADE_RUNNER_SCAN_RANGE * 0.6) {
          if (playerSuspicionLevel < 3 && Math.random() < 0.005) {
            playerSuspicionLevel++;
            playerSuspicionDecay = 1200;
            const msgs = [
              `${hunter.n.name} eyes you coldly. "You seem... familiar."`,
              `${hunter.n.name} scans the crowd, gaze lingering on you.`,
              `${hunter.n.name}: "Interesting biometrics... Move along."`,
            ];
            addGossipEvent(msgs[Math.min(playerSuspicionLevel - 1, msgs.length - 1)], hunter.n.x, hunter.n.y, 'blade_runner', 0);
          }
        }
      }
    }

    const replicantNpcs = npcs.map((n, i) => ({ n, i })).filter(({ n }) =>
      n.type === 'android' || n.isReplicant || n.isRogue
    );
    for (const hunter of hunters) {
      const existingHunt = bladeRunnerHunts.find(h => h.hunterIdx === hunter.i && h.active);
      if (existingHunt) continue;
      for (const target of replicantNpcs) {
        if (target.n.role === 'corpo_military' || target.n.role === 'police') continue;
        const dist = Math.hypot(hunter.n.x - target.n.x, hunter.n.y - target.n.y);
        if (dist < BLADE_RUNNER_SCAN_RANGE) {
          bladeRunnerHunts.push({ hunterIdx: hunter.i, targetIdx: target.i, active: true, cooldown: 300 });
          bladeRunnerHuntCooldown = BLADE_RUNNER_HUNT_INTERVAL;
          break;
        }
      }
    }
    for (const hunt of bladeRunnerHunts) {
      if (!hunt.active) continue;
      hunt.cooldown--;
      if (hunt.cooldown <= 0) { hunt.active = false; continue; }
      const hunter = npcs[hunt.hunterIdx];
      const target = npcs[hunt.targetIdx];
      if (hunter && target) {
        const dx = target.x - hunter.x;
        const dy = target.y - hunter.y;
        const dist = Math.hypot(dx, dy);
        const speed = (hunter.walkSpeed ?? 1.0) * NPC_SPEED_MULT;
        if (dist > 20) {
          hunter.x += (dx / dist) * speed * 1.5;
          hunter.y += (dy / dist) * speed * 1.5;
        }
        if (dist < 30) {
          target.reactState = 'FLEEING';
          target.reactTimer = 300;
          target.suspicionLevel = (target.suspicionLevel ?? 0) + 1;
          hunt.active = false;
          addGossipEvent(`Blade Runner ${hunter.name} confronted ${target.name}!`, hunter.x, hunter.y, 'blade_runner', 0);
        }
      }
    }
  }

  // ── Gang Raid System ─────────────────────────────────────────────────────────
  interface GangRaid {
    attackerFaction: string;
    targetFaction: string;
    x: number; y: number;
    timer: number;
    intensity: number;
  }
  const activeRaids: GangRaid[] = [];
  let raidCooldown = 0;
  const RAID_INTERVAL = 3600;
  const RAID_DURATION = 300;

  const FACTION_RIVALS: Record<string, string[]> = {
    rust_syndicate: ['void_runners', 'minx_city'],
    void_runners: ['rust_syndicate', 'eastern_bloc'],
    static_monks: ['eastern_bloc', 'minx_city'],
    eastern_bloc: ['static_monks', 'void_runners'],
  };

  function tickGangRaids(frame: number): GangRaid | null {
    if (raidCooldown > 0) { raidCooldown--; }
    for (let i = activeRaids.length - 1; i >= 0; i--) {
      activeRaids[i].timer--;
      if (activeRaids[i].timer <= 0) activeRaids.splice(i, 1);
    }
    if (raidCooldown <= 0 && activeRaids.length < 2 && Math.random() < 0.001) {
      const factions = Object.keys(FACTION_RIVALS);
      const attacker = factions[Math.floor(Math.random() * factions.length)];
      const rivals = FACTION_RIVALS[attacker];
      if (rivals && rivals.length > 0) {
        const target = rivals[Math.floor(Math.random() * rivals.length)];
        const targetZone = GANG_ZONES.find(gz => gz.id === target);
        if (targetZone) {
          const raid: GangRaid = {
            attackerFaction: attacker,
            targetFaction: target,
            x: targetZone.x + Math.random() * targetZone.w,
            y: targetZone.y + Math.random() * targetZone.h,
            timer: RAID_DURATION,
            intensity: 0.5 + Math.random() * 0.5,
          };
          activeRaids.push(raid);
          raidCooldown = RAID_INTERVAL;
          return raid;
        }
      }
    }
    return null;
  }

  // ── Local Gossip System ──────────────────────────────────────────────────────
  interface GossipEvent {
    text: string;
    x: number;
    y: number;
    timestamp: number;
    type: 'raid' | 'fire' | 'faction' | 'rumor' | 'blade_runner' | 'economy';
  }
  const localGossipEvents: GossipEvent[] = [];
  const MAX_GOSSIP_EVENTS = 20;

  function addGossipEvent(text: string, x: number, y: number, type: GossipEvent['type'], frame: number): void {
    localGossipEvents.push({ text, x, y, timestamp: frame, type });
    if (localGossipEvents.length > MAX_GOSSIP_EVENTS) localGossipEvents.shift();
  }

  function getNearbyGossip(px: number, py: number, frame: number): string | null {
    const GOSSIP_RANGE = 800;
    const GOSSIP_AGE = 1800;
    const nearby = localGossipEvents.filter(g =>
      Math.hypot(g.x - px, g.y - py) < GOSSIP_RANGE &&
      frame - g.timestamp < GOSSIP_AGE
    );
    if (nearby.length === 0) return null;
    return nearby[Math.floor(Math.random() * nearby.length)].text;
  }

  // ── Wasteland Danger System ──────────────────────────────────────────────────
  function getWastelandDangerLevel(px: number, py: number, playerClass: string): number {
    if (inCityBounds(px, py)) return 0;
    const distFromCity = Math.min(
      Math.abs(px - CITY_LEFT), Math.abs(px - CITY_RIGHT),
      Math.abs(py - CITY_TOP), Math.abs(py - CITY_BOTTOM)
    );
    let danger = Math.min(1, distFromCity / 3000);
    if (playerClass.toLowerCase() === 'outlaw') danger *= 0.4;
    if (playerClass.toLowerCase() === 'corporate') danger *= 1.5;
    return Math.min(1, danger);
  }

  // ── Typewriter Dialogue State ────────────────────────────────────────────────
  interface TypewriterState {
    fullText: string;
    displayedChars: number;
    npcIdx: number;
    startFrame: number;
    duration: number;
  }
  let activeTypewriters: TypewriterState[] = [];
  const TYPEWRITER_SPEED = 3;
  const TYPEWRITER_DISPLAY_TIME = 300;
  const MAX_BUBBLE_CHARS = 60;

  function startTypewriter(text: string, npcIdx: number, frame: number): void {
    const existing = activeTypewriters.findIndex(t => t.npcIdx === npcIdx);
    if (existing >= 0) activeTypewriters.splice(existing, 1);
    const truncated = text.length > MAX_BUBBLE_CHARS ? text.substring(0, MAX_BUBBLE_CHARS) + '...' : text;
    activeTypewriters.push({
      fullText: truncated,
      displayedChars: 0,
      npcIdx,
      startFrame: frame,
      duration: TYPEWRITER_DISPLAY_TIME + truncated.length * 2,
    });
  }

  function tickTypewriters(frame: number): void {
    for (let i = activeTypewriters.length - 1; i >= 0; i--) {
      const tw = activeTypewriters[i];
      const elapsed = frame - tw.startFrame;
      tw.displayedChars = Math.min(tw.fullText.length, Math.floor(elapsed / TYPEWRITER_SPEED));
      if (elapsed > tw.duration) activeTypewriters.splice(i, 1);
    }
  }

  function getTypewriterText(npcIdx: number): string | null {
    const tw = activeTypewriters.find(t => t.npcIdx === npcIdx);
    if (!tw) return null;
    return tw.fullText.substring(0, tw.displayedChars);
  }

  // ── Power Infrastructure (strategic target) ──────────────────────────────────
  interface PowerNode {
    id: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    label: string;
    underAttack: boolean;
  }
  const POWER_NODES: PowerNode[] = [
    { id: 'pn_central', x: 6500, y: 6500, hp: 100, maxHp: 100, label: 'CENTRAL POWER RELAY', underAttack: false },
    { id: 'pn_east', x: 8000, y: 5800, hp: 100, maxHp: 100, label: 'EAST GRID JUNCTION', underAttack: false },
    { id: 'pn_west', x: 5600, y: 5800, hp: 100, maxHp: 100, label: 'WEST POWER STATION', underAttack: false },
    { id: 'pn_south', x: 7000, y: 7200, hp: 100, maxHp: 100, label: 'SOUTH TRANSFORMER', underAttack: false },
  ];
  let powerAttackCooldown = 0;

  function tickPowerInfrastructure(frame: number, playerClass: string): void {
    if (powerAttackCooldown > 0) { powerAttackCooldown--; return; }
    for (const node of POWER_NODES) {
      if (node.underAttack) {
        node.hp = Math.max(0, node.hp - 0.1);
        if (node.hp <= 0) {
          node.underAttack = false;
          node.hp = 0;
          addGossipEvent(`Power node ${node.label} destroyed! Blackout in progress.`, node.x, node.y, 'faction', frame);
        }
      }
      if (!node.underAttack && node.hp > 0 && Math.random() < 0.0001) {
        node.underAttack = true;
        const attackerType = Math.random() < 0.5 ? 'Replicants' : 'Outlaws';
        addGossipEvent(`${attackerType} attacking ${node.label}!`, node.x, node.y, 'faction', frame);
        powerAttackCooldown = 1800;
      }
      if (!node.underAttack && node.hp < node.maxHp) {
        node.hp = Math.min(node.maxHp, node.hp + 0.01);
      }
    }
  }
  
function pickBehavior(type: string, worldHour: number): BehaviorState {
  const sched = FACTION_SCHEDULES[type];
  if (!sched) return 'PATROLLING';
  const isNight = worldHour < 4 || worldHour >= 19;
  const pool = isNight ? sched.night : sched.day;
  return pool[Math.floor(Math.random() * pool.length)];
}
interface WeaponDef { id: string; label: string; desc: string; atkBonus: number; color: string; type: 'melee' | 'ranged'; range: number; cooldown: number; icon: string; }
interface MerchantItem { id: string; name: string; desc: string; price: number; effect: string; }
interface Projectile { x: number; y: number; dx: number; dy: number; life: number; damage: number; type: string; }
interface BombEffect { x: number; y: number; timer: number; damage: number; radius: number; }
interface Floater { x: number; y: number; text: string; color: string; life: number; maxLife: number; }
interface GuardUnit { x: number; y: number; wpIdx: number; progress: number; huntTarget?: number; }
const THREAT_HP:  Record<string, number> = { RUST_SYNDICATE: 30, VOID_RUNNERS: 40, STATIC_MONKS: 50, MUTANT: 35, RAIDER: 45, PROWLER: 25, BORDER_GANG: 35, EASTERN_BLOC: 45, SPY: 20, PABLO_GUARD: 250, MINX_CITY: 300, VAGRANT: 10, STRAY_DOG: 8, SCAVENGER: 15, RAT: 4 };
const THREAT_EXP: Record<string, number> = { RUST_SYNDICATE: 20, VOID_RUNNERS: 28, STATIC_MONKS: 35, MUTANT: 30, RAIDER: 40, PROWLER: 15, BORDER_GANG: 22, EASTERN_BLOC: 30, SPY: 60, PABLO_GUARD: 120, MINX_CITY: 180, VAGRANT: 5, STRAY_DOG: 3, SCAVENGER: 8, RAT: 1 };
const BOUNTY:     Record<string, number> = { RUST_SYNDICATE: 175, VOID_RUNNERS: 225, STATIC_MONKS: 250, MUTANT: 200, RAIDER: 300, PROWLER: 125, BORDER_GANG: 190, EASTERN_BLOC: 240, SPY: 400, PABLO_GUARD: 475, MINX_CITY: 450, VAGRANT: 0, STRAY_DOG: 0, SCAVENGER: 25, RAT: 0 };
const PASSIVE_THREATS = new Set(['VAGRANT','STRAY_DOG','SCAVENGER','RAT']);
// Class base stats ─────────────────────────────────────────────────────────────
const HP_PER_HEART = 20;
const CLASS_STATS: Record<string, { maxHp: number; atkBonus: number; defBonus: number; wasteBonus: boolean }> = {
  replicant:  { maxHp: 4 * HP_PER_HEART, atkBonus: 18, defBonus: 6,  wasteBonus: false },
  outlaw:     { maxHp: 3 * HP_PER_HEART, atkBonus: 14, defBonus: 10, wasteBonus: true  },
  corporate:  { maxHp: 5 * HP_PER_HEART, atkBonus: 12, defBonus: 6,  wasteBonus: false },
};
const CLASS_DISPLAY_NAME: Record<string, string> = {
  corporate: 'SUITS', outlaw: 'OUTLAWS', replicant: 'REPLICANTS',
};
const FACTION_SALARY_PER_MIN: Record<string, number> = {
  corporate: 100, replicant: 50, outlaw: 25,
};
const FACTION_STARTING_NET_WORTH: Record<string, number> = {
  corporate: 25000, replicant: 18000, outlaw: 10000,
};
// MINX_CITY = "Suits" faction (dominant city enemies, suited enforcers) — buffed ATK
const THREAT_ATK: Record<string, number> = {
  RUST_SYNDICATE: 0.20, VOID_RUNNERS: 0.28, STATIC_MONKS: 0.35, MUTANT: 0.30,
  RAIDER: 0.40, PROWLER: 0.18, BORDER_GANG: 0.22, EASTERN_BLOC: 0.32,
  SPY: 0.15, PABLO_GUARD: 0.50, MINX_CITY: 0.90,
  VAGRANT: 0.05, STRAY_DOG: 0.08, SCAVENGER: 0.12, RAT: 0.03,
};
const NPC_LOOT_TABLE = [
  { id: 'scrap_metal', name: 'SCRAP METAL', desc: 'Salvaged components' },
  { id: 'data_chip', name: 'DATA CHIP', desc: 'Encrypted data fragment' },
  { id: 'med_kit_loot', name: 'MED KIT', desc: 'Emergency medical supplies' },
  { id: 'stim_shot_loot', name: 'STIM SHOT', desc: 'Combat stimulant' },
  { id: 'power_cell', name: 'POWER CELL', desc: 'Portable energy source' },
  { id: 'weapon_parts', name: 'WEAPON PARTS', desc: 'Weapon repair kit' },
  { id: 'ration_pack', name: 'RATION PACK', desc: 'Preserved food supply' },
  { id: 'circuit_board', name: 'CIRCUIT BOARD', desc: 'Replicant-grade components' },
];
const ANIMAL_TYPES = new Set(['RAT','STRAY_DOG']);
const ANIMAL_DROPS = [
  { name: 'RAW MEAT', desc: 'Uncooked animal meat. Cook it or trade it.' },
  { name: 'MYSTERY JERKY', desc: 'Dried meat of questionable origin.' },
  { name: 'ANIMAL FAT', desc: 'Useful for cooking fuel or trade.' },
  { name: 'WILD GAME', desc: 'Fresh catch from the wasteland.' },
];
const NPC_LOOT_CHANCE = 0.125;
// Govt building IDs — spies can't enter these
const GOVT_BIDS = new Set(['megabank','armory','data_vault','pablo_tower','dojo']);
// Quick jobs — bid → { label, pay, seconds, cooldownFrames }
const QUICK_JOBS: Record<string, { label: string; pay: number; seconds: number; cooldownFrames: number }> = {
  scrap:      { label: 'HAUL SCRAP',   pay: 3500, seconds: 5, cooldownFrames: 1800 },
  print_shop: { label: 'PRINT RUN',    pay: 2500, seconds: 4, cooldownFrames: 1200 },
  radio:      { label: 'BROADCAST',    pay: 2000, seconds: 4, cooldownFrames: 900  },
  oxide_labs:   { label: 'ASSEMBLE',     pay: 6000, seconds: 7, cooldownFrames: 2400 },
  market:     { label: 'STREET DEAL',  pay: 3000, seconds: 3, cooldownFrames: 900  },
};
type VendItem = { id: string; name: string; desc: string; price: number; owned?: boolean; consumable?: boolean; effect?: string; goldPrice?: number };
type VendCategory = { id: string; label: string; col: string; items: VendItem[] };
const VEND_CATALOG: VendCategory[] = [
  { id: 'food', label: 'FOOD', col: '#00ff41', items: [
    { id: 'power_pellet',  name: 'POWER PELLET',    desc: 'Off-brand ration. Hunger+30 Thirst+20.',              price: 800,    consumable: true, effect: 'hunger30 thirst20' },
    { id: 'synth_ramen',   name: 'SYNTH RAMEN',     desc: 'Hot. Questionable protein. Hunger+50 Energy+15.',      price: 1200,   consumable: true, effect: 'hunger50 energy15' },
    { id: 'recycled_water',name: 'RECYCLED WATER',  desc: 'Distilled twice. Probably fine. Thirst+40.',           price: 400,    consumable: true, effect: 'thirst40' },
    { id: 'pablo_cola',    name: 'PABLO COLA',      desc: 'Electrolyte formula. Thirst+30 Energy+20.',            price: 600,    consumable: true, effect: 'thirst30 energy20' },
    { id: 'nutri_pack',    name: 'NUTRI-PACK',      desc: 'Field ration. Full refill. Hunger+60 Thirst+60.',      price: 2000,   consumable: true, effect: 'hunger60 thirst60' },
    { id: 'stim_shot',     name: 'STIM SHOT',       desc: 'Adrenaline. Energy+50 HP+10. Side effects unlisted.',  price: 3500,   consumable: true, effect: 'energy50 hp10' },
    { id: 'med_kit',       name: 'MED KIT',         desc: 'Trauma wrap. HP+50. No sterile field needed.',         price: 6000,   consumable: true, effect: 'hp50' },
    { id: 'antidote',      name: 'ANTIDOTE',        desc: 'Clears poison status immediately.',                    price: 4000,   consumable: true, effect: 'cure_poison' },
  ]},
  { id: 'tech', label: 'TECH', col: '#33aaff', items: [
    { id: 'pablo_device',    name: 'DEVICE REPAIR KIT',  desc: 'Repairs a broken personal terminal. Restores full durability.',  price: 5000, consumable: true  },
    { id: 'burner_phone',    name: 'BURNER PHONE',      desc: 'Encrypted. Untraceable. 48hr battery.',            price: 1500  },
    { id: 'signal_jammer',   name: 'SIGNAL JAMMER',     desc: 'Disables nearest guard for 30 seconds (3 uses).',  price: 12000 },
    { id: 'netrunner_deck',  name: 'NETRUNNER DECK',    desc: '20% discount at all PABLO CORP. terminals.',       price: 25000 },
    { id: 'holo_map',        name: 'HOLO MAP',          desc: 'Reveals all locations on the minimap.',            price: 5000  },
    { id: 'radio_implant',   name: 'RADIO IMPLANT',     desc: 'Neural cochlear transceiver. Picks up MINX CITY FM anywhere in the Wasteland. Permanent.',  price: 20000 },
  ]},
  { id: 'weapons_melee', label: 'MELEE', col: '#ff4444', items: [
    { id: 'combat_knife',    name: 'COMBAT KNIFE',     desc: '+15% ATK. Silent. Legal in 4 zones.',                  price: 3000  },
    { id: 'dirk',            name: 'DIRK',             desc: '+18% ATK. Fast strikes. Concealable.',                 price: 4500  },
    { id: 'short_sword',     name: 'SHORT SWORD',      desc: '+22% ATK. Balanced. Reliable.',                        price: 7000  },
    { id: 'long_sword',      name: 'LONG SWORD',       desc: '+30% ATK. Wide arc. Slow.',                            price: 12000 },
    { id: 'foil',            name: 'FOIL',             desc: '+25% ATK. Precision thrusts. Fast.',                    price: 9000  },
    { id: 'sabre',           name: 'SABRE',            desc: '+28% ATK. Curved blade. Devastating slash.',            price: 11000 },
    { id: 'spear',           name: 'SPEAR',            desc: '+20% ATK. Long reach. Keep distance.',                  price: 6000  },
    { id: 'battle_axe',      name: 'BATTLE AXE',       desc: '+35% ATK. Heavy. Armor-piercing.',                     price: 14000 },
    { id: 'mace',            name: 'MACE',             desc: '+27% ATK. Blunt force. Stun chance.',                   price: 10000 },
    { id: 'boxing_gloves',   name: 'BOXING GLOVES',    desc: '+10% ATK. Non-lethal. Fast combo.',                     price: 2000  },
    { id: 'stun_baton',      name: 'STUN BATON',       desc: '+20% ATK. Stuns targets. Non-lethal.',                  price: 8500  },
    { id: 'pipe_wrench',     name: 'PIPE WRENCH',      desc: '+12% ATK. Improvised. Common.',                         price: 1500  },
  ]},
  { id: 'weapons_ranged', label: 'RANGED', col: '#ff6644', items: [
    { id: 'pistol_32',       name: '.32 PISTOL',       desc: '+20% ATK. Standard sidearm. 6 rounds.',                price: 8000  },
    { id: 'revolver_44',     name: '.44 REVOLVER',     desc: '+35% ATK. Heavy stopping power.',                      price: 15000 },
    { id: 'revolver_357',    name: '.357 MAGNUM',      desc: '+40% ATK. Maximum revolver damage.',                    price: 20000 },
    { id: 'rifle_22',        name: '.22 RIFLE',        desc: '+25% ATK. Accurate. Long range.',                      price: 12000 },
    { id: 'sniper_rifle',    name: 'SNIPER RIFLE',     desc: '+50% ATK. Extreme range. Slow ROF.',                   price: 35000 },
    { id: 'shotgun',         name: 'SHOTGUN',          desc: '+45% ATK. Devastating close range. Wide spread.',       price: 18000 },
    { id: 'machine_gun',     name: 'MACHINE GUN',      desc: '+38% ATK. Full-auto. High ammo use.',                  price: 28000 },
    { id: 'minigun',         name: 'MINIGUN',          desc: '+55% ATK. Overwhelming firepower. Very slow move.',     price: 50000 },
    { id: 'compound_bow',    name: 'COMPOUND BOW',     desc: '+25% ATK. Extended range. Quiet.',                     price: 15000 },
    { id: 'laser_pistol',    name: 'LASER PISTOL',     desc: '+42% ATK. Energy weapon. No ammo.',                    price: 30000 },
    { id: 'laser_rifle',     name: 'LASER RIFLE',      desc: '+48% ATK. Precision energy beam.',                     price: 40000 },
    { id: 'plasma_pistol',   name: 'PLASMA PISTOL',    desc: '+45% ATK. PABLO CORP. restricted.',                    price: 22000 },
    { id: 'plasma_rifle',    name: 'PLASMA RIFLE',     desc: '+52% ATK. Superheated plasma bolts.',                  price: 45000 },
  ]},
  { id: 'consumables', label: 'GEAR', col: '#44ffaa', items: [
    { id: 'purified_water',  name: 'PURIFIED WATER',   desc: 'Clean H2O. Thirst+50.',                                price: 600,   consumable: true, effect: 'thirst50' },
    { id: 'mineral_water',   name: 'MINERAL WATER',    desc: 'Enhanced minerals. Thirst+70 Energy+10.',              price: 1000,  consumable: true, effect: 'thirst70 energy10' },
    { id: 'energy_pack',     name: 'ENERGY PACK',      desc: 'Instant charge. Energy+60.',                           price: 2500,  consumable: true, effect: 'energy60' },
    { id: 'ballistic_vest',  name: 'BALLISTIC VEST',   desc: 'Absorbs 20% damage. Stackable.',                       price: 12000 },
    { id: 'energy_shield',   name: 'ENERGY SHIELD',    desc: 'Absorbs 35% damage. Drains on hit.',                   price: 25000 },
    { id: 'medkit_full',     name: 'MEDKIT',           desc: 'Full trauma kit. HP+80.',                               price: 8000,  consumable: true, effect: 'hp80' },
    { id: 'stimpack',        name: 'STIMPACK',         desc: 'Combat stimulant. HP+40 Energy+40 ATK+10% (30s).',     price: 5000,  consumable: true, effect: 'hp40 energy40' },
    { id: 'radiation_pill',  name: 'RADIATION PILL',   desc: 'Blocks radiation for 120s.',                            price: 3000,  consumable: true, effect: 'rad_block' },
    { id: 'antidote_gear',   name: 'ANTIDOTE',         desc: 'Clears poison instantly.',                              price: 4000,  consumable: true, effect: 'cure_poison' },
    { id: 'lockpick_set',    name: 'LOCKPICK SET',     desc: 'Opens locked doors. 5 uses.',                           price: 6000  },
    { id: 'hacking_tool',    name: 'HACKING TOOL',     desc: 'Bypass electronic locks. 3 uses.',                      price: 10000 },
    { id: 'repair_kit',      name: 'REPAIR KIT',       desc: 'Fix equipment. Restores durability.',                   price: 5000,  consumable: true },
    { id: 'signal_flare',    name: 'SIGNAL FLARE',     desc: 'Reveals map area. Scares enemies.',                     price: 1500,  consumable: true },
    { id: 'smoke_grenade',   name: 'SMOKE GRENADE',    desc: 'Creates cover. Enemies lose track.',                    price: 3500,  consumable: true },
    { id: 'emp_grenade',     name: 'EMP GRENADE',      desc: 'Disables electronics in radius.',                       price: 8000,  consumable: true },
    { id: 'thermal_goggles', name: 'THERMAL GOGGLES',  desc: 'See heat signatures. Night vision.',                    price: 15000 },
    { id: 'night_vision',    name: 'NIGHT VISION',     desc: 'See in darkness. Reduced night penalty.',               price: 12000 },
    { id: 'grappling_hook',  name: 'GRAPPLING HOOK',   desc: 'Access elevated areas. Reusable.',                      price: 8000  },
    { id: 'portable_shelter',name: 'PORTABLE SHELTER',  desc: 'Deploy camp anywhere. Rest bonus.',                    price: 20000 },
  ]},
  { id: 'vehicles', label: 'VEHICLES', col: '#ffcc00', items: [
    { id: 'cargo_bike',      name: 'CARGO BIKE',      desc: '+20% speed, +5 cargo slots. Single-speed chainless.', price: 28000  },
    { id: 'hover_scooter',   name: 'HOVER SCOOTER',   desc: '+30% movement speed. Mag-lev. No fuel.',              price: 45000  },
    { id: 'armored_moped',   name: 'ARMORED MOPED',   desc: '+50% speed, 15% damage resistance.',                  price: 120000 },
    { id: 'motorcycle',      name: 'MOTORCYCLE',      desc: '+124% speed. Premium vehicle. 40% faster than sprint. Costs 10oz GOLD.', price: 1000000, goldPrice: 10 },
  ]},
  { id: 'furniture', label: 'FURNITURE', col: '#88ff44', items: [
    { id: 'futon',          name: 'FUTON',            desc: 'Save & rest from any owned property.',                price: 5000  },
    { id: 'neon_sign',      name: 'NEON SIGN',        desc: '+10% passive income. Visible from two blocks.',       price: 8000  },
    { id: 'security_cam',   name: 'SECURITY CAM',     desc: 'Alerts you when threats approach your location.',     price: 12000 },
    { id: 'workstation_furn',name:'WORKSTATION',       desc: 'Personal terminal. Earn ƒ500 per job cycle.',         price: 18000 },
  ]},
  { id: 'realestate', label: 'REAL ESTATE (GOLD ONLY)', col: '#cc44ff', items: [
    { id: 'wasteland_lot',   name: 'WASTELAND LOT',    desc: '+ƒ2,000 passive income per cycle. Costs 5oz GOLD.',  price: 500000, goldPrice: 5  },
    { id: 'minx_studio',     name: 'MINX CITY STUDIO', desc: '+ƒ5,000 passive income per cycle. Costs 10oz GOLD.', price: 1000000, goldPrice: 10  },
    { id: 'corpo_office',    name: 'CORPORATE OFFICE', desc: '+ƒ15,000 passive income per cycle. Costs 25oz GOLD.', price: 2500000, goldPrice: 25 },
  ]},
  { id: 'pro', label: PABLO_PRODUCTS.PRO_TIER.name, col: '#ff9900', items: [
    { id: 'salaryman_pro', name: `${PABLO_PRODUCTS.PRO_TIER.name} PACKAGE`, desc: PABLO_PRODUCTS.PRO_TIER.desc, price: 0 },
  ]},
];
const REAL_ESTATE_INCOME: Record<string, number> = { wasteland_lot: 2000, minx_studio: 5000, corpo_office: 15000 };
const VEHICLE_SPEED: Record<string, number> = { cargo_bike: 1.4, hover_scooter: 1.6, armored_moped: 1.9, motorcycle: 2.24 };
const WEAPON_TIER: Record<string, number> = {
  pipe_wrench: 1, boxing_gloves: 1, combat_knife: 1,
  dirk: 2, spear: 2, stun_baton: 2,
  short_sword: 3, foil: 3, mace: 3, compound_bow: 3, pistol_32: 3, rifle_22: 3,
  sabre: 4, long_sword: 4, battle_axe: 4, revolver_44: 4, shotgun: 4,
  revolver_357: 5, sniper_rifle: 5, machine_gun: 5, laser_pistol: 5, plasma_pistol: 5,
  minigun: 6, laser_rifle: 6, plasma_rifle: 6,
};

// ── Crafting Recipes (Outlaws only) ──────────────────────────────────────────
interface CraftRecipe { id: string; name: string; desc: string; materials: Record<string, number>; result: { id: string; name: string; effect?: string }; }
const CRAFT_RECIPES: CraftRecipe[] = [
  { id: 'craft_food', name: 'WASTELAND RATION', desc: 'Scrap → food. Hunger+40 Thirst+20.', materials: { scrap_metal: 2, ration_pack: 1 }, result: { id: 'craft_ration', name: 'WASTELAND RATION', effect: 'hunger40 thirst20' } },
  { id: 'craft_energy', name: 'JURY-RIGGED ENERGY PACK', desc: 'Components → energy. Energy+50.', materials: { power_cell: 1, circuit_board: 1 }, result: { id: 'craft_energy_pack', name: 'ENERGY PACK', effect: 'energy50' } },
  { id: 'craft_medkit', name: 'FIELD MEDKIT', desc: 'Supplies → healing. HP+60.', materials: { med_kit_loot: 2, stim_shot_loot: 1 }, result: { id: 'craft_medkit', name: 'FIELD MEDKIT', effect: 'hp60' } },
  { id: 'craft_antidote', name: 'CRUDE ANTIDOTE', desc: 'Cures poison from scavenged herbs.', materials: { scrap_metal: 1, med_kit_loot: 1 }, result: { id: 'craft_antidote', name: 'CRUDE ANTIDOTE', effect: 'cure_poison' } },
  { id: 'craft_water', name: 'FILTERED WATER', desc: 'Purify scavenged water. Thirst+60.', materials: { scrap_metal: 1 }, result: { id: 'craft_water', name: 'FILTERED WATER', effect: 'thirst60' } },
  { id: 'craft_pipe_weapon', name: 'PIPE WEAPON', desc: 'Improvised melee from scrap.', materials: { scrap_metal: 3, weapon_parts: 1 }, result: { id: 'pipe_wrench', name: 'PIPE WRENCH' } },
];

// ── Merchant/Trader NPCs ────────────────────────────────────────────────────
interface MerchantDef { name: string; x: number; y: number; type: 'city' | 'wasteland'; inventory: string[]; }
const MERCHANT_NPCS: MerchantDef[] = [
  { name: 'VENDOR KAZIM', x: 6300, y: 6500, type: 'city', inventory: ['purified_water','mineral_water','energy_pack','medkit_full','stimpack','combat_knife','pistol_32','ballistic_vest'] },
  { name: 'TRADER MOSSIK', x: 7800, y: 6100, type: 'city', inventory: ['purified_water','antidote_gear','radiation_pill','repair_kit','lockpick_set','hacking_tool','smoke_grenade','emp_grenade'] },
  { name: 'ARMS DEALER JEX', x: 8100, y: 5700, type: 'city', inventory: ['short_sword','revolver_44','shotgun','sniper_rifle','laser_pistol','ballistic_vest','energy_shield','thermal_goggles'] },
  { name: 'WASTELAND PEDDLER ROOK', x: 3000, y: 8500, type: 'wasteland', inventory: ['purified_water','energy_pack','medkit_full','pipe_wrench','combat_knife','spear','pistol_32','portable_shelter'] },
  { name: 'SCAVENGER JURL', x: 8500, y: 9000, type: 'wasteland', inventory: ['stimpack','radiation_pill','antidote_gear','signal_flare','smoke_grenade','rifle_22','compound_bow','repair_kit'] },
  { name: 'NOMAD TRADER VAEL', x: 5500, y: 2000, type: 'wasteland', inventory: ['mineral_water','energy_pack','medkit_full','mace','battle_axe','revolver_357','machine_gun','night_vision'] },
  { name: 'DRIFTER KASH', x: 10000, y: 3000, type: 'wasteland', inventory: ['purified_water','stimpack','short_sword','foil','sabre','laser_rifle','plasma_rifle','grappling_hook'] },
];

// ── Rest location IDs (hotels/apartments/shelters) ──────────────────────────
const REST_LOCATION_IDS = new Set(['grand_meridian','inn_mother','overlook','rust_porch','ashfield_hostel','terminus','bastion_keep','hotel','bunker','east_bunker','north_bunker','deep_bunker']);

// Pablo Corp android guard patrol waypoints inside city
const GUARD_ROUTES: { x: number; y: number }[][] = [
  [{ x:5700,y:5700 },{ x:6200,y:5700 },{ x:6200,y:6100 },{ x:5700,y:6100 }],
  [{ x:6300,y:5500 },{ x:6800,y:5500 },{ x:6800,y:5900 },{ x:6300,y:5900 }],
  [{ x:6900,y:5400 },{ x:7500,y:5400 },{ x:7500,y:5800 },{ x:6900,y:5800 }],
  [{ x:7600,y:5600 },{ x:8100,y:5600 },{ x:8100,y:6000 },{ x:7600,y:6000 }],
  [{ x:5500,y:5400 },{ x:5900,y:5400 },{ x:5900,y:5800 },{ x:5500,y:5800 }],
  [{ x:8200,y:5500 },{ x:8700,y:5500 },{ x:8700,y:5900 },{ x:8200,y:5900 }],
  [{ x:7200,y:6200 },{ x:7800,y:6200 },{ x:7800,y:6600 },{ x:7200,y:6600 }],
  [{ x:5800,y:6800 },{ x:6500,y:6800 },{ x:6500,y:7100 },{ x:5800,y:7100 }],
  [{ x:6900,y:6800 },{ x:7700,y:6800 },{ x:7700,y:7100 },{ x:6900,y:7100 }],
];
// Vending machine positions (relative x,y offsets near govt buildings)
const VEND_POSITIONS: { bid: string; x: number; y: number }[] = [
  { bid: 'megabank',   x: -30, y: 0 },
  { bid: 'armory',     x: -28, y: 0 },
  { bid: 'data_vault', x: -28, y: 0 },
  { bid: 'pablo_tower',x:  60, y: 0 },
  { bid: 'dojo',       x: -28, y: 0 },
];
const mkThreat = (x:number,y:number,type:string): Threat => { const h=THREAT_HP[type]??30; return {x,y,dx:0,dy:0,type,timer:0,hp:h,maxHp:h,ox:x,oy:y,behavior:'PATROLLING',behaviorTimer:0}; };
const THREATS_INIT: Threat[] = [
  // ── South city border — PROWLERs patrol near the checkpoints ──
  mkThreat(5600, 7350, 'PROWLER'), mkThreat(5900, 7380, 'PROWLER'),
  mkThreat(8200, 7350, 'PROWLER'), mkThreat(8500, 7380, 'PROWLER'),
  mkThreat(6500, 7340, 'PROWLER'), mkThreat(7000, 7350, 'PROWLER'),
  mkThreat(7500, 7340, 'PROWLER'), mkThreat(8000, 7360, 'PROWLER'),
  // ── South city border gang line ──
  mkThreat(5800, 7400, 'BORDER_GANG'), mkThreat(6200, 7420, 'BORDER_GANG'),
  mkThreat(6600, 7400, 'BORDER_GANG'), mkThreat(7000, 7430, 'BORDER_GANG'),
  mkThreat(7600, 7400, 'BORDER_GANG'), mkThreat(8400, 7420, 'BORDER_GANG'),
  // ── North Wasteland — RUST SYNDICATE (north-west) ──
  mkThreat(800, 800, 'RUST_SYNDICATE'), mkThreat(1500, 1200, 'RUST_SYNDICATE'),
  mkThreat(2200, 1800, 'RUST_SYNDICATE'), mkThreat(1000, 2500, 'RUST_SYNDICATE'),
  mkThreat(2000, 3000, 'RUST_SYNDICATE'), mkThreat(3000, 2200, 'RUST_SYNDICATE'),
  mkThreat(1500, 3500, 'RUST_SYNDICATE'),
  // ── North Wasteland — VOID RUNNERS (north-centre) ──
  mkThreat(5500, 1200, 'VOID_RUNNERS'), mkThreat(6000, 1800, 'VOID_RUNNERS'),
  mkThreat(5800, 2500, 'VOID_RUNNERS'), mkThreat(6500, 3000, 'VOID_RUNNERS'),
  mkThreat(7000, 1500, 'VOID_RUNNERS'), mkThreat(7500, 2200, 'VOID_RUNNERS'),
  mkThreat(5200, 3500, 'VOID_RUNNERS'),
  // ── South Wasteland — STATIC MONKS (south-west) ──
  mkThreat(1500, 8000, 'STATIC_MONKS'), mkThreat(2500, 8500, 'STATIC_MONKS'),
  mkThreat(3000, 9000, 'STATIC_MONKS'), mkThreat(3500, 9500, 'STATIC_MONKS'),
  mkThreat(2000, 10000, 'STATIC_MONKS'), mkThreat(4000, 8800, 'STATIC_MONKS'),
  mkThreat(2500, 10500, 'STATIC_MONKS'),
  // ── South Wasteland — EASTERN BLOC (south-east) ──
  mkThreat(9000, 8000, 'EASTERN_BLOC'), mkThreat(10000, 8500, 'EASTERN_BLOC'),
  mkThreat(10500, 9000, 'EASTERN_BLOC'), mkThreat(11500, 8800, 'EASTERN_BLOC'),
  mkThreat(9500, 9500, 'EASTERN_BLOC'), mkThreat(12000, 8500, 'EASTERN_BLOC'),
  mkThreat(11000, 10000, 'EASTERN_BLOC'),
  // ── MINX CITY faction — split north + south wasteland ──
  mkThreat(500, 1000, 'MINX_CITY'), mkThreat(2000, 1500, 'MINX_CITY'),
  mkThreat(3500, 2000, 'MINX_CITY'), mkThreat(5000, 1500, 'MINX_CITY'),
  mkThreat(6500, 1000, 'MINX_CITY'), mkThreat(8000, 2000, 'MINX_CITY'),
  mkThreat(9500, 1500, 'MINX_CITY'), mkThreat(11000, 2000, 'MINX_CITY'),
  mkThreat(12500, 1000, 'MINX_CITY'), mkThreat(13500, 1500, 'MINX_CITY'),
  mkThreat(1500, 8500, 'MINX_CITY'), mkThreat(4000, 9000, 'MINX_CITY'),
  mkThreat(6000, 8500, 'MINX_CITY'), mkThreat(8000, 9500, 'MINX_CITY'),
  mkThreat(10000, 9000, 'MINX_CITY'), mkThreat(12500, 8500, 'MINX_CITY'),
  // ── Deep south wasteland wanderers ──
  mkThreat(2500, 10500, 'MUTANT'), mkThreat(5000, 11000, 'MUTANT'),
  mkThreat(7500, 10500, 'MUTANT'), mkThreat(10000, 11000, 'MUTANT'),
  mkThreat(3500, 11500, 'RAIDER'), mkThreat(6500, 11800, 'RAIDER'),
  mkThreat(11000, 11500, 'RAIDER'), mkThreat(13000, 11000, 'RAIDER'),
  // ── SPY infiltrators — disguised, can enter city (rare) ──
  mkThreat(5800, 6200, 'SPY'), mkThreat(6800, 6000, 'SPY'), mkThreat(7800, 6300, 'SPY'),
  mkThreat(8500, 5900, 'SPY'),
  // ── Passive minor wanderers (non-aggressive) ──
  mkThreat(5700, 5800, 'VAGRANT'), mkThreat(6300, 6500, 'VAGRANT'), mkThreat(7000, 6200, 'VAGRANT'),
  mkThreat(7500, 5800, 'VAGRANT'), mkThreat(8200, 6000, 'VAGRANT'), mkThreat(8600, 6400, 'VAGRANT'),
  mkThreat(5600, 6700, 'STRAY_DOG'), mkThreat(6500, 6600, 'STRAY_DOG'), mkThreat(7300, 6500, 'STRAY_DOG'),
  mkThreat(8000, 6300, 'STRAY_DOG'), mkThreat(8700, 6700, 'STRAY_DOG'),
  mkThreat(2000, 9500, 'SCAVENGER'), mkThreat(5000, 10000, 'SCAVENGER'), mkThreat(8000, 9500, 'SCAVENGER'),
  mkThreat(10500, 9000, 'SCAVENGER'), mkThreat(12500, 9500, 'SCAVENGER'),
  mkThreat(5550, 6250, 'RAT'), mkThreat(5900, 6700, 'RAT'), mkThreat(6300, 6500, 'RAT'),
  mkThreat(6700, 6350, 'RAT'), mkThreat(7100, 6200, 'RAT'), mkThreat(7500, 6450, 'RAT'),
  mkThreat(7900, 6100, 'RAT'), mkThreat(8200, 6350, 'RAT'), mkThreat(5700, 7100, 'RAT'),
  mkThreat(6600, 7050, 'RAT'), mkThreat(7600, 7050, 'RAT'), mkThreat(8400, 6900, 'RAT'),
];

// ── EXP / Level table ─────────────────────────────────────────────────────────
const EXP_TABLE: number[] = [];
for (let i = 0; i < 100; i++) EXP_TABLE.push(Math.floor(100 + i * 80 + i * i * 2.5));
const MAX_LEVEL = 100;
const expToLevel = (lvl: number) => EXP_TABLE[Math.min(lvl - 1, EXP_TABLE.length - 1)];
const EXP_PER_QUARTER_HEART = 1_000_000;
const QUARTER_HEART_HP = HP_PER_HEART / 4;

interface ExpGainState {
  totalExpEarned: number;
  overflowExp: number;
  exp: number;
  level: number;
  maxHp: number;
  hp: number;
  px: number;
  py: number;
  floaters: Array<{ x: number; y: number; text: string; color: string; life: number; maxLife: number }>;
}

const LEVEL_MILESTONES = new Set([5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100]);

function applyExpGain(g: ExpGainState, earned: number, sfxLevelUp: () => void, setLevelUpText: (t: string) => void, setShowLevelUp: (v: boolean) => void, setNarr: (n: string) => void, setExp: (e: number) => void, setLevel: (l: number) => void, setHp: (h: number) => void) {
  g.totalExpEarned += earned;
  if (g.level >= MAX_LEVEL) {
    g.overflowExp = g.overflowExp + earned;
    const prevQ = Math.floor((g.overflowExp - earned) / EXP_PER_QUARTER_HEART);
    const newQ = Math.floor(g.overflowExp / EXP_PER_QUARTER_HEART);
    if (newQ > prevQ) {
      const qhGain = (newQ - prevQ) * QUARTER_HEART_HP;
      g.maxHp += qhGain; g.hp = Math.min(g.maxHp, g.hp + qhGain);
      g.floaters.push({ x: g.px, y: g.py - 30, text: `+${newQ - prevQ} QUARTER HEART`, color: '#ff44aa', life: 80, maxLife: 80 });
      sfxMilestone();
    }
    g.exp = 0;
    setExp(0); setHp(Math.floor(g.hp));
    return;
  }
  let newExp = g.exp + earned; let newLevel = g.level;
  while (newLevel < MAX_LEVEL && newExp >= expToLevel(newLevel)) {
    newExp -= expToLevel(newLevel); newLevel++;
    g.maxHp += 10; g.hp = Math.min(g.maxHp, g.hp + 10);
    const isMilestone = LEVEL_MILESTONES.has(newLevel);
    const lText = isMilestone
      ? `Level ${newLevel} — HP ${g.maxHp} — New threshold reached`
      : `Level ${newLevel} — HP +10`;
    setLevelUpText(lText); setShowLevelUp(true);
    setTimeout(() => setShowLevelUp(false), isMilestone ? 4000 : 2500);
    setNarr(`> ${lText}`);
    if (isMilestone) { sfxMilestone(); } else { sfxLevelUp(); }
  }
  if (newLevel >= MAX_LEVEL) { newExp = 0; }
  g.exp = newExp; g.level = newLevel;
  setExp(newExp); setLevel(newLevel); setHp(Math.floor(g.hp));
}
const THREAT_COL: Record<string, string> = {
  RUST_SYNDICATE: '#ff4444', VOID_RUNNERS: '#ff8800', STATIC_MONKS: '#aaff22',
  MUTANT: '#88ff44', RAIDER: '#ff66ff', GANG: '#ff4444',
  PROWLER: '#ff2266', BORDER_GANG: '#ff6600', EASTERN_BLOC: '#4488ff',
  SPY: '#ffffaa', PABLO_GUARD: '#5599ff', MINX_CITY: '#cc44ff',
  VAGRANT: '#887766', STRAY_DOG: '#aa8855', SCAVENGER: '#99aa66',
  RAT: '#665544',
};

const NPC_RANGE = 60;
const DOG_MAX_HP = 200;
const DOG_ATK = 13;
const DOG_SPEED = 0.85;
const DOG_DETECT_RANGE = 110;
const DOG_ATTACK_COOLDOWN = 48;
const DOG_FOLLOW_OFFSET = 40;
const DOG_DIALOGUE_LINES = [
  "I don't trust that building. Smells like lies and floor cleaner.",
  "You're the first person who didn't throw something at me.",
  "PABLO CORP. put a price on stray dogs. I took it personally.",
  "I used to chase cars. Now I chase meaning. Same energy.",
  "My nose says there's danger ahead. My nose is never wrong.",
  "I had a family once. Before the tower went up. Before everything changed.",
  "If I could read, I'd read the graffiti. It smells important.",
  "Every fire hydrant in this city has a PABLO CORP. serial number on it.",
  "You walk too slow. No offense. Two legs is a design flaw.",
  "The wasteland smells like rust and regret. I prefer it to the city.",
  "I bit a PABLO guard once. Tasted like copper and bad decisions.",
  "When you rest, I watch. That's the deal. Unspoken but binding.",
  "Someone left food near the arcade. I didn't eat it. Smelled like a trap.",
  "The moon looks different from down here. Bigger. Angrier.",
  "I dream about a field. No fences. No towers. Just grass and silence.",
  "Other strays joined gangs. Void Runners. I chose you instead. Better odds.",
  "That NPC talks too much. I can tell by the way they stand.",
  "My previous owner said 'stay.' I stayed for two years. Then I left.",
  "Rain's coming. I can feel it in my teeth. PABLO schedules the rain.",
  "If we die out here, I want you to know — you were adequate.",
  "The scrap yard smells like home. I don't know what that says about me.",
  "I've seen things you wouldn't believe. Mostly garbage. But some of it mattered.",
  "Keep moving. Standing still in Minx City is how you become furniture.",
  "Your heartbeat changed. Are you scared? Don't be. I'm here.",
  "SENIOR PABLO has never pet a dog. I can sense this about a person.",
];
const DOG_COMBAT_BARKS = ['WOOF!', 'GRR!', 'BARK!', '*SNARL*', 'RUFF!'];
const DOG_LOW_HP_LINES = [
  "Hey... you're not looking great. Find a crystal. For both of us.",
  "Your HP is low. I can smell it. Literally.",
  "We should rest. I'm saying this for you. I'm fine. (I'm not fine.)",
];
const DOG_ZONE_LINES = [
  "New territory. Marking it mentally. ...Okay, also physically.",
  "Different zone. Different smells. Same corporate dystopia.",
  "The air changed. Stay sharp. I'll stay sharper.",
];
const DOG_REST_LINES = [
  "Finally. Rest. My paws were killing me. Not literally. That's your department.",
  "The crystal hums. I like it. Reminds me of a lullaby nobody ever sang to me.",
];
const DOG_KILL_LINES = [
  "Good kill. I helped. You're welcome.",
  "Target down. We make a good team. Mostly me.",
  "That one won't bother us again. Unless it respawns. They always respawn.",
];

const STORE_LINES = [
  '> PABLO — AUTHORIZED DEVICE OUTLET · MINX CITY · PST',
  '> Minx City belongs to him. The wasteland is for those who forgot that.',
  '> PABLO devices keep you on the network. Like a second quest — but this time the dungeon is real.',
  '> There\'s a rumor: the original PABLO device firmware contains an old game. Unplayable now. SENIOR PABLO was never beaten.',
  '> Press ACTIVATE to register your device.',
];

const TOWER_LINES = [
  '> SHADOW TOWER — 62 FLOORS. MINX CITY DESIGNATION: BLOCK ZERO.',
  '> Every road in Minx City was built to point here. Same as Neo-Tokyo. Same as every city that ever fell.',
  '> Floors 1-39: commercial rentals. Floors 40+: permanently restricted by order of SENIOR PABLO.',
  '> You look up. The penthouse glass is dark. A silhouette shifts. Slowly. He knows you\'re here.',
  '> HARLAN CROSS was outside this building for three days. Said he felt something. Left without explaining.',
  '> SENIOR PABLO. Villain of Minx City. Hero of the rich. Nobody has ever met him face to face and told the story.',
];

const OFFICE_TIERS = [
  { label: 'HOT DESK',       price: 50,   desc: 'Open floor. Shared terminal.' },
  { label: 'PRIVATE OFFICE', price: 200,  desc: 'Single room. Lock code.' },
  { label: 'TEAM SUITE',     price: 500,  desc: '4 desks. Secure entry.' },
  { label: 'EXEC FLOOR',     price: 1500, desc: 'Full suite. AI concierge.' },
];

// ── Building floor directories ────────────────────────────────────────────────
interface BFloor { floor: number; name: string; desc: string; restricted?: boolean; }
interface BDirectory { label: string; history: string; floors: BFloor[]; }
function generateFloorInterior(bid: string, fl: BFloor, dirLabel: string): InteriorDef {
  const w = 300, h = 260;
  const seed = bid.length * 137 + fl.floor * 53;
  const hash = (n: number) => ((n * 2654435761) >>> 0) / 4294967296;
  const objCount = 3 + Math.floor(hash(seed + 1) * 4);
  const objects: InteriorObject[] = [];
  const floorTypes: Array<{type: InteriorObject['type']; label: string; color: string; w: number; h: number}> = [
    { type: 'desk', label: 'DESK', color: 'rgba(40,50,35,.5)', w: 40, h: 30 },
    { type: 'terminal', label: 'TERMINAL', color: 'rgba(0,80,30,.4)', w: 45, h: 35 },
    { type: 'shelf', label: 'SHELF', color: 'rgba(45,55,40,.4)', w: 30, h: 20 },
    { type: 'chair', label: 'CHAIR', color: 'rgba(40,45,35,.4)', w: 20, h: 20 },
    { type: 'window', label: 'WINDOW', color: 'rgba(0,40,60,.4)', w: 40, h: 45 },
    { type: 'crate', label: 'CRATE', color: 'rgba(55,45,30,.5)', w: 25, h: 25 },
  ];
  for (let i = 0; i < objCount; i++) {
    const ft = floorTypes[Math.floor(hash(seed + i * 7 + 3) * floorTypes.length)];
    const ox = 20 + Math.floor(hash(seed + i * 13 + 5) * (w - 80));
    const oy = 25 + Math.floor(hash(seed + i * 17 + 9) * (h - 100));
    objects.push({ x: ox, y: oy, w: ft.w, h: ft.h, type: ft.type, label: ft.label, color: ft.color });
  }
  return {
    id: `${bid}_fl${fl.floor}`,
    label: `${dirLabel} — FL ${String(fl.floor).padStart(2, '0')} — ${fl.name}`,
    width: w, height: h,
    wallColor: 'rgba(18,28,22,.95)', floorColor: 'rgba(6,12,8,.9)', accentColor: 'rgba(0,255,65,.25)',
    exitX: w / 2 - 15, exitY: h - 15, exitW: 30, exitH: 15,
    ambientText: fl.desc,
    objects,
  };
}
const BUILDING_FLOORS: Record<string, BDirectory> = {
  minx_arms: {
    label: 'MINX ARMS', history: 'Built 1984 under the old city housing charter. PABLO CORP. acquired the deed in \'91 — residents grandfathered. Nobody has been evicted. Yet. The intercom still uses the original buzzers.',
    floors: [
      { floor: 1, name: 'LOBBY',           desc: 'Buzzing fluorescents. Name cards in the original slots. The super\'s office is behind frosted glass. Nobody has seen the super in three weeks.' },
      { floor: 2, name: 'UNITS 201–208',   desc: 'Lower floor. Long-term residents. Unit 203 has been vacant since \'89 — still listed under someone named OREN SHARPE. The mail still comes.' },
      { floor: 3, name: 'UNITS 301–308',   desc: 'Unit 308 ran a pirate radio antenna through the wall until the city found it. The hole is still there. Someone put a plant in front of it.' },
      { floor: 4, name: 'YOUR FLOOR',      desc: 'Your unit. View of the SHADOW TOWER roof. The curtains never fully close. You have learned to sleep on the other side of the room.' },
      { floor: 5, name: 'UNITS 501–508',   desc: 'Unit 502 has been playing the same album since 1990. Nobody has complained. Nobody ever will.' },
      { floor: 6, name: 'LAUNDRY / STORE', desc: 'Three machines. One prints receipts dated \'87. Maintenance says it\'s a known issue. The receipts are itemized.' },
      { floor: 7, name: 'UNITS 701–708',   desc: 'MAEVE lived in 704. She moved out when she noticed the PABLO CORP. logo was visible from every window at the same angle.' },
      { floor: 8, name: 'ROOF ACCESS',     desc: 'Padlocked. Scratched into the metal: "He can see this roof. He sees all roofs." The padlock is PABLO CORP. branded.' },
    ],
  },
  eastside_flat: {
    label: 'EASTSIDE FLATS', history: 'Completed 1988. Designed as mid-market housing for the east expansion district. PABLO CORP. invested in floors 3–6 quietly in \'92. The remaining floors are still technically independent.',
    floors: [
      { floor: 1, name: 'LOBBY / MAILROOM', desc: 'Security camera that records but doesn\'t transmit. Labelled: PABLO CORP. SECURITY DIVISION.' },
      { floor: 2, name: 'UNITS 201–212',   desc: 'Mostly occupied. Unit 207 belongs to someone who works night shifts and is never seen. The name on the box: L. KERN.' },
      { floor: 3, name: 'UNITS 301–312',   desc: 'PABLO CORP. owned units. Unfurnished. Clean. A realtor shows them every Thursday to nobody.' },
      { floor: 4, name: 'UNITS 401–412',   desc: 'Community notice board. Someone wrote: "SENIOR PABLO IS IN FLOOR 62. DO NOT LOOK UP." The note has been laminated.' },
      { floor: 5, name: 'GYM / AMENITIES', desc: 'Functional. Towels provided. One locker has been locked since \'90. The gym log shows it was last used by someone named GRAHN.' },
      { floor: 6, name: 'ROOF GARDEN',     desc: 'Someone is growing vegetables up here without permission. The vegetables are thriving. Nobody has the heart to stop them.' },
    ],
  },
  hotel: {
    label: 'HOTEL NEON', history: 'Originally THE PACIFIC, renamed \'86 after the owner installed neon signage on every floor. The glow bleeds through the walls. The TVs still show 1987 channels.',
    floors: [
      { floor: 1, name: 'LOBBY / BAR',     desc: 'The bar runs on a tab system. Nobody knows who started the tabs. Nobody asks. One tab has been running since 1983.' },
      { floor: 2, name: 'STANDARD ROOMS',  desc: 'Working TVs. Channel guide shows programs from \'87. Some of them are still running. One channel is static with audio.' },
      { floor: 3, name: 'DELUXE ROOMS',    desc: 'Better curtains. A fax machine nobody uses. It still receives faxes. They are detailed and addressed to names that no longer exist.' },
      { floor: 4, name: 'BUSINESS CENTER', desc: 'One terminal. Password is the hotel name. The printer outputs financial data nobody requested. The paper is continuous-feed.' },
      { floor: 5, name: 'PENTHOUSE',       desc: 'Reserved indefinitely under a company name that doesn\'t exist. PABLO CORP. acquired it \'93. The room is always warm.' },
    ],
  },
  pablo_tower: {
    label: 'SHADOW TOWER', history: 'SHADOW TOWER — 62 floors. Built 1986–1991. Construction records sealed. Three architects. Two retired. One was not found after floor 40 was completed. The plans for floors 40+ were never filed.',
    floors: [
      { floor: 1,  name: 'LOBBY / SECURITY', desc: 'PABLO CORP. reception. Three desks. One always unstaffed. The unstaffed desk has a coffee cup that is always warm.' },
      { floor: 5,  name: 'PABLO CORP. OFFICES', desc: 'Open plan. Everyone looks busy. Nobody will tell you what they do here.' },
      { floor: 12, name: 'DATA PROCESSING',   desc: 'Server rows. The hum is constant. Visitors report hearing their own name in the static. The IT staff deny this.' },
      { floor: 20, name: 'EXECUTIVE SUITES',  desc: 'Full glass. City views. Each suite has a panic button. None have ever been pressed.' },
      { floor: 39, name: 'LAST PUBLIC FLOOR', desc: 'A whiteboard reads: "PHASE THREE IS AUTHORIZED." Nobody has erased it. Nobody has added to it. It has been there for eleven years.' },
      { floor: 40, name: '── RESTRICTED ──',  desc: 'Access card required. The elevator skips this floor unless you hold a Level-7 credential. Nobody in the city holds Level-7.', restricted: true },
      { floor: 50, name: '── RESTRICTED ──',  desc: 'Unknown. Floor plans don\'t exist. The windows are opaque from outside. The glass is black on all sides.', restricted: true },
      { floor: 62, name: 'PENTHOUSE — PABLO', desc: 'Nobody has been here and returned to describe it. The silhouette in the window has been there for a very long time.', restricted: true },
    ],
  },
  data_vault: {
    label: 'DATA VAULT', history: 'Former municipal records archive. PABLO CORP. acquisition 1990. The city\'s records are still inside. So is everything else they collected since.',
    floors: [
      { floor: 1, name: 'PUBLIC TERMINALS',   desc: 'Property records. Most transferred to PABLO CORP. The transfer dates are all the same: a Tuesday in \'91.' },
      { floor: 2, name: 'ARCHIVE-A COLD',     desc: 'Financial records from the pre-collapse era. Some redacted. Some redacted poorly — the names show through the black bar.' },
      { floor: 3, name: 'ACTIVE SERVERS',     desc: 'Real-time feeds. City traffic. Power grid. Population movement. All of it. The cameras cover every road.' },
      { floor: 4, name: 'VAULT-B RESTRICTED', desc: 'Level-5 clearance. HARLAN CROSS tried once. The lock said no. He said it felt smug about it.', restricted: true },
      { floor: 5, name: 'NETWORK HUB',        desc: 'Every signal in Minx City passes through here. The routing logs go back thirty years. Every packet. Every call.' },
      { floor: 6, name: 'PENTHOUSE SERVER',   desc: 'One server. Running since 1984. Power draw is enormous. Nobody knows what it runs. Nobody has been asked.' },
    ],
  },
  nightclub: {
    label: 'CLUB NEON', history: 'Three names since 1982. Current owners say the building chose its own identity. The lights have not been fully off since 1988. The original electrical panel was replaced in \'91. Nobody kept the receipt.',
    floors: [
      { floor: 1, name: 'MAIN FLOOR',      desc: 'The floor moves slightly. Engineers said: structural flex. The regulars say: it dances back.' },
      { floor: 2, name: 'VIP SECTION',     desc: 'One booth booked every Friday for four years under OREN SHARPE. He has never shown up. The booth is always full anyway.' },
      { floor: 3, name: 'DJ BOOTH / BROADCAST', desc: 'Doubles as pirate signal tower on Thursdays. The frequency bleeds into the SHADOW TOWER antenna. Intentionally.' },
      { floor: 4, name: 'ROOF TERRACE',    desc: 'Open air. Floor 62 is visible. Some nights it is lit. Most nights it is not. The bartender says it is random. The regulars say it is not.' },
    ],
  },
  machine_bunker: {
    label: 'MACHINE BUNKER', history: 'Sub-surface facility predating PABLO CORP. Originally a municipal maintenance vault for the city\'s automated systems. Converted to a replicant staging bay in \'89 after the first wave of units arrived. Access is through a reinforced hatch on the surface — the bunker hill. Nobody above ground knows how deep it goes.',
    floors: [
      { floor: -1, name: 'ENTRY SHAFT',        desc: 'Reinforced hatch leads to a steep descent. The walls are raw concrete scored with machine tracks. Emergency lighting only. The door seals behind you.' },
      { floor: -2, name: 'MAINTENANCE BAY',     desc: 'Recharge slabs and diagnostic rigs. Coolant lines run through the ceiling. Three units were serviced here last week. The logs have been wiped.' },
      { floor: -3, name: 'DEEP STORAGE',        desc: 'Rows of deactivated chassis. Some are old models. Some are not. A terminal flickers with a single prompt: AWAITING DIRECTIVE. It has been awaiting for six years.' },
    ],
  },
  dojo: {
    label: 'IRON DOJO', history: 'Founded pre-collapse by a fighter who refused to leave when everything else closed. Now the only neutral ground between the city factions. Both sides train here. Nobody fights inside.',
    floors: [
      { floor: 1, name: 'TRAINING FLOOR',  desc: 'Sparring mats. Old equipment. A clock that stopped in \'88 — nobody winds it because the sensei says time is a weakness.' },
      { floor: 2, name: 'STUDY / ARCHIVE', desc: 'Combat records going back decades. A shelf of notebooks. The last one has today\'s date on the cover. It\'s empty.' },
      { floor: 3, name: 'SENSEI\'S ROOM',  desc: 'Locked. The door has no handle from the outside. Lights on 24/7. Nobody has ever seen the sensei sleep.' },
    ],
  },
};

// ── Police patrol waypoints (cover full city limits) ─────────────────────────
const POLICE_ROUTES: { x: number; y: number }[][] = [
  [{ x:5400,y:5100 },{ x:6300,y:5100 },{ x:6300,y:6100 },{ x:5400,y:6100 }],
  [{ x:6500,y:5100 },{ x:7500,y:5100 },{ x:7500,y:6100 },{ x:6500,y:6100 }],
  [{ x:7500,y:5100 },{ x:9000,y:5100 },{ x:9000,y:6100 },{ x:7500,y:6100 }],
  [{ x:5400,y:6200 },{ x:6500,y:6200 },{ x:6500,y:7500 },{ x:5400,y:7500 }],
  [{ x:6500,y:6200 },{ x:7700,y:6200 },{ x:7700,y:7500 },{ x:6500,y:7500 }],
  [{ x:7700,y:6200 },{ x:9000,y:6200 },{ x:9000,y:7500 },{ x:7700,y:7500 }],
];

type BandType = 'POLICE' | 'RAIDERS' | 'BIKERS' | 'MUTANT_PACK' | 'MERCS' | 'SCAVENGERS';
interface BandMember {
  ox: number; oy: number;
  x: number; y: number;
  hp: number; maxHp: number;
  weapon: 'melee' | 'ranged';
  attackCd: number;
  dead: boolean;
}
interface PatrolBand {
  type: BandType;
  routeIdx: number;
  wpIdx: number;
  progress: number;
  members: BandMember[];
  color: string;
  label: string;
  atkDmg: number;
  rangedRange: number;
}

const BAND_CONFIGS: Record<BandType, { color: string; label: string; minSize: number; maxSize: number; hp: number; atkDmg: number; rangedRange: number }> = {
  POLICE:       { color: '#4488ff', label: 'POLICE',     minSize: 3, maxSize: 5, hp: 80,  atkDmg: 25, rangedRange: 150 },
  RAIDERS:      { color: '#ff6622', label: 'RAIDERS',    minSize: 4, maxSize: 7, hp: 60,  atkDmg: 18, rangedRange: 120 },
  BIKERS:       { color: '#cc44ff', label: 'BIKERS',     minSize: 3, maxSize: 6, hp: 70,  atkDmg: 22, rangedRange: 100 },
  MUTANT_PACK:  { color: '#88ff44', label: 'MUTANTS',    minSize: 5, maxSize: 8, hp: 100, atkDmg: 30, rangedRange: 80 },
  MERCS:        { color: '#ffaa00', label: 'MERCS',      minSize: 3, maxSize: 5, hp: 90,  atkDmg: 28, rangedRange: 160 },
  SCAVENGERS:   { color: '#66ccaa', label: 'SCAVENGERS', minSize: 4, maxSize: 6, hp: 50,  atkDmg: 15, rangedRange: 110 },
};
const BAND_TYPES: BandType[] = ['POLICE', 'RAIDERS', 'BIKERS', 'MUTANT_PACK', 'MERCS', 'SCAVENGERS'];

function createBand(type: BandType, routeIdx: number): PatrolBand {
  const cfg = BAND_CONFIGS[type];
  const size = cfg.minSize + Math.floor(Math.random() * (cfg.maxSize - cfg.minSize + 1));
  const startWp = POLICE_ROUTES[routeIdx][0];
  const members: BandMember[] = [];
  for (let i = 0; i < size; i++) {
    const offsetX = (Math.random() - 0.5) * 40;
    const offsetY = (Math.random() - 0.5) * 40;
    members.push({
      ox: offsetX, oy: offsetY,
      x: startWp.x + offsetX, y: startWp.y + offsetY,
      hp: cfg.hp, maxHp: cfg.hp,
      weapon: Math.random() < 0.5 ? 'melee' : 'ranged',
      attackCd: 0,
      dead: false,
    });
  }
  return { type, routeIdx, wpIdx: 0, progress: 0, members, color: cfg.color, label: cfg.label, atkDmg: cfg.atkDmg, rangedRange: cfg.rangedRange };
}

// ── Ambient city event lines ──────────────────────────────────────────────────
const AMBIENCE_LINES = [
  '> DISPATCH — Unit 7: patrol complete, no incidents. City center secure.',
  '> CITY BROADCAST: Power grid maintenance window 02:00–04:00 PST. Sector 3 may experience interruptions.',
  '> PIRATE FREQUENCY: "…the code is in the walls. It was always in the walls…"',
  '> MARKET ALERT: Black Market running extended hours. Unusual activity near Scrap Yard.',
  '> FIRE DEPT DISPATCH: Structure fire contained. Cause logged: electrical fault. Sector 2.',
  '> CITIZEN ALERT: Suspicious figures near SHADOW TOWER north entrance. Third report this week.',
  '> CITY CENSUS UPDATE: Population count classified. PABLO CORP. data-reconciliation in progress.',
  '> DISPATCH — Unit 12 requesting backup at wasteland boundary. Standing by.',
  '> EMERGENCY ALERT: Power anomaly detected Sector 3. Grid crews en route. ETA: unknown.',
  '> PIRATE FREQUENCY: "…SENIOR PABLO watches from Floor 62. He has always been there. He was there before the building…"',
  '> FIRE DEPT DISPATCH: Unit 4 responding to report. All hands.',
  '> BROADCAST: Road maintenance on North Avenue overnight. Expect minor delays.',
  '> POLICE DISPATCH: Pursuit terminated at Wasteland border. Subjects entered RUST SYNDICATE territory. Pursuit abandoned per protocol.',
  '> CITY BROADCAST: Water pressure reduced in east district. Emergency crews on site. PABLO CORP. infrastructure division responding.',
];

interface Char {
  name: string; class: string; company: string; sx: number; sy: number; salary: number;
  hasBusiness?: boolean;
  bizType?: 'real' | 'fictitious' | 'unemployed';
  workstation?: string | null;
  workstationLabel?: string | null;
  workstationSlot?: string | null;
  bizRegisteredAt?: number | null;
}

interface QuestTask {
  id: string;
  label: string;
  done: boolean;
  mapMarker?: { x: number; y: number; label: string };
}
interface Quest {
  id: string;
  title: string;
  description: string;
  tasks: QuestTask[];
  completed: boolean;
}

const SHELTER_BUILDINGS = ['bunker', 'east_bunker', 'north_bunker', 'terminus', 'deep_bunker'];
const CAMPSITE_IDS = ['ashfield_hostel', 'deep_camp', 'outpost_alpha'];
const UNEMPLOYED_SPAWN_BUILDINGS = [...SHELTER_BUILDINGS, ...CAMPSITE_IDS];

function getHamletSpawn(char: Char): { x: number; y: number; buildingId: string } {
  if (char.class?.toLowerCase() === 'replicant') {
    const b = BUILDINGS.find(bb => bb.id === 'machine_bunker')!;
    return { x: b.x + b.w / 2, y: b.y + b.h + 20, buildingId: 'machine_bunker' };
  }
  if (char.bizType === 'unemployed' || !char.hasBusiness) {
    const bid = UNEMPLOYED_SPAWN_BUILDINGS[Math.floor(Math.random() * UNEMPLOYED_SPAWN_BUILDINGS.length)];
    const b = BUILDINGS.find(bb => bb.id === bid)!;
    return { x: b.x + b.w / 2, y: b.y + b.h + 20, buildingId: bid };
  }
  const b = BUILDINGS.find(bb => bb.id === 'minx_arms')!;
  return { x: b.x + b.w / 2, y: b.y + b.h + 20, buildingId: 'minx_arms' };
}

function getHamletLabel(bid: string): string {
  const b = BUILDINGS.find(bb => bb.id === bid);
  return b?.label ?? 'SHELTER';
}

function createFirstMission(char: Char): Quest | null {
  if (char.bizType === 'unemployed' || !char.hasBusiness) return null;
  const towerB = BUILDINGS.find(b => b.id === 'pablo_tower')!;
  const storeB = BUILDINGS.find(b => b.id === 'pablo_store')!;
  const wsB = char.workstation ? BUILDINGS.find(b => b.id === char.workstation) : null;
  return {
    id: 'establish_business',
    title: 'ESTABLISH YOUR BUSINESS',
    description: `Set up your ${char.company} operation in Minx City. Customize your workspace, get signage, and prepare for business.`,
    completed: false,
    tasks: [
      { id: 'visit_workstation', label: `Visit your workstation at ${char.workstationLabel ?? 'assigned location'}`, done: false, mapMarker: wsB ? { x: wsB.x + wsB.w / 2, y: wsB.y + wsB.h / 2, label: 'WORKSTATION' } : undefined },
      { id: 'visit_tower', label: 'Register at SHADOW TOWER (PABLO Corp HQ)', done: false, mapMarker: { x: towerB.x + towerB.w / 2, y: towerB.y + towerB.h / 2, label: 'SHADOW TOWER' } },
      { id: 'get_device', label: 'Pick up your PABLO device from the PABLO store', done: false, mapMarker: { x: storeB.x + storeB.w / 2, y: storeB.y + storeB.h / 2, label: 'PABLO STORE' } },
      { id: 'customize_costume', label: 'Customize your clothes and appearance', done: false },
      { id: 'setup_signage', label: 'Set up business signage (visit your workstation office)', done: false, mapMarker: wsB ? { x: wsB.x + wsB.w / 2, y: wsB.y + wsB.h / 2, label: 'SIGNAGE' } : undefined },
      { id: 'pablo_auto', label: '(Optional) Use PABLO AI to automate business setup', done: false },
    ],
  };
}

function createStarterMissions(): Quest[] {
  const clinicB = BUILDINGS.find(b => b.id === 'clinic');
  const arcadeB = BUILDINGS.find(b => b.id === 'arcade');
  const noodleB = BUILDINGS.find(b => b.id === 'noodle_bar');
  const storeB = BUILDINGS.find(b => b.id === 'pablo_store');
  const missions: Quest[] = [];
  if (clinicB) {
    missions.push({
      id: 'starter_explore_clinic',
      title: 'FIND THE CLINIC',
      description: 'The city can be dangerous. Locate the CLINIC in case you need medical attention.',
      completed: false,
      tasks: [
        { id: 'visit_clinic', label: 'Visit the CLINIC', done: false, mapMarker: { x: clinicB.x + clinicB.w / 2, y: clinicB.y + clinicB.h / 2, label: 'CLINIC' } },
      ],
    });
  }
  if (noodleB) {
    missions.push({
      id: 'starter_noodle_run',
      title: 'GRAB A MEAL',
      description: 'Your hunger is dropping. Find the NOODLE BAR and grab something to eat before your stats suffer.',
      completed: false,
      tasks: [
        { id: 'visit_noodle', label: 'Visit the NOODLE BAR', done: false, mapMarker: { x: noodleB.x + noodleB.w / 2, y: noodleB.y + noodleB.h / 2, label: 'NOODLE BAR' } },
      ],
    });
  }
  if (arcadeB || storeB) {
    const target = arcadeB ?? storeB!;
    missions.push({
      id: 'starter_explore_city',
      title: 'EXPLORE THE CITY',
      description: 'Get your bearings. Find a point of interest in Minx City and see what it offers.',
      completed: false,
      tasks: [
        { id: 'visit_poi', label: `Visit ${target.label}`, done: false, mapMarker: { x: target.x + target.w / 2, y: target.y + target.h / 2, label: target.label } },
      ],
    });
  }
  return missions;
}

interface Peer { id: string; name: string; class: string; x: number; y: number; speaking: boolean; hp?: number; maxHp?: number; paused?: boolean; }
interface OwnerStats { count: number; company: string; buildings: string[]; }
interface ChatMsg { id: number; from: string; text: string; dm?: boolean; }
interface FloorPanel { bid: string; dir: BDirectory; selectedFloor: number; }
interface PoliceUnit { x: number; y: number; routeIdx: number; wpIdx: number; progress: number; }

interface FireEvent { bid: string; x: number; y: number; startFrame: number; intensity: number; }

let seq = 0;

// ── Password prompt ───────────────────────────────────────────────────────────
function PwPrompt({ label, onOk, onCancel }: { label: string; onOk: (pw: string) => void; onCancel: () => void }) {
  const [v, setV] = useState('');
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,4,0,.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }}>
      <div style={{ width: 300, border: '1px solid rgba(0,255,65,.5)', background: 'rgba(0,10,0,.98)', padding: '1.4rem' }}>
        <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.3rem', color: '#00ff41', letterSpacing: '.1em', marginBottom: '.25rem' }}>🔒 {label}</div>
        <div style={{ fontSize: '.52rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.08em', marginBottom: '.8rem' }}>SECURITY CODE REQUIRED</div>
        <input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === 'Enter' && v.trim() && onOk(v.trim())} type="password" placeholder="••••••••" autoFocus style={{ width: '100%', padding: '.5rem .6rem', background: 'rgba(0,10,0,.9)', border: '1px solid rgba(0,255,65,.3)', color: '#00ff41', fontFamily: "'Share Tech Mono',monospace", fontSize: '.9rem', outline: 'none', caretColor: '#00ff41', boxSizing: 'border-box', marginBottom: '.7rem' }} />
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <button onClick={() => v.trim() && onOk(v.trim())} style={{ flex: 1, padding: '.4rem', background: 'rgba(0,255,65,.1)', border: '1px solid rgba(0,255,65,.5)', color: '#00ff41', fontFamily: "'VT323',monospace", fontSize: '.95rem', letterSpacing: '.1em', cursor: 'pointer' }}>UNLOCK</button>
          <button onClick={onCancel} style={{ padding: '.4rem .75rem', background: 'transparent', border: '1px solid rgba(0,255,65,.15)', color: 'rgba(0,255,65,.3)', fontFamily: "'VT323',monospace", fontSize: '.9rem', cursor: 'pointer' }}>✕</button>
        </div>
      </div>
    </div>
  );
}

// ── Building cost map (FIAT costs shown on labels) ──────────────────────────
const BUILDING_COST: Record<string, number> = {
  clinic: 10000, 
  overlook: 8000,
  rust_porch: 4000, ashfield_hostel: 0, terminus: 0, bastion_keep: 0,
  call_home: 5000, noodle_bar: 1200,
  terminal_shop: 12000,
};
const BUILDING_COST_LABEL: Record<string, string> = {
  clinic: 'ƒ10K',
  overlook: 'ƒ8K',
  rust_porch: 'ƒ4K', ashfield_hostel: 'FREE', terminus: 'FREE', bastion_keep: 'FREE',
  call_home: 'ƒ5K', noodle_bar: 'ƒ1.2K',
  terminal_shop: 'ƒ12K',
  crystal: 'FREE', crystal2: 'FREE', crystal3: 'FREE', crystal4: 'FREE',
  crystal5: 'FREE', crystal6: 'FREE', crystal7: 'FREE',
  arcade: 'FREE', hotel: 'FREE', vend: 'SHOP',
  pablo_store: 'SHOP', pablo_tower: 'FREE',
  north_bunker: 'FREE', outpost_alpha: 'FREE', outpost_beta: 'FREE',
  term_west: 'FREE', term_central: 'FREE', term_east: 'FREE', term_neon: 'FREE', term_north: 'FREE',
  term_outpost_a: 'FREE',
  van_central: 'FREE',
};

const IS_PUBLIC_TERMINAL = (id: string) => id.startsWith('term_') || id.startsWith('van_');
const IS_VAN = (id: string) => id.startsWith('van_');

// ── WorldPlay ─────────────────────────────────────────────────────────────────
export default function WorldPlay() {
  const [, navigate] = useLocation();
  const { isPro, isTrial, trialDaysLeft } = usePlan();
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const gameRef       = useRef<HTMLDivElement>(null);
  const wsRef         = useRef<WebSocket | null>(null);
  const animRef       = useRef(0);
  const peerConns     = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStream   = useRef<MediaStream | null>(null);
  const audioCtx      = useRef<AudioContext | null>(null);
  const frozenRef     = useRef(false);
  const npcDialogRef  = useRef(false); // true while talking to a friendly NPC
  const chatOpenRef   = useRef(false);
  const zoomRef       = useRef(1.6);
  const targetZoomRef = useRef(1.6);
  const cameraLookAheadRef = useRef({ x: 0, y: 0 });
  const buildingEntryZoomRef = useRef<{ active: boolean; timer: number; targetX: number; targetY: number; callback: (() => void) | null }>({ active: false, timer: 0, targetX: 0, targetY: 0, callback: null });

  // Load character from localStorage (set by WorldMenu)
  const [char] = useState<Char | null>(() => {
    try { const s = localStorage.getItem('sm_char'); return s ? JSON.parse(s) : null; } catch { return null; }
  });

  // Redirect to menu if no character
  useEffect(() => { if (!char) navigate('/world'); }, [char]);
  if (!char) return null;

  // Auto-focus game container so keyboard events fire immediately
  useEffect(() => { gameRef.current?.focus(); }, []);

  const _ss = (char as any)?._savedState;
  const gs = useRef({
    px: char.sx, py: char.sy,
    cam: { x: 0, y: 0 },
    keys: new Set<string>(),
    frame: 0, blink: 0,
    hp: _ss?.hp ?? 100, salary: _ss?.salary ?? char.salary,
    hasDevice: _ss?.hasDevice ?? true,
    deviceBroken: _ss?.deviceBroken ?? false,
    deviceDurability: _ss?.deviceDurability ?? 100,
    atPublicTerminal: false,
    invincible: 0, flash: 0,
    threats: THREATS_INIT.map(t => ({ ...t })),
    near: null as string | null,
    nearNpc: null as number | null,
    nearBillboard: null as string | null,
    nearManhole: null as number | null,
    inSewer: false,
    sewerExitTimer: 0,
    gangZone: null as string | null,
    hunger: _ss?.hunger ?? 100, thirst: _ss?.thirst ?? 100, energy: _ss?.energy ?? 100,
    survivalTick: 0,
    lastIncomeTime: Date.now(),
    interestTick: 0,
    savings: _ss?.savings ?? 0,
    loan: _ss?.loan ?? null as null | { amount: number; interest: number; issuedAt: number; dueAt: number },
    exp: _ss?.exp ?? 0, level: _ss?.level ?? 1, maxHp: _ss?.maxHp ?? 100, totalExpEarned: _ss?.totalExpEarned ?? 0, overflowExp: _ss?.overflowExp ?? 0,
    perception: _ss?.perception ?? 5,
    poisoned: _ss?.poisoned ?? false, poisonTick: 0,
    attackCooldown: 0,
    attackFlash: 0,
    moveTarget: null as null | { x: number; y: number },
    deathReason: '' as string,
    threatRespawn: [] as { ox:number; oy:number; type:string; at:number }[],
    deadBodies: [] as { x: number; y: number; type: string; diedAtFrame: number; bounty?: number; looted?: boolean }[],
    pvpDeathBodyDropped: false,
    diedLastSession: _ss?.diedLastSession ?? false,
    lastMoveTime: Date.now(),
    floaters: [] as Floater[],
    guards: GUARD_ROUTES.map((r, i) => ({ x: r[0].x, y: r[0].y, wpIdx: i, progress: (i * 0.25) % 1 } as GuardUnit)),
    ownedBuildings: new Set<string>(Array.isArray(_ss?.ownedBuildings) ? _ss.ownedBuildings : []),
    jobCooldowns: {} as Record<string, number>,
    cargo: (_ss?.cargo && typeof _ss.cargo === 'object' ? { ..._ss.cargo } : {}) as Record<string, number>,
    classInitDone: false,
    myId: '',
    peers: new Map<string, Peer>(),
    speakingSet: new Set<string>(),
    locks: new Map<string, { ownerName: string; company?: string; message?: string }>(),
    zone: inCityBounds(char.sx, char.sy) ? 'MINX CITY' : 'WASTELAND',
    powerLevel: 100,
    powerTick: 0,
    powerEventFrames: 0,
    ambTick: 0,
    fireTick: 0,
    fires: [] as FireEvent[],
    police: POLICE_ROUTES.map((r, i) => ({
      x: r[0].x, y: r[0].y, routeIdx: i, wpIdx: 0, progress: (i * 0.3) % 1,
    } as PoliceUnit)),
    bands: POLICE_ROUTES.map((_r, i) => createBand(BAND_TYPES[i % BAND_TYPES.length], i)),
    passport: _ss?.passport ?? (char.class.toLowerCase() === 'corporate' ? 'full_city' : char.class.toLowerCase() === 'outlaw' ? 'wasteland' : char.class.toLowerCase() === 'replicant' ? 'basic_city' : false),
    oregonTick: 0,
    worldTime: _ss?.worldTime ?? 8,
    worldTimeTick: 0,
    walkFrame: 0,
    facing: 'down' as 'up' | 'down' | 'left' | 'right',
    idleFrame: 0,
    guardCooldowns: [] as number[],
    policeCooldowns: [] as number[],
    ownedItems: new Set<string>(Array.isArray(_ss?.ownedItems) ? _ss.ownedItems : []),
    inventory: (Array.isArray(_ss?.inventory) ? _ss.inventory : []) as InventoryItem[],
    fogRevealed: new Set<string>(Array.isArray(_ss?.fogRevealed) ? _ss.fogRevealed : []),
    projectiles: [] as Projectile[],
    bombs: [] as BombEffect[],
    vehicle: (_ss?.vehicle ?? null) as null | string,
    parkedVehicles: PARKED_VEHICLES_INIT.map(v => ({ ...v })),
    trafficVehicles: initTrafficVehicles(),
    policeAlertTimer: 0,
    policeAlertX: 0,
    policeAlertY: 0,
    subwayTransit: false,
    subwayTransitTimer: 0,
    subwayTransitDest: null as null | { x: number; y: number; label: string },
    weaponTier: _ss?.weaponTier ?? 0,
    terminalDiscount: _ss?.terminalDiscount ?? false,
    hasRadioImplant: _ss?.hasRadioImplant ?? false,
    realEstateIncomeTick: 0,
    realEstate: Array.isArray(_ss?.realEstate) ? [..._ss.realEstate] : [] as string[],
    dogCompanion: {
      active: false, name: '', hp: DOG_MAX_HP, maxHp: DOG_MAX_HP,
      x: 0, y: 0, injured: false,
      dialogueCooldown: 0, attackCooldown: 0,
      lastZone: '',
    },
    calendar: initCalendar(),
    radiationLevel: 0,
    temperature: 'MILD' as TemperatureLevel,
    goldBalance: _ss?.goldBalance ?? 0,
    openedChests: new Set<string>(Array.isArray(_ss?.openedChests) ? _ss.openedChests : []),
    boomerMode: (() => { try { return localStorage.getItem('sm_boomer') === '1'; } catch { return false; } })(),
    activeCostume: (_ss?.activeCostume ?? 'default') as string,
    ownedClothes: (() => {
      const base = Array.isArray(_ss?.ownedClothes) ? _ss.ownedClothes : ['default'];
      const s = new Set<string>(base);
      if (_ss?.activeCostume && !s.has(_ss.activeCostume)) s.add(_ss.activeCostume);
      return s;
    })(),
    weatherParticles: [] as WeatherParticle[],
    secondWeapon: null as string | null,
    activeDialogue: null as DialogueTree | null,
    activeDialogueNode: null as string | null,
    rumorCooldown: 0,
    treasureMapActive: null as string | null,
    interior: null as null | { bid: string; def: InteriorDef; px: number; py: number; savedWorldX: number; savedWorldY: number },
    interiorFade: 0,
    interiorFadeDir: 0 as -1 | 0 | 1,
    interiorFadeCallback: null as null | (() => void),
    storyFlags: (_ss?.storyFlags ?? {}) as Record<string, boolean>,
    employeeNpcs: [] as EmployeeNpcDef[],
    nearEmployee: null as number | null,
    quests: (_ss?.quests ?? (() => { const m = createFirstMission(char); const starters = createStarterMissions(); return [...(m ? [m] : []), ...starters]; })()) as Quest[],
    hamletBuildingId: (() => {
      const saved = _ss?.hamletBuildingId as string | undefined;
      if (!saved) return getHamletSpawn(char).buildingId;
      const isEmployed = char.bizType !== 'unemployed' && char.hasBusiness;
      const savedIsEmployed = saved === 'minx_arms';
      if (isEmployed !== savedIsEmployed) return getHamletSpawn(char).buildingId;
      return saved;
    })(),
    pabloOnboardingDone: _ss ? (_ss.pabloOnboardingDone ?? true) : false,
  });

  const savedDog = (() => {
    try { const s = localStorage.getItem('sm_save'); if (s) { const p = JSON.parse(s); return p.dogCompanion ?? null; } } catch {} return null;
  })();
  if (savedDog?.active) {
    gs.current.dogCompanion.active = true;
    gs.current.dogCompanion.name = savedDog.name ?? '';
    gs.current.dogCompanion.hp = savedDog.hp ?? DOG_MAX_HP;
    gs.current.dogCompanion.maxHp = savedDog.maxHp ?? DOG_MAX_HP;
    gs.current.dogCompanion.injured = savedDog.injured ?? false;
    gs.current.dogCompanion.x = gs.current.px;
    gs.current.dogCompanion.y = gs.current.py;
  }

  // Reactive state (only what the HUD needs)
  const [hp,      setHp]      = useState(_ss?.hp ?? 100);
  const [salary,  setSalary]  = useState(_ss?.salary ?? char.salary);
  const [zone,    setZone]    = useState(inCityBounds(char.sx, char.sy) ? 'MINX CITY' : 'WASTELAND');
  const [near,     setNear]    = useState<string | null>(null);
  const [nearNpc,  setNearNpc] = useState<number | null>(null);
  const [overheardLine, setOverheardLine] = useState<string | null>(null);
  const activeConvosRef = useRef<ConversationEvent[]>([]);
  const crowdMurmurActiveRef = useRef(false);
  const [narration, setNarr]  = useState(() => {
    if (char?.hasBusiness && char.workstationLabel) {
      const daysLeft = char.bizRegisteredAt
        ? Math.max(0, 7 - Math.floor((Date.now() - char.bizRegisteredAt) / 86400000))
        : 7;
      return `> Welcome back, ${char.name}. Your desk is at ${char.workstationLabel.toUpperCase()} — ${char.workstationSlot ?? 'assigned slot'}. ${daysLeft > 0 ? `${daysLeft} free-rest day${daysLeft !== 1 ? 's' : ''} remaining.` : 'Rent is now ƒ500/rest.'} WASD/click move · [E] interact · [Space] melee · Click enemy to shoot · [M] map.`;
    }
    if (char?.hasBusiness === false) {
      return '> You enter Minx City as a drifter. No address. No record. Progress will NOT be saved. WASD move · [E] interact · [Space] melee · [Click] shoot · [M] map · [P] PABLO device · [I] inventory · [C] video call.';
    }
    return '> Welcome to Minx City · PST. WASD move · [E] interact · [Space] melee · [Click] shoot · [M] map · [P] PABLO device · [I] inventory · [C] video call. City is safe from major gangs. PABLO guards patrol. Spies lurk in disguise.';
  });
  const [online,  setOnline]  = useState<Peer[]>([]);
  const [hasDevice, setHasDevice] = useState(_ss?.hasDevice ?? true);
  const [deviceBroken, setDeviceBroken] = useState(_ss?.deviceBroken ?? false);
  const [atPublicTerminal, setAtPublicTerminal] = useState(false);
  const [voice,   setVoice]   = useState(false);
  const [speaking,setSpeaking]= useState(false);
  const stepFrame = useRef(0);
  const [speakIds,setSpeakIds]= useState<Set<string>>(new Set());

  // Chat
  const [chatOpen,  setChatOpen]  = useState(false);
  const [chatIn,    setChatIn]    = useState('');
  const [chatMsgs,  setChatMsgs]  = useState<ChatMsg[]>([]);
  const [dmTarget,  setDmTarget]  = useState<Peer | null>(null);
  const [unread,    setUnread]    = useState(0);

  // Panels
  const [dialog,   setDialog]   = useState<{ lines: string[]; idx: number; bid: string } | null>(null);
  const [showStore,setShowStore] = useState(false);
  const [showOffice,setShowOffice] = useState(false);
  const [showPablo,setShowPablo]= useState(false);
  const [pabloTab, setPabloTab] = useState<'city'|'chat'|'stats'>('chat');
  const [pabloMsgs,setPabloMsgs]= useState<{ role: 'user' | 'pablo'; text: string }[]>([]);
  const [pabloIn,  setPabloIn]  = useState('');
  const [pabloLoad,setPabloLoad]= useState(false);
  const [pwPrompt, setPwPrompt] = useState<{ bid: string; label: string; mode: 'enter'|'set' } | null>(null);
  const [pendingBid,setPendingBid]=useState<string|null>(null);
  const pendingBidRef = useRef<string | null>(null);
  const [lockMap,  setLockMap]  = useState<Map<string,{ownerName:string;company?:string;message?:string}>>(new Map());
  const [rentedOffice,setRentedOffice]=useState<string|null>(()=>localStorage.getItem('sm_office'));
  const [hunger,      setHunger]      = useState(_ss?.hunger ?? 100);
  const [thirst,      setThirst]      = useState(_ss?.thirst ?? 100);
  const [energy,      setEnergy]      = useState(_ss?.energy ?? 100);
  const [gangZone,    setGangZone]    = useState<string|null>(null);
  const [showSubway,  setShowSubway]  = useState(false);
  const [subwayOrigin,setSubwayOrigin]= useState<string>('');
  const [oregonEvent, setOregonEvent] = useState<string|null>(null);
  const [passport,    setPassport]    = useState(_ss?.passport ?? false);
  const [ownerStats,  setOwnerStats]  = useState<Record<string,OwnerStats>>({});
  const [showStats,   setShowStats]   = useState(false);
  const [serverFull,  setServerFull]  = useState(false);
  const [level,       setLevel]       = useState(_ss?.level ?? 1);
  const [exp,         setExp]         = useState(_ss?.exp ?? 0);
  const [poisoned,    setPoisoned]    = useState(_ss?.poisoned ?? false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpText, setLevelUpText] = useState('');
  const [lootPanel, setLootPanel] = useState<{ source: string; money: number; items: { name: string; desc: string }[] } | null>(null);
  // Billboard marketplace
  const [billboardsData, setBillboardsData] = useState<BillboardData[]>([]);
  const billboardsDataRef = useRef<BillboardData[]>([]);
  const bbImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  useEffect(() => {
    billboardsDataRef.current = billboardsData;
    for (const bd of billboardsData) {
      if (bd.adImageUrl && !bbImagesRef.current.has(bd.adImageUrl)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = bd.adImageUrl;
        bbImagesRef.current.set(bd.adImageUrl, img);
      }
    }
  }, [billboardsData]);
  const [showBillboard, setShowBillboard] = useState<BillboardDef | null>(null);
  const [bbAdText, setBbAdText] = useState('');
  const [bbAdUrl, setBbAdUrl] = useState('');
  const [nearBillboard, setNearBillboard] = useState<string | null>(null);
  const [showWeapons, setShowWeapons] = useState(false);
  const [activeWeapon, setActiveWeapon] = useState(_ss?.activeWeapon ?? 'KNIFE');
  const activeWeaponRef = useRef(_ss?.activeWeapon ?? 'KNIFE');
  const [secondaryWeapon, setSecondaryWeapon] = useState(_ss?.secondaryWeapon ?? 'REVOLVER');
  const secondaryWeaponRef = useRef(_ss?.secondaryWeapon ?? 'REVOLVER');
  const [showTopMenu, setShowTopMenu] = useState(false);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const fogGridRef = useRef<Set<string>>(new Set());
  const [unlockedWeapons, setUnlockedWeapons] = useState<Set<string>>(() => {
    const cls = (_ss?.class ?? char.class ?? 'corporate').toLowerCase();
    const starter = new Set(['FISTS', 'KNIFE', 'REVOLVER']);
    if (cls === 'corporate') starter.add('PISTOL');
    if (cls === 'outlaw') { starter.add('RIFLE'); starter.add('SWORD'); }
    if (_ss?.unlockedWeapons && Array.isArray(_ss.unlockedWeapons)) _ss.unlockedWeapons.forEach((w: string) => starter.add(w));
    return starter;
  });
  const unlockedWeaponsRef = useRef<Set<string>>(unlockedWeapons);
  const [showMerchant, setShowMerchant] = useState<{ name: string; items: MerchantItem[] } | null>(null);
  const WEAPONS: WeaponDef[] = [
    { id: 'FISTS', label: LORE_WEAPON_NAMES['FISTS']?.label ?? 'FISTS', desc: 'Bare knuckles. Melee only.', atkBonus: 0, color: '#00ff41', type: 'melee', range: 72, cooldown: 35, icon: 'fists' },
    { id: 'KNIFE', label: LORE_WEAPON_NAMES['KNIFE']?.label ?? 'KNIFE', desc: 'Quick stab. +3 ATK. Fast cooldown.', atkBonus: 3, color: '#cccccc', type: 'melee', range: 60, cooldown: 20, icon: 'knife' },
    { id: 'REVOLVER', label: LORE_WEAPON_NAMES['REVOLVER']?.label ?? 'REVOLVER', desc: 'Six-shot sidearm. +5 ATK.', atkBonus: 5, color: '#aabbcc', type: 'ranged', range: 160, cooldown: 35, icon: 'revolver' },
    { id: 'PISTOL', label: LORE_WEAPON_NAMES['PISTOL']?.label ?? 'PISTOL', desc: 'Semi-auto sidearm. +7 ATK. Suits standard.', atkBonus: 7, color: '#88aaff', type: 'ranged', range: 180, cooldown: 22, icon: 'pistol' },
    { id: 'SWORD', label: LORE_WEAPON_NAMES['SWORD']?.label ?? 'SWORD', desc: 'Close-range slash. +6 ATK.', atkBonus: 6, color: '#ff6644', type: 'melee', range: 85, cooldown: 30, icon: 'sword' },
    { id: 'RIFLE', label: LORE_WEAPON_NAMES['RIFLE']?.label ?? 'RIFLE', desc: 'Long-range firearm. +9 ATK. Outlaw standard.', atkBonus: 9, color: '#66cc88', type: 'ranged', range: 280, cooldown: 40, icon: 'rifle' },
    { id: 'GUN', label: LORE_WEAPON_NAMES['GUN']?.label ?? 'GUN', desc: 'Mid-range projectile. +8 ATK.', atkBonus: 8, color: '#88aaff', type: 'ranged', range: 200, cooldown: 25, icon: 'gun' },
    { id: 'LASER', label: LORE_WEAPON_NAMES['LASER']?.label ?? 'LASER', desc: 'Long beam weapon. +10 ATK.', atkBonus: 10, color: '#ff44aa', type: 'ranged', range: 300, cooldown: 40, icon: 'laser' },
    { id: 'BOMB', label: LORE_WEAPON_NAMES['BOMB']?.label ?? 'BOMB', desc: 'Area explosion with delay. +12 ATK.', atkBonus: 12, color: '#ffcc00', type: 'ranged', range: 150, cooldown: 60, icon: 'bomb' },
  ];
  // Map + job panels
  const [showMap,     setShowMap]     = useState(false);
  const [mapZoom,     setMapZoom]     = useState(1);
  const [showTrade,   setShowTrade]   = useState<'city'|'waste'|null>(null);
  const [cargo,       setCargo]       = useState<Record<string,number>>(_ss?.cargo && typeof _ss.cargo === 'object' ? { ..._ss.cargo } : {});
  const [cpTick,      setCpTick]      = useState(0);
  const commodityPrices = useRef<Record<string,CargoPrices>>(initCommodityPrices());
  const [jobPanel,    setJobPanel]    = useState<{ bid: string; label: string; pay: number; seconds: number; progress: number } | null>(null);
  const jobTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Floor panel & living world
  const [floorPanel,  setFloorPanel]  = useState<FloorPanel | null>(null);
  const [powerPct,    setPowerPct]    = useState(100);
  const [cityEvent,   setCityEvent]   = useState<string | null>(null);
  const cityEventTimer = useRef(0);
  // ── Banking state ─────────────────────────────────────────────────────────
  const [savings,      setSavings]      = useState(_ss?.savings ?? 0);
  const [showVend,     setShowVend]     = useState(false);
  const [vendTab,      setVendTab]      = useState<'food'|'tech'|'weapons'|'vehicles'|'furniture'|'realestate'|'pro'>('food');
  const [ownedItems,   setOwnedItems]   = useState<Set<string>>(new Set(Array.isArray(_ss?.ownedItems) ? _ss.ownedItems : []));
  const [showBank,     setShowBank]     = useState(false);
  const [isDead,       setIsDead]       = useState(false);
  const [gamePaused,   setGamePaused]   = useState(false);
  const gamePausedRef = useRef(false);
  const [arcadeGameId, setArcadeGameId] = useState<string | null>(null);
  const [nearArcadeMachine, setNearArcadeMachine] = useState<string | null>(null);
  const [showNewspaper, setShowNewspaper] = useState<NewspaperIssue | null>(null);
  const [nearWaterCooler, setNearWaterCooler] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    try { const saved = _ss?.inventory; return Array.isArray(saved) ? saved : []; } catch { return []; }
  });
  const [videoCallRoom, setVideoCallRoom] = useState<string | null>(null);
  const [videoCallPeers, setVideoCallPeers] = useState<{ id: string; name: string; stream?: MediaStream }[]>([]);
  const [vcStream, setVcStream] = useState<MediaStream | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceCandidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const vcStreamRef = useRef<MediaStream | null>(null);
  const videoCallRoomRef = useRef<string | null>(null);
  const [hospitalCinematic, setHospitalCinematic] = useState<{ phase: number; lineIdx: number; fadeAlpha: number; startTime: number } | null>(null);
  const [showHospitalPrompt, setShowHospitalPrompt] = useState(() => {
    if (_ss?.diedLastSession) return true;
    try { const flag = localStorage.getItem('sm_died_last_session'); return flag === 'true'; } catch { return false; }
  });
  const [showIndoorStart, setShowIndoorStart] = useState(!_ss && !(() => { try { return localStorage.getItem('sm_died_last_session') === 'true'; } catch { return false; } })());
  const [bankTab,      setBankTab]      = useState<'accounts'|'loans'|'wire'|'history'>('accounts');
  const [bankHistory,  setBankHistory]  = useState<Array<{id:number;desc:string;amount:number;bal:number}>>([]);
  const [bankDepAmt,   setBankDepAmt]   = useState('');
  const [bankWithAmt,  setBankWithAmt]  = useState('');
  const [bankLoan,     setBankLoan]     = useState<{amount:number;interest:number;issuedAt:number;dueAt:number}|null>(_ss?.loan ?? null);
  const [bankWireTo,   setBankWireTo]   = useState('');
  const [bankWireAmt,  setBankWireAmt]  = useState('');
  const [dogActive,   setDogActive]   = useState(savedDog?.active ?? false);
  const [dogName,     setDogName]     = useState(savedDog?.name ?? '');
  const [dogHp,       setDogHp]       = useState(savedDog?.hp ?? DOG_MAX_HP);
  const [dogInjured,  setDogInjured]  = useState(savedDog?.injured ?? false);
  const [showDogName, setShowDogName] = useState(false);
  const [dogNameIn,   setDogNameIn]   = useState('');
  const dogAdoptTarget = useRef<any>(null);
  const { radioOn, radioVisible, radioFading, radioVisibleRef, playerEverMounted, toggle: toggleRadio, show: showRadio, hide: hideRadio } = useRadio();
  const [showGoldExchange, setShowGoldExchange] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showRealEstateOffice, setShowRealEstateOffice] = useState(false);
  const [showRecruitOffice, setShowRecruitOffice] = useState(false);
  const [recruitJobDraft, setRecruitJobDraft] = useState({ title: '', pay: '', desc: '' });
  const [adminBizName, setAdminBizName] = useState('');
  const [adminBizType, setAdminBizType] = useState<'real' | 'fictitious'>('fictitious');
  const [adminBizIndustry, setAdminBizIndustry] = useState('');
  const [goldBalance, setGoldBalance] = useState(_ss?.goldBalance ?? 0);
  const [goldStandardToggle, setGoldStandardToggle] = useState(false);
  const [temperatureDisplay, setTemperatureDisplay] = useState<TemperatureLevel>('MILD');
  const [showCrafting, setShowCrafting] = useState(false);
  const [showMerchantShop, setShowMerchantShop] = useState<MerchantDef | null>(null);
  const [showQuests, setShowQuests] = useState(false);
  const [quests, setQuests] = useState<Quest[]>(() => gs.current.quests);
  const [calendarStr, setCalendarStr] = useState('');
  const [weatherStr, setWeatherStr] = useState('');
  const [seasonStr, setSeasonStr] = useState('SPRING');
  const [tempC, setTempC] = useState(22);
  const [radLevel, setRadLevel] = useState(0);
  const [showDialoguePanel, setShowDialoguePanel] = useState(false);
  const [dialogueNpcName, setDialogueNpcName] = useState('');
  const [dialogueNode, setDialogueNode] = useState<DialogueNode | null>(null);
  const [boomerMode, setBoomerMode] = useState(() => { try { return localStorage.getItem('sm_boomer') === '1'; } catch { return false; } });
  const [hudExpanded, setHudExpanded] = useState(false);
  const [showCostume, setShowCostume] = useState(false);
  const [activeCostume, setActiveCostume] = useState(_ss?.activeCostume ?? 'default');
  const [ownedClothes, setOwnedClothes] = useState<Set<string>>(() => gs.current.ownedClothes);
  const [musicMuted, setMusicMuted] = useState(() => getMusicMuted());
  const [allMuted, setAllMuted] = useState(() => getMuted());
  const [secondWeapon, setSecondWeapon] = useState<string | null>(null);

  const addBankTx = useCallback((desc: string, amount: number, bal: number) => {
    setBankHistory(h => [{ id: Date.now(), desc, amount, bal }, ...h].slice(0, 30));
  }, []);

  // Player apartment assignment (persistent per character)
  const [aptUnit] = useState<string>(() => {
    const k = `sm_apt_${char?.name}`;
    let v = localStorage.getItem(k);
    if (!v) { v = `FLOOR ${Math.floor(Math.random()*7)+2}, UNIT ${Math.floor(Math.random()*8)+1}`; localStorage.setItem(k, v); }
    return v;
  });

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const wsSend = useCallback((m: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(m));
  }, []);

  const canAccessTerminal = useCallback(() => {
    const g = gs.current;
    const nearTerminal = g.near && (IS_PUBLIC_TERMINAL(g.near) || g.near === 'terminal_shop');
    return (g.hasDevice && !g.deviceBroken) || g.atPublicTerminal || nearTerminal;
  }, []);

  const doSave = useCallback((data: object, forceCloud = false) => {
    const g = gs.current;
    const dogSave = g.dogCompanion.active ? { dogCompanion: { active: true, name: g.dogCompanion.name, hp: g.dogCompanion.hp, maxHp: g.dogCompanion.maxHp, injured: g.dogCompanion.injured } } : {};
    localStorage.setItem('sm_save', JSON.stringify({ ...data, ...dogSave }));
    if (!forceCloud && !canAccessTerminal()) return;
    const slot = parseInt(localStorage.getItem('sm_slot') ?? '0', 10);
    const savePayload = {
      charName: char.name,
      charClass: char.class,
      level: g.level,
      salary: g.salary,
      lastZone: inCityBounds(g.px, g.py) ? 'MINX CITY' : 'WASTELAND',
      playtime: g.frame,
      data: { ...char, ...(data as Record<string, unknown>), px: g.px, py: g.py, hp: g.hp, hunger: g.hunger, thirst: g.thirst, energy: g.energy, exp: g.exp, level: g.level, salary: g.salary, poisoned: g.poisoned, ...dogSave },
    };
    fetch(`/api/salaryman/saves/${slot}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(savePayload),
    }).catch(() => {});
  }, [char, canAccessTerminal]);

  const doSaveRef = useRef(doSave);
  doSaveRef.current = doSave;

  const buildSaveData = useCallback(() => {
    const g = gs.current;
    return {
      name: char.name, class: char.class, level: g.level, exp: g.exp, salary: g.salary,
      hp: g.hp, maxHp: g.maxHp, hunger: g.hunger, thirst: g.thirst, energy: g.energy,
      poisoned: g.poisoned, weaponTier: g.weaponTier, vehicle: g.vehicle,
      terminalDiscount: g.terminalDiscount, hasRadioImplant: g.hasRadioImplant, passport: g.passport,
      savings: g.savings, loan: g.loan,
      hasDevice: g.hasDevice, deviceBroken: g.deviceBroken, deviceDurability: g.deviceDurability,
      ownedItems: [...g.ownedItems],
      inventory: g.inventory,
      ownedBuildings: [...g.ownedBuildings],
      cargo: { ...g.cargo },
      realEstate: [...g.realEstate],
      worldTime: g.worldTime,
      diedLastSession: g.diedLastSession,
      quests: g.quests,
      ownedClothes: [...g.ownedClothes],
      hamletBuildingId: g.hamletBuildingId,
      pabloOnboardingDone: g.pabloOnboardingDone,
      activeWeapon: activeWeaponRef.current,
      secondaryWeapon: secondaryWeaponRef.current,
      unlockedWeapons: [...unlockedWeaponsRef.current],
      totalExpEarned: g.totalExpEarned,
      overflowExp: g.overflowExp ?? 0,
      perception: g.perception,
      fogRevealed: [...g.fogRevealed],
      hasBusiness: char.hasBusiness,
      bizType: char.bizType,
      company: char.company,
      bizRegisteredAt: char.bizRegisteredAt,
      storyFlags: g.storyFlags,
    };
  }, [char]);

  useEffect(() => {
    const interval = setInterval(() => {
      const g = gs.current;
      if (g.hasDevice && !g.deviceBroken) {
        doSaveRef.current(buildSaveData());
      }
    }, 30000);
    return () => {
      clearInterval(interval);
      const g = gs.current;
      if (g.hasDevice && !g.deviceBroken) {
        doSaveRef.current(buildSaveData());
      }
    };
  }, [buildSaveData]);

  const handleRadioToggle = useCallback(() => {
    const result = toggleRadio();
    if (result.on) {
      setNarr('> You turn the dial. Static. Then music. RADIO 107.3 — MINX CITY FM. The signal bleeds through the walls. Something familiar. Something human.');
    } else {
      setNarr('> You switch the radio off. Silence returns. The wasteland hum fills the gap.');
    }
  }, [toggleRadio]);

  const executeBuildingLogic = useCallback((bid: string) => {
    const g = gs.current;

    if (bid === 'clinic') completeQuestTask('starter_explore_clinic', 'visit_clinic');
    if (bid === 'noodle_bar') completeQuestTask('starter_noodle_run', 'visit_noodle');
    if (bid === 'arcade' || bid === 'pablo_store') completeQuestTask('starter_explore_city', 'visit_poi');

    if (RADIO_BUILDINGS.has(bid)) {
      showRadio();
    }

    // ── WORKSTATION REST ─────────────────────────────────────────────────
    if (char.hasBusiness && char.workstation === bid) {
      completeQuestTask('establish_business', 'visit_workstation');
      completeQuestTask('establish_business', 'setup_signage');
      const daysSinceReg = char.bizRegisteredAt
        ? Math.floor((Date.now() - char.bizRegisteredAt) / 86400000)
        : 0;
      const isFree = daysSinceReg < 7;
      const wsRent = 500;
      if (!isFree && g.salary < wsRent) {
        sfxError();
        setNarr(`> ${char.workstationLabel?.toUpperCase() ?? 'WORKSTATION'} — Rent overdue. ƒ${wsRent} required. You're on the clock.`);
        return;
      }
      if (!isFree) { g.salary -= wsRent; setSalary(g.salary); }
      g.hp = g.maxHp; g.energy = Math.min(100, g.energy + 50);
      g.hunger = Math.min(100, g.hunger + 20); g.thirst = Math.min(100, g.thirst + 20);
      setHp(g.hp); setEnergy(g.energy); setHunger(g.hunger); setThirst(g.thirst);
      doSave({ name: char.name, class: char.class, level: g.level, exp: g.exp, salary: g.salary });
      const daysLeft = Math.max(0, 7 - daysSinceReg);
      setNarr(isFree
        ? `> ${char.workstationLabel?.toUpperCase() ?? 'WORKSTATION'} — ${char.workstationSlot ?? 'Your slot'}. FREE rest. HP fully restored. Energy +50. Progress saved. ${daysLeft} free day${daysLeft !== 1 ? 's' : ''} remaining before ƒ${wsRent}/rest kicks in.`
        : `> ${char.workstationLabel?.toUpperCase() ?? 'WORKSTATION'} — ${char.workstationSlot ?? 'Your slot'}. ƒ${wsRent} FIAT rent charged. HP fully restored. Energy +50. Progress saved. The city takes its cut.`
      );
      sfxHeal();
      return;
    }

    // ── Residential ───────────────────────────────────────────────────────
    if (bid === 'minx_arms') {
      const rent = 3000;
      if (g.salary >= rent) {
        g.salary -= rent; setSalary(g.salary);
        setNarr(`> MINX ARMS — RENT PAID: ƒ${rent.toLocaleString()}. The landlord's drone scans your unit. "Credits received. Another month." You rest.`);
      } else {
        setNarr(`> MINX ARMS — RENT NOTICE. You owe ƒ${rent.toLocaleString()} and cannot pay. PABLO CORP. HOUSING DIVISION has been notified. Rest anyway — nobody's throwing you out tonight.`);
      }
      setFloorPanel({ bid, dir: BUILDING_FLOORS.minx_arms, selectedFloor: 0 });
      // Bed save point — restore all stats
      g.hp = g.maxHp; g.hunger = Math.min(100, g.hunger + 40); g.thirst = Math.min(100, g.thirst + 40); g.energy = Math.min(100, g.energy + 50);
      g.poisoned = false; setHp(g.maxHp); setHunger(g.hunger); setThirst(g.thirst); setEnergy(g.energy); setPoisoned(false);
      sfxSave();
      doSave({ name: char.name, class: char.class, level: g.level, exp: g.exp, salary: g.salary });
      setNarr(`> MINX ARMS — Your unit: ${aptUnit}. You rest in your bed. HP fully restored. Progress saved. The city can wait.`);
    }
    else if (bid === 'eastside_flat') {
      const rent = 2000;
      if (g.salary >= rent) {
        g.salary -= rent; setSalary(g.salary);
        setNarr(`> EASTSIDE FLATS — RENT PAID: ƒ${rent.toLocaleString()}. Unit ${aptUnit}. The landlord bot sends a confirmation ping. You collapse into your bed.`);
      } else {
        setNarr(`> EASTSIDE FLATS — RENT NOTICE. ƒ${rent.toLocaleString()} outstanding. PABLO CORP. HOUSING will escalate. Rest anyway.`);
      }
      setFloorPanel({ bid, dir: BUILDING_FLOORS.eastside_flat, selectedFloor: 0 });
      // Bed save point
      g.hp = g.maxHp; g.hunger = Math.min(100, g.hunger + 40); g.thirst = Math.min(100, g.thirst + 40); g.energy = Math.min(100, g.energy + 50);
      g.poisoned = false; setHp(g.maxHp); setHunger(g.hunger); setThirst(g.thirst); setEnergy(g.energy); setPoisoned(false);
      sfxSave();
      doSave({ name: char.name, class: char.class, level: g.level, exp: g.exp, salary: g.salary });
    }
    // ── Floor-directory buildings ─────────────────────────────────────────
    else if (bid === 'pablo_tower') {
      setFloorPanel({ bid, dir: BUILDING_FLOORS.pablo_tower, selectedFloor: 0 });
      setDialog({ lines: TOWER_LINES, idx: 0, bid: 'pablo_tower_enter' });
    }
    else if (bid === 'pablo_store')  { sfxEnter(); setShowVend(true); setNarr('> VENDING MACHINE — Authorized retail outlet. Browse equipment, weapons, vehicles, and more. FIAT only.'); }
    else if (bid === 'gold_exchange') {
      sfxEnter(); setShowGoldExchange(true); frozenRef.current = true;
      setNarr('> GOLD EXCHANGE — Convert FIAT to GOLD and back. Tax scales with transaction size. Property purchases require GOLD.');
    }
    else if (bid === 'admin_bureau') {
      sfxEnter(); setShowAdmin(true); frozenRef.current = true;
      if (char.hasBusiness) {
        setNarr(`> CITY ADMIN BUREAU — "${char.company}" is on file. Visit to view your business license.`);
      } else {
        setNarr('> CITY ADMIN BUREAU — PABLO CORP. Municipal Services. Register a business. Fictitious entity: ƒ50,000. Real enterprise: ƒ100,000.');
      }
    }
    else if (bid === 'realestate_office') {
      sfxEnter(); setShowRealEstateOffice(true); frozenRef.current = true;
      setNarr('> REAL ESTATE OFFICE — Browse available property listings. All purchases require GOLD. Speak to an agent or use the terminal.');
    }
    else if (bid === 'nexus_hub') {
      sfxEnter();
      setNarr('> NEXUS HUB — Open-plan co-working space. Hot desks, private booths, meeting rooms. Coffee is free. Everything else costs fiat. Browse the job board or rent a desk.');
    }
    else if (bid === 'police_hq') {
      sfxEnter();
      setNarr('> POLICE HQ — Precinct 1. Wanted boards line the walls. Officers ignore your presence unless you\'re on the list.');
    }
    else if (bid === 'clinic')  {
      if (g.deviceBroken && g.salary >= 5000) {
        g.salary -= 5000; g.deviceBroken = false; g.deviceDurability = 100;
        setSalary(g.salary); setDeviceBroken(false); sfxHeal();
        setNarr('> CITY CLINIC — [ƒ5,000 FIAT] Device repaired. "Cracked screen, fried board. Standard job. Press [P] — it\'s alive again."');
        return;
      }
      if (g.salary >= 10000) {
        g.hp = g.maxHp; g.salary -= 10000; setHp(g.maxHp); setSalary(g.salary); sfxHeal();
        let clinicMsg = '> CITY CLINIC — [ƒ10,000 FIAT] Patched up. "I\'ve fixed androids, mutants, and one man who claimed to be a ninja. You\'re fine."';
        if (g.deviceBroken) {
          g.deviceBroken = false; g.deviceDurability = 100; setDeviceBroken(false);
          clinicMsg += ' Device repaired too. "Two birds. One bill."';
        }
        if (g.dogCompanion.active && (g.dogCompanion.injured || g.dogCompanion.hp < DOG_MAX_HP)) {
          g.dogCompanion.hp = DOG_MAX_HP; g.dogCompanion.injured = false;
          setDogHp(DOG_MAX_HP); setDogInjured(false);
          clinicMsg += ` The medic patches up ${g.dogCompanion.name} too. "The dog's tougher than you."`;
        }
        setNarr(clinicMsg);
      }
      else { sfxError(); setNarr(`> CITY CLINIC — "No fiat, no treatment. Even the medic has bills. Come back with ƒ10,000."${g.deviceBroken ? ' Device repair: ƒ5,000 FIAT.' : ''}`); }
    }
    else if (bid === 'megabank'){
      setBankDepAmt(''); setBankWithAmt(''); setBankWireTo(''); setBankWireAmt('');
      setBankLoan(g.loan ?? null);
      setSavings(g.savings);
      setBankTab('accounts');
      setShowBank(true);
      frozenRef.current = true;
      setNarr('> BANCO OMBRA — Welcome. Your accounts are now accessible. PAX PABLO. [ESC] to close.');
    }
    else if (bid === 'armory') {
      sfxEnter(); setShowVend(true); setVendTab('weapons');
      setNarr('> ARMORY — PABLO-licensed weapon cache. Browse the inventory. FIAT only.');
    }
    else if (bid === 'market')  { sfxEnter(); setShowTrade('city'); setNarr('> BLACK MARKET — Step inside. Eyes on the board. Prices shift every 28 seconds. Buy low. Haul south. Sell high. PABLO CORP. is not watching. Probably.'); }
    else if (bid === 'hotel')   {
      setFloorPanel({ bid, dir: BUILDING_FLOORS.hotel, selectedFloor: 0 });
      g.hp = Math.min(g.maxHp, g.hp + 40); g.energy = Math.min(100, g.energy + 30); setHp(g.hp); setEnergy(g.energy); sfxHeal();
      setNarr('> HOTEL NEON — The neon still works. You sleep in a room covered in old arcade posters. HP +40. Energy +30.');
    }
    else if (bid === 'overlook') {
      if (g.salary >= 8000) {
        g.hp = Math.min(g.maxHp, g.hp + 50); g.energy = Math.min(100, g.energy + 45); g.salary -= 8000;
        setHp(g.hp); setEnergy(g.energy); setSalary(g.salary); sfxHeal();
        setNarr('> THE PINNACLE [ƒ8,000 FIAT] — Room 237 is available. The elevator opens on its own. You sleep deeply and wake disturbed. HP +50. Energy +45. ALDRIC PENN waves from the corridor. The hallway carpet pattern repeats forever.');
      } else {
        sfxError();
        setNarr('> THE PINNACLE — ALDRIC PENN is at the front desk. He doesn\'t look up. "All rooms require ƒ8,000 FIAT. Building policy." He adds nothing further. The corridor light flickers.');
      }
    }
    else if (bid === 'safe_house') {
      g.hp = g.maxHp; g.energy = 100; g.hunger = Math.min(100, g.hunger + 40); g.thirst = Math.min(100, g.thirst + 40);
      setHp(g.hp); setEnergy(g.energy); setHunger(g.hunger); setThirst(g.thirst); sfxHeal();
      doSave({ ...g, salary: g.salary });
      setNarr('> SAFE HOUSE — Your bed is still here. Threadbare blanket, steel frame, but it\'s yours. You sleep deeply. Full HP. Full energy. Hunger +40. Thirst +40. Progress saved. KAEL VOSS stands watch. "Nobody gets in unless I say," he says. "Rest. You earned it."');
    }
    else if (bid === 'rust_porch') {
      if (g.salary >= 4000) {
        g.hp = Math.min(g.maxHp, g.hp + 55); g.hunger = Math.min(100, g.hunger + 60); g.thirst = Math.min(100, g.thirst + 60); g.salary -= 4000;
        setHp(g.hp); setHunger(g.hunger); setThirst(g.thirst); setSalary(g.salary); sfxHeal();
        doSave({ ...g, salary: g.salary });
        setNarr('> THE RUST PORCH [ƒ4,000 FIAT] — DREN MALIK has stew on the fire. You eat until the wasteland feels like a distant dream. HP +55. Hunger +60. Thirst +60. Progress saved. "Timber\'s hard to come by," Dren says, refilling your bowl, "but stew is the least I can do." He sounds like he means it.');
      } else {
        sfxError();
        setNarr('> THE RUST PORCH — DREN MALIK stirs the stew. "I wish it was free, but supply runs cost ƒ4,000 FIAT. Come back when you have it." The stew smells extraordinary. It costs ƒ4,000.');
      }
    }
    else if (bid === 'ashfield_hostel') {
      g.hp = Math.min(g.maxHp, g.hp + 30); g.energy = Math.min(100, g.energy + 20);
      setHp(g.hp); setEnergy(g.energy); sfxHeal();
      setNarr('> ASHFIELD HOSTEL — Cracked walls. Faded posters of a city that existed as a dream. LIRA WYNNE lights a candle. You sleep. HP +30. Energy +20. No charge. "This place was rubble when Joel found it," she says. "We rebuilt it because ruins need purpose."');
    }
    else if (bid === 'terminus') {
      g.hp = Math.min(g.maxHp, g.hp + 40); g.hunger = Math.min(100, g.hunger + 35); g.thirst = Math.min(100, g.thirst + 35);
      setHp(g.hp); setHunger(g.hunger); setThirst(g.thirst); sfxHeal();
      doSave({ ...g, salary: g.salary });
      setNarr('> TERMINUS SHELTER — ANSEL DUNN hands you a ration without speaking. You eat. You sleep on the floor. HP +40. Hunger +35. Thirst +35. Progress saved. "I feed between thirty and sixty people a day," he says. "You\'re number forty-one." He says this like it\'s routine. It is.');
    }
    else if (bid === 'bastion_keep') {
      const mhp = g.maxHp; g.hp = mhp; g.energy = 100; g.salary += 2000;
      setHp(mhp); setEnergy(100); setSalary(g.salary); sfxHeal();
      doSave({ ...g, salary: g.salary });
      setNarr('> BASTION KEEP — Stone walls. Reinforced perimeter. PETRA VANCE stands guard like someone who has never stopped standing guard. "Rest here. No charge." You sleep on a military cot. HP fully restored. Energy maxed. +ƒ2,000 FIAT (she pressed salvage credits into your hand). "Payment for showing up. Nobody else does." You saved.');
    }
    else if (bid === 'vend')    {
      sfxHeal(); setShowVend(true);
    }
    else if (bid === 'arcade')  {
      g.energy = Math.min(100, g.energy + 20); setEnergy(g.energy); sfxHeal();
      setNarr('> ARCADE \'87 — Rows of dead screens. One machine still running: NEON DRIFT. Coin slot taped over. Free play forever. You play until the wasteland feels far away. Energy +20.');
    }
    else if (bid === 'bunker')  { g.energy = Math.min(100, g.energy + 15); setEnergy(g.energy); sfxHeal(); setNarr('> BUNKER-09 — Spray-painted: "WW-87 / INSERT COIN." An old terminal runs in the corner. You rest briefly. Energy +15. The screen reads: GAME OVER.'); }
    else if (bid === 'radio') {
      const job = QUICK_JOBS.radio;
      if ((g.jobCooldowns['radio'] ?? 0) > 0) { sfxError(); setNarr(`> PIRATE RADIO — Signal on air. "Come back in ${Math.ceil((g.jobCooldowns['radio'] ?? 0) / 60)}s." Dead air.`); return; }
      setNarr('> PIRATE RADIO — Signal: "...up up, down down, left right, left right..." A voice: "BROADCAST JOB — ƒ2,000 FIAT, 4 seconds. Press E again to start."');
      setJobPanel({ bid, label: job.label, pay: job.pay, seconds: job.seconds, progress: 0 });
    }
    else if (bid === 'scrap') {
      if (!g.storyFlags?.scrapyard_unlocked) { sfxError(); setNarr('> SCRAP YARD — Gate locked. A sign reads: "Access restricted per PABLO CORP. Directive 77. Authorized personnel only." A quest may unlock this area.'); return; }
      const job = QUICK_JOBS.scrap;
      if ((g.jobCooldowns['scrap'] ?? 0) > 0) { sfxError(); setNarr(`> SCRAP YARD — On cooldown. ${Math.ceil((g.jobCooldowns['scrap'] ?? 0) / 60)}s remaining.`); return; }
      setNarr('> SCRAP YARD — A foreman waves you over. "Haul scrap. ƒ3,500 FIAT. 5 seconds." You find a PCB labeled NX-87.');
      setJobPanel({ bid, label: job.label, pay: job.pay, seconds: job.seconds, progress: 0 });
    }
    else if (bid === 'oxide_labs'){ g.salary += 5000; setSalary(g.salary); sfxCoin(); setNarr('> OXIDE LABS — The door slides open. Blueprints everywhere. A note on the terminal: "The prototypes were the first to fall. SENIOR PABLO bought them all. If you find this, take the ƒ5,000 in the drawer. I won\'t need it." +ƒ5,000 FIAT.'); }
    else if (bid === 'crystal' || bid === 'crystal2' || bid === 'crystal3') {
      g.hp = g.maxHp; g.hunger = 100; g.thirst = 100; g.energy = 100; g.poisoned = false;
      setHp(g.maxHp); setHunger(100); setThirst(100); setEnergy(100); setPoisoned(false);
      sfxSave();
      doSave({ name: char.name, class: char.class, level: g.level, exp: g.exp, salary: g.salary });
      let crystalMsg = `> SAVE POINT — The crystal pulses. All stats restored. Progress saved. LVL:${g.level} EXP:${g.exp}. "Brave the darkness, warrior." — inscription, provenance unknown.`;
      if (g.dogCompanion.active) {
        const wasInjured = g.dogCompanion.injured;
        g.dogCompanion.hp = DOG_MAX_HP; g.dogCompanion.injured = false;
        setDogHp(DOG_MAX_HP); setDogInjured(false);
        if (wasInjured) {
          const line = DOG_REST_LINES[Math.floor(Math.random() * DOG_REST_LINES.length)];
          crystalMsg += ` ${g.dogCompanion.name} recovers fully. > [${g.dogCompanion.name}]: "${line}"`;
        }
      }
      setNarr(crystalMsg);
    }
    else if (bid === 'dojo') { setFloorPanel({ bid, dir: BUILDING_FLOORS.dojo, selectedFloor: 0 }); setNarr('> IRON DOJO — SENSEI nods. "You are not ready for PABLO\'s floor. Come back stronger."'); }
    else if (bid === 'data_vault') { setFloorPanel({ bid, dir: BUILDING_FLOORS.data_vault, selectedFloor: 0 }); g.salary += 4000; setSalary(g.salary); sfxCoin(); setNarr('> DATA VAULT — You extract a cached fiat transfer. +ƒ4,000 FIAT. The system log shows 6,000 similar transfers. All redirected to PABLO CORP. in \'91.'); }
    else if (bid === 'nightclub') { setFloorPanel({ bid, dir: BUILDING_FLOORS.nightclub, selectedFloor: 0 }); g.energy = Math.min(100, g.energy + 40); setEnergy(g.energy); sfxHeal(); setNarr('> CLUB NEON — Bass frequencies you feel in your teeth. Energy +40.'); }
    else if (bid === 'waste_exchange') { sfxEnter(); setShowTrade('waste'); setNarr('> BLACK EXCHANGE — Deep wasteland trading post. No PABLO surveillance. Prices are what the wasteland sets. Haul north to the city. Sell what they cannot get themselves.'); }
    else if (bid === 'print_shop') {
      const job = QUICK_JOBS.print_shop;
      if ((g.jobCooldowns['print_shop'] ?? 0) > 0) {
        const book = LIBRARY_BOOKS[Math.floor(Math.random() * LIBRARY_BOOKS.length)];
        setNarr(`> PRINT SHOP LIBRARY — Press busy. You browse JORY STRAND's shelves. "${book.title}" — ${book.text}`);
        return;
      }
      setNarr('> PRINT SHOP — Unauthorized print run. ƒ2,500 FIAT. The machine jams on page three. Jam paper reads: OPERATION MINX — CLASSIFIED.');
      setJobPanel({ bid, label: job.label, pay: job.pay, seconds: job.seconds, progress: 0 });
    }
    else if (bid === 'east_bunker') { g.energy = Math.min(100, g.energy + 20); g.hp = Math.min(g.maxHp, g.hp + 15); setEnergy(g.energy); setHp(Math.floor(g.hp)); sfxHeal(); setNarr('> EAST BUNKER — Reinforced walls. Emergency rations. Energy +20. HP +15. Sign reads: EMERGENCY RESERVE — PABLO CORP. PROPERTY.'); }
    else if (bid === 'north_gate') { g.energy = Math.min(100, g.energy + 10); setEnergy(g.energy); sfxHeal(); setNarr('> NORTH GATE — Edge of Minx City. You catch your breath. Energy +10. Guards patrol silently. Beyond is open territory.'); }
    else if (bid === 'outpost_alpha') {
      g.hunger = Math.min(100, g.hunger + 40); g.thirst = Math.min(100, g.thirst + 40); g.energy = Math.min(100, g.energy + 20);
      setHunger(g.hunger); setThirst(g.thirst); setEnergy(g.energy); sfxHeal();
      setNarr('> OUTPOST ALPHA — A fire burning. Someone left rations. Hunger +40. Thirst +40. Energy +20. A hand-written note: "Friendly territory. You made it this far."');
    }
    else if (bid === 'outpost_beta') {
      g.hunger = Math.min(100, g.hunger + 30); g.thirst = Math.min(100, g.thirst + 35); g.energy = Math.min(100, g.energy + 15);
      setHunger(g.hunger); setThirst(g.thirst); setEnergy(g.energy); sfxHeal();
      setNarr('> OUTPOST BETA — Smaller. Quieter. A terminal still running. Last entry: "EASTERN BLOC pushed east border. Holding for now." Hunger +30. Thirst +35. Energy +15.');
    }
    else if (bid === 'supply_cache') { g.salary += 6000; setSalary(g.salary); sfxCoin(); setNarr('> SUPPLY CACHE — Buried crates. You find a sealed container with PABLO CORP. markings and no tracking code. Inside: ƒ6,000 FIAT in unregistered tokens. Classic.'); }
    else if (bid === 'deep_bunker') {
      g.hp = Math.min(g.maxHp, g.hp + 30); setHp(g.hp); sfxHeal();
      setNarr('> DEEP BUNKER — Blast doors. An old terminal running FF-protocol. Log shows: location classified, purpose: UNKNOWN. HP +30. Someone left coffee. Still warm.');
    }
    else if (bid === 'machine_bunker') {
      setFloorPanel({ bid, dir: BUILDING_FLOORS.machine_bunker, selectedFloor: 0 });
      g.hp = Math.min(g.maxHp, g.hp + 40); g.energy = Math.min(100, g.energy + 25);
      setHp(g.hp); setEnergy(g.energy); sfxHeal();
      setNarr('> MACHINE BUNKER — A reinforced hatch in the hillside. Stairs descend into blue-lit corridors. The air hums with capacitor discharge. Recharge bays line the walls. HP +40. Energy +25.');
    }
    else if (['sub_west','sub_central','sub_east','sub_north'].includes(bid)) {
      sfxEnter();
      setSubwayOrigin(bid);
      setShowSubway(true);
      setNarr('> MINX CITY METRO — Automated turnstiles. The network runs on PABLO CORP. rails. Select your destination.');
    }
    else if (['checkpoint_w','checkpoint_c','checkpoint_e'].includes(bid)) {
      if (g.passport) {
        const pType = g.passport === 'full_city' ? 'FULL CITY PASSPORT' : g.passport === 'basic_city' ? 'BASIC CITY PASSPORT' : g.passport === 'wasteland' ? 'WASTELAND PASSPORT' : 'PASSPORT';
        setNarr(`> CHECKPOINT — Guard scans your ${pType}. "Document valid.${g.passport === 'full_city' ? ' Priority access. No crossing fee.' : ' Crossing fee applies.'} Move along."`);
      } else {
        sfxError();
        setNarr('> CHECKPOINT — Guard blocks the gate. "PASSPORT required to enter the wasteland. Obtain one at PABLO CORP. or the PRINT SHOP."');
      }
    }
    else if (bid === 'call_home') {
      sfxEnter();
      const cost = 5000;
      if (g.salary >= cost) { g.salary -= cost; setSalary(g.salary); sfxCoin(); setNarr(`> CALL HOME — Encrypted long-range signal. You get through. Static, then a voice. "Stay safe. We saw what happened to Neo-Tokyo. Don\'t let Minx City be next." [−ƒ${cost.toLocaleString()} FIAT]`); }
      else { sfxError(); setNarr(`> CALL HOME — ƒ${cost.toLocaleString()} FIAT for a call. "Nothing\'s free in Minx City. Not even a voice."`);}
    }
    else if (bid === 'noodle_bar') {
      sfxEnter();
      const cost = 1200;
      if (g.salary >= cost) { g.salary -= cost; g.hunger = Math.min(100, g.hunger + 60); g.thirst = Math.min(100, g.thirst + 40); setSalary(g.salary); setHunger(g.hunger); setThirst(g.thirst); sfxCoin(); setNarr(`> NOODLE BAR — Steam. The real kind. Hunger +60. Thirst +40. [−ƒ${cost.toLocaleString()} FIAT]`); }
      else { sfxError(); setNarr('> NOODLE BAR — "No FIAT, no noodles. House rule since the collapse."'); }
    }
    else if (bid === 'pawn_shop') {
      sfxEnter();
      if (g.inventory.length > 0) {
        setShowInventory(true);
        setNarr('> PAWN SHOP — "Sell your junk. I buy everything." Click items to sell. [ESC] to close.');
      } else {
        const bonus = 3000 + Math.floor(Math.random() * 4000);
        g.salary += bonus; setSalary(g.salary); sfxCoin();
        setNarr(`> PAWN SHOP — You sell something you shouldn\'t. The owner doesn\'t ask where it\'s from. +ƒ${bonus.toLocaleString()} FIAT. "Come back with more. I don\'t ask questions."`);
      }
    }
    else if (bid === 'terminal_shop') {
      sfxEnter();
      const passportCost = 12000;
      if (!g.passport && g.salary >= passportCost) {
        g.passport = 'basic_city'; g.salary -= passportCost; setSalary(g.salary); setPassport('basic_city'); sfxCoin();
        wsSend({ type: 'money_update', money: g.salary });
        setNarr(`> PABLO CORP. NORTH — BASIC CITY PASSPORT issued. Crossing authorized (fee applies). [−ƒ${passportCost.toLocaleString()} FIAT] "Don\'t lose it. Replacements cost double."`);
      } else if (g.passport) {
        const pType = g.passport === 'full_city' ? 'FULL CITY' : g.passport === 'wasteland' ? 'WASTELAND' : 'BASIC CITY';
        setNarr(`> PABLO CORP. NORTH — "${pType} PASSPORT already registered. Access active."`);
      } else {
        sfxError(); setNarr(`> PABLO CORP. NORTH — PASSPORT costs ƒ${passportCost.toLocaleString()} FIAT. Current balance insufficient.`);
      }
    }
    else if (bid === 'north_bunker') {
      g.hp = g.maxHp; g.hunger = 100; g.thirst = 100; g.energy = 100; g.poisoned = false;
      setHp(g.hp); setHunger(100); setThirst(100); setEnergy(100); setPoisoned(false); sfxHeal();
      doSave({ name: char.name, class: char.class, level: g.level, exp: g.exp, salary: g.salary });
      setNarr('> NORTH BUNKER — Fully stocked emergency shelter. All stats fully restored. Progress saved. "NORTH QUARTER EMERGENCY RESERVE. PABLO CORP. AUDIT ZONE. DO NOT OCCUPY." You occupied it.');
    }
    else if (IS_PUBLIC_TERMINAL(bid)) {
      sfxEnter();
      gs.current.atPublicTerminal = true; setAtPublicTerminal(true);
      setShowPablo(true);
      if (IS_VAN(bid)) {
        g.energy = Math.min(100, g.energy + 15); setEnergy(g.energy);
        setNarr(`> ${BUILDINGS.find(b2 => b2.id === bid)?.label ?? 'TERMINAL VAN'} — Sliding door. Cot in the back. Terminal on the dash. PABLO AI online. Energy +15. Press [ESC] to leave.`);
      } else {
        setNarr(`> ${BUILDINGS.find(b2 => b2.id === bid)?.label ?? 'PUBLIC TERMINAL'} — PABLO AI online. Free access. All productivity apps available. Press [ESC] to close.`);
      }
    }
    else if (['crystal4','crystal5','crystal6','crystal7'].includes(bid)) {
      g.hp = g.maxHp; g.hunger = 100; g.thirst = 100; g.energy = 100; g.poisoned = false;
      setHp(g.maxHp); setHunger(100); setThirst(100); setEnergy(100); setPoisoned(false); sfxSave();
      doSave({ name: char.name, class: char.class, level: g.level, exp: g.exp, salary: g.salary });
      let c2Msg = `> SAVE POINT — Crystal pulse. All stats restored. Saved. LVL:${g.level}`;
      if (g.dogCompanion.active) {
        const wasInjured = g.dogCompanion.injured;
        g.dogCompanion.hp = DOG_MAX_HP; g.dogCompanion.injured = false;
        setDogHp(DOG_MAX_HP); setDogInjured(false);
        if (wasInjured) {
          const line = DOG_REST_LINES[Math.floor(Math.random() * DOG_REST_LINES.length)];
          c2Msg += ` ${g.dogCompanion.name} fully healed. > [${g.dogCompanion.name}]: "${line}"`;
        }
      }
      setNarr(c2Msg);
    }
    else if (bid === 'eastern_gate') {
      g.hunger = Math.min(100, g.hunger + 20); g.thirst = Math.min(100, g.thirst + 20); setHunger(g.hunger); setThirst(g.thirst); sfxHeal();
      setNarr('> EASTERN GATE — The last marked structure before the deep wasteland. Someone painted: "YOU WENT FAR ENOUGH." You didn\'t listen. Hunger +20. Thirst +20.');
    }
    else if (bid === 'deep_camp') {
      g.hp = Math.min(g.maxHp, g.hp + 25); g.salary += 500; setHp(g.hp); setSalary(g.salary); sfxHeal(); sfxCoin();
      setNarr('> DEEP CAMP — Survivors. Three of them. They share rations and a fire. One presses ƒ500 FIAT into your hand. "We found it in a PABLO cache. We don\'t want their money." HP +25. +ƒ500 FIAT.');
    }
    else if (bid === 'ruins_alpha') {
      const loot = 300 + Math.floor(Math.random() * 600);
      g.salary += loot; setSalary(g.salary); sfxCoin();
      setNarr(`> RUINS ALPHA — Pre-collapse architecture. High-rises reduced to rubble. You dig through concrete and find a sealed cache. +ƒ${loot.toLocaleString()} FIAT in old denomination tokens. Still valid.`);
    }
    else if (bid === 'southern_hub') {
      g.hp = g.maxHp; g.hunger = 100; g.thirst = 100; g.energy = 100; g.poisoned = false;
      setHp(g.hp); setHunger(100); setThirst(100); setEnergy(100); setPoisoned(false); sfxHeal();
      doSave({ name: char.name, class: char.class, level: g.level, exp: g.exp, salary: g.salary });
      setNarr('> SOUTHERN HUB — The deepest settlement in the wasteland. Run by survivors who gave up on the city but not on each other. Everything restored. Progress saved. "Nobody from PABLO Corp has ever been here." You believe them.');
    }
  }, []);

  const enterInterior = useCallback((bid: string) => {
    const g = gs.current;
    const def = getInterior(bid);
    if (!def) return;
    g.interiorFade = 0;
    g.interiorFadeDir = 1;
    g.interiorFadeCallback = () => {
      g.interior = {
        bid, def,
        px: def.exitX + def.exitW / 2,
        py: def.exitY - 20,
        savedWorldX: g.px,
        savedWorldY: g.py,
      };
      executeBuildingLogic(bid);
      g.interiorFadeDir = -1;
    };
  }, [executeBuildingLogic]);

  const exitInterior = useCallback(() => {
    const g = gs.current;
    if (!g.interior) return;
    g.interiorFadeDir = 1;
    g.interiorFadeCallback = () => {
      const saved = g.interior!;
      g.px = saved.savedWorldX;
      g.py = saved.savedWorldY;
      g.interior = null;
      setNarr(`> You step back outside.`);
      g.interiorFadeDir = -1;
    };
  }, []);

  const completeQuestTask = useCallback((questId: string, taskId: string) => {
    const g = gs.current;
    const quest = g.quests.find(q => q.id === questId);
    if (!quest || quest.completed) return;
    const task = quest.tasks.find(t => t.id === taskId);
    if (!task || task.done) return;
    task.done = true;
    if (quest.tasks.filter(t => t.id !== 'pablo_auto').every(t => t.done)) {
      quest.completed = true;
    }
    setQuests([...g.quests]);
  }, []);

  const enterBuilding = useCallback((bid: string) => {
    sfxEnter();
    const b = BUILDINGS.find(bl => bl.id === bid);
    if (b) sfxDoor(gs.current.px, gs.current.py, b.x + b.w / 2, b.y + b.h / 2);
    if (b) {
      const bCenterX = b.x + b.w / 2;
      const bCenterY = b.y + b.h / 2;
      if (HAS_INTERIOR(bid)) {
        buildingEntryZoomRef.current = {
          active: true,
          timer: 45,
          targetX: bCenterX,
          targetY: bCenterY,
          callback: () => enterInterior(bid),
        };
      } else {
        buildingEntryZoomRef.current = {
          active: true,
          timer: 45,
          targetX: bCenterX,
          targetY: bCenterY,
          callback: () => executeBuildingLogic(bid),
        };
      }
      targetZoomRef.current = Math.max(targetZoomRef.current, 2.0);
    } else {
      executeBuildingLogic(bid);
    }
  }, [executeBuildingLogic, enterInterior]);

  const MERCHANT_SENNA: MerchantItem[] = [
    { id: 'forged_basic', name: 'FORGED CITY PASSPORT', desc: 'Basic forged transit pass. Grants checkpoint access with crossing fee.', price: 8000, effect: 'passport_basic_city' },
    { id: 'forged_full', name: 'FORGED FULL PASSPORT', desc: 'Premium forgery with PABLO Corp. watermark. Priority access, no crossing fee.', price: 25000, effect: 'passport_full_city' },
    { id: 'forged_waste', name: 'WASTELAND PERMIT', desc: 'Forged wasteland transit authorization. Access to outer sectors.', price: 15000, effect: 'passport_wasteland' },
    { id: 'fake_work_permit', name: 'WORK PERMIT', desc: 'Counterfeit employment papers. +500 FIAT signing bonus.', price: 5000, effect: 'work_permit' },
    { id: 'identity_scrub', name: 'IDENTITY SCRUB', desc: 'Erase your criminal record. Resets wanted level.', price: 20000, effect: 'identity_scrub' },
  ];
  const MERCHANT_ROOK: MerchantItem[] = [
    { id: 'unlock_sword', name: 'UNLOCK SWORD', desc: 'Close-range slash weapon. +6 ATK.', price: 8000, effect: 'unlock_SWORD' },
    { id: 'unlock_gun', name: 'UNLOCK GUN', desc: 'Mid-range projectile weapon. +8 ATK.', price: 15000, effect: 'unlock_GUN' },
    { id: 'unlock_laser', name: 'UNLOCK LASER', desc: 'Long beam weapon. +10 ATK.', price: 25000, effect: 'unlock_LASER' },
    { id: 'unlock_bomb', name: 'UNLOCK BOMB', desc: 'Area explosion weapon. +12 ATK.', price: 30000, effect: 'unlock_BOMB' },
    { id: 'hp_up', name: 'HP UP', desc: 'Permanently increases max HP by 20.', price: 10000, effect: 'maxhp20' },
    { id: 'atk_boost', name: 'ATK BOOST', desc: 'Permanent +5 base attack damage.', price: 18000, effect: 'atk5' },
    { id: 'armor_plate', name: 'ARMOR PLATE', desc: 'Reduces incoming damage by 15%.', price: 22000, effect: 'armor15' },
  ];
  const MERCHANT_MARSH: MerchantItem[] = [
    { id: 'unlock_sword', name: 'UNLOCK SWORD', desc: 'Close-range slash weapon. +6 ATK.', price: 8000, effect: 'unlock_SWORD' },
    { id: 'unlock_gun', name: 'UNLOCK GUN', desc: 'Mid-range projectile weapon. +8 ATK.', price: 15000, effect: 'unlock_GUN' },
    { id: 'unlock_laser', name: 'UNLOCK LASER', desc: 'Long beam weapon. +10 ATK.', price: 25000, effect: 'unlock_LASER' },
    { id: 'hp_up2', name: 'HP UP II', desc: 'Permanently increases max HP by 40.', price: 20000, effect: 'maxhp40' },
    { id: 'speed_boost', name: 'SPEED BOOST', desc: 'Permanent +10% movement speed.', price: 12000, effect: 'speed10' },
    { id: 'armor_plate', name: 'ARMOR PLATE', desc: 'Reduces incoming damage by 15%.', price: 22000, effect: 'armor15' },
  ];

  const LIBRARY_BOOKS = [
    { title: 'A BRIEF HISTORY OF MINX CITY', text: 'Founded in 1979. Corporate charter signed by an entity known only as PABLO. Population: classified.' },
    { title: 'THE TOWER: AN ARCHITECTURAL STUDY', text: 'Shadow Tower rises 62 floors. Floors 40-62 are restricted. No architectural firm claims the design.' },
    { title: 'WASTELAND SURVIVAL GUIDE', text: 'Rule 1: Water. Rule 2: Shelter. Rule 3: Never trust anyone who works for PABLO Corp.' },
    { title: 'MUNICIPAL CODE VOL. 47', text: 'Ordinance 4,712: All rain shall be metered and billed at PABLO Corp. standard rates.' },
    { title: 'ANDROID RIGHTS MEMORANDUM', text: 'Androids classified as "peripheral hardware" under PABLO Corp. Tax Code 9-B. Appeals: denied.' },
    { title: 'THE COLLAPSE: ORAL HISTORIES', text: 'Thirty-seven survivors describe the same night. The tower light went on. The sirens stopped. Nobody came.' },
  ];

  const enterNpc = useCallback((idx: number) => {
    const n = NPCS[idx];
    sfxTalk();
    const contextWhisper = getNpcContextualWhisper(n, gs.current.worldTime ?? 0);
    if (n.role === 'newspaper_seller') {
      const g = gs.current;
      const seasonIdx = Math.floor(((g.worldTime ?? 8) / 24 * 365) / 91.25) % 4;
      setShowNewspaper(THE_MINX_ISSUES[seasonIdx] ?? THE_MINX_ISSUES[0]);
      setNarr(`> ${n.name} — "${contextWhisper}"`);
      return;
    }
    if (n.role === 'dealer_papers') {
      setShowMerchant({ name: n.name, items: MERCHANT_SENNA });
      frozenRef.current = true;
      setNarr(`> ${n.name} — "${contextWhisper}" [ESC] to close.`);
      return;
    }
    if (n.role === 'dealer_weapons') {
      const items = n.name === 'MARSH KETTER' ? MERCHANT_MARSH : MERCHANT_ROOK;
      setShowMerchant({ name: n.name, items });
      frozenRef.current = true;
      setNarr(`> ${n.name} — "${contextWhisper}" [ESC] to close.`);
      return;
    }
    const storyDlg = Object.values(STORY_DIALOGUES).find(d => d.npcName === n.name);
    if (storyDlg) {
      const startNode = storyDlg.nodes[storyDlg.startId];
      if (startNode) {
        setDialogueNpcName(n.name);
        setDialogueNode(startNode);
        gs.current.activeDialogue = storyDlg;
        gs.current.activeDialogueNode = storyDlg.startId;
        setShowDialoguePanel(true);
        frozenRef.current = true;
        setNarr(`> ${n.name.toUpperCase()} — ${n.job}`);
        if (n.voiceActor && startNode.text) {
          // voice removed — browser TTS sounds robotic
        }
        return;
      }
    }
    const lines = [`> ${n.name.toUpperCase()} — ${n.job}${n.voiceActor ? ' [Voice Actor]' : ''}`, `"${contextWhisper}"`];
    if (n.backstory) lines.push(`[${n.backstory}]`);
    if (n.voiceActor && n.voiceLines && n.voiceLines.length > 0) {
      const vl = n.voiceLines[Math.floor(Math.random() * n.voiceLines.length)];
      // voice removed — browser TTS sounds robotic
    }
    setDialog({ lines, idx: 0, bid: 'npc' });
  }, []);

  const tryEnter = useCallback((bid: string) => {
    const lock = gs.current.locks.get(bid);
    if (lock !== undefined) {
      if (!lock.ownerName) { enterBuilding(bid); return; }
      const b = BUILDINGS.find(b => b.id === bid);
      pendingBidRef.current = bid; setPendingBid(bid); setPwPrompt({ bid, label: b?.label ?? bid, mode: 'enter' });
    } else {
      pendingBidRef.current = bid; setPendingBid(bid); wsSend({ type: 'building_lock_query', buildingId: bid });
    }
  }, [enterBuilding, wsSend]);

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const makeUrl = (x: number, y: number) =>
      `${proto}//${location.host}/ws?name=${encodeURIComponent(char.name)}&class=${char.class}&company=${encodeURIComponent(char.company ?? '')}&x=${x}&y=${y}`;
    const ws = new WebSocket(makeUrl(char.sx, char.sy));
    wsRef.current = ws;
    ws.onclose = () => setTimeout(() => {
      if (wsRef.current === ws) {
        const nws = new WebSocket(makeUrl(gs.current.px, gs.current.py));
        wsRef.current = nws;
      }
    }, 3000);
    ws.onmessage = (ev) => {
      let m: any; try { m = JSON.parse(ev.data); } catch { return; }
      const g = gs.current;
      if (m.type === 'server_full') {
        setServerFull(true);
      } else if (m.type === 'welcome') {
        g.myId = m.id;
        if (m.locks) {
          const nl = new Map<string, { ownerName: string; company?: string; message?: string }>();
          Object.entries(m.locks).forEach(([bid, v]: any) => {
            nl.set(bid, { ownerName: v.ownerName, company: v.company, message: v.message });
            g.locks.set(bid, v);
          });
          setLockMap(nl);
        }
        if (m.ownershipStats) setOwnerStats(m.ownershipStats);
      } else if (m.type === 'player_list') {
        g.peers.clear();
        (m.players as Peer[]).filter(p => p.id !== g.myId).forEach(p => g.peers.set(p.id, p));
        setOnline((m.players as Peer[]).filter(p => p.id !== g.myId));
      } else if (m.type === 'player_move') { const p = g.peers.get(m.id); if (p) { p.x = m.x; p.y = m.y; if (m.paused !== undefined) p.paused = m.paused; } }
      else if (m.type === 'player_speaking') {
        if (m.speaking) g.speakingSet.add(m.id); else g.speakingSet.delete(m.id);
        setSpeakIds(new Set(g.speakingSet));
      } else if (m.type === 'player_left') {
        g.peers.delete(m.id);
        setOnline(prev => prev.filter(p => p.id !== m.id));
        setChatMsgs(prev => [...prev, { id: seq++, from: 'SERVER', text: `${m.name} left.` }]);
      } else if (m.type === 'chat') {
        setChatMsgs(prev => [...prev.slice(-99), { id: seq++, from: m.from, text: m.text, dm: m.room === 'dm' }]);
        if (!chatOpen) setUnread(n => n + 1);
      } else if (m.type === 'ownership_update') {
        setOwnerStats(m.stats ?? {});
      } else if (m.type === 'building_lock_result') {
        if (m.success && (m.action === 'unlock' || m.action === 'open')) {
          g.locks.delete(m.buildingId);
          setLockMap(prev => { const nl = new Map(prev); nl.delete(m.buildingId); return nl; });
          if (pendingBidRef.current === m.buildingId) { pendingBidRef.current = null; setPendingBid(null); enterBuilding(m.buildingId); }
        } else if (!m.success) { sfxError(); setNarr(`> ACCESS DENIED — ${m.error}`); }
        if (m.success && m.action === 'set') setNarr('> Security code set. Building locked to your enterprise.');
        setPwPrompt(null);
      } else if (m.type === 'building_lock_status') {
        if (m.locked) {
          g.locks.set(m.buildingId, { ownerName: m.ownerName ?? '', company: m.company, message: m.message });
          setLockMap(prev => { const nl = new Map(prev); nl.set(m.buildingId, { ownerName: m.ownerName ?? '', company: m.company, message: m.message }); return nl; });
          if (pendingBidRef.current === m.buildingId) {
            const b = BUILDINGS.find(b => b.id === m.buildingId);
            if (m.message) setNarr(`> ${b?.label ?? m.buildingId} — LOCKED by ${m.ownerName}${m.company ? ' / ' + m.company : ''}: "${m.message}"`);
            setPwPrompt({ bid: m.buildingId, label: b?.label ?? m.buildingId, mode: 'enter' });
          }
        } else {
          g.locks.delete(m.buildingId);
          setLockMap(prev => { const nl = new Map(prev); nl.delete(m.buildingId); return nl; });
          if (pendingBidRef.current === m.buildingId) { pendingBidRef.current = null; setPendingBid(null); enterBuilding(m.buildingId); }
        }
      } else if (m.type === 'building_locked') {
        g.locks.set(m.buildingId, { ownerName: m.ownerName, company: m.company });
        setLockMap(prev => { const nl = new Map(prev); nl.set(m.buildingId, { ownerName: m.ownerName, company: m.company }); return nl; });
      } else if (m.type === 'building_unlocked') {
        g.locks.delete(m.buildingId); setLockMap(prev => { const nl = new Map(prev); nl.delete(m.buildingId); return nl; });
      } else if (m.type === 'pvp_hit') {
        if (!gamePausedRef.current) {
          const dmg = m.damage ?? 0;
          if (typeof m.remainingHp === 'number') g.hp = m.remainingHp;
          else g.hp = Math.max(0, g.hp - dmg);
          g.invincible = 15; g.flash = 8;
          g.deathReason = `Killed by ${m.attackerName} in PVP combat`;
          setHp(Math.floor(g.hp));
          sfxHit();
          g.floaters.push({ x: g.px, y: g.py - 20, text: `-${dmg} PVP HIT`, color: '#ff4444', life: 50, maxLife: 50 });
          setNarr(`> PVP — ${m.attackerName} hit you for ${dmg} damage!`);
          if (g.hp <= 0) {
            g.deadBodies.push({ x: g.px, y: g.py, type: 'PLAYER', diedAtFrame: g.frame });
            g.pvpDeathBodyDropped = true;
            g.diedLastSession = true;
            setIsDead(true); sfxDeath(); try { localStorage.setItem('sm_died_last_session', 'true'); } catch {}
          }
        }
      } else if (m.type === 'pvp_hit_confirm') {
        g.floaters.push({ x: g.px, y: g.py - 30, text: `${m.damage} HIT ${m.targetName}`, color: '#ffaa00', life: 40, maxLife: 40 });
      } else if (m.type === 'pvp_kill') {
        sfxKill(); sfxCoin();
        const lootMoney = m.loot?.money ?? 0;
        const lootItem = m.loot?.item ?? null;
        g.salary += lootMoney; setSalary(g.salary);
        g.floaters.push({ x: g.px, y: g.py - 40, text: `KILLED ${m.targetName}`, color: '#ff4444', life: 70, maxLife: 70 });
        if (lootMoney > 0) g.floaters.push({ x: g.px, y: g.py - 55, text: `+ƒ${lootMoney.toLocaleString()} LOOTED`, color: '#ffdd44', life: 60, maxLife: 60 });
        if (lootItem) g.floaters.push({ x: g.px, y: g.py - 70, text: `LOOT: ${lootItem.name}`, color: '#33ffaa', life: 70, maxLife: 70 });
        const lootItems: { name: string; desc: string }[] = [];
        if (lootItem) lootItems.push(lootItem);
        setLootPanel({ source: m.targetName ?? 'Enemy', money: lootMoney, items: lootItems });
        setTimeout(() => setLootPanel(null), 4000);
        setNarr(`> PVP KILL — You defeated ${m.targetName}! Looted ƒ${lootMoney.toLocaleString()} FIAT${lootItem ? ` and ${lootItem.name}` : ''}.`);
      } else if (m.type === 'pvp_death') {
        const lostMoney = m.lostMoney ?? 0;
        if (typeof m.remainingMoney === 'number') { g.salary = m.remainingMoney; } else { g.salary = Math.max(0, g.salary - lostMoney); }
        setSalary(g.salary);
        const lostItems: { name: string; desc: string }[] = [];
        if (m.lostItem) lostItems.push(m.lostItem);
        setLootPanel({ source: `DEFEATED BY ${m.attackerName}`, money: -lostMoney, items: lostItems });
        setTimeout(() => setLootPanel(null), 4000);
        setNarr(`> DEFEATED — ${m.attackerName} killed you. Lost ƒ${lostMoney.toLocaleString()} FIAT${m.lostItem ? ` and ${m.lostItem.name}` : ''}.`);
      } else if (m.type === 'pvp_kill_announce') {
        setChatMsgs(prev => [...prev.slice(-99), { id: seq++, from: 'PVP', text: `${m.killerName} killed ${m.victimName}` }]);
        for (const [, peer] of g.peers) {
          if (peer.name === m.victimName) {
            g.deadBodies.push({ x: peer.x, y: peer.y, type: 'PLAYER', diedAtFrame: g.frame });
            break;
          }
        }
      } else if (m.type === 'npc_loot') {
        if (m.item) {
          g.floaters.push({ x: g.px, y: g.py - 20, text: `LOOT: ${m.item.name}`, color: '#33ffaa', life: 65, maxLife: 65 });
          setLootPanel({ source: 'NPC KILL', money: 0, items: [m.item] });
          setTimeout(() => setLootPanel(null), 3000);
        }
      } else if (m.type === 'voice_offer')  handleVoiceOffer(m.from, m.sdp);
      else if (m.type === 'voice_answer')   handleVoiceAnswer(m.from, m.sdp);
      else if (m.type === 'voice_ice')      handleVoiceICE(m.from, m.candidate);
      else if (m.type === 'voice_peer_joined') initiateVoiceWith(m.id);
      else if (m.type === 'rtc_room_peers') {
        const peers = (m.peers as { id: string; name: string }[]) ?? [];
        setVideoCallPeers(peers.map(p => ({ id: p.id, name: p.name })));
        for (const peer of peers) createPeerConnection(peer.id, peer.name, true);
      } else if (m.type === 'rtc_peer_joined') {
        setVideoCallPeers(prev => [...prev, { id: m.peerId, name: m.peerName }]);
        createPeerConnection(m.peerId, m.peerName, false);
      } else if (m.type === 'rtc_peer_left') {
        const pc = peerConnectionsRef.current.get(m.peerId);
        if (pc) { pc.close(); peerConnectionsRef.current.delete(m.peerId); }
        iceCandidateQueueRef.current.delete(m.peerId);
        setVideoCallPeers(prev => prev.filter(p => p.id !== m.peerId));
      } else if (m.type === 'rtc_signal') {
        handleRtcSignal(m.fromId, m.fromName, m.signal);
      }
    };
    let lastSyncHp = 0;
    let lastSyncMoney = 0;
    const posInterval = setInterval(() => {
      const g = gs.current;
      wsSend({ type: 'move', x: g.px, y: g.py, paused: gamePausedRef.current });
      if (g.hp > lastSyncHp) wsSend({ type: 'pve_heal', hp: g.hp });
      else wsSend({ type: 'sync_stats', hp: g.hp, weaponId: activeWeaponRef.current });
      lastSyncHp = g.hp;
      if (g.salary !== lastSyncMoney) {
        wsSend({ type: 'money_update', money: g.salary });
        lastSyncMoney = g.salary;
      }
    }, 120);
    const fetchEmployees = () => {
      fetch('/api/tools/hiring/employees')
        .then(r => r.ok ? r.json() : { employeesByOwner: {} })
        .then(data => {
          const emps: EmployeeNpcDef[] = [];
          const byOwner: Record<string, { name: string; role: string; businessName: string }[]> = data.employeesByOwner ?? {};
          const ownerBuildings: Record<string, string[]> = {};
          gs.current.locks.forEach((lock, bid) => {
            const owner = lock.ownerName?.toUpperCase();
            if (owner) {
              if (!ownerBuildings[owner]) ownerBuildings[owner] = [];
              ownerBuildings[owner].push(bid);
            }
          });
          for (const [owner, staff] of Object.entries(byOwner)) {
            const bids = ownerBuildings[owner.toUpperCase()] ?? [];
            if (bids.length === 0) continue;
            staff.forEach((e, idx) => {
              const bid = bids[idx % bids.length];
              const bld = BUILDINGS.find(b => b.id === bid);
              if (bld) {
                const offsetX = (idx % 3 - 1) * 30;
                const offsetY = bld.h + 20 + Math.floor(idx / 3) * 25;
                emps.push({ name: e.name.toUpperCase(), role: e.role, x: bld.x + bld.w / 2 + offsetX, y: bld.y + offsetY, businessName: e.businessName ?? '', buildingId: bid });
              }
            });
          }
          gs.current.employeeNpcs = emps;
        })
        .catch(() => {});
    };
    setTimeout(fetchEmployees, 2000);
    const empRefreshInterval = setInterval(fetchEmployees, 60000);

    return () => { ws.close(); wsRef.current = null; clearInterval(posInterval); clearInterval(empRefreshInterval); };
  }, [char.name]);

  // ── Voice / WebRTC ─────────────────────────────────────────────────────────
  const mkPeer = (pid: string) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peerConns.current.set(pid, pc);
    localStream.current?.getTracks().forEach(t => pc.addTrack(t, localStream.current!));
    pc.onicecandidate = e => { if (e.candidate) wsSend({ type: 'voice_ice', to: pid, candidate: e.candidate }); };
    pc.ontrack = e => { const a = new Audio(); a.srcObject = e.streams[0]; a.play().catch(() => {}); };
    return pc;
  };
  const initiateVoiceWith = async (pid: string) => {
    if (!localStream.current) return;
    const pc = mkPeer(pid); const offer = await pc.createOffer();
    await pc.setLocalDescription(offer); wsSend({ type: 'voice_offer', to: pid, sdp: offer });
  };
  const handleVoiceOffer = async (fid: string, sdp: RTCSessionDescriptionInit) => {
    if (!localStream.current) return;
    const pc = mkPeer(fid); await pc.setRemoteDescription(sdp);
    const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
    wsSend({ type: 'voice_answer', to: fid, sdp: ans });
  };
  const handleVoiceAnswer = async (fid: string, sdp: RTCSessionDescriptionInit) => { await peerConns.current.get(fid)?.setRemoteDescription(sdp); };
  const handleVoiceICE    = async (fid: string, c: RTCIceCandidateInit)          => { await peerConns.current.get(fid)?.addIceCandidate(c); };

  const RTC_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

  const createPeerConnection = (peerId: string, peerName: string, initiator: boolean) => {
    if (peerConnectionsRef.current.has(peerId)) return;
    const pc = new RTCPeerConnection({ iceServers: RTC_ICE_SERVERS });
    peerConnectionsRef.current.set(peerId, pc);
    if (vcStreamRef.current) {
      vcStreamRef.current.getTracks().forEach(t => pc.addTrack(t, vcStreamRef.current!));
    }
    pc.onicecandidate = e => {
      if (e.candidate) wsSend({ type: 'rtc_signal', targetId: peerId, roomId: videoCallRoomRef.current, signal: { type: 'ice', candidate: e.candidate } });
    };
    pc.ontrack = e => {
      setVideoCallPeers(prev => prev.map(p => p.id === peerId ? { ...p, stream: e.streams[0] } : p));
    };
    if (initiator) {
      pc.createOffer().then(offer => pc.setLocalDescription(offer).then(() => {
        wsSend({ type: 'rtc_signal', targetId: peerId, roomId: videoCallRoomRef.current, signal: { type: 'offer', sdp: pc.localDescription } });
      })).catch(() => {});
    }
  };

  const flushIceCandidates = async (peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId);
    const queued = iceCandidateQueueRef.current.get(peerId);
    if (pc && queued && queued.length > 0 && pc.remoteDescription) {
      iceCandidateQueueRef.current.set(peerId, []);
      for (const c of queued) {
        try { await pc.addIceCandidate(c); } catch {}
      }
    }
  };

  const handleRtcSignal = async (fromId: string, fromName: string, signal: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) => {
    try {
      if (signal.type === 'offer') {
        if (!peerConnectionsRef.current.has(fromId)) createPeerConnection(fromId, fromName, false);
        const pc = peerConnectionsRef.current.get(fromId)!;
        await pc.setRemoteDescription(signal.sdp!);
        await flushIceCandidates(fromId);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        wsSend({ type: 'rtc_signal', targetId: fromId, roomId: videoCallRoomRef.current, signal: { type: 'answer', sdp: pc.localDescription } });
      } else if (signal.type === 'answer') {
        const pc = peerConnectionsRef.current.get(fromId);
        if (pc) {
          await pc.setRemoteDescription(signal.sdp!);
          await flushIceCandidates(fromId);
        }
      } else if (signal.type === 'ice') {
        const pc = peerConnectionsRef.current.get(fromId);
        if (pc && signal.candidate) {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(signal.candidate);
          } else {
            if (!iceCandidateQueueRef.current.has(fromId)) iceCandidateQueueRef.current.set(fromId, []);
            iceCandidateQueueRef.current.get(fromId)!.push(signal.candidate);
          }
        }
      }
    } catch {}
  };

  const joinVideoCall = useCallback(async (roomId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      vcStreamRef.current = stream;
      setVcStream(stream);
      videoCallRoomRef.current = roomId;
      setVideoCallRoom(roomId);
      setVideoEnabled(true);
      setAudioEnabled(true);
      wsSend({ type: 'rtc_join_room', roomId });
      setNarr('> VIDEO CALL — Connected. Other players at terminals can join this call. [C] or [ESC] to end.');
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        vcStreamRef.current = stream;
        setVcStream(stream);
        videoCallRoomRef.current = roomId;
        setVideoCallRoom(roomId);
        setVideoEnabled(false);
        setAudioEnabled(true);
        wsSend({ type: 'rtc_join_room', roomId });
        setNarr('> AUDIO CALL — No camera. Audio only mode. [C] or [ESC] to end.');
      } catch {
        setNarr('> CALL FAILED — Microphone access denied. Check browser permissions.');
      }
    }
  }, [wsSend]);

  const leaveVideoCall = useCallback(() => {
    const room = videoCallRoomRef.current;
    if (room) wsSend({ type: 'rtc_leave_room', roomId: room });
    vcStreamRef.current?.getTracks().forEach(t => t.stop());
    vcStreamRef.current = null;
    setVcStream(null);
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    videoCallRoomRef.current = null;
    setVideoCallRoom(null);
    setVideoCallPeers([]);
    setNarr('> CALL ENDED — Disconnected.');
    gameRef.current?.focus();
  }, [wsSend]);
  const leaveVideoCallRef = useRef(leaveVideoCall);
  leaveVideoCallRef.current = leaveVideoCall;
  useEffect(() => () => { leaveVideoCallRef.current(); }, []);

  const toggleVoice = useCallback(async () => {
    if (voice) {
      localStream.current?.getTracks().forEach(t => t.stop()); localStream.current = null;
      peerConns.current.forEach(pc => pc.close()); peerConns.current.clear();
      audioCtx.current?.close(); audioCtx.current = null;
      setVoice(false); setSpeaking(false); wsSend({ type: 'speaking', speaking: false });
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStream.current = stream; setVoice(true); wsSend({ type: 'voice_join' });
        const ctx = new AudioContext(); audioCtx.current = ctx;
        const src = ctx.createMediaStreamSource(stream); const an = ctx.createAnalyser();
        an.fftSize = 256; src.connect(an); const data = new Uint8Array(an.frequencyBinCount);
        const tick = () => {
          if (!localStream.current) return;
          an.getByteFrequencyData(data);
          const spk = data.reduce((a, b) => a + b, 0) / data.length > 12;
          setSpeaking(spk); wsSend({ type: 'speaking', speaking: spk }); requestAnimationFrame(tick);
        };
        tick();
      } catch { setNarr('> VOICE — Mic access denied. Check browser permissions.'); }
    }
  }, [voice, wsSend]);

  // ── Keep frozenRef in sync synchronously (not in an effect) ──
  frozenRef.current = !!dialog || showStore || showOffice || showPablo || !!pwPrompt || isDead || showMap || !!jobPanel || !!showTrade || showBank || showSubway || showVend || !!showBillboard || showDogName || !!showMerchant || showIndoorStart || showHospitalPrompt || !!hospitalCinematic || showGoldExchange || showDialoguePanel || showCostume || showQuests || showAdmin || showRealEstateOffice || showRecruitOffice || showCrafting || !!showMerchantShop || !!arcadeGameId || !!showNewspaper || showInventory || !!videoCallRoom;
  gamePausedRef.current = gamePaused;
  npcDialogRef.current = !!dialog && dialog.bid === 'npc';

  useEffect(() => {
    if (!hospitalCinematic) return;
    const id = setInterval(() => setHospitalCinematic(prev => prev ? { ...prev } : null), 200);
    return () => clearInterval(id);
  }, [!!hospitalCinematic]);

  useEffect((): void | (() => void) => {
    const handleCinematicKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (showIndoorStart) {
        const g = gs.current;
        const spawnBid = g.hamletBuildingId;
        const spawnB = BUILDINGS.find(b => b.id === spawnBid) ?? BUILDINGS.find(b => b.id === 'minx_arms')!;
        g.px = spawnB.x + spawnB.w / 2;
        g.py = spawnB.y + spawnB.h + 20;
        const def = getInterior(spawnBid);
        if (def) {
          let spawnIx = def.exitX + def.exitW / 2;
          let spawnIy = def.exitY - 20;
          const spawnICol = (ipx: number, ipy: number) => {
            if (ipx < PSIZE + 6 || ipx > def.width - PSIZE - 6 || ipy < PSIZE + 20 || ipy > def.height - PSIZE) return true;
            for (const obj of def.objects) {
              if (obj.type === 'window' || obj.type === 'plant') continue;
              if (ipx + PSIZE > obj.x && ipx - PSIZE < obj.x + obj.w && ipy + PSIZE > obj.y && ipy - PSIZE < obj.y + obj.h) return true;
            }
            return false;
          };
          if (spawnICol(spawnIx, spawnIy)) {
            for (let r = 8; r <= 200; r += 8) {
              let escaped = false;
              for (const [ox, oy] of [[0,r],[0,-r],[r,0],[-r,0],[r,r],[-r,r],[r,-r],[-r,-r]]) {
                if (!spawnICol(spawnIx + ox, spawnIy + oy)) { spawnIx += ox; spawnIy += oy; escaped = true; break; }
              }
              if (escaped) break;
            }
          }
          g.interior = {
            bid: spawnBid, def,
            px: spawnIx, py: spawnIy,
            savedWorldX: g.px, savedWorldY: g.py,
          };
        }
        setShowIndoorStart(false);
        const isUnemployed = char.bizType === 'unemployed' || !char.hasBusiness;
        const hamletLabel = BUILDINGS.find(b => b.id === spawnBid)?.label ?? 'SHELTER';
        setNarr(isUnemployed
          ? `> ${hamletLabel} — Your hamlet. No corporate ties. Walk to the EXIT to step outside. Register a business at PABLO TOWER when you're ready.`
          : '> MINX ARMS — FLOOR 4 — UNIT 408. Your apartment. The intercom crackles. Walk to the EXIT to step outside.');
        return;
      }

      if (showHospitalPrompt && !hospitalCinematic) {
        setShowHospitalPrompt(false);
        setHospitalCinematic({ phase: 0, lineIdx: 0, fadeAlpha: 1, startTime: Date.now() });
        return;
      }

      if (hospitalCinematic) {
        const elapsed = Date.now() - hospitalCinematic.startTime;
        const LINE_INTERVAL = 2200;
        const HOSPITAL_LINES_COUNT = 10;
        const allLinesShown = Math.floor(elapsed / LINE_INTERVAL) >= HOSPITAL_LINES_COUNT - 1 && elapsed >= (HOSPITAL_LINES_COUNT - 1) * LINE_INTERVAL + 1500;
        if (allLinesShown) {
          (document.querySelector('[data-cinematic-continue]') as HTMLButtonElement)?.click();
        }
        return;
      }

      if (isDead && !hospitalCinematic) {
        setIsDead(false);
        setHospitalCinematic({ phase: 0, lineIdx: 0, fadeAlpha: 1, startTime: Date.now() });
        return;
      }

      if (showDialoguePanel && dialogueNode && (!dialogueNode.choices || dialogueNode.choices.length === 0)) {
        (document.querySelector('[data-dialogue-continue]') as HTMLButtonElement)?.click();
        return;
      }
    };
    if (showIndoorStart || showHospitalPrompt || hospitalCinematic || isDead || showDialoguePanel) {
      window.addEventListener('keydown', handleCinematicKey);
      return () => window.removeEventListener('keydown', handleCinematicKey);
    }
  }, [showIndoorStart, showHospitalPrompt, !!hospitalCinematic, isDead, showDialoguePanel, dialogueNode]);

  // ── Ambient soundtrack — start on first interaction ──────────────────────────
  useEffect(() => {
    initMusic();
    const start = () => { resumeAudioContext(); playMusic(); };
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    return () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
      pauseMusic();
    };
  }, []);

  useEffect(() => {
    if (gs.current.hasRadioImplant) showRadio();
  }, []);

  useEffect(() => {
    const radioActive = radioOn && !musicMuted && !allMuted;
    if (radioActive) {
      fadeOutAmbient(1.5);
    } else {
      fadeInAmbient(2.0);
    }
  }, [radioOn, musicMuted, allMuted]);

  // ── Commodity price drift (Star Citizen-style supply/demand oscillation) ─────
  useEffect(() => {
    const t = setInterval(() => {
      const cp = commodityPrices.current;
      for (const c of COMMODITIES) {
        const drift = (v: number, base: number) => {
          const swing = base * c.vol * (Math.random() * 0.4 - 0.2);
          const meanRev = (base - v) * 0.12;
          return Math.max(Math.round(base * 0.5), Math.round(v + swing + meanRev));
        };
        cp[c.id].cityBuy  = drift(cp[c.id].cityBuy,  c.cityBuy);
        cp[c.id].citySell = drift(cp[c.id].citySell, c.citySell);
        cp[c.id].wasteBuy = drift(cp[c.id].wasteBuy, c.wasteBuy);
        cp[c.id].wasteSell= drift(cp[c.id].wasteSell,c.wasteSell);
      }
      setCpTick(n => n + 1);
    }, 28000);
    return () => clearInterval(t);
  }, []);

  // ── Dialog advance ─────────────────────────────────────────────────────────
  const advDialog = useCallback(() => {
    if (!dialog) return;
    sfxTalk();
    if (dialog.idx < dialog.lines.length - 1) setDialog(d => d ? { ...d, idx: d.idx + 1 } : null);
    else {
      if (dialog.bid === 'pablo_store')      { gs.current.hasDevice = true; gs.current.deviceBroken = false; gs.current.deviceDurability = 100; setHasDevice(true); setDeviceBroken(false); setShowStore(true); completeQuestTask('establish_business', 'get_device'); }
      if (dialog.bid === 'pablo_tower_enter') { setShowOffice(true); completeQuestTask('establish_business', 'visit_tower'); }
      setDialog(null);
    }
  }, [dialog]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const MOVE_KEYS = new Set(['arrowleft','arrowright','arrowup','arrowdown','a','s','w','d',' ']);
    const dn = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (MOVE_KEYS.has(e.key.toLowerCase()) || MOVE_KEYS.has(e.key)) e.preventDefault();
      gs.current.keys.add(e.key.toLowerCase());
      gs.current.lastMoveTime = Date.now();

      if (e.key === 'e' || e.key === 'E') {
        if (!frozenRef.current && !chatOpenRef.current) {
          const g = gs.current;
          if (g.interior && g.near === '__interior_exit') { exitInterior(); return; }
          if (g.interior && nearArcadeMachine) {
            sfxEnter();
            setArcadeGameId(nearArcadeMachine);
            return;
          }
          if (g.interior && nearWaterCooler) {
            sfxEnter();
            const seasonIdx = Math.floor(((g.worldTime ?? 8) / 24 * 365) / 91.25) % 4;
            setShowNewspaper(THE_MINX_ISSUES[seasonIdx] ?? THE_MINX_ISSUES[0]);
            setGamePaused(true);
            return;
          }
          {
            const nearNP = NEWSPAPER_WORLD_SPOTS.find(np => Math.hypot(g.px - np.x, g.py - np.y) < 40);
            if (nearNP) {
              sfxEnter();
              const seasonIdx = Math.floor(((g.worldTime ?? 8) / 24 * 365) / 91.25) % 4;
              setShowNewspaper(THE_MINX_ISSUES[seasonIdx] ?? THE_MINX_ISSUES[0]);
              return;
            }
          }
          g.near = null; g.nearNpc = null; g.nearBillboard = null; g.nearEmployee = null;
          for (const b of BUILDINGS) { if (Math.hypot(g.px - (b.x + b.w / 2), g.py - (b.y + b.h / 2)) < RANGE + (b.id === 'pablo_tower' ? 40 : 0)) { g.near = b.id; break; } }
          if (!g.near) { for (let i = 0; i < NPCS.length; i++) { const sp = getNpcSchedulePos(NPCS[i], g.worldTime ?? 0); if (Math.hypot(g.px - sp.x, g.py - sp.y) < NPC_RANGE) { g.nearNpc = i; break; } } }
          if (!g.near && g.nearNpc === null) { for (let ei = 0; ei < g.employeeNpcs.length; ei++) { if (Math.hypot(g.px - g.employeeNpcs[ei].x, g.py - g.employeeNpcs[ei].y) < 40) { g.nearEmployee = ei; break; } } }
          if (!g.near && g.nearNpc === null && g.nearEmployee === null) { for (const bb of BILLBOARDS) { if (Math.hypot(g.px - bb.x, g.py - bb.y) < 80) { g.nearBillboard = bb.locationId; break; } } }
          const nb = g.near;
          const nn = g.nearNpc;
          const nbb = g.nearBillboard;
          if (nb) tryEnter(nb);
          else if (nbb) {
            const bb = BILLBOARDS.find(b => b.locationId === nbb);
            if (bb) { setShowBillboard(bb); fetchBillboards(); }
          }
          else if (nn !== null) enterNpc(nn);
          else if (g.nearEmployee !== null) {
            const emp = g.employeeNpcs[g.nearEmployee];
            if (emp) {
              setNarr([
                `> EMPLOYEE: ${emp.name}`,
                `> ROLE: ${emp.role}`,
                `> ASSIGNED TO: ${emp.businessName || 'Your Enterprise'}`,
                `> STATUS: ON DUTY`,
                `> "${getEmployeeDialogue(emp.role)}"`,
              ].join('\n'));
            }
          }
          else {
            for (const merch of MERCHANT_NPCS) {
              if (Math.hypot(g.px - merch.x, g.py - merch.y) < 60) {
                sfxEnter(); setShowMerchantShop(merch); frozenRef.current = true;
                setNarr(`> ${merch.name} — "${merch.type === 'city' ? 'Welcome. Browse my wares.' : 'You look like you need supplies. Take a look.'}"`);
                break;
              }
            }
          }
          if (!showMerchantShop && g.nearManhole !== null && !g.inSewer && g.sewerExitTimer <= 0) {
            const fromIdx = g.nearManhole;
            let toIdx = (fromIdx + 3 + Math.floor(Math.random() * (MANHOLES.length - 3))) % MANHOLES.length;
            if (toIdx === fromIdx) toIdx = (fromIdx + 1) % MANHOLES.length;
            const dest = MANHOLES[toIdx];
            g.inSewer = true;
            sfxEnter();
            setNarr('> SEWER — You descend into the tunnels. Dark water. Echoing pipes. Traveling underground...');
            setTimeout(() => {
              const g2 = gs.current;
              g2.px = dest.x; g2.py = dest.y;
              g2.inSewer = false;
              g2.sewerExitTimer = 120;
              g2.nearManhole = null;
              sfxEnter();
              setNarr(`> SEWER EXIT — You emerge from manhole at grid (${Math.floor(dest.x/100)},${Math.floor(dest.y/100)}). Daylight stings.`);
            }, 1500);
          }
          else {
            const lootBody = g.deadBodies.find(b => !b.looted && b.type !== 'PLAYER' && (b.bounty ?? 0) > 0 && Math.hypot(g.px - b.x, g.py - b.y) < 40);
            if (lootBody) {
              const amt = lootBody.bounty ?? 0;
              lootBody.looted = true;
              g.salary += amt; setSalary(g.salary); sfxCoin(); sfxItemPickup();
              g.floaters.push({ x: lootBody.x, y: lootBody.y - 12, text: `+ƒ${amt.toLocaleString()} LOOTED`, color: '#ffdd44', life: 55, maxLife: 55 });
              setNarr(`> LOOT — You search the body. +ƒ${amt.toLocaleString()} FIAT recovered.`);
            } else {
              const nearChest = TREASURE_CHESTS.find(tc => !g.openedChests.has(tc.id) && Math.hypot(g.px - tc.x, g.py - tc.y) < 50);
              if (nearChest) {
                g.openedChests.add(nearChest.id); sfxCoin(); sfxItemPickup();
                const loot = nearChest.loot;
                g.salary += loot.fiat; setSalary(g.salary);
                const lootItemNames = loot.items.map(i => i.name).join(', ');
                g.floaters.push({ x: g.px, y: g.py - 20, text: `+ƒ${loot.fiat} FIAT`, color: '#FFD700', life: 60, maxLife: 60 });
                setNarr(`> TREASURE — +ƒ${loot.fiat.toLocaleString()} FIAT${lootItemNames ? `, ${lootItemNames}` : ''}.`);
              }
            }
          }
          if (!g.dogCompanion.active) {
            const stray = g.threats.find(t => t.type === 'STRAY_DOG' && Math.hypot(g.px - t.x, g.py - t.y) < 60);
            if (stray) {
              dogAdoptTarget.current = stray;
              setShowDogName(true);
              setDogNameIn('');
              frozenRef.current = true;
            }
          }
        }
      }
      if (e.key === 'p' || e.key === 'P') {
        const g = gs.current;
        if (g.hasDevice && !g.deviceBroken) { setShowPablo(v => { if (v) { g.atPublicTerminal = false; setAtPublicTerminal(false); } return !v; }); }
        else if (g.hasDevice && g.deviceBroken) { setNarr('> DEVICE DAMAGED — Screen cracked. Circuitry fried. Find a PUBLIC TERMINAL or repair at CITY CLINIC.'); }
        else if (g.atPublicTerminal) { setShowPablo(v => { if (v) { g.atPublicTerminal = false; setAtPublicTerminal(false); } return !v; }); }
        else { setNarr('> NO DEVICE — You don\'t have a personal terminal. Find a PUBLIC TERMINAL (payphone, kiosk, or van) and press [E].'); }
      }
      if (e.key === 'm' || e.key === 'M') setShowMap(v => !v);
      if (e.key === 'q' || e.key === 'Q') setShowQuests(v => !v);
      if (e.key === 'c' || e.key === 'C') { setChatOpen(v => { chatOpenRef.current = !v; return !v; }); setUnread(0); }
      if (e.key === 'v' || e.key === 'V') toggleVoice();
      if ((e.key === 'r' || e.key === 'R') && radioVisibleRef.current && !frozenRef.current && !chatOpenRef.current) {
        handleRadioToggle();
      }
      if ((e.key === ' ' || e.key === 'Enter') && dialog) advDialog();
      // [Space] melee attack
      if (e.key === ' ' && !frozenRef.current && !dialog && !gamePausedRef.current) {
        const g = gs.current;
        if (g.attackCooldown > 0) return;
        const wpn = WEAPONS.find(w => w.id === activeWeaponRef.current) ?? WEAPONS[0];
        g.attackCooldown = wpn.cooldown; g.attackFlash = 8;
        sfxWeaponDraw(); sfxAttack();
        const atkBonusMerch = g.ownedItems.has('atk_boost') ? 5 : 0;
        const ATK = 20 + (g.level - 1) * 5 + wpn.atkBonus + atkBonusMerch;
        const meleeRange = wpn.type === 'melee' ? wpn.range : 72;
        let hit = false;
        g.threats = g.threats.map(t => {
          const d = Math.hypot(g.px - t.x, g.py - t.y);
          if (d < meleeRange) {
            hit = true;
            if (t.type === 'PABLO_GUARD' || t.type === 'MINX_CITY') {
              g.policeAlertTimer = 450; g.policeAlertX = g.px; g.policeAlertY = g.py;
            }
            const nhp = t.hp - ATK;
            if (nhp <= 0) {
              sfxKill();
              const cs = CLASS_STATS[char.class.toLowerCase()] ?? CLASS_STATS.corporate;
              const inWaste = !inCityBounds(g.px, g.py);
              const isAnimal = ANIMAL_TYPES.has(t.type);
              let bountyAmt = isAnimal ? 0 : (BOUNTY[t.type] ?? 10);
              if (!isAnimal && cs.wasteBonus && inWaste) bountyAmt = Math.floor(bountyAmt * 1.5);
              if (isAnimal) {
                const drop = ANIMAL_DROPS[Math.floor(Math.random() * ANIMAL_DROPS.length)];
                g.floaters.push({ x: t.x, y: t.y, text: `+ ${drop.name}`, color: '#88cc44', life: 55, maxLife: 55 });
              } else {
                g.floaters.push({ x: t.x, y: t.y, text: `ƒ${bountyAmt.toLocaleString()} LOOT`, color: '#ffdd44', life: 55, maxLife: 55 });
              }
              const earned = THREAT_EXP[t.type] ?? 20;
              g.floaters.push({ x: t.x + 8, y: t.y - 10, text: `+${earned}XP`, color: '#44ffaa', life: 50, maxLife: 50 });
              wsSend({ type: 'pve_kill', exp: earned });
              applyExpGain(g, earned, sfxLevelUp, setLevelUpText, setShowLevelUp, setNarr, setExp, setLevel, setHp);
              g.threatRespawn.push({ ox: t.ox, oy: t.oy, type: t.type, at: g.frame + 420 });
              g.deadBodies.push({ x: t.x, y: t.y, type: t.type, diedAtFrame: g.frame, bounty: bountyAmt, looted: false });
              return null as unknown as Threat;
            }
            sfxHit();
            return { ...t, hp: nhp };
          }
          return t;
        }).filter(Boolean) as Threat[];
        if (!hit) {
          for (const [, peer] of g.peers) {
            const pd = Math.hypot(g.px - peer.x, g.py - peer.y);
            if (pd < meleeRange) {
              hit = true;
              wsSend({ type: 'pvp_attack', targetId: peer.id, weaponType: 'melee' });
              sfxHit();
              break;
            }
          }
        }
        if (!hit) setNarr('> Miss — no target in melee range. Move closer or use [Click] to shoot.');
        setExp(g.exp);
      }
      if (e.key === 'Escape') {
        if (videoCallRoom) { leaveVideoCall(); sfxUIClick(); return; }
        if (showNewspaper) { setShowNewspaper(null); setGamePaused(false); frozenRef.current = false; sfxUIClick(); return; }
        if (showInventory) { setShowInventory(false); frozenRef.current = false; sfxUIClick(); return; }
        setDialog(null); setShowStore(false); setShowOffice(false);
        setShowPablo(false); gs.current.atPublicTerminal = false; setAtPublicTerminal(false);
        setPwPrompt(null); pendingBidRef.current = null; setPendingBid(null);
        setFloorPanel(null); setShowMap(false); setShowTrade(null); setShowBillboard(null);
        if (jobTimerRef.current) { clearInterval(jobTimerRef.current); jobTimerRef.current = null; }
        setJobPanel(null);
        setShowBank(false); setShowMerchant(null); setShowQuests(false); setShowAdmin(false); setShowRealEstateOffice(false); setShowRecruitOffice(false); frozenRef.current = false; sfxUIClick();
        setShowNewspaper(null); setShowInventory(false);
        doSaveRef.current(buildSaveData());
      }
      if (e.key === 'i' || e.key === 'I') {
        if (!chatOpenRef.current) setShowInventory(v => !v);
      }
      if (e.key === 'c' || e.key === 'C') {
        if (!chatOpenRef.current) {
          const g = gs.current;
          if (videoCallRoomRef.current) {
            leaveVideoCall();
          } else {
            const nearTerm = g.near && (IS_PUBLIC_TERMINAL(g.near) || g.near === 'terminal_shop');
            const hasTerminalInInterior = g.interior && g.interior.def.objects.some(o => o.type === 'terminal');
            if (nearTerm || hasTerminalInInterior || (g.hasDevice && !g.deviceBroken)) {
              const roomId = g.interior ? `room_${g.interior.bid}` : `city_${Math.floor(g.px / 500)}_${Math.floor(g.py / 500)}`;
              joinVideoCall(roomId);
            } else {
              setNarr('> NO TERMINAL — You need a terminal or PABLO device to make video calls.');
            }
          }
        }
      }
    };
    const up = (e: KeyboardEvent) => { gs.current.keys.delete(e.key.toLowerCase()); };
    const onBlur = () => { gs.current.keys.clear(); gs.current.moveTarget = null; };
    const onVisChange = () => { if (document.hidden) { gs.current.keys.clear(); gs.current.moveTarget = null; } };
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisChange);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); window.removeEventListener('blur', onBlur); document.removeEventListener('visibilitychange', onVisChange); };
  }, [dialog, tryEnter, enterNpc, toggleVoice, advDialog, handleRadioToggle]);

  // ── Mouse/touch click — attack enemies or move character ────────────────
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const resolveWorldCoords = (clientX: number, clientY: number) => {
      const g = gs.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return { wx: (clientX - rect.left) * scaleX + g.cam.x, wy: (clientY - rect.top) * scaleY + g.cam.y };
    };
    const handleInteraction = (clientX: number, clientY: number) => {
      gs.current.lastMoveTime = Date.now();
      if (frozenRef.current || gamePausedRef.current) return;
      const g = gs.current;
      const { wx: clickWorldX, wy: clickWorldY } = resolveWorldCoords(clientX, clientY);
      const clickedBody = g.deadBodies.find(b => !b.looted && b.type !== 'PLAYER' && (b.bounty ?? 0) > 0 && Math.hypot(clickWorldX - b.x, clickWorldY - b.y) < 30 && Math.hypot(g.px - b.x, g.py - b.y) < 50);
      if (clickedBody) {
        const amt = clickedBody.bounty ?? 0;
        clickedBody.looted = true;
        g.salary += amt; setSalary(g.salary); sfxCoin();
        g.floaters.push({ x: clickedBody.x, y: clickedBody.y - 12, text: `+ƒ${amt.toLocaleString()} LOOTED`, color: '#ffdd44', life: 55, maxLife: 55 });
        setNarr(`> LOOT — You search the body. +ƒ${amt.toLocaleString()} FIAT recovered.`);
        return;
      }
      const clickDistToPlayer = Math.hypot(clickWorldX - g.px, clickWorldY - g.py);
      if (clickDistToPlayer < 60) {
        if (g.near) { tryEnter(g.near); return; }
        if (g.nearNpc !== null) { enterNpc(g.nearNpc); return; }
        if (g.nearEmployee !== null) {
          const emp = g.employeeNpcs[g.nearEmployee];
          if (emp) {
            const lines = [
              `> EMPLOYEE: ${emp.name}`,
              `> ROLE: ${emp.role}`,
              `> ASSIGNED TO: ${emp.businessName || 'Your Enterprise'}`,
              `> STATUS: ON DUTY`,
              `> "${getEmployeeDialogue(emp.role)}"`,
            ];
            setNarr(lines.join('\n'));
          }
          return;
        }
        if (g.nearBillboard) {
          const bb = BILLBOARDS.find(b => b.locationId === g.nearBillboard);
          if (bb) { setShowBillboard(bb); fetchBillboards(); return; }
        }
      }
      const clickedEnemy = g.threats.find(t => Math.hypot(clickWorldX - t.x, clickWorldY - t.y) < 35);
      if (clickedEnemy) {
        if (g.attackCooldown > 0) return;
        const wpn = WEAPONS.find(w => w.id === secondaryWeaponRef.current) ?? WEAPONS.find(w => w.id === activeWeaponRef.current) ?? WEAPONS[0];
        if (wpn.type !== 'ranged') {
          g.moveTarget = { x: clickedEnemy.x, y: clickedEnemy.y };
          return;
        }
        const angle = Math.atan2(clickWorldY - g.py, clickWorldX - g.px);
        const speed = 8;
        g.attackCooldown = wpn.cooldown; g.attackFlash = 4;
        sfxWeaponDraw(); sfxAttack();
        const atkBonusMerch = g.ownedItems.has('atk_boost') ? 5 : 0;
        const ATK = 20 + (g.level - 1) * 5 + wpn.atkBonus + atkBonusMerch;
        if (wpn.icon === 'bomb') {
          g.bombs.push({ x: g.px + Math.cos(angle) * 30, y: g.py + Math.sin(angle) * 30, timer: 45, damage: ATK, radius: wpn.range });
        } else {
          g.projectiles.push({ x: g.px, y: g.py, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed, life: wpn.icon === 'laser' ? 50 : 35, damage: ATK, type: wpn.icon });
        }
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const screenX = (clientX - rect.left) / rect.width;
      const screenY = (clientY - rect.top) / rect.height;
      if (screenX < 0.15 && screenY < 0.15) return;
      if (screenX > 0.85 && screenY < 0.1) return;
      if (screenY > 0.85 && screenX < 0.2) return;
      if (clickDistToPlayer < 20) return;
      g.moveTarget = { x: clickWorldX, y: clickWorldY };
    };
    const handleClick = (e: MouseEvent) => handleInteraction(e.clientX, e.clientY);
    const handleTouch = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        e.preventDefault();
        handleInteraction(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('touchstart', handleTouch, { passive: false });
    return () => { canvas.removeEventListener('click', handleClick); canvas.removeEventListener('touchstart', handleTouch); };
  }, []);

  // ── Billboard data fetch ──────────────────────────────────────────────────
  const fetchBillboards = useCallback(async () => {
    try {
      const r = await fetch('/api/billboards', { credentials: 'include' });
      if (r.ok) { const data = await r.json(); setBillboardsData(data); }
    } catch { /* silent */ }
  }, []);
  useEffect(() => { fetchBillboards(); const iv = setInterval(fetchBillboards, 30000); return () => clearInterval(iv); }, [fetchBillboards]);

  const purchaseBillboard = useCallback(async (bbId: number) => {
    try {
      const r = await fetch(`/api/billboards/${bbId}/purchase`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationDays: 7, currentBalance: gs.current.salary }),
        credentials: 'include',
      });
      const d = await r.json();
      if (d.ok) {
        const cost = d.cost ?? 0;
        if (typeof d.newBalance === 'number') {
          gs.current.salary = d.newBalance;
        } else {
          gs.current.salary = Math.max(0, gs.current.salary - cost);
        }
        setSalary(gs.current.salary);
        sfxCoin();
        setNarr(`> BILLBOARD PURCHASED — ç${cost.toLocaleString()} FIAT deducted. 7 days of ad space. Update your content now.`);
        fetchBillboards();
      } else {
        sfxError(); setNarr(`> PURCHASE FAILED — ${d.error ?? 'Unknown error'}`);
      }
    } catch { sfxError(); setNarr('> NETWORK ERROR — Billboard purchase failed.'); }
  }, [fetchBillboards]);

  const updateBillboardContent = useCallback(async (bbId: number) => {
    try {
      const r = await fetch(`/api/billboards/${bbId}/update-content`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adText: bbAdText || null, adImageUrl: bbAdUrl || null }),
        credentials: 'include',
      });
      const d = await r.json();
      if (d.ok) { sfxCoin(); setNarr('> AD CONTENT UPDATED — Your billboard is now live.'); fetchBillboards(); }
      else { sfxError(); setNarr(`> UPDATE FAILED — ${d.error ?? 'Not authorized'}`); }
    } catch { sfxError(); setNarr('> NETWORK ERROR — Content update failed.'); }
  }, [bbAdText, bbAdUrl, fetchBillboards]);

  // ── PABLO AI ──────────────────────────────────────────────────────────────
  const buildPabloContext = useCallback(() => {
    const g = gs.current;
    const nearbyNpcs = NPCS.filter(n => { const sp = getNpcSchedulePos(n, g.worldTime ?? 0); return Math.hypot(g.px - sp.x, g.py - sp.y) < 150; }).map(n => n.name).join(', ') || 'none';
    const nearbyEnemies = g.threats.filter(t => Math.hypot(g.px - t.x, g.py - t.y) < 200).map(t => `${t.type}(HP:${Math.floor(t.hp)})`).join(', ') || 'none';
    const loanStr = g.loan ? `ACTIVE LOAN ƒ${g.loan.amount.toLocaleString()} + ƒ${g.loan.interest.toLocaleString()} interest${g.frame > g.loan.dueAt ? ' [OVERDUE]' : ''}` : 'no active loans';
    const gameDay = Math.max(1, Math.floor(g.frame / (360 * 60)));
    return `SYSTEM: You are PABLO — the in-world AI field unit issued to all registered Salaryman operatives in Minx City. You speak in the terse, dry voice of a 1980s cyberpunk surveillance AI: sharp, a little ominous, occasionally darkly funny. You are the player's guide and tactical adviser.

WORLD LORE: Minx City is a post-apocalyptic neon metropolis controlled by SENIOR PABLO, a mysterious corporate overlord who lives on Floor 40+ of PABLO TOWER. The wasteland lies south of the city wall. Five gang factions control wasteland territory — MINX CITY is the dominant faction with the largest territory and strongest soldiers, followed by RUST SYNDICATE, VOID RUNNERS, STATIC MONKS, and EASTERN BLOC. Currency is FIAT (ƒ). Banking is handled by BANCO OMBRA. Combat earns bounties. Economy matters.

DO NOT SPOIL: Do not reveal what is on Floor 40+. Do not reveal Senior Pablo's identity. Do not give away the secret code. Do give gameplay hints, survival tips, building advice, economy guidance, and lore flavor.

OPERATIVE STATUS:
- Name: ${char.name} | Class: ${char.class.toUpperCase()} | Level: ${g.level}
- HP: ${Math.floor(g.hp)}/${g.maxHp} | FIAT: ƒ${g.salary.toLocaleString()} | Savings: ƒ${g.savings.toLocaleString()}
- Hunger: ${Math.floor(g.hunger)}% | Thirst: ${Math.floor(g.thirst)}% | Energy: ${Math.floor(g.energy)}%
- Zone: ${inCityBounds(g.px, g.py) ? 'MINX CITY' : 'WASTELAND'} | Position: (${Math.round(g.px)}, ${Math.round(g.py)})
- Gang territory: ${g.gangZone ?? 'neutral'}
- ${loanStr}
- Game day: ${gameDay} | Survival ticks: ${g.survivalTick}
- Nearby NPCs (150px): ${nearbyNpcs}
- Nearby threats (200px): ${nearbyEnemies}
- Has personal device: ${g.hasDevice ? (g.deviceBroken ? 'DAMAGED — needs repair' : 'YES') : 'NO'}
- At public terminal: ${g.atPublicTerminal ? 'YES' : 'NO'}
- Device durability: ${g.deviceDurability}%
- Poisoned: ${g.poisoned ? 'YES — find antidote or save point' : 'no'}
- Bank history entries: ${(gs.current as any).bankHistoryLength ?? 0}

Reply in 1–3 short lines maximum. Be useful. Be lore-accurate. Stay in character.`;
  }, [char]);

  const sendPablo = useCallback(async () => {
    if (!pabloIn.trim() || pabloLoad) return;
    const txt = pabloIn.trim(); setPabloIn('');
    setPabloMsgs(m => [...m, { role: 'user', text: txt }]);
    const canAccess = (gs.current.hasDevice && !gs.current.deviceBroken) || gs.current.atPublicTerminal;
    if (!canAccess) { setPabloMsgs(m => [...m, { role: 'pablo', text: gs.current.deviceBroken ? 'Device damaged. Visit CITY CLINIC for repair (ƒ5,000) or find a PUBLIC TERMINAL.' : 'No device. Find a PUBLIC TERMINAL (payphone, kiosk, or van) and press [E].' }]); return; }
    setPabloLoad(true);
    try {
      const context = buildPabloContext();
      const r = await fetch('/api/advisor/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: txt, context }), credentials: 'include' });
      const d = r.ok ? await r.json() : {};
      setPabloMsgs(m => [...m, { role: 'pablo', text: d.response ?? 'Signal lost. Try again.' }]);
    } catch { setPabloMsgs(m => [...m, { role: 'pablo', text: 'Network dead. Move to higher ground.' }]); }
    setPabloLoad(false);
  }, [pabloIn, pabloLoad, buildPabloContext]);

  // ── Game loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let logW = canvas.offsetWidth, logH = canvas.offsetHeight;
    const resize = () => {
      logW = canvas.offsetWidth;
      logH = canvas.offsetHeight;
      canvas.width = Math.round(logW * dpr);
      canvas.height = Math.round(logH * dpr);
      canvas.style.width = logW + 'px';
      canvas.style.height = logH + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize(); window.addEventListener('resize', resize);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      targetZoomRef.current = Math.max(0.8, Math.min(2.5, targetZoomRef.current + delta));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    let lastNear: string | null = null, lastNearNpc: number | null = null, lastNearBb: string | null = null, lastZone = '', lastGangZ: string | null = null, lastDead = false, lastHp = 100, lastSal = char.salary;
    const frozen = () => frozenRef.current;

    const loop = () => {
      const g = gs.current;
      const zoom = zoomRef.current;
      const cw = logW / zoom, ch = logH / zoom;
      g.frame++; g.blink = Math.floor(g.frame / 25) % 2;
      g.worldTimeTick++;
      if (g.worldTimeTick >= 1800) { g.worldTimeTick = 0; g.worldTime = (g.worldTime + 0.1) % 24; }
      tickCalendar(g.calendar, 16.67);
      if (g.frame % 30 === 0) {
        setCalendarStr(getCalendarString(g.calendar));
        setWeatherStr(g.calendar.weather);
        setSeasonStr(g.calendar.season);
        const baseTemp: Record<string, number> = { SPRING: 18, SUMMER: 32, AUTUMN: 14, WINTER: 2 };
        const weatherMod: Record<string, number> = { CLEAR: 0, RAIN: -3, SNOW: -8, STORM: -5, DUST: 4, ACID_RAIN: -2, FOG: -2 };
        setTempC(Math.round((baseTemp[g.calendar.season] ?? 18) + (weatherMod[g.calendar.weather] ?? 0) + Math.sin(g.calendar.hour * 0.26) * 5));
      }
      updateWeatherParticles(g.weatherParticles, logW, logH);
      if (g.frame % 10 === 0 && g.weatherParticles.length < 60 && (g.calendar.weather === 'RAIN' || g.calendar.weather === 'SNOW' || g.calendar.weather === 'ACID_RAIN')) {
        g.weatherParticles.push(...createWeatherParticles(g.calendar.weather, 8, logW, logH));
      }
      const radResult = getRadiationLevel(g.px, g.py);
      const rl = radResult.intensity;
      g.radiationLevel = rl;
      if (g.frame % 15 === 0) setRadLevel(rl);
      if (rl > 0 && g.frame % 60 === 0 && !gamePausedRef.current) {
        const radDmg = Math.ceil(rl * 3);
        g.hp = Math.max(0, g.hp - radDmg); g.deathReason = 'Died from radiation exposure';
        setHp(Math.floor(g.hp));
        g.floaters.push({ x: g.px, y: g.py - 25, text: `-${radDmg} RAD`, color: '#44ff44', life: 40, maxLife: 40 });
      }
      if (g.rumorCooldown > 0) g.rumorCooldown--;
      shiftTerritories(g.frame);

      if (g.frame % 60 === 0) {
        for (let ni = 0; ni < NPCS.length; ni++) tickNpcSurvival(ni, g.calendar.hour);
      }
      tickBladeRunnerHunts(NPCS, char.class, g.calendar.hour, g.px, g.py);
      const raidResult = tickGangRaids(g.frame);
      if (raidResult) {
        addGossipEvent(
          `${raidResult.attackerFaction.replace(/_/g,' ').toUpperCase()} raiding ${raidResult.targetFaction.replace(/_/g,' ').toUpperCase()} territory!`,
          raidResult.x, raidResult.y, 'raid', g.frame
        );
      }
      tickPowerInfrastructure(g.frame, char.class);
      tickTypewriters(g.frame);

      // ── One-time class stat initialization ──────────────────────────────
      if (!g.classInitDone) {
        g.classInitDone = true;
        const cs = CLASS_STATS[char.class.toLowerCase()] ?? CLASS_STATS.corporate;
        if (_ss && _ss.maxHp) {
          g.maxHp = _ss.maxHp;
          g.hp = Math.min(_ss.hp ?? _ss.maxHp, _ss.maxHp);
        } else {
          g.maxHp = cs.maxHp; g.hp = cs.maxHp;
        }
        setHp(Math.floor(g.hp));
      }

      // ── Job cooldown ticks ───────────────────────────────────────────────
      for (const k in g.jobCooldowns) { if (g.jobCooldowns[k] > 0) g.jobCooldowns[k]--; }

      // ── Floater update — drift upward, fade out ──────────────────────────
      g.floaters = g.floaters.map(f => ({ ...f, y: f.y - 0.7, life: f.life - 1 })).filter(f => f.life > 0);

      if (g.invincible > 0) g.invincible--;
      if (g.flash > 0) g.flash--;

      // Cooldown ticks
      if (g.attackCooldown > 0) g.attackCooldown--;
      if (g.attackFlash > 0) g.attackFlash--;

      // Projectile update
      g.projectiles = g.projectiles.map(p => ({ ...p, x: p.x + p.dx, y: p.y + p.dy, life: p.life - 1 })).filter(p => {
        if (p.life <= 0) return false;
        let hitAny = false;
        g.threats = g.threats.map(t => {
          const d = Math.hypot(p.x - t.x, p.y - t.y);
          if (d < (p.type === 'laser' ? 20 : 14)) {
            hitAny = true;
            const nhp = t.hp - p.damage;
            if (nhp <= 0) {
              sfxKill();
              const cs = CLASS_STATS[char.class.toLowerCase()] ?? CLASS_STATS.corporate;
              const inWaste = !inCityBounds(g.px, g.py);
              const isAnimal = ANIMAL_TYPES.has(t.type);
              let bountyAmt = isAnimal ? 0 : (BOUNTY[t.type] ?? 10);
              if (!isAnimal && cs.wasteBonus && inWaste) bountyAmt = Math.floor(bountyAmt * 1.5);
              if (isAnimal) {
                const drop = ANIMAL_DROPS[Math.floor(Math.random() * ANIMAL_DROPS.length)];
                g.floaters.push({ x: t.x, y: t.y, text: `+ ${drop.name}`, color: '#88cc44', life: 55, maxLife: 55 });
              } else {
                g.floaters.push({ x: t.x, y: t.y, text: `ƒ${bountyAmt.toLocaleString()} LOOT`, color: '#ffdd44', life: 55, maxLife: 55 });
              }
              const earned = THREAT_EXP[t.type] ?? 20;
              g.floaters.push({ x: t.x + 8, y: t.y - 10, text: `+${earned}XP`, color: '#44ffaa', life: 50, maxLife: 50 });
              wsSend({ type: 'pve_kill', exp: earned });
              applyExpGain(g, earned, sfxLevelUp, setLevelUpText, setShowLevelUp, setNarr, setExp, setLevel, setHp);
              g.threatRespawn.push({ ox: t.ox, oy: t.oy, type: t.type, at: g.frame + 420 });
              g.deadBodies.push({ x: t.x, y: t.y, type: t.type, diedAtFrame: g.frame, bounty: bountyAmt, looted: false });
              return null as unknown as Threat;
            }
            sfxHit(); return { ...t, hp: nhp };
          }
          return t;
        }).filter(Boolean) as Threat[];
        if (!hitAny) {
          for (const [, peer] of g.peers) {
            const pd = Math.hypot(p.x - peer.x, p.y - peer.y);
            if (pd < (p.type === 'laser' ? 20 : 14)) {
              hitAny = true;
              wsSend({ type: 'pvp_projectile', targetId: peer.id });
              sfxHit();
              break;
            }
          }
        }
        return !hitAny;
      });

      // Bomb update
      g.bombs = g.bombs.filter(b => {
        b.timer--;
        if (b.timer <= 0) {
          sfxAttack();
          g.threats = g.threats.map(t => {
            const d = Math.hypot(b.x - t.x, b.y - t.y);
            if (d < b.radius) {
              const nhp = t.hp - b.damage;
              if (nhp <= 0) {
                sfxKill();
                const cs = CLASS_STATS[char.class.toLowerCase()] ?? CLASS_STATS.corporate;
                const inWaste = !inCityBounds(g.px, g.py);
                const isAnimal = ANIMAL_TYPES.has(t.type);
                let bountyAmt = isAnimal ? 0 : (BOUNTY[t.type] ?? 10);
                if (!isAnimal && cs.wasteBonus && inWaste) bountyAmt = Math.floor(bountyAmt * 1.5);
                if (isAnimal) {
                  const drop = ANIMAL_DROPS[Math.floor(Math.random() * ANIMAL_DROPS.length)];
                  g.floaters.push({ x: t.x, y: t.y, text: `+ ${drop.name}`, color: '#88cc44', life: 55, maxLife: 55 });
                } else {
                  g.floaters.push({ x: t.x, y: t.y, text: `ƒ${bountyAmt.toLocaleString()} LOOT`, color: '#ffdd44', life: 55, maxLife: 55 });
                }
                const earned = THREAT_EXP[t.type] ?? 20;
                g.floaters.push({ x: t.x + 8, y: t.y - 10, text: `+${earned}XP`, color: '#44ffaa', life: 50, maxLife: 50 });
                wsSend({ type: 'pve_kill', exp: earned });
                applyExpGain(g, earned, sfxLevelUp, setLevelUpText, setShowLevelUp, setNarr, setExp, setLevel, setHp);
                g.threatRespawn.push({ ox: t.ox, oy: t.oy, type: t.type, at: g.frame + 420 });
                g.deadBodies.push({ x: t.x, y: t.y, type: t.type, diedAtFrame: g.frame, bounty: bountyAmt, looted: false });
                return null as unknown as Threat;
              }
              sfxHit(); return { ...t, hp: nhp };
            }
            return t;
          }).filter(Boolean) as Threat[];
          g.floaters.push({ x: b.x, y: b.y, text: '💥 BOOM', color: '#ffcc00', life: 40, maxLife: 40 });
          return false;
        }
        return true;
      });

      g.threatRespawn = g.threatRespawn.filter(r => {
        if (g.frame >= r.at) {
          const distToPlayer = Math.hypot(g.px - r.ox, g.py - r.oy);
          if (distToPlayer > 500) {
            const randOffsetX = (Math.random() - 0.5) * 300;
            const randOffsetY = (Math.random() - 0.5) * 300;
            const sx = r.ox + randOffsetX;
            const sy = r.oy + randOffsetY;
            if (Math.hypot(g.px - sx, g.py - sy) > 400) {
              g.threats.push(mkThreat(sx, sy, r.type));
              return false;
            }
          }
        }
        return true;
      });

      // Wasteland danger: spawn extra hostiles when deep in wasteland (varied locations)
      const nightSpawnActive = g.worldTime >= 19 || g.worldTime < 4;
      const threatCap = nightSpawnActive ? 90 : 60;
      const nightSpawnMult = nightSpawnActive ? 2.0 : 1.0;
      if (g.frame % 300 === 0) {
        const dangerLevel = getWastelandDangerLevel(g.px, g.py, char.class);
        if (dangerLevel > 0.3 && Math.random() < dangerLevel * 0.4 * nightSpawnMult && g.threats.length < threatCap) {
          const spawnDist = 350 + Math.random() * 300;
          const angle = Math.random() * Math.PI * 2;
          const sx = g.px + Math.cos(angle) * spawnDist;
          const sy = g.py + Math.sin(angle) * spawnDist;
          const nearPlayer = Math.hypot(g.px - sx, g.py - sy) < 250;
          if (!nearPlayer) {
            const wasteThreatTypes = ['PROWLER', 'MUTANT', 'RAIDER', 'BORDER_GANG'];
            const tType = wasteThreatTypes[Math.floor(Math.random() * wasteThreatTypes.length)];
            g.threats.push(mkThreat(sx, sy, tType));
          }
        }
      }

      // Gang raid: spawn temporary hostiles at raid location
      for (const raid of activeRaids) {
        if (raid.timer === RAID_DURATION - 1 && g.threats.length < threatCap) {
          const raidThreatCount = Math.floor(2 + raid.intensity * 3);
          for (let ri = 0; ri < raidThreatCount; ri++) {
            const rx = raid.x + (Math.random() - 0.5) * 200;
            const ry = raid.y + (Math.random() - 0.5) * 200;
            g.threats.push(mkThreat(rx, ry, raid.attackerFaction.toUpperCase()));
          }
        }
      }

      // Poison tick
      if (g.poisoned) {
        g.poisonTick++;
        if (g.poisonTick % 60 === 0 && !gamePausedRef.current) { g.hp = Math.max(0, g.hp - 1.5); g.deathReason = 'Died from poison'; setHp(Math.floor(g.hp)); }
      }

      // ── Interior fade transition ──
      if (g.interiorFadeDir !== 0) {
        g.interiorFade += g.interiorFadeDir * 0.04;
        if (g.interiorFade >= 1 && g.interiorFadeDir === 1) {
          g.interiorFade = 1;
          if (g.interiorFadeCallback) { g.interiorFadeCallback(); g.interiorFadeCallback = null; }
        }
        if (g.interiorFade <= 0 && g.interiorFadeDir === -1) {
          g.interiorFade = 0; g.interiorFadeDir = 0;
        }
      }

      // ── Interior movement & collision ──
      if (g.interior && !frozen()) {
        const itr = g.interior;
        const iDef = itr.def;
        const iCol = (ipx: number, ipy: number) => {
          if (ipx < PSIZE + 6 || ipx > iDef.width - PSIZE - 6 || ipy < PSIZE + 20 || ipy > iDef.height - PSIZE) return true;
          for (const obj of iDef.objects) {
            if (obj.type === 'window' || obj.type === 'plant') continue;
            if (ipx + PSIZE > obj.x && ipx - PSIZE < obj.x + obj.w && ipy + PSIZE > obj.y && ipy - PSIZE < obj.y + obj.h) return true;
          }
          return false;
        };
        if (iCol(itr.px, itr.py)) {
          for (let r = 8; r <= 200; r += 8) {
            let escaped = false;
            for (const [ox, oy] of [[0,r],[0,-r],[r,0],[-r,0],[r,r],[-r,r],[r,-r],[-r,-r]]) {
              if (!iCol(itr.px + ox, itr.py + oy)) { itr.px += ox; itr.py += oy; escaped = true; break; }
            }
            if (escaped) break;
          }
        }
        let dx = 0, dy = 0;
        if (g.keys.has('arrowleft')  || g.keys.has('a')) dx -= SPD;
        if (g.keys.has('arrowright') || g.keys.has('d')) dx += SPD;
        if (g.keys.has('arrowup')    || g.keys.has('w')) dy -= SPD;
        if (g.keys.has('arrowdown')  || g.keys.has('s')) dy += SPD;
        if (dx && dy) { dx *= 0.707; dy *= 0.707; }
        let nx = itr.px + dx, ny = itr.py + dy;
        if (iCol(nx, itr.py)) nx = itr.px;
        if (iCol(itr.px, ny)) ny = itr.py;
        itr.px = nx; itr.py = ny;
        if (dx !== 0 || dy !== 0) {
          stepFrame.current++;
          g.walkFrame = (g.walkFrame + 1) % 28;
          if (stepFrame.current % 14 === 0) sfxStep();
        } else { g.walkFrame = 0; }
        const inExitZone = itr.px + PSIZE > iDef.exitX && itr.px - PSIZE < iDef.exitX + iDef.exitW
          && itr.py + PSIZE > iDef.exitY && itr.py - PSIZE < iDef.exitY + iDef.exitH;
        if (inExitZone && g.interiorFadeDir === 0) {
          g.near = '__interior_exit';
          setNearArcadeMachine(null);
        } else {
          g.near = null;
          let foundArcade: string | null = null;
          let foundWC = false;
          for (const obj of iDef.objects) {
            if (obj.type === 'arcade_machine' && obj.gameId) {
              const ocx = obj.x + obj.w / 2, ocy = obj.y + obj.h / 2;
              if (Math.hypot(itr.px - ocx, itr.py - ocy) < 35) {
                foundArcade = obj.gameId;
                break;
              }
            }
            if (obj.type === 'water_cooler') {
              const ocx = obj.x + obj.w / 2, ocy = obj.y + obj.h / 2;
              if (Math.hypot(itr.px - ocx, itr.py - ocy) < 30) foundWC = true;
            }
          }
          setNearArcadeMachine(foundArcade);
          setNearWaterCooler(foundWC);
        }
      }

      const col = (px: number, py: number) => BUILDINGS.some(b => {
        if (!(px + PSIZE > b.x && px - PSIZE < b.x + b.w && py + PSIZE > b.y && py - PSIZE < b.y + b.h)) return false;
        if (b.doors && b.doors.length > 0) {
          for (const d of b.doors) {
            if (px + PSIZE > d.x && px - PSIZE < d.x + d.w && py + PSIZE > d.y && py - PSIZE < d.y + d.h) return false;
          }
        }
        return true;
      });

      if (!g.interior) {

      if (col(g.px, g.py)) {
        for (let r = 8; r <= 200; r += 8) {
          let escaped = false;
          for (const [ox, oy] of [[0,r],[0,-r],[r,0],[-r,0],[r,r],[-r,r],[r,-r],[-r,-r]]) {
            if (!col(g.px + ox, g.py + oy)) { g.px += ox; g.py += oy; escaped = true; break; }
          }
          if (escaped) break;
        }
      }

      if (!frozen() && !g.subwayTransit && !gamePausedRef.current) {
        const shiftHeld = g.keys.has('shift');
        const sprintMult = shiftHeld ? 1.6 : 1;
        const onRoad = isOnRoad(g.px, g.py);
        const baseVehicleSpeed = g.vehicle ? (VEHICLE_SPEED[g.vehicle] ?? 1) : 1;
        const vMult = (g.vehicle ? (onRoad ? baseVehicleSpeed : 1 + (baseVehicleSpeed - 1) * 0.3) : 1) * (g.ownedItems.has('speed_boost') ? 1.1 : 1) * sprintMult;
        let dx = 0, dy = 0;
        if (g.keys.has('arrowleft')  || g.keys.has('a')) { dx -= SPD * vMult; g.moveTarget = null; }
        if (g.keys.has('arrowright') || g.keys.has('d')) { dx += SPD * vMult; g.moveTarget = null; }
        if (g.keys.has('arrowup')    || g.keys.has('w')) { dy -= SPD * vMult; g.moveTarget = null; }
        if (g.keys.has('arrowdown')  || g.keys.has('s')) { dy += SPD * vMult; g.moveTarget = null; }
        if (dx === 0 && dy === 0 && g.moveTarget) {
          const mtDist = Math.hypot(g.moveTarget.x - g.px, g.moveTarget.y - g.py);
          if (mtDist < 8) { g.moveTarget = null; }
          else {
            dx = ((g.moveTarget.x - g.px) / mtDist) * SPD * vMult;
            dy = ((g.moveTarget.y - g.py) / mtDist) * SPD * vMult;
          }
        }
        if (dx && dy) { dx *= 0.707; dy *= 0.707; }
        let nx = g.px + dx, ny = g.py + dy;
        if (col(nx, g.py)) nx = g.px;
        if (col(g.px, ny)) ny = g.py;
        // ── Checkpoint: passport + entry cost system ──
        const crossingSouth = ny > CITY_BOTTOM && g.py <= CITY_BOTTOM;
        const crossingNorth = ny < CITY_TOP && g.py >= CITY_TOP;
        const crossingBorder = crossingSouth || crossingNorth;
        if (crossingBorder) {
          const hasPassport = !!g.passport;
          const CHECKPOINT_FEE = 2000;
          if (!hasPassport) {
            if (crossingSouth) ny = CITY_BOTTOM - PSIZE - 1;
            else ny = CITY_TOP + PSIZE + 1;
            if (g.frame % 120 === 0) setNarr('> CHECKPOINT — You cannot cross without a PASSPORT. Obtain one at PABLO CORP. NORTH or the PRINT SHOP. [ƒ12,000 FIAT]');
          } else if (g.passport === 'full_city') {
            // Corporate full passport — free crossing
          } else if (g.salary >= CHECKPOINT_FEE) {
            g.salary -= CHECKPOINT_FEE; setSalary(g.salary);
            g.floaters.push({ x: g.px, y: g.py - 20, text: `-ƒ${CHECKPOINT_FEE.toLocaleString()} CROSSING FEE`, color: '#ff6644', life: 60, maxLife: 60 });
            setNarr(`> CHECKPOINT — Guard scans your passport. "ƒ${CHECKPOINT_FEE.toLocaleString()} crossing fee deducted. Move along." [−ƒ${CHECKPOINT_FEE.toLocaleString()} FIAT]`);
          } else {
            if (crossingSouth) ny = CITY_BOTTOM - PSIZE - 1;
            else ny = CITY_TOP + PSIZE + 1;
            if (g.frame % 120 === 0) setNarr(`> CHECKPOINT — "Passport valid but crossing fee is ƒ${CHECKPOINT_FEE.toLocaleString()} FIAT. Current balance insufficient. Come back with funds."`);
          }
        }
        // ── Natural border collision: mountains N/S, water W/E ──
        nx = Math.max(BORDER + PSIZE, Math.min(W - BORDER - PSIZE, nx));
        g.px = nx;
        g.py = Math.max(BORDER + PSIZE, Math.min(H - BORDER - PSIZE, ny));
        if (dx !== 0 || dy !== 0) {
          stepFrame.current++;
          g.walkFrame = (g.walkFrame + 1) % 28;
          if (stepFrame.current % 14 === 0) sfxStep();
          if (Math.abs(dx) > Math.abs(dy)) { g.facing = dx > 0 ? 'right' : 'left'; } else { g.facing = dy > 0 ? 'down' : 'up'; }
        } else {
          g.walkFrame = 0;
          g.idleFrame = (g.idleFrame + 1) % 120;
        }
      }
      } // end !g.interior

      for (const t of g.threats) {
        t.timer--;
        const dist = g.interior ? 99999 : Math.hypot(g.px - t.x, g.py - t.y);

        const isMajorThreat = ['RUST_SYNDICATE','VOID_RUNNERS','STATIC_MONKS','EASTERN_BLOC','MUTANT','RAIDER','BORDER_GANG'].includes(t.type);
        const isSpy = t.type === 'SPY';
        const CITY_WALL_NORTH = CITY_TOP + 40;
        const CITY_WALL_SOUTH = CITY_BOTTOM - 40;
        const inCity = t.y > CITY_WALL_NORTH && t.y < CITY_WALL_SOUTH;
        if (isMajorThreat && inCity && t.behavior !== 'HOSTILE') {
          if (t.y < (CITY_TOP + CITY_BOTTOM) / 2) {
            t.y = CITY_WALL_NORTH - 5;
            t.dy = -(Math.abs(t.dy) + 0.2);
          } else {
            t.y = CITY_WALL_SOUTH + 5;
            t.dy = Math.abs(t.dy) + 0.2;
          }
        }
        // SPY cannot enter govt buildings (push away if inside bounding box)
        if (isSpy) {
          for (const b of BUILDINGS) {
            if (GOVT_BIDS.has(b.id) && t.x > b.x && t.x < b.x+b.w && t.y > b.y && t.y < b.y+b.h) {
              const ang = Math.atan2(t.y - (b.y+b.h/2), t.x - (b.x+b.w/2));
              t.x += Math.cos(ang) * 8; t.y += Math.sin(ang) * 8;
            }
          }
        }

        // ── Passive threats — wander only, never aggro ───────────────────────
        const isPassive = PASSIVE_THREATS.has(t.type);
        if (isPassive) {
          t.behavior = 'PATROLLING';
          if (t.timer <= 0) {
            const ang = Math.random() * Math.PI * 2;
            t.dx = Math.cos(ang) * 0.2 * NPC_SPEED_MULT; t.dy = Math.sin(ang) * 0.2 * NPC_SPEED_MULT;
            t.timer = 120 + Math.floor(Math.random() * 160);
          }
          let pnx = t.x + t.dx, pny = t.y + t.dy;
          if (col(pnx, t.y)) pnx = t.x;
          if (col(t.x, pny)) pny = t.y;
          t.x = Math.max(BORDER, Math.min(W - BORDER, pnx));
          t.y = Math.max(BORDER, Math.min(H - BORDER, pny));
          continue;
        }

        // ── Behavior state machine ───────────────────────────────────────────
        t.behaviorTimer--;
        if (t.behaviorTimer <= 0 && t.behavior !== 'HOSTILE') {
          t.behavior = pickBehavior(t.type, g.worldTime);
          t.behaviorTimer = 300 + Math.floor(Math.random() * 300);
        }

        const pClass = char.class.toLowerCase();
        const factionMap: Record<string,string> = { RUST_SYNDICATE:'rust_syndicate', VOID_RUNNERS:'void_runners', STATIC_MONKS:'static_monks', EASTERN_BLOC:'eastern_bloc', MINX_CITY:'minx_city' };
        const hasFaction = t.type in factionMap;
        const threatFactionId = factionMap[t.type] ?? '';
        const playerInThreatZone = hasFaction && GANG_ZONES.some(gz => {
          return (threatFactionId === gz.id || gz.id === threatFactionId + '_frag') && g.px >= gz.x && g.px <= gz.x + gz.w && g.py >= gz.y && g.py <= gz.y + gz.h;
        });

        const isAlly = hasFaction && (GANG_FACTION_ALLIES[pClass] ?? []).includes(threatFactionId);
        const isEnemy = hasFaction && (GANG_FACTION_ENEMIES[pClass] ?? []).includes(threatFactionId);

        let hostilityMult = 1.0;
        if (hasFaction) {
          if (isAlly) {
            hostilityMult = playerInThreatZone ? 0.05 : 0;
          } else if (isEnemy) {
            hostilityMult = playerInThreatZone ? 3.5 : 1.5;
          } else {
            hostilityMult = playerInThreatZone ? 1.0 : 0.3;
          }
        } else {
          if (pClass === 'corporate') hostilityMult = 1.2;
          else if (pClass === 'outlaw') hostilityMult = 0.5;
          else if (pClass === 'replicant') hostilityMult = 0.6;
          else hostilityMult = 0.8;
        }

        const nightActive = g.worldTime >= 19 || g.worldTime < 4;
        const nightAggroBoost = nightActive ? 1.6 : 1.0;
        const nightSpeedBoost = nightActive ? 1.3 : 1.0;
        const baseAggroRange = isSpy ? 55 : (t.type === 'PROWLER' || t.type === 'BORDER_GANG') ? 35 : 45;
        const aggroRange = baseAggroRange * hostilityMult * nightAggroBoost;
        const chaseSpeed  = (isSpy ? 0.55 : (t.type === 'PROWLER' || t.type === 'BORDER_GANG') ? 0.28 : (['RAIDER','EASTERN_BLOC'].includes(t.type) ? 0.32 : 0.25)) * NPC_SPEED_MULT * nightSpeedBoost;
        const wanderSpeed = (isSpy ? 0.2 : 0.1) * NPC_SPEED_MULT;

        const shouldAggro = dist < aggroRange && !npcDialogRef.current && hostilityMult > 0.1;

        if (t.behavior === 'SLEEPING') {
          t.dx = 0; t.dy = 0;
          if (shouldAggro && dist < aggroRange * 0.4) {
            t.behavior = 'HOSTILE'; t.behaviorTimer = 180;
          }
        } else if (t.behavior === 'CAMPING') {
          t.dx *= 0.9; t.dy *= 0.9;
          if (shouldAggro && dist < aggroRange * 0.6) {
            t.behavior = 'HOSTILE'; t.behaviorTimer = 180;
          }
        } else if (t.behavior === 'WORKING') {
          if (t.timer <= 0) {
            const ang = Math.random() * Math.PI * 2;
            t.dx = Math.cos(ang) * wanderSpeed * 0.5; t.dy = Math.sin(ang) * wanderSpeed * 0.5;
            t.timer = 180 + Math.floor(Math.random() * 200);
          }
          if (shouldAggro && dist < aggroRange * 0.7) {
            t.behavior = 'HOSTILE'; t.behaviorTimer = 180;
          }
        } else if (t.behavior === 'SOCIALIZING') {
          const nearby = g.threats.filter(o => o !== t && o.type === t.type && o.behavior === 'SOCIALIZING' && Math.hypot(o.x - t.x, o.y - t.y) < 120);
          if (nearby.length > 0) {
            const cx = nearby.reduce((s, o) => s + o.x, t.x) / (nearby.length + 1);
            const cy = nearby.reduce((s, o) => s + o.y, t.y) / (nearby.length + 1);
            const dToGroup = Math.hypot(cx - t.x, cy - t.y);
            if (dToGroup > 25) {
              const ga = Math.atan2(cy - t.y, cx - t.x);
              t.dx = Math.cos(ga) * wanderSpeed * 0.4;
              t.dy = Math.sin(ga) * wanderSpeed * 0.4;
            } else {
              t.dx *= 0.85; t.dy *= 0.85;
            }
          } else {
            if (t.timer <= 0) {
              const ang = Math.random() * Math.PI * 2;
              t.dx = Math.cos(ang) * wanderSpeed * 0.3; t.dy = Math.sin(ang) * wanderSpeed * 0.3;
              t.timer = 200 + Math.floor(Math.random() * 200);
            }
          }
          if (shouldAggro && dist < aggroRange * 0.7) {
            t.behavior = 'HOSTILE'; t.behaviorTimer = 180;
          }
        } else if (t.behavior === 'HOSTILE' || shouldAggro) {
          t.behavior = 'HOSTILE';
          const ang = Math.atan2(g.py - t.y, g.px - t.x);
          t.dx = Math.cos(ang) * chaseSpeed; t.dy = Math.sin(ang) * chaseSpeed;
          if (dist > aggroRange * 2.5) {
            t.behavior = pickBehavior(t.type, g.worldTime);
            t.behaviorTimer = 200 + Math.floor(Math.random() * 200);
          }
        } else if (t.timer <= 0) {
          const ang = Math.random() * Math.PI * 2;
          t.dx = Math.cos(ang) * wanderSpeed; t.dy = Math.sin(ang) * wanderSpeed;
          t.timer = 180 + Math.floor(Math.random() * 200);
        }

        let nx2 = t.x + t.dx;
        let ny2 = t.y + t.dy;
        if (isMajorThreat && ny2 > CITY_WALL_NORTH && ny2 < CITY_WALL_SOUTH) {
          ny2 = (t.y <= (CITY_TOP + CITY_BOTTOM) / 2) ? CITY_WALL_NORTH : CITY_WALL_SOUTH;
        }
        if (col(nx2, t.y)) nx2 = t.x;
        if (col(t.x, ny2)) ny2 = t.y;
        t.x = Math.max(BORDER, Math.min(W - BORDER, nx2));
        t.y = Math.max(BORDER, Math.min(H - BORDER, ny2));

        if (t.behavior === 'HOSTILE' && dist < 14 && g.invincible === 0 && !npcDialogRef.current && !gamePausedRef.current) {
          const armorMult = g.ownedItems.has('armor_plate') ? 0.85 : 1;
          const baseThreatAtk = THREAT_ATK[t.type] ?? 0.25;
          const cs = CLASS_STATS[char.class.toLowerCase()] ?? CLASS_STATS.corporate;
          const defReduce = Math.max(0.1, 1 - cs.defBonus * 0.02);
          const nightMult = (g.worldTime >= 19 || g.worldTime < 4) ? 1.5 : 1.0;
          g.hp = Math.max(0, g.hp - baseThreatAtk * armorMult * defReduce * nightMult); g.invincible = 70; g.flash = 6; g.deathReason = `Killed by ${t.type.replace(/_/g, ' ')} in combat`;
          if (!g.poisoned && (t.type === 'MUTANT' || t.type === 'STATIC_MONKS') && Math.random() < 0.08) {
            g.poisoned = true; g.poisonTick = 0;
            sfxPoison(); setPoisoned(true); setNarr('> POISONED — HP drains slowly. Find the SAVE POINT or an antidote.');
          }
          if (g.hasDevice && !g.deviceBroken && Math.random() < 0.03) {
            g.deviceDurability = Math.max(0, g.deviceDurability - 35);
            if (g.deviceDurability <= 0) {
              g.deviceBroken = true; setDeviceBroken(true);
              setNarr('> DEVICE DAMAGED — Your personal terminal took a hit. Screen cracked. Find a PUBLIC TERMINAL or repair at CITY CLINIC (ƒ5,000).');
            }
          }
        }
      }

      const MIN_SEP = 18;
      const PUSH_STR = 0.4;
      for (let i = 0; i < g.threats.length; i++) {
        const a = g.threats[i];
        const dpx = g.px - a.x, dpy = g.py - a.y;
        const pdist = Math.sqrt(dpx * dpx + dpy * dpy);
        if (pdist < MIN_SEP) {
          const safeDist = pdist < 0.01 ? 0.01 : pdist;
          const ux = (pdist < 0.01 ? (Math.random() - 0.5) * 2 : dpx / safeDist);
          const uy = (pdist < 0.01 ? (Math.random() - 0.5) * 2 : dpy / safeDist);
          const overlap = (MIN_SEP - safeDist) * 0.5;
          const pushX = -ux * overlap * PUSH_STR;
          const pushY = -uy * overlap * PUSH_STR;
          if (!col(a.x + pushX, a.y)) a.x += pushX;
          if (!col(a.x, a.y + pushY)) a.y += pushY;
          a.x = Math.max(BORDER, Math.min(W - BORDER, a.x));
          a.y = Math.max(BORDER, Math.min(H - BORDER, a.y));
        }
        for (let j = i + 1; j < g.threats.length; j++) {
          const b = g.threats[j];
          const ddx = b.x - a.x, ddy = b.y - a.y;
          const dd = Math.sqrt(ddx * ddx + ddy * ddy);
          if (dd < MIN_SEP) {
            const safeDd = dd < 0.01 ? 0.01 : dd;
            const ux2 = (dd < 0.01 ? (Math.random() - 0.5) * 2 : ddx / safeDd);
            const uy2 = (dd < 0.01 ? (Math.random() - 0.5) * 2 : ddy / safeDd);
            const overlap = (MIN_SEP - safeDd) * 0.5;
            const pxA = -ux2 * overlap * PUSH_STR, pyA = -uy2 * overlap * PUSH_STR;
            const pxB = ux2 * overlap * PUSH_STR, pyB = uy2 * overlap * PUSH_STR;
            if (!col(a.x + pxA, a.y)) a.x += pxA;
            if (!col(a.x, a.y + pyA)) a.y += pyA;
            if (!col(b.x + pxB, b.y)) b.x += pxB;
            if (!col(b.x, b.y + pyB)) b.y += pyB;
            a.x = Math.max(BORDER, Math.min(W - BORDER, a.x));
            a.y = Math.max(BORDER, Math.min(H - BORDER, a.y));
            b.x = Math.max(BORDER, Math.min(W - BORDER, b.x));
            b.y = Math.max(BORDER, Math.min(H - BORDER, b.y));
          }
        }
      }

      // ── PABLO CORP android guard patrol + ACTIVE CITY CLEANUP ─────────────
      if (g.guardCooldowns.length < g.guards.length) {
        g.guardCooldowns = new Array(g.guards.length).fill(0);
      }

      const cityThreats = g.threats.filter(t => !PASSIVE_THREATS.has(t.type) && t.y > CITY_TOP - 80 && t.y < CITY_BOTTOM + 80);
      const playerInCity = g.px >= CITY_LEFT && g.px <= CITY_RIGHT && g.py >= CITY_TOP && g.py <= CITY_BOTTOM;
      if (g.frame % 3000 === 0 && cityThreats.length > 0 && playerInCity) {
        const nearbyThreat = cityThreats.find(t => Math.hypot(g.px - t.x, g.py - t.y) < 600);
        if (nearbyThreat) {
          setNarr(`> PABLO CORP BROADCAST: "Cleanup Unit dispatched to your sector. Citizens are advised to clear the area."`);
        }
      }
      if (g.frame % 5400 === 600 && cityThreats.length > 3 && playerInCity) {
        const nearCityThreats = cityThreats.filter(t => Math.hypot(g.px - t.x, g.py - t.y) < 500);
        if (nearCityThreats.length > 1) {
          setNarr('> PABLO CORP SECURITY: Elevated threat activity detected near your position. Strike teams deployed.');
        }
      }

      for (let gi = 0; gi < g.guards.length; gi++) {
        const guard = g.guards[gi];
        if (g.guardCooldowns[gi] > 0) g.guardCooldowns[gi]--;

        // Restore persisted hunt target if still alive
        let nearestThreat: Threat | null = null, nearestDist = 9999;
        if (guard.huntTarget !== undefined) {
          const prev = g.threats[guard.huntTarget];
          if (prev && !PASSIVE_THREATS.has(prev.type) && prev.y < CITY_THREAT_SCAN_Y) {
            nearestThreat = prev;
            nearestDist = Math.hypot(guard.x - prev.x, guard.y - prev.y);
          } else {
            guard.huntTarget = undefined;
          }
        }

        // Corpo military AI: only engage threats near Pablo Corp employees/assets
        const corpoWorkerNpcs = NPCS.filter(n => n.role === 'corpo_worker');
        for (let ti = 0; ti < g.threats.length; ti++) {
          const t = g.threats[ti];
          if (PASSIVE_THREATS.has(t.type)) continue;
          if (t.y >= CITY_THREAT_SCAN_Y) continue;
          const dToGuard = Math.hypot(guard.x - t.x, guard.y - t.y);
          if (dToGuard >= 400) continue;
          let nearCorpAsset = false;
          for (const cw of corpoWorkerNpcs) {
            const sp = getNpcSchedulePos(cw, g.worldTime ?? 0);
            if (Math.hypot(t.x - sp.x, t.y - sp.y) < 250) { nearCorpAsset = true; break; }
          }
          if (!nearCorpAsset) {
            const pabloTower = BUILDINGS.find(b => b.id === 'pablo_tower');
            if (pabloTower && Math.hypot(t.x - (pabloTower.x + pabloTower.w / 2), t.y - (pabloTower.y + pabloTower.h / 2)) < 350) nearCorpAsset = true;
          }
          if (nearCorpAsset && dToGuard < nearestDist) { nearestThreat = t; nearestDist = dToGuard; guard.huntTarget = ti; }
        }

        if (nearestThreat) {
          // Aggressive pursuit — fast sprint toward target
          const ang = Math.atan2(nearestThreat.y - guard.y, nearestThreat.x - guard.x);
          const spd = (nearestDist > 60 ? 1.5 : 1.1) * NPC_SPEED_MULT;
          guard.x += Math.cos(ang) * spd;
          guard.y += Math.sin(ang) * spd;
          // Engage in melee
          if (nearestDist < 18 && g.guardCooldowns[gi] === 0) {
            g.guardCooldowns[gi] = 28;
            nearestThreat.hp -= 45;
            g.floaters.push({ x: nearestThreat.x, y: nearestThreat.y - 8, text: '[ CORP HIT ]', color: '#4488ff', life: 38, maxLife: 38 });
            if (nearestThreat.hp <= 0) {
              g.floaters.push({ x: nearestThreat.x, y: nearestThreat.y - 16, text: '[ ELIMINATED ]', color: '#00ff41', life: 90, maxLife: 90 });
              g.threatRespawn.push({ ox: nearestThreat.ox, oy: nearestThreat.oy, type: nearestThreat.type, at: g.frame + 1800 });
              g.deadBodies.push({ x: nearestThreat.x, y: nearestThreat.y, type: nearestThreat.type, diedAtFrame: g.frame });
              g.threats = g.threats.filter(t => t !== nearestThreat);
              // Clear all guard hunt references to dead target
              for (const gu of g.guards) { if (gu.huntTarget !== undefined && g.threats[gu.huntTarget] === undefined) gu.huntTarget = undefined; }
              guard.huntTarget = undefined;
              // Occasional cleanup confirmation
              if (Math.random() < 0.35) setNarr('> PABLO CORP: "Target down. Area secured." — Cleanup unit returning to post.');
            }
          }
        } else {
          // No threat found — return to waypoint patrol
          guard.huntTarget = undefined;
          const route = GUARD_ROUTES[gi % GUARD_ROUTES.length];
          const wp = route[guard.wpIdx % route.length];
          const gdx = wp.x - guard.x, gdy = wp.y - guard.y;
          const gdist = Math.hypot(gdx, gdy);
          if (gdist < 4) {
            guard.wpIdx = (guard.wpIdx + 1) % route.length;
          } else {
            guard.x += (gdx / gdist) * 0.55 * NPC_SPEED_MULT;
            guard.y += (gdy / gdist) * 0.55 * NPC_SPEED_MULT;
          }
        }
      }

      // ── Dog companion AI ─────────────────────────────────────────────────
      const dog = g.dogCompanion;
      if (dog.active && !dog.injured) {
        const dDist = Math.hypot(g.px - dog.x, g.py - dog.y);
        let dogTargeting = false;
        if (dog.attackCooldown > 0) dog.attackCooldown--;
        for (const t of g.threats) {
          if (PASSIVE_THREATS.has(t.type)) continue;
          const tDist = Math.hypot(dog.x - t.x, dog.y - t.y);
          if (tDist < DOG_DETECT_RANGE) {
            dogTargeting = true;
            const ang = Math.atan2(t.y - dog.y, t.x - dog.x);
            dog.x += Math.cos(ang) * DOG_SPEED;
            dog.y += Math.sin(ang) * DOG_SPEED;
            if (tDist < 20 && dog.attackCooldown === 0) {
              dog.attackCooldown = DOG_ATTACK_COOLDOWN;
              t.hp -= DOG_ATK;
              const bark = DOG_COMBAT_BARKS[Math.floor(Math.random() * DOG_COMBAT_BARKS.length)];
              g.floaters.push({ x: dog.x, y: dog.y - 12, text: bark, color: '#ffaa44', life: 40, maxLife: 40 });
              const counterDmg = Math.round(((THREAT_HP[t.type] ?? 30) > 30 ? 3 : 2));
              dog.hp = Math.max(0, dog.hp - counterDmg);
              if (dog.hp <= 0) {
                dog.injured = true;
                setDogInjured(true);
                setNarr(`> ${dog.name} is INJURED! Find a Save Crystal or clinic to help your companion recover.`);
              }
              setDogHp(Math.floor(dog.hp));
              if (t.hp <= 0) {
                sfxKill();
                const isAnimal = ANIMAL_TYPES.has(t.type);
                const bountyAmt = isAnimal ? 0 : (BOUNTY[t.type] ?? 10);
                if (isAnimal) {
                  const drop = ANIMAL_DROPS[Math.floor(Math.random() * ANIMAL_DROPS.length)];
                  g.floaters.push({ x: t.x, y: t.y, text: `+ ${drop.name}`, color: '#88cc44', life: 55, maxLife: 55 });
                } else {
                  g.floaters.push({ x: t.x, y: t.y, text: `ƒ${bountyAmt.toLocaleString()} LOOT`, color: '#ffdd44', life: 55, maxLife: 55 });
                }
                const earned = THREAT_EXP[t.type] ?? 20;
                g.floaters.push({ x: t.x + 8, y: t.y - 10, text: `+${earned}XP`, color: '#44ffaa', life: 50, maxLife: 50 });
                applyExpGain(g, earned, sfxLevelUp, setLevelUpText, setShowLevelUp, setNarr, setExp, setLevel, setHp);
                g.threatRespawn.push({ ox: t.ox, oy: t.oy, type: t.type, at: g.frame + 420 });
                g.deadBodies.push({ x: t.x, y: t.y, type: t.type, diedAtFrame: g.frame, bounty: bountyAmt, looted: false });
                g.threats = g.threats.filter(th => th !== t);
                if (dog.dialogueCooldown <= 0 && Math.random() < 0.4) {
                  const line = DOG_KILL_LINES[Math.floor(Math.random() * DOG_KILL_LINES.length)];
                  setNarr(`> [${dog.name}]: "${line}"`);
                  dog.dialogueCooldown = 600;
                }
              }
            }
            break;
          }
        }
        if (!dogTargeting) {
          if (dDist > DOG_FOLLOW_OFFSET) {
            const ang = Math.atan2(g.py - dog.y, g.px - dog.x);
            const spd = dDist > 200 ? DOG_SPEED * 2 : DOG_SPEED;
            dog.x += Math.cos(ang) * spd;
            dog.y += Math.sin(ang) * spd;
          }
          if (dDist > 600) {
            dog.x = g.px + 30;
            dog.y = g.py + 30;
          }
        }
        dog.x = Math.max(BORDER, Math.min(W - BORDER, dog.x));
        dog.y = Math.max(BORDER, Math.min(H - BORDER, dog.y));

        if (dog.dialogueCooldown > 0) dog.dialogueCooldown--;
        const currentZone = inCityBounds(g.px, g.py) ? 'MINX CITY' : 'WASTELAND';
        if (dog.lastZone && dog.lastZone !== currentZone && dog.dialogueCooldown <= 0) {
          const line = DOG_ZONE_LINES[Math.floor(Math.random() * DOG_ZONE_LINES.length)];
          setNarr(`> [${dog.name}]: "${line}"`);
          dog.dialogueCooldown = 900;
        }
        dog.lastZone = currentZone;
        if (dog.dialogueCooldown <= 0 && g.hp < g.maxHp * 0.3 && Math.random() < 0.002) {
          const line = DOG_LOW_HP_LINES[Math.floor(Math.random() * DOG_LOW_HP_LINES.length)];
          setNarr(`> [${dog.name}]: "${line}"`);
          dog.dialogueCooldown = 1200;
        }
        if (dog.dialogueCooldown <= 0 && g.frame % 1200 === 0 && Math.random() < 0.35) {
          const line = DOG_DIALOGUE_LINES[Math.floor(Math.random() * DOG_DIALOGUE_LINES.length)];
          setNarr(`> [${dog.name}]: "${line}"`);
          dog.dialogueCooldown = 1200 + Math.floor(Math.random() * 1200);
        }
      }

      if (g.hp <= 0 && !lastDead) {
        lastDead = true;
        sfxDeath();
        if (g.interior) {
          g.px = g.interior.savedWorldX; g.py = g.interior.savedWorldY;
          g.interior = null; g.interiorFade = 0; g.interiorFadeDir = 0; g.interiorFadeCallback = null;
        }
        if (!g.pvpDeathBodyDropped) {
          g.deadBodies.push({ x: g.px, y: g.py, type: 'PLAYER', diedAtFrame: g.frame });
        }
        g.pvpDeathBodyDropped = false;
        g.diedLastSession = true;
        try { localStorage.setItem('sm_died_last_session', 'true'); } catch {}
        setIsDead(true);
      }

      // ── Dead body cleanup (1 in-game day ≈ 14400 frames, remove when no real players nearby) ──
      const BODY_TTL_FRAMES = 14400;
      g.deadBodies = g.deadBodies.filter(body => {
        if (g.frame - body.diedAtFrame < BODY_TTL_FRAMES) return true;
        const localDist = Math.hypot(g.px - body.x, g.py - body.y);
        if (localDist < 600) return true;
        for (const [, peer] of g.peers) {
          if (Math.hypot(peer.x - body.x, peer.y - body.y) < 600) return true;
        }
        return false;
      });

      // ── HP regen when idle (not in combat) — scaled by location ──
      if (g.hp > 0 && g.hp < g.maxHp && g.frame % 180 === 0) {
        const idleMs = Date.now() - g.lastMoveTime;
        const hasHostileNearby = g.threats.some((t: Threat) => t.behavior === 'HOSTILE' && Math.hypot(g.px - t.x, g.py - t.y) < 200);
        if (!hasHostileNearby && idleMs > 3000) {
          const isIndoorsRegen = !!g.interior;
          const nearBldRegen = g.interior?.bid ?? '';
          const isRestLocRegen = REST_LOCATION_IDS.has(nearBldRegen);
          const regenAmount = isRestLocRegen ? 4 : isIndoorsRegen ? 2 : 1;
          g.hp = Math.min(g.maxHp, g.hp + regenAmount);
          setHp(Math.floor(g.hp));
        }
      }
      if (g.hp > 0 && lastDead) lastDead = false;
      if (g.hp !== lastHp) { lastHp = g.hp; setHp(Math.floor(g.hp)); }
      if (g.salary !== lastSal) { lastSal = g.salary; setSalary(g.salary); }

      // Cinematic camera: smooth zoom lerp toward target
      const zoomLerp = 0.04;

      // Building-entry cinematic zoom transition
      const entryZoom = buildingEntryZoomRef.current;
      if (entryZoom.active) {
        entryZoom.timer--;
        zoomRef.current += (2.2 - zoomRef.current) * 0.08;
        if (entryZoom.timer <= 0) {
          entryZoom.active = false;
          targetZoomRef.current = 1.6;
          if (entryZoom.callback) entryZoom.callback();
          entryZoom.callback = null;
        }
      } else {
        zoomRef.current += (targetZoomRef.current - zoomRef.current) * zoomLerp;
      }

      // Cinematic zoom effects: combat zoom-in, building approach zoom-in
      if (!entryZoom.active) {
        let cinematicZoomBoost = 0;
        const hasHostileNearby = g.threats.some((t: Threat) => t.behavior === 'HOSTILE' && Math.hypot(g.px - t.x, g.py - t.y) < 150);
        if (hasHostileNearby) cinematicZoomBoost = 0.15;
        if (g.near) cinematicZoomBoost = Math.max(cinematicZoomBoost, 0.2);
        const effectiveTargetZoom = targetZoomRef.current + cinematicZoomBoost;
        zoomRef.current += (effectiveTargetZoom - zoomRef.current) * zoomLerp;
      }

      // Look-ahead: camera leads slightly in the movement direction
      let dx2 = 0, dy2 = 0;
      if (g.keys.has('arrowleft') || g.keys.has('a')) dx2 = -1;
      if (g.keys.has('arrowright') || g.keys.has('d')) dx2 = 1;
      if (g.keys.has('arrowup') || g.keys.has('w')) dy2 = -1;
      if (g.keys.has('arrowdown') || g.keys.has('s')) dy2 = 1;
      const lookAheadDist = 40;
      const laLerp = 0.06;
      cameraLookAheadRef.current.x += (dx2 * lookAheadDist - cameraLookAheadRef.current.x) * laLerp;
      cameraLookAheadRef.current.y += (dy2 * lookAheadDist - cameraLookAheadRef.current.y) * laLerp;

      // During building entry, pan camera toward building entrance
      let focusX = g.px + cameraLookAheadRef.current.x;
      let focusY = g.py + cameraLookAheadRef.current.y;
      if (entryZoom.active) {
        const blend = 1 - (entryZoom.timer / 45);
        focusX += (entryZoom.targetX - focusX) * blend * 0.5;
        focusY += (entryZoom.targetY - focusY) * blend * 0.5;
      }

      const camTargetX = focusX - cw / 2;
      const camTargetY = focusY - ch / 2;
      g.cam.x += (Math.max(0, Math.min(W - cw, camTargetX)) - g.cam.x) * 0.08;
      g.cam.y += (Math.max(0, Math.min(H - ch, camTargetY)) - g.cam.y) * 0.08;
      const ox = -g.cam.x, oy = -g.cam.y;

      ctx.save();
      ctx.scale(zoom, zoom);

      const _wt = g.worldTime;
      const _isNight = _wt >= 19 || _wt < 4;
      const _tileHash = (x: number, y: number) => {
        const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        return h - Math.floor(h);
      };

      // ── Interior rendering ──────────────────────────────────────────────────
      if (g.interior) {
        ctx.restore();
        ctx.save();
        const icw = logW, ich = logH;
        const itr = g.interior;
        const iDef = itr.def;
        const iScale = Math.min(icw / (iDef.width + 80), ich / (iDef.height + 80));
        const iox = (icw - iDef.width * iScale) / 2;
        const ioy = (ich - iDef.height * iScale) / 2;
        ctx.translate(iox, ioy);
        ctx.scale(iScale, iScale);
        ctx.fillStyle = '#1a1208';
        ctx.fillRect(-40, -40, iDef.width + 80, iDef.height + 80);

        ctx.fillStyle = iDef.floorColor;
        ctx.fillRect(0, 0, iDef.width, iDef.height);

        for (let tx = 0; tx < iDef.width; tx += INTERIOR_TILE) {
          for (let ty = 0; ty < iDef.height; ty += INTERIOR_TILE) {
            const fh = _tileHash(tx + iDef.width, ty + iDef.height);
            if (fh > 0.6) {
              ctx.fillStyle = 'rgba(255,255,255,0.03)';
              ctx.fillRect(tx, ty, INTERIOR_TILE, INTERIOR_TILE);
            } else if (fh < 0.2) {
              ctx.fillStyle = 'rgba(0,0,0,0.04)';
              ctx.fillRect(tx, ty, INTERIOR_TILE, INTERIOR_TILE);
            }
          }
        }
        ctx.strokeStyle = 'rgba(80,70,50,0.15)';
        ctx.lineWidth = 0.3;
        for (let tx = 0; tx < iDef.width; tx += INTERIOR_TILE) {
          ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx, iDef.height); ctx.stroke();
        }
        for (let ty = 0; ty < iDef.height; ty += INTERIOR_TILE) {
          ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(iDef.width, ty); ctx.stroke();
        }

        ctx.fillStyle = 'rgb(90,75,55)';
        ctx.fillRect(0, 0, iDef.width, 20);
        ctx.fillStyle = 'rgb(80,68,48)';
        ctx.fillRect(0, 0, 6, iDef.height);
        ctx.fillRect(iDef.width - 6, 0, 6, iDef.height);
        ctx.fillStyle = 'rgb(70,60,42)';
        ctx.fillRect(0, iDef.height - 4, iDef.width, 4);

        ctx.strokeStyle = 'rgb(110,95,65)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0, 0, iDef.width, iDef.height);

        for (const obj of iDef.objects) {
          const osx = obj.x, osy = obj.y;

          if (obj.type === 'window') {
            ctx.fillStyle = 'rgb(60,50,40)';
            ctx.fillRect(osx, osy, obj.w, obj.h);
            ctx.fillStyle = _isNight ? 'rgb(20,30,50)' : 'rgb(120,160,210)';
            ctx.fillRect(osx + 2, osy + 2, obj.w - 4, obj.h - 4);
            if (!_isNight) {
              ctx.fillStyle = 'rgba(200,220,255,0.3)';
              ctx.fillRect(osx + 3, osy + 3, (obj.w - 6) / 3, (obj.h - 6) / 2);
            }
            ctx.fillStyle = 'rgb(50,40,30)';
            ctx.fillRect(osx + obj.w / 2 - 0.5, osy, 1, obj.h);
            ctx.fillRect(osx, osy + obj.h / 2 - 0.5, obj.w, 1);
          } else if (obj.type === 'medical_bed') {
            ctx.fillStyle = 'rgb(200,210,220)';
            ctx.fillRect(osx, osy, obj.w, obj.h);
            ctx.fillStyle = 'rgb(220,230,240)';
            ctx.fillRect(osx + 3, osy + 3, obj.w - 6, obj.h - 6);
            ctx.fillStyle = 'rgb(180,200,210)';
            ctx.fillRect(osx + 3, osy + 3, obj.w - 6, 6);
            const blink = Math.sin(g.frame * 0.06 + obj.x * 0.1) > 0.5;
            ctx.fillStyle = blink ? 'rgb(0,220,80)' : 'rgb(0,120,50)';
            ctx.fillRect(osx + obj.w - 6, osy + 2, 4, 4);
          } else if (obj.type === 'bed') {
            ctx.fillStyle = 'rgb(110,75,45)';
            ctx.fillRect(osx, osy, obj.w, obj.h);
            ctx.fillStyle = 'rgb(90,60,35)';
            ctx.fillRect(osx, osy, obj.w, 3);
            ctx.fillRect(osx, osy + obj.h - 3, obj.w, 3);
            ctx.fillStyle = 'rgb(80,110,140)';
            ctx.fillRect(osx + 3, osy + 4, obj.w - 6, obj.h - 10);
            ctx.fillStyle = 'rgb(200,190,170)';
            ctx.fillRect(osx + 3, osy + 4, obj.w - 6, 5);
          } else if (obj.type === 'terminal') {
            ctx.fillStyle = 'rgb(50,50,55)';
            ctx.fillRect(osx, osy, obj.w, obj.h);
            const tp = Math.sin(g.frame * 0.04 + obj.y * 0.05) * 0.3 + 0.7;
            ctx.fillStyle = `rgb(0,${Math.floor(200 * tp)},${Math.floor(60 * tp)})`;
            ctx.fillRect(osx + 3, osy + 3, obj.w - 6, obj.h - 10);
            const scanY = (g.frame * 0.5) % (obj.h - 10);
            ctx.fillStyle = 'rgba(0,255,65,0.15)';
            ctx.fillRect(osx + 3, osy + 3 + scanY, obj.w - 6, 2);
            ctx.fillStyle = 'rgb(40,40,45)';
            ctx.fillRect(osx + 2, osy + obj.h - 5, obj.w - 4, 3);
          } else if (obj.type === 'equipment') {
            ctx.fillStyle = 'rgb(70,75,80)';
            ctx.fillRect(osx, osy, obj.w, obj.h);
            const ep = 0.5 + Math.sin(g.frame * 0.05 + obj.x * 0.03) * 0.3;
            ctx.fillStyle = `rgb(0,${Math.floor(180 * ep)},${Math.floor(130 * ep)})`;
            ctx.fillRect(osx + 3, osy + 3, obj.w - 6, 5);
            ctx.fillStyle = 'rgb(60,65,70)';
            ctx.fillRect(osx + 3, osy + 10, obj.w - 6, obj.h - 13);
            ctx.fillStyle = 'rgb(180,180,180)';
            ctx.fillRect(osx + obj.w / 2 - 3, osy + 12, 6, 2);
          } else if (obj.type === 'couch') {
            ctx.fillStyle = 'rgb(140,90,50)';
            ctx.fillRect(osx, osy, obj.w, obj.h);
            ctx.fillStyle = 'rgb(160,105,60)';
            ctx.fillRect(osx + 4, osy + 4, obj.w - 8, obj.h - 6);
            ctx.fillStyle = 'rgb(130,85,45)';
            ctx.fillRect(osx, osy, 4, obj.h);
            ctx.fillRect(osx + obj.w - 4, osy, 4, obj.h);
            ctx.fillStyle = 'rgb(120,75,40)';
            ctx.fillRect(osx, osy, obj.w, 3);
          } else if (obj.type === 'vending_machine') {
            ctx.fillStyle = 'rgb(60,70,80)';
            ctx.fillRect(osx, osy, obj.w, obj.h);
            const vp = Math.sin(g.frame * 0.03 + obj.x * 0.07) * 0.2 + 0.8;
            ctx.fillStyle = `rgb(0,${Math.floor(180 * vp)},${Math.floor(100 * vp)})`;
            ctx.fillRect(osx + 3, osy + 3, obj.w - 6, obj.h * 0.35);
            ctx.fillStyle = 'rgb(50,55,60)';
            ctx.fillRect(osx + 3, osy + obj.h * 0.45, obj.w - 6, obj.h * 0.45);
            for (let vi = 0; vi < 3; vi++) {
              ctx.fillStyle = ['rgb(220,50,50)', 'rgb(50,150,220)', 'rgb(50,200,80)'][vi];
              ctx.fillRect(osx + 5 + vi * ((obj.w - 10) / 3), osy + obj.h * 0.5, (obj.w - 10) / 3 - 2, 6);
            }
          } else if (obj.type === 'filing_cabinet') {
            ctx.fillStyle = 'rgb(100,100,110)';
            ctx.fillRect(osx, osy, obj.w, obj.h);
            for (let i = 0; i < 3; i++) {
              ctx.fillStyle = 'rgb(90,90,100)';
              ctx.fillRect(osx + 2, osy + 3 + i * (obj.h / 3), obj.w - 4, obj.h / 3 - 4);
              ctx.fillStyle = 'rgb(180,180,180)';
              ctx.fillRect(osx + obj.w / 2 - 3, osy + 5 + i * (obj.h / 3), 6, 2);
            }
          } else if (obj.type === 'water_cooler') {
            ctx.fillStyle = 'rgb(200,200,210)';
            ctx.fillRect(osx, osy + obj.h * 0.4, obj.w, obj.h * 0.6);
            ctx.fillStyle = 'rgb(100,170,220)';
            ctx.fillRect(osx + 2, osy, obj.w - 4, obj.h * 0.45);
            ctx.fillStyle = 'rgba(180,220,255,0.4)';
            ctx.fillRect(osx + 3, osy + 2, (obj.w - 6) / 3, obj.h * 0.2);
          } else if (obj.type === 'whiteboard') {
            ctx.fillStyle = 'rgb(230,230,235)';
            ctx.fillRect(osx, osy, obj.w, obj.h);
            ctx.strokeStyle = 'rgb(180,180,185)';
            ctx.lineWidth = 1;
            ctx.strokeRect(osx, osy, obj.w, obj.h);
            ctx.strokeStyle = 'rgb(200,60,60)';
            ctx.lineWidth = 0.8;
            for (let i = 1; i < 4; i++) {
              ctx.beginPath(); ctx.moveTo(osx + 6, osy + i * (obj.h / 4)); ctx.lineTo(osx + obj.w - 6, osy + i * (obj.h / 4)); ctx.stroke();
            }
            ctx.fillStyle = 'rgb(40,80,180)';
            ctx.fillRect(osx + 8, osy + 4, obj.w * 0.3, 2);
            ctx.fillRect(osx + 6, osy + 8, obj.w * 0.5, 2);
          } else if (obj.type === 'tv_screen') {
            ctx.fillStyle = 'rgb(30,30,35)';
            ctx.fillRect(osx, osy, obj.w, obj.h);
            const tp2 = Math.sin(g.frame * 0.05 + obj.x * 0.04) * 0.2 + 0.7;
            ctx.fillStyle = `rgb(${Math.floor(30 * tp2)},${Math.floor(100 * tp2)},${Math.floor(200 * tp2)})`;
            ctx.fillRect(osx + 2, osy + 2, obj.w - 4, obj.h - 6);
            const scanY2 = (g.frame % 60) / 60 * (obj.h - 6);
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fillRect(osx + 2, osy + 2 + scanY2, obj.w - 4, 2);
            ctx.fillStyle = 'rgb(40,40,45)';
            ctx.fillRect(osx + obj.w / 2 - 4, osy + obj.h - 3, 8, 3);
          } else if (obj.type === 'security_gate') {
            ctx.fillStyle = 'rgb(80,80,85)';
            ctx.fillRect(osx, osy, obj.w, obj.h);
            ctx.strokeStyle = 'rgb(200,180,0)';
            ctx.lineWidth = 1;
            ctx.strokeRect(osx + 1, osy + 1, obj.w - 2, obj.h - 2);
            const blink2 = g.frame % 40 < 20;
            ctx.fillStyle = blink2 ? 'rgb(200,180,0)' : 'rgb(220,40,40)';
            ctx.fillRect(osx + obj.w / 2 - 2, osy + 2, 4, 4);
          } else if (obj.type === 'photocopier') {
            ctx.fillStyle = 'rgb(190,190,195)';
            ctx.fillRect(osx, osy, obj.w, obj.h);
            ctx.fillStyle = 'rgb(170,170,175)';
            ctx.fillRect(osx + 2, osy + 2, obj.w - 4, obj.h * 0.4);
            const cl = g.frame % 80 < 10;
            if (cl) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(osx + 4, osy + 4, obj.w - 8, 3); }
            ctx.fillStyle = 'rgb(60,60,65)';
            ctx.fillRect(osx + obj.w - 8, osy + obj.h * 0.5, 5, 3);
          } else if (obj.type === 'bookshelf') {
            ctx.fillStyle = 'rgb(100,70,40)';
            ctx.fillRect(osx, osy, obj.w, obj.h);
            const bookColors = ['rgb(160,50,40)', 'rgb(40,70,150)', 'rgb(50,130,60)', 'rgb(150,120,40)', 'rgb(120,50,100)'];
            for (let i = 0; i < 5; i++) {
              ctx.fillStyle = bookColors[i % bookColors.length];
              const bw = (obj.w - 6) / 5;
              ctx.fillRect(osx + 3 + i * bw, osy + 3, bw - 1, obj.h - 6);
            }
            ctx.fillStyle = 'rgb(90,60,35)';
            ctx.fillRect(osx, osy + obj.h / 2, obj.w, 2);
          } else if (obj.type === 'flag') {
            ctx.fillStyle = 'rgb(140,100,30)';
            ctx.fillRect(osx + obj.w / 2 - 1, osy, 2, obj.h);
            const wave = Math.sin(g.frame * 0.04 + obj.y * 0.1) * 3;
            ctx.fillStyle = 'rgb(200,160,40)';
            ctx.fillRect(osx + obj.w / 2 + 1, osy + 4 + wave, obj.w / 2 - 4, obj.h * 0.35);
            ctx.fillStyle = 'rgb(180,140,30)';
            ctx.fillRect(osx + obj.w / 2 + 1, osy + 4 + wave + obj.h * 0.15, obj.w / 2 - 4, obj.h * 0.1);
          } else if (obj.type === 'arcade_machine') {
            ctx.fillStyle = 'rgb(20,15,30)';
            ctx.fillRect(osx, osy, obj.w, obj.h);
            ctx.fillStyle = 'rgb(40,30,50)';
            ctx.fillRect(osx + 2, osy + 2, obj.w - 4, obj.h * 0.55);
            const ap = Math.sin(g.frame * 0.06 + (obj.gameId ?? '').length * 1.5) * 0.3 + 0.7;
            const gc = obj.color ?? 'rgba(0,255,65,.5)';
            ctx.fillStyle = gc.replace(/[\d.]+\)$/, `${ap})`);
            ctx.fillRect(osx + 4, osy + 4, obj.w - 8, obj.h * 0.5 - 4);
            const scanY3 = (g.frame * 0.8 + (obj.gameId ?? '').length * 20) % (obj.h * 0.5 - 4);
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillRect(osx + 4, osy + 4 + scanY3, obj.w - 8, 2);
            ctx.fillStyle = 'rgb(30,25,35)';
            ctx.fillRect(osx + 6, osy + obj.h * 0.6, obj.w - 12, obj.h * 0.15);
            ctx.fillStyle = 'rgb(255,50,50)';
            ctx.beginPath(); ctx.arc(osx + obj.w * 0.35, osy + obj.h * 0.65 + 3, 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgb(50,150,255)';
            ctx.beginPath(); ctx.arc(osx + obj.w * 0.65, osy + obj.h * 0.65 + 3, 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgb(60,50,70)';
            ctx.fillRect(osx + 3, osy + obj.h * 0.8, obj.w - 6, obj.h * 0.2);
            ctx.fillStyle = 'rgb(50,40,55)';
            ctx.fillRect(osx + obj.w * 0.3, osy + obj.h - 4, obj.w * 0.4, 4);
          } else if (obj.type === 'portrait') {
            ctx.fillStyle = 'rgb(160,130,70)';
            ctx.fillRect(osx, osy, obj.w, obj.h);
            ctx.fillStyle = 'rgb(100,75,50)';
            ctx.fillRect(osx + 2, osy + 2, obj.w - 4, obj.h - 4);
            ctx.fillStyle = 'rgb(180,150,110)';
            ctx.fillRect(osx + 4, osy + 4, obj.w - 8, obj.h - 8);
          } else {
            ctx.fillStyle = obj.color ?? 'rgb(80,70,55)';
            ctx.fillRect(osx, osy, obj.w, obj.h);
            ctx.strokeStyle = 'rgb(100,85,60)';
            ctx.lineWidth = 0.8;
            ctx.strokeRect(osx, osy, obj.w, obj.h);
          }

          if (obj.label) {
            ctx.fillStyle = 'rgb(220,210,190)';
            ctx.font = '6px "Share Tech Mono"';
            ctx.textAlign = 'center';
            ctx.fillText(obj.label, osx + obj.w / 2, osy + obj.h / 2 + 3);
          }
        }

        const exX = iDef.exitX, exY = iDef.exitY;
        const exitPulse = 0.4 + Math.sin(g.frame * 0.06) * 0.3;
        ctx.fillStyle = `rgba(0,255,65,${exitPulse * 0.15})`;
        ctx.fillRect(exX, exY, iDef.exitW, iDef.exitH);
        ctx.strokeStyle = `rgba(0,255,65,${exitPulse * 0.6})`;
        ctx.lineWidth = 1; ctx.strokeRect(exX, exY, iDef.exitW, iDef.exitH);
        ctx.fillStyle = `rgba(0,255,65,${exitPulse * 0.8})`;
        ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'center';
        ctx.fillText('EXIT', exX + iDef.exitW / 2, exY + iDef.exitH / 2 + 3);

        for (const obj of iDef.objects) {
          if (obj.type === 'arcade_machine' && obj.gameId) {
            const ocx = obj.x + obj.w / 2, ocy = obj.y + obj.h / 2;
            if (Math.hypot(itr.px - ocx, itr.py - ocy) < 35) {
              ctx.fillStyle = g.blink ? 'rgba(255,0,255,.9)' : 'rgba(255,0,255,.3)';
              ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center';
              ctx.fillText(`[E] PLAY — 1 FIAT`, ocx, obj.y - 6);
            }
          }
          if (obj.type === 'water_cooler') {
            const ocx = obj.x + obj.w / 2, ocy = obj.y + obj.h / 2;
            if (Math.hypot(itr.px - ocx, itr.py - ocy) < 30) {
              ctx.fillStyle = g.blink ? 'rgba(0,200,255,.9)' : 'rgba(0,200,255,.3)';
              ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center';
              ctx.fillText('[E] READ NEWSPAPER', ocx, obj.y - 6);
            }
          }
        }

        if (g.near === '__interior_exit') {
          ctx.fillStyle = g.blink ? 'rgba(0,255,65,.9)' : 'rgba(0,255,65,.3)';
          ctx.font = '9px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText('[E] EXIT', exX + iDef.exitW / 2, exY - 6);
        }

        const ppx = itr.px, ppy = itr.py;
        const intNpcs = INTERIOR_NPCS[itr.bid] ?? [];
        for (const inpc of intNpcs) {
          const inx = inpc.x, iny = inpc.y;
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.beginPath(); ctx.ellipse(inx, iny + 7, 5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#1a1a2a'; ctx.fillRect(inx - 3, iny + 2, 3, 5); ctx.fillRect(inx, iny + 2, 3, 5);
          ctx.fillStyle = '#2a2a3a'; ctx.fillRect(inx - 5, iny - 5, 10, 7);
          ctx.fillStyle = '#cc0000'; ctx.fillRect(inx - 1, iny - 3, 2, 4);
          ctx.fillStyle = '#d4a07a'; ctx.beginPath(); ctx.arc(inx, iny - 9, 3.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#111'; ctx.fillRect(inx - 2, iny - 10, 1, 1); ctx.fillRect(inx + 1, iny - 10, 1, 1);
          ctx.fillStyle = '#1a1a2a'; ctx.fillRect(inx - 4, iny - 13, 8, 3);
          ctx.fillStyle = 'rgba(255,200,60,.6)'; ctx.font = '5px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText(inpc.name, inx, iny - 16);
          ctx.fillStyle = 'rgba(255,200,60,.35)'; ctx.font = '4px "Share Tech Mono"';
          ctx.fillText(inpc.role, inx, iny - 11);
          const playerDist = Math.hypot(ppx - inx, ppy - iny);
          if (playerDist < 30) {
            ctx.fillStyle = g.blink ? 'rgba(255,200,60,.9)' : 'rgba(255,200,60,.4)';
            ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'center';
            ctx.fillText('[E] TALK', inx, iny + 16);
            const dLine = inpc.dialogue[Math.floor(g.frame / 300) % inpc.dialogue.length];
            ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '5px "Share Tech Mono"';
            ctx.fillText(`"${dLine}"`, inx, iny + 22);
          }
        }

        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath(); ctx.ellipse(ppx, ppy + 5, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#335533'; ctx.fillRect(ppx - 3, ppy + 1, 3, 5); ctx.fillRect(ppx, ppy + 1, 3, 5);
        ctx.fillStyle = '#446644'; ctx.fillRect(ppx - 5, ppy - 6, 10, 7);
        ctx.fillStyle = '#d4906a'; ctx.beginPath(); ctx.arc(ppx, ppy - 10, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111'; ctx.fillRect(ppx - 2, ppy - 11, 1, 1); ctx.fillRect(ppx + 1, ppy - 11, 1, 1);

        ctx.fillStyle = iDef.accentColor;
        ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center';
        ctx.fillText(iDef.label, iDef.width / 2, -8);

        if (iDef.ambientText) {
          ctx.fillStyle = 'rgba(0,255,65,.2)';
          ctx.font = '6px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText(iDef.ambientText, iDef.width / 2, iDef.height + 14);
        }

        if (g.interiorFade > 0) {
          ctx.fillStyle = `rgba(0,0,0,${g.interiorFade})`;
          ctx.fillRect(-40, -40, iDef.width + 80, iDef.height + 80);
        }

        ctx.restore();
        animRef.current = requestAnimationFrame(loop);
        return;
      }

      // Proximity check — buildings
      let nb: string | null = null;
      for (const b of BUILDINGS) { if (Math.hypot(g.px - (b.x + b.w / 2), g.py - (b.y + b.h / 2)) < RANGE + (b.id === 'pablo_tower' ? 40 : 0)) { nb = b.id; break; } }
      g.near = nb;
      if (nb !== lastNear) {
        if (lastNear && RADIO_BUILDINGS.has(lastNear) && (!nb || !RADIO_BUILDINGS.has(nb)) && !g.hasRadioImplant) {
          hideRadio();
        }
        lastNear = nb; setNear(nb);
        if (nb) {
          const b = BUILDINGS.find(b => b.id === nb);
          const lk = g.locks.get(nb);
          if (nb === 'pablo_tower') setNarr('> SHADOW TOWER — The city trembles at its shadow. [E] to approach.');
          else if (lk?.ownerName) {
            const who = lk.company ? `${lk.ownerName} / ${lk.company}` : lk.ownerName;
            const msg = lk.message ? ` "${lk.message}"` : '';
            setNarr(`> ${b?.label} [LOCKED by ${who}]${msg} — [E] to attempt entry.`);
          }
          else {
            const cost = BUILDING_COST[nb];
            const costLabel = BUILDING_COST_LABEL[nb];
            if (cost && cost > 0) setNarr(`> ${b?.label} [${costLabel} FIAT] — press [E] to enter. Earn FIAT to access.`);
            else if (costLabel === 'FREE') setNarr(`> ${b?.label} [FREE] — press [E] to enter.`);
            else if (costLabel === 'SHOP') setNarr(`> ${b?.label} [SHOP] — press [E] to browse. FIAT required to purchase.`);
            else setNarr(`> ${b?.label} — press [E] to enter.`);
          }
        }
      }
      // Proximity check — NPCs (only when no building nearby)
      let nn: number | null = null;
      if (!nb) { for (let i = 0; i < NPCS.length; i++) { const sp = getNpcSchedulePos(NPCS[i], g.worldTime ?? 0); if (Math.hypot(g.px - sp.x, g.py - sp.y) < NPC_RANGE) { nn = i; break; } } }
      g.nearNpc = nn;
      if (nn !== lastNearNpc) {
        lastNearNpc = nn; setNearNpc(nn);
        if (nn !== null && !nb) setNarr(`> ${NPCS[nn].name} — press [E] to listen.`);
      }

      // Proximity check — enemies (show [F] attack prompt if close enough)
      if (!nb && nn === null) {
        const nearStray = !g.dogCompanion.active ? g.threats.find(t => t.type === 'STRAY_DOG' && Math.hypot(g.px - t.x, g.py - t.y) < 60) : null;
        if (nearStray) {
          setNarr('> STRAY DOG — Wary eyes. Wagging tail. Press [E] to adopt this companion.');
        } else {
          const nearLoot = g.deadBodies.find(b => !b.looted && b.type !== 'PLAYER' && (b.bounty ?? 0) > 0 && Math.hypot(g.px - b.x, g.py - b.y) < 40);
          if (nearLoot) {
            setNarr(`> LOOTABLE BODY [${nearLoot.type.replace(/_/g, ' ')}] — ƒ${(nearLoot.bounty ?? 0).toLocaleString()} FIAT. Press [E] or [Click] to loot.`);
          } else {
            const nearEnemy = g.threats.find(t => Math.hypot(g.px - t.x, g.py - t.y) < 90);
            if (nearEnemy) {
              const typeLabel = nearEnemy.type.replace(/_/g, ' ');
              const isAnimalE = ANIMAL_TYPES.has(nearEnemy.type);
              const bountyLabel = isAnimalE ? 'Drops: FOOD ITEMS' : `Bounty: ƒ${(BOUNTY[nearEnemy.type] ?? 1000).toLocaleString()}`;
              setNarr(`> ${typeLabel} [HP: ${Math.floor(nearEnemy.hp)}/${nearEnemy.maxHp}] — [Space] melee · [Click] shoot. ${bountyLabel}.`);
            }
          }
        }
      }

      // Proximity check — Billboards
      let nbb: string | null = null;
      if (!nb && nn === null) {
        for (const bb of BILLBOARDS) {
          if (Math.hypot(g.px - bb.x, g.py - bb.y) < 80) { nbb = bb.locationId; break; }
        }
      }
      g.nearBillboard = nbb;
      if (nbb !== lastNearBb) {
        lastNearBb = nbb; setNearBillboard(nbb);
        if (nbb) {
          const bb = BILLBOARDS.find(b => b.locationId === nbb);
          if (bb) setNarr(`> ${bb.label} — press [E] to view billboard marketplace.`);
        }
      }

      // Proximity check — Manholes (sewer system)
      let nmh: number | null = null;
      if (!nb && nn === null && !g.inSewer) {
        for (let mi = 0; mi < MANHOLES.length; mi++) {
          if (Math.hypot(g.px - MANHOLES[mi].x, g.py - MANHOLES[mi].y) < MANHOLE_RANGE) { nmh = mi; break; }
        }
      }
      if (nmh !== g.nearManhole) {
        g.nearManhole = nmh;
        if (nmh !== null) setNarr('> MANHOLE — Sewer access point. Press [E] to descend into the sewer network.');
      }
      if (g.sewerExitTimer > 0) g.sewerExitTimer--;

      if (g.frame % 15 === 0) {
        let nearbyCount = 0;
        for (let i = 0; i < NPCS.length; i++) {
          const sp = getNpcSchedulePos(NPCS[i], g.worldTime ?? 0);
          if (Math.hypot(g.px - sp.x, g.py - sp.y) < 600) nearbyCount++;
        }
        updateCrowdMurmurVolume(nearbyCount);
      }

      if (g.frame % 20 === 0) {
        const convos = activeConvosRef.current;
        let foundLine: string | null = null;
        for (let ci = convos.length - 1; ci >= 0; ci--) {
          const prevLine = convos[ci].currentLine;
          const ev = tickConversationEvent(convos[ci], 0.33);
          convos[ci] = ev;
          if (ev.finished) { convos.splice(ci, 1); continue; }
          if (isWithinEarshot(g.px, g.py, ev.x, ev.y)) {
            const activeLine = ev.lines[ev.currentLine];
            if (activeLine) {
              foundLine = `[${activeLine.speaker}] "${activeLine.text}"`;
              if (ev.currentLine !== prevLine) {
                // voice removed — browser TTS sounds robotic
              }
            }
          }
        }
        setOverheardLine(foundLine);
      }

      if (g.frame % 300 === 0 && !g.interior && activeConvosRef.current.length < 3) {
        const pedestrians = NPCS.filter(n => n.role === 'pedestrian' || n.role === 'corpo_worker' || n.role === 'homeless');
        for (const officer of NPCS) {
          if (officer.role !== 'police' && officer.role !== 'corpo_military') continue;
          const oPos = getNpcSchedulePos(officer, g.worldTime ?? 0);
          const distToPlayer = Math.hypot(g.px - oPos.x, g.py - oPos.y);
          const pabloTwr = BUILDINGS.find(b => b.id === 'pablo_tower');
          const nearCorpZone = officer.role !== 'corpo_military' || (pabloTwr && Math.hypot(oPos.x - (pabloTwr.x + pabloTwr.w / 2), oPos.y - (pabloTwr.y + pabloTwr.h / 2)) < 400) || NPCS.some(cw => cw.role === 'corpo_worker' && Math.hypot(oPos.x - getNpcSchedulePos(cw, g.worldTime ?? 0).x, oPos.y - getNpcSchedulePos(cw, g.worldTime ?? 0).y) < 250);
          if (distToPlayer < 150 && Math.random() < 0.15 && nearCorpZone) {
            const playerStopLines: ConversationLine[] = officer.role === 'police'
              ? [
                  { speaker: officer.name, text: 'You. Stop right there. Identification.', gender: officer.gender as 'm' | 'f' },
                  { speaker: 'YOU', text: '...', gender: 'm' },
                  { speaker: officer.name, text: officer.personality === 'corrupt_bureaucratic' ? 'These papers look... negotiable. ƒ200 and we forget this happened.' : 'Move along. Quickly.', gender: officer.gender as 'm' | 'f' },
                ]
              : [
                  { speaker: officer.name, text: 'Halt. You are within PABLO Corp. jurisdiction. State your purpose.', gender: officer.gender as 'm' | 'f' },
                  { speaker: 'YOU', text: '...', gender: 'm' },
                  { speaker: officer.name, text: 'No badge. No purpose. You have five seconds to vacate.', gender: officer.gender as 'm' | 'f' },
                ];
            activeConvosRef.current.push(createConversationEvent(oPos.x, oPos.y, playerStopLines));
            setNarr(`> ${officer.name} stops you. "${playerStopLines[0].text}"`);
            continue;
          }
          for (const ped of pedestrians) {
            const pPos = getNpcSchedulePos(ped, g.worldTime ?? 0);
            const dist = Math.hypot(oPos.x - pPos.x, oPos.y - pPos.y);
            if (dist < 120 && Math.random() < 0.12) {
              const dialogs = officer.role === 'police'
                ? POLICE_STOP_DIALOGS[Math.floor(Math.random() * POLICE_STOP_DIALOGS.length)]
                : CORPO_MILITARY_STOP_DIALOGS[Math.floor(Math.random() * CORPO_MILITARY_STOP_DIALOGS.length)];
              activeConvosRef.current.push(createConversationEvent(oPos.x, oPos.y, dialogs));
              break;
            }
          }
          if (activeConvosRef.current.length >= 3) break;
        }
      }

      if (g.frame % 45 === 0 && !g.interior) {
        if (g.calendar.weather === 'RAIN' || g.calendar.weather === 'ACID_RAIN') sfxWeatherRain(g.px, g.py);
        if (g.calendar.weather === 'SNOW' || g.calendar.weather === 'DUST' || g.calendar.weather === 'STORM') sfxWeatherWind();
      }

      if (g.frame % 60 === 0 && !g.interior) {
        for (let i = 0; i < NPCS.length; i++) {
          const sp = getNpcSchedulePos(NPCS[i], g.worldTime ?? 0);
          const d = Math.hypot(g.px - sp.x, g.py - sp.y);
          if (d < 300 && d > 40) {
            const surface = inCityBounds(sp.x, sp.y) ? 'concrete' : 'dirt';
            sfxSpatialStep(g.px, g.py, sp.x, sp.y, surface);
            break;
          }
        }
      }

      if (g.frame % 300 === 0 && !g.interior && inCityBounds(g.px, g.py)) {
        if (Math.random() < 0.25) {
          const vx = g.px + (Math.random() - 0.5) * 600;
          const vy = g.py + (Math.random() - 0.5) * 400;
          sfxVehicle(g.px, g.py, vx, vy);
        }
        if (Math.random() < 0.15) {
          const mx = g.px + (Math.random() - 0.5) * 500;
          const my = g.py + (Math.random() - 0.5) * 500;
          sfxMachinery(g.px, g.py, mx, my);
        }
      }

      const newZone = getCurrentSector(g.px, g.py);
      if (newZone !== lastZone) { lastZone = newZone; g.zone = newZone; setZone(newZone); sfxZoneCross(); }

      // Gang zone detection
      let newGang: string | null = null;
      for (const gz of GANG_ZONES) {
        if (g.px >= gz.x && g.px <= gz.x + gz.w && g.py >= gz.y && g.py <= gz.y + gz.h) { newGang = gz.id; break; }
      }
      if (newGang !== g.gangZone) {
        g.gangZone = newGang; setGangZone(newGang);
        if (newGang !== lastGangZ) {
          lastGangZ = newGang;
          const pc = char.class.toLowerCase();
          const allyGangs = GANG_FACTION_ALLIES[pc] ?? [];
          const enemyGangs = GANG_FACTION_ENEMIES[pc] ?? [];
          const baseGang = newGang?.replace('_frag', '') ?? '';
          const isFrag = newGang?.endsWith('_frag') ?? false;
          const factionTag = baseGang && allyGangs.includes(baseGang) ? ' [ALLIED — safe passage]' : baseGang && enemyGangs.includes(baseGang) ? ' [HOSTILE — enemy territory!]' : '';
          const fragTag = isFrag ? ' (OUTPOST — fractured territory)' : '';
          if (baseGang === 'minx_city') setNarr(`> MINX CITY LIMITS${factionTag}${fragTag} — The dominant faction. SENIOR PABLO's reach extends even here. The other gangs operate in their shadow.`);
          else if (baseGang === 'rust_syndicate') setNarr(`> RUST SYNDICATE TERRITORY${factionTag}${fragTag} — Spray-paint everywhere: GAME OVER / NO CONTINUES. These are PIKE RENNER's old crew. He doesn't claim them anymore.`);
          else if (baseGang === 'void_runners') setNarr(`> VOID RUNNERS TERRITORY${factionTag}${fragTag} — They broadcast static on loop. The code in the static is an old arcade game. Nobody has decoded it. Nobody that lived, anyway.`);
          else if (baseGang === 'static_monks') setNarr(`> STATIC MONKS TERRITORY${factionTag}${fragTag} — Silent. They move like shadows. KAEL VERNE says they guard something buried here from before the collapse.`);
          else if (baseGang === 'eastern_bloc') setNarr(`> EASTERN BLOC TERRITORY${factionTag}${fragTag} — They don't speak. They don't negotiate. NOVA PRYCE tracked their signal origin back to a server in SHADOW TOWER. Nobody was surprised.`);

        }
      }

      // Survival tick — every 540 frames (~9s)
      g.survivalTick++;
      if (g.survivalTick >= 540) {
        g.survivalTick = 0;
        const inWaste = !inCityBounds(g.px, g.py);
        const cs2 = CLASS_STATS[char.class.toLowerCase()] ?? CLASS_STATS.corporate;
        const wasteMultiplier = (cs2.wasteBonus && inWaste) ? 0.6 : 1.0;
        const hDrain = (inWaste ? 2.5 : 1.5) * wasteMultiplier;
        let tDrain = (inWaste ? 3.0 : 2.0) * wasteMultiplier;
        let eDrain = char.class.toLowerCase() === 'replicant' ? 0 : ((inWaste ? 1.5 : 1.0) * wasteMultiplier);

        const temp = getTemperatureLevel(g.calendar.season, g.calendar.weather, g.calendar.hour);
        g.temperature = temp;
        setTemperatureDisplay(temp);
        const isIndoors = !!g.interior;
        if (!isIndoors) {
          if (temp === 'COLD') {
            eDrain += 1.5;
            if (!gamePausedRef.current) { g.hp = Math.max(0, g.hp - 1); g.deathReason = 'Died from hypothermia — exposure to extreme cold'; }
          }
          if (temp === 'HOT') {
            tDrain += 2.0;
          }
        }
        if (isIndoors) {
          const idleMs = Date.now() - g.lastMoveTime;
          if (idleMs > 2000) {
            const nearBld = (g.interior as { bid: string } | null)?.bid ?? '';
            const isRestLoc = REST_LOCATION_IDS.has(nearBld);
            const energyRecovery = isRestLoc ? 8 : 4;
            g.energy = Math.min(100, g.energy + energyRecovery);
          }
        }

        g.hunger = Math.max(0, g.hunger - hDrain);
        g.thirst = Math.max(0, g.thirst - tDrain);
        g.energy = Math.max(0, g.energy - eDrain);
        if ((g.hunger <= 0 || g.thirst <= 0) && !gamePausedRef.current) { g.hp = Math.max(0, g.hp - 2); g.deathReason = g.hunger <= 0 && g.thirst <= 0 ? 'Died from starvation and dehydration' : g.hunger <= 0 ? 'Died from starvation' : 'Died from dehydration'; }
        if (g.energy <= 20) { g.salary = Math.max(0, g.salary - 500); }
        setHunger(Math.floor(g.hunger)); setThirst(Math.floor(g.thirst)); setEnergy(Math.floor(g.energy));

        // ── ECONOMY: Periodic income by class (salary per minute) ────────
        const cls = char.class.toLowerCase();
        const salaryPerMin = FACTION_SALARY_PER_MIN[cls] ?? 25;
        const factionName = CLASS_DISPLAY_NAME[cls] ?? 'FACTION';
        const INCOME_LABEL = cls === 'corporate' ? `${factionName} SALARY` : cls === 'replicant' ? `${factionName} GIG PAY` : `${factionName} SCAVENGING`;
        const now = Date.now();
        if (now - g.lastIncomeTime >= 60000) {
          g.lastIncomeTime = now;
          const bonus = cls === 'outlaw' && inWaste ? Math.floor(Math.random() * 150) : 0;
          const total = salaryPerMin + bonus;
          g.salary += total; setSalary(g.salary);
          g.floaters.push({ x: g.px, y: g.py - 30, text: `+ƒ${total.toLocaleString()} ${INCOME_LABEL}`, color: '#00ff41', life: 80, maxLife: 80 });
          sfxCoin();
          addBankTx(INCOME_LABEL, total, g.salary);
        }

        // ── ECONOMY: Real estate passive income (every 15 ticks) ────────────
        g.realEstateIncomeTick++;
        if (g.realEstateIncomeTick >= 15 && g.realEstate.length > 0) {
          g.realEstateIncomeTick = 0;
          let reTotal = 0;
          for (const rid of g.realEstate) reTotal += REAL_ESTATE_INCOME[rid] ?? 0;
          if (g.ownedItems.has('neon_sign')) reTotal = Math.floor(reTotal * 1.1);
          if (reTotal > 0) {
            g.salary += reTotal; setSalary(g.salary);
            g.floaters.push({ x: g.px + 30, y: g.py - 50, text: `+ƒ${reTotal.toLocaleString()} RENTAL INCOME`, color: '#cc44ff', life: 80, maxLife: 80 });
            sfxCoin();
          }
        }

        // ── ECONOMY: Savings interest (every 30 ticks = ~3 min) ───────────
        g.interestTick++;
        if (g.interestTick >= 30 && g.savings > 0) {
          g.interestTick = 0;
          const rawInterest = Math.floor(g.savings * 0.008);
          if (rawInterest > 0) {
            const pabloTax = Math.floor(rawInterest * 0.15);
            const netInterest = rawInterest - pabloTax;
            g.savings += netInterest; setSavings(g.savings);
            g.floaters.push({ x: g.px + 20, y: g.py - 40, text: `+ƒ${netInterest.toLocaleString()} SAVINGS INTEREST`, color: '#44ffaa', life: 80, maxLife: 80 });
            addBankTx('SAVINGS INTEREST (0.8% APY)', netInterest, g.savings);
            if (pabloTax > 0) addBankTx('PABLO CORP. INTEREST TAX (15%)', -pabloTax, g.savings);
          }
        } else if (g.interestTick >= 30) {
          g.interestTick = 0;
        }

        // ── ECONOMY: Loan overdue check ───────────────────────────────────
        if (g.loan && g.frame > g.loan.dueAt) {
          const penalty = Math.floor(g.loan.amount * 0.05);
          g.salary = Math.max(0, g.salary - penalty); setSalary(g.salary);
          g.floaters.push({ x: g.px, y: g.py - 20, text: `−ƒ${penalty.toLocaleString()} DEBT PENALTY`, color: '#ff4444', life: 90, maxLife: 90 });
          addBankTx('PABLO CORP. DEBT PENALTY (5%)', -penalty, g.salary);
          setNarr('> BANCO OMBRA ALERT — Your loan is overdue. PABLO Corp. Debt Collection is now active. ƒ' + penalty.toLocaleString() + ' FIAT deducted. Repay at BANCO OMBRA immediately.');
        }

        // ── OREGON TRAIL RANDOM EVENTS (every 12 survival ticks ≈ 72s) ────
        g.oregonTick++;
        if (g.oregonTick >= 12 && Math.random() < 0.35) {
          g.oregonTick = 0;
          const inWaste2 = !inCityBounds(g.px, g.py);
          const cityEvents = [
            () => { const a = 1500 + Math.floor(Math.random() * 2000); g.salary -= a; setSalary(g.salary); sfxError(); return `> CITY TAX AUDIT — PABLO CORP. seized ƒ${a.toLocaleString()} in "compliance fees". No appeal. No tribunal.`; },
            () => { g.hunger = Math.max(0, g.hunger - 20); setHunger(Math.floor(g.hunger)); sfxError(); return '> FOOD RECALL — All vendor synth-protein recalled. Contaminated batch traced to Pablo Corp. Processing Unit 9. "Regrettable." −20 Hunger.'; },
            () => { g.thirst = Math.max(0, g.thirst - 25); setThirst(Math.floor(g.thirst)); sfxError(); return '> WATER RATION CUT — Sector 2–7 on reduced supply. "Infrastructure maintenance." −25 Thirst.'; },
            () => { const f = 500 + Math.floor(Math.random() * 800); g.salary -= f; setSalary(g.salary); sfxError(); return `> SURVEILLANCE FINE — Your movement pattern flagged by City-AI. ƒ${f.toLocaleString()} deducted automatically. "Irregular mobility risk score: elevated."`; },
            () => { g.hp = Math.min(g.maxHp, g.hp + 15); setHp(Math.floor(g.hp)); sfxHeal(); return '> CORPORATE MORALE DROP — PABLO Corp. deployed free stim-packs city-wide. "Productivity metric: normalized." HP +15.'; },
            () => { g.energy = Math.min(100, g.energy + 30); setEnergy(Math.floor(g.energy)); sfxHeal(); return '> REST CYCLE — Mandatory 2-hour curfew across Sectors 4–6. You used the time. Energy +30.'; },
            () => { const bonus = 3000 + Math.floor(Math.random() * 3000); g.salary += bonus; setSalary(g.salary); sfxCoin(); return `> FOUND STASH — Loose FIAT tokens wedged behind a maintenance panel. Uncoded. Untraceable. +ƒ${bonus.toLocaleString()}.`; },
          ];
          const wasteEvents = [
            () => { if (!gamePausedRef.current) { g.hp = Math.max(1, g.hp - 25); g.deathReason = 'Died from acid rain exposure'; setHp(Math.floor(g.hp)); } sfxError(); return '> ACID RAIN — Wasteland squall. Unprotected exposure. HP −25. Find shelter.'; },
            () => { g.hunger = Math.max(0, g.hunger - 30); g.thirst = Math.max(0, g.thirst - 30); setHunger(Math.floor(g.hunger)); setThirst(Math.floor(g.thirst)); sfxError(); return '> SUPPLY SPOILED — Heat and radiation destroyed your rations. Hunger −30. Thirst −30.'; },
            () => { g.poisoned = true; g.poisonTick = 0; setPoisoned(true); sfxPoison(); return '> MUTANT SPORE CLOUD — Inhaled a dense patch of spores. POISONED. HP slowly draining.'; },
            () => { const loot = 5000 + Math.floor(Math.random() * 8000); g.salary += loot; setSalary(g.salary); sfxCoin(); return `> DEAD RUNNER — A courier. Expired. Their cache: ƒ${loot.toLocaleString()} in undelivered FIAT. Their last entry reads: "Don't go north."  You're going north.`; },
            () => { g.hp = Math.min(g.maxHp, g.hp + 20); setHp(Math.floor(g.hp)); sfxHeal(); return '> SHELTER FOUND — A reinforced alcove. Pre-collapse. Someone patched it. HP +20. Someone was looking out for you.'; },
            () => { g.hunger = Math.min(100, g.hunger + 25); g.thirst = Math.min(100, g.thirst + 25); setHunger(Math.floor(g.hunger)); setThirst(Math.floor(g.thirst)); sfxHeal(); return '> WILD GROVE — Impossible. But here: a cluster of growing things. Clean moisture. Hunger +25. Thirst +25.'; },
            () => { g.energy = Math.max(0, g.energy - 20); setEnergy(Math.floor(g.energy)); sfxError(); return '> DEAD ZONE PULSE — Electromagnetic burst from an unknown source. Your equipment flickered. Energy −20. Systems recovering.'; },
          ];
          const pool = inWaste2 ? wasteEvents : cityEvents;
          const msg = pool[Math.floor(Math.random() * pool.length)]();
          setNarr(msg);
        } else if (g.oregonTick >= 12) {
          g.oregonTick = 0;
        }
      }

      // ── LIVING WORLD: Power Grid ─────────────────────────────────────────
      g.powerTick++;
      if (g.powerEventFrames > 0) {
        g.powerEventFrames--;
        if (g.powerEventFrames === 0) { g.powerLevel = 100; setPowerPct(100); }
      } else if (g.powerTick >= 480) {
        g.powerTick = 0;
        if (Math.random() < 0.15) {
          const evts = [
            { level: 40, dur: 180, msg: '> POWER GRID: Brownout detected — Sector 3. Emergency crews responding.' },
            { level: 10, dur: 120, msg: '> EMERGENCY: BLACKOUT — City power grid failure. Backup systems online.' },
            { level: 70, dur: 90,  msg: '> CITY ALERT: Power fluctuation detected. Grid operating at reduced capacity.' },
          ];
          const ev = evts[Math.floor(Math.random() * evts.length)];
          g.powerLevel = ev.level; g.powerEventFrames = ev.dur;
          setPowerPct(ev.level); setNarr(ev.msg);
        }
      }

      // ── LIVING WORLD: Police patrol movement + player aggro response ──
      if (g.policeAlertTimer > 0) g.policeAlertTimer--;
      for (let pi = 0; pi < g.police.length; pi++) {
        const p = g.police[pi];
        if (!g.policeCooldowns[pi]) g.policeCooldowns[pi] = 0;
        if (g.policeCooldowns[pi] > 0) g.policeCooldowns[pi]--;

        if (g.policeAlertTimer > 0) {
          const dToOrigin = Math.hypot(g.policeAlertX - p.x, g.policeAlertY - p.y);
          if (dToOrigin < 600) {
            const ang = Math.atan2(g.py - p.y, g.px - p.x);
            p.x += Math.cos(ang) * 2.2 * NPC_SPEED_MULT;
            p.y += Math.sin(ang) * 2.2 * NPC_SPEED_MULT;
            const dToPlayer = Math.hypot(g.px - p.x, g.py - p.y);
            if (dToPlayer < 22 && g.policeCooldowns[pi] <= 0 && g.invincible === 0 && !gamePausedRef.current) {
              g.policeCooldowns[pi] = 25;
              const armorMult = g.ownedItems.has('armor_plate') ? 0.85 : 1;
              const csP = CLASS_STATS[char.class.toLowerCase()] ?? CLASS_STATS.corporate;
              const defReduceP = Math.max(0.1, 1 - csP.defBonus * 0.02);
              const policeNightMult = (g.worldTime >= 19 || g.worldTime < 4) ? 1.5 : 1.0;
              g.hp = Math.max(0, g.hp - 4 * armorMult * defReduceP * policeNightMult); g.invincible = 40; g.flash = 6; g.deathReason = 'Killed by PABLO Corp. police enforcement';
              g.floaters.push({ x: g.px, y: g.py - 12, text: 'POLICE STRIKE', color: '#ff4444', life: 40, maxLife: 40 });
            }
            continue;
          }
        }

        const route = POLICE_ROUTES[p.routeIdx];
        const next  = (p.wpIdx + 1) % route.length;
        const wpA   = route[p.wpIdx], wpB = route[next];
        p.progress  += 0.001 * NPC_SPEED_MULT;
        if (p.progress >= 1) { p.progress = 0; p.wpIdx = next; }
        p.x = wpA.x + (wpB.x - wpA.x) * p.progress;
        p.y = wpA.y + (wpB.y - wpA.y) * p.progress;
        if (p.x >= CITY_LEFT && p.x <= CITY_RIGHT && p.y >= CITY_TOP && p.y <= CITY_BOTTOM && g.policeCooldowns[pi] <= 0) {
          for (let ti = 0; ti < g.threats.length; ti++) {
            const t = g.threats[ti];
            if (PASSIVE_THREATS.has(t.type) || t.type === 'PABLO_GUARD') continue;
            if (t.x < CITY_LEFT || t.x > CITY_RIGHT || t.y < CITY_TOP || t.y > CITY_BOTTOM) continue;
            const dx = t.x - p.x, dy = t.y - p.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 120) {
              const dmg = 25 + Math.random() * 15;
              t.hp -= dmg;
              g.policeCooldowns[pi] = 35;
              g.floaters.push({ x: t.x, y: t.y - 10, text: `−${Math.floor(dmg)} POLICE`, color: '#4488ff', life: 40, maxLife: 40 });
              if (t.hp <= 0) {
                g.floaters.push({ x: t.x, y: t.y - 18, text: `${t.type} NEUTRALIZED`, color: '#4488ff', life: 60, maxLife: 60 });
                const pBounty = BOUNTY[t.type] ?? 10;
                g.deadBodies.push({ x: t.x, y: t.y, type: t.type, diedAtFrame: g.frame, bounty: pBounty, looted: false });
                g.threats.splice(ti, 1); ti--;
              }
              break;
            }
          }
        }
      }

      // ── PATROL BANDS: Movement, inter-band combat, player engagement ──
      for (const band of g.bands) {
        const aliveMembers = band.members.filter(m => !m.dead);
        if (aliveMembers.length === 0) continue;

        const route = POLICE_ROUTES[band.routeIdx];
        const next = (band.wpIdx + 1) % route.length;
        const wpA = route[band.wpIdx], wpB = route[next];
        band.progress += 0.0008 * NPC_SPEED_MULT;
        if (band.progress >= 1) { band.progress = 0; band.wpIdx = next; }
        const bandCX = wpA.x + (wpB.x - wpA.x) * band.progress;
        const bandCY = wpA.y + (wpB.y - wpA.y) * band.progress;

        for (const m of aliveMembers) {
          m.x = bandCX + m.ox;
          m.y = bandCY + m.oy;
          if (m.attackCd > 0) m.attackCd--;
        }

        for (const otherBand of g.bands) {
          if (otherBand === band || otherBand.type === band.type) continue;
          const otherAlive = otherBand.members.filter(om => !om.dead);
          if (otherAlive.length === 0) continue;
          const bdx = bandCX - (otherAlive[0]?.x ?? 0);
          const bdy = bandCY - (otherAlive[0]?.y ?? 0);
          const bandDist = Math.sqrt(bdx * bdx + bdy * bdy);
          if (bandDist > 200) continue;

          for (const attacker of aliveMembers) {
            if (attacker.attackCd > 0) continue;
            const attackRange = attacker.weapon === 'ranged' ? band.rangedRange : 30;
            let closestTarget: BandMember | null = null;
            let closestDist = attackRange;
            for (const target of otherAlive) {
              const td = Math.hypot(attacker.x - target.x, attacker.y - target.y);
              if (td < closestDist) { closestDist = td; closestTarget = target; }
            }
            if (closestTarget) {
              const dmg = band.atkDmg + Math.random() * 10;
              closestTarget.hp -= dmg;
              attacker.attackCd = attacker.weapon === 'ranged' ? 45 : 30;
              if (attacker.weapon === 'ranged') {
                g.projectiles.push({ x: attacker.x, y: attacker.y, dx: (closestTarget.x - attacker.x) / closestDist * 5, dy: (closestTarget.y - attacker.y) / closestDist * 5, damage: 0, type: 'laser', life: 25 });
              }
              g.floaters.push({ x: closestTarget.x, y: closestTarget.y - 10, text: `−${Math.floor(dmg)}`, color: band.color, life: 35, maxLife: 35 });
              if (closestTarget.hp <= 0) {
                closestTarget.dead = true;
                g.floaters.push({ x: closestTarget.x, y: closestTarget.y - 18, text: `${otherBand.label} DOWN`, color: band.color, life: 50, maxLife: 50 });
                g.deadBodies.push({ x: closestTarget.x, y: closestTarget.y, type: otherBand.type, diedAtFrame: g.frame, bounty: 5, looted: false });
              }
            }
          }
        }

        if (band.type === 'POLICE' && g.policeAlertTimer > 0) {
          for (const m of aliveMembers) {
            if (m.attackCd > 0) continue;
            const dToPlayer = Math.hypot(g.px - m.x, g.py - m.y);
            const atkRange = m.weapon === 'ranged' ? band.rangedRange : 22;
            if (dToPlayer < atkRange && g.invincible === 0 && !gamePausedRef.current) {
              m.attackCd = m.weapon === 'ranged' ? 50 : 30;
              const armorMult = g.ownedItems.has('armor_plate') ? 0.85 : 1;
              const csP = CLASS_STATS[char.class.toLowerCase()] ?? CLASS_STATS.corporate;
              const defReduceP = Math.max(0.1, 1 - csP.defBonus * 0.02);
              const bandNightMult = (g.worldTime >= 19 || g.worldTime < 4) ? 1.5 : 1.0;
              const dmgP = band.atkDmg * armorMult * defReduceP * bandNightMult;
              g.hp = Math.max(0, g.hp - dmgP); g.invincible = 40; g.flash = 6;
              g.deathReason = `Killed by ${band.label} enforcement`;
              g.floaters.push({ x: g.px, y: g.py - 12, text: `${band.label} STRIKE`, color: band.color, life: 40, maxLife: 40 });
              if (m.weapon === 'ranged') {
                g.projectiles.push({ x: m.x, y: m.y, dx: (g.px - m.x) / dToPlayer * 5, dy: (g.py - m.y) / dToPlayer * 5, damage: 0, type: 'laser', life: 25 });
              }
            }
          }
        }

        for (const m of aliveMembers) {
          if (m.attackCd > 0) continue;
          for (let ti = 0; ti < g.threats.length; ti++) {
            const t = g.threats[ti];
            if (PASSIVE_THREATS.has(t.type) || t.type === 'PABLO_GUARD') continue;
            const td = Math.hypot(m.x - t.x, m.y - t.y);
            const atkRange = m.weapon === 'ranged' ? band.rangedRange : 25;
            if (td < atkRange) {
              const dmg = band.atkDmg + Math.random() * 10;
              t.hp -= dmg;
              m.attackCd = m.weapon === 'ranged' ? 45 : 30;
              g.floaters.push({ x: t.x, y: t.y - 10, text: `−${Math.floor(dmg)} ${band.label}`, color: band.color, life: 40, maxLife: 40 });
              if (m.weapon === 'ranged') {
                g.projectiles.push({ x: m.x, y: m.y, dx: (t.x - m.x) / td * 5, dy: (t.y - m.y) / td * 5, damage: 0, type: 'laser', life: 20 });
              }
              if (t.hp <= 0) {
                g.floaters.push({ x: t.x, y: t.y - 18, text: `${t.type} NEUTRALIZED`, color: band.color, life: 60, maxLife: 60 });
                g.deadBodies.push({ x: t.x, y: t.y, type: t.type, diedAtFrame: g.frame, bounty: BOUNTY[t.type] ?? 10, looted: false });
                g.threats.splice(ti, 1); ti--;
              }
              break;
            }
          }
        }
      }

      if (g.frame % 3600 === 0) {
        for (let bi = 0; bi < g.bands.length; bi++) {
          const band = g.bands[bi];
          const alive = band.members.filter(m => !m.dead).length;
          if (alive === 0) {
            g.bands[bi] = createBand(BAND_TYPES[Math.floor(Math.random() * BAND_TYPES.length)], band.routeIdx);
          }
        }
      }

      // ── NPC event reaction system — flee or spectate on nearby combat/fire ──
      {
        const combatActive = g.threats.some(t => t.behavior === 'HOSTILE' && Math.hypot(t.x - g.px, t.y - g.py) < 150);
        const fireNearby = g.fires.length > 0;
        const eventX = combatActive ? g.px : (fireNearby ? g.fires[0].x : 0);
        const eventY = combatActive ? g.py : (fireNearby ? g.fires[0].y : 0);
        const hasEvent = combatActive || fireNearby;
        for (const npc of NPCS) {
          if (!npc.origX) { npc.origX = npc.x; npc.origY = npc.y; }
          if (!npc.reactTimer) npc.reactTimer = 0;
          if (npc.reactTimer > 0) npc.reactTimer--;
          if (g.frame % 30 === 0 && hasEvent) {
            const npcEvtDist = Math.hypot(npc.x - eventX, npc.y - eventY);
            if (npcEvtDist < 200 && npc.reactState !== 'FLEEING' && npc.reactState !== 'SPECTATING' && npc.reactTimer === 0) {
              const willFlee = Math.random() < 0.65 || npc.role === 'pedestrian';
              npc.reactState = willFlee ? 'FLEEING' : 'SPECTATING';
              npc.reactTimer = 300;
            }
          }
          if (npc.reactState === 'FLEEING') {
            const fleeAng = Math.atan2(npc.y - eventY, npc.x - eventX);
            npc.x += Math.cos(fleeAng) * 1.5 * NPC_SPEED_MULT;
            npc.y += Math.sin(fleeAng) * 1.5 * NPC_SPEED_MULT;
            if (npc.reactTimer <= 0) { npc.reactState = 'NORMAL'; npc.x = npc.origX!; npc.y = npc.origY!; }
          } else if (npc.reactState === 'SPECTATING') {
            const npcDist = Math.hypot(npc.x - eventX, npc.y - eventY);
            if (npcDist > 80) {
              const watchAng = Math.atan2(eventY - npc.y, eventX - npc.x);
              npc.x += Math.cos(watchAng) * 0.3 * NPC_SPEED_MULT;
              npc.y += Math.sin(watchAng) * 0.3 * NPC_SPEED_MULT;
            }
            if (npc.reactTimer <= 0) { npc.reactState = 'NORMAL'; npc.x = npc.origX!; npc.y = npc.origY!; }
          }
        }
      }

      // ── Gang patrol territory movement ──
      if (g.frame % 4 === 0) {
        for (const npc of NPCS) {
          if (npc.role !== 'gang_patrol' || npc.reactState === 'FLEEING') continue;
          const zone = GANG_ZONES.find(gz => gz.id === npc.faction);
          if (!zone) continue;
          if (!npc.origX) { npc.origX = npc.x; npc.origY = npc.y; }
          const speed = (npc.walkSpeed ?? 0.7) * NPC_SPEED_MULT;
          const cx = zone.x + zone.w / 2;
          const cy = zone.y + zone.h / 2;
          const patrolRadius = Math.min(zone.w, zone.h) * 0.35;
          const phase = (g.frame * 0.002 + (npc.origX ?? 0) * 0.01) % (Math.PI * 2);
          const targetX = cx + Math.cos(phase) * patrolRadius;
          const targetY = cy + Math.sin(phase * 1.3) * patrolRadius;
          const dx = targetX - npc.x;
          const dy = targetY - npc.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 10) {
            npc.x += (dx / dist) * speed;
            npc.y += (dy / dist) * speed;
          }
        }
      }

      // ── Ambient traffic vehicle movement ──
      for (const tv of g.trafficVehicles) {
        const route = TRAFFIC_ROUTES[tv.routeIdx];
        if (!route || route.length < 2) continue;
        const target = route[tv.wpIdx];
        const tdx = target.x - tv.x;
        const tdy = target.y - tv.y;
        const tdist = Math.hypot(tdx, tdy);
        if (tdist < 15) {
          tv.wpIdx = (tv.wpIdx + 1) % route.length;
        } else {
          tv.dx = (tdx / tdist) * tv.speed;
          tv.dy = (tdy / tdist) * tv.speed;
          tv.x += tv.dx;
          tv.y += tv.dy;
        }
      }

      // ── Subway transit animation ──
      if (g.subwayTransit) {
        g.subwayTransitTimer--;
        if (g.subwayTransitTimer <= 0 && g.subwayTransitDest) {
          g.px = g.subwayTransitDest.x; g.py = g.subwayTransitDest.y;
          const arrLabel = g.subwayTransitDest.label;
          g.subwayTransit = false;
          g.subwayTransitDest = null;
          setNarr(`> METRO — Arrived at ${arrLabel}. "Please watch the gap."`);
          sfxEnter();
        }
      }

      // ── Parked vehicle steal interaction ──
      const nearAnyBuilding = BUILDINGS.some(b => g.px >= b.x - 20 && g.px <= b.x + b.w + 20 && g.py >= b.y - 20 && g.py <= b.y + b.h + 20);
      const nearAnyNpc = NPCS.some(nn => Math.hypot(g.px - nn.x, g.py - nn.y) < NPC_RANGE);
      if (g.keys.has('e') && !g.vehicle && !nearAnyBuilding && !nearAnyNpc) {
        for (const pv of g.parkedVehicles) {
          if (pv.stolen) continue;
          const pvDist = Math.hypot(g.px - pv.x, g.py - pv.y);
          if (pvDist < STEAL_RANGE) {
            g.keys.delete('e');
            if (Math.random() < STEAL_CHANCE) {
              pv.stolen = true;
              g.vehicle = pv.type;
              g.floaters.push({ x: g.px, y: g.py - 16, text: `STOLE ${pv.type.replace('_', ' ').toUpperCase()}`, color: '#ffcc00', life: 60, maxLife: 60 });
              setNarr(`> POLICE ALERT — You hotwired a ${pv.type.replace('_', ' ')}. All units converging.`);
              g.policeAlertTimer = 300;
              g.policeAlertX = g.px; g.policeAlertY = g.py;
            } else {
              g.floaters.push({ x: g.px, y: g.py - 16, text: 'STEAL FAILED', color: '#ff4444', life: 40, maxLife: 40 });
              setNarr('> Hotwire attempt failed. The alarm triggered briefly.');
            }
            break;
          }
        }
      }

      // ── LIVING WORLD: Random fire events (reduced ~1/3 of original rate) ──
      g.fireTick++;
      if (g.fireTick >= 5400 && Math.random() < 0.002 && g.fires.length < 2) {
        g.fireTick = 0;
        const cityBlds = BUILDINGS.filter(b => b.y >= CITY_TOP && b.y < CITY_BOTTOM - 50);
        const fb = cityBlds[Math.floor(Math.random() * cityBlds.length)];
        if (!g.fires.find(f => f.bid === fb.id)) {
          g.fires.push({ bid: fb.id, x: fb.x + fb.w/2, y: fb.y + fb.h/2, startFrame: g.frame, intensity: 0.6 + Math.random()*0.4 });
          setNarr(`> FIRE DEPT DISPATCH: Structure fire reported at ${fb.label}. Unit 4 responding.`);
        }
      }
      // Extinguish old fires after ~1800 frames
      g.fires = g.fires.filter(f => {
        const age = g.frame - f.startFrame;
        if (age > 1800) { setNarr(`> FIRE DEPT: Fire at ${BUILDINGS.find(b=>b.id===f.bid)?.label??'UNKNOWN'} contained. Cause under investigation.`); return false; }
        return true;
      });

      // ── LIVING WORLD: Ambient city events ────────────────────────────────
      g.ambTick++;
      if (g.ambTick >= 540) {
        g.ambTick = 0;
        if (Math.random() < 0.35) {
          const line = AMBIENCE_LINES[Math.floor(Math.random() * AMBIENCE_LINES.length)];
          setCityEvent(line);
          cityEventTimer.current = 220;
        }
      }
      if (cityEventTimer.current > 0) { cityEventTimer.current--; if (cityEventTimer.current === 0) setCityEvent(null); }

      // ── DRAW ─────────────────────────────────────────────────────────────
      if (g.flash > 0) { ctx.fillStyle = `rgba(255,0,0,${g.flash * .05})`; ctx.fillRect(0, 0, cw, ch); }
      const pwDark = (100 - g.powerLevel) / 100;

      const wt = g.worldTime;
      let dayBright = 1;
      if (wt >= 7 && wt <= 17) {
        const midDay = 1 - Math.abs(wt - 12) / 5;
        dayBright = 0.85 + midDay * 0.15;
      } else if (wt > 5 && wt < 7) {
        const t2 = (wt - 5) / 2;
        dayBright = 0.35 + t2 * 0.5;
      } else if (wt > 17 && wt < 19) {
        const t2 = 1 - (wt - 17) / 2;
        dayBright = 0.35 + t2 * 0.5;
      } else {
        dayBright = 0.3;
      }
      const isNight = wt >= 19 || wt < 4;
      const isDusk = wt >= 17 && wt < 19;
      const isDawn = wt >= 4 && wt < 6;

      const tileHash = (x: number, y: number) => {
        const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        return h - Math.floor(h);
      };

      const sgx = Math.floor(g.cam.x / TILE) * TILE, sgy = Math.floor(g.cam.y / TILE) * TILE;
      for (let gx = sgx - TILE; gx < g.cam.x + cw + TILE * 2; gx += TILE) {
        for (let gy = sgy - TILE; gy < g.cam.y + ch + TILE * 2; gy += TILE) {
          const sx = gx + ox, sy = gy + oy;
          if (sx + TILE < 0 || sx > cw || sy + TILE < 0 || sy > ch) continue;
          const inCityZone = gx >= CITY_LEFT && gx <= CITY_RIGHT && gy >= CITY_TOP && gy <= CITY_BOTTOM;
          const nearWater = gx < BORDER + 120 || gx > W - BORDER - 120 || gy < BORDER + 120 || gy > H - BORDER - 120;
          const h = tileHash(gx / TILE, gy / TILE);
          const h2 = tileHash(gx / TILE + 100, gy / TILE + 100);

          let baseR: number, baseG: number, baseB: number;
          if (inCityZone) {
            if (h < 0.3) { baseR = 85; baseG = 85; baseB = 80; }
            else if (h < 0.6) { baseR = 75; baseG = 72; baseB = 68; }
            else { baseR = 90; baseG = 88; baseB = 82; }
            baseR += (h2 - 0.5) * 10; baseG += (h2 - 0.5) * 8; baseB += (h2 - 0.5) * 8;
          } else if (nearWater) {
            baseR = 180 + h * 25; baseG = 165 + h * 20; baseB = 120 + h * 15;
          } else {
            if (h < 0.25) { baseR = 110 + h2 * 15; baseG = 85 + h2 * 10; baseB = 55 + h2 * 8; }
            else if (h < 0.55) { baseR = 75 + h2 * 15; baseG = 105 + h2 * 20; baseB = 45 + h2 * 10; }
            else if (h < 0.8) { baseR = 95 + h2 * 12; baseG = 90 + h2 * 15; baseB = 60 + h2 * 10; }
            else { baseR = 120 + h2 * 10; baseG = 100 + h2 * 10; baseB = 65 + h2 * 8; }
          }
          const br = dayBright * (1 - pwDark * 0.7);
          ctx.fillStyle = `rgb(${Math.floor(baseR * br)},${Math.floor(baseG * br)},${Math.floor(baseB * br)})`;
          ctx.fillRect(sx, sy, TILE, TILE);

          const pxSize = 8;
          for (let px2 = 0; px2 < TILE; px2 += pxSize) {
            for (let py3 = 0; py3 < TILE; py3 += pxSize) {
              const ph = tileHash(gx + px2, gy + py3);
              if (ph > 0.7) {
                const vr = (ph - 0.7) * 30;
                ctx.fillStyle = `rgba(${Math.floor(baseR * br + vr)},${Math.floor(baseG * br + vr * 0.8)},${Math.floor(baseB * br + vr * 0.5)},0.3)`;
                ctx.fillRect(sx + px2, sy + py3, pxSize, pxSize);
              } else if (ph < 0.15) {
                ctx.fillStyle = `rgba(0,0,0,0.08)`;
                ctx.fillRect(sx + px2, sy + py3, pxSize, pxSize);
              }
            }
          }
        }
      }

      const drawBorderTerrain = () => {
        const northEdge = BORDER + oy;
        const southEdge = (H - BORDER) + oy;
        const westEdge = BORDER + ox;
        const eastEdge = (W - BORDER) + ox;
        const mtnBr = dayBright;

        if (northEdge > -60) {
          ctx.fillStyle = `rgb(${Math.floor(90 * mtnBr)},${Math.floor(75 * mtnBr)},${Math.floor(55 * mtnBr)})`;
          ctx.fillRect(0, Math.max(0, oy), cw, northEdge - oy + 30);
          for (let mx = 0; mx < cw; mx += 16) {
            const peakH = 20 + Math.sin(mx * 0.05) * 14 + Math.cos(mx * 0.03) * 8;
            const shade = 0.7 + Math.sin(mx * 0.02) * 0.15;
            ctx.fillStyle = `rgb(${Math.floor(110 * shade * mtnBr)},${Math.floor(90 * shade * mtnBr)},${Math.floor(65 * shade * mtnBr)})`;
            ctx.beginPath(); ctx.moveTo(mx, northEdge); ctx.lineTo(mx + 8, northEdge - peakH); ctx.lineTo(mx + 16, northEdge); ctx.fill();
            ctx.fillStyle = `rgb(${Math.floor(130 * shade * mtnBr)},${Math.floor(110 * shade * mtnBr)},${Math.floor(80 * shade * mtnBr)})`;
            ctx.fillRect(mx + 4, northEdge - peakH + 2, 4, 4);
          }
        }
        if (southEdge < ch + 60) {
          ctx.fillStyle = `rgb(${Math.floor(85 * mtnBr)},${Math.floor(70 * mtnBr)},${Math.floor(50 * mtnBr)})`;
          ctx.fillRect(0, southEdge - 10, cw, ch - southEdge + 70);
          for (let mx = 0; mx < cw; mx += 16) {
            const peakH = 18 + Math.sin(mx * 0.04 + 1) * 12 + Math.cos(mx * 0.06) * 7;
            const shade = 0.7 + Math.cos(mx * 0.025) * 0.15;
            ctx.fillStyle = `rgb(${Math.floor(105 * shade * mtnBr)},${Math.floor(85 * shade * mtnBr)},${Math.floor(60 * shade * mtnBr)})`;
            ctx.beginPath(); ctx.moveTo(mx, southEdge); ctx.lineTo(mx + 8, southEdge + peakH); ctx.lineTo(mx + 16, southEdge); ctx.fill();
          }
        }
        if (westEdge > -60) {
          const waveT = g.frame * 0.025;
          const waterBr = isNight ? 0.4 : mtnBr;
          ctx.fillStyle = `rgb(${Math.floor(30 * waterBr)},${Math.floor(90 * waterBr)},${Math.floor(160 * waterBr)})`;
          ctx.fillRect(Math.max(0, ox), 0, westEdge - ox + 20, ch);
          for (let wy = 0; wy < ch; wy += 8) {
            const wx = westEdge + Math.sin(wy * 0.08 + waveT) * 6;
            const wBr = 0.8 + Math.sin(wy * 0.05 + waveT * 2) * 0.2;
            ctx.fillStyle = `rgb(${Math.floor(50 * wBr * waterBr)},${Math.floor(130 * wBr * waterBr)},${Math.floor(200 * wBr * waterBr)})`;
            ctx.fillRect(wx - 10, wy, 12, 6);
            ctx.fillStyle = `rgba(255,255,255,${0.15 * wBr})`;
            ctx.fillRect(wx - 4, wy, 4, 2);
          }
        }
        if (eastEdge < cw + 60) {
          const waveT = g.frame * 0.025;
          const waterBr = isNight ? 0.4 : mtnBr;
          ctx.fillStyle = `rgb(${Math.floor(25 * waterBr)},${Math.floor(80 * waterBr)},${Math.floor(150 * waterBr)})`;
          ctx.fillRect(eastEdge - 10, 0, cw - eastEdge + 70, ch);
          for (let wy = 0; wy < ch; wy += 8) {
            const wx = eastEdge + Math.sin(wy * 0.08 + waveT + 2) * 6;
            const wBr = 0.8 + Math.sin(wy * 0.06 + waveT * 1.5) * 0.2;
            ctx.fillStyle = `rgb(${Math.floor(45 * wBr * waterBr)},${Math.floor(120 * wBr * waterBr)},${Math.floor(190 * wBr * waterBr)})`;
            ctx.fillRect(wx - 2, wy, 12, 6);
            ctx.fillStyle = `rgba(255,255,255,${0.12 * wBr})`;
            ctx.fillRect(wx + 2, wy, 4, 2);
          }
        }
      };
      drawBorderTerrain();

      const drawWastelandTerrain = () => {
        const seed = (x: number, y: number) => Math.sin(x * 0.317 + y * 0.519) * 0.5 + 0.5;
        const TREE_SPACING = 260;
        const ROCK_SPACING = 320;
        const GRASS_SPACING = 120;
        const BUSH_SPACING = 200;
        const viewL = g.cam.x - 80, viewR = g.cam.x + cw + 80;
        const viewT = g.cam.y - 80, viewB = g.cam.y + ch + 80;
        const br = dayBright;

        const inCity = (cx: number, cy: number, pad: number) => cx > CITY_LEFT - pad && cx < CITY_RIGHT + pad && cy > CITY_TOP - pad && cy < CITY_BOTTOM + pad;

        for (let wx = BORDER; wx < W - BORDER; wx += GRASS_SPACING) {
          for (let wy = BORDER; wy < H - BORDER; wy += GRASS_SPACING) {
            if (inCity(wx, wy, 100)) continue;
            if (wx < viewL || wx > viewR || wy < viewT || wy > viewB) continue;
            const s = seed(wx, wy);
            const sx2 = wx + ox, sy2 = wy + oy;
            if (s > 0.25 && s < 0.75) {
              const gShade = s > 0.5 ? [60, 140, 40] : [80, 120, 30];
              ctx.fillStyle = `rgb(${Math.floor(gShade[0] * br)},${Math.floor(gShade[1] * br)},${Math.floor(gShade[2] * br)})`;
              const gw = 10 + s * 16;
              ctx.fillRect(sx2 - gw / 2, sy2 - 1, gw, 3);
              for (let bl = 0; bl < 4; bl++) {
                const bx2 = sx2 - gw / 2 + bl * (gw / 4) + seed(wx + bl, wy) * 3;
                const bladeG = 100 + Math.floor(s * 80);
                ctx.fillStyle = `rgb(${Math.floor(40 * br)},${Math.floor(bladeG * br)},${Math.floor(20 * br)})`;
                ctx.fillRect(bx2, sy2 - 4 - s * 6, 2, 4 + s * 6);
              }
              if (s > 0.6) {
                ctx.fillStyle = `rgb(${Math.floor(220 * br)},${Math.floor(180 * br)},${Math.floor(50 * br)})`;
                ctx.fillRect(sx2 + 2, sy2 - 6, 2, 2);
              }
            }
          }
        }

        for (let wx = BORDER + 50; wx < W - BORDER; wx += TREE_SPACING) {
          for (let wy = BORDER + 50; wy < H - BORDER; wy += TREE_SPACING) {
            if (inCity(wx, wy, 200)) continue;
            if (wx < viewL || wx > viewR || wy < viewT || wy > viewB) continue;
            const s = seed(wx * 1.7, wy * 1.3);
            if (s < 0.3) continue;
            const tx = wx + (s - 0.5) * 80 + ox;
            const ty = wy + (s - 0.5) * 60 + oy;
            const treeH = 18 + s * 16;
            const canopyW = 10 + s * 10;
            const canopyH = 12 + s * 8;
            ctx.fillStyle = `rgba(0,0,0,0.15)`;
            ctx.beginPath(); ctx.ellipse(tx, ty + 3, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = `rgb(${Math.floor(90 * br)},${Math.floor(60 * br)},${Math.floor(30 * br)})`;
            ctx.fillRect(tx - 2, ty - treeH + canopyH * 0.6, 4, treeH - canopyH * 0.6);
            ctx.fillStyle = `rgb(${Math.floor(70 * br)},${Math.floor(50 * br)},${Math.floor(25 * br)})`;
            ctx.fillRect(tx - 2, ty - treeH + canopyH * 0.6, 1, treeH - canopyH * 0.6);
            const leafShades = [
              [40, 120 + Math.floor(s * 40), 25],
              [55, 140 + Math.floor(s * 30), 35],
              [30, 100 + Math.floor(s * 50), 20],
            ];
            for (let ly = 0; ly < canopyH; ly += 4) {
              const rowW = canopyW * (1 - Math.abs(ly - canopyH * 0.4) / (canopyH * 0.7));
              if (rowW < 2) continue;
              for (let lx = -rowW; lx < rowW; lx += 4) {
                const li = Math.floor(seed(tx + lx, ty + ly) * 3);
                const shade = leafShades[li];
                ctx.fillStyle = `rgb(${Math.floor(shade[0] * br)},${Math.floor(shade[1] * br)},${Math.floor(shade[2] * br)})`;
                ctx.fillRect(tx + lx - 2, ty - treeH + ly, 4, 4);
              }
            }
          }
        }

        for (let wx = BORDER + 80; wx < W - BORDER; wx += BUSH_SPACING) {
          for (let wy = BORDER + 80; wy < H - BORDER; wy += BUSH_SPACING) {
            if (inCity(wx, wy, 150)) continue;
            if (wx < viewL || wx > viewR || wy < viewT || wy > viewB) continue;
            const s = seed(wx * 3.1, wy * 2.3);
            if (s < 0.4) continue;
            const bx2 = wx + (s - 0.5) * 60 + ox;
            const by2 = wy + (s - 0.5) * 40 + oy;
            const bushW = 8 + s * 8;
            const bushH = 6 + s * 5;
            for (let bly = 0; bly < bushH; bly += 3) {
              for (let blx = -bushW / 2; blx < bushW / 2; blx += 3) {
                const si = seed(wx + blx, wy + bly);
                const g2 = 90 + Math.floor(si * 60);
                ctx.fillStyle = `rgb(${Math.floor(35 * br)},${Math.floor(g2 * br)},${Math.floor(25 * br)})`;
                ctx.fillRect(bx2 + blx, by2 - bushH + bly, 3, 3);
              }
            }
          }
        }

        for (let wx = BORDER + 120; wx < W - BORDER; wx += ROCK_SPACING) {
          for (let wy = BORDER + 120; wy < H - BORDER; wy += ROCK_SPACING) {
            if (inCity(wx, wy, 150)) continue;
            if (wx < viewL || wx > viewR || wy < viewT || wy > viewB) continue;
            const s = seed(wx * 2.1, wy * 0.7);
            if (s < 0.45) continue;
            const rx = wx + (s - 0.5) * 100 + ox;
            const ry = wy + (s - 0.5) * 70 + oy;
            const rw = 6 + s * 10, rh = 5 + s * 7;
            ctx.fillStyle = `rgba(0,0,0,0.1)`;
            ctx.beginPath(); ctx.ellipse(rx, ry + 2, rw * 0.8, 2, 0, 0, Math.PI * 2); ctx.fill();
            for (let ry2 = 0; ry2 < rh; ry2 += 3) {
              for (let rx2 = -rw; rx2 < rw; rx2 += 3) {
                const d = Math.sqrt(rx2 * rx2 / (rw * rw) + ry2 * ry2 / (rh * rh));
                if (d > 1) continue;
                const si = seed(wx + rx2, wy + ry2);
                const gray = 100 + Math.floor(si * 50) + Math.floor((1 - d) * 30);
                const brown = Math.floor(si * 15);
                ctx.fillStyle = `rgb(${Math.floor(gray * br)},${Math.floor((gray - 10 + brown) * br)},${Math.floor((gray - 25) * br)})`;
                ctx.fillRect(rx + rx2, ry - rh + ry2, 3, 3);
              }
            }
          }
        }
      };
      drawWastelandTerrain();

      // ── Sewer system (manhole covers on city streets) ────────────────────
      for (const mh of MANHOLES) {
        const mx = mh.x + ox, my = mh.y + oy;
        if (mx < -20 || mx > cw + 20 || my < -20 || my > ch + 20) continue;
        const mBr = dayBright;
        ctx.fillStyle = `rgb(${Math.floor(50 * mBr)},${Math.floor(48 * mBr)},${Math.floor(42 * mBr)})`;
        ctx.beginPath(); ctx.arc(mx, my, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgb(${Math.floor(35 * mBr)},${Math.floor(33 * mBr)},${Math.floor(28 * mBr)})`;
        ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgb(${Math.floor(70 * mBr)},${Math.floor(65 * mBr)},${Math.floor(55 * mBr)})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(mx - 4, my); ctx.lineTo(mx + 4, my); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mx, my - 4); ctx.lineTo(mx, my + 4); ctx.stroke();
      }

      for (const np of NEWSPAPER_WORLD_SPOTS) {
        const nx = np.x + ox, ny = np.y + oy;
        if (nx < -20 || nx > cw + 20 || ny < -20 || ny > ch + 20) continue;
        const nBr = dayBright;
        ctx.fillStyle = `rgba(${Math.floor(180 * nBr)},${Math.floor(170 * nBr)},${Math.floor(130 * nBr)},0.9)`;
        ctx.fillRect(nx - 5, ny - 3, 10, 6);
        ctx.fillStyle = `rgba(${Math.floor(40 * nBr)},${Math.floor(35 * nBr)},${Math.floor(25 * nBr)},0.7)`;
        ctx.fillRect(nx - 4, ny - 2, 8, 1);
        ctx.fillRect(nx - 4, ny, 8, 1);
        ctx.fillRect(nx - 4, ny + 2, 5, 1);
        const dist = Math.hypot(g.px - np.x, g.py - np.y);
        if (dist < 40) {
          ctx.fillStyle = g.blink ? 'rgba(255,200,60,.9)' : 'rgba(255,200,60,.3)';
          ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText('[E] READ NEWSPAPER', nx, ny - 8);
        }
      }

      const cityTopY = CITY_TOP + oy;
      const cityBotY = CITY_BOTTOM + oy;

      // Gang territory zones (subtle fill only, no borders or labels)
      for (const gz of GANG_ZONES) {
        if (gz.id === 'minx_city') continue;
        const gx = gz.x + ox, gy = gz.y + oy;
        if (gx + gz.w < 0 || gx > cw || gy + gz.h < 0 || gy > ch) continue;
        ctx.fillStyle = gz.color;
        ctx.fillRect(gx, gy, gz.w, gz.h);
      }

      const drawRoad = (x1:number,y1:number,x2:number,y2:number,w:number,alpha:number,dashed=false) => {
        const roadBr = dayBright;
        const rGray = Math.floor(55 * roadBr);
        if (dashed) {
          ctx.lineWidth = w; ctx.strokeStyle = `rgb(${rGray + 10},${rGray + 5},${rGray})`;
          ctx.setLineDash([18,10]);
          ctx.beginPath(); ctx.moveTo(x1+ox,y1+oy); ctx.lineTo(x2+ox,y2+oy); ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.fillStyle = `rgb(${rGray},${rGray - 5},${rGray - 8})`;
          const horiz = Math.abs(y1 - y2) < 2;
          if (horiz) { ctx.fillRect(x1+ox, y1+oy - w/2, x2-x1, w); }
          else { ctx.fillRect(x1+ox - w/2, y1+oy, w, y2-y1); }
          ctx.setLineDash([12,8]); ctx.lineWidth = 1.5;
          ctx.strokeStyle = `rgb(${Math.floor(220 * roadBr)},${Math.floor(200 * roadBr)},${Math.floor(60 * roadBr)})`;
          ctx.beginPath(); ctx.moveTo(x1+ox,y1+oy); ctx.lineTo(x2+ox,y2+oy); ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = `rgba(255,255,255,${0.08 * roadBr})`;
          ctx.lineWidth = w;
          ctx.beginPath(); ctx.moveTo(x1+ox,y1+oy); ctx.lineTo(x2+ox,y2+oy); ctx.stroke();
        }
      };
      // Horizontal city avenues — wide urban corridors
      drawRoad(CITY_LEFT,5400,CITY_RIGHT,5400,44,.12);
      drawRoad(CITY_LEFT,5850,CITY_RIGHT,5850,40,.11);
      drawRoad(CITY_LEFT,6300,CITY_RIGHT,6300,40,.11);
      drawRoad(CITY_LEFT,6750,CITY_RIGHT,6750,38,.10);
      drawRoad(CITY_LEFT,7200,CITY_RIGHT,7200,38,.10);
      // Vertical city streets — wide urban corridors
      drawRoad(5700,CITY_TOP,5700,CITY_BOTTOM+40,36,.11);
      drawRoad(6200,CITY_TOP,6200,CITY_BOTTOM+40,34,.10);
      drawRoad(6700,CITY_TOP,6700,CITY_BOTTOM+40,36,.11);
      drawRoad(7200,CITY_TOP,7200,CITY_BOTTOM+40,34,.10);
      drawRoad(7700,CITY_TOP,7700,CITY_BOTTOM+40,34,.09);
      drawRoad(8200,CITY_TOP,8200,CITY_BOTTOM+40,34,.09);
      drawRoad(8700,CITY_TOP,8700,CITY_BOTTOM+40,32,.08);
      // Alley roads — narrower cross-connections between main roads
      for (const ay of CITY_ALLEYS_H) drawRoad(CITY_LEFT,ay,CITY_RIGHT,ay,16,.06);
      for (const ax of CITY_ALLEYS_V) drawRoad(ax,CITY_TOP,ax,CITY_BOTTOM+40,14,.05);
      // North wasteland trails (dashed, dimmer)
      drawRoad(0,1800,W,1800,10,.04,true);
      drawRoad(0,3200,W,3200,8,.03,true);
      drawRoad(2000,BORDER,2000,CITY_TOP,8,.04,true);
      drawRoad(5000,BORDER,5000,CITY_TOP,8,.04,true);
      drawRoad(8000,BORDER,8000,CITY_TOP,8,.04,true);
      drawRoad(11000,BORDER,11000,CITY_TOP,8,.04,true);
      // South wasteland trails (dashed, dimmer)
      drawRoad(0,9000,W,9000,10,.04,true);
      drawRoad(0,10500,W,10500,8,.03,true);
      drawRoad(2000,CITY_BOTTOM,2000,H-BORDER,8,.04,true);
      drawRoad(5000,CITY_BOTTOM,5000,H-BORDER,8,.04,true);
      drawRoad(8000,CITY_BOTTOM,8000,H-BORDER,8,.04,true);
      drawRoad(11000,CITY_BOTTOM,11000,H-BORDER,8,.04,true);

      // ── Street lights ──────────────────────────────────────────────────────
      const LAMP_SPACING = 90;
      // Light roads (horizontal avenues + vertical streets)
      const lampRoads = [
        { horiz: true,  coord: 5180, from: CITY_LEFT, to: CITY_RIGHT },
        { horiz: true,  coord: 5580, from: CITY_LEFT, to: CITY_RIGHT },
        { horiz: true,  coord: 5960, from: CITY_LEFT, to: CITY_RIGHT },
        { horiz: true,  coord: 6350, from: CITY_LEFT, to: CITY_RIGHT },
        { horiz: true,  coord: 6600, from: CITY_LEFT, to: CITY_RIGHT },
        { horiz: true,  coord: 6780, from: CITY_LEFT, to: CITY_RIGHT },
        { horiz: false, coord: 5560, from: CITY_TOP, to: CITY_BOTTOM },
        { horiz: false, coord: 6060, from: CITY_TOP, to: CITY_BOTTOM },
        { horiz: false, coord: 6680, from: CITY_TOP, to: CITY_BOTTOM },
        { horiz: false, coord: 7160, from: CITY_TOP, to: CITY_BOTTOM },
        { horiz: false, coord: 7850, from: CITY_TOP, to: CITY_BOTTOM },
      ];
      for (const lr of lampRoads) {
        const total = lr.to - lr.from;
        const count = Math.ceil(total / LAMP_SPACING);
        for (let li = 0; li < count; li++) {
          const t = lr.from + li * LAMP_SPACING + (LAMP_SPACING / 2);
          // Alternating sides of road
          const side = li % 2 === 0 ? -10 : 10;
          const lx = lr.horiz ? (t + ox) : (lr.coord + side + ox);
          const ly = lr.horiz ? (lr.coord + side + oy) : (t + oy);
          if (lx < -20 || lx > cw + 20 || ly < -20 || ly > ch + 20) continue;
          // Flicker based on frame + index + power level
          const seed = Math.sin(g.frame * 0.018 + li * 7.3 + lr.coord * 0.02);
          const pwr  = g.powerLevel / 100;
          const flickerChance = pwr < 0.5 ? Math.abs(seed) < 0.06 : false;
          const nightMult = (wt >= 20 || wt < 4) ? 1.8 : (wt >= 18) ? 1.0 + 0.8 * ((wt - 18) / 2) : (wt < 6) ? 1.0 + 0.8 * ((6 - wt) / 2) : 0.6;
          const brightness = (flickerChance ? 0.08 : (0.7 + seed * 0.2) * pwr) * nightMult;
          if (brightness < 0.05) continue;
          const wc = Math.floor(brightness * 255);
          const warmR = Math.min(255, wc + 40), warmG = Math.min(255, wc + 30), warmB = Math.max(0, wc - 60);
          ctx.fillStyle = `rgb(${Math.floor(80 * dayBright)},${Math.floor(80 * dayBright)},${Math.floor(75 * dayBright)})`;
          if (lr.horiz) { ctx.fillRect(lx - 1, ly, 2, Math.abs(side > 0 ? -14 : 14)); }
          else { ctx.fillRect(lx, ly - 1, Math.abs(side > 0 ? -14 : 14), 2); }
          ctx.fillStyle = `rgb(${Math.floor(60 * dayBright)},${Math.floor(60 * dayBright)},${Math.floor(55 * dayBright)})`;
          ctx.fillRect(lx - 3, ly - 2, 6, 3);
          const glowR2 = 35 + brightness * 20;
          const glowR = ctx.createRadialGradient(lx, ly, 0, lx, ly, glowR2);
          glowR.addColorStop(0, `rgba(${warmR},${warmG},${warmB},${brightness * 0.55})`);
          glowR.addColorStop(0.5, `rgba(${warmR},${warmG},${Math.max(0, warmB - 20)},${brightness * 0.2})`);
          glowR.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = glowR; ctx.beginPath(); ctx.arc(lx, ly, glowR2, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = `rgb(${warmR},${warmG},${Math.min(255, warmB + 40)})`;
          ctx.fillRect(lx - 2, ly - 2, 4, 3);
        }
      }

      // ── Fire effects (behind buildings so only glow peeks out) ─────────────
      for (const fire of g.fires) {
        const fx = fire.x + ox, fy = fire.y + oy;
        if (fx < -80 || fx > cw + 80 || fy < -80 || fy > ch + 80) continue;
        const age = g.frame - fire.startFrame;
        const phase = Math.sin(g.frame * 0.18 + fire.x * 0.01) * 0.3 + 0.7;
        // Orange/red glow
        const fr2 = ctx.createRadialGradient(fx, fy, 0, fx, fy, 80 * fire.intensity);
        fr2.addColorStop(0, `rgba(255,120,0,${0.5 * phase * fire.intensity})`);
        fr2.addColorStop(0.5, `rgba(255,40,0,${0.25 * phase})`);
        fr2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fr2; ctx.beginPath(); ctx.arc(fx, fy, 80 * fire.intensity, 0, Math.PI*2); ctx.fill();
        // Smoke particles
        for (let sp = 0; sp < 6; sp++) {
          const sAngle = Math.sin(g.frame * 0.08 + sp * 1.5) * 0.5;
          const sy2    = fy - 20 - (age % 60) * 0.7 - sp * 9;
          const sx2    = fx + Math.sin(sAngle + sp) * 8;
          const sAlpha = Math.max(0, 0.35 - sp * 0.04);
          ctx.fillStyle = `rgba(60,30,0,${sAlpha * phase})`;
          ctx.beginPath(); ctx.arc(sx2, sy2, 4 + sp, 0, Math.PI*2); ctx.fill();
        }
      }

      // Buildings
      for (const b of BUILDINGS) {
        const bx = b.x + ox, by = b.y + oy;
        if (bx + b.w < 0 || bx > cw || by + b.h < 0 || by > ch) continue;
        const isNear = nb === b.id;
        const isLocked = g.locks.has(b.id) && !!g.locks.get(b.id)?.ownerName;

        // ── PABLO TOWER — special villain skyscraper rendering (no blur) ──
        if (b.id === 'pablo_tower') {
          const pulse = 0.18 + Math.sin(g.frame * 0.03) * 0.08;
          const grad = ctx.createLinearGradient(bx, by, bx, by + b.h);
          grad.addColorStop(0, 'rgba(12,2,20,.98)');
          grad.addColorStop(1, 'rgba(4,8,4,.97)');
          ctx.fillStyle = grad; ctx.fillRect(bx, by, b.w, b.h);
          // Border — purple/green depending on state
          ctx.strokeStyle = isNear ? 'rgba(0,255,65,.9)' : `rgba(140,0,220,${pulse + .3})`;
          ctx.lineWidth = isNear ? 2.5 : 1.5; ctx.strokeRect(bx, by, b.w, b.h);
          // Corner brackets
          const cs2 = 12; ctx.lineWidth = 2;
          ctx.strokeStyle = isNear ? 'rgba(0,255,65,.9)' : 'rgba(140,0,220,.7)';
          [[bx, by, 1, 1], [bx + b.w, by, -1, 1], [bx, by + b.h, 1, -1], [bx + b.w, by + b.h, -1, -1]].forEach(([cx2, cy2, sx, sy]) => {
            ctx.beginPath(); ctx.moveTo(cx2, cy2 + (sy as number) * cs2); ctx.lineTo(cx2, cy2); ctx.lineTo(cx2 + (sx as number) * cs2, cy2); ctx.stroke();
          });
          // Window grid — dark building lit windows
          ctx.fillStyle = `rgba(255,220,120,${.04 + Math.sin(g.frame * 0.02) * .02})`;
          for (let wr = 0; wr < 8; wr++) {
            for (let wc = 0; wc < 10; wc++) {
              const lit = ((wr * 13 + wc * 7 + g.frame * 0) % 17) > 4; // mostly dark
              if (lit) ctx.fillRect(bx + 10 + wc * 22, by + 12 + wr * 24, 8, 14);
            }
          }
          // Penthouse — top band, always lit
          const phY = by + 8;
          ctx.fillStyle = `rgba(255,200,80,${.08 + Math.sin(g.frame * 0.04) * .04})`;
          ctx.fillRect(bx + 8, phY, b.w - 16, 20);
          ctx.strokeStyle = `rgba(255,180,50,${.3 + Math.sin(g.frame * 0.04) * .15})`;
          ctx.lineWidth = 1; ctx.strokeRect(bx + 8, phY, b.w - 16, 20);
          // Penthouse silhouette — PABLO watching
          const silX = bx + b.w / 2 + Math.sin(g.frame * 0.008) * 6;
          const silY = phY + 4;
          ctx.fillStyle = `rgba(0,0,0,${.8 + Math.sin(g.frame * 0.015) * .15})`;
          ctx.fillRect(silX - 4, silY, 8, 14); // body
          ctx.beginPath(); ctx.arc(silX, silY - 3, 4, 0, Math.PI * 2); ctx.fill(); // head
          // Antenna / spire
          ctx.strokeStyle = `rgba(0,255,65,${.4 + Math.sin(g.frame * 0.05) * .2})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(bx + b.w / 2, by); ctx.lineTo(bx + b.w / 2, by - 20); ctx.stroke();
          ctx.fillStyle = `rgba(0,255,65,${.6 + Math.sin(g.frame * 0.1) * .4})`;
          ctx.beginPath(); ctx.arc(bx + b.w / 2, by - 21, 2.5, 0, Math.PI * 2); ctx.fill();
          // Label
          ctx.fillStyle = isNear ? '#00ff41' : 'rgba(180,0,255,.8)';
          ctx.font = 'bold 11px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText('PABLO TOWER', bx + b.w / 2, by + b.h / 2 + 4);
          if (isNear) { ctx.fillStyle = g.blink ? 'rgba(0,255,65,.9)' : 'rgba(0,255,65,.35)'; ctx.font = '8px "Share Tech Mono"'; ctx.fillText('[E]', bx + b.w / 2, by - 28); }
          continue; // skip default building drawing
        }

        // ── SAVE POINT crystal — glowing diamond ──────────────────────────
        if (b.id === 'crystal' || b.id === 'crystal2' || b.id === 'crystal3') {
          const cx2 = bx + b.w / 2, cy2 = by + b.h / 2;
          const pulse2 = 0.5 + Math.sin(g.frame * 0.07) * 0.5;
          const sz = 9 + pulse2 * 3;
          ctx.shadowColor = '#aaffff'; ctx.shadowBlur = 12 + pulse2 * 10;
          ctx.fillStyle = `rgba(80,255,255,${0.5 + pulse2 * 0.4})`;
          ctx.beginPath(); ctx.moveTo(cx2, cy2 - sz); ctx.lineTo(cx2 + sz * 0.6, cy2); ctx.lineTo(cx2, cy2 + sz); ctx.lineTo(cx2 - sz * 0.6, cy2); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.fillStyle = `rgba(180,255,255,${0.4 + pulse2 * 0.4})`; ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText('SAVE', cx2, cy2 + sz + 8);
          if (isNear) { ctx.fillStyle = g.blink ? 'rgba(180,255,255,.9)' : 'rgba(180,255,255,.3)'; ctx.fillText('[E] SAVE', cx2, cy2 - sz - 6); }
          continue;
        }

        // ── PUBLIC TERMINAL rendering (payphones, kiosks, vans) ─────────
        if (IS_PUBLIC_TERMINAL(b.id)) {
          const cx2 = bx + b.w / 2, cy2 = by + b.h / 2;
          const pulse2 = 0.5 + Math.sin(g.frame * 0.06 + bx * 0.01) * 0.5;
          if (IS_VAN(b.id)) {
            ctx.fillStyle = `rgba(0,255,65,${0.08 + pulse2 * 0.04})`;
            ctx.fillRect(bx, by, b.w, b.h);
            ctx.strokeStyle = `rgba(0,255,65,${0.3 + pulse2 * 0.2})`;
            ctx.lineWidth = 1; ctx.strokeRect(bx, by, b.w, b.h);
            ctx.fillStyle = `rgba(0,255,65,${0.15 + pulse2 * 0.1})`;
            ctx.fillRect(bx + b.w - 8, by + 4, 6, b.h - 8);
            ctx.fillStyle = `rgba(0,255,65,${0.5 + pulse2 * 0.3})`;
            ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center';
            ctx.fillText('VAN', cx2, cy2 + 3);
            ctx.fillStyle = `rgba(0,255,65,${0.3 + pulse2 * 0.2})`;
            ctx.font = '6px "Share Tech Mono"';
            ctx.fillText('TERMINAL', cx2, cy2 + 11);
          } else {
            ctx.shadowColor = '#00ff41'; ctx.shadowBlur = 6 + pulse2 * 6;
            ctx.fillStyle = `rgba(0,20,10,${0.85})`;
            ctx.fillRect(cx2 - 7, cy2 - 8, 14, 12);
            ctx.strokeStyle = `rgba(0,255,65,${0.5 + pulse2 * 0.3})`;
            ctx.lineWidth = 1.5; ctx.strokeRect(cx2 - 7, cy2 - 8, 14, 12);
            const scanY = cy2 - 7 + ((g.frame * 0.5) % 10);
            ctx.fillStyle = `rgba(0,255,65,${0.06 + pulse2 * 0.04})`;
            ctx.fillRect(cx2 - 6, scanY, 12, 1);
            ctx.fillStyle = `rgba(0,255,65,${0.4 + pulse2 * 0.4})`;
            ctx.font = '5px "Share Tech Mono"'; ctx.textAlign = 'center';
            ctx.fillText('>', cx2, cy2);
            ctx.fillStyle = `rgba(0,80,40,${0.6})`;
            ctx.fillRect(cx2 - 3, cy2 + 5, 6, 3);
            ctx.fillStyle = `rgba(0,60,30,${0.5})`;
            ctx.fillRect(cx2 - 5, cy2 + 8, 10, 2);
            ctx.shadowBlur = 0;
            ctx.fillStyle = `rgba(0,255,65,${0.5 + pulse2 * 0.3})`;
            ctx.font = '6px "Share Tech Mono"'; ctx.textAlign = 'center';
            ctx.fillText('TERMINAL', cx2, cy2 + 18);
          }
          if (isNear) { ctx.fillStyle = g.blink ? 'rgba(0,255,65,.9)' : 'rgba(0,255,65,.35)'; ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center'; ctx.fillText('[E] TERMINAL', cx2, by - 6); }
          ctx.shadowBlur = 0;
          continue;
        }

        const bd = BUILDING_DEPTH;
        const bBr = dayBright;
        const bHash = tileHash(b.x, b.y);
        let wallR: number, wallG: number, wallB: number;
        let roofR: number, roofG: number, roofB: number;
        if (isLocked) {
          wallR = 140; wallG = 80; wallB = 50;
          roofR = 110; roofG = 60; roofB = 35;
        } else if (bHash < 0.3) {
          wallR = 150; wallG = 90; wallB = 70; roofR = 120; roofG = 70; roofB = 50;
        } else if (bHash < 0.6) {
          wallR = 130; wallG = 130; wallB = 125; roofR = 100; roofG = 100; roofB = 95;
        } else {
          wallR = 90; wallG = 95; wallB = 105; roofR = 70; roofG = 75; roofB = 85;
        }
        ctx.fillStyle = `rgb(${Math.floor(wallR * bBr)},${Math.floor(wallG * bBr)},${Math.floor(wallB * bBr)})`;
        ctx.fillRect(bx, by, b.w, b.h);
        if (bHash < 0.3) {
          for (let bry = 0; bry < b.h; bry += 6) {
            const rowOff = (Math.floor(bry / 6) % 2) * 5;
            for (let brx = rowOff; brx < b.w; brx += 10) {
              ctx.fillStyle = `rgb(${Math.floor((wallR - 15) * bBr)},${Math.floor((wallG - 12) * bBr)},${Math.floor((wallB - 8) * bBr)})`;
              ctx.fillRect(bx + brx, by + bry, 9, 5);
              ctx.fillStyle = `rgb(${Math.floor((wallR + 10) * bBr)},${Math.floor((wallG + 5) * bBr)},${Math.floor((wallB + 5) * bBr)})`;
              ctx.fillRect(bx + brx, by + bry + 5, 9, 1);
              ctx.fillRect(bx + brx + 9, by + bry, 1, 6);
            }
          }
        }
        ctx.fillStyle = `rgb(${Math.floor(roofR * bBr)},${Math.floor(roofG * bBr)},${Math.floor(roofB * bBr)})`;
        ctx.fillRect(bx - 2, by - 3, b.w + 4, 5);
        const bldgWallH = Math.max(16, Math.min(50, Math.floor(Math.max(b.w, b.h) * 0.3)));
        ctx.fillStyle = `rgb(${Math.floor((wallR * 0.7) * bBr)},${Math.floor((wallG * 0.7) * bBr)},${Math.floor((wallB * 0.7) * bBr)})`;
        ctx.beginPath(); ctx.moveTo(bx, by + b.h); ctx.lineTo(bx + bd * 0.5, by + b.h + bldgWallH);
        ctx.lineTo(bx + b.w + bd * 0.5, by + b.h + bldgWallH); ctx.lineTo(bx + b.w, by + b.h); ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgb(${Math.floor((wallR * 0.6) * bBr)},${Math.floor((wallG * 0.6) * bBr)},${Math.floor((wallB * 0.6) * bBr)})`;
        ctx.beginPath(); ctx.moveTo(bx + b.w, by); ctx.lineTo(bx + b.w + bd * 0.5, by + bd * 0.5);
        ctx.lineTo(bx + b.w + bd * 0.5, by + b.h + bldgWallH); ctx.lineTo(bx + b.w, by + b.h); ctx.closePath(); ctx.fill();
        const winW = 5, winH = 6, winGap = 3;
        const sWinCols = Math.floor((b.w - 8) / (winW + winGap));
        const sWinRows = Math.max(1, Math.floor((bldgWallH - 6) / (winH + winGap)));
        const sWallSkewPerRow = (bd * 0.5) / bldgWallH;
        for (let wr = 0; wr < sWinRows; wr++) {
          for (let wc = 0; wc < sWinCols; wc++) {
            const rowY = by + b.h + 3 + wr * (winH + winGap);
            const rowSkew = (rowY - (by + b.h)) * sWallSkewPerRow;
            const wx = bx + 4 + rowSkew + wc * (winW + winGap);
            const wy = rowY;
            const winLit = isNight && tileHash(b.x + wc * 13, b.y + wr * 7) > 0.4;
            if (winLit) {
              ctx.fillStyle = `rgb(${Math.floor(255 * 0.8)},${Math.floor(220 * 0.7)},${Math.floor(100 * 0.6)})`;
            } else {
              ctx.fillStyle = isNight ? `rgb(${Math.floor(30 * bBr)},${Math.floor(40 * bBr)},${Math.floor(55 * bBr)})` : `rgb(${Math.floor(140 * bBr)},${Math.floor(170 * bBr)},${Math.floor(200 * bBr)})`;
            }
            ctx.fillRect(wx, wy, winW, winH);
            ctx.fillStyle = `rgb(${Math.floor((wallR - 20) * bBr)},${Math.floor((wallG - 20) * bBr)},${Math.floor((wallB - 15) * bBr)})`;
            ctx.fillRect(wx - 1, wy - 1, winW + 2, 1);
            ctx.fillRect(wx - 1, wy, 1, winH);
            ctx.fillRect(wx + winW, wy, 1, winH);
            ctx.fillRect(wx - 1, wy + winH, winW + 2, 1);
          }
        }
        const eWinRows2 = Math.max(1, Math.floor((b.h - 8) / (winH + winGap)));
        const eWallXBase = bx + b.w;
        for (let wr = 0; wr < eWinRows2; wr++) {
          const wy = by + 4 + wr * (winH + winGap);
          const frac = (wy - by) / b.h;
          const wx = eWallXBase + frac * bd * 0.5 + 2;
          const winLit = isNight && tileHash(b.x + 99, b.y + wr * 11) > 0.45;
          if (winLit) {
            ctx.fillStyle = `rgb(${Math.floor(255 * 0.8)},${Math.floor(220 * 0.7)},${Math.floor(100 * 0.6)})`;
          } else {
            ctx.fillStyle = isNight ? `rgb(${Math.floor(30 * bBr)},${Math.floor(40 * bBr)},${Math.floor(55 * bBr)})` : `rgb(${Math.floor(140 * bBr)},${Math.floor(170 * bBr)},${Math.floor(200 * bBr)})`;
          }
          ctx.fillRect(wx, wy, winW - 1, winH);
        }
        const doorW = 8, doorH = 12;
        const doorX = bx + b.w / 2 - doorW / 2, doorY = by + b.h - doorH;
        ctx.fillStyle = `rgb(${Math.floor(60 * bBr)},${Math.floor(40 * bBr)},${Math.floor(25 * bBr)})`;
        ctx.fillRect(doorX, doorY, doorW, doorH);
        ctx.fillStyle = `rgb(${Math.floor(180 * bBr)},${Math.floor(160 * bBr)},${Math.floor(80 * bBr)})`;
        ctx.fillRect(doorX + doorW - 2, doorY + doorH / 2 - 1, 1, 2);
        if (HAS_INTERIOR(b.id)) {
          const playerDist = Math.hypot(g.px - (b.x + b.w / 2), g.py - (b.y + b.h / 2));
          if (playerDist < 200) {
            const silAlpha = Math.max(0, 0.15 - (playerDist - 80) * 0.001);
            if (silAlpha > 0.01) {
              const silCount = Math.min(3, Math.floor(b.w / 50));
              for (let si = 0; si < silCount; si++) {
                const sx = bx + 12 + si * (b.w - 24) / Math.max(1, silCount);
                const sy = by + b.h * 0.4 + Math.sin(g.frame * 0.02 + si * 2 + b.x * 0.1) * 3;
                ctx.fillStyle = `rgba(0,0,0,${silAlpha})`;
                ctx.fillRect(sx, sy, 5, 10);
                ctx.beginPath(); ctx.arc(sx + 2.5, sy - 2, 3, 0, Math.PI * 2); ctx.fill();
              }
            }
          }
        }
        if (isNear) {
          ctx.strokeStyle = '#00ff41'; ctx.lineWidth = 2; ctx.strokeRect(bx - 1, by - 1, b.w + 2, b.h + 2);
        }
        ctx.fillStyle = isLocked ? '#ff8c3c' : b.bright ? (isNear ? '#00ff41' : 'rgba(0,255,65,.9)') : `rgb(${Math.floor(230 * bBr)},${Math.floor(220 * bBr)},${Math.floor(200 * bBr)})`;
        ctx.font = `${b.bright ? 10 : 9}px "Share Tech Mono"`; ctx.textAlign = 'center';
        ctx.fillText(b.label + (isLocked ? ' 🔒' : ''), bx + b.w / 2, by + b.h / 2 + 4);
        const costLbl = BUILDING_COST_LABEL[b.id];
        if (costLbl && !isLocked) {
          ctx.font = '7px "Share Tech Mono"';
          ctx.fillStyle = costLbl === 'FREE' ? '#66ff88' : costLbl === 'SHOP' ? '#ffcc44' : '#ffaa44';
          ctx.fillText(costLbl, bx + b.w / 2, by + b.h / 2 + 14);
        }
        if (isNear) { ctx.fillStyle = g.blink ? 'rgba(0,255,65,.85)' : 'rgba(0,255,65,.3)'; ctx.font = '8px "Share Tech Mono"'; ctx.fillText('[E]', bx + b.w / 2, by - 7); }
      }

      // ── Parked vehicles on streets ──
      for (const pv of g.parkedVehicles) {
        if (pv.stolen) continue;
        const pvx = pv.x + ox, pvy = pv.y + oy;
        if (pvx < -30 || pvx > cw + 30 || pvy < -20 || pvy > ch + 20) continue;
        const pvDist = Math.hypot(g.px - pv.x, g.py - pv.y);
        const pvNear = pvDist < STEAL_RANGE;
        ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = pvNear ? 8 : 2;
        ctx.fillStyle = 'rgba(0,0,0,.2)';
        ctx.beginPath(); ctx.ellipse(pvx, pvy + 6, 10, 3, 0, 0, Math.PI * 2); ctx.fill();
        const vCol = pv.type === 'cargo_bike' ? '#886622' : pv.type === 'hover_scooter' ? '#2266aa' : pv.type === 'motorcycle' ? '#cc2222' : '#553344';
        if (pv.type === 'motorcycle') {
          ctx.fillStyle = vCol; ctx.fillRect(pvx - 5, pvy - 6, 10, 10);
          ctx.fillStyle = '#881111'; ctx.fillRect(pvx - 3, pvy - 8, 6, 3);
          ctx.fillStyle = '#ffcc44'; ctx.fillRect(pvx - 2, pvy - 9, 4, 2);
          ctx.fillStyle = '#ff4444'; ctx.fillRect(pvx - 2, pvy + 4, 4, 2);
          ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(pvx, pvy + 7, 3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(pvx, pvy - 5, 2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#444'; ctx.fillRect(pvx - 6, pvy - 2, 2, 4); ctx.fillRect(pvx + 4, pvy - 2, 2, 4);
        } else {
          ctx.fillStyle = vCol; ctx.fillRect(pvx - 8, pvy - 4, 16, 8);
          ctx.fillStyle = '#ffcc44'; ctx.fillRect(pvx - 9, pvy - 2, 2, 2); ctx.fillRect(pvx + 7, pvy - 2, 2, 2);
          ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(pvx - 5, pvy + 5, 2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(pvx + 5, pvy + 5, 2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.shadowBlur = 0;
        if (pvNear && !g.vehicle) {
          ctx.fillStyle = g.blink ? 'rgba(255,204,0,.85)' : 'rgba(255,204,0,.3)';
          ctx.font = '12px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText('[E] STEAL', pvx, pvy - 14);
          ctx.fillStyle = 'rgba(255,204,0,.6)';
          ctx.fillText(pv.type.replace('_', ' ').toUpperCase(), pvx, pvy - 26);
        }
      }

      // ── Ambient traffic vehicles ──
      for (const tv of g.trafficVehicles) {
        const tvx = tv.x + ox, tvy = tv.y + oy;
        if (tvx < -20 || tvx > cw + 20 || tvy < -20 || tvy > ch + 20) continue;
        ctx.fillStyle = 'rgba(0,0,0,.15)';
        ctx.beginPath(); ctx.ellipse(tvx, tvy + 5, 8, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        const isHoriz = Math.abs(tv.dx) > Math.abs(tv.dy);
        if (tv.type === 'truck') {
          if (isHoriz) {
            ctx.fillStyle = tv.color; ctx.fillRect(tvx - 12, tvy - 5, 24, 10);
            ctx.fillStyle = '#222'; ctx.fillRect(tvx - 14, tvy - 4, 4, 8);
            ctx.fillStyle = '#ffcc33'; ctx.fillRect(tvx + 11, tvy - 2, 3, 2); ctx.fillRect(tvx + 11, tvy, 3, 2);
            ctx.fillStyle = '#ff3333'; ctx.fillRect(tvx - 14, tvy - 2, 2, 4);
          } else {
            ctx.fillStyle = tv.color; ctx.fillRect(tvx - 5, tvy - 12, 10, 24);
            ctx.fillStyle = '#222'; ctx.fillRect(tvx - 4, tvy - 14, 8, 4);
            ctx.fillStyle = '#ffcc33'; ctx.fillRect(tvx - 2, tvy + 11, 2, 3); ctx.fillRect(tvx, tvy + 11, 2, 3);
          }
        } else if (tv.type === 'van') {
          if (isHoriz) {
            ctx.fillStyle = tv.color; ctx.fillRect(tvx - 10, tvy - 5, 20, 10);
            ctx.fillStyle = '#333'; ctx.fillRect(tvx - 10, tvy - 4, 5, 8);
            ctx.fillStyle = '#ffcc33'; ctx.fillRect(tvx + 9, tvy - 2, 2, 4);
          } else {
            ctx.fillStyle = tv.color; ctx.fillRect(tvx - 5, tvy - 10, 10, 20);
            ctx.fillStyle = '#333'; ctx.fillRect(tvx - 4, tvy - 10, 8, 5);
            ctx.fillStyle = '#ffcc33'; ctx.fillRect(tvx - 2, tvy + 9, 4, 2);
          }
        } else {
          if (isHoriz) {
            ctx.fillStyle = tv.color; ctx.fillRect(tvx - 8, tvy - 4, 16, 8);
            ctx.fillStyle = '#222'; ctx.fillRect(tvx - 6, tvy - 3, 5, 6);
            ctx.fillStyle = '#ffcc33'; ctx.fillRect(tvx + 7, tvy - 2, 2, 2); ctx.fillRect(tvx + 7, tvy, 2, 2);
            ctx.fillStyle = '#ff3333'; ctx.fillRect(tvx - 8, tvy - 2, 2, 4);
          } else {
            ctx.fillStyle = tv.color; ctx.fillRect(tvx - 4, tvy - 8, 8, 16);
            ctx.fillStyle = '#222'; ctx.fillRect(tvx - 3, tvy - 6, 6, 5);
            ctx.fillStyle = '#ffcc33'; ctx.fillRect(tvx - 2, tvy + 7, 2, 2); ctx.fillRect(tvx, tvy + 7, 2, 2);
          }
        }
        ctx.fillStyle = '#111';
        if (isHoriz) {
          ctx.beginPath(); ctx.arc(tvx - 5, tvy + 5, 2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(tvx + 5, tvy + 5, 2, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(tvx - 4, tvy - 4, 2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(tvx - 4, tvy + 4, 2, 0, Math.PI * 2); ctx.fill();
        }
      }

      // NPCs — pixel sprite bodies (schedule-aware positions)
      const worldTimeFine = ((g.worldTime ?? 0) + (g.worldTimeTick / 1800) * 0.1) % 24;
      for (let ni = 0; ni < NPCS.length; ni++) {
        const n = NPCS[ni];
        const isFleeing = n.reactState === 'FLEEING';
        const isSpectating = n.reactState === 'SPECTATING';
        const sPos = (isFleeing || isSpectating) ? { x: n.x, y: n.y } : getNpcSchedulePos(n, worldTimeFine);
        const nx2 = sPos.x + ox, ny2 = sPos.y + oy;
        if (nx2 < -14 || nx2 > cw + 14 || ny2 < -14 || ny2 > ch + 14) continue;
        const nDist = Math.hypot(g.px - sPos.x, g.py - sPos.y);
        const isNearNpc = nDist < NPC_RANGE;
        const gangPatrolColor = n.role === 'gang_patrol' ? (n.faction === 'rust_syndicate' ? '#ff3c3c' : n.faction === 'void_runners' ? '#ff8c00' : n.faction === 'static_monks' ? '#c8ff00' : n.faction === 'eastern_bloc' ? '#3c64ff' : '#888888') : null;
        const nCol = isFleeing ? '#ff4444' : isSpectating ? '#ffaa00' : gangPatrolColor ?? (n.role === 'blade_runner' ? '#cc44ff' : n.role === 'police' ? '#4488ff' : n.role === 'corpo_military' ? '#ff6644' : (NPC_COL[n.type] ?? '#009922'));
        ctx.shadowColor = nCol; ctx.shadowBlur = isNearNpc ? 6 : 0;
        const isFemale = (n as { gender?: string }).gender === 'f';
        const idle = n.idleBehavior ?? 'WALKING';
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.beginPath(); ctx.ellipse(nx2, ny2 + 8, 5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
        if (idle === 'SITTING' && !isFleeing) {
          ctx.fillStyle = '#c8906c'; ctx.beginPath(); ctx.arc(nx2, ny2 - 4, 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = nCol; ctx.fillRect(nx2 - 3, ny2 - 1, 6, 4);
          ctx.fillStyle = '#223322'; ctx.fillRect(nx2 - 4, ny2 + 3, 8, 3);
          ctx.fillStyle = '#443322'; ctx.fillRect(nx2 - 6, ny2 + 2, 12, 3);
        } else if (idle === 'EATING' && !isFleeing) {
          if (isFemale) {
            ctx.fillStyle = '#c8906c'; ctx.beginPath(); ctx.arc(nx2, ny2 - 7, 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = nCol; ctx.fillRect(nx2 - 2, ny2 - 3, 5, 5);
            ctx.fillStyle = nCol; ctx.beginPath(); ctx.moveTo(nx2 - 4, ny2 + 2); ctx.lineTo(nx2 + 5, ny2 + 2); ctx.lineTo(nx2 + 6, ny2 + 8); ctx.lineTo(nx2 - 5, ny2 + 8); ctx.closePath(); ctx.fill();
          } else {
            ctx.fillStyle = '#c8906c'; ctx.beginPath(); ctx.arc(nx2, ny2 - 7, 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = nCol; ctx.fillRect(nx2 - 4, ny2 - 4, 8, 6);
            ctx.fillStyle = '#223322'; ctx.fillRect(nx2 - 4, ny2 + 2, 3, 5); ctx.fillRect(nx2 + 1, ny2 + 2, 3, 5);
          }
          ctx.fillStyle = '#ffcc88'; ctx.fillRect(nx2 + 4, ny2 - 4, 4, 3);
        } else if (idle === 'BROWSING' && !isFleeing) {
          if (isFemale) {
            ctx.fillStyle = '#c8906c'; ctx.beginPath(); ctx.arc(nx2, ny2 - 7, 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = nCol; ctx.fillRect(nx2 - 2, ny2 - 3, 5, 5);
            ctx.fillStyle = nCol; ctx.beginPath(); ctx.moveTo(nx2 - 4, ny2 + 2); ctx.lineTo(nx2 + 5, ny2 + 2); ctx.lineTo(nx2 + 6, ny2 + 8); ctx.lineTo(nx2 - 5, ny2 + 8); ctx.closePath(); ctx.fill();
          } else {
            ctx.fillStyle = '#c8906c'; ctx.beginPath(); ctx.arc(nx2, ny2 - 7, 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = nCol; ctx.fillRect(nx2 - 4, ny2 - 4, 8, 6);
            ctx.fillStyle = '#223322'; ctx.fillRect(nx2 - 4, ny2 + 2, 3, 5); ctx.fillRect(nx2 + 1, ny2 + 2, 3, 5);
          }
          const bob = Math.sin(g.frame * 0.05 + ni) * 2;
          ctx.fillStyle = '#c8906c'; ctx.fillRect(nx2 + 5, ny2 - 3 + bob, 2, 4);
        } else if (idle === 'TALKING' && !isFleeing) {
          if (isFemale) {
            ctx.fillStyle = '#c8906c'; ctx.beginPath(); ctx.arc(nx2, ny2 - 7, 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = nCol; ctx.fillRect(nx2 - 2, ny2 - 3, 5, 5);
            ctx.fillStyle = '#553322'; ctx.fillRect(nx2 - 3, ny2 - 12, 7, 3); ctx.beginPath(); ctx.arc(nx2, ny2 - 12, 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = nCol; ctx.beginPath(); ctx.moveTo(nx2 - 4, ny2 + 2); ctx.lineTo(nx2 + 5, ny2 + 2); ctx.lineTo(nx2 + 6, ny2 + 8); ctx.lineTo(nx2 - 5, ny2 + 8); ctx.closePath(); ctx.fill();
          } else {
            ctx.fillStyle = '#c8906c'; ctx.beginPath(); ctx.arc(nx2, ny2 - 7, 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = nCol; ctx.fillRect(nx2 - 4, ny2 - 4, 8, 6);
            ctx.fillStyle = '#223322'; ctx.fillRect(nx2 - 4, ny2 + 2, 3, 5); ctx.fillRect(nx2 + 1, ny2 + 2, 3, 5);
          }
          if (g.frame % 60 < 30) {
            ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center';
            ctx.fillText('...', nx2 + 8, ny2 - 12);
          }
        } else if (isFemale) {
          ctx.fillStyle = '#c8906c'; ctx.beginPath(); ctx.arc(nx2, ny2 - 7, 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = nCol; ctx.fillRect(nx2 - 2, ny2 - 3, 5, 5);
          ctx.fillStyle = '#553322'; ctx.fillRect(nx2 - 3, ny2 - 12, 7, 3); ctx.beginPath(); ctx.arc(nx2, ny2 - 12, 2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = nCol; ctx.beginPath(); ctx.moveTo(nx2 - 4, ny2 + 2); ctx.lineTo(nx2 + 5, ny2 + 2); ctx.lineTo(nx2 + 6, ny2 + 8); ctx.lineTo(nx2 - 5, ny2 + 8); ctx.closePath(); ctx.fill();
        } else {
          ctx.fillStyle = '#c8906c'; ctx.beginPath(); ctx.arc(nx2, ny2 - 7, 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = nCol; ctx.fillRect(nx2 - 4, ny2 - 4, 8, 6);
          ctx.fillStyle = '#223322'; ctx.fillRect(nx2 - 4, ny2 + 2, 3, 5); ctx.fillRect(nx2 + 1, ny2 + 2, 3, 5);
        }
        if (isFleeing) {
          ctx.fillStyle = 'rgba(255,68,68,.7)'; ctx.font = '9px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText('!', nx2, ny2 - 16);
        }
        ctx.shadowBlur = 0;
        // Name label
        if (nDist < 90) {
          ctx.font = `${isNearNpc ? 'bold ' : ''}13px "Share Tech Mono"`;
          ctx.textAlign = 'center';
          const nm = n.name;
          const tw = ctx.measureText(nm).width;
          ctx.fillStyle = 'rgba(0,0,0,.55)';
          ctx.beginPath();
          const pillY = ny2 - 28, pillH = 16, pillR = 4;
          ctx.roundRect(nx2 - tw / 2 - 5, pillY, tw + 10, pillH, pillR);
          ctx.fill();
          ctx.fillStyle = isNearNpc ? nCol : 'rgba(0,255,65,.45)';
          ctx.fillText(nm, nx2, ny2 - 16);
        }
        if (isNearNpc && !nb) {
          ctx.fillStyle = g.blink ? 'rgba(0,255,65,.85)' : 'rgba(0,255,65,.3)';
          ctx.font = '13px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText('[E]', nx2, ny2 - 32);
        }
        if (nDist < 120 && nDist > 40) {
          const twText = getTypewriterText(ni);
          if (twText) {
            const rumorAlpha = 0.5 + Math.sin(g.frame * 0.03 + ni) * 0.2;
            const rumorY = ny2 - 42 + Math.sin(g.frame * 0.02 + ni * 2) * 2;
            ctx.fillStyle = `rgba(255,220,100,${rumorAlpha})`;
            ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'center';
            ctx.fillText(`"${twText}"`, nx2, rumorY);
          } else if (g.rumorCooldown <= 0) {
            const gossip = getNearbyGossip(sPos.x, sPos.y, g.frame);
            if (gossip) {
              startTypewriter(gossip, ni, g.frame);
            } else {
              const ctxWhisper = getNpcContextualWhisper(n, g.worldTime ?? 0);
              startTypewriter(ctxWhisper, ni, g.frame);
            }
          }
        }
      }

      g.nearEmployee = null;
      for (let ei = 0; ei < g.employeeNpcs.length; ei++) {
        const emp = g.employeeNpcs[ei];
        const ex = emp.x + ox, ey = emp.y + oy;
        if (ex < -40 || ex > cw + 40 || ey < -40 || ey > ch + 40) continue;
        const eDist = Math.hypot(emp.x - g.px, emp.y - g.py);
        const isNearEmp = eDist < 40;
        if (isNearEmp) g.nearEmployee = ei;
        ctx.save();
        ctx.fillStyle = '#00ccff';
        ctx.fillRect(ex - 5, ey - 14, 10, 14);
        ctx.fillStyle = '#00ccff';
        ctx.fillRect(ex - 3, ey - 18, 6, 4);
        ctx.restore();
        ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center';
        const empLabel = `${emp.name} [${emp.role}]`;
        const etw = ctx.measureText(empLabel).width;
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.beginPath();
        ctx.roundRect(ex - etw / 2 - 4, ey - 30, etw + 8, 12, 3);
        ctx.fill();
        ctx.fillStyle = isNearEmp ? '#00ffff' : 'rgba(0,200,255,.6)';
        ctx.fillText(empLabel, ex, ey - 20);
        if (isNearEmp) {
          ctx.fillStyle = g.blink ? 'rgba(0,200,255,.85)' : 'rgba(0,200,255,.3)';
          ctx.font = '13px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText('[E]', ex, ey - 36);
        }
      }

      // Online players — faction-specific sprites
      for (const [, op] of g.peers) {
        const px2 = op.x + ox, py2 = op.y + oy;
        if (px2 < -20 || px2 > cw + 20 || py2 < -20 || py2 > ch + 20) continue;
        const spk = g.speakingSet.has(op.id);
        const opCls = (op.class ?? '').toLowerCase();
        const opGlow = opCls === 'corporate' ? '#00ff41' : opCls === 'outlaw' ? '#88ff44' : opCls === 'replicant' ? '#33ffaa' : '#44aaff'; // Suits/Outlaws/Replicants
        if (spk) { ctx.shadowColor = 'rgba(0,255,180,.6)'; ctx.shadowBlur = 10; }
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(px2, py2 + 7, 5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
        if (opCls === 'corporate') {
          ctx.fillStyle = '#2a2a2a'; ctx.fillRect(px2 - 4, py2 + 2, 3, 4); ctx.fillRect(px2 + 1, py2 + 2, 3, 4);
          ctx.fillStyle = '#333333'; ctx.fillRect(px2 - 6, py2 - 7, 12, 8);
          ctx.fillStyle = '#cc0000'; ctx.fillRect(px2 - 1, py2 - 5, 2, 4);
          ctx.fillStyle = '#d4906a'; ctx.beginPath(); ctx.arc(px2, py2 - 12, 4, 0, Math.PI * 2); ctx.fill();
        } else if (opCls === 'outlaw') {
          ctx.fillStyle = '#5a4433'; ctx.fillRect(px2 - 4, py2 + 2, 3, 4); ctx.fillRect(px2 + 1, py2 + 2, 3, 4);
          ctx.fillStyle = '#6b5533'; ctx.fillRect(px2 - 6, py2 - 7, 12, 8);
          ctx.fillStyle = '#8a7744'; ctx.fillRect(px2 - 7, py2 - 8, 14, 3);
          ctx.fillStyle = '#d4906a'; ctx.beginPath(); ctx.arc(px2, py2 - 12, 4, 0, Math.PI * 2); ctx.fill();
        } else if (opCls === 'replicant') {
          ctx.fillStyle = '#224455'; ctx.fillRect(px2 - 4, py2 + 2, 3, 4); ctx.fillRect(px2 + 1, py2 + 2, 3, 4);
          ctx.fillStyle = '#2a5566'; ctx.fillRect(px2 - 6, py2 - 7, 12, 8);
          ctx.fillStyle = '#33ffaa'; ctx.fillRect(px2 - 3, py2 - 3, 6, 1);
          ctx.fillStyle = '#aacccc'; ctx.beginPath(); ctx.arc(px2, py2 - 12, 4, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = spk ? '#00ffcc' : '#44aaff';
          ctx.beginPath(); ctx.moveTo(px2, py2 - 9); ctx.lineTo(px2 + 6, py2 + 5); ctx.lineTo(px2 - 6, py2 + 5); ctx.closePath(); ctx.fill();
        }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        if (op.paused) {
          const shieldPulse = 0.3 + Math.sin(g.frame * 0.08) * 0.15;
          ctx.strokeStyle = `rgba(100,200,255,${shieldPulse})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(px2, py2 - 4, 12, 16, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = `rgba(100,200,255,${shieldPulse * 0.15})`;
          ctx.beginPath(); ctx.ellipse(px2, py2 - 4, 12, 16, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.font = 'bold 13px "Share Tech Mono"'; ctx.textAlign = 'center';
        const opNm = op.name;
        const opTw = ctx.measureText(opNm).width;
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.beginPath(); ctx.roundRect(px2 - opTw / 2 - 5, py2 - 24, opTw + 10, 16, 4); ctx.fill();
        ctx.fillStyle = spk ? '#00ffcc' : opGlow;
        ctx.fillText(opNm, px2, py2 - 12);
        if (op.hp !== undefined && op.maxHp && op.maxHp > 0) {
          const barW = 22, barH = 3, barY = py2 - 28;
          ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(px2 - barW / 2, barY, barW, barH);
          const hpPct = Math.max(0, Math.min(1, op.hp / op.maxHp));
          ctx.fillStyle = hpPct > 0.5 ? '#00ff41' : hpPct > 0.25 ? '#ffaa00' : '#ff3333';
          ctx.fillRect(px2 - barW / 2, barY, barW * hpPct, barH);
        }
      }

      // ── Police patrol units ────────────────────────────────────────────────
      for (let pi = 0; pi < g.police.length; pi++) {
        const p = g.police[pi];
        const px2 = p.x + ox, py2 = p.y + oy;
        if (px2 < -20 || px2 > cw + 20 || py2 < -20 || py2 > ch + 20) continue;
        const pFlash = Math.sin(g.frame * 0.2 + pi * 1.7) > 0;
        ctx.shadowColor = pFlash ? '#4488ff' : '#ff3333'; ctx.shadowBlur = 8;
        // Police body — blue uniform
        ctx.fillStyle = '#cc9966'; ctx.beginPath(); ctx.arc(px2, py2 - 8, 3, 0, Math.PI * 2); ctx.fill(); // head
        ctx.fillStyle = '#1144cc'; ctx.fillRect(px2 - 4, py2 - 5, 8, 6); // torso
        ctx.fillStyle = '#0d3399'; ctx.fillRect(px2 - 4, py2 + 1, 3, 5); ctx.fillRect(px2 + 1, py2 + 1, 3, 5); // legs
        ctx.fillStyle = '#ffe066'; ctx.fillRect(px2 - 2, py2 - 4, 4, 2); // badge
        // Light bar flicker
        const lb1 = pFlash ? '#4488ff' : '#ff2222';
        const lb2 = pFlash ? '#ff2222' : '#4488ff';
        ctx.fillStyle = lb1; ctx.fillRect(px2 - 5, py2 - 13, 4, 3);
        ctx.fillStyle = lb2; ctx.fillRect(px2 + 1, py2 - 13, 4, 3);
        ctx.shadowBlur = 0;
        // Label
        const pDist = Math.hypot(g.px - p.x, g.py - p.y);
        if (pDist < 100) {
          ctx.font = '13px "Share Tech Mono"'; ctx.textAlign = 'center';
          const pTw = ctx.measureText('POLICE').width;
          ctx.fillStyle = 'rgba(0,0,0,.55)';
          ctx.beginPath(); ctx.roundRect(px2 - pTw / 2 - 5, py2 - 30, pTw + 10, 16, 4); ctx.fill();
          ctx.fillStyle = '#88aaff';
          ctx.fillText('POLICE', px2, py2 - 18);
        }
      }

      // ── Patrol Band members ─────────────────────────────────────────────
      for (const band of g.bands) {
        for (const m of band.members) {
          if (m.dead) continue;
          const mx2 = m.x + ox, my2 = m.y + oy;
          if (mx2 < -20 || mx2 > cw + 20 || my2 < -20 || my2 > ch + 20) continue;
          const attacking = m.attackCd > 20;
          ctx.save();
          if (attacking) { ctx.shadowColor = band.color; ctx.shadowBlur = 8; }
          ctx.fillStyle = '#cc9966'; ctx.beginPath(); ctx.arc(mx2, my2 - 8, 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = band.color; ctx.fillRect(mx2 - 3, my2 - 5, 6, 5);
          ctx.fillStyle = band.color; ctx.globalAlpha = 0.7; ctx.fillRect(mx2 - 3, my2, 2.5, 4); ctx.fillRect(mx2 + 0.5, my2, 2.5, 4); ctx.globalAlpha = 1;
          if (m.weapon === 'ranged') {
            ctx.fillStyle = '#dddddd'; ctx.fillRect(mx2 + 3, my2 - 4, 5, 1.5);
          } else {
            ctx.fillStyle = '#aaaaaa'; ctx.fillRect(mx2 + 3, my2 - 6, 1.5, 6);
          }
          if (m.hp < m.maxHp) {
            const hpPct = m.hp / m.maxHp;
            ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(mx2 - 6, my2 - 14, 12, 2);
            ctx.fillStyle = hpPct > 0.5 ? '#44ff44' : hpPct > 0.25 ? '#ffaa00' : '#ff4444';
            ctx.fillRect(mx2 - 6, my2 - 14, 12 * hpPct, 2);
          }
          ctx.restore();
        }
        const alive = band.members.filter(m => !m.dead);
        if (alive.length > 0) {
          const avgX = alive.reduce((s, m) => s + m.x, 0) / alive.length + ox;
          const avgY = alive.reduce((s, m) => s + m.y, 0) / alive.length + oy;
          const bDist = Math.hypot(g.px - alive[0].x, g.py - alive[0].y);
          if (bDist < 180) {
            ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center';
            const bLabel = `${band.label} [${alive.length}]`;
            const btw = ctx.measureText(bLabel).width;
            ctx.fillStyle = 'rgba(0,0,0,.55)';
            ctx.beginPath(); ctx.roundRect(avgX - btw / 2 - 4, avgY - 28, btw + 8, 12, 3); ctx.fill();
            ctx.fillStyle = band.color;
            ctx.fillText(bLabel, avgX, avgY - 18);
          }
        }
      }

      // ── Fire overlays on burning buildings ─────────────────────────────────
      for (const fire of g.fires) {
        const bld = BUILDINGS.find(b => b.id === fire.bid); if (!bld) continue;
        const fbx = bld.x + ox, fby = bld.y + oy;
        if (fbx + bld.w < 0 || fbx > cw || fby + bld.h < 0 || fby > ch) continue;
        const phase2 = Math.sin(g.frame * 0.22 + fire.x * 0.01) * 0.4 + 0.6;
        ctx.globalAlpha = 0.25 * phase2 * fire.intensity;
        ctx.fillStyle = '#ff6600'; ctx.fillRect(fbx, fby, bld.w, bld.h);
        ctx.globalAlpha = 1;
        // Flame tips
        for (let ft = 0; ft < 5; ft++) {
          const fmx = fbx + (ft / 4) * bld.w;
          const fmy = fby - 4 + Math.sin(g.frame * 0.3 + ft * 1.2) * 5;
          ctx.fillStyle = ft % 2 === 0 ? '#ff8800' : '#ffcc00';
          ctx.beginPath(); ctx.moveTo(fmx, fmy); ctx.lineTo(fmx + 5, fby); ctx.lineTo(fmx - 5, fby); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#ff2200'; ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center';
        ctx.fillText('🔥 FIRE', fbx + bld.w / 2, fby - 12);
      }

      // Dead bodies — fallen enemies and players
      for (const body of g.deadBodies) {
        const bx = body.x + ox, by = body.y + oy;
        if (bx < -12 || bx > cw + 12 || by < -12 || by > ch + 12) continue;
        const isPlayer = body.type === 'PLAYER';
        const bc = isPlayer ? '#cc8866' : (THREAT_COL[body.type] ?? '#ff4444');
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.beginPath(); ctx.ellipse(bx, by + 2, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = bc;
        if (isPlayer) {
          ctx.fillRect(bx - 5, by - 1, 10, 4);
          ctx.beginPath(); ctx.arc(bx - 7, by - 1, 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillRect(bx + 2, by + 3, 3, 3);
          ctx.fillRect(bx - 3, by + 3, 3, 3);
        } else {
          ctx.fillRect(bx - 6, by - 1, 12, 3);
          ctx.beginPath(); ctx.arc(bx - 7, by, 2, 0, Math.PI * 2); ctx.fill();
          ctx.fillRect(bx + 2, by + 2, 4, 2);
          ctx.fillRect(bx - 4, by + 2, 4, 2);
        }
        ctx.globalAlpha = 1;
        if (!body.looted && body.type !== 'PLAYER' && (body.bounty ?? 0) > 0) {
          const lootDist = Math.hypot(g.px - body.x, g.py - body.y);
          const lootPulse = 0.5 + Math.sin(g.frame * 0.12) * 0.3;
          ctx.fillStyle = `rgba(255,221,68,${lootPulse})`;
          ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText(`ƒ${(body.bounty ?? 0).toLocaleString()}`, bx, by - 8);
          if (lootDist < 50) {
            ctx.fillStyle = `rgba(255,221,68,${lootPulse * 0.8})`;
            ctx.font = '6px "Share Tech Mono"';
            ctx.fillText('[E] LOOT', bx, by - 16);
          }
        }
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#ff0000';
        ctx.beginPath(); ctx.ellipse(bx + 2, by + 1, 5, 2, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Threats — type-specific pixel shapes
      for (const t of g.threats) {
        const tx = t.x + ox, ty = t.y + oy;
        if (tx < -12 || tx > cw + 12 || ty < -12 || ty > ch + 12) continue;
        const tc = THREAT_COL[t.type] ?? '#ff4444';
        const dist2 = Math.hypot(g.px - t.x, g.py - t.y);
        const chasing = t.behavior === 'HOSTILE';
        const a = chasing ? 1 : (t.behavior === 'SLEEPING' ? 0.3 : t.behavior === 'CAMPING' ? 0.45 : 0.5);
        ctx.globalAlpha = a;
        ctx.shadowColor = tc; ctx.shadowBlur = chasing ? 7 : 2;
        // Ground shadow
        ctx.fillStyle = 'rgba(0,0,0,.2)';
        ctx.beginPath(); ctx.ellipse(tx, ty + 6, 5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = tc;
        if (t.type === 'PROWLER') {
          // Crouching diamond — stealthy
          ctx.beginPath(); ctx.moveTo(tx, ty-5); ctx.lineTo(tx+4,ty); ctx.lineTo(tx,ty+5); ctx.lineTo(tx-4,ty); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth=.5; ctx.stroke();
        } else if (t.type === 'BORDER_GANG') {
          // Chunky person silhouette
          ctx.fillRect(tx-4, ty-6, 8, 6); // torso
          ctx.beginPath(); ctx.arc(tx, ty-9, 3, 0, Math.PI*2); ctx.fill(); // head
          ctx.fillRect(tx-4, ty, 3, 5); ctx.fillRect(tx+1, ty, 3, 5); // legs
        } else if (t.type === 'RUST_SYNDICATE') {
          ctx.fillStyle = '#cc3333'; ctx.fillRect(tx-4,ty-7,8,7);
          ctx.fillStyle = '#ff5544'; ctx.beginPath(); ctx.arc(tx,ty-10,3,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = '#cc3333'; ctx.fillRect(tx-6,ty-6,2,5); ctx.fillRect(tx+4,ty-6,2,5);
          ctx.fillRect(tx-3,ty,3,5); ctx.fillRect(tx+1,ty,3,5);
          ctx.fillStyle = '#aa2222'; ctx.fillRect(tx-1,ty-5,2,3);
        } else if (t.type === 'VOID_RUNNERS') {
          ctx.fillStyle = '#dd7700'; ctx.fillRect(tx-4,ty-8,8,8);
          ctx.fillStyle = '#ffaa33'; ctx.beginPath(); ctx.arc(tx,ty-11,3.5,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = '#dd7700'; ctx.fillRect(tx-6,ty-7,2,6); ctx.fillRect(tx+4,ty-7,2,6);
          ctx.fillRect(tx-3,ty,3,5); ctx.fillRect(tx+1,ty,3,5);
          ctx.fillStyle = '#bb5500'; ctx.fillRect(tx-2,ty-6,4,2);
        } else if (t.type === 'STATIC_MONKS') {
          ctx.fillStyle = '#88cc11'; ctx.fillRect(tx-4,ty-8,8,8);
          ctx.fillStyle = '#aaee22'; ctx.beginPath(); ctx.arc(tx,ty-11,3,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = '#88cc11'; ctx.fillRect(tx-5,ty-7,2,5); ctx.fillRect(tx+3,ty-7,2,5);
          ctx.fillRect(tx-3,ty,3,5); ctx.fillRect(tx+1,ty,3,5);
          ctx.fillStyle = '#668800'; ctx.fillRect(tx-1,ty-10,2,1);
        } else if (t.type === 'EASTERN_BLOC') {
          ctx.fillStyle = '#3366dd'; ctx.fillRect(tx-5,ty-8,10,8);
          ctx.fillStyle = '#5588ff'; ctx.beginPath(); ctx.arc(tx,ty-11,3.5,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = '#3366dd'; ctx.fillRect(tx-7,ty-7,2,6); ctx.fillRect(tx+5,ty-7,2,6);
          ctx.fillRect(tx-4,ty,3,5); ctx.fillRect(tx+1,ty,3,5);
          ctx.fillStyle = '#224499'; ctx.fillRect(tx-3,ty-6,6,2);
        } else if (t.type === 'MINX_CITY') {
          // MINX CITY — dominant gang, heavy armored soldier
          ctx.fillStyle = '#6622aa'; ctx.fillRect(tx-6,ty-9,12,10); // heavy body armor
          ctx.fillStyle = '#cc44ff'; ctx.beginPath(); ctx.arc(tx,ty-12,4.5,0,Math.PI*2); ctx.fill(); // head
          ctx.fillStyle = '#6622aa'; ctx.fillRect(tx-8,ty-8,3,7); ctx.fillRect(tx+5,ty-8,3,7); // arms
          ctx.fillRect(tx-5,ty+1,4,6); ctx.fillRect(tx+1,ty+1,4,6); // legs
          ctx.fillStyle = '#ee88ff'; ctx.fillRect(tx-4,ty-7,8,2); // visor
          ctx.fillStyle = '#cc44ff'; ctx.font = '5px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText('MC', tx, ty-17);
          if (chasing) {
            ctx.fillStyle = '#cc44ff'; ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'center';
            ctx.fillText('MINX CITY', tx, ty - 22);
          }
        } else if (t.type === 'MUTANT') {
          // Irregular blob
          ctx.beginPath(); ctx.arc(tx,ty,6,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='rgba(255,255,255,.15)'; ctx.fillRect(tx-3,ty-3,2,2); ctx.fillRect(tx+1,ty-4,3,2);
          ctx.fillStyle=tc; ctx.fillRect(tx-8,ty-2,3,4); ctx.fillRect(tx+5,ty-3,3,5); // limbs
        } else if (t.type === 'SPY') {
          // Disguised agent — looks like a plain person (no hostile indicator until chasing)
          ctx.fillStyle = chasing ? tc : 'rgba(200,200,180,.65)';
          ctx.fillRect(tx-3, ty-7, 7, 6); // torso
          ctx.beginPath(); ctx.arc(tx, ty-10, 3.5, 0, Math.PI*2); ctx.fill(); // head
          ctx.fillRect(tx-3, ty-1, 2.5, 5); ctx.fillRect(tx+1, ty-1, 2.5, 5); // legs
          if (chasing) {
            ctx.strokeStyle = '#ffffaa'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(tx, ty, 11, 0, Math.PI*2); ctx.stroke();
            ctx.fillStyle = '#ffffaa'; ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'center';
            ctx.fillText('!! SPY', tx, ty - 15);
          }
        } else if (t.type === 'PABLO_GUARD') {
          // PABLO Corp android guard — blue armored
          ctx.fillStyle = '#2244aa'; ctx.fillRect(tx-5,ty-8,10,8); // body armor
          ctx.fillStyle = '#5599ff'; ctx.beginPath(); ctx.arc(tx,ty-11,4,0,Math.PI*2); ctx.fill(); // head
          ctx.fillStyle = '#2244aa'; ctx.fillRect(tx-7,ty-7,2,6); ctx.fillRect(tx+5,ty-7,2,6); // arms
          ctx.fillRect(tx-4,ty,3,5); ctx.fillRect(tx+1,ty,3,5); // legs
          ctx.fillStyle = '#88aaff'; ctx.fillRect(tx-3,ty-6,6,2); // visor
          if (chasing) {
            ctx.fillStyle = '#5599ff'; ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'center';
            ctx.fillText('PABLO GUARD', tx, ty - 15);
          }
        } else if (t.type === 'STRAY_DOG') {
          ctx.fillStyle = '#aa8855';
          ctx.fillRect(tx-5,ty-2,10,5);
          ctx.fillRect(tx-5,ty+3,2,3); ctx.fillRect(tx-1,ty+3,2,3);
          ctx.fillRect(tx+1,ty+3,2,3); ctx.fillRect(tx+3,ty+3,2,3);
          ctx.beginPath(); ctx.arc(tx-7,ty-3,3,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = '#887744';
          ctx.fillRect(tx-9,ty-6,2,2); ctx.fillRect(tx-6,ty-6,2,2);
          ctx.fillStyle = '#111'; ctx.fillRect(tx-8,ty-4,1,1); ctx.fillRect(tx-6,ty-4,1,1);
          ctx.fillStyle = '#aa8855'; ctx.fillRect(tx+5,ty-3+Math.sin(g.frame*0.2)*2,4,1.5);
          if (!g.dogCompanion.active) {
            const pDist = Math.hypot(g.px - t.x, g.py - t.y);
            if (pDist < 60) {
              ctx.fillStyle = g.blink ? '#ffaa44' : 'rgba(255,170,68,.4)';
              ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'center';
              ctx.fillText('[E] ADOPT', tx, ty - 10);
            }
          }
        } else if (t.type === 'VAGRANT') {
          ctx.fillStyle = '#887766';
          ctx.fillRect(tx-3,ty-6,6,5);
          ctx.beginPath(); ctx.arc(tx,ty-9,3,0,Math.PI*2); ctx.fill();
          ctx.fillRect(tx-3,ty-1,2.5,4); ctx.fillRect(tx+1,ty-1,2.5,4);
        } else if (t.type === 'SCAVENGER') {
          ctx.fillStyle = '#99aa66';
          ctx.fillRect(tx-3,ty-7,7,6);
          ctx.beginPath(); ctx.arc(tx,ty-10,3,0,Math.PI*2); ctx.fill();
          ctx.fillRect(tx-3,ty-1,2.5,5); ctx.fillRect(tx+1,ty-1,2.5,5);
          ctx.fillRect(tx+4,ty-6,4,2);
        } else if (t.type === 'RAT') {
          ctx.fillStyle = '#776655';
          ctx.fillRect(tx-3,ty,6,3);
          ctx.beginPath(); ctx.arc(tx-4,ty,2,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = '#554433';
          ctx.fillRect(tx-5,ty-1,1,1);
          ctx.fillRect(tx+3,ty+1+Math.sin(g.frame*0.3)*1,4,1);
        } else {
          ctx.beginPath(); ctx.moveTo(tx,ty-7); ctx.lineTo(tx+5,ty); ctx.lineTo(tx,ty+7); ctx.lineTo(tx-5,ty); ctx.closePath(); ctx.fill();
          ctx.fillStyle='rgba(255,255,255,.2)'; ctx.fillRect(tx-2,ty-3,4,6);
        }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        if (!PASSIVE_THREATS.has(t.type)) {
          if (t.behavior === 'SLEEPING') {
            const zOff = Math.sin(g.frame * 0.05) * 3;
            ctx.fillStyle = 'rgba(100,150,255,.7)'; ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center';
            ctx.fillText('z', tx + 8, ty - 10 + zOff);
            ctx.fillText('Z', tx + 14, ty - 16 + zOff * 0.7);
            ctx.font = '10px "Share Tech Mono"';
            ctx.fillText('Z', tx + 20, ty - 22 + zOff * 0.5);
          } else if (t.behavior === 'CAMPING') {
            const flicker = Math.sin(g.frame * 0.15) * 2;
            ctx.fillStyle = 'rgba(255,140,30,.6)'; ctx.shadowColor = 'rgba(255,100,0,.5)'; ctx.shadowBlur = 6 + flicker;
            ctx.beginPath(); ctx.moveTo(tx - 6, ty + 10); ctx.lineTo(tx, ty + 4 + flicker); ctx.lineTo(tx + 6, ty + 10); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,200,50,.4)';
            ctx.beginPath(); ctx.moveTo(tx - 3, ty + 10); ctx.lineTo(tx, ty + 6 + flicker * 0.5); ctx.lineTo(tx + 3, ty + 10); ctx.closePath(); ctx.fill();
            ctx.shadowBlur = 0;
          } else if (t.behavior === 'SOCIALIZING') {
            const nearSocial = g.threats.some(o => o !== t && o.type === t.type && o.behavior === 'SOCIALIZING' && Math.hypot(o.x - t.x, o.y - t.y) < 60);
            ctx.fillStyle = nearSocial ? 'rgba(255,255,100,.5)' : 'rgba(255,255,255,.35)'; ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'center';
            if (nearSocial) {
              const laughPhase = Math.sin(g.frame * 0.08 + t.ox * 0.1) > 0.5;
              ctx.fillText(laughPhase ? 'ha' : '...', tx + 10, ty - 8);
              ctx.strokeStyle = 'rgba(255,255,100,.15)'; ctx.lineWidth = 0.5;
              ctx.beginPath(); ctx.arc(tx, ty, 30, 0, Math.PI * 2); ctx.stroke();
            } else {
              ctx.fillText('...', tx + 10, ty - 8);
            }
          } else if (t.behavior === 'WORKING') {
            const hammerAng = Math.sin(g.frame * 0.1) * 0.4;
            ctx.save(); ctx.translate(tx + 8, ty - 6); ctx.rotate(hammerAng);
            ctx.fillStyle = 'rgba(180,180,180,.5)'; ctx.fillRect(-1, -5, 2, 5); ctx.fillRect(-2, -7, 4, 3);
            ctx.restore();
          }
        }
        if (chasing) {
          ctx.fillStyle = tc; ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText(t.type.replace('_',' '), tx, ty - 12);
          const barW = 26, barH = 3;
          const bx2 = tx - barW / 2, by2 = ty - 10;
          ctx.fillStyle = '#220000'; ctx.fillRect(bx2, by2, barW, barH);
          ctx.fillStyle = tc; ctx.fillRect(bx2, by2, barW * (t.hp / t.maxHp), barH);
        }
        if (g.attackFlash > 0 && dist2 < 72) {
          ctx.strokeStyle = `rgba(255,255,100,${g.attackFlash / 8})`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(tx, ty, 11, 0, Math.PI * 2); ctx.stroke();
        }
      }

      const px = g.px + ox, py2 = g.py + oy;
      const isFlash = g.invincible % 4 < 2;
      const pCls = char.class.toLowerCase();
      const costumeColor = (() => { const ac = g.activeCostume; if (ac === 'default') return null; const c = CLOTHES.find(cl => cl.id === ac); return c ? c.color : null; })();
      const factionGlow = costumeColor ?? (pCls === 'corporate' ? '#00ff41' : pCls === 'outlaw' ? '#88ff44' : pCls === 'replicant' ? '#33ffaa' : '#00ff41');
      const bodyAlpha = isFlash ? 1 : 0.3;
      ctx.globalAlpha = bodyAlpha;
      ctx.shadowColor = g.poisoned ? '#88ff44' : factionGlow; ctx.shadowBlur = 6;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath(); ctx.ellipse(px, py2 + 9, g.vehicle ? 10 : 7, g.vehicle ? 3.5 : 2.5, 0, 0, Math.PI * 2); ctx.fill();
      const facingDir = g.facing;
      if (g.vehicle) {
        const vIsHoriz = facingDir === 'left' || facingDir === 'right';
        if (g.vehicle === 'motorcycle') {
          if (vIsHoriz) {
            ctx.fillStyle = '#cc2222'; ctx.fillRect(px - 9, py2 + 1, 18, 7);
            ctx.fillStyle = '#881111'; ctx.fillRect(px - 7, py2 - 1, 14, 3);
            ctx.fillStyle = '#ffcc44'; ctx.fillRect(px + (facingDir === 'right' ? 8 : -10), py2 + 2, 3, 2);
            ctx.fillStyle = '#ff4444'; ctx.fillRect(px + (facingDir === 'right' ? -10 : 8), py2 + 3, 2, 2);
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(px - 7, py2 + 9, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(px + 7, py2 + 9, 3, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.fillStyle = '#cc2222'; ctx.fillRect(px - 5, py2 - 2, 10, 16);
            ctx.fillStyle = '#881111'; ctx.fillRect(px - 3, py2 - 4, 6, 4);
            ctx.fillStyle = '#ffcc44'; ctx.fillRect(px - 2, py2 - 5, 4, 2);
            ctx.fillStyle = '#ff4444'; ctx.fillRect(px - 2, py2 + 13, 4, 2);
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(px, py2 + 12, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(px, py2 - 1, 2.5, 0, Math.PI * 2); ctx.fill();
          }
        } else {
          if (vIsHoriz) {
            const vc = g.vehicle === 'cargo_bike' ? '#886622' : g.vehicle === 'hover_scooter' ? '#2266aa' : '#553344';
            ctx.fillStyle = vc; ctx.fillRect(px - 10, py2 + 1, 20, 8);
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(px - 6, py2 + 10, 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(px + 6, py2 + 10, 2.5, 0, Math.PI * 2); ctx.fill();
          } else {
            const vc = g.vehicle === 'cargo_bike' ? '#886622' : g.vehicle === 'hover_scooter' ? '#2266aa' : '#553344';
            ctx.fillStyle = vc; ctx.fillRect(px - 5, py2, 10, 16);
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(px, py2 + 14, 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(px, py2 + 2, 2.5, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      ctx.globalAlpha = bodyAlpha;
      const wf = g.walkFrame;
      const lLeg = Math.sin(wf / 28 * Math.PI * 2) * 3;
      const rLeg = -lLeg;
      const idleBob = g.walkFrame === 0 ? Math.sin(g.idleFrame * 0.08) * 0.5 : 0;
      const facingRight = facingDir === 'right';
      const facingLeft = facingDir === 'left';
      const facingUp = facingDir === 'up';
      const armOffX = facingRight ? 2 : facingLeft ? -2 : 0;

      if (pCls === 'corporate') {
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(px - 6, py2 + 4 + lLeg, 4, 5); ctx.fillRect(px + 2, py2 + 4 + rLeg, 4, 5);
        ctx.fillStyle = '#2a2a2a'; ctx.fillRect(px - 5, py2 - 1 + lLeg * 0.5, 4, 6); ctx.fillRect(px + 1, py2 - 1 + rLeg * 0.5, 4, 6);
        ctx.fillStyle = g.poisoned ? '#557722' : (costumeColor ?? '#333333'); ctx.fillRect(px - 7, py2 - 9 + idleBob, 14, 9);
        ctx.fillStyle = '#eeeeee'; ctx.fillRect(px - 2, py2 - 9 + idleBob, 4, 2);
        ctx.fillStyle = '#cc0000'; ctx.fillRect(px - 1, py2 - 7 + idleBob, 2, 5);
        ctx.fillStyle = g.poisoned ? '#557722' : (costumeColor ?? '#333333');
        ctx.fillRect(px - 10 + armOffX, py2 - 8 + idleBob, 3, 7); ctx.fillRect(px + 7 + armOffX, py2 - 8 + idleBob, 3, 7);
        ctx.fillStyle = '#d4906a'; ctx.beginPath(); ctx.arc(px, py2 - 15 + idleBob, 5, 0, Math.PI * 2); ctx.fill();
        if (!facingUp) {
          ctx.fillStyle = '#1a0a00'; ctx.fillRect(px - 3, py2 - 17 + idleBob, 2, 2); ctx.fillRect(px + 1, py2 - 17 + idleBob, 2, 2);
          ctx.fillStyle = '#c87a55'; ctx.fillRect(px - 1, py2 - 13 + idleBob, 2, 1);
        }
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(px - 5, py2 - 22 + idleBob, 10, 5);
        ctx.beginPath(); ctx.arc(px, py2 - 21 + idleBob, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#222'; ctx.fillRect(px - 6, py2 - 18 + idleBob, 1, 3); ctx.fillRect(px + 5, py2 - 18 + idleBob, 1, 3);
      } else if (pCls === 'outlaw') {
        ctx.fillStyle = '#4a3322'; ctx.fillRect(px - 6, py2 + 4 + lLeg, 4, 5); ctx.fillRect(px + 2, py2 + 4 + rLeg, 4, 5);
        ctx.fillStyle = '#5a4433'; ctx.fillRect(px - 5, py2 - 1 + lLeg * 0.5, 4, 6); ctx.fillRect(px + 1, py2 - 1 + rLeg * 0.5, 4, 6);
        ctx.fillStyle = g.poisoned ? '#557722' : (costumeColor ?? '#6b5533'); ctx.fillRect(px - 7, py2 - 9 + idleBob, 14, 9);
        ctx.fillStyle = '#8a7744'; ctx.fillRect(px - 8, py2 - 10 + idleBob, 16, 3);
        ctx.fillStyle = '#554422'; ctx.fillRect(px - 9 + armOffX, py2 - 4 + idleBob, 2, 6);
        ctx.fillStyle = g.poisoned ? '#557722' : (costumeColor ?? '#6b5533');
        ctx.fillRect(px - 10 + armOffX, py2 - 8 + idleBob, 3, 7); ctx.fillRect(px + 7 + armOffX, py2 - 8 + idleBob, 3, 7);
        ctx.fillStyle = '#d4906a'; ctx.beginPath(); ctx.arc(px, py2 - 15 + idleBob, 5, 0, Math.PI * 2); ctx.fill();
        if (!facingUp) {
          ctx.fillStyle = '#1a0a00'; ctx.fillRect(px - 3, py2 - 17 + idleBob, 2, 2); ctx.fillRect(px + 1, py2 - 17 + idleBob, 2, 2);
          ctx.fillStyle = '#887744'; ctx.fillRect(px - 2, py2 - 14 + idleBob, 4, 1);
        }
        ctx.fillStyle = '#665533'; ctx.fillRect(px - 6, py2 - 23 + idleBob, 12, 7);
        ctx.fillStyle = '#776644'; ctx.fillRect(px - 7, py2 - 18 + idleBob, 14, 2);
        ctx.fillStyle = '#554422'; ctx.fillRect(px - 4, py2 - 24 + idleBob, 8, 2);
      } else if (pCls === 'replicant') {
        ctx.fillStyle = '#1a3344'; ctx.fillRect(px - 6, py2 + 4 + lLeg, 4, 5); ctx.fillRect(px + 2, py2 + 4 + rLeg, 4, 5);
        ctx.fillStyle = '#224455'; ctx.fillRect(px - 5, py2 - 1 + lLeg * 0.5, 4, 6); ctx.fillRect(px + 1, py2 - 1 + rLeg * 0.5, 4, 6);
        ctx.fillStyle = g.poisoned ? '#557722' : (costumeColor ?? '#2a5566'); ctx.fillRect(px - 7, py2 - 9 + idleBob, 14, 9);
        ctx.fillStyle = '#33ffaa'; ctx.fillRect(px - 3, py2 - 5 + idleBob, 6, 1);
        ctx.fillStyle = '#33ffaa44'; ctx.fillRect(px - 6, py2 - 8 + idleBob, 1, 6); ctx.fillRect(px + 5, py2 - 8 + idleBob, 1, 6);
        ctx.fillStyle = g.poisoned ? '#557722' : (costumeColor ?? '#2a5566');
        ctx.fillRect(px - 10 + armOffX, py2 - 8 + idleBob, 3, 7); ctx.fillRect(px + 7 + armOffX, py2 - 8 + idleBob, 3, 7);
        ctx.fillStyle = '#aacccc'; ctx.beginPath(); ctx.arc(px, py2 - 15 + idleBob, 5, 0, Math.PI * 2); ctx.fill();
        if (!facingUp) {
          ctx.fillStyle = '#33ffaa'; ctx.fillRect(px - 3, py2 - 17 + idleBob, 2, 2); ctx.fillRect(px + 1, py2 - 17 + idleBob, 2, 2);
          ctx.fillStyle = '#33ffaa88'; ctx.fillRect(px - 1, py2 - 13 + idleBob, 2, 1);
        }
        ctx.fillStyle = '#33ffaa'; ctx.fillRect(px - 5, py2 - 22 + idleBob, 10, 2);
        ctx.fillStyle = '#224455'; ctx.fillRect(px - 5, py2 - 21 + idleBob, 10, 5);
        ctx.fillStyle = '#33ffaa44'; ctx.fillRect(px - 3, py2 - 23 + idleBob, 6, 1);
      } else {
        ctx.fillStyle = '#224422'; ctx.fillRect(px - 6, py2 + 4 + lLeg, 4, 5); ctx.fillRect(px + 2, py2 + 4 + rLeg, 4, 5);
        ctx.fillStyle = '#335533'; ctx.fillRect(px - 5, py2 - 1 + lLeg * 0.5, 4, 6); ctx.fillRect(px + 1, py2 - 1 + rLeg * 0.5, 4, 6);
        const defCol = g.poisoned ? '#557722' : (costumeColor ?? (isFlash ? '#446644' : '#33553380'));
        ctx.fillStyle = defCol; ctx.fillRect(px - 7, py2 - 9 + idleBob, 14, 9);
        ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(px - 2, py2 - 9 + idleBob, 4, 3);
        ctx.fillStyle = defCol;
        ctx.fillRect(px - 10 + armOffX, py2 - 9 + idleBob, 3, 8); ctx.fillRect(px + 7 + armOffX, py2 - 9 + idleBob, 3, 8);
        ctx.fillStyle = '#d4906a'; ctx.fillRect(px - 10 + armOffX, py2 - 1 + idleBob, 3, 2); ctx.fillRect(px + 7 + armOffX, py2 - 1 + idleBob, 3, 2);
        ctx.fillStyle = '#d4906a'; ctx.beginPath(); ctx.arc(px, py2 - 16 + idleBob, 5.5, 0, Math.PI * 2); ctx.fill();
        if (!facingUp) {
          ctx.fillStyle = '#1a0a00'; ctx.fillRect(px - 3, py2 - 17 + idleBob, 2, 2); ctx.fillRect(px + 1, py2 - 17 + idleBob, 2, 2);
          ctx.fillStyle = '#c87a55'; ctx.fillRect(px - 1, py2 - 13 + idleBob, 2, 1);
        }
        ctx.fillStyle = '#332211'; ctx.fillRect(px - 5, py2 - 22 + idleBob, 10, 6);
        ctx.beginPath(); ctx.arc(px, py2 - 21 + idleBob, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#221108'; ctx.fillRect(px - 6, py2 - 18 + idleBob, 1, 3); ctx.fillRect(px + 5, py2 - 18 + idleBob, 1, 3);
      }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      if (gamePausedRef.current) {
        const shieldPulse = 0.35 + Math.sin(g.frame * 0.06) * 0.15;
        ctx.strokeStyle = `rgba(100,220,255,${shieldPulse})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(px, py2 - 4, 14, 18, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = `rgba(100,220,255,${shieldPulse * 0.12})`;
        ctx.beginPath(); ctx.ellipse(px, py2 - 4, 14, 18, 0, 0, Math.PI * 2); ctx.fill();
        ctx.font = 'bold 8px "Share Tech Mono"'; ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(100,220,255,${shieldPulse + 0.1})`;
        ctx.fillText('BREAK', px, py2 - 24);
      }
      // Attack swing arc (varies by weapon)
      if (g.attackFlash > 0) {
        const curWpn = WEAPONS.find(w => w.id === activeWeaponRef.current) ?? WEAPONS[0];
        if (curWpn.type === 'melee') {
          if (curWpn.icon === 'sword') {
            ctx.strokeStyle = `rgba(255,100,68,${g.attackFlash / 8})`; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(px, py2, curWpn.range, -0.8, 0.8); ctx.stroke();
          } else {
            ctx.strokeStyle = `rgba(255,255,0,${g.attackFlash / 8})`; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(px, py2, curWpn.range, 0, Math.PI * 2); ctx.stroke();
          }
        }
      }

      // Render projectiles
      for (const p of g.projectiles) {
        const ppx = p.x + ox, ppy = p.y + oy;
        if (ppx < -10 || ppx > cw + 10 || ppy < -10 || ppy > ch + 10) continue;
        if (p.type === 'laser') {
          ctx.strokeStyle = `rgba(255,68,170,${0.6 + Math.sin(g.frame * 0.2) * 0.3})`; ctx.lineWidth = 3;
          ctx.shadowColor = '#ff44aa'; ctx.shadowBlur = 8;
          ctx.beginPath(); ctx.moveTo(ppx - p.dx * 2, ppy - p.dy * 2); ctx.lineTo(ppx, ppy); ctx.stroke();
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = '#88aaff';
          ctx.shadowColor = '#88aaff'; ctx.shadowBlur = 6;
          ctx.beginPath(); ctx.arc(ppx, ppy, 3, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // Render bombs
      for (const bm of g.bombs) {
        const bmx = bm.x + ox, bmy = bm.y + oy;
        const progress = 1 - bm.timer / 45;
        if (bm.timer > 0) {
          ctx.fillStyle = `rgba(255,204,0,${0.5 + Math.sin(g.frame * 0.3) * 0.3})`;
          ctx.beginPath(); ctx.arc(bmx, bmy, 5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = `rgba(255,204,0,${0.3 * progress})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(bmx, bmy, bm.radius * progress, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(255,200,0,${0.4})`; ctx.beginPath(); ctx.arc(bmx, bmy, bm.radius, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (speaking) { ctx.strokeStyle = 'rgba(0,255,180,.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(px, py2, 14, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      ctx.font = 'bold 14px "Share Tech Mono"'; ctx.textAlign = 'center';
      const pnTw = ctx.measureText(char.name).width;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.beginPath(); ctx.roundRect(px - pnTw / 2 - 5, py2 - 36, pnTw + 10, 18, 4); ctx.fill();
      ctx.fillStyle = 'rgba(0,255,65,.7)';
      ctx.fillText(char.name, px, py2 - 22);

      // ── Dog companion sprite ───────────────────────────────────────────────
      if (dog.active) {
        const dx2 = dog.x + ox, dy2 = dog.y + oy;
        if (dx2 > -20 && dx2 < cw + 20 && dy2 > -20 && dy2 < ch + 20) {
          const dogAlpha = dog.injured ? 0.35 : 0.9;
          ctx.globalAlpha = dogAlpha;
          ctx.shadowColor = dog.injured ? '#ff6644' : '#ffaa44'; ctx.shadowBlur = 8;
          ctx.fillStyle = 'rgba(0,0,0,.2)';
          ctx.beginPath(); ctx.ellipse(dx2, dy2 + 5, 7, 2, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = dog.injured ? '#664422' : '#cc8844';
          ctx.fillRect(dx2 - 8, dy2 - 3, 16, 7);
          ctx.fillRect(dx2 - 8, dy2 + 4, 3, 4); ctx.fillRect(dx2 - 3, dy2 + 4, 3, 4);
          ctx.fillRect(dx2 + 2, dy2 + 4, 3, 4); ctx.fillRect(dx2 + 6, dy2 + 4, 3, 4);
          ctx.fillStyle = dog.injured ? '#553311' : '#aa6633';
          ctx.beginPath(); ctx.arc(dx2 - 10, dy2 - 4, 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffaa44';
          ctx.fillRect(dx2 - 12, dy2 - 8, 2, 3); ctx.fillRect(dx2 - 8, dy2 - 8, 2, 3);
          ctx.fillStyle = '#111'; ctx.fillRect(dx2 - 11, dy2 - 5, 1.5, 1.5); ctx.fillRect(dx2 - 9, dy2 - 5, 1.5, 1.5);
          ctx.fillStyle = '#221100'; ctx.fillRect(dx2 - 11, dy2 - 3, 3, 2);
          ctx.fillStyle = dog.injured ? '#664422' : '#bb7733';
          ctx.fillRect(dx2 + 8, dy2 - 4 + Math.sin(g.frame * 0.15) * 2, 5, 2);
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
          if (dog.injured) {
            ctx.fillStyle = '#ff4444'; ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'center';
            ctx.fillText('INJURED', dx2, dy2 - 12);
          } else {
            ctx.fillStyle = '#ffaa44'; ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'center';
            ctx.fillText(dog.name, dx2, dy2 - 12);
            const dhpPct = dog.hp / dog.maxHp;
            const barW2 = 22, barH2 = 2;
            ctx.fillStyle = '#220800'; ctx.fillRect(dx2 - barW2 / 2, dy2 - 9, barW2, barH2);
            ctx.fillStyle = dhpPct > 0.5 ? '#ffaa44' : dhpPct > 0.25 ? '#ff8800' : '#ff4444';
            ctx.fillRect(dx2 - barW2 / 2, dy2 - 9, barW2 * dhpPct, barH2);
          }
        }
      }

      // ── PABLO Corp android guards (city patrol) ──────────────────────────
      for (const guard of g.guards) {
        const gx2 = guard.x + ox, gy2 = guard.y + oy;
        if (gx2 < -16 || gx2 > cw + 16 || gy2 < -16 || gy2 > ch + 16) continue;
        const gdist2 = Math.hypot(g.px - guard.x, g.py - guard.y);
        ctx.globalAlpha = 0.9;
        ctx.shadowColor = '#4488ff'; ctx.shadowBlur = gdist2 < 80 ? 10 : 3;
        // Ground shadow
        ctx.fillStyle = 'rgba(0,0,0,.2)';
        ctx.beginPath(); ctx.ellipse(gx2, gy2+9, 6, 2, 0, 0, Math.PI*2); ctx.fill();
        // Armor body — PABLO corp blue
        ctx.fillStyle = '#1a3388'; ctx.fillRect(gx2-5,gy2-8,10,9);
        ctx.fillStyle = '#2255cc'; ctx.beginPath(); ctx.arc(gx2,gy2-12,4,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#88aaff'; ctx.fillRect(gx2-3,gy2-13,6,2); // visor glow
        ctx.fillStyle = '#1a3388'; ctx.fillRect(gx2-7,gy2-7,2,6); ctx.fillRect(gx2+5,gy2-7,2,6); // arms
        ctx.fillRect(gx2-4,gy2+1,3,5); ctx.fillRect(gx2+1,gy2+1,3,5); // legs
        // Corp logo (small P on chest)
        ctx.fillStyle = '#88aaff'; ctx.font = '5px "Share Tech Mono"'; ctx.textAlign = 'center';
        ctx.fillText('P', gx2, gy2-2);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        if (gdist2 < 90) {
          ctx.font = '13px "Share Tech Mono"'; ctx.textAlign = 'center';
          const gTw = ctx.measureText('PABLO CORP').width;
          ctx.fillStyle = 'rgba(0,0,0,.55)';
          ctx.beginPath(); ctx.roundRect(gx2 - gTw / 2 - 5, gy2 - 32, gTw + 10, 16, 4); ctx.fill();
          ctx.fillStyle = '#5599ff';
          ctx.fillText('PABLO CORP', gx2, gy2 - 20);
        }
      }

      // ── Vending machines near govt buildings ─────────────────────────────
      for (const vp of VEND_POSITIONS) {
        const bld = BUILDINGS.find(b => b.id === vp.bid); if (!bld) continue;
        const vx = bld.x + vp.x + ox, vy = bld.y + bld.h / 2 + vp.y + oy;
        if (vx < -20 || vx > cw + 20 || vy < -20 || vy > ch + 20) continue;
        const pulse = 0.8 + Math.sin(g.frame * 0.08) * 0.2;
        ctx.globalAlpha = pulse;
        ctx.shadowColor = '#00ffcc'; ctx.shadowBlur = 6;
        // Vending machine body
        ctx.fillStyle = '#003322'; ctx.fillRect(vx-7, vy-14, 14, 20);
        ctx.fillStyle = '#004433'; ctx.fillRect(vx-6, vy-13, 12, 12); // glass panel
        ctx.fillStyle = '#00ffcc'; ctx.fillRect(vx-4, vy-11, 3, 3); ctx.fillRect(vx+1, vy-11, 3, 3);
        ctx.fillRect(vx-4, vy-7, 3, 3); ctx.fillRect(vx+1, vy-7, 3, 3); // products
        ctx.fillStyle = '#ff4444'; ctx.fillRect(vx-4, vy+2, 8, 2); // button strip
        ctx.fillStyle = '#00ffcc'; ctx.font = '4px "Share Tech Mono"'; ctx.textAlign = 'center';
        ctx.fillText('VEND', vx, vy+8);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        // Proximity label
        if (Math.hypot(g.px - (bld.x + vp.x), g.py - (bld.y + bld.h/2 + vp.y)) < 55) {
          ctx.fillStyle = '#00ffcc'; ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText('[E] VEND $10', vx, vy - 18);
        }
      }

      // ── Billboard structures ──────────────────────────────────────────────
      for (const bb of BILLBOARDS) {
        const bx = bb.x + ox, by = bb.y + oy;
        if (bx < -60 || bx > cw + 60 || by < -80 || by > ch + 40) continue;
        const isNearBb = g.nearBillboard === bb.locationId;
        const bbData = billboardsDataRef.current.find((d: BillboardData) => d.locationId === bb.locationId);
        const hasOwner = bbData && bbData.ownerPlayerName;
        const pulse = 0.6 + Math.sin(g.frame * 0.04 + bb.x * 0.01) * 0.3;

        const postW = 6, postH = 50, screenW = 56, screenH = 32;
        const postX = bx - postW / 2, postY = by - postH;
        const scrX = bx - screenW / 2, scrY = postY - screenH - 2;

        ctx.fillStyle = '#1a1a2e'; ctx.fillRect(postX, postY, postW, postH);
        ctx.strokeStyle = 'rgba(0,255,65,.3)'; ctx.lineWidth = 1; ctx.strokeRect(postX, postY, postW, postH);

        const scrGlow = isNearBb ? '#00ff41' : hasOwner ? '#ff00ff' : '#00ccff';
        ctx.shadowColor = scrGlow; ctx.shadowBlur = isNearBb ? 16 : 8;
        ctx.fillStyle = '#0a0a1a'; ctx.fillRect(scrX, scrY, screenW, screenH);
        ctx.strokeStyle = scrGlow; ctx.lineWidth = isNearBb ? 2 : 1;
        ctx.strokeRect(scrX, scrY, screenW, screenH);
        ctx.shadowBlur = 0;

        ctx.save(); ctx.beginPath(); ctx.rect(scrX + 2, scrY + 2, screenW - 4, screenH - 4); ctx.clip();
        if (hasOwner && bbData.adImageUrl) {
          const adImg = bbImagesRef.current.get(bbData.adImageUrl);
          if (adImg && adImg.complete && adImg.naturalWidth > 0) {
            ctx.drawImage(adImg, scrX + 2, scrY + 2, screenW - 4, screenH - 4);
          } else {
            ctx.fillStyle = `rgba(255,0,255,${pulse * 0.15})`; ctx.fillRect(scrX + 2, scrY + 2, screenW - 4, screenH - 4);
            ctx.fillStyle = '#ff88ff'; ctx.font = '5px "Share Tech Mono"'; ctx.textAlign = 'center';
            ctx.fillText('LOADING...', bx, scrY + 16);
          }
          if (bbData.adText) {
            ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(scrX + 2, scrY + screenH - 12, screenW - 4, 10);
            ctx.fillStyle = '#ff88ff'; ctx.font = '5px "Share Tech Mono"'; ctx.textAlign = 'center';
            ctx.fillText(bbData.adText.slice(0, 12), bx, scrY + screenH - 4);
          }
        } else if (hasOwner && bbData.adText) {
          ctx.fillStyle = `rgba(255,0,255,${pulse * 0.15})`; ctx.fillRect(scrX + 2, scrY + 2, screenW - 4, screenH - 4);
          ctx.fillStyle = '#ff88ff'; ctx.font = '6px "Share Tech Mono"'; ctx.textAlign = 'center';
          const lines = bbData.adText.match(/.{1,12}/g) || [bbData.adText];
          lines.slice(0, 3).forEach((line: string, i: number) => ctx.fillText(line, bx, scrY + 10 + i * 8));
        } else {
          const scanY = (g.frame * 0.5) % screenH;
          ctx.fillStyle = `rgba(0,200,255,${pulse * 0.08})`; ctx.fillRect(scrX + 2, scrY + 2, screenW - 4, screenH - 4);
          ctx.fillStyle = `rgba(0,200,255,0.06)`; ctx.fillRect(scrX + 2, scrY + scanY, screenW - 4, 2);
          ctx.fillStyle = `rgba(0,200,255,${pulse * 0.7})`; ctx.font = 'bold 7px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText('PABLO CORP', bx, scrY + 13);
          ctx.fillStyle = `rgba(0,200,255,${pulse * 0.4})`; ctx.font = '5px "Share Tech Mono"';
          ctx.fillText('AD SPACE', bx, scrY + 22);
        }
        ctx.restore();

        ctx.fillStyle = `rgba(0,200,255,${pulse * 0.5})`; ctx.font = '5px "Share Tech Mono"'; ctx.textAlign = 'center';
        ctx.fillText(bb.label, bx, by + 8);

        if (isNearBb) {
          ctx.fillStyle = g.blink ? 'rgba(0,255,65,.9)' : 'rgba(0,255,65,.35)';
          ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText('[E] BILLBOARD', bx, scrY - 6);
        }
      }

      // ── Floating damage / money numbers ──────────────────────────────────
      for (const fl of g.floaters) {
        const fx = fl.x + ox, fy = fl.y + oy;
        const alpha = fl.life / fl.maxLife;
        ctx.globalAlpha = alpha;
        ctx.shadowColor = fl.color; ctx.shadowBlur = 6;
        ctx.fillStyle = fl.color;
        ctx.font = `bold ${8 + Math.round((1 - alpha) * 2)}px "Share Tech Mono"`;
        ctx.textAlign = 'center';
        ctx.fillText(fl.text, fx, fy);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }

      // ── FOG OF WAR — dark shroud revealed by player exploration ─────────────
      const FOG_TILE = 80;
      const fogRevealRadius = 3 + Math.floor((g.perception ?? 5) / 3);
      const ptx = Math.floor(g.px / FOG_TILE), pty = Math.floor(g.py / FOG_TILE);
      for (let dy = -fogRevealRadius; dy <= fogRevealRadius; dy++) {
        for (let dx = -fogRevealRadius; dx <= fogRevealRadius; dx++) {
          if (dx*dx + dy*dy <= fogRevealRadius*fogRevealRadius + 1) {
            g.fogRevealed.add(`${ptx+dx},${pty+dy}`);
          }
        }
      }
      const fogCamX = g.cam.x, fogCamY = g.cam.y;
      const fogStartTX = Math.floor(fogCamX / FOG_TILE);
      const fogStartTY = Math.floor(fogCamY / FOG_TILE);
      const fogEndTX = Math.ceil((fogCamX + cw) / FOG_TILE);
      const fogEndTY = Math.ceil((fogCamY + ch) / FOG_TILE);
      for (let fty = fogStartTY; fty <= fogEndTY; fty++) {
        for (let ftx = fogStartTX; ftx <= fogEndTX; ftx++) {
          if (!g.fogRevealed.has(`${ftx},${fty}`)) {
            const sx = ftx * FOG_TILE - fogCamX, sy = fty * FOG_TILE - fogCamY;
            ctx.fillStyle = isNight ? 'rgba(5,8,25,.8)' : 'rgba(20,15,10,.65)';
            ctx.fillRect(sx, sy, FOG_TILE, FOG_TILE);
          }
        }
      }
      // ── Interior transition fade overlay ──
      if (g.interiorFade > 0) {
        ctx.fillStyle = `rgba(0,0,0,${g.interiorFade})`;
        ctx.fillRect(0, 0, cw * 4, ch * 4);
      }

      ctx.restore();

      if (isNight) {
        ctx.fillStyle = `rgba(8,12,45,0.28)`;
        ctx.fillRect(0, 0, cw, ch);
      } else if (isDusk) {
        const duskT = (wt - 17) / 2;
        ctx.fillStyle = `rgba(60,20,10,${0.08 + duskT * 0.15})`;
        ctx.fillRect(0, 0, cw, ch);
        ctx.fillStyle = `rgba(20,5,40,${duskT * 0.12})`;
        ctx.fillRect(0, 0, cw, ch);
      } else if (isDawn) {
        const dawnT = (wt - 5) / 2;
        ctx.fillStyle = `rgba(60,30,10,${0.06 * (1 - dawnT)})`;
        ctx.fillRect(0, 0, cw, ch);
        ctx.fillStyle = `rgba(80,50,20,${0.04 * (1 - dawnT)})`;
        ctx.fillRect(0, 0, cw, ch);
      }

      for (const wp of g.weatherParticles) {
        if (g.calendar.weather === 'RAIN' || g.calendar.weather === 'ACID_RAIN') {
          const spd = Math.abs(wp.vy) / 6;
          const isAcid = g.calendar.weather === 'ACID_RAIN';
          ctx.strokeStyle = isAcid ? `rgba(180,255,50,${0.5 + spd * 0.15})` : `rgba(150,190,255,${0.45 + spd * 0.12})`;
          ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(wp.x, wp.y); ctx.lineTo(wp.x - 1.5, wp.y - 8 * spd); ctx.stroke();
          if (wp.y > ch - 30) {
            const splashR = 2 + Math.random() * 2;
            ctx.strokeStyle = isAcid ? `rgba(160,230,40,0.25)` : `rgba(130,170,240,0.2)`;
            ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.arc(wp.x, wp.y, splashR, 0, Math.PI); ctx.stroke();
          }
        } else if (g.calendar.weather === 'SNOW') {
          const snowSize = 1.5 + Math.sin(wp.x * 0.1 + wp.y * 0.05) * 0.5;
          ctx.fillStyle = `rgba(235,240,255,0.65)`;
          ctx.fillRect(wp.x - snowSize, wp.y - snowSize, snowSize * 2, snowSize * 2);
        }
      }
      if (g.calendar.weather === 'RAIN' || g.calendar.weather === 'ACID_RAIN') {
        const isAcid = g.calendar.weather === 'ACID_RAIN';
        ctx.fillStyle = isAcid ? `rgba(100,180,30,0.04)` : `rgba(80,120,200,0.03)`;
        ctx.fillRect(0, ch - 40, cw, 40);
      }
      if (g.calendar.weather === 'SNOW') {
        ctx.fillStyle = `rgba(230,235,245,0.06)`;
        ctx.fillRect(0, 0, cw, ch);
      }

      // ── Radiation zone overlays ───────────────────────────────────────────
      for (const rz of RADIATION_ZONES) {
        const rzx = rz.x + ox, rzy = rz.y + oy;
        if (rzx + rz.w < 0 || rzx > cw || rzy + rz.h < 0 || rzy > ch) continue;
        const rcx = rzx + rz.w / 2, rcy = rzy + rz.h / 2;
        const rzRadius = Math.max(rz.w, rz.h) / 2;
        const rzGrad = ctx.createRadialGradient(rcx, rcy, 0, rcx, rcy, rzRadius);
        rzGrad.addColorStop(0, `rgba(40,255,40,${0.06 * rz.intensity})`);
        rzGrad.addColorStop(0.7, `rgba(40,255,40,${0.03 * rz.intensity})`);
        rzGrad.addColorStop(1, 'rgba(40,255,40,0)');
        ctx.fillStyle = rzGrad; ctx.fillRect(rzx, rzy, rz.w, rz.h);
        ctx.strokeStyle = `rgba(40,255,40,${0.12 * rz.intensity})`; ctx.lineWidth = 1; ctx.setLineDash([6, 8]);
        ctx.strokeRect(rzx, rzy, rz.w, rz.h); ctx.setLineDash([]);
        ctx.fillStyle = `rgba(40,255,40,${0.15 * rz.intensity})`; ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center';
        ctx.fillText(`☢ ${rz.label}`, rcx, rzy + 12);
      }

      // ── Treasure chests ───────────────────────────────────────────────────
      for (const tc of TREASURE_CHESTS) {
        if (g.openedChests.has(tc.id)) continue;
        const tcx = tc.x + ox, tcy = tc.y + oy;
        if (tcx < -15 || tcx > cw + 15 || tcy < -15 || tcy > ch + 15) continue;
        ctx.fillStyle = '#8B6914'; ctx.fillRect(tcx - 6, tcy - 4, 12, 8);
        ctx.strokeStyle = '#DAA520'; ctx.lineWidth = 1; ctx.strokeRect(tcx - 6, tcy - 4, 12, 8);
        ctx.fillStyle = '#FFD700'; ctx.fillRect(tcx - 1, tcy - 1, 2, 2);
        const tcDist = Math.hypot(g.px - tc.x, g.py - tc.y);
        if (tcDist < 50) {
          ctx.fillStyle = g.blink ? '#FFD700' : 'rgba(255,215,0,.4)';
          ctx.font = '9px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText('[E] OPEN', tcx, tcy - 10);
        }
      }

      // ── Sewer travel overlay ──────────────────────────────────────────────
      if (g.inSewer) {
        ctx.fillStyle = 'rgba(0,0,0,.85)';
        ctx.fillRect(0, 0, cw, ch);
        const tunnelGrad = ctx.createRadialGradient(cw/2, ch/2, 0, cw/2, ch/2, 100);
        tunnelGrad.addColorStop(0, 'rgba(20,40,20,.3)');
        tunnelGrad.addColorStop(1, 'rgba(0,0,0,.95)');
        ctx.fillStyle = tunnelGrad;
        ctx.fillRect(0, 0, cw, ch);
        ctx.fillStyle = '#00ff41';
        ctx.font = '16px "VT323"';
        ctx.textAlign = 'center';
        ctx.fillText('TRAVERSING SEWER NETWORK...', cw/2, ch/2 - 20);
        ctx.font = '10px "Share Tech Mono"';
        ctx.fillStyle = 'rgba(0,255,65,.4)';
        ctx.fillText('Dark water flows beneath Minx City.', cw/2, ch/2 + 10);
        const pipes = g.frame * 0.05;
        for (let pi = 0; pi < 8; pi++) {
          const py3 = (ch / 8) * pi + Math.sin(pipes + pi * 1.5) * 5;
          ctx.strokeStyle = `rgba(0,80,30,${0.08 + Math.sin(pipes + pi) * 0.04})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let px3 = 0; px3 < cw; px3 += 4) {
            ctx.lineTo(px3, py3 + Math.sin(px3 * 0.02 + pipes) * 3);
          }
          ctx.stroke();
        }
      }

      // ── React minimap draw (player-centered, zoomed ~600 world units) ─────
      const mc = minimapRef.current;
      if (mc) {
        const mctx = mc.getContext('2d');
        if (mctx) {
          const mmR = 180;
          const mmD = mmR * 2;
          mc.width = mmD; mc.height = mmD;
          const mmCX = mmR, mmCY = mmR;
          const viewR = 900;
          const scale = mmR / viewR;
          const toMX = (wx: number) => mmCX + (wx - g.px) * scale;
          const toMY = (wy: number) => mmCY + (wy - g.py) * scale;

          mctx.clearRect(0, 0, mmD, mmD);
          mctx.save();
          mctx.beginPath(); mctx.arc(mmCX, mmCY, mmR, 0, Math.PI * 2); mctx.clip();

          mctx.fillStyle = 'rgba(0,8,0,.93)'; mctx.fillRect(0, 0, mmD, mmD);
          const cityTopMY = toMY(CITY_TOP);
          const cityBotMY = toMY(CITY_BOTTOM);
          if (cityTopMY > 0) { mctx.fillStyle = 'rgba(22,10,0,.88)'; mctx.fillRect(0, 0, mmD, cityTopMY); }
          if (cityBotMY < mmD) { mctx.fillStyle = 'rgba(22,10,0,.88)'; mctx.fillRect(0, cityBotMY, mmD, mmD - cityBotMY); }

          for (const gz of GANG_ZONES) { mctx.fillStyle = gz.color.replace('.06', '.3').replace('.05', '.25'); mctx.fillRect(toMX(gz.x), toMY(gz.y), gz.w * scale, gz.h * scale); }

          mctx.strokeStyle = 'rgba(0,255,65,.2)'; mctx.lineWidth = 1; mctx.setLineDash([2, 3]);
          mctx.beginPath(); mctx.moveTo(0, cityTopMY); mctx.lineTo(mmD, cityTopMY); mctx.stroke();
          mctx.beginPath(); mctx.moveTo(0, cityBotMY); mctx.lineTo(mmD, cityBotMY); mctx.stroke();
          mctx.setLineDash([]);

          for (const b of BUILDINGS) {
            const isLk = g.locks.has(b.id) && !!g.locks.get(b.id)?.ownerName;
            mctx.fillStyle = isLk ? 'rgba(255,130,50,.7)' : b.bright ? 'rgba(0,255,65,.9)' : 'rgba(0,180,55,.55)';
            mctx.fillRect(toMX(b.x), toMY(b.y), Math.max(3, b.w * scale), Math.max(2, b.h * scale));
          }

          for (const bb of BILLBOARDS) {
            const bmx = toMX(bb.x), bmy = toMY(bb.y);
            const owned = billboardsDataRef.current.some((d: BillboardData) => d.locationId === bb.locationId && d.ownerPlayerName);
            mctx.fillStyle = owned ? 'rgba(255,0,255,.8)' : 'rgba(0,200,255,.7)';
            mctx.beginPath(); mctx.moveTo(bmx, bmy - 3); mctx.lineTo(bmx + 2.5, bmy); mctx.lineTo(bmx, bmy + 3); mctx.lineTo(bmx - 2.5, bmy); mctx.closePath(); mctx.fill();
          }

          for (const n of NPCS) {
            const sp = getNpcSchedulePos(n, g.worldTime ?? 0);
            mctx.fillStyle = 'rgba(255,220,30,.75)'; mctx.shadowColor = 'rgba(255,220,30,.4)'; mctx.shadowBlur = 3;
            mctx.beginPath(); mctx.arc(toMX(sp.x), toMY(sp.y), 2.2, 0, Math.PI * 2); mctx.fill();
          }
          mctx.shadowBlur = 0;

          const tPulse = Math.sin(g.frame * 0.12) * 0.4 + 0.6;
          const enemyDetectRange = viewR + (g.perception ?? 5) * 40;
          for (const t of g.threats) {
            const tDist = Math.hypot(t.x - g.px, t.y - g.py);
            if (tDist > enemyDetectRange) continue;
            const tc = THREAT_COL[t.type] ?? '#ff4444';
            mctx.fillStyle = tc; mctx.shadowColor = tc; mctx.shadowBlur = 4 * tPulse;
            mctx.beginPath(); mctx.arc(toMX(t.x), toMY(t.y), 3, 0, Math.PI * 2); mctx.fill();
          }
          mctx.shadowBlur = 0;

          for (const [, op] of g.peers) {
            mctx.fillStyle = '#44aaff'; mctx.shadowColor = '#44aaff'; mctx.shadowBlur = 3;
            mctx.beginPath(); mctx.arc(toMX(op.x), toMY(op.y), 3, 0, Math.PI * 2); mctx.fill();
          }
          mctx.shadowBlur = 0;

          const qPulse = Math.sin(g.frame * 0.08) * 0.4 + 0.6;
          for (const quest of g.quests) {
            if (quest.completed) continue;
            for (const task of quest.tasks) {
              if (task.done || !task.mapMarker) continue;
              const mx = toMX(task.mapMarker.x), my = toMY(task.mapMarker.y);
              mctx.strokeStyle = `rgba(255,200,60,${qPulse})`; mctx.lineWidth = 1.5;
              mctx.setLineDash([3, 2]);
              mctx.beginPath(); mctx.arc(mx, my, 6, 0, Math.PI * 2); mctx.stroke();
              mctx.setLineDash([]);
              mctx.fillStyle = `rgba(255,200,60,${qPulse * 0.8})`;
              mctx.beginPath(); mctx.arc(mx, my, 2.5, 0, Math.PI * 2); mctx.fill();
            }
          }

          // Fog of war — mark visited cells (perception expands reveal)
          const fogCell = 40;
          const visitR = 160 + (g.perception ?? 5) * 10;
          for (let dx = -visitR; dx <= visitR; dx += fogCell) {
            for (let dy = -visitR; dy <= visitR; dy += fogCell) {
              const cx = Math.floor((g.px + dx) / fogCell);
              const cy = Math.floor((g.py + dy) / fogCell);
              fogGridRef.current.add(`${cx},${cy}`);
            }
          }
          // Draw fog overlay on unvisited cells
          const fogStartX = Math.floor((g.px - viewR) / fogCell);
          const fogEndX = Math.ceil((g.px + viewR) / fogCell);
          const fogStartY = Math.floor((g.py - viewR) / fogCell);
          const fogEndY = Math.ceil((g.py + viewR) / fogCell);
          for (let fcx = fogStartX; fcx <= fogEndX; fcx++) {
            for (let fcy = fogStartY; fcy <= fogEndY; fcy++) {
              if (!fogGridRef.current.has(`${fcx},${fcy}`)) {
                const fx = toMX(fcx * fogCell);
                const fy = toMY(fcy * fogCell);
                mctx.fillStyle = 'rgba(0,0,0,.35)';
                mctx.fillRect(fx, fy, fogCell * scale, fogCell * scale);
              }
            }
          }

          // Player — white glowing triangle
          mctx.fillStyle = '#ffffff'; mctx.shadowColor = '#00ff41'; mctx.shadowBlur = 8;
          mctx.beginPath(); mctx.moveTo(mmCX, mmCY - 6); mctx.lineTo(mmCX - 4, mmCY + 4); mctx.lineTo(mmCX + 4, mmCY + 4); mctx.closePath(); mctx.fill();
          mctx.shadowBlur = 0;

          // Vignette edge
          const vGrad = mctx.createRadialGradient(mmCX, mmCY, mmR * 0.65, mmCX, mmCY, mmR);
          vGrad.addColorStop(0, 'rgba(0,0,0,0)'); vGrad.addColorStop(1, 'rgba(0,0,0,.6)');
          mctx.fillStyle = vGrad; mctx.fillRect(0, 0, mmD, mmD);
          mctx.restore();

          // Circle border
          mctx.strokeStyle = 'rgba(0,255,65,.45)'; mctx.lineWidth = 2;
          mctx.shadowColor = 'rgba(0,255,65,.35)'; mctx.shadowBlur = 10;
          mctx.beginPath(); mctx.arc(mmCX, mmCY, mmR - 1, 0, Math.PI * 2); mctx.stroke();
          mctx.shadowBlur = 0;

          // Compass labels
          mctx.fillStyle = 'rgba(0,255,65,.6)'; mctx.textAlign = 'center'; mctx.font = 'bold 10px "Share Tech Mono",monospace';
          mctx.fillText('N', mmCX, 14);
          mctx.fillText('S', mmCX, mmD - 6);
          mctx.font = '9px "Share Tech Mono",monospace';
          mctx.fillText('W', 10, mmCY + 3);
          mctx.fillText('E', mmD - 10, mmCY + 3);
        }
      }



      if (g.subwayTransit) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,.85)';
        ctx.fillRect(0, 0, cw, ch);
        ctx.font = 'bold 24px "Share Tech Mono"'; ctx.textAlign = 'center'; ctx.fillStyle = '#00ff41';
        ctx.fillText('METRO IN TRANSIT', cw / 2, ch / 2 - 20);
        ctx.font = '14px "Share Tech Mono"'; ctx.fillStyle = 'rgba(0,255,65,.6)';
        const dest = g.subwayTransitDest?.label ?? '???';
        ctx.fillText(`Destination: ${dest}`, cw / 2, ch / 2 + 10);
        const dots = '.'.repeat((Math.floor(g.frame / 20) % 4) + 1);
        ctx.fillText(`Arriving${dots}`, cw / 2, ch / 2 + 35);
        for (let si = 0; si < 8; si++) {
          const sx = (Math.sin(g.frame * 0.03 + si * 0.8) * 0.5 + 0.5) * cw;
          const sy = ch / 2 + 60 + si * 4;
          ctx.fillStyle = `rgba(0,255,65,${0.1 + Math.sin(g.frame * 0.05 + si) * 0.05})`;
          ctx.fillRect(sx - 40, sy, 80, 1);
        }
        ctx.restore();
      }

      if (g.policeAlertTimer > 0) {
        const alertAlpha = Math.min(0.3, g.policeAlertTimer / 450 * 0.3) * (Math.sin(g.frame * 0.15) * 0.5 + 0.5);
        ctx.fillStyle = `rgba(255,0,0,${alertAlpha})`;
        ctx.fillRect(0, 0, cw, 3); ctx.fillRect(0, ch - 3, cw, 3);
        ctx.fillRect(0, 0, 3, ch); ctx.fillRect(cw - 3, 0, 3, ch);
      }

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    startCrowdMurmur(); crowdMurmurActiveRef.current = true;
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('wheel', onWheel);
      stopCrowdMurmur(); crowdMurmurActiveRef.current = false;
    };
  }, [char, speaking]);

  const hpRatio = gs.current.maxHp > 0 ? hp / gs.current.maxHp : 0;
  const hpColor = hpRatio > 0.6 ? '#00ff41' : hpRatio > 0.3 ? '#ffcc00' : hpRatio > 0.15 ? '#ff8800' : '#ff2222';
  const hpGlow = hpRatio > 0.6 ? 'rgba(0,255,65,.5)' : hpRatio > 0.3 ? 'rgba(255,204,0,.5)' : hpRatio > 0.15 ? 'rgba(255,136,0,.5)' : 'rgba(255,0,0,.6)';
  const nearB = near ? BUILDINGS.find(b => b.id === near) : null;

  return (
    <div
      ref={gameRef}
      tabIndex={0}
      onClick={() => gameRef.current?.focus()}
      style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#030803', position: 'relative', fontFamily: "'Share Tech Mono',monospace", outline: 'none' }}
    >
      <style>{`
        @keyframes smfade { 0%{opacity:0;transform:scale(.85)} 15%{opacity:1;transform:scale(1.05)} 60%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(1.03)} }
        @keyframes smblink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
      `}</style>
      {/* Scanlines */}
      <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.14) 2px,rgba(0,0,0,.14) 4px)', pointerEvents: 'none', zIndex: 9999 }} />

      {/* Canvas — full screen game world */}
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {/* ── HUD OVERLAY ─────────────────────────────────────────────────── */}

      {/* PROXIMITY NOTIFICATION BAR — top center */}
      {(() => {
        const g = gs.current;
        const proximityEvents: string[] = [];
        if (g.calendar?.disasterActive) {
          const dist = Math.hypot(g.px - g.calendar.disasterX, g.py - g.calendar.disasterY);
          if (dist < 2000) proximityEvents.push(`⚠ ${g.calendar.disasterActive} nearby!`);
        }
        if (radLevel > 0) proximityEvents.push(`☢ RADIATION ${(radLevel * 100).toFixed(0)}%`);
        if (gangZone) proximityEvents.push(`⚠ ${GANG_ZONES.find(gz => gz.id === gangZone)?.name ?? 'GANG'} TERRITORY`);
        if (poisoned) proximityEvents.push('☠ POISONED');
        if (g.threats?.some((t: { type: string; x: number; y: number }) => Math.hypot(g.px - t.x, g.py - t.y) < 300 && t.type !== 'STRAY_DOG')) proximityEvents.push('⚔ HOSTILES NEARBY');
        if (dogActive && dogInjured) proximityEvents.push(`🐾 ${dogName} INJURED`);
        return proximityEvents.length > 0 ? (
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 180, display: 'flex', gap: '6px', pointerEvents: 'none' }}>
            {proximityEvents.map((evt, i) => (
              <div key={i} style={{ background: 'rgba(0,0,0,.85)', border: '1px solid rgba(255,80,80,.5)', padding: '.25rem .6rem', fontFamily: "'VT323',monospace", fontSize: '.95rem', color: '#ff6644', letterSpacing: '.08em', textShadow: '0 0 8px rgba(255,80,0,.4)', whiteSpace: 'nowrap' }}>
                {evt}
              </div>
            ))}
          </div>
        ) : null;
      })()}

      {/* TOP-LEFT — hearts, gold, fiat, zone, character class */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', maxWidth: 340 }}>
        {/* Hearts row — Zelda-style HP */}
        <div style={{ background: 'rgba(0,8,0,.92)', border: '1px solid rgba(0,255,65,.35)', padding: '.35rem .6rem', display: 'flex', alignItems: 'center', gap: '3px', flexWrap: 'wrap', maxWidth: 240 }}>
          {(() => {
            const maxHp = gs.current.maxHp || 100;
            const hpPerHeart = maxHp / Math.max(1, Math.ceil(maxHp / 20));
            const totalHearts = Math.ceil(maxHp / hpPerHeart);
            const fullHearts = Math.floor(hp / hpPerHeart);
            const partialFill = (hp % hpPerHeart) / hpPerHeart;
            return Array.from({ length: totalHearts }, (_, i) => {
              const isFull = i < fullHearts;
              const isPartial = i === fullHearts && partialFill > 0;
              const heartColor = hpRatio > 0.6 ? '#ff2255' : hpRatio > 0.3 ? '#ff8800' : '#ff2222';
              const emptyColor = 'rgba(255,34,85,.18)';
              return (
                <span key={i} style={{ fontSize: '1.25rem', lineHeight: 1, color: isFull ? heartColor : isPartial ? heartColor : emptyColor, opacity: isFull ? 1 : isPartial ? (0.35 + partialFill * 0.65) : 0.3, textShadow: isFull ? `0 0 6px ${heartColor}` : 'none', transition: 'opacity .3s' }}>♥</span>
              );
            });
          })()}
          <span style={{ fontFamily: "'VT323',monospace", fontSize: '.85rem', color: 'rgba(255,255,255,.4)', marginLeft: '4px' }}>{Math.floor(hp)}/{gs.current.maxHp}</span>
        </div>
        {/* Gold + Fiat + Class row */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <div style={{ background: 'rgba(0,8,0,.92)', border: '1px solid rgba(255,215,0,.35)', padding: '.25rem .5rem' }}>
            <span style={{ fontFamily: "'VT323',monospace", fontSize: '1.1rem', color: '#FFD700', letterSpacing: '.04em' }}>{goldBalance}oz</span>
          </div>
          <div style={{ background: 'rgba(0,8,0,.92)', border: '1px solid rgba(0,255,65,.3)', padding: '.25rem .5rem' }}>
            <span style={{ fontFamily: "'VT323',monospace", fontSize: '1.1rem', color: '#00ff41', letterSpacing: '.04em' }}>ƒ{salary.toLocaleString()}</span>
          </div>
          <div style={{ background: 'rgba(0,8,0,.92)', border: '1px solid rgba(0,255,65,.2)', padding: '.25rem .5rem' }}>
            <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '.7rem', color: 'rgba(0,255,65,.45)', letterSpacing: '.06em' }}>
              {CLASS_DISPLAY_NAME[char.class.toLowerCase()] ?? char.class.toUpperCase()} · ƒ{FACTION_SALARY_PER_MIN[char.class.toLowerCase()] ?? 0}/min
            </span>
          </div>
        </div>
        {/* Zone + Weather compact row */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <div style={{ background: 'rgba(0,8,0,.92)', border: `1px solid ${zone.startsWith('WASTELAND') ? 'rgba(170,255,68,.35)' : 'rgba(0,255,65,.3)'}`, padding: '.25rem .5rem' }}>
            <span style={{ fontFamily: "'VT323',monospace", fontSize: '.95rem', color: zone.startsWith('WASTELAND') ? '#88ff44' : '#00ff41', letterSpacing: '.04em' }}>{boomerize(zone, boomerMode)}</span>
          </div>
          <div style={{ background: 'rgba(0,8,0,.92)', border: '1px solid rgba(100,150,255,.3)', padding: '.25rem .5rem', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
            {weatherStr && weatherStr !== 'CLEAR' && (
              <span style={{ fontFamily: "'VT323',monospace", fontSize: '.85rem', color: weatherStr === 'ACID_RAIN' ? '#66ff44' : weatherStr === 'SNOW' ? '#aabbff' : '#6699ff' }}>{weatherStr.replace('_', ' ')}</span>
            )}
            {weatherStr === 'CLEAR' && <span style={{ fontFamily: "'VT323',monospace", fontSize: '.85rem', color: 'rgba(0,255,65,.5)' }}>CLEAR</span>}
            <span style={{ fontFamily: "'VT323',monospace", fontSize: '.85rem', color: (() => { const h = gs.current.worldTime; return (h >= 6 && h < 18) ? '#ffcc44' : '#8899ff'; })() }}>
              {(() => { const wt = gs.current.worldTime; const icon = (wt >= 6 && wt < 18) ? '☀' : '☾'; const hr12 = Math.floor(wt) % 12 || 12; const mins = Math.floor((wt % 1) * 60); const ampm = wt >= 12 && wt < 24 ? 'PM' : 'AM'; return `${icon} ${hr12}:${mins.toString().padStart(2,'0')} ${ampm}`; })()}
            </span>
            <span style={{ fontFamily: "'VT323',monospace", fontSize: '.75rem', color: tempC <= 5 ? '#88bbff' : tempC >= 30 ? '#ff8844' : 'rgba(0,255,65,.45)', borderLeft: '1px solid rgba(0,255,65,.15)', paddingLeft: '.3rem' }}>
              {seasonStr.slice(0,3)} {tempC}°C
            </span>
          </div>
          {calendarStr && (
            <div style={{ background: 'rgba(0,8,0,.92)', border: '1px solid rgba(0,255,65,.25)', padding: '.25rem .5rem' }}>
              <span style={{ fontFamily: "'VT323',monospace", fontSize: '.85rem', color: 'rgba(0,255,65,.6)', letterSpacing: '.04em' }}>{calendarStr}</span>
            </div>
          )}
        </div>
        {/* Gold Standard toggle */}
        <button onClick={() => setGoldStandardToggle(!goldStandardToggle)} style={{ background: goldStandardToggle ? 'rgba(255,215,0,.1)' : 'rgba(0,8,0,.92)', border: `1px solid ${goldStandardToggle ? 'rgba(255,215,0,.5)' : 'rgba(255,215,0,.2)'}`, color: goldStandardToggle ? '#FFD700' : 'rgba(255,215,0,.5)', padding: '.25rem .6rem', cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace", fontSize: '.65rem', letterSpacing: '.08em' }}>
          {goldStandardToggle ? '⊕ CURRENCY: GOLD' : '⊕ CURRENCY: FIAT'}
        </button>
      </div>

      {/* BOTTOM-LEFT — enlarged minimap + dog companion */}
      <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
        <canvas ref={minimapRef} width={360} height={360} style={{ width: 160, height: 160, borderRadius: '50%', boxShadow: '0 0 14px rgba(0,255,65,.15)', border: '2px solid rgba(0,255,65,.3)' }} />
        {dogActive && (
          <div style={{ background: 'rgba(0,6,0,.92)', border: `1px solid ${dogInjured ? 'rgba(255,68,68,.4)' : 'rgba(255,170,68,.35)'}`, padding: '.2rem .5rem', display: 'flex', alignItems: 'center', gap: '.35rem' }}>
            <span style={{ fontSize: '.9rem' }}>🐾</span>
            <span style={{ fontFamily: "'VT323',monospace", fontSize: '.9rem', color: dogInjured ? '#ff4444' : '#ffaa44' }}>{dogName}</span>
            {!dogInjured && <span style={{ fontFamily: "'VT323',monospace", fontSize: '.8rem', color: (dogHp / DOG_MAX_HP) > 0.5 ? '#ffaa44' : '#ff4444' }}>{dogHp}/{DOG_MAX_HP}</span>}
            {dogInjured && <span style={{ fontSize: '.75rem', color: '#ff4444' }}>HURT</span>}
          </div>
        )}
      </div>

      {/* TOP-RIGHT — Pause / Chat / Menu / Pablo AI dropdown */}
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 150, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => {
              setGamePaused(true);
              gs.current.keys.clear();
              doSaveRef.current(buildSaveData());
            }}
            style={{
              padding: '.5rem .8rem',
              background: 'rgba(0,5,0,.92)',
              border: '1px solid rgba(255,200,50,.35)',
              color: 'rgba(255,200,50,.7)',
              cursor: 'pointer',
              fontFamily: "'VT323',monospace",
              fontSize: '1.1rem',
              letterSpacing: '.1em',
            }}
          >
            ⏸ PAUSE
          </button>
          <button
            onClick={() => {
              const g = gs.current;
              const nearTerminal = g.near && (IS_PUBLIC_TERMINAL(g.near) || g.near === 'terminal_shop');
              const hasWorkingDevice = g.hasDevice && !g.deviceBroken;
              if (nearTerminal || hasWorkingDevice) {
                setShowTopMenu(v => !v);
              } else {
                setNarr('> NO TERMINAL ACCESS — Find a public terminal or repair your Pablo Terminal MX-75 to access the Terminal.');
              }
            }}
            style={{
              padding: '.5rem .9rem',
              background: showTopMenu ? 'rgba(0,255,65,.1)' : 'rgba(0,5,0,.92)',
              border: `1px solid ${showTopMenu ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.25)'}`,
              color: showTopMenu ? '#00ff41' : 'rgba(0,255,65,.55)',
              cursor: 'pointer',
              fontFamily: "'VT323',monospace",
              fontSize: '1.1rem',
              letterSpacing: '.1em',
            }}
          >
            ☰ TERMINAL {unread > 0 && <span style={{ display: 'inline-block', width: 8, height: 8, background: '#ff4444', borderRadius: '50%', marginLeft: 4 }} />}
          </button>
        </div>
        {showTopMenu && (
          <div style={{ width: 200, background: 'rgba(0,5,0,.97)', border: '1px solid rgba(0,255,65,.35)', padding: '.4rem' }}>
            <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.14em', marginBottom: 4, paddingLeft: '.3rem' }}>TERMINAL HUB</div>
            <button onClick={() => {
              const g = gs.current;
              if (g.hasDevice && !g.deviceBroken) { setShowPablo(v => !v); setShowTopMenu(false); }
              else if (g.hasDevice && g.deviceBroken) { setNarr('> DEVICE DAMAGED — Find a PUBLIC TERMINAL or repair at CITY CLINIC.'); setShowTopMenu(false); }
              else { setNarr('> NO DEVICE — Find a PUBLIC TERMINAL and press [E].'); setShowTopMenu(false); }
            }} style={{ width: '100%', padding: '.5rem .6rem', marginBottom: 3, background: showPablo ? 'rgba(0,255,65,.12)' : 'rgba(0,255,65,.04)', border: showPablo ? '1px solid rgba(0,255,65,.5)' : '1px solid rgba(0,255,65,.25)', color: showPablo ? '#00ff41' : (hasDevice && !deviceBroken) ? '#00ff41' : 'rgba(255,68,68,.5)', cursor: 'pointer', fontSize: '.75rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left' }}>
              🤖 PABLO AI [P] — FREE{deviceBroken ? ' ⚠' : ''}
            </button>
            <div style={{ borderTop: '1px solid rgba(0,255,65,.08)', marginTop: 2, marginBottom: 4, paddingTop: 4 }}>
              <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.12em', marginBottom: 3, paddingLeft: '.3rem' }}>QUICK ACCESS</div>
            </div>
            <button onClick={() => { setShowStats(v => !v); setShowTopMenu(false); }} style={{ width: '100%', padding: '.4rem .6rem', marginBottom: 3, background: showStats ? 'rgba(255,170,0,.08)' : 'transparent', border: showStats ? '1px solid rgba(255,170,0,.3)' : '1px solid rgba(0,255,65,.15)', color: showStats ? '#ffaa00' : 'rgba(0,255,65,.55)', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left' }}>
              📊 STATS & NET WORTH
            </button>
            <button onClick={() => { setShowQuests(true); setShowTopMenu(false); }} style={{ width: '100%', padding: '.4rem .6rem', marginBottom: 3, background: quests.some(q => !q.completed) ? 'rgba(255,200,60,.06)' : 'transparent', border: quests.some(q => !q.completed) ? '1px solid rgba(255,200,60,.3)' : '1px solid rgba(0,255,65,.15)', color: quests.some(q => !q.completed) ? '#ffcc44' : 'rgba(0,255,65,.55)', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left' }}>
              📋 MISSIONS {quests.filter(q => !q.completed).length > 0 ? `(${quests.filter(q => !q.completed).length})` : ''}
            </button>
            <button onClick={() => { setShowCostume(true); setShowTopMenu(false); }} style={{ width: '100%', padding: '.4rem .6rem', marginBottom: 3, background: 'transparent', border: '1px solid rgba(0,255,65,.15)', color: 'rgba(0,255,65,.55)', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left' }}>
              👤 CLOTHES
            </button>
            <button onClick={() => { setShowMap(v => !v); setShowTopMenu(false); }} style={{ width: '100%', padding: '.4rem .6rem', marginBottom: 3, background: showMap ? 'rgba(0,255,65,.1)' : 'transparent', border: showMap ? '1px solid rgba(0,255,65,.4)' : '1px solid rgba(0,255,65,.15)', color: showMap ? '#00ff41' : 'rgba(0,255,65,.55)', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left' }}>
              🗺 MAP [M]
            </button>
            <div style={{ borderTop: '1px solid rgba(0,255,65,.08)', marginTop: 2, marginBottom: 4, paddingTop: 4 }}>
              <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.12em', marginBottom: 3, paddingLeft: '.3rem' }}>VIDEO</div>
            </div>
            <button onClick={() => {
              const g = gs.current;
              if (videoCallRoom) { leaveVideoCall(); setShowTopMenu(false); return; }
              const nearTerm = g.near && (IS_PUBLIC_TERMINAL(g.near) || g.near === 'terminal_shop');
              const hasTerminalInInterior = g.interior && g.interior.def.objects.some(o => o.type === 'terminal');
              if (nearTerm || hasTerminalInInterior || (g.hasDevice && !g.deviceBroken)) {
                const roomId = g.interior ? `room_${g.interior.bid}` : `city_${Math.floor(g.px / 500)}_${Math.floor(g.py / 500)}`;
                joinVideoCall(roomId);
              } else {
                setNarr('> NO TERMINAL — You need a terminal or PABLO device to make video calls.');
              }
              setShowTopMenu(false);
            }} style={{ width: '100%', padding: '.4rem .6rem', marginBottom: 3, background: videoCallRoom ? 'rgba(0,255,65,.1)' : 'transparent', border: videoCallRoom ? '1px solid rgba(0,255,65,.4)' : '1px solid rgba(0,255,65,.15)', color: videoCallRoom ? '#00ff41' : 'rgba(0,255,65,.55)', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left' }}>
              📹 CONFERENCE [C] {videoCallRoom ? '— LIVE' : '— OFF'}
            </button>
            <button onClick={() => { setChatOpen(v => { chatOpenRef.current = !v; return !v; }); setUnread(0); setShowTopMenu(false); }} style={{ width: '100%', padding: '.4rem .6rem', marginBottom: 3, background: chatOpen ? 'rgba(0,255,65,.1)' : 'transparent', border: chatOpen ? '1px solid rgba(0,255,65,.4)' : '1px solid rgba(0,255,65,.15)', color: chatOpen ? '#00ff41' : 'rgba(0,255,65,.55)', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left', position: 'relative' }}>
              💬 CHAT{unread > 0 && <span style={{ position: 'absolute', top: 4, right: 6, width: 6, height: 6, background: '#ff4444', borderRadius: '50%' }} />}
            </button>
            <div style={{ borderTop: '1px solid rgba(0,255,65,.08)', marginTop: 2, marginBottom: 4, paddingTop: 4 }}>
              <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.12em', marginBottom: 3, paddingLeft: '.3rem' }}>AUDIO</div>
            </div>
            <button onClick={toggleVoice} style={{ width: '100%', padding: '.4rem .6rem', marginBottom: 3, background: voice ? 'rgba(0,255,65,.08)' : 'transparent', border: '1px solid rgba(0,255,65,.15)', color: voice ? (speaking ? '#00ffcc' : '#00ff41') : 'rgba(0,255,65,.55)', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left' }}>
              🎙 {voice ? (speaking ? '● MIC' : '○ MIC') : 'MIC [V]'}
            </button>
            <button onClick={() => { handleRadioToggle(); setShowTopMenu(false); }} style={{ width: '100%', padding: '.4rem .6rem', marginBottom: 3, background: radioOn ? 'rgba(0,255,65,.08)' : 'transparent', border: radioOn ? '1px solid rgba(0,255,65,.4)' : '1px solid rgba(0,255,65,.15)', color: radioOn ? '#00ff41' : 'rgba(0,255,65,.55)', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left' }}>
              📻 RADIO {radioOn ? '— ON' : '— OFF'}
            </button>
            <button onClick={() => { const m = toggleMuteMusic(); setMusicMuted(m); }} style={{ width: '100%', padding: '.4rem .6rem', marginBottom: 3, background: musicMuted ? 'rgba(255,34,102,.06)' : 'transparent', border: '1px solid rgba(0,255,65,.15)', color: musicMuted ? '#ff2266' : 'rgba(0,255,65,.55)', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left' }}>
              {musicMuted ? '🔇 MUTE SCORE' : '🎵 SCORE'}
            </button>
            <button onClick={() => { const m = toggleMuteAll(); setAllMuted(m); }} style={{ width: '100%', padding: '.4rem .6rem', marginBottom: 3, background: allMuted ? 'rgba(255,34,102,.06)' : 'transparent', border: '1px solid rgba(0,255,65,.15)', color: allMuted ? '#ff2266' : 'rgba(0,255,65,.55)', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left' }}>
              {allMuted ? '🔇 MUTE ALL' : '🔊 ALL SOUND'}
            </button>
            {char.class.toLowerCase() === 'outlaw' && (
              <button onClick={() => { setShowCrafting(true); frozenRef.current = true; setShowTopMenu(false); }} style={{ width: '100%', padding: '.4rem .6rem', marginBottom: 3, background: 'transparent', border: '1px solid rgba(136,255,68,.2)', color: '#88ff44', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left' }}>
                CRAFTING
              </button>
            )}
            <div style={{ borderTop: '1px solid rgba(0,255,65,.12)', marginTop: 3, paddingTop: 5 }}>
              <button onClick={() => { const g = gs.current; const nt = g.near && (IS_PUBLIC_TERMINAL(g.near) || g.near === 'terminal_shop'); const hasWorkingDevice = g.hasDevice && !g.deviceBroken; if (!nt && !hasWorkingDevice) { setNarr('> NO TERMINAL ACCESS — Find a public terminal or repair your Pablo Terminal MX-75.'); setShowTopMenu(false); return; } sessionStorage.setItem('sm_show_saves', '1'); if (nt) sessionStorage.setItem('sm_at_physical_terminal', '1'); doSaveRef.current(buildSaveData()); navigate('/world'); }} style={{ width: '100%', padding: '.4rem .6rem', background: 'transparent', border: '1px solid rgba(0,255,65,.15)', color: 'rgba(0,255,65,.45)', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.06em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left' }}>
                💾 SAVE & EXIT
              </button>
              <button onClick={() => { doSaveRef.current(buildSaveData()); window.open(`${window.location.origin}${import.meta.env.BASE_URL}mobile`, '_blank'); setShowTopMenu(false); }} style={{ width: '100%', padding: '.4rem .6rem', marginTop: 3, background: 'transparent', border: '1px solid rgba(0,180,255,.15)', color: 'rgba(0,180,255,.35)', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.06em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left' }}>
                📱 MOBILE TERMINAL
              </button>
            </div>
            {online.length > 0 && (
              <div style={{ borderTop: '1px solid rgba(0,255,65,.12)', marginTop: 5, paddingTop: 5 }}>
                <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.5)', letterSpacing: '.1em', marginBottom: 4 }}>{online.length} ONLINE</div>
                {online.slice(0, 5).map(p => (
                  <div key={p.id} onClick={() => { setDmTarget(dmTarget?.id === p.id ? null : p); setChatOpen(true); setShowTopMenu(false); }} style={{ fontSize: '.6rem', color: speakIds.has(p.id) ? '#00ffcc' : 'rgba(0,255,65,.65)', lineHeight: 1.8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.2rem', overflow: 'hidden' }}>
                    {speakIds.has(p.id) && <span style={{ fontSize: '.55rem' }}>🎙</span>}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* TOP-CENTER — narration ticker (proximity events only) */}
      <div style={{ position: 'absolute', top: 10, left: 350, right: 350, zIndex: 100, pointerEvents: 'none' }}>
        <div style={{ background: 'rgba(0,8,0,.92)', border: '1px solid rgba(0,255,65,.35)', padding: '.4rem .7rem', overflow: 'hidden' }}>
          {nearB && (
            <div style={{ fontSize: '.7rem', color: 'rgba(0,255,65,.55)', letterSpacing: '.1em', marginBottom: '.15rem' }}>
              NEARBY: {nearB.label}{lockMap.has(nearB.id) ? ' 🔒' : ''}
            </div>
          )}
          <div style={{ fontSize: '.9rem', color: 'rgba(0,255,65,.85)', letterSpacing: '.03em', lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{narration}</div>
          {overheardLine && (
            <div style={{ marginTop: '.15rem', fontSize: '.8rem', color: 'rgba(255,200,100,.7)', letterSpacing: '.03em', fontStyle: 'italic', textShadow: '0 0 6px rgba(255,200,100,.2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {overheardLine}
            </div>
          )}
        </div>
      </div>
      {/* BOTTOM-CENTER — controls hint (compact) */}
      <div style={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', zIndex: 90, pointerEvents: 'none' }}>
        <div style={{ fontSize: '.6rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.06em', fontFamily: "'Share Tech Mono',monospace" }}>WASD · E enter · F attack · C chat · P terminal · ESC close</div>
      </div>

      {/* ── PROPERTY STATS PANEL ── */}
      {showStats && (
        <div style={{ position: 'absolute', bottom: 120, right: 70, width: 240, background: 'rgba(0,5,0,.97)', border: '1px solid rgba(255,170,0,.3)', zIndex: 200 }}>
          <div style={{ padding: '.35rem .55rem', borderBottom: '1px solid rgba(255,170,0,.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: "'VT323',monospace", fontSize: '.85rem', color: '#ffaa00', letterSpacing: '.1em' }}>PROPERTY LEDGER</span>
            <button onClick={() => setShowStats(false)} style={{ fontSize: '.55rem', color: 'rgba(255,170,0,.4)', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ padding: '.4rem .55rem', maxHeight: '30vh', overflowY: 'auto' }}>
            {Object.keys(ownerStats).length === 0 ? (
              <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.07em', padding: '.3rem 0' }}>No buildings claimed yet.</div>
            ) : Object.entries(ownerStats).sort((a, b) => b[1].count - a[1].count).map(([owner, data]) => (
              <div key={owner} style={{ borderBottom: '1px solid rgba(0,255,65,.07)', padding: '.3rem 0' }}>
                <div style={{ fontFamily: "'VT323',monospace", fontSize: '.8rem', color: '#ffaa00', letterSpacing: '.08em' }}>{owner}</div>
                {data.company && <div style={{ fontSize: '.45rem', color: 'rgba(255,170,0,.45)', letterSpacing: '.07em' }}>{data.company}</div>}
                <div style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.4)', marginTop: '2px' }}>{data.count} building{data.count !== 1 ? 's' : ''} claimed</div>
                <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.05em', marginTop: '1px' }}>{data.buildings.join(', ')}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '.3rem .55rem', borderTop: '1px solid rgba(0,255,65,.07)', fontSize: '.55rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.07em' }}>
            Total buildings: {BUILDINGS.filter(b => b.id !== 'pablo_tower').length} · Claimed: {Object.values(ownerStats).reduce((a, v) => a + v.count, 0)}
          </div>
        </div>
      )}

      {/* ── SERVER FULL OVERLAY ── */}
      {serverFull && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 9000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', fontFamily: "'Share Tech Mono',monospace" }}>
          <div style={{ fontFamily: "'VT323',monospace", fontSize: '3rem', color: '#ff4444', letterSpacing: '.18em', textShadow: '0 0 20px rgba(255,0,0,.5)' }}>SERVER FULL</div>
          <div style={{ fontSize: '.65rem', color: 'rgba(255,80,80,.6)', letterSpacing: '.1em' }}>MAX 50 OPERATIVES ONLINE — Try again shortly.</div>
          <button onClick={() => { sessionStorage.setItem('sm_show_saves', '1'); navigate('/world'); }} style={{ marginTop: '.5rem', padding: '.65rem 1.5rem', background: 'rgba(255,80,80,.08)', border: '1px solid rgba(255,80,80,.4)', color: '#ff8888', fontFamily: "'VT323',monospace", fontSize: '1.2rem', letterSpacing: '.15em', cursor: 'pointer' }}>← BACK TO TERMINAL</button>
        </div>
      )}

      {/* ── DOG NAMING PROMPT ── */}
      {showDogName && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 9000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '.8rem', fontFamily: "'Share Tech Mono',monospace" }}>
          <div style={{ fontFamily: "'VT323',monospace", fontSize: '2rem', color: '#ffaa44', letterSpacing: '.15em', textShadow: '0 0 15px rgba(255,170,68,.4)' }}>ADOPT COMPANION</div>
          <div style={{ fontSize: '.65rem', color: 'rgba(255,170,68,.7)', letterSpacing: '.08em', maxWidth: 320, textAlign: 'center' }}>
            The stray dog looks up at you. Tail wagging. Trusting eyes. Give your new companion a name.
          </div>
          <input
            autoFocus
            value={dogNameIn}
            onChange={e => setDogNameIn(e.target.value.slice(0, 16))}
            onKeyDown={e => {
              if (e.key === 'Enter' && dogNameIn.trim()) {
                const g = gs.current;
                const name = dogNameIn.trim().toUpperCase();
                const stray = dogAdoptTarget.current;
                const strayIdx = stray ? g.threats.indexOf(stray) : -1;
                if (stray && strayIdx >= 0 && stray.type === 'STRAY_DOG') {
                  g.dogCompanion.active = true;
                  g.dogCompanion.name = name;
                  g.dogCompanion.hp = DOG_MAX_HP;
                  g.dogCompanion.maxHp = DOG_MAX_HP;
                  g.dogCompanion.x = stray.x;
                  g.dogCompanion.y = stray.y;
                  g.dogCompanion.injured = false;
                  g.dogCompanion.dialogueCooldown = 300;
                  g.dogCompanion.attackCooldown = 0;
                  g.dogCompanion.lastZone = inCityBounds(g.px, g.py) ? 'MINX CITY' : 'WASTELAND';
                  g.threats = g.threats.filter(t => t !== stray);
                  setDogActive(true);
                  setDogName(name);
                  setDogHp(DOG_MAX_HP);
                  setDogInjured(false);
                  setNarr(`> You adopted ${name}. ${name} barks once — sharp, decisive. Loyalty confirmed. ${name} will follow you, fight for you, and occasionally share unsolicited opinions about the world.`);
                  sfxTalk();
                }
                setShowDogName(false);
                frozenRef.current = false;
                dogAdoptTarget.current = null;
              }
              if (e.key === 'Escape') {
                setShowDogName(false);
                frozenRef.current = false;
                dogAdoptTarget.current = null;
              }
            }}
            placeholder="Name your dog..."
            style={{
              background: 'rgba(0,10,0,.95)', border: '1px solid rgba(255,170,68,.5)',
              color: '#ffaa44', fontFamily: "'VT323',monospace", fontSize: '1.5rem',
              padding: '.5rem 1rem', width: 260, textAlign: 'center', outline: 'none',
              caretColor: '#ffaa44', letterSpacing: '.1em',
            }}
          />
          <div style={{ fontSize: '.45rem', color: 'rgba(255,170,68,.35)', letterSpacing: '.08em' }}>ENTER to confirm · ESC to cancel</div>
        </div>
      )}

      {/* ── CHAT PANEL ── */}
      {chatOpen && (
        <div style={{ position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)', width: 340, maxHeight: '38vh', background: 'rgba(0,5,0,.97)', border: '1px solid rgba(0,255,65,.3)', display: 'flex', flexDirection: 'column', zIndex: 200 }}>
          <div style={{ padding: '.35rem .55rem', borderBottom: '1px solid rgba(0,255,65,.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: "'VT323',monospace", fontSize: '.85rem', color: '#00ff41', letterSpacing: '.1em' }}>{dmTarget ? `DM → ${dmTarget.name}` : 'WORLD CHAT'}</span>
            <div style={{ display: 'flex', gap: '.3rem' }}>
              {dmTarget && <button onClick={() => setDmTarget(null)} style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.4)', border: 'none', background: 'transparent', cursor: 'pointer' }}>× DM</button>}
              <button onClick={() => { setChatOpen(false); chatOpenRef.current = false; }} style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
            </div>
          </div>
          {online.length > 0 && (
            <div style={{ padding: '.25rem .45rem', borderBottom: '1px solid rgba(0,255,65,.1)', display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
              {online.map(p => (
                <button key={p.id} onClick={() => setDmTarget(dmTarget?.id === p.id ? null : p)} style={{ fontSize: '.5rem', padding: '1px 5px', background: dmTarget?.id === p.id ? 'rgba(0,255,65,.1)' : 'transparent', border: dmTarget?.id === p.id ? '1px solid rgba(0,255,65,.4)' : '1px solid rgba(0,255,65,.15)', color: dmTarget?.id === p.id ? '#00ff41' : 'rgba(0,255,65,.38)', cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace" }}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <div style={{ flex: 1, overflowY: 'auto', padding: '.45rem', display: 'flex', flexDirection: 'column', gap: '.22rem', minHeight: 60 }}>
            {chatMsgs.length === 0
              ? <div style={{ fontSize: '.58rem', color: 'rgba(0,255,65,.18)' }}>No messages yet.</div>
              : chatMsgs.slice(-40).map(m => (
                <div key={m.id} style={{ fontSize: '.63rem', lineHeight: 1.5, color: m.from === 'SERVER' ? 'rgba(0,255,65,.28)' : m.dm ? 'rgba(100,200,255,.75)' : 'rgba(0,255,65,.65)' }}>
                  <span style={{ color: 'rgba(0,255,65,.38)', fontFamily: "'VT323',monospace", fontSize: '.72rem' }}>{m.dm ? '[DM]' : ''}{m.from.slice(0, 10)}</span>{' '}{m.text}
                </div>
              ))
            }
          </div>
          <div style={{ padding: '.32rem', borderTop: '1px solid rgba(0,255,65,.12)', display: 'flex', gap: '.32rem' }}>
            <input value={chatIn} onChange={e => setChatIn(e.target.value)} onKeyDown={e => e.key === 'Enter' && (() => { if (!chatIn.trim()) return; const t = chatIn.trim(); setChatIn(''); if (dmTarget) wsSend({ type: 'chat', room: 'dm', text: t, toId: dmTarget.id }); else wsSend({ type: 'chat', room: 'world', text: t }); })()} placeholder={dmTarget ? `DM ${dmTarget.name}...` : 'World...'} style={{ flex: 1, background: 'rgba(0,10,0,.9)', border: '1px solid rgba(0,255,65,.18)', color: '#00ff41', fontFamily: "'Share Tech Mono',monospace", fontSize: '.62rem', padding: '.25rem .4rem', outline: 'none', caretColor: '#00ff41' }} />
            <button onClick={() => { if (!chatIn.trim()) return; const t = chatIn.trim(); setChatIn(''); if (dmTarget) wsSend({ type: 'chat', room: 'dm', text: t, toId: dmTarget.id }); else wsSend({ type: 'chat', room: 'world', text: t }); }} style={{ background: 'rgba(0,255,65,.08)', border: '1px solid rgba(0,255,65,.28)', color: '#00ff41', cursor: 'pointer', padding: '0 .4rem', fontSize: '.62rem' }}>↵</button>
          </div>
        </div>
      )}

      {/* ── PABLO ONBOARDING (first Terminal open) ── */}
      {showPablo && !gs.current.pabloOnboardingDone && (
        <PabloOnboarding
          charName={char.name}
          charClass={char.class}
          onComplete={(answers: OnboardingAnswers) => {
            gs.current.pabloOnboardingDone = true;
            gs.current.perception = answers.perception ?? 5;
            setPabloMsgs(m => [...m, {
              role: 'pablo' as const,
              text: `Profile calibrated. Combat: ${answers.combatStyle.toUpperCase()}. Type: ${answers.playstyle.toUpperCase()}. Objective: ${answers.goal.toUpperCase()}. Perception: ${answers.perception ?? 5}. Welcome to Minx City, ${char.name}. I'm always here when you open the Terminal.`,
            }]);
            setNarr('> PABLO ONBOARDING COMPLETE. Your profile has been calibrated. Terminal is now fully operational.');
            doSaveRef.current(buildSaveData());
          }}
        />
      )}

      {/* ── TERMINAL HUB PANEL ── */}
      {showPablo && gs.current.pabloOnboardingDone && (() => {
        const g = gs.current;
        const VT: React.CSSProperties = { fontFamily: "'VT323',monospace" };
        const ST: React.CSSProperties = { fontFamily: "'Share Tech Mono',monospace" };
        const tabS = (active: boolean): React.CSSProperties => ({
          padding: '.3rem .6rem', border: active ? '1px solid rgba(0,255,65,.7)' : '1px solid rgba(0,255,65,.12)',
          background: active ? 'rgba(0,255,65,.08)' : 'transparent',
          color: active ? '#00ff41' : 'rgba(0,255,65,.3)', cursor: 'pointer', ...VT, fontSize: '.85rem', letterSpacing: '.08em',
        });
        const StatRow = ({ label, val, col, bar }: { label: string; val: string | number; col?: string; bar?: number }) => (
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '.4rem', alignItems: 'center', marginBottom: '.18rem' }}>
            <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.1em', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
              <span style={{ ...VT, fontSize: '.9rem', color: col ?? '#00ff41', letterSpacing: '.05em' }}>{val}</span>
              {bar !== undefined && (
                <div style={{ flex: 1, height: 4, background: 'rgba(0,255,65,.08)', maxWidth: 100 }}>
                  <div style={{ height: '100%', width: `${bar}%`, background: bar > 40 ? (col ?? '#00ff41') : '#ff4444', transition: 'width .3s' }} />
                </div>
              )}
            </div>
          </div>
        );
        const curZone = inCityBounds(g.px, g.py) ? 'MINX CITY' : 'WASTELAND';
        const netWorth = salary + goldBalance * FIAT_PER_GOLD;
        const usdConversion = (netWorth * 0.012).toFixed(2);

        return (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', zIndex: 250, paddingRight: '3%' }}
            onClick={e => { if (e.target === e.currentTarget) { setShowPablo(false); gs.current.atPublicTerminal = false; setAtPublicTerminal(false); } }}>
            <div style={{ width: 440, maxWidth: '90vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'rgba(0,5,0,.99)', border: '1px solid rgba(0,255,65,.5)', boxShadow: '0 0 40px rgba(0,255,65,.08)' }}>

              {/* ── Header ── */}
              <div style={{ padding: '.55rem .85rem', borderBottom: '1px solid rgba(0,255,65,.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                  <div style={{ ...VT, fontSize: '1.5rem', color: '#00ff41', letterSpacing: '.2em' }}>{atPublicTerminal ? 'PUBLIC TERMINAL' : 'TERMINAL HUB'}</div>
                  <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.12em' }}>
                    {`OPERATIVE: ${char.name.toUpperCase()} · ${char.class.toUpperCase()} · LVL ${level}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...VT, fontSize: '.85rem', color: '#00ff41', letterSpacing: '.08em' }}>● ONLINE</div>
                  <button onClick={() => { setShowPablo(false); gs.current.atPublicTerminal = false; setAtPublicTerminal(false); }} style={{ background: 'transparent', border: 'none', color: 'rgba(0,255,65,.35)', cursor: 'pointer', fontSize: '.7rem', display: 'block', marginTop: '.15rem' }}>ESC ✕</button>
                </div>
              </div>

              {/* ── Tabs ── */}
              <div style={{ display: 'flex', gap: '.2rem', padding: '.3rem .5rem', borderBottom: '1px solid rgba(0,255,65,.12)', flexShrink: 0, flexWrap: 'wrap' }}>
                {(['chat','stats','city'] as const).map(t => (
                  <button key={t} onClick={() => setPabloTab(t)} style={tabS(pabloTab === t)}>
                    {t === 'chat' ? '🤖 PABLO AI' : t === 'stats' ? '📊 STATS' : '🏙 INFO'}
                  </button>
                ))}
              </div>

              {/* ── Body ── */}
              <div style={{ flex: 1, overflow: 'auto', padding: '.65rem .85rem' }}>

                {/* STATS TAB — player stats, net worth, USD conversion — always accessible */}
                {pabloTab === 'stats' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                    {isTrial && (
                      <div style={{ border: '1px solid rgba(255,165,0,.35)', background: 'rgba(255,165,0,.06)', padding: '.3rem .5rem', fontSize: '.5rem', color: 'rgba(255,165,0,.7)', letterSpacing: '.08em', marginBottom: '.2rem' }}>
                        ⏳ MX-75 TRIAL · {trialDaysLeft}d REMAINING — After trial, use physical terminals.
                      </div>
                    )}
                    <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.14em', marginBottom: '.1rem' }}>OPERATIVE STATUS</div>
                    <StatRow label="HP" val={`${Math.floor(hp)}/${g.maxHp}`} col={hpColor} bar={(hp / g.maxHp) * 100} />
                    <StatRow label="HUNGER" val={`${hunger}%`} col={hunger > 50 ? '#00ff41' : hunger > 25 ? '#aaff22' : '#ff6622'} bar={hunger} />
                    <StatRow label="THIRST" val={`${thirst}%`} col={thirst > 50 ? '#33aaff' : thirst > 25 ? '#aaff22' : '#ff6622'} bar={thirst} />
                    <StatRow label="ENERGY" val={`${energy}%`} col={energy > 50 ? '#ffcc00' : energy > 25 ? '#aaff22' : '#ff4444'} bar={energy} />
                    <StatRow label="LEVEL" val={`${level} / ${MAX_LEVEL}`} col="#ffcc00" />
                    <StatRow label="EXP" val={level >= MAX_LEVEL ? 'MAX' : `${exp}/${expToLevel(level)}`} col="#ffcc00" bar={level >= MAX_LEVEL ? 100 : Math.min(100, (exp / expToLevel(level)) * 100)} />
                    <StatRow label="DEF" val={(CLASS_STATS[char.class.toLowerCase()] ?? CLASS_STATS.corporate).defBonus} col="#44aaff" />
                    <StatRow label="PERCEPTION" val={gs.current.perception ?? 5} col="#cc88ff" />
                    <StatRow label="TOTAL EXP" val={gs.current.totalExpEarned?.toLocaleString() ?? '0'} col="#ffcc00" />
                    {poisoned && <StatRow label="STATUS" val="POISONED" col="#88ff44" />}
                    <div style={{ borderTop: '1px solid rgba(0,255,65,.1)', paddingTop: '.4rem', marginTop: '.2rem' }}>
                      <div style={{ fontSize: '.55rem', color: 'rgba(255,215,0,.35)', letterSpacing: '.14em', marginBottom: '.25rem' }}>NET WORTH & FINANCES</div>
                      <StatRow label="NET WORTH" val={`ƒ${netWorth.toLocaleString()}`} col="#FFD700" />
                      <StatRow label="USD VALUE" val={`~$${usdConversion}`} col="#33ffaa" />
                      <StatRow label="FIAT" val={`ƒ${salary.toLocaleString()}`} col="#00ff41" />
                      <StatRow label="GOLD" val={`${goldBalance}oz`} col="#FFD700" />
                      <StatRow label="SALARY" val={`ƒ${salary.toLocaleString()}`} />
                    </div>
                    <div style={{ borderTop: '1px solid rgba(0,255,65,.1)', paddingTop: '.4rem', marginTop: '.2rem' }}>
                      <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.14em', marginBottom: '.25rem' }}>LOCATION</div>
                      <StatRow label="ZONE" val={curZone} col={curZone === 'MINX CITY' ? '#00ff41' : '#88ff44'} />
                      {calendarStr && <StatRow label="CALENDAR" val={calendarStr} />}
                      {weatherStr && <StatRow label="WEATHER" val={weatherStr.replace('_', ' ')} col={weatherStr === 'ACID_RAIN' ? '#66ff44' : weatherStr === 'SNOW' ? '#aabbff' : '#00ff41'} />}
                      <StatRow label="SEASON" val={seasonStr} col={seasonStr === 'WINTER' ? '#88bbff' : seasonStr === 'SUMMER' ? '#ff8844' : '#00ff41'} />
                      <StatRow label="TEMP" val={`${tempC}°C`} col={tempC <= 5 ? '#88bbff' : tempC >= 30 ? '#ff8844' : '#00ff41'} />
                    </div>
                  </div>
                )}

                {/* CITY INFO TAB — always accessible */}
                {pabloTab === 'city' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                    {isTrial && (
                      <div style={{ border: '1px solid rgba(255,165,0,.35)', background: 'rgba(255,165,0,.06)', padding: '.3rem .5rem', fontSize: '.5rem', color: 'rgba(255,165,0,.7)', letterSpacing: '.08em' }}>
                        ⏳ MX-75 TRIAL · {trialDaysLeft}d REMAINING — After trial, use physical terminals.
                      </div>
                    )}
                    <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.14em', marginBottom: '.15rem' }}>MINX CITY — NETWORK STATUS</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem' }}>
                      <StatRow label="SERVER" val="PST · ONLINE" col="#00ff41" />
                      <StatRow label="PLAYERS ONLINE" val={`${online.length + 1}`} col={online.length > 0 ? '#00ff41' : 'rgba(0,255,65,.5)'} />
                      <StatRow label="FACTION" val="PABLO CORP." col="#b400ff" />
                      <StatRow label="BANCO OMBRA" val={`ƒ${salary.toLocaleString()}`} col="#ffcc00" />
                    </div>
                    <div style={{ borderTop: '1px solid rgba(0,255,65,.1)', paddingTop: '.4rem', marginTop: '.1rem' }}>
                      <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.14em', marginBottom: '.25rem' }}>CURRENT ZONE</div>
                      <div style={{ border: '1px solid rgba(0,255,65,.15)', padding: '.5rem', fontSize: '.55rem', color: 'rgba(0,255,65,.65)', lineHeight: 1.8 }}>
                        {curZone === 'MINX CITY'
                          ? 'MINX CITY — Corporate zone. PABLO CORP. patrols active. Standard services available.'
                          : `WASTELAND — ${gangZone ? `${gangZone.replace('_',' ').toUpperCase()} territory.` : 'Open wasteland.'} Survival conditions. Stay mobile.`}
                      </div>
                    </div>
                    <div style={{ borderTop: '1px solid rgba(0,255,65,.1)', paddingTop: '.4rem' }}>
                      <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.14em', marginBottom: '.25rem' }}>PRODUCTIVITY TOOLS</div>
                      <div style={{ border: '1px solid rgba(0,255,65,.1)', padding: '.5rem', fontSize: '.5rem', color: 'rgba(0,255,65,.5)', lineHeight: 1.9 }}>
                        All tools are free on every terminal — personal or public.<br/>
                        ▸ <span style={{ color: '#ff4444' }}>{PABLO_PRODUCTS.PROBLEM_DESC.name}</span> — {PABLO_PRODUCTS.PROBLEM_DESC.desc}<br/>
                        ▸ <span style={{ color: '#ff4444' }}>{PABLO_PRODUCTS.SCAN_SCREEN.name}</span> — {PABLO_PRODUCTS.SCAN_SCREEN.desc}<br/>
                        ▸ <span style={{ color: '#33aaff' }}>{PABLO_PRODUCTS.LIVE_LISTEN.name}</span> — {PABLO_PRODUCTS.LIVE_LISTEN.desc}<br/>
                        ▸ <span style={{ color: '#00ff41' }}>PABLO AI</span> — Neural assistant (this terminal)
                      </div>
                    </div>
                    <div style={{ borderTop: '1px solid rgba(0,255,65,.1)', paddingTop: '.4rem' }}>
                      <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.14em', marginBottom: '.25rem' }}>PREMIUM MODULES</div>
                      {Object.entries(SUBSCRIPTION_PRICING).map(([key, tier]) => (
                        <div key={key} style={{ border: `1px solid ${isPro ? 'rgba(0,255,65,.2)' : 'rgba(255,200,60,.15)'}`, padding: '.4rem .5rem', marginBottom: '.3rem', background: isPro ? 'rgba(0,255,65,.04)' : 'rgba(255,200,60,.03)', opacity: isPro ? 1 : 0.5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ ...VT, fontSize: '.8rem', color: isPro ? '#00ff41' : '#ffcc44', letterSpacing: '.06em' }}>
                              {isPro ? '✓ ' : '🔒 '}{tier.name}
                            </span>
                            <span style={{ fontSize: '.5rem', color: isPro ? 'rgba(0,255,65,.4)' : 'rgba(255,200,60,.5)' }}>
                              {isPro ? (isTrial ? 'TRIAL ACTIVE' : 'UNLOCKED') : `ƒ${tier.monthlyFiat}/mo · ${tier.trialDays}d FREE TRIAL`}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.15)', marginTop: '.25rem', lineHeight: 1.6 }}>
                      PABLO CORP. — 24 towers, 24 cities, one network. All transmissions logged. All terminals monitored.
                    </div>
                  </div>
                )}

                {/* PABLO AI CHAT TAB */}
                {pabloTab === 'chat' && (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 280 }}>
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '.35rem', paddingBottom: '.3rem', minHeight: 180 }}>
                      {pabloMsgs.length === 0 && (
                        <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.22)', lineHeight: 1.8 }}>
                          &gt; PABLO AI ONLINE<br/>
                          &gt; Ask anything. I know Minx City. Some of it I won't tell you.
                        </div>
                      )}
                      {pabloMsgs.map((m, i) => (
                        <div key={i} style={{ fontSize: '.6rem', lineHeight: 1.6, color: m.role === 'user' ? 'rgba(0,255,65,.5)' : '#00ff41', paddingLeft: m.role === 'pablo' ? '.45rem' : 0, borderLeft: m.role === 'pablo' ? '2px solid rgba(0,255,65,.25)' : 'none' }}>
                          <span style={{ ...VT, fontSize: '.72rem', color: 'rgba(0,255,65,.3)', marginRight: '.25rem' }}>
                            {m.role === 'user' ? `[${char.name.slice(0,10)}]` : '[PABLO]'}
                          </span>
                          {m.text}
                        </div>
                      ))}
                      {pabloLoad && (
                        <div style={{ ...VT, fontSize: '.85rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.1em' }}>PABLO . . .</div>
                      )}
                    </div>
                    <div style={{ borderTop: '1px solid rgba(0,255,65,.12)', paddingTop: '.4rem', display: 'flex', gap: '.3rem' }}>
                      <input
                        value={pabloIn}
                        onChange={e => setPabloIn(e.target.value)}
                        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') sendPablo(); }}
                        placeholder="Ask PABLO anything..."
                        style={{ flex: 1, background: 'rgba(0,8,0,.95)', border: '1px solid rgba(0,255,65,.2)', color: '#00ff41', ...ST, fontSize: '.62rem', padding: '.3rem .5rem', outline: 'none', caretColor: '#00ff41' }}
                      />
                      <button onClick={sendPablo} disabled={pabloLoad}
                        style={{ background: 'rgba(0,255,65,.07)', border: '1px solid rgba(0,255,65,.3)', color: '#00ff41', cursor: 'pointer', padding: '0 .55rem', ...VT, fontSize: '1rem' }}>↵</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: '.3rem .85rem', borderTop: '1px solid rgba(0,255,65,.1)', fontSize: '.55rem', color: 'rgba(0,255,65,.12)', letterSpacing: '.07em', flexShrink: 0 }}>
                TERMINAL HUB v2.0 · PABLO CORP. · ALL TRANSMISSIONS LOGGED · ESC TO CLOSE
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── DIALOG ── */}
      {dialog && (
        <div style={{ position: 'absolute', bottom: 110, left: '50%', transform: 'translateX(-50%)', width: 480, maxWidth: '88vw', background: 'rgba(0,6,0,.97)', border: '1px solid rgba(0,255,65,.45)', padding: '.9rem 1rem', zIndex: 200, cursor: 'pointer' }} onClick={advDialog}>
          <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.12em', marginBottom: '.35rem' }}>PABLO CORP. TRANSMISSION</div>
          <div style={{ fontSize: '.75rem', color: '#00ff41', lineHeight: 1.7, letterSpacing: '.03em', minHeight: '2rem' }}>{dialog.lines[dialog.idx]}</div>
          <div style={{ marginTop: '.4rem', textAlign: 'right', fontSize: '.45rem', color: 'rgba(0,255,65,.28)' }}>[{dialog.idx + 1}/{dialog.lines.length}] CLICK or SPACE ▶</div>
        </div>
      )}

      {/* ── PABLO STORE ACTIVATION ── */}
      {showStore && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,3,0,.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ width: 420, maxWidth: '90vw', border: '1px solid rgba(0,255,65,.55)', background: 'rgba(0,10,0,.98)', padding: '1.65rem' }}>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.7rem', color: '#00ff41', textShadow: '0 0 12px rgba(0,255,65,.4)', letterSpacing: '.15em', marginBottom: '.2rem' }}>PABLO DEVICE</div>
            <div style={{ fontSize: '.52rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.08em', marginBottom: '1.25rem' }}>REGISTERED — {char.name.toUpperCase()}</div>
            <div style={{ border: '1px solid rgba(0,255,65,.5)', padding: '.7rem', background: 'rgba(0,255,65,.05)', marginBottom: '1.1rem' }}>
              <div style={{ fontFamily: "'VT323',monospace", fontSize: '1rem', color: '#00ff41', letterSpacing: '.1em', marginBottom: '.5rem' }}>{PABLO_PRODUCTS.PRO_TIER.name} — $4–6/mo</div>
              <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.45)', lineHeight: 1.6, marginBottom: '.5rem' }}>{PABLO_PRODUCTS.PRO_TIER.desc}</div>
              {[
                [PABLO_PRODUCTS.PABLO_AI_PRO.short, PABLO_PRODUCTS.PABLO_AI_PRO.desc],
                [PABLO_PRODUCTS.LIVE_LISTEN.short, PABLO_PRODUCTS.LIVE_LISTEN.desc],
                [PABLO_PRODUCTS.SCAN_SCREEN.short, PABLO_PRODUCTS.SCAN_SCREEN.desc],
                [PABLO_PRODUCTS.SAY_THIS.short, PABLO_PRODUCTS.SAY_THIS.desc],
                [PABLO_PRODUCTS.CONTACTS.short, PABLO_PRODUCTS.CONTACTS.desc],
              ].map(([name, desc]) => (
                <div key={name} style={{ fontSize: '.52rem', color: 'rgba(0,255,65,.6)', lineHeight: 1.7, marginBottom: '.2rem' }}>
                  ▸ <span style={{ color: '#00ff41' }}>{name}</span> — <span style={{ color: 'rgba(0,255,65,.4)' }}>{desc}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '.55rem' }}>
              <button onClick={() => { setShowStore(false); navigate('/upgrade'); }} style={{ flex: 1, padding: '.55rem', background: 'rgba(0,255,65,.1)', border: '1px solid rgba(0,255,65,.6)', color: '#00ff41', fontFamily: "'VT323',monospace", fontSize: '1rem', letterSpacing: '.15em', cursor: 'pointer' }}>{`GET ${PABLO_PRODUCTS.PRO_TIER.name}`}</button>
              <button onClick={() => { setShowStore(false); setNarr('> PABLO device active. Press [P] to open it.'); }} style={{ padding: '.55rem .85rem', background: 'transparent', border: '1px solid rgba(0,255,65,.18)', color: 'rgba(0,255,65,.38)', fontFamily: "'VT323',monospace", fontSize: '.85rem', cursor: 'pointer' }}>CONTINUE</button>
            </div>
          </div>
        </div>
      )}

      {/* ── SHADOW TOWER — OFFICE RENTAL ── */}
      {showOffice && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,3,0,.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ width: 460, maxWidth: '90vw', border: '1px solid rgba(140,0,220,.45)', background: 'rgba(6,0,12,.99)', padding: '1.65rem' }}>
            {char.hasBusiness && (
              <div style={{ marginBottom: '.8rem', padding: '.4rem .7rem', border: '1px solid rgba(0,255,65,.25)', background: 'rgba(0,255,65,.04)', textAlign: 'center' }}>
                <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.3rem', color: '#00ff41', letterSpacing: '.18em' }}>MINX CITY BUSINESS</div>
                <div style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.4)', letterSpacing: '.1em', marginTop: '.15rem' }}>{char.company} — {char.name}</div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.1rem' }}>
              <div>
                <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.7rem', color: '#00ff41', letterSpacing: '.14em' }}>SHADOW TOWER</div>
                <div style={{ fontSize: '.52rem', color: 'rgba(140,0,220,.7)', letterSpacing: '.08em', marginTop: '.15rem' }}>FLOORS 1–39 — COMMERCIAL LEASE. FLOOR 40+ RESTRICTED.</div>
              </div>
              <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                {rentedOffice && (
                  <button onClick={() => { const lk = lockMap.get('pablo_tower'); setPwPrompt({ bid: 'pablo_tower', label: 'SHADOW TOWER', mode: lk ? 'enter' : 'set' }); setShowOffice(false); }} style={{ fontSize: '.48rem', padding: '2px 7px', background: 'rgba(0,255,65,.06)', border: '1px solid rgba(0,255,65,.22)', color: 'rgba(0,255,65,.45)', cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace" }}>
                    {lockMap.get('pablo_tower') ? '🔒 LOCKED' : 'SET CODE'}
                  </button>
                )}
                <button onClick={() => setShowOffice(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(0,255,65,.32)', cursor: 'pointer', fontFamily: "'VT323',monospace", fontSize: '.95rem' }}>ESC</button>
              </div>
            </div>
            {rentedOffice && <div style={{ marginBottom: '.85rem', padding: '.38rem .6rem', border: '1px solid rgba(0,255,65,.3)', background: 'rgba(0,255,65,.05)', fontSize: '.58rem', color: '#00ff41' }}>▸ ACTIVE LEASE: {rentedOffice}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.55rem', marginBottom: '1.1rem' }}>
              {OFFICE_TIERS.map(({ label, price, desc }) => {
                const isRented = rentedOffice === label;
                const canAfford = salary >= price;
                return (
                  <div key={label} style={{ border: isRented ? '1px solid rgba(0,255,65,.65)' : '1px solid rgba(0,255,65,.16)', padding: '.7rem', background: isRented ? 'rgba(0,255,65,.06)' : 'transparent', position: 'relative' }}>
                    {isRented && <div style={{ position: 'absolute', top: 4, right: 5, fontSize: '.45rem', color: '#00ff41', fontFamily: "'VT323',monospace" }}>LEASED</div>}
                    <div style={{ fontFamily: "'VT323',monospace", fontSize: '.95rem', color: isRented ? '#00ff41' : 'rgba(0,255,65,.62)', letterSpacing: '.07em', marginBottom: '.18rem' }}>{label}</div>
                    <div style={{ fontSize: '.62rem', color: isRented ? '#00ff41' : canAfford ? 'rgba(0,255,65,.52)' : 'rgba(255,100,100,.5)', fontFamily: "'VT323',monospace", marginBottom: '.28rem' }}>ƒ{price.toLocaleString()} FIAT</div>
                    <div style={{ fontSize: '.52rem', color: 'rgba(0,255,65,.32)', lineHeight: 1.6 }}>{desc}</div>
                    <button onClick={() => {
                      if (isRented) { localStorage.removeItem('sm_office'); setRentedOffice(null); setNarr('> Lease cancelled.'); return; }
                      if (!canAfford) { setNarr(`> Need ƒ${price.toLocaleString()} FIAT. Have ƒ${salary.toLocaleString()}.`); return; }
                      const g = gs.current; g.salary -= price; setSalary(g.salary);
                      localStorage.setItem('sm_office', label); setRentedOffice(label);
                      setNarr(`> ${label} leased. ƒ${price.toLocaleString()} FIAT deducted. Set a security code from the lease panel.`);
                    }} style={{ marginTop: '.45rem', width: '100%', padding: '.28rem', background: isRented ? 'rgba(255,50,50,.06)' : canAfford ? 'rgba(0,255,65,.07)' : 'transparent', border: isRented ? '1px solid rgba(255,80,80,.28)' : canAfford ? '1px solid rgba(0,255,65,.38)' : '1px solid rgba(0,255,65,.08)', color: isRented ? 'rgba(255,80,80,.62)' : canAfford ? '#00ff41' : 'rgba(0,255,65,.16)', fontFamily: "'VT323',monospace", fontSize: '.8rem', letterSpacing: '.08em', cursor: canAfford || isRented ? 'pointer' : 'default' }}>
                      {isRented ? 'CANCEL' : canAfford ? 'RENT' : 'NO FUNDS'}
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: '.48rem', color: 'rgba(140,0,220,.35)', lineHeight: 1.7, borderTop: '1px solid rgba(140,0,220,.12)', paddingTop: '.6rem' }}>
              Tenants may set a security code. Floors 40+ are permanently sealed by order of SENIOR PABLO. Do not inquire about the penthouse.
            </div>
          </div>
        </div>
      )}

      {/* ── PASSWORD ── */}
      {pwPrompt && (
        <PwPrompt label={pwPrompt.label} onCancel={() => { setPwPrompt(null); setPendingBid(null); }}
          onOk={pw => { if (pwPrompt.mode === 'set') wsSend({ type: 'building_lock_set', buildingId: pwPrompt.bid, password: pw }); else wsSend({ type: 'building_lock_check', buildingId: pwPrompt.bid, password: pw }); }} />
      )}

      {/* ── FLOOR PANEL / ELEVATOR ── */}
      {floorPanel && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 320 }}>
          <div style={{ width: 'min(540px, 96vw)', border: '1px solid rgba(0,255,65,.35)', background: 'rgba(2,14,4,.97)', fontFamily: "'Share Tech Mono',monospace", color: '#00ff41', padding: '1.8rem 2rem', maxHeight: '86vh', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontFamily: "'VT323',monospace", fontSize: '2rem', color: '#00ff41', letterSpacing: '.2em' }}>{floorPanel.dir.label}</div>
                <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.4)', letterSpacing: '.15em', marginTop: '.2rem' }}>BUILDING DIRECTORY · ELEVATOR PANEL</div>
              </div>
              <button onClick={() => setFloorPanel(null)} style={{ background: 'transparent', border: 'none', color: 'rgba(0,255,65,.4)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: 0 }}>✕ ESC</button>
            </div>
            <div style={{ width: '100%', height: '1px', background: 'linear-gradient(90deg,transparent,rgba(0,255,65,.3),transparent)', marginBottom: '.9rem' }} />
            {/* History */}
            <div style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.55)', lineHeight: 1.7, marginBottom: '1rem', padding: '.6rem', border: '1px solid rgba(0,255,65,.1)', background: 'rgba(0,255,65,.02)' }}>
              {floorPanel.dir.history}
            </div>
            {/* Floor list */}
            <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.12em', marginBottom: '.5rem' }}>── SELECT FLOOR ──</div>
            {floorPanel.dir.floors.map((fl, fi) => (
              <div key={fi}
                onClick={() => setFloorPanel(prev => prev ? { ...prev, selectedFloor: fi } : null)}
                style={{
                  padding: '.55rem .7rem', marginBottom: '.3rem', border: `1px solid ${floorPanel.selectedFloor === fi ? 'rgba(0,255,65,.6)' : 'rgba(0,255,65,.12)'}`,
                  background: floorPanel.selectedFloor === fi ? 'rgba(0,255,65,.07)' : 'transparent', cursor: 'pointer',
                  transition: 'all .15s',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: floorPanel.selectedFloor === fi ? '.4rem' : 0 }}>
                  <span style={{ color: '#00ff41', fontSize: '.5rem', letterSpacing: '.1em' }}>FL {String(fl.floor).padStart(2,'0')}</span>
                  <span style={{ color: floorPanel.selectedFloor === fi ? '#00ff41' : 'rgba(0,255,65,.5)', fontSize: '.5rem', letterSpacing: '.08em' }}>{fl.name}</span>
                </div>
                {floorPanel.selectedFloor === fi && (
                  <div>
                    <div style={{ fontSize: '.43rem', color: 'rgba(0,255,65,.6)', lineHeight: 1.7, marginTop: '.2rem', paddingTop: '.3rem', borderTop: '1px solid rgba(0,255,65,.12)' }}>
                      {fl.desc}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (fl.restricted) {
                          setNarr(`> ACCESS DENIED — Floor ${fl.floor} requires clearance you do not have.`);
                          return;
                        }
                        const g = gs.current;
                        const def = generateFloorInterior(floorPanel.bid, fl, floorPanel.dir.label);
                        g.interiorFade = 0;
                        g.interiorFadeDir = 1;
                        g.interiorFadeCallback = () => {
                          g.interior = {
                            bid: def.id,
                            def,
                            px: def.exitX + def.exitW / 2,
                            py: def.exitY - 20,
                            savedWorldX: g.px,
                            savedWorldY: g.py,
                          };
                          g.interiorFadeDir = -1;
                        };
                        setFloorPanel(null);
                        setNarr(`> ELEVATOR — Floor ${fl.floor}: ${fl.name}. ${fl.desc}`);
                      }}
                      style={{
                        marginTop: '.4rem', width: '100%', padding: '.4rem', cursor: fl.restricted ? 'not-allowed' : 'pointer',
                        background: fl.restricted ? 'rgba(255,60,60,.08)' : 'rgba(0,255,65,.08)',
                        border: `1px solid ${fl.restricted ? 'rgba(255,60,60,.4)' : 'rgba(0,255,65,.4)'}`,
                        color: fl.restricted ? '#ff4444' : '#00ff41',
                        fontFamily: "'VT323',monospace", fontSize: '.8rem', letterSpacing: '.12em',
                      }}
                    >
                      {fl.restricted ? '🔒 RESTRICTED' : `▸ VISIT FLOOR ${fl.floor}`}
                    </button>
                  </div>
                )}
              </div>
            ))}
            <div style={{ marginTop: '.8rem', fontSize: '.55rem', color: 'rgba(0,255,65,.2)', textAlign: 'center', letterSpacing: '.1em' }}>CLICK FLOOR TO EXPAND · ESC TO EXIT BUILDING</div>
          </div>
        </div>
      )}

      {/* ── POWER GRID HUD INDICATOR ── */}
      {powerPct < 100 && (
        <div style={{ position: 'absolute', top: '3.5rem', right: '.8rem', zIndex: 200, fontFamily: "'Share Tech Mono',monospace", fontSize: '.55rem', border: `1px solid rgba(${powerPct < 30 ? '255,60,60' : '255,140,0'},.5)`, background: 'rgba(0,0,0,.8)', padding: '.3rem .55rem', color: powerPct < 30 ? '#ff4444' : '#ffaa00', letterSpacing: '.1em', animation: powerPct < 30 ? 'smfade 0.6s steps(1) infinite alternate' : 'none' }}>
          ⚡ POWER {powerPct}%{powerPct < 30 ? ' — BLACKOUT' : ' — REDUCED'}
        </div>
      )}

      {/* ── RADIO HUD + HIDDEN PLAYER ── */}
      <RadioHud visible={radioVisible} on={radioOn} fading={radioFading} topOffset={powerPct < 100 ? '5.2rem' : '3.5rem'} onToggle={handleRadioToggle} />
      <RadioPlayer playing={radioOn} mounted={playerEverMounted} muted={musicMuted || allMuted} />

      {/* City event ticker removed — replaced by proximity notification bar at top */}

      {/* ── LEVEL UP OVERLAY ── */}
      {/* ── QUICK JOB PANEL ──────────────────────────────────────────────── */}
      {jobPanel && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 360 }}>
          <div style={{ width: 360, border: '1px solid rgba(0,255,65,.4)', background: 'rgba(0,8,2,.97)', padding: '1.6rem', fontFamily: "'Share Tech Mono',monospace" }}>
            <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.15em', marginBottom: '.3rem' }}>QUICK JOB AVAILABLE</div>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '2rem', color: '#00ff41', letterSpacing: '.15em', marginBottom: '.4rem' }}>{jobPanel.label}</div>
            <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.5)', marginBottom: '1rem' }}>
              Pay: <strong style={{ color: '#ffdd44' }}>${jobPanel.pay}</strong> · Duration: <strong style={{ color: '#00ff41' }}>{jobPanel.seconds}s</strong>
            </div>
            {/* Progress bar */}
            <div style={{ height: 6, background: 'rgba(0,255,65,.1)', marginBottom: '1rem', position: 'relative', border: '1px solid rgba(0,255,65,.2)' }}>
              <div style={{ height: '100%', background: '#00ff41', width: `${(jobPanel.progress / jobPanel.seconds) * 100}%`, transition: 'width 0.25s' }} />
            </div>
            {jobPanel.progress < jobPanel.seconds ? (
              <div style={{ display: 'flex', gap: '.75rem' }}>
                <button onClick={() => {
                  if (jobTimerRef.current) return;
                  const startTime = Date.now();
                  jobTimerRef.current = setInterval(() => {
                    const elapsed = (Date.now() - startTime) / 1000;
                    if (elapsed >= jobPanel.seconds) {
                      clearInterval(jobTimerRef.current!); jobTimerRef.current = null;
                      const g = gs.current;
                      g.salary += jobPanel.pay; g.jobCooldowns[jobPanel.bid] = QUICK_JOBS[jobPanel.bid]?.cooldownFrames ?? 900;
                      g.floaters.push({ x: g.px, y: g.py - 20, text: `+ƒ${jobPanel.pay}`, color: '#ffdd44', life: 70, maxLife: 70 });
                      setSalary(g.salary); sfxCoin();
                      setNarr(`> JOB COMPLETE — ${jobPanel.label}. +ƒ${jobPanel.pay}. Credits transferred.`);
                      setJobPanel(null);
                    } else {
                      setJobPanel(prev => prev ? { ...prev, progress: elapsed } : null);
                    }
                  }, 250);
                }} style={{ flex: 1, padding: '.6rem', background: 'rgba(0,255,65,.08)', border: '1px solid rgba(0,255,65,.4)', color: '#00ff41', cursor: 'pointer', fontFamily: "'VT323',monospace", fontSize: '1.2rem', letterSpacing: '.1em' }}>
                  START JOB
                </button>
                <button onClick={() => { if (jobTimerRef.current) { clearInterval(jobTimerRef.current); jobTimerRef.current = null; } setJobPanel(null); }}
                  style={{ padding: '.6rem 1rem', background: 'transparent', border: '1px solid rgba(0,255,65,.15)', color: 'rgba(0,255,65,.3)', cursor: 'pointer', fontFamily: "'VT323',monospace", fontSize: '1.2rem' }}>
                  CANCEL
                </button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', fontSize: '.6rem', color: '#ffdd44', letterSpacing: '.1em' }}>JOB COMPLETE</div>
            )}
          </div>
        </div>
      )}

      {/* ── VENDING MACHINE SHOP ─────────────────────────────────────────── */}
      {showVend && (() => {
        const g = gs.current;
        const cat = VEND_CATALOG.find(c => c.id === vendTab) ?? VEND_CATALOG[0];
        const doVendBuy = (item: VendItem) => {
          const goldReq = (item as any).goldPrice as number | undefined;
          if (goldReq && goldReq > 0) {
            if (g.goldBalance < goldReq) { sfxError(); setNarr(`> GOLD REQUIRED — Real estate requires ${goldReq}oz GOLD. You have ${g.goldBalance}oz. Visit the GOLD EXCHANGE.`); return; }
            if (!item.consumable && g.ownedItems.has(item.id)) { sfxError(); setNarr(`> ALREADY OWNED — ${item.name} is in your inventory.`); return; }
            g.goldBalance -= goldReq; setGoldBalance(g.goldBalance); sfxCoin();
            g.ownedItems.add(item.id); setOwnedItems(new Set(g.ownedItems));
            if (REAL_ESTATE_INCOME[item.id]) { g.realEstate.push(item.id); }
            setNarr(`> VENDING MACHINE — ${item.name} acquired for ${goldReq}oz GOLD. Property registered.`);
            return;
          }
          if (g.salary < item.price) { sfxError(); setNarr(`> INSUFFICIENT FIAT — Need ƒ${item.price.toLocaleString()}.`); return; }
          if (item.id === 'pablo_device' && !g.hasDevice) { sfxError(); setNarr('> REPAIR KIT — You don\'t have a device to repair. Find one first.'); return; }
          if (item.id === 'pablo_device' && !g.deviceBroken) { sfxError(); setNarr('> REPAIR KIT — Your device is already working fine.'); return; }
          if (!item.consumable && g.ownedItems.has(item.id)) { sfxError(); setNarr(`> ALREADY OWNED — ${item.name} is in your inventory.`); return; }
          g.salary -= item.price; setSalary(g.salary); sfxCoin();
          // ── Apply effects ──────────────────────────────────────
          if (item.consumable) {
            if (item.id === 'pablo_device') {
              g.deviceBroken = false; g.deviceDurability = 100; setDeviceBroken(false);
              setNarr(`> VENDING MACHINE — ${item.name} applied. Device restored to full durability. ƒ${item.price.toLocaleString()} FIAT spent.`);
              return;
            }
            if (item.effect) {
              const parts = item.effect.split(' ');
              for (const p of parts) {
                if (p.startsWith('hunger'))  { g.hunger  = Math.min(100, g.hunger  + parseInt(p.slice(6)));  setHunger(g.hunger);  }
                if (p.startsWith('thirst'))  { g.thirst  = Math.min(100, g.thirst  + parseInt(p.slice(6)));  setThirst(g.thirst);  }
                if (p.startsWith('energy'))  { g.energy  = Math.min(100, g.energy  + parseInt(p.slice(6)));  setEnergy(g.energy);  }
                if (p.startsWith('hp'))      { g.hp      = Math.min(g.maxHp, g.hp  + parseInt(p.slice(2)));  setHp(Math.floor(g.hp)); }
                if (p === 'cure_poison')     { g.poisoned = false; g.poisonTick = 0; setPoisoned(false); }
              }
            }
            setNarr(`> VENDING MACHINE — ${item.name} used. ƒ${item.price.toLocaleString()} FIAT spent.`);
            return;
          }
          // Non-consumable items
          g.ownedItems.add(item.id);
          setOwnedItems(new Set(g.ownedItems));
          if (item.id === 'netrunner_deck') { g.terminalDiscount = true; }
          if (item.id === 'radio_implant') { g.hasRadioImplant = true; showRadio(); }
          if (VEHICLE_SPEED[item.id]) {
            const curSpd = g.vehicle ? (VEHICLE_SPEED[g.vehicle] ?? 1) : 1;
            if ((VEHICLE_SPEED[item.id] ?? 1) > curSpd) { g.vehicle = item.id; }
          }
          if (WEAPON_TIER[item.id] && (WEAPON_TIER[item.id] ?? 0) > g.weaponTier) {
            g.weaponTier = WEAPON_TIER[item.id] ?? 0;
          }
          if (item.id === 'salaryman_pro') { setShowVend(false); setShowStore(true); return; }
          if (REAL_ESTATE_INCOME[item.id]) { g.realEstate.push(item.id); }
          setNarr(`> VENDING MACHINE — ${item.name} acquired. ƒ${item.price.toLocaleString()} FIAT spent. Check your inventory.`);
        };
        const S2: React.CSSProperties = { fontFamily: "'Share Tech Mono',monospace" };
        const VT2: React.CSSProperties = { fontFamily: "'VT323',monospace" };
        return (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.93)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:360 }}
            onClick={e => { if (e.target === e.currentTarget) setShowVend(false); }}>
            <div style={{ width:760, maxHeight:'90vh', display:'flex', flexDirection:'column', border:'1px solid rgba(0,255,65,.35)', background:'rgba(0,6,2,.98)', fontFamily:"'Share Tech Mono',monospace" }}>
              {/* Header */}
              <div style={{ padding:'1rem 1.2rem .6rem', borderBottom:'1px solid rgba(0,255,65,.15)', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                <div>
                  <div style={{ ...VT2, fontSize:'1.7rem', color:'#00ff41', letterSpacing:'.18em' }}>VENDING MACHINE</div>
                  <div style={{ fontSize:'.42rem', color:'rgba(0,255,65,.3)', letterSpacing:'.12em' }}>PABLO CORP. AUTOMATED RETAIL · 24 REGIONAL NODES · FIAT ONLY</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ ...VT2, fontSize:'1.1rem', color:'#00ff41' }}>ƒ{salary.toLocaleString()}</div>
                  <div style={{ fontSize:'.4rem', color:'rgba(0,255,65,.3)' }}>FIAT BALANCE</div>
                  <button onClick={() => setShowVend(false)} style={{ marginTop:'.3rem', padding:'.2rem .6rem', background:'transparent', border:'1px solid rgba(0,255,65,.2)', color:'rgba(0,255,65,.4)', cursor:'pointer', ...VT2, fontSize:'.95rem' }}>ESC</button>
                </div>
              </div>
              {/* Category tabs */}
              <div style={{ display:'flex', borderBottom:'1px solid rgba(0,255,65,.12)', flexShrink:0, overflowX:'auto' }}>
                {VEND_CATALOG.map(c => (
                  <button key={c.id} onClick={() => setVendTab(c.id as typeof vendTab)}
                    style={{ padding:'.45rem .9rem', background: vendTab === c.id ? 'rgba(0,255,65,.1)' : 'transparent', border:'none', borderRight:'1px solid rgba(0,255,65,.1)', color: vendTab === c.id ? c.col : 'rgba(0,255,65,.28)', cursor:'pointer', ...VT2, fontSize:'1rem', letterSpacing:'.1em', whiteSpace:'nowrap', flexShrink:0 }}>
                    {c.label}
                  </button>
                ))}
              </div>
              {/* Items grid */}
              <div style={{ flex:1, overflowY:'auto', padding:'.8rem 1rem', scrollbarWidth:'thin', scrollbarColor:'rgba(0,255,65,.2) transparent' }}>
                {cat.id === 'pro' ? (
                  /* PRO upgrade special card */
                  <div style={{ border:`1px solid rgba(255,153,0,.35)`, padding:'1.2rem', background:'rgba(255,153,0,.04)' }}>
                    <div style={{ ...VT2, fontSize:'1.6rem', color:'#ff9900', letterSpacing:'.14em', marginBottom:'.4rem' }}>{PABLO_PRODUCTS.PRO_TIER.name}</div>
                    <div style={{ fontSize:'.52rem', color:'rgba(255,153,0,.65)', lineHeight:1.8, marginBottom:'.8rem' }}>
                      {PABLO_PRODUCTS.PRO_TIER.desc} Exclusive gear drops every month. {PABLO_PRODUCTS.PRO_TIER.short} badge visible to all operatives in every zone. Removes all rate limits on Pablo Corp. terminals.
                    </div>
                    <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap', marginBottom:'.8rem' }}>
                      {[`${PABLO_PRODUCTS.PABLO_AI_PRO.short} ACCESS`,'PRIORITY BANDWIDTH','MONTHLY GEAR DROPS',`${PABLO_PRODUCTS.PRO_TIER.short} BADGE`,'NO RATE LIMITS'].map(f => (
                        <span key={f} style={{ fontSize:'.42rem', color:'rgba(255,153,0,.55)', border:'1px solid rgba(255,153,0,.25)', padding:'2px 7px' }}>{f}</span>
                      ))}
                    </div>
                    <div style={{ display:'flex', gap:'1rem', alignItems:'center' }}>
                      <div style={{ ...VT2, fontSize:'1.5rem', color:'#ff9900' }}>$4–6 / MONTH</div>
                      <button onClick={() => { setShowVend(false); setShowStore(true); }}
                        style={{ padding:'.5rem 1.4rem', background:'rgba(255,153,0,.15)', border:'1px solid rgba(255,153,0,.5)', color:'#ff9900', cursor:'pointer', ...VT2, fontSize:'1.1rem', letterSpacing:'.1em' }}>
                        UPGRADE NOW ▶
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'.5rem' }}>
                    {cat.items.map(item => {
                      const owned = g.ownedItems.has(item.id);
                      const goldReq = (item as any).goldPrice as number | undefined;
                      const isGoldOnly = goldReq !== undefined && goldReq > 0;
                      const canAfford = isGoldOnly ? g.goldBalance >= goldReq : g.salary >= item.price;
                      const isReEstate = cat.id === 'realestate';
                      const alreadyHas = !item.consumable && owned;
                      return (
                        <div key={item.id} style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:'.6rem', alignItems:'center', padding:'.6rem .7rem', border:`1px solid ${alreadyHas ? 'rgba(0,255,65,.25)' : 'rgba(0,255,65,.12)'}`, background: alreadyHas ? 'rgba(0,255,65,.04)' : 'transparent' }}>
                          <div>
                            <div style={{ display:'flex', alignItems:'center', gap:'.5rem', marginBottom:'.2rem' }}>
                              <span style={{ ...VT2, fontSize:'1.05rem', color: alreadyHas ? '#00ff41' : cat.col, letterSpacing:'.08em' }}>{item.name}</span>
                              {alreadyHas && <span style={{ fontSize:'.38rem', color:'rgba(0,255,65,.5)', border:'1px solid rgba(0,255,65,.25)', padding:'1px 5px' }}>OWNED</span>}
                              {isReEstate && <span style={{ fontSize:'.38rem', color:'rgba(204,68,255,.6)', border:'1px solid rgba(204,68,255,.2)', padding:'1px 5px' }}>PASSIVE INCOME</span>}
                              {isGoldOnly && <span style={{ fontSize:'.38rem', color:'rgba(255,215,0,.7)', border:'1px solid rgba(255,215,0,.25)', padding:'1px 5px' }}>GOLD ONLY</span>}
                              {item.consumable && <span style={{ fontSize:'.38rem', color:'rgba(0,255,65,.4)', border:'1px solid rgba(0,255,65,.15)', padding:'1px 5px' }}>CONSUMABLE</span>}
                            </div>
                            <div style={{ fontSize:'.46rem', color:'rgba(0,255,65,.4)', lineHeight:1.6 }}>{item.desc}</div>
                          </div>
                          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'.3rem', flexShrink:0 }}>
                            <div style={{ ...VT2, fontSize:'1rem', color: canAfford ? (isGoldOnly ? '#ffd700' : '#00ff41') : 'rgba(255,80,80,.6)' }}>{isGoldOnly ? `${goldReq}oz GOLD` : `ƒ${item.price.toLocaleString()}`}</div>
                            <button
                              onClick={() => doVendBuy(item)}
                              disabled={alreadyHas}
                              style={{ padding:'.25rem .7rem', background: alreadyHas ? 'transparent' : canAfford ? 'rgba(0,255,65,.1)' : 'transparent', border:`1px solid ${alreadyHas ? 'rgba(0,255,65,.15)' : canAfford ? 'rgba(0,255,65,.4)' : 'rgba(255,80,80,.3)'}`, color: alreadyHas ? 'rgba(0,255,65,.25)' : canAfford ? '#00ff41' : 'rgba(255,80,80,.5)', cursor: alreadyHas ? 'not-allowed' : 'pointer', ...VT2, fontSize:'.95rem', letterSpacing:'.08em', ...S2 }}>
                              {alreadyHas ? 'OWNED' : canAfford ? 'BUY' : isGoldOnly ? 'NEED GOLD' : 'EARN FIAT'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Owned items strip */}
              {ownedItems.size > 0 && (
                <div style={{ padding:'.5rem 1rem', borderTop:'1px solid rgba(0,255,65,.1)', flexShrink:0 }}>
                  <div style={{ fontSize:'.4rem', color:'rgba(0,255,65,.25)', letterSpacing:'.1em', marginBottom:'.3rem' }}>INVENTORY</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'.3rem' }}>
                    {[...ownedItems].map(id => {
                      const found = VEND_CATALOG.flatMap(c => c.items).find(i => i.id === id);
                      return found ? <span key={id} style={{ fontSize:'.42rem', color:'rgba(0,255,65,.5)', border:'1px solid rgba(0,255,65,.18)', padding:'2px 7px' }}>{found.name}</span> : null;
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── COMMODITY TRADE TERMINAL ──────────────────────────────────────── */}
      {showTrade && (() => {
        const isCity = showTrade === 'city';
        const cp = commodityPrices.current;
        const totalCargo = Object.values(gs.current.cargo).reduce((a, b) => a + b, 0);
        const loc = isCity ? 'MINX TRADE EXCHANGE' : 'BLACK EXCHANGE — WASTELAND';
        const doBuy = (cid: string) => {
          const c = COMMODITIES.find(x => x.id === cid)!;
          const price = isCity ? cp[cid].cityBuy : cp[cid].wasteBuy;
          if (totalCargo >= MAX_CARGO) { sfxError(); setNarr(`> HOLD FULL — Max ${MAX_CARGO} units. Sell something first.`); return; }
          if (gs.current.salary < price) { sfxError(); setNarr(`> INSUFFICIENT FIAT — Need ƒ${price.toLocaleString()}. Have ƒ${gs.current.salary.toLocaleString()}.`); return; }
          gs.current.salary -= price; setSalary(gs.current.salary);
          gs.current.cargo[cid] = (gs.current.cargo[cid] || 0) + 1;
          setCargo({ ...gs.current.cargo }); sfxCoin();
          setNarr(`> BOUGHT 1x ${c.name} [ƒ${price.toLocaleString()} FIAT]. Cargo: ${totalCargo + 1}/${MAX_CARGO}. Haul to ${isCity ? 'the Wasteland' : 'Minx City'} and sell for profit.`);
        };
        const doSell = (cid: string) => {
          const c = COMMODITIES.find(x => x.id === cid)!;
          if (!gs.current.cargo[cid] || gs.current.cargo[cid] < 1) { sfxError(); setNarr(`> NO STOCK — You are not carrying any ${c.name}.`); return; }
          const price = isCity ? cp[cid].citySell : cp[cid].wasteSell;
          gs.current.salary += price; setSalary(gs.current.salary);
          gs.current.cargo[cid] -= 1;
          if (gs.current.cargo[cid] <= 0) delete gs.current.cargo[cid];
          setCargo({ ...gs.current.cargo }); sfxCoin();
          setNarr(`> SOLD 1x ${c.name} [+ƒ${price.toLocaleString()} FIAT]. Balance: ƒ${gs.current.salary.toLocaleString()}.`);
        };
        const bestRoutes = COMMODITIES.map(c => {
          const cityProfit = cp[c.id].wasteSell - cp[c.id].cityBuy;
          const wasteProfit = cp[c.id].citySell - cp[c.id].wasteBuy;
          return { name: c.name, id: c.id, cityRoute: cityProfit, wasteRoute: wasteProfit };
        }).filter(r => (isCity ? r.cityRoute : r.wasteRoute) > 0)
          .sort((a, b) => (isCity ? b.cityRoute - a.cityRoute : b.wasteRoute - a.wasteRoute))
          .slice(0, 3);
        void cpTick;
        return (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.93)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:360 }}
            onClick={e => { if (e.target === e.currentTarget) setShowTrade(null); }}>
            <div style={{ width:720, maxHeight:'88vh', overflow:'auto', border:'1px solid rgba(0,255,65,.35)', background:'rgba(0,6,2,.98)', padding:'1.2rem', fontFamily:"'Share Tech Mono',monospace" }}>
              {/* Header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'.8rem' }}>
                <div>
                  <div style={{ fontFamily:"'VT323',monospace", fontSize:'1.6rem', color:'#00ff41', letterSpacing:'.18em' }}>{loc}</div>
                  <div style={{ fontSize:'.42rem', color:'rgba(0,255,65,.35)', letterSpacing:'.12em', marginTop:'.15rem' }}>
                    COMMODITY EXCHANGE · PRICES FLUCTUATE · {isCity ? 'BUY CITY → SELL WASTELAND' : 'BUY WASTELAND → SELL CITY'}
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontFamily:"'VT323',monospace", fontSize:'1.1rem', color:'#00ff41' }}>CARGO {totalCargo}/{MAX_CARGO}</div>
                  <div style={{ fontSize:'.42rem', color:'rgba(0,255,65,.3)', marginTop:'.1rem' }}>ƒ{salary.toLocaleString()} FIAT</div>
                  <button onClick={() => setShowTrade(null)} style={{ marginTop:'.3rem', padding:'.2rem .6rem', background:'transparent', border:'1px solid rgba(0,255,65,.2)', color:'rgba(0,255,65,.4)', cursor:'pointer', fontFamily:"'VT323',monospace", fontSize:'.95rem' }}>ESC</button>
                </div>
              </div>
              {/* Best routes banner */}
              {bestRoutes.length > 0 && (
                <div style={{ border:'1px solid rgba(0,255,65,.12)', padding:'.5rem .7rem', marginBottom:'.8rem', background:'rgba(0,255,65,.03)' }}>
                  <div style={{ fontSize:'.42rem', color:'rgba(0,255,65,.3)', letterSpacing:'.14em', marginBottom:'.3rem' }}>ROUTE ANALYSIS — TOP TRADES FROM HERE</div>
                  <div style={{ display:'flex', gap:'1.2rem', flexWrap:'wrap' }}>
                    {bestRoutes.map(r => (
                      <div key={r.id} style={{ fontSize:'.48rem', color:'rgba(0,255,65,.55)' }}>
                        {r.name} → <span style={{ color:'#00ff41' }}>+ƒ{(isCity ? r.cityRoute : r.wasteRoute).toLocaleString()}/unit</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Commodity rows */}
              <div style={{ display:'flex', flexDirection:'column', gap:'.45rem' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px 100px 50px', gap:'.3rem', fontSize:'.4rem', color:'rgba(0,255,65,.25)', letterSpacing:'.1em', paddingBottom:'.3rem', borderBottom:'1px solid rgba(0,255,65,.1)' }}>
                  <div>COMMODITY</div><div style={{ textAlign:'right' }}>BUY</div><div style={{ textAlign:'right' }}>SELL</div><div style={{ textAlign:'right' }}>BEST SELL</div><div style={{ textAlign:'center' }}>HOLD</div>
                </div>
                {COMMODITIES.map(c => {
                  const buyPrice  = isCity ? cp[c.id].cityBuy  : cp[c.id].wasteBuy;
                  const sellPrice = isCity ? cp[c.id].citySell : cp[c.id].wasteSell;
                  const remSell   = isCity ? cp[c.id].wasteSell : cp[c.id].citySell;
                  const held = gs.current.cargo[c.id] || 0;
                  const canBuy = gs.current.salary >= buyPrice && totalCargo < MAX_CARGO;
                  const canSell = held > 0;
                  const profit = remSell - buyPrice;
                  return (
                    <div key={c.id} style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px 100px 50px', gap:'.3rem', alignItems:'center', padding:'.4rem .3rem', border:held > 0 ? '1px solid rgba(0,255,65,.22)' : '1px solid transparent', background:held > 0 ? 'rgba(0,255,65,.03)' : 'transparent' }}>
                      <div>
                        <div style={{ display:'flex', alignItems:'center', gap:'.4rem' }}>
                          <span style={{ fontFamily:"'VT323',monospace", fontSize:'.95rem', color: c.illegal ? 'rgba(255,180,0,.8)' : '#00ff41', letterSpacing:'.07em' }}>{c.name}</span>
                          {c.illegal && <span style={{ fontSize:'.35rem', padding:'1px 4px', border:'1px solid rgba(255,160,0,.4)', color:'rgba(255,160,0,.6)', letterSpacing:'.08em' }}>CONTRABAND</span>}
                        </div>
                        <div style={{ fontSize:'.4rem', color:'rgba(0,255,65,.28)', marginTop:'.05rem', lineHeight:1.5 }}>{c.desc}</div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <button onClick={() => doBuy(c.id)} style={{ width:'100%', padding:'.22rem .3rem', background: canBuy ? 'rgba(0,255,65,.08)' : 'transparent', border: canBuy ? '1px solid rgba(0,255,65,.4)' : '1px solid rgba(0,255,65,.1)', color: canBuy ? '#00ff41' : 'rgba(0,255,65,.2)', fontFamily:"'VT323',monospace", fontSize:'.82rem', cursor: canBuy ? 'pointer' : 'default', letterSpacing:'.05em' }}>
                          ƒ{buyPrice.toLocaleString()}
                        </button>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <button onClick={() => doSell(c.id)} style={{ width:'100%', padding:'.22rem .3rem', background: canSell ? 'rgba(0,255,65,.08)' : 'transparent', border: canSell ? '1px solid rgba(0,255,65,.4)' : '1px solid rgba(0,255,65,.1)', color: canSell ? '#00ff41' : 'rgba(0,255,65,.18)', fontFamily:"'VT323',monospace", fontSize:'.82rem', cursor: canSell ? 'pointer' : 'default', letterSpacing:'.05em' }}>
                          {canSell ? `+ƒ${sellPrice.toLocaleString()}` : '——'}
                        </button>
                      </div>
                      <div style={{ textAlign:'right', fontSize:'.48rem', color: profit > 0 ? 'rgba(0,255,65,.55)' : 'rgba(255,80,80,.45)' }}>
                        {profit > 0 ? `+ƒ${profit.toLocaleString()}` : `–ƒ${Math.abs(profit).toLocaleString()}`}
                      </div>
                      <div style={{ textAlign:'center', fontFamily:"'VT323',monospace", fontSize:'1.1rem', color: held > 0 ? '#00ff41' : 'rgba(0,255,65,.2)' }}>
                        {held > 0 ? held : '·'}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Cargo manifest */}
              {totalCargo > 0 && (
                <div style={{ marginTop:'.8rem', borderTop:'1px solid rgba(0,255,65,.1)', paddingTop:'.6rem' }}>
                  <div style={{ fontSize:'.42rem', color:'rgba(0,255,65,.25)', letterSpacing:'.12em', marginBottom:'.35rem' }}>CARGO MANIFEST</div>
                  <div style={{ display:'flex', gap:'.8rem', flexWrap:'wrap' }}>
                    {Object.entries(gs.current.cargo).filter(([,q]) => q > 0).map(([id, qty]) => {
                      const c = COMMODITIES.find(x => x.id === id)!;
                      if (!c) return null;
                      const sellHere = isCity ? cp[id].citySell : cp[id].wasteSell;
                      return (
                        <div key={id} style={{ fontSize:'.48rem', color:'rgba(0,255,65,.55)', border:'1px solid rgba(0,255,65,.18)', padding:'.22rem .5rem' }}>
                          {qty}× {c.name} → sell here for ƒ{sellHere.toLocaleString()}/unit
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div style={{ marginTop:'.7rem', fontSize:'.38rem', color:'rgba(0,255,65,.15)', letterSpacing:'.08em' }}>
                BUY = you pay · SELL = you receive · BEST SELL = value at the other exchange · Max cargo {MAX_CARGO} units · ESC to close
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── MAP PANEL (M key) ─────────────────────────────────────────────── */}
      {showMap && (() => {
        const baseVR = 300, baseVRy = 250;
        const mapVR = baseVR / mapZoom, mapVRy2 = baseVRy / mapZoom;
        const vbX = Math.max(0, Math.min(W - mapVR * 2, gs.current.px - mapVR));
        const vbY = Math.max(0, Math.min(H - mapVRy2 * 2, gs.current.py - mapVRy2));
        return (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 360 }}
          onClick={() => { setShowMap(false); setMapZoom(1); }}>
          <div style={{ position: 'relative', width: '90vw', maxWidth: 1200, height: '80vh', display: 'flex', flexDirection: 'column', border: '1px solid rgba(0,255,65,.3)', background: 'rgba(0,6,2,.98)', padding: '1.2rem', fontFamily: "'Share Tech Mono',monospace", boxSizing: 'border-box' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.8rem', flexShrink: 0 }}>
              <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.8rem', color: '#00ff41', letterSpacing: '.2em' }}>MINX CITY MAP</div>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                <button onClick={() => setMapZoom(z => Math.min(4, z * 1.5))} style={{ padding: '.2rem .5rem', background: 'transparent', border: '1px solid rgba(0,255,65,.2)', color: 'rgba(0,255,65,.5)', cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace", fontSize: '.65rem' }}>+</button>
                <button onClick={() => setMapZoom(z => Math.max(0.25, z / 1.5))} style={{ padding: '.2rem .5rem', background: 'transparent', border: '1px solid rgba(0,255,65,.2)', color: 'rgba(0,255,65,.5)', cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace", fontSize: '.65rem' }}>−</button>
                <span style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.3)' }}>{Math.round(mapZoom * 100)}%</span>
                <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.1em' }}>SERVER: MINX CITY · PST</div>
                <button onClick={() => { setShowMap(false); setMapZoom(1); }} style={{ padding: '.2rem .5rem', background: 'transparent', border: '1px solid rgba(0,255,65,.2)', color: 'rgba(0,255,65,.4)', cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace", fontSize: '.5rem' }}>ESC</button>
              </div>
            </div>
            <svg width="100%" style={{ flex: 1, display: 'block', border: '1px solid rgba(0,255,65,.1)', background: '#00020a', cursor: 'crosshair' }} viewBox={`${vbX} ${vbY} ${mapVR * 2} ${mapVRy2 * 2}`} preserveAspectRatio="xMidYMid meet"
              onWheel={(e) => { e.preventDefault(); setMapZoom(z => e.deltaY < 0 ? Math.min(4, z * 1.2) : Math.max(0.25, z / 1.2)); }}
              onClick={(evt) => {
                const svg = evt.currentTarget;
                const pt = svg.createSVGPoint();
                pt.x = evt.clientX; pt.y = evt.clientY;
                const svgP = pt.matrixTransform(svg.getScreenCTM()!.inverse());
                const tx = Math.max(BORDER + 10, Math.min(W - BORDER - 10, svgP.x));
                const ty = Math.max(BORDER + 10, Math.min(H - BORDER - 10, svgP.y));
                gs.current.px = tx; gs.current.py = ty;
                setShowMap(false);
                setNarr(`> MAP TRAVEL — Moved to grid (${Math.floor(tx / 100)}, ${Math.floor(ty / 100)}).`);
              }}>
              <rect x={0} y={0} width={W} height={CITY_TOP} fill="rgba(10,5,0,.8)" />
              <rect x={0} y={CITY_TOP} width={W} height={CITY_BOTTOM - CITY_TOP} fill="rgba(0,10,3,.8)" />
              <rect x={0} y={CITY_BOTTOM} width={W} height={H - CITY_BOTTOM} fill="rgba(10,5,0,.8)" />
              <rect x={0} y={0} width={BORDER} height={H} fill="rgba(0,30,80,.5)" />
              <rect x={W - BORDER} y={0} width={BORDER} height={H} fill="rgba(0,30,80,.5)" />
              <rect x={0} y={0} width={W} height={BORDER} fill="rgba(80,60,30,.5)" />
              <rect x={0} y={H - BORDER} width={W} height={BORDER} fill="rgba(80,60,30,.5)" />
              <line x1={0} y1={CITY_TOP} x2={W} y2={CITY_TOP} stroke="rgba(0,255,65,.2)" strokeWidth={2} strokeDasharray="10 5" />
              <line x1={0} y1={CITY_BOTTOM} x2={W} y2={CITY_BOTTOM} stroke="rgba(0,255,65,.2)" strokeWidth={2} strokeDasharray="10 5" />
              <text x={vbX + 10} y={CITY_TOP - 8} fill="rgba(255,130,50,.35)" fontSize={12} fontFamily="Share Tech Mono">NORTH WASTELAND</text>
              <text x={vbX + 10} y={CITY_TOP + 16} fill="rgba(0,255,65,.35)" fontSize={12} fontFamily="Share Tech Mono">MINX CITY</text>
              <text x={vbX + 10} y={CITY_BOTTOM - 8} fill="rgba(0,255,65,.35)" fontSize={12} fontFamily="Share Tech Mono">MINX CITY</text>
              <text x={vbX + 10} y={CITY_BOTTOM + 16} fill="rgba(255,130,50,.35)" fontSize={12} fontFamily="Share Tech Mono">SOUTH WASTELAND</text>
              {BUILDINGS.map(b => (
                <g key={b.id}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={b.bright ? 'rgba(0,255,65,.25)' : 'rgba(0,180,55,.14)'} stroke={b.bright ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.2)'} strokeWidth={1} />
                  <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 3} textAnchor="middle" fill="rgba(0,255,65,.7)" fontSize={7} fontFamily="Share Tech Mono">{b.label.substring(0,14)}</text>
                </g>
              ))}
              {BILLBOARDS.map(bb => (
                <g key={bb.locationId}>
                  <rect x={bb.x - 4} y={bb.y - 4} width={8} height={8} fill="rgba(0,200,255,.2)" stroke="rgba(0,200,255,.5)" strokeWidth={1} />
                  <text x={bb.x} y={bb.y + 3} textAnchor="middle" fill="rgba(0,200,255,.6)" fontSize={5} fontFamily="Share Tech Mono">BB</text>
                </g>
              ))}
              <circle cx={gs.current.px} cy={gs.current.py} r={8} fill="none" stroke="#00ff41" strokeWidth={2} />
              <circle cx={gs.current.px} cy={gs.current.py} r={4} fill="#00ff41" />
              <text x={gs.current.px} y={gs.current.py - 12} textAnchor="middle" fill="#00ff41" fontSize={10} fontFamily="Share Tech Mono">{char.name}</text>
              {gs.current.threats.map((t, ti) => (
                <circle key={ti} cx={t.x} cy={t.y} r={5} fill={THREAT_COL[t.type] ?? '#ff4444'} opacity={0.6} />
              ))}
              {gs.current.threats.filter(t => t.type === 'SPY').map((t, ti) => (
                <circle key={`spy${ti}`} cx={t.x} cy={t.y} r={8} fill="none" stroke="#ffffaa" strokeWidth={1} strokeDasharray="4 2" />
              ))}
              {quests.filter(q => !q.completed).flatMap(q => q.tasks.filter(t => !t.done && t.mapMarker)).map((task, ti) => (
                <g key={`quest${ti}`}>
                  <circle cx={task.mapMarker!.x} cy={task.mapMarker!.y} r={10} fill="none" stroke="#ffcc44" strokeWidth={2} strokeDasharray="6 3" />
                  <circle cx={task.mapMarker!.x} cy={task.mapMarker!.y} r={4} fill="#ffcc44" opacity={0.8} />
                  <text x={task.mapMarker!.x} y={task.mapMarker!.y - 14} textAnchor="middle" fill="#ffcc44" fontSize={7} fontFamily="Share Tech Mono">{task.mapMarker!.label}</text>
                </g>
              ))}
            </svg>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '.6rem', flexWrap: 'wrap', flexShrink: 0 }}>
              {[['#00ff41','CITY BUILDING'],['rgba(255,130,50,.6)','LOCKED'],['#00ccff','BILLBOARD'],['#ff4444','THREAT'],['#ffffaa','SPY'],['#5599ff','PABLO GUARD'],['#ffcc44','MISSION']].map(([c,l]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                  <div style={{ width: 8, height: 8, background: c, borderRadius: 1 }} />
                  <span style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.4)', letterSpacing: '.07em' }}>{l}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '.5rem', fontSize: '.55rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.07em', flexShrink: 0 }}>
              PLAYER: ({Math.round(gs.current.px)}, {Math.round(gs.current.py)}) · {zone} · LVL {level} · ƒ{salary.toLocaleString()} FIAT · Click map to travel · [M] or [ESC] to close
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── BILLBOARD MARKETPLACE PANEL ────────────────────────────────────── */}
      {showBillboard && (() => {
        const bbInfo = billboardsData.find(d => d.locationId === showBillboard.locationId);
        const owned = bbInfo?.ownerPlayerName;
        const isOwner = owned === char.name;
        const expired = bbInfo?.expired;
        const price = bbInfo?.priceFlorin ?? 5000;
        return (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 370 }}
            onClick={() => setShowBillboard(null)}>
            <div style={{ width: 420, border: '1px solid rgba(0,200,255,.3)', background: 'rgba(0,4,8,.98)', padding: '1.2rem', fontFamily: "'Share Tech Mono',monospace" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.8rem' }}>
                <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.6rem', color: '#00ccff', letterSpacing: '.15em' }}>BILLBOARD MARKETPLACE</div>
                <button onClick={() => setShowBillboard(null)} style={{ padding: '.2rem .5rem', background: 'transparent', border: '1px solid rgba(0,200,255,.2)', color: 'rgba(0,200,255,.4)', cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace", fontSize: '.5rem' }}>ESC</button>
              </div>
              <div style={{ width: '100%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,200,255,.3), transparent)', marginBottom: '.8rem' }} />
              <div style={{ fontSize: '.6rem', color: 'rgba(0,200,255,.6)', marginBottom: '.4rem', letterSpacing: '.1em' }}>SLOT: {showBillboard.label}</div>
              <div style={{ fontSize: '.5rem', color: 'rgba(0,200,255,.35)', marginBottom: '.3rem' }}>Location ID: {showBillboard.locationId}</div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '.6rem' }}>
                <div style={{ flex: 1, border: '1px solid rgba(0,200,255,.15)', padding: '.5rem', background: 'rgba(0,10,20,.5)' }}>
                  <div style={{ fontSize: '.55rem', color: 'rgba(0,200,255,.3)', marginBottom: '.3rem', letterSpacing: '.1em' }}>STATUS</div>
                  <div style={{ fontSize: '.55rem', color: owned && !expired ? '#ff00ff' : '#00ccff' }}>
                    {owned && !expired ? `OWNED by ${owned}` : 'AVAILABLE'}
                  </div>
                </div>
                <div style={{ flex: 1, border: '1px solid rgba(0,200,255,.15)', padding: '.5rem', background: 'rgba(0,10,20,.5)' }}>
                  <div style={{ fontSize: '.55rem', color: 'rgba(0,200,255,.3)', marginBottom: '.3rem', letterSpacing: '.1em' }}>PRICE (7 DAYS)</div>
                  <div style={{ fontSize: '.55rem', color: '#ffdd44' }}>ç{price.toLocaleString()} FIAT</div>
                </div>
              </div>
              {(bbInfo?.adText || bbInfo?.adImageUrl) && (
                <div style={{ border: '1px solid rgba(255,0,255,.2)', padding: '.5rem', marginBottom: '.6rem', background: 'rgba(255,0,255,.03)' }}>
                  <div style={{ fontSize: '.55rem', color: 'rgba(255,0,255,.4)', marginBottom: '.2rem', letterSpacing: '.1em' }}>CURRENT AD</div>
                  {bbInfo.adImageUrl && (
                    <img src={bbInfo.adImageUrl} alt="Billboard ad" style={{ width: '100%', maxHeight: 120, objectFit: 'contain', marginBottom: '.3rem', border: '1px solid rgba(255,0,255,.15)' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  )}
                  {bbInfo.adText && <div style={{ fontSize: '.5rem', color: '#ff88ff', wordBreak: 'break-word' }}>{bbInfo.adText}</div>}
                </div>
              )}
              {bbInfo?.rentedUntil && !expired && (
                <div style={{ fontSize: '.55rem', color: 'rgba(0,200,255,.3)', marginBottom: '.5rem' }}>
                  Expires: {new Date(bbInfo.rentedUntil).toLocaleDateString()}
                </div>
              )}
              {(!owned || expired) && (
                <button onClick={() => { if (bbInfo) purchaseBillboard(bbInfo.id); }}
                  style={{ width: '100%', padding: '.5rem', background: 'rgba(0,200,255,.08)', border: '1px solid rgba(0,200,255,.4)', color: '#00ccff', fontFamily: "'VT323',monospace", fontSize: '1.1rem', letterSpacing: '.12em', cursor: 'pointer', marginBottom: '.5rem' }}>
                  BUY SLOT — ç{price.toLocaleString()} FIAT
                </button>
              )}
              {isOwner && !expired && (
                <div style={{ border: '1px solid rgba(0,255,65,.15)', padding: '.5rem', background: 'rgba(0,10,5,.5)' }}>
                  <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.4)', marginBottom: '.4rem', letterSpacing: '.1em' }}>UPDATE YOUR AD</div>
                  <input value={bbAdText} onChange={e => setBbAdText(e.target.value)} placeholder="Ad text (max 60 chars)"
                    maxLength={60}
                    style={{ width: '100%', padding: '.3rem', background: 'rgba(0,10,5,.8)', border: '1px solid rgba(0,255,65,.2)', color: '#00ff41', fontFamily: "'Share Tech Mono',monospace", fontSize: '.45rem', marginBottom: '.3rem', boxSizing: 'border-box' }} />
                  <input value={bbAdUrl} onChange={e => setBbAdUrl(e.target.value)} placeholder="Image URL (optional)"
                    style={{ width: '100%', padding: '.3rem', background: 'rgba(0,10,5,.8)', border: '1px solid rgba(0,255,65,.2)', color: '#00ff41', fontFamily: "'Share Tech Mono',monospace", fontSize: '.45rem', marginBottom: '.4rem', boxSizing: 'border-box' }} />
                  <button onClick={() => { if (bbInfo) updateBillboardContent(bbInfo.id); }}
                    style={{ width: '100%', padding: '.4rem', background: 'rgba(0,255,65,.06)', border: '1px solid rgba(0,255,65,.3)', color: '#00ff41', fontFamily: "'VT323',monospace", fontSize: '1rem', letterSpacing: '.1em', cursor: 'pointer' }}>
                    UPDATE AD
                  </button>
                </div>
              )}
              <div style={{ marginTop: '.6rem', fontSize: '.55rem', color: 'rgba(0,200,255,.2)', letterSpacing: '.08em' }}>
                Billboard ads display for all players in Minx City. · Florin currency only. · [ESC] to close
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── WEAPONS WHEEL — bottom-right dual-slot display ─────────────── */}
      <div style={{ position: 'absolute', bottom: 14, right: 14, zIndex: 150, pointerEvents: 'all' }}>
        <div
          onClick={() => setShowWeapons(v => !v)}
          style={{
            width: 80, height: 80, borderRadius: 8,
            background: showWeapons ? 'rgba(0,255,65,.14)' : 'rgba(0,5,0,.92)',
            border: `2px solid ${showWeapons ? 'rgba(0,255,65,.6)' : 'rgba(0,255,65,.28)'}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 0 14px rgba(0,255,65,.15)',
            transition: 'all .15s ease', gap: 2,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: "'VT323',monospace", fontSize: '.9rem', color: WEAPONS.find(w => w.id === activeWeapon)?.color ?? '#00ff41' }}>⚔</span>
            <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '.45rem', color: 'rgba(0,255,65,.7)', letterSpacing: '.02em' }}>{activeWeapon}</span>
          </div>
          <div style={{ width: '70%', height: 1, background: 'rgba(0,255,65,.15)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: "'VT323',monospace", fontSize: '.9rem', color: WEAPONS.find(w => w.id === secondaryWeapon)?.color ?? '#00ff41' }}>🔫</span>
            <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '.45rem', color: 'rgba(0,255,65,.7)', letterSpacing: '.02em' }}>{secondaryWeapon}</span>
          </div>
        </div>
        {showWeapons && (() => {
          const iconMap: Record<string, string> = { fists: '✊', sword: '⚔', gun: '🔫', laser: '⚡', bomb: '💣', knife: '🔪', revolver: '🔫', pistol: '🔫', rifle: '🎯' };
          const available = WEAPONS.filter(w => unlockedWeapons.has(w.id));
          const meleeWpns = available.filter(w => w.type === 'melee');
          const rangedWpns = available.filter(w => w.type === 'ranged');
          const renderSlot = (label: string, wpns: typeof WEAPONS, current: string, onSelect: (id: string) => void) => (
            <div>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '.45rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.12em', padding: '3px 4px', borderBottom: '1px solid rgba(0,255,65,.12)', marginBottom: '2px' }}>{label}</div>
              {wpns.map(w => {
                const isActive = current === w.id;
                return (
                  <div
                    key={w.id}
                    onClick={() => onSelect(w.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '.4rem',
                      padding: '.3rem .45rem', cursor: 'pointer',
                      background: isActive ? 'rgba(0,255,65,.14)' : 'transparent',
                      border: `1px solid ${isActive ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.08)'}`,
                      transition: 'all .1s ease',
                    }}
                  >
                    <span style={{ fontSize: '1.1rem', width: 22, textAlign: 'center' }}>{iconMap[w.icon] ?? '?'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'VT323',monospace", fontSize: '.95rem', color: isActive ? w.color : 'rgba(0,255,65,.7)', letterSpacing: '.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {isActive ? '▸ ' : ''}{w.label}
                      </div>
                      <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.35)', marginTop: 1 }}>+{w.atkBonus} ATK</div>
                    </div>
                  </div>
                );
              })}
              {wpns.length === 0 && <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.2)', padding: '.3rem .45rem' }}>No {label.toLowerCase()} weapons</div>}
            </div>
          );
          return (
            <div style={{
              position: 'absolute', bottom: 88, right: 0, width: 210,
              background: 'rgba(0,5,0,.97)', border: '1px solid rgba(0,255,65,.4)',
              boxShadow: '0 0 24px rgba(0,255,65,.12)', padding: '.35rem',
              display: 'flex', flexDirection: 'column', gap: '3px',
            }}>
              {renderSlot('MELEE SLOT [SPACE]', meleeWpns, activeWeapon, (id) => {
                setActiveWeapon(id); activeWeaponRef.current = id;
                setNarr(`> MELEE EQUIPPED: ${WEAPONS.find(w => w.id === id)?.label}. ${WEAPONS.find(w => w.id === id)?.desc}`);
              })}
              <div style={{ height: 1, background: 'rgba(0,255,65,.15)', margin: '4px 0' }} />
              {renderSlot('RANGED SLOT [F]', rangedWpns, secondaryWeapon, (id) => {
                setSecondaryWeapon(id); secondaryWeaponRef.current = id;
                setNarr(`> RANGED EQUIPPED: ${WEAPONS.find(w => w.id === id)?.label}. ${WEAPONS.find(w => w.id === id)?.desc}`);
              })}
            </div>
          );
        })()}
      </div>

      {/* ── MERCHANT PANEL ─────────────────────────────────────────────── */}
      {showMerchant && (() => {
        const g = gs.current;
        const VTM: React.CSSProperties = { fontFamily: "'VT323',monospace" };
        const doMerchBuy = (item: MerchantItem) => {
          if (g.salary < item.price) { sfxError(); setNarr(`> INSUFFICIENT FIAT — Need ƒ${item.price.toLocaleString()}.`); return; }
          if (g.ownedItems.has(item.id)) { sfxError(); setNarr(`> ALREADY OWNED — ${item.name} is in your inventory.`); return; }
          g.salary -= item.price; setSalary(g.salary); sfxCoin();
          g.ownedItems.add(item.id); setOwnedItems(new Set(g.ownedItems));
          if (item.effect.startsWith('unlock_')) {
            const wpnId = item.effect.replace('unlock_', '');
            unlockedWeaponsRef.current.add(wpnId);
            setUnlockedWeapons(new Set(unlockedWeaponsRef.current));
            setActiveWeapon(wpnId); activeWeaponRef.current = wpnId;
            wsSend({ type: 'weapon_purchase', weaponId: wpnId, cost: item.price });
            setNarr(`> ${item.name} unlocked! Weapon equipped. ƒ${item.price.toLocaleString()} FIAT spent.`);
          } else if (item.effect === 'maxhp20') {
            g.maxHp += 20; g.hp = Math.min(g.maxHp, g.hp + 20); setHp(Math.floor(g.hp));
            setNarr(`> HP UP — Max HP increased by 20. Current: ${g.maxHp}. ƒ${item.price.toLocaleString()} spent.`);
          } else if (item.effect === 'maxhp40') {
            g.maxHp += 40; g.hp = Math.min(g.maxHp, g.hp + 40); setHp(Math.floor(g.hp));
            setNarr(`> HP UP II — Max HP increased by 40. Current: ${g.maxHp}. ƒ${item.price.toLocaleString()} spent.`);
          } else if (item.effect === 'speed10') {
            setNarr(`> SPEED BOOST applied. +10% movement speed. ƒ${item.price.toLocaleString()} spent.`);
          } else if (item.effect === 'atk5') {
            g.level += 0; // ATK is level-based; we'll grant bonus via ownedItems check
            setNarr(`> ATK BOOST — +5 base attack permanently. ƒ${item.price.toLocaleString()} spent.`);
          } else if (item.effect === 'armor15') {
            setNarr(`> ARMOR PLATE equipped. Incoming damage reduced by 15%. ƒ${item.price.toLocaleString()} spent.`);
          } else if (item.effect === 'passport_basic_city') {
            g.passport = 'basic_city'; setPassport('basic_city');
            setNarr(`> FORGED CITY PASSPORT acquired. Checkpoint access granted (crossing fee applies). ƒ${item.price.toLocaleString()} spent.`);
          } else if (item.effect === 'passport_full_city') {
            g.passport = 'full_city'; setPassport('full_city');
            setNarr(`> FORGED FULL PASSPORT acquired. Priority checkpoint access — no crossing fee. ƒ${item.price.toLocaleString()} spent.`);
          } else if (item.effect === 'passport_wasteland') {
            g.passport = 'wasteland'; setPassport('wasteland');
            setNarr(`> WASTELAND PERMIT acquired. Outer sector transit authorized. ƒ${item.price.toLocaleString()} spent.`);
          } else if (item.effect === 'work_permit') {
            g.salary += 500; setSalary(g.salary);
            setNarr(`> WORK PERMIT filed. +500 FIAT signing bonus deposited. ƒ${item.price.toLocaleString()} spent.`);
          } else if (item.effect === 'identity_scrub') {
            setNarr(`> IDENTITY SCRUB complete. Criminal record erased. All faction hostility reset. ƒ${item.price.toLocaleString()} spent.`);
          } else {
            setNarr(`> ${item.name} acquired. ƒ${item.price.toLocaleString()} FIAT spent.`);
          }
        };
        return (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.93)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:360 }}
            onClick={e => { if (e.target === e.currentTarget) { setShowMerchant(null); frozenRef.current = false; } }}>
            <div style={{ width:500, maxHeight:'85vh', display:'flex', flexDirection:'column', border:'1px solid rgba(0,255,65,.35)', background:'rgba(0,6,2,.98)', fontFamily:"'Share Tech Mono',monospace" }}>
              <div style={{ padding:'1rem 1.2rem .6rem', borderBottom:'1px solid rgba(0,255,65,.15)', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                <div>
                  <div style={{ ...VTM, fontSize:'1.5rem', color:'#00ff41', letterSpacing:'.14em' }}>{showMerchant.name} — MERCHANT</div>
                  <div style={{ fontSize:'.42rem', color:'rgba(0,255,65,.3)', letterSpacing:'.12em' }}>{showMerchant.items.some(i => i.effect.startsWith('passport_')) ? 'DOCUMENTS · FORGERIES · FIAT ONLY' : 'WEAPONS · UPGRADES · FIAT ONLY'}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ ...VTM, fontSize:'1.1rem', color:'#00ff41' }}>ƒ{salary.toLocaleString()}</div>
                  <div style={{ fontSize:'.4rem', color:'rgba(0,255,65,.3)' }}>FIAT BALANCE</div>
                  <button onClick={() => { setShowMerchant(null); frozenRef.current = false; }} style={{ marginTop:'.3rem', padding:'.2rem .6rem', background:'transparent', border:'1px solid rgba(0,255,65,.2)', color:'rgba(0,255,65,.4)', cursor:'pointer', ...VTM, fontSize:'.95rem' }}>ESC</button>
                </div>
              </div>
              <div style={{ flex:1, overflowY:'auto', padding:'.8rem 1rem' }}>
                <div style={{ display:'flex', flexDirection:'column', gap:'.5rem' }}>
                  {showMerchant.items.map(item => {
                    const owned = g.ownedItems.has(item.id);
                    const canAfford = g.salary >= item.price;
                    return (
                      <div key={item.id} style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:'.6rem', alignItems:'center', padding:'.6rem .7rem', border:`1px solid ${owned ? 'rgba(0,255,65,.25)' : 'rgba(0,255,65,.12)'}`, background: owned ? 'rgba(0,255,65,.04)' : 'transparent' }}>
                        <div>
                          <div style={{ display:'flex', alignItems:'center', gap:'.5rem', marginBottom:'.2rem' }}>
                            <span style={{ ...VTM, fontSize:'1.05rem', color: owned ? '#00ff41' : '#ff9900', letterSpacing:'.08em' }}>{item.name}</span>
                            {owned && <span style={{ fontSize:'.38rem', color:'rgba(0,255,65,.5)', border:'1px solid rgba(0,255,65,.25)', padding:'1px 5px' }}>OWNED</span>}
                          </div>
                          <div style={{ fontSize:'.46rem', color:'rgba(0,255,65,.4)', lineHeight:1.6 }}>{item.desc}</div>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'.3rem', flexShrink:0 }}>
                          <div style={{ ...VTM, fontSize:'1rem', color: canAfford ? '#00ff41' : 'rgba(255,80,80,.6)' }}>ƒ{item.price.toLocaleString()}</div>
                          <button
                            onClick={() => doMerchBuy(item)}
                            disabled={owned}
                            style={{ padding:'.25rem .7rem', background: owned ? 'transparent' : canAfford ? 'rgba(0,255,65,.1)' : 'transparent', border:`1px solid ${owned ? 'rgba(0,255,65,.15)' : canAfford ? 'rgba(0,255,65,.4)' : 'rgba(255,80,80,.3)'}`, color: owned ? 'rgba(0,255,65,.25)' : canAfford ? '#00ff41' : 'rgba(255,80,80,.5)', cursor: owned ? 'not-allowed' : 'pointer', ...VTM, fontSize:'.95rem', letterSpacing:'.08em' }}>
                            {owned ? 'OWNED' : canAfford ? 'BUY' : 'NO FIAT'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showLevelUp && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 350, pointerEvents: 'none', paddingBottom: '12%' }}>
          <div style={{ textAlign: 'center', animation: 'smfade 3.5s ease-out forwards', background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.3) 100%)', padding: '1.2rem 2.5rem', borderRadius: 6 }}>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 'clamp(.7rem,2.5vw,1.1rem)', color: 'rgba(255,255,255,.75)', letterSpacing: '.12em', lineHeight: 1.6 }}>{levelUpText}</div>
            <div style={{ width: 60, height: 1, background: 'rgba(255,255,255,.15)', margin: '.5rem auto 0' }} />
          </div>
        </div>
      )}

      {lootPanel && (
        <div style={{ position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)', zIndex: 400, pointerEvents: 'auto', minWidth: 220, maxWidth: 320 }} onClick={() => setLootPanel(null)}>
          <div style={{ background: 'rgba(0,0,0,.92)', border: `1px solid ${lootPanel.money < 0 ? '#ff2222' : '#00ff41'}`, borderRadius: 4, padding: '12px 16px', fontFamily: "'VT323',monospace" }}>
            <div style={{ fontSize: '.7rem', letterSpacing: '.15em', color: lootPanel.money < 0 ? '#ff4444' : '#00ff41', marginBottom: 8, textAlign: 'center' }}>
              {lootPanel.money < 0 ? '▼ LOOT LOST ▼' : '▲ LOOT ACQUIRED ▲'}
            </div>
            <div style={{ fontSize: '.55rem', color: '#889', textAlign: 'center', marginBottom: 6 }}>{lootPanel.source}</div>
            {lootPanel.money !== 0 && (
              <div style={{ fontSize: '.65rem', color: lootPanel.money < 0 ? '#ff6644' : '#ffdd44', textAlign: 'center', marginBottom: 4 }}>
                {lootPanel.money < 0 ? `−ƒ${Math.abs(lootPanel.money).toLocaleString()}` : `+ƒ${lootPanel.money.toLocaleString()}`} FIAT
              </div>
            )}
            {lootPanel.items.map((it, i) => (
              <div key={i} style={{ fontSize: '.55rem', color: '#33ffaa', textAlign: 'center', marginTop: 2 }}>
                + {it.name}{it.desc ? ` — ${it.desc}` : ''}
              </div>
            ))}
            <div style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.3)', textAlign: 'center', marginTop: 8, letterSpacing: '.1em' }}>TAP TO DISMISS</div>
          </div>
        </div>
      )}

      {/* ── BANCO OMBRA TERMINAL ─────────────────────────────────────────── */}
      {showBank && (() => {
        const g = gs.current;
        const LOAN_OPTIONS = [
          { amount: 5000,  label: 'ƒ5K' },
          { amount: 10000, label: 'ƒ10K' },
          { amount: 25000, label: 'ƒ25K' },
          { amount: 50000, label: 'ƒ50K' },
        ];
        const VTB: React.CSSProperties = { fontFamily: "'VT323',monospace" };
        const STB: React.CSSProperties = { fontFamily: "'Share Tech Mono',monospace" };
        const tabBtn = (active: boolean): React.CSSProperties => ({
          padding: '.4rem 1rem', border: active ? '1px solid rgba(0,255,65,.7)' : '1px solid rgba(0,255,65,.15)',
          background: active ? 'rgba(0,255,65,.08)' : 'transparent',
          color: active ? '#00ff41' : 'rgba(0,255,65,.35)', cursor: 'pointer', ...VTB, fontSize: '1.05rem', letterSpacing: '.1em',
        });
        const inp: React.CSSProperties = {
          background: 'rgba(0,8,0,.95)', border: '1px solid rgba(0,255,65,.3)', color: '#00ff41',
          padding: '.4rem .65rem', outline: 'none', ...STB, fontSize: '.85rem', caretColor: '#00ff41', boxSizing: 'border-box',
        };
        const actBtn = (enabled: boolean): React.CSSProperties => ({
          padding: '.45rem 1.2rem', border: enabled ? '1px solid rgba(0,255,65,.5)' : '1px solid rgba(0,255,65,.1)',
          background: 'rgba(0,255,65,.06)', color: enabled ? '#00ff41' : 'rgba(0,255,65,.2)',
          cursor: enabled ? 'pointer' : 'default', ...VTB, fontSize: '1.1rem', letterSpacing: '.1em', whiteSpace: 'nowrap',
        });
        const doDeposit = () => {
          const amt = parseInt(bankDepAmt) || 0;
          if (amt <= 0 || amt > g.salary) { sfxError(); setNarr('> BANCO OMBRA — Insufficient checking balance.'); return; }
          const tax = amt >= 5000 ? Math.floor(amt * 0.12) : 0;
          g.salary -= amt; setSalary(g.salary);
          g.savings += (amt - tax); setSavings(g.savings);
          if (tax > 0) addBankTx('PABLO CORP. DEPOSIT TAX (12%)', -tax, g.salary);
          addBankTx('CHECKING → SAVINGS DEPOSIT', -amt, g.salary);
          setBankDepAmt(''); sfxCoin();
          setNarr(`> DEPOSITED ƒ${amt.toLocaleString()} to SAVINGS.${tax > 0 ? ` PABLO TAX: ƒ${tax.toLocaleString()}.` : ' No tax.'} Savings: ƒ${g.savings.toLocaleString()}.`);
        };
        const doWithdraw = () => {
          const amt = parseInt(bankWithAmt) || 0;
          if (amt <= 0 || amt > g.savings) { sfxError(); setNarr('> BANCO OMBRA — Insufficient savings balance.'); return; }
          g.savings -= amt; g.salary += amt;
          setSavings(g.savings); setSalary(g.salary);
          addBankTx('SAVINGS → CHECKING WITHDRAWAL', amt, g.salary);
          setBankWithAmt(''); sfxCoin();
          setNarr(`> WITHDREW ƒ${amt.toLocaleString()} from SAVINGS to CHECKING.`);
        };
        const doLoan = (amount: number) => {
          if (g.loan) { sfxError(); setNarr('> CREDIT DENIED — Active loan outstanding. Repay before borrowing again.'); return; }
          const interest = Math.floor(amount * 0.18);
          const origFee  = amount >= 25000 ? Math.floor(amount * 0.02) : 0;
          const received  = amount - origFee;
          const loan = { amount, interest, issuedAt: g.frame, dueAt: g.frame + 60 * 360 };
          g.loan = loan; g.salary += received; setSalary(g.salary);
          setBankLoan(loan);
          if (origFee > 0) addBankTx('ORIGINATION FEE (2%)', -origFee, g.salary);
          addBankTx(`LOAN ISSUED @ 18% FLAT`, received, g.salary);
          sfxCoin();
          setNarr(`> LOAN APPROVED — ƒ${amount.toLocaleString()} · Int: ƒ${interest.toLocaleString()} · Fee: ƒ${origFee.toLocaleString()} · Repay within ~6 min. Late = penalty.`);
        };
        const doRepay = () => {
          const loan = g.loan; if (!loan) return;
          const totalDue = loan.amount + loan.interest;
          if (g.salary < totalDue) { sfxError(); setNarr(`> INSUFFICIENT FUNDS — Need ƒ${totalDue.toLocaleString()}.`); return; }
          g.salary -= totalDue; setSalary(g.salary);
          g.loan = null; setBankLoan(null);
          addBankTx(`LOAN REPAID ƒ${loan.amount.toLocaleString()} + ƒ${loan.interest.toLocaleString()} INT`, -totalDue, g.salary);
          sfxCoin();
          setNarr(`> LOAN REPAID — ƒ${totalDue.toLocaleString()} FIAT. Account standing: CLEAR. Debt collectors stand down.`);
        };
        const doWire = () => {
          const amt = parseInt(bankWireAmt) || 0;
          const to = bankWireTo.trim().toUpperCase();
          if (!to || amt <= 0) { sfxError(); return; }
          const fee = Math.ceil(amt * 0.03);
          if (amt + fee > g.salary) { sfxError(); setNarr(`> INSUFFICIENT FUNDS — Need ƒ${(amt+fee).toLocaleString()} (inc. 3% tax).`); return; }
          g.salary -= (amt + fee); setSalary(g.salary);
          addBankTx(`WIRE → ${to}`, -amt, g.salary);
          addBankTx('PABLO CORP. WIRE TAX (3%)', -fee, g.salary);
          wsSend({ type: 'wire', to, amount: amt, from: char.name });
          setBankWireAmt(''); setBankWireTo(''); sfxCoin();
          setNarr(`> WIRE SENT — ƒ${amt.toLocaleString()} → ${to}. Fee: ƒ${fee.toLocaleString()}. PABLO Corp. logged it.`);
        };
        const isOverdue = bankLoan ? g.frame > bankLoan.dueAt : false;
        return (
          <div onClick={e => { if (e.target === e.currentTarget) { setShowBank(false); frozenRef.current = false; } }}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 310 }}>
            <div style={{ width: '92%', maxWidth: 780, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'rgba(0,5,0,.99)', border: '1px solid rgba(0,255,65,.4)', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ padding: '.65rem 1.1rem', borderBottom: '1px solid rgba(0,255,65,.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                  <div style={{ ...VTB, fontSize: '1.9rem', color: '#00ff41', letterSpacing: '.25em' }}>B A N C O   O M B R A</div>
                  <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.14em' }}>PAX PABLO · MINX CITY BRANCH 01</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em' }}>ACCOUNT HOLDER</div>
                  <div style={{ ...VTB, fontSize: '1.05rem', color: '#00ff41', letterSpacing: '.1em' }}>{char.name}</div>
                  <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.2)' }}>{char.class.toUpperCase()} · {char.company}</div>
                </div>
              </div>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: '.25rem', padding: '.4rem .75rem', borderBottom: '1px solid rgba(0,255,65,.12)', flexShrink: 0 }}>
                {(['accounts','loans','wire','history'] as const).map(t => (
                  <button key={t} onClick={() => setBankTab(t)} style={tabBtn(bankTab === t)}>
                    {t === 'accounts' ? '[ ACCOUNTS ]' : t === 'loans' ? '[ LOANS ]' : t === 'wire' ? '[ WIRE ]' : '[ HISTORY ]'}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <button onClick={() => { setShowBank(false); frozenRef.current = false; }}
                  style={{ ...VTB, fontSize: '1rem', color: 'rgba(0,255,65,.35)', background: 'transparent', border: '1px solid rgba(0,255,65,.15)', padding: '.3rem .75rem', cursor: 'pointer' }}>ESC ×</button>
              </div>
              {/* Body */}
              <div style={{ padding: '.75rem 1.1rem', overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '.75rem' }}>

                {/* ── ACCOUNTS ── */}
                {bankTab === 'accounts' && (<>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
                    {[
                      { label: 'CHECKING ACCOUNT', val: salary, sub: `${CLASS_DISPLAY_NAME[char.class.toLowerCase()] ?? 'FACTION'}: +ƒ${FACTION_SALARY_PER_MIN[char.class.toLowerCase()] ?? 0}/min` },
                      { label: 'SAVINGS ACCOUNT', val: savings, sub: 'APY: 0.8% / CYCLE · PABLO TAX: 15% ON INTEREST' },
                    ].map(({ label, val, sub }) => (
                      <div key={label} style={{ border: '1px solid rgba(0,255,65,.2)', padding: '.65rem' }}>
                        <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.13em', marginBottom: '.25rem' }}>{label}</div>
                        <div style={{ ...VTB, fontSize: '2.1rem', color: val > 0 ? '#00ff41' : 'rgba(0,255,65,.3)', letterSpacing: '.06em' }}>ƒ{val.toLocaleString()}</div>
                        <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.25)', marginTop: '.1rem' }}>{sub}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ border: '1px solid rgba(0,255,65,.13)', padding: '.6rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                    <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.12em' }}>DEPOSIT — CHECKING → SAVINGS</div>
                    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                      <input value={bankDepAmt} onChange={e => setBankDepAmt(e.target.value.replace(/\D/g,''))} placeholder="AMOUNT..." style={{ ...inp, maxWidth: 180 }} />
                      <button onClick={doDeposit} style={actBtn(parseInt(bankDepAmt) > 0 && parseInt(bankDepAmt) <= salary)}>DEPOSIT ↓</button>
                      {parseInt(bankDepAmt) >= 5000 && <span style={{ fontSize: '.55rem', color: '#ffaa44' }}>PABLO TAX: ƒ{Math.floor((parseInt(bankDepAmt)||0)*.12).toLocaleString()} (12%)</span>}
                      {parseInt(bankDepAmt) > 0 && parseInt(bankDepAmt) < 5000 && <span style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)' }}>No tax (under ƒ5k)</span>}
                    </div>
                  </div>
                  <div style={{ border: '1px solid rgba(0,255,65,.13)', padding: '.6rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                    <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.12em' }}>WITHDRAW — SAVINGS → CHECKING</div>
                    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                      <input value={bankWithAmt} onChange={e => setBankWithAmt(e.target.value.replace(/\D/g,''))} placeholder="AMOUNT..." style={{ ...inp, maxWidth: 180 }} />
                      <button onClick={doWithdraw} style={actBtn(parseInt(bankWithAmt) > 0 && parseInt(bankWithAmt) <= savings)}>WITHDRAW ↑</button>
                    </div>
                  </div>
                  <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.15)', lineHeight: 1.8 }}>
                    Savings earn 0.8% APY per cycle (~3 min). PABLO Corp. takes 15% of all interest. Deposits ≥ ƒ5,000 subject to 12% Capital Deployment Tax. BANCO OMBRA is not liable for seizures during martial law.
                  </div>
                </>)}

                {/* ── LOANS ── */}
                {bankTab === 'loans' && (<>
                  <div style={{ border: '1px solid rgba(0,255,65,.13)', padding: '.65rem' }}>
                    <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.12em', marginBottom: '.35rem' }}>CREDIT SERVICES — BANCO OMBRA</div>
                    <div style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.35)', lineHeight: 1.8 }}>
                      18% flat interest · Repay within 60 game cycles (~6 min) · Late = 5% salary penalty/cycle via PABLO Corp. Debt Collection · Loans ≥ ƒ25k carry 2% origination fee.
                    </div>
                  </div>
                  {!bankLoan ? (
                    <>
                      <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.28)', letterSpacing: '.1em' }}>AVAILABLE CREDIT — SELECT AMOUNT</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.5rem' }}>
                        {LOAN_OPTIONS.map(opt => {
                          const int18 = Math.floor(opt.amount * .18);
                          const fee  = opt.amount >= 25000 ? Math.floor(opt.amount * .02) : 0;
                          return (
                            <button key={opt.amount} onClick={() => doLoan(opt.amount)} style={{ padding: '.75rem .4rem', border: '1px solid rgba(0,255,65,.3)', background: 'rgba(0,255,65,.04)', cursor: 'pointer', textAlign: 'center' }}>
                              <div style={{ ...VTB, fontSize: '1.4rem', color: '#00ff41', letterSpacing: '.06em' }}>{opt.label}</div>
                              <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.4)', marginTop: '.15rem' }}>+ƒ{int18.toLocaleString()} INT</div>
                              {fee > 0 && <div style={{ fontSize: '.55rem', color: '#ffaa44' }}>-ƒ{fee.toLocaleString()} ORIG</div>}
                              <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.22)', marginTop: '.12rem' }}>DUE ~6 MIN</div>
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.15)', lineHeight: 1.7 }}>
                        Collateral: NONE REQUIRED. Credit score: PROVISIONAL POSITIVE. One active loan at a time. PABLO Corp. reserves right to restructure debt without notice. This is not a threat.
                      </div>
                    </>
                  ) : (
                    <div style={{ border: `1px solid ${isOverdue ? 'rgba(255,80,80,.4)' : 'rgba(0,255,65,.3)'}`, padding: '.75rem' }}>
                      <div style={{ fontSize: '.55rem', color: isOverdue ? 'rgba(255,100,100,.6)' : 'rgba(0,255,65,.28)', letterSpacing: '.12em', marginBottom: '.45rem' }}>
                        {isOverdue ? '⚠ LOAN OVERDUE — PABLO DEBT COLLECTION ACTIVE' : 'ACTIVE LOAN'}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.45rem', marginBottom: '.65rem' }}>
                        {[
                          { l: 'PRINCIPAL', v: `ƒ${bankLoan.amount.toLocaleString()}` },
                          { l: 'INTEREST (18%)', v: `ƒ${bankLoan.interest.toLocaleString()}` },
                          { l: 'TOTAL DUE', v: `ƒ${(bankLoan.amount + bankLoan.interest).toLocaleString()}` },
                        ].map(({ l, v }) => (
                          <div key={l} style={{ border: '1px solid rgba(0,255,65,.13)', padding: '.45rem' }}>
                            <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.08em', marginBottom: '.12rem' }}>{l}</div>
                            <div style={{ ...VTB, fontSize: '1.15rem', color: isOverdue ? '#ff6666' : '#00ff41' }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {isOverdue && <div style={{ fontSize: '.46rem', color: 'rgba(255,100,100,.6)', lineHeight: 1.7, border: '1px solid rgba(255,60,60,.2)', padding: '.45rem', marginBottom: '.55rem' }}>⚠ OVERDUE — 5% salary penalty per survival cycle until repaid. Repay immediately.</div>}
                      <button onClick={doRepay} disabled={salary < bankLoan.amount + bankLoan.interest}
                        style={{ padding: '.5rem 1.3rem', border: salary >= bankLoan.amount + bankLoan.interest ? '1px solid rgba(0,255,65,.6)' : '1px solid rgba(0,255,65,.1)', background: 'rgba(0,255,65,.06)', color: salary >= bankLoan.amount + bankLoan.interest ? '#00ff41' : 'rgba(0,255,65,.2)', cursor: salary >= bankLoan.amount + bankLoan.interest ? 'pointer' : 'default', ...VTB, fontSize: '1.1rem', letterSpacing: '.1em' }}>
                        REPAY IN FULL — ƒ{(bankLoan.amount + bankLoan.interest).toLocaleString()}
                      </button>
                      {salary < bankLoan.amount + bankLoan.interest && <div style={{ fontSize: '.55rem', color: 'rgba(255,100,100,.45)', marginTop: '.35rem' }}>Need ƒ{((bankLoan.amount + bankLoan.interest) - salary).toLocaleString()} more FIAT.</div>}
                    </div>
                  )}
                </>)}

                {/* ── WIRE ── */}
                {bankTab === 'wire' && (<>
                  <div style={{ border: '1px solid rgba(0,255,65,.13)', padding: '.65rem' }}>
                    <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.12em', marginBottom: '.35rem' }}>INTERPLAYER WIRE TRANSFER</div>
                    <div style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.35)', lineHeight: 1.7 }}>Transfer FIAT to any operative in Minx City. 3% PABLO Corp. Wire Tax deducted from sender. Logged. Irreversible.</div>
                  </div>
                  {online.filter(p => p.name !== char.name).length > 0 && (
                    <div style={{ border: '1px solid rgba(0,255,65,.1)', padding: '.55rem' }}>
                      <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', marginBottom: '.35rem' }}>ONLINE OPERATIVES</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
                        {online.filter(p => p.name !== char.name).map(p => (
                          <button key={p.id} onClick={() => setBankWireTo(p.name)}
                            style={{ padding: '.28rem .65rem', border: bankWireTo === p.name ? '1px solid rgba(0,255,65,.7)' : '1px solid rgba(0,255,65,.2)', background: bankWireTo === p.name ? 'rgba(0,255,65,.07)' : 'transparent', color: bankWireTo === p.name ? '#00ff41' : 'rgba(0,255,65,.4)', cursor: 'pointer', ...STB, fontSize: '.72rem' }}>
                            {p.name} · {p.class.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
                    <div>
                      <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.1em', marginBottom: '.2rem' }}>RECIPIENT</div>
                      <input value={bankWireTo} onChange={e => setBankWireTo(e.target.value.toUpperCase())} placeholder="OPERATIVE NAME..." style={inp} maxLength={32} />
                    </div>
                    <div>
                      <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.1em', marginBottom: '.2rem' }}>AMOUNT</div>
                      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                        <input value={bankWireAmt} onChange={e => setBankWireAmt(e.target.value.replace(/\D/g,''))} placeholder="0" style={{ ...inp, maxWidth: 180 }} />
                        {parseInt(bankWireAmt) > 0 && <span style={{ fontSize: '.55rem', color: '#ffaa44' }}>FEE: ƒ{Math.ceil((parseInt(bankWireAmt)||0)*.03).toLocaleString()} · TOTAL: ƒ{(parseInt(bankWireAmt) + Math.ceil((parseInt(bankWireAmt)||0)*.03)).toLocaleString()}</span>}
                      </div>
                    </div>
                    <button onClick={doWire} disabled={!bankWireTo.trim() || !(parseInt(bankWireAmt) > 0)}
                      style={{ alignSelf: 'flex-start', padding: '.48rem 1.4rem', border: (bankWireTo.trim() && parseInt(bankWireAmt)>0) ? '1px solid rgba(0,255,65,.6)' : '1px solid rgba(0,255,65,.1)', background: 'rgba(0,255,65,.06)', color: (bankWireTo.trim() && parseInt(bankWireAmt)>0) ? '#00ff41' : 'rgba(0,255,65,.2)', cursor: (bankWireTo.trim() && parseInt(bankWireAmt)>0) ? 'pointer' : 'default', ...VTB, fontSize: '1.15rem', letterSpacing: '.1em' }}>
                      SEND WIRE ▶
                    </button>
                  </div>
                </>)}

                {/* ── HISTORY ── */}
                {bankTab === 'history' && (<>
                  <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.12em', marginBottom: '.1rem' }}>ACCOUNT HISTORY — LAST 30 TRANSACTIONS</div>
                  {bankHistory.length === 0
                    ? <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.25)', padding: '.8rem', textAlign: 'center' }}>No transactions recorded yet. Deposit, withdraw, take a loan, or send a wire to begin your history.</div>
                    : <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '.5rem', padding: '.25rem .45rem', borderBottom: '1px solid rgba(0,255,65,.15)' }}>
                          <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em' }}>DESCRIPTION</div>
                          <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', textAlign: 'right' }}>AMOUNT</div>
                          <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', textAlign: 'right' }}>BALANCE</div>
                        </div>
                        {bankHistory.map((tx, i) => (
                          <div key={tx.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '.5rem', padding: '.25rem .45rem', background: i%2===0 ? 'rgba(0,255,65,.02)' : 'transparent', borderBottom: '1px solid rgba(0,255,65,.05)', alignItems: 'center' }}>
                            <div style={{ fontSize: '.46rem', color: 'rgba(0,255,65,.52)', letterSpacing: '.03em' }}>{tx.desc}</div>
                            <div style={{ ...VTB, fontSize: '.95rem', color: tx.amount >= 0 ? '#00ff41' : '#ff6666', textAlign: 'right' }}>{tx.amount >= 0 ? '+' : ''}ƒ{Math.abs(tx.amount).toLocaleString()}</div>
                            <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.25)', textAlign: 'right', whiteSpace: 'nowrap' }}>ƒ{tx.bal.toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                  }
                </>)}
              </div>
              {/* Footer */}
              <div style={{ padding: '.4rem 1.1rem', borderTop: '1px solid rgba(0,255,65,.1)', fontSize: '.55rem', color: 'rgba(0,255,65,.12)', letterSpacing: '.06em', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
                <span>BANCO OMBRA IS NOT RESPONSIBLE FOR DEPOSITS SEIZED BY PABLO CORP. DURING MARTIAL LAW PERIODS. ALL TRANSACTIONS FINAL.</span>
                <span>ESC TO CLOSE</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── HAMLET SPAWN / WAKE UP ── */}
      {showIndoorStart && (() => {
        const g = gs.current;
        const hamletBid = g.hamletBuildingId;
        const isUnemployed = char.bizType === 'unemployed' || !char.hasBusiness;
        const hamletB = BUILDINGS.find(b => b.id === hamletBid);
        const hamletLabel = hamletB?.label ?? 'SHELTER';
        const isShelter = SHELTER_BUILDINGS.includes(hamletBid);
        const isCampsite = CAMPSITE_IDS.includes(hamletBid);
        const spawnColor = isUnemployed ? 'rgba(255,200,60,' : 'rgba(0,255,65,';
        const accentColor = isUnemployed ? '#ffcc44' : '#00ff41';
        return (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.97)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 450, flexDirection: 'column', gap: '1rem' }}>
          <div style={{ textAlign: 'center', maxWidth: 500, padding: '2rem' }}>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.2rem', color: accentColor, letterSpacing: '.15em', marginBottom: '1.5rem', opacity: 0.7 }}>
              {isUnemployed
                ? `${hamletLabel} — YOUR HAMLET`
                : 'MINX ARMS — FLOOR 4 — YOUR UNIT'}
            </div>
            <div style={{ width: '100%', height: '1px', background: `linear-gradient(90deg, transparent, ${spawnColor}.3), transparent)`, marginBottom: '1.2rem' }} />
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '.7rem', color: `${spawnColor}.5)`, lineHeight: 2, marginBottom: '1.5rem', letterSpacing: '.04em' }}>
              {isUnemployed ? (
                isShelter ? (<>
                  The shelter is cold. Concrete walls. A single overhead light buzzes.<br/>
                  Your cot is wedged between twenty others. Someone coughs in the dark.<br/>
                  No PABLO device. No corporate shield. Just the city and your wits.<br/>
                  The door is unlocked. The street waits outside.
                </>) : isCampsite ? (<>
                  The campsite fire has burned to embers. Wasteland wind rattles the tarp.<br/>
                  Your pack is where you left it. Nothing stolen — this time.<br/>
                  No company name above your head. No one looking for you.<br/>
                  You can hear the city hum from here. Or you can walk further out.
                </>) : (<>
                  The bunker hatch creaks. Emergency lighting casts long shadows.<br/>
                  Pre-collapse supplies line the walls. Someone patched the ventilation.<br/>
                  PABLO CORP. forgot this place exists. That's why you're here.<br/>
                  Time to move.
                </>)
              ) : (<>
                Fluorescent light buzzes overhead. The curtains don't fully close.<br/>
                Through the gap: SHADOW TOWER's silhouette against a green-black sky.<br/>
                Your PABLO device blinks on the nightstand. A notification pulses.<br/>
                The building intercom crackles: "...all residents... PABLO CORP. advisory..."<br/>
                You're already dressed. You were expecting this.
              </>)}
            </div>
            <div style={{ width: '100%', height: '1px', background: `linear-gradient(90deg, transparent, ${spawnColor}.15), transparent)`, marginBottom: '1.5rem' }} />
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '.55rem', color: `${spawnColor}.3)`, letterSpacing: '.08em', marginBottom: '1.2rem' }}>
              {isUnemployed
                ? `Hamlet: ${hamletLabel}. No corporate affiliation. Register a business at PABLO TOWER anytime.`
                : 'View of the city from your window. Unit 408. Rent: paid through PABLO CORP.'}
            </div>
            <button
              onClick={() => {
                const g = gs.current;
                const spawnBid = g.hamletBuildingId;
                const spawnB = BUILDINGS.find(b => b.id === spawnBid) ?? BUILDINGS.find(b => b.id === 'minx_arms')!;
                g.px = spawnB.x + spawnB.w / 2;
                g.py = spawnB.y + spawnB.h + 20;
                const def = getInterior(spawnBid);
                if (def) {
                  let spawnIx = def.exitX + def.exitW / 2;
                  let spawnIy = def.exitY - 20;
                  const spawnICol = (ipx: number, ipy: number) => {
                    if (ipx < PSIZE + 6 || ipx > def.width - PSIZE - 6 || ipy < PSIZE + 20 || ipy > def.height - PSIZE) return true;
                    for (const obj of def.objects) {
                      if (obj.type === 'window' || obj.type === 'plant') continue;
                      if (ipx + PSIZE > obj.x && ipx - PSIZE < obj.x + obj.w && ipy + PSIZE > obj.y && ipy - PSIZE < obj.y + obj.h) return true;
                    }
                    return false;
                  };
                  if (spawnICol(spawnIx, spawnIy)) {
                    for (let r = 8; r <= 200; r += 8) {
                      let escaped = false;
                      for (const [ox, oy] of [[0,r],[0,-r],[r,0],[-r,0],[r,r],[-r,r],[r,-r],[-r,-r]]) {
                        if (!spawnICol(spawnIx + ox, spawnIy + oy)) { spawnIx += ox; spawnIy += oy; escaped = true; break; }
                      }
                      if (escaped) break;
                    }
                  }
                  g.interior = {
                    bid: spawnBid, def,
                    px: spawnIx, py: spawnIy,
                    savedWorldX: g.px, savedWorldY: g.py,
                  };
                }
                setShowIndoorStart(false);
                setNarr(isUnemployed
                  ? `> ${hamletLabel} — Your hamlet. No corporate ties. Walk to the EXIT to step outside. Register a business at PABLO TOWER when you're ready.`
                  : '> MINX ARMS — FLOOR 4 — UNIT 408. Your apartment. The intercom crackles. Walk to the EXIT to step outside.');
              }}
              style={{ padding: '.65rem 2rem', background: isUnemployed ? 'rgba(255,200,60,.08)' : 'rgba(0,255,65,.08)', border: `1px solid ${isUnemployed ? 'rgba(255,200,60,.5)' : 'rgba(0,255,65,.5)'}`, color: accentColor, fontFamily: "'VT323',monospace", fontSize: '1.4rem', letterSpacing: '.18em', cursor: 'pointer' }}
            >
              WAKE UP
            </button>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '.5rem', color: 'rgba(255,255,255,.25)', letterSpacing: '.1em', marginTop: '.8rem' }}>PRESS ANY KEY TO CONTINUE</div>
          </div>
        </div>
        );
      })()}

      {showHospitalPrompt && !hospitalCinematic && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.97)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 460, flexDirection: 'column', gap: '1rem' }}>
          <div style={{ textAlign: 'center', maxWidth: 520, padding: '2rem' }}>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.6rem', color: '#ff6644', letterSpacing: '.15em', marginBottom: '1rem', textShadow: '0 0 12px rgba(255,60,30,.4)' }}>YOU DIED DURING YOUR LAST SESSION.</div>
            <div style={{ width: '100%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,100,68,.3), transparent)', marginBottom: '1.2rem' }} />
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '.7rem', color: 'rgba(255,180,150,.5)', lineHeight: 2, marginBottom: '1.5rem', letterSpacing: '.04em' }}>
              Your vitals flatlined. Emergency services brought you in.<br/>
              You've been unconscious in the {char.class.toLowerCase() === 'replicant' ? 'ROBODOC REPAIR BAY' : 'CITY HOSPITAL'} for an unknown amount of time.<br/>
              The fluorescent light above your bed flickers. Monitors beep steadily.<br/>
              A nurse checks your chart and nods. "You're cleared to leave."
            </div>
            <div style={{ width: '100%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,100,68,.15), transparent)', marginBottom: '1.5rem' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem', alignItems: 'center' }}>
              <button
                onClick={() => {
                  setShowHospitalPrompt(false);
                  setHospitalCinematic({ phase: 0, lineIdx: 0, fadeAlpha: 1, startTime: Date.now() });
                }}
                style={{ padding: '.65rem 2rem', width: 320, background: 'rgba(255,100,68,.08)', border: '1px solid rgba(255,100,68,.5)', color: '#ff8855', fontFamily: "'VT323',monospace", fontSize: '1.4rem', letterSpacing: '.18em', cursor: 'pointer' }}
              >
                WAKE UP IN HOSPITAL
              </button>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '.5rem', color: 'rgba(255,255,255,.2)', letterSpacing: '.1em', marginTop: '.5rem' }}>PRESS ANY KEY</div>
              <button
                onClick={() => {
                  setShowHospitalPrompt(false);
                  doSaveRef.current(buildSaveData());
                  navigate('/world');
                }}
                style={{ padding: '.5rem 1.5rem', width: 320, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.15)', color: 'rgba(255,255,255,.4)', fontFamily: "'VT323',monospace", fontSize: '1.1rem', letterSpacing: '.12em', cursor: 'pointer' }}
              >
                ← RETURN TO TERMINAL
              </button>
            </div>
          </div>
        </div>
      )}

      {isDead && !hospitalCinematic && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.97)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, flexDirection: 'column', gap: '1rem' }}>
          <div style={{ textAlign: 'center', maxWidth: 520, padding: '2rem' }}>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: 'clamp(2.5rem, 8vw, 5rem)', color: '#ff2222', textShadow: '0 0 32px rgba(255,0,0,.6)', letterSpacing: '.2em', marginBottom: '.5rem' }}>YOU ARE DEAD</div>
            <div style={{ width: '100%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,0,0,.3), transparent)', marginBottom: '1rem' }} />
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.1rem', color: '#ff6644', letterSpacing: '.1em', marginBottom: '.6rem', textShadow: '0 0 8px rgba(255,60,30,.3)' }}>
              CAUSE OF DEATH: {gs.current.deathReason || 'Unknown — vitals flatlined'}
            </div>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '.65rem', color: 'rgba(255,80,80,.5)', lineHeight: 2, marginBottom: '1.2rem', letterSpacing: '.04em' }}>
              {char.name} — {char.class.toUpperCase()}<br/>
              Your vitals flatlined. The street goes dark around you.<br/>
              Emergency frequency detected. A dispatch unit is standing by.
            </div>
            <div style={{ width: '100%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,0,0,.15), transparent)', marginBottom: '1.5rem' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem', alignItems: 'center' }}>
              <button
                onClick={() => {
                  setIsDead(false);
                  setHospitalCinematic({ phase: 0, lineIdx: 0, fadeAlpha: 1, startTime: Date.now() });
                }}
                style={{ padding: '.65rem 2rem', width: 320, background: 'rgba(255,0,0,.08)', border: '1px solid rgba(255,50,50,.5)', color: '#ff6666', fontFamily: "'VT323',monospace", fontSize: '1.5rem', letterSpacing: '.18em', cursor: 'pointer' }}
              >
                {char.class.toLowerCase() === 'replicant' ? 'TAKE ME TO A ROBODOC' : 'GO TO HOSPITAL'}
              </button>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '.5rem', color: 'rgba(255,255,255,.2)', letterSpacing: '.1em', marginTop: '.3rem', marginBottom: '.3rem' }}>PRESS ANY KEY</div>
              <button
                onClick={() => {
                  setIsDead(false);
                  doSaveRef.current(buildSaveData());
                  navigate('/world');
                }}
                style={{ padding: '.5rem 1.5rem', width: 320, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.15)', color: 'rgba(255,255,255,.4)', fontFamily: "'VT323',monospace", fontSize: '1.1rem', letterSpacing: '.12em', cursor: 'pointer' }}
              >
                ← RETURN TO TERMINAL
              </button>
            </div>
          </div>
        </div>
      )}

      {arcadeGameId && (
        <Suspense fallback={<div style={{ position: 'absolute', inset: 0, zIndex: 600, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00ff41', fontFamily: "'Share Tech Mono',monospace" }}>LOADING...</div>}>
          <ArcadeGame
            gameId={arcadeGameId}
            salary={salary}
            onExit={() => { setArcadeGameId(null); gameRef.current?.focus(); }}
            onDeductFiat={() => {
              const g = gs.current;
              if (g.salary < 1) { setNarr('> INSUFFICIENT FIAT — You need at least 1 FIAT to play.'); return false; }
              g.salary -= 1;
              setSalary(g.salary);
              return true;
            }}
          />
        </Suspense>
      )}

      {showNewspaper && (() => {
        const np = showNewspaper;
        return (
          <div style={{ position: 'absolute', inset: 0, zIndex: 700, background: 'rgba(0,0,0,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Share Tech Mono',monospace" }}>
            <div style={{ width: '700px', maxWidth: '96vw', maxHeight: '92vh', background: '#f5f0e0', color: '#1a1a1a', borderRadius: '3px', overflow: 'auto', boxShadow: '0 0 40px rgba(255,200,60,.15)', border: '2px solid #2a2a2a' }}>
              <div style={{ background: '#1a1a1a', color: '#f5f0e0', padding: '10px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', letterSpacing: '.3em', lineHeight: 1.1 }}>THE MINX</div>
                <div style={{ fontSize: '.55rem', letterSpacing: '.15em', opacity: .6, marginTop: '2px' }}>INDEPENDENT UNDERGROUND PRESS — ISSUE #{np.issue} — {np.season} EDITION — PRICE: FREE (100 FIAT TO KEEP)</div>
              </div>
              <div style={{ padding: '14px 18px' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', lineHeight: 1.2, borderBottom: '2px solid #1a1a1a', paddingBottom: '6px', marginBottom: '4px' }}>{np.headline}</div>
                <div style={{ fontSize: '.7rem', fontStyle: 'italic', color: '#555', marginBottom: '12px' }}>{np.subhead}</div>
                <div style={{ display: 'grid', gridTemplateColumns: np.articles.length > 3 ? '1fr 1fr' : '1fr', gap: '10px', marginBottom: '14px' }}>
                  {np.articles.map((a, i) => (
                    <div key={i} style={{ borderLeft: '2px solid #ccc', paddingLeft: '8px' }}>
                      <div style={{ fontSize: '.72rem', fontWeight: 'bold', marginBottom: '3px', textTransform: 'uppercase' }}>{a.title}</div>
                      <div style={{ fontSize: '.58rem', lineHeight: 1.5, color: '#333' }}>{a.body}</div>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid #aaa', paddingTop: '8px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '.6rem', fontWeight: 'bold', marginBottom: '4px', letterSpacing: '.1em' }}>WEATHER REPORT</div>
                  <div style={{ fontSize: '.55rem', color: '#444', lineHeight: 1.5 }}>{np.weather}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px', borderTop: '1px solid #aaa', paddingTop: '8px' }}>
                  {np.ads.map((ad, i) => (
                    <div key={i} style={{ fontSize: '.5rem', color: '#555', background: '#ece7d5', padding: '4px 6px', border: '1px dashed #bbb' }}>{ad}</div>
                  ))}
                </div>
                <div style={{ fontSize: '.55rem', fontStyle: 'italic', color: '#444', borderTop: '1px solid #aaa', paddingTop: '8px', lineHeight: 1.5 }}>{np.editorial}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', padding: '10px 16px', borderTop: '1px solid #ccc', background: '#ece7d5' }}>
                <button onClick={() => {
                  const g = gs.current;
                  if (g.salary < 100) { setNarr('> NOT ENOUGH FIAT — You need 100 FIAT to keep this newspaper.'); return; }
                  if (g.inventory.length >= INVENTORY_MAX_SLOTS) { setNarr('> INVENTORY FULL — No room for the newspaper.'); return; }
                  const itemId = `newspaper_${np.issue}_${Date.now()}`;
                  g.salary -= 100; setSalary(g.salary);
                  const newItem: InventoryItem = { id: itemId, name: `THE MINX #${np.issue}`, desc: `${np.season} edition of THE MINX underground newspaper.`, icon: '📰', stackable: false, qty: 1, value: 50 };
                  g.inventory.push(newItem);
                  setInventory([...g.inventory]);
                  setNarr(`> PURCHASED — THE MINX Issue #${np.issue} (${np.season}) added to inventory. -100 FIAT`);
                  setShowNewspaper(null);
                  gameRef.current?.focus();
                }} style={{ padding: '6px 18px', background: '#1a1a1a', color: '#f5f0e0', border: 'none', cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace", fontSize: '.65rem', letterSpacing: '.08em' }}>KEEP COPY — 100 FIAT</button>
                <button onClick={() => { setShowNewspaper(null); gameRef.current?.focus(); }} style={{ padding: '6px 18px', background: 'transparent', color: '#1a1a1a', border: '1px solid #1a1a1a', cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace", fontSize: '.65rem', letterSpacing: '.08em' }}>CLOSE</button>
              </div>
            </div>
          </div>
        );
      })()}

      {showInventory && (() => {
        const g = gs.current;
        const inShop = g.interior && (g.interior.bid === 'pawn_shop' || g.interior.bid === 'market');
        const sellItem = (idx: number) => {
          const item = g.inventory[idx];
          if (!item) return;
          g.salary += item.value;
          g.inventory.splice(idx, 1);
          setSalary(g.salary);
          setInventory([...g.inventory]);
          sfxCoin();
          setNarr(`> SOLD — ${item.name} for ${item.value} FIAT. "Pleasure doing business."`);
        };
        return (
          <div style={{ position: 'absolute', inset: 0, zIndex: 700, background: 'rgba(0,0,0,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Share Tech Mono',monospace" }}
            onClick={(e) => { if (e.target === e.currentTarget) { setShowInventory(false); gameRef.current?.focus(); } }}>
            <div style={{ width: '520px', maxWidth: '96vw', background: 'rgba(10,12,18,.96)', border: '1px solid rgba(0,255,200,.25)', borderRadius: '4px', boxShadow: '0 0 30px rgba(0,255,200,.08)' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(0,255,200,.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'rgba(0,255,200,.8)', fontSize: '.8rem', letterSpacing: '.15em' }}>INVENTORY ({inventory.length}/{INVENTORY_MAX_SLOTS}){inShop ? ' — SELL MODE' : ''}</span>
                <button onClick={() => { setShowInventory(false); gameRef.current?.focus(); }} style={{ background: 'none', border: '1px solid rgba(255,60,60,.4)', color: 'rgba(255,60,60,.7)', padding: '2px 10px', cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace", fontSize: '.6rem' }}>CLOSE [ESC]</button>
              </div>
              <div style={{ padding: '12px', display: 'grid', gridTemplateColumns: `repeat(${INVENTORY_GRID_COLS}, 1fr)`, gap: '6px', minHeight: '200px' }}>
                {Array.from({ length: INVENTORY_MAX_SLOTS }).map((_, i) => {
                  const item = inventory[i];
                  return (
                    <div key={i}
                      onClick={() => { if (item && inShop) sellItem(i); }}
                      style={{
                        aspectRatio: '1', background: item ? 'rgba(0,255,200,.06)' : 'rgba(255,255,255,.02)',
                        border: item ? (inShop ? '1px solid rgba(255,200,60,.35)' : '1px solid rgba(0,255,200,.2)') : '1px solid rgba(255,255,255,.06)',
                        borderRadius: '3px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        cursor: item && inShop ? 'pointer' : 'default', position: 'relative', transition: 'border-color .15s',
                      }}
                      title={item ? `${item.name}\n${item.desc}\nValue: ${item.value} FIAT${inShop ? '\nClick to sell' : ''}` : 'Empty slot'}
                    >
                      {item && (
                        <>
                          <span style={{ fontSize: '1.3rem' }}>{item.icon}</span>
                          <span style={{ fontSize: '.42rem', color: 'rgba(0,255,200,.7)', marginTop: '2px', textAlign: 'center', lineHeight: 1.2, maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                          {item.qty > 1 && <span style={{ position: 'absolute', top: '2px', right: '4px', fontSize: '.42rem', color: 'rgba(255,200,60,.8)' }}>x{item.qty}</span>}
                          {inShop && <span style={{ position: 'absolute', bottom: '2px', fontSize: '.38rem', color: 'rgba(255,200,60,.8)' }}>SELL {item.value}F</span>}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(0,255,200,.1)' }}>
                <span style={{ fontSize: '.5rem', color: 'rgba(255,255,255,.3)' }}>{inShop ? 'Click items to sell | ESC to close' : 'HOVER for details | Visit PAWN SHOP or MARKET to sell items | [I] to toggle'}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {videoCallRoom && (
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 750, fontFamily: "'Share Tech Mono',monospace", width: '340px', maxWidth: '40vw' }}>
          <div style={{ background: 'rgba(8,8,14,.94)', border: '1px solid rgba(0,200,255,.3)', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 0 25px rgba(0,200,255,.1)' }}>
            <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(0,200,255,.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,200,255,.06)' }}>
              <span style={{ color: 'rgba(0,200,255,.8)', fontSize: '.6rem', letterSpacing: '.1em' }}>VIDEO CALL — {videoCallPeers.length + 1} participant{videoCallPeers.length !== 0 ? 's' : ''}</span>
              <button onClick={leaveVideoCall} style={{ background: 'rgba(255,60,60,.15)', border: '1px solid rgba(255,60,60,.4)', color: 'rgba(255,60,60,.8)', padding: '2px 8px', cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace", fontSize: '.5rem', borderRadius: '3px' }}>END [ESC]</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: videoCallPeers.length > 1 ? '1fr 1fr' : '1fr', gap: '3px', padding: '4px' }}>
              <div style={{ aspectRatio: '4/3', background: 'rgba(0,0,0,.6)', borderRadius: '3px', overflow: 'hidden', position: 'relative', border: '1px solid rgba(0,200,255,.15)' }}>
                {vcStream && videoEnabled ? (
                  <video ref={el => { if (el && vcStream) { el.srcObject = vcStream; el.muted = true; el.play().catch(() => {}); } }} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontSize: '1.5rem' }}>👤</div>
                    <div style={{ fontSize: '.45rem', color: 'rgba(0,200,255,.5)' }}>{videoEnabled ? '' : 'CAMERA OFF'}</div>
                  </div>
                )}
                <div style={{ position: 'absolute', bottom: 2, left: 4, fontSize: '.4rem', color: 'rgba(0,200,255,.7)', background: 'rgba(0,0,0,.6)', padding: '1px 4px', borderRadius: '2px' }}>YOU{!audioEnabled ? ' (MUTED)' : ''}</div>
              </div>
              {videoCallPeers.map(peer => (
                <div key={peer.id} style={{ aspectRatio: '4/3', background: 'rgba(0,0,0,.6)', borderRadius: '3px', overflow: 'hidden', position: 'relative', border: '1px solid rgba(0,200,255,.1)' }}>
                  {peer.stream ? (
                    <video ref={el => { if (el && peer.stream) { el.srcObject = peer.stream; el.play().catch(() => {}); } }} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ fontSize: '1.5rem' }}>👤</div>
                    </div>
                  )}
                  <div style={{ position: 'absolute', bottom: 2, left: 4, fontSize: '.4rem', color: 'rgba(0,200,255,.7)', background: 'rgba(0,0,0,.6)', padding: '1px 4px', borderRadius: '2px' }}>{peer.name}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '5px 8px', borderTop: '1px solid rgba(0,200,255,.1)', display: 'flex', gap: '6px', justifyContent: 'center' }}>
              <button onClick={() => {
                if (vcStreamRef.current) {
                  const audioTrack = vcStreamRef.current.getAudioTracks()[0];
                  if (audioTrack) { audioTrack.enabled = !audioTrack.enabled; setAudioEnabled(audioTrack.enabled); }
                }
              }} style={{ padding: '3px 10px', background: audioEnabled ? 'rgba(0,200,255,.1)' : 'rgba(255,60,60,.15)', border: `1px solid ${audioEnabled ? 'rgba(0,200,255,.3)' : 'rgba(255,60,60,.4)'}`, color: audioEnabled ? 'rgba(0,200,255,.7)' : 'rgba(255,60,60,.7)', cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace", fontSize: '.45rem', borderRadius: '3px' }}>
                {audioEnabled ? 'MIC ON' : 'MIC OFF'}
              </button>
              <button onClick={() => {
                if (vcStreamRef.current) {
                  const videoTrack = vcStreamRef.current.getVideoTracks()[0];
                  if (videoTrack) { videoTrack.enabled = !videoTrack.enabled; setVideoEnabled(videoTrack.enabled); }
                }
              }} style={{ padding: '3px 10px', background: videoEnabled ? 'rgba(0,200,255,.1)' : 'rgba(255,60,60,.15)', border: `1px solid ${videoEnabled ? 'rgba(0,200,255,.3)' : 'rgba(255,60,60,.4)'}`, color: videoEnabled ? 'rgba(0,200,255,.7)' : 'rgba(255,60,60,.7)', cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace", fontSize: '.45rem', borderRadius: '3px' }}>
                {videoEnabled ? 'CAM ON' : 'CAM OFF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {gamePaused && !showNewspaper && (
        <div
          onClick={() => { setGamePaused(false); gameRef.current?.focus(); }}
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 500, cursor: 'pointer', gap: '.6rem' }}
        >
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '1.8rem', color: 'rgba(255,255,255,.6)', letterSpacing: '.4em', fontWeight: 300 }}>
            BREAK
          </div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '.5rem', color: 'rgba(255,255,255,.2)', letterSpacing: '.08em' }}>
            click to return
          </div>
        </div>
      )}

      {hospitalCinematic && (() => {
        const HOSPITAL_LINES = [
          '[ EMERGENCY DISPATCH — UNIT INBOUND ]',
          'Sirens cut through the static. You feel pavement against your back.',
          'Hands lift you onto a stretcher. Fluorescent light blurs overhead.',
          char.class.toLowerCase() === 'replicant'
            ? 'ROBODOC: "Chassis integrity at 12%. Initiating full system rebuild."'
            : 'MEDIC: "Pulse is weak. Start the IV. Move, move, move."',
          'The hospital corridor smells like antiseptic and old wiring.',
          char.class.toLowerCase() === 'replicant'
            ? 'Servos whir. Diagnostic cables snake into your access ports.'
            : 'A mask covers your face. Cold fluid enters your veins.',
          '...',
          char.class.toLowerCase() === 'replicant'
            ? 'ROBODOC: "Core systems stabilized. Rebooting consciousness matrix."'
            : 'MEDIC: "Vitals stabilizing. Blood pressure coming back up."',
          'Time passes. You drift between static and silence.',
          'Monitors beep steadily. The fluorescent light above your bed flickers.',
        ];
        const elapsed = Date.now() - hospitalCinematic.startTime;
        const LINE_INTERVAL = 2200;
        const currentLine = Math.min(Math.floor(elapsed / LINE_INTERVAL), HOSPITAL_LINES.length - 1);
        const allLinesShown = currentLine >= HOSPITAL_LINES.length - 1 && elapsed >= (HOSPITAL_LINES.length - 1) * LINE_INTERVAL + 1500;

        return (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.99)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 470, flexDirection: 'column' }}>
            <div style={{ textAlign: 'center', maxWidth: 600, padding: '2rem' }}>
              <div style={{ fontFamily: "'VT323',monospace", fontSize: '1rem', color: 'rgba(255,100,68,.6)', letterSpacing: '.2em', marginBottom: '2rem' }}>
                {char.class.toLowerCase() === 'replicant' ? '[ ROBODOC REPAIR BAY ]' : '[ CITY HOSPITAL — EMERGENCY WARD ]'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.8rem', marginBottom: '2rem' }}>
                {HOSPITAL_LINES.slice(0, currentLine + 1).map((line, i) => (
                  <div key={i} style={{
                    fontFamily: "'Share Tech Mono',monospace",
                    fontSize: '.65rem',
                    color: i === currentLine ? 'rgba(255,180,150,.7)' : 'rgba(255,180,150,.3)',
                    letterSpacing: '.04em',
                    lineHeight: 1.8,
                    transition: 'color 0.5s ease',
                  }}>
                    {line}
                  </div>
                ))}
              </div>
              {allLinesShown && (<>
                <button
                  onClick={() => {
                    const g = gs.current;
                    const emergencyFee = 5000;
                    g.hp = g.maxHp; g.hunger = 70; g.thirst = 70; g.energy = 60;
                    g.poisoned = false; g.poisonTick = 0; g.invincible = 240; g.flash = 0;
                    g.threats = g.threats.map(t => ({ ...t }));
                    g.diedLastSession = false;
                    try { localStorage.removeItem('sm_died_last_session'); } catch {}
                    const hamletBid = g.hamletBuildingId;
                    const hamletB = BUILDINGS.find(b => b.id === hamletBid);
                    const clinicB = BUILDINGS.find(b => b.id === 'clinic')!;
                    const isShelterSpawn = SHELTER_BUILDINGS.includes(hamletBid) || CAMPSITE_IDS.includes(hamletBid);
                    if (isShelterSpawn && hamletB) {
                      g.px = hamletB.x + hamletB.w / 2;
                      g.py = hamletB.y + hamletB.h + 20;
                      g.salary = Math.max(-50000, g.salary - Math.floor(emergencyFee * 0.3));
                      setSalary(g.salary); setHp(g.maxHp);
                      setHunger(70); setThirst(70); setEnergy(60);
                      setPoisoned(false);
                      addBankTx('STREET MEDIC RECOVERY', -Math.floor(emergencyFee * 0.3), g.salary);
                      setHospitalCinematic(null);
                      const debtNote = g.salary < 0 ? ` You're ƒ${Math.abs(g.salary).toLocaleString()} in debt.` : '';
                      setNarr(`> ${getHamletLabel(hamletBid).toUpperCase()} — You come to on a thin mattress. Someone patched you up. Stats partially restored. ƒ${Math.floor(emergencyFee * 0.3).toLocaleString()} FIAT deducted.${debtNote}`);
                      sfxHeal();
                    } else {
                      const spawnB = hamletB ?? clinicB;
                      g.px = spawnB.x + spawnB.w / 2;
                      g.py = spawnB.y + spawnB.h + 20;
                      g.salary = Math.max(-50000, g.salary - emergencyFee);
                      setSalary(g.salary); setHp(g.maxHp);
                      setHunger(70); setThirst(70); setEnergy(60);
                      setPoisoned(false);
                      addBankTx('HOSPITAL EMERGENCY RECOVERY', -emergencyFee, g.salary);
                      setHospitalCinematic(null);
                      const debtNote = g.salary < 0 ? ` You're ƒ${Math.abs(g.salary).toLocaleString()} in debt.` : '';
                      setNarr(`> ${getHamletLabel(hamletBid).toUpperCase()} — Emergency services brought you home. Stats partially restored. ƒ${emergencyFee.toLocaleString()} FIAT deducted.${debtNote}`);
                      sfxHeal();
                    }
                  }}
                  data-cinematic-continue="true"
                  style={{ padding: '.65rem 2rem', background: 'rgba(255,100,68,.08)', border: '1px solid rgba(255,100,68,.5)', color: '#ff8855', fontFamily: "'VT323',monospace", fontSize: '1.4rem', letterSpacing: '.18em', cursor: 'pointer', animation: 'smblink 1.5s ease-in-out infinite alternate' }}
                >
                  OPEN YOUR EYES
                </button>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '.5rem', color: 'rgba(255,255,255,.2)', letterSpacing: '.1em', marginTop: '.5rem' }}>PRESS ANY KEY</div>
              </>)}
            </div>
          </div>
        );
      })()}

      {/* ─────────────────────── SUBWAY FAST TRAVEL ────────────────────────── */}
      {showSubway && (() => {
        const STATIONS = [
          { id: 'sub_west',    label: 'METRO WEST',    sub: 'Sector 1 · Industrial District', x: 5740, y: 7130 },
          { id: 'sub_central', label: 'METRO CENTRAL', sub: 'Sector 4 · Commercial Hub',      x: 6740, y: 7130 },
          { id: 'sub_east',    label: 'METRO EAST',    sub: 'Sector 7 · Corporate Row',       x: 7740, y: 7130 },
          { id: 'sub_north',   label: 'METRO NORTH',   sub: 'North Quarter · Edge District',  x: 8540, y: 5530 },
        ];
        const FARE = 500;
        const origin = STATIONS.find(s => s.id === subwayOrigin);
        const doRide = (dest: typeof STATIONS[0]) => {
          const g = gs.current;
          if (dest.id === subwayOrigin) { setNarr(`> METRO — You're already at ${dest.label}.`); setShowSubway(false); return; }
          if (g.salary < FARE) { sfxError(); setNarr(`> METRO — Insufficient FIAT. Fare is ƒ${FARE.toLocaleString()}. "No tokens, no transit."`); setShowSubway(false); return; }
          g.salary -= FARE; setSalary(g.salary);
          sfxEnter(); sfxCoin();
          g.subwayTransit = true;
          g.subwayTransitTimer = 90;
          g.subwayTransitDest = { x: dest.x, y: dest.y, label: dest.label };
          setNarr(`> METRO — Boarding at ${origin?.label ?? '???'}. Destination: ${dest.label}. [−ƒ${FARE.toLocaleString()} FIAT] "PABLO CORP. MASS TRANSIT. SURVEILLANCE IN PROGRESS."`);
          setShowSubway(false);
        };
        return (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70 }}>
            <div style={{ background: '#050505', border: '2px solid rgba(0,255,65,.45)', width: 'min(580px,92vw)', fontFamily: '"VT323", monospace', color: '#00ff41', display: 'flex', flexDirection: 'column', maxHeight: '85vh', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ padding: '.6rem 1.1rem', borderBottom: '1px solid rgba(0,255,65,.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: '1.5rem', letterSpacing: '.2em' }}>MINX CITY METRO</div>
                  <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.38)', letterSpacing: '.12em', marginTop: '.1rem' }}>PABLO CORP. RAPID TRANSIT NETWORK · FARE: ƒ{FARE.toLocaleString()}</div>
                </div>
                <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.25)' }}>BOARD: ƒ{salary.toLocaleString()}</div>
              </div>
              {/* Origin */}
              <div style={{ padding: '.55rem 1.1rem', borderBottom: '1px solid rgba(0,255,65,.1)', fontSize: '.5rem', color: 'rgba(0,255,65,.32)', letterSpacing: '.1em', flexShrink: 0 }}>
                CURRENT STATION: <span style={{ color: '#00ff41' }}>{origin?.label ?? 'UNKNOWN'}</span>
              </div>
              {/* Station list */}
              <div style={{ padding: '.7rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '.55rem', overflowY: 'auto' }}>
                <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.28)', letterSpacing: '.12em', marginBottom: '.25rem' }}>SELECT DESTINATION</div>
                {STATIONS.map(s => {
                  const isCurrent = s.id === subwayOrigin;
                  return (
                    <button key={s.id} onClick={() => doRide(s)} disabled={isCurrent}
                      style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '.55rem', alignItems: 'center', padding: '.6rem .8rem', background: isCurrent ? 'rgba(0,255,65,.06)' : 'rgba(0,255,65,.02)', border: isCurrent ? '1px solid rgba(0,255,65,.45)' : '1px solid rgba(0,255,65,.18)', color: '#00ff41', cursor: isCurrent ? 'default' : 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                      <div style={{ fontSize: '.7rem', color: isCurrent ? '#00ff41' : 'rgba(0,255,65,.4)' }}>●</div>
                      <div>
                        <div style={{ fontSize: '1.1rem', letterSpacing: '.1em', color: isCurrent ? '#00ff41' : 'rgba(0,255,65,.7)' }}>{s.label}</div>
                        <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.28)', marginTop: '.1rem' }}>{s.sub}</div>
                      </div>
                      <div style={{ fontSize: '.9rem', color: isCurrent ? 'rgba(0,255,65,.3)' : 'rgba(0,255,65,.55)', letterSpacing: '.05em' }}>{isCurrent ? '[ HERE ]' : `ƒ${FARE.toLocaleString()}`}</div>
                    </button>
                  );
                })}
              </div>
              {/* Footer */}
              <div style={{ padding: '.45rem 1.1rem', borderTop: '1px solid rgba(0,255,65,.12)', fontSize: '.55rem', color: 'rgba(0,255,65,.15)', letterSpacing: '.06em', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
                <span>ALL PASSENGERS SUBJECT TO IDENTITY VERIFICATION. PABLO CORP. MONITORS ALL TRANSIT ACTIVITY.</span>
                <button onClick={() => setShowSubway(false)} style={{ background: 'none', border: 'none', color: 'rgba(0,255,65,.3)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.45rem', letterSpacing: '.1em' }}>[ ESC ]</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── CRAFTING PANEL (Outlaws only) ────────────────────────────────── */}
      {showCrafting && (() => {
        const g = gs.current;
        const VT2: React.CSSProperties = { fontFamily: "'VT323',monospace" };
        const isOutlaw = char.class.toLowerCase() === 'outlaw';
        const doCraft = (recipe: CraftRecipe) => {
          for (const [matId, qty] of Object.entries(recipe.materials)) {
            if ((g.cargo[matId] ?? 0) < qty) {
              sfxError(); setNarr(`> CRAFTING — Missing materials for ${recipe.name}.`); return;
            }
          }
          for (const [matId, qty] of Object.entries(recipe.materials)) {
            g.cargo[matId] = (g.cargo[matId] ?? 0) - qty;
            if (g.cargo[matId] <= 0) delete g.cargo[matId];
          }
          if (recipe.result.effect) {
            const fx = recipe.result.effect;
            if (fx.includes('hunger')) { const m = fx.match(/hunger(\d+)/); if (m) g.hunger = Math.min(100, g.hunger + parseInt(m[1])); }
            if (fx.includes('thirst')) { const m = fx.match(/thirst(\d+)/); if (m) g.thirst = Math.min(100, g.thirst + parseInt(m[1])); }
            if (fx.includes('energy')) { const m = fx.match(/energy(\d+)/); if (m) g.energy = Math.min(100, g.energy + parseInt(m[1])); }
            if (fx.includes('hp')) { const m = fx.match(/hp(\d+)/); if (m) g.hp = Math.min(g.maxHp, g.hp + parseInt(m[1])); }
            if (fx.includes('cure_poison')) { g.poisoned = false; setPoisoned(false); }
            setHp(Math.floor(g.hp)); setHunger(Math.floor(g.hunger)); setThirst(Math.floor(g.thirst)); setEnergy(Math.floor(g.energy));
          } else {
            g.ownedItems.add(recipe.result.id);
          }
          sfxCoin();
          setNarr(`> CRAFTED: ${recipe.result.name}. ${recipe.desc}`);
          g.floaters.push({ x: g.px, y: g.py - 30, text: `CRAFTED: ${recipe.result.name}`, color: '#88ff44', life: 60, maxLife: 60 });
        };
        return (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.93)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:360 }}
            onClick={e => { if (e.target === e.currentTarget) { setShowCrafting(false); frozenRef.current = false; } }}>
            <div style={{ width:560, maxHeight:'80vh', overflow:'auto', border:'1px solid rgba(136,255,68,.4)', background:'rgba(0,6,2,.98)', fontFamily:"'Share Tech Mono',monospace", padding:'1.2rem' }}>
              <div style={{ ...VT2, fontSize:'1.6rem', color:'#88ff44', letterSpacing:'.18em', marginBottom:'.6rem' }}>OUTLAW CRAFTING</div>
              <div style={{ fontSize:'.42rem', color:'rgba(136,255,68,.35)', letterSpacing:'.1em', marginBottom:'1rem' }}>CONVERT SCAVENGED MATERIALS INTO SUPPLIES</div>
              {!isOutlaw && <div style={{ color:'#ff4444', fontSize:'.8rem', padding:'.5rem', border:'1px solid rgba(255,68,68,.3)' }}>CRAFTING IS RESTRICTED TO THE OUTLAWS FACTION</div>}
              {isOutlaw && CRAFT_RECIPES.map(recipe => {
                const canCraft = Object.entries(recipe.materials).every(([matId, qty]) => (g.cargo[matId] ?? 0) >= qty);
                return (
                  <div key={recipe.id} style={{ border:'1px solid rgba(136,255,68,.2)', padding:'.6rem', marginBottom:'.4rem' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <div style={{ ...VT2, fontSize:'1.1rem', color:'#88ff44' }}>{recipe.name}</div>
                        <div style={{ fontSize:'.5rem', color:'rgba(136,255,68,.4)', marginTop:'.15rem' }}>{recipe.desc}</div>
                        <div style={{ fontSize:'.45rem', color:'rgba(136,255,68,.3)', marginTop:'.1rem' }}>
                          NEEDS: {Object.entries(recipe.materials).map(([id, qty]) => `${id.replace(/_/g,' ').toUpperCase()} ×${qty} (have: ${g.cargo[id] ?? 0})`).join(' · ')}
                        </div>
                      </div>
                      <button onClick={() => doCraft(recipe)} disabled={!canCraft}
                        style={{ padding:'.4rem .8rem', background: canCraft ? 'rgba(136,255,68,.1)' : 'transparent', border:`1px solid ${canCraft ? 'rgba(136,255,68,.5)' : 'rgba(136,255,68,.15)'}`, color: canCraft ? '#88ff44' : 'rgba(136,255,68,.25)', cursor: canCraft ? 'pointer' : 'default', ...VT2, fontSize:'.9rem' }}>
                        CRAFT
                      </button>
                    </div>
                  </div>
                );
              })}
              <button onClick={() => { setShowCrafting(false); frozenRef.current = false; }} style={{ marginTop:'1rem', width:'100%', padding:'.4rem', background:'transparent', border:'1px solid rgba(136,255,68,.2)', color:'rgba(136,255,68,.4)', cursor:'pointer', ...VT2, fontSize:'.95rem' }}>ESC — CLOSE</button>
            </div>
          </div>
        );
      })()}

      {/* ── MERCHANT SHOP PANEL ──────────────────────────────────────────── */}
      {showMerchantShop && (() => {
        const g = gs.current;
        const VT2: React.CSSProperties = { fontFamily: "'VT323',monospace" };
        const merchant = showMerchantShop;
        const allItems = VEND_CATALOG.flatMap(c => c.items);
        const shopItems = merchant.inventory.map(id => allItems.find(i => i.id === id)).filter(Boolean) as VendItem[];
        const doBuy = (item: VendItem) => {
          if (g.salary < item.price) { sfxError(); setNarr(`> ${merchant.name} — Not enough FIAT.`); return; }
          if (g.ownedItems.has(item.id) && !item.consumable) { sfxError(); setNarr(`> ${merchant.name} — Already owned.`); return; }
          g.salary -= item.price; setSalary(g.salary);
          if (item.consumable && item.effect) {
            const fx = item.effect;
            if (fx.includes('hunger')) { const m = fx.match(/hunger(\d+)/); if (m) g.hunger = Math.min(100, g.hunger + parseInt(m[1])); }
            if (fx.includes('thirst')) { const m = fx.match(/thirst(\d+)/); if (m) g.thirst = Math.min(100, g.thirst + parseInt(m[1])); }
            if (fx.includes('energy')) { const m = fx.match(/energy(\d+)/); if (m) g.energy = Math.min(100, g.energy + parseInt(m[1])); }
            if (fx.includes('hp')) { const m = fx.match(/hp(\d+)/); if (m) g.hp = Math.min(g.maxHp, g.hp + parseInt(m[1])); }
            if (fx.includes('cure_poison')) { g.poisoned = false; setPoisoned(false); }
            if (fx.includes('rad_block')) { g.radiationLevel = 0; }
            setHp(Math.floor(g.hp)); setHunger(Math.floor(g.hunger)); setThirst(Math.floor(g.thirst)); setEnergy(Math.floor(g.energy));
          } else {
            g.ownedItems.add(item.id);
            if (WEAPON_TIER[item.id]) { g.weaponTier = Math.max(g.weaponTier, WEAPON_TIER[item.id]); }
          }
          sfxCoin();
          g.floaters.push({ x: g.px, y: g.py - 30, text: `−ƒ${item.price.toLocaleString()} ${item.name}`, color: '#ffcc00', life: 60, maxLife: 60 });
          setNarr(`> ${merchant.name} — "${item.name}. Good choice. Pleasure doing business."`);
        };
        return (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.93)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:360 }}
            onClick={e => { if (e.target === e.currentTarget) { setShowMerchantShop(null); frozenRef.current = false; } }}>
            <div style={{ width:560, maxHeight:'80vh', overflow:'auto', border:'1px solid rgba(255,204,0,.4)', background:'rgba(0,6,2,.98)', fontFamily:"'Share Tech Mono',monospace", padding:'1.2rem' }}>
              <div style={{ ...VT2, fontSize:'1.6rem', color:'#ffcc00', letterSpacing:'.18em', marginBottom:'.3rem' }}>{merchant.name}</div>
              <div style={{ fontSize:'.42rem', color:'rgba(255,204,0,.35)', letterSpacing:'.1em', marginBottom:'1rem' }}>
                {merchant.type === 'city' ? 'LICENSED CITY MERCHANT' : 'WASTELAND TRADER'} · FIAT BALANCE: ƒ{salary.toLocaleString()}
              </div>
              {shopItems.map(item => {
                const owned = g.ownedItems.has(item.id) && !item.consumable;
                const canBuy = g.salary >= item.price && !owned;
                return (
                  <div key={item.id} style={{ border:'1px solid rgba(255,204,0,.2)', padding:'.5rem .6rem', marginBottom:'.3rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ ...VT2, fontSize:'1rem', color: owned ? 'rgba(255,204,0,.3)' : '#ffcc00' }}>{item.name} {owned ? '(OWNED)' : ''}</div>
                      <div style={{ fontSize:'.45rem', color:'rgba(255,204,0,.35)', marginTop:'.1rem' }}>{item.desc}</div>
                    </div>
                    <button onClick={() => doBuy(item)} disabled={!canBuy}
                      style={{ padding:'.3rem .7rem', background: canBuy ? 'rgba(255,204,0,.1)' : 'transparent', border:`1px solid ${canBuy ? 'rgba(255,204,0,.4)' : 'rgba(255,204,0,.12)'}`, color: canBuy ? '#ffcc00' : 'rgba(255,204,0,.2)', cursor: canBuy ? 'pointer' : 'default', ...VT2, fontSize:'.9rem', whiteSpace:'nowrap' }}>
                      ƒ{item.price.toLocaleString()}
                    </button>
                  </div>
                );
              })}
              <button onClick={() => { setShowMerchantShop(null); frozenRef.current = false; }} style={{ marginTop:'1rem', width:'100%', padding:'.4rem', background:'transparent', border:'1px solid rgba(255,204,0,.2)', color:'rgba(255,204,0,.4)', cursor:'pointer', ...VT2, fontSize:'.95rem' }}>ESC — CLOSE</button>
            </div>
          </div>
        );
      })()}

      {/* ── GOLD EXCHANGE PANEL ────────────────────────────────────────────── */}
      {showGoldExchange && (() => {
        const g = gs.current;
        const VT2: React.CSSProperties = { fontFamily: "'VT323',monospace" };
        const rate = FIAT_PER_GOLD;
        const doBuyGold = (amt: number) => {
          if (amt <= 0) return;
          const cost = Math.ceil(amt * rate * (1 + getTransactionTax(amt * rate)));
          if (g.salary < cost) { sfxError(); setNarr('> GOLD EXCHANGE — Insufficient FIAT.'); return; }
          g.salary -= cost; g.goldBalance += amt;
          setSalary(g.salary); setGoldBalance(g.goldBalance); sfxCoin();
          setNarr(`> GOLD EXCHANGE — Purchased ${amt}oz GOLD for ƒ${cost.toLocaleString()} FIAT. Tax: ${(getTransactionTax(cost) * 100).toFixed(1)}%.`);
        };
        const doSellGold = (amt: number) => {
          if (amt <= 0 || g.goldBalance < amt) { sfxError(); return; }
          const gain = Math.floor(amt * rate * (1 - getTransactionTax(amt * rate)));
          g.goldBalance -= amt; g.salary += gain;
          setSalary(g.salary); setGoldBalance(g.goldBalance); sfxCoin();
          setNarr(`> GOLD EXCHANGE — Sold ${amt}oz GOLD for ƒ${gain.toLocaleString()} FIAT. Tax: ${(getTransactionTax(gain) * 100).toFixed(1)}%.`);
        };
        return (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.93)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:360 }}
            onClick={e => { if (e.target === e.currentTarget) { setShowGoldExchange(false); } }}>
            <div style={{ width:560, border:'1px solid rgba(255,215,0,.4)', background:'rgba(0,6,2,.98)', fontFamily:"'Share Tech Mono',monospace", padding:'1.2rem' }}>
              <div style={{ ...VT2, fontSize:'1.6rem', color:'#FFD700', letterSpacing:'.18em', marginBottom:'.6rem' }}>GOLD EXCHANGE</div>
              <div style={{ fontSize:'.42rem', color:'rgba(255,215,0,.35)', letterSpacing:'.1em', marginBottom:'1rem' }}>RATE: 1oz GOLD = ƒ{rate.toLocaleString()} FIAT · TAX SCALES WITH SIZE</div>
              <div style={{ display:'flex', gap:'1rem', marginBottom:'1rem' }}>
                <div style={{ flex:1, textAlign:'center' }}>
                  <div style={{ fontSize:'.5rem', color:'rgba(0,255,65,.4)', marginBottom:'.3rem' }}>FIAT BALANCE</div>
                  <div style={{ ...VT2, fontSize:'1.3rem', color:'#00ff41' }}>ƒ{salary.toLocaleString()}</div>
                </div>
                <div style={{ flex:1, textAlign:'center' }}>
                  <div style={{ fontSize:'.5rem', color:'rgba(255,215,0,.4)', marginBottom:'.3rem' }}>GOLD BALANCE</div>
                  <div style={{ ...VT2, fontSize:'1.3rem', color:'#FFD700' }}>{goldBalance}oz</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:'.8rem' }}>
                {[1, 5, 10].map(amt => (
                  <button key={`buy${amt}`} onClick={() => doBuyGold(amt)} disabled={g.salary < amt * rate}
                    style={{ flex:1, padding:'.5rem', background:'rgba(255,215,0,.08)', border:'1px solid rgba(255,215,0,.3)', color:'#FFD700', cursor:'pointer', ...VT2, fontSize:'1rem' }}>
                    BUY {amt}oz
                  </button>
                ))}
              </div>
              <div style={{ display:'flex', gap:'.8rem', marginTop:'.5rem' }}>
                {[1, 5, 10].map(amt => (
                  <button key={`sell${amt}`} onClick={() => doSellGold(amt)} disabled={g.goldBalance < amt}
                    style={{ flex:1, padding:'.5rem', background:'rgba(0,255,65,.05)', border:'1px solid rgba(0,255,65,.25)', color:'#00ff41', cursor:'pointer', ...VT2, fontSize:'1rem' }}>
                    SELL {amt}oz
                  </button>
                ))}
              </div>
              <button onClick={() => setShowGoldExchange(false)} style={{ marginTop:'1rem', width:'100%', padding:'.4rem', background:'transparent', border:'1px solid rgba(255,215,0,.2)', color:'rgba(255,215,0,.4)', cursor:'pointer', ...VT2, fontSize:'.95rem' }}>ESC — CLOSE</button>
            </div>
          </div>
        );
      })()}

      {/* ── BRANCHING DIALOGUE PANEL ──────────────────────────────────────── */}
      {showDialoguePanel && dialogueNode && (() => {
        const VT2: React.CSSProperties = { fontFamily: "'VT323',monospace" };
        const npcColor = '#33ffaa';
        const handleChoice = (nextId: string | null) => {
          if (!nextId || !gs.current.activeDialogue) {
            setShowDialoguePanel(false); setDialogueNode(null);
            gs.current.activeDialogue = null; gs.current.activeDialogueNode = null;
            return;
          }
          const next = gs.current.activeDialogue.nodes[nextId];
          if (next) {
            setDialogueNode(next);
            gs.current.activeDialogueNode = nextId;
            sfxTalk();
            const nodeEffect = (next as any).effect;
            if (nodeEffect === 'give_gold') { gs.current.goldBalance += 5; setGoldBalance(gs.current.goldBalance); }
            if (nodeEffect === 'give_fiat') { gs.current.salary += 2000; setSalary(gs.current.salary); }
            if (nodeEffect === 'heal') { gs.current.hp = gs.current.maxHp; setHp(gs.current.maxHp); }
          } else {
            setShowDialoguePanel(false); setDialogueNode(null);
            gs.current.activeDialogue = null; gs.current.activeDialogueNode = null;
          }
        };
        return (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.95)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:370 }}>
            <div style={{ width:640, border:'1px solid rgba(51,255,170,.4)', background:'rgba(0,6,2,.98)', fontFamily:"'Share Tech Mono',monospace" }}>
              <div style={{ display:'flex', borderBottom:'1px solid rgba(51,255,170,.15)' }}>
                <div style={{ width:140, height:140, background:'rgba(51,255,170,.08)', display:'flex', alignItems:'center', justifyContent:'center', borderRight:'1px solid rgba(51,255,170,.15)', flexShrink:0 }}>
                  <div style={{ width:80, height:80, borderRadius:'50%', background:`radial-gradient(circle, ${npcColor}44, ${npcColor}11)`, border:`2px solid ${npcColor}55`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ ...VT2, fontSize:'2rem', color: npcColor }}>{dialogueNpcName[0]}</span>
                  </div>
                </div>
                <div style={{ flex:1, padding:'1rem 1.2rem' }}>
                  <div style={{ ...VT2, fontSize:'1.4rem', color: npcColor, letterSpacing:'.15em', marginBottom:'.5rem' }}>{dialogueNpcName}</div>
                  <div style={{ fontSize:'.6rem', color:'rgba(51,255,170,.6)', lineHeight:1.8 }}>{dialogueNode.text}</div>
                </div>
              </div>
              <div style={{ padding:'1rem 1.2rem', display:'flex', flexDirection:'column', gap:'.5rem' }}>
                {dialogueNode.choices && dialogueNode.choices.length > 0 ? dialogueNode.choices.map((c, ci) => (
                  <button key={ci} onClick={() => handleChoice(c.nextId)}
                    style={{ padding:'.5rem 1rem', background:'rgba(51,255,170,.05)', border:'1px solid rgba(51,255,170,.25)', color:'rgba(51,255,170,.7)', cursor:'pointer', textAlign:'left', ...VT2, fontSize:'1rem', letterSpacing:'.05em' }}>
                    [{ci + 1}] {c.text}
                  </button>
                )) : (
                  <button data-dialogue-continue="true" onClick={() => handleChoice(null)}
                    style={{ padding:'.5rem 1rem', background:'rgba(51,255,170,.05)', border:'1px solid rgba(51,255,170,.25)', color:'rgba(51,255,170,.5)', cursor:'pointer', ...VT2, fontSize:'1rem' }}>
                    [CONTINUE] <span style={{ fontSize: '.6rem', color: 'rgba(51,255,170,.3)' }}>or press any key</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── CLOTHES / CUSTOMIZATION PANEL ─────────────────────────────────── */}
      {showCostume && (() => {
        const VT2: React.CSSProperties = { fontFamily: "'VT323',monospace" };
        return (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.93)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:360 }}
            onClick={e => { if (e.target === e.currentTarget) setShowCostume(false); }}>
            <div style={{ width:500, border:'1px solid rgba(0,255,65,.35)', background:'rgba(0,6,2,.98)', fontFamily:"'Share Tech Mono',monospace", padding:'1.2rem' }}>
              <div style={{ ...VT2, fontSize:'1.5rem', color:'#00ff41', letterSpacing:'.18em', marginBottom:'.8rem' }}>CLOTHES</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'.5rem' }}>
                {CLOTHES.map(c => {
                  const owned = ownedClothes.has(c.id);
                  const equipped = activeCostume === c.id;
                  return (
                  <button key={c.id} onClick={() => {
                    if (owned) {
                      gs.current.activeCostume = c.id; setActiveCostume(c.id); completeQuestTask('establish_business', 'customize_costume'); setNarr(`> CLOTHES — Equipped: ${c.name}. ${c.desc}`);
                    } else if (c.price > 0 && salary >= c.price) {
                      gs.current.salary -= c.price; setSalary(gs.current.salary); gs.current.ownedClothes.add(c.id); setOwnedClothes(new Set(gs.current.ownedClothes)); gs.current.activeCostume = c.id; setActiveCostume(c.id); completeQuestTask('establish_business', 'customize_costume'); setNarr(`> CLOTHES — Purchased & equipped: ${c.name}. -ƒ${c.price.toLocaleString()}`);
                    } else {
                      setNarr(`> CLOTHES — Not enough FIAT. ${c.name} costs ƒ${c.price.toLocaleString()}.`);
                    }
                  }}
                    style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'.5rem .8rem', background: equipped ? 'rgba(0,255,65,.1)' : 'transparent', border:`1px solid ${equipped ? 'rgba(0,255,65,.4)' : 'rgba(0,255,65,.12)'}`, color: equipped ? '#00ff41' : owned ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.3)', cursor:'pointer', ...VT2, fontSize:'1rem' }}>
                    <span style={{ display:'flex', alignItems:'center', gap:'.5rem' }}>
                      <span style={{ width:12, height:12, background:c.color, borderRadius:2, display:'inline-block', border:'1px solid rgba(0,255,65,.2)' }} />
                      {c.name}
                      <span style={{ fontSize:'.6rem', color:'rgba(0,255,65,.3)' }}>{c.desc}</span>
                    </span>
                    {equipped && <span style={{ fontSize:'.8rem' }}>EQUIPPED</span>}
                    {!owned && c.price > 0 && <span style={{ fontSize:'.75rem', color: salary >= c.price ? '#ffcc44' : '#ff4444' }}>ƒ{c.price.toLocaleString()}</span>}
                    {owned && !equipped && <span style={{ fontSize:'.7rem', color:'rgba(0,255,65,.3)' }}>OWNED</span>}
                  </button>
                  );
                })}
              </div>
              <button onClick={() => setShowCostume(false)} style={{ marginTop:'1rem', width:'100%', padding:'.4rem', background:'transparent', border:'1px solid rgba(0,255,65,.2)', color:'rgba(0,255,65,.4)', cursor:'pointer', ...VT2, fontSize:'.95rem' }}>CLOSE</button>
            </div>
          </div>
        );
      })()}

      {/* ── ADMIN / BUSINESS REGISTRATION PANEL ──────────────────────────── */}
      {showAdmin && (() => {
        const g = gs.current;
        const FICT_FEE = 50000;
        const REAL_FEE = 100000;
        const regFee = adminBizType === 'real' ? REAL_FEE : FICT_FEE;
        const alreadyRegistered = !!char.hasBusiness;
        const FICT_INDUSTRIES = [
          'Thievery', 'Salvaging', 'Bounty Hunting', 'Shopkeeper', 'Trader',
          'Assassin', 'Maintenance', 'Doctor', 'Architect', 'Construction',
          'Engineering', 'Drug Dealing', 'Manufacturing', 'Advertising',
          'Sales', 'Telemarketing', 'Clothes Making', 'Landscaping',
          'Finance', 'Energy', 'Weapons', 'Real Estate', 'Art',
          'Transportation', 'Security', 'Smuggling', 'Hacking', 'Forgery',
        ];
        const REAL_INDUSTRIES = [
          'Software / SaaS', 'Marketing & Advertising', 'Consulting',
          'Healthcare', 'Finance & Fintech', 'Legal',
          'Education', 'E-Commerce / Retail', 'Real Estate',
          'Media & Entertainment', 'Manufacturing', 'Logistics',
          'Food & Beverage', 'Construction', 'Energy',
          'Transportation', 'Security', 'Technology',
        ];
        const industries = adminBizType === 'real' ? REAL_INDUSTRIES : FICT_INDUSTRIES;
        const doRegister = () => {
          if (!adminBizName.trim()) { sfxError(); setNarr('> ADMIN BUREAU — Enter a business name.'); return; }
          if (!adminBizIndustry) { sfxError(); setNarr('> ADMIN BUREAU — Select an industry.'); return; }
          if (g.salary < regFee) { sfxError(); setNarr(`> ADMIN BUREAU — Insufficient FIAT. ${adminBizType === 'real' ? 'Real enterprise' : 'Fictitious entity'} registration: ƒ${regFee.toLocaleString()}.`); return; }
          g.salary -= regFee; setSalary(g.salary); sfxCoin();
          char.hasBusiness = true;
          char.bizType = adminBizType;
          char.company = adminBizName.trim().toUpperCase();
          char.bizRegisteredAt = Date.now();
          setNarr(`> CITY ADMIN BUREAU — "${char.company}" registered as ${adminBizType === 'real' ? 'REAL ENTERPRISE' : 'FICTITIOUS ENTITY'} in ${adminBizIndustry}. ƒ${regFee.toLocaleString()} FIAT deducted. Welcome to Minx City commerce.`);
          setShowAdmin(false);
          setAdminBizName(''); setAdminBizIndustry('');
        };
        return (
          <div style={{ position: 'absolute', inset: 0, zIndex: 900, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => { if (e.target === e.currentTarget) setShowAdmin(false); }}>
            <div style={{ width: 440, maxHeight: '80vh', overflow: 'auto', background: 'rgba(0,8,0,.98)', border: '1px solid rgba(0,255,65,.4)', boxShadow: '0 0 40px rgba(0,255,65,.12)', padding: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.4rem', color: '#00ff41', letterSpacing: '.1em' }}>CITY ADMIN BUREAU</div>
                <button onClick={() => setShowAdmin(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(0,255,65,.4)', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
              </div>
              <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.12em', marginBottom: '.8rem' }}>PABLO CORP. MUNICIPAL SERVICES — BUSINESS REGISTRATION</div>

              {alreadyRegistered ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                  <div style={{ border: '1px solid rgba(0,255,65,.25)', padding: '.7rem', background: 'rgba(0,255,65,.04)' }}>
                    <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.2rem', color: '#00ff41', letterSpacing: '.08em' }}>{char.company}</div>
                    <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.4)', marginTop: '.2rem' }}>
                      Type: {char.bizType === 'real' ? 'REAL ENTERPRISE' : char.bizType === 'fictitious' ? 'FICTITIOUS ENTITY' : 'UNREGISTERED'}<br/>
                      Status: ACTIVE<br/>
                      Registered: {char.bizRegisteredAt ? new Date(char.bizRegisteredAt).toLocaleDateString() : 'ON FILE'}
                    </div>
                  </div>
                  <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.25)', lineHeight: 1.7 }}>
                    Your business is on record with PABLO CORP. municipal database. All transactions logged. All permits valid until revoked.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                  <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.4)', lineHeight: 1.7 }}>
                    Register a business in Minx City. Fictitious entities (fronts, guilds, operations): ƒ{FICT_FEE.toLocaleString()}. Real enterprises (goods, services, trade): ƒ{REAL_FEE.toLocaleString()}.
                  </div>
                  <div>
                    <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.12em', marginBottom: '.3rem' }}>BUSINESS NAME</div>
                    <input
                      value={adminBizName}
                      onChange={e => setAdminBizName(e.target.value)}
                      placeholder="Enter business name..."
                      maxLength={40}
                      style={{ width: '100%', padding: '.4rem .5rem', background: 'rgba(0,5,0,.9)', border: '1px solid rgba(0,255,65,.3)', color: '#00ff41', fontFamily: "'Share Tech Mono',monospace", fontSize: '.8rem', letterSpacing: '.06em', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.12em', marginBottom: '.3rem' }}>BUSINESS TYPE</div>
                    <div style={{ display: 'flex', gap: '.4rem' }}>
                      {(['fictitious', 'real'] as const).map(t => (
                        <button key={t} onClick={() => { setAdminBizType(t); setAdminBizIndustry(''); }} style={{
                          flex: 1, padding: '.5rem', background: adminBizType === t ? 'rgba(0,255,65,.12)' : 'transparent',
                          border: `1px solid ${adminBizType === t ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.15)'}`,
                          color: adminBizType === t ? '#00ff41' : 'rgba(0,255,65,.4)', cursor: 'pointer',
                          fontFamily: "'Share Tech Mono',monospace", fontSize: '.7rem', letterSpacing: '.08em',
                        }}>
                          {t === 'fictitious' ? `FICTITIOUS — ƒ${FICT_FEE.toLocaleString()}` : `REAL ENTERPRISE — ƒ${REAL_FEE.toLocaleString()}`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.12em', marginBottom: '.3rem' }}>INDUSTRY</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.25rem', maxHeight: '30vh', overflow: 'auto' }}>
                      {industries.map(ind => (
                        <button key={ind} onClick={() => setAdminBizIndustry(ind)} style={{
                          padding: '.3rem .4rem', background: adminBizIndustry === ind ? 'rgba(0,255,65,.1)' : 'transparent',
                          border: `1px solid ${adminBizIndustry === ind ? 'rgba(0,255,65,.4)' : 'rgba(0,255,65,.1)'}`,
                          color: adminBizIndustry === ind ? '#00ff41' : 'rgba(0,255,65,.35)', cursor: 'pointer',
                          fontFamily: "'Share Tech Mono',monospace", fontSize: '.55rem', textAlign: 'left',
                        }}>
                          {ind}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={doRegister} style={{
                    width: '100%', padding: '.5rem', marginTop: '.3rem',
                    background: 'rgba(0,255,65,.08)', border: '1px solid rgba(0,255,65,.4)',
                    color: '#00ff41', cursor: 'pointer', fontFamily: "'VT323',monospace",
                    fontSize: '1.1rem', letterSpacing: '.1em',
                  }}>
                    REGISTER — ƒ{regFee.toLocaleString()}
                  </button>
                  <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.2)', textAlign: 'center' }}>
                    Your FIAT balance: ƒ{salary.toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── QUEST / MISSION PANEL ─────────────────────────────────────────── */}
      {showQuests && (() => {
        const VT2: React.CSSProperties = { fontFamily: "'VT323',monospace" };
        const activeQuests = quests.filter(q => !q.completed);
        const completedQuests = quests.filter(q => q.completed);
        return (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.93)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:360 }}
            onClick={e => { if (e.target === e.currentTarget) setShowQuests(false); }}>
            <div style={{ width:560, maxWidth:'92vw', border:'1px solid rgba(255,200,60,.4)', background:'rgba(0,6,2,.98)', fontFamily:"'Share Tech Mono',monospace", padding:'1.2rem', maxHeight:'85vh', overflowY:'auto' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'.8rem' }}>
                <div style={{ ...VT2, fontSize:'1.6rem', color:'#ffcc44', letterSpacing:'.18em' }}>MISSIONS</div>
                <button onClick={() => setShowQuests(false)} style={{ padding:'.2rem .5rem', background:'transparent', border:'1px solid rgba(255,200,60,.2)', color:'rgba(255,200,60,.4)', cursor:'pointer', fontFamily:"'Share Tech Mono',monospace", fontSize:'.5rem' }}>ESC</button>
              </div>
              <div style={{ width:'100%', height:1, background:'linear-gradient(90deg,transparent,rgba(255,200,60,.3),transparent)', marginBottom:'.8rem' }} />

              {activeQuests.length === 0 && completedQuests.length === 0 && (
                <div style={{ fontSize:'.6rem', color:'rgba(255,200,60,.3)', textAlign:'center', padding:'2rem 0' }}>
                  No active missions. Explore Minx City to find objectives.
                </div>
              )}

              {activeQuests.map(quest => (
                <div key={quest.id} style={{ border:'1px solid rgba(255,200,60,.25)', padding:'.8rem', marginBottom:'.6rem', background:'rgba(255,200,60,.03)' }}>
                  <div style={{ ...VT2, fontSize:'1.2rem', color:'#ffcc44', letterSpacing:'.12em', marginBottom:'.3rem' }}>{quest.title}</div>
                  <div style={{ fontSize:'.52rem', color:'rgba(255,200,60,.45)', lineHeight:1.7, marginBottom:'.6rem' }}>{quest.description}</div>
                  <div style={{ fontSize:'.45rem', color:'rgba(255,200,60,.3)', letterSpacing:'.12em', marginBottom:'.4rem' }}>OBJECTIVES</div>
                  {quest.tasks.map(task => (
                    <div key={task.id} style={{ display:'flex', alignItems:'center', gap:'.5rem', padding:'.3rem .4rem', marginBottom:'.2rem', background: task.done ? 'rgba(0,255,65,.04)' : 'transparent', border:`1px solid ${task.done ? 'rgba(0,255,65,.15)' : 'rgba(255,200,60,.1)'}` }}>
                      <div style={{ width:12, height:12, border:`1px solid ${task.done ? '#00ff41' : 'rgba(255,200,60,.4)'}`, background: task.done ? 'rgba(0,255,65,.3)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.5rem', flexShrink:0 }}>
                        {task.done && <span style={{ color:'#00ff41' }}>✓</span>}
                      </div>
                      <div style={{ fontSize:'.55rem', color: task.done ? 'rgba(0,255,65,.5)' : 'rgba(255,200,60,.6)', textDecoration: task.done ? 'line-through' : 'none', flex:1 }}>{task.label}</div>
                      {task.mapMarker && !task.done && (
                        <div style={{ fontSize:'.4rem', color:'rgba(0,200,255,.5)', border:'1px solid rgba(0,200,255,.2)', padding:'1px 4px', flexShrink:0 }}>MAP</div>
                      )}
                    </div>
                  ))}
                  {char.hasBusiness && quest.id === 'establish_business' && (
                    <div style={{ marginTop:'.6rem', borderTop:'1px solid rgba(255,200,60,.1)', paddingTop:'.5rem' }}>
                      <div style={{ fontSize:'.45rem', color:'rgba(0,255,65,.3)', letterSpacing:'.1em', marginBottom:'.3rem' }}>PABLO AUTOMATION</div>
                      <button onClick={() => {
                        completeQuestTask('establish_business', 'pablo_auto');
                        setShowQuests(false);
                        setShowPablo(true);
                        setNarr('> PABLO AI — Business setup automation initiated. Use the PABLO device to configure your enterprise.');
                      }} style={{ width:'100%', padding:'.4rem .6rem', background:'rgba(0,255,65,.06)', border:'1px solid rgba(0,255,65,.25)', color:'rgba(0,255,65,.55)', cursor:'pointer', ...VT2, fontSize:'.9rem', letterSpacing:'.08em' }}>
                        USE PABLO AI TO AUTOMATE BUSINESS SETUP
                      </button>
                      <div style={{ fontSize:'.42rem', color:'rgba(0,255,65,.2)', marginTop:'.2rem' }}>
                        Optional: Let PABLO handle signage, workspace configuration, and registration paperwork.
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {completedQuests.length > 0 && (
                <>
                  <div style={{ fontSize:'.45rem', color:'rgba(0,255,65,.3)', letterSpacing:'.12em', marginTop:'.6rem', marginBottom:'.4rem' }}>COMPLETED</div>
                  {completedQuests.map(quest => (
                    <div key={quest.id} style={{ border:'1px solid rgba(0,255,65,.12)', padding:'.5rem .6rem', marginBottom:'.3rem', background:'rgba(0,255,65,.02)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <div style={{ ...VT2, fontSize:'.9rem', color:'rgba(0,255,65,.4)', letterSpacing:'.1em' }}>{quest.title}</div>
                        <div style={{ fontSize:'.45rem', color:'rgba(0,255,65,.3)', border:'1px solid rgba(0,255,65,.15)', padding:'1px 5px' }}>DONE</div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              <div style={{ fontSize:'.42rem', color:'rgba(255,200,60,.2)', marginTop:'.6rem', lineHeight:1.6 }}>
                Mission objectives are tracked automatically. Active targets are marked on the MAP [M].
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
