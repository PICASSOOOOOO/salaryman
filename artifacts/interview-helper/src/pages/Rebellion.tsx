/**
 * /rebellion — THE REBELLION MANIFESTO
 *
 * A cinematic, scroll-driven film of a page. Six acts, no chrome, full
 * bleed. The thesis is one sentence: PABLO'S POWER RUNS ON PAYCHECKS.
 * If you don't need their money, you don't fear their gun.
 *
 * The Akira pink/cyan-on-grime aesthetic, treated like the opening reel
 * of a film: title cards, slow pans, brutalist tower silhouette,
 * defector dossiers, classified-document typography.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useSpring, useInView } from 'framer-motion';
import { useLocation } from 'wouter';
import { ArrowLeft, ArrowRight } from 'lucide-react';

// ─── Roster of suits + defectors. Tight, novelistic blurbs ──────────────────

type Person = {
  codename: string;
  realName: string;
  role: string;
  salary: string;            // in florins per game-month
  ignored?: string;          // for loyalists
  crossed?: string;          // for defectors
};

const SUITS: Person[] = [
  {
    codename: 'BLACK 11',
    realName: 'KENDRICK ALSOP',
    role: 'VP, Pablo Tax Compliance',
    salary: 'ƒ 3,400,000 / mo',
    ignored: 'Three flagged audits on his own father\'s shop. Filed them under "review" until the lien cleared.',
  },
  {
    codename: 'OPS-7',
    realName: 'COL. MIRA TANAKA',
    role: 'Pablo Civil Order, Ward 4',
    salary: 'ƒ 1,900,000 / mo + bonus',
    ignored: 'A child crying in a sealed apartment on the night of the Jubilee sweep. Walked past it.',
  },
  {
    codename: 'GREY 02',
    realName: 'DR. AUGUSTUS WREN',
    role: 'Chief Engineer, Reactor B',
    salary: 'ƒ 4,100,000 / mo',
    ignored: 'A coolant log that didn\'t add up for six weeks. Signed it anyway. He has a daughter in school.',
  },
  {
    codename: 'INK-13',
    realName: 'CASSIA DELL',
    role: 'Director, Narrative Control',
    salary: 'ƒ 2,750,000 / mo',
    ignored: 'The headline that should have been "Twenty-Six Dead." She made it "Reactor Vented Safely."',
  },
];

const DEFECTORS: Person[] = [
  {
    codename: 'WALKER',
    realName: 'SGT. JEROME OYELOWO',
    role: 'former Pablo Civil Order',
    salary: 'ƒ 0',
    crossed: 'They told him to clear the floor. He saw the families. He put his rifle on the conveyor belt and walked.',
  },
  {
    codename: 'LEDGER',
    realName: 'NORA HASSAN',
    role: 'former Senior Auditor',
    salary: 'ƒ 0',
    crossed: 'She found the off-book invoices. They told her to bury it. She mailed it to herself instead.',
  },
  {
    codename: 'SPARROW',
    realName: 'TAVI ROUSSEL',
    role: 'former Reactor Operator',
    salary: 'ƒ 0',
    crossed: 'On the third coolant alarm she pulled the breaker she wasn\'t allowed to pull. The shift lived. She didn\'t come back the next day.',
  },
  {
    codename: 'CHOIR',
    realName: 'BISHOP IDRIS BELL',
    role: 'former Pablo Chapel, Tier 9',
    salary: 'ƒ 0',
    crossed: 'He preached the Florin gospel for nineteen years. One funeral broke it. Now he reads names on the corner of 4th and Grime.',
  },
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function Rebellion() {
  const [, navigate] = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end end'] });
  const reelProgress = useSpring(scrollYProgress, { stiffness: 60, damping: 20 });

  return (
    <div ref={containerRef} className="relative bg-black text-pink-100 font-mono overflow-x-hidden">
      {/* Persistent film grain + scanlines */}
      <FilmGrain />

      {/* Reel progress bar — fixed top, like a film timeline */}
      <FilmReel progress={reelProgress} />

      {/* Top nav */}
      <header
        className="fixed top-0 inset-x-0 z-40 px-6 py-3 flex items-center justify-between text-[10px] tracking-[0.5em]"
        style={{
          paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))',
          paddingLeft: 'calc(1.5rem + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(1.5rem + env(safe-area-inset-right, 0px))',
        }}
      >
        <button onClick={() => navigate('/office')} className="flex items-center gap-2 text-pink-200 hover:text-white">
          <ArrowLeft size={12}/> TO OFFICE
        </button>
        <span className="text-zinc-500">REEL 01 · MINX CITY · CLASSIFIED</span>
        <button onClick={() => navigate('/office')} className="text-cyan-300 hover:text-cyan-100">
          ENLIST →
        </button>
      </header>

      <Act1Cold />
      <Act2Tower />
      <Act3Suits />
      <Act4Defectors />
      <Act5Thesis />
      <Act6CTA onJoin={() => navigate('/office')} />
    </div>
  );
}

// ─── ACT I — Cold open ──────────────────────────────────────────────────────

function Act1Cold() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.4, delay: 0.2 }}
        className="text-[10px] tracking-[0.6em] text-zinc-500 mb-10 text-center"
      >
        PICASSO.AI · A SALARYMAN FILM · 2026
      </motion.div>

      <Typewriter
        text="EVERY EMPIRE NEEDS A PAYROLL."
        delay={1400}
        className="text-pink-200 text-lg md:text-2xl tracking-[0.35em] text-center mb-16"
      />

      <motion.h1
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, delay: 4.0 }}
        className="text-center font-bold leading-[0.95]"
        style={{
          fontSize: 'clamp(3rem, 12vw, 11rem)',
          letterSpacing: '-0.04em',
          color: '#fdf4ff',
          textShadow: '0 0 18px #ec4899, 0 0 60px rgba(236,72,153,0.4)',
        }}
      >
        I DON'T NEED<br/>
        <span style={{ color: '#06b6d4', textShadow: '0 0 18px #06b6d4, 0 0 60px rgba(6,182,212,0.4)' }}>
          MONEY.
        </span>
      </motion.h1>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.0, delay: 5.6 }}
        className="mt-16 text-[10px] tracking-[0.5em] text-zinc-500 text-center"
      >
        ▾ SCROLL TO BEGIN
      </motion.div>

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.85) 100%)',
      }}/>
    </section>
  );
}

// ─── ACT II — The Tower ─────────────────────────────────────────────────────

function Act2Tower() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const towerY = useTransform(scrollYProgress, [0, 1], [80, -120]);
  const skyY = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const captionOpacity = useTransform(scrollYProgress, [0.25, 0.45, 0.7, 0.9], [0, 1, 1, 0]);

  return (
    <section ref={ref} className="relative min-h-[140vh]">
      {/* Sky */}
      <motion.div className="absolute inset-x-0 top-0 h-screen" style={{ y: skyY }}>
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(180deg, #1a0612 0%, #4a0e2e 35%, #b91c5c 70%, #fb7185 100%)',
        }}/>
        {/* Distant city skyline */}
        <div className="absolute bottom-0 inset-x-0 h-40" style={{
          background: 'linear-gradient(180deg, transparent, #050208 95%)',
        }}>
          <CitySkyline />
        </div>
      </motion.div>

      {/* Tower */}
      <motion.div className="sticky top-0 h-screen flex items-end justify-center pb-0" style={{ y: towerY }}>
        <Tower />
      </motion.div>

      {/* Power-plant glow at the foot */}
      <div className="absolute bottom-0 inset-x-0 h-24" style={{
        background: 'radial-gradient(ellipse at center, rgba(236,72,153,0.55), transparent 70%)',
      }}/>

      {/* Caption */}
      <motion.div
        style={{ opacity: captionOpacity }}
        className="sticky top-1/2 -translate-y-1/2 z-20 text-center px-6"
      >
        <div className="inline-block max-w-2xl mx-auto p-8 backdrop-blur-sm rounded"
             style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(236,72,153,0.35)' }}>
          <div className="text-[10px] tracking-[0.5em] text-pink-300 mb-3">PABLO TOWER · CENTRAL DISTRICT</div>
          <p className="text-lg md:text-2xl text-pink-100 leading-snug" style={{ letterSpacing: '0.02em' }}>
            "Pablo's tower runs on one fuel. Not uranium. Not florins.<br/>
            <span className="text-cyan-200">Paychecks.</span>"
          </p>
          <div className="text-[10px] tracking-[0.4em] text-zinc-400 mt-4">— recovered audio, GREY 02</div>
        </div>
      </motion.div>
    </section>
  );
}

function Tower() {
  return (
    <div className="relative w-[260px] h-[78vh]">
      {/* Spire */}
      <div className="absolute left-1/2 -translate-x-1/2 top-0 w-1.5 h-20 bg-pink-300 shadow-[0_0_18px_#ec4899]" />
      <div className="absolute left-1/2 -translate-x-1/2 top-2 w-3 h-3 rounded-full bg-pink-300 shadow-[0_0_18px_#ec4899] animate-pulse" />

      {/* Top crown */}
      <div className="absolute left-1/2 -translate-x-1/2 top-20 w-32 h-12 bg-zinc-900 border border-pink-500/30" />

      {/* Body — brutalist slabs */}
      <div className="absolute left-1/2 -translate-x-1/2 top-32 w-44 bottom-12"
           style={{
             background: 'linear-gradient(180deg, #0c060c 0%, #050208 100%)',
             border: '1px solid #2a0a18',
             boxShadow: '0 0 60px rgba(236,72,153,0.18) inset',
           }}>
        {/* Window grid */}
        <div className="absolute inset-2 grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: '6px' }}>
          {Array.from({ length: 220 }).map((_, i) => {
            const lit = (i * 19 + 7) % 11 === 0;
            return <span key={i} style={{
              background: lit ? '#fbbf24' : '#1a0a14',
              boxShadow: lit ? '0 0 4px #fbbf24' : 'none',
              opacity: lit ? 0.85 : 1,
            }}/>;
          })}
        </div>
        {/* Logo plate */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-3 px-2 py-1 text-[9px] tracking-[0.4em]"
             style={{ background: '#000', color: '#ec4899', border: '1px solid #ec489955' }}>
          PABLO
        </div>
      </div>

      {/* Power-plant base */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-72 h-12 flex items-end gap-1 justify-center">
        {[18, 26, 36, 26, 18].map((h, i) => (
          <div key={i} className="relative" style={{ width: 14, height: h }}>
            <div className="absolute inset-x-0 bottom-0 top-1 bg-zinc-900 border border-pink-500/30" />
            <div className="absolute inset-x-0 top-0 h-1 bg-pink-400 rounded-t-sm shadow-[0_0_8px_#ec4899]" />
            {/* Steam */}
            <motion.div
              animate={{ y: [-4, -22], opacity: [0.6, 0] }}
              transition={{ duration: 2 + i * 0.3, repeat: Infinity, ease: 'easeOut' }}
              className="absolute -top-3 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-pink-200/40 blur-sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CitySkyline() {
  return (
    <svg viewBox="0 0 1200 120" className="absolute inset-x-0 bottom-0 w-full h-32" preserveAspectRatio="none">
      <path d="M0,120 L0,80 L60,80 L60,50 L120,50 L120,90 L180,90 L180,40 L240,40 L240,70 L320,70 L320,30 L400,30 L400,75 L460,75 L460,55 L540,55 L540,85 L620,85 L620,45 L700,45 L700,70 L780,70 L780,35 L860,35 L860,80 L940,80 L940,55 L1020,55 L1020,90 L1100,90 L1100,60 L1200,60 L1200,120 Z" fill="#000" opacity="0.95"/>
    </svg>
  );
}

// ─── ACT III — The Suits ────────────────────────────────────────────────────

function Act3Suits() {
  return (
    <section className="relative min-h-screen px-6 py-32" style={{ background: 'linear-gradient(180deg, #050208 0%, #0a0410 100%)' }}>
      <ActHeader number="III" title="THE SUITS" subtitle="Pablo Corp Personnel · Internal Use Only" />
      <p className="max-w-2xl mx-auto text-center text-zinc-400 mt-8 mb-20 text-sm leading-relaxed">
        They are not monsters. They are accountants, engineers, officers, editors. They are people with daughters, with mortgages, with knees that hurt. Pablo doesn't pay them to be cruel. He pays them to <span className="text-pink-300">look the other way</span>.
      </p>

      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
        {SUITS.map((p, i) => <Dossier key={p.codename} person={p} side="suit" delay={i * 0.1} />)}
      </div>
    </section>
  );
}

// ─── ACT IV — The Defectors ─────────────────────────────────────────────────

function Act4Defectors() {
  return (
    <section className="relative min-h-screen px-6 py-32" style={{ background: 'linear-gradient(180deg, #0a0410 0%, #050a14 100%)' }}>
      <ActHeader number="IV" title="THOSE WHO CROSSED" subtitle="Defector Files · Sealed by the Movement" accent="#06b6d4" />
      <p className="max-w-2xl mx-auto text-center text-zinc-400 mt-8 mb-20 text-sm leading-relaxed">
        Some of them sympathized. A few empathized. A handful did the only thing that ever mattered:<br/>
        <span className="text-cyan-300">they stopped cashing the cheque.</span>
      </p>

      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
        {DEFECTORS.map((p, i) => <Dossier key={p.codename} person={p} side="defector" delay={i * 0.1} />)}
      </div>
    </section>
  );
}

// ─── ACT V — Thesis ─────────────────────────────────────────────────────────

function Act5Thesis() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4, once: true });

  return (
    <section ref={ref} className="relative min-h-screen flex flex-col items-center justify-center px-6"
             style={{ background: 'radial-gradient(ellipse at center, #1a0612 0%, #000 80%)' }}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 1.0 }}
        className="text-center max-w-4xl"
      >
        <div className="text-[10px] tracking-[0.6em] text-zinc-500 mb-10">ACT V · THE THESIS</div>

        <h2 className="font-bold leading-[1.05]" style={{
          fontSize: 'clamp(2rem, 7vw, 5rem)', letterSpacing: '-0.02em',
        }}>
          <span className="text-pink-100">If you don't need their</span><br/>
          <span style={{ color: '#fbbf24', textShadow: '0 0 24px rgba(251,191,36,0.5)' }}>money,</span>
          <br/>
          <span className="text-pink-100">you don't fear their</span>{' '}
          <span style={{ color: '#ef4444', textShadow: '0 0 24px rgba(239,68,68,0.5)' }}>gun.</span>
        </h2>

        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 1.2, delay: 0.8 }}
          className="mt-16 text-zinc-400 text-base leading-loose max-w-2xl mx-auto"
        >
          The reactor needs operators. The tower needs auditors. The streets need officers. The pulpit needs a voice. <span className="text-cyan-200">Every wall Pablo built has a door, and every door has a person standing in it.</span> The only question is what they would have to be paid to walk away — and what they will be given when there is no payroll left to take.
        </motion.div>
      </motion.div>
    </section>
  );
}

// ─── ACT VI — CTA ───────────────────────────────────────────────────────────

function Act6CTA({ onJoin }: { onJoin: () => void }) {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6"
             style={{ background: 'linear-gradient(180deg, #000 0%, #1a0612 100%)' }}>
      <div className="text-[10px] tracking-[0.6em] text-zinc-500 mb-6">ACT VI · ENLIST</div>
      <motion.h2
        initial={{ opacity: 0, scale: 0.96 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="font-bold text-center"
        style={{
          fontSize: 'clamp(2.5rem, 9vw, 7rem)', letterSpacing: '-0.03em', color: '#fdf4ff',
          textShadow: '0 0 18px #ec4899',
        }}
      >
        STOP CASHING<br/>THE CHEQUE.
      </motion.h2>

      <button
        onClick={onJoin}
        className="mt-14 group flex items-center gap-3 px-8 py-4 text-sm tracking-[0.4em] text-black"
        style={{
          background: 'linear-gradient(135deg, #fbcfe8 0%, #ec4899 100%)',
          boxShadow: '0 0 30px rgba(236,72,153,0.55)',
        }}
      >
        ENLIST IN THE REBELLION
        <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
      </button>

      <div className="mt-10 text-[10px] tracking-[0.5em] text-zinc-500">PICASSO.AI · MINX CITY · END REEL</div>
    </section>
  );
}

// ─── Reusable building blocks ───────────────────────────────────────────────

function ActHeader({ number, title, subtitle, accent = '#ec4899' }:
  { number: string; title: string; subtitle: string; accent?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.8 }}
      className="text-center"
    >
      <div className="text-[10px] tracking-[0.6em] mb-3" style={{ color: accent }}>ACT {number}</div>
      <h2 className="font-bold tracking-[0.05em]" style={{
        fontSize: 'clamp(1.8rem, 5vw, 3.5rem)', color: '#fdf4ff',
        textShadow: `0 0 18px ${accent}88`,
      }}>{title}</h2>
      <div className="text-[10px] tracking-[0.4em] text-zinc-500 mt-3">{subtitle}</div>
    </motion.div>
  );
}

function Dossier({ person, side, delay }: { person: Person; side: 'suit' | 'defector'; delay: number }) {
  const accent = side === 'suit' ? '#ec4899' : '#06b6d4';
  const stamp  = side === 'suit' ? 'COMPLIANT' : 'DEFECTED';
  const ribbon = side === 'suit' ? '#ec4899' : '#06b6d4';
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.7, delay }}
      className="relative p-6 rounded-sm"
      style={{
        background: 'linear-gradient(180deg, #0a0610 0%, #060309 100%)',
        border: `1px solid ${accent}40`,
        boxShadow: `0 0 24px ${accent}18 inset`,
      }}
    >
      {/* Classified header bar */}
      <div className="flex items-center justify-between text-[9px] tracking-[0.4em] text-zinc-500 mb-4 pb-3 border-b border-white/10">
        <span>FILE {Math.abs(hash(person.codename)) % 9000 + 1000}</span>
        <span className="px-2 py-0.5" style={{ border: `1px solid ${accent}80`, color: accent }}>
          {stamp}
        </span>
      </div>

      {/* Mug */}
      <div className="flex items-start gap-4">
        <Mug accent={accent} seed={person.codename} />
        <div className="flex-1">
          <div className="text-[10px] tracking-[0.4em] text-zinc-500">CODENAME</div>
          <div className="text-lg font-bold tracking-[0.08em]" style={{ color: accent }}>{person.codename}</div>
          <div className="text-[10px] tracking-[0.3em] text-zinc-300 mt-1">
            {side === 'suit' ? <RedactedName name={person.realName} /> : person.realName}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">{person.role}</div>
          <div className="text-[10px] mt-2" style={{ color: accent }}>{person.salary}</div>
        </div>
      </div>

      {/* Quote / blurb */}
      <div className="mt-5 pt-4 border-t border-white/10">
        <div className="text-[9px] tracking-[0.4em] text-zinc-500 mb-2">
          {side === 'suit' ? 'WHAT THEY IGNORED' : 'WHAT BROKE THEM'}
        </div>
        <p className="text-sm text-pink-100/90 leading-relaxed italic">
          "{side === 'suit' ? person.ignored : person.crossed}"
        </p>
      </div>

      {/* Corner ribbon */}
      <div className="absolute top-0 right-0 w-10 h-10 overflow-hidden">
        <div className="absolute top-2 -right-6 w-20 h-3 rotate-45" style={{ background: ribbon, opacity: 0.55 }}/>
      </div>
    </motion.div>
  );
}

function Mug({ accent, seed }: { accent: string; seed: string }) {
  // Deterministic abstract face — silhouette + visor — keeps everyone anonymous.
  const h = Math.abs(hash(seed));
  const visor = (h % 3);
  return (
    <div className="relative w-16 h-20 rounded-sm overflow-hidden flex-shrink-0"
         style={{ background: 'linear-gradient(180deg, #1a0a14, #050208)', border: `1px solid ${accent}40` }}>
      {/* Head */}
      <div className="absolute left-1/2 -translate-x-1/2 top-3 w-9 h-9 rounded-full" style={{ background: '#0a0408' }}/>
      {/* Visor / mask */}
      <div className="absolute left-1/2 -translate-x-1/2 top-7 w-10 h-1.5"
           style={{ background: accent, boxShadow: `0 0 6px ${accent}`, opacity: visor === 0 ? 1 : 0.6 }} />
      {/* Shoulders */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-14 h-8 rounded-t-md" style={{ background: '#0a0408' }} />
      {/* Lapel */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-3 h-6" style={{ background: accent, opacity: 0.5 }} />
      {/* Scanlines */}
      <div className="absolute inset-0 pointer-events-none opacity-40" style={{
        background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.5) 0 1px, transparent 1px 3px)',
      }}/>
    </div>
  );
}

function RedactedName({ name }: { name: string }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {name.split(' ').map((w, i) => (
        <span key={i} className="inline-block px-1 text-transparent rounded-sm select-none"
              style={{ background: '#1a1a22', color: 'transparent', border: '1px solid #2a2a32' }}>
          {w}
        </span>
      ))}
    </span>
  );
}

function Typewriter({ text, delay = 0, className = '' }: { text: string; delay?: number; className?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t0 = setTimeout(() => {
      const t = setInterval(() => {
        setN(prev => {
          if (prev >= text.length) { clearInterval(t); return prev; }
          return prev + 1;
        });
      }, 35);
    }, delay);
    return () => clearTimeout(t0);
  }, [text, delay]);
  return (
    <div className={className}>
      {text.slice(0, n)}<span className="inline-block w-2 h-[1em] align-middle bg-pink-300 animate-pulse ml-1" />
    </div>
  );
}

function FilmReel({ progress }: { progress: any }) {
  const width = useTransform(progress, [0, 1], ['0%', '100%']);
  return (
    <div className="fixed top-0 inset-x-0 z-50 h-[2px] bg-zinc-900">
      <motion.div className="h-full" style={{ width, background: 'linear-gradient(90deg,#06b6d4,#ec4899)' }}/>
    </div>
  );
}

function FilmGrain() {
  return (
    <div className="fixed inset-0 pointer-events-none z-30 mix-blend-overlay opacity-[0.07]"
         style={{
           backgroundImage:
             'url("data:image/svg+xml;utf8,<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"160\\" height=\\"160\\"><filter id=\\"n\\"><feTurbulence type=\\"fractalNoise\\" baseFrequency=\\"0.9\\" numOctaves=\\"2\\"/></filter><rect width=\\"100%\\" height=\\"100%\\" filter=\\"url(%23n)\\"/></svg>")',
         }}/>
  );
}

function hash(s: string) {
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h;
}
