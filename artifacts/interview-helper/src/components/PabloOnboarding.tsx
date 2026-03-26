import { useState, useCallback } from 'react';
import { CITY_NAME } from '../gameSystems';

export interface OnboardingAnswers {
  combatStyle: string;
  playstyle: string;
  goal: string;
  perception: number;
}

interface PabloOnboardingProps {
  charName: string;
  charClass: string;
  onComplete: (answers: OnboardingAnswers) => void;
}

const COMBAT_OPTIONS = [
  { id: 'melee', label: 'CLOSE COMBAT', desc: 'Swords, fists, blunt force. Get in their face.' },
  { id: 'ranged', label: 'RANGED FIRE', desc: 'Guns, lasers, distance. Keep them at arm\'s length.' },
  { id: 'explosive', label: 'DEMOLITIONS', desc: 'Bombs, charges, area damage. Scorched earth.' },
  { id: 'balanced', label: 'ADAPTIVE', desc: 'Mix everything. Adapt to the situation.' },
];

const PLAYSTYLE_OPTIONS = [
  { id: 'explorer', label: 'EXPLORER', desc: 'Map every inch. Find every secret. Treasure hunter.' },
  { id: 'fighter', label: 'BOUNTY HUNTER', desc: 'Kill threats. Collect bounties. Climb the ranks.' },
  { id: 'trader', label: 'TRADER', desc: 'Stack FIAT. Run the economy. Buy everything.' },
  { id: 'story', label: 'INVESTIGATOR', desc: 'Uncover the truth about Senior Pablo and Minx City.' },
];

const GOAL_OPTIONS = [
  { id: 'survive', label: 'SURVIVE', desc: 'Stay alive. Build shelter. Outlast everyone.' },
  { id: 'dominate', label: 'DOMINATE', desc: 'Own the city. Control territory. Become the boss.' },
  { id: 'truth', label: 'FIND THE TRUTH', desc: 'What\'s on Floor 40? Who is Senior Pablo? Find out.' },
  { id: 'wealth', label: 'GET RICH', desc: 'FIAT is king. Gold is better. Stack it all.' },
];

const PERCEPTION_OPTIONS = [
  { id: '3', label: 'LOW (3)', desc: 'Minimal awareness. You rely on instinct, not senses.' },
  { id: '5', label: 'AVERAGE (5)', desc: 'Standard awareness. You notice what matters.' },
  { id: '7', label: 'HIGH (7)', desc: 'Sharp senses. Enemies show up on your radar earlier.' },
  { id: '10', label: 'ELITE (10)', desc: 'Nothing escapes you. Maximum detection and map reveal.' },
];

type Step = 'greet' | 'combat' | 'playstyle' | 'goal' | 'perception' | 'tut_combat' | 'tut_economy' | 'tut_survival' | 'done' | 'save';

const STEP_ORDER: Step[] = ['greet', 'combat', 'playstyle', 'goal', 'perception', 'tut_combat', 'tut_economy', 'tut_survival', 'done', 'save'];

const VT: React.CSSProperties = { fontFamily: "'VT323',monospace" };
const ST: React.CSSProperties = { fontFamily: "'Share Tech Mono',monospace" };

export function PabloOnboarding({ charName, charClass, onComplete }: PabloOnboardingProps) {
  const [step, setStep] = useState<Step>('greet');
  const [combatStyle, setCombatStyle] = useState('');
  const [playstyle, setPlaystyle] = useState('');
  const [goal, setGoal] = useState('');
  const [perception, setPerception] = useState('');

  const stepIdx = STEP_ORDER.indexOf(step);
  const totalSteps = STEP_ORDER.length;

  const next = useCallback(() => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[idx + 1]);
    }
  }, [step]);

  const canAdvance = () => {
    if (step === 'combat') return combatStyle !== '';
    if (step === 'playstyle') return playstyle !== '';
    if (step === 'goal') return goal !== '';
    if (step === 'perception') return perception !== '';
    return true;
  };

  const handleComplete = useCallback(() => {
    onComplete({ combatStyle, playstyle, goal, perception: parseInt(perception) || 5 });
  }, [combatStyle, playstyle, goal, perception, onComplete]);

  const renderOptionGrid = (
    options: { id: string; label: string; desc: string }[],
    selected: string,
    onSelect: (id: string) => void,
  ) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem', marginTop: '.6rem' }}>
      {options.map(opt => (
        <button
          key={opt.id}
          onClick={() => onSelect(opt.id)}
          style={{
            background: selected === opt.id ? 'rgba(56,189,248,.12)' : 'rgba(56,189,248,.02)',
            border: selected === opt.id ? '1px solid rgba(56,189,248,.6)' : '1px solid rgba(56,189,248,.15)',
            padding: '.5rem .6rem',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all .15s',
          }}
        >
          <div style={{ ...VT, fontSize: '.95rem', color: selected === opt.id ? '#38bdf8' : 'rgba(56,189,248,.55)', letterSpacing: '.08em' }}>
            {selected === opt.id ? '▸ ' : ''}{opt.label}
          </div>
          <div style={{ ...ST, fontSize: '.48rem', color: 'rgba(56,189,248,.35)', marginTop: '.15rem', lineHeight: 1.5 }}>
            {opt.desc}
          </div>
        </button>
      ))}
    </div>
  );

  const renderTutorial = (title: string, lines: string[]) => (
    <div style={{ marginTop: '.5rem' }}>
      <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.12em', marginBottom: '.6rem', borderBottom: '1px solid rgba(56,189,248,.2)', paddingBottom: '.35rem' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
        {lines.map((line, i) => (
          <div key={i} style={{ ...ST, fontSize: '.55rem', color: 'rgba(56,189,248,.6)', lineHeight: 1.7, paddingLeft: '.4rem', borderLeft: '2px solid rgba(56,189,248,.15)' }}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(0,0,0,.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 440,
    }}>
      <style>{`@keyframes pulse-save { 0%,100% { box-shadow: 0 0 8px rgba(56,189,248,.2); } 50% { box-shadow: 0 0 20px rgba(56,189,248,.5); } }`}</style>
      <div style={{
        width: 460, maxWidth: '90vw', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        background: 'rgba(0,5,0,.99)',
        border: '1px solid rgba(56,189,248,.5)',
        boxShadow: '0 0 60px rgba(56,189,248,.06)',
      }}>
        <div style={{
          padding: '.5rem .85rem',
          borderBottom: '1px solid rgba(56,189,248,.2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ ...VT, fontSize: '1.3rem', color: '#38bdf8', letterSpacing: '.18em' }}>PABLO ONBOARDING</div>
            <div style={{ ...ST, fontSize: '.48rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.1em' }}>
              FIELD UNIT CALIBRATION · {stepIdx + 1}/{totalSteps}
            </div>
          </div>
          <div style={{
            width: 32, height: 32,
            border: '1px solid rgba(56,189,248,.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            ...VT, fontSize: '1.2rem', color: '#38bdf8',
          }}>
            P
          </div>
        </div>

        <div style={{
          height: 3,
          background: 'rgba(56,189,248,.06)',
          flexShrink: 0,
        }}>
          <div style={{
            height: '100%',
            width: `${((stepIdx + 1) / totalSteps) * 100}%`,
            background: 'rgba(56,189,248,.5)',
            transition: 'width .35s ease',
          }} />
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '.75rem .85rem' }}>
          {step === 'greet' && (
            <div>
              <div style={{ ...ST, fontSize: '.62rem', color: 'rgba(56,189,248,.55)', lineHeight: 2, marginBottom: '.3rem' }}>
                &gt; SIGNAL ACQUIRED.<br/>
                &gt; NEURAL LINK ESTABLISHED.<br/>
                &gt; OPERATIVE DETECTED: <span style={{ color: '#38bdf8' }}>{charName.toUpperCase()}</span><br/>
                &gt; CLASS: <span style={{ color: '#38bdf8' }}>{charClass.toUpperCase()}</span>
              </div>
              <div style={{ borderTop: '1px solid rgba(56,189,248,.12)', marginTop: '.5rem', paddingTop: '.6rem' }}>
                <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em', lineHeight: 1.7 }}>
                  {charName}. I'm PABLO — your field AI. Issued to every registered operative in Minx City.
                </div>
                <div style={{ ...ST, fontSize: '.55rem', color: 'rgba(56,189,248,.45)', marginTop: '.5rem', lineHeight: 1.8 }}>
                  Before you step outside, I need to calibrate your profile. Three questions. Then I'll brief you on how this city works. Takes sixty seconds. Trust me — you'll want this.
                </div>
              </div>
            </div>
          )}

          {step === 'combat' && (
            <div>
              <div style={{ ...VT, fontSize: '.95rem', color: '#38bdf8', letterSpacing: '.05em', marginBottom: '.15rem' }}>
                QUESTION 1 — COMBAT PREFERENCE
              </div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.6 }}>
                The wasteland doesn't negotiate. How do you handle threats?
              </div>
              {renderOptionGrid(COMBAT_OPTIONS, combatStyle, setCombatStyle)}
            </div>
          )}

          {step === 'playstyle' && (
            <div>
              <div style={{ ...VT, fontSize: '.95rem', color: '#38bdf8', letterSpacing: '.05em', marginBottom: '.15rem' }}>
                QUESTION 2 — OPERATIVE TYPE
              </div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.6 }}>
                Everyone in Minx City has an angle. What's yours?
              </div>
              {renderOptionGrid(PLAYSTYLE_OPTIONS, playstyle, setPlaystyle)}
            </div>
          )}

          {step === 'goal' && (
            <div>
              <div style={{ ...VT, fontSize: '.95rem', color: '#38bdf8', letterSpacing: '.05em', marginBottom: '.15rem' }}>
                QUESTION 3 — PRIMARY OBJECTIVE
              </div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.6 }}>
                What keeps you awake at night, {charName}?
              </div>
              {renderOptionGrid(GOAL_OPTIONS, goal, setGoal)}
            </div>
          )}

          {step === 'perception' && (
            <div>
              <div style={{ ...VT, fontSize: '.95rem', color: '#38bdf8', letterSpacing: '.05em', marginBottom: '.15rem' }}>
                QUESTION 4 — PERCEPTION
              </div>
              <div style={{ ...ST, fontSize: '.52rem', color: 'rgba(56,189,248,.4)', lineHeight: 1.6 }}>
                How sharp are your senses, {charName}? Perception affects enemy detection range and how much of the map you reveal as you explore.
              </div>
              {renderOptionGrid(PERCEPTION_OPTIONS, perception, setPerception)}
            </div>
          )}

          {step === 'tut_combat' && renderTutorial('BRIEFING: COMBAT', [
            '▸ WASD or Arrow Keys to move. Mouse click or SPACE to attack.',
            '▸ Your weapon type determines range. Swords hit close. Guns and lasers shoot projectiles.',
            '▸ Bombs are thrown with a delay — clear the blast radius or take damage.',
            '▸ Every kill earns a BOUNTY in FIAT (ƒ) and EXPERIENCE (XP). XP levels you up, boosting max HP.',
            '▸ Watch your HP. When it hits zero, you die. The hospital revives you — but it costs.',
            '▸ Enemies in the wasteland are tougher. Gang territory spawns faction soldiers. Stay sharp.',
            `▸ You chose "${(COMBAT_OPTIONS.find(o => o.id === combatStyle)?.label ?? 'ADAPTIVE')}" — I'll tailor advice to match.`,
          ])}

          {step === 'tut_economy' && renderTutorial('BRIEFING: ECONOMY', [
            '▸ FIAT (ƒ) is the currency of Minx City. Earn it through bounties, jobs, and trade.',
            '▸ BANCO OMBRA holds savings accounts. Deposit to protect your FIAT from death penalties.',
            '▸ Banks offer LOANS — borrow FIAT but repay on time. Overdue loans trigger debt collectors.',
            '▸ GOLD is rare and valuable. Exchange FIAT for GOLD at special terminals. Taxes apply.',
            '▸ Visit the NOODLE BAR, CLINIC, WEAPON SHOP, and CLOTHES SHOP to spend FIAT on upgrades.',
            '▸ REAL ESTATE is available — own buildings for passive income and fast travel.',
            '▸ BILLBOARDS can be purchased for advertising. 7-day slots with custom content.',
          ])}

          {step === 'tut_survival' && renderTutorial('BRIEFING: SURVIVAL', [
            '▸ Three bars matter: HUNGER, THIRST, and ENERGY. All drain over time.',
            '▸ HUNGER drops steadily. Eat at the NOODLE BAR or find food in the wasteland.',
            '▸ THIRST drops faster. Find water sources or buy drinks.',
            '▸ ENERGY depletes from combat and sprinting. Rest at your apartment or a save point.',
            '▸ If any bar hits zero, your HP starts draining. Keep all three above critical.',
            '▸ RADIATION ZONES exist in the wasteland. They deal passive HP damage. Avoid or gear up.',
            '▸ POISON can be contracted from certain enemies. Find an antidote or visit the CLINIC.',
            '▸ SAVE your progress at terminals. Death without saving means lost progress.',
          ])}

          {step === 'done' && (
            <div>
              <div style={{ ...ST, fontSize: '.62rem', color: 'rgba(56,189,248,.55)', lineHeight: 2, marginBottom: '.3rem' }}>
                &gt; PROFILE CALIBRATED.<br/>
                &gt; COMBAT: {(COMBAT_OPTIONS.find(o => o.id === combatStyle)?.label ?? 'ADAPTIVE')}<br/>
                &gt; TYPE: {(PLAYSTYLE_OPTIONS.find(o => o.id === playstyle)?.label ?? 'EXPLORER')}<br/>
                &gt; OBJECTIVE: {(GOAL_OPTIONS.find(o => o.id === goal)?.label ?? 'SURVIVE')}
              </div>
              <div style={{ borderTop: '1px solid rgba(56,189,248,.12)', marginTop: '.5rem', paddingTop: '.6rem' }}>
                <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em', lineHeight: 1.7 }}>
                  You're ready, {charName}.
                </div>
                <div style={{ ...ST, fontSize: '.55rem', color: 'rgba(56,189,248,.45)', marginTop: '.5rem', lineHeight: 1.8 }}>
                  Step outside. Minx City is waiting. Press [P] anytime to open your PABLO device and talk to me. I'll be here.<br/><br/>
                  One more thing — don't trust everything you see. And don't go above Floor 39.
                </div>
              </div>
            </div>
          )}

          {step === 'save' && (
            <div>
              <div style={{ ...ST, fontSize: '.62rem', color: 'rgba(56,189,248,.55)', lineHeight: 2, marginBottom: '.3rem' }}>
                &gt; INTAKE COMPLETE.<br/>
                &gt; PROFILE LOCKED.
              </div>
              <div style={{ borderTop: '1px solid rgba(56,189,248,.12)', marginTop: '.5rem', paddingTop: '.6rem' }}>
                <div style={{ ...VT, fontSize: '1rem', color: '#38bdf8', letterSpacing: '.05em', lineHeight: 1.7 }}>
                  One last thing, {charName}.
                </div>
                <div style={{ ...ST, fontSize: '.55rem', color: 'rgba(56,189,248,.45)', marginTop: '.5rem', lineHeight: 1.8 }}>
                  Save your progress now. This city doesn't give second chances. If you die out there without saving — everything since your last checkpoint is gone. I mean everything.<br/><br/>
                  Hit the button below. I'll handle the rest.<br/><br/>
                  After this, you're on your own. Good luck, operative. PABLO out.
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{
          padding: '.45rem .85rem',
          borderTop: '1px solid rgba(56,189,248,.15)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.18)', letterSpacing: '.06em' }}>
            {`PABLO CORP FIELD CALIBRATION ALPHA ${__BUILD_VERSION__}`}
          </div>
          {step === 'save' ? (
            <button
              onClick={handleComplete}
              style={{
                ...VT, fontSize: '1.1rem', letterSpacing: '.12em',
                padding: '.4rem 1.2rem',
                background: 'rgba(56,189,248,.15)',
                border: '1px solid rgba(56,189,248,.7)',
                color: '#38bdf8',
                cursor: 'pointer',
                animation: 'pulse-save 1.5s ease-in-out infinite',
              }}
            >
              ▸ SAVE PROGRESS ◂
            </button>
          ) : step === 'done' ? (
            <button
              onClick={next}
              style={{
                ...VT, fontSize: '1.1rem', letterSpacing: '.12em',
                padding: '.4rem 1.2rem',
                background: 'rgba(56,189,248,.1)',
                border: '1px solid rgba(56,189,248,.6)',
                color: '#38bdf8',
                cursor: 'pointer',
              }}
            >
              CONTINUE ▸
            </button>
          ) : (
            <button
              onClick={next}
              disabled={!canAdvance()}
              style={{
                ...VT, fontSize: '1rem', letterSpacing: '.1em',
                padding: '.35rem 1rem',
                background: canAdvance() ? 'rgba(56,189,248,.08)' : 'rgba(56,189,248,.02)',
                border: canAdvance() ? '1px solid rgba(56,189,248,.5)' : '1px solid rgba(56,189,248,.1)',
                color: canAdvance() ? '#38bdf8' : 'rgba(56,189,248,.2)',
                cursor: canAdvance() ? 'pointer' : 'not-allowed',
              }}
            >
              {step === 'greet' ? 'BEGIN CALIBRATION ▸' : 'NEXT ▸'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
