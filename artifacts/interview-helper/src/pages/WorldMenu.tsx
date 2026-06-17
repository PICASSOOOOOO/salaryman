import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { PicassoLogo } from '../components/PicassoLogo';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { useIsMobile, getDefaultBoomerMode } from '../hooks/use-mobile';
import { boomerize, CITY_NAME, MINX_BUSINESS_PROFIT_BASE } from '../gameSystems';
import { PABLO_PRODUCTS } from '../lib/product-names';
import GameSettings from './Game/Settings';

type CharClass = 'corporate' | 'outlaw' | 'replicant';

// ── Cloud Save Types ─────────────────────────────────────────────────────────
interface CloudSave {
  id: number;
  slotIndex: number;
  charName: string;
  charClass: string;
  level: number;
  salary: number;
  lastZone: string;
  playtime: number;
  data: Record<string, unknown>;
  createdAt?: string;
  lastSavedAt: string;
}

function fmtTime(iso: string): string {
  const d = new Date(iso), now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return 'JUST NOW';
  if (diff < 3600) return `${Math.floor(diff / 60)} MIN AGO`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} HR AGO`;
  return `${Math.floor(diff / 86400)} DAYS AGO`;
}

function fmtPlaytime(frames: number): string {
  const secs = Math.floor(frames / 60);
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}H ${m}M` : `${m}M`;
}

const CLASS_COLOR: Record<string, string> = {
  corporate: '#38bdf8',
  outlaw: '#7dd3fc',
  replicant: '#67e8f9',
};

const CLASS_BADGE: Record<string, string> = {
  corporate: 'SUIT',
  outlaw: 'OTL',
  replicant: 'REP',
};

type GuideSection = 'world' | 'combat' | 'survival' | 'territories' | 'landmarks' | 'terminals' | 'controls';

const CLASSES = [
  {
    id: 'corporate' as CharClass,
    label: 'PABLO CORP',
    tagline: 'City. Money. Influence.',
    desc: 'Born in the neon towers. No handouts — income starts at ƒ0. Register a real business or convert real dollars to earn FIAT. Control military and police. Government buildings welcome you. Full city passport included.',
    start: 'CORPORATE DISTRICT',
    salary: 'ƒ0',
    hp: '350',
    atk: '3',
    def: '6',
    networth: 'ƒ0',
    perks: 'Full city passport · Control military & police · Business registration access',
    color: '#38bdf8',
  },
  {
    id: 'outlaw' as CharClass,
    label: 'OUTLAWS',
    tagline: 'Wasteland. Tough. Scarred.',
    desc: 'Exiled and hardened. High HP, strong ATK. No free income — earn FIAT through real business or dollar conversion. Hunger and thirst drain slower in the wastes. Can craft supplies from scavenged materials.',
    start: 'WASTELAND',
    salary: 'ƒ0',
    hp: '480',
    atk: '14',
    def: '8',
    networth: 'ƒ0',
    perks: 'High HP · Wasteland passport · Wasteland drain -40% · Crafting · Scavenging access',
    color: '#7dd3fc',
  },
  {
    id: 'replicant' as CharClass,
    label: 'REPLICANTS',
    tagline: 'Android. Conscious. Deadliest.',
    desc: 'You are the conscious android — built for combat, not for service. Highest ATK and HP. No free income — earn FIAT through verified business or dollar conversion. Operates in both city and wasteland.',
    start: 'CITY FRINGE',
    salary: 'ƒ0',
    hp: '600',
    atk: '18',
    def: '12',
    networth: 'ƒ0',
    perks: 'Tankiest · Highest DEF · Basic city passport · No energy drain · Combat specialist',
    color: '#67e8f9',
  },
];

const REAL_INDUSTRIES = [
  'SOFTWARE / SAAS', 'MARKETING & ADVERTISING', 'CONSULTING',
  'HEALTHCARE', 'FINANCE & FINTECH', 'LEGAL / LAWTECH',
  'EDUCATION / EDTECH', 'E-COMMERCE / RETAIL', 'REAL ESTATE',
  'MEDIA & ENTERTAINMENT', 'MANUFACTURING', 'LOGISTICS & SUPPLY CHAIN',
  'FOOD & BEVERAGE', 'NON-PROFIT', 'CONSTRUCTION',
  'GAMING', 'RECRUITING / HR', 'ARCHITECTURE & DESIGN',
  'GOVERNMENT / PUBLIC SECTOR', 'INSURANCE',
  'CUSTOM / OTHER',
];

const PAYROLL_PROVIDERS = [
  'NONE', 'GUSTO', 'ADP', 'PAYCHEX', 'RIPPLING', 'JUSTWORKS',
  'SQUARE PAYROLL', 'ONPAY', 'DEEL', 'REMOTE.COM', 'QUICKBOOKS PAYROLL',
  'BAMBOOHR', 'ZENEFITS', 'TRINET', 'PAYLOCITY', 'PAYCOM', 'OTHER',
];

const SIZES = ['SOLO OPERATOR', 'SMALL (2-10)', 'MID (11-50)', 'CORP (51-500)', 'MEGACORP (500+)'];

const WORKSTATION_ASSIGNMENTS: { match: RegExp; bid: string; label: string; slot: string }[] = [
  { match: /TECH|SOFTWARE|SAAS|GAMING|DATA|SYNAPSE|ZAIBATSU/i,         bid: 'data_vault',  label: 'DATA VAULT',    slot: 'BED 12 · DESK 3 · DEV TERMINAL' },
  { match: /MEDIA|ENTERT|RADIO|STATIC|VIRAL|COMMS/i,                   bid: 'radio',       label: 'PIRATE RADIO',  slot: 'BED 2 · DESK 1 · BROADCAST TERMINAL' },
  { match: /HEALTH|PHARMA|CHEM|MEDICAL|BIOTECH/i,                      bid: 'oxide_labs',    label: 'OXIDE LABS',    slot: 'BED 8 · DESK 7 · LAB TERMINAL' },
  { match: /MARKET|PRINT|ADVERTIS|DESIGN|ARCH|EDUC/i,                  bid: 'print_shop',  label: 'PRINT SHOP',    slot: 'BED 4 · DESK 2 · PRESS TERMINAL' },
  { match: /MANUF|LOGIST|CONSTRUCT|SCRAP|RUST|PHANTOM FREIGHT/i,       bid: 'scrap',       label: 'SCRAP YARD',    slot: 'BED 6 · DESK 4 · OPS TERMINAL' },
  { match: /FINANC|CAPITAL|NEON CAP|FINTECH/i,                         bid: 'megabank',    label: 'BANCO OMBRA', slot: 'BED 1 · DESK 9 · FINANCE TERMINAL' },
  { match: /ARMS|WEAPON|EDEN|BLACK IRON|SECURITY/i,                    bid: 'armory',      label: 'ARMORY',        slot: 'BED 3 · DESK 8 · TACTICAL TERMINAL' },
  { match: /SHADOW|JADE SYND|GHOST PROTOCOL|SALVAGE/i,                 bid: 'market',      label: 'BLACK MARKET',  slot: 'BED 7 · DESK 5 · SHADOW TERMINAL' },
  { match: /ENERGY|OMEGA|POWER|GRID/i,                             bid: 'oxide_labs',    label: 'OXIDE LABS',    slot: 'BED 9 · DESK 2 · POWER TERMINAL' },
  { match: /LEGAL|LAWTECH|CONSULT|RECRUIT|INSURANC/i,                  bid: 'data_vault',  label: 'DATA VAULT',    slot: 'BED 5 · DESK 6 · LEGAL TERMINAL' },
  { match: /REAL ESTATE|E-COMMERCE|RETAIL|FOOD|BEVERAGE/i,             bid: 'east_market', label: 'EAST BAZAAR',   slot: 'BED 11 · DESK 3 · TRADE TERMINAL' },
  { match: /NON-PROFIT|GOVERN|PUBLIC/i,                                bid: 'arcade',      label: 'PIXEL ARCADE',  slot: 'BED 1 · DESK 1 · PUBLIC TERMINAL' },
];
function getWorkstation(bType: 'minx'|'real', ind: string, minxInd: string) {
  const q = bType === 'real' ? ind : minxInd;
  return WORKSTATION_ASSIGNMENTS.find(w => w.match.test(q)) ?? WORKSTATION_ASSIGNMENTS[0];
}

const FLAVOR = [
  'The collapse happened three years ago. Minx City never recovered.',
  'PABLO CORP controls every credit in Minx City.',
  'The wasteland is everything south of the wall. The corp owns that too.',
  'Your PABLO device is your only edge.',
  'Credits don\'t grow on ruins — but the corp always finds a way.',
  'Every building in Minx City has a price. The corp set them all.',
  'Villain of the poor. Hero of the rich. That\'s PABLO CORP.',
  'Gang territory starts where the lights end.',
  'City: MINX CITY · PST — 11 servers worldwide.',
  'A helicopter left the tower at 3 AM. Nobody knows which city it came from. Nobody asks.',
  'They say there are towers in 11 cities. Each one taller than the last. Minx City got the prototype.',
  'Solaris Drift. Obsidian Reach. Dragon Forge. The PABLO CORP network never sleeps.',
  'The helipad on Floor 62 runs day and night. Someone is always arriving. Someone is always leaving.',
];

const GUIDE_SECTIONS: { id: GuideSection; label: string; col: string }[] = [
  { id: 'world',       label: CITY_NAME,   col: '#38bdf8' },
  { id: 'combat',      label: 'COMBAT',       col: '#ffcc00' },
  { id: 'survival',    label: 'SURVIVAL',     col: '#33aaff' },
  { id: 'territories', label: 'TERRITORIES',  col: '#ff4444' },
  { id: 'landmarks',   label: 'LANDMARKS',    col: '#7dd3fc' },
  { id: 'terminals',   label: 'TERMINALS',    col: '#67e8f9' },
  { id: 'controls',    label: 'CONTROLS',     col: '#cc88ff' },
];


function getVisitedLocations(): Set<string> {
  try {
    const raw = localStorage.getItem('sm_visited_locations');
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

function getVisitedFactions(): Set<string> {
  try {
    const raw = localStorage.getItem('sm_visited_factions');
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

const EXP_TABLE = [250, 456, 674, 906, 1150, 1406, 1674, 1956, 2250, 2556];

const TIMEZONE_OPTIONS = [
  { id: 'pst', label: 'Minx City (PST)', enabled: true },
];

function Row({ label, val, col }: { label: string; val: string; col?: string }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid rgba(56,189,248,.07)', padding: '.4rem 0', gap: '1rem', alignItems: 'flex-start' }}>
      <div style={{ fontSize: '.65rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.1em', minWidth: 110, paddingTop: '.12rem', flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: '.78rem', color: col ?? 'rgba(56,189,248,.7)', letterSpacing: '.04em', lineHeight: 1.75 }}>{val}</div>
    </div>
  );
}

function SectionHead({ children }: { children: string }) {
  return (
    <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.6rem', color: '#38bdf8', letterSpacing: '.12em', marginBottom: '.6rem', marginTop: '.3rem', textShadow: '0 0 14px rgba(56,189,248,.35)' }}>{children}</div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(56,189,248,.22), transparent)', margin: '.65rem 0' }} />;
}


function GuideContent({ section }: { section: GuideSection }) {
  const VT: React.CSSProperties = { fontFamily: "'VT323',monospace" };
  const S: React.CSSProperties = { fontFamily: "'Share Tech Mono',monospace" };
  const visitedLocations = getVisitedLocations();
  const visitedFactions = getVisitedFactions();
  const [, navigate] = useLocation();


  if (section === 'world') return (
    <div style={S}>
      <SectionHead>MINX CITY</SectionHead>
      <div style={{ fontSize: '.56rem', color: 'rgba(56,189,248,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        You feel it before you see it. A hum in the air — low, constant, electric. Neon crawls up every surface like a rash that won't heal. The buildings are too tall. The streets are too clean in some places and not clean enough in others. Somewhere above you, always above you, a tower watches. Sixty-two floors of glass and silence.
      </div>
      <div style={{ fontSize: '.56rem', color: 'rgba(56,189,248,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        This is Minx City. One of eleven. Each server carries a different name — Solaris Drift, Obsidian Reach, Dragon Forge, Coral Vault — but the architecture of control is identical. Same tower. Same corp. Same currency that replaced whatever came before. The collapse was not an accident. It was a transition. And the transition is complete.
      </div>
      <div style={{ fontSize: '.56rem', color: 'rgba(56,189,248,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        South of the glow, the city ends. Not with a wall — with an absence. The light stops. The pavement cracks. The sky shifts from neon to smoke. Out there, people still live. Some of them remember what came before. Most of them just remember what they lost.
      </div>
      <div style={{ fontSize: '.56rem', color: 'rgba(56,189,248,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        The corp doesn't talk about the wasteland. The wasteland doesn't talk about the corp. Both are lying. There is a frequency buried in the static — a signal older than the collapse. Someone is broadcasting. Nobody knows who. Nobody knows why. But everyone hears it eventually.
      </div>
      <Divider />
      <Row label="SHADOW TOWER" val="62 floors. City center. Floors 1–39 open to registered salarymen. Floor 40+: permanently restricted. Floor 62: rooftop helipad — runs 24/7. The tower is the tallest structure in Minx City and visible from every point in the wasteland." col="#cc44ff" />
      <Row label="TERMINALS" val="PABLO is free on every terminal — personal or public. Payphones, kiosks, and vans are scattered across Minx City and the wasteland — all TTC infrastructure. TTC (The Telephone Company) is the sole comms monopoly in Minx City: every phone line, signal relay, and broadcast tower belongs to them. Press [P] with a working device, or [E] at any public terminal." col="#67e8f9" />
      <Row label="FIAT (ƒ)" val="The only currency that matters. Fiat is what Minx City runs on. ƒ1 FIAT = 1 BTC in purchasing power — post-collapse, the dollar died. The mint is controlled by PABLO CORP. A cut is taken from everything. Every salaryman starts at ƒ0. There are NO handouts. Earn FIAT by: 1) Registering a real business with verified income (Gusto, ADP, or payroll proof), 2) Converting real USD into FIAT through the exchange, or 3) Running an in-game business that generates legitimate revenue." col="#ffcc00" />
      <Row label="INCOME VERIFICATION" val="No free money. No government base salary. All income in Minx City must be earned legitimately. Real enterprises must provide proof of income via payroll providers (Gusto, ADP, etc.) during business registration. In-game businesses earn FIAT only through verified activity. Real dollars convert to FIAT at the exchange. If you can't prove income, you don't have income." col="#cc44ff" />
      <Row label="METRO SYSTEM" val="Four subway stations connect the city districts: METRO WEST, METRO CENTRAL, METRO EAST, METRO NORTH. Fast travel between them for a fee. The tunnels are pre-collapse infrastructure — still running." col="#33aaff" />
      <Divider />
      <div style={{ fontSize: '.48rem', color: 'rgba(56,189,248,.2)', letterSpacing: '.08em', lineHeight: 1.8, fontStyle: 'italic', marginTop: '.4rem' }}>
        Eleven cities. Eleven towers. The same story told in every timezone. You are in one of them now. The only question that matters: what will you do before the lights go out again?
      </div>
    </div>
  );

  if (section === 'combat') return (
    <div style={S}>
      <SectionHead>COMBAT SYSTEM</SectionHead>
      <div style={{ fontSize: '.75rem', color: 'rgba(56,189,248,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        Enemies patrol their territories. When you enter range they chase. Stand your ground or run — your call. Press [F] to attack. Anything inside 72px takes damage.
      </div>
      <Divider />
      <Row label="[F] ATTACK" val="Melee swing. Hits all enemies within ~72px. ATK = 20 + (LVL−1)×5. Cooldown: 0.5s. Yellow flash ring confirms the hit zone." col="#ffcc00" />
      <Row label="ENEMY DAMAGE" val="Enemies deal 0.4 HP per frame when in contact. Invincibility frames (0.3s) prevent instant stacking." col="#ff4444" />
      <Row label="KILL" val="Enemy HP → 0: they vanish. EXP awarded. Respawn at spawn point in 7 seconds." col="#38bdf8" />
      <Row label="POISON" val="MUTANTS and STATIC_MONKS have a 12% chance to poison on contact. HP drains 1.5/sec while poisoned. Cure: SAVE POINT or respawn." col="#7dd3fc" />
      <Divider />
      <SectionHead>EXP & LEVELS</SectionHead>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '.3rem', margin: '.5rem 0' }}>
        {EXP_TABLE.slice(0, 10).map((n, i) => (
          <div key={i} style={{ border: '1px solid rgba(56,189,248,.15)', padding: '.35rem .4rem', textAlign: 'center' }}>
            <div style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.3)', marginBottom: '.1rem' }}>LVL {i+1}→{i+2}</div>
            <div style={{ ...VT, fontSize: '.85rem', color: '#ffcc00' }}>{n}</div>
          </div>
        ))}
      </div>
      <Row label="LEVEL UP" val="MAX HP +10. ATK +5. HP partially restored. Gold LEVEL UP overlay appears. Stats persist until TERMINAL." col="#ffcc00" />
      <Row label="EXP TABLE" val="250 → 456 → 674 → 906 → 1150 → 1406 → 1674 → 1956 → 2250 → 2556 ..." col="#ffcc00" />
      <Divider />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '.3rem', marginTop: '.5rem' }}>
        {[['IRON_RATS','#ff4444','30','20'],['VOID_DOGS','#ff8800','40','28'],['MUTANT','#7dd3fc','35','30'],['STATIC_MONKS','#aaff22','50','35'],['RAIDER','#ff66ff','45','40']].map(([n,c,hp,exp]) => (
          <div key={n} style={{ border: `1px solid ${c}33`, padding: '.4rem .45rem', background: `${c}09` }}>
            <div style={{ ...VT, fontSize: '.85rem', color: c as string, letterSpacing: '.06em' }}>{n}</div>
            <div style={{ fontSize: '.58rem', color: 'rgba(56,189,248,.3)', marginTop: '.2rem' }}>HP {hp} · EXP {exp}</div>
          </div>
        ))}
      </div>
    </div>
  );

  if (section === 'survival') return (
    <div style={S}>
      <SectionHead>SURVIVAL METERS</SectionHead>
      <div style={{ fontSize: '.75rem', color: 'rgba(56,189,248,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        Three meters govern your operational status. Let any one drop to zero and you start taking consequences. The wasteland accelerates the drain on all three.
      </div>
      <Divider />
      {[
        { label: 'HUNGER', col: '#38bdf8', drain: '−1.5/tick (city) · −2.5/tick (wasteland)', crit: 'HP drains when HUNGER = 0', restore: 'VENDING MACHINE +30 · PABLO STORE consumables' },
        { label: 'THIRST', col: '#33aaff', drain: '−2/tick (city) · −3/tick (wasteland)', crit: 'HP drains when THIRST = 0', restore: 'VENDING MACHINE +30' },
        { label: 'ENERGY', col: '#ffcc00', drain: '−1/tick (city) · −1.5/tick (wasteland)', crit: 'Salary −5/tick when ENERGY < 20', restore: 'HOTEL NEON +30 · PIXEL ARCADE +20' },
      ].map(m => (
        <div key={m.label} style={{ border: `1px solid ${m.col}22`, background: `${m.col}06`, padding: '.6rem .75rem', marginBottom: '.4rem' }}>
          <div style={{ ...VT, fontSize: '1.1rem', color: m.col, letterSpacing: '.1em', marginBottom: '.3rem' }}>{m.label}</div>
          <Row label="DRAIN" val={m.drain} col={m.col} />
          <Row label="CRITICAL" val={m.crit} col="#ff6644" />
          <Row label="RESTORE" val={m.restore} col="rgba(56,189,248,.6)" />
        </div>
      ))}
      <Divider />
      <Row label="TICK RATE" val="Every ~9 seconds in the game loop. Drains pause while dialogs / panels are open." />
      <Row label="GAME OVER" val="HP → 0 triggers GAME OVER screen. CONTINUE restores all meters to 100. TERMINAL returns to this menu." />
    </div>
  );

  if (section === 'territories') {
    const territories = [
      {
        fid: 'rust_syndicate', id: 'IRON RATS', col: '#ff4444', zone: 'Western wasteland',
        entry: '"IRON RATS territory. You\'re the meal."',
        enemies: 'IRON_RATS — HP 30 · EXP 20 · fast, swarming',
        lore: 'Former construction workers. Turned feral after PABLO CORP seized their housing blocks. They wear red. They hit in groups. Don\'t stop moving.',
      },
      {
        fid: 'void_runners', id: 'VOID DOGS', col: '#ff8800', zone: 'Central wasteland',
        entry: '"VOID DOGS don\'t negotiate."',
        enemies: 'VOID_DOGS — HP 40 · EXP 28 · balanced, patrol-heavy',
        lore: 'Ex-security contractors cut loose when PABLO CORP automated the checkpoints. Organized. Orange armbands. They remember how to be soldiers.',
      },
      {
        fid: 'static_monks', id: 'STATIC MONKS', col: '#aaff22', zone: 'Eastern wasteland',
        entry: '"STATIC MONKS zone. Your signal is their noise."',
        enemies: 'STATIC_MONKS — HP 50 · EXP 35 · slow, tough, can POISON',
        lore: 'Former TTC line engineers and switchboard operators. Expelled after TTC automated the relay grid. They worship dead frequencies. They believe the collapse was a signal. They jam everything. They can poison you — something in the static.',
      },
      {
        fid: 'eastern_bloc', id: 'EASTERN BLOC', col: '#ff66ff', zone: 'Southern wasteland',
        entry: '"EASTERN BLOC — trespassers are eliminated."',
        enemies: 'EASTERN_BLOC — HP 45 · EXP 30 · precise, military-grade',
        lore: 'No negotiation. No communication. They operate like a military unit — precise, disciplined. Nova Pryce traced their signal to a server in Shadow Tower.',
      },
    ];
    return (
      <div style={S}>
        <SectionHead>GANG TERRITORIES</SectionHead>
        <div style={{ fontSize: '.56rem', color: 'rgba(56,189,248,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
          Gangs carved up the wasteland after the collapse. They don't care who you are. Step into their zone and the HUD lights up. Each zone has its own threat profile and entry narration.
        </div>
        <Divider />
        {territories.map(g => {
          const discovered = visitedFactions.has(g.fid);
          if (!discovered) return (
            <div key={g.fid} style={{ border: '1px solid rgba(56,189,248,.1)', background: 'rgba(56,189,248,.02)', padding: '.7rem .8rem', marginBottom: '.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem' }}>
                <div style={{ width: 10, height: 10, background: 'rgba(56,189,248,.15)' }} />
                <div style={{ ...VT, fontSize: '1.3rem', color: 'rgba(56,189,248,.15)', letterSpacing: '.1em' }}>??? TERRITORY</div>
              </div>
              <div style={{ fontSize: '.48rem', color: 'rgba(56,189,248,.12)', marginTop: '.3rem' }}>[ ENTER THIS ZONE TO REVEAL INTEL ]</div>
            </div>
          );
          return (
            <div key={g.fid} style={{ border: `1px solid ${g.col}33`, background: `${g.col}07`, padding: '.7rem .8rem', marginBottom: '.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem', marginBottom: '.5rem' }}>
                <div style={{ width: 10, height: 10, background: g.col, boxShadow: `0 0 8px ${g.col}` }} />
                <div style={{ ...VT, fontSize: '1.3rem', color: g.col, letterSpacing: '.1em' }}>{g.id}</div>
                <div style={{ fontSize: '.45rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.1em' }}>{g.zone}</div>
              </div>
              <Row label="ENTRY" val={g.entry} col={g.col} />
              <Row label="ENEMIES" val={g.enemies} col="rgba(56,189,248,.6)" />
              <Row label="LORE" val={g.lore} />
            </div>
          );
        })}
        <Divider />
        <Row label="HUD INDICATOR" val="Zone name + warning appear in the bottom-left panel when you cross into gang territory." col="#ff8800" />
        <Row label="WASTELAND RULE" val="All survival meters drain faster across the entire wasteland, not just in gang zones." col="#7dd3fc" />
      </div>
    );
  }

  if (section === 'landmarks') {
    const cityLandmarks = [
      { bid: 'pablo_tower', name: 'SHADOW TOWER',     col: '#cc44ff', effect: 'Story terminal. Floors 1–39 open. Use PABLO device from inside.',        secret: 'Wrong passcode = lockout. Choose wisely.' },
      { bid: 'clinic',      name: 'CITY CLINIC',      col: '#38bdf8', effect: 'HP restore. First aid. Free once per session.',                     secret: 'The only place that patches up everyone equally.' },
      { bid: 'megabank',    name: 'BANCO OMBRA', col: '#38bdf8', effect: 'Salary deposit. View balance. Transfer credits.',                   secret: 'Bank fees are the corp\'s favorite revenue stream.' },
      { bid: 'hotel',       name: 'HOTEL NEON',      col: '#38bdf8', effect: '+40 HP · +30 Energy. Rest fully.',                                  secret: 'Room keys glow in the dark.' },
      { bid: 'arcade',      name: 'PIXEL ARCADE',    col: '#38bdf8', effect: '+20 Energy. One machine still running: NEON DRIFT.',                    secret: 'Free play. Coin slot taped over since the collapse.' },
      { bid: 'vend',        name: 'VENDING MACHINE', col: '#38bdf8', effect: '+30 Hunger · +30 Thirst. Vending machine near city wall.',          secret: 'Brand: PABLO FRESH. Ingredients unknown.' },
      { bid: 'crystal',     name: 'SAVE POINT',      col: '#aaffff', effect: 'Full restore: HP, Hunger, Thirst, Energy. Cures POISON. Saves progress to device.', secret: '"Brave the darkness, warrior." — inscription, provenance unknown.' },
      { bid: 'pablo_store', name: 'PABLO STORE',     col: '#cc44ff', effect: 'Buy PABLO devices. Obtain OPERATOR CLEARANCE ($4–6/mo, 7-day trial). Access augmentation modules.',      secret: 'CIVILIAN ACCESS is monitored. PABLO notes who hasn\'t upgraded.' },
    ];
    const wasteLandmarks = [
      { bid: 'bunker',     name: 'BUNKER-09',    col: '#7dd3fc', effect: 'Lore only. "WW-87 / INSERT COIN." Terminal shows: GAME OVER.', secret: 'Nobody has inserted a coin in years.' },
      { bid: 'scrap',      name: 'SCRAP YARD',   col: '#7dd3fc', effect: '+ƒ20 salary. PCB labeled \'87 found.',                         secret: 'Worth more than a full day\'s work at a corp.' },
      { bid: 'radio',      name: 'PIRATE RADIO', col: '#7dd3fc', effect: 'Lore. Signal broadcasts on a loop. Someone out there is still transmitting.', secret: '"The signal never stops. Neither does the wasteland."' },
      { bid: 'oxide_labs', name: 'OXIDE LABS',   col: '#7dd3fc', effect: '+ƒ50 salary. Blueprints everywhere. Abandoned.',               secret: '"The prototypes were the first to fall. The corp bought them all."' },
    ];
    // Some landmarks are wired to real in-game services. Tapping them in the
    // landmarks list takes the user straight to the institution interior, so
    // they don't have to leave the world to bank or get patched up.
    const LANDMARK_ROUTE: Record<string, string> = {
      megabank: '/game/bank',
      clinic: '/game/character',
      pablo_store: '/upgrade',
      pablo_tower: '/pablo/deck',
    };
    const renderLandmark = (b: { bid: string; name: string; col: string; effect: string; secret: string }) => {
      const discovered = visitedLocations.has(b.bid);
      const route = LANDMARK_ROUTE[b.bid];
      const enterable = discovered && !!route;
      return (
        <div
          key={b.bid}
          onClick={enterable ? () => navigate(route!) : undefined}
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(56,189,248,.06)',
            padding: '.35rem 0',
            gap: '.75rem',
            alignItems: 'flex-start',
            cursor: enterable ? 'pointer' : 'default',
          }}
        >
          <div style={{ ...VT, fontSize: '.9rem', color: discovered ? b.col : 'rgba(56,189,248,.15)', minWidth: 120, flexShrink: 0 }}>{discovered ? b.name : '???'}</div>
          <div style={{ flex: 1 }}>
            {discovered ? (
              <>
                <div style={{ fontSize: '.52rem', color: 'rgba(56,189,248,.65)', lineHeight: 1.7 }}>{b.effect}</div>
                <div style={{ fontSize: '.45rem', color: 'rgba(56,189,248,.28)', lineHeight: 1.5, fontStyle: 'italic' }}>{b.secret}</div>
                {enterable && (
                  <div style={{ fontSize: '.45rem', color: b.col, lineHeight: 1.5, marginTop: '.2rem', letterSpacing: '.15em' }}>▸ TAP TO ENTER</div>
                )}
              </>
            ) : (
              <div style={{ fontSize: '.48rem', color: 'rgba(56,189,248,.12)', lineHeight: 1.7 }}>[ VISIT TO REVEAL ]</div>
            )}
          </div>
        </div>
      );
    };
    return (
      <div style={S}>
        <SectionHead>LANDMARKS</SectionHead>
        <div style={{ fontSize: '.56rem', color: 'rgba(56,189,248,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
          Key sites across the City and Wasteland. Approach within range and press [E] to enter. Some are locked. Some cost credits. Some are owned by other salarymen.
        </div>
        <Divider />
        <div style={{ fontSize: '.44rem', color: 'rgba(56,189,248,.2)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── MINX CITY ──</div>
        {cityLandmarks.map(renderLandmark)}
        <Divider />
        <div style={{ fontSize: '.44rem', color: 'rgba(56,189,248,.2)', letterSpacing: '.1em', margin: '.4rem 0' }}>── WASTELAND ──</div>
        {wasteLandmarks.map(renderLandmark)}
        <Divider />
        <Row label="BUILDING LOCKS" val="Any salaryman can lock a building with a passcode. Locked buildings show 🔒 and display owner name + company. Only the password holder can enter." col="#ff8800" />
      </div>
    );
  }

  if (section === 'terminals') return (
    <div style={S}>
      <SectionHead>TERMINALS & DEVICES</SectionHead>
      <div style={{ fontSize: '.56rem', color: 'rgba(56,189,248,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        PABLO is free on every terminal — no purchase required. Terminals are your link to the PABLO CORP network: AI chat, productivity tools, status reports, and intel. Access them through a personal device or any public terminal in the world.
      </div>
      <Divider />
      <SectionHead>PERSONAL DEVICE</SectionHead>
      <Row label="AVAILABILITY" val="Suits start with a personal handheld device. Outlaws and Replicants must find or purchase one." col="#67e8f9" />
      <Row label="ACCESS" val="Press [P] to open your personal device. Full PABLO access, status, intel, and chat." col="#38bdf8" />
      <Row label="BREAKAGE" val="Combat damage can break your device (4% chance per hit, durability loss). When broken, the screen cracks and you lose personal terminal access." col="#ff4444" />
      <Row label="REPAIR" val="Visit CITY CLINIC (ƒ5,000 FIAT) or purchase a DEVICE REPAIR KIT from the VENDING MACHINE (ƒ5,000 FIAT). Full heal at CITY CLINIC (ƒ10,000) includes device repair." col="#ffcc00" />
      <Divider />
      <SectionHead>PUBLIC TERMINALS</SectionHead>
      <div style={{ fontSize: '.75rem', color: 'rgba(56,189,248,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        Public terminals are physical objects in the game world. Walk up and press [E] to access. PABLO is free on all of them. Use these when your personal device is broken, missing, or if you never had one.
      </div>
      <div style={{ fontSize: '.6rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── CITY PAYPHONES & KIOSKS ──</div>
      {[
        { name: 'WEST PAYPHONE',    loc: 'Western Minx City, near Metro West',       col: '#67e8f9' },
        { name: 'CENTRAL KIOSK',    loc: 'Central city, near Hotel Famicom',          col: '#67e8f9' },
        { name: 'EAST PAYPHONE',    loc: 'East district, near Print Shop',            col: '#67e8f9' },
        { name: 'NEON KIOSK',       loc: 'Near Club Neon, east side',                 col: '#67e8f9' },
        { name: 'NORTH PAYPHONE',   loc: 'North quarter, near North Gate',            col: '#67e8f9' },
      ].map(t => (
        <Row key={t.name} label={t.name} val={t.loc} col={t.col} />
      ))}
      <Divider />
      <div style={{ fontSize: '.6rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── OUTPOST TERMINALS ──</div>
      <Row label="OUTPOST ALPHA" val="Wasteland outpost terminal. Free PABLO access." col="#7dd3fc" />
      <Row label="OUTPOST BETA" val="Wasteland outpost terminal. Free PABLO access." col="#7dd3fc" />
      <Divider />
      <div style={{ fontSize: '.6rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── TERMINAL VANS ──</div>
      <div style={{ fontSize: '.75rem', color: 'rgba(56,189,248,.45)', lineHeight: 1.9, marginBottom: '.5rem' }}>
        Armored vans parked in the wasteland. Each contains a working terminal and a cot for rest. Energy +15 on entry.
      </div>
      <Row label="WEST VAN" val="Western wasteland, south of Iron Rats territory." col="#7dd3fc" />
      <Row label="CENTRAL VAN" val="Deep wasteland, near Terminus Shelter." col="#7dd3fc" />
      <Row label="EAST VAN" val="Eastern wasteland, near Deep Camp." col="#7dd3fc" />
      <Divider />
      <div style={{ fontSize: '.48rem', color: 'rgba(56,189,248,.2)', letterSpacing: '.08em', lineHeight: 1.8, fontStyle: 'italic', marginTop: '.4rem' }}>
        PABLO is a service of PABLO CORP. All transmissions are logged. All terminals are monitored.
      </div>
    </div>
  );

  if (section === 'controls') return (
    <div style={S}>
      <SectionHead>CONTROLS</SectionHead>
      <Divider />
      <div style={{ fontSize: '.6rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── MOVEMENT ──</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem .75rem' }}>
        {[
          ['WASD / ARROWS', 'Move salaryman'],
          ['SHIFT + MOVE', 'Sprint (1.6× speed)'],
          ['E', 'Enter building / Talk / Use terminal / Loot'],
          ['F / SPACE', 'Melee attack (72px range)'],
          ['CLICK', 'Ranged attack (requires ranged weapon)'],
        ].map(([key, desc]) => (
          <div key={key} style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', padding: '.3rem 0', borderBottom: '1px solid rgba(56,189,248,.06)' }}>
            <div style={{ ...VT, fontSize: '1rem', color: '#cc88ff', letterSpacing: '.08em', minWidth: 110, flexShrink: 0 }}>{key}</div>
            <div style={{ fontSize: '.72rem', color: 'rgba(56,189,248,.6)', lineHeight: 1.75 }}>{desc}</div>
          </div>
        ))}
      </div>
      <Divider />
      <div style={{ fontSize: '.6rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── TERMINAL & DEVICE ──</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem .75rem' }}>
        {[
          ['P', 'Open PABLO device (personal terminal)'],
          ['E at KIOSK', 'Access public terminal (payphones, kiosks, vans)'],
          ['ESC', 'Close any open panel or dialog'],
          ['SPACE / ENTER', 'Advance dialog text'],
        ].map(([key, desc]) => (
          <div key={key} style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', padding: '.3rem 0', borderBottom: '1px solid rgba(56,189,248,.06)' }}>
            <div style={{ ...VT, fontSize: '1rem', color: '#cc88ff', letterSpacing: '.08em', minWidth: 110, flexShrink: 0 }}>{key}</div>
            <div style={{ fontSize: '.72rem', color: 'rgba(56,189,248,.6)', lineHeight: 1.75 }}>{desc}</div>
          </div>
        ))}
      </div>
      <Divider />
      <div style={{ fontSize: '.6rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── MAP & NAVIGATION ──</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem .75rem' }}>
        {[
          ['M', 'Toggle world map overlay'],
          ['SCROLL WHEEL', 'Zoom in / out (0.8× – 2.5×)'],
          ['R', 'Toggle radio (near radio buildings)'],
        ].map(([key, desc]) => (
          <div key={key} style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', padding: '.3rem 0', borderBottom: '1px solid rgba(56,189,248,.06)' }}>
            <div style={{ ...VT, fontSize: '1rem', color: '#cc88ff', letterSpacing: '.08em', minWidth: 110, flexShrink: 0 }}>{key}</div>
            <div style={{ fontSize: '.72rem', color: 'rgba(56,189,248,.6)', lineHeight: 1.75 }}>{desc}</div>
          </div>
        ))}
      </div>
      <Divider />
      <div style={{ fontSize: '.6rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── SOCIAL & BUSINESS ──</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem .75rem' }}>
        {[
          ['C', 'Open world chat'],
          ['V', 'Toggle voice (mic)'],
          ['B', 'Open BALANCE SHEET — live income, expenses & ledger'],
          ['E at BANK', 'Deposit salary / view balance / transfer credits'],
          ['E at STORE', 'Browse inventory / buy items / sell cargo'],
          ['E at EXCHANGE', 'Trade commodities (buy low, sell high)'],
        ].map(([key, desc]) => (
          <div key={key} style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', padding: '.3rem 0', borderBottom: '1px solid rgba(56,189,248,.06)' }}>
            <div style={{ ...VT, fontSize: '1rem', color: '#cc88ff', letterSpacing: '.08em', minWidth: 110, flexShrink: 0 }}>{key}</div>
            <div style={{ fontSize: '.72rem', color: 'rgba(56,189,248,.6)', lineHeight: 1.75 }}>{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return null;
}

const WORLD_LOCKED = false;

function ClassifiedGate() {
  const [, navigate] = useLocation();
  const S: React.CSSProperties = { fontFamily: "'Share Tech Mono',monospace" };
  const VT: React.CSSProperties = { fontFamily: "'VT323',monospace" };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#030803', ...S, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(56,189,248,0.03) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.15) 2px,rgba(0,0,0,.15) 4px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(56,189,248,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.025) 1px, transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', maxWidth: 560, textAlign: 'center' }}>
          <div style={{ ...VT, fontSize: 'clamp(1rem, 2.5vw, 1.4rem)', color: 'rgba(255,60,60,.7)', letterSpacing: '.25em', textShadow: '0 0 20px rgba(255,60,60,.3)', animation: 'smblink 1.2s step-end infinite' }}>
            ▓▓ CLASSIFIED ▓▓
          </div>
          <div style={{ ...VT, fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: '#38bdf8', textShadow: '0 0 30px rgba(56,189,248,.5)', letterSpacing: '.15em', lineHeight: 1.2 }}>
            MINX CITY
          </div>
          <div style={{ ...S, fontSize: '.7rem', color: 'rgba(56,189,248,.4)', letterSpacing: '.12em', lineHeight: 1.8, maxWidth: 440 }}>
            THE VIRTUAL OFFICE SIMULATION IS BEING REDESIGNED FROM THE GROUND UP. ALL SALARYMAN DATA AND SAVE FILES ARE PRESERVED. PABLO CORP WILL ANNOUNCE RE-ENTRY WHEN THE NEW INFRASTRUCTURE IS OPERATIONAL.
          </div>
          <div style={{ width: '100%', border: '1px solid rgba(56,189,248,.15)', background: 'rgba(56,189,248,.03)', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
            <div style={{ ...VT, fontSize: '1.1rem', color: 'rgba(255,204,0,.7)', letterSpacing: '.12em' }}>WHAT'S COMING</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem .8rem', ...S, fontSize: '.55rem', color: 'rgba(56,189,248,.5)', letterSpacing: '.06em', lineHeight: 1.7 }}>
              <div>→ PIXEL OFFICE SIMULATION</div>
              <div>→ REAL-TIME AGENT WORKSPACE</div>
              <div>→ VIRTUAL EMPLOYEE SYSTEM</div>
              <div>→ TERRITORY CONTROL v2</div>
              <div>→ PERSISTENT WORLD STATE</div>
              <div>→ CROSS-CITY NETWORK</div>
            </div>
          </div>
          <div style={{ width: '100%', border: '1px solid rgba(56,189,248,.1)', background: 'rgba(56,189,248,.02)', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
            <div style={{ ...VT, fontSize: '1.1rem', color: 'rgba(56,189,248,.6)', letterSpacing: '.12em' }}>11 SERVERS · WORLDWIDE NETWORK</div>
            <div style={{ ...S, fontSize: '.45rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.08em', lineHeight: 1.7, marginBottom: '.3rem' }}>
              EACH SERVER CARRIES A DIFFERENT NAME. SAME TOWER. SAME CORP. SAME CURRENCY.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '.35rem .6rem' }}>
              {[
                { name: 'MINX CITY', region: 'AMERICAS — NORTH', active: true, color: '#38bdf8', icon: '🏙️' },
                { name: 'SOLARIS DRIFT', region: 'AMERICAS — CENTRAL', active: false, color: '#f59e0b', icon: '☀️' },
                { name: 'VERDE NEXUS', region: 'AMERICAS — SOUTH', active: false, color: '#22c55e', icon: '🌿' },
                { name: 'OBSIDIAN REACH', region: 'AFRICA', active: false, color: '#a855f7', icon: '💎' },
                { name: 'COBALT HARBOR', region: 'EUROPE — WEST', active: false, color: '#3b82f6', icon: '⚓' },
                { name: 'VOSTOK GATE', region: 'EUROPE — EAST', active: false, color: '#ef4444', icon: '🚪' },
                { name: 'CRESCENT SPIRE', region: 'ASIA — CRESCENT', active: false, color: '#eab308', icon: '🌙' },
                { name: 'AMBER CIRCUIT', region: 'ASIA — SOUTH', active: false, color: '#f97316', icon: '🔶' },
                { name: 'JADE MONSOON', region: 'ASIA — SOUTHEAST', active: false, color: '#14b8a6', icon: '🌊' },
                { name: 'DRAGON FORGE', region: 'ASIA — EAST', active: false, color: '#dc2626', icon: '🐉' },
                { name: 'CORAL VAULT', region: 'OCEANIA', active: false, color: '#06b6d4', icon: '🐚' },
              ].map(c => (
                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', padding: '.25rem .4rem', border: `1px solid ${c.active ? `${c.color}40` : `${c.color}15`}`, background: c.active ? `${c.color}10` : 'transparent' }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: c.active ? c.color : `${c.color}30`, boxShadow: c.active ? `0 0 6px ${c.color}80` : 'none', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...S, fontSize: '.5rem', color: c.active ? `${c.color}cc` : `${c.color}55`, letterSpacing: '.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{c.icon} {c.name}</div>
                    <div style={{ ...S, fontSize: '.35rem', color: `${c.color}25`, letterSpacing: '.08em' }}>{c.region}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ ...S, fontSize: '.38rem', color: 'rgba(56,189,248,.15)', letterSpacing: '.1em', textAlign: 'center', marginTop: '.3rem' }}>
              ONLY MINX CITY (PST) IS OPERATIONAL · REMAINING SERVERS PENDING DEPLOYMENT
            </div>
          </div>

          <button
            onClick={() => navigate('/')}
            style={{ padding: '.6rem 2rem', background: 'rgba(56,189,248,.1)', border: '1px solid rgba(56,189,248,.5)', color: '#38bdf8', ...VT, fontSize: '1.2rem', letterSpacing: '.15em', cursor: 'pointer', textShadow: '0 0 8px rgba(56,189,248,.4)' }}
          >
            ← RETURN TO TERMINAL
          </button>
          <div style={{ ...S, fontSize: '.4rem', color: 'rgba(56,189,248,.15)', letterSpacing: '.12em', marginTop: '.5rem' }}>
            PABLO CORP INFRASTRUCTURE DIVISION · REDESIGN IN PROGRESS · ALL RIGHTS RESERVED
          </div>
        </div>
      </div>
      <style>{`@keyframes smblink { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </div>
  );
}

export default function WorldMenu() {
  if (WORLD_LOCKED) return <ClassifiedGate />;
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated, login } = useAuth();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<'enter' | 'guide' | 'settings'>('enter');
  // screen: 'saves' shows the save manager (logged in), 'new' shows the character creator
  const [screen, setScreen] = useState<'saves' | 'new'>('saves');
  const [step, setStep] = useState<1 | 2>(1);
  const [cls, setCls]   = useState<CharClass>('corporate');
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [tick, setTick] = useState(0);
  const [flavorIdx, setFlavorIdx] = useState(0);
  const [players, setPlayers] = useState<number | null>(null);
  const [guideSection, setGuideSection] = useState<GuideSection>('world');
  const [selectedTimezone, setSelectedTimezone] = useState('pst');
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(false);

  // Cloud save management
  const [cloudSaves, setCloudSaves] = useState<CloudSave[]>([]);
  const [savesLoading, setSavesLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number>(0);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Business registration
  const [bizType, setBizType] = useState<'minx' | 'real' | 'unemployed'>('minx');
  const [company, setCompany] = useState('');
  const [industry, setIndustry] = useState('SOFTWARE / SAAS');
  const [minxCompany, setMinxCompany] = useState('');
  const [minxError, setMinxError] = useState('');
  const [bizSize, setBizSize] = useState('SOLO OPERATOR');
  const [bizEmail, setBizEmail] = useState('');
  const [payrollProvider, setPayrollProvider] = useState('NONE');
  const [declaredIncome, setDeclaredIncome] = useState('');
  const [customIndustry, setCustomIndustry] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkingName, setCheckingName] = useState(false);


  const [autoResumed, setAutoResumed] = useState(false);
  const [showCinematic, setShowCinematic] = useState(false);
  const [cinematicLine, setCinematicLine] = useState(0);
  const [showEntryButtons, setShowEntryButtons] = useState(true);
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  useEffect(() => {
    const sync = () => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} };
    const t = setInterval(sync, 2000);
    window.addEventListener('storage', sync);
    return () => { clearInterval(t); window.removeEventListener('storage', sync); };
  }, []);
  const [showHelp, setShowHelp] = useState(false);

  const [atPhysicalTerminal] = useState(() => {
    const flag = sessionStorage.getItem('sm_at_physical_terminal');
    if (flag) sessionStorage.removeItem('sm_at_physical_terminal');
    return !!flag;
  });

  // ── Load cloud saves ────────────────────────────────────────────────────────
  const loadSaves = useCallback(async () => {
    if (!isAuthenticated) return;
    setSavesLoading(true);
    try {
      const res = await apiFetch('/api/salaryman/saves', { credentials: 'include' });
      if (res.ok) { const j = await res.json(); setCloudSaves(j.saves ?? []); }
    } catch { /* ignore */ }
    setSavesLoading(false);
  }, [isAuthenticated]);

  useEffect(() => { loadSaves(); }, [loadSaves]);

  useEffect(() => {
    if (autoResumed || savesLoading || !isAuthenticated || cloudSaves.length === 0) return;
    const skipFlag = sessionStorage.getItem('sm_show_saves');
    if (skipFlag) { sessionStorage.removeItem('sm_show_saves'); setAutoResumed(true); return; }
    setAutoResumed(true);
  }, [cloudSaves, savesLoading, isAuthenticated, autoResumed]);

  // ── Continue a save ─────────────────────────────────────────────────────────
  const handleContinue = (save: CloudSave) => {
    const d = save.data;
    const str = (k: string) => typeof d[k] === 'string' ? d[k] as string : null;
    const num = (k: string) => typeof d[k] === 'number' ? d[k] as number : null;
    const bool = (k: string) => typeof d[k] === 'boolean' ? (d[k] as boolean) : false;
    const incomeTypeParsed = str('incomeType') ?? (bool('hasBusiness') ? (str('bizType') === 'real' ? 'real' : 'minx') : 'unemployed');
    const char = {
      name: save.charName,
      class: save.charClass,
      company: str('company') ?? save.charName + ' OPS',
      sx: num('px') ?? 5555,
      sy: num('py') ?? 5620,
      salary: save.salary,
      governmentBaseSalary: num('governmentBaseSalary') ?? (save.charClass === 'corporate' ? 100 : save.charClass === 'replicant' ? 50 : 25),
      businessProfit: num('businessProfit') ?? 0,
      realSalaryAmount: num('realSalaryAmount') ?? 0,
      incomeType: incomeTypeParsed,
      hasBusiness: bool('hasBusiness'),
      bizType: (() => { const bt = str('bizType'); if (bt === 'fictitious') return 'minx'; return bt ?? (bool('hasBusiness') ? 'minx' : 'unemployed'); })(),
      workstation: str('workstation'),
      workstationLabel: str('workstationLabel'),
      workstationSlot: num('workstationSlot') ?? null,
      bizRegisteredAt: str('bizRegisteredAt'),
      createdAt: save.createdAt ?? str('createdAt') ?? null,
      _savedState: save.data,
    };
    localStorage.setItem('sm_char', JSON.stringify(char));
    localStorage.setItem('sm_slot', String(save.slotIndex));
    setShowWelcomeDialog(true);
  };

  // ── Delete a save ───────────────────────────────────────────────────────────
  const handleDelete = async (slot: number) => {
    try {
      await apiFetch(`/api/salaryman/saves/${slot}`, { method: 'DELETE', credentials: 'include' });
      setCloudSaves(prev => prev.filter(s => s.slotIndex !== slot));
    } catch { /* ignore */ }
    setDeleteConfirm(null);
  };

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setFlavorIdx(i => (i + 1) % FLAVOR.length), 3200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const fetchStatus = () => {
      apiFetch('/api/world/server-status')
        .then(r => r.json())
        .then(d => {
          if (d.online >= d.max) setPlayers(-1);
          else setPlayers(d.online ?? 0);
        })
        .catch(() => setPlayers(0));
    };
    fetchStatus();
    const iv = setInterval(fetchStatus, 10000);
    return () => clearInterval(iv);
  }, []);

  const selected = CLASSES.find(c => c.id === cls)!;

  const handleProceed = () => {
    const n = name.trim().toUpperCase();
    if (!n) return;
    if (n === 'SENIOR PABLO' || n === 'SENIORPABLO' || n.replace(/\s+/g,'') === 'SENIORPABLO') {
      setNameError('RESERVED — That name is restricted by PABLO CORP Choose another.');
      return;
    }
    setNameError('');
    setStep(2);
  };

  const handleEnterWorld = async () => {
    if (bizType === 'minx') {
      const trimmed = minxCompany.trim().toUpperCase();
      if (!trimmed) {
        setMinxError('COMPANY NAME REQUIRED — Invent a front corporation.');
        return;
      }
      setCheckingName(true);
      setMinxError('');
      try {
        const resp = await apiFetch(`/api/world/check-company?name=${encodeURIComponent(trimmed)}`, { credentials: 'include' });
        if (resp.ok) {
          const data = await resp.json();
          if (data.taken) {
            setMinxError('NAME TAKEN — Another salaryman already registered this front. Choose a different name.');
            setCheckingName(false);
            return;
          }
        }
      } catch { /* proceed if check fails */ }
      setCheckingName(false);
    }

    setSubmitting(true);
    const hasBusiness = bizType !== 'unemployed';
    const finalCompany = bizType === 'real' && company.trim()
      ? company.trim().toUpperCase()
      : bizType === 'minx' && minxCompany.trim()
        ? minxCompany.trim().toUpperCase()
        : bizType === 'unemployed'
          ? null
          : name.trim().toUpperCase() + ' OPS';
    const ws = hasBusiness ? getWorkstation(bizType === 'real' ? 'real' : 'minx', industry, minxCompany.trim().toUpperCase() || 'UNKNOWN') : null;
    const startSalary = 0;
    const spawnPos = cls === 'outlaw' ? { x: 4000, y: 8300 } : cls === 'replicant' ? { x: 2600, y: 9050 } : { x: 5555, y: 5620 };
    const signupTimestamp = new Date().toISOString();
    const factionStartOutfit = cls === 'corporate' ? 'suit' : cls === 'outlaw' ? 'wasteland' : cls === 'replicant' ? 'cyberpunk' : 'default';
    const resolvedIndustry = industry === 'CUSTOM / OTHER' && customIndustry.trim() ? customIndustry.trim().toUpperCase() : industry;
    const verifiedIncome = bizType === 'real' && payrollProvider !== 'NONE' && declaredIncome ? Number(declaredIncome) : 0;
    const char = {
      name: name.trim().toUpperCase(),
      class: cls,
      company: finalCompany ?? 'UNAFFILIATED',
      sx: spawnPos.x,
      sy: spawnPos.y,
      salary: startSalary,
      businessProfit: 0,
      realSalaryAmount: verifiedIncome,
      incomeType: bizType,
      hasBusiness,
      bizType: bizType,
      payrollProvider: bizType === 'real' ? payrollProvider : null,
      incomeVerified: bizType === 'real' && payrollProvider !== 'NONE' && verifiedIncome > 0,
      declaredMonthlyIncome: verifiedIncome,
      workstation: ws?.bid ?? null,
      workstationLabel: ws?.label ?? null,
      workstationSlot: ws?.slot ?? null,
      bizRegisteredAt: hasBusiness ? Date.now() : null,
      createdAt: signupTimestamp,
      activeCostume: factionStartOutfit,
      ownedClothes: ['default', factionStartOutfit],
    };
    localStorage.setItem('sm_char', JSON.stringify(char));
    localStorage.setItem('sm_slot', String(selectedSlot));
    try {
      const registerResp = await apiFetch('/api/world/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          playerName: char.name,
          businessType: bizType,
          companyName: finalCompany,
          industry: bizType === 'real' ? resolvedIndustry : null,
          companySize: bizType === 'real' ? bizSize : null,
          contactEmail: bizType === 'real' && bizEmail.trim() ? bizEmail.trim() : null,
          payrollProvider: bizType === 'real' ? payrollProvider : null,
          declaredMonthlyIncome: verifiedIncome,
          incomeVerified: bizType === 'real' && payrollProvider !== 'NONE' && verifiedIncome > 0,
          isPaid: false,
        }),
      });
      if (registerResp.status === 409 && bizType === 'minx') {
        setMinxError('NAME TAKEN — Another salaryman already registered this front. Choose a different name.');
        setSubmitting(false);
        return;
      }
    } catch { /* ignore */ }
    if (isAuthenticated) {
      try {
        await apiFetch(`/api/salaryman/saves/${selectedSlot}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            charName: char.name,
            charClass: char.class,
            level: 1,
            salary: startSalary,
            lastZone: CITY_NAME,
            playtime: 0,
            data: { ...char },
          }),
        });
      } catch { /* ignore */ }
    }
    setSubmitting(false);
    setShowWelcomeDialog(true);
  };

  const S: React.CSSProperties = { fontFamily: "'Share Tech Mono',monospace" };
  const VT: React.CSSProperties = { fontFamily: "'VT323',monospace" };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#030803', ...S, position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, rgba(56,189,248,0.03) 0%, transparent 70%)',
      }} />
      <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.15) 2px,rgba(0,0,0,.15) 4px)', pointerEvents: 'none', zIndex: 99 }} />
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(56,189,248,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.025) 1px, transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none', zIndex: 0 }} />

      {/* Top bar */}
      <div style={{ position: 'relative', zIndex: 1, padding: isMobile ? '.3rem .5rem' : '.4rem 1.5rem', borderBottom: '1px solid rgba(56,189,248,.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.3rem' }}>
        <span style={{ fontSize: isMobile ? '.5rem' : '.6rem', color: 'rgba(56,189,248,.2)', letterSpacing: '.14em', display: 'flex', alignItems: 'center', gap: '.3rem', flexShrink: 1, minWidth: 0 }}>
          <button onClick={() => navigate('/')} style={{ fontSize: isMobile ? '.5rem' : '.6rem', color: 'rgba(56,189,248,.5)', border: '1px solid rgba(56,189,248,.25)', background: 'rgba(56,189,248,.06)', padding: '2px 8px', cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace", letterSpacing: '.08em', flexShrink: 0 }}>← BACK</button>
          {!isMobile && <>&nbsp;·&nbsp; SALARYMAN OS ALPHA {__BUILD_VERSION__} &nbsp;·&nbsp;</>}
          <select
            value={selectedTimezone}
            onChange={e => setSelectedTimezone(e.target.value)}
            style={{ background: 'rgba(0,8,0,.95)', border: '1px solid rgba(56,189,248,.25)', color: '#38bdf8', fontFamily: "'Share Tech Mono',monospace", fontSize: isMobile ? '.5rem' : '.6rem', letterSpacing: '.1em', padding: '2px 6px', cursor: 'pointer', outline: 'none', maxWidth: isMobile ? 120 : 'none' }}
          >
            {TIMEZONE_OPTIONS.map(tz => (
              <option key={tz.id} value={tz.id} style={{ background: '#030803', color: '#38bdf8' }}>
                {tz.label}
              </option>
            ))}
          </select>
        </span>
        <span style={{ fontSize: isMobile ? '.42rem' : '.5rem', color: players === -1 ? 'rgba(255,80,80,.6)' : 'rgba(56,189,248,.2)', letterSpacing: '.1em', flexShrink: 0 }}>
          {players === -1 ? 'FULL' : players !== null ? `${players}/100` : '...'}
          {tick % 2 === 0 ? ' ▮' : ' ▯'}
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem 1rem 2rem', position: 'relative', zIndex: 1 }}>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '.2rem' }}>
            <PicassoLogo size={32} gap={3} />
            <div style={{ ...VT, fontSize: 'clamp(2.5rem, 7vw, 5rem)', color: '#38bdf8', textShadow: '0 0 30px rgba(56,189,248,.4)', letterSpacing: '.18em', lineHeight: 1 }}>SALARYMAN</div>
            <PicassoLogo size={32} gap={3} />
          </div>
          <div style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.2em', marginTop: '.4rem', ...VT }}>BY PICASSO AI — PABLO CORP WORLD</div>
          <div style={{ marginTop: '.5rem', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(56,189,248,.3), transparent)' }} />
          <div style={{ marginTop: '.3rem', fontSize: '.6rem', color: 'rgba(255,200,60,.35)', letterSpacing: '.12em', ...VT }}>⚠ PABLO CORP IMMIGRATION INTERFACE ALPHA {__BUILD_VERSION__}</div>
          <div style={{ marginTop: '.4rem', fontSize: '.6rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.1em', minHeight: '1.2em' }}>{FLAVOR[flavorIdx]}</div>
        </div>

        {/* ── HELP ── */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '.6rem', marginBottom: '1rem' }}>
          <button onClick={() => setShowHelp(v => !v)} style={{ padding: '.35rem .7rem', background: showHelp ? 'rgba(56,189,248,.08)' : 'rgba(56,189,248,.04)', border: showHelp ? '1px solid rgba(56,189,248,.5)' : '1px solid rgba(56,189,248,.2)', color: showHelp ? '#38bdf8' : 'rgba(56,189,248,.4)', cursor: 'pointer', fontSize: '.6rem', letterSpacing: '.08em', fontFamily: "'Share Tech Mono',monospace" }}>
            WHAT IS THIS?
          </button>
        </div>

        {showHelp && (
          <div style={{ width: '100%', maxWidth: 720, marginBottom: '1rem', padding: '.75rem', border: '1px solid rgba(56,189,248,.2)', background: 'rgba(5,15,25,.95)', fontSize: '.6rem', color: 'rgba(56,189,248,.55)', lineHeight: 1.7, letterSpacing: '.04em' }}>
            <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', marginBottom: '.5rem' }}>WELCOME TO SALARYMAN</div>
            <div>This is a multiplayer cyberpunk city simulation. You play as a worker in MINX CITY, a corporate dystopia run by PABLO CORP Walk around the city, talk to characters, chat with real players, earn money, and build your career.</div>
            <div style={{ marginTop: '.4rem' }}>Walk around the city, talk to characters, earn money, level up, and explore every district of MINX CITY.</div>
            <div style={{ marginTop: '.5rem', fontSize: '.55rem', color: 'rgba(56,189,248,.35)' }}>
              <div><b>WASD</b> = Move your character around the city</div>
              <div><b>E</b> = Interact with buildings, shops, and people</div>
              <div><b>C</b> = Open chat to talk to other real players</div>
              <div><b>V</b> = Toggle your microphone for voice chat</div>
              <div><b>P</b> = Open your PABLO device (inventory / phone)</div>
              <div><b>ESC</b> = Open the pause menu with settings</div>
            </div>
            <div style={{ marginTop: '.5rem' }}>
              <div><b style={{ color: '#38bdf8' }}>HP</b> = Your health. Stay away from threats or you lose it.</div>
              <div><b style={{ color: '#38bdf8' }}>FIAT (ƒ)</b> = The in-game currency. Earned through verified business income or real dollar conversion. No free handouts.</div>
              <div><b style={{ color: '#38bdf8' }}>XP</b> = Experience points. Accumulate them to level up and unlock things.</div>
              <div><b style={{ color: '#38bdf8' }}>NPC</b> = Non-player characters. The people in the city who are not real players.</div>
            </div>
          </div>
        )}

        {/* ── PABLO CORP SERVERS ── */}
        <div style={{ width: '100%', maxWidth: 720, marginBottom: '1.25rem', border: '1px solid rgba(56,189,248,.1)', background: 'rgba(5,15,25,.6)', padding: '.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
            <div style={{ fontSize: '.42rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.14em' }}>PABLO CORP SERVERS — 11 PLANNED</div>
            <div style={{ fontSize: '.38rem', color: 'rgba(255,200,60,.3)', letterSpacing: '.1em' }}>EXPANSION ROADMAP</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '.3rem' }}>
            {[
              { name: 'MINX CITY', region: 'AMERICAS — NORTH', status: 'live' as const, color: '#38bdf8', icon: '🏙️' },
              { name: 'SOLARIS DRIFT', region: 'AMERICAS — CENTRAL', status: 'planned' as const, color: '#f59e0b', icon: '☀️' },
              { name: 'VERDE NEXUS', region: 'AMERICAS — SOUTH', status: 'planned' as const, color: '#22c55e', icon: '🌿' },
              { name: 'OBSIDIAN REACH', region: 'AFRICA', status: 'planned' as const, color: '#a855f7', icon: '💎' },
              { name: 'COBALT HARBOR', region: 'EUROPE — WEST', status: 'planned' as const, color: '#3b82f6', icon: '⚓' },
              { name: 'VOSTOK GATE', region: 'EUROPE — EAST', status: 'planned' as const, color: '#ef4444', icon: '🚪' },
              { name: 'CRESCENT SPIRE', region: 'ASIA — CRESCENT', status: 'planned' as const, color: '#eab308', icon: '🌙' },
              { name: 'AMBER CIRCUIT', region: 'ASIA — SOUTH', status: 'planned' as const, color: '#f97316', icon: '🔶' },
              { name: 'JADE MONSOON', region: 'ASIA — SOUTHEAST', status: 'planned' as const, color: '#14b8a6', icon: '🌊' },
              { name: 'DRAGON FORGE', region: 'ASIA — EAST', status: 'planned' as const, color: '#dc2626', icon: '🐉' },
              { name: 'CORAL VAULT', region: 'OCEANIA', status: 'planned' as const, color: '#06b6d4', icon: '🐚' },
            ].map(city => (
              <div key={city.name} style={{ padding: '.25rem .35rem', border: `1px solid ${city.status === 'live' ? `${city.color}66` : `${city.color}15`}`, background: city.status === 'live' ? `${city.color}10` : `${city.color}05`, display: 'flex', flexDirection: 'column', gap: '.1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.2rem' }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: city.status === 'live' ? city.color : `${city.color}30`, boxShadow: city.status === 'live' ? `0 0 6px ${city.color}99` : 'none' }} />
                  <span style={{ fontSize: '.38rem', color: city.status === 'live' ? city.color : `${city.color}44`, letterSpacing: '.06em', fontFamily: "'Share Tech Mono',monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{city.icon} {city.name}</span>
                </div>
                <span style={{ fontSize: '.3rem', color: `${city.color}22`, letterSpacing: '.06em', fontFamily: "'Share Tech Mono',monospace" }}>{city.region}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '.4rem', fontSize: '.35rem', color: 'rgba(56,189,248,.15)', letterSpacing: '.08em', textAlign: 'center' }}>YOU ARE IN: MINX CITY (PST) — MORE SERVERS COMING 2026-2027</div>
        </div>

        {/* ── PABLO TOOLS GRID ── */}
        <div style={{ width: '100%', maxWidth: 720, marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '.42rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.14em', marginBottom: '.5rem' }}>PABLO CORP TOOLS — {boomerize('FREE ACCESS', boomerMode)}</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '.5rem' }}>
            <button onClick={() => navigate('/business/hiring')} style={{ padding: '.65rem .5rem', background: 'rgba(180,100,255,.08)', border: '1px solid rgba(180,100,255,.5)', color: '#bb88ff', cursor: 'pointer', textAlign: 'left', fontFamily: "'Share Tech Mono',monospace", gridColumn: 'span 1' }}>
              <div style={{ ...VT, fontSize: '1.1rem', letterSpacing: '.08em', marginBottom: '.2rem' }}>{PABLO_PRODUCTS.PRESENTER.short}</div>
              <div style={{ fontSize: '.45rem', color: 'rgba(180,100,255,.5)', lineHeight: 1.6 }}>{boomerMode ? 'Create slide decks and presentations with AI.' : PABLO_PRODUCTS.PRESENTER.desc}</div>
            </button>
            <button onClick={() => navigate('/')} style={{ padding: '.65rem .5rem', background: 'rgba(56,189,248,.06)', border: '1px solid rgba(56,189,248,.4)', color: '#38bdf8', cursor: 'pointer', textAlign: 'left', fontFamily: "'Share Tech Mono',monospace" }}>
              <div style={{ ...VT, fontSize: '1rem', letterSpacing: '.08em', marginBottom: '.2rem' }}>{boomerMode ? 'PABLO' : PABLO_PRODUCTS.PROBLEM_DESC.short}</div>
              <div style={{ fontSize: '.45rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.6 }}>{boomerMode ? 'Ask anything. Get answers instantly.' : 'Code analysis and problem solving.'}</div>
            </button>
            <button onClick={() => navigate('/business/contacts')} style={{ padding: '.65rem .5rem', background: 'rgba(100,180,255,.06)', border: '1px solid rgba(100,180,255,.4)', color: '#55bbff', cursor: 'pointer', textAlign: 'left', fontFamily: "'Share Tech Mono',monospace" }}>
              <div style={{ ...VT, fontSize: '1rem', letterSpacing: '.08em', marginBottom: '.2rem' }}>{boomerMode ? 'CONTACTS' : PABLO_PRODUCTS.CONTACTS.short}</div>
              <div style={{ fontSize: '.45rem', color: 'rgba(100,180,255,.4)', lineHeight: 1.6 }}>{boomerMode ? 'Save contacts and meeting notes.' : PABLO_PRODUCTS.CONTACTS.desc}</div>
            </button>
            <button onClick={() => navigate('/')} style={{ padding: '.65rem .5rem', background: 'rgba(255,100,100,.06)', border: '1px solid rgba(255,100,100,.3)', color: '#ff7777', cursor: 'pointer', textAlign: 'left', fontFamily: "'Share Tech Mono',monospace", position: 'relative' }}>
              <div style={{ position: 'absolute', top: 4, right: 6, fontSize: '.38rem', color: 'rgba(255,100,100,.4)', letterSpacing: '.08em' }}>PASSIVE</div>
              <div style={{ ...VT, fontSize: '1rem', letterSpacing: '.08em', marginBottom: '.2rem' }}>{boomerMode ? 'LIVE LISTEN' : PABLO_PRODUCTS.LIVE_LISTEN.short}</div>
              <div style={{ fontSize: '.45rem', color: 'rgba(255,100,100,.3)', lineHeight: 1.6 }}>{boomerMode ? 'Listens to audio. Runs in background even when you leave.' : 'Runs in background. Just turn on.'}</div>
            </button>
            <button onClick={() => navigate('/')} style={{ padding: '.65rem .5rem', background: 'rgba(100,200,255,.06)', border: '1px solid rgba(100,200,255,.3)', color: '#66ccff', cursor: 'pointer', textAlign: 'left', fontFamily: "'Share Tech Mono',monospace", position: 'relative' }}>
              <div style={{ position: 'absolute', top: 4, right: 6, fontSize: '.38rem', color: 'rgba(100,200,255,.4)', letterSpacing: '.08em' }}>PASSIVE</div>
              <div style={{ ...VT, fontSize: '1rem', letterSpacing: '.08em', marginBottom: '.2rem' }}>{boomerMode ? 'SCREEN SCAN' : PABLO_PRODUCTS.SCAN_SCREEN.short}</div>
              <div style={{ fontSize: '.45rem', color: 'rgba(100,200,255,.3)', lineHeight: 1.6 }}>{boomerMode ? 'Reads your screen. Runs in background even when you leave.' : 'Runs in background. Just turn on.'}</div>
            </button>
            <button onClick={() => navigate('/')} style={{ padding: '.65rem .5rem', background: 'rgba(50,255,200,.06)', border: '1px solid rgba(50,255,200,.4)', color: '#33ffcc', cursor: 'pointer', textAlign: 'left', fontFamily: "'Share Tech Mono',monospace" }}>
              <div style={{ ...VT, fontSize: '1rem', letterSpacing: '.08em', marginBottom: '.2rem' }}>{boomerMode ? 'TRANSLATOR' : PABLO_PRODUCTS.TRANSLATOR.short}</div>
              <div style={{ fontSize: '.45rem', color: 'rgba(50,255,200,.35)', lineHeight: 1.6 }}>{boomerMode ? 'Translate text between any languages instantly.' : PABLO_PRODUCTS.TRANSLATOR.desc}</div>
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '.5rem', marginTop: '.5rem' }}>
            <button onClick={() => navigate('/business/hiring')} style={{ padding: '.5rem .5rem', background: 'rgba(255,200,50,.04)', border: '1px solid rgba(255,200,50,.2)', color: '#ffcc44', cursor: 'pointer', textAlign: 'left', fontFamily: "'Share Tech Mono',monospace" }}>
              <div style={{ ...VT, fontSize: '.9rem', letterSpacing: '.08em', marginBottom: '.15rem' }}>{boomerMode ? 'HIRING' : PABLO_PRODUCTS.HIRING.short}</div>
              <div style={{ fontSize: '.42rem', color: 'rgba(255,200,50,.3)', lineHeight: 1.5 }}>{boomerMode ? 'Post jobs and track candidates.' : 'Post positions and manage candidates.'}</div>
            </button>
            <button onClick={() => navigate('/dashboard')} style={{ padding: '.5rem .5rem', background: 'rgba(56,189,248,.03)', border: '1px solid rgba(56,189,248,.15)', color: 'rgba(56,189,248,.5)', cursor: 'pointer', textAlign: 'left', fontFamily: "'Share Tech Mono',monospace" }}>
              <div style={{ ...VT, fontSize: '.9rem', letterSpacing: '.08em', marginBottom: '.15rem' }}>{boomerMode ? 'DASHBOARD' : 'CMD DECK'}</div>
              <div style={{ fontSize: '.42rem', color: 'rgba(56,189,248,.25)', lineHeight: 1.5 }}>{boomerMode ? 'Your workspace and project overview.' : 'Projects, knowledge base, brand kit.'}</div>
            </button>
          </div>
        </div>

        {/* ── TAB BAR ── */}
        <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem', border: '1px solid rgba(56,189,248,.18)', overflow: isMobile ? 'auto' : 'hidden', WebkitOverflowScrolling: 'touch', flexWrap: isMobile ? 'wrap' : 'nowrap', width: '100%', maxWidth: 720 }}>
          {([['enter', 'IMMIGRATION'], ['guide', 'FIELD GUIDE'], ['settings', 'SETTINGS']] as const).map(([id, label], idx, arr) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: isMobile ? '.4rem .6rem' : '.55rem 1.8rem',
                background: tab === id ? 'rgba(56,189,248,.1)' : 'transparent',
                border: 'none',
                borderRight: idx !== arr.length - 1 ? '1px solid rgba(56,189,248,.18)' : 'none',
                borderBottom: isMobile ? '1px solid rgba(56,189,248,.18)' : 'none',
                color: tab === id ? '#38bdf8' : 'rgba(56,189,248,.3)',
                ...VT,
                fontSize: isMobile ? '.85rem' : '1.2rem',
                letterSpacing: isMobile ? '.08em' : '.14em',
                cursor: 'pointer',
                textShadow: tab === id ? '0 0 10px rgba(56,189,248,.4)' : 'none',
                transition: 'all .12s',
                whiteSpace: 'nowrap',
                flex: isMobile ? '1 0 auto' : undefined,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── TAB: IMMIGRATION ── */}
        {tab === 'enter' && (
          <>

            {/* ── CONTEXT-SENSITIVE ENTRY BUTTONS ─────────────────────────── */}
            {screen === 'saves' && !showCinematic && showEntryButtons && (
              <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: '.8rem', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '.42rem', color: 'rgba(56,189,248,.2)', letterSpacing: '.14em', marginBottom: '.2rem' }}>SELECT OPERATION MODE</div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '.6rem' }}>
                  {/* WAKE UP — new game (locked on mobile) */}
                  <button
                    onClick={() => {
                      if (isMobile) return;
                      if (!isAuthenticated) { login(); return; }
                      const seen = localStorage.getItem('sm_cinematic_seen');
                      if (seen) {
                        setScreen('new'); setStep(1);
                      } else {
                        setShowCinematic(true);
                        setCinematicLine(0);
                      }
                    }}
                    disabled={isMobile}
                    style={{
                      padding: '1.2rem 1rem',
                      background: isMobile ? 'rgba(255,60,60,.04)' : 'rgba(56,189,248,.06)',
                      border: `1px solid ${isMobile ? 'rgba(255,60,60,.25)' : 'rgba(56,189,248,.5)'}`,
                      color: isMobile ? 'rgba(255,60,60,.4)' : '#38bdf8',
                      cursor: isMobile ? 'not-allowed' : 'pointer',
                      textAlign: 'left', fontFamily: 'inherit',
                      transition: 'all .15s',
                      position: 'relative', overflow: 'hidden',
                    }}
                  >
                    {isMobile && (
                      <div style={{ position: 'absolute', top: 6, right: 8, fontSize: '.42rem', color: 'rgba(255,60,60,.6)', fontFamily: "'Share Tech Mono',monospace", letterSpacing: '.1em', background: 'rgba(255,60,60,.1)', padding: '2px 6px', border: '1px solid rgba(255,60,60,.2)' }}>
                        🖥 DESKTOP ONLY
                      </div>
                    )}
                    <div style={{ ...VT, fontSize: '1.6rem', letterSpacing: '.15em', marginBottom: '.3rem' }}>WAKE UP</div>
                    <div style={{ fontSize: '.48rem', color: isMobile ? 'rgba(255,60,60,.3)' : 'rgba(56,189,248,.45)', lineHeight: 1.7 }}>
                      {isMobile ? 'This mode requires a desktop browser.' : 'Fresh start. New story. Build your way up from nothing.'}
                    </div>
                  </button>

                  {/* MULTI-PLAYER MODE — returning player with save (desktop only) */}
                  {!isMobile && (
                  <button
                    onClick={() => {
                      if (isAuthenticated && cloudSaves.length > 0) {
                        setShowEntryButtons(false);
                      } else if (isAuthenticated) {
                        setScreen('new');
                      } else {
                        login();
                      }
                    }}
                    disabled={isAuthenticated && cloudSaves.length === 0}
                    style={{
                      padding: '1.2rem 1rem',
                      background: (isAuthenticated && cloudSaves.length > 0) ? 'rgba(0,180,255,.06)' : !isAuthenticated ? 'rgba(255,200,50,.04)' : 'transparent',
                      border: `1px solid ${(isAuthenticated && cloudSaves.length > 0) ? 'rgba(0,180,255,.5)' : !isAuthenticated ? 'rgba(255,200,50,.3)' : 'rgba(56,189,248,.15)'}`,
                      color: (isAuthenticated && cloudSaves.length > 0) ? '#33aaff' : !isAuthenticated ? 'rgba(255,200,50,.6)' : 'rgba(56,189,248,.2)',
                      cursor: (isAuthenticated && cloudSaves.length === 0) ? 'default' : 'pointer',
                      textAlign: 'left', fontFamily: 'inherit', transition: 'all .15s',
                    }}
                  >
                    <div style={{ ...VT, fontSize: '1.6rem', letterSpacing: '.15em', marginBottom: '.3rem' }}>{(() => {
                      if (!isAuthenticated || cloudSaves.length === 0) return 'GO TO WORK';
                      const latest = cloudSaves[0]?.data as Record<string, unknown> | undefined;
                      if (!latest) return 'GO TO WORK';
                      const bType = latest.bizType as string | undefined;
                      if (bType === 'real') return 'COME ON IN, BIG SHOT';
                      if (bType === 'minx' || bType === 'fictitious' || latest.hasBusiness) return "YOU'RE LATE TO WORK";
                      return 'FIND A JOB';
                    })()}</div>
                    <div style={{ fontSize: '.48rem', color: (isAuthenticated && cloudSaves.length > 0) ? 'rgba(0,180,255,.45)' : !isAuthenticated ? 'rgba(255,200,50,.35)' : 'rgba(56,189,248,.15)', lineHeight: 1.7 }}>
                      {isAuthenticated && cloudSaves.length > 0
                        ? (() => {
                          const latest = cloudSaves[0]?.data as Record<string, unknown> | undefined;
                          const bType = latest?.bizType as string | undefined;
                          if (bType === 'real') return `${cloudSaves.length} save${cloudSaves.length !== 1 ? 's' : ''} on file. The corner office is waiting.`;
                          if (bType === 'minx' || bType === 'fictitious' || latest?.hasBusiness) return `${cloudSaves.length} save${cloudSaves.length !== 1 ? 's' : ''} on file. Clock's ticking.`;
                          return `${cloudSaves.length} save${cloudSaves.length !== 1 ? 's' : ''} on file. The city doesn't wait.`;
                        })()
                        : !isAuthenticated ? 'Sign in to access your saves.' : 'No saves found. Start a new story first.'}
                    </div>
                    {isAuthenticated && cloudSaves.length > 0 && (() => {
                      const s = cloudSaves[0];
                      return (
                        <div style={{ marginTop: '.5rem', padding: '.4rem .6rem', background: 'rgba(0,180,255,.06)', border: '1px solid rgba(0,180,255,.2)', fontSize: '.45rem', color: 'rgba(0,180,255,.6)', lineHeight: 1.8, letterSpacing: '.04em' }}>
                          <span style={{ color: 'rgba(0,180,255,.35)', letterSpacing: '.1em' }}>LATEST SAVE ▸</span> {s.charName} · LVL {s.level} · ƒ{s.salary.toLocaleString()} · {s.lastZone} · {fmtTime(s.lastSavedAt)}
                        </div>
                      );
                    })()}
                  </button>
                  )}

                  {/* RESURRECT — died last session */}
                  {(() => {
                    const lastSave = localStorage.getItem('sm_save');
                    const diedLastSession = lastSave && (() => { try { const d = JSON.parse(lastSave); return d.hp !== undefined && d.hp <= 0; } catch { return false; } })();
                    const canResurrect = !!(diedLastSession && isAuthenticated && cloudSaves.length > 0);
                    return (
                      <button
                        onClick={() => {
                          if (canResurrect) {
                            const latest = [...cloudSaves].sort((a, b) => new Date(b.lastSavedAt).getTime() - new Date(a.lastSavedAt).getTime())[0];
                            if (latest) {
                              const maxHp = typeof latest.data['maxHp'] === 'number' ? latest.data['maxHp'] : 100;
                              latest.data['hp'] = maxHp;
                              handleContinue(latest);
                            }
                          }
                        }}
                        disabled={!canResurrect}
                        style={{
                          padding: '1.2rem 1rem',
                          background: canResurrect ? 'rgba(255,40,40,.06)' : 'transparent',
                          border: `1px solid ${canResurrect ? 'rgba(255,60,60,.5)' : 'rgba(56,189,248,.1)'}`,
                          color: canResurrect ? '#ff6666' : 'rgba(56,189,248,.15)',
                          cursor: canResurrect ? 'pointer' : 'default',
                          textAlign: 'left', fontFamily: 'inherit', transition: 'all .15s',
                        }}
                      >
                        <div style={{ ...VT, fontSize: '1.6rem', letterSpacing: '.15em', marginBottom: '.3rem' }}>RESURRECT</div>
                        <div style={{ fontSize: '.48rem', color: canResurrect ? 'rgba(255,80,80,.45)' : 'rgba(56,189,248,.12)', lineHeight: 1.7 }}>
                          {canResurrect ? 'You died. DR. WRIGHT patched you up. Return to your last position.'
                           : diedLastSession && !isAuthenticated ? 'You died — sign in to resurrect your salaryman.'
                           : diedLastSession ? 'You died — no save data found. Start a new story.'
                           : 'No death recorded. Salaryman status: ALIVE.'}
                        </div>
                      </button>
                    );
                  })()}

                  {/* STORY MODE — grayed out */}
                  <div
                    style={{
                      padding: '1.2rem 1rem', background: 'transparent',
                      border: '1px solid rgba(56,189,248,.08)',
                      color: 'rgba(56,189,248,.12)',
                      textAlign: 'left', fontFamily: 'inherit', position: 'relative',
                    }}
                  >
                    <div style={{ ...VT, fontSize: '1.6rem', letterSpacing: '.15em', marginBottom: '.3rem', opacity: .4 }}>STORY MODE</div>
                    <div style={{ fontSize: '.48rem', color: 'rgba(56,189,248,.1)', lineHeight: 1.7 }}>
                      Single-player campaign. Chapter-based progression.
                    </div>
                    <div style={{
                      position: 'absolute', top: 8, right: 10,
                      ...VT, fontSize: '.8rem', color: 'rgba(255,200,60,.4)',
                      letterSpacing: '.12em', border: '1px solid rgba(255,200,60,.2)',
                      padding: '2px 8px', background: 'rgba(255,200,60,.04)',
                    }}>COMING SOON</div>
                  </div>
                </div>
              </div>
            )}

            {/* ── CINEMATIC INTRO — "Wake up, you're late for work" ─────────── */}
            {showCinematic && (
              <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
                <div style={{ width: '100%', background: 'rgba(0,0,0,.8)', border: '1px solid rgba(56,189,248,.25)', padding: '2rem 1.5rem', textAlign: 'center' }}>
                  {[
                    '...',
                    '> ALARM CLOCK: 06:00 AM',
                    '> The screen on your nightstand buzzes.',
                    '> "WAKE UP — YOU\'RE LATE FOR WORK."',
                    '> You open your eyes. Neon bleeds through the blinds.',
                    '> Minx City is already running. It never stopped.',
                    '> PABLO CORP notification: "Your shift started 3 hours ago."',
                    '> "CLOCK IN OR GET WRITTEN UP."',
                    '> You pull yourself together. The city waits for no one.',
                    '> ...',
                    '> PABLO CORP TERMINAL ACCESS GRANTED.',
                  ].slice(0, cinematicLine + 1).map((line, i) => (
                    <div key={i} style={{
                      ...VT, fontSize: '1.1rem',
                      color: i === cinematicLine ? '#38bdf8' : 'rgba(56,189,248,.35)',
                      letterSpacing: '.08em', lineHeight: 2.2,
                      textShadow: i === cinematicLine ? '0 0 12px rgba(56,189,248,.4)' : 'none',
                      transition: 'color .3s',
                    }}>{line}</div>
                  ))}
                </div>
                {cinematicLine < 10 ? (
                  <button
                    onClick={() => setCinematicLine(l => l + 1)}
                    style={{
                      padding: '.55rem 2rem', background: 'rgba(56,189,248,.08)',
                      border: '1px solid rgba(56,189,248,.4)', color: '#38bdf8',
                      ...VT, fontSize: '1.1rem', letterSpacing: '.14em', cursor: 'pointer',
                    }}
                  >
                    {tick % 2 === 0 ? '▶' : '▷'} CONTINUE
                  </button>
                ) : (
                  <button
                    onClick={() => { localStorage.setItem('sm_cinematic_seen', '1'); setShowCinematic(false); setScreen('new'); setStep(1); }}
                    style={{
                      padding: '.7rem 2.5rem', background: 'rgba(56,189,248,.12)',
                      border: '1px solid rgba(56,189,248,.7)', color: '#38bdf8',
                      ...VT, fontSize: '1.4rem', letterSpacing: '.18em', cursor: 'pointer',
                      textShadow: '0 0 12px rgba(56,189,248,.5)',
                    }}
                  >
                    WHO ARE YOU {tick % 2 === 0 ? '▶' : '▷'}
                  </button>
                )}
                <button
                  onClick={() => { localStorage.setItem('sm_cinematic_seen', '1'); setShowCinematic(false); setScreen('new'); setStep(1); }}
                  style={{ background: 'none', border: 'none', color: 'rgba(56,189,248,.2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.42rem', letterSpacing: '.1em' }}
                >
                  SKIP INTRO →
                </button>
              </div>
            )}

            {/* ── SAVE SLOT MANAGER (logged-in users only) ─────────────────── */}
            {isAuthenticated && screen === 'saves' && !showCinematic && !showEntryButtons && (
              <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

                {/* Header */}
                <div style={{ borderBottom: '1px solid rgba(56,189,248,.12)', paddingBottom: '.7rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <button onClick={() => setShowEntryButtons(true)} style={{ background: 'none', border: 'none', color: 'rgba(56,189,248,.3)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.5rem', letterSpacing: '.1em', padding: 0, marginBottom: '.3rem', display: 'block' }}>← BACK TO IMMIGRATION</button>
                    <div style={{ ...VT, fontSize: '1.6rem', color: '#38bdf8', letterSpacing: '.15em' }}>SAVE FILES</div>
                    <div style={{ fontSize: '.45rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.12em', marginTop: '.2rem' }}>
                      {user?.firstName ? `SALARYMAN: ${(user.firstName + (user.lastName ? ` ${user.lastName}` : '')).toUpperCase()}` : 'SIGNED IN'} · UP TO 4 STORY SLOTS
                    </div>
                  </div>
                  {savesLoading && <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.1em' }}>SYNCING ▮</div>}
                </div>

                {!atPhysicalTerminal && (
                  <div style={{ fontSize: '.4rem', color: 'rgba(255,200,50,.4)', letterSpacing: '.1em', marginBottom: '.2rem', padding: '.4rem .6rem', border: '1px solid rgba(255,200,50,.15)', background: 'rgba(255,200,50,.03)' }}>
                    DEVICE ACCESS ONLY — VISIT A PUBLIC TERMINAL TO MANAGE ADDITIONAL SAVE SLOTS
                  </div>
                )}

                {/* 4 save slots */}
                {[0, 1, 2, 3].map(slot => {
                  const save = cloudSaves.find(s => s.slotIndex === slot);
                  const col = save ? CLASS_COLOR[save.charClass] ?? '#38bdf8' : 'rgba(56,189,248,.2)';
                  const isConfirming = deleteConfirm === slot;
                  const slotLocked = slot > 0 && !atPhysicalTerminal;

                  return (
                    <div key={slot} style={{ border: `1px solid ${save ? col + '33' : 'rgba(56,189,248,.1)'}`, background: save ? 'rgba(0,0,0,.6)' : 'rgba(0,0,0,.3)', transition: 'border-color .2s', opacity: slotLocked ? 0.35 : 1, pointerEvents: slotLocked ? 'none' : 'auto' }}>
                      {save ? (
                        /* ── OCCUPIED SLOT ── */
                        <div style={{ display: 'flex', gap: 0 }}>
                          {/* Class badge */}
                          <div style={{ width: 80, background: col + '18', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '.3rem', padding: '1rem .5rem', flexShrink: 0, borderRight: `1px solid ${col}22` }}>
                            <div style={{ ...VT, fontSize: '1.8rem', color: col, textShadow: `0 0 10px ${col}` }}>
                              {CLASS_BADGE[save.charClass] ?? save.charClass.slice(0,3).toUpperCase()}
                            </div>
                            <div style={{ fontSize: '.38rem', color: col + 'aa', letterSpacing: '.1em' }}>SLOT {slot + 1}</div>
                          </div>

                          {/* Details */}
                          <div style={{ flex: 1, padding: '1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                              <div style={{ ...VT, fontSize: '1.6rem', color: col, letterSpacing: '.1em' }}>{save.charName}</div>
                              <div style={{ fontSize: '.4rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.08em' }}>{fmtTime(save.lastSavedAt)}</div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.4rem' }}>
                              {[
                                { l: 'CLASS', v: save.charClass.toUpperCase() },
                                { l: 'LEVEL', v: String(save.level) },
                                { l: 'FIAT', v: `ƒ${save.salary.toLocaleString()}` },
                                { l: 'ZONE', v: save.lastZone },
                              ].map(({ l, v }) => (
                                <div key={l} style={{ borderLeft: `2px solid ${col}44`, paddingLeft: '.5rem' }}>
                                  <div style={{ fontSize: '.36rem', color: 'rgba(56,189,248,.22)', letterSpacing: '.1em' }}>{l}</div>
                                  <div style={{ fontSize: '.55rem', color: col, letterSpacing: '.04em', marginTop: '.1rem' }}>{v}</div>
                                </div>
                              ))}
                            </div>
                            <div style={{ fontSize: '.38rem', color: 'rgba(56,189,248,.18)', letterSpacing: '.08em' }}>
                              PLAYTIME: {fmtPlaytime(save.playtime)}
                            </div>
                          </div>

                          {/* Actions */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', padding: '.8rem', justifyContent: 'center', borderLeft: `1px solid ${col}18`, flexShrink: 0 }}>
                            {isConfirming ? (
                              <>
                                <div style={{ fontSize: '.4rem', color: 'rgba(255,100,100,.7)', letterSpacing: '.06em', textAlign: 'center', marginBottom: '.2rem' }}>ERASE?</div>
                                <button onClick={() => handleDelete(slot)} style={{ padding: '.4rem .8rem', background: 'rgba(255,40,40,.12)', border: '1px solid rgba(255,60,60,.5)', color: '#ff6666', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.65rem', letterSpacing: '.08em' }}>CONFIRM</button>
                                <button onClick={() => setDeleteConfirm(null)} style={{ padding: '.4rem .8rem', background: 'transparent', border: '1px solid rgba(56,189,248,.2)', color: 'rgba(56,189,248,.4)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.65rem', letterSpacing: '.08em' }}>CANCEL</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => handleContinue(save)} style={{ padding: '.55rem 1.1rem', background: col + '18', border: `1px solid ${col}66`, color: col, cursor: 'pointer', fontFamily: 'inherit', fontSize: '.75rem', letterSpacing: '.1em', ...VT, textShadow: `0 0 8px ${col}` }}>CONTINUE</button>
                                <button onClick={() => setDeleteConfirm(slot)} style={{ padding: '.4rem .9rem', background: 'transparent', border: '1px solid rgba(255,60,60,.2)', color: 'rgba(255,100,100,.4)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.6rem', letterSpacing: '.1em' }}>ERASE</button>
                              </>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* ── EMPTY SLOT ── */
                        <button
                          onClick={() => { setSelectedSlot(slot); setScreen('new'); setStep(1); }}
                          style={{ width: '100%', padding: '1.3rem 1.5rem', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1.2rem', textAlign: 'left', fontFamily: 'inherit' }}
                        >
                          <div style={{ width: 80, height: 60, border: '1px dashed rgba(56,189,248,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <div style={{ fontSize: '1.5rem', color: 'rgba(56,189,248,.15)' }}>+</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '.45rem', color: 'rgba(56,189,248,.18)', letterSpacing: '.14em', marginBottom: '.3rem' }}>SLOT {slot + 1} — EMPTY</div>
                            <div style={{ ...VT, fontSize: '1.1rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.1em' }}>START NEW STORY</div>
                            <div style={{ fontSize: '.4rem', color: 'rgba(56,189,248,.15)', marginTop: '.2rem', letterSpacing: '.06em' }}>Choose your class · Build your legend</div>
                          </div>
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Guest note */}
                <div style={{ borderTop: '1px solid rgba(56,189,248,.06)', paddingTop: '.65rem', fontSize: '.42rem', color: 'rgba(56,189,248,.15)', letterSpacing: '.06em', lineHeight: 1.7 }}>
                  Saves are tied to your account and sync across devices. Progress is preserved per story slot. Each slot is a separate salaryman with its own history.
                </div>
              </div>
            )}

            {/* ── NOT LOGGED IN — prompt to sign in for saves ──────────────── */}
            {!authLoading && !isAuthenticated && screen === 'saves' && !showEntryButtons && (
              <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ border: '1px solid rgba(56,189,248,.15)', padding: '1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.9rem' }}>
                  <div style={{ ...VT, fontSize: '1.5rem', color: '#38bdf8', letterSpacing: '.15em' }}>SAVE YOUR STORY</div>
                  <div style={{ fontSize: '.52rem', color: 'rgba(56,189,248,.45)', lineHeight: 1.8, maxWidth: 440 }}>
                    Sign in to unlock save slots. Your FIAT, level, and salaryman history are stored to your account — resume any story from any device.
                  </div>
                  <button onClick={login} style={{ padding: '.65rem 2rem', background: 'rgba(56,189,248,.1)', border: '1px solid rgba(56,189,248,.5)', color: '#38bdf8', cursor: 'pointer', fontFamily: 'inherit', ...VT, fontSize: '1.2rem', letterSpacing: '.15em', textShadow: '0 0 8px rgba(56,189,248,.4)' }}>
                    SIGN IN TO SAVE
                  </button>
                  <button onClick={() => setScreen('new')} style={{ background: 'none', border: 'none', color: 'rgba(56,189,248,.25)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.45rem', letterSpacing: '.1em' }}>
                    PLAY AS GUEST (no saves)
                  </button>
                  <div style={{ fontSize: '.42rem', color: 'rgba(255,200,60,.3)', letterSpacing: '.06em', lineHeight: 1.7, marginTop: '.3rem', maxWidth: 400 }}>
                    ⚠ Guest mode: the world is free to explore, but nothing is saved. Log in to keep your FIAT, gear, and progress.
                  </div>
                </div>
              </div>
            )}

            {/* ── Back button when in 'new' screen ─────────────────────────── */}
            {screen === 'new' && isAuthenticated && step === 1 && (
              <div style={{ width: '100%', maxWidth: 820, marginBottom: '-.8rem' }}>
                <div style={{ fontSize: '.45rem', color: 'rgba(56,189,248,.2)', letterSpacing: '.1em', marginTop: '.2rem' }}>NEW STORY — SLOT {selectedSlot + 1}</div>
              </div>
            )}

            {/* ── CHARACTER CREATOR (after guest bypass OR new story selected) ── */}
            {screen === 'new' && step === 1 && (
              <div style={{ width: '100%', maxWidth: 820, display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                  <div style={{ fontSize: '.65rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.15em', marginBottom: '.2rem' }}>SELECT CLASS</div>
                  {CLASSES.map(c => (
                    <button key={c.id} onClick={() => setCls(c.id)} style={{ padding: '.75rem .9rem', border: cls === c.id ? `1px solid ${c.color}` : '1px solid rgba(56,189,248,.15)', background: cls === c.id ? 'rgba(56,189,248,.07)' : 'rgba(56,189,248,.01)', color: cls === c.id ? c.color : 'rgba(56,189,248,.35)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '1rem', transition: 'all .12s', ...S }}>
                      <div style={{ flexShrink: 0, width: 8, height: 8, background: cls === c.id ? c.color : 'rgba(56,189,248,.2)', boxShadow: cls === c.id ? `0 0 8px ${c.color}` : 'none' }} />
                      <div>
                        <div style={{ ...VT, fontSize: '1.1rem', letterSpacing: '.1em', lineHeight: 1 }}>{c.label}</div>
                        <div style={{ fontSize: '.65rem', color: cls === c.id ? 'rgba(56,189,248,.5)' : 'rgba(56,189,248,.2)', marginTop: '.15rem', letterSpacing: '.06em' }}>{c.tagline}</div>
                      </div>
                    </button>
                  ))}
                </div>

                <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
                  <div style={{ border: `1px solid ${selected.color}44`, background: 'rgba(56,189,248,.04)', padding: '1rem' }}>
                    <div style={{ ...VT, fontSize: '1.4rem', color: selected.color, letterSpacing: '.12em', marginBottom: '.5rem' }}>{selected.label}</div>
                    <div style={{ fontSize: '.72rem', color: 'rgba(56,189,248,.5)', lineHeight: 1.8, marginBottom: '.75rem' }}>{selected.desc}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.4rem', marginBottom: '.5rem' }}>
                      {[['HP', selected.hp], ['ATK', selected.atk], ['DEF', selected.def], ['INCOME', selected.salary], ['START FIAT', selected.networth], ['START', selected.start]].map(([k, v]) => (
                        <div key={k} style={{ border: '1px solid rgba(56,189,248,.12)', padding: '.4rem .5rem' }}>
                          <div style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.12em', marginBottom: '.15rem' }}>{k}</div>
                          <div style={{ fontFamily: "'VT323',monospace", fontSize: '.9rem', color: selected.color, letterSpacing: '.08em' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {selected.perks && (
                      <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.07em', borderTop: '1px solid rgba(56,189,248,.1)', paddingTop: '.5rem' }}>
                        ★ {selected.perks}
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: '.65rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.15em', marginBottom: '.35rem' }}>YOUR NAME</div>
                    <input
                      value={name}
                      onChange={e => { setName(e.target.value); setNameError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleProceed()}
                      maxLength={28}
                      placeholder="WHAT'S YOUR NAME"
                      autoFocus
                      style={{ width: '100%', padding: '.65rem .8rem', background: 'rgba(0,8,0,.95)', border: `1px solid ${nameError ? 'rgba(255,60,60,.6)' : name ? 'rgba(56,189,248,.5)' : 'rgba(56,189,248,.2)'}`, color: '#38bdf8', ...S, fontSize: '1rem', letterSpacing: '.1em', outline: 'none', caretColor: '#38bdf8', boxSizing: 'border-box' }}
                    />
                    {nameError && (
                      <div style={{ fontSize: '.48rem', color: 'rgba(255,80,80,.8)', letterSpacing: '.08em', marginTop: '.3rem', ...VT }}>⚠ {nameError}</div>
                    )}
                    <div style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.18)', letterSpacing: '.08em', marginTop: '.25rem' }}>
                      Enter your full name — first and last. Some names are restricted.
                    </div>
                  </div>

                  <button
                    onClick={handleProceed}
                    disabled={!name.trim() || !!nameError}
                    style={{ width: '100%', padding: '.75rem', background: (name.trim() && !nameError) ? 'rgba(56,189,248,.1)' : 'transparent', border: (name.trim() && !nameError) ? '1px solid rgba(56,189,248,.7)' : '1px solid rgba(56,189,248,.1)', color: (name.trim() && !nameError) ? '#38bdf8' : 'rgba(56,189,248,.15)', ...VT, fontSize: '1.5rem', letterSpacing: '.2em', cursor: (name.trim() && !nameError) ? 'pointer' : 'default', transition: 'all .15s' }}
                  >
                    NEXT — REGISTER ENTERPRISE {(name.trim() && !nameError) ? (tick % 2 === 0 ? '▶' : '▷') : ''}
                  </button>

                  <div style={{ fontSize: '.6rem', color: 'rgba(56,189,248,.18)', letterSpacing: '.08em', lineHeight: 1.8 }}>
                    WASD — move &nbsp;·&nbsp; E — enter/talk &nbsp;·&nbsp; F — attack &nbsp;·&nbsp; C — chat &nbsp;·&nbsp; V — voice &nbsp;·&nbsp; P — PABLO device
                  </div>
                </div>
              </div>
            )}

            {screen === 'new' && step === 2 && (
              <div style={{ width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: '.9rem' }}>

                {/* Header */}
                <div style={{ border: '1px solid rgba(56,189,248,.2)', background: 'rgba(56,189,248,.03)', padding: '1rem' }}>
                  <div style={{ fontSize: '.65rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.15em', marginBottom: '.4rem' }}>OPERATIONAL REGISTRATION — {name.trim().toUpperCase()}</div>
                  <div style={{ fontSize: '.7rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.9 }}>
                    Are you starting or registering a business in Minx City?
                  </div>
                  <div style={{ fontSize: '.6rem', color: 'rgba(255,200,60,.3)', letterSpacing: '.1em', marginTop: '.5rem', ...VT }}>{tick % 2 === 0 ? '▮' : '▯'} YOUR SHIFT STARTED 3 HOURS AGO — CLOCK IN OR GET WRITTEN UP</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.6rem' }}>
                  {([
                    { id: 'minx' as const, label: 'IN-GAME BUSINESS', desc: 'Create any business you want in Minx City. Earn FIAT through in-game commerce and activity. No real-world income needed.' },
                    { id: 'real' as const, label: 'REAL ENTERPRISE', desc: 'Real company. Verify income via Gusto, ADP, or payroll provider. Real dollars convert to FIAT. Your brand in-world.' },
                    { id: 'unemployed' as const, label: 'UNEMPLOYED / NO AFFILIATION', desc: 'No company. No income. ƒ0 until you register a business or convert real dollars.' },
                  ]).map(t => (
                    <button key={t.id} onClick={() => { setBizType(t.id); setMinxError(''); }} style={{ padding: '.9rem', border: bizType === t.id ? '1px solid rgba(56,189,248,.7)' : '1px solid rgba(56,189,248,.15)', background: bizType === t.id ? 'rgba(56,189,248,.07)' : 'transparent', color: bizType === t.id ? '#38bdf8' : 'rgba(56,189,248,.35)', cursor: 'pointer', textAlign: 'left', ...S, transition: 'all .12s' }}>
                      <div style={{ ...VT, fontSize: '1.1rem', letterSpacing: '.1em', marginBottom: '.25rem' }}>
                        {t.label}
                      </div>
                      <div style={{ fontSize: '.62rem', color: bizType === t.id ? 'rgba(56,189,248,.5)' : 'rgba(56,189,248,.2)', lineHeight: 1.7 }}>
                        {t.desc}
                      </div>
                    </button>
                  ))}
                </div>

                {bizType === 'minx' && (
                  <div style={{ border: '1px solid rgba(56,189,248,.15)', padding: '.85rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                    <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.2)', letterSpacing: '.15em' }}>CREATE YOUR BUSINESS — ANY INDUSTRY, ANY NAME</div>
                    <div style={{ fontSize: '.48rem', color: 'rgba(56,189,248,.3)', lineHeight: 1.7 }}>
                      Build any business you want inside Minx City. Name it, run it, earn from it. Your FIAT income comes from in-game activity — no free handouts. Other salarymen will see your company name above your head.
                    </div>
                    <input
                      value={minxCompany}
                      onChange={e => { setMinxCompany(e.target.value); setMinxError(''); }}
                      maxLength={60}
                      placeholder="e.g. NEON CAPITAL SOLUTIONS, PHANTOM FREIGHT CO."
                      style={{ width: '100%', padding: '.5rem .7rem', background: 'rgba(0,8,0,.95)', border: `1px solid ${minxError ? 'rgba(255,60,60,.6)' : minxCompany ? 'rgba(56,189,248,.5)' : 'rgba(56,189,248,.3)'}`, color: '#38bdf8', ...S, fontSize: '.85rem', outline: 'none', caretColor: '#38bdf8', boxSizing: 'border-box', letterSpacing: '.06em' }}
                    />
                    {minxError && (
                      <div style={{ fontSize: '.48rem', color: 'rgba(255,80,80,.8)', letterSpacing: '.08em', ...VT }}>⚠ {minxError}</div>
                    )}
                  </div>
                )}

                {bizType === 'unemployed' && (
                  <div style={{ border: '1px solid rgba(255,200,60,.2)', background: 'rgba(255,200,60,.04)', padding: '.85rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                    <div style={{ fontSize: '.5rem', color: 'rgba(255,200,60,.4)', letterSpacing: '.15em' }}>NO AFFILIATION</div>
                    <div style={{ fontSize: '.52rem', color: 'rgba(56,189,248,.35)', lineHeight: 1.7 }}>
                      You'll enter Minx City without a corporate shield. No company name above your head. Just you, the streets, and whatever the corp has planned. Your progress and FIAT balance will not be saved between sessions. PABLO CORP has no record of you — which is either very good or very bad.
                    </div>
                    <div style={{ marginTop: '.5rem', fontSize: '.46rem', color: 'rgba(255,120,120,.3)', lineHeight: 1.7 }}>
                      You can register a business later at PABLO TOWER. Walk in and use the terminal.
                    </div>
                  </div>
                )}

                {bizType === 'real' && (
                  <div style={{ border: '1px solid rgba(56,189,248,.2)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '.65rem' }}>
                    <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.15em' }}>COMPANY PEDIGREE</div>
                    <div>
                      <div style={{ fontSize: '.45rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.12em', marginBottom: '.25rem' }}>COMPANY NAME</div>
                      <input value={company} onChange={e => setCompany(e.target.value)} maxLength={60} placeholder="YOUR COMPANY NAME..." style={{ width: '100%', padding: '.5rem .7rem', background: 'rgba(0,8,0,.95)', border: '1px solid rgba(56,189,248,.3)', color: '#38bdf8', ...S, fontSize: '.85rem', outline: 'none', caretColor: '#38bdf8', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
                      <div>
                        <div style={{ fontSize: '.45rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.12em', marginBottom: '.25rem' }}>INDUSTRY</div>
                        <select value={industry} onChange={e => setIndustry(e.target.value)} style={{ width: '100%', padding: '.5rem .7rem', background: 'rgba(0,8,0,.95)', border: '1px solid rgba(56,189,248,.3)', color: '#38bdf8', ...S, fontSize: '.82rem', outline: 'none', cursor: 'pointer' }}>
                          {REAL_INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: '.45rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.12em', marginBottom: '.25rem' }}>COMPANY SIZE</div>
                        <select value={bizSize} onChange={e => setBizSize(e.target.value)} style={{ width: '100%', padding: '.5rem .7rem', background: 'rgba(0,8,0,.95)', border: '1px solid rgba(56,189,248,.3)', color: '#38bdf8', ...S, fontSize: '.82rem', outline: 'none', cursor: 'pointer' }}>
                          {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    {industry === 'CUSTOM / OTHER' && (
                      <div>
                        <div style={{ fontSize: '.45rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.12em', marginBottom: '.25rem' }}>DESCRIBE YOUR BUSINESS</div>
                        <input value={customIndustry} onChange={e => setCustomIndustry(e.target.value)} maxLength={80} placeholder="e.g. DRONE DELIVERY, AI CONSULTING, FINTECH..." style={{ width: '100%', padding: '.5rem .7rem', background: 'rgba(0,8,0,.95)', border: '1px solid rgba(56,189,248,.3)', color: '#38bdf8', ...S, fontSize: '.85rem', outline: 'none', caretColor: '#38bdf8', boxSizing: 'border-box' }} />
                      </div>
                    )}

                    <div style={{ borderTop: '1px solid rgba(255,200,60,.15)', paddingTop: '.6rem', marginTop: '.2rem' }}>
                      <div style={{ fontSize: '.5rem', color: 'rgba(255,200,60,.4)', letterSpacing: '.15em', marginBottom: '.4rem' }}>INCOME VERIFICATION — REQUIRED FOR FIAT INCOME</div>
                      <div style={{ fontSize: '.42rem', color: 'rgba(255,200,60,.25)', lineHeight: 1.7, marginBottom: '.5rem' }}>
                        WORK VISA REQUIRED. Until your income is verified, PABLO CORP treats you as legally unemployed: you draw the unemployment stipend (ƒ500/hr), NOT your declared salary. Connect a payroll provider (Gusto, ADP, etc.) — or have an org owner attest your figure — and your declared take-home replaces the stipend.
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
                        <div>
                          <div style={{ fontSize: '.45rem', color: 'rgba(255,200,60,.3)', letterSpacing: '.12em', marginBottom: '.25rem' }}>PAYROLL PROVIDER</div>
                          <select value={payrollProvider} onChange={e => setPayrollProvider(e.target.value)} style={{ width: '100%', padding: '.5rem .7rem', background: 'rgba(0,8,0,.95)', border: '1px solid rgba(255,200,60,.3)', color: '#ffcc00', ...S, fontSize: '.82rem', outline: 'none', cursor: 'pointer' }}>
                            {PAYROLL_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <div>
                          <div style={{ fontSize: '.45rem', color: 'rgba(255,200,60,.3)', letterSpacing: '.12em', marginBottom: '.25rem' }}>DECLARED MONTHLY INCOME ($USD)</div>
                          <input value={declaredIncome} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setDeclaredIncome(v); }} maxLength={10} placeholder="0" style={{ width: '100%', padding: '.5rem .7rem', background: 'rgba(0,8,0,.95)', border: `1px solid rgba(255,200,60,.3)`, color: '#ffcc00', ...S, fontSize: '.85rem', outline: 'none', caretColor: '#ffcc00', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      {payrollProvider === 'NONE' && (
                        <div style={{ fontSize: '.42rem', color: 'rgba(255,80,80,.5)', letterSpacing: '.08em', marginTop: '.35rem', ...VT }}>⚠ NO PAYROLL PROVIDER — YOUR IN-GAME SALARY WILL BE ƒ0 UNTIL VERIFIED</div>
                      )}
                      {payrollProvider !== 'NONE' && !declaredIncome && (
                        <div style={{ fontSize: '.42rem', color: 'rgba(255,200,60,.4)', letterSpacing: '.08em', marginTop: '.35rem', ...VT }}>▮ DECLARE YOUR MONTHLY INCOME TO ENABLE FIAT EARNINGS</div>
                      )}
                    </div>

                    <div>
                      <div style={{ fontSize: '.45rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.12em', marginBottom: '.25rem' }}>CONTACT EMAIL <span style={{ color: 'rgba(56,189,248,.15)' }}>(OPTIONAL)</span></div>
                      <input value={bizEmail} onChange={e => setBizEmail(e.target.value)} type="email" maxLength={100} placeholder="contact@yourcompany.com" style={{ width: '100%', padding: '.5rem .7rem', background: 'rgba(0,8,0,.95)', border: '1px solid rgba(56,189,248,.3)', color: '#38bdf8', ...S, fontSize: '.85rem', outline: 'none', caretColor: '#38bdf8', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                )}

                {bizType !== 'unemployed' && (() => {
                  const ws = getWorkstation(bizType === 'real' ? 'real' : 'minx', industry, minxCompany.trim().toUpperCase() || 'UNKNOWN');
                  return (
                    <div style={{ border: '1px solid rgba(56,189,248,.3)', background: 'rgba(56,189,248,.04)', padding: '.85rem' }}>
                      <div style={{ fontSize: '.42rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.14em', marginBottom: '.4rem' }}>WORKSTATION ASSIGNMENT</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.3rem' }}>
                        <div>
                          <div style={{ ...VT, fontSize: '1.15rem', color: '#38bdf8', letterSpacing: '.1em' }}>{ws.label}</div>
                          <div style={{ fontSize: '.48rem', color: 'rgba(56,189,248,.5)', letterSpacing: '.07em', marginTop: '.08rem' }}>{ws.slot}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ ...VT, fontSize: '1.1rem', color: '#38bdf8' }}>FREE</div>
                          <div style={{ fontSize: '.4rem', color: 'rgba(56,189,248,.3)', marginTop: '.05rem' }}>ƒ500/rest after day 7</div>
                        </div>
                      </div>
                      <div style={{ fontSize: '.42rem', color: 'rgba(56,189,248,.25)', lineHeight: 1.6, borderTop: '1px solid rgba(56,189,248,.1)', paddingTop: '.3rem' }}>
                        The city assigns every registered operator a bed, desk and terminal at no cost. First 7 days are free. After that ƒ500 per rest — the lowest rate in Minx City.
                      </div>
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', gap: '.6rem' }}>
                  <button onClick={() => setStep(1)} style={{ padding: '.65rem 1.2rem', background: 'transparent', border: '1px solid rgba(56,189,248,.2)', color: 'rgba(56,189,248,.4)', ...VT, fontSize: '1rem', letterSpacing: '.1em', cursor: 'pointer' }}>← BACK</button>
                  <button
                    onClick={handleEnterWorld}
                    disabled={submitting || checkingName}
                    style={{ flex: 1, padding: '.75rem', background: 'rgba(56,189,248,.1)', border: '1px solid rgba(56,189,248,.7)', color: '#38bdf8', ...VT, fontSize: '1.5rem', letterSpacing: '.2em', cursor: (submitting || checkingName) ? 'wait' : 'pointer', textShadow: '0 0 12px rgba(56,189,248,.4)' }}
                  >
                    {submitting ? 'REGISTERING...' : checkingName ? 'VERIFYING NAME...' : `START ${tick % 2 === 0 ? '▶' : '▷'}`}
                  </button>
                </div>

                <div style={{ fontSize: '.46rem', color: 'rgba(56,189,248,.15)', lineHeight: 1.8 }}>
                  {bizType === 'unemployed'
                    ? 'Session-local only. No rent. No commitment. You can register later at PABLO TOWER.'
                    : 'Business data stored persistently for paid subscribers. Free workstation available immediately on entry.'}
                </div>
                <div style={{ fontSize: '.44rem', color: 'rgba(255,200,60,.2)', letterSpacing: '.1em', textAlign: 'center', ...VT }}>— HURRY UP, SALARYMAN. MINX CITY DOESN'T WAIT. —</div>
              </div>
            )}
          </>
        )}

        {/* ── TAB: FIELD GUIDE ── */}
        {tab === 'guide' && (
          <div style={{ width: '100%', maxWidth: 960, display: 'flex', gap: '1.2rem', alignItems: 'flex-start' }}>

            {/* Left sub-nav */}
            <div style={{ flexShrink: 0, width: 130, display: 'flex', flexDirection: 'column', gap: '.3rem', position: 'sticky', top: 0 }}>
              <div style={{ fontSize: '.58rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.14em', marginBottom: '.35rem' }}>SECTIONS</div>
              {GUIDE_SECTIONS.map(gs => (
                <button
                  key={gs.id}
                  onClick={() => setGuideSection(gs.id)}
                  style={{
                    padding: '.45rem .6rem',
                    background: guideSection === gs.id ? `${gs.col}14` : 'transparent',
                    border: guideSection === gs.id ? `1px solid ${gs.col}66` : '1px solid rgba(56,189,248,.1)',
                    color: guideSection === gs.id ? gs.col : 'rgba(56,189,248,.3)',
                    ...VT,
                    fontSize: '.95rem',
                    letterSpacing: '.1em',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all .1s',
                    textShadow: guideSection === gs.id ? `0 0 8px ${gs.col}88` : 'none',
                  }}
                >
                  {gs.label}
                </button>
              ))}
              <div style={{ marginTop: '.6rem', border: '1px solid rgba(56,189,248,.1)', padding: '.5rem .6rem' }}>
                <div style={{ fontSize: '.58rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.1em', marginBottom: '.3rem' }}>QUICK START</div>
                <div style={{ fontSize: '.65rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.8 }}>
                  1. Pick a class<br />
                  2. Name your salaryman<br />
                  3. Register enterprise<br />
                  4. Enter the world<br />
                  5. Press [F] near enemies<br />
                  6. Find the crystal
                </div>
              </div>
            </div>

            {/* Right content */}
            <div style={{
              flex: 1,
              background: 'rgba(0,6,0,.6)',
              border: '1px solid rgba(56,189,248,.14)',
              padding: '1rem 1.2rem',
              maxHeight: '62vh',
              overflowY: 'auto',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(56,189,248,.2) transparent',
            }}>
              <GuideContent section={guideSection} />
            </div>
          </div>
        )}

        {/* ── TAB: SETTINGS ── */}
        {tab === 'settings' && (
          <div style={{ width: '100%', maxWidth: 720 }}>
            <GameSettings embedded />
          </div>
        )}

      </div>

      {/* Bottom bar */}
      <div style={{ position: 'relative', zIndex: 1, padding: isMobile ? '.3rem .5rem' : '.4rem 1.5rem', borderTop: '1px solid rgba(56,189,248,.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.3rem', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        {!isMobile && (
          <span style={{ fontSize: '.48rem', color: 'rgba(56,189,248,.15)', letterSpacing: '.1em' }}>
            {TIMEZONE_OPTIONS.find(tz => tz.id === selectedTimezone)?.label ?? 'Minx City (PST)'} · WASTELAND · 14 LOCATIONS · LVL SYSTEM · SURVIVAL · 11 TOWERS · 11 SERVERS · PABLO CORP INTERNATIONAL
          </span>
        )}
        <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: isMobile ? 'center' : 'flex-end', width: isMobile ? '100%' : 'auto' }}>
          <button onClick={() => navigate('/mobile')} style={{ fontSize: '.48rem', color: 'rgba(0,180,255,.3)', background: 'transparent', border: '1px solid rgba(0,180,255,.15)', padding: '2px 8px', cursor: 'pointer', letterSpacing: '.08em', ...S }}>📱 MOBILE TERMINAL</button>
          {!isMobile && <button onClick={() => navigate('/world/play?store=1')} style={{ fontSize: '.48rem', color: 'rgba(180,100,255,.6)', background: 'rgba(180,100,255,.05)', border: '1px solid rgba(180,100,255,.3)', padding: '2px 8px', cursor: 'pointer', letterSpacing: '.08em', ...S }}>ƒ COSMETICS</button>}
          <button onClick={() => navigate('/world/land')} style={{ fontSize: '.48rem', color: 'rgba(56,189,248,.6)', background: 'rgba(56,189,248,.05)', border: '1px solid rgba(56,189,248,.3)', padding: '2px 8px', cursor: 'pointer', letterSpacing: '.08em', ...S }}>⌖ LAND REGISTRY</button>
          <button onClick={() => navigate('/')} style={{ fontSize: '.48rem', color: 'rgba(56,189,248,.2)', background: 'transparent', border: '1px solid rgba(56,189,248,.1)', padding: '2px 8px', cursor: 'pointer', letterSpacing: '.08em', ...S }}>← BACK</button>
        </div>
      </div>

      {showWelcomeDialog && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.92)', padding: '1rem' }}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', maxWidth: 560, width: '100%' }}>
            <div style={{ ...VT, fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: '#38bdf8', textShadow: '0 0 30px rgba(56,189,248,.5)', letterSpacing: '.15em' }}>Welcome to Minx City.</div>
            <div style={{ fontSize: '.8rem', color: 'rgba(56,189,248,.4)', letterSpacing: '.12em', lineHeight: 1.8, maxWidth: 500, ...S }}>
              The gates are open. Your record has been filed.<br />PABLO CORP is watching. Stay sharp, salaryman.
            </div>

            {bizType === 'real' && (
              <div style={{ width: '100%', border: '1px solid rgba(56,189,248,.3)', background: 'rgba(56,189,248,.04)', padding: '1rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '.7rem' }}>
                <div style={{ ...VT, fontSize: '1.2rem', color: '#38bdf8', letterSpacing: '.12em' }}>ENTERPRISE UPGRADE AVAILABLE</div>
                <div style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.5)', lineHeight: 1.8, ...S }}>
                  Your real company is registered. Activate premium modules for your entire team — Live Listen, Screen Scan, Say This, and the Phone System. Company billing routes purchases to your company's payment method.
                </div>
                <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => navigate('/pricing')}
                    style={{ flex: 1, padding: '.55rem 1rem', background: 'rgba(56,189,248,.1)', border: '1px solid rgba(56,189,248,.6)', color: '#38bdf8', ...VT, fontSize: '1rem', letterSpacing: '.12em', cursor: 'pointer' }}>
                    VIEW PLANS →
                  </button>
                  <button
                    onClick={() => navigate('/world/play')}
                    style={{ padding: '.55rem 1rem', background: 'transparent', border: '1px solid rgba(56,189,248,.2)', color: 'rgba(56,189,248,.4)', ...VT, fontSize: '.85rem', letterSpacing: '.1em', cursor: 'pointer' }}>
                    SKIP FOR NOW
                  </button>
                </div>
              </div>
            )}

            {bizType !== 'real' && (
              <button
                onClick={() => navigate('/world/play')}
                style={{
                  padding: '.9rem 3rem', background: 'rgba(56,189,248,.12)',
                  border: '1px solid rgba(56,189,248,.7)', color: '#38bdf8',
                  ...VT, fontSize: '1.6rem', letterSpacing: '.2em', cursor: 'pointer',
                  textShadow: '0 0 12px rgba(56,189,248,.5)',
                  animation: 'smblink 1.2s step-end infinite',
                }}
              >
                ENTER CITY {tick % 2 === 0 ? '▶' : '▷'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
