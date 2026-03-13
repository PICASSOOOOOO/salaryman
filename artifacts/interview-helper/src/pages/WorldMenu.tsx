import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';

type CharClass = 'corporate' | 'outcast' | 'replicant';
type GuideSection = 'world' | 'combat' | 'survival' | 'territories' | 'locations' | 'controls';

const CLASSES = [
  {
    id: 'corporate' as CharClass,
    label: 'CORPORATE',
    tagline: 'City. Salary. Connections.',
    desc: 'Born in the neon towers. You know the right people — for now. High starting salary. The wasteland will eat you alive.',
    start: 'MINX CITY',
    salary: '$500',
    hp: '100',
    color: '#00ff41',
  },
  {
    id: 'outcast' as CharClass,
    label: 'OUTCAST',
    tagline: 'Wasteland. Broke. Alive.',
    desc: 'Exiled. Nothing to your name. You survive by instinct. Zero salary. The city will chew you up. The wasteland is your home.',
    start: 'WASTELAND',
    salary: '$0',
    hp: '100',
    color: '#88ff44',
  },
  {
    id: 'replicant' as CharClass,
    label: 'REPLICANT',
    tagline: 'Android. Balanced. Alone.',
    desc: 'Neither human nor machine. Neither city nor wasteland. You walk both sides. Trusted by nobody. Useful to everyone.',
    start: 'MINX CITY',
    salary: '$200',
    hp: '100',
    color: '#33ffaa',
  },
];

const INDUSTRIES = [
  'FINANCE', 'TECH', 'SECURITY', 'LOGISTICS', 'PHARMA',
  'MEDIA', 'ARMS', 'BLACK MARKET', 'SALVAGE', 'ENERGY',
];

const SIZES = ['SOLO OPERATOR', 'SMALL (2-10)', 'MID (11-50)', 'CORP (51-500)', 'MEGACORP (500+)'];

const FLAVOR = [
  'The collapse happened three years ago. Minx City never recovered.',
  'SENIOR PABLO controls every credit in Minx City.',
  'The wasteland is everything south of the wall. He owns that too.',
  'Your PABLO device is your only edge.',
  'Credits don\'t grow on ruins — but SENIOR PABLO always finds a way.',
  'Every building in Minx City has a price. He set them all.',
  'Villain of the poor. Hero of the rich. That\'s SENIOR PABLO.',
  'Gang territory starts where the lights end.',
  'Server: MINX CITY · PST — 24 regional servers worldwide.',
];

const GUIDE_SECTIONS: { id: GuideSection; label: string; col: string }[] = [
  { id: 'world',       label: 'WORLD',       col: '#00ff41' },
  { id: 'combat',      label: 'COMBAT',       col: '#ffcc00' },
  { id: 'survival',    label: 'SURVIVAL',     col: '#33aaff' },
  { id: 'territories', label: 'TERRITORIES',  col: '#ff4444' },
  { id: 'locations',   label: 'LOCATIONS',    col: '#88ff44' },
  { id: 'controls',    label: 'CONTROLS',     col: '#cc88ff' },
];

const EXP_TABLE = [100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000];

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
        The collapse came without warning. Three years ago PABLO Corp. cut the power grid for 48 hours. When it came back on, SENIOR PABLO owned everything. Minx City runs on PABLO credits now. There is no alternative. 24 regional servers mirror the same story across every timezone — the collapse is global.
      </div>
      <Row label="SERVER" val="MINX CITY · PST — Your regional instance. 24 servers worldwide, each tied to a timezone. The lore is the same everywhere. SENIOR PABLO is everywhere." col="#cc44ff" />
      <Divider />
      <Row label="MINX CITY" val="The neon side. Corporate towers. Clinics. Banks. Streets patrolled by automated sentries no one admits to deploying. High salary potential. Wasteland keeps creeping north." col="#00ff41" />
      <Row label="WASTELAND" val="Everything south of the wall. Three gang territories carve it up. Survival meters drain 1.5× faster here. Your salary bleeds if your energy collapses. High risk, high EXP." col="#88ff44" />
      <Row label="THE BORDER" val="The invisible line between city and wasteland. No wall, no sign. Just the moment the sky changes from neon to smoke. Most corps never cross it." col="#aaff22" />
      <Divider />
      <SectionHead>SENIOR PABLO</SectionHead>
      <div style={{ fontSize: '.56rem', color: 'rgba(0,255,65,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        No one has seen SENIOR PABLO. Not in person. The tower carries his name. Every device carries his firmware. Every credit transaction flows through his network. Villain of Minx City. Hero of the rich. Floor 40 of PABLO Tower is the highest any operative has been allowed. Floors 41–62 are sealed. Keypad access. Wrong code: instant lockout. The name "SENIOR PABLO" is reserved — no operative may use it.
      </div>
      <Row label="PABLO TOWER" val="62 floors. City center. Floors 1–39 open to registered operatives. Floor 40+: restricted by order of SENIOR PABLO. Nobody knows what's on top." col="#cc44ff" />
      <Row label="PABLO DEVICE" val="The app you're running right now. AI assistant, world map, PABLO network access. Press [P] in-world." col="#00ff41" />
      <Row label="PABLO CREDITS" val="The only currency that matters. Your salary, building locks, and upgrades all run on credits. SENIOR PABLO takes a cut of everything." col="#ffcc00" />
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
      <Row label="LEVEL UP" val="MAX HP +10. ATK +5. HP partially restored. Gold LEVEL UP overlay appears. Stats persist until TITLE SCREEN." col="#ffcc00" />
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
        { label: 'HUNGER', col: '#00ff41', drain: '−1.5/tick (city) · −2.5/tick (wasteland)', crit: 'HP drains when HUNGER = 0', restore: 'VEND-O-MATIC +30 · PABLO STORE consumables' },
        { label: 'THIRST', col: '#33aaff', drain: '−2/tick (city) · −3/tick (wasteland)', crit: 'HP drains when THIRST = 0', restore: 'VEND-O-MATIC +30' },
        { label: 'ENERGY', col: '#ffcc00', drain: '−1/tick (city) · −1.5/tick (wasteland)', crit: 'Salary −5/tick when ENERGY < 20', restore: 'HOTEL FAMICOM +30 · ARCADE \'87 +20' },
      ].map(m => (
        <div key={m.label} style={{ border: `1px solid ${m.col}22`, background: `${m.col}06`, padding: '.6rem .75rem', marginBottom: '.4rem' }}>
          <div style={{ ...VT, fontSize: '1.1rem', color: m.col, letterSpacing: '.1em', marginBottom: '.3rem' }}>{m.label}</div>
          <Row label="DRAIN" val={m.drain} col={m.col} />
          <Row label="CRITICAL" val={m.crit} col="#ff6644" />
          <Row label="RESTORE" val={m.restore} col="rgba(0,255,65,.6)" />
        </div>
      ))}
      <Divider />
      <Row label="TICK RATE" val="Every ~6 seconds in the game loop. Drains pause while dialogs / panels are open." />
      <Row label="GAME OVER" val="HP → 0 triggers GAME OVER screen. CONTINUE restores all meters to 100. TITLE SCREEN returns to this menu." />
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
          lore: 'Former construction workers. Turned feral after SENIOR PABLO seized their housing blocks. They wear red. They hit in groups. Don\'t stop moving.',
        },
        {
          id: 'VOID DOGS', col: '#ff8800', zone: 'Central wasteland',
          entry: '"VOID DOGS don\'t negotiate."',
          enemies: 'VOID_DOGS — HP 40 · EXP 28 · balanced, patrol-heavy',
          lore: 'Ex-security contractors cut loose when SENIOR PABLO automated the checkpoints. Organized. Orange armbands. They remember how to be soldiers.',
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

  if (section === 'locations') return (
    <div style={S}>
      <SectionHead>LOCATIONS</SectionHead>
      <div style={{ fontSize: '.56rem', color: 'rgba(0,255,65,.45)', lineHeight: 1.9, marginBottom: '.75rem' }}>
        Key sites across the City and Wasteland. Approach within range and press [E] to enter. Some are locked. Some cost credits. Some are owned by other operatives.
      </div>
      <Divider />
      <div style={{ fontSize: '.44rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.1em', marginBottom: '.4rem' }}>── MINX CITY ──</div>
      {[
        { name: 'PABLO TOWER',     col: '#cc44ff', effect: 'Story hub. Floors 1–39 open. Use PABLO device from inside.',        secret: 'Wrong passcode = lockout. Konami Code is real.' },
        { name: 'DR. WRIGHT\'S',   col: '#00ff41', effect: 'HP restore. First aid. Free once per session.',                     secret: 'Even BELMONT gets patched up here.' },
        { name: 'KONAMI BANK',     col: '#00ff41', effect: 'Salary deposit. View balance. Transfer credits.',                   secret: 'Bank fees are SENIOR PABLO\'s favorite revenue stream.' },
        { name: 'HOTEL FAMICOM',   col: '#00ff41', effect: '+40 HP · +30 Energy. Rest fully.',                                  secret: 'Room keys say GALAGA on the back.' },
        { name: 'ARCADE \'87',     col: '#00ff41', effect: '+20 Energy. One machine still running: GALAGA.',                    secret: 'Free play. Coin slot taped over since the collapse.' },
        { name: 'VEND-O-MATIC',   col: '#00ff41', effect: '+30 Hunger · +30 Thirst. Vending machine near city wall.',          secret: 'Brand: PABLO FRESH. Ingredients unknown.' },
        { name: 'SAVE POINT',      col: '#aaffff', effect: 'Full restore: HP, Hunger, Thirst, Energy. Cures POISON. Saves progress to device.', secret: '"Brave the darkness, warrior." — inscription, provenance unknown.' },
        { name: 'PABLO STORE',     col: '#cc44ff', effect: 'Buy PABLO devices. Upgrade to Pro ($29/mo). Access AI tools.',      secret: 'Free tier is watched. PABLO notes who hasn\'t subscribed.' },
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
        { name: 'SCRAP YARD',   col: '#88ff44', effect: '+$20 salary. PCB labeled KONAMI \'87 found.',                  secret: 'Worth more than a full day\'s work at a corp.' },
        { name: 'PIRATE RADIO', col: '#88ff44', effect: 'Lore. Signal: "...up up, down down..." Someone gave SENIOR PABLO the code.', secret: '"He already knew it. He wrote it."' },
        { name: 'WILY LABS',    col: '#88ff44', effect: '+$50 salary. Blueprints everywhere. Abandoned.',               secret: '"Robot Masters were the first to fall. SENIOR PABLO bought them all."' },
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

  if (section === 'controls') return (
    <div style={S}>
      <SectionHead>CONTROLS</SectionHead>
      <Divider />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem .75rem' }}>
        {[
          ['WASD / ARROWS', 'Move operative'],
          ['E', 'Enter building / Talk to NPC'],
          ['F', 'Melee attack (72px range)'],
          ['C', 'Open world chat'],
          ['V', 'Toggle voice (mic)'],
          ['P', 'Open PABLO device (AI)'],
          ['ESC', 'Close panels / dialogs'],
          ['SPACE / ENTER', 'Advance dialog text'],
          ['↑↑↓↓←→←→BA', 'Konami Code (secret)'],
          ['Click canvas', 'Focus game window'],
        ].map(([key, desc]) => (
          <div key={key} style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', padding: '.3rem 0', borderBottom: '1px solid rgba(0,255,65,.06)' }}>
            <div style={{ ...VT, fontSize: '1rem', color: '#cc88ff', letterSpacing: '.08em', minWidth: 110, flexShrink: 0 }}>{key}</div>
            <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.6)', lineHeight: 1.7 }}>{desc}</div>
          </div>
        ))}
      </div>
      <Divider />
      <SectionHead>NPCS</SectionHead>
      <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.45)', lineHeight: 1.9, marginBottom: '.5rem' }}>
        9 named NPCs roam the world. Each has a unique whisper referencing games from the era. Approach and press [E] to talk. They won't repeat themselves.
      </div>
      {[
        ['STRIFE', 'FF7 — "The planet\'s been trying to tell us something for years. Nobody\'s listening. You listening?"'],
        ['BELMONT', 'Castlevania — "Whip. Sub-weapons. Holy water. None of it works on SENIOR PABLO. Believe me. I tried."'],
        ['SAMUS', 'Metroid — "I\'ve scanned every floor of that tower. Floor 53 registers as occupied. No life signs."'],
        ['SNAKE', 'Metal Gear — "A weapon to surpass Metal Gear. SENIOR PABLO built it. It\'s called the PABLO device. You\'re holding it."'],
        ['RIZER', 'Contra — "Thirty lives. I had thirty lives and I spent them all trying to get past floor 40. No cheats work."'],
        ['KANEDA', 'Akira — "Minx City was supposed to be Neo-Tokyo. SENIOR PABLO liked the name. Bought the trademark."'],
        ['TETSUO', 'Akira — "I can feel the tower thinking. It knows I\'m here. SENIOR PABLO always knows."'],
        ['DR. WILY', 'Mega Man — "I built the first AI for SENIOR PABLO. He thanked me with a gift card."'],
        ['ERDRICK', 'Dragon Quest — "There was a hero before all this. Warrior of Light. I think SENIOR PABLO built the tower on their tomb."'],
      ].map(([name, quote]) => (
        <div key={name} style={{ display: 'flex', gap: '.6rem', padding: '.3rem 0', borderBottom: '1px solid rgba(0,255,65,.06)', alignItems: 'flex-start' }}>
          <div style={{ ...VT, fontSize: '.95rem', color: '#33ffaa', minWidth: 70, flexShrink: 0 }}>{name}</div>
          <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.45)', lineHeight: 1.7, fontStyle: 'italic' }}>{quote}</div>
        </div>
      ))}
    </div>
  );

  return null;
}

export default function WorldMenu() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<'enter' | 'guide'>('enter');
  const [step, setStep] = useState<1 | 2>(1);
  const [cls, setCls]   = useState<CharClass>('corporate');
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [tick, setTick] = useState(0);
  const [flavorIdx, setFlavorIdx] = useState(0);
  const [players, setPlayers] = useState<number | null>(null);
  const [guideSection, setGuideSection] = useState<GuideSection>('world');

  // Business registration
  const [bizType, setBizType] = useState<'fictitious' | 'real'>('fictitious');
  const [company, setCompany] = useState('');
  const [industry, setIndustry] = useState('FINANCE');
  const [bizSize, setBizSize] = useState('SOLO OPERATOR');
  const [bizEmail, setBizEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
      setNameError('RESERVED — That name belongs to him. Choose another.');
      return;
    }
    setNameError('');
    setStep(2);
  };

  const handleEnterWorld = async () => {
    setSubmitting(true);
    const finalCompany = bizType === 'real' && company.trim()
      ? company.trim().toUpperCase()
      : name.trim().toUpperCase() + ' OPS';
    const char = {
      name: name.trim().toUpperCase(),
      class: cls,
      company: finalCompany,
      sx: cls === 'outcast' ? 460 : 560,
      sy: cls === 'outcast' ? 750 : 320,
      salary: cls === 'corporate' ? 500 : cls === 'replicant' ? 200 : 0,
    };
    localStorage.setItem('sm_char', JSON.stringify(char));
    try {
      await fetch('/api/world/register', {
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
    } catch { /* ignore */ }
    setSubmitting(false);
    navigate('/world/play');
  };

  const S: React.CSSProperties = { fontFamily: "'Share Tech Mono',monospace" };
  const VT: React.CSSProperties = { fontFamily: "'VT323',monospace" };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#030803', ...S, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.15) 2px,rgba(0,0,0,.15) 4px)', pointerEvents: 'none', zIndex: 99 }} />
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(0,255,65,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,65,.025) 1px, transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none', zIndex: 0 }} />

      {/* Top bar */}
      <div style={{ position: 'relative', zIndex: 1, padding: '.4rem 1.5rem', borderBottom: '1px solid rgba(0,255,65,.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.14em' }}>PABLO CORP. / SALARYMAN OS v1.0 &nbsp;·&nbsp; <span style={{ color: 'rgba(0,255,65,.4)' }}>MINX CITY</span> &nbsp;·&nbsp; PST</span>
        <span style={{ fontSize: '.5rem', color: players === -1 ? 'rgba(255,80,80,.6)' : 'rgba(0,255,65,.2)', letterSpacing: '.1em' }}>
          {players === -1 ? 'SERVER FULL — MAX 50' : players !== null ? `${players}/50 OPERATIVES ONLINE` : 'CONNECTING...'}
          {tick % 2 === 0 ? ' ▮' : ' ▯'}
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem 1rem 2rem', position: 'relative', zIndex: 1 }}>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ ...VT, fontSize: 'clamp(2.5rem, 7vw, 5rem)', color: '#00ff41', textShadow: '0 0 30px rgba(0,255,65,.4)', letterSpacing: '.18em', lineHeight: 1 }}>SALARYMAN</div>
          <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.2em', marginTop: '.4rem', ...VT }}>BY PICASSOO.AI — PABLO CORP. WORLD</div>
          <div style={{ marginTop: '.5rem', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(0,255,65,.3), transparent)' }} />
          <div style={{ marginTop: '.4rem', fontSize: '.6rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.1em', minHeight: '1.2em' }}>{FLAVOR[flavorIdx]}</div>
        </div>

        {/* ── TAB BAR ── */}
        <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem', border: '1px solid rgba(0,255,65,.18)', overflow: 'hidden' }}>
          {([['enter', 'ENTER WORLD'], ['guide', 'FIELD GUIDE']] as const).map(([id, label]) => (
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

        {/* ── TAB: ENTER WORLD ── */}
        {tab === 'enter' && (
          <>
            {step === 1 && (
              <div style={{ width: '100%', maxWidth: 820, display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                  <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.15em', marginBottom: '.2rem' }}>SELECT OPERATIVE CLASS</div>
                  {CLASSES.map(c => (
                    <button key={c.id} onClick={() => setCls(c.id)} style={{ padding: '.75rem .9rem', border: cls === c.id ? `1px solid ${c.color}` : '1px solid rgba(0,255,65,.15)', background: cls === c.id ? 'rgba(0,255,65,.07)' : 'rgba(0,255,65,.01)', color: cls === c.id ? c.color : 'rgba(0,255,65,.35)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '1rem', transition: 'all .12s', ...S }}>
                      <div style={{ flexShrink: 0, width: 8, height: 8, background: cls === c.id ? c.color : 'rgba(0,255,65,.2)', boxShadow: cls === c.id ? `0 0 8px ${c.color}` : 'none' }} />
                      <div>
                        <div style={{ ...VT, fontSize: '1.1rem', letterSpacing: '.1em', lineHeight: 1 }}>{c.label}</div>
                        <div style={{ fontSize: '.55rem', color: cls === c.id ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.2)', marginTop: '.15rem', letterSpacing: '.06em' }}>{c.tagline}</div>
                      </div>
                    </button>
                  ))}
                </div>

                <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
                  <div style={{ border: `1px solid ${selected.color}44`, background: 'rgba(0,255,65,.04)', padding: '1rem' }}>
                    <div style={{ ...VT, fontSize: '1.4rem', color: selected.color, letterSpacing: '.12em', marginBottom: '.5rem' }}>{selected.label}</div>
                    <div style={{ fontSize: '.62rem', color: 'rgba(0,255,65,.5)', lineHeight: 1.8, marginBottom: '.75rem' }}>{selected.desc}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.4rem' }}>
                      {[['START', selected.start], ['SALARY', selected.salary], ['HP', selected.hp]].map(([k, v]) => (
                        <div key={k} style={{ border: '1px solid rgba(0,255,65,.12)', padding: '.4rem .5rem' }}>
                          <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.12em', marginBottom: '.15rem' }}>{k}</div>
                          <div style={{ ...VT, fontSize: '.9rem', color: selected.color, letterSpacing: '.08em' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.15em', marginBottom: '.35rem' }}>OPERATIVE NAME</div>
                    <input
                      value={name}
                      onChange={e => { setName(e.target.value); setNameError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleProceed()}
                      maxLength={28}
                      placeholder="FIRST  LAST"
                      autoFocus
                      style={{ width: '100%', padding: '.65rem .8rem', background: 'rgba(0,8,0,.95)', border: `1px solid ${nameError ? 'rgba(255,60,60,.6)' : name ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.2)'}`, color: '#00ff41', ...S, fontSize: '1rem', letterSpacing: '.1em', outline: 'none', caretColor: '#00ff41', boxSizing: 'border-box' }}
                    />
                    {nameError && (
                      <div style={{ fontSize: '.48rem', color: 'rgba(255,80,80,.8)', letterSpacing: '.08em', marginTop: '.3rem', ...VT }}>⚠ {nameError}</div>
                    )}
                    <div style={{ fontSize: '.42rem', color: 'rgba(0,255,65,.18)', letterSpacing: '.08em', marginTop: '.25rem' }}>
                      Enter your full name — first and last. "SENIOR PABLO" is reserved.
                    </div>
                  </div>

                  <button
                    onClick={handleProceed}
                    disabled={!name.trim() || !!nameError}
                    style={{ width: '100%', padding: '.75rem', background: (name.trim() && !nameError) ? 'rgba(0,255,65,.1)' : 'transparent', border: (name.trim() && !nameError) ? '1px solid rgba(0,255,65,.7)' : '1px solid rgba(0,255,65,.1)', color: (name.trim() && !nameError) ? '#00ff41' : 'rgba(0,255,65,.15)', ...VT, fontSize: '1.5rem', letterSpacing: '.2em', cursor: (name.trim() && !nameError) ? 'pointer' : 'default', transition: 'all .15s' }}
                  >
                    NEXT — REGISTER ENTERPRISE {(name.trim() && !nameError) ? (tick % 2 === 0 ? '▶' : '▷') : ''}
                  </button>

                  <div style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.18)', letterSpacing: '.08em', lineHeight: 1.8 }}>
                    WASD — move &nbsp;·&nbsp; E — enter/talk &nbsp;·&nbsp; F — attack &nbsp;·&nbsp; C — chat &nbsp;·&nbsp; V — voice &nbsp;·&nbsp; P — PABLO device
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div style={{ width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
                <div style={{ border: '1px solid rgba(0,255,65,.2)', background: 'rgba(0,255,65,.03)', padding: '1rem' }}>
                  <div style={{ fontSize: '.5rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.15em', marginBottom: '.6rem' }}>ENTERPRISE REGISTRATION — {name.trim().toUpperCase()}</div>
                  <div style={{ fontSize: '.58rem', color: 'rgba(0,255,65,.4)', lineHeight: 1.9 }}>
                    Every operative in Minx City is affiliated with an enterprise. A fictitious front protects you. A real business lets you stake your claim and set up permanent offices across the city.
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
                  {(['fictitious', 'real'] as const).map(t => (
                    <button key={t} onClick={() => setBizType(t)} style={{ padding: '.9rem', border: bizType === t ? '1px solid rgba(0,255,65,.7)' : '1px solid rgba(0,255,65,.15)', background: bizType === t ? 'rgba(0,255,65,.07)' : 'transparent', color: bizType === t ? '#00ff41' : 'rgba(0,255,65,.35)', cursor: 'pointer', textAlign: 'left', ...S, transition: 'all .12s' }}>
                      <div style={{ ...VT, fontSize: '1.1rem', letterSpacing: '.1em', marginBottom: '.25rem' }}>
                        {t === 'fictitious' ? 'FICTITIOUS FRONT' : 'REAL ENTERPRISE'}
                      </div>
                      <div style={{ fontSize: '.52rem', color: bizType === t ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.2)', lineHeight: 1.7 }}>
                        {t === 'fictitious'
                          ? 'Anonymous. Low profile. No paper trail. Your data stays local.'
                          : 'Real company. Stake territory. Data stored on our servers for paid members. Your brand in-world.'}
                      </div>
                    </button>
                  ))}
                </div>

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
                          {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
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
                      <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.25)', letterSpacing: '.12em', marginBottom: '.25rem' }}>CONTACT EMAIL <span style={{ color: 'rgba(0,255,65,.15)' }}>(OPTIONAL — STORED FOR PAID MEMBERS)</span></div>
                      <input value={bizEmail} onChange={e => setBizEmail(e.target.value)} type="email" maxLength={100} placeholder="contact@yourcompany.com" style={{ width: '100%', padding: '.5rem .7rem', background: 'rgba(0,8,0,.95)', border: '1px solid rgba(0,255,65,.3)', color: '#00ff41', ...S, fontSize: '.85rem', outline: 'none', caretColor: '#00ff41', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '.6rem' }}>
                  <button onClick={() => setStep(1)} style={{ padding: '.65rem 1.2rem', background: 'transparent', border: '1px solid rgba(0,255,65,.2)', color: 'rgba(0,255,65,.4)', ...VT, fontSize: '1rem', letterSpacing: '.1em', cursor: 'pointer' }}>← BACK</button>
                  <button
                    onClick={handleEnterWorld}
                    disabled={submitting}
                    style={{ flex: 1, padding: '.75rem', background: 'rgba(0,255,65,.1)', border: '1px solid rgba(0,255,65,.7)', color: '#00ff41', ...VT, fontSize: '1.5rem', letterSpacing: '.2em', cursor: 'pointer', textShadow: '0 0 12px rgba(0,255,65,.4)' }}
                  >
                    {submitting ? 'REGISTERING...' : `ENTER THE WORLD ${tick % 2 === 0 ? '▶' : '▷'}`}
                  </button>
                </div>

                <div style={{ fontSize: '.46rem', color: 'rgba(0,255,65,.15)', lineHeight: 1.8 }}>
                  Real business data is only stored persistently for paid subscribers. All other data is session-local. Server capacity: 50 operatives.
                </div>
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
        <span style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.15)', letterSpacing: '.1em' }}>MINX CITY · PST · WASTELAND · 14 LOCATIONS · LVL SYSTEM · SURVIVAL · 24 REGIONAL SERVERS</span>
        <button onClick={() => navigate('/')} style={{ fontSize: '.48rem', color: 'rgba(0,255,65,.2)', background: 'transparent', border: '1px solid rgba(0,255,65,.1)', padding: '2px 8px', cursor: 'pointer', letterSpacing: '.08em', ...S }}>← BACK TO APP</button>
      </div>
    </div>
  );
}
