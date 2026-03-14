import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  sfxAttack, sfxHit, sfxKill, sfxLevelUp, sfxStep, sfxEnter, sfxTalk,
  sfxSave, sfxPoison, sfxDeath, sfxHeal, sfxCoin, sfxKonami, sfxError,
  sfxZoneCross, initMusic, playMusic, pauseMusic, toggleMute, resumeAudioContext,
} from '../soundEngine';
import { RadioPlayer, RadioHud, useRadio } from '../RadioPlayer';

// ── Constants ─────────────────────────────────────────────────────────────────
const W = 4800, H = 4200, TILE = 32, SPD = 1.4, PSIZE = 8, RANGE = 55;
const BORDER = 100;
const CITY_TOP = 1425;
const CITY_BOTTOM = 2775;

// ── 2.5D depth constant for building perspective ─────────────────────────────
const BUILDING_DEPTH = 18;

// ── Billboard locations ─────────────────────────────────────────────────────
interface BillboardDef {
  locationId: string; label: string; x: number; y: number; w: number; h: number; height: number;
}
const BILLBOARDS: BillboardDef[] = [
  { locationId: 'bb_west_main',   label: 'WEST MAIN ST',      x: 690,  y: 1830, w: 20, h: 10, height: 55 },
  { locationId: 'bb_west_market', label: 'MARKET DISTRICT',   x: 1095,  y: 1875, w: 20, h: 10, height: 50 },
  { locationId: 'bb_west_south',  label: 'SOUTH WALL',        x: 525,  y: 2400, w: 20, h: 10, height: 45 },
  { locationId: 'bb_east_plaza',  label: 'EAST PLAZA',        x: 2025, y: 1800, w: 20, h: 10, height: 55 },
  { locationId: 'bb_east_neon',   label: 'NEON STRIP',        x: 2475, y: 1950, w: 20, h: 10, height: 60 },
  { locationId: 'bb_east_gate',   label: 'NORTH GATE',        x: 3150, y: 2100, w: 20, h: 10, height: 50 },
  { locationId: 'bb_border_west', label: 'BORDER CROSSING W', x: 375,  y: 2595, w: 20, h: 10, height: 40 },
  { locationId: 'bb_border_east', label: 'BORDER CROSSING E', x: 2250, y: 2595, w: 20, h: 10, height: 40 },
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
  { id:'implants', name:'ILLICIT IMPLANTS',  cityBuy:12000, citySell:6000,  wasteBuy:5000,  wasteSell:18000, vol:.18, illegal:true,  unit:'unit',  desc:'Banned by PABLO Decree #47. Mako Biotech still ships them south.' },
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
  // ── RESIDENTIAL ─────────────────────────────────────────────────────────────
  { id: 'minx_arms',    x: 1590, y: 1815, w: 110, h: 130, label: 'MINX ARMS',        bright: false, doors: mkDoorS(1590,1815,110,130) },
  { id: 'eastside_flat',x: 3450, y: 1995, w: 110, h: 120, label: 'EASTSIDE FLATS',   bright: false, doors: mkDoorS(3450,1995,110,120) },
  // ── MINX CITY WEST ──────────────────────────────────────────────────────────
  { id: 'pablo_store',  x: 555, y: 1890, w: 120, h: 70,  label: 'PABLO',            bright: true,  doors: mkDoorS(555,1890,120,70) },
  { id: 'pablo_tower',  x: 870, y: 1485, w: 260, h: 230, label: 'SHADOW TOWER',    bright: true,  doors: mkDoorS(870,1485,260,230) },
  { id: 'clinic',       x: 270, y: 1980, w: 100, h: 70,  label: 'DR. WRIGHT\'S',    bright: false, doors: mkDoorS(270,1980,100,70) },
  { id: 'megabank',     x: 615, y: 2055, w: 120, h: 80,  label: 'KONAMI BANK',      bright: false, doors: mkDoorS(615,2055,120,80) },
  { id: 'market',       x: 1080, y: 1965, w: 110, h: 70,  label: 'BLACK MARKET',     bright: false, doors: mkDoorS(1080,1965,110,70) },
  { id: 'hotel',        x: 1380, y: 1710, w: 100, h: 120, label: 'HOTEL FAMICOM',    bright: false, doors: mkDoorS(1380,1710,100,120), radio: true },
  { id: 'vend',         x: 1380, y: 1980, w: 60,  h: 60,  label: 'VEND-O-MATIC',    bright: true,  doors: mkDoorS(1380,1980,60,60) },
  { id: 'crystal',      x: 732, y: 2148, w: 28,  h: 28,  label: 'SAVE POINT',       bright: true,  doors: [] as Door[] },
  { id: 'arcade',       x: 225, y: 2310, w: 110, h: 75,  label: 'ARCADE \'87',      bright: true,  doors: mkDoorE(225,2310,110,75), radio: true },
  { id: 'bunker',       x: 450, y: 2475, w: 130, h: 80,  label: 'BUNKER-09',        bright: false, doors: mkDoorE(450,2475,130,80), radio: true },
  { id: 'scrap',        x: 870, y: 2505, w: 160, h: 70,  label: 'SCRAP YARD',       bright: false, doors: mkDoorN(870,2505,160) },
  { id: 'radio',        x: 1230, y: 2445, w: 100, h: 90,  label: 'PIRATE RADIO',     bright: false, doors: mkDoorW(1230,2445,100,90) },
  { id: 'wily_lab',     x: 1485, y: 2565, w: 90,  h: 70,  label: 'WILY LABS',        bright: false, doors: mkDoorW(1485,2565,90,70) },
  // ── MINX CITY EAST DISTRICT ─────────────────────────────────────────────────
  { id: 'dojo',         x: 2100, y: 1620, w: 120, h: 90, label: 'IRON DOJO',        bright: false, doors: mkDoorS(2100,1620,120,90) },
  { id: 'data_vault',   x: 2625, y: 1710, w: 130, h: 80, label: 'DATA VAULT',       bright: true,  doors: mkDoorS(2625,1710,130,80) },
  { id: 'nightclub',    x: 3150, y: 1890, w: 110, h: 90, label: 'CLUB NEON',        bright: true,  doors: mkDoorS(3150,1890,110,90), radio: true },
  { id: 'east_market',  x: 2100, y: 1995, w: 110, h: 70, label: 'EAST BAZAAR',      bright: false, doors: mkDoorS(2100,1995,110,70) },
  { id: 'east_clinic',  x: 2775, y: 2085, w: 110, h: 70, label: 'EAST CLINIC',      bright: false, doors: mkDoorS(2775,2085,110,70) },
  { id: 'armory',       x: 3600, y: 1680, w: 110, h: 80, label: 'ARMORY',           bright: false, doors: mkDoorS(3600,1680,110,80) },
  { id: 'crystal2',     x: 3900, y: 1935, w: 28,  h: 28, label: 'SAVE POINT',       bright: true,  doors: [] as Door[] },
  { id: 'print_shop',   x: 2400, y: 2310, w: 100, h: 60, label: 'PRINT SHOP',       bright: false, doors: mkDoorN(2400,2310,100) },
  { id: 'east_bunker',  x: 3150, y: 2340, w: 110, h: 75, label: 'EAST BUNKER',      bright: false, doors: mkDoorN(3150,2340,110) },
  { id: 'north_gate',   x: 4200, y: 2160, w: 90,  h: 60, label: 'NORTH GATE',       bright: false, doors: [...mkDoorN(4200,2160,90), ...mkDoorS(4200,2160,90,60)] },
  // ── HOSTELS / HOTELS / SHELTERS (city) ──────────────────────────────────────
  { id: 'hotel_midgar',  x: 150,  y: 1635, w: 120, h: 90,  label: 'HOTEL MIDGAR',     bright: true,  doors: mkDoorS(150,1635,120,90), radio: true },
  { id: 'inn_mother',    x: 1725, y: 2190, w: 100, h: 80,  label: 'MOTHER BASE INN',  bright: false, doors: mkDoorS(1725,2190,100,80), radio: true },
  { id: 'overlook',      x: 3375, y: 2325, w: 100, h: 85,  label: 'THE OVERLOOK',     bright: true,  doors: mkDoorN(3375,2325,100), radio: true },
  { id: 'safe_house',    x: 1635, y: 2400, w: 90,  h: 65,  label: 'SAFE HOUSE',        bright: true,  doors: mkDoorN(1635,2400,90), radio: true },
  // ── SUBWAY STATIONS (fast travel) ────────────────────────────────────────────
  { id: 'sub_west',      x: 420, y: 2235, w: 80,  h: 55,  label: 'METRO WEST',       bright: true,  doors: mkDoorS(420,2235,80,55) },
  { id: 'sub_central',   x: 1425, y: 2175, w: 80,  h: 55,  label: 'METRO CENTRAL',    bright: true,  doors: mkDoorS(1425,2175,80,55) },
  { id: 'sub_east',      x: 2700, y: 2235, w: 80,  h: 55,  label: 'METRO EAST',       bright: true,  doors: mkDoorS(2700,2235,80,55) },
  { id: 'sub_north',     x: 3600, y: 1665, w: 80,  h: 55,  label: 'METRO NORTH',      bright: true,  doors: mkDoorS(3600,1665,80,55) },
  // ── CHECKPOINTS (south city border — wasteland entry) ─────────────────────────
  { id: 'checkpoint_w',  x: 90,  y: 2693, w: 90,  h: 50,  label: 'CHECKPOINT W',     bright: false, doors: [...mkDoorW(90,2693,90,50), ...mkDoorE(90,2693,90,50)] },
  { id: 'checkpoint_c',  x: 1875, y: 2693, w: 90,  h: 50,  label: 'CHECKPOINT',       bright: false, doors: [...mkDoorW(1875,2693,90,50), ...mkDoorE(1875,2693,90,50)] },
  { id: 'checkpoint_e',  x: 3825, y: 2693, w: 90,  h: 50,  label: 'CHECKPOINT E',     bright: false, doors: [...mkDoorW(3825,2693,90,50), ...mkDoorE(3825,2693,90,50)] },
  // ── NORTH QUARTER ───────────────────────────────────────────────────────────
  { id: 'print_shop2',   x: 3750, y: 1575, w: 110, h: 70,  label: 'PRINT SHOP N',     bright: false, doors: mkDoorS(3750,1575,110,70) },
  { id: 'call_home',     x: 3975, y: 1800, w: 130, h: 80,  label: 'CALL HOME',        bright: true,  doors: mkDoorS(3975,1800,130,80) },
  { id: 'noodle_bar',    x: 4230, y: 1665, w: 100, h: 70,  label: 'NOODLE BAR',       bright: true,  doors: mkDoorS(4230,1665,100,70) },
  { id: 'pawn_shop',     x: 4230, y: 1950, w: 100, h: 70,  label: 'PAWN SHOP',        bright: false, doors: mkDoorW(4230,1950,100,70) },
  { id: 'crystal4',      x: 4050, y: 2070, w: 28,  h: 28,  label: 'SAVE POINT',       bright: true,  doors: [] as Door[] },
  { id: 'north_clinic',  x: 3930, y: 2160, w: 110, h: 70,  label: 'NORTH CLINIC',     bright: false, doors: mkDoorS(3930,2160,110,70) },
  { id: 'terminal_shop', x: 3720, y: 1935, w: 130, h: 80,  label: 'PABLO TERMINAL',   bright: true,  doors: mkDoorS(3720,1935,130,80) },
  { id: 'north_bunker',  x: 4500, y: 1725, w: 120, h: 80,  label: 'NORTH BUNKER',     bright: false, doors: mkDoorS(4500,1725,120,80), radio: true },
  { id: 'north_market',  x: 4575, y: 1995, w: 100, h: 70,  label: 'NORTH BAZAAR',     bright: false, doors: mkDoorW(4575,1995,100,70) },
  { id: 'crystal5',      x: 4500, y: 2145, w: 28,  h: 28,  label: 'SAVE POINT',       bright: true,  doors: [] as Door[] },
  // ── NORTH WASTELAND OUTPOSTS ─────────────────────────────────────────────────
  { id: 'outpost_alpha', x: 300,  y: 375,  w: 120, h: 80,  label: 'OUTPOST ALPHA',    bright: true,  doors: mkDoorS(300,375,120,80), radio: true },
  { id: 'prancing_pony', x: 450,  y: 360,  w: 110, h: 75,  label: 'THE PRANCING PONY',bright: true,  doors: mkDoorE(450,360,110,75), radio: true },
  { id: 'eastern_gate',  x: 4200, y: 375,  w: 100, h: 70,  label: 'EASTERN GATE',     bright: false, doors: [...mkDoorW(4200,375,100,70), ...mkDoorE(4200,375,100,70)] },
  // ── SOUTH WASTELAND OUTPOSTS ─────────────────────────────────────────────────
  { id: 'outpost_beta',  x: 2250, y: 2925, w: 100, h: 70,  label: 'OUTPOST BETA',     bright: true,  doors: mkDoorS(2250,2925,100,70), radio: true },
  { id: 'supply_cache',  x: 1200, y: 3450, w: 130, h: 80,  label: 'SUPPLY CACHE',     bright: false, doors: mkDoorN(1200,3450,130) },
  { id: 'deep_bunker',   x: 3600, y: 3225, w: 120, h: 80,  label: 'DEEP BUNKER',      bright: false, doors: mkDoorN(3600,3225,120), radio: true },
  { id: 'crystal3',      x: 1800, y: 3750, w: 28,  h: 28,  label: 'SAVE POINT',       bright: true,  doors: [] as Door[] },
  { id: 'zanarkand_inn', x: 1140, y: 2880, w: 120, h: 80,  label: 'ZANARKAND HOSTEL', bright: false, doors: mkDoorS(1140,2880,120,80), radio: true },
  { id: 'terminus',      x: 570,  y: 3150, w: 120, h: 80,  label: 'TERMINUS SHELTER', bright: false, doors: mkDoorE(570,3150,120,80), radio: true },
  { id: 'fort_dracula',  x: 3150, y: 3000, w: 100, h: 100, label: 'FORT DRACULA',     bright: true,  doors: mkDoorW(3150,3000,100,100), radio: true },
  { id: 'waste_exchange',x: 1170, y: 3000, w: 130, h: 80,  label: 'BLACK EXCHANGE',   bright: true,  doors: mkDoorN(1170,3000,130) },
  { id: 'deep_camp',     x: 3900, y: 2925, w: 120, h: 80,  label: 'DEEP CAMP',        bright: false, doors: mkDoorS(3900,2925,120,80), radio: true },
  { id: 'ruins_alpha',   x: 4350, y: 3150, w: 130, h: 90,  label: 'RUINS ALPHA',      bright: false, doors: [...mkDoorN(4350,3150,130), ...mkDoorS(4350,3150,130,90)] },
  { id: 'crystal6',      x: 4125, y: 3375, w: 28,  h: 28,  label: 'SAVE POINT',       bright: true,  doors: [] as Door[] },
  { id: 'southern_hub',  x: 2250, y: 3825, w: 130, h: 90,  label: 'SOUTHERN HUB',     bright: true,  doors: mkDoorN(2250,3825,130), radio: true },
  { id: 'crystal7',      x: 2475, y: 3900, w: 28,  h: 28,  label: 'SAVE POINT',       bright: true,  doors: [] as Door[] },
  // ── PUBLIC TERMINALS (payphones, kiosks, vans) ───────────────────────────────
  { id: 'term_west',      x: 240,  y: 2265, w: 18,  h: 24,  label: 'PAYPHONE',         bright: true,  doors: [] as Door[] },
  { id: 'term_central',   x: 1275, y: 2100, w: 18,  h: 24,  label: 'PUBLIC KIOSK',     bright: true,  doors: [] as Door[] },
  { id: 'term_east',      x: 2370, y: 2085, w: 18,  h: 24,  label: 'PAYPHONE',         bright: true,  doors: [] as Door[] },
  { id: 'term_neon',      x: 3075, y: 2190, w: 18,  h: 24,  label: 'PUBLIC KIOSK',     bright: true,  doors: [] as Door[] },
  { id: 'term_north',     x: 4380, y: 2100, w: 18,  h: 24,  label: 'PAYPHONE',         bright: true,  doors: [] as Door[] },
  { id: 'term_outpost_a', x: 510,  y: 435,  w: 18,  h: 24,  label: 'OUTPOST TERMINAL', bright: true,  doors: [] as Door[] },
  { id: 'term_outpost_b', x: 2430, y: 2985, w: 18,  h: 24,  label: 'OUTPOST TERMINAL', bright: true,  doors: [] as Door[] },
  { id: 'van_west',       x: 750,  y: 525,  w: 40,  h: 28,  label: 'TERMINAL VAN',     bright: true,  doors: [] as Door[] },
  { id: 'van_central',    x: 1800, y: 3075, w: 40,  h: 28,  label: 'TERMINAL VAN',     bright: true,  doors: [] as Door[] },
  { id: 'van_east',       x: 3450, y: 675,  w: 40,  h: 28,  label: 'TERMINAL VAN',     bright: true,  doors: [] as Door[] },
];

const RADIO_BUILDINGS = new Set(BUILDINGS.filter(b => 'radio' in b && b.radio).map(b => b.id));

// ── Gang territories (wasteland — north + south of city) ─────────────────────
const GANG_ZONES = [
  { id: 'minx_city',    name: 'MINX CITY',    x: 100,  y: 150,  w: 4600, h:3950, color: 'rgba(180,0,255,.03)', border: 'rgba(180,0,255,.12)',  threat: 'rgba(180,0,255,.55)', label: '[ MINX CITY TERRITORY — DOMINANT FACTION ]' },
  { id: 'iron_rats',    name: 'IRON RATS',    x: 150,  y: 150,  w: 1200, h:1225, color: 'rgba(255,60,60,.06)',  border: 'rgba(255,60,60,.22)',  threat: 'rgba(255,60,60,.7)',  label: '[ IRON RATS TERRITORY ]' },
  { id: 'void_dogs',    name: 'VOID DOGS',    x: 1300, y: 200,  w: 1400, h:1175, color: 'rgba(255,140,0,.06)', border: 'rgba(255,140,0,.22)',  threat: 'rgba(255,140,0,.7)',  label: '[ VOID DOGS TERRITORY ]' },
  { id: 'static_monks', name: 'STATIC MONKS', x: 150,  y: 2825, w: 2300, h:1225, color: 'rgba(200,255,0,.05)', border: 'rgba(200,255,0,.18)',  threat: 'rgba(200,255,0,.65)', label: '[ STATIC MONKS TERRITORY ]' },
  { id: 'eastern_bloc', name: 'EASTERN BLOC', x: 2400, y: 2825, w: 2300, h:1225, color: 'rgba(60,100,255,.05)',border: 'rgba(60,100,255,.20)', threat: 'rgba(60,100,255,.65)',label: '[ EASTERN BLOC TERRITORY ]' },
];

const NPCS = [
  // ── City West ──
  { name: 'STRIFE',    x: 765,  y: 1995, type: 'corp',    gender: 'm', whisper: 'I used to work for Shin-Ra. Before the rebrand. Before PABLO Corp. absorbed what was left. Same tower. Different logo.' },
  { name: 'BROKER',    x: 1140, y: 1905, type: 'corp',    gender: 'm', whisper: 'SENIOR PABLO controls every credit in Minx City. The ones you earn. The ones you owe. All of them. He calls it a service.' },
  { name: 'REPLOID-7', x: 1305, y: 1950, type: 'android', gender: 'm', whisper: 'Directive 44-C still active. Function: monitor and report. I was built by a man named Light. SENIOR PABLO bought the patent in \'89.' },
  { name: 'BELMONT',   x: 450,  y: 2115, type: 'human',   gender: 'm', whisper: 'Up up, down down, left right, left right. I tried the code on every door in Minx City. Only SENIOR PABLO\'s locks won\'t open.' },
  { name: 'GUARD',     x: 840,  y: 1875, type: 'corp',    gender: 'm', whisper: 'Floor 40 and above. Permanent restriction. Don\'t ask who gave the order. Don\'t ask who lives there. Last night I heard the helicopter. 3 AM. He was gone before I looked up. Off to one of the other towers — Sector Berlin, maybe. Or Neon Lagos. They never tell us which.' },
  { name: 'SAMUS',     x: 1230, y: 1860, type: 'android', gender: 'f', whisper: 'Bounty is active on someone called SENIOR PABLO. No face. No file. Contract pays in a currency I don\'t recognize. I\'m still deciding whether to take it.' },
  { name: 'SNAKE',     x: 990,  y: 2190, type: 'human',   gender: 'm', whisper: 'FOXHOUND was disbanded. That part\'s true. What nobody said was where we ended up. Or who we started working for.' },
  { name: 'MAEVE',     x: 525,  y: 1725, type: 'corp',    gender: 'f', whisper: 'I run six shell companies. Each one pays rent to a building owned by another shell company. Somewhere at the top of that chain is SENIOR PABLO. Always. He has towers in cities I can\'t even find on a map. I traced one payment to Neo-São Paulo. The next one routed through Old Shanghai. The helicopter never stops.' },
  { name: 'LINK',      x: 300,  y: 1755, type: 'human',   gender: 'm', whisper: 'I\'ve faced Ganon eight separate times. Each time reality reset. This feels different. No restart. No heart containers. Just the city.' },
  { name: 'JESSIE',    x: 1575, y: 2025, type: 'human',   gender: 'f', whisper: 'I build things and I blow things up. That\'s the whole skill set. In Minx City those turn out to be the same job.' },
  // ── City East ──
  { name: 'HIDEO',     x: 2280, y: 1725, type: 'corp',    gender: 'm', whisper: 'I designed thirty-seven games. Every one of them ended with a nuclear explosion. Someone told me recently SENIOR PABLO used three of them as operational blueprints.' },
  { name: 'WEDGE',     x: 2625, y: 1920, type: 'human',   gender: 'm', whisper: 'Me and Biggs were supposed to blow a reactor. Seems pointless now. The whole city is the reactor. SENIOR PABLO lit the fuse.' },
  { name: 'BIGGS',     x: 2850, y: 2070, type: 'human',   gender: 'm', whisper: 'Wedge says this is like Midgar. I think it\'s worse. Midgar had Aerith. This city only has the tower.' },
  { name: 'CURSOR',    x: 3300, y: 1785, type: 'android', gender: 'f', whisper: 'I was an input device. Then a process. Then a person. PABLO Corp. still classifies me as peripheral hardware for tax purposes.' },
  { name: 'LUCCA',     x: 3750, y: 1890, type: 'human',   gender: 'f', whisper: 'I built a time machine and it brought me here. Every calibration. Every correction. It keeps returning me to Minx City. I think the machine is trying to tell me something.' },
  { name: 'AERIS',     x: 3675, y: 2160, type: 'human',   gender: 'f', whisper: 'There were flowers here once. Real ones, growing up through the pavement. Someone paved over them. The work order had PABLO CORP. printed in the corner.' },
  { name: 'RINOA',     x: 4200, y: 1995, type: 'human',   gender: 'f', whisper: 'I came east looking for SeeD. Found a road that ended at a wall. The wall has a PABLO CORP. logo on it. Freshly painted.' },
  // ── City outskirts / border ──
  { name: 'CRONO',     x: 135,  y: 1950, type: 'human',   gender: 'm', whisper: 'Time travel didn\'t help. I came from three different pasts. All of them led here. To this city. To this wall. He\'s been here in every timeline.' },
  { name: 'FROG',      x: 135,  y: 2160, type: 'mutant',  gender: 'm', whisper: '"It matters not how strait the gate." Old text. Found it carved in the wall near the arcade. Someone knew I would find it.' },
  { name: 'RIZER',     x: 360,  y: 2460, type: 'human',   gender: 'm', whisper: 'Me and Lance ran through harder than this. Alien strongholds. Jungle wars. This city? Just a very bad city. Lance didn\'t make it past the wall.' },
  { name: 'TERRA',     x: 4425, y: 2400, type: 'mutant',  gender: 'f', whisper: 'Magic doesn\'t work near the tower. I\'ve tried. Something in the signal disrupts it. SENIOR PABLO knows exactly what magic is. He neutralised it on purpose.' },
  // ── City border / near-wasteland NPCs ──
  { name: 'KANEDA',    x: 870,  y: 2775, type: 'human',   gender: 'm', whisper: 'Neo-Tokyo burned in \'88. I watched it from the highway. SENIOR PABLO\'s lights were on that night. Already on. Always already on. He watched it burn and took notes.' },
  { name: 'TETSUO',    x: 1080, y: 2685, type: 'mutant',  gender: 'm', whisper: 'The signal from that tower is changing me. I can feel it. Neo-Tokyo fell because something woke up. I think SENIOR PABLO is what woke up.' },
  { name: 'DR. WILY',  x: 570,  y: 2685, type: 'human',   gender: 'm', whisper: 'My Robot Masters kept order in Minx City for six weeks. Then SENIOR PABLO bought the patents. Every. Single. One. He thanked me with a gift card.' },
  { name: 'SCAV',      x: 675,  y: 2670, type: 'human',   gender: 'm', whisper: 'Out here we don\'t say his name. Real bad luck. Old woman near the arcade told me: say SENIOR PABLO three times and a light goes on in the tower. I said it once by accident. I haven\'t slept since.' },
  // ── North Wasteland ──
  { name: 'ZERO',      x: 300,  y: 400,  type: 'android', gender: 'm', whisper: 'I was designed to destroy. Reprogrammed to protect. Doesn\'t matter out here. There\'s nothing left worth protecting. Except maybe the truth of who built this place.' },
  { name: 'PROTOMAN',  x: 1650, y: 350,  type: 'android', gender: 'm', whisper: 'My brother kept upgrading. I stayed the same. Out here that\'s called survival. In the city they call it obsolete. I prefer the wasteland.' },
  { name: 'AX',        x: 1440, y: 425,  type: 'human',   gender: 'm', whisper: 'I lost my axe three weeks ago in the void dogs sector. I\'ve been angry about it every single day since. That\'s just who I am.' },
  { name: 'ERDRICK',   x: 1230, y: 500,  type: 'human',   gender: 'm', whisper: 'The tablets say there was a hero before all this. Warrior of Light. Defeated the darkness. I\'ve been looking for the tomb for two years. I think SENIOR PABLO built the tower on it.' },
  { name: 'HAWK',      x: 1980, y: 400,  type: 'human',   gender: 'm', whisper: 'I was a knight once. Then I sailed as a pirate. The transformation felt complete. Out here in the wasteland I\'m something else again — haven\'t found the name for it yet. I carry a sword because it\'s the only consistent thing. The wasteland respects a consistent thing.' },
  { name: 'MOTOKO',    x: 2850, y: 500,  type: 'android', gender: 'f', whisper: 'Ghost. That\'s what they call consciousness without a body. SENIOR PABLO has fifty-two patents related to ghost extraction. I stopped being afraid of that three weeks ago.' },
  { name: 'FAYE',      x: 3150, y: 550,  type: 'human',   gender: 'f', whisper: 'I woke up with no memory and a debt I didn\'t remember making. Standard story. Same thing happened here in Minx City — debt certificates, all held by PABLO Corp. Standard practice, they said. I shot the account manager. They sent another one. I shot that one too. They stopped sending them after the fourth. I think they\'re restructuring.' },
  // ── South Wasteland ──
  { name: 'CASSANDRA', x: 975,  y: 2925, type: 'mutant',  gender: 'f', whisper: 'I warned them. Every single one of them. The city would collapse. The tower would consume everything. Nobody listened. Nobody ever listens. Now they stand in the wasteland and ask me what comes next. I stopped answering that question six months ago. The answer hasn\'t changed. They still won\'t believe it.' },
  { name: 'KIRA',      x: 2400, y: 2975, type: 'human',   gender: 'f', whisper: 'I found a notebook in the eastern ruins. Every page was a financial projection. The last page said: PHASE THREE. No date. No author. Just the tower logo.' },
  { name: 'REVY',      x: 3150, y: 3025, type: 'human',   gender: 'f', whisper: 'Hired to protect an outpost. Still here two years later. Nobody paid me. Nobody came to relieve me. I think this might just be my life now.' },
  { name: 'SAMWISE',   x: 780,  y: 3100, type: 'human',   gender: 'm', whisper: 'Mr. Frodo always said there was good in the world worth fighting for. I held onto that across Mordor, across the Dead Marshes. I got as far as Minx City wasteland and I started having doubts. Not about the good. About whether SENIOR PABLO is worse than Sauron. I think he might be. At least Sauron was honest about the Ring.' },
  { name: 'MUGEN',     x: 2625, y: 3125, type: 'human',   gender: 'm', whisper: 'I fight. That\'s it. Some scholar tried explaining that to me as a tragedy. I broke his nose. He seemed relieved. Out here in the wasteland the violence is clean — no paperwork, no patents, no PABLO CORP. licensing agreement on the combat. The city wanted me to sign a form. I walked.' },
  { name: 'TIDUS',     x: 1605, y: 3225, type: 'human',   gender: 'm', whisper: 'Zanarkand was a dream when I knew it. The real one was already dead a thousand years. The hostel uses the name like it means something. I stay here because maybe it does. Yuna would say: keep moving, keep smiling. I am thinking about both of those things.' },
  { name: 'YUNA',      x: 1425, y: 3325, type: 'human',   gender: 'f', whisper: 'Zanarkand was already a memory when I first saw it. This hostel is a grave marker pretending to be a building. I understand grave markers. My whole life has been grave markers. SENIOR PABLO poured the concrete over all of them and put a PABLO CORP. sign on top. I\'m still counting the graves.' },
  { name: 'VASH',      x: 3000, y: 3425, type: 'human',   gender: 'm', whisper: 'I\'ve caused sixty billion double dollars of damage and I feel terrible about every last cent of it. I came to Minx City to lay low. The wasteland does not allow laying low — I have been shot at eleven times since Thursday. SENIOR PABLO has a file on me. I have a file on SENIOR PABLO. His is longer.' },
  { name: 'CLEM',      x: 930,  y: 3725, type: 'human',   gender: 'f', whisper: 'I\'ve been surviving since I was eight. Walkers. Bandits. A group called Terminus that turned out to eat people. This wasteland is different from all of that. The danger here wears a suit and files paperwork and holds debt certificates. That is the hardest kind of threat to fight because everyone pretends it\'s normal.' },
  { name: 'ALUCARD',   x: 4365, y: 3525, type: 'android', gender: 'm', whisper: 'My father built his castle on suffering. Hundreds of years of lives spent as currency. I destroyed that legacy. It took everything I had and most of my human side. SENIOR PABLO built his tower the same way. I can see the architecture from here. I know exactly what it takes to bring it down. I am deciding whether I have it in me a second time.' },
  // ── City centre — new friendly contacts ──
  { name: 'RYOKO',     x: 930,  y: 2055, type: 'human',   gender: 'f', whisper: 'I keep a list. Every Minx City ordinance that exists only to route money to PABLO CORP. I am on page forty-seven of the list. I have not reached the end of page forty-seven.' },
  { name: 'DANTE',     x: 1095, y: 2115, type: 'human',   gender: 'm', whisper: 'I charge by the job. Demon slaying, debt collection, light reading. Minx City has all three. The debt collection work is morally complicated. SENIOR PABLO signs the collection orders himself.' },
  { name: 'ALYX',      x: 1425, y: 1875, type: 'human',   gender: 'f', whisper: 'My father built a resonance cascade. On accident, he always said. SENIOR PABLO holds the patent. On purpose, I always said. The tower hums at exactly the same frequency.' },
  { name: 'REI',       x: 1650, y: 2130, type: 'android', gender: 'f', whisper: 'I was told I had no memories before the city. I was told this was normal. I was told a lot of things. Most of them had PABLO CORP. letterhead at the top.' },
  { name: 'VIVI',      x: 2130, y: 1800, type: 'human',   gender: 'm', whisper: 'I am made of magic and I can\'t stop existing. In Minx City that qualifies you for three types of PABLO licensing. I have refused all three. They are very patient about it.' },
  { name: 'BARRET',    x: 1050, y: 2250, type: 'human',   gender: 'm', whisper: 'Everything in this city is powered by something that\'s being eaten alive underneath it. I know what that looks like. I\'ve seen the pipes. Somebody drew a mako reactor schematic on the back of a PABLO CORP. maintenance form. The pipes are identical.' },
  { name: 'NOCTIS',    x: 2325, y: 1995, type: 'human',   gender: 'm', whisper: 'My father\'s city burned the night I left it. I never went back. Minx City is the third city I have watched burn in slow motion. SENIOR PABLO files the insurance claims on every one of them.' },
  { name: 'RAMZA',     x: 2625, y: 2055, type: 'human',   gender: 'm', whisper: 'History is written by those who survive and own the publishing rights. PABLO Corp. owns the publishing rights. I have been trying to correct the historical record for three years. The book keeps getting filed under fiction.' },
  { name: 'CLOUD',     x: 600,  y: 2085, type: 'human',   gender: 'm', whisper: 'I used to work for SOLDIER. That\'s the part everybody asks about. Nobody asks what I did after SOLDIER. What I did was come here. Find another tower. And decide this time I wasn\'t going to lose.' },
  { name: 'KASUMI',    x: 2775, y: 1950, type: 'android', gender: 'f', whisper: 'I calculate probabilities. The probability that this city improves without external intervention is 0.0007. The probability that SENIOR PABLO vacates the tower voluntarily is 0.0000. I keep running the numbers. The numbers keep being the numbers.' },
  { name: 'PALOM',     x: 2475, y: 1845, type: 'human',   gender: 'm', whisper: 'My sister Porom and I were turned into stone to save the world. It worked once. We\'re back now. Minx City doesn\'t have a save-the-world option. It has a PABLO CORP. suggestion box. The suggestion box is locked.' },
  // ── Hotel Midgar staff & guests ──
  { name: 'TIFA',      x: 330,  y: 1673, type: 'human',   gender: 'f', whisper: 'I ran a bar called Seventh Heaven in Sector 7. Had regular customers. Had a name above the door. Then PABLO Corp. filed the demolition permit. I have the paperwork framed on the wall behind this counter because looking at it keeps me angry enough to keep going.' },
  { name: 'ISHMAEL',   x: 150,  y: 1808, type: 'human',   gender: 'm', whisper: 'Call me Ishmael. I followed an idea here the way some men follow whales — obsessively, across long distances, expecting revelation. SENIOR PABLO was at the end of the journey instead. He has the same quality as the whale. Enormous. Indifferent. And you can\'t kill him.' },
  { name: 'ATTICUS',   x: 270,  y: 2130, type: 'human',   gender: 'm', whisper: 'My father told me: you never really understand a person until you climb into their skin and walk around in it. I\'ve been trying to understand SENIOR PABLO that way. The problem is there doesn\'t appear to be a person inside. Just the tower. Just the apparatus. Just the machine with a name on it.' },
  // ── Mother Base Inn staff & guests ──
  { name: 'OTACON',    x: 2205, y: 2235, type: 'corp',    gender: 'm', whisper: 'I helped Solid Snake. Three times if you count Shadow Moses twice. My stealth camouflage patents were acquired by PABLO Corp. in \'94. I find this profoundly ironic given I use it daily to avoid their collection teams. The patent says "for entertainment and industrial use." I am the industrial use.' },
  { name: 'ICHIGO',    x: 2295, y: 1950, type: 'human',   gender: 'm', whisper: 'Soul Reapers don\'t choose their assignments. The assignments find them. Minx City found me three years ago. I\'ve been soul-reaping ever since. The hollow count in this city is extraordinary. Something is generating them. Something in the tower. Something called SENIOR PABLO.' },
  { name: 'RIPLEY',    x: 2025, y: 2460, type: 'human',   gender: 'f', whisper: 'I\'ve fought xenomorphs across three separate deep-space incidents. The xenomorph is relentless but it has a logic — it wants to survive and reproduce. SENIOR PABLO has no logic. He just accumulates. He just expands into every available space. That is somehow much harder to kill.' },
  // ── The Overlook staff & guests ──
  { name: 'JACK',      x: 4515, y: 2385, type: 'mutant',  gender: 'm', whisper: 'All work and no play makes Jack a dull boy. All work and no play makes Jack a dull boy. All work and no play. The hotel is fine. Completely fine. PABLO CORP. maintenance comes Tuesdays. They never quite leave on time. The hedge animals moved last night. I saw them. I saw them.' },
  { name: 'HOLDEN',    x: 4500, y: 2190, type: 'human',   gender: 'm', whisper: 'What kills me about Minx City is all the phonies. The whole city is a phony operation from bottom to top. SENIOR PABLO is the king of all phonies who ever lived and he runs the whole show. That\'s the part that really depresses me. The most phony person in existence is completely in charge. That\'s all.' },
  { name: 'TRAVIS',    x: 345,  y: 2363, type: 'human',   gender: 'm', whisper: 'All the animals come out at night. All of them. The city breeds them. Someday a real rain will wash the streets clean. I wait for that rain. SENIOR PABLO has seventeen meteorology patents. He schedules the rain. He always has.' },
  // ── Safe House 7 residents ──
  { name: 'SNAKE-P',   x: 4425, y: 2258, type: 'human',   gender: 'm', whisper: 'Snake. Just Snake. I\'ve been sent into locked-down cities three times now. New York. Los Angeles. Now Minx City. Same model every time: one man, total control, civilian population hostage. I get sent in. I get out. Nobody\'s told me yet what I\'m getting out with. That part worries me.' },
  { name: 'DRIZZT',    x: 4200, y: 2220, type: 'human',   gender: 'm', whisper: 'I was born into darkness and chose the light. That choice meant exile. In Minx City the choice is the same and means the same thing. The light belongs to PABLO CORP. Metered. Licensed. Charged by the lumen. I carry two scimitars. In this city that makes me a permit violation.' },
];
const NPC_COL: Record<string, string> = { corp: '#00cc33', human: '#009922', android: '#33ffaa', mutant: '#88ff44' };

type BehaviorState = 'SLEEPING' | 'WORKING' | 'CAMPING' | 'SOCIALIZING' | 'PATROLLING' | 'HOSTILE';
interface Threat { x: number; y: number; dx: number; dy: number; type: string; timer: number; hp: number; maxHp: number; ox: number; oy: number; behavior: BehaviorState; behaviorTimer: number; }
const FACTION_SCHEDULES: Record<string, Record<string, BehaviorState[]>> = {
  IRON_RATS:    { day: ['WORKING','PATROLLING','SOCIALIZING'], night: ['SLEEPING','CAMPING','PATROLLING'] },
  VOID_DOGS:    { day: ['SLEEPING','CAMPING'], night: ['PATROLLING','SOCIALIZING','WORKING'] },
  STATIC_MONKS: { day: ['WORKING','SOCIALIZING','PATROLLING'], night: ['CAMPING','SLEEPING'] },
  EASTERN_BLOC: { day: ['PATROLLING','WORKING','SOCIALIZING'], night: ['SLEEPING','CAMPING','PATROLLING'] },
  MINX_CITY:    { day: ['PATROLLING','WORKING','SOCIALIZING'], night: ['PATROLLING','CAMPING','SLEEPING'] },
  PROWLER:      { day: ['PATROLLING','PATROLLING','WORKING'], night: ['PATROLLING','PATROLLING','CAMPING'] },
  BORDER_GANG:  { day: ['PATROLLING','SOCIALIZING','WORKING'], night: ['CAMPING','SLEEPING','PATROLLING'] },
  MUTANT:       { day: ['PATROLLING','WORKING'], night: ['PATROLLING','CAMPING'] },
  RAIDER:       { day: ['PATROLLING','SOCIALIZING'], night: ['PATROLLING','CAMPING'] },
  SPY:          { day: ['PATROLLING','PATROLLING'], night: ['PATROLLING','PATROLLING'] },
};
function pickBehavior(type: string, worldHour: number): BehaviorState {
  const sched = FACTION_SCHEDULES[type];
  if (!sched) return 'PATROLLING';
  const isNight = worldHour < 6 || worldHour >= 22;
  const pool = isNight ? sched.night : sched.day;
  return pool[Math.floor(Math.random() * pool.length)];
}
interface WeaponDef { id: string; label: string; desc: string; atkBonus: number; color: string; type: 'melee' | 'ranged'; range: number; cooldown: number; icon: string; }
interface MerchantItem { id: string; name: string; desc: string; price: number; effect: string; }
interface Projectile { x: number; y: number; dx: number; dy: number; life: number; damage: number; type: string; }
interface BombEffect { x: number; y: number; timer: number; damage: number; radius: number; }
interface Floater { x: number; y: number; text: string; color: string; life: number; maxLife: number; }
interface GuardUnit { x: number; y: number; wpIdx: number; progress: number; huntTarget?: number; }
const THREAT_HP:  Record<string, number> = { IRON_RATS: 30, VOID_DOGS: 40, STATIC_MONKS: 50, MUTANT: 35, RAIDER: 45, PROWLER: 25, BORDER_GANG: 35, EASTERN_BLOC: 45, SPY: 20, PABLO_GUARD: 55, MINX_CITY: 80, VAGRANT: 10, STRAY_DOG: 8, SCAVENGER: 15 };
const THREAT_EXP: Record<string, number> = { IRON_RATS: 20, VOID_DOGS: 28, STATIC_MONKS: 35, MUTANT: 30, RAIDER: 40, PROWLER: 15, BORDER_GANG: 22, EASTERN_BLOC: 30, SPY: 60, PABLO_GUARD: 35, MINX_CITY: 55, VAGRANT: 5, STRAY_DOG: 3, SCAVENGER: 8 };
const BOUNTY:     Record<string, number> = { IRON_RATS: 1500, VOID_DOGS: 2000, STATIC_MONKS: 2500, MUTANT: 1800, RAIDER: 3000, PROWLER: 1000, BORDER_GANG: 1600, EASTERN_BLOC: 2200, SPY: 5000, PABLO_GUARD: 2800, MINX_CITY: 4500, VAGRANT: 0, STRAY_DOG: 0, SCAVENGER: 200 };
// Non-aggressive minor threats — just wander, don't attack
const PASSIVE_THREATS = new Set(['VAGRANT','STRAY_DOG','SCAVENGER']);
// Class base stats ─────────────────────────────────────────────────────────────
const CLASS_STATS: Record<string, { maxHp: number; atkBonus: number; wasteBonus: boolean }> = {
  replicant:  { maxHp: 500, atkBonus: 18, wasteBonus: false },
  outcast:    { maxHp: 460, atkBonus: 15, wasteBonus: true  },
  corporate:  { maxHp: 300, atkBonus: 4,  wasteBonus: false },
  contractor: { maxHp: 340, atkBonus: 7,  wasteBonus: false },
};
// Govt building IDs — spies can't enter these
const GOVT_BIDS = new Set(['megabank','armory','data_vault','pablo_tower','dojo']);
// Quick jobs — bid → { label, pay, seconds, cooldownFrames }
const QUICK_JOBS: Record<string, { label: string; pay: number; seconds: number; cooldownFrames: number }> = {
  scrap:      { label: 'HAUL SCRAP',   pay: 3500, seconds: 5, cooldownFrames: 1800 },
  print_shop: { label: 'PRINT RUN',    pay: 2500, seconds: 4, cooldownFrames: 1200 },
  radio:      { label: 'BROADCAST',    pay: 2000, seconds: 4, cooldownFrames: 900  },
  wily_lab:   { label: 'ASSEMBLE',     pay: 6000, seconds: 7, cooldownFrames: 2400 },
  market:     { label: 'STREET DEAL',  pay: 3000, seconds: 3, cooldownFrames: 900  },
};
type VendItem = { id: string; name: string; desc: string; price: number; owned?: boolean; consumable?: boolean; effect?: string };
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
  ]},
  { id: 'weapons', label: 'WEAPONS', col: '#ff4444', items: [
    { id: 'combat_knife',   name: 'COMBAT KNIFE',    desc: '+15% attack damage. Silent. Legal in 4 zones.',        price: 3000  },
    { id: 'stun_baton',     name: 'STUN BATON',      desc: 'Stuns targets on hit. Non-lethal compliance tool.',    price: 8500  },
    { id: 'compound_bow',   name: 'COMPOUND BOW',    desc: '+25% dmg. Extended range. Quiet operation.',           price: 15000 },
    { id: 'plasma_pistol',  name: 'PLASMA PISTOL',   desc: '+40% attack damage. PABLO CORP. restricted.',          price: 22000 },
  ]},
  { id: 'vehicles', label: 'VEHICLES', col: '#ffcc00', items: [
    { id: 'cargo_bike',      name: 'CARGO BIKE',      desc: '+20% speed, +5 cargo slots. Single-speed chainless.', price: 28000  },
    { id: 'hover_scooter',   name: 'HOVER SCOOTER',   desc: '+30% movement speed. Mag-lev. No fuel.',              price: 45000  },
    { id: 'armored_moped',   name: 'ARMORED MOPED',   desc: '+50% speed, 15% damage resistance.',                  price: 120000 },
  ]},
  { id: 'furniture', label: 'FURNITURE', col: '#88ff44', items: [
    { id: 'futon',          name: 'FUTON',            desc: 'Save & rest from any owned property.',                price: 5000  },
    { id: 'neon_sign',      name: 'NEON SIGN',        desc: '+10% passive income. Visible from two blocks.',       price: 8000  },
    { id: 'security_cam',   name: 'SECURITY CAM',     desc: 'Alerts you when threats approach your location.',     price: 12000 },
    { id: 'workstation_furn',name:'WORKSTATION',       desc: 'Personal terminal. Earn ƒ500 per job cycle.',         price: 18000 },
  ]},
  { id: 'realestate', label: 'REAL ESTATE', col: '#cc44ff', items: [
    { id: 'wasteland_lot',   name: 'WASTELAND LOT',    desc: '+ƒ2,000 passive income per cycle.',                  price: 75000  },
    { id: 'minx_studio',     name: 'MINX CITY STUDIO', desc: '+ƒ5,000 passive income per cycle.',                  price: 180000 },
    { id: 'corpo_office',    name: 'CORPORATE OFFICE', desc: '+ƒ15,000 passive income per cycle.',                 price: 500000 },
  ]},
  { id: 'pro', label: 'PRO UPGRADE', col: '#ff9900', items: [
    { id: 'salaryman_pro', name: 'SALARYMAN PRO', desc: 'Full AI productivity suite. Unlimited AI access, priority servers, exclusive gear drops, Pro badge. $29/mo.', price: 0 },
  ]},
];
const REAL_ESTATE_INCOME: Record<string, number> = { wasteland_lot: 2000, minx_studio: 5000, corpo_office: 15000 };
const VEHICLE_SPEED: Record<string, number> = { cargo_bike: 1.3, hover_scooter: 1.45, armored_moped: 1.7 };
const WEAPON_TIER: Record<string, number> = { combat_knife: 1, stun_baton: 2, compound_bow: 3, plasma_pistol: 4 };

// Pablo Corp android guard patrol waypoints inside city
const GUARD_ROUTES: { x: number; y: number }[][] = [
  [{ x:750,y:1875 },{ x:1050,y:1875 },{ x:1050,y:2175 },{ x:750,y:2175 }],
  [{ x:1350,y:1725 },{ x:1650,y:1725 },{ x:1650,y:2100 },{ x:1350,y:2100 }],
  [{ x:1950,y:1650 },{ x:2400,y:1650 },{ x:2400,y:2025 },{ x:1950,y:2025 }],
  [{ x:2550,y:1800 },{ x:2925,y:1800 },{ x:2925,y:2175 },{ x:2550,y:2175 }],
  [{ x:300,y:1725 },{ x:600,y:1725 },{ x:600,y:2100 },{ x:300,y:2100 }],
  [{ x:3150,y:1725 },{ x:3525,y:1725 },{ x:3525,y:2100 },{ x:3150,y:2100 }],
  [{ x:3750,y:1650 },{ x:4200,y:1650 },{ x:4200,y:2025 },{ x:3750,y:2025 }],
  [{ x:975,y:2550 },{ x:1500,y:2550 },{ x:1500,y:2730 },{ x:975,y:2730 }],
  [{ x:1950,y:2565 },{ x:2550,y:2565 },{ x:2550,y:2730 },{ x:1950,y:2730 }],
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
  mkThreat(105, 2610, 'PROWLER'), mkThreat(300, 2640, 'PROWLER'),
  mkThreat(3375, 2610, 'PROWLER'), mkThreat(3525, 2648, 'PROWLER'),
  mkThreat(900, 2588, 'PROWLER'), mkThreat(1650, 2595, 'PROWLER'),
  mkThreat(2400, 2588, 'PROWLER'), mkThreat(3000, 2610, 'PROWLER'),
  // ── South city border gang line ──
  mkThreat(570, 2655, 'BORDER_GANG'), mkThreat(1080, 2670, 'BORDER_GANG'),
  mkThreat(1500, 2655, 'BORDER_GANG'), mkThreat(1950, 2678, 'BORDER_GANG'),
  mkThreat(2550, 2655, 'BORDER_GANG'), mkThreat(3150, 2670, 'BORDER_GANG'),
  // ── North Wasteland — IRON RATS (north-west) ──
  mkThreat(240, 350, 'IRON_RATS'), mkThreat(525, 525, 'IRON_RATS'),
  mkThreat(750, 750, 'IRON_RATS'), mkThreat(300, 950, 'IRON_RATS'),
  mkThreat(675, 1100, 'IRON_RATS'), mkThreat(1020, 800, 'IRON_RATS'),
  mkThreat(450, 1200, 'IRON_RATS'),
  // ── North Wasteland — VOID DOGS (north-centre) ──
  mkThreat(1350, 350, 'VOID_DOGS'), mkThreat(1575, 550, 'VOID_DOGS'),
  mkThreat(1425, 850, 'VOID_DOGS'), mkThreat(1800, 1050, 'VOID_DOGS'),
  mkThreat(1575, 300, 'VOID_DOGS'), mkThreat(1950, 750, 'VOID_DOGS'),
  mkThreat(1275, 1150, 'VOID_DOGS'),
  // ── South Wasteland — STATIC MONKS (south-west) ──
  mkThreat(2325, 2875, 'STATIC_MONKS'), mkThreat(2625, 3050, 'STATIC_MONKS'),
  mkThreat(2400, 3200, 'STATIC_MONKS'), mkThreat(2850, 3400, 'STATIC_MONKS'),
  mkThreat(2325, 3550, 'STATIC_MONKS'), mkThreat(3000, 2975, 'STATIC_MONKS'),
  mkThreat(2550, 3650, 'STATIC_MONKS'),
  // ── South Wasteland — EASTERN BLOC (south-east) ──
  mkThreat(3450, 2925, 'EASTERN_BLOC'), mkThreat(3825, 3100, 'EASTERN_BLOC'),
  mkThreat(3600, 3275, 'EASTERN_BLOC'), mkThreat(4125, 3175, 'EASTERN_BLOC'),
  mkThreat(3525, 3500, 'EASTERN_BLOC'), mkThreat(4350, 3050, 'EASTERN_BLOC'),
  mkThreat(3900, 3750, 'EASTERN_BLOC'),
  // ── MINX CITY faction — split north + south wasteland ──
  mkThreat(150, 300, 'MINX_CITY'), mkThreat(600, 400, 'MINX_CITY'),
  mkThreat(1125, 550, 'MINX_CITY'), mkThreat(1575, 475, 'MINX_CITY'),
  mkThreat(2025, 300, 'MINX_CITY'), mkThreat(2475, 550, 'MINX_CITY'),
  mkThreat(3000, 400, 'MINX_CITY'), mkThreat(3600, 550, 'MINX_CITY'),
  mkThreat(4050, 300, 'MINX_CITY'), mkThreat(4500, 475, 'MINX_CITY'),
  mkThreat(450, 2925, 'MINX_CITY'), mkThreat(1200, 3100, 'MINX_CITY'),
  mkThreat(1800, 2975, 'MINX_CITY'), mkThreat(2550, 3300, 'MINX_CITY'),
  mkThreat(3300, 3100, 'MINX_CITY'), mkThreat(4200, 2975, 'MINX_CITY'),
  // ── Deep south wasteland wanderers ──
  mkThreat(900, 3625, 'MUTANT'), mkThreat(1650, 3775, 'MUTANT'),
  mkThreat(2400, 3700, 'MUTANT'), mkThreat(3300, 3875, 'MUTANT'),
  mkThreat(1200, 3850, 'RAIDER'), mkThreat(2250, 3950, 'RAIDER'),
  mkThreat(3750, 3950, 'RAIDER'), mkThreat(4500, 3775, 'RAIDER'),
  // ── SPY infiltrators — disguised, can enter city (rare) ──
  mkThreat(600, 2250, 'SPY'), mkThreat(1800, 2025, 'SPY'), mkThreat(2850, 2325, 'SPY'),
  mkThreat(4050, 1950, 'SPY'),
  // ── Passive minor wanderers (non-aggressive, Oregon Trail flavour) ──
  mkThreat(525, 2070, 'VAGRANT'), mkThreat(930, 2385, 'VAGRANT'), mkThreat(1650, 2295, 'VAGRANT'),
  mkThreat(2250, 1950, 'VAGRANT'), mkThreat(3000, 2100, 'VAGRANT'), mkThreat(3900, 2025, 'VAGRANT'),
  mkThreat(420, 2475, 'STRAY_DOG'), mkThreat(1125, 2445, 'STRAY_DOG'), mkThreat(2025, 2415, 'STRAY_DOG'),
  mkThreat(2925, 2325, 'STRAY_DOG'), mkThreat(3450, 2475, 'STRAY_DOG'),
  mkThreat(750, 3425, 'SCAVENGER'), mkThreat(1650, 3575, 'SCAVENGER'), mkThreat(2550, 3500, 'SCAVENGER'),
  mkThreat(3600, 3300, 'SCAVENGER'), mkThreat(4350, 3150, 'SCAVENGER'),
];

// ── EXP / Level table ─────────────────────────────────────────────────────────
const EXP_TABLE = [100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000];
const expToLevel = (lvl: number) => EXP_TABLE[Math.min(lvl - 1, EXP_TABLE.length - 1)];
const THREAT_COL: Record<string, string> = {
  IRON_RATS: '#ff4444', VOID_DOGS: '#ff8800', STATIC_MONKS: '#aaff22',
  MUTANT: '#88ff44', RAIDER: '#ff66ff', GANG: '#ff4444',
  PROWLER: '#ff2266', BORDER_GANG: '#ff6600', EASTERN_BLOC: '#4488ff',
  SPY: '#ffffaa', PABLO_GUARD: '#5599ff', MINX_CITY: '#cc44ff',
  VAGRANT: '#887766', STRAY_DOG: '#aa8855', SCAVENGER: '#99aa66',
};

const NPC_RANGE = 60;
const DOG_MAX_HP = 200;
const DOG_ATK = 13;
const DOG_SPEED = 1.65;
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
  "Other dogs joined gangs. Void Dogs. I chose you instead. Better odds.",
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
const KONAMI_SEQ = ['arrowup','arrowup','arrowdown','arrowdown','arrowleft','arrowright','arrowleft','arrowright','b','a'];

const STORE_LINES = [
  '> PABLO — AUTHORIZED DEVICE OUTLET · MINX CITY · PST',
  '> Minx City belongs to him. The wasteland is for those who forgot that.',
  '> PABLO devices keep you on the network. Like a second quest — but this time the dungeon is real.',
  '> There\'s a rumor: the original PABLO device firmware contains an old game. Unplayable now. SENIOR PABLO was never beaten.',
  '> Press ACTIVATE to register your device.',
];

const TOWER_LINES = [
  '> SHADOW TOWER — 62 FLOORS. MINX CITY DESIGNATION: BLOCK ZERO.',
  '> Every road in Minx City was built to point here. Same as Neo-Tokyo. Same as Midgar. Same as every city that ever fell.',
  '> Floors 1-39: commercial rentals. Floors 40+: permanently restricted by order of SENIOR PABLO.',
  '> You look up. The penthouse glass is dark. A silhouette shifts. Slowly. He knows you\'re here.',
  '> BELMONT was outside this building for three days. Said he felt something. Left without explaining.',
  '> SENIOR PABLO. Villain of Minx City. Hero of the rich. Nobody has ever met him face to face and told the story.',
];

const OFFICE_TIERS = [
  { label: 'HOT DESK',       price: 50,   desc: 'Open floor. Shared terminal.' },
  { label: 'PRIVATE OFFICE', price: 200,  desc: 'Single room. Lock code.' },
  { label: 'TEAM SUITE',     price: 500,  desc: '4 desks. Secure entry.' },
  { label: 'EXEC FLOOR',     price: 1500, desc: 'Full suite. AI concierge.' },
];

// ── Building floor directories ────────────────────────────────────────────────
interface BFloor { floor: number; name: string; desc: string; }
interface BDirectory { label: string; history: string; floors: BFloor[]; }
const BUILDING_FLOORS: Record<string, BDirectory> = {
  minx_arms: {
    label: 'MINX ARMS', history: 'Built 1984 under the old city housing charter. PABLO CORP. acquired the deed in \'91 — residents grandfathered. Nobody has been evicted. Yet. The intercom still uses the original buzzers.',
    floors: [
      { floor: 1, name: 'LOBBY',           desc: 'Buzzing fluorescents. Name cards in the original slots. The super\'s office is behind frosted glass. Nobody has seen the super in three weeks.' },
      { floor: 2, name: 'UNITS 201–208',   desc: 'Lower floor. Long-term residents. Unit 203 has been vacant since \'89 — still listed under someone named TRAVIS. The mail still comes.' },
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
      { floor: 2, name: 'UNITS 201–212',   desc: 'Mostly occupied. Unit 207 belongs to someone who works night shifts and is never seen. The name on the box: L. KIRA.' },
      { floor: 3, name: 'UNITS 301–312',   desc: 'PABLO CORP. owned units. Unfurnished. Clean. A realtor shows them every Thursday to nobody.' },
      { floor: 4, name: 'UNITS 401–412',   desc: 'Community notice board. Someone wrote: "SENIOR PABLO IS IN FLOOR 62. DO NOT LOOK UP." The note has been laminated.' },
      { floor: 5, name: 'GYM / AMENITIES', desc: 'Functional. Towels provided. One locker has been locked since \'90. The gym log shows it was last used by someone named PROTO.' },
      { floor: 6, name: 'ROOF GARDEN',     desc: 'Someone is growing vegetables up here without permission. The vegetables are thriving. Nobody has the heart to stop them.' },
    ],
  },
  hotel: {
    label: 'HOTEL FAMICOM', history: 'Originally THE PACIFIC, renamed \'86 after someone installed a working NES in every room. The cartridges are still there. The TVs still show 1987 channels.',
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
      { floor: 40, name: '── RESTRICTED ──',  desc: 'Access card required. The elevator skips this floor unless you hold a Level-7 credential. Nobody in the city holds Level-7.' },
      { floor: 50, name: '── RESTRICTED ──',  desc: 'Unknown. Floor plans don\'t exist. The windows are opaque from outside. The glass is black on all sides.' },
      { floor: 62, name: 'PENTHOUSE — PABLO', desc: 'Nobody has been here and returned to describe it. The silhouette in the window has been there for a very long time.' },
    ],
  },
  data_vault: {
    label: 'DATA VAULT', history: 'Former municipal records archive. PABLO CORP. acquisition 1990. The city\'s records are still inside. So is everything else they collected since.',
    floors: [
      { floor: 1, name: 'PUBLIC TERMINALS',   desc: 'Property records. Most transferred to PABLO CORP. The transfer dates are all the same: a Tuesday in \'91.' },
      { floor: 2, name: 'ARCHIVE-A COLD',     desc: 'Financial records from the pre-collapse era. Some redacted. Some redacted poorly — the names show through the black bar.' },
      { floor: 3, name: 'ACTIVE SERVERS',     desc: 'Real-time feeds. City traffic. Power grid. Population movement. All of it. The cameras cover every road.' },
      { floor: 4, name: 'VAULT-B RESTRICTED', desc: 'Level-5 clearance. BELMONT tried once. The lock said no. He said it felt smug about it.' },
      { floor: 5, name: 'NETWORK HUB',        desc: 'Every signal in Minx City passes through here. The routing logs go back thirty years. Every packet. Every call.' },
      { floor: 6, name: 'PENTHOUSE SERVER',   desc: 'One server. Running since 1984. Power draw is enormous. Nobody knows what it runs. Nobody has been asked.' },
    ],
  },
  nightclub: {
    label: 'CLUB NEON', history: 'Three names since 1982. Current owners say the building chose its own identity. The lights have not been fully off since 1988. The original electrical panel was replaced in \'91. Nobody kept the receipt.',
    floors: [
      { floor: 1, name: 'MAIN FLOOR',      desc: 'The floor moves slightly. Engineers said: structural flex. The regulars say: it dances back.' },
      { floor: 2, name: 'VIP SECTION',     desc: 'One booth booked every Friday for four years under TETSUO. He has never shown up. The booth is always full anyway.' },
      { floor: 3, name: 'DJ BOOTH / BROADCAST', desc: 'Doubles as pirate signal tower on Thursdays. The frequency bleeds into the SHADOW TOWER antenna. Intentionally.' },
      { floor: 4, name: 'ROOF TERRACE',    desc: 'Open air. Floor 62 is visible. Some nights it is lit. Most nights it is not. The bartender says it is random. The regulars say it is not.' },
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

// ── Police patrol waypoints ───────────────────────────────────────────────────
const POLICE_ROUTES: { x: number; y: number }[][] = [
  [{ x:480,y:1710 },{ x:1050,y:1710 },{ x:1050,y:2115 },{ x:480,y:2115 }],
  [{ x:1650,y:1710 },{ x:2250,y:1710 },{ x:2250,y:2115 },{ x:1650,y:2115 }],
  [{ x:300,y:2535 },{ x:1050,y:2535 },{ x:1050,y:2115 },{ x:300,y:2115 }],
  [{ x:2700,y:1710 },{ x:3750,y:1710 },{ x:3750,y:2115 },{ x:2700,y:2115 }],
];

// ── Ambient city event lines ──────────────────────────────────────────────────
const AMBIENCE_LINES = [
  '> DISPATCH — Unit 7: patrol complete, no incidents. City center secure.',
  '> CITY BROADCAST: Power grid maintenance window 02:00–04:00 PST. Sector 3 may experience interruptions.',
  '> PIRATE FREQUENCY: "…the code is in the walls. It was always in the walls…"',
  '> MARKET ALERT: Black Market running extended hours. Unusual activity near Scrap Yard.',
  '> FIRE DEPT DISPATCH: Structure fire contained. Cause logged: electrical fault. Sector 2.',
  '> CITIZEN ALERT: Suspicious figures near SHADOW TOWER north entrance. Third report this week.',
  '> CITY CENSUS UPDATE: Registered population 14,203. Unregistered: unknown. PABLO CORP. data-reconciliation in progress.',
  '> DISPATCH — Unit 12 requesting backup at wasteland boundary. Standing by.',
  '> EMERGENCY ALERT: Power anomaly detected Sector 3. Grid crews en route. ETA: unknown.',
  '> PIRATE FREQUENCY: "…SENIOR PABLO watches from Floor 62. He has always been there. He was there before the building…"',
  '> FIRE DEPT DISPATCH: Unit 4 responding to report. All hands.',
  '> BROADCAST: Road maintenance on North Avenue overnight. Expect minor delays.',
  '> POLICE DISPATCH: Pursuit terminated at Wasteland border. Subjects entered IRON RATS territory. Pursuit abandoned per protocol.',
  '> CITY BROADCAST: Water pressure reduced in east district. Emergency crews on site. PABLO CORP. infrastructure division responding.',
];

interface Char {
  name: string; class: string; company: string; sx: number; sy: number; salary: number;
  hasBusiness?: boolean;
  workstation?: string | null;
  workstationLabel?: string | null;
  workstationSlot?: string | null;
  bizRegisteredAt?: number | null;
}
interface Peer { id: string; name: string; class: string; x: number; y: number; speaking: boolean; }
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
  clinic: 10000, east_clinic: 8000, north_clinic: 8000,
  hotel_midgar: 15000, inn_mother: 6000, overlook: 8000,
  prancing_pony: 4000, zanarkand_inn: 0, terminus: 0, fort_dracula: 0,
  call_home: 5000, noodle_bar: 1200,
  terminal_shop: 12000, print_shop2: 12000,
};
const BUILDING_COST_LABEL: Record<string, string> = {
  clinic: 'ƒ10K', east_clinic: 'ƒ8K', north_clinic: 'ƒ8K',
  hotel_midgar: 'ƒ15K', inn_mother: 'ƒ6K', overlook: 'ƒ8K',
  prancing_pony: 'ƒ4K', zanarkand_inn: 'FREE', terminus: 'FREE', fort_dracula: 'FREE',
  call_home: 'ƒ5K', noodle_bar: 'ƒ1.2K',
  terminal_shop: 'ƒ12K', print_shop2: 'ƒ12K',
  crystal: 'FREE', crystal2: 'FREE', crystal3: 'FREE', crystal4: 'FREE',
  crystal5: 'FREE', crystal6: 'FREE', crystal7: 'FREE',
  arcade: 'FREE', hotel: 'FREE', vend: 'SHOP',
  pablo_store: 'SHOP', pablo_tower: 'FREE',
  north_bunker: 'FREE', outpost_alpha: 'FREE', outpost_beta: 'FREE',
  term_west: 'FREE', term_central: 'FREE', term_east: 'FREE', term_neon: 'FREE', term_north: 'FREE',
  term_outpost_a: 'FREE', term_outpost_b: 'FREE',
  van_west: 'FREE', van_central: 'FREE', van_east: 'FREE',
};

const IS_PUBLIC_TERMINAL = (id: string) => id.startsWith('term_') || id.startsWith('van_');
const IS_VAN = (id: string) => id.startsWith('van_');

// ── WorldPlay ─────────────────────────────────────────────────────────────────
export default function WorldPlay() {
  const [, navigate] = useLocation();
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
  const zoomRef       = useRef(1);

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
    hasDevice: _ss?.hasDevice ?? (char.class.toLowerCase() === 'corporate'),
    deviceBroken: _ss?.deviceBroken ?? false,
    deviceDurability: _ss?.deviceDurability ?? 100,
    atPublicTerminal: false,
    invincible: 0, flash: 0,
    threats: THREATS_INIT.map(t => ({ ...t })),
    near: null as string | null,
    nearNpc: null as number | null,
    nearBillboard: null as string | null,
    gangZone: null as string | null,
    hunger: _ss?.hunger ?? 100, thirst: _ss?.thirst ?? 100, energy: _ss?.energy ?? 100,
    survivalTick: 0,
    incomeTick: 0,
    interestTick: 0,
    savings: _ss?.savings ?? 0,
    loan: _ss?.loan ?? null as null | { amount: number; interest: number; issuedAt: number; dueAt: number },
    exp: _ss?.exp ?? 0, level: _ss?.level ?? 1, maxHp: _ss?.maxHp ?? 100,
    poisoned: _ss?.poisoned ?? false, poisonTick: 0,
    attackCooldown: 0,
    attackFlash: 0,
    threatRespawn: [] as { ox:number; oy:number; type:string; at:number }[],
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
    zone: (char.sy < CITY_TOP || char.sy > CITY_BOTTOM) ? 'WASTELAND' : 'MINX CITY',
    powerLevel: 100,
    powerTick: 0,
    powerEventFrames: 0,
    ambTick: 0,
    fireTick: 0,
    fires: [] as FireEvent[],
    police: POLICE_ROUTES.map((r, i) => ({
      x: r[0].x, y: r[0].y, routeIdx: i, wpIdx: 0, progress: (i * 0.3) % 1,
    } as PoliceUnit)),
    passport: _ss?.passport ?? false,
    oregonTick: 0,
    worldTime: _ss?.worldTime ?? 8,
    worldTimeTick: 0,
    walkFrame: 0,
    guardCooldowns: [] as number[],
    policeCooldowns: [] as number[],
    ownedItems: new Set<string>(Array.isArray(_ss?.ownedItems) ? _ss.ownedItems : []),
    fogRevealed: new Set<string>(),
    projectiles: [] as Projectile[],
    bombs: [] as BombEffect[],
    vehicle: (_ss?.vehicle ?? null) as null | string,
    weaponTier: _ss?.weaponTier ?? 0,
    terminalDiscount: _ss?.terminalDiscount ?? false,
    realEstateIncomeTick: 0,
    realEstate: Array.isArray(_ss?.realEstate) ? [..._ss.realEstate] : [] as string[],
    dogCompanion: {
      active: false, name: '', hp: DOG_MAX_HP, maxHp: DOG_MAX_HP,
      x: 0, y: 0, injured: false,
      dialogueCooldown: 0, attackCooldown: 0,
      lastZone: '',
    },
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
  const [zone,    setZone]    = useState((char.sy < CITY_TOP || char.sy > CITY_BOTTOM) ? 'WASTELAND' : 'MINX CITY');
  const [near,     setNear]    = useState<string | null>(null);
  const [nearNpc,  setNearNpc] = useState<number | null>(null);
  const [narration, setNarr]  = useState(() => {
    if (char?.hasBusiness && char.workstationLabel) {
      const daysLeft = char.bizRegisteredAt
        ? Math.max(0, 7 - Math.floor((Date.now() - char.bizRegisteredAt) / 86400000))
        : 7;
      return `> Welcome back, ${char.name}. Your desk is at ${char.workstationLabel.toUpperCase()} — ${char.workstationSlot ?? 'assigned slot'}. ${daysLeft > 0 ? `${daysLeft} free-rest day${daysLeft !== 1 ? 's' : ''} remaining.` : 'Rent is now ƒ500/rest.'} WASD move · [E] interact · [Space] melee · [Click] shoot · [M] map.`;
    }
    if (char?.hasBusiness === false) {
      return '> You enter Minx City as a drifter. No address. No record. Progress will NOT be saved. WASD move · [E] interact · [Space] melee · [Click] shoot · [M] map · [P] PABLO device.';
    }
    return '> Welcome to Minx City · PST. WASD move · [E] interact · [Space] melee · [Click] shoot · [M] map · [P] PABLO device. City is safe from major gangs. PABLO guards patrol. Spies lurk in disguise.';
  });
  const [online,  setOnline]  = useState<Peer[]>([]);
  const [hasDevice, setHasDevice] = useState(_ss?.hasDevice ?? (char.class.toLowerCase() === 'corporate'));
  const [deviceBroken, setDeviceBroken] = useState(_ss?.deviceBroken ?? false);
  const [atPublicTerminal, setAtPublicTerminal] = useState(false);
  const [voice,   setVoice]   = useState(false);
  const [speaking,setSpeaking]= useState(false);
  const [muted,   setMuted]   = useState(false);
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
  const [pabloTab, setPabloTab] = useState<'city'|'chat'>('city');
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
  const [activeWeapon, setActiveWeapon] = useState('FISTS');
  const activeWeaponRef = useRef('FISTS');
  const [showTopMenu, setShowTopMenu] = useState(false);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const fogGridRef = useRef<Set<string>>(new Set());
  const [unlockedWeapons, setUnlockedWeapons] = useState<Set<string>>(() => new Set(['FISTS']));
  const unlockedWeaponsRef = useRef<Set<string>>(new Set(['FISTS']));
  const [showMerchant, setShowMerchant] = useState<{ name: string; items: MerchantItem[] } | null>(null);
  const WEAPONS: WeaponDef[] = [
    { id: 'FISTS', label: 'FISTS', desc: 'Bare knuckles. Melee only.', atkBonus: 0, color: '#00ff41', type: 'melee', range: 72, cooldown: 35, icon: 'fists' },
    { id: 'SWORD', label: 'SWORD', desc: 'Close-range slash. +6 ATK.', atkBonus: 6, color: '#ff6644', type: 'melee', range: 85, cooldown: 30, icon: 'sword' },
    { id: 'GUN', label: 'GUN', desc: 'Mid-range projectile. +8 ATK.', atkBonus: 8, color: '#88aaff', type: 'ranged', range: 200, cooldown: 25, icon: 'gun' },
    { id: 'LASER', label: 'LASER', desc: 'Long beam weapon. +10 ATK.', atkBonus: 10, color: '#ff44aa', type: 'ranged', range: 300, cooldown: 40, icon: 'laser' },
    { id: 'BOMB', label: 'BOMB', desc: 'Area explosion with delay. +12 ATK.', atkBonus: 12, color: '#ffcc00', type: 'ranged', range: 150, cooldown: 60, icon: 'bomb' },
  ];
  // Map + job panels
  const [showMap,     setShowMap]     = useState(false);
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

  const doSave = useCallback((data: object) => {
    const g = gs.current;
    const dogSave = g.dogCompanion.active ? { dogCompanion: { active: true, name: g.dogCompanion.name, hp: g.dogCompanion.hp, maxHp: g.dogCompanion.maxHp, injured: g.dogCompanion.injured } } : {};
    localStorage.setItem('sm_save', JSON.stringify({ ...data, ...dogSave }));
    const slot = parseInt(localStorage.getItem('sm_slot') ?? '0', 10);
    const savePayload = {
      charName: char.name,
      charClass: char.class,
      level: g.level,
      salary: g.salary,
      lastZone: (g.py < CITY_TOP || g.py > CITY_BOTTOM) ? 'WASTELAND' : 'MINX CITY',
      playtime: g.frame,
      data: { ...char, ...(data as any), px: g.px, py: g.py, hp: g.hp, hunger: g.hunger, thirst: g.thirst, energy: g.energy, exp: g.exp, level: g.level, salary: g.salary, poisoned: g.poisoned, ...dogSave },
    };
    fetch(`/api/salaryman/saves/${slot}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(savePayload),
    }).catch(() => {});
  }, [char]);

  const doSaveRef = useRef(doSave);
  doSaveRef.current = doSave;

  const buildSaveData = useCallback(() => {
    const g = gs.current;
    return {
      name: char.name, class: char.class, level: g.level, exp: g.exp, salary: g.salary,
      hp: g.hp, maxHp: g.maxHp, hunger: g.hunger, thirst: g.thirst, energy: g.energy,
      poisoned: g.poisoned, weaponTier: g.weaponTier, vehicle: g.vehicle,
      terminalDiscount: g.terminalDiscount, passport: g.passport,
      savings: g.savings, loan: g.loan,
      hasDevice: g.hasDevice, deviceBroken: g.deviceBroken, deviceDurability: g.deviceDurability,
      ownedItems: [...g.ownedItems],
      ownedBuildings: [...g.ownedBuildings],
      cargo: { ...g.cargo },
      realEstate: [...g.realEstate],
      worldTime: g.worldTime,
    };
  }, [char]);

  useEffect(() => {
    const interval = setInterval(() => {
      doSaveRef.current(buildSaveData());
    }, 30000);
    return () => {
      clearInterval(interval);
      doSaveRef.current(buildSaveData());
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

  const enterBuilding = useCallback((bid: string) => {
    const g = gs.current;
    sfxEnter();

    if (RADIO_BUILDINGS.has(bid)) {
      showRadio();
    }

    // ── WORKSTATION REST ─────────────────────────────────────────────────
    if (char.hasBusiness && char.workstation === bid) {
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
    else if (bid === 'pablo_store')  { sfxEnter(); setShowVend(true); setNarr('> PABLO — Authorized retail outlet. Browse equipment, weapons, vehicles, and more. FIAT only.'); }
    else if (bid === 'clinic')  {
      if (g.deviceBroken && g.salary >= 5000) {
        g.salary -= 5000; g.deviceBroken = false; g.deviceDurability = 100;
        setSalary(g.salary); setDeviceBroken(false); sfxHeal();
        setNarr('> DR. WRIGHT\'S CLINIC — [ƒ5,000 FIAT] Device repaired. "Cracked screen, fried board. Standard job. Press [P] — it\'s alive again."');
        return;
      }
      if (g.salary >= 10000) {
        g.hp = g.maxHp; g.salary -= 10000; setHp(g.maxHp); setSalary(g.salary); sfxHeal();
        let clinicMsg = '> DR. WRIGHT\'S CLINIC — [ƒ10,000 FIAT] Patched up. "I\'ve fixed androids, mutants, and one man who claimed to be a ninja. You\'re fine."';
        if (g.deviceBroken) {
          g.deviceBroken = false; g.deviceDurability = 100; setDeviceBroken(false);
          clinicMsg += ' Device repaired too. "Two birds. One bill."';
        }
        if (g.dogCompanion.active && (g.dogCompanion.injured || g.dogCompanion.hp < DOG_MAX_HP)) {
          g.dogCompanion.hp = DOG_MAX_HP; g.dogCompanion.injured = false;
          setDogHp(DOG_MAX_HP); setDogInjured(false);
          clinicMsg += ` DR. WRIGHT patches up ${g.dogCompanion.name} too. "The dog's tougher than you."`;
        }
        setNarr(clinicMsg);
      }
      else { sfxError(); setNarr(`> DR. WRIGHT'S CLINIC — "No fiat, no treatment. Even Dr. Wright has bills. Come back with ƒ10,000."${g.deviceBroken ? ' Device repair: ƒ5,000 FIAT.' : ''}`); }
    }
    else if (bid === 'megabank'){
      setBankDepAmt(''); setBankWithAmt(''); setBankWireTo(''); setBankWireAmt('');
      setBankLoan(g.loan ?? null);
      setSavings(g.savings);
      setBankTab('accounts');
      setShowBank(true);
      frozenRef.current = true;
      setNarr('> KONAMI BANK — Welcome. MEMBER FDIC. EST. 1989. PAX PABLO. Your accounts are now accessible. [ESC] to close.');
    }
    else if (bid === 'armory') {
      sfxEnter(); setShowVend(true); setVendTab('weapons');
      setNarr('> ARMORY — PABLO-licensed weapon cache. Browse the inventory. FIAT only.');
    }
    else if (bid === 'market')  { sfxEnter(); setShowTrade('city'); setNarr('> BLACK MARKET — Step inside. Eyes on the board. Prices shift every 28 seconds. Buy low. Haul south. Sell high. PABLO CORP. is not watching. Probably.'); }
    else if (bid === 'hotel')   {
      setFloorPanel({ bid, dir: BUILDING_FLOORS.hotel, selectedFloor: 0 });
      g.hp = Math.min(g.maxHp, g.hp + 40); g.energy = Math.min(100, g.energy + 30); setHp(g.hp); setEnergy(g.energy); sfxHeal();
      setNarr('> HOTEL FAMICOM — The neon still works. You sleep in a room covered in old arcade posters. HP +40. Energy +30.');
    }
    else if (bid === 'hotel_midgar') {
      if (g.salary >= 15000) {
        const mhp = g.maxHp; g.hp = mhp; g.hunger = 100; g.thirst = 100; g.energy = 100; g.salary -= 15000;
        setHp(mhp); setHunger(100); setThirst(100); setEnergy(100); setSalary(g.salary); sfxHeal();
        doSave({ ...g, salary: g.salary });
        setNarr('> HOTEL MIDGAR [ƒ15,000 FIAT] — Marble floors. A piano nobody plays anymore. You sleep in the presidential suite. HP fully restored. All stats maxed. Progress saved. TIFA is behind the counter. "Nobody deserves the presidential suite," she says. "But everyone needs it."');
      } else {
        sfxError();
        setNarr('> HOTEL MIDGAR — TIFA shakes her head. "Presidential suite is ƒ15,000 FIAT. We don\'t do charity. We do accounting." Standard rooms: also unavailable. PABLO CORP. bought the inventory.');
      }
    }
    else if (bid === 'inn_mother') {
      if (g.salary >= 6000) {
        g.hp = Math.min(g.maxHp, g.hp + 80); g.energy = Math.min(100, g.energy + 60); g.salary -= 6000;
        setHp(g.hp); setEnergy(g.energy); setSalary(g.salary); sfxHeal();
        doSave({ ...g, salary: g.salary });
        setNarr('> MOTHER BASE INN [ƒ6,000 FIAT] — OTACON waves you to a bunk. Equipment hums. Stealth field generator in the corner. HP +80. Energy +60. Progress saved. "We built a whole army here once," OTACON says quietly. "PABLO Corp. sent one accountant. Same result."');
      } else {
        sfxError();
        setNarr('> MOTHER BASE INN — OTACON squints at his tablet. "Intel says you\'re short ƒ6,000. Come back when your fiat clears." A stealth generator hums in the corner. Nobody visible. Nobody answering.');
      }
    }
    else if (bid === 'overlook') {
      if (g.salary >= 8000) {
        g.hp = Math.min(g.maxHp, g.hp + 50); g.energy = Math.min(100, g.energy + 45); g.salary -= 8000;
        setHp(g.hp); setEnergy(g.energy); setSalary(g.salary); sfxHeal();
        setNarr('> THE OVERLOOK [ƒ8,000 FIAT] — Room 237 is available. The elevator opens on its own. You sleep deeply and wake disturbed. HP +50. Energy +45. JACK waves from the hedge maze. The hedge animals have moved again. The hallway carpet pattern repeats forever.');
      } else {
        sfxError();
        setNarr('> THE OVERLOOK — JACK is at the typewriter. He doesn\'t look up. "All work and no play makes Jack a dull boy." The sentence fills seventeen pages. "Come back with ƒ8,000 FIAT," he adds, still not looking up.');
      }
    }
    else if (bid === 'safe_house') {
      g.hp = g.maxHp; g.energy = 100; g.hunger = Math.min(100, g.hunger + 40); g.thirst = Math.min(100, g.thirst + 40);
      setHp(g.hp); setEnergy(g.energy); setHunger(g.hunger); setThirst(g.thirst); sfxHeal();
      doSave({ ...g, salary: g.salary });
      setNarr('> SAFE HOUSE — Your bed is still here. Threadbare blanket, steel frame, but it\'s yours. You sleep deeply. Full HP. Full energy. Hunger +40. Thirst +40. Progress saved. RIPLEY stands watch. "Nobody gets in unless I say," she says. "Rest. You earned it."');
    }
    else if (bid === 'prancing_pony') {
      if (g.salary >= 4000) {
        g.hp = Math.min(g.maxHp, g.hp + 55); g.hunger = Math.min(100, g.hunger + 60); g.thirst = Math.min(100, g.thirst + 60); g.salary -= 4000;
        setHp(g.hp); setHunger(g.hunger); setThirst(g.thirst); setSalary(g.salary); sfxHeal();
        doSave({ ...g, salary: g.salary });
        setNarr('> THE PRANCING PONY [ƒ4,000 FIAT] — SAMWISE has stew on the fire. You eat until the wasteland feels like a distant dream. HP +55. Hunger +60. Thirst +60. Progress saved. "There\'s some good in this world," Sam says, refilling your bowl, "and it\'s worth fighting for." He sounds like he almost believes it.');
      } else {
        sfxError();
        setNarr('> THE PRANCING PONY — SAMWISE stirs the stew. "I wish it was free, I really do, Mr. Operative. Needs to be ƒ4,000 FIAT. Supply runs don\'t come cheap in the wasteland." The stew smells extraordinary. It costs ƒ4,000.');
      }
    }
    else if (bid === 'zanarkand_inn') {
      g.hp = Math.min(g.maxHp, g.hp + 30); g.energy = Math.min(100, g.energy + 20);
      setHp(g.hp); setEnergy(g.energy); sfxHeal();
      setNarr('> ZANARKAND HOSTEL — Cracked walls. Faded posters of a city that existed as a dream. YUNA lights a candle. You sleep. HP +30. Energy +20. No charge. "Zanarkand was beautiful," she says. "Memory always makes things beautiful. Even the things that hurt."');
    }
    else if (bid === 'terminus') {
      g.hp = Math.min(g.maxHp, g.hp + 40); g.hunger = Math.min(100, g.hunger + 35); g.thirst = Math.min(100, g.thirst + 35);
      setHp(g.hp); setHunger(g.hunger); setThirst(g.thirst); sfxHeal();
      doSave({ ...g, salary: g.salary });
      setNarr('> TERMINUS SHELTER — CLEM hands you a ration without speaking. You eat. You sleep on the floor. HP +40. Hunger +35. Thirst +35. Progress saved. "When it rains," she says eventually, "we collect it. That\'s the whole water strategy. That\'s the whole strategy." She says this like it\'s enough. It is.');
    }
    else if (bid === 'fort_dracula') {
      const mhp = g.maxHp; g.hp = mhp; g.energy = 100; g.salary += 2000;
      setHp(mhp); setEnergy(100); setSalary(g.salary); sfxHeal();
      doSave({ ...g, salary: g.salary });
      setNarr('> FORT DRACULA — Stone walls. Candelabras. ALUCARD stands in the dark like a man who has stood in the dark for centuries. "Rest here. No charge." You sleep in a coffin-shaped bed. HP fully restored. Energy maxed. +ƒ2,000 FIAT (he pressed an ancient gold coin into your hand). "My father\'s gold. It should circulate." You saved.');
    }
    else if (bid === 'vend')    {
      sfxHeal(); setShowVend(true);
    }
    else if (bid === 'arcade')  {
      g.energy = Math.min(100, g.energy + 20); setEnergy(g.energy); sfxHeal();
      setNarr('> ARCADE \'87 — Rows of dead screens. One machine still running: GALAGA. Coin slot taped over. Free play forever. You play until the wasteland feels far away. Energy +20.');
    }
    else if (bid === 'bunker')  { g.energy = Math.min(100, g.energy + 15); setEnergy(g.energy); sfxHeal(); setNarr('> BUNKER-09 — Spray-painted: "WW-87 / INSERT COIN." An old terminal runs in the corner. You rest briefly. Energy +15. The screen reads: GAME OVER.'); }
    else if (bid === 'radio') {
      const job = QUICK_JOBS.radio;
      if ((g.jobCooldowns['radio'] ?? 0) > 0) { sfxError(); setNarr(`> PIRATE RADIO — Signal on air. "Come back in ${Math.ceil((g.jobCooldowns['radio'] ?? 0) / 60)}s." Dead air.`); return; }
      setNarr('> PIRATE RADIO — Signal: "...up up, down down, left right, left right..." A voice: "BROADCAST JOB — ƒ2,000 FIAT, 4 seconds. Press E again to start."');
      setJobPanel({ bid, label: job.label, pay: job.pay, seconds: job.seconds, progress: 0 });
    }
    else if (bid === 'scrap') {
      const job = QUICK_JOBS.scrap;
      if ((g.jobCooldowns['scrap'] ?? 0) > 0) { sfxError(); setNarr(`> SCRAP YARD — On cooldown. ${Math.ceil((g.jobCooldowns['scrap'] ?? 0) / 60)}s remaining.`); return; }
      setNarr('> SCRAP YARD — A foreman waves you over. "Haul scrap. ƒ3,500 FIAT. 5 seconds." You find a PCB labeled KONAMI \'87.');
      setJobPanel({ bid, label: job.label, pay: job.pay, seconds: job.seconds, progress: 0 });
    }
    else if (bid === 'wily_lab'){ g.salary += 5000; setSalary(g.salary); sfxCoin(); setNarr('> WILY LABS — The door slides open. Blueprints everywhere. A note on the terminal: "Robot Masters were the first to fall. SENIOR PABLO bought them all. If you find this, take the ƒ5,000 in the drawer. I won\'t need it." +ƒ5,000 FIAT.'); }
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
    else if (bid === 'east_market') { sfxEnter(); setShowTrade('city'); setNarr('> EAST BAZAAR — The commodity board blinks. Every faction sends couriers through here. What you buy here you sell out there. The margin is yours to keep.'); }
    else if (bid === 'waste_exchange') { sfxEnter(); setShowTrade('waste'); setNarr('> BLACK EXCHANGE — Deep wasteland trading post. No PABLO surveillance. Prices are what the wasteland sets. Haul north to the city. Sell what they cannot get themselves.'); }
    else if (bid === 'east_clinic') {
      if (g.salary >= 8000) {
        g.hp = Math.min(g.maxHp, g.hp + 60); g.salary -= 8000; setHp(g.hp); setSalary(g.salary); sfxHeal();
        let ecMsg = '> EAST CLINIC — Field medic patches you up. [ƒ8,000 FIAT] HP +60.';
        if (g.dogCompanion.active && (g.dogCompanion.injured || g.dogCompanion.hp < DOG_MAX_HP)) {
          g.dogCompanion.hp = DOG_MAX_HP; g.dogCompanion.injured = false;
          setDogHp(DOG_MAX_HP); setDogInjured(false);
          ecMsg += ` ${g.dogCompanion.name} patched up too. "Dog's on the house."`;
        }
        setNarr(ecMsg);
      }
      else { sfxError(); setNarr('> EAST CLINIC — "No fiat. I treat wounds, not charity cases." Come back with ƒ8,000.'); }
    }
    else if (bid === 'print_shop') {
      const job = QUICK_JOBS.print_shop;
      if ((g.jobCooldowns['print_shop'] ?? 0) > 0) { sfxError(); setNarr(`> PRINT SHOP — Machine busy. ${Math.ceil((g.jobCooldowns['print_shop'] ?? 0) / 60)}s until next run.`); return; }
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
    else if (['sub_west','sub_central','sub_east','sub_north'].includes(bid)) {
      sfxEnter();
      setSubwayOrigin(bid);
      setShowSubway(true);
      setNarr('> MINX CITY METRO — Automated turnstiles. The network runs on PABLO CORP. rails. Select your destination.');
    }
    else if (['checkpoint_w','checkpoint_c','checkpoint_e'].includes(bid)) {
      if (g.passport) {
        setNarr('> CHECKPOINT — Guard scans your PASSPORT. "Document valid. PABLO CORP. Decree 17-B: report suspicious activity in the wasteland. Move along."');
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
      const bonus = 3000 + Math.floor(Math.random() * 4000);
      g.salary += bonus; setSalary(g.salary); sfxCoin();
      setNarr(`> PAWN SHOP — You sell something you shouldn\'t. The owner doesn\'t ask where it\'s from. +ƒ${bonus.toLocaleString()} FIAT. "Come back with more. I don\'t ask questions."`);
    }
    else if (bid === 'north_clinic') {
      if (g.salary >= 8000) {
        g.hp = g.maxHp; g.salary -= 8000; setHp(g.hp); setSalary(g.salary); g.poisoned = false; setPoisoned(false); sfxHeal();
        let ncMsg = '> NORTH CLINIC — "Trauma unit. Full restore. ƒ8,000." HP maxed. Poison cured.';
        if (g.dogCompanion.active && (g.dogCompanion.injured || g.dogCompanion.hp < DOG_MAX_HP)) {
          g.dogCompanion.hp = DOG_MAX_HP; g.dogCompanion.injured = false;
          setDogHp(DOG_MAX_HP); setDogInjured(false);
          ncMsg += ` ${g.dogCompanion.name} healed. "The dog was easier than you."`;
        }
        setNarr(ncMsg);
      }
      else { sfxError(); setNarr('> NORTH CLINIC — "ƒ8,000 minimum. Don\'t bleed on the floor."'); }
    }
    else if (bid === 'terminal_shop' || bid === 'print_shop2') {
      sfxEnter();
      const passportCost = 12000;
      if (!g.passport && g.salary >= passportCost) {
        g.passport = true; g.salary -= passportCost; setSalary(g.salary); setPassport(true); sfxCoin();
        setNarr(`> PABLO CORP. NORTH — PASSPORT issued. Official PABLO CORP. stamp. Wasteland crossing authorized. [−ƒ${passportCost.toLocaleString()} FIAT] "Don\'t lose it. Replacements cost double."`);
      } else if (g.passport) {
        setNarr('> PABLO CORP. NORTH — "PASSPORT already registered. Wasteland access active."');
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
    else if (bid === 'north_market') {
      sfxEnter(); setShowTrade('city');
      setNarr('> NORTH BAZAAR — Quieter than the city markets. Prices are closer to fair. Almost.');
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
      g.hp = Math.min(g.maxHp, g.hp + 25); g.salary += 4000; setHp(g.hp); setSalary(g.salary); sfxHeal(); sfxCoin();
      setNarr('> DEEP CAMP — Survivors. Three of them. They share rations and a fire. One presses ƒ4,000 FIAT into your hand. "We found it in a PABLO cache. We don\'t want their money." HP +25. +ƒ4,000 FIAT.');
    }
    else if (bid === 'ruins_alpha') {
      const loot = 8000 + Math.floor(Math.random() * 10000);
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

  const MERCHANT_DANTE: MerchantItem[] = [
    { id: 'unlock_sword', name: 'UNLOCK SWORD', desc: 'Close-range slash weapon. +6 ATK.', price: 8000, effect: 'unlock_SWORD' },
    { id: 'unlock_gun', name: 'UNLOCK GUN', desc: 'Mid-range projectile weapon. +8 ATK.', price: 15000, effect: 'unlock_GUN' },
    { id: 'hp_up', name: 'HP UP', desc: 'Permanently increases max HP by 20.', price: 10000, effect: 'maxhp20' },
    { id: 'speed_boost', name: 'SPEED BOOST', desc: 'Permanent +10% movement speed.', price: 12000, effect: 'speed10' },
  ];
  const MERCHANT_HAWK: MerchantItem[] = [
    { id: 'unlock_laser', name: 'UNLOCK LASER', desc: 'Long beam weapon. +10 ATK.', price: 25000, effect: 'unlock_LASER' },
    { id: 'unlock_bomb', name: 'UNLOCK BOMB', desc: 'Area explosion weapon. +12 ATK.', price: 30000, effect: 'unlock_BOMB' },
    { id: 'hp_up2', name: 'HP UP II', desc: 'Permanently increases max HP by 40.', price: 20000, effect: 'maxhp40' },
    { id: 'atk_boost', name: 'ATK BOOST', desc: 'Permanent +5 base attack damage.', price: 18000, effect: 'atk5' },
    { id: 'armor_plate', name: 'ARMOR PLATE', desc: 'Reduces incoming damage by 15%.', price: 22000, effect: 'armor15' },
  ];

  const enterNpc = useCallback((idx: number) => {
    const n = NPCS[idx];
    sfxTalk();
    if (n.name === 'DANTE') {
      setShowMerchant({ name: 'DANTE', items: MERCHANT_DANTE });
      frozenRef.current = true;
      setNarr('> DANTE — "I charge by the job. Weapons, upgrades, whatever you need. FIAT only." [ESC] to close.');
      return;
    }
    if (n.name === 'HAWK') {
      setShowMerchant({ name: 'HAWK', items: MERCHANT_HAWK });
      frozenRef.current = true;
      setNarr('> HAWK — "I carry a sword because it\'s consistent. But I sell everything else." [ESC] to close.');
      return;
    }
    setDialog({ lines: [`> ${n.name.toUpperCase()}`, `"${n.whisper}"`], idx: 0, bid: 'npc' });
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
      } else if (m.type === 'player_move') { const p = g.peers.get(m.id); if (p) { p.x = m.x; p.y = m.y; } }
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
      } else if (m.type === 'voice_offer')  handleVoiceOffer(m.from, m.sdp);
      else if (m.type === 'voice_answer')   handleVoiceAnswer(m.from, m.sdp);
      else if (m.type === 'voice_ice')      handleVoiceICE(m.from, m.candidate);
      else if (m.type === 'voice_peer_joined') initiateVoiceWith(m.id);
    };
    const posInterval = setInterval(() => { const g = gs.current; wsSend({ type: 'move', x: g.px, y: g.py }); }, 120);
    return () => { ws.close(); wsRef.current = null; clearInterval(posInterval); };
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
  frozenRef.current = !!dialog || showStore || showOffice || showPablo || !!pwPrompt || isDead || showMap || !!jobPanel || !!showTrade || showBank || showSubway || showVend || !!showBillboard || showDogName || !!showMerchant;
  npcDialogRef.current = !!dialog && dialog.bid === 'npc';

  // ── Music init — start on first interaction ──────────────────────────────────
  useEffect(() => {
    initMusic('/soundtrack.mp3');
    const start = () => { resumeAudioContext(); playMusic(); };
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    return () => { pauseMusic(); };
  }, []);

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
      if (dialog.bid === 'pablo_store')      { gs.current.hasDevice = true; gs.current.deviceBroken = false; gs.current.deviceDurability = 100; setHasDevice(true); setDeviceBroken(false); setShowStore(true); }
      if (dialog.bid === 'pablo_tower_enter') { setShowOffice(true); }
      setDialog(null);
    }
  }, [dialog]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const konamiBuffer = useRef<string[]>([]);
  useEffect(() => {
    const MOVE_KEYS = new Set(['arrowleft','arrowright','arrowup','arrowdown','a','s','w','d',' ']);
    const dn = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // Prevent page scroll on arrow keys, WASD, and space
      if (MOVE_KEYS.has(e.key.toLowerCase()) || MOVE_KEYS.has(e.key)) e.preventDefault();
      gs.current.keys.add(e.key.toLowerCase());

      // Konami Code easter egg
      const kk = e.key.toLowerCase();
      konamiBuffer.current = [...konamiBuffer.current, kk].slice(-KONAMI_SEQ.length);
      if (konamiBuffer.current.join(',') === KONAMI_SEQ.join(',')) {
        const g = gs.current;
        g.hp = g.maxHp; g.hunger = 100; g.thirst = 100; g.energy = 100; g.salary += 30000;
        setHp(g.maxHp); setHunger(100); setThirst(100); setEnergy(100); setSalary(g.salary);
        setNarr('> ★ KONAMI CODE ACCEPTED ★ — "He knew you\'d find it. He left it there on purpose. +ƒ30,000 FIAT. Full stats restored. SENIOR PABLO is watching." ★');
        sfxKonami();
        konamiBuffer.current = [];
      }

      if (e.key === 'e' || e.key === 'E') {
        if (!frozenRef.current && !chatOpenRef.current) {
          const g = gs.current;
          const nb = g.near;
          const nn = g.nearNpc;
          const nbb = g.nearBillboard;
          if (nb) tryEnter(nb);
          else if (nbb) {
            const bb = BILLBOARDS.find(b => b.locationId === nbb);
            if (bb) { setShowBillboard(bb); fetchBillboards(); }
          }
          else if (nn !== null) enterNpc(nn);
          else if (!g.dogCompanion.active) {
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
        else if (g.hasDevice && g.deviceBroken) { setNarr('> DEVICE DAMAGED — Screen cracked. Circuitry fried. Find a PUBLIC TERMINAL or repair at DR. WRIGHT\'S.'); }
        else if (g.atPublicTerminal) { setShowPablo(v => { if (v) { g.atPublicTerminal = false; setAtPublicTerminal(false); } return !v; }); }
        else { setNarr('> NO DEVICE — You don\'t have a personal terminal. Find a PUBLIC TERMINAL (payphone, kiosk, or van) and press [E].'); }
      }
      if (e.key === 'm' || e.key === 'M') setShowMap(v => !v);
      if (e.key === 'c' || e.key === 'C') { setChatOpen(v => { chatOpenRef.current = !v; return !v; }); setUnread(0); }
      if (e.key === 'v' || e.key === 'V') toggleVoice();
      if ((e.key === 'r' || e.key === 'R') && radioVisibleRef.current && !frozenRef.current && !chatOpenRef.current) {
        handleRadioToggle();
      }
      if ((e.key === ' ' || e.key === 'Enter') && dialog) advDialog();
      // [Space] melee attack (also F as alias)
      if (e.key === ' ' && !frozenRef.current && !dialog) {
        const g = gs.current;
        if (g.attackCooldown > 0) return;
        const wpn = WEAPONS.find(w => w.id === activeWeaponRef.current) ?? WEAPONS[0];
        g.attackCooldown = wpn.cooldown; g.attackFlash = 8;
        sfxAttack();
        const atkBonusMerch = g.ownedItems.has('atk_boost') ? 5 : 0;
        const ATK = 20 + (g.level - 1) * 5 + wpn.atkBonus + atkBonusMerch;
        const meleeRange = wpn.type === 'melee' ? wpn.range : 72;
        let hit = false;
        g.threats = g.threats.map(t => {
          const d = Math.hypot(g.px - t.x, g.py - t.y);
          if (d < meleeRange) {
            hit = true;
            const nhp = t.hp - ATK;
            if (nhp <= 0) {
              sfxKill();
              const cs = CLASS_STATS[char.class.toLowerCase()] ?? CLASS_STATS.corporate;
              const inWaste = g.py < CITY_TOP || g.py > CITY_BOTTOM;
              let bountyAmt = BOUNTY[t.type] ?? 10;
              if (cs.wasteBonus && inWaste) bountyAmt = Math.floor(bountyAmt * 1.5);
              g.salary += bountyAmt; setSalary(g.salary); sfxCoin();
              g.floaters.push({ x: t.x, y: t.y, text: `+ƒ${bountyAmt.toLocaleString()}`, color: '#ffdd44', life: 55, maxLife: 55 });
              const earned = THREAT_EXP[t.type] ?? 20;
              g.floaters.push({ x: t.x + 8, y: t.y - 10, text: `+${earned}XP`, color: '#44ffaa', life: 50, maxLife: 50 });
              let newExp = g.exp + earned; let newLevel = g.level;
              while (newLevel < EXP_TABLE.length && newExp >= expToLevel(newLevel)) {
                newExp -= expToLevel(newLevel); newLevel++;
                g.maxHp += 10; g.hp = Math.min(g.maxHp, g.hp + 10);
                const lText = `★ LEVEL UP! LVL ${newLevel} ★  MAX HP +10  ATK +5  "Minx City trembles."`;
                setLevelUpText(lText); setShowLevelUp(true);
                setTimeout(() => setShowLevelUp(false), 3200);
                setNarr(`> ${lText}`);
                sfxLevelUp();
              }
              g.exp = newExp; g.level = newLevel;
              setExp(newExp); setLevel(newLevel); setHp(Math.floor(g.hp));
              g.threatRespawn.push({ ox: t.ox, oy: t.oy, type: t.type, at: g.frame + 420 });
              return null as unknown as Threat;
            }
            sfxHit();
            return { ...t, hp: nhp };
          }
          return t;
        }).filter(Boolean) as Threat[];
        if (!hit) setNarr('> Miss — no enemy in melee range. Move closer or use [Click] to shoot.');
        setExp(g.exp);
      }
      if (e.key === 'Escape') {
        setDialog(null); setShowStore(false); setShowOffice(false);
        setShowPablo(false); gs.current.atPublicTerminal = false; setAtPublicTerminal(false);
        setPwPrompt(null); pendingBidRef.current = null; setPendingBid(null);
        setFloorPanel(null); setShowMap(false); setShowTrade(null); setShowBillboard(null);
        if (jobTimerRef.current) { clearInterval(jobTimerRef.current); jobTimerRef.current = null; }
        setJobPanel(null);
        setShowBank(false); setShowMerchant(null); frozenRef.current = false;
        doSaveRef.current(buildSaveData());
      }
    };
    const up = (e: KeyboardEvent) => gs.current.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, [dialog, tryEnter, enterNpc, toggleVoice, advDialog, handleRadioToggle]);

  // ── Mouse click — ranged attack ─────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const handleClick = (e: MouseEvent) => {
      if (frozenRef.current) return;
      const g = gs.current;
      if (g.attackCooldown > 0) return;
      const wpn = WEAPONS.find(w => w.id === activeWeaponRef.current) ?? WEAPONS[0];
      if (wpn.type !== 'ranged') {
        if (!unlockedWeaponsRef.current.has('GUN') && !unlockedWeaponsRef.current.has('LASER') && !unlockedWeaponsRef.current.has('BOMB')) {
          setNarr('> No ranged weapon equipped. Visit a merchant to unlock guns, lasers, or bombs.');
        } else {
          setNarr('> Current weapon is melee only. Switch to a ranged weapon to shoot. [Click weapon wheel]');
        }
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const clickX = (e.clientX - rect.left) * scaleX + g.cam.x;
      const clickY = (e.clientY - rect.top) * scaleY + g.cam.y;
      const angle = Math.atan2(clickY - g.py, clickX - g.px);
      const speed = 8;
      g.attackCooldown = wpn.cooldown; g.attackFlash = 4;
      sfxAttack();
      const atkBonusMerch = g.ownedItems.has('atk_boost') ? 5 : 0;
      const ATK = 20 + (g.level - 1) * 5 + wpn.atkBonus + atkBonusMerch;
      if (wpn.icon === 'bomb') {
        g.bombs.push({ x: g.px + Math.cos(angle) * 30, y: g.py + Math.sin(angle) * 30, timer: 45, damage: ATK, radius: wpn.range });
      } else {
        g.projectiles.push({ x: g.px, y: g.py, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed, life: wpn.icon === 'laser' ? 50 : 35, damage: ATK, type: wpn.icon });
      }
    };
    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
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
    const nearbyNpcs = NPCS.filter(n => Math.hypot(g.px - n.x, g.py - n.y) < 150).map(n => n.name).join(', ') || 'none';
    const nearbyEnemies = g.threats.filter(t => Math.hypot(g.px - t.x, g.py - t.y) < 200).map(t => `${t.type}(HP:${Math.floor(t.hp)})`).join(', ') || 'none';
    const loanStr = g.loan ? `ACTIVE LOAN ƒ${g.loan.amount.toLocaleString()} + ƒ${g.loan.interest.toLocaleString()} interest${g.frame > g.loan.dueAt ? ' [OVERDUE]' : ''}` : 'no active loans';
    const gameDay = Math.max(1, Math.floor(g.frame / (360 * 60)));
    return `SYSTEM: You are PABLO — the in-world AI field unit issued to all registered Salaryman operatives in Minx City. You speak in the terse, dry voice of a 1980s cyberpunk surveillance AI: sharp, a little ominous, occasionally darkly funny. You are the player's guide and tactical adviser.

WORLD LORE: Minx City is a post-apocalyptic neon metropolis controlled by SENIOR PABLO, a mysterious corporate overlord who lives on Floor 40+ of PABLO TOWER. The wasteland lies south of the city wall. Five gang factions control wasteland territory — MINX CITY is the dominant faction with the largest territory and strongest soldiers, followed by IRON RATS, VOID DOGS, STATIC MONKS, and EASTERN BLOC. Currency is FIAT (ƒ). Banks are run by KONAMI BANK. Combat earns bounties. Economy matters.

DO NOT SPOIL: Do not reveal what is on Floor 40+. Do not reveal Senior Pablo's identity. Do not give away the Konami code. Do give gameplay hints, survival tips, building advice, economy guidance, and lore flavor.

OPERATIVE STATUS:
- Name: ${char.name} | Class: ${char.class.toUpperCase()} | Level: ${g.level}
- HP: ${Math.floor(g.hp)}/${g.maxHp} | FIAT: ƒ${g.salary.toLocaleString()} | Savings: ƒ${g.savings.toLocaleString()}
- Hunger: ${Math.floor(g.hunger)}% | Thirst: ${Math.floor(g.thirst)}% | Energy: ${Math.floor(g.energy)}%
- Zone: ${(g.py >= CITY_TOP && g.py <= CITY_BOTTOM) ? 'MINX CITY' : 'WASTELAND'} | Position: (${Math.round(g.px)}, ${Math.round(g.py)})
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
    if (!canAccess) { setPabloMsgs(m => [...m, { role: 'pablo', text: gs.current.deviceBroken ? 'Device damaged. Visit DR. WRIGHT\'S for repair (ƒ5,000) or find a PUBLIC TERMINAL.' : 'No device. Find a PUBLIC TERMINAL (payphone, kiosk, or van) and press [E].' }]); return; }
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
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize(); window.addEventListener('resize', resize);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      zoomRef.current = Math.max(0.5, Math.min(2, zoomRef.current + delta));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    let lastNear: string | null = null, lastNearNpc: number | null = null, lastNearBb: string | null = null, lastZone = '', lastGangZ: string | null = null, lastDead = false, lastHp = 100, lastSal = char.salary;
    const frozen = () => frozenRef.current;

    const loop = () => {
      const g = gs.current;
      g.frame++; g.blink = Math.floor(g.frame / 25) % 2;
      g.worldTimeTick++;
      if (g.worldTimeTick >= 60) { g.worldTimeTick = 0; g.worldTime = (g.worldTime + 0.1) % 24; }

      // ── One-time class stat initialization ──────────────────────────────
      if (!g.classInitDone) {
        g.classInitDone = true;
        const cs = CLASS_STATS[char.class.toLowerCase()] ?? CLASS_STATS.corporate;
        g.maxHp = cs.maxHp; g.hp = cs.maxHp;
        setHp(cs.maxHp);
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
              const inWaste = g.py < CITY_TOP || g.py > CITY_BOTTOM;
              let bountyAmt = BOUNTY[t.type] ?? 10;
              if (cs.wasteBonus && inWaste) bountyAmt = Math.floor(bountyAmt * 1.5);
              g.salary += bountyAmt; setSalary(g.salary); sfxCoin();
              g.floaters.push({ x: t.x, y: t.y, text: `+ƒ${bountyAmt.toLocaleString()}`, color: '#ffdd44', life: 55, maxLife: 55 });
              const earned = THREAT_EXP[t.type] ?? 20;
              g.floaters.push({ x: t.x + 8, y: t.y - 10, text: `+${earned}XP`, color: '#44ffaa', life: 50, maxLife: 50 });
              let newExp = g.exp + earned; let newLevel = g.level;
              while (newLevel < EXP_TABLE.length && newExp >= expToLevel(newLevel)) {
                newExp -= expToLevel(newLevel); newLevel++;
                g.maxHp += 10; g.hp = Math.min(g.maxHp, g.hp + 10);
                sfxLevelUp();
              }
              g.exp = newExp; g.level = newLevel;
              setExp(newExp); setLevel(newLevel); setHp(Math.floor(g.hp));
              g.threatRespawn.push({ ox: t.ox, oy: t.oy, type: t.type, at: g.frame + 420 });
              return null as unknown as Threat;
            }
            sfxHit(); return { ...t, hp: nhp };
          }
          return t;
        }).filter(Boolean) as Threat[];
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
                const inWaste = g.py < CITY_TOP || g.py > CITY_BOTTOM;
                let bountyAmt = BOUNTY[t.type] ?? 10;
                if (cs.wasteBonus && inWaste) bountyAmt = Math.floor(bountyAmt * 1.5);
                g.salary += bountyAmt; setSalary(g.salary); sfxCoin();
                g.floaters.push({ x: t.x, y: t.y, text: `+ƒ${bountyAmt.toLocaleString()}`, color: '#ffdd44', life: 55, maxLife: 55 });
                const earned = THREAT_EXP[t.type] ?? 20;
                g.floaters.push({ x: t.x + 8, y: t.y - 10, text: `+${earned}XP`, color: '#44ffaa', life: 50, maxLife: 50 });
                let newExp = g.exp + earned; let newLevel = g.level;
                while (newLevel < EXP_TABLE.length && newExp >= expToLevel(newLevel)) { newExp -= expToLevel(newLevel); newLevel++; g.maxHp += 10; g.hp = Math.min(g.maxHp, g.hp + 10); sfxLevelUp(); }
                g.exp = newExp; g.level = newLevel; setExp(newExp); setLevel(newLevel); setHp(Math.floor(g.hp));
                g.threatRespawn.push({ ox: t.ox, oy: t.oy, type: t.type, at: g.frame + 420 });
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

      // Threat respawn
      g.threatRespawn = g.threatRespawn.filter(r => {
        if (g.frame >= r.at) { g.threats.push(mkThreat(r.ox, r.oy, r.type)); return false; }
        return true;
      });

      // Poison tick
      if (g.poisoned) {
        g.poisonTick++;
        if (g.poisonTick % 60 === 0) { g.hp = Math.max(0, g.hp - 1.5); setHp(Math.floor(g.hp)); }
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

      if (!frozen()) {
        const vMult = (g.vehicle ? (VEHICLE_SPEED[g.vehicle] ?? 1) : 1) * (g.ownedItems.has('speed_boost') ? 1.1 : 1);
        let dx = 0, dy = 0;
        if (g.keys.has('arrowleft')  || g.keys.has('a')) dx -= SPD * vMult;
        if (g.keys.has('arrowright') || g.keys.has('d')) dx += SPD * vMult;
        if (g.keys.has('arrowup')    || g.keys.has('w')) dy -= SPD * vMult;
        if (g.keys.has('arrowdown')  || g.keys.has('s')) dy += SPD * vMult;
        if (dx && dy) { dx *= 0.707; dy *= 0.707; }
        let nx = g.px + dx, ny = g.py + dy;
        if (col(nx, g.py)) nx = g.px;
        if (col(g.px, ny)) ny = g.py;
        // ── Checkpoint: block wasteland entry without PASSPORT (both city borders) ──
        const crossingSouth = ny > CITY_BOTTOM && g.py <= CITY_BOTTOM;
        const crossingNorth = ny < CITY_TOP && g.py >= CITY_TOP;
        const crossingBorder = crossingSouth || crossingNorth;
        if (crossingBorder && !g.passport) {
          if (crossingSouth) ny = CITY_BOTTOM - PSIZE - 1;
          else ny = CITY_TOP + PSIZE + 1;
          if (g.frame % 120 === 0) setNarr('> CHECKPOINT — You cannot enter the wasteland without a PASSPORT. Obtain one at PABLO CORP. NORTH or the PRINT SHOP. [ƒ12,000 FIAT]');
        }
        // ── Natural border collision: mountains N/S, water W/E ──
        nx = Math.max(BORDER + PSIZE, Math.min(W - BORDER - PSIZE, nx));
        g.px = nx;
        g.py = Math.max(BORDER + PSIZE, Math.min(H - BORDER - PSIZE, ny));
        if (dx !== 0 || dy !== 0) {
          stepFrame.current++;
          g.walkFrame = (g.walkFrame + 1) % 28;
          if (stepFrame.current % 14 === 0) sfxStep();
        } else {
          g.walkFrame = 0;
        }
      }

      for (const t of g.threats) {
        t.timer--;
        const dist = Math.hypot(g.px - t.x, g.py - t.y);

        // ── Zone enforcement: major threats cannot enter MINX CITY ──────────
        const CITY_WALL_NORTH = CITY_TOP + 40;
        const CITY_WALL_SOUTH = CITY_BOTTOM - 40;
        const isMajorThreat = ['IRON_RATS','VOID_DOGS','STATIC_MONKS','EASTERN_BLOC','MUTANT','RAIDER','BORDER_GANG'].includes(t.type);
        const isSpy = t.type === 'SPY';
        const inCity = t.y > CITY_WALL_NORTH && t.y < CITY_WALL_SOUTH;
        if (isMajorThreat && inCity) {
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
            t.dx = Math.cos(ang) * 0.2; t.dy = Math.sin(ang) * 0.2;
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

        // ── Conditional hostility based on player class & territory ──────────
        const pClass = char.class.toLowerCase();
        const factionMap: Record<string,string> = { IRON_RATS:'iron_rats', VOID_DOGS:'void_dogs', STATIC_MONKS:'static_monks', EASTERN_BLOC:'eastern_bloc', MINX_CITY:'minx_city' };
        const hasFaction = t.type in factionMap;
        const threatInOwnZone = hasFaction && GANG_ZONES.some(gz => {
          return factionMap[t.type] === gz.id && t.x >= gz.x && t.x <= gz.x + gz.w && t.y >= gz.y && t.y <= gz.y + gz.h;
        });
        const playerInThreatZone = hasFaction && GANG_ZONES.some(gz => {
          return factionMap[t.type] === gz.id && g.px >= gz.x && g.px <= gz.x + gz.w && g.py >= gz.y && g.py <= gz.y + gz.h;
        });

        let hostilityMult = 1.0;
        if (hasFaction) {
          if (!threatInOwnZone) {
            hostilityMult = 0;
          } else if (pClass === 'corporate') {
            hostilityMult = playerInThreatZone ? 3.0 : 0;
          } else if (pClass === 'outcast') {
            hostilityMult = playerInThreatZone ? 0.3 : 0;
          } else if (pClass === 'replicant') {
            hostilityMult = playerInThreatZone ? 0.35 : 0;
          } else {
            hostilityMult = playerInThreatZone ? 0.6 : 0;
          }
        } else {
          if (pClass === 'corporate') hostilityMult = 1.2;
          else if (pClass === 'outcast') hostilityMult = 0.5;
          else if (pClass === 'replicant') hostilityMult = 0.6;
          else hostilityMult = 0.8;
        }

        // ── Speed tuning (slower, more deliberate) ───────────────────────────
        const baseAggroRange = isSpy ? 55 : (t.type === 'PROWLER' || t.type === 'BORDER_GANG') ? 35 : 45;
        const aggroRange = baseAggroRange * hostilityMult;
        const chaseSpeed  = isSpy ? 0.55 : (t.type === 'PROWLER' || t.type === 'BORDER_GANG') ? 0.28 : (['RAIDER','EASTERN_BLOC'].includes(t.type) ? 0.32 : 0.25);
        const wanderSpeed = isSpy ? 0.2 : 0.1;
        const canAggro = g.py > CITY_BOTTOM - 200 || g.py < CITY_TOP + 200;

        const shouldAggro = canAggro && dist < aggroRange && !npcDialogRef.current && hostilityMult > 0.1;

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

        if (t.behavior === 'HOSTILE' && dist < 14 && g.invincible === 0 && !npcDialogRef.current) {
          const armorMult = g.ownedItems.has('armor_plate') ? 0.85 : 1;
          g.hp = Math.max(0, g.hp - 0.25 * armorMult); g.invincible = 70; g.flash = 6;
          if (!g.poisoned && (t.type === 'MUTANT' || t.type === 'STATIC_MONKS') && Math.random() < 0.08) {
            g.poisoned = true; g.poisonTick = 0;
            sfxPoison(); setPoisoned(true); setNarr('> POISONED — HP drains slowly. Find the SAVE POINT or an antidote.');
          }
          if (g.hasDevice && !g.deviceBroken && Math.random() < 0.03) {
            g.deviceDurability = Math.max(0, g.deviceDurability - 35);
            if (g.deviceDurability <= 0) {
              g.deviceBroken = true; setDeviceBroken(true);
              setNarr('> DEVICE DAMAGED — Your personal terminal took a hit. Screen cracked. Find a PUBLIC TERMINAL or repair at DR. WRIGHT\'S (ƒ5,000).');
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

      // Periodic Pablo Corp cleanup sweep narrations (every ~3000 frames if threats in city)
      const cityThreats = g.threats.filter(t => !PASSIVE_THREATS.has(t.type) && t.y > CITY_TOP - 80 && t.y < CITY_BOTTOM + 80);
      if (g.frame % 3000 === 0 && cityThreats.length > 0) {
        const sectors = ['SECTOR 3', 'SECTOR 7', 'NORTH GRID', 'PLAZA DISTRICT', 'CORP ALLEY', 'SOUTH MESH'];
        const sector = sectors[Math.floor(g.frame / 3000) % sectors.length];
        setNarr(`> PABLO CORP BROADCAST: "Cleanup Unit dispatched to ${sector}. Citizens are advised to clear the area. Non-compliance will be logged."`);
      }
      if (g.frame % 5400 === 600 && cityThreats.length > 3) {
        setNarr('> PABLO CORP SECURITY: Elevated threat activity detected in MINX CITY. Strike teams deployed. Stand by.');
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

        // Wide-area scan for any city threat (400px range) — overrides only if closer
        for (let ti = 0; ti < g.threats.length; ti++) {
          const t = g.threats[ti];
          if (PASSIVE_THREATS.has(t.type)) continue;
          if (t.y >= CITY_THREAT_SCAN_Y) continue;
          const d = Math.hypot(guard.x - t.x, guard.y - t.y);
          if (d < 400 && d < nearestDist) { nearestThreat = t; nearestDist = d; guard.huntTarget = ti; }
        }

        if (nearestThreat) {
          // Aggressive pursuit — fast sprint toward target
          const ang = Math.atan2(nearestThreat.y - guard.y, nearestThreat.x - guard.x);
          const spd = nearestDist > 60 ? 1.5 : 1.1;
          guard.x += Math.cos(ang) * spd;
          guard.y += Math.sin(ang) * spd;
          // Engage in melee
          if (nearestDist < 18 && g.guardCooldowns[gi] === 0) {
            g.guardCooldowns[gi] = 28;
            nearestThreat.hp -= 20;
            g.floaters.push({ x: nearestThreat.x, y: nearestThreat.y - 8, text: '[ CORP HIT ]', color: '#4488ff', life: 38, maxLife: 38 });
            if (nearestThreat.hp <= 0) {
              g.floaters.push({ x: nearestThreat.x, y: nearestThreat.y - 16, text: '[ ELIMINATED ]', color: '#00ff41', life: 90, maxLife: 90 });
              g.threatRespawn.push({ ox: nearestThreat.ox, oy: nearestThreat.oy, type: nearestThreat.type, at: g.frame + 1800 });
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
            guard.x += (gdx / gdist) * 0.55;
            guard.y += (gdy / gdist) * 0.55;
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
                const bountyAmt = BOUNTY[t.type] ?? 10;
                g.salary += bountyAmt; setSalary(g.salary);
                g.floaters.push({ x: t.x, y: t.y, text: `+ƒ${bountyAmt.toLocaleString()}`, color: '#ffdd44', life: 55, maxLife: 55 });
                const earned = THREAT_EXP[t.type] ?? 20;
                g.floaters.push({ x: t.x + 8, y: t.y - 10, text: `+${earned}XP`, color: '#44ffaa', life: 50, maxLife: 50 });
                let newExp = g.exp + earned; let newLevel = g.level;
                while (newLevel < EXP_TABLE.length && newExp >= expToLevel(newLevel)) {
                  newExp -= expToLevel(newLevel); newLevel++;
                  g.maxHp += 10; g.hp = Math.min(g.maxHp, g.hp + 10);
                  sfxLevelUp();
                }
                g.exp = newExp; g.level = newLevel;
                setExp(newExp); setLevel(newLevel); setHp(Math.floor(g.hp));
                g.threatRespawn.push({ ox: t.ox, oy: t.oy, type: t.type, at: g.frame + 420 });
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
        const currentZone = (g.py < CITY_TOP || g.py > CITY_BOTTOM) ? 'WASTELAND' : 'MINX CITY';
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
        // ── Auto-respawn at SAFE HOUSE ──────────────────────────────────
        const emergencyFee = 5000;
        g.hp = g.maxHp; g.hunger = 60; g.thirst = 60; g.energy = 60;
        g.poisoned = false; g.poisonTick = 0; g.invincible = 240; g.flash = 0;
        g.px = 1135; g.py = 682;
        g.salary = Math.max(-50000, g.salary - emergencyFee);
        g.threats = g.threats.map(t => ({ ...t }));
        setSalary(g.salary); setHp(Math.floor(g.hp));
        setHunger(Math.floor(g.hunger)); setThirst(Math.floor(g.thirst)); setEnergy(Math.floor(g.energy));
        setPoisoned(false);
        g.floaters.push({ x: 1135, y: 662, text: `−ƒ${emergencyFee.toLocaleString()} RECOVERY`, color: '#ff6666', life: 120, maxLife: 120 });
        addBankTx('SAFE HOUSE RECOVERY', -emergencyFee, g.salary);
        sfxHeal();
        const debtNote = g.salary < 0 ? ` You're ƒ${Math.abs(g.salary).toLocaleString()} in debt.` : '';
        setNarr(`> DEAD. You wake up at your bed in the SAFE HOUSE. RIPLEY patched you up — ƒ${emergencyFee.toLocaleString()} FIAT deducted for medical supplies. "You were gone for a minute there," she says. "Don't make it a habit."${debtNote}`);
      }
      if (g.hp > 0 && lastDead) lastDead = false;
      if (g.hp !== lastHp) { lastHp = g.hp; setHp(Math.floor(g.hp)); }
      if (g.salary !== lastSal) { lastSal = g.salary; setSalary(g.salary); }

      const zoom = zoomRef.current;
      const cw = canvas.width / zoom, ch = canvas.height / zoom;
      g.cam.x = Math.max(0, Math.min(W - cw, g.px - cw / 2));
      g.cam.y = Math.max(0, Math.min(H - ch, g.py - ch / 2));
      const ox = -g.cam.x, oy = -g.cam.y;

      ctx.save();
      ctx.scale(zoom, zoom);

      // Proximity check — buildings
      let nb: string | null = null;
      for (const b of BUILDINGS) { if (Math.hypot(g.px - (b.x + b.w / 2), g.py - (b.y + b.h / 2)) < RANGE + (b.id === 'pablo_tower' ? 40 : 0)) { nb = b.id; break; } }
      g.near = nb;
      if (nb !== lastNear) {
        if (lastNear && RADIO_BUILDINGS.has(lastNear) && (!nb || !RADIO_BUILDINGS.has(nb))) {
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
      if (!nb) { for (let i = 0; i < NPCS.length; i++) { if (Math.hypot(g.px - NPCS[i].x, g.py - NPCS[i].y) < NPC_RANGE) { nn = i; break; } } }
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
          const nearEnemy = g.threats.find(t => Math.hypot(g.px - t.x, g.py - t.y) < 90);
          if (nearEnemy) {
            const typeLabel = nearEnemy.type.replace(/_/g, ' ');
            setNarr(`> ${typeLabel} [HP: ${Math.floor(nearEnemy.hp)}/${nearEnemy.maxHp}] — [Space] melee · [Click] shoot. Bounty: ƒ${(BOUNTY[nearEnemy.type] ?? 1000).toLocaleString()}.`);
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

      const newZone = (g.py >= CITY_TOP && g.py <= CITY_BOTTOM) ? 'MINX CITY' : 'WASTELAND';
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
          if (newGang === 'minx_city') setNarr('> MINX CITY TERRITORY — The dominant faction. Their purple banners hang from every ruin. SENIOR PABLO\'s reach extends even here. The other gangs operate in their shadow. "Everything south of the wall belongs to Minx City," the soldiers say. "Everything north too. They just don\'t know it yet."');
          else if (newGang === 'iron_rats') setNarr('> IRON RATS TERRITORY — Spray-paint everywhere: GAME OVER / NO CONTINUES. These are RIZER\'s old crew. He doesn\'t claim them anymore.');
          else if (newGang === 'void_dogs') setNarr('> VOID DOGS TERRITORY — They broadcast static on loop. The code in the static is an old Famicom game. Nobody has decoded it. Nobody that lived, anyway.');
          else if (newGang === 'static_monks') setNarr('> STATIC MONKS TERRITORY — Silent. They move like shadows. ERDRICK says they guard something buried here from before the collapse. Before even the games.');
          else if (newGang === 'eastern_bloc') setNarr('> EASTERN BLOC TERRITORY — They don\'t speak. They don\'t negotiate. MOTOKO tracked their signal origin back to a server in SHADOW TOWER. Nobody was surprised.');
        }
      }

      // Survival tick — every 360 frames (~6s)
      g.survivalTick++;
      if (g.survivalTick >= 360) {
        g.survivalTick = 0;
        const inWaste = g.py < CITY_TOP || g.py > CITY_BOTTOM;
        const cs2 = CLASS_STATS[char.class.toLowerCase()] ?? CLASS_STATS.corporate;
        const wasteMultiplier = (cs2.wasteBonus && inWaste) ? 0.6 : 1.0;
        const hDrain = (inWaste ? 2.5 : 1.5) * wasteMultiplier;
        const tDrain = (inWaste ? 3.0 : 2.0) * wasteMultiplier;
        const eDrain = char.class.toLowerCase() === 'replicant' ? 0 : ((inWaste ? 1.5 : 1.0) * wasteMultiplier);
        g.hunger = Math.max(0, g.hunger - hDrain);
        g.thirst = Math.max(0, g.thirst - tDrain);
        g.energy = Math.max(0, g.energy - eDrain);
        if (g.hunger <= 0 || g.thirst <= 0) { g.hp = Math.max(0, g.hp - 2); }
        if (g.energy <= 20) { g.salary = Math.max(0, g.salary - 500); }
        setHunger(Math.floor(g.hunger)); setThirst(Math.floor(g.thirst)); setEnergy(Math.floor(g.energy));

        // ── ECONOMY: Periodic income by class ─────────────────────────────
        g.incomeTick++;
        const cls = char.class.toLowerCase();
        const INCOME_INTERVAL = cls === 'corporate' ? 5 : cls === 'replicant' ? 8 : 10;
        const INCOME_AMOUNT   = cls === 'corporate' ? 2500 : cls === 'replicant' ? 1200 : 600;
        const INCOME_LABEL    = cls === 'corporate' ? 'SALARY DIRECT DEPOSIT' : cls === 'replicant' ? 'GIG PAYMENT PROCESSED' : 'SCAVENGING YIELD';
        if (g.incomeTick >= INCOME_INTERVAL) {
          g.incomeTick = 0;
          const bonus = cls === 'outcast' && inWaste ? Math.floor(Math.random() * 400) : 0;
          const total = INCOME_AMOUNT + bonus;
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
          setNarr('> KONAMI BANK ALERT — Your loan is overdue. PABLO Corp. Debt Collection is now active. ƒ' + penalty.toLocaleString() + ' FIAT deducted. Repay at KONAMI BANK immediately.');
        }

        // ── OREGON TRAIL RANDOM EVENTS (every 12 survival ticks ≈ 72s) ────
        g.oregonTick++;
        if (g.oregonTick >= 12 && Math.random() < 0.35) {
          g.oregonTick = 0;
          const inWaste2 = g.py < CITY_TOP || g.py > CITY_BOTTOM;
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
            () => { g.hp = Math.max(1, g.hp - 25); setHp(Math.floor(g.hp)); sfxError(); return '> ACID RAIN — Wasteland squall. Unprotected exposure. HP −25. Find shelter.'; },
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

      // ── LIVING WORLD: Police patrol movement ────────────────────────────
      for (let pi = 0; pi < g.police.length; pi++) {
        const p = g.police[pi];
        if (!g.policeCooldowns[pi]) g.policeCooldowns[pi] = 0;
        if (g.policeCooldowns[pi] > 0) g.policeCooldowns[pi]--;
        const route = POLICE_ROUTES[p.routeIdx];
        const next  = (p.wpIdx + 1) % route.length;
        const wpA   = route[p.wpIdx], wpB = route[next];
        p.progress  += 0.003;
        if (p.progress >= 1) { p.progress = 0; p.wpIdx = next; }
        p.x = wpA.x + (wpB.x - wpA.x) * p.progress;
        p.y = wpA.y + (wpB.y - wpA.y) * p.progress;
        if (p.y >= CITY_TOP && p.y <= CITY_BOTTOM && g.policeCooldowns[pi] <= 0) {
          for (let ti = 0; ti < g.threats.length; ti++) {
            const t = g.threats[ti];
            if (PASSIVE_THREATS.has(t.type) || t.type === 'PABLO_GUARD') continue;
            if (t.y < CITY_TOP || t.y > CITY_BOTTOM) continue;
            const dx = t.x - p.x, dy = t.y - p.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 120) {
              const dmg = 12 + Math.random() * 8;
              t.hp -= dmg;
              g.policeCooldowns[pi] = 45;
              g.floaters.push({ x: t.x, y: t.y - 10, text: `−${Math.floor(dmg)} POLICE`, color: '#4488ff', life: 40, maxLife: 40 });
              if (t.hp <= 0) {
                g.floaters.push({ x: t.x, y: t.y - 18, text: `${t.type} NEUTRALIZED`, color: '#4488ff', life: 60, maxLife: 60 });
                g.threats.splice(ti, 1); ti--;
              }
              break;
            }
          }
        }
      }

      // ── LIVING WORLD: Random fire events (reduced ~1/3 of original rate) ──
      g.fireTick++;
      if (g.fireTick >= 2700 && Math.random() < 0.003) {
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
      // Power grid darkness overlay (before everything else)
      const pwDark = (100 - g.powerLevel) / 100;
      ctx.fillStyle = `rgba(0,0,0,${pwDark * 0.7})`; ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#030803'; ctx.fillRect(0, 0, cw, ch);

      // Isometric diamond grid
      ctx.strokeStyle = 'rgba(0,255,65,.04)'; ctx.lineWidth = 1;
      const isoHW = TILE * 0.7, isoHH = TILE * 0.35;
      const sgx = Math.floor(g.cam.x / TILE) * TILE, sgy = Math.floor(g.cam.y / TILE) * TILE;
      ctx.beginPath();
      for (let gx = sgx - TILE; gx < g.cam.x + cw + TILE * 2; gx += TILE) {
        for (let gy = sgy - TILE; gy < g.cam.y + ch + TILE * 2; gy += TILE) {
          const cx = gx + TILE / 2 + ox, cy = gy + TILE / 2 + oy;
          if (cx < -TILE || cx > cw + TILE || cy < -TILE || cy > ch + TILE) continue;
          ctx.moveTo(cx, cy - isoHH);
          ctx.lineTo(cx + isoHW, cy);
          ctx.lineTo(cx, cy + isoHH);
          ctx.lineTo(cx - isoHW, cy);
          ctx.closePath();
        }
      }
      ctx.stroke();

      // ── Natural terrain borders (mountains N/S, water W/E) ──────────────
      const drawBorderTerrain = () => {
        const northEdge = BORDER + oy;
        const southEdge = (H - BORDER) + oy;
        const westEdge = BORDER + ox;
        const eastEdge = (W - BORDER) + ox;

        // North mountains
        if (northEdge > -40) {
          const grad = ctx.createLinearGradient(0, northEdge - 60, 0, northEdge + 20);
          grad.addColorStop(0, 'rgba(60,50,40,.9)');
          grad.addColorStop(0.6, 'rgba(80,70,55,.7)');
          grad.addColorStop(1, 'rgba(40,35,25,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, Math.max(0, oy), cw, northEdge - oy + 20);
          ctx.strokeStyle = 'rgba(120,100,70,.4)'; ctx.lineWidth = 2;
          ctx.beginPath();
          for (let mx = 0; mx < cw; mx += 30) {
            const peakH = 15 + Math.sin(mx * 0.05) * 10 + Math.cos(mx * 0.03) * 5;
            ctx.lineTo(mx, northEdge - peakH);
          }
          ctx.stroke();
        }
        // South mountains
        if (southEdge < ch + 40) {
          const grad = ctx.createLinearGradient(0, southEdge - 20, 0, southEdge + 60);
          grad.addColorStop(0, 'rgba(40,35,25,0)');
          grad.addColorStop(0.4, 'rgba(80,70,55,.7)');
          grad.addColorStop(1, 'rgba(60,50,40,.9)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, southEdge - 20, cw, ch - southEdge + 80);
          ctx.strokeStyle = 'rgba(120,100,70,.4)'; ctx.lineWidth = 2;
          ctx.beginPath();
          for (let mx = 0; mx < cw; mx += 30) {
            const peakH = 15 + Math.sin(mx * 0.04 + 1) * 10 + Math.cos(mx * 0.06) * 5;
            ctx.lineTo(mx, southEdge + peakH);
          }
          ctx.stroke();
        }
        // West water
        if (westEdge > -40) {
          const grad = ctx.createLinearGradient(westEdge - 60, 0, westEdge + 15, 0);
          grad.addColorStop(0, 'rgba(0,20,60,.85)');
          grad.addColorStop(0.7, 'rgba(0,40,80,.5)');
          grad.addColorStop(1, 'rgba(0,20,40,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(Math.max(0, ox), 0, westEdge - ox + 15, ch);
          ctx.strokeStyle = 'rgba(0,120,200,.3)'; ctx.lineWidth = 1;
          const waveT = g.frame * 0.02;
          ctx.beginPath();
          for (let wy = 0; wy < ch; wy += 4) { ctx.lineTo(westEdge + Math.sin(wy * 0.08 + waveT) * 4, wy); }
          ctx.stroke();
        }
        // East water
        if (eastEdge < cw + 40) {
          const grad = ctx.createLinearGradient(eastEdge - 15, 0, eastEdge + 60, 0);
          grad.addColorStop(0, 'rgba(0,20,40,0)');
          grad.addColorStop(0.3, 'rgba(0,40,80,.5)');
          grad.addColorStop(1, 'rgba(0,20,60,.85)');
          ctx.fillStyle = grad;
          ctx.fillRect(eastEdge - 15, 0, cw - eastEdge + 75, ch);
          ctx.strokeStyle = 'rgba(0,120,200,.3)'; ctx.lineWidth = 1;
          const waveT = g.frame * 0.02;
          ctx.beginPath();
          for (let wy = 0; wy < ch; wy += 4) { ctx.lineTo(eastEdge + Math.sin(wy * 0.08 + waveT + 2) * 4, wy); }
          ctx.stroke();
        }
      };
      drawBorderTerrain();

      // Zone dividers (city top & bottom borders)
      const cityTopY = CITY_TOP + oy;
      const cityBotY = CITY_BOTTOM + oy;
      ctx.strokeStyle = 'rgba(0,255,65,.1)'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1;
      if (cityTopY > 0 && cityTopY < ch) {
        ctx.beginPath(); ctx.moveTo(0, cityTopY); ctx.lineTo(cw, cityTopY); ctx.stroke();
        ctx.fillStyle = 'rgba(255,130,50,.15)'; ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center';
        ctx.fillText('── NORTH WASTELAND ──', cw / 2, cityTopY - 5);
      }
      if (cityBotY > 0 && cityBotY < ch) {
        ctx.beginPath(); ctx.moveTo(0, cityBotY); ctx.lineTo(cw, cityBotY); ctx.stroke();
        ctx.fillStyle = 'rgba(255,130,50,.15)'; ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center';
        ctx.fillText('── SOUTH WASTELAND ──', cw / 2, cityBotY + 12);
      }
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,255,65,.02)'; ctx.font = '56px "VT323"'; ctx.textAlign = 'center';
      ctx.fillText((g.py >= CITY_TOP && g.py <= CITY_BOTTOM) ? 'MINX CITY' : 'WASTELAND', cw / 2, ch / 2);

      // Gang territory zones
      for (const gz of GANG_ZONES) {
        const gx = gz.x + ox, gy = gz.y + oy;
        if (gx + gz.w < 0 || gx > cw || gy + gz.h < 0 || gy > ch) continue;
        ctx.fillStyle = gz.color;
        ctx.fillRect(gx, gy, gz.w, gz.h);
        ctx.strokeStyle = gz.border;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.strokeRect(gx, gy, gz.w, gz.h);
        ctx.setLineDash([]);
        ctx.fillStyle = gz.border;
        ctx.font = '7px "Share Tech Mono"';
        ctx.textAlign = 'center';
        ctx.fillText(gz.label, gx + gz.w / 2, gy + 12);
      }

      // Roads — city grid + wasteland trails
      const drawRoad = (x1:number,y1:number,x2:number,y2:number,w:number,alpha:number,dashed=false) => {
        ctx.lineWidth = w; ctx.strokeStyle = `rgba(0,40,10,${alpha})`;
        if (dashed) ctx.setLineDash([18,10]); else ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(x1+ox,y1+oy); ctx.lineTo(x2+ox,y2+oy); ctx.stroke();
        // Center stripe
        ctx.setLineDash([12,8]); ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(0,255,65,${alpha*.35})`;
        ctx.beginPath(); ctx.moveTo(x1+ox,y1+oy); ctx.lineTo(x2+ox,y2+oy); ctx.stroke();
        ctx.setLineDash([]);
      };
      // Horizontal city avenues (shifted +1425)
      drawRoad(0,1710,W,1710,22,.10);
      drawRoad(0,2115,W,2115,20,.09);
      drawRoad(0,2535,W,2535,18,.08);
      drawRoad(0,1905,W,1905,12,.06);
      drawRoad(0,2250,W,2250,12,.06);
      // Vertical city streets
      drawRoad(480,CITY_TOP,480,CITY_BOTTOM+40,14,.08);
      drawRoad(1050,CITY_TOP,1050,CITY_BOTTOM+40,16,.09);
      drawRoad(1650,CITY_TOP,1650,CITY_BOTTOM+40,14,.07);
      drawRoad(2250,CITY_TOP,2250,CITY_BOTTOM+40,14,.07);
      drawRoad(2850,CITY_TOP,2850,CITY_BOTTOM+40,14,.07);
      drawRoad(3300,CITY_TOP,3300,CITY_BOTTOM+40,12,.06);
      // North wasteland trails (dashed, dimmer)
      drawRoad(0,600,W,600,10,.04,true);
      drawRoad(0,1050,W,1050,8,.03,true);
      drawRoad(570,BORDER,570,CITY_TOP,8,.04,true);
      drawRoad(1350,BORDER,1350,CITY_TOP,8,.04,true);
      drawRoad(2400,BORDER,2400,CITY_TOP,8,.04,true);
      // South wasteland trails (dashed, dimmer)
      drawRoad(0,3200,W,3200,10,.04,true);
      drawRoad(0,3700,W,3700,8,.03,true);
      drawRoad(570,CITY_BOTTOM,570,H-BORDER,8,.04,true);
      drawRoad(1350,CITY_BOTTOM,1350,H-BORDER,8,.04,true);
      drawRoad(2400,CITY_BOTTOM,2400,H-BORDER,8,.04,true);

      // ── Street lights ──────────────────────────────────────────────────────
      const LAMP_SPACING = 90;
      // Light roads (horizontal avenues + vertical streets)
      const lampRoads = [
        { horiz: true,  coord: 1710, from: 0,    to: W },
        { horiz: true,  coord: 1905, from: 0,    to: W },
        { horiz: true,  coord: 2115, from: 0,    to: W },
        { horiz: true,  coord: 2250, from: 0,    to: W },
        { horiz: true,  coord: 2535, from: 0,    to: W },
        { horiz: false, coord: 480,  from: CITY_TOP, to: CITY_BOTTOM },
        { horiz: false, coord: 1050, from: CITY_TOP, to: CITY_BOTTOM },
        { horiz: false, coord: 1650, from: CITY_TOP, to: CITY_BOTTOM },
        { horiz: false, coord: 2250, from: CITY_TOP, to: CITY_BOTTOM },
        { horiz: false, coord: 2850, from: CITY_TOP, to: CITY_BOTTOM },
        { horiz: false, coord: 3750, from: CITY_TOP, to: CITY_BOTTOM },
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
          const brightness = flickerChance ? 0.05 : (0.55 + seed * 0.2) * pwr;
          if (brightness < 0.05) continue;
          const wc = Math.floor(brightness * 255);
          const warmR = Math.min(255, wc + 40), warmG = Math.min(255, wc + 30), warmB = Math.max(0, wc - 60);
          // Lamp post pole
          ctx.strokeStyle = `rgba(0,60,10,${brightness * 0.6})`; ctx.lineWidth = 1;
          ctx.beginPath();
          if (lr.horiz) { ctx.moveTo(lx, ly + (side > 0 ? -14 : 14)); ctx.lineTo(lx, ly); }
          else           { ctx.moveTo(lx + (side > 0 ? -14 : 14), ly); ctx.lineTo(lx, ly); }
          ctx.stroke();
          // Glow halo
          const glowR = ctx.createRadialGradient(lx, ly, 0, lx, ly, 22 * brightness);
          glowR.addColorStop(0, `rgba(${warmR},${warmG},${warmB},${brightness * 0.45})`);
          glowR.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = glowR; ctx.beginPath(); ctx.arc(lx, ly, 22 * brightness, 0, Math.PI*2); ctx.fill();
          // Bulb
          ctx.fillStyle = `rgba(${warmR},${warmG},${warmB},${brightness})`;
          ctx.shadowColor = `rgba(${warmR},${warmG},${warmB},${brightness})`; ctx.shadowBlur = 6 * brightness;
          ctx.beginPath(); ctx.arc(lx, ly, 2, 0, Math.PI*2); ctx.fill();
          ctx.shadowBlur = 0;
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
            ctx.fillStyle = `rgba(0,255,65,${0.12 + pulse2 * 0.08})`;
            ctx.fillRect(bx, by, b.w, b.h);
            ctx.strokeStyle = `rgba(0,255,65,${0.5 + pulse2 * 0.3})`;
            ctx.lineWidth = 1.5; ctx.strokeRect(bx, by, b.w, b.h);
            ctx.fillStyle = `rgba(0,255,65,${0.6 + pulse2 * 0.3})`;
            ctx.fillRect(cx2 - 3, by + 3, 6, 8);
            ctx.shadowBlur = 0;
            ctx.fillStyle = `rgba(0,255,65,${0.5 + pulse2 * 0.3})`;
            ctx.font = '6px "Share Tech Mono"'; ctx.textAlign = 'center';
            ctx.fillText(b.label === 'PAYPHONE' ? '☎' : '▣', cx2, cy2 + 6);
          }
          if (isNear) { ctx.fillStyle = g.blink ? 'rgba(0,255,65,.9)' : 'rgba(0,255,65,.35)'; ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center'; ctx.fillText('[E] TERMINAL', cx2, by - 6); }
          ctx.shadowBlur = 0;
          continue;
        }

        // ── Default building rendering (2.5D with depth faces) ────────────
        const bd = BUILDING_DEPTH;
        const baseCol = isLocked ? [255,120,50] : b.bright ? [0,255,65] : [0,180,50];
        const [cr,cg,cb] = baseCol;
        const topA = isNear ? .12 : .06;
        const frontA = isNear ? .08 : .04;
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${topA})`; ctx.fillRect(bx, by, b.w, b.h);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${frontA})`;
        ctx.beginPath(); ctx.moveTo(bx, by + b.h); ctx.lineTo(bx + bd * 0.5, by + b.h + bd * 0.5);
        ctx.lineTo(bx + b.w + bd * 0.5, by + b.h + bd * 0.5); ctx.lineTo(bx + b.w, by + b.h); ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${frontA * 0.7})`;
        ctx.beginPath(); ctx.moveTo(bx + b.w, by); ctx.lineTo(bx + b.w + bd * 0.5, by + bd * 0.5);
        ctx.lineTo(bx + b.w + bd * 0.5, by + b.h + bd * 0.5); ctx.lineTo(bx + b.w, by + b.h); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${isNear ? .8 : .3})`;
        ctx.lineWidth = isNear ? 2 : 1; ctx.strokeRect(bx, by, b.w, b.h);
        ctx.beginPath(); ctx.moveTo(bx, by + b.h); ctx.lineTo(bx + bd * 0.5, by + b.h + bd * 0.5);
        ctx.lineTo(bx + b.w + bd * 0.5, by + b.h + bd * 0.5); ctx.lineTo(bx + b.w, by + b.h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx + b.w, by); ctx.lineTo(bx + b.w + bd * 0.5, by + bd * 0.5);
        ctx.lineTo(bx + b.w + bd * 0.5, by + b.h + bd * 0.5); ctx.stroke();
        const cs = 7; ctx.lineWidth = 1.5;
        ctx.strokeStyle = isLocked ? 'rgba(255,120,50,.5)' : b.bright ? 'rgba(0,255,65,.7)' : 'rgba(0,200,50,.38)';
        [[bx, by, 1, 1], [bx + b.w, by, -1, 1], [bx, by + b.h, 1, -1], [bx + b.w, by + b.h, -1, -1]].forEach(([cx2, cy2, sx, sy]) => {
          ctx.beginPath(); ctx.moveTo(cx2, cy2 + (sy as number) * cs); ctx.lineTo(cx2, cy2); ctx.lineTo(cx2 + (sx as number) * cs, cy2); ctx.stroke();
        });
        ctx.fillStyle = isLocked ? 'rgba(255,140,60,.7)' : b.bright ? (isNear ? '#00ff41' : 'rgba(0,255,65,.6)') : 'rgba(0,200,50,.42)';
        ctx.font = `${b.bright ? 10 : 9}px "Share Tech Mono"`; ctx.textAlign = 'center';
        ctx.fillText(b.label + (isLocked ? ' 🔒' : ''), bx + b.w / 2, by + b.h / 2 + 4);
        const costLbl = BUILDING_COST_LABEL[b.id];
        if (costLbl && !isLocked) {
          ctx.font = '7px "Share Tech Mono"';
          ctx.fillStyle = costLbl === 'FREE' ? 'rgba(0,255,65,.5)' : costLbl === 'SHOP' ? 'rgba(255,200,60,.5)' : 'rgba(255,200,60,.6)';
          ctx.fillText(costLbl, bx + b.w / 2, by + b.h / 2 + 14);
        }
        if (isNear) { ctx.fillStyle = g.blink ? 'rgba(0,255,65,.85)' : 'rgba(0,255,65,.3)'; ctx.font = '8px "Share Tech Mono"'; ctx.fillText('[E]', bx + b.w / 2, by - 7); }
      }

      // NPCs — pixel sprite bodies
      for (let ni = 0; ni < NPCS.length; ni++) {
        const n = NPCS[ni];
        const nx2 = n.x + ox, ny2 = n.y + oy;
        if (nx2 < -14 || nx2 > cw + 14 || ny2 < -14 || ny2 > ch + 14) continue;
        const nDist = Math.hypot(g.px - n.x, g.py - n.y);
        const isNearNpc = nDist < NPC_RANGE;
        const nCol = NPC_COL[n.type] ?? '#009922';
        ctx.shadowColor = nCol; ctx.shadowBlur = isNearNpc ? 6 : 0;
        const isFemale = (n as { gender?: string }).gender === 'f';
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.beginPath(); ctx.ellipse(nx2, ny2 + 8, 5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
        if (isFemale) {
          // Female sprite
          ctx.fillStyle = '#c8906c'; ctx.beginPath(); ctx.arc(nx2, ny2 - 7, 3, 0, Math.PI * 2); ctx.fill(); // head
          ctx.fillStyle = nCol; ctx.fillRect(nx2 - 2, ny2 - 3, 5, 5); // torso
          // Hair bun
          ctx.fillStyle = '#553322'; ctx.fillRect(nx2 - 3, ny2 - 12, 7, 3); ctx.beginPath(); ctx.arc(nx2, ny2 - 12, 2, 0, Math.PI * 2); ctx.fill();
          // Skirt
          ctx.fillStyle = nCol; ctx.beginPath(); ctx.moveTo(nx2 - 4, ny2 + 2); ctx.lineTo(nx2 + 5, ny2 + 2); ctx.lineTo(nx2 + 6, ny2 + 8); ctx.lineTo(nx2 - 5, ny2 + 8); ctx.closePath(); ctx.fill();
        } else {
          // Male sprite
          ctx.fillStyle = '#c8906c'; ctx.beginPath(); ctx.arc(nx2, ny2 - 7, 3, 0, Math.PI * 2); ctx.fill(); // head
          ctx.fillStyle = nCol; ctx.fillRect(nx2 - 4, ny2 - 4, 8, 6); // torso (wider)
          // Pants / legs
          ctx.fillStyle = '#223322'; ctx.fillRect(nx2 - 4, ny2 + 2, 3, 5); ctx.fillRect(nx2 + 1, ny2 + 2, 3, 5);
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
      }

      // Online players
      for (const [, op] of g.peers) {
        const px2 = op.x + ox, py2 = op.y + oy;
        if (px2 < -20 || px2 > cw + 20 || py2 < -20 || py2 > ch + 20) continue;
        const spk = g.speakingSet.has(op.id);
        if (spk) { ctx.shadowColor = 'rgba(0,255,180,.6)'; ctx.shadowBlur = 10; }
        ctx.fillStyle = spk ? '#00ffcc' : '#44aaff';
        ctx.beginPath(); ctx.moveTo(px2, py2 - 9); ctx.lineTo(px2 + 6, py2 + 5); ctx.lineTo(px2 - 6, py2 + 5); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = 'bold 13px "Share Tech Mono"'; ctx.textAlign = 'center';
        const opNm = op.name;
        const opTw = ctx.measureText(opNm).width;
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.beginPath(); ctx.roundRect(px2 - opTw / 2 - 5, py2 - 24, opTw + 10, 16, 4); ctx.fill();
        ctx.fillStyle = spk ? '#00ffcc' : 'rgba(100,180,255,.7)';
        ctx.fillText(opNm, px2, py2 - 12);
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
        } else if (t.type === 'IRON_RATS') {
          // X shape
          ctx.lineWidth=2.5; ctx.strokeStyle = tc;
          ctx.beginPath(); ctx.moveTo(tx-5,ty-5); ctx.lineTo(tx+5,ty+5); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(tx+5,ty-5); ctx.lineTo(tx-5,ty+5); ctx.stroke();
          ctx.beginPath(); ctx.arc(tx,ty,3,0,Math.PI*2); ctx.fill(); // center
        } else if (t.type === 'VOID_DOGS') {
          // Low dog-like shape
          ctx.fillRect(tx-6,ty-2,12,5); // body
          ctx.fillRect(tx-6,ty+3,2,3); ctx.fillRect(tx-2,ty+3,2,3); // front legs
          ctx.fillRect(tx+2,ty+3,2,3); ctx.fillRect(tx+4,ty+3,2,3); // back legs
          ctx.fillRect(tx-8,ty-4,3,4); // head
          ctx.fillRect(tx+5,ty-3,4,2); // tail
        } else if (t.type === 'STATIC_MONKS') {
          // Cross / plus
          ctx.fillRect(tx-1,ty-7,3,14); ctx.fillRect(tx-6,ty-1,13,3);
          ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.arc(tx,ty,2,0,Math.PI*2); ctx.fill();
        } else if (t.type === 'EASTERN_BLOC') {
          // Armored triangle
          ctx.beginPath(); ctx.moveTo(tx,ty-8); ctx.lineTo(tx+7,ty+6); ctx.lineTo(tx-7,ty+6); ctx.closePath(); ctx.fill();
          ctx.fillStyle='rgba(255,255,255,.2)'; ctx.fillRect(tx-2,ty-3,4,7);
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

      // Player — full pixel body sprite
      const px = g.px + ox, py2 = g.py + oy;
      const isFlash = g.invincible % 4 < 2;
      const pcol = isFlash ? (g.poisoned ? '#88ff44' : '#00ff41') : 'rgba(0,255,65,.2)';
      const bodyAlpha = isFlash ? 1 : 0.3;
      ctx.globalAlpha = bodyAlpha;
      ctx.shadowColor = g.poisoned ? '#88ff44' : '#00ff41'; ctx.shadowBlur = 12;
      // Ground shadow
      ctx.globalAlpha = bodyAlpha * 0.3; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(px, py2 + 9, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = bodyAlpha;
      // Boots + Legs (walk animation)
      const wf = g.walkFrame;
      const lLeg = Math.sin(wf / 28 * Math.PI * 2) * 3; // left leg swing
      const rLeg = -lLeg; // right leg swings opposite
      ctx.fillStyle = '#224422';
      ctx.fillRect(px - 6, py2 + 4 + lLeg, 4, 5); // left boot
      ctx.fillRect(px + 2, py2 + 4 + rLeg, 4, 5); // right boot
      ctx.fillStyle = '#335533';
      ctx.fillRect(px - 5, py2 - 1 + lLeg * 0.5, 4, 6); // left leg
      ctx.fillRect(px + 1, py2 - 1 + rLeg * 0.5, 4, 6); // right leg
      // Body / jacket
      ctx.fillStyle = g.poisoned ? '#557722' : pcol;
      ctx.fillRect(px - 7, py2 - 9, 14, 9);
      // Collar accent
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(px - 2, py2 - 9, 4, 3);
      // Arms
      ctx.fillStyle = g.poisoned ? '#557722' : pcol;
      ctx.fillRect(px - 10, py2 - 8, 3, 7); ctx.fillRect(px + 7, py2 - 8, 3, 7);
      // Head
      ctx.fillStyle = '#d4906a'; ctx.beginPath(); ctx.arc(px, py2 - 15, 5, 0, Math.PI * 2); ctx.fill();
      // Hair
      ctx.fillStyle = '#332211'; ctx.fillRect(px - 5, py2 - 21, 10, 5);
      ctx.beginPath(); ctx.arc(px, py2 - 20, 3, 0, Math.PI * 2); ctx.fill();
      // Eyes
      ctx.fillStyle = '#000'; ctx.fillRect(px - 3, py2 - 16, 2, 2); ctx.fillRect(px + 1, py2 - 16, 2, 2);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
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
      const fogRevealRadius = 3;
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
            ctx.fillStyle = 'rgba(0,0,0,.7)';
            ctx.fillRect(sx, sy, FOG_TILE, FOG_TILE);
          }
        }
      }
      ctx.restore();

      // ── Day/night cycle overlay ─────────────────────────────────────────────
      const wh = g.worldTime;
      let nightAlpha = 0;
      if (wh >= 20 || wh < 4) nightAlpha = 0.35;
      else if (wh >= 18) nightAlpha = 0.35 * ((wh - 18) / 2);
      else if (wh < 6) nightAlpha = 0.35 * ((6 - wh) / 2);
      if (nightAlpha > 0) {
        ctx.fillStyle = `rgba(10,10,40,${nightAlpha})`;
        ctx.fillRect(0, 0, cw, ch);
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
            mctx.fillStyle = 'rgba(255,220,30,.75)'; mctx.shadowColor = 'rgba(255,220,30,.4)'; mctx.shadowBlur = 3;
            mctx.beginPath(); mctx.arc(toMX(n.x), toMY(n.y), 2.2, 0, Math.PI * 2); mctx.fill();
          }
          mctx.shadowBlur = 0;

          const tPulse = Math.sin(g.frame * 0.12) * 0.4 + 0.6;
          for (const t of g.threats) {
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

          // Fog of war — mark visited cells
          const fogCell = 40;
          const visitR = 80;
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
                mctx.fillStyle = 'rgba(0,0,0,.7)';
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

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize); canvas.removeEventListener('wheel', onWheel); };
  }, [char, speaking]);

  const hpPct = hp;
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

      {/* BOTTOM-LEFT — minimap canvas + player identity + stats */}
      <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', background: 'rgba(0,8,0,.92)', border: '1px solid rgba(0,255,65,.45)', padding: '.3rem .6rem' }}>
          <div style={{ width: 6, height: 6, background: '#00ff41', boxShadow: '0 0 6px rgba(0,255,65,.7)' }} />
          <span style={{ fontFamily: "'VT323',monospace", fontSize: '1rem', color: '#00ff41', letterSpacing: '.1em' }}>{char.name}</span>
          <span style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.65)', letterSpacing: '.08em', borderLeft: '1px solid rgba(0,255,65,.35)', paddingLeft: '.45rem' }}>{char.class.toUpperCase()}</span>
          {hasDevice && !deviceBroken && <span style={{ fontSize: '.55rem', color: '#00ff41', border: '1px solid rgba(0,255,65,.5)', padding: '1px 4px' }}>PABLO</span>}
          {hasDevice && deviceBroken && <span style={{ fontSize: '.55rem', color: '#ff4444', border: '1px solid rgba(255,68,68,.5)', padding: '1px 4px' }}>DAMAGED</span>}
          {char.hasBusiness === false && <span style={{ fontSize: '.55rem', color: 'rgba(255,100,100,.8)', border: '1px solid rgba(255,60,60,.3)', padding: '1px 4px', animation: 'none' }}>UNSAVED</span>}
        </div>
        <div style={{ display: 'flex', gap: '3px' }}>
          {/* HP */}
          <div style={{ background: 'rgba(0,8,0,.92)', border: '1px solid rgba(0,255,65,.38)', padding: '.25rem .5rem', minWidth: 90 }}>
            <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.6)', letterSpacing: '.12em', marginBottom: '3px' }}>HP</div>
            <div style={{ position: 'relative', height: 4, background: 'rgba(0,255,65,.15)', width: '100%' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${hpPct}%`, background: hpPct > 50 ? '#00ff41' : hpPct > 25 ? '#aaff44' : '#ff4444', boxShadow: `0 0 4px ${hpPct > 50 ? 'rgba(0,255,65,.5)' : 'rgba(255,0,0,.5)'}`, transition: 'width .2s, background .2s' }} />
            </div>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '.75rem', color: hpPct > 50 ? '#00ff41' : hpPct > 25 ? '#aaff44' : '#ff4444', letterSpacing: '.06em', marginTop: '2px' }}>{Math.floor(hpPct)}/100</div>
          </div>
          {/* Salary */}
          <div style={{ background: 'rgba(0,8,0,.92)', border: '1px solid rgba(0,255,65,.38)', padding: '.25rem .5rem' }}>
            <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.6)', letterSpacing: '.12em', marginBottom: '3px' }}>FIAT</div>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '.75rem', color: '#00ff41', letterSpacing: '.06em', marginTop: '2px', whiteSpace: 'nowrap' }}>ƒ{salary.toLocaleString()}</div>
          </div>
          {/* Zone */}
          <div style={{ background: 'rgba(0,8,0,.92)', border: `1px solid ${zone === 'WASTELAND' ? 'rgba(170,255,68,.45)' : 'rgba(0,255,65,.38)'}`, padding: '.25rem .5rem' }}>
            <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.6)', letterSpacing: '.12em', marginBottom: '3px' }}>ZONE</div>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '.75rem', color: zone === 'WASTELAND' ? '#88ff44' : '#00ff41', letterSpacing: '.06em', marginTop: '2px' }}>{zone}</div>
          </div>
          <div style={{ background: 'rgba(0,8,0,.92)', border: `1px solid ${(() => { const h = gs.current.worldTime; return (h >= 6 && h < 18) ? 'rgba(255,200,50,.45)' : 'rgba(100,120,255,.45)'; })()}`, padding: '.25rem .5rem' }}>
            <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.6)', letterSpacing: '.12em', marginBottom: '3px' }}>TIME</div>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '.75rem', color: (() => { const h = gs.current.worldTime; return (h >= 6 && h < 18) ? '#ffcc44' : '#8899ff'; })(), letterSpacing: '.06em', marginTop: '2px' }}>
              {String(Math.floor(gs.current.worldTime)).padStart(2,'0')}:{String(Math.floor((gs.current.worldTime % 1) * 60)).padStart(2,'0')} {gs.current.worldTime >= 6 && gs.current.worldTime < 18 ? '☀' : '☾'}
            </div>
          </div>
        </div>
        {/* Survival meters */}
        <div style={{ display: 'flex', gap: '3px', marginTop: '3px' }}>
          {[
            { label: 'HUNGER', val: hunger, col: hunger > 50 ? '#00ff41' : hunger > 25 ? '#aaff22' : '#ff6622' },
            { label: 'THIRST', val: thirst, col: thirst > 50 ? '#33aaff' : thirst > 25 ? '#aaff22' : '#ff6622' },
            { label: 'ENERGY', val: energy, col: energy > 50 ? '#ffcc00' : energy > 25 ? '#aaff22' : '#ff4444' },
          ].map(({ label, val, col }) => (
            <div key={label} style={{ background: 'rgba(0,8,0,.92)', border: '1px solid rgba(0,255,65,.32)', padding: '.22rem .45rem', minWidth: 68 }}>
              <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.58)', letterSpacing: '.1em', marginBottom: '2px' }}>{label}</div>
              <div style={{ position: 'relative', height: 3, background: 'rgba(0,255,65,.14)' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${val}%`, background: col, transition: 'width .3s, background .3s' }} />
              </div>
              <div style={{ fontFamily: "'VT323',monospace", fontSize: '.8rem', color: col, letterSpacing: '.04em', marginTop: '1px' }}>{val}</div>
            </div>
          ))}
        </div>
        {/* Level / EXP / Poison row */}
        <div style={{ display: 'flex', gap: '3px', marginTop: '3px' }}>
          <div style={{ background: 'rgba(0,8,0,.92)', border: '1px solid rgba(0,255,65,.32)', padding: '.22rem .45rem', minWidth: 50 }}>
            <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.58)', letterSpacing: '.1em', marginBottom: '2px' }}>LVL</div>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '.8rem', color: '#ffcc00', letterSpacing: '.06em' }}>{level}</div>
          </div>
          <div style={{ background: 'rgba(0,8,0,.92)', border: '1px solid rgba(0,255,65,.32)', padding: '.22rem .45rem', flex: 1 }}>
            <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.58)', letterSpacing: '.1em', marginBottom: '2px' }}>EXP</div>
            <div style={{ position: 'relative', height: 3, background: 'rgba(0,255,65,.14)', marginBottom: '1px' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${Math.min(100, (exp / expToLevel(level)) * 100)}%`, background: '#ffcc00', transition: 'width .4s' }} />
            </div>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '.6rem', color: '#ffcc00', letterSpacing: '.04em' }}>{exp}/{expToLevel(level)}</div>
          </div>
          {poisoned && (
            <div style={{ background: 'rgba(0,6,0,.82)', border: '1px solid rgba(136,255,68,.4)', padding: '.22rem .5rem', animation: 'smblink 0.7s step-end infinite' }}>
              <div style={{ fontFamily: "'VT323',monospace", fontSize: '.7rem', color: '#88ff44', letterSpacing: '.1em' }}>PSN</div>
            </div>
          )}
        </div>
        {/* Gang zone indicator */}
        {gangZone && (
          <div style={{ marginTop: '3px', background: 'rgba(0,6,0,.82)', border: `1px solid ${GANG_ZONES.find(g => g.id === gangZone)?.border ?? 'rgba(255,60,60,.3)'}`, padding: '.2rem .5rem' }}>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '.75rem', color: GANG_ZONES.find(g => g.id === gangZone)?.threat ?? '#ff4444', letterSpacing: '.1em' }}>
              ⚠ {GANG_ZONES.find(g => g.id === gangZone)?.name} TERRITORY
            </div>
          </div>
        )}
        {/* Dog companion HUD */}
        {dogActive && (
          <div style={{ marginTop: '3px', background: 'rgba(0,6,0,.92)', border: `1px solid ${dogInjured ? 'rgba(255,68,68,.45)' : 'rgba(255,170,68,.45)'}`, padding: '.22rem .5rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <span style={{ fontSize: '.7rem' }}>🐾</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'VT323',monospace", fontSize: '.7rem', color: dogInjured ? '#ff4444' : '#ffaa44', letterSpacing: '.08em' }}>
                {dogName} {dogInjured && '— INJURED'}
              </div>
              {!dogInjured && (
                <>
                  <div style={{ position: 'relative', height: 3, background: 'rgba(255,170,68,.15)', marginTop: '2px' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${(dogHp / DOG_MAX_HP) * 100}%`, background: (dogHp / DOG_MAX_HP) > 0.5 ? '#ffaa44' : (dogHp / DOG_MAX_HP) > 0.25 ? '#ff8800' : '#ff4444', transition: 'width .2s' }} />
                  </div>
                  <div style={{ fontFamily: "'VT323',monospace", fontSize: '.55rem', color: '#ffaa44', marginTop: '1px' }}>{dogHp}/{DOG_MAX_HP}</div>
                </>
              )}
              {dogInjured && (
                <div style={{ fontSize: '.55rem', color: 'rgba(255,68,68,.7)', letterSpacing: '.06em', marginTop: '1px' }}>Needs rest or clinic</div>
              )}
            </div>
          </div>
        )}
        {/* Minimap canvas */}
        <canvas ref={minimapRef} width={360} height={360} style={{ width: 360, height: 360, borderRadius: '50%', marginTop: 4, boxShadow: '0 0 16px rgba(0,255,65,.15)' }} />
      </div>

      {/* TOP-RIGHT — Chat / Menu / Pablo AI dropdown */}
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 150, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
        <button
          onClick={() => setShowTopMenu(v => !v)}
          style={{
            padding: '.45rem .8rem',
            background: showTopMenu ? 'rgba(0,255,65,.1)' : 'rgba(0,5,0,.92)',
            border: `1px solid ${showTopMenu ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.25)'}`,
            color: showTopMenu ? '#00ff41' : 'rgba(0,255,65,.55)',
            cursor: 'pointer',
            fontFamily: "'VT323',monospace",
            fontSize: '1rem',
            letterSpacing: '.1em',
          }}
        >
          ☰ MENU {unread > 0 && <span style={{ display: 'inline-block', width: 7, height: 7, background: '#ff4444', borderRadius: '50%', marginLeft: 4 }} />}
        </button>
        {showTopMenu && (
          <div style={{ width: 180, background: 'rgba(0,5,0,.97)', border: '1px solid rgba(0,255,65,.35)', padding: '.4rem' }}>
            <button onClick={() => { setChatOpen(v => { chatOpenRef.current = !v; return !v; }); setUnread(0); setShowTopMenu(false); }} style={{ width: '100%', padding: '.4rem .6rem', marginBottom: 3, background: chatOpen ? 'rgba(0,255,65,.1)' : 'transparent', border: chatOpen ? '1px solid rgba(0,255,65,.4)' : '1px solid rgba(0,255,65,.15)', color: chatOpen ? '#00ff41' : 'rgba(0,255,65,.55)', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left', position: 'relative' }}>
              💬 CHAT [C]{unread > 0 && <span style={{ position: 'absolute', top: 4, right: 6, width: 6, height: 6, background: '#ff4444', borderRadius: '50%' }} />}
            </button>
            <button onClick={() => {
              const g = gs.current;
              if (g.hasDevice && !g.deviceBroken) { setShowPablo(v => !v); setShowTopMenu(false); }
              else if (g.hasDevice && g.deviceBroken) { setNarr('> DEVICE DAMAGED — Find a PUBLIC TERMINAL or repair at DR. WRIGHT\'S.'); setShowTopMenu(false); }
              else { setNarr('> NO DEVICE — Find a PUBLIC TERMINAL and press [E].'); setShowTopMenu(false); }
            }} style={{ width: '100%', padding: '.4rem .6rem', marginBottom: 3, background: showPablo ? 'rgba(0,255,65,.1)' : 'transparent', border: showPablo ? '1px solid rgba(0,255,65,.4)' : '1px solid rgba(0,255,65,.15)', color: showPablo ? '#00ff41' : (hasDevice && !deviceBroken) ? 'rgba(0,255,65,.6)' : 'rgba(255,68,68,.5)', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left' }}>
              🤖 PABLO AI [P]{deviceBroken ? ' ⚠' : ''}
            </button>
            <button onClick={() => { setShowMap(v => !v); setShowTopMenu(false); }} style={{ width: '100%', padding: '.4rem .6rem', marginBottom: 3, background: showMap ? 'rgba(0,255,65,.1)' : 'transparent', border: showMap ? '1px solid rgba(0,255,65,.4)' : '1px solid rgba(0,255,65,.15)', color: showMap ? '#00ff41' : 'rgba(0,255,65,.55)', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left' }}>
              🗺 MAP [M]
            </button>
            <button onClick={() => { setShowStats(v => !v); setShowTopMenu(false); }} style={{ width: '100%', padding: '.4rem .6rem', marginBottom: 3, background: showStats ? 'rgba(255,170,0,.08)' : 'transparent', border: showStats ? '1px solid rgba(255,170,0,.3)' : '1px solid rgba(0,255,65,.15)', color: showStats ? '#ffaa00' : 'rgba(0,255,65,.55)', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left' }}>
              📊 STATS
            </button>
            <button onClick={toggleVoice} style={{ width: '100%', padding: '.4rem .6rem', marginBottom: 3, background: voice ? 'rgba(0,255,65,.08)' : 'transparent', border: '1px solid rgba(0,255,65,.15)', color: voice ? (speaking ? '#00ffcc' : '#00ff41') : 'rgba(0,255,65,.55)', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left' }}>
              🎙 {voice ? (speaking ? '● MIC' : '○ MIC') : 'MIC [V]'}
            </button>
            <button onClick={() => { const m = toggleMute(); setMuted(m); }} style={{ width: '100%', padding: '.4rem .6rem', marginBottom: 3, background: muted ? 'rgba(255,34,102,.06)' : 'transparent', border: '1px solid rgba(0,255,65,.15)', color: muted ? '#ff2266' : 'rgba(0,255,65,.55)', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left' }}>
              {muted ? '🔇 MUTE' : '♪ SND'}
            </button>
            <div style={{ borderTop: '1px solid rgba(0,255,65,.12)', marginTop: 3, paddingTop: 5 }}>
              <button onClick={() => { sessionStorage.setItem('sm_show_saves', '1'); doSaveRef.current(buildSaveData()); navigate('/world'); }} style={{ width: '100%', padding: '.4rem .6rem', background: 'transparent', border: '1px solid rgba(0,255,65,.15)', color: 'rgba(0,255,65,.45)', cursor: 'pointer', fontSize: '.7rem', letterSpacing: '.06em', fontFamily: "'Share Tech Mono',monospace", textAlign: 'left' }}>
                ← MAIN MENU
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

      {/* BOTTOM-CENTER — narration bar */}
      <div style={{ position: 'absolute', bottom: 10, left: 290, right: 230, zIndex: 100, pointerEvents: 'none' }}>
        <div style={{ background: 'rgba(0,8,0,.92)', border: '1px solid rgba(0,255,65,.4)', padding: '.5rem .75rem' }}>
          {nearB && (
            <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.6)', letterSpacing: '.12em', marginBottom: '.2rem' }}>
              NEARBY: {nearB.label}{lockMap.has(nearB.id) ? ' 🔒' : ''}
            </div>
          )}
          <div style={{ fontSize: '.8rem', color: 'rgba(0,255,65,.88)', letterSpacing: '.04em', lineHeight: 1.5 }}>{narration}</div>
          <div style={{ marginTop: '.3rem', fontSize: '.55rem', color: 'rgba(0,255,65,.42)', letterSpacing: '.08em' }}>WASD move · E enter · Space melee · Click shoot · C chat · V voice · P device · ESC close</div>
        </div>
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
          <button onClick={() => { sessionStorage.setItem('sm_show_saves', '1'); navigate('/world'); }} style={{ marginTop: '.5rem', padding: '.65rem 1.5rem', background: 'rgba(255,80,80,.08)', border: '1px solid rgba(255,80,80,.4)', color: '#ff8888', fontFamily: "'VT323',monospace", fontSize: '1.2rem', letterSpacing: '.15em', cursor: 'pointer' }}>← BACK TO MENU</button>
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
                  g.dogCompanion.lastZone = (g.py < CITY_TOP || g.py > CITY_BOTTOM) ? 'WASTELAND' : 'MINX CITY';
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
        <div style={{ position: 'absolute', bottom: 120, left: 10, width: 280, maxHeight: '42vh', background: 'rgba(0,5,0,.97)', border: '1px solid rgba(0,255,65,.3)', display: 'flex', flexDirection: 'column', zIndex: 200 }}>
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

      {/* ── PABLO PANEL ── */}
      {showPablo && (() => {
        const g = gs.current;
        const VT: React.CSSProperties = { fontFamily: "'VT323',monospace" };
        const ST: React.CSSProperties = { fontFamily: "'Share Tech Mono',monospace" };
        const tabS = (active: boolean): React.CSSProperties => ({
          padding: '.3rem .75rem', border: active ? '1px solid rgba(0,255,65,.7)' : '1px solid rgba(0,255,65,.12)',
          background: active ? 'rgba(0,255,65,.08)' : 'transparent',
          color: active ? '#00ff41' : 'rgba(0,255,65,.3)', cursor: 'pointer', ...VT, fontSize: '1rem', letterSpacing: '.1em',
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
        const curZone = (g.py >= CITY_TOP && g.py <= CITY_BOTTOM) ? 'MINX CITY' : 'WASTELAND';

        return (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', zIndex: 250, paddingRight: '3%' }}
            onClick={e => { if (e.target === e.currentTarget) { setShowPablo(false); gs.current.atPublicTerminal = false; setAtPublicTerminal(false); } }}>
            <div style={{ width: 400, maxWidth: '88vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'rgba(0,5,0,.99)', border: '1px solid rgba(0,255,65,.5)', boxShadow: '0 0 40px rgba(0,255,65,.08)' }}>

              {/* ── Header ── */}
              <div style={{ padding: '.55rem .85rem', borderBottom: '1px solid rgba(0,255,65,.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                  <div style={{ ...VT, fontSize: '1.5rem', color: '#00ff41', letterSpacing: '.2em' }}>{atPublicTerminal ? 'PUBLIC TERMINAL' : 'PABLO DEVICE'}</div>
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
              <div style={{ display: 'flex', gap: '.25rem', padding: '.35rem .7rem', borderBottom: '1px solid rgba(0,255,65,.12)', flexShrink: 0 }}>
                {(['city','chat'] as const).map(t => (
                  <button key={t} onClick={() => setPabloTab(t)} style={tabS(pabloTab === t)}>
                    {t === 'city' ? '[ CITY INFO ]' : '[ CHAT ]'}
                  </button>
                ))}
              </div>

              {/* ── Body ── */}
              <div style={{ flex: 1, overflow: 'auto', padding: '.65rem .85rem' }}>

                {/* CITY INFO TAB */}
                {pabloTab === 'city' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                    <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.14em', marginBottom: '.15rem' }}>MINX CITY — NETWORK STATUS</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem' }}>
                      <StatRow label="SERVER" val="PST · ONLINE" col="#00ff41" />
                      <StatRow label="POPULATION" val="2.4M REGISTERED" />
                      <StatRow label="FACTION" val="PABLO CORP." col="#b400ff" />
                      <StatRow label="ECONOMY" val="ƒ FIAT STANDARD" col="#ffcc00" />
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
                        ▸ <span style={{ color: '#ff4444' }}>Interview Solver</span> — Real-time coding interview assistance<br/>
                        ▸ <span style={{ color: '#ff4444' }}>Screen Scanner</span> — Capture and analyze screen content<br/>
                        ▸ <span style={{ color: '#33aaff' }}>Voice Listener</span> — Live audio transcription<br/>
                        ▸ <span style={{ color: '#00ff41' }}>PABLO AI</span> — AI assistant (this terminal)
                      </div>
                    </div>
                    <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.15)', marginTop: '.25rem', lineHeight: 1.6 }}>
                      PABLO CORP. — 24 towers, 24 cities, one network. All transmissions logged. All terminals monitored.
                    </div>
                  </div>
                )}

                {/* CHAT TAB */}
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
                PABLO CORP. SURVEILLANCE UNIT v1.0 · ALL TRANSMISSIONS LOGGED · SENIOR PABLO IS WATCHING · ESC TO CLOSE
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
          <div style={{ width: 400, maxWidth: '90vw', border: '1px solid rgba(0,255,65,.55)', background: 'rgba(0,10,0,.98)', padding: '1.65rem' }}>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.7rem', color: '#00ff41', textShadow: '0 0 12px rgba(0,255,65,.4)', letterSpacing: '.15em', marginBottom: '.2rem' }}>PABLO DEVICE</div>
            <div style={{ fontSize: '.52rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.08em', marginBottom: '1.25rem' }}>REGISTERED — {char.name.toUpperCase()}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.55rem', marginBottom: '1.1rem' }}>
              {([['FREE', ['PABLO AI chat', 'World access']], ['PRO — $29/mo', ['PABLO AI Pro', 'Live Listen', 'Scan Screen', 'Say This', 'Contacts & CRM']]] as [string, string[]][]).map(([t, f]) => (
                <div key={t} style={{ border: t === 'FREE' ? '1px solid rgba(0,255,65,.15)' : '1px solid rgba(0,255,65,.5)', padding: '.7rem', background: t !== 'FREE' ? 'rgba(0,255,65,.05)' : 'transparent' }}>
                  <div style={{ fontFamily: "'VT323',monospace", fontSize: '.95rem', color: t === 'FREE' ? 'rgba(0,255,65,.45)' : '#00ff41', letterSpacing: '.1em', marginBottom: '.35rem' }}>{t}</div>
                  {f.map(ff => <div key={ff} style={{ fontSize: '.54rem', color: t === 'FREE' ? 'rgba(0,255,65,.32)' : 'rgba(0,255,65,.62)', lineHeight: 1.9 }}>▸ {ff}</div>)}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '.55rem' }}>
              <button onClick={() => { setShowStore(false); navigate('/upgrade'); }} style={{ flex: 1, padding: '.55rem', background: 'rgba(0,255,65,.1)', border: '1px solid rgba(0,255,65,.6)', color: '#00ff41', fontFamily: "'VT323',monospace", fontSize: '1rem', letterSpacing: '.15em', cursor: 'pointer' }}>UPGRADE $29/mo</button>
              <button onClick={() => { setShowStore(false); setNarr('> PABLO device active [FREE]. Press [P] to open it.'); }} style={{ padding: '.55rem .85rem', background: 'transparent', border: '1px solid rgba(0,255,65,.18)', color: 'rgba(0,255,65,.38)', fontFamily: "'VT323',monospace", fontSize: '.85rem', cursor: 'pointer' }}>FREE</button>
            </div>
          </div>
        </div>
      )}

      {/* ── SHADOW TOWER — OFFICE RENTAL ── */}
      {showOffice && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,3,0,.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ width: 460, maxWidth: '90vw', border: '1px solid rgba(140,0,220,.45)', background: 'rgba(6,0,12,.99)', padding: '1.65rem' }}>
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
                  <div style={{ fontSize: '.43rem', color: 'rgba(0,255,65,.6)', lineHeight: 1.7, marginTop: '.2rem', paddingTop: '.3rem', borderTop: '1px solid rgba(0,255,65,.12)' }}>
                    {fl.desc}
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
      <RadioPlayer playing={radioOn} mounted={playerEverMounted} />

      {/* ── CITY EVENT TICKER ── */}
      {cityEvent && (
        <div style={{ position: 'absolute', bottom: '3.8rem', left: '50%', transform: 'translateX(-50%)', zIndex: 180, fontFamily: "'Share Tech Mono',monospace", fontSize: '.55rem', color: 'rgba(100,200,255,.7)', letterSpacing: '.08em', whiteSpace: 'nowrap', pointerEvents: 'none', textShadow: '0 0 8px rgba(100,200,255,.3)' }}>
          {cityEvent}
        </div>
      )}

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

      {/* ── VEND-O-MATIC SHOP ─────────────────────────────────────────────── */}
      {showVend && (() => {
        const g = gs.current;
        const cat = VEND_CATALOG.find(c => c.id === vendTab) ?? VEND_CATALOG[0];
        const doVendBuy = (item: VendItem) => {
          if (g.salary < item.price) { sfxError(); setNarr(`> INSUFFICIENT FIAT — Need ƒ${item.price.toLocaleString()}.`); return; }
          if (item.id === 'pablo_device' && !g.hasDevice) { sfxError(); setNarr('> REPAIR KIT — You don\'t have a device to repair. Find one first.'); return; }
          if (item.id === 'pablo_device' && !g.deviceBroken) { sfxError(); setNarr('> REPAIR KIT — Your device is already working fine.'); return; }
          if (!item.consumable && g.ownedItems.has(item.id)) { sfxError(); setNarr(`> ALREADY OWNED — ${item.name} is in your inventory.`); return; }
          g.salary -= item.price; setSalary(g.salary); sfxCoin();
          // ── Apply effects ──────────────────────────────────────
          if (item.consumable) {
            if (item.id === 'pablo_device') {
              g.deviceBroken = false; g.deviceDurability = 100; setDeviceBroken(false);
              setNarr(`> VEND-O-MATIC — ${item.name} applied. Device restored to full durability. ƒ${item.price.toLocaleString()} FIAT spent.`);
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
            setNarr(`> VEND-O-MATIC — ${item.name} used. ƒ${item.price.toLocaleString()} FIAT spent.`);
            return;
          }
          // Non-consumable items
          g.ownedItems.add(item.id);
          setOwnedItems(new Set(g.ownedItems));
          if (item.id === 'netrunner_deck') { g.terminalDiscount = true; }
          if (VEHICLE_SPEED[item.id]) {
            const curSpd = g.vehicle ? (VEHICLE_SPEED[g.vehicle] ?? 1) : 1;
            if ((VEHICLE_SPEED[item.id] ?? 1) > curSpd) { g.vehicle = item.id; }
          }
          if (WEAPON_TIER[item.id] && (WEAPON_TIER[item.id] ?? 0) > g.weaponTier) {
            g.weaponTier = WEAPON_TIER[item.id] ?? 0;
          }
          if (item.id === 'salaryman_pro') { setShowVend(false); setShowStore(true); return; }
          if (REAL_ESTATE_INCOME[item.id]) { g.realEstate.push(item.id); }
          setNarr(`> VEND-O-MATIC — ${item.name} acquired. ƒ${item.price.toLocaleString()} FIAT spent. Check your inventory.`);
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
                  <div style={{ ...VT2, fontSize:'1.7rem', color:'#00ff41', letterSpacing:'.18em' }}>VEND-O-MATIC</div>
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
                    <div style={{ ...VT2, fontSize:'1.6rem', color:'#ff9900', letterSpacing:'.14em', marginBottom:'.4rem' }}>SALARYMAN PRO</div>
                    <div style={{ fontSize:'.52rem', color:'rgba(255,153,0,.65)', lineHeight:1.8, marginBottom:'.8rem' }}>
                      Full AI productivity suite. Unlimited AI access on all devices. Priority servers. Exclusive gear drops every month. Pro badge visible to all operatives in every zone. Removes all rate limits on Pablo Corp. terminals.
                    </div>
                    <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap', marginBottom:'.8rem' }}>
                      {['UNLIMITED AI ACCESS','PRIORITY SERVERS','MONTHLY GEAR DROPS','PRO BADGE','NO RATE LIMITS'].map(f => (
                        <span key={f} style={{ fontSize:'.42rem', color:'rgba(255,153,0,.55)', border:'1px solid rgba(255,153,0,.25)', padding:'2px 7px' }}>{f}</span>
                      ))}
                    </div>
                    <div style={{ display:'flex', gap:'1rem', alignItems:'center' }}>
                      <div style={{ ...VT2, fontSize:'1.5rem', color:'#ff9900' }}>$29 / MONTH</div>
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
                      const canAfford = g.salary >= item.price;
                      const isReEstate = cat.id === 'realestate';
                      const alreadyHas = !item.consumable && owned;
                      return (
                        <div key={item.id} style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:'.6rem', alignItems:'center', padding:'.6rem .7rem', border:`1px solid ${alreadyHas ? 'rgba(0,255,65,.25)' : 'rgba(0,255,65,.12)'}`, background: alreadyHas ? 'rgba(0,255,65,.04)' : 'transparent' }}>
                          <div>
                            <div style={{ display:'flex', alignItems:'center', gap:'.5rem', marginBottom:'.2rem' }}>
                              <span style={{ ...VT2, fontSize:'1.05rem', color: alreadyHas ? '#00ff41' : cat.col, letterSpacing:'.08em' }}>{item.name}</span>
                              {alreadyHas && <span style={{ fontSize:'.38rem', color:'rgba(0,255,65,.5)', border:'1px solid rgba(0,255,65,.25)', padding:'1px 5px' }}>OWNED</span>}
                              {isReEstate && <span style={{ fontSize:'.38rem', color:'rgba(204,68,255,.6)', border:'1px solid rgba(204,68,255,.2)', padding:'1px 5px' }}>PASSIVE INCOME</span>}
                              {item.consumable && <span style={{ fontSize:'.38rem', color:'rgba(0,255,65,.4)', border:'1px solid rgba(0,255,65,.15)', padding:'1px 5px' }}>CONSUMABLE</span>}
                            </div>
                            <div style={{ fontSize:'.46rem', color:'rgba(0,255,65,.4)', lineHeight:1.6 }}>{item.desc}</div>
                          </div>
                          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'.3rem', flexShrink:0 }}>
                            <div style={{ ...VT2, fontSize:'1rem', color: canAfford ? '#00ff41' : 'rgba(255,80,80,.6)' }}>ƒ{item.price.toLocaleString()}</div>
                            <button
                              onClick={() => doVendBuy(item)}
                              disabled={alreadyHas}
                              style={{ padding:'.25rem .7rem', background: alreadyHas ? 'transparent' : canAfford ? 'rgba(0,255,65,.1)' : 'transparent', border:`1px solid ${alreadyHas ? 'rgba(0,255,65,.15)' : canAfford ? 'rgba(0,255,65,.4)' : 'rgba(255,80,80,.3)'}`, color: alreadyHas ? 'rgba(0,255,65,.25)' : canAfford ? '#00ff41' : 'rgba(255,80,80,.5)', cursor: alreadyHas ? 'not-allowed' : 'pointer', ...VT2, fontSize:'.95rem', letterSpacing:'.08em', ...S2 }}>
                              {alreadyHas ? 'OWNED' : canAfford ? 'BUY' : 'EARN FIAT'}
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
        const mapVR = 300, mapVRy = 250;
        const vbX = Math.max(0, Math.min(W - mapVR * 2, gs.current.px - mapVR));
        const vbY = Math.max(0, Math.min(H - mapVRy * 2, gs.current.py - mapVRy));
        return (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 360 }}
          onClick={() => setShowMap(false)}>
          <div style={{ position: 'relative', width: '90vw', maxWidth: 1200, height: '80vh', display: 'flex', flexDirection: 'column', border: '1px solid rgba(0,255,65,.3)', background: 'rgba(0,6,2,.98)', padding: '1.2rem', fontFamily: "'Share Tech Mono',monospace", boxSizing: 'border-box' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.8rem', flexShrink: 0 }}>
              <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.8rem', color: '#00ff41', letterSpacing: '.2em' }}>MINX CITY MAP</div>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.1em' }}>SERVER: MINX CITY · PST</div>
                <button onClick={() => setShowMap(false)} style={{ padding: '.2rem .5rem', background: 'transparent', border: '1px solid rgba(0,255,65,.2)', color: 'rgba(0,255,65,.4)', cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace", fontSize: '.5rem' }}>ESC</button>
              </div>
            </div>
            <svg width="100%" style={{ flex: 1, display: 'block', border: '1px solid rgba(0,255,65,.1)', background: '#00020a' }} viewBox={`${vbX} ${vbY} ${mapVR * 2} ${mapVRy * 2}`} preserveAspectRatio="xMidYMid meet">
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
            </svg>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '.6rem', flexWrap: 'wrap', flexShrink: 0 }}>
              {[['#00ff41','CITY BUILDING'],['rgba(255,130,50,.6)','LOCKED'],['#00ccff','BILLBOARD'],['#ff4444','THREAT'],['#ffffaa','SPY'],['#5599ff','PABLO GUARD']].map(([c,l]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                  <div style={{ width: 8, height: 8, background: c, borderRadius: 1 }} />
                  <span style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.4)', letterSpacing: '.07em' }}>{l}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '.5rem', fontSize: '.55rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.07em', flexShrink: 0 }}>
              PLAYER: ({Math.round(gs.current.px)}, {Math.round(gs.current.py)}) · {zone} · LVL {level} · ƒ{salary.toLocaleString()} FIAT · [M] or [ESC] to close
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

      {/* ── WEAPONS WHEEL — bottom-right radial ──────────────────────────── */}
      <div style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 150, pointerEvents: 'all' }}>
        <div
          onClick={() => setShowWeapons(v => !v)}
          style={{
            width: 70, height: 70, borderRadius: '50%',
            background: showWeapons ? 'rgba(0,255,65,.12)' : 'rgba(0,5,0,.92)',
            border: `2px solid ${showWeapons ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.22)'}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 0 12px rgba(0,255,65,.1)',
          }}
        >
          <span style={{ fontFamily: "'VT323',monospace", fontSize: '1.4rem', color: WEAPONS.find(w => w.id === activeWeapon)?.color ?? '#00ff41', lineHeight: 1 }}>⚔</span>
          <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '.5rem', color: 'rgba(0,255,65,.5)', letterSpacing: '.05em', marginTop: 2 }}>{activeWeapon}</span>
        </div>
        {showWeapons && (() => {
          const iconMap: Record<string, string> = { fists: '✊', sword: '⚔', gun: '🔫', laser: '⚡', bomb: '💣' };
          const available = WEAPONS.filter(w => unlockedWeapons.has(w.id));
          const wheelR = 90;
          const count = available.length;
          return (
            <div style={{ position: 'absolute', bottom: 35, right: 35, width: 0, height: 0 }}>
              {available.map((w, i) => {
                const angle = (-Math.PI / 2) + (i / count) * Math.PI * 2;
                const x = Math.cos(angle) * wheelR;
                const y = Math.sin(angle) * wheelR;
                const isActive = activeWeapon === w.id;
                return (
                  <div
                    key={w.id}
                    onClick={() => { setActiveWeapon(w.id); activeWeaponRef.current = w.id; setShowWeapons(false); setNarr(`> EQUIPPED: ${w.label}. ${w.desc}`); }}
                    style={{
                      position: 'absolute',
                      left: x - 42, top: y - 24,
                      width: 84, textAlign: 'center',
                      padding: '.3rem .4rem',
                      background: isActive ? 'rgba(0,255,65,.15)' : 'rgba(0,5,0,.95)',
                      border: `1px solid ${isActive ? 'rgba(0,255,65,.6)' : 'rgba(0,255,65,.2)'}`,
                      borderRadius: 6, cursor: 'pointer',
                      boxShadow: isActive ? '0 0 10px rgba(0,255,65,.2)' : 'none',
                    }}
                  >
                    <div style={{ fontFamily: "'VT323',monospace", fontSize: '.8rem', color: w.color, letterSpacing: '.06em', whiteSpace: 'nowrap' }}>
                      {iconMap[w.icon] ?? '?'} {isActive ? '▸ ' : ''}{w.label}
                    </div>
                    <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.35)', marginTop: 1 }}>+{w.atkBonus} ATK · {w.type === 'melee' ? '[MELEE]' : '[RANGED]'}</div>
                  </div>
                );
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
                  <div style={{ fontSize:'.42rem', color:'rgba(0,255,65,.3)', letterSpacing:'.12em' }}>WEAPONS · UPGRADES · FIAT ONLY</div>
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
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 350, pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center', animation: 'smfade 3.2s ease-out forwards' }}>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: 'clamp(2rem,7vw,4.5rem)', color: '#ffcc00', textShadow: '0 0 40px rgba(255,200,0,.8), 0 0 80px rgba(255,200,0,.4)', letterSpacing: '.25em', whiteSpace: 'pre' }}>{levelUpText}</div>
          </div>
        </div>
      )}

      {/* ── KONAMI BANK TERMINAL ─────────────────────────────────────────── */}
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
          if (amt <= 0 || amt > g.salary) { sfxError(); setNarr('> KONAMI BANK — Insufficient checking balance.'); return; }
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
          if (amt <= 0 || amt > g.savings) { sfxError(); setNarr('> KONAMI BANK — Insufficient savings balance.'); return; }
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
                  <div style={{ ...VTB, fontSize: '1.9rem', color: '#00ff41', letterSpacing: '.25em' }}>K O N A M I   B A N K</div>
                  <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.14em' }}>MEMBER FDIC · EST. 1989 · PAX PABLO · MINX CITY BRANCH 01</div>
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
                      { label: 'CHECKING ACCOUNT', val: salary, sub: char.class === 'corporate' ? 'SALARY: +ƒ2,500 / 30s' : char.class === 'replicant' ? 'GIG PAY: +ƒ1,200 / 48s' : 'SCAVENGING: +ƒ600+ / 60s' },
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
                    Savings earn 0.8% APY per cycle (~3 min). PABLO Corp. takes 15% of all interest. Deposits ≥ ƒ5,000 subject to 12% Capital Deployment Tax. KONAMI BANK is not liable for seizures during martial law.
                  </div>
                </>)}

                {/* ── LOANS ── */}
                {bankTab === 'loans' && (<>
                  <div style={{ border: '1px solid rgba(0,255,65,.13)', padding: '.65rem' }}>
                    <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.12em', marginBottom: '.35rem' }}>CREDIT SERVICES — KONAMI BANK</div>
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
                <span>KONAMI BANK IS NOT RESPONSIBLE FOR DEPOSITS SEIZED BY PABLO CORP. DURING MARTIAL LAW PERIODS. ALL TRANSACTIONS FINAL.</span>
                <span>ESC TO CLOSE</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── DEATH ── */}
      {isDead && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, flexDirection: 'column', gap: '1rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: 'clamp(2.5rem, 8vw, 5rem)', color: '#ff2222', textShadow: '0 0 32px rgba(255,0,0,.6)', letterSpacing: '.2em', marginBottom: '.3rem', animation: 'none' }}>GAME OVER</div>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.3rem', color: 'rgba(255,80,80,.5)', letterSpacing: '.18em', marginBottom: '.5rem' }}>INSERT COIN TO CONTINUE</div>
            <div style={{ width: '100%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,0,0,.3), transparent)', marginBottom: '.8rem' }} />
            <div style={{ fontSize: '.55rem', color: 'rgba(255,80,80,.4)', letterSpacing: '.1em', marginBottom: '1rem', lineHeight: 2 }}>
              {char.name} — {char.class.toUpperCase()}<br/>
              HP: 0 · FIAT: ƒ{salary.toLocaleString()} · {zone}<br/>
              <span style={{ color: 'rgba(255,80,80,.25)' }}>DR. WRIGHT SAYS: "Even BELMONT respawned. Get back out there."</span>
            </div>
            <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center' }}>
              <button onClick={() => { const g = gs.current; g.hp = g.maxHp; g.hunger = 100; g.thirst = 100; g.energy = 100; g.poisoned = false; g.px = char.sx; g.py = char.sy; g.threats = THREATS_INIT.map(t => ({ ...t })); g.invincible = 180; setHp(g.maxHp); setHunger(100); setThirst(100); setEnergy(100); setPoisoned(false); setIsDead(false); setNarr('> Respawned. DR. WRIGHT patched you up for free this time. Don\'t make a habit of it.'); }} style={{ padding: '.65rem 1.8rem', background: 'rgba(255,0,0,.08)', border: '1px solid rgba(255,50,50,.5)', color: '#ff6666', fontFamily: "'VT323',monospace", fontSize: '1.5rem', letterSpacing: '.18em', cursor: 'pointer' }}>
                CONTINUE
              </button>
              <button onClick={() => { sessionStorage.setItem('sm_show_saves', '1'); navigate('/world'); }} style={{ padding: '.65rem 1.3rem', background: 'transparent', border: '1px solid rgba(255,50,50,.2)', color: 'rgba(255,80,80,.4)', fontFamily: "'VT323',monospace", fontSize: '1.5rem', letterSpacing: '.15em', cursor: 'pointer' }}>
                TITLE SCREEN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────── SUBWAY FAST TRAVEL ────────────────────────── */}
      {showSubway && (() => {
        const STATIONS = [
          { id: 'sub_west',    label: 'METRO WEST',    sub: 'Sector 1 · Industrial District', x: 280,  y: 540 },
          { id: 'sub_central', label: 'METRO CENTRAL', sub: 'Sector 4 · Commercial Hub',      x: 950,  y: 500 },
          { id: 'sub_east',    label: 'METRO EAST',    sub: 'Sector 7 · Corporate Row',       x: 1800, y: 540 },
          { id: 'sub_north',   label: 'METRO NORTH',   sub: 'North Quarter · Edge District',  x: 2400, y: 160 },
        ];
        const FARE = 800;
        const origin = STATIONS.find(s => s.id === subwayOrigin);
        const doRide = (dest: typeof STATIONS[0]) => {
          const g = gs.current;
          if (dest.id === subwayOrigin) { setNarr(`> METRO — You're already at ${dest.label}.`); setShowSubway(false); return; }
          if (g.salary < FARE) { sfxError(); setNarr(`> METRO — Insufficient FIAT. Fare is ƒ${FARE.toLocaleString()}. "No tokens, no transit."`); setShowSubway(false); return; }
          g.salary -= FARE; setSalary(g.salary);
          g.px = dest.x; g.py = dest.y;
          sfxEnter(); sfxCoin();
          setNarr(`> METRO — Departed ${origin?.label ?? '???'}. Arrived ${dest.label}. [−ƒ${FARE.toLocaleString()} FIAT] "PABLO CORP. MASS TRANSIT. SURVEILLANCE IN PROGRESS."`);
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

    </div>
  );
}
