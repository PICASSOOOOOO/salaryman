import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { useIsMobile } from '../hooks/use-mobile';

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
  corporate: '#00ff41',
  outlaw: '#88ff44',
  replicant: '#33ffaa',
};

const CLASS_BADGE: Record<string, string> = {
  corporate: 'SUIT',
  outlaw: 'OTL',
  replicant: 'REP',
};

type GuideSection = 'world' | 'factions' | 'combat' | 'survival' | 'territories' | 'landmarks' | 'terminals' | 'controls';

const CLASSES = [
  {
    id: 'corporate' as CharClass,
    label: 'SUITS',
    tagline: 'City. Money. Influence.',
    desc: 'Born in the neon towers. Highest salary at ƒ500/min. Control military and police. Government buildings welcome you. Full city passport included. The wasteland will eat you alive — but you can buy your way through checkpoints.',
    start: 'CORPORATE DISTRICT',
    salary: 'ƒ25,000',
    hp: '350',
    atk: '3',
    def: '6',
    networth: 'ƒ25,000',
    perks: 'Most money · Full city passport · ƒ500/min · Control military & police',
    color: '#00ff41',
  },
  {
    id: 'outlaw' as CharClass,
    label: 'OUTLAWS',
    tagline: 'Wasteland. Tough. Scarred.',
    desc: 'Exiled and hardened. High HP, strong ATK. Hunger and thirst drain slower in the wastes. Can craft supplies from scavenged materials. Bonus credits for kills outside the city. Starts with a wasteland passport.',
    start: 'WASTELAND',
    salary: 'ƒ10,000',
    hp: '480',
    atk: '14',
    def: '8',
    networth: 'ƒ10,000',
    perks: 'High HP · Wasteland passport · Wasteland drain -40% · Crafting · ƒ100/min',
    color: '#88ff44',
  },
  {
    id: 'replicant' as CharClass,
    label: 'REPLICANTS',
    tagline: 'Android. Conscious. Deadliest.',
    desc: 'You are the conscious android — built for combat, not for service. Highest ATK and HP. PABLO Corp. wants you shut down. Operates in both city and wasteland. Starts at the city fringe with a basic city passport.',
    start: 'CITY FRINGE',
    salary: 'ƒ18,000',
    hp: '600',
    atk: '18',
    def: '12',
    networth: 'ƒ18,000',
    perks: 'Tankiest · Highest DEF · Basic city passport · No energy drain · ƒ300/min',
    color: '#33ffaa',
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
];

const SIZES = ['SOLO OPERATOR', 'SMALL (2-10)', 'MID (11-50)', 'CORP (51-500)', 'MEGACORP (500+)'];

const WORKSTATION_ASSIGNMENTS: { match: RegExp; bid: string; label: string; slot: string }[] = [
  { match: /TECH|SOFTWARE|SAAS|GAMING|DATA|SYNAPSE|ZAIBATSU/i,         bid: 'data_vault',  label: 'DATA VAULT',    slot: 'BED 12 · DESK 3 · DEV TERMINAL' },
  { match: /MEDIA|ENTERT|RADIO|STATIC|VIRAL|COMMS/i,                   bid: 'radio',       label: 'PIRATE RADIO',  slot: 'BED 2 · DESK 1 · BROADCAST TERMINAL' },
  { match: /HEALTH|PHARMA|CHEM|MEDICAL|BIOTECH/i,                      bid: 'oxide_labs',    label: 'OXIDE LABS',    slot: 'BED 8 · DESK 7 · LAB TERMINAL' },
  { match: /MARKET|PRINT|ADVERTIS|DESIGN|ARCH|EDUC/i,                  bid: 'print_shop',  label: 'PRINT SHOP',    slot: 'BED 4 · DESK 2 · PRESS TERMINAL' },
  { match: /MANUF|LOGIST|CONSTRUCT|SCRAP|RUST|PHANTOM FREIGHT/i,       bid: 'scrap',       label: 'SCRAP YARD',    slot: 'BED 6 · DESK 4 · OPS TERMINAL' },
  { match: /FINANC|CAPITAL|NEON CAP|FINTECH/i,                         bid: 'megabank',    label: 'IRON TRUST BANK', slot: 'BED 1 · DESK 9 · FINANCE TERMINAL' },
  { match: /ARMS|WEAPON|EDEN|BLACK IRON|SECURITY/i,                    bid: 'armory',      label: 'ARMORY',        slot: 'BED 3 · DESK 8 · TACTICAL TERMINAL' },
  { match: /SHADOW|JADE SYND|GHOST PROTOCOL|SALVAGE/i,                 bid: 'market',      label: 'BLACK MARKET',  slot: 'BED 7 · DESK 5 · SHADOW TERMINAL' },
  { match: /ENERGY|OMEGA|POWER|GRID/i,                             bid: 'oxide_labs',    label: 'OXIDE LABS',    slot: 'BED 9 · DESK 2 · POWER TERMINAL' },
  { match: /LEGAL|LAWTECH|CONSULT|RECRUIT|INSURANC/i,                  bid: 'data_vault',  label: 'DATA VAULT',    slot: 'BED 5 · DESK 6 · LEGAL TERMINAL' },
  { match: /REAL ESTATE|E-COMMERCE|RETAIL|FOOD|BEVERAGE/i,             bid: 'east_market', label: 'EAST BAZAAR',   slot: 'BED 11 · DESK 3 · TRADE TERMINAL' },
  { match: /NON-PROFIT|GOVERN|PUBLIC/i,                                bid: 'arcade',      label: 'PIXEL ARCADE',  slot: 'BED 1 · DESK 1 · PUBLIC TERMINAL' },
];
function getWorkstation(bType: 'fictitious'|'real', ind: string, fictInd: string) {
  const q = bType === 'real' ? ind : fictInd;
  return WORKSTATION_ASSIGNMENTS.find(w => w.match.test(q)) ?? WORKSTATION_ASSIGNMENTS[0];
}

const FLAVOR = [
  'The collapse happened three years ago. Minx City never recovered.',
  'PABLO CORP. controls every credit in Minx City.',
  'The wasteland is everything south of the wall. The corp owns that too.',
  'Your PABLO device is your only edge.',
  'Credits don\'t grow on ruins — but the corp always finds a way.',
  'Every building in Minx City has a price. The corp set them all.',
  'Villain of the poor. Hero of the rich. That\'s PABLO CORP.',
  'Gang territory starts where the lights end.',
  'Server: MINX CITY · PST — 24 regional servers worldwide.',
  'A helicopter left the tower at 3 AM. Nobody knows which city it came from. Nobody asks.',
  'They say there are towers in 24 cities. Each one taller than the last. Minx City got the prototype.',
  'Neon Lagos. Sector Berlin. Old Shanghai. The PABLO CORP. network never sleeps.',
  'The helipad on Floor 62 runs day and night. Someone is always arriving. Someone is always leaving.',
];

const GUIDE_SECTIONS: { id: GuideSection; label: string; col: string }[] = [
  { id: 'world',       label: 'MINX CITY',   col: '#00ff41' },
  { id: 'factions',    label: 'FACTIONS',     col: '#ff8844' },
  { id: 'combat',      label: 'COMBAT',       col: '#ffcc00' },
  { id: 'survival',    label: 'SURVIVAL',     col: '#33aaff' },
  { id: 'territories', label: 'TERRITORIES',  col: '#ff4444' },
  { id: 'landmarks',   label: 'LANDMARKS',    col: '#88ff44' },
  { id: 'terminals',   label: 'TERMINALS',    col: '#33ffaa' },
  { id: 'controls',    label: 'CONTROLS',     col: '#cc88ff' },
];

const EXP_TABLE = [100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000];

const TIMEZONE_OPTIONS = [
  { id: 'pst', label: 'Minx City (PST)', enabled: true },
];

function Row({ label, val, col }: { label: string; val: string; col?: string }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,255,65,.07)', padding: '.3rem 0', gap: '1rem', alignItems: 'flex-start' }}>
      <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.1em', minWidth: 100, paddingTop: '.12rem', flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: '.57rem', color: col ?? 'rgba(0,255,65,.7)', letterSpacing: '.05em', lineHeight: 1.7 }}>{val}</div>
    </div>
  );
}

function SectionHead({ children }: { children: string }) {
  return (
    <div style={{ fontFamily: "'VT323',monospace", fontSize: '1.3rem', color: '#00ff41', letterSpacing: '.12em', marginBottom: '.5rem', marginTop: '.2rem', textShadow: '0 0 12px rgba(0,255,65,.3)' }}>{children}</div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,255,65,.18), transparent)', margin: '.5rem 0' }} />;
}

function GuideContent({ section }: { section: GuideSection }) {
  const VT: React.CSSProperties = { fontFamily: "'VT323',monospace" };
  const S: React.CSSProperties = { fontFamily: "'Share Tech Mono',monospace" };

  if (section === 'world') return (
    <div style={S}>
      <SectionHead>MINX CITY</SectionHead>
      <div style={{ fontSize: '.56rem', color: 'rgba(0,255,65,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        The collapse came without warning. Three years ago PABLO CORP. cut the power grid for 48 hours. When it came back on, the corp owned everything. Minx City runs on PABLO credits now. There is no alternative. 24 regional servers mirror the same story across every timezone — the collapse is global.
      </div>
      <Row label="SERVER" val="MINX CITY · PST — Your regional instance. 24 servers worldwide, each tied to a timezone. The lore is the same everywhere. PABLO CORP. is everywhere." col="#cc44ff" />
      <Divider />
      <Row label="MINX CITY" val="The neon side. Corporate towers. Clinics. Banks. Streets patrolled by automated sentries no one admits to deploying. High salary potential. Wasteland keeps creeping north." col="#00ff41" />
      <Row label="WASTELAND" val="Everything south of the wall. Three gang territories carve it up. Survival meters drain 1.5× faster here. Your salary bleeds if your energy collapses. High risk, high EXP." col="#88ff44" />
      <Row label="THE BORDER" val="The invisible line between city and wasteland. No wall, no sign. Just the moment the sky changes from neon to smoke. Most corps never cross it." col="#aaff22" />
      <Divider />
      <SectionHead>HISTORY OF MINX CITY</SectionHead>
      <div style={{ fontSize: '.56rem', color: 'rgba(0,255,65,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        Before the collapse, Minx City was a mid-tier coastal hub — shipping, tech startups, and a bloated public sector. The power grid failure three years ago wiped the old order overnight. Martial law lasted six weeks. When it lifted, PABLO CORP. had already bought the utilities, the hospitals, and both newspapers. The transition was silent. Nobody voted. Nobody protested. The lights came back on — and everything had a new owner.
      </div>
      <div style={{ fontSize: '.56rem', color: 'rgba(0,255,65,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        The city split into two halves. North of the wall: corporate towers, automated patrols, neon storefronts, and a population that learned to stop asking questions. South of the wall: the wasteland — three gang territories, radiation pockets, and everyone who couldn't afford to stay. The border has no sign. Just the moment the sky changes from neon to smoke.
      </div>
      <Row label="SHADOW TOWER" val="62 floors. City center. Floors 1–39 open to registered operatives. Floor 40+: permanently restricted. Floor 62: rooftop helipad — runs 24/7. The tower is the tallest structure in Minx City and visible from every point in the wasteland." col="#cc44ff" />
      <Row label="TERMINALS" val="PABLO AI is free on every terminal — personal or public. Payphones, kiosks, and vans are scattered across Minx City and the wasteland. Press [P] with a working device, or [E] at any public terminal." col="#33ffaa" />
      <Row label="FIAT (ƒ)" val="The only currency that matters. Fiat is what Minx City runs on. ƒ1 FIAT = 1 BTC in purchasing power — post-collapse, the dollar died. The mint is controlled by PABLO CORP. A cut is taken from everything." col="#ffcc00" />
      <Row label="METRO SYSTEM" val="Four subway stations connect the city districts: METRO WEST, METRO CENTRAL, METRO EAST, METRO NORTH. Fast travel between them for a fee. The tunnels are pre-collapse infrastructure — still running." col="#33aaff" />
      <Divider />
      <div style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.08em', lineHeight: 1.8, fontStyle: 'italic', marginTop: '.4rem' }}>
        Minx City. 24 regional servers. Same story. Same collapse. Same neon. All rights reserved in every timezone.
      </div>
    </div>
  );

  if (section === 'factions') return (
    <div style={S}>
      <SectionHead>FACTIONS OF MINX CITY</SectionHead>
      <div style={{ fontSize: '.56rem', color: 'rgba(0,255,65,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        Power in Minx City is not shared. It is hoarded, delegated, and enforced. Three institutions control daily life inside the wall. Outside it, the gangs carve up what remains. Understanding who holds the leash — and who wears it — is the difference between surviving and disappearing.
      </div>
      <Divider />
      <div style={{ fontSize: '.44rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── PABLO CORP. ──</div>
      <Row label="PABLO CORP. WORKERS" val="Civilians. Office staff, technicians, accountants, maintenance crews. They wear corporate lanyards and keep their heads down. They are not armed, not trained for combat, and not loyal — just employed. Most would leave if they could afford to. They cannot." col="#ff8844" />
      <Row label="CORPO MILITARY" val="Private military contractors on PABLO CORP. payroll. Heavily armed, body-armored, stationed at checkpoints and tower entrances. Their sole directive: protect PABLO CORP. assets and personnel. They do not respond to civilian distress. They do not patrol outside corporate zones. If you are not on the payroll, you are not their problem." col="#ff4444" />
      <Row label="COMMAND" val="SENIOR PABLO sits at the top. Below him: division heads, project leads, and a rotating cast of executives who last an average of 14 months before reassignment or disappearance. The hierarchy is opaque by design." col="#cc44ff" />
      <Divider />
      <div style={{ fontSize: '.44rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── MINX CITY POLICE ──</div>
      <Row label="POLICE" val="Underfunded, overworked, and deeply corrupt. The Minx City Police Department predates the collapse but barely survived it. Officers patrol slowly, stop citizens for random ID checks, and enforce laws that change weekly. Their authority ends where PABLO CORP. property begins — corpo military handles the rest." col="#3388ff" />
      <Row label="TACTICS" val="Random stops. ID verification. Fines for infractions you have never heard of. Officers travel in pairs. They avoid the wasteland entirely. Their radio chatter is unencrypted — anyone within earshot can hear them harassing pedestrians." col="#3388ff" />
      <Row label="CORRUPTION" val="Bribes are standard. Fines are negotiable. Arrests are rare — paperwork costs more than looking the other way. The department answers to the city council, which answers to PABLO CORP., which answers to no one." col="#3388ff" />
      <Divider />
      <div style={{ fontSize: '.44rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── WASTELAND GANGS ──</div>
      <Row label="IRON RATS" val="Scrappers and scavengers. Pike Renner's old crew. They strip anything metal and sell it back to the city at markup. Territorial but not suicidal — they avoid PABLO CORP. convoys." col="#ff4444" />
      <Row label="VOID DOGS" val="Signal pirates. They broadcast static on loop — allegedly containing encrypted data. Their territory is marked by interference patterns on your device. Hostile to outsiders." col="#ff8800" />
      <Row label="STATIC MONKS" val="Silent operators. They move in formation, communicate through gesture, and guard something buried beneath their territory. Kael Verne claims it predates the collapse. Nobody has confirmed this." col="#aaff22" />
      <Row label="EASTERN BLOC" val="No negotiation. No communication. Nova Pryce traced their signal to a server in Shadow Tower. They operate like a military unit — precise, disciplined, and utterly uninterested in diplomacy." col="#ff66ff" />
      <Divider />
      <div style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.08em', lineHeight: 1.8, fontStyle: 'italic', marginTop: '.4rem' }}>
        Everyone in Minx City belongs to someone. The only question is whether you know it yet.
      </div>
    </div>
  );

  if (section === 'combat') return (
    <div style={S}>
      <SectionHead>COMBAT SYSTEM</SectionHead>
      <div style={{ fontSize: '.56rem', color: 'rgba(0,255,65,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        Enemies patrol their territories. When you enter range they chase. Stand your ground or run — your call. Press [F] to attack. Anything inside 72px takes damage.
      </div>
      <Divider />
      <Row label="[F] ATTACK" val="Melee swing. Hits all enemies within ~72px. ATK = 20 + (LVL−1)×5. Cooldown: 0.5s. Yellow flash ring confirms the hit zone." col="#ffcc00" />
      <Row label="ENEMY DAMAGE" val="Enemies deal 0.4 HP per frame when in contact. Invincibility frames (0.3s) prevent instant stacking." col="#ff4444" />
      <Row label="KILL" val="Enemy HP → 0: they vanish. EXP awarded. Respawn at spawn point in 7 seconds." col="#00ff41" />
      <Row label="POISON" val="MUTANTS and STATIC_MONKS have a 12% chance to poison on contact. HP drains 1.5/sec while poisoned. Cure: SAVE POINT or respawn." col="#88ff44" />
      <Divider />
      <SectionHead>EXP & LEVELS</SectionHead>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '.3rem', margin: '.5rem 0' }}>
        {EXP_TABLE.slice(0, 10).map((n, i) => (
          <div key={i} style={{ border: '1px solid rgba(0,255,65,.15)', padding: '.35rem .4rem', textAlign: 'center' }}>
            <div style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.3)', marginBottom: '.1rem' }}>LVL {i+1}→{i+2}</div>
            <div style={{ ...VT, fontSize: '.85rem', color: '#ffcc00' }}>{n}</div>
          </div>
        ))}
      </div>
      <Row label="LEVEL UP" val="MAX HP +10. ATK +5. HP partially restored. Gold LEVEL UP overlay appears. Stats persist until TERMINAL." col="#ffcc00" />
      <Row label="EXP TABLE" val="100 → 250 → 450 → 700 → 1000 → 1400 → 1900 → 2500 → 3200 → 4000 (max)" col="#ffcc00" />
      <Divider />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '.3rem', marginTop: '.5rem' }}>
        {[['IRON_RATS','#ff4444','30','20'],['VOID_DOGS','#ff8800','40','28'],['MUTANT','#88ff44','35','30'],['STATIC_MONKS','#aaff22','50','35'],['RAIDER','#ff66ff','45','40']].map(([n,c,hp,exp]) => (
          <div key={n} style={{ border: `1px solid ${c}33`, padding: '.4rem .45rem', background: `${c}09` }}>
            <div style={{ ...VT, fontSize: '.85rem', color: c as string, letterSpacing: '.06em' }}>{n}</div>
            <div style={{ fontSize: '.38rem', color: 'rgba(0,255,65,.3)', marginTop: '.2rem' }}>HP {hp} · EXP {exp}</div>
          </div>
        ))}
      </div>
    </div>
  );

  if (section === 'survival') return (
    <div style={S}>
      <SectionHead>SURVIVAL METERS</SectionHead>
      <div style={{ fontSize: '.56rem', color: 'rgba(0,255,65,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        Three meters govern your operational status. Let any one drop to zero and you start taking consequences. The wasteland accelerates the drain on all three.
      </div>
      <Divider />
      {[
        { label: 'HUNGER', col: '#00ff41', drain: '−1.5/tick (city) · −2.5/tick (wasteland)', crit: 'HP drains when HUNGER = 0', restore: 'VENDING MACHINE +30 · PABLO STORE consumables' },
        { label: 'THIRST', col: '#33aaff', drain: '−2/tick (city) · −3/tick (wasteland)', crit: 'HP drains when THIRST = 0', restore: 'VENDING MACHINE +30' },
        { label: 'ENERGY', col: '#ffcc00', drain: '−1/tick (city) · −1.5/tick (wasteland)', crit: 'Salary −5/tick when ENERGY < 20', restore: 'HOTEL NEON +30 · PIXEL ARCADE +20' },
      ].map(m => (
        <div key={m.label} style={{ border: `1px solid ${m.col}22`, background: `${m.col}06`, padding: '.6rem .75rem', marginBottom: '.4rem' }}>
          <div style={{ ...VT, fontSize: '1.1rem', color: m.col, letterSpacing: '.1em', marginBottom: '.3rem' }}>{m.label}</div>
          <Row label="DRAIN" val={m.drain} col={m.col} />
          <Row label="CRITICAL" val={m.crit} col="#ff6644" />
          <Row label="RESTORE" val={m.restore} col="rgba(0,255,65,.6)" />
        </div>
      ))}
      <Divider />
      <Row label="TICK RATE" val="Every ~9 seconds in the game loop. Drains pause while dialogs / panels are open." />
      <Row label="GAME OVER" val="HP → 0 triggers GAME OVER screen. CONTINUE restores all meters to 100. TERMINAL returns to this menu." />
    </div>
  );

  if (section === 'territories') return (
    <div style={S}>
      <SectionHead>GANG TERRITORIES</SectionHead>
      <div style={{ fontSize: '.56rem', color: 'rgba(0,255,65,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        Three gangs carved up the wasteland after the collapse. They don't care who you are. Step into their zone and the HUD lights up. Each zone has its own threat profile and entry narration.
      </div>
      <Divider />
      {[
        {
          id: 'IRON RATS', col: '#ff4444', zone: 'Western wasteland',
          entry: '"IRON RATS territory. You\'re the meal."',
          enemies: 'IRON_RATS — HP 30 · EXP 20 · fast, swarming',
          lore: 'Former construction workers. Turned feral after PABLO CORP. seized their housing blocks. They wear red. They hit in groups. Don\'t stop moving.',
        },
        {
          id: 'VOID DOGS', col: '#ff8800', zone: 'Central wasteland',
          entry: '"VOID DOGS don\'t negotiate."',
          enemies: 'VOID_DOGS — HP 40 · EXP 28 · balanced, patrol-heavy',
          lore: 'Ex-security contractors cut loose when PABLO CORP. automated the checkpoints. Organized. Orange armbands. They remember how to be soldiers.',
        },
        {
          id: 'STATIC MONKS', col: '#aaff22', zone: 'Eastern wasteland',
          entry: '"STATIC MONKS zone. Your signal is their noise."',
          enemies: 'STATIC_MONKS — HP 50 · EXP 35 · slow, tough, can POISON',
          lore: 'Former telecom engineers. They worship dead frequencies. They believe the collapse was a signal. They jam everything. They can poison you — something in the static.',
        },
      ].map(g => (
        <div key={g.id} style={{ border: `1px solid ${g.col}33`, background: `${g.col}07`, padding: '.7rem .8rem', marginBottom: '.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem', marginBottom: '.5rem' }}>
            <div style={{ width: 10, height: 10, background: g.col, boxShadow: `0 0 8px ${g.col}` }} />
            <div style={{ ...VT, fontSize: '1.3rem', color: g.col, letterSpacing: '.1em' }}>{g.id}</div>
            <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.1em' }}>{g.zone}</div>
          </div>
          <Row label="ENTRY" val={g.entry} col={g.col} />
          <Row label="ENEMIES" val={g.enemies} col="rgba(0,255,65,.6)" />
          <Row label="LORE" val={g.lore} />
        </div>
      ))}
      <Divider />
      <Row label="HUD INDICATOR" val="Zone name + warning appear in the bottom-left panel when you cross into gang territory." col="#ff8800" />
      <Row label="WASTELAND RULE" val="All survival meters drain faster across the entire wasteland, not just in gang zones." col="#88ff44" />
    </div>
  );

  if (section === 'landmarks') return (
    <div style={S}>
      <SectionHead>LANDMARKS</SectionHead>
      <div style={{ fontSize: '.56rem', color: 'rgba(0,255,65,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        Key sites across the City and Wasteland. Approach within range and press [E] to enter. Some are locked. Some cost credits. Some are owned by other operatives.
      </div>
      <Divider />
      <div style={{ fontSize: '.44rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── MINX CITY ──</div>
      {[
        { name: 'SHADOW TOWER',     col: '#cc44ff', effect: 'Story hub. Floors 1–39 open. Use PABLO device from inside.',        secret: 'Wrong passcode = lockout. Choose wisely.' },
        { name: 'CITY CLINIC',      col: '#00ff41', effect: 'HP restore. First aid. Free once per session.',                     secret: 'The only place that patches up everyone equally.' },
        { name: 'IRON TRUST BANK', col: '#00ff41', effect: 'Salary deposit. View balance. Transfer credits.',                   secret: 'Bank fees are the corp\'s favorite revenue stream.' },
        { name: 'HOTEL NEON',      col: '#00ff41', effect: '+40 HP · +30 Energy. Rest fully.',                                  secret: 'Room keys glow in the dark.' },
        { name: 'PIXEL ARCADE',    col: '#00ff41', effect: '+20 Energy. One machine still running: NEON DRIFT.',                    secret: 'Free play. Coin slot taped over since the collapse.' },
        { name: 'VENDING MACHINE', col: '#00ff41', effect: '+30 Hunger · +30 Thirst. Vending machine near city wall.',          secret: 'Brand: PABLO FRESH. Ingredients unknown.' },
        { name: 'SAVE POINT',      col: '#aaffff', effect: 'Full restore: HP, Hunger, Thirst, Energy. Cures POISON. Saves progress to device.', secret: '"Brave the darkness, warrior." — inscription, provenance unknown.' },
        { name: 'PABLO STORE',     col: '#cc44ff', effect: 'Buy PABLO devices. Obtain OPERATOR CLEARANCE ($4–6/mo, 7-day trial). Access augmentation modules.',      secret: 'CIVILIAN ACCESS is monitored. PABLO notes who hasn\'t upgraded.' },
      ].map(b => (
        <div key={b.name} style={{ display: 'flex', borderBottom: '1px solid rgba(0,255,65,.06)', padding: '.35rem 0', gap: '.75rem', alignItems: 'flex-start' }}>
          <div style={{ ...VT, fontSize: '.9rem', color: b.col, minWidth: 120, flexShrink: 0 }}>{b.name}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.52rem', color: 'rgba(0,255,65,.65)', lineHeight: 1.7 }}>{b.effect}</div>
            <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.28)', lineHeight: 1.5, fontStyle: 'italic' }}>{b.secret}</div>
          </div>
        </div>
      ))}
      <Divider />
      <div style={{ fontSize: '.44rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', margin: '.4rem 0' }}>── WASTELAND ──</div>
      {[
        { name: 'BUNKER-09',    col: '#88ff44', effect: 'Lore only. "WW-87 / INSERT COIN." Terminal shows: GAME OVER.', secret: 'Nobody has inserted a coin in years.' },
        { name: 'SCRAP YARD',   col: '#88ff44', effect: '+ƒ20 salary. PCB labeled \'87 found.',                         secret: 'Worth more than a full day\'s work at a corp.' },
        { name: 'PIRATE RADIO', col: '#88ff44', effect: 'Lore. Signal broadcasts on a loop. Someone out there is still transmitting.', secret: '"The signal never stops. Neither does the wasteland."' },
        { name: 'OXIDE LABS',   col: '#88ff44', effect: '+ƒ50 salary. Blueprints everywhere. Abandoned.',               secret: '"The prototypes were the first to fall. The corp bought them all."' },
      ].map(b => (
        <div key={b.name} style={{ display: 'flex', borderBottom: '1px solid rgba(0,255,65,.06)', padding: '.35rem 0', gap: '.75rem', alignItems: 'flex-start' }}>
          <div style={{ ...VT, fontSize: '.9rem', color: b.col, minWidth: 120, flexShrink: 0 }}>{b.name}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.52rem', color: 'rgba(0,255,65,.65)', lineHeight: 1.7 }}>{b.effect}</div>
            <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.28)', lineHeight: 1.5, fontStyle: 'italic' }}>{b.secret}</div>
          </div>
        </div>
      ))}
      <Divider />
      <Row label="BUILDING LOCKS" val="Any operative can lock a building with a passcode. Locked buildings show 🔒 and show owner name + company. Only the password holder can enter." col="#ff8800" />
    </div>
  );

  if (section === 'terminals') return (
    <div style={S}>
      <SectionHead>TERMINALS & DEVICES</SectionHead>
      <div style={{ fontSize: '.56rem', color: 'rgba(0,255,65,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        PABLO AI is free on every terminal — no purchase required. Terminals are your link to the PABLO CORP. network: AI chat, productivity tools, status reports, and intel. Access them through a personal device or any public terminal in the world.
      </div>
      <Divider />
      <SectionHead>PERSONAL DEVICE</SectionHead>
      <Row label="AVAILABILITY" val="Suits start with a personal handheld device. Outlaws and Replicants must find or purchase one." col="#33ffaa" />
      <Row label="ACCESS" val="Press [P] to open your personal device. Full PABLO AI access, status, intel, and chat." col="#00ff41" />
      <Row label="BREAKAGE" val="Combat damage can break your device (4% chance per hit, durability loss). When broken, the screen cracks and you lose personal terminal access." col="#ff4444" />
      <Row label="REPAIR" val="Visit CITY CLINIC (ƒ5,000 FIAT) or purchase a DEVICE REPAIR KIT from the VENDING MACHINE (ƒ5,000 FIAT). Full heal at CITY CLINIC (ƒ10,000) includes device repair." col="#ffcc00" />
      <Divider />
      <SectionHead>PUBLIC TERMINALS</SectionHead>
      <div style={{ fontSize: '.56rem', color: 'rgba(0,255,65,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        Public terminals are physical objects in the game world. Walk up and press [E] to access. PABLO AI is free on all of them. Use these when your personal device is broken, missing, or if you never had one.
      </div>
      <div style={{ fontSize: '.44rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── CITY PAYPHONES & KIOSKS ──</div>
      {[
        { name: 'WEST PAYPHONE',    loc: 'Western Minx City, near Metro West',       col: '#33ffaa' },
        { name: 'CENTRAL KIOSK',    loc: 'Central city, near Hotel Famicom',          col: '#33ffaa' },
        { name: 'EAST PAYPHONE',    loc: 'East district, near Print Shop',            col: '#33ffaa' },
        { name: 'NEON KIOSK',       loc: 'Near Club Neon, east side',                 col: '#33ffaa' },
        { name: 'NORTH PAYPHONE',   loc: 'North quarter, near North Gate',            col: '#33ffaa' },
      ].map(t => (
        <Row key={t.name} label={t.name} val={t.loc} col={t.col} />
      ))}
      <Divider />
      <div style={{ fontSize: '.44rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── OUTPOST TERMINALS ──</div>
      <Row label="OUTPOST ALPHA" val="Wasteland outpost terminal. Free PABLO AI access." col="#88ff44" />
      <Row label="OUTPOST BETA" val="Wasteland outpost terminal. Free PABLO AI access." col="#88ff44" />
      <Divider />
      <div style={{ fontSize: '.44rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── TERMINAL VANS ──</div>
      <div style={{ fontSize: '.56rem', color: 'rgba(0,255,65,.45)', lineHeight: 1.9, marginBottom: '.5rem' }}>
        Armored vans parked in the wasteland. Each contains a working terminal and a cot for rest. Energy +15 on entry.
      </div>
      <Row label="WEST VAN" val="Western wasteland, south of Iron Rats territory." col="#88ff44" />
      <Row label="CENTRAL VAN" val="Deep wasteland, near Terminus Shelter." col="#88ff44" />
      <Row label="EAST VAN" val="Eastern wasteland, near Deep Camp." col="#88ff44" />
      <Divider />
      <div style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.08em', lineHeight: 1.8, fontStyle: 'italic', marginTop: '.4rem' }}>
        PABLO AI is a service of PABLO CORP. All transmissions are logged. All terminals are monitored.
      </div>
    </div>
  );

  if (section === 'controls') return (
    <div style={S}>
      <SectionHead>CONTROLS</SectionHead>
      <Divider />
      <div style={{ fontSize: '.44rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── MOVEMENT ──</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem .75rem' }}>
        {[
          ['WASD / ARROWS', 'Move operative'],
          ['SHIFT + MOVE', 'Sprint (1.6× speed)'],
          ['E', 'Enter building / Talk / Use terminal / Loot'],
          ['F / SPACE', 'Melee attack (72px range)'],
          ['CLICK', 'Ranged attack (requires ranged weapon)'],
        ].map(([key, desc]) => (
          <div key={key} style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', padding: '.3rem 0', borderBottom: '1px solid rgba(0,255,65,.06)' }}>
            <div style={{ ...VT, fontSize: '1rem', color: '#cc88ff', letterSpacing: '.08em', minWidth: 110, flexShrink: 0 }}>{key}</div>
            <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.6)', lineHeight: 1.7 }}>{desc}</div>
          </div>
        ))}
      </div>
      <Divider />
      <div style={{ fontSize: '.44rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── TERMINAL & DEVICE ──</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem .75rem' }}>
        {[
          ['P', 'Open PABLO device (personal terminal)'],
          ['E at KIOSK', 'Access public terminal (payphones, kiosks, vans)'],
          ['ESC', 'Close any open panel or dialog'],
          ['SPACE / ENTER', 'Advance dialog text'],
        ].map(([key, desc]) => (
          <div key={key} style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', padding: '.3rem 0', borderBottom: '1px solid rgba(0,255,65,.06)' }}>
            <div style={{ ...VT, fontSize: '1rem', color: '#cc88ff', letterSpacing: '.08em', minWidth: 110, flexShrink: 0 }}>{key}</div>
            <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.6)', lineHeight: 1.7 }}>{desc}</div>
          </div>
        ))}
      </div>
      <Divider />
      <div style={{ fontSize: '.44rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── MAP & NAVIGATION ──</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem .75rem' }}>
        {[
          ['M', 'Toggle world map overlay'],
          ['SCROLL WHEEL', 'Zoom in / out (0.8× – 2.5×)'],
          ['R', 'Toggle radio (near radio buildings)'],
        ].map(([key, desc]) => (
          <div key={key} style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', padding: '.3rem 0', borderBottom: '1px solid rgba(0,255,65,.06)' }}>
            <div style={{ ...VT, fontSize: '1rem', color: '#cc88ff', letterSpacing: '.08em', minWidth: 110, flexShrink: 0 }}>{key}</div>
            <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.6)', lineHeight: 1.7 }}>{desc}</div>
          </div>
        ))}
      </div>
      <Divider />
      <div style={{ fontSize: '.44rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── SOCIAL & BUSINESS ──</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem .75rem' }}>
        {[
          ['C', 'Open world chat'],
          ['V', 'Toggle voice (mic)'],
          ['E at BANK', 'Deposit salary / view balance / transfer credits'],
          ['E at STORE', 'Browse inventory / buy items / sell cargo'],
          ['E at EXCHANGE', 'Trade commodities (buy low, sell high)'],
        ].map(([key, desc]) => (
          <div key={key} style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', padding: '.3rem 0', borderBottom: '1px solid rgba(0,255,65,.06)' }}>
            <div style={{ ...VT, fontSize: '1rem', color: '#cc88ff', letterSpacing: '.08em', minWidth: 110, flexShrink: 0 }}>{key}</div>
            <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.6)', lineHeight: 1.7 }}>{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return null;
}

export default function WorldMenu() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated, login } = useAuth();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<'enter' | 'guide'>('enter');
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
  const [bizType, setBizType] = useState<'fictitious' | 'real' | 'unemployed'>('fictitious');
  const [company, setCompany] = useState('');
  const [industry, setIndustry] = useState('SOFTWARE / SAAS');
  const [fictitiousCompany, setFictitiousCompany] = useState('');
  const [fictitiousError, setFictitiousError] = useState('');
  const [bizSize, setBizSize] = useState('SOLO OPERATOR');
  const [bizEmail, setBizEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkingName, setCheckingName] = useState(false);

  const [autoResumed, setAutoResumed] = useState(false);
  const [showCinematic, setShowCinematic] = useState(false);
  const [cinematicLine, setCinematicLine] = useState(0);
  const [showEntryButtons, setShowEntryButtons] = useState(true);
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
      const res = await fetch('/api/salaryman/saves', { credentials: 'include' });
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
    const char = {
      name: save.charName,
      class: save.charClass,
      company: str('company') ?? save.charName + ' OPS',
      sx: num('px') ?? 5555,
      sy: num('py') ?? 5620,
      salary: save.salary,
      hasBusiness: bool('hasBusiness'),
      bizType: str('bizType') ?? (bool('hasBusiness') ? 'fictitious' : 'unemployed'),
      workstation: str('workstation'),
      workstationLabel: str('workstationLabel'),
      workstationSlot: num('workstationSlot') ?? null,
      bizRegisteredAt: str('bizRegisteredAt'),
      _savedState: save.data,
    };
    localStorage.setItem('sm_char', JSON.stringify(char));
    localStorage.setItem('sm_slot', String(save.slotIndex));
    setShowWelcomeDialog(true);
  };

  // ── Delete a save ───────────────────────────────────────────────────────────
  const handleDelete = async (slot: number) => {
    try {
      await fetch(`/api/salaryman/saves/${slot}`, { method: 'DELETE', credentials: 'include' });
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
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws?name=_probe&class=corporate&x=0&y=0`);
    let done = false;
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'player_list' && !done) { done = true; setPlayers(m.players.length); ws.close(); }
        if (m.type === 'server_full' && !done) { done = true; setPlayers(-1); ws.close(); }
      } catch { /* ignore */ }
    };
    ws.onerror = () => ws.close();
    const timeout = setTimeout(() => { if (!done) ws.close(); }, 3000);
    return () => { clearTimeout(timeout); ws.close(); };
  }, []);

  const selected = CLASSES.find(c => c.id === cls)!;

  const handleProceed = () => {
    const n = name.trim().toUpperCase();
    if (!n) return;
    if (n === 'SENIOR PABLO' || n === 'SENIORPABLO' || n.replace(/\s+/g,'') === 'SENIORPABLO') {
      setNameError('RESERVED — That name is restricted by PABLO CORP. Choose another.');
      return;
    }
    setNameError('');
    setStep(2);
  };

  const handleEnterWorld = async () => {
    if (bizType === 'fictitious') {
      const trimmed = fictitiousCompany.trim().toUpperCase();
      if (!trimmed) {
        setFictitiousError('COMPANY NAME REQUIRED — Invent a front corporation.');
        return;
      }
      setCheckingName(true);
      setFictitiousError('');
      try {
        const resp = await fetch(`/api/world/check-company?name=${encodeURIComponent(trimmed)}`, { credentials: 'include' });
        if (resp.ok) {
          const data = await resp.json();
          if (data.taken) {
            setFictitiousError('NAME TAKEN — Another operative already registered this front. Choose a different name.');
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
      : bizType === 'fictitious' && fictitiousCompany.trim()
        ? fictitiousCompany.trim().toUpperCase()
        : bizType === 'unemployed'
          ? null
          : name.trim().toUpperCase() + ' OPS';
    const ws = hasBusiness ? getWorkstation(bizType === 'real' ? 'real' : 'fictitious', industry, fictitiousCompany.trim().toUpperCase() || 'UNKNOWN') : null;
    const startSalary = cls === 'corporate' ? 25000 : cls === 'replicant' ? 18000 : cls === 'outlaw' ? 10000 : 15000;
    const spawnPos = cls === 'outlaw' ? { x: 4000, y: 8300 } : cls === 'replicant' ? { x: 2600, y: 9050 } : { x: 5555, y: 5620 };
    const char = {
      name: name.trim().toUpperCase(),
      class: cls,
      company: finalCompany ?? 'UNAFFILIATED',
      sx: spawnPos.x,
      sy: spawnPos.y,
      salary: startSalary,
      hasBusiness,
      bizType: bizType,
      workstation: ws?.bid ?? null,
      workstationLabel: ws?.label ?? null,
      workstationSlot: ws?.slot ?? null,
      bizRegisteredAt: hasBusiness ? Date.now() : null,
    };
    localStorage.setItem('sm_char', JSON.stringify(char));
    localStorage.setItem('sm_slot', String(selectedSlot));
    try {
      const registerResp = await fetch('/api/world/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          playerName: char.name,
          businessType: bizType,
          companyName: finalCompany,
          industry: bizType === 'real' ? industry : null,
          companySize: bizType === 'real' ? bizSize : null,
          contactEmail: bizType === 'real' && bizEmail.trim() ? bizEmail.trim() : null,
          isPaid: false,
        }),
      });
      if (registerResp.status === 409 && bizType === 'fictitious') {
        setFictitiousError('NAME TAKEN — Another operative already registered this front. Choose a different name.');
        setSubmitting(false);
        return;
      }
    } catch { /* ignore */ }
    if (isAuthenticated) {
      try {
        await fetch(`/api/salaryman/saves/${selectedSlot}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            charName: char.name,
            charClass: char.class,
            level: 1,
            salary: startSalary,
            lastZone: 'MINX CITY',
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
      <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.15) 2px,rgba(0,0,0,.15) 4px)', pointerEvents: 'none', zIndex: 99 }} />
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,255,65,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,65,.025) 1px, transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none', zIndex: 0 }} />

      {/* Top bar */}
      <div style={{ position: 'relative', zIndex: 1, padding: '.4rem 1.5rem', borderBottom: '1px solid rgba(0,255,65,.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '.6rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.14em', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          PABLO CORP. / SALARYMAN OS v1.0 &nbsp;·&nbsp;
          <select
            value={selectedTimezone}
            onChange={e => setSelectedTimezone(e.target.value)}
            style={{ background: 'rgba(0,8,0,.95)', border: '1px solid rgba(0,255,65,.25)', color: '#00ff41', fontFamily: "'Share Tech Mono',monospace", fontSize: '.6rem', letterSpacing: '.1em', padding: '2px 6px', cursor: 'pointer', outline: 'none' }}
          >
            {TIMEZONE_OPTIONS.map(tz => (
              <option key={tz.id} value={tz.id} style={{ background: '#030803', color: '#00ff41' }}>
                {tz.label}
              </option>
            ))}
          </select>
        </span>
        <span style={{ fontSize: '.5rem', color: players === -1 ? 'rgba(255,80,80,.6)' : 'rgba(0,255,65,.2)', letterSpacing: '.1em' }}>
          {players === -1 ? 'SERVER FULL — MAX 50' : players !== null ? `${players}/50 ONLINE` : 'CONNECTING...'}
          {tick % 2 === 0 ? ' ▮' : ' ▯'}
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem 1rem 2rem', position: 'relative', zIndex: 1 }}>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ ...VT, fontSize: 'clamp(2.5rem, 7vw, 5rem)', color: '#00ff41', textShadow: '0 0 30px rgba(0,255,65,.4)', letterSpacing: '.18em', lineHeight: 1 }}>SALARYMAN</div>
          <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.2em', marginTop: '.4rem', ...VT }}>BY PICASSOO.AI — PABLO CORP. WORLD</div>
          <div style={{ marginTop: '.5rem', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(0,255,65,.3), transparent)' }} />
          <div style={{ marginTop: '.3rem', fontSize: '.6rem', color: 'rgba(255,200,60,.35)', letterSpacing: '.12em', ...VT }}>⚠ PABLO CORP. IMMIGRATION INTERFACE v1.0</div>
          <div style={{ marginTop: '.4rem', fontSize: '.6rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.1em', minHeight: '1.2em' }}>{FLAVOR[flavorIdx]}</div>
        </div>

        {/* ── TAB BAR ── */}
        <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem', border: '1px solid rgba(0,255,65,.18)', overflow: 'hidden' }}>
          {([['enter', 'IMMIGRATION'], ['guide', 'FIELD GUIDE']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: '.55rem 1.8rem',
                background: tab === id ? 'rgba(0,255,65,.1)' : 'transparent',
                border: 'none',
                borderRight: id === 'enter' ? '1px solid rgba(0,255,65,.18)' : 'none',
                color: tab === id ? '#00ff41' : 'rgba(0,255,65,.3)',
                ...VT,
                fontSize: '1.2rem',
                letterSpacing: '.14em',
                cursor: 'pointer',
                textShadow: tab === id ? '0 0 10px rgba(0,255,65,.4)' : 'none',
                transition: 'all .12s',
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
                <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.14em', marginBottom: '.2rem' }}>SELECT OPERATION MODE</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
                  {/* WAKE UP — new game (locked on mobile) */}
                  <button
                    onClick={() => {
                      if (isMobile) return;
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
                      background: isMobile ? 'rgba(255,60,60,.04)' : 'rgba(0,255,65,.06)',
                      border: `1px solid ${isMobile ? 'rgba(255,60,60,.25)' : 'rgba(0,255,65,.5)'}`,
                      color: isMobile ? 'rgba(255,60,60,.4)' : '#00ff41',
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
                    <div style={{ fontSize: '.48rem', color: isMobile ? 'rgba(255,60,60,.3)' : 'rgba(0,255,65,.45)', lineHeight: 1.7 }}>
                      {isMobile ? 'This mode requires a desktop browser. Use GO TO WORK on mobile.' : 'Fresh start. New story. Build your way up from nothing.'}
                    </div>
                  </button>

                  {/* MULTI-PLAYER MODE — returning player with save */}
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
                      border: `1px solid ${(isAuthenticated && cloudSaves.length > 0) ? 'rgba(0,180,255,.5)' : !isAuthenticated ? 'rgba(255,200,50,.3)' : 'rgba(0,255,65,.15)'}`,
                      color: (isAuthenticated && cloudSaves.length > 0) ? '#33aaff' : !isAuthenticated ? 'rgba(255,200,50,.6)' : 'rgba(0,255,65,.2)',
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
                      if (bType === 'fictitious' || latest.hasBusiness) return "YOU'RE LATE TO WORK";
                      return 'FIND A JOB';
                    })()}</div>
                    <div style={{ fontSize: '.48rem', color: (isAuthenticated && cloudSaves.length > 0) ? 'rgba(0,180,255,.45)' : !isAuthenticated ? 'rgba(255,200,50,.35)' : 'rgba(0,255,65,.15)', lineHeight: 1.7 }}>
                      {isAuthenticated && cloudSaves.length > 0
                        ? (() => {
                          const latest = cloudSaves[0]?.data as Record<string, unknown> | undefined;
                          const bType = latest?.bizType as string | undefined;
                          if (bType === 'real') return `${cloudSaves.length} save${cloudSaves.length !== 1 ? 's' : ''} on file. The corner office is waiting.`;
                          if (bType === 'fictitious' || latest?.hasBusiness) return `${cloudSaves.length} save${cloudSaves.length !== 1 ? 's' : ''} on file. Clock's ticking.`;
                          return `${cloudSaves.length} save${cloudSaves.length !== 1 ? 's' : ''} on file. The city doesn't wait.`;
                        })()
                        : !isAuthenticated ? 'Sign in to access your saves.' : 'No saves found. Start a new story first.'}
                    </div>
                  </button>

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
                          border: `1px solid ${canResurrect ? 'rgba(255,60,60,.5)' : 'rgba(0,255,65,.1)'}`,
                          color: canResurrect ? '#ff6666' : 'rgba(0,255,65,.15)',
                          cursor: canResurrect ? 'pointer' : 'default',
                          textAlign: 'left', fontFamily: 'inherit', transition: 'all .15s',
                        }}
                      >
                        <div style={{ ...VT, fontSize: '1.6rem', letterSpacing: '.15em', marginBottom: '.3rem' }}>RESURRECT</div>
                        <div style={{ fontSize: '.48rem', color: canResurrect ? 'rgba(255,80,80,.45)' : 'rgba(0,255,65,.12)', lineHeight: 1.7 }}>
                          {canResurrect ? 'You died. DR. WRIGHT patched you up. Return to your last position.'
                           : diedLastSession && !isAuthenticated ? 'You died — sign in to resurrect your operative.'
                           : diedLastSession ? 'You died — no save data found. Start a new story.'
                           : 'No death recorded. Operative status: ALIVE.'}
                        </div>
                      </button>
                    );
                  })()}

                  {/* STORY MODE — grayed out */}
                  <div
                    style={{
                      padding: '1.2rem 1rem', background: 'transparent',
                      border: '1px solid rgba(0,255,65,.08)',
                      color: 'rgba(0,255,65,.12)',
                      textAlign: 'left', fontFamily: 'inherit', position: 'relative',
                    }}
                  >
                    <div style={{ ...VT, fontSize: '1.6rem', letterSpacing: '.15em', marginBottom: '.3rem', opacity: .4 }}>STORY MODE</div>
                    <div style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.1)', lineHeight: 1.7 }}>
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
                <div style={{ width: '100%', background: 'rgba(0,0,0,.8)', border: '1px solid rgba(0,255,65,.25)', padding: '2rem 1.5rem', textAlign: 'center' }}>
                  {[
                    '...',
                    '> ALARM CLOCK: 06:00 AM',
                    '> The screen on your nightstand buzzes.',
                    '> "WAKE UP — YOU\'RE LATE FOR WORK."',
                    '> You open your eyes. Neon bleeds through the blinds.',
                    '> Minx City is already running. It never stopped.',
                    '> PABLO CORP. notification: "Your shift started 3 hours ago."',
                    '> "CLOCK IN OR GET WRITTEN UP."',
                    '> You pull yourself together. The city waits for no one.',
                    '> ...',
                    '> PABLO CORP. TERMINAL ACCESS GRANTED.',
                  ].slice(0, cinematicLine + 1).map((line, i) => (
                    <div key={i} style={{
                      ...VT, fontSize: '1.1rem',
                      color: i === cinematicLine ? '#00ff41' : 'rgba(0,255,65,.35)',
                      letterSpacing: '.08em', lineHeight: 2.2,
                      textShadow: i === cinematicLine ? '0 0 12px rgba(0,255,65,.4)' : 'none',
                      transition: 'color .3s',
                    }}>{line}</div>
                  ))}
                </div>
                {cinematicLine < 10 ? (
                  <button
                    onClick={() => setCinematicLine(l => l + 1)}
                    style={{
                      padding: '.55rem 2rem', background: 'rgba(0,255,65,.08)',
                      border: '1px solid rgba(0,255,65,.4)', color: '#00ff41',
                      ...VT, fontSize: '1.1rem', letterSpacing: '.14em', cursor: 'pointer',
                    }}
                  >
                    {tick % 2 === 0 ? '▶' : '▷'} CONTINUE
                  </button>
                ) : (
                  <button
                    onClick={() => { localStorage.setItem('sm_cinematic_seen', '1'); setShowCinematic(false); setScreen('new'); setStep(1); }}
                    style={{
                      padding: '.7rem 2.5rem', background: 'rgba(0,255,65,.12)',
                      border: '1px solid rgba(0,255,65,.7)', color: '#00ff41',
                      ...VT, fontSize: '1.4rem', letterSpacing: '.18em', cursor: 'pointer',
                      textShadow: '0 0 12px rgba(0,255,65,.5)',
                    }}
                  >
                    WHO ARE YOU {tick % 2 === 0 ? '▶' : '▷'}
                  </button>
                )}
                <button
                  onClick={() => { localStorage.setItem('sm_cinematic_seen', '1'); setShowCinematic(false); setScreen('new'); setStep(1); }}
                  style={{ background: 'none', border: 'none', color: 'rgba(0,255,65,.2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.42rem', letterSpacing: '.1em' }}
                >
                  SKIP INTRO →
                </button>
              </div>
            )}

            {/* ── SAVE SLOT MANAGER (logged-in users only) ─────────────────── */}
            {isAuthenticated && screen === 'saves' && !showCinematic && !showEntryButtons && (
              <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

                {/* Header */}
                <div style={{ borderBottom: '1px solid rgba(0,255,65,.12)', paddingBottom: '.7rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <button onClick={() => setShowEntryButtons(true)} style={{ background: 'none', border: 'none', color: 'rgba(0,255,65,.3)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.5rem', letterSpacing: '.1em', padding: 0, marginBottom: '.3rem', display: 'block' }}>← BACK TO IMMIGRATION</button>
                    <div style={{ ...VT, fontSize: '1.6rem', color: '#00ff41', letterSpacing: '.15em' }}>SAVE FILES</div>
                    <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.12em', marginTop: '.2rem' }}>
                      {user?.firstName ? `OPERATIVE: ${(user.firstName + (user.lastName ? ` ${user.lastName}` : '')).toUpperCase()}` : 'SIGNED IN'} · UP TO 4 STORY SLOTS
                    </div>
                  </div>
                  {savesLoading && <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.1em' }}>SYNCING ▮</div>}
                </div>

                {!atPhysicalTerminal && (
                  <div style={{ fontSize: '.4rem', color: 'rgba(255,200,50,.4)', letterSpacing: '.1em', marginBottom: '.2rem', padding: '.4rem .6rem', border: '1px solid rgba(255,200,50,.15)', background: 'rgba(255,200,50,.03)' }}>
                    DEVICE ACCESS ONLY — VISIT A PUBLIC TERMINAL TO MANAGE ADDITIONAL SAVE SLOTS
                  </div>
                )}

                {/* 4 save slots */}
                {[0, 1, 2, 3].map(slot => {
                  const save = cloudSaves.find(s => s.slotIndex === slot);
                  const col = save ? CLASS_COLOR[save.charClass] ?? '#00ff41' : 'rgba(0,255,65,.2)';
                  const isConfirming = deleteConfirm === slot;
                  const slotLocked = slot > 0 && !atPhysicalTerminal;

                  return (
                    <div key={slot} style={{ border: `1px solid ${save ? col + '33' : 'rgba(0,255,65,.1)'}`, background: save ? 'rgba(0,0,0,.6)' : 'rgba(0,0,0,.3)', transition: 'border-color .2s', opacity: slotLocked ? 0.35 : 1, pointerEvents: slotLocked ? 'none' : 'auto' }}>
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
                              <div style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.08em' }}>{fmtTime(save.lastSavedAt)}</div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.4rem' }}>
                              {[
                                { l: 'CLASS', v: save.charClass.toUpperCase() },
                                { l: 'LEVEL', v: String(save.level) },
                                { l: 'FIAT', v: `ƒ${save.salary.toLocaleString()}` },
                                { l: 'ZONE', v: save.lastZone },
                              ].map(({ l, v }) => (
                                <div key={l} style={{ borderLeft: `2px solid ${col}44`, paddingLeft: '.5rem' }}>
                                  <div style={{ fontSize: '.36rem', color: 'rgba(0,255,65,.22)', letterSpacing: '.1em' }}>{l}</div>
                                  <div style={{ fontSize: '.55rem', color: col, letterSpacing: '.04em', marginTop: '.1rem' }}>{v}</div>
                                </div>
                              ))}
                            </div>
                            <div style={{ fontSize: '.38rem', color: 'rgba(0,255,65,.18)', letterSpacing: '.08em' }}>
                              PLAYTIME: {fmtPlaytime(save.playtime)}
                            </div>
                          </div>

                          {/* Actions */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', padding: '.8rem', justifyContent: 'center', borderLeft: `1px solid ${col}18`, flexShrink: 0 }}>
                            {isConfirming ? (
                              <>
                                <div style={{ fontSize: '.4rem', color: 'rgba(255,100,100,.7)', letterSpacing: '.06em', textAlign: 'center', marginBottom: '.2rem' }}>ERASE?</div>
                                <button onClick={() => handleDelete(slot)} style={{ padding: '.4rem .8rem', background: 'rgba(255,40,40,.12)', border: '1px solid rgba(255,60,60,.5)', color: '#ff6666', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.65rem', letterSpacing: '.08em' }}>CONFIRM</button>
                                <button onClick={() => setDeleteConfirm(null)} style={{ padding: '.4rem .8rem', background: 'transparent', border: '1px solid rgba(0,255,65,.2)', color: 'rgba(0,255,65,.4)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.65rem', letterSpacing: '.08em' }}>CANCEL</button>
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
                          <div style={{ width: 80, height: 60, border: '1px dashed rgba(0,255,65,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <div style={{ fontSize: '1.5rem', color: 'rgba(0,255,65,.15)' }}>+</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.18)', letterSpacing: '.14em', marginBottom: '.3rem' }}>SLOT {slot + 1} — EMPTY</div>
                            <div style={{ ...VT, fontSize: '1.1rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.1em' }}>START NEW STORY</div>
                            <div style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.15)', marginTop: '.2rem', letterSpacing: '.06em' }}>Choose your class · Build your legend</div>
                          </div>
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Guest note */}
                <div style={{ borderTop: '1px solid rgba(0,255,65,.06)', paddingTop: '.65rem', fontSize: '.42rem', color: 'rgba(0,255,65,.15)', letterSpacing: '.06em', lineHeight: 1.7 }}>
                  Saves are tied to your account and sync across devices. Progress is preserved per story slot. Each slot is a separate operative with its own history.
                </div>
              </div>
            )}

            {/* ── NOT LOGGED IN — prompt to sign in for saves ──────────────── */}
            {!authLoading && !isAuthenticated && screen === 'saves' && !showEntryButtons && (
              <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ border: '1px solid rgba(0,255,65,.15)', padding: '1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.9rem' }}>
                  <div style={{ ...VT, fontSize: '1.5rem', color: '#00ff41', letterSpacing: '.15em' }}>SAVE YOUR STORY</div>
                  <div style={{ fontSize: '.52rem', color: 'rgba(0,255,65,.45)', lineHeight: 1.8, maxWidth: 440 }}>
                    Sign in to unlock save slots. Your FIAT, level, and operative history are stored to your account — resume any story from any device.
                  </div>
                  <button onClick={login} style={{ padding: '.65rem 2rem', background: 'rgba(0,255,65,.1)', border: '1px solid rgba(0,255,65,.5)', color: '#00ff41', cursor: 'pointer', fontFamily: 'inherit', ...VT, fontSize: '1.2rem', letterSpacing: '.15em', textShadow: '0 0 8px rgba(0,255,65,.4)' }}>
                    SIGN IN TO SAVE
                  </button>
                  <button onClick={() => setScreen('new')} style={{ background: 'none', border: 'none', color: 'rgba(0,255,65,.25)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.45rem', letterSpacing: '.1em' }}>
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
                <button onClick={() => setScreen('saves')} style={{ background: 'none', border: 'none', color: 'rgba(0,255,65,.3)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.45rem', letterSpacing: '.1em', padding: 0 }}>
                  ← BACK TO SAVE FILES
                </button>
                <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', marginTop: '.2rem' }}>NEW STORY — SLOT {selectedSlot + 1}</div>
              </div>
            )}

            {/* ── CHARACTER CREATOR (after guest bypass OR new story selected) ── */}
            {screen === 'new' && step === 1 && (
              <div style={{ width: '100%', maxWidth: 820, display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                  <div style={{ fontSize: '.65rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.15em', marginBottom: '.2rem' }}>SELECT CLASS</div>
                  {CLASSES.map(c => (
                    <button key={c.id} onClick={() => setCls(c.id)} style={{ padding: '.75rem .9rem', border: cls === c.id ? `1px solid ${c.color}` : '1px solid rgba(0,255,65,.15)', background: cls === c.id ? 'rgba(0,255,65,.07)' : 'rgba(0,255,65,.01)', color: cls === c.id ? c.color : 'rgba(0,255,65,.35)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '1rem', transition: 'all .12s', ...S }}>
                      <div style={{ flexShrink: 0, width: 8, height: 8, background: cls === c.id ? c.color : 'rgba(0,255,65,.2)', boxShadow: cls === c.id ? `0 0 8px ${c.color}` : 'none' }} />
                      <div>
                        <div style={{ ...VT, fontSize: '1.1rem', letterSpacing: '.1em', lineHeight: 1 }}>{c.label}</div>
                        <div style={{ fontSize: '.65rem', color: cls === c.id ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.2)', marginTop: '.15rem', letterSpacing: '.06em' }}>{c.tagline}</div>
                      </div>
                    </button>
                  ))}
                </div>

                <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
                  <div style={{ border: `1px solid ${selected.color}44`, background: 'rgba(0,255,65,.04)', padding: '1rem' }}>
                    <div style={{ ...VT, fontSize: '1.4rem', color: selected.color, letterSpacing: '.12em', marginBottom: '.5rem' }}>{selected.label}</div>
                    <div style={{ fontSize: '.72rem', color: 'rgba(0,255,65,.5)', lineHeight: 1.8, marginBottom: '.75rem' }}>{selected.desc}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.4rem', marginBottom: '.5rem' }}>
                      {[['HP', selected.hp], ['ATK', selected.atk], ['DEF', selected.def], ['SALARY', selected.salary], ['NETWORTH', selected.networth], ['START', selected.start]].map(([k, v]) => (
                        <div key={k} style={{ border: '1px solid rgba(0,255,65,.12)', padding: '.4rem .5rem' }}>
                          <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.12em', marginBottom: '.15rem' }}>{k}</div>
                          <div style={{ fontFamily: "'VT323',monospace", fontSize: '.9rem', color: selected.color, letterSpacing: '.08em' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {selected.perks && (
                      <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.35)', letterSpacing: '.07em', borderTop: '1px solid rgba(0,255,65,.1)', paddingTop: '.5rem' }}>
                        ★ {selected.perks}
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: '.65rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.15em', marginBottom: '.35rem' }}>YOUR NAME</div>
                    <input
                      value={name}
                      onChange={e => { setName(e.target.value); setNameError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleProceed()}
                      maxLength={28}
                      placeholder="WHAT'S YOUR NAME"
                      autoFocus
                      style={{ width: '100%', padding: '.65rem .8rem', background: 'rgba(0,8,0,.95)', border: `1px solid ${nameError ? 'rgba(255,60,60,.6)' : name ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.2)'}`, color: '#00ff41', ...S, fontSize: '1rem', letterSpacing: '.1em', outline: 'none', caretColor: '#00ff41', boxSizing: 'border-box' }}
                    />
                    {nameError && (
                      <div style={{ fontSize: '.48rem', color: 'rgba(255,80,80,.8)', letterSpacing: '.08em', marginTop: '.3rem', ...VT }}>⚠ {nameError}</div>
                    )}
                    <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.18)', letterSpacing: '.08em', marginTop: '.25rem' }}>
                      Enter your full name — first and last. Some names are restricted.
                    </div>
                  </div>

                  <button
                    onClick={handleProceed}
                    disabled={!name.trim() || !!nameError}
                    style={{ width: '100%', padding: '.75rem', background: (name.trim() && !nameError) ? 'rgba(0,255,65,.1)' : 'transparent', border: (name.trim() && !nameError) ? '1px solid rgba(0,255,65,.7)' : '1px solid rgba(0,255,65,.1)', color: (name.trim() && !nameError) ? '#00ff41' : 'rgba(0,255,65,.15)', ...VT, fontSize: '1.5rem', letterSpacing: '.2em', cursor: (name.trim() && !nameError) ? 'pointer' : 'default', transition: 'all .15s' }}
                  >
                    NEXT — REGISTER ENTERPRISE {(name.trim() && !nameError) ? (tick % 2 === 0 ? '▶' : '▷') : ''}
                  </button>

                  <div style={{ fontSize: '.6rem', color: 'rgba(0,255,65,.18)', letterSpacing: '.08em', lineHeight: 1.8 }}>
                    WASD — move &nbsp;·&nbsp; E — enter/talk &nbsp;·&nbsp; F — attack &nbsp;·&nbsp; C — chat &nbsp;·&nbsp; V — voice &nbsp;·&nbsp; P — PABLO device
                  </div>
                </div>
              </div>
            )}

            {screen === 'new' && step === 2 && (
              <div style={{ width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: '.9rem' }}>

                {/* Header */}
                <div style={{ border: '1px solid rgba(0,255,65,.2)', background: 'rgba(0,255,65,.03)', padding: '1rem' }}>
                  <div style={{ fontSize: '.65rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.15em', marginBottom: '.4rem' }}>OPERATIONAL REGISTRATION — {name.trim().toUpperCase()}</div>
                  <div style={{ fontSize: '.7rem', color: 'rgba(0,255,65,.4)', lineHeight: 1.9 }}>
                    Are you starting or registering a business in Minx City?
                  </div>
                  <div style={{ fontSize: '.6rem', color: 'rgba(255,200,60,.3)', letterSpacing: '.1em', marginTop: '.5rem', ...VT }}>{tick % 2 === 0 ? '▮' : '▯'} YOUR SHIFT STARTED 3 HOURS AGO — CLOCK IN OR GET WRITTEN UP</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.6rem' }}>
                  {([
                    { id: 'fictitious' as const, label: 'FICTITIOUS FRONT', desc: 'Anonymous. Low profile. No paper trail. Invent your own company name.' },
                    { id: 'real' as const, label: 'REAL ENTERPRISE', desc: 'Real company. Stake territory. Data stored on our servers for paid members. Your brand in-world.' },
                    { id: 'unemployed' as const, label: 'UNEMPLOYED / NO AFFILIATION', desc: 'No company. No cover. You walk Minx City alone. Skip the paperwork.' },
                  ]).map(t => (
                    <button key={t.id} onClick={() => { setBizType(t.id); setFictitiousError(''); }} style={{ padding: '.9rem', border: bizType === t.id ? '1px solid rgba(0,255,65,.7)' : '1px solid rgba(0,255,65,.15)', background: bizType === t.id ? 'rgba(0,255,65,.07)' : 'transparent', color: bizType === t.id ? '#00ff41' : 'rgba(0,255,65,.35)', cursor: 'pointer', textAlign: 'left', ...S, transition: 'all .12s' }}>
                      <div style={{ ...VT, fontSize: '1.1rem', letterSpacing: '.1em', marginBottom: '.25rem' }}>
                        {t.label}
                      </div>
                      <div style={{ fontSize: '.62rem', color: bizType === t.id ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.2)', lineHeight: 1.7 }}>
                        {t.desc}
                      </div>
                    </button>
                  ))}
                </div>

                {bizType === 'fictitious' && (
                  <div style={{ border: '1px solid rgba(0,255,65,.15)', padding: '.85rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                    <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.15em' }}>COVER IDENTITY — NAME YOUR FRONT CORPORATION</div>
                    <div style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.3)', lineHeight: 1.7 }}>
                      Invent a company name. Your operative will be listed under this corporate shell. PABLO Corp. cannot trace it. Rival operatives will see this name above your head.
                    </div>
                    <input
                      value={fictitiousCompany}
                      onChange={e => { setFictitiousCompany(e.target.value); setFictitiousError(''); }}
                      maxLength={60}
                      placeholder="e.g. NEON CAPITAL SOLUTIONS, PHANTOM FREIGHT CO."
                      style={{ width: '100%', padding: '.5rem .7rem', background: 'rgba(0,8,0,.95)', border: `1px solid ${fictitiousError ? 'rgba(255,60,60,.6)' : fictitiousCompany ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.3)'}`, color: '#00ff41', ...S, fontSize: '.85rem', outline: 'none', caretColor: '#00ff41', boxSizing: 'border-box', letterSpacing: '.06em' }}
                    />
                    {fictitiousError && (
                      <div style={{ fontSize: '.48rem', color: 'rgba(255,80,80,.8)', letterSpacing: '.08em', ...VT }}>⚠ {fictitiousError}</div>
                    )}
                  </div>
                )}

                {bizType === 'unemployed' && (
                  <div style={{ border: '1px solid rgba(255,200,60,.2)', background: 'rgba(255,200,60,.04)', padding: '.85rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                    <div style={{ fontSize: '.5rem', color: 'rgba(255,200,60,.4)', letterSpacing: '.15em' }}>NO AFFILIATION</div>
                    <div style={{ fontSize: '.52rem', color: 'rgba(0,255,65,.35)', lineHeight: 1.7 }}>
                      You'll enter Minx City without a corporate shield. No company name above your head. Just you, the streets, and whatever the corp has planned. Your progress and FIAT balance will not be saved between sessions. PABLO CORP. has no record of you — which is either very good or very bad.
                    </div>
                    <div style={{ marginTop: '.5rem', fontSize: '.46rem', color: 'rgba(255,120,120,.3)', lineHeight: 1.7 }}>
                      You can register a business later at PABLO TOWER. Walk in and use the terminal.
                    </div>
                  </div>
                )}

                {bizType === 'real' && (
                  <div style={{ border: '1px solid rgba(0,255,65,.2)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '.65rem' }}>
                    <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.15em' }}>COMPANY PEDIGREE</div>
                    <div>
                      <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.12em', marginBottom: '.25rem' }}>COMPANY NAME</div>
                      <input value={company} onChange={e => setCompany(e.target.value)} maxLength={60} placeholder="YOUR COMPANY NAME..." style={{ width: '100%', padding: '.5rem .7rem', background: 'rgba(0,8,0,.95)', border: '1px solid rgba(0,255,65,.3)', color: '#00ff41', ...S, fontSize: '.85rem', outline: 'none', caretColor: '#00ff41', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
                      <div>
                        <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.12em', marginBottom: '.25rem' }}>INDUSTRY</div>
                        <select value={industry} onChange={e => setIndustry(e.target.value)} style={{ width: '100%', padding: '.5rem .7rem', background: 'rgba(0,8,0,.95)', border: '1px solid rgba(0,255,65,.3)', color: '#00ff41', ...S, fontSize: '.82rem', outline: 'none', cursor: 'pointer' }}>
                          {REAL_INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.12em', marginBottom: '.25rem' }}>COMPANY SIZE</div>
                        <select value={bizSize} onChange={e => setBizSize(e.target.value)} style={{ width: '100%', padding: '.5rem .7rem', background: 'rgba(0,8,0,.95)', border: '1px solid rgba(0,255,65,.3)', color: '#00ff41', ...S, fontSize: '.82rem', outline: 'none', cursor: 'pointer' }}>
                          {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.12em', marginBottom: '.25rem' }}>CONTACT EMAIL <span style={{ color: 'rgba(0,255,65,.15)' }}>(OPTIONAL)</span></div>
                      <input value={bizEmail} onChange={e => setBizEmail(e.target.value)} type="email" maxLength={100} placeholder="contact@yourcompany.com" style={{ width: '100%', padding: '.5rem .7rem', background: 'rgba(0,8,0,.95)', border: '1px solid rgba(0,255,65,.3)', color: '#00ff41', ...S, fontSize: '.85rem', outline: 'none', caretColor: '#00ff41', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                )}

                {bizType !== 'unemployed' && (() => {
                  const ws = getWorkstation(bizType === 'real' ? 'real' : 'fictitious', industry, fictitiousCompany.trim().toUpperCase() || 'UNKNOWN');
                  return (
                    <div style={{ border: '1px solid rgba(0,255,65,.3)', background: 'rgba(0,255,65,.04)', padding: '.85rem' }}>
                      <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.14em', marginBottom: '.4rem' }}>WORKSTATION ASSIGNMENT</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.3rem' }}>
                        <div>
                          <div style={{ ...VT, fontSize: '1.15rem', color: '#00ff41', letterSpacing: '.1em' }}>{ws.label}</div>
                          <div style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.5)', letterSpacing: '.07em', marginTop: '.08rem' }}>{ws.slot}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ ...VT, fontSize: '1.1rem', color: '#00ff41' }}>FREE</div>
                          <div style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.3)', marginTop: '.05rem' }}>ƒ500/rest after day 7</div>
                        </div>
                      </div>
                      <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.25)', lineHeight: 1.6, borderTop: '1px solid rgba(0,255,65,.1)', paddingTop: '.3rem' }}>
                        The city assigns every registered operator a bed, desk and terminal at no cost. First 7 days are free. After that ƒ500 per rest — the lowest rate in Minx City.
                      </div>
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', gap: '.6rem' }}>
                  <button onClick={() => setStep(1)} style={{ padding: '.65rem 1.2rem', background: 'transparent', border: '1px solid rgba(0,255,65,.2)', color: 'rgba(0,255,65,.4)', ...VT, fontSize: '1rem', letterSpacing: '.1em', cursor: 'pointer' }}>← BACK</button>
                  <button
                    onClick={handleEnterWorld}
                    disabled={submitting || checkingName}
                    style={{ flex: 1, padding: '.75rem', background: 'rgba(0,255,65,.1)', border: '1px solid rgba(0,255,65,.7)', color: '#00ff41', ...VT, fontSize: '1.5rem', letterSpacing: '.2em', cursor: (submitting || checkingName) ? 'wait' : 'pointer', textShadow: '0 0 12px rgba(0,255,65,.4)' }}
                  >
                    {submitting ? 'REGISTERING...' : checkingName ? 'VERIFYING NAME...' : `START ${tick % 2 === 0 ? '▶' : '▷'}`}
                  </button>
                </div>

                <div style={{ fontSize: '.46rem', color: 'rgba(0,255,65,.15)', lineHeight: 1.8 }}>
                  {bizType === 'unemployed'
                    ? 'Session-local only. No rent. No commitment. You can register later at PABLO TOWER.'
                    : 'Business data stored persistently for paid subscribers. Free workstation available immediately on entry.'}
                </div>
                <div style={{ fontSize: '.44rem', color: 'rgba(255,200,60,.2)', letterSpacing: '.1em', textAlign: 'center', ...VT }}>— HURRY UP, OPERATIVE. MINX CITY DOESN'T WAIT. —</div>
              </div>
            )}
          </>
        )}

        {/* ── TAB: FIELD GUIDE ── */}
        {tab === 'guide' && (
          <div style={{ width: '100%', maxWidth: 960, display: 'flex', gap: '1.2rem', alignItems: 'flex-start' }}>

            {/* Left sub-nav */}
            <div style={{ flexShrink: 0, width: 130, display: 'flex', flexDirection: 'column', gap: '.3rem', position: 'sticky', top: 0 }}>
              <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.14em', marginBottom: '.35rem' }}>SECTIONS</div>
              {GUIDE_SECTIONS.map(gs => (
                <button
                  key={gs.id}
                  onClick={() => setGuideSection(gs.id)}
                  style={{
                    padding: '.45rem .6rem',
                    background: guideSection === gs.id ? `${gs.col}14` : 'transparent',
                    border: guideSection === gs.id ? `1px solid ${gs.col}66` : '1px solid rgba(0,255,65,.1)',
                    color: guideSection === gs.id ? gs.col : 'rgba(0,255,65,.3)',
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
              <div style={{ marginTop: '.6rem', border: '1px solid rgba(0,255,65,.1)', padding: '.5rem .6rem' }}>
                <div style={{ fontSize: '.4rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', marginBottom: '.3rem' }}>QUICK START</div>
                <div style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.4)', lineHeight: 1.8 }}>
                  1. Pick a class<br />
                  2. Name your operative<br />
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
              border: '1px solid rgba(0,255,65,.14)',
              padding: '1rem 1.2rem',
              maxHeight: '62vh',
              overflowY: 'auto',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(0,255,65,.2) transparent',
            }}>
              <GuideContent section={guideSection} />
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{ position: 'relative', zIndex: 1, padding: '.4rem 1.5rem', borderTop: '1px solid rgba(0,255,65,.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.15)', letterSpacing: '.1em' }}>
          {TIMEZONE_OPTIONS.find(tz => tz.id === selectedTimezone)?.label ?? 'Minx City (PST)'} · WASTELAND · 14 LOCATIONS · LVL SYSTEM · SURVIVAL · 24 TOWERS · 24 CITIES · PABLO CORP. INTERNATIONAL
        </span>
        <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
          <button onClick={() => navigate('/mobile')} style={{ fontSize: '.48rem', color: 'rgba(0,180,255,.3)', background: 'transparent', border: '1px solid rgba(0,180,255,.15)', padding: '2px 8px', cursor: 'pointer', letterSpacing: '.08em', ...S }}>📱 MOBILE TERMINAL</button>
          <button onClick={() => navigate('/')} style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.2)', background: 'transparent', border: '1px solid rgba(0,255,65,.1)', padding: '2px 8px', cursor: 'pointer', letterSpacing: '.08em', ...S }}>← BACK TO APP</button>
        </div>
      </div>

      {showWelcomeDialog && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.92)' }}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
            <div style={{ ...VT, fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: '#00ff41', textShadow: '0 0 30px rgba(0,255,65,.5)', letterSpacing: '.15em' }}>Welcome to Minx City.</div>
            <div style={{ fontSize: '.8rem', color: 'rgba(0,255,65,.4)', letterSpacing: '.12em', lineHeight: 1.8, maxWidth: 500, ...S }}>
              The gates are open. Your record has been filed.<br />PABLO CORP. is watching. Stay sharp, operative.
            </div>
            <button
              onClick={() => navigate('/world/play')}
              style={{
                padding: '.9rem 3rem', background: 'rgba(0,255,65,.12)',
                border: '1px solid rgba(0,255,65,.7)', color: '#00ff41',
                ...VT, fontSize: '1.6rem', letterSpacing: '.2em', cursor: 'pointer',
                textShadow: '0 0 12px rgba(0,255,65,.5)',
                animation: 'smblink 1.2s step-end infinite',
              }}
            >
              ENTER CITY {tick % 2 === 0 ? '▶' : '▷'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
