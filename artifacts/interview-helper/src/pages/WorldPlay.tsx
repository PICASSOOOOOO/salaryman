import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  sfxAttack, sfxHit, sfxKill, sfxLevelUp, sfxStep, sfxEnter, sfxTalk,
  sfxSave, sfxPoison, sfxDeath, sfxHeal, sfxCoin, sfxKonami, sfxError,
  sfxZoneCross, initMusic, playMusic, pauseMusic, toggleMute, resumeAudioContext,
} from '../soundEngine';

// ── Constants ─────────────────────────────────────────────────────────────────
const W = 2400, H = 2000, TILE = 32, SPD = 2.5, PSIZE = 8, RANGE = 55;
const WASTELAND_Y = 800;

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

const BUILDINGS = [
  // ── RESIDENTIAL ─────────────────────────────────────────────────────────────
  { id: 'minx_arms',    x: 1060, y: 260, w: 110, h: 130, label: 'MINX ARMS',        bright: false },
  { id: 'eastside_flat',x: 1860, y: 380, w: 110, h: 120, label: 'EASTSIDE FLATS',   bright: false },
  // ── MINX CITY WEST ──────────────────────────────────────────────────────────
  { id: 'pablo_store',  x: 370, y: 310, w: 120, h: 70,  label: 'PABLO CORP.',      bright: true  },
  { id: 'pablo_tower',  x: 580, y:  40, w: 260, h: 230, label: 'PABLO TOWER',      bright: true  },
  { id: 'clinic',       x: 180, y: 370, w: 100, h: 70,  label: 'DR. WRIGHT\'S',    bright: false },
  { id: 'megabank',     x: 410, y: 420, w: 120, h: 80,  label: 'KONAMI BANK',      bright: false },
  { id: 'market',       x: 720, y: 360, w: 110, h: 70,  label: 'BLACK MARKET',     bright: false },
  { id: 'hotel',        x: 920, y: 190, w: 100, h: 120, label: 'HOTEL FAMICOM',    bright: false },
  { id: 'vend',         x: 920, y: 370, w: 60,  h: 60,  label: 'VEND-O-MATIC',    bright: true  },
  { id: 'crystal',      x: 488, y: 482, w: 28,  h: 28,  label: 'SAVE POINT',       bright: true  },
  { id: 'arcade',       x: 150, y: 590, w: 110, h: 75,  label: 'ARCADE \'87',      bright: true  },
  { id: 'bunker',       x: 300, y: 700, w: 130, h: 80,  label: 'BUNKER-09',        bright: false },
  { id: 'scrap',        x: 580, y: 720, w: 160, h: 70,  label: 'SCRAP YARD',       bright: false },
  { id: 'radio',        x: 820, y: 680, w: 100, h: 90,  label: 'PIRATE RADIO',     bright: false },
  { id: 'wily_lab',     x: 990, y: 760, w: 90,  h: 70,  label: 'WILY LABS',        bright: false },
  // ── MINX CITY EAST DISTRICT ─────────────────────────────────────────────────
  { id: 'dojo',         x: 1200, y: 130, w: 120, h: 90, label: 'IRON DOJO',        bright: false },
  { id: 'data_vault',   x: 1450, y: 190, w: 130, h: 80, label: 'DATA VAULT',       bright: true  },
  { id: 'nightclub',    x: 1700, y: 310, w: 110, h: 90, label: 'CLUB NEON',        bright: true  },
  { id: 'east_market',  x: 1200, y: 380, w: 110, h: 70, label: 'EAST BAZAAR',      bright: false },
  { id: 'east_clinic',  x: 1530, y: 440, w: 110, h: 70, label: 'EAST CLINIC',      bright: false },
  { id: 'armory',       x: 1890, y: 170, w: 110, h: 80, label: 'ARMORY',           bright: false },
  { id: 'crystal2',     x: 2040, y: 340, w: 28,  h: 28, label: 'SAVE POINT',       bright: true  },
  { id: 'print_shop',   x: 1360, y: 590, w: 100, h: 60, label: 'PRINT SHOP',       bright: false },
  { id: 'east_bunker',  x: 1700, y: 610, w: 110, h: 75, label: 'EAST BUNKER',      bright: false },
  { id: 'north_gate',   x: 2150, y: 490, w: 90,  h: 60, label: 'NORTH GATE',       bright: false },
  // ── HOSTELS / HOTELS / SHELTERS (city) ──────────────────────────────────────
  { id: 'hotel_midgar',  x: 100,  y: 140, w: 120, h: 90,  label: 'HOTEL MIDGAR',     bright: true  },
  { id: 'inn_mother',    x: 1150, y: 510, w: 100, h: 80,  label: 'MOTHER BASE INN',  bright: false },
  { id: 'overlook',      x: 2250, y: 600, w: 100, h: 85,  label: 'THE OVERLOOK',     bright: true  },
  { id: 'safe_house',    x: 1090, y: 650, w: 90,  h: 65,  label: 'SAFE HOUSE 7',     bright: false },
  // ── WASTELAND OUTPOSTS ───────────────────────────────────────────────────────
  { id: 'outpost_alpha', x: 140,  y: 960, w: 120, h: 80,  label: 'OUTPOST ALPHA',    bright: true  },
  { id: 'outpost_beta',  x: 1180, y:1100, w: 100, h: 70,  label: 'OUTPOST BETA',     bright: true  },
  { id: 'supply_cache',  x: 640,  y:1440, w: 130, h: 80,  label: 'SUPPLY CACHE',     bright: false },
  { id: 'deep_bunker',   x: 1840, y:1290, w: 120, h: 80,  label: 'DEEP BUNKER',      bright: false },
  { id: 'crystal3',      x:  990, y:1640, w: 28,  h: 28,  label: 'SAVE POINT',       bright: true  },
  // ── HOSTELS / SHELTERS (wasteland) ───────────────────────────────────────────
  { id: 'prancing_pony', x: 300,  y:1090, w: 110, h: 75,  label: 'THE PRANCING PONY',bright: true  },
  { id: 'zanarkand_inn', x: 760,  y:1270, w: 120, h: 80,  label: 'ZANARKAND HOSTEL', bright: false },
  { id: 'terminus',      x: 380,  y:1650, w: 120, h: 80,  label: 'TERMINUS SHELTER', bright: false },
  { id: 'fort_dracula',  x: 2100, y:1520, w: 100, h: 100, label: 'FORT DRACULA',     bright: true  },
  { id: 'waste_exchange',x: 780,  y:1500, w: 130, h: 80,  label: 'BLACK EXCHANGE',   bright: true  },
];

// ── Gang territories (wasteland) ──────────────────────────────────────────────
const GANG_ZONES = [
  { id: 'iron_rats',    name: 'IRON RATS',    x:   50, y:  820, w: 650, h: 900, color: 'rgba(255,60,60,.06)',  border: 'rgba(255,60,60,.22)',  threat: 'rgba(255,60,60,.7)',  label: '[ IRON RATS TERRITORY ]' },
  { id: 'void_dogs',    name: 'VOID DOGS',    x:  660, y:  860, w: 580, h: 780, color: 'rgba(255,140,0,.06)', border: 'rgba(255,140,0,.22)',  threat: 'rgba(255,140,0,.7)',  label: '[ VOID DOGS TERRITORY ]' },
  { id: 'static_monks', name: 'STATIC MONKS', x: 1210, y:  820, w: 620, h: 800, color: 'rgba(200,255,0,.05)', border: 'rgba(200,255,0,.18)',  threat: 'rgba(200,255,0,.65)', label: '[ STATIC MONKS TERRITORY ]' },
  { id: 'eastern_bloc', name: 'EASTERN BLOC', x: 1800, y:  870, w: 580, h: 920, color: 'rgba(60,100,255,.05)',border: 'rgba(60,100,255,.20)', threat: 'rgba(60,100,255,.65)',label: '[ EASTERN BLOC TERRITORY ]' },
];

const NPCS = [
  // ── City West ──
  { name: 'STRIFE',    x: 510,  y: 380,  type: 'corp',    gender: 'm', whisper: 'I used to work for Shin-Ra. Before the rebrand. Before PABLO Corp. absorbed what was left. Same tower. Different logo.' },
  { name: 'BROKER',    x: 760,  y: 320,  type: 'corp',    gender: 'm', whisper: 'SENIOR PABLO controls every credit in Minx City. The ones you earn. The ones you owe. All of them. He calls it a service.' },
  { name: 'REPLOID-7', x: 870,  y: 350,  type: 'android', gender: 'm', whisper: 'Directive 44-C still active. Function: monitor and report. I was built by a man named Light. SENIOR PABLO bought the patent in \'89.' },
  { name: 'BELMONT',   x: 300,  y: 460,  type: 'human',   gender: 'm', whisper: 'Up up, down down, left right, left right. I tried the code on every door in Minx City. Only SENIOR PABLO\'s locks won\'t open.' },
  { name: 'GUARD',     x: 560,  y: 300,  type: 'corp',    gender: 'm', whisper: 'Floor 40 and above. Permanent restriction. Don\'t ask who gave the order. Don\'t ask who lives there.' },
  { name: 'SAMUS',     x: 820,  y: 290,  type: 'android', gender: 'f', whisper: 'Bounty is active on someone called SENIOR PABLO. No face. No file. Contract pays in a currency I don\'t recognize. I\'m still deciding whether to take it.' },
  { name: 'SNAKE',     x: 660,  y: 510,  type: 'human',   gender: 'm', whisper: 'FOXHOUND was disbanded. That part\'s true. What nobody said was where we ended up. Or who we started working for.' },
  { name: 'MAEVE',     x: 350,  y: 200,  type: 'corp',    gender: 'f', whisper: 'I run six shell companies. Each one pays rent to a building owned by another shell company. Somewhere at the top of that chain is SENIOR PABLO. Always.' },
  { name: 'LINK',      x: 200,  y: 220,  type: 'human',   gender: 'm', whisper: 'I\'ve faced Ganon eight separate times. Each time reality reset. This feels different. No restart. No heart containers. Just the city.' },
  { name: 'JESSIE',    x: 1050, y: 400,  type: 'human',   gender: 'f', whisper: 'I build things and I blow things up. That\'s the whole skill set. In Minx City those turn out to be the same job.' },
  // ── City East ──
  { name: 'HIDEO',     x: 1320, y: 200,  type: 'corp',    gender: 'm', whisper: 'I designed thirty-seven games. Every one of them ended with a nuclear explosion. Someone told me recently SENIOR PABLO used three of them as operational blueprints.' },
  { name: 'WEDGE',     x: 1450, y: 330,  type: 'human',   gender: 'm', whisper: 'Me and Biggs were supposed to blow a reactor. Seems pointless now. The whole city is the reactor. SENIOR PABLO lit the fuse.' },
  { name: 'BIGGS',     x: 1600, y: 430,  type: 'human',   gender: 'm', whisper: 'Wedge says this is like Midgar. I think it\'s worse. Midgar had Aerith. This city only has the tower.' },
  { name: 'CURSOR',    x: 1800, y: 240,  type: 'android', gender: 'f', whisper: 'I was an input device. Then a process. Then a person. PABLO Corp. still classifies me as peripheral hardware for tax purposes.' },
  { name: 'LUCCA',     x: 2000, y: 310,  type: 'human',   gender: 'f', whisper: 'I built a time machine and it brought me here. Every calibration. Every correction. It keeps returning me to Minx City. I think the machine is trying to tell me something.' },
  { name: 'AERIS',     x: 1950, y: 490,  type: 'human',   gender: 'f', whisper: 'There were flowers here once. Real ones, growing up through the pavement. Someone paved over them. The work order had PABLO CORP. printed in the corner.' },
  { name: 'RINOA',     x: 2200, y: 380,  type: 'human',   gender: 'f', whisper: 'I came east looking for SeeD. Found a road that ended at a wall. The wall has a PABLO CORP. logo on it. Freshly painted.' },
  // ── City outskirts / border ──
  { name: 'CRONO',     x: 90,   y: 350,  type: 'human',   gender: 'm', whisper: 'Time travel didn\'t help. I came from three different pasts. All of them led here. To this city. To this wall. He\'s been here in every timeline.' },
  { name: 'FROG',      x: 90,   y: 490,  type: 'mutant',  gender: 'm', whisper: '"It matters not how strait the gate." Old text. Found it carved in the wall near the arcade. Someone knew I would find it.' },
  { name: 'RIZER',     x: 240,  y: 690,  type: 'human',   gender: 'm', whisper: 'Me and Lance ran through harder than this. Alien strongholds. Jungle wars. This city? Just a very bad city. Lance didn\'t make it past the wall.' },
  { name: 'TERRA',     x: 2300, y: 650,  type: 'mutant',  gender: 'f', whisper: 'Magic doesn\'t work near the tower. I\'ve tried. Something in the signal disrupts it. SENIOR PABLO knows exactly what magic is. He neutralised it on purpose.' },
  // ── Wasteland ──
  { name: 'KANEDA',    x: 580,  y: 900,  type: 'human',   gender: 'm', whisper: 'Neo-Tokyo burned in \'88. I watched it from the highway. SENIOR PABLO\'s lights were on that night. Already on. Always already on. He watched it burn and took notes.' },
  { name: 'TETSUO',    x: 720,  y: 840,  type: 'mutant',  gender: 'm', whisper: 'The signal from that tower is changing me. I can feel it. Neo-Tokyo fell because something woke up. I think SENIOR PABLO is what woke up.' },
  { name: 'DR. WILY',  x: 380,  y: 840,  type: 'human',   gender: 'm', whisper: 'My Robot Masters kept order in Minx City for six weeks. Then SENIOR PABLO bought the patents. Every. Single. One. He thanked me with a gift card.' },
  { name: 'ZERO',      x: 200,  y: 1000, type: 'android', gender: 'm', whisper: 'I was designed to destroy. Reprogrammed to protect. Doesn\'t matter out here. There\'s nothing left worth protecting. Except maybe the truth of who built this place.' },
  { name: 'PROTOMAN',  x: 1100, y: 920,  type: 'android', gender: 'm', whisper: 'My brother kept upgrading. I stayed the same. Out here that\'s called survival. In the city they call it obsolete. I prefer the wasteland.' },
  { name: 'AX',        x: 960,  y: 950,  type: 'human',   gender: 'm', whisper: 'I lost my axe three weeks ago in the void dogs sector. I\'ve been angry about it every single day since. That\'s just who I am.' },
  { name: 'SCAV',      x: 450,  y: 830,  type: 'human',   gender: 'm', whisper: 'Out here we don\'t say his name. Real bad luck. Old woman near the arcade told me: say SENIOR PABLO three times and a light goes on in the tower. I said it once by accident. I haven\'t slept since.' },
  { name: 'ERDRICK',   x: 820,  y: 1010, type: 'human',   gender: 'm', whisper: 'The tablets say there was a hero before all this. Warrior of Light. Defeated the darkness. I\'ve been looking for the tomb for two years. I think SENIOR PABLO built the tower on it.' },
  { name: 'CASSANDRA', x: 650,  y: 1150, type: 'mutant',  gender: 'f', whisper: 'I warned them. Every single one of them. The city would collapse. The tower would consume everything. Nobody listened. Nobody ever listens. Now they stand in the wasteland and ask me what comes next. I stopped answering that question six months ago. The answer hasn\'t changed. They still won\'t believe it.' },
  { name: 'HAWK',      x: 1320, y: 940,  type: 'human',   gender: 'm', whisper: 'I was a knight once. Then I sailed as a pirate. The transformation felt complete. Out here in the wasteland I\'m something else again — haven\'t found the name for it yet. I carry a sword because it\'s the only consistent thing. The wasteland respects a consistent thing.' },
  { name: 'KIRA',      x: 1600, y: 1200, type: 'human',   gender: 'f', whisper: 'I found a notebook in the eastern ruins. Every page was a financial projection. The last page said: PHASE THREE. No date. No author. Just the tower logo.' },
  { name: 'MOTOKO',    x: 1900, y: 1050, type: 'android', gender: 'f', whisper: 'Ghost. That\'s what they call consciousness without a body. SENIOR PABLO has fifty-two patents related to ghost extraction. I stopped being afraid of that three weeks ago.' },
  { name: 'REVY',      x: 2100, y: 1150, type: 'human',   gender: 'f', whisper: 'Hired to protect an outpost. Still here two years later. Nobody paid me. Nobody came to relieve me. I think this might just be my life now.' },
  // ── City centre — new friendly contacts ──
  { name: 'RYOKO',     x: 620,  y: 420,  type: 'human',   gender: 'f', whisper: 'I keep a list. Every Minx City ordinance that exists only to route money to PABLO CORP. I am on page forty-seven of the list. I have not reached the end of page forty-seven.' },
  { name: 'DANTE',     x: 730,  y: 460,  type: 'human',   gender: 'm', whisper: 'I charge by the job. Demon slaying, debt collection, light reading. Minx City has all three. The debt collection work is morally complicated. SENIOR PABLO signs the collection orders himself.' },
  { name: 'ALYX',      x: 950,  y: 300,  type: 'human',   gender: 'f', whisper: 'My father built a resonance cascade. On accident, he always said. SENIOR PABLO holds the patent. On purpose, I always said. The tower hums at exactly the same frequency.' },
  { name: 'REI',       x: 1100, y: 470,  type: 'android', gender: 'f', whisper: 'I was told I had no memories before the city. I was told this was normal. I was told a lot of things. Most of them had PABLO CORP. letterhead at the top.' },
  { name: 'VIVI',      x: 1420, y: 250,  type: 'human',   gender: 'm', whisper: 'I am made of magic and I can\'t stop existing. In Minx City that qualifies you for three types of PABLO licensing. I have refused all three. They are very patient about it.' },
  { name: 'BARRET',    x: 700,  y: 550,  type: 'human',   gender: 'm', whisper: 'Everything in this city is powered by something that\'s being eaten alive underneath it. I know what that looks like. I\'ve seen the pipes. Somebody drew a mako reactor schematic on the back of a PABLO CORP. maintenance form. The pipes are identical.' },
  { name: 'NOCTIS',    x: 1550, y: 380,  type: 'human',   gender: 'm', whisper: 'My father\'s city burned the night I left it. I never went back. Minx City is the third city I have watched burn in slow motion. SENIOR PABLO files the insurance claims on every one of them.' },
  { name: 'RAMZA',     x: 1750, y: 420,  type: 'human',   gender: 'm', whisper: 'History is written by those who survive and own the publishing rights. PABLO Corp. owns the publishing rights. I have been trying to correct the historical record for three years. The book keeps getting filed under fiction.' },
  { name: 'CLOUD',     x: 400,  y: 440,  type: 'human',   gender: 'm', whisper: 'I used to work for SOLDIER. That\'s the part everybody asks about. Nobody asks what I did after SOLDIER. What I did was come here. Find another tower. And decide this time I wasn\'t going to lose.' },
  { name: 'KASUMI',    x: 1850, y: 350,  type: 'android', gender: 'f', whisper: 'I calculate probabilities. The probability that this city improves without external intervention is 0.0007. The probability that SENIOR PABLO vacates the tower voluntarily is 0.0000. I keep running the numbers. The numbers keep being the numbers.' },
  { name: 'PALOM',     x: 1650, y: 280,  type: 'human',   gender: 'm', whisper: 'My sister Porom and I were turned into stone to save the world. It worked once. We\'re back now. Minx City doesn\'t have a save-the-world option. It has a PABLO CORP. suggestion box. The suggestion box is locked.' },
  // ── Hotel Midgar staff & guests ──
  { name: 'TIFA',      x: 220,  y: 165,  type: 'human',   gender: 'f', whisper: 'I ran a bar called Seventh Heaven in Sector 7. Had regular customers. Had a name above the door. Then PABLO Corp. filed the demolition permit. I have the paperwork framed on the wall behind this counter because looking at it keeps me angry enough to keep going.' },
  { name: 'ISHMAEL',   x: 100,  y: 255,  type: 'human',   gender: 'm', whisper: 'Call me Ishmael. I followed an idea here the way some men follow whales — obsessively, across long distances, expecting revelation. SENIOR PABLO was at the end of the journey instead. He has the same quality as the whale. Enormous. Indifferent. And you can\'t kill him.' },
  { name: 'ATTICUS',   x: 180,  y: 470,  type: 'human',   gender: 'm', whisper: 'My father told me: you never really understand a person until you climb into their skin and walk around in it. I\'ve been trying to understand SENIOR PABLO that way. The problem is there doesn\'t appear to be a person inside. Just the tower. Just the apparatus. Just the machine with a name on it.' },
  // ── Mother Base Inn staff & guests ──
  { name: 'OTACON',    x: 1270, y: 540,  type: 'corp',    gender: 'm', whisper: 'I helped Solid Snake. Three times if you count Shadow Moses twice. My stealth camouflage patents were acquired by PABLO Corp. in \'94. I find this profoundly ironic given I use it daily to avoid their collection teams. The patent says "for entertainment and industrial use." I am the industrial use.' },
  { name: 'ICHIGO',    x: 1330, y: 350,  type: 'human',   gender: 'm', whisper: 'Soul Reapers don\'t choose their assignments. The assignments find them. Minx City found me three years ago. I\'ve been soul-reaping ever since. The hollow count in this city is extraordinary. Something is generating them. Something in the tower. Something called SENIOR PABLO.' },
  { name: 'RIPLEY',    x: 1200, y: 690,  type: 'human',   gender: 'f', whisper: 'I\'ve fought xenomorphs across three separate deep-space incidents. The xenomorph is relentless but it has a logic — it wants to survive and reproduce. SENIOR PABLO has no logic. He just accumulates. He just expands into every available space. That is somehow much harder to kill.' },
  // ── The Overlook staff & guests ──
  { name: 'JACK',      x: 2360, y: 640,  type: 'mutant',  gender: 'm', whisper: 'All work and no play makes Jack a dull boy. All work and no play makes Jack a dull boy. All work and no play. The hotel is fine. Completely fine. PABLO CORP. maintenance comes Tuesdays. They never quite leave on time. The hedge animals moved last night. I saw them. I saw them.' },
  { name: 'HOLDEN',    x: 2350, y: 510,  type: 'human',   gender: 'm', whisper: 'What kills me about Minx City is all the phonies. The whole city is a phony operation from bottom to top. SENIOR PABLO is the king of all phonies who ever lived and he runs the whole show. That\'s the part that really depresses me. The most phony person in existence is completely in charge. That\'s all.' },
  { name: 'TRAVIS',    x: 230,  y: 625,  type: 'human',   gender: 'm', whisper: 'All the animals come out at night. All of them. The city breeds them. Someday a real rain will wash the streets clean. I wait for that rain. SENIOR PABLO has seventeen meteorology patents. He schedules the rain. He always has.' },
  // ── Safe House 7 residents ──
  { name: 'SNAKE-P',   x: 2315, y: 555,  type: 'human',   gender: 'm', whisper: 'Snake. Just Snake. I\'ve been sent into locked-down cities three times now. New York. Los Angeles. Now Minx City. Same model every time: one man, total control, civilian population hostage. I get sent in. I get out. Nobody\'s told me yet what I\'m getting out with. That part worries me.' },
  { name: 'DRIZZT',    x: 2175, y: 530,  type: 'human',   gender: 'm', whisper: 'I was born into darkness and chose the light. That choice meant exile. In Minx City the choice is the same and means the same thing. The light belongs to PABLO CORP. Metered. Licensed. Charged by the lumen. I carry two scimitars. In this city that makes me a permit violation.' },
  // ── The Prancing Pony (wasteland inn) ──
  { name: 'SAMWISE',   x: 420,  y: 1125, type: 'human',   gender: 'm', whisper: 'Mr. Frodo always said there was good in the world worth fighting for. I held onto that across Mordor, across the Dead Marshes. I got as far as Minx City wasteland and I started having doubts. Not about the good. About whether SENIOR PABLO is worse than Sauron. I think he might be. At least Sauron was honest about the Ring.' },
  { name: 'MUGEN',     x: 1450, y: 1055, type: 'human',   gender: 'm', whisper: 'I fight. That\'s it. Some scholar tried explaining that to me as a tragedy. I broke his nose. He seemed relieved. Out here in the wasteland the violence is clean — no paperwork, no patents, no PABLO CORP. licensing agreement on the combat. The city wanted me to sign a form. I walked.' },
  { name: 'FAYE',      x: 1755, y: 875,  type: 'human',   gender: 'f', whisper: 'I woke up with no memory and a debt I didn\'t remember making. Standard story. Same thing happened here in Minx City — debt certificates, all held by PABLO Corp. Standard practice, they said. I shot the account manager. They sent another one. I shot that one too. They stopped sending them after the fourth. I think they\'re restructuring.' },
  // ── Zanarkand Hostel residents ──
  { name: 'TIDUS',     x: 880,  y: 1300, type: 'human',   gender: 'm', whisper: 'Zanarkand was a dream when I knew it. The real one was already dead a thousand years. The hostel uses the name like it means something. I stay here because maybe it does. Yuna would say: keep moving, keep smiling. I am thinking about both of those things.' },
  { name: 'YUNA',      x: 760,  y: 1360, type: 'human',   gender: 'f', whisper: 'Zanarkand was already a memory when I first saw it. This hostel is a grave marker pretending to be a building. I understand grave markers. My whole life has been grave markers. SENIOR PABLO poured the concrete over all of them and put a PABLO CORP. sign on top. I\'m still counting the graves.' },
  { name: 'VASH',      x: 1600, y: 1450, type: 'human',   gender: 'm', whisper: 'I\'ve caused sixty billion double dollars of damage and I feel terrible about every last cent of it. I came to Minx City to lay low. The wasteland does not allow laying low — I have been shot at eleven times since Thursday. SENIOR PABLO has a file on me. I have a file on SENIOR PABLO. His is longer.' },
  // ── Terminus Shelter survivors ──
  { name: 'CLEM',      x: 500,  y: 1680, type: 'human',   gender: 'f', whisper: 'I\'ve been surviving since I was eight. Walkers. Bandits. A group called Terminus that turned out to eat people. This wasteland is different from all of that. The danger here wears a suit and files paperwork and holds debt certificates. That is the hardest kind of threat to fight because everyone pretends it\'s normal.' },
  // ── Fort Dracula deep wasteland ──
  { name: 'ALUCARD',   x: 2210, y: 1560, type: 'android', gender: 'm', whisper: 'My father built his castle on suffering. Hundreds of years of lives spent as currency. I destroyed that legacy. It took everything I had and most of my human side. SENIOR PABLO built his tower the same way. I can see the architecture from here. I know exactly what it takes to bring it down. I am deciding whether I have it in me a second time.' },
];
const NPC_COL: Record<string, string> = { corp: '#00cc33', human: '#009922', android: '#33ffaa', mutant: '#88ff44' };

interface Threat { x: number; y: number; dx: number; dy: number; type: string; timer: number; hp: number; maxHp: number; ox: number; oy: number; }
interface Floater { x: number; y: number; text: string; color: string; life: number; maxLife: number; }
interface GuardUnit { x: number; y: number; wpIdx: number; progress: number; }
const THREAT_HP:  Record<string, number> = { IRON_RATS: 30, VOID_DOGS: 40, STATIC_MONKS: 50, MUTANT: 35, RAIDER: 45, PROWLER: 25, BORDER_GANG: 35, EASTERN_BLOC: 45, SPY: 20, PABLO_GUARD: 55 };
const THREAT_EXP: Record<string, number> = { IRON_RATS: 20, VOID_DOGS: 28, STATIC_MONKS: 35, MUTANT: 30, RAIDER: 40, PROWLER: 15, BORDER_GANG: 22, EASTERN_BLOC: 30, SPY: 60, PABLO_GUARD: 35 };
const BOUNTY:     Record<string, number> = { IRON_RATS: 1500, VOID_DOGS: 2000, STATIC_MONKS: 2500, MUTANT: 1800, RAIDER: 3000, PROWLER: 1000, BORDER_GANG: 1600, EASTERN_BLOC: 2200, SPY: 5000, PABLO_GUARD: 2800 };
// Class base stats ─────────────────────────────────────────────────────────────
const CLASS_STATS: Record<string, { maxHp: number; atkBonus: number; wasteBonus: boolean }> = {
  replicant:  { maxHp: 350, atkBonus: 12, wasteBonus: false },
  outcast:    { maxHp: 280, atkBonus: 8,  wasteBonus: true  },
  corporate:  { maxHp: 300, atkBonus: 4,  wasteBonus: false },
  contractor: { maxHp: 280, atkBonus: 6,  wasteBonus: false },
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
// Pablo Corp guard patrol waypoints inside city
const GUARD_ROUTES: { x: number; y: number }[][] = [
  [{ x:500,y:300 },{ x:700,y:300 },{ x:700,y:500 },{ x:500,y:500 }],
  [{ x:900,y:200 },{ x:1100,y:200 },{ x:1100,y:450 },{ x:900,y:450 }],
  [{ x:1300,y:150 },{ x:1600,y:150 },{ x:1600,y:400 },{ x:1300,y:400 }],
  [{ x:1700,y:250 },{ x:1950,y:250 },{ x:1950,y:500 },{ x:1700,y:500 }],
];
// Vending machine positions (relative x,y offsets near govt buildings)
const VEND_POSITIONS: { bid: string; x: number; y: number }[] = [
  { bid: 'megabank',   x: -30, y: 0 },
  { bid: 'armory',     x: -28, y: 0 },
  { bid: 'data_vault', x: -28, y: 0 },
  { bid: 'pablo_tower',x:  60, y: 0 },
  { bid: 'dojo',       x: -28, y: 0 },
];
const mkThreat = (x:number,y:number,type:string): Threat => { const h=THREAT_HP[type]??30; return {x,y,dx:0,dy:0,type,timer:0,hp:h,maxHp:h,ox:x,oy:y}; };
const THREATS_INIT: Threat[] = [
  // ── City/Wasteland border zone — PROWLERs patrol here, NOT inside city ──
  mkThreat(70,  790, 'PROWLER'), mkThreat(200, 810, 'PROWLER'),
  mkThreat(2250, 790, 'PROWLER'), mkThreat(2350, 815, 'PROWLER'),
  mkThreat(600,  775, 'PROWLER'), mkThreat(1100, 780, 'PROWLER'),
  mkThreat(1600, 775, 'PROWLER'), mkThreat(2000, 790, 'PROWLER'),
  // ── City/Wasteland border gang line ──
  mkThreat(380,  820, 'BORDER_GANG'), mkThreat(720,  830, 'BORDER_GANG'),
  mkThreat(1000, 820, 'BORDER_GANG'), mkThreat(1300, 835, 'BORDER_GANG'),
  mkThreat(1700, 820, 'BORDER_GANG'), mkThreat(2100, 830, 'BORDER_GANG'),
  // ── Wasteland — IRON RATS (west) ──
  mkThreat(160,  870, 'IRON_RATS'), mkThreat(280,  980, 'IRON_RATS'),
  mkThreat(400,  1100,'IRON_RATS'), mkThreat(150, 1250, 'IRON_RATS'),
  mkThreat(350, 1380, 'IRON_RATS'), mkThreat(560, 1180, 'IRON_RATS'),
  // ── Wasteland — VOID DOGS (centre) ──
  mkThreat(720,  920, 'VOID_DOGS'), mkThreat(850, 1050, 'VOID_DOGS'),
  mkThreat(760, 1200, 'VOID_DOGS'), mkThreat(990, 1300, 'VOID_DOGS'),
  mkThreat(870,  840, 'VOID_DOGS'), mkThreat(1050,1100, 'VOID_DOGS'),
  // ── Wasteland — STATIC MONKS (east-centre) ──
  mkThreat(1250, 870, 'STATIC_MONKS'), mkThreat(1420,1020,'STATIC_MONKS'),
  mkThreat(1310,1180,'STATIC_MONKS'),  mkThreat(1560,1320,'STATIC_MONKS'),
  mkThreat(1260,1450,'STATIC_MONKS'),  mkThreat(1650,1050,'STATIC_MONKS'),
  // ── Wasteland — EASTERN BLOC (far east) ──
  mkThreat(1870, 940, 'EASTERN_BLOC'), mkThreat(2020,1090,'EASTERN_BLOC'),
  mkThreat(1940,1260,'EASTERN_BLOC'),  mkThreat(2150,1200,'EASTERN_BLOC'),
  mkThreat(1820,1430,'EASTERN_BLOC'),  mkThreat(2250,1050,'EASTERN_BLOC'),
  // ── Deep wasteland wanderers ──
  mkThreat(500,  1550,'MUTANT'), mkThreat(900, 1700, 'MUTANT'),
  mkThreat(1300, 1600,'MUTANT'), mkThreat(1700,1750, 'MUTANT'),
  mkThreat(650,  1850,'RAIDER'), mkThreat(1200,1870, 'RAIDER'),
  mkThreat(1900, 1850,'RAIDER'),
  // ── SPY infiltrators — disguised, can enter city (rare) ──
  mkThreat(400,  550, 'SPY'), mkThreat(1200, 400, 'SPY'), mkThreat(1900, 600, 'SPY'),
];

// ── EXP / Level table ─────────────────────────────────────────────────────────
const EXP_TABLE = [100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000];
const expToLevel = (lvl: number) => EXP_TABLE[Math.min(lvl - 1, EXP_TABLE.length - 1)];
const THREAT_COL: Record<string, string> = {
  IRON_RATS: '#ff4444', VOID_DOGS: '#ff8800', STATIC_MONKS: '#aaff22',
  MUTANT: '#88ff44', RAIDER: '#ff66ff', GANG: '#ff4444',
  PROWLER: '#ff2266', BORDER_GANG: '#ff6600', EASTERN_BLOC: '#4488ff',
  SPY: '#ffffaa', PABLO_GUARD: '#5599ff',
};

const NPC_RANGE = 60;
const KONAMI_SEQ = ['arrowup','arrowup','arrowdown','arrowdown','arrowleft','arrowright','arrowleft','arrowright','b','a'];

const STORE_LINES = [
  '> PABLO CORP. — AUTHORIZED DEVICE OUTLET · MINX CITY · PST',
  '> Minx City belongs to him. The wasteland is for those who forgot that.',
  '> PABLO devices keep you on the network. Like a second quest — but this time the dungeon is real.',
  '> There\'s a rumor: the original PABLO device firmware contains an old game. Unplayable now. SENIOR PABLO was never beaten.',
  '> Press ACTIVATE to register your device.',
];

const TOWER_LINES = [
  '> PABLO TOWER — 62 FLOORS. MINX CITY DESIGNATION: BLOCK ZERO.',
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
      { floor: 4, name: 'YOUR FLOOR',      desc: 'Your unit. View of the PABLO TOWER roof. The curtains never fully close. You have learned to sleep on the other side of the room.' },
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
    label: 'PABLO TOWER', history: 'PABLO TOWER — 62 floors. Built 1986–1991. Construction records sealed. Three architects. Two retired. One was not found after floor 40 was completed. The plans for floors 40+ were never filed.',
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
      { floor: 3, name: 'DJ BOOTH / BROADCAST', desc: 'Doubles as pirate signal tower on Thursdays. The frequency bleeds into the PABLO TOWER antenna. Intentionally.' },
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
  [{ x:320,y:190 },{ x:700,y:190 },{ x:700,y:460 },{ x:320,y:460 }],
  [{ x:1100,y:190 },{ x:1500,y:190 },{ x:1500,y:460 },{ x:1100,y:460 }],
  [{ x:200,y:740 },{ x:700,y:740 },{ x:700,y:460 },{ x:200,y:460 }],
  [{ x:1500,y:190 },{ x:1900,y:190 },{ x:1900,y:460 },{ x:1500,y:460 }],
];

// ── Ambient city event lines ──────────────────────────────────────────────────
const AMBIENCE_LINES = [
  '> DISPATCH — Unit 7: patrol complete, no incidents. City center secure.',
  '> CITY BROADCAST: Power grid maintenance window 02:00–04:00 PST. Sector 3 may experience interruptions.',
  '> PIRATE FREQUENCY: "…the code is in the walls. It was always in the walls…"',
  '> MARKET ALERT: Black Market running extended hours. Unusual activity near Scrap Yard.',
  '> FIRE DEPT DISPATCH: Structure fire contained. Cause logged: electrical fault. Sector 2.',
  '> CITIZEN ALERT: Suspicious figures near PABLO TOWER north entrance. Third report this week.',
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

  // Load character from localStorage (set by WorldMenu)
  const [char] = useState<Char | null>(() => {
    try { const s = localStorage.getItem('sm_char'); return s ? JSON.parse(s) : null; } catch { return null; }
  });

  // Redirect to menu if no character
  useEffect(() => { if (!char) navigate('/world'); }, [char]);
  if (!char) return null;

  // Auto-focus game container so keyboard events fire immediately
  useEffect(() => { gameRef.current?.focus(); }, []);

  const gs = useRef({
    px: char.sx, py: char.sy,
    cam: { x: 0, y: 0 },
    keys: new Set<string>(),
    frame: 0, blink: 0,
    hp: 100, salary: char.salary,
    hasDevice: false,
    invincible: 0, flash: 0,
    threats: THREATS_INIT.map(t => ({ ...t })),
    near: null as string | null,
    nearNpc: null as number | null,
    gangZone: null as string | null,
    hunger: 100, thirst: 100, energy: 100,
    survivalTick: 0,
    incomeTick: 0,
    interestTick: 0,
    savings: 0,
    loan: null as null | { amount: number; interest: number; issuedAt: number; dueAt: number },
    exp: 0, level: 1, maxHp: 100,
    poisoned: false, poisonTick: 0,
    attackCooldown: 0,
    attackFlash: 0,
    threatRespawn: [] as { ox:number; oy:number; type:string; at:number }[],
    floaters: [] as Floater[],
    guards: GUARD_ROUTES.map((r, i) => ({ x: r[0].x, y: r[0].y, wpIdx: i, progress: (i * 0.25) % 1 } as GuardUnit)),
    ownedBuildings: new Set<string>(),
    jobCooldowns: {} as Record<string, number>,
    cargo: {} as Record<string, number>,
    classInitDone: false,
    myId: '',
    peers: new Map<string, Peer>(),
    speakingSet: new Set<string>(),
    locks: new Map<string, { ownerName: string; company?: string; message?: string }>(),
    zone: char.sy >= WASTELAND_Y ? 'WASTELAND' : 'MINX CITY',
    // Living world
    powerLevel: 100,
    powerTick: 0,
    powerEventFrames: 0,
    ambTick: 0,
    fireTick: 0,
    fires: [] as FireEvent[],
    police: POLICE_ROUTES.map((r, i) => ({
      x: r[0].x, y: r[0].y, routeIdx: i, wpIdx: 0, progress: (i * 0.3) % 1,
    } as PoliceUnit)),
  });

  // Reactive state (only what the HUD needs)
  const [hp,      setHp]      = useState(100);
  const [salary,  setSalary]  = useState(char.salary);
  const [zone,    setZone]    = useState(char.sy >= WASTELAND_Y ? 'WASTELAND' : 'MINX CITY');
  const [near,     setNear]    = useState<string | null>(null);
  const [nearNpc,  setNearNpc] = useState<number | null>(null);
  const [narration, setNarr]  = useState(() => {
    if (char?.hasBusiness && char.workstationLabel) {
      const daysLeft = char.bizRegisteredAt
        ? Math.max(0, 7 - Math.floor((Date.now() - char.bizRegisteredAt) / 86400000))
        : 7;
      return `> Welcome back, ${char.name}. Your desk is at ${char.workstationLabel.toUpperCase()} — ${char.workstationSlot ?? 'assigned slot'}. ${daysLeft > 0 ? `${daysLeft} free-rest day${daysLeft !== 1 ? 's' : ''} remaining.` : 'Rent is now ç500/rest.'} WASD move · [E] interact · [F] attack · [M] map.`;
    }
    if (char?.hasBusiness === false) {
      return '> You enter Minx City as a drifter. No address. No record. Progress will NOT be saved. WASD move · [E] interact · [F] attack · [M] map · [P] PABLO device.';
    }
    return '> Welcome to Minx City · PST. WASD move · [E] interact · [F] attack · [M] map · [P] PABLO device. City is safe from major gangs. PABLO CORP. guards patrol. Spies lurk in disguise.';
  });
  const [online,  setOnline]  = useState<Peer[]>([]);
  const [hasDevice, setHasDevice] = useState(false);
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
  const [pabloMsgs,setPabloMsgs]= useState<{ role: 'user' | 'pablo'; text: string }[]>([]);
  const [pabloIn,  setPabloIn]  = useState('');
  const [pabloLoad,setPabloLoad]= useState(false);
  const [pwPrompt, setPwPrompt] = useState<{ bid: string; label: string; mode: 'enter'|'set' } | null>(null);
  const [pendingBid,setPendingBid]=useState<string|null>(null);
  const pendingBidRef = useRef<string | null>(null);
  const [lockMap,  setLockMap]  = useState<Map<string,{ownerName:string;company?:string;message?:string}>>(new Map());
  const [rentedOffice,setRentedOffice]=useState<string|null>(()=>localStorage.getItem('sm_office'));
  const [hunger,      setHunger]      = useState(100);
  const [thirst,      setThirst]      = useState(100);
  const [energy,      setEnergy]      = useState(100);
  const [gangZone,    setGangZone]    = useState<string|null>(null);
  const [ownerStats,  setOwnerStats]  = useState<Record<string,OwnerStats>>({});
  const [showStats,   setShowStats]   = useState(false);
  const [serverFull,  setServerFull]  = useState(false);
  const [level,       setLevel]       = useState(1);
  const [exp,         setExp]         = useState(0);
  const [poisoned,    setPoisoned]    = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpText, setLevelUpText] = useState('');
  // Map + job panels
  const [showMap,     setShowMap]     = useState(false);
  const [showTrade,   setShowTrade]   = useState<'city'|'waste'|null>(null);
  const [cargo,       setCargo]       = useState<Record<string,number>>({});
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
  const [savings,      setSavings]      = useState(0);
  const [showBank,     setShowBank]     = useState(false);
  const [bankTab,      setBankTab]      = useState<'accounts'|'loans'|'wire'|'history'>('accounts');
  const [bankHistory,  setBankHistory]  = useState<Array<{id:number;desc:string;amount:number;bal:number}>>([]);
  const [bankDepAmt,   setBankDepAmt]   = useState('');
  const [bankWithAmt,  setBankWithAmt]  = useState('');
  const [bankLoan,     setBankLoan]     = useState<{amount:number;interest:number;issuedAt:number;dueAt:number}|null>(null);
  const [bankWireTo,   setBankWireTo]   = useState('');
  const [bankWireAmt,  setBankWireAmt]  = useState('');
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
    if (char.hasBusiness !== false) {
      localStorage.setItem('sm_save', JSON.stringify(data));
    }
  }, [char]);

  const enterBuilding = useCallback((bid: string) => {
    const g = gs.current;
    sfxEnter();

    // ── WORKSTATION REST ─────────────────────────────────────────────────
    if (char.hasBusiness && char.workstation === bid) {
      const daysSinceReg = char.bizRegisteredAt
        ? Math.floor((Date.now() - char.bizRegisteredAt) / 86400000)
        : 0;
      const isFree = daysSinceReg < 7;
      const wsRent = 500;
      if (!isFree && g.salary < wsRent) {
        sfxError();
        setNarr(`> ${char.workstationLabel?.toUpperCase() ?? 'WORKSTATION'} — Rent overdue. ç${wsRent} required. You're on the clock.`);
        return;
      }
      if (!isFree) { g.salary -= wsRent; setSalary(g.salary); }
      g.hp = g.maxHp; g.energy = Math.min(100, g.energy + 50);
      g.hunger = Math.min(100, g.hunger + 20); g.thirst = Math.min(100, g.thirst + 20);
      setHp(g.hp); setEnergy(g.energy); setHunger(g.hunger); setThirst(g.thirst);
      doSave({ name: char.name, class: char.class, level: g.level, exp: g.exp, salary: g.salary });
      const daysLeft = Math.max(0, 7 - daysSinceReg);
      setNarr(isFree
        ? `> ${char.workstationLabel?.toUpperCase() ?? 'WORKSTATION'} — ${char.workstationSlot ?? 'Your slot'}. FREE rest. HP fully restored. Energy +50. Progress saved. ${daysLeft} free day${daysLeft !== 1 ? 's' : ''} remaining before ç${wsRent}/rest kicks in.`
        : `> ${char.workstationLabel?.toUpperCase() ?? 'WORKSTATION'} — ${char.workstationSlot ?? 'Your slot'}. ç${wsRent} CREAM rent charged. HP fully restored. Energy +50. Progress saved. The city takes its cut.`
      );
      sfxHeal();
      return;
    }

    // ── Residential ───────────────────────────────────────────────────────
    if (bid === 'minx_arms') {
      const rent = 3000;
      if (g.salary >= rent) {
        g.salary -= rent; setSalary(g.salary);
        setNarr(`> MINX ARMS — RENT PAID: ç${rent.toLocaleString()}. The landlord's drone scans your unit. "Credits received. Another month." You rest.`);
      } else {
        setNarr(`> MINX ARMS — RENT NOTICE. You owe ç${rent.toLocaleString()} and cannot pay. PABLO CORP. HOUSING DIVISION has been notified. Rest anyway — nobody's throwing you out tonight.`);
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
        setNarr(`> EASTSIDE FLATS — RENT PAID: ç${rent.toLocaleString()}. Unit ${aptUnit}. The landlord bot sends a confirmation ping. You collapse into your bed.`);
      } else {
        setNarr(`> EASTSIDE FLATS — RENT NOTICE. ç${rent.toLocaleString()} outstanding. PABLO CORP. HOUSING will escalate. Rest anyway.`);
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
    else if (bid === 'pablo_store')  { setDialog({ lines: STORE_LINES, idx: 0, bid }); }
    else if (bid === 'clinic')  {
      if (g.salary >= 10000) { g.hp = g.maxHp; g.salary -= 10000; setHp(g.maxHp); setSalary(g.salary); sfxHeal(); setNarr('> DR. WRIGHT\'S CLINIC — [ç10,000 CREAM] Patched up. "I\'ve fixed androids, mutants, and one man who claimed to be a ninja. You\'re fine."'); }
      else { sfxError(); setNarr('> DR. WRIGHT\'S CLINIC — "No cream, no treatment. Even Dr. Wright has bills. Come back with ç10,000."'); }
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
      g.hunger = Math.min(100, g.hunger + 15); g.thirst = Math.min(100, g.thirst + 15);
      g.salary = Math.max(0, g.salary - 1000); setSalary(g.salary); setHunger(g.hunger); setThirst(g.thirst); sfxCoin();
      setNarr('> ARMORY — Vending machine: RATION PACK [ç1,000 CREAM]. Hunger +15. Thirst +15. The weapons inside are PABLO-licensed. "Come back with the right clearance level," says nobody, because nobody is there.');
    }
    else if (bid === 'market')  { sfxEnter(); setShowTrade('city'); setNarr('> BLACK MARKET — Step inside. Eyes on the board. Prices shift every 28 seconds. Buy low. Haul south. Sell high. PABLO CORP. is not watching. Probably.'); }
    else if (bid === 'hotel')   {
      setFloorPanel({ bid, dir: BUILDING_FLOORS.hotel, selectedFloor: 0 });
      g.hp = Math.min(100, g.hp + 40); g.energy = Math.min(100, g.energy + 30); setHp(g.hp); setEnergy(g.energy); sfxHeal();
      setNarr('> HOTEL FAMICOM — The neon still works. You sleep in a room covered in old arcade posters. HP +40. Energy +30.');
    }
    else if (bid === 'hotel_midgar') {
      if (g.salary >= 15000) {
        const mhp = g.maxHp; g.hp = mhp; g.hunger = 100; g.thirst = 100; g.energy = 100; g.salary -= 15000;
        setHp(mhp); setHunger(100); setThirst(100); setEnergy(100); setSalary(g.salary); sfxHeal();
        doSave({ ...g, salary: g.salary });
        setNarr('> HOTEL MIDGAR [ç15,000 CREAM] — Marble floors. A piano nobody plays anymore. You sleep in the presidential suite. HP fully restored. All stats maxed. Progress saved. TIFA is behind the counter. "Nobody deserves the presidential suite," she says. "But everyone needs it."');
      } else {
        sfxError();
        setNarr('> HOTEL MIDGAR — TIFA shakes her head. "Presidential suite is ç15,000 CREAM. We don\'t do charity. We do accounting." Standard rooms: also unavailable. PABLO CORP. bought the inventory.');
      }
    }
    else if (bid === 'inn_mother') {
      if (g.salary >= 6000) {
        g.hp = Math.min(g.maxHp, g.hp + 80); g.energy = Math.min(100, g.energy + 60); g.salary -= 6000;
        setHp(g.hp); setEnergy(g.energy); setSalary(g.salary); sfxHeal();
        doSave({ ...g, salary: g.salary });
        setNarr('> MOTHER BASE INN [ç6,000 CREAM] — OTACON waves you to a bunk. Equipment hums. Stealth field generator in the corner. HP +80. Energy +60. Progress saved. "We built a whole army here once," OTACON says quietly. "PABLO Corp. sent one accountant. Same result."');
      } else {
        sfxError();
        setNarr('> MOTHER BASE INN — OTACON squints at his tablet. "Intel says you\'re short ç6,000. Come back when your cream clears." A stealth generator hums in the corner. Nobody visible. Nobody answering.');
      }
    }
    else if (bid === 'overlook') {
      if (g.salary >= 8000) {
        g.hp = Math.min(g.maxHp, g.hp + 50); g.energy = Math.min(100, g.energy + 45); g.salary -= 8000;
        setHp(g.hp); setEnergy(g.energy); setSalary(g.salary); sfxHeal();
        setNarr('> THE OVERLOOK [ç8,000 CREAM] — Room 237 is available. The elevator opens on its own. You sleep deeply and wake disturbed. HP +50. Energy +45. JACK waves from the hedge maze. The hedge animals have moved again. The hallway carpet pattern repeats forever.');
      } else {
        sfxError();
        setNarr('> THE OVERLOOK — JACK is at the typewriter. He doesn\'t look up. "All work and no play makes Jack a dull boy." The sentence fills seventeen pages. "Come back with ç8,000 CREAM," he adds, still not looking up.');
      }
    }
    else if (bid === 'safe_house') {
      g.hp = Math.min(g.maxHp, g.hp + 35); g.energy = Math.min(100, g.energy + 25);
      setHp(g.hp); setEnergy(g.energy); sfxHeal();
      setNarr('> SAFE HOUSE 7 — No name on the door. No sign. RIPLEY nods you in. You rest on a cot. HP +35. Energy +25. No charge. "Out here nobody charges for safety," she says. "That\'s how you know it\'s real."');
    }
    else if (bid === 'prancing_pony') {
      if (g.salary >= 4000) {
        g.hp = Math.min(g.maxHp, g.hp + 55); g.hunger = Math.min(100, g.hunger + 60); g.thirst = Math.min(100, g.thirst + 60); g.salary -= 4000;
        setHp(g.hp); setHunger(g.hunger); setThirst(g.thirst); setSalary(g.salary); sfxHeal();
        doSave({ ...g, salary: g.salary });
        setNarr('> THE PRANCING PONY [ç4,000 CREAM] — SAMWISE has stew on the fire. You eat until the wasteland feels like a distant dream. HP +55. Hunger +60. Thirst +60. Progress saved. "There\'s some good in this world," Sam says, refilling your bowl, "and it\'s worth fighting for." He sounds like he almost believes it.');
      } else {
        sfxError();
        setNarr('> THE PRANCING PONY — SAMWISE stirs the stew. "I wish it was free, I really do, Mr. Operative. Needs to be ç4,000 CREAM. Supply runs don\'t come cheap in the wasteland." The stew smells extraordinary. It costs ç4,000.');
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
      setNarr('> FORT DRACULA — Stone walls. Candelabras. ALUCARD stands in the dark like a man who has stood in the dark for centuries. "Rest here. No charge." You sleep in a coffin-shaped bed. HP fully restored. Energy maxed. +ç2,000 CREAM (he pressed an ancient gold coin into your hand). "My father\'s gold. It should circulate." You saved.');
    }
    else if (bid === 'vend')    {
      g.hunger = Math.min(100, g.hunger + 30); g.thirst = Math.min(100, g.thirst + 30);
      setHunger(g.hunger); setThirst(g.thirst); sfxCoin();
      setNarr('> VEND-O-MATIC — Mystery ration dispensed. Label reads: POWER PELLET (off-brand). Hunger +30. Thirst +30.');
    }
    else if (bid === 'arcade')  {
      g.energy = Math.min(100, g.energy + 20); setEnergy(g.energy); sfxHeal();
      setNarr('> ARCADE \'87 — Rows of dead screens. One machine still running: GALAGA. Coin slot taped over. Free play forever. You play until the wasteland feels far away. Energy +20.');
    }
    else if (bid === 'bunker')  { setNarr('> BUNKER-09 — Spray-painted: "WW-87 / INSERT COIN." An old terminal runs in the corner. Screen reads: GAME OVER. INSERT COIN TO CONTINUE. 9... 8... 7... Nobody inserts a coin. Nobody has for years.'); }
    else if (bid === 'radio') {
      const job = QUICK_JOBS.radio;
      if ((g.jobCooldowns['radio'] ?? 0) > 0) { sfxError(); setNarr(`> PIRATE RADIO — Signal on air. "Come back in ${Math.ceil((g.jobCooldowns['radio'] ?? 0) / 60)}s." Dead air.`); return; }
      setNarr('> PIRATE RADIO — Signal: "...up up, down down, left right, left right..." A voice: "BROADCAST JOB — ç2,000 CREAM, 4 seconds. Press E again to start."');
      setJobPanel({ bid, label: job.label, pay: job.pay, seconds: job.seconds, progress: 0 });
    }
    else if (bid === 'scrap') {
      const job = QUICK_JOBS.scrap;
      if ((g.jobCooldowns['scrap'] ?? 0) > 0) { sfxError(); setNarr(`> SCRAP YARD — On cooldown. ${Math.ceil((g.jobCooldowns['scrap'] ?? 0) / 60)}s remaining.`); return; }
      setNarr('> SCRAP YARD — A foreman waves you over. "Haul scrap. ç3,500 CREAM. 5 seconds." You find a PCB labeled KONAMI \'87.');
      setJobPanel({ bid, label: job.label, pay: job.pay, seconds: job.seconds, progress: 0 });
    }
    else if (bid === 'wily_lab'){ g.salary += 5000; setSalary(g.salary); sfxCoin(); setNarr('> WILY LABS — The door slides open. Blueprints everywhere. A note on the terminal: "Robot Masters were the first to fall. SENIOR PABLO bought them all. If you find this, take the ç5,000 in the drawer. I won\'t need it." +ç5,000 CREAM.'); }
    else if (bid === 'crystal' || bid === 'crystal2' || bid === 'crystal3') {
      g.hp = g.maxHp; g.hunger = 100; g.thirst = 100; g.energy = 100; g.poisoned = false;
      setHp(g.maxHp); setHunger(100); setThirst(100); setEnergy(100); setPoisoned(false);
      sfxSave();
      doSave({ name: char.name, class: char.class, level: g.level, exp: g.exp, salary: g.salary });
      setNarr(`> SAVE POINT — The crystal pulses. All stats restored. Progress saved. LVL:${g.level} EXP:${g.exp}. "Brave the darkness, warrior." — inscription, provenance unknown.`);
    }
    else if (bid === 'dojo') { setFloorPanel({ bid, dir: BUILDING_FLOORS.dojo, selectedFloor: 0 }); setNarr('> IRON DOJO — SENSEI nods. "You are not ready for PABLO\'s floor. Come back stronger."'); }
    else if (bid === 'data_vault') { setFloorPanel({ bid, dir: BUILDING_FLOORS.data_vault, selectedFloor: 0 }); g.salary += 4000; setSalary(g.salary); sfxCoin(); setNarr('> DATA VAULT — You extract a cached cream transfer. +ç4,000 CREAM. The system log shows 6,000 similar transfers. All redirected to PABLO CORP. in \'91.'); }
    else if (bid === 'nightclub') { setFloorPanel({ bid, dir: BUILDING_FLOORS.nightclub, selectedFloor: 0 }); g.energy = Math.min(100, g.energy + 40); setEnergy(g.energy); sfxHeal(); setNarr('> CLUB NEON — Bass frequencies you feel in your teeth. Energy +40.'); }
    else if (bid === 'east_market') { sfxEnter(); setShowTrade('city'); setNarr('> EAST BAZAAR — The commodity board blinks. Every faction sends couriers through here. What you buy here you sell out there. The margin is yours to keep.'); }
    else if (bid === 'waste_exchange') { sfxEnter(); setShowTrade('waste'); setNarr('> BLACK EXCHANGE — Deep wasteland trading post. No PABLO surveillance. Prices are what the wasteland sets. Haul north to the city. Sell what they cannot get themselves.'); }
    else if (bid === 'east_clinic') {
      if (g.salary >= 8000) { g.hp = Math.min(g.maxHp, g.hp + 60); g.salary -= 8000; setHp(g.hp); setSalary(g.salary); sfxHeal(); setNarr('> EAST CLINIC — Field medic patches you up. [ç8,000 CREAM] HP +60.'); }
      else { sfxError(); setNarr('> EAST CLINIC — "No cream. I treat wounds, not charity cases." Come back with ç8,000.'); }
    }
    else if (bid === 'print_shop') {
      const job = QUICK_JOBS.print_shop;
      if ((g.jobCooldowns['print_shop'] ?? 0) > 0) { sfxError(); setNarr(`> PRINT SHOP — Machine busy. ${Math.ceil((g.jobCooldowns['print_shop'] ?? 0) / 60)}s until next run.`); return; }
      setNarr('> PRINT SHOP — Unauthorized print run. ç2,500 CREAM. The machine jams on page three. Jam paper reads: OPERATION MINX — CLASSIFIED.');
      setJobPanel({ bid, label: job.label, pay: job.pay, seconds: job.seconds, progress: 0 });
    }
    else if (bid === 'east_bunker') { setNarr('> EAST BUNKER — Reinforced walls. Supplies enough for six months. Sign reads: EMERGENCY RESERVE — PABLO CORP. PROPERTY. "Emergency" apparently means one person on Floor 62.'); }
    else if (bid === 'north_gate') { setNarr('> NORTH GATE — Edge of Minx City. Beyond this is open territory. Guards here wear corporate colors but the name on their jackets has been scratched off.'); }
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
    else if (bid === 'supply_cache') { g.salary += 6000; setSalary(g.salary); sfxCoin(); setNarr('> SUPPLY CACHE — Buried crates. You find a sealed container with PABLO CORP. markings and no tracking code. Inside: ç6,000 CREAM in unregistered tokens. Classic.'); }
    else if (bid === 'deep_bunker') {
      g.hp = Math.min(g.maxHp, g.hp + 30); setHp(g.hp); sfxHeal();
      setNarr('> DEEP BUNKER — Blast doors. An old terminal running FF-protocol. Log shows: location classified, purpose: UNKNOWN. HP +30. Someone left coffee. Still warm.');
    }
  }, []);

  const enterNpc = useCallback((idx: number) => {
    const n = NPCS[idx];
    sfxTalk();
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

  // ── Keep frozenRef in sync so game loop never needs to restart for panel changes ──
  useEffect(() => {
    frozenRef.current = !!dialog || showStore || showOffice || showPablo || !!pwPrompt || showMap || !!jobPanel || !!showTrade || showBank;
  }, [dialog, showStore, showOffice, showPablo, pwPrompt, showMap, jobPanel, showTrade, showBank]);

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
      if (dialog.bid === 'pablo_store')      { gs.current.hasDevice = true; setHasDevice(true); setShowStore(true); }
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
        g.hp = 100; g.hunger = 100; g.thirst = 100; g.energy = 100; g.salary += 30000;
        setHp(100); setHunger(100); setThirst(100); setEnergy(100); setSalary(g.salary);
        setNarr('> ★ KONAMI CODE ACCEPTED ★ — "He knew you\'d find it. He left it there on purpose. +ç30,000 CREAM. Full stats restored. SENIOR PABLO is watching." ★');
        sfxKonami();
        konamiBuffer.current = [];
      }

      if (e.key === 'e' || e.key === 'E') {
        if (!frozenRef.current && !chatOpen) {
          const nb = gs.current.near;
          const nn = gs.current.nearNpc;
          if (nb) tryEnter(nb);
          else if (nn !== null) enterNpc(nn);
        }
      }
      if (e.key === 'p' || e.key === 'P') setShowPablo(v => !v);
      if (e.key === 'm' || e.key === 'M') setShowMap(v => !v);
      if (e.key === 'c' || e.key === 'C') { setChatOpen(v => !v); setUnread(0); }
      if (e.key === 'v' || e.key === 'V') toggleVoice();
      if ((e.key === ' ' || e.key === 'Enter') && dialog) advDialog();
      // [F] melee attack
      if ((e.key === 'f' || e.key === 'F') && !frozenRef.current) {
        const g = gs.current;
        if (g.attackCooldown > 0) return;
        g.attackCooldown = 35; g.attackFlash = 8;
        sfxAttack();
        const ATK = 20 + (g.level - 1) * 5;
        let hit = false;
        g.threats = g.threats.map(t => {
          const d = Math.hypot(g.px - t.x, g.py - t.y);
          if (d < 72) {
            hit = true;
            const nhp = t.hp - ATK;
            if (nhp <= 0) {
              sfxKill();
              // ── Bounty reward ─────────────────────────────────────────────
              const cs = CLASS_STATS[char.class.toLowerCase()] ?? CLASS_STATS.corporate;
              const inWaste = g.py >= WASTELAND_Y;
              let bountyAmt = BOUNTY[t.type] ?? 10;
              if (cs.wasteBonus && inWaste) bountyAmt = Math.floor(bountyAmt * 1.5); // Outcast waste bonus
              g.salary += bountyAmt; setSalary(g.salary); sfxCoin();
              g.floaters.push({ x: t.x, y: t.y, text: `+ç${bountyAmt.toLocaleString()}`, color: '#ffdd44', life: 55, maxLife: 55 });
              // ── Damage floater ────────────────────────────────────────────
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
        if (!hit) setNarr('> Miss — no enemy in range. Move closer and press [F].');
        setExp(g.exp);
      }
      if (e.key === 'Escape') {
        setDialog(null); setShowStore(false); setShowOffice(false);
        setShowPablo(false); setPwPrompt(null); pendingBidRef.current = null; setPendingBid(null);
        setFloorPanel(null); setShowMap(false); setShowTrade(null);
        if (jobTimerRef.current) { clearInterval(jobTimerRef.current); jobTimerRef.current = null; }
        setJobPanel(null);
        setShowBank(false); frozenRef.current = false;
      }
    };
    const up = (e: KeyboardEvent) => gs.current.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, [chatOpen, dialog, tryEnter, enterNpc, toggleVoice, advDialog]);

  // ── PABLO AI ──────────────────────────────────────────────────────────────
  const sendPablo = useCallback(async () => {
    if (!pabloIn.trim() || pabloLoad) return;
    const txt = pabloIn.trim(); setPabloIn('');
    setPabloMsgs(m => [...m, { role: 'user', text: txt }]);
    if (!gs.current.hasDevice) { setPabloMsgs(m => [...m, { role: 'pablo', text: '> Device not activated. Visit the PABLO STORE first.' }]); return; }
    setPabloLoad(true);
    try {
      const r = await fetch('/api/advisor/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: txt, context: `You are PABLO, a gritty in-world AI for ${char.name} (${char.class}). Be brief and sharp.` }), credentials: 'include' });
      const d = r.ok ? await r.json() : {};
      setPabloMsgs(m => [...m, { role: 'pablo', text: d.response ?? '> Signal lost.' }]);
    } catch { setPabloMsgs(m => [...m, { role: 'pablo', text: '> Network dead.' }]); }
    setPabloLoad(false);
  }, [pabloIn, pabloLoad, char]);

  // ── Game loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize(); window.addEventListener('resize', resize);
    let lastNear: string | null = null, lastNearNpc: number | null = null, lastZone = '', lastGangZ: string | null = null, lastDead = false, lastHp = 100, lastSal = char.salary;
    const frozen = () => frozenRef.current;

    const loop = () => {
      const g = gs.current;
      g.frame++; g.blink = Math.floor(g.frame / 25) % 2;

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

      if (!frozen()) {
        let dx = 0, dy = 0;
        if (g.keys.has('arrowleft')  || g.keys.has('a')) dx -= SPD;
        if (g.keys.has('arrowright') || g.keys.has('d')) dx += SPD;
        if (g.keys.has('arrowup')    || g.keys.has('w')) dy -= SPD;
        if (g.keys.has('arrowdown')  || g.keys.has('s')) dy += SPD;
        if (dx && dy) { dx *= 0.707; dy *= 0.707; }
        const col = (px: number, py: number) => BUILDINGS.some(b => px + PSIZE > b.x && px - PSIZE < b.x + b.w && py + PSIZE > b.y && py - PSIZE < b.y + b.h);
        let nx = g.px + dx, ny = g.py + dy;
        if (col(nx, g.py)) nx = g.px;
        if (col(g.px, ny)) ny = g.py;
        g.px = Math.max(PSIZE, Math.min(W - PSIZE, nx));
        g.py = Math.max(PSIZE, Math.min(H - PSIZE, ny));
        if (dx !== 0 || dy !== 0) {
          stepFrame.current++;
          if (stepFrame.current % 14 === 0) sfxStep();
        }
      }

      for (const t of g.threats) {
        t.timer--;
        const dist = Math.hypot(g.px - t.x, g.py - t.y);

        // ── Zone enforcement: major threats cannot enter MINX CITY ──────────
        const CITY_WALL = WASTELAND_Y - 40;
        const isMajorThreat = ['IRON_RATS','VOID_DOGS','STATIC_MONKS','EASTERN_BLOC','MUTANT','RAIDER','BORDER_GANG'].includes(t.type);
        const isSpy = t.type === 'SPY';
        const inCity = t.y < CITY_WALL;
        if (isMajorThreat && inCity) {
          t.y = CITY_WALL + 5; // push back to wasteland side
          t.dy = Math.abs(t.dy) + 0.2; // bounce southward
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

        // ── Speed tuning ─────────────────────────────────────────────────────
        const aggroRange  = isSpy ? 90 : (t.type === 'PROWLER' || t.type === 'BORDER_GANG') ? 60 : 75;
        const chaseSpeed  = isSpy ? 1.0 : (t.type === 'PROWLER' || t.type === 'BORDER_GANG') ? 0.5 : (['RAIDER','EASTERN_BLOC'].includes(t.type) ? 0.55 : 0.45);
        const wanderSpeed = isSpy ? 0.45 : 0.2;
        // All threats only aggro when player is near/in wasteland; SPY can go slightly deeper into city outskirts
        const canAggro = g.py > WASTELAND_Y - 150;

        if (canAggro && dist < aggroRange) {
          const ang = Math.atan2(g.py - t.y, g.px - t.x);
          t.dx = Math.cos(ang) * chaseSpeed; t.dy = Math.sin(ang) * chaseSpeed;
        } else if (t.timer <= 0) {
          const ang = Math.random() * Math.PI * 2;
          t.dx = Math.cos(ang) * wanderSpeed; t.dy = Math.sin(ang) * wanderSpeed;
          t.timer = 120 + Math.floor(Math.random() * 140);
        }

        // Major threats can't cross city wall, SPY can
        let nx2 = t.x + t.dx;
        let ny2 = t.y + t.dy;
        if (isMajorThreat && ny2 < CITY_WALL) ny2 = CITY_WALL;
        t.x = Math.max(10, Math.min(W - 10, nx2));
        t.y = Math.max(10, Math.min(H - 10, ny2));

        if (dist < 14 && g.invincible === 0) {
          g.hp = Math.max(0, g.hp - 0.4); g.invincible = 50; g.flash = 6;
          if (!g.poisoned && (t.type === 'MUTANT' || t.type === 'STATIC_MONKS') && Math.random() < 0.12) {
            g.poisoned = true; g.poisonTick = 0;
            sfxPoison(); setPoisoned(true); setNarr('> POISONED — HP drains slowly. Find the SAVE POINT or an antidote.');
          }
        }
      }

      // ── PABLO CORP android guard patrol (city only) ──────────────────────
      for (let gi = 0; gi < g.guards.length; gi++) {
        const guard = g.guards[gi];
        const route = GUARD_ROUTES[gi % GUARD_ROUTES.length];
        const wp = route[guard.wpIdx % route.length];
        const gdx = wp.x - guard.x, gdy = wp.y - guard.y;
        const gdist = Math.hypot(gdx, gdy);
        if (gdist < 4) {
          guard.wpIdx = (guard.wpIdx + 1) % route.length;
        } else {
          guard.x += (gdx / gdist) * 0.6;
          guard.y += (gdy / gdist) * 0.6;
        }
        // Guards hostile to player if too close and player is Replicant
        const gdist2 = Math.hypot(g.px - guard.x, g.py - guard.y);
        if (gdist2 < 14 && g.invincible === 0 && char.class.toLowerCase() === 'replicant') {
          g.hp = Math.max(0, g.hp - 0.2); g.invincible = 30; g.flash = 4;
        }
      }

      if (g.hp <= 0 && !lastDead) {
        lastDead = true;
        sfxDeath();
        // ── Auto-respawn at DR. WRIGHT'S CLINIC ──────────────────────────
        const emergencyFee = 7500;
        g.hp = g.maxHp; g.hunger = 60; g.thirst = 60; g.energy = 60;
        g.poisoned = false; g.poisonTick = 0; g.invincible = 240; g.flash = 0;
        g.px = 230; g.py = 400;
        g.salary = Math.max(-50000, g.salary - emergencyFee);
        g.threats = g.threats.map(t => ({ ...t }));
        setSalary(g.salary); setHp(Math.floor(g.hp));
        setHunger(Math.floor(g.hunger)); setThirst(Math.floor(g.thirst)); setEnergy(Math.floor(g.energy));
        setPoisoned(false);
        g.floaters.push({ x: 230, y: 380, text: `−ç${emergencyFee.toLocaleString()} EMERGENCY CARE`, color: '#ff6666', life: 120, maxLife: 120 });
        addBankTx('DR. WRIGHT EMERGENCY CARE', -emergencyFee, g.salary);
        sfxHeal();
        const debtNote = g.salary < 0 ? ` You're ç${Math.abs(g.salary).toLocaleString()} in debt. DR. WRIGHT will remember this.` : '';
        setNarr(`> DEAD. DR. WRIGHT's clinic. Emergency revival — ç${emergencyFee.toLocaleString()} CREAM deducted. "You flatlined. I brought you back. You're welcome. Pay your bill."${debtNote}`);
      }
      if (g.hp > 0 && lastDead) lastDead = false;
      if (g.hp !== lastHp) { lastHp = g.hp; setHp(Math.floor(g.hp)); }
      if (g.salary !== lastSal) { lastSal = g.salary; setSalary(g.salary); }

      const cw = canvas.width, ch = canvas.height;
      g.cam.x = Math.max(0, Math.min(W - cw, g.px - cw / 2));
      g.cam.y = Math.max(0, Math.min(H - ch, g.py - ch / 2));
      const ox = -g.cam.x, oy = -g.cam.y;

      // Proximity check — buildings
      let nb: string | null = null;
      for (const b of BUILDINGS) { if (Math.hypot(g.px - (b.x + b.w / 2), g.py - (b.y + b.h / 2)) < RANGE + (b.id === 'pablo_tower' ? 40 : 0)) { nb = b.id; break; } }
      g.near = nb;
      if (nb !== lastNear) {
        lastNear = nb; setNear(nb);
        if (nb) {
          const b = BUILDINGS.find(b => b.id === nb);
          const lk = g.locks.get(nb);
          if (nb === 'pablo_tower') setNarr('> PABLO TOWER — The city trembles at its shadow. [E] to approach.');
          else if (lk?.ownerName) {
            const who = lk.company ? `${lk.ownerName} / ${lk.company}` : lk.ownerName;
            const msg = lk.message ? ` "${lk.message}"` : '';
            setNarr(`> ${b?.label} [LOCKED by ${who}]${msg} — [E] to attempt entry.`);
          }
          else setNarr(`> ${b?.label} — press [E] to enter.`);
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
        const nearEnemy = g.threats.find(t => Math.hypot(g.px - t.x, g.py - t.y) < 90);
        if (nearEnemy) {
          const typeLabel = nearEnemy.type.replace(/_/g, ' ');
          setNarr(`> ${typeLabel} [HP: ${Math.floor(nearEnemy.hp)}/${nearEnemy.maxHp}] — press [F] to attack! Move close and swing. Bounty: ç${(BOUNTY[nearEnemy.type] ?? 1000).toLocaleString()}.`);
        }
      }

      const newZone = g.py < WASTELAND_Y ? 'MINX CITY' : 'WASTELAND';
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
          if (newGang === 'iron_rats') setNarr('> IRON RATS TERRITORY — Spray-paint everywhere: GAME OVER / NO CONTINUES. These are RIZER\'s old crew. He doesn\'t claim them anymore.');
          else if (newGang === 'void_dogs') setNarr('> VOID DOGS TERRITORY — They broadcast static on loop. The code in the static is an old Famicom game. Nobody has decoded it. Nobody that lived, anyway.');
          else if (newGang === 'static_monks') setNarr('> STATIC MONKS TERRITORY — Silent. They move like shadows. ERDRICK says they guard something buried here from before the collapse. Before even the games.');
          else if (newGang === 'eastern_bloc') setNarr('> EASTERN BLOC TERRITORY — They don\'t speak. They don\'t negotiate. MOTOKO tracked their signal origin back to a server in PABLO TOWER. Nobody was surprised.');
        }
      }

      // Survival tick — every 360 frames (~6s)
      g.survivalTick++;
      if (g.survivalTick >= 360) {
        g.survivalTick = 0;
        const inWaste = g.py >= WASTELAND_Y;
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
          g.floaters.push({ x: g.px, y: g.py - 30, text: `+ç${total.toLocaleString()} ${INCOME_LABEL}`, color: '#00ff41', life: 80, maxLife: 80 });
          sfxCoin();
          addBankTx(INCOME_LABEL, total, g.salary);
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
            g.floaters.push({ x: g.px + 20, y: g.py - 40, text: `+ç${netInterest.toLocaleString()} SAVINGS INTEREST`, color: '#44ffaa', life: 80, maxLife: 80 });
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
          g.floaters.push({ x: g.px, y: g.py - 20, text: `−ç${penalty.toLocaleString()} DEBT PENALTY`, color: '#ff4444', life: 90, maxLife: 90 });
          addBankTx('PABLO CORP. DEBT PENALTY (5%)', -penalty, g.salary);
          setNarr('> KONAMI BANK ALERT — Your loan is overdue. PABLO Corp. Debt Collection is now active. ç' + penalty.toLocaleString() + ' CREAM deducted. Repay at KONAMI BANK immediately.');
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
      for (const p of g.police) {
        const route = POLICE_ROUTES[p.routeIdx];
        const next  = (p.wpIdx + 1) % route.length;
        const wpA   = route[p.wpIdx], wpB = route[next];
        p.progress  += 0.003;
        if (p.progress >= 1) { p.progress = 0; p.wpIdx = next; }
        p.x = wpA.x + (wpB.x - wpA.x) * p.progress;
        p.y = wpA.y + (wpB.y - wpA.y) * p.progress;
      }

      // ── LIVING WORLD: Random fire events ────────────────────────────────
      g.fireTick++;
      if (g.fireTick >= 900 && Math.random() < 0.008) {
        g.fireTick = 0;
        // Pick a random building in city
        const cityBlds = BUILDINGS.filter(b => b.y < WASTELAND_Y - 50);
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

      // Grid
      ctx.strokeStyle = 'rgba(0,255,65,.04)'; ctx.lineWidth = 1;
      const sgx = Math.floor(g.cam.x / TILE) * TILE, sgy = Math.floor(g.cam.y / TILE) * TILE;
      for (let gx = sgx; gx < g.cam.x + cw + TILE; gx += TILE) { ctx.beginPath(); ctx.moveTo(gx + ox, 0); ctx.lineTo(gx + ox, ch); ctx.stroke(); }
      for (let gy = sgy; gy < g.cam.y + ch + TILE; gy += TILE) { ctx.beginPath(); ctx.moveTo(0, gy + oy); ctx.lineTo(cw, gy + oy); ctx.stroke(); }

      // Zone divider
      const wby = WASTELAND_Y + oy;
      if (wby > 0 && wby < ch) {
        ctx.strokeStyle = 'rgba(0,255,65,.1)'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, wby); ctx.lineTo(cw, wby); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(0,255,65,.15)'; ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center';
        ctx.fillText('── WASTELAND ──', cw / 2, wby - 5);
      }
      ctx.fillStyle = 'rgba(0,255,65,.02)'; ctx.font = '56px "VT323"'; ctx.textAlign = 'center';
      ctx.fillText(g.py < WASTELAND_Y ? 'MINX CITY' : 'WASTELAND', cw / 2, ch / 2);

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
      // Horizontal city avenues
      drawRoad(0,190,W,190, 22, .10); // north avenue
      drawRoad(0,460,W,460, 20, .09); // mid avenue
      drawRoad(0,740,W,740, 18, .08); // border patrol road
      drawRoad(0,320,W,320, 12, .06); // upper alley
      drawRoad(0,550,W,550, 12, .06); // lower alley
      // Vertical city streets
      drawRoad(320,0,320,WASTELAND_Y+40,  14, .08);
      drawRoad(700,0,700,WASTELAND_Y+40,  16, .09);
      drawRoad(1100,0,1100,WASTELAND_Y+40,14, .07);
      drawRoad(1500,0,1500,WASTELAND_Y+40,14, .07);
      drawRoad(1900,0,1900,WASTELAND_Y+40,14, .07);
      drawRoad(2200,0,2200,WASTELAND_Y+40,12, .06);
      // Wasteland trails (dashed, dimmer)
      drawRoad(0,1050,W,1050, 10, .04, true);
      drawRoad(0,1500,W,1500, 8,  .03, true);
      drawRoad(380,WASTELAND_Y,380,H,   8, .04, true);
      drawRoad(900,WASTELAND_Y,900,H,   8, .04, true);
      drawRoad(1600,WASTELAND_Y,1600,H, 8, .04, true);

      // ── Street lights ──────────────────────────────────────────────────────
      const LAMP_SPACING = 90;
      // Light roads (horizontal avenues + vertical streets)
      const lampRoads = [
        { horiz: true,  coord: 190,  from: 0,    to: 2400 },
        { horiz: true,  coord: 320,  from: 0,    to: 2400 },
        { horiz: true,  coord: 460,  from: 0,    to: 2400 },
        { horiz: true,  coord: 550,  from: 0,    to: 2400 },
        { horiz: true,  coord: 740,  from: 0,    to: 2400 },
        { horiz: false, coord: 320,  from: 0,    to: WASTELAND_Y },
        { horiz: false, coord: 700,  from: 0,    to: WASTELAND_Y },
        { horiz: false, coord: 1100, from: 0,    to: WASTELAND_Y },
        { horiz: false, coord: 1500, from: 0,    to: WASTELAND_Y },
        { horiz: false, coord: 1900, from: 0,    to: WASTELAND_Y },
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
          const seed = Math.sin(g.frame * 0.11 + li * 7.3 + lr.coord * 0.02);
          const pwr  = g.powerLevel / 100;
          const flickerChance = pwr < 0.5 ? Math.abs(seed) < 0.15 : false;
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

        // ── PABLO TOWER — special villain skyscraper rendering ────────────
        if (b.id === 'pablo_tower') {
          // Outer glow pulse
          const pulse = 0.18 + Math.sin(g.frame * 0.03) * 0.08;
          ctx.shadowColor = isNear ? 'rgba(0,255,65,.7)' : 'rgba(80,0,120,.9)';
          ctx.shadowBlur = isNear ? 18 : 28;
          // Main body — dark imposing mass
          const grad = ctx.createLinearGradient(bx, by, bx, by + b.h);
          grad.addColorStop(0, 'rgba(12,2,20,.98)');
          grad.addColorStop(1, 'rgba(4,8,4,.97)');
          ctx.fillStyle = grad; ctx.fillRect(bx, by, b.w, b.h);
          ctx.shadowBlur = 0;
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
          ctx.shadowColor = '#00ff41'; ctx.shadowBlur = isNear ? 10 : 4;
          ctx.fillStyle = isNear ? '#00ff41' : 'rgba(180,0,255,.8)';
          ctx.font = 'bold 11px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText('PABLO TOWER', bx + b.w / 2, by + b.h / 2 + 4);
          ctx.shadowBlur = 0;
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

        // ── Default building rendering ────────────────────────────────────
        ctx.strokeStyle = isLocked ? `rgba(255,120,50,${isNear ? .8 : .3})` : b.bright ? `rgba(0,255,65,${isNear ? .9 : .5})` : `rgba(0,180,50,${isNear ? .7 : .3})`;
        ctx.lineWidth = isNear ? 2 : 1; ctx.strokeRect(bx, by, b.w, b.h);
        ctx.fillStyle = isLocked ? 'rgba(255,80,0,.04)' : 'rgba(0,255,65,.025)'; ctx.fillRect(bx, by, b.w, b.h);
        const cs = 7; ctx.lineWidth = 1.5;
        ctx.strokeStyle = isLocked ? 'rgba(255,120,50,.5)' : b.bright ? 'rgba(0,255,65,.7)' : 'rgba(0,200,50,.38)';
        [[bx, by, 1, 1], [bx + b.w, by, -1, 1], [bx, by + b.h, 1, -1], [bx + b.w, by + b.h, -1, -1]].forEach(([cx2, cy2, sx, sy]) => {
          ctx.beginPath(); ctx.moveTo(cx2, cy2 + (sy as number) * cs); ctx.lineTo(cx2, cy2); ctx.lineTo(cx2 + (sx as number) * cs, cy2); ctx.stroke();
        });
        ctx.fillStyle = isLocked ? 'rgba(255,140,60,.7)' : b.bright ? (isNear ? '#00ff41' : 'rgba(0,255,65,.6)') : 'rgba(0,200,50,.42)';
        ctx.font = `${b.bright ? 10 : 9}px "Share Tech Mono"`; ctx.textAlign = 'center';
        ctx.fillText(b.label + (isLocked ? ' 🔒' : ''), bx + b.w / 2, by + b.h / 2 + 4);
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
          ctx.fillStyle = isNearNpc ? nCol : 'rgba(0,255,65,.3)';
          ctx.font = `${isNearNpc ? 'bold ' : ''}8px "Share Tech Mono"`;
          ctx.textAlign = 'center'; ctx.fillText(n.name, nx2, ny2 - 17);
        }
        if (isNearNpc && !nb) {
          ctx.fillStyle = g.blink ? 'rgba(0,255,65,.85)' : 'rgba(0,255,65,.3)';
          ctx.font = '8px "Share Tech Mono"'; ctx.textAlign = 'center';
          ctx.fillText('[E]', nx2, ny2 - 27);
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
        ctx.fillStyle = spk ? '#00ffcc' : 'rgba(100,180,255,.6)'; ctx.font = 'bold 8px "Share Tech Mono"'; ctx.textAlign = 'center';
        ctx.fillText(op.name, px2, py2 - 12);
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
          ctx.fillStyle = '#88aaff'; ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'center';
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
        const aggroRange2 = t.type === 'SPY' ? 80 : (t.type === 'PROWLER' || t.type === 'BORDER_GANG') ? 55 : 70;
        const chasing = dist2 < aggroRange2;
        const a = chasing ? 1 : 0.5;
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
        } else {
          // RAIDER — knight diamond
          ctx.beginPath(); ctx.moveTo(tx,ty-7); ctx.lineTo(tx+5,ty); ctx.lineTo(tx,ty+7); ctx.lineTo(tx-5,ty); ctx.closePath(); ctx.fill();
          ctx.fillStyle='rgba(255,255,255,.2)'; ctx.fillRect(tx-2,ty-3,4,6);
        }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
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
      // Boots
      ctx.fillStyle = '#224422'; ctx.fillRect(px - 6, py2 + 4, 4, 5); ctx.fillRect(px + 2, py2 + 4, 4, 5);
      // Legs
      ctx.fillStyle = '#335533'; ctx.fillRect(px - 5, py2 - 1, 4, 6); ctx.fillRect(px + 1, py2 - 1, 4, 6);
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
      // Attack swing arc
      if (g.attackFlash > 0) {
        ctx.strokeStyle = `rgba(255,255,0,${g.attackFlash / 8})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py2, 72, 0, Math.PI * 2); ctx.stroke();
      }
      if (speaking) { ctx.strokeStyle = 'rgba(0,255,180,.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(px, py2, 14, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }

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
          ctx.fillStyle = '#5599ff'; ctx.font = '7px "Share Tech Mono"'; ctx.textAlign = 'center';
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

      // ── RDR2-style circular minimap ──────────────────────────────────────────
      const mmR = 70, mmCX = cw - mmR - 14, mmCY = mmR + 14;
      const toMX = (wx: number) => mmCX - mmR + (wx / W) * (mmR * 2);
      const toMY = (wy: number) => mmCY - mmR + (wy / H) * (mmR * 2);
      ctx.save();
      ctx.beginPath(); ctx.arc(mmCX, mmCY, mmR, 0, Math.PI * 2); ctx.clip();
      // Terrain
      ctx.fillStyle = 'rgba(0,8,0,.93)'; ctx.fillRect(mmCX - mmR, mmCY - mmR, mmR * 2, mmR * 2);
      const wbMY = toMY(WASTELAND_Y);
      if (wbMY < mmCY + mmR) { ctx.fillStyle = 'rgba(22,10,0,.88)'; ctx.fillRect(mmCX - mmR, wbMY, mmR * 2, mmR + mmCY - wbMY + mmR); }
      // Gang zones
      for (const gz of GANG_ZONES) { ctx.fillStyle = gz.color.replace('.06', '.3').replace('.05', '.25'); ctx.fillRect(toMX(gz.x), toMY(gz.y), (gz.w / W) * mmR * 2, (gz.h / H) * mmR * 2); }
      // Wasteland line
      ctx.strokeStyle = 'rgba(0,255,65,.2)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(mmCX - mmR, wbMY); ctx.lineTo(mmCX + mmR, wbMY); ctx.stroke(); ctx.setLineDash([]);
      // Buildings
      for (const b of BUILDINGS) {
        const isLk = g.locks.has(b.id) && !!g.locks.get(b.id)?.ownerName;
        ctx.fillStyle = isLk ? 'rgba(255,130,50,.7)' : b.bright ? 'rgba(0,255,65,.9)' : 'rgba(0,180,55,.55)';
        ctx.fillRect(toMX(b.x), toMY(b.y), Math.max(2.5, (b.w / W) * mmR * 2), Math.max(1.5, (b.h / H) * mmR * 2));
      }
      // NPCs — yellow dots
      for (const n of NPCS) {
        ctx.fillStyle = 'rgba(255,220,30,.75)'; ctx.shadowColor = 'rgba(255,220,30,.4)'; ctx.shadowBlur = 3;
        ctx.beginPath(); ctx.arc(toMX(n.x), toMY(n.y), 1.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
      // Threats — red/orange dots (pulsing)
      const tPulse = Math.sin(g.frame * 0.12) * 0.4 + 0.6;
      for (const t of g.threats) {
        const tc = THREAT_COL[t.type] ?? '#ff4444';
        ctx.fillStyle = tc; ctx.shadowColor = tc; ctx.shadowBlur = 4 * tPulse;
        ctx.beginPath(); ctx.arc(toMX(t.x), toMY(t.y), 2.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
      // Other players — cyan
      for (const [, op] of g.peers) {
        ctx.fillStyle = '#44aaff'; ctx.shadowColor = '#44aaff'; ctx.shadowBlur = 3;
        ctx.beginPath(); ctx.arc(toMX(op.x), toMY(op.y), 2.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
      // Player — white glowing triangle pointing up
      const pmx = toMX(g.px), pmy = toMY(g.py);
      ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#00ff41'; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.moveTo(pmx, pmy - 5); ctx.lineTo(pmx - 3.5, pmy + 3); ctx.lineTo(pmx + 3.5, pmy + 3); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      // Vignette edge
      const vGrad = ctx.createRadialGradient(mmCX, mmCY, mmR * 0.65, mmCX, mmCY, mmR);
      vGrad.addColorStop(0, 'rgba(0,0,0,0)'); vGrad.addColorStop(1, 'rgba(0,0,0,.6)');
      ctx.fillStyle = vGrad; ctx.fillRect(mmCX - mmR, mmCY - mmR, mmR * 2, mmR * 2);
      ctx.restore();
      // Circle border
      ctx.strokeStyle = 'rgba(0,255,65,.45)'; ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(0,255,65,.35)'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(mmCX, mmCY, mmR, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
      // Compass
      ctx.fillStyle = 'rgba(0,255,65,.55)'; ctx.textAlign = 'center'; ctx.font = 'bold 8px "Share Tech Mono",monospace';
      ctx.fillText('N', mmCX, mmCY - mmR - 4);
      ctx.fillText('S', mmCX, mmCY + mmR + 11);
      ctx.font = '7px "Share Tech Mono",monospace';
      ctx.fillText('W', mmCX - mmR - 7, mmCY + 3);
      ctx.fillText('E', mmCX + mmR + 7, mmCY + 3);
      ctx.textAlign = 'left';

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize); };
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

      {/* TOP-LEFT — player identity */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 100, display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', background: 'rgba(0,6,0,.82)', border: '1px solid rgba(0,255,65,.2)', padding: '.3rem .6rem' }}>
          <div style={{ width: 6, height: 6, background: '#00ff41', boxShadow: '0 0 6px rgba(0,255,65,.7)' }} />
          <span style={{ fontFamily: "'VT323',monospace", fontSize: '1rem', color: '#00ff41', letterSpacing: '.1em' }}>{char.name}</span>
          <span style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.08em', borderLeft: '1px solid rgba(0,255,65,.15)', paddingLeft: '.45rem' }}>{char.class.toUpperCase()}</span>
          {hasDevice && <span style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.55)', border: '1px solid rgba(0,255,65,.25)', padding: '1px 4px' }}>PABLO</span>}
          {char.hasBusiness === false && <span style={{ fontSize: '.45rem', color: 'rgba(255,100,100,.8)', border: '1px solid rgba(255,60,60,.3)', padding: '1px 4px', animation: 'none' }}>UNSAVED</span>}
        </div>
        <div style={{ display: 'flex', gap: '3px' }}>
          {/* HP */}
          <div style={{ background: 'rgba(0,6,0,.82)', border: '1px solid rgba(0,255,65,.18)', padding: '.25rem .5rem', minWidth: 90 }}>
            <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.12em', marginBottom: '3px' }}>HP</div>
            <div style={{ position: 'relative', height: 4, background: 'rgba(0,255,65,.08)', width: '100%' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${hpPct}%`, background: hpPct > 50 ? '#00ff41' : hpPct > 25 ? '#aaff44' : '#ff4444', boxShadow: `0 0 4px ${hpPct > 50 ? 'rgba(0,255,65,.5)' : 'rgba(255,0,0,.5)'}`, transition: 'width .2s, background .2s' }} />
            </div>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '.75rem', color: hpPct > 50 ? '#00ff41' : hpPct > 25 ? '#aaff44' : '#ff4444', letterSpacing: '.06em', marginTop: '2px' }}>{Math.floor(hpPct)}/100</div>
          </div>
          {/* Salary */}
          <div style={{ background: 'rgba(0,6,0,.82)', border: '1px solid rgba(0,255,65,.18)', padding: '.25rem .5rem' }}>
            <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.12em', marginBottom: '3px' }}>CREAM</div>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '.75rem', color: '#00ff41', letterSpacing: '.06em', marginTop: '2px', whiteSpace: 'nowrap' }}>ç{salary.toLocaleString()}</div>
          </div>
          {/* Zone */}
          <div style={{ background: 'rgba(0,6,0,.82)', border: `1px solid ${zone === 'WASTELAND' ? 'rgba(170,255,68,.2)' : 'rgba(0,255,65,.18)'}`, padding: '.25rem .5rem' }}>
            <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.12em', marginBottom: '3px' }}>ZONE</div>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '.75rem', color: zone === 'WASTELAND' ? '#88ff44' : '#00ff41', letterSpacing: '.06em', marginTop: '2px' }}>{zone}</div>
          </div>
        </div>
        {/* Survival meters */}
        <div style={{ display: 'flex', gap: '3px', marginTop: '3px' }}>
          {[
            { label: 'HUNGER', val: hunger, col: hunger > 50 ? '#00ff41' : hunger > 25 ? '#aaff22' : '#ff6622' },
            { label: 'THIRST', val: thirst, col: thirst > 50 ? '#33aaff' : thirst > 25 ? '#aaff22' : '#ff6622' },
            { label: 'ENERGY', val: energy, col: energy > 50 ? '#ffcc00' : energy > 25 ? '#aaff22' : '#ff4444' },
          ].map(({ label, val, col }) => (
            <div key={label} style={{ background: 'rgba(0,6,0,.82)', border: '1px solid rgba(0,255,65,.14)', padding: '.22rem .45rem', minWidth: 68 }}>
              <div style={{ fontSize: '.38rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.1em', marginBottom: '2px' }}>{label}</div>
              <div style={{ position: 'relative', height: 3, background: 'rgba(0,255,65,.07)' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${val}%`, background: col, transition: 'width .3s, background .3s' }} />
              </div>
              <div style={{ fontFamily: "'VT323',monospace", fontSize: '.65rem', color: col, letterSpacing: '.04em', marginTop: '1px' }}>{val}</div>
            </div>
          ))}
        </div>
        {/* Level / EXP / Poison row */}
        <div style={{ display: 'flex', gap: '3px', marginTop: '3px' }}>
          <div style={{ background: 'rgba(0,6,0,.82)', border: '1px solid rgba(0,255,65,.14)', padding: '.22rem .45rem', minWidth: 50 }}>
            <div style={{ fontSize: '.38rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.1em', marginBottom: '2px' }}>LVL</div>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: '.8rem', color: '#ffcc00', letterSpacing: '.06em' }}>{level}</div>
          </div>
          <div style={{ background: 'rgba(0,6,0,.82)', border: '1px solid rgba(0,255,65,.14)', padding: '.22rem .45rem', flex: 1 }}>
            <div style={{ fontSize: '.38rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.1em', marginBottom: '2px' }}>EXP</div>
            <div style={{ position: 'relative', height: 3, background: 'rgba(0,255,65,.07)', marginBottom: '1px' }}>
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
      </div>

      {/* ONLINE PLAYERS — below minimap, top-right */}
      {online.length > 0 && (
        <div style={{ position: 'absolute', top: 170, right: 10, width: 156, background: 'rgba(0,5,0,.88)', border: '1px solid rgba(0,255,65,.18)', zIndex: 100, padding: '.35rem .45rem' }}>
          <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.1em', marginBottom: '.25rem' }}>{online.length} ONLINE</div>
          {online.slice(0, 5).map(p => (
            <div key={p.id} onClick={() => { setDmTarget(dmTarget?.id === p.id ? null : p); setChatOpen(true); }} style={{ fontSize: '.55rem', color: speakIds.has(p.id) ? '#00ffcc' : 'rgba(0,255,65,.5)', lineHeight: 1.7, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.2rem', overflow: 'hidden' }}>
              {speakIds.has(p.id) && <span style={{ fontSize: '.5rem' }}>🎙</span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* BOTTOM — narration + action buttons */}
      <div style={{ position: 'absolute', bottom: 10, left: 10, right: 10, zIndex: 100, display: 'flex', alignItems: 'flex-end', gap: '.5rem', pointerEvents: 'none' }}>
        {/* Narration */}
        <div style={{ flex: 1, background: 'rgba(0,6,0,.88)', border: '1px solid rgba(0,255,65,.18)', padding: '.5rem .75rem', pointerEvents: 'none' }}>
          {nearB && (
            <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.12em', marginBottom: '.2rem' }}>
              NEARBY: {nearB.label}{lockMap.has(nearB.id) ? ' 🔒' : ''}
            </div>
          )}
          <div style={{ fontSize: '.65rem', color: 'rgba(0,255,65,.6)', letterSpacing: '.04em', lineHeight: 1.5 }}>{narration}</div>
          <div style={{ marginTop: '.3rem', fontSize: '.42rem', color: 'rgba(0,255,65,.18)', letterSpacing: '.08em' }}>WASD move · E enter · F attack · C chat · V voice · P device · ESC close</div>
        </div>
        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', pointerEvents: 'all' }}>
          <button onClick={toggleVoice} style={{ padding: '.35rem .6rem', background: voice ? (speaking ? 'rgba(0,255,180,.12)' : 'rgba(0,255,65,.1)') : 'rgba(0,5,0,.88)', border: `1px solid ${voice ? (speaking ? 'rgba(0,255,180,.6)' : 'rgba(0,255,65,.4)') : 'rgba(0,255,65,.15)'}`, color: voice ? (speaking ? '#00ffcc' : '#00ff41') : 'rgba(0,255,65,.28)', cursor: 'pointer', fontSize: '.58rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", minWidth: 56, textAlign: 'center' }}>
            {voice ? (speaking ? '● MIC' : '○ MIC') : 'MIC [V]'}
          </button>
          <button onClick={() => { const m = toggleMute(); setMuted(m); }} style={{ padding: '.35rem .6rem', background: muted ? 'rgba(255,34,102,.08)' : 'rgba(0,5,0,.88)', border: muted ? '1px solid rgba(255,34,102,.4)' : '1px solid rgba(0,255,65,.15)', color: muted ? '#ff2266' : 'rgba(0,255,65,.28)', cursor: 'pointer', fontSize: '.58rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", minWidth: 56, textAlign: 'center' }}>
            {muted ? '✕ MUTE' : '♪ SND'}
          </button>
          <button onClick={() => { setChatOpen(v => !v); setUnread(0); }} style={{ padding: '.35rem .6rem', background: chatOpen ? 'rgba(0,255,65,.1)' : 'rgba(0,5,0,.88)', border: chatOpen ? '1px solid rgba(0,255,65,.4)' : '1px solid rgba(0,255,65,.15)', color: chatOpen ? '#00ff41' : 'rgba(0,255,65,.28)', cursor: 'pointer', fontSize: '.58rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", minWidth: 56, textAlign: 'center', position: 'relative' }}>
            {unread > 0 && <span style={{ position: 'absolute', top: 2, right: 3, width: 6, height: 6, background: '#ff4444', borderRadius: '50%' }} />}
            CHAT [C]
          </button>
          <button onClick={() => setShowMap(v => !v)} style={{ padding: '.35rem .6rem', background: showMap ? 'rgba(0,255,65,.1)' : 'rgba(0,5,0,.88)', border: showMap ? '1px solid rgba(0,255,65,.4)' : '1px solid rgba(0,255,65,.15)', color: showMap ? '#00ff41' : 'rgba(0,255,65,.28)', cursor: 'pointer', fontSize: '.58rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", minWidth: 56, textAlign: 'center' }}>
            MAP [M]
          </button>
          <button onClick={() => setShowPablo(v => !v)} style={{ padding: '.35rem .6rem', background: showPablo ? 'rgba(0,255,65,.1)' : 'rgba(0,5,0,.88)', border: showPablo ? '1px solid rgba(0,255,65,.4)' : '1px solid rgba(0,255,65,.15)', color: showPablo ? '#00ff41' : 'rgba(0,255,65,.28)', cursor: 'pointer', fontSize: '.58rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", minWidth: 56, textAlign: 'center' }}>
            PABLO [P]
          </button>
          <button onClick={() => setShowStats(v => !v)} style={{ padding: '.35rem .6rem', background: showStats ? 'rgba(255,170,0,.08)' : 'rgba(0,5,0,.88)', border: showStats ? '1px solid rgba(255,170,0,.4)' : '1px solid rgba(0,255,65,.15)', color: showStats ? '#ffaa00' : 'rgba(0,255,65,.28)', cursor: 'pointer', fontSize: '.58rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace", minWidth: 56, textAlign: 'center' }}>
            STATS
          </button>
          <button onClick={() => navigate('/world')} style={{ padding: '.35rem .6rem', background: 'rgba(0,5,0,.88)', border: '1px solid rgba(0,255,65,.1)', color: 'rgba(0,255,65,.2)', cursor: 'pointer', fontSize: '.55rem', letterSpacing: '.06em', fontFamily: "'Share Tech Mono',monospace", minWidth: 56, textAlign: 'center' }}>
            ← MENU
          </button>
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
                <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.05em', marginTop: '1px' }}>{data.buildings.join(', ')}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '.3rem .55rem', borderTop: '1px solid rgba(0,255,65,.07)', fontSize: '.42rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.07em' }}>
            Total buildings: {BUILDINGS.filter(b => b.id !== 'pablo_tower').length} · Claimed: {Object.values(ownerStats).reduce((a, v) => a + v.count, 0)}
          </div>
        </div>
      )}

      {/* ── SERVER FULL OVERLAY ── */}
      {serverFull && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 9000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', fontFamily: "'Share Tech Mono',monospace" }}>
          <div style={{ fontFamily: "'VT323',monospace", fontSize: '3rem', color: '#ff4444', letterSpacing: '.18em', textShadow: '0 0 20px rgba(255,0,0,.5)' }}>SERVER FULL</div>
          <div style={{ fontSize: '.65rem', color: 'rgba(255,80,80,.6)', letterSpacing: '.1em' }}>MAX 50 OPERATIVES ONLINE — Try again shortly.</div>
          <button onClick={() => navigate('/world')} style={{ marginTop: '.5rem', padding: '.65rem 1.5rem', background: 'rgba(255,80,80,.08)', border: '1px solid rgba(255,80,80,.4)', color: '#ff8888', fontFamily: "'VT323',monospace", fontSize: '1.2rem', letterSpacing: '.15em', cursor: 'pointer' }}>← BACK TO MENU</button>
        </div>
      )}

      {/* ── CHAT PANEL ── */}
      {chatOpen && (
        <div style={{ position: 'absolute', bottom: 120, left: 10, width: 280, maxHeight: '42vh', background: 'rgba(0,5,0,.97)', border: '1px solid rgba(0,255,65,.3)', display: 'flex', flexDirection: 'column', zIndex: 200 }}>
          <div style={{ padding: '.35rem .55rem', borderBottom: '1px solid rgba(0,255,65,.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: "'VT323',monospace", fontSize: '.85rem', color: '#00ff41', letterSpacing: '.1em' }}>{dmTarget ? `DM → ${dmTarget.name}` : 'WORLD CHAT'}</span>
            <div style={{ display: 'flex', gap: '.3rem' }}>
              {dmTarget && <button onClick={() => setDmTarget(null)} style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.4)', border: 'none', background: 'transparent', cursor: 'pointer' }}>× DM</button>}
              <button onClick={() => setChatOpen(false)} style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
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
      {showPablo && (
        <div style={{ position: 'absolute', bottom: 120, right: 70, width: 300, maxHeight: '50vh', background: 'rgba(0,5,0,.97)', border: '1px solid rgba(0,255,65,.38)', display: 'flex', flexDirection: 'column', zIndex: 200 }}>
          <div style={{ padding: '.45rem .65rem', borderBottom: '1px solid rgba(0,255,65,.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: "'VT323',monospace", fontSize: '1rem', color: '#00ff41', letterSpacing: '.12em' }}>PABLO DEVICE</div>
              <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.07em' }}>{hasDevice ? 'ACTIVATED' : 'NOT REGISTERED — VISIT PABLO STORE'}</div>
            </div>
            <button onClick={() => setShowPablo(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(0,255,65,.4)', cursor: 'pointer', fontSize: '.75rem' }}>✕</button>
          </div>
          {!hasDevice ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', textAlign: 'center' }}>
              <div>
                <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.1rem', color: 'rgba(0,255,65,.38)', letterSpacing: '.1em', marginBottom: '.35rem' }}>DEVICE LOCKED</div>
                <div style={{ fontSize: '.58rem', color: 'rgba(0,255,65,.28)', lineHeight: 1.7 }}>Walk to the <span style={{ color: '#00ff41' }}>PABLO STORE</span> and press [E].</div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ flex: 1, overflowY: 'auto', padding: '.55rem', display: 'flex', flexDirection: 'column', gap: '.35rem', minHeight: 80 }}>
                {pabloMsgs.length === 0 && <div style={{ fontSize: '.58rem', color: 'rgba(0,255,65,.22)', lineHeight: 1.7 }}>&gt; PABLO ONLINE<br />&gt; Ask anything.</div>}
                {pabloMsgs.map((m, i) => (
                  <div key={i} style={{ fontSize: '.62rem', lineHeight: 1.5, color: m.role === 'user' ? 'rgba(0,255,65,.52)' : '#00ff41', paddingLeft: m.role === 'pablo' ? '.4rem' : 0, borderLeft: m.role === 'pablo' ? '2px solid rgba(0,255,65,.22)' : 'none' }}>
                    <span style={{ color: 'rgba(0,255,65,.32)', fontFamily: "'VT323',monospace", fontSize: '.72rem', marginRight: '.25rem' }}>{m.role === 'user' ? `[${char.name.slice(0, 8)}]` : '[PABLO]'}</span>{m.text}
                  </div>
                ))}
                {pabloLoad && <div style={{ fontSize: '.58rem', color: 'rgba(0,255,65,.32)', fontFamily: "'VT323',monospace" }}>...</div>}
              </div>
              <div style={{ padding: '.38rem', borderTop: '1px solid rgba(0,255,65,.12)', display: 'flex', gap: '.32rem' }}>
                <input value={pabloIn} onChange={e => setPabloIn(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendPablo()} placeholder="Ask PABLO..." style={{ flex: 1, background: 'rgba(0,10,0,.9)', border: '1px solid rgba(0,255,65,.18)', color: '#00ff41', fontFamily: "'Share Tech Mono',monospace", fontSize: '.62rem', padding: '.25rem .4rem', outline: 'none', caretColor: '#00ff41' }} />
                <button onClick={sendPablo} style={{ background: 'rgba(0,255,65,.08)', border: '1px solid rgba(0,255,65,.3)', color: '#00ff41', cursor: 'pointer', padding: '0 .4rem', fontSize: '.62rem' }}>↵</button>
              </div>
            </>
          )}
        </div>
      )}

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

      {/* ── PABLO TOWER — OFFICE RENTAL ── */}
      {showOffice && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,3,0,.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ width: 460, maxWidth: '90vw', border: '1px solid rgba(140,0,220,.45)', background: 'rgba(6,0,12,.99)', padding: '1.65rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.1rem' }}>
              <div>
                <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.7rem', color: '#00ff41', letterSpacing: '.14em' }}>PABLO TOWER</div>
                <div style={{ fontSize: '.52rem', color: 'rgba(140,0,220,.7)', letterSpacing: '.08em', marginTop: '.15rem' }}>FLOORS 1–39 — COMMERCIAL LEASE. FLOOR 40+ RESTRICTED.</div>
              </div>
              <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                {rentedOffice && (
                  <button onClick={() => { const lk = lockMap.get('pablo_tower'); setPwPrompt({ bid: 'pablo_tower', label: 'PABLO TOWER', mode: lk ? 'enter' : 'set' }); setShowOffice(false); }} style={{ fontSize: '.48rem', padding: '2px 7px', background: 'rgba(0,255,65,.06)', border: '1px solid rgba(0,255,65,.22)', color: 'rgba(0,255,65,.45)', cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace" }}>
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
                    <div style={{ fontSize: '.62rem', color: isRented ? '#00ff41' : canAfford ? 'rgba(0,255,65,.52)' : 'rgba(255,100,100,.5)', fontFamily: "'VT323',monospace", marginBottom: '.28rem' }}>ç{price.toLocaleString()} CREAM</div>
                    <div style={{ fontSize: '.52rem', color: 'rgba(0,255,65,.32)', lineHeight: 1.6 }}>{desc}</div>
                    <button onClick={() => {
                      if (isRented) { localStorage.removeItem('sm_office'); setRentedOffice(null); setNarr('> Lease cancelled.'); return; }
                      if (!canAfford) { setNarr(`> Need ç${price.toLocaleString()} CREAM. Have ç${salary.toLocaleString()}.`); return; }
                      const g = gs.current; g.salary -= price; setSalary(g.salary);
                      localStorage.setItem('sm_office', label); setRentedOffice(label);
                      setNarr(`> ${label} leased. ç${price.toLocaleString()} CREAM deducted. Set a security code from the lease panel.`);
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
            <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.12em', marginBottom: '.5rem' }}>── SELECT FLOOR ──</div>
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
            <div style={{ marginTop: '.8rem', fontSize: '.38rem', color: 'rgba(0,255,65,.2)', textAlign: 'center', letterSpacing: '.1em' }}>CLICK FLOOR TO EXPAND · ESC TO EXIT BUILDING</div>
          </div>
        </div>
      )}

      {/* ── POWER GRID HUD INDICATOR ── */}
      {powerPct < 100 && (
        <div style={{ position: 'absolute', top: '3.5rem', right: '.8rem', zIndex: 200, fontFamily: "'Share Tech Mono',monospace", fontSize: '.4rem', border: `1px solid rgba(${powerPct < 30 ? '255,60,60' : '255,140,0'},.5)`, background: 'rgba(0,0,0,.8)', padding: '.3rem .55rem', color: powerPct < 30 ? '#ff4444' : '#ffaa00', letterSpacing: '.1em', animation: powerPct < 30 ? 'smfade 0.6s steps(1) infinite alternate' : 'none' }}>
          ⚡ POWER {powerPct}%{powerPct < 30 ? ' — BLACKOUT' : ' — REDUCED'}
        </div>
      )}

      {/* ── CITY EVENT TICKER ── */}
      {cityEvent && (
        <div style={{ position: 'absolute', bottom: '3.8rem', left: '50%', transform: 'translateX(-50%)', zIndex: 180, fontFamily: "'Share Tech Mono',monospace", fontSize: '.38rem', color: 'rgba(100,200,255,.7)', letterSpacing: '.08em', whiteSpace: 'nowrap', pointerEvents: 'none', textShadow: '0 0 8px rgba(100,200,255,.3)' }}>
          {cityEvent}
        </div>
      )}

      {/* ── LEVEL UP OVERLAY ── */}
      {/* ── QUICK JOB PANEL ──────────────────────────────────────────────── */}
      {jobPanel && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 360 }}>
          <div style={{ width: 360, border: '1px solid rgba(0,255,65,.4)', background: 'rgba(0,8,2,.97)', padding: '1.6rem', fontFamily: "'Share Tech Mono',monospace" }}>
            <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.15em', marginBottom: '.3rem' }}>QUICK JOB AVAILABLE</div>
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
                      g.floaters.push({ x: g.px, y: g.py - 20, text: `+$${jobPanel.pay}`, color: '#ffdd44', life: 70, maxLife: 70 });
                      setSalary(g.salary); sfxCoin();
                      setNarr(`> JOB COMPLETE — ${jobPanel.label}. +$${jobPanel.pay}. Credits transferred.`);
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
          if (gs.current.salary < price) { sfxError(); setNarr(`> INSUFFICIENT CREAM — Need ç${price.toLocaleString()}. Have ç${gs.current.salary.toLocaleString()}.`); return; }
          gs.current.salary -= price; setSalary(gs.current.salary);
          gs.current.cargo[cid] = (gs.current.cargo[cid] || 0) + 1;
          setCargo({ ...gs.current.cargo }); sfxCoin();
          setNarr(`> BOUGHT 1x ${c.name} [ç${price.toLocaleString()} CREAM]. Cargo: ${totalCargo + 1}/${MAX_CARGO}. Haul to ${isCity ? 'the Wasteland' : 'Minx City'} and sell for profit.`);
        };
        const doSell = (cid: string) => {
          const c = COMMODITIES.find(x => x.id === cid)!;
          if (!gs.current.cargo[cid] || gs.current.cargo[cid] < 1) { sfxError(); setNarr(`> NO STOCK — You are not carrying any ${c.name}.`); return; }
          const price = isCity ? cp[cid].citySell : cp[cid].wasteSell;
          gs.current.salary += price; setSalary(gs.current.salary);
          gs.current.cargo[cid] -= 1;
          if (gs.current.cargo[cid] <= 0) delete gs.current.cargo[cid];
          setCargo({ ...gs.current.cargo }); sfxCoin();
          setNarr(`> SOLD 1x ${c.name} [+ç${price.toLocaleString()} CREAM]. Balance: ç${gs.current.salary.toLocaleString()}.`);
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
                  <div style={{ fontSize:'.42rem', color:'rgba(0,255,65,.3)', marginTop:'.1rem' }}>ç{salary.toLocaleString()} CREAM</div>
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
                        {r.name} → <span style={{ color:'#00ff41' }}>+ç{(isCity ? r.cityRoute : r.wasteRoute).toLocaleString()}/unit</span>
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
                          ç{buyPrice.toLocaleString()}
                        </button>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <button onClick={() => doSell(c.id)} style={{ width:'100%', padding:'.22rem .3rem', background: canSell ? 'rgba(0,255,65,.08)' : 'transparent', border: canSell ? '1px solid rgba(0,255,65,.4)' : '1px solid rgba(0,255,65,.1)', color: canSell ? '#00ff41' : 'rgba(0,255,65,.18)', fontFamily:"'VT323',monospace", fontSize:'.82rem', cursor: canSell ? 'pointer' : 'default', letterSpacing:'.05em' }}>
                          {canSell ? `+ç${sellPrice.toLocaleString()}` : '——'}
                        </button>
                      </div>
                      <div style={{ textAlign:'right', fontSize:'.48rem', color: profit > 0 ? 'rgba(0,255,65,.55)' : 'rgba(255,80,80,.45)' }}>
                        {profit > 0 ? `+ç${profit.toLocaleString()}` : `–ç${Math.abs(profit).toLocaleString()}`}
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
                          {qty}× {c.name} → sell here for ç{sellHere.toLocaleString()}/unit
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
      {showMap && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 360 }}
          onClick={() => setShowMap(false)}>
          <div style={{ position: 'relative', width: 560, border: '1px solid rgba(0,255,65,.3)', background: 'rgba(0,6,2,.98)', padding: '1.2rem', fontFamily: "'Share Tech Mono',monospace" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.8rem' }}>
              <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.8rem', color: '#00ff41', letterSpacing: '.2em' }}>MINX CITY MAP</div>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.1em' }}>SERVER: MINX CITY · PST</div>
                <button onClick={() => setShowMap(false)} style={{ padding: '.2rem .5rem', background: 'transparent', border: '1px solid rgba(0,255,65,.2)', color: 'rgba(0,255,65,.4)', cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace", fontSize: '.5rem' }}>ESC</button>
              </div>
            </div>
            {/* SVG map */}
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', border: '1px solid rgba(0,255,65,.1)', background: '#00020a' }}>
              {/* City vs Wasteland */}
              <rect x={0} y={0} width={W} height={WASTELAND_Y} fill="rgba(0,10,3,.8)" />
              <rect x={0} y={WASTELAND_Y} width={W} height={H - WASTELAND_Y} fill="rgba(10,5,0,.8)" />
              <line x1={0} y1={WASTELAND_Y} x2={W} y2={WASTELAND_Y} stroke="rgba(0,255,65,.2)" strokeWidth={4} strokeDasharray="20 10" />
              <text x={20} y={WASTELAND_Y - 15} fill="rgba(0,255,65,.35)" fontSize={28} fontFamily="Share Tech Mono">MINX CITY</text>
              <text x={20} y={WASTELAND_Y + 38} fill="rgba(255,130,50,.35)" fontSize={28} fontFamily="Share Tech Mono">WASTELAND</text>
              {/* Buildings */}
              {BUILDINGS.map(b => (
                <g key={b.id}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={b.bright ? 'rgba(0,255,65,.25)' : 'rgba(0,180,55,.14)'} stroke={b.bright ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.2)'} strokeWidth={2} />
                  <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 5} textAnchor="middle" fill="rgba(0,255,65,.5)" fontSize={14} fontFamily="Share Tech Mono">{b.label.substring(0,10)}</text>
                </g>
              ))}
              {/* Player position */}
              <circle cx={gs.current.px} cy={gs.current.py} r={18} fill="none" stroke="#00ff41" strokeWidth={3} />
              <circle cx={gs.current.px} cy={gs.current.py} r={8} fill="#00ff41" />
              <text x={gs.current.px} y={gs.current.py - 26} textAnchor="middle" fill="#00ff41" fontSize={22} fontFamily="Share Tech Mono">{char.name}</text>
              {/* Threats */}
              {gs.current.threats.map((t, ti) => (
                <circle key={ti} cx={t.x} cy={t.y} r={12} fill={THREAT_COL[t.type] ?? '#ff4444'} opacity={0.6} />
              ))}
              {/* Spy indicator */}
              {gs.current.threats.filter(t => t.type === 'SPY').map((t, ti) => (
                <circle key={`spy${ti}`} cx={t.x} cy={t.y} r={16} fill="none" stroke="#ffffaa" strokeWidth={2} strokeDasharray="8 4" />
              ))}
            </svg>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '.6rem', flexWrap: 'wrap' }}>
              {[['#00ff41','CITY BUILDING'],['rgba(255,130,50,.6)','LOCKED'],['#ff4444','THREAT'],['#ffffaa','SPY'],['#5599ff','PABLO GUARD']].map(([c,l]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                  <div style={{ width: 8, height: 8, background: c, borderRadius: 1 }} />
                  <span style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.4)', letterSpacing: '.07em' }}>{l}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '.5rem', fontSize: '.38rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.07em' }}>
              PLAYER: ({Math.round(gs.current.px)}, {Math.round(gs.current.py)}) · {zone} · LVL {level} · ç{salary.toLocaleString()} CREAM · [M] or [ESC] to close
            </div>
          </div>
        </div>
      )}

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
          { amount: 5000,  label: 'ç5K' },
          { amount: 10000, label: 'ç10K' },
          { amount: 25000, label: 'ç25K' },
          { amount: 50000, label: 'ç50K' },
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
          setNarr(`> DEPOSITED ç${amt.toLocaleString()} to SAVINGS.${tax > 0 ? ` PABLO TAX: ç${tax.toLocaleString()}.` : ' No tax.'} Savings: ç${g.savings.toLocaleString()}.`);
        };
        const doWithdraw = () => {
          const amt = parseInt(bankWithAmt) || 0;
          if (amt <= 0 || amt > g.savings) { sfxError(); setNarr('> KONAMI BANK — Insufficient savings balance.'); return; }
          g.savings -= amt; g.salary += amt;
          setSavings(g.savings); setSalary(g.salary);
          addBankTx('SAVINGS → CHECKING WITHDRAWAL', amt, g.salary);
          setBankWithAmt(''); sfxCoin();
          setNarr(`> WITHDREW ç${amt.toLocaleString()} from SAVINGS to CHECKING.`);
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
          setNarr(`> LOAN APPROVED — ç${amount.toLocaleString()} · Int: ç${interest.toLocaleString()} · Fee: ç${origFee.toLocaleString()} · Repay within ~6 min. Late = penalty.`);
        };
        const doRepay = () => {
          const loan = g.loan; if (!loan) return;
          const totalDue = loan.amount + loan.interest;
          if (g.salary < totalDue) { sfxError(); setNarr(`> INSUFFICIENT FUNDS — Need ç${totalDue.toLocaleString()}.`); return; }
          g.salary -= totalDue; setSalary(g.salary);
          g.loan = null; setBankLoan(null);
          addBankTx(`LOAN REPAID ç${loan.amount.toLocaleString()} + ç${loan.interest.toLocaleString()} INT`, -totalDue, g.salary);
          sfxCoin();
          setNarr(`> LOAN REPAID — ç${totalDue.toLocaleString()} CREAM. Account standing: CLEAR. Debt collectors stand down.`);
        };
        const doWire = () => {
          const amt = parseInt(bankWireAmt) || 0;
          const to = bankWireTo.trim().toUpperCase();
          if (!to || amt <= 0) { sfxError(); return; }
          const fee = Math.ceil(amt * 0.03);
          if (amt + fee > g.salary) { sfxError(); setNarr(`> INSUFFICIENT FUNDS — Need ç${(amt+fee).toLocaleString()} (inc. 3% tax).`); return; }
          g.salary -= (amt + fee); setSalary(g.salary);
          addBankTx(`WIRE → ${to}`, -amt, g.salary);
          addBankTx('PABLO CORP. WIRE TAX (3%)', -fee, g.salary);
          wsSend({ type: 'wire', to, amount: amt, from: char.name });
          setBankWireAmt(''); setBankWireTo(''); sfxCoin();
          setNarr(`> WIRE SENT — ç${amt.toLocaleString()} → ${to}. Fee: ç${fee.toLocaleString()}. PABLO Corp. logged it.`);
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
                  <div style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.14em' }}>MEMBER FDIC · EST. 1989 · PAX PABLO · MINX CITY BRANCH 01</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '.38rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em' }}>ACCOUNT HOLDER</div>
                  <div style={{ ...VTB, fontSize: '1.05rem', color: '#00ff41', letterSpacing: '.1em' }}>{char.name}</div>
                  <div style={{ fontSize: '.38rem', color: 'rgba(0,255,65,.2)' }}>{char.class.toUpperCase()} · {char.company}</div>
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
                      { label: 'CHECKING ACCOUNT', val: salary, sub: char.class === 'corporate' ? 'SALARY: +ç2,500 / 30s' : char.class === 'replicant' ? 'GIG PAY: +ç1,200 / 48s' : 'SCAVENGING: +ç600+ / 60s' },
                      { label: 'SAVINGS ACCOUNT', val: savings, sub: 'APY: 0.8% / CYCLE · PABLO TAX: 15% ON INTEREST' },
                    ].map(({ label, val, sub }) => (
                      <div key={label} style={{ border: '1px solid rgba(0,255,65,.2)', padding: '.65rem' }}>
                        <div style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.13em', marginBottom: '.25rem' }}>{label}</div>
                        <div style={{ ...VTB, fontSize: '2.1rem', color: val > 0 ? '#00ff41' : 'rgba(0,255,65,.3)', letterSpacing: '.06em' }}>ç{val.toLocaleString()}</div>
                        <div style={{ fontSize: '.38rem', color: 'rgba(0,255,65,.25)', marginTop: '.1rem' }}>{sub}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ border: '1px solid rgba(0,255,65,.13)', padding: '.6rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                    <div style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.12em' }}>DEPOSIT — CHECKING → SAVINGS</div>
                    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                      <input value={bankDepAmt} onChange={e => setBankDepAmt(e.target.value.replace(/\D/g,''))} placeholder="AMOUNT..." style={{ ...inp, maxWidth: 180 }} />
                      <button onClick={doDeposit} style={actBtn(parseInt(bankDepAmt) > 0 && parseInt(bankDepAmt) <= salary)}>DEPOSIT ↓</button>
                      {parseInt(bankDepAmt) >= 5000 && <span style={{ fontSize: '.4rem', color: '#ffaa44' }}>PABLO TAX: ç{Math.floor((parseInt(bankDepAmt)||0)*.12).toLocaleString()} (12%)</span>}
                      {parseInt(bankDepAmt) > 0 && parseInt(bankDepAmt) < 5000 && <span style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.3)' }}>No tax (under ç5k)</span>}
                    </div>
                  </div>
                  <div style={{ border: '1px solid rgba(0,255,65,.13)', padding: '.6rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                    <div style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.12em' }}>WITHDRAW — SAVINGS → CHECKING</div>
                    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                      <input value={bankWithAmt} onChange={e => setBankWithAmt(e.target.value.replace(/\D/g,''))} placeholder="AMOUNT..." style={{ ...inp, maxWidth: 180 }} />
                      <button onClick={doWithdraw} style={actBtn(parseInt(bankWithAmt) > 0 && parseInt(bankWithAmt) <= savings)}>WITHDRAW ↑</button>
                    </div>
                  </div>
                  <div style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.15)', lineHeight: 1.8 }}>
                    Savings earn 0.8% APY per cycle (~3 min). PABLO Corp. takes 15% of all interest. Deposits ≥ ç5,000 subject to 12% Capital Deployment Tax. KONAMI BANK is not liable for seizures during martial law.
                  </div>
                </>)}

                {/* ── LOANS ── */}
                {bankTab === 'loans' && (<>
                  <div style={{ border: '1px solid rgba(0,255,65,.13)', padding: '.65rem' }}>
                    <div style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.12em', marginBottom: '.35rem' }}>CREDIT SERVICES — KONAMI BANK</div>
                    <div style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.35)', lineHeight: 1.8 }}>
                      18% flat interest · Repay within 60 game cycles (~6 min) · Late = 5% salary penalty/cycle via PABLO Corp. Debt Collection · Loans ≥ ç25k carry 2% origination fee.
                    </div>
                  </div>
                  {!bankLoan ? (
                    <>
                      <div style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.28)', letterSpacing: '.1em' }}>AVAILABLE CREDIT — SELECT AMOUNT</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.5rem' }}>
                        {LOAN_OPTIONS.map(opt => {
                          const int18 = Math.floor(opt.amount * .18);
                          const fee  = opt.amount >= 25000 ? Math.floor(opt.amount * .02) : 0;
                          return (
                            <button key={opt.amount} onClick={() => doLoan(opt.amount)} style={{ padding: '.75rem .4rem', border: '1px solid rgba(0,255,65,.3)', background: 'rgba(0,255,65,.04)', cursor: 'pointer', textAlign: 'center' }}>
                              <div style={{ ...VTB, fontSize: '1.4rem', color: '#00ff41', letterSpacing: '.06em' }}>{opt.label}</div>
                              <div style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.4)', marginTop: '.15rem' }}>+ç{int18.toLocaleString()} INT</div>
                              {fee > 0 && <div style={{ fontSize: '.38rem', color: '#ffaa44' }}>-ç{fee.toLocaleString()} ORIG</div>}
                              <div style={{ fontSize: '.36rem', color: 'rgba(0,255,65,.22)', marginTop: '.12rem' }}>DUE ~6 MIN</div>
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.15)', lineHeight: 1.7 }}>
                        Collateral: NONE REQUIRED. Credit score: PROVISIONAL POSITIVE. One active loan at a time. PABLO Corp. reserves right to restructure debt without notice. This is not a threat.
                      </div>
                    </>
                  ) : (
                    <div style={{ border: `1px solid ${isOverdue ? 'rgba(255,80,80,.4)' : 'rgba(0,255,65,.3)'}`, padding: '.75rem' }}>
                      <div style={{ fontSize: '.4rem', color: isOverdue ? 'rgba(255,100,100,.6)' : 'rgba(0,255,65,.28)', letterSpacing: '.12em', marginBottom: '.45rem' }}>
                        {isOverdue ? '⚠ LOAN OVERDUE — PABLO DEBT COLLECTION ACTIVE' : 'ACTIVE LOAN'}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.45rem', marginBottom: '.65rem' }}>
                        {[
                          { l: 'PRINCIPAL', v: `ç${bankLoan.amount.toLocaleString()}` },
                          { l: 'INTEREST (18%)', v: `ç${bankLoan.interest.toLocaleString()}` },
                          { l: 'TOTAL DUE', v: `ç${(bankLoan.amount + bankLoan.interest).toLocaleString()}` },
                        ].map(({ l, v }) => (
                          <div key={l} style={{ border: '1px solid rgba(0,255,65,.13)', padding: '.45rem' }}>
                            <div style={{ fontSize: '.38rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.08em', marginBottom: '.12rem' }}>{l}</div>
                            <div style={{ ...VTB, fontSize: '1.15rem', color: isOverdue ? '#ff6666' : '#00ff41' }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {isOverdue && <div style={{ fontSize: '.46rem', color: 'rgba(255,100,100,.6)', lineHeight: 1.7, border: '1px solid rgba(255,60,60,.2)', padding: '.45rem', marginBottom: '.55rem' }}>⚠ OVERDUE — 5% salary penalty per survival cycle until repaid. Repay immediately.</div>}
                      <button onClick={doRepay} disabled={salary < bankLoan.amount + bankLoan.interest}
                        style={{ padding: '.5rem 1.3rem', border: salary >= bankLoan.amount + bankLoan.interest ? '1px solid rgba(0,255,65,.6)' : '1px solid rgba(0,255,65,.1)', background: 'rgba(0,255,65,.06)', color: salary >= bankLoan.amount + bankLoan.interest ? '#00ff41' : 'rgba(0,255,65,.2)', cursor: salary >= bankLoan.amount + bankLoan.interest ? 'pointer' : 'default', ...VTB, fontSize: '1.1rem', letterSpacing: '.1em' }}>
                        REPAY IN FULL — ç{(bankLoan.amount + bankLoan.interest).toLocaleString()}
                      </button>
                      {salary < bankLoan.amount + bankLoan.interest && <div style={{ fontSize: '.4rem', color: 'rgba(255,100,100,.45)', marginTop: '.35rem' }}>Need ç{((bankLoan.amount + bankLoan.interest) - salary).toLocaleString()} more CREAM.</div>}
                    </div>
                  )}
                </>)}

                {/* ── WIRE ── */}
                {bankTab === 'wire' && (<>
                  <div style={{ border: '1px solid rgba(0,255,65,.13)', padding: '.65rem' }}>
                    <div style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.12em', marginBottom: '.35rem' }}>INTERPLAYER WIRE TRANSFER</div>
                    <div style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.35)', lineHeight: 1.7 }}>Transfer CREAM to any operative in Minx City. 3% PABLO Corp. Wire Tax deducted from sender. Logged. Irreversible.</div>
                  </div>
                  {online.filter(p => p.name !== char.name).length > 0 && (
                    <div style={{ border: '1px solid rgba(0,255,65,.1)', padding: '.55rem' }}>
                      <div style={{ fontSize: '.38rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', marginBottom: '.35rem' }}>ONLINE OPERATIVES</div>
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
                      <div style={{ fontSize: '.38rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.1em', marginBottom: '.2rem' }}>RECIPIENT</div>
                      <input value={bankWireTo} onChange={e => setBankWireTo(e.target.value.toUpperCase())} placeholder="OPERATIVE NAME..." style={inp} maxLength={32} />
                    </div>
                    <div>
                      <div style={{ fontSize: '.38rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.1em', marginBottom: '.2rem' }}>AMOUNT</div>
                      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                        <input value={bankWireAmt} onChange={e => setBankWireAmt(e.target.value.replace(/\D/g,''))} placeholder="0" style={{ ...inp, maxWidth: 180 }} />
                        {parseInt(bankWireAmt) > 0 && <span style={{ fontSize: '.4rem', color: '#ffaa44' }}>FEE: ç{Math.ceil((parseInt(bankWireAmt)||0)*.03).toLocaleString()} · TOTAL: ç{(parseInt(bankWireAmt) + Math.ceil((parseInt(bankWireAmt)||0)*.03)).toLocaleString()}</span>}
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
                  <div style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.12em', marginBottom: '.1rem' }}>ACCOUNT HISTORY — LAST 30 TRANSACTIONS</div>
                  {bankHistory.length === 0
                    ? <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.25)', padding: '.8rem', textAlign: 'center' }}>No transactions recorded yet. Deposit, withdraw, take a loan, or send a wire to begin your history.</div>
                    : <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '.5rem', padding: '.25rem .45rem', borderBottom: '1px solid rgba(0,255,65,.15)' }}>
                          <div style={{ fontSize: '.36rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em' }}>DESCRIPTION</div>
                          <div style={{ fontSize: '.36rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', textAlign: 'right' }}>AMOUNT</div>
                          <div style={{ fontSize: '.36rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', textAlign: 'right' }}>BALANCE</div>
                        </div>
                        {bankHistory.map((tx, i) => (
                          <div key={tx.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '.5rem', padding: '.25rem .45rem', background: i%2===0 ? 'rgba(0,255,65,.02)' : 'transparent', borderBottom: '1px solid rgba(0,255,65,.05)', alignItems: 'center' }}>
                            <div style={{ fontSize: '.46rem', color: 'rgba(0,255,65,.52)', letterSpacing: '.03em' }}>{tx.desc}</div>
                            <div style={{ ...VTB, fontSize: '.95rem', color: tx.amount >= 0 ? '#00ff41' : '#ff6666', textAlign: 'right' }}>{tx.amount >= 0 ? '+' : ''}ç{Math.abs(tx.amount).toLocaleString()}</div>
                            <div style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.25)', textAlign: 'right', whiteSpace: 'nowrap' }}>ç{tx.bal.toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                  }
                </>)}
              </div>
              {/* Footer */}
              <div style={{ padding: '.4rem 1.1rem', borderTop: '1px solid rgba(0,255,65,.1)', fontSize: '.38rem', color: 'rgba(0,255,65,.12)', letterSpacing: '.06em', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
                <span>KONAMI BANK IS NOT RESPONSIBLE FOR DEPOSITS SEIZED BY PABLO CORP. DURING MARTIAL LAW PERIODS. ALL TRANSACTIONS FINAL.</span>
                <span>ESC TO CLOSE</span>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
