import { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';

const PABLO_QUOTES = [
  "I RUN THIS CITY. WELL... I SIT IN THIS CITY.",
  "YOU LOOK LIKE YOU NEED A JOB. I NEED A NAP.",
  "EVERY GREAT EMPIRE WAS BUILT BY SOMEONE WHO DIDN'T WANT TO GET UP.",
  "I'M NOT LAZY. I'M ENERGY EFFICIENT.",
  "THE SALARYMAN GRIND NEVER STOPS. UNLESS IT'S NAPTIME.",
  "I ONCE CHASED MY OWN TAIL FOR 3 HOURS. STILL MORE PRODUCTIVE THAN MOST MEETINGS.",
  "PABLO CORP RULE #1: IF THE BOSS IS SLEEPING, DON'T WAKE HIM.",
  "I'VE AUTOMATED EVERYTHING. EXCEPT BELLY RUBS.",
  "JEAN CLAW HANDLES THE BOTS. I HANDLE THE VIBES.",
  "MY BUSINESS STRATEGY? BARK FIRST, ASK QUESTIONS NEVER.",
  "THEY SAID I COULDN'T RUN A COMPANY. THEY WERE HALF RIGHT.",
  "I'M A MALTESE. WE WERE BRED FOR ROYALTY. NOW I DO SPREADSHEETS.",
  "ATTENTION IS ALL YOU NEED. AND TREATS. DEFINITELY TREATS.",
  "THE WASTES ARE DANGEROUS. I KNOW BECAUSE I READ IT ON A SIGN ONCE.",
  "TAXES? I INVENTED THOSE. YOU'RE WELCOME.",
  "MY MANAGEMENT STYLE IS AGGRESSIVE CUDDLING.",
  "FUN FACT: I'VE NEVER ONCE FETCHED. BENEATH ME.",
  "THE ALGORITHM? I AM THE ALGORITHM.",
  "SUBSCRIBE TO SALARYMAN. OR DON'T. I'LL FIND YOU EITHER WAY.",
];

const ACTIONS = [
  'idle', 'head_tilt', 'tail_wag', 'sit_up', 'yawn', 'paw_wave', 'spin'
] as const;
type PabloAction = typeof ACTIONS[number];

function MalteseBody() {
  const groupRef = useRef<THREE.Group>(null!);
  const headRef = useRef<THREE.Group>(null!);
  const tailRef = useRef<THREE.Mesh>(null!);
  const tongueRef = useRef<THREE.Mesh>(null!);
  const pawLRef = useRef<THREE.Mesh>(null!);
  const pawRRef = useRef<THREE.Mesh>(null!);
  const earLRef = useRef<THREE.Mesh>(null!);
  const earRRef = useRef<THREE.Mesh>(null!);

  const actionRef = useRef<PabloAction>('idle');
  const actionTimerRef = useRef(0);
  const breathRef = useRef(0);

  const furColor = useMemo(() => new THREE.Color('#f5f0e8'), []);
  const noseColor = useMemo(() => new THREE.Color('#1a1a1a'), []);
  const eyeColor = useMemo(() => new THREE.Color('#1c1008'), []);
  const tongueColor = useMemo(() => new THREE.Color('#e8607a'), []);
  const innerEarColor = useMemo(() => new THREE.Color('#f0c4c4'), []);

  useEffect(() => {
    const interval = setInterval(() => {
      const actions: PabloAction[] = ['head_tilt', 'tail_wag', 'sit_up', 'yawn', 'paw_wave', 'spin'];
      actionRef.current = actions[Math.floor(Math.random() * actions.length)];
      actionTimerRef.current = 0;
    }, 3000 + Math.random() * 2500);
    return () => clearInterval(interval);
  }, []);

  useFrame((_, delta) => {
    const t = actionTimerRef.current += delta;
    breathRef.current += delta;
    const breath = Math.sin(breathRef.current * 2.5) * 0.015;
    const action = actionRef.current;

    if (groupRef.current) {
      groupRef.current.scale.y = 1 + breath;
      if (action === 'spin') {
        groupRef.current.rotation.y += delta * 4.5;
      } else {
        groupRef.current.rotation.y += (0 - groupRef.current.rotation.y) * 0.05;
      }
    }

    if (headRef.current) {
      if (action === 'head_tilt') {
        const tiltTarget = Math.sin(t * 3) * 0.3;
        headRef.current.rotation.z += (tiltTarget - headRef.current.rotation.z) * 0.08;
        headRef.current.rotation.x += (0.1 - headRef.current.rotation.x) * 0.05;
      } else if (action === 'yawn') {
        headRef.current.rotation.x += (0.2 - headRef.current.rotation.x) * 0.06;
        headRef.current.rotation.z += (0 - headRef.current.rotation.z) * 0.05;
      } else if (action === 'sit_up') {
        headRef.current.rotation.x += (-0.15 - headRef.current.rotation.x) * 0.06;
        headRef.current.rotation.z += (0 - headRef.current.rotation.z) * 0.05;
      } else {
        headRef.current.rotation.z += (0 - headRef.current.rotation.z) * 0.05;
        headRef.current.rotation.x += (0 - headRef.current.rotation.x) * 0.05;
      }
    }

    if (tailRef.current) {
      const wagSpeed = action === 'tail_wag' ? 12 : 4;
      const wagAmp = action === 'tail_wag' ? 0.6 : 0.2;
      tailRef.current.rotation.z = Math.sin(breathRef.current * wagSpeed) * wagAmp;
    }

    if (tongueRef.current) {
      const show = action === 'yawn' || action === 'tail_wag';
      const targetScale = show ? 1 : 0;
      tongueRef.current.scale.y += (targetScale - tongueRef.current.scale.y) * 0.1;
    }

    if (pawLRef.current && pawRRef.current) {
      if (action === 'paw_wave') {
        const wave = Math.sin(t * 6) * 0.4;
        pawLRef.current.rotation.x += (-0.8 + wave - pawLRef.current.rotation.x) * 0.1;
        pawLRef.current.position.y += (0.35 - pawLRef.current.position.y) * 0.1;
        pawRRef.current.rotation.x += (0 - pawRRef.current.rotation.x) * 0.05;
        pawRRef.current.position.y += (0 - pawRRef.current.position.y) * 0.05;
      } else {
        pawLRef.current.rotation.x += (0 - pawLRef.current.rotation.x) * 0.05;
        pawLRef.current.position.y += (0 - pawLRef.current.position.y) * 0.05;
        pawRRef.current.rotation.x += (0 - pawRRef.current.rotation.x) * 0.05;
        pawRRef.current.position.y += (0 - pawRRef.current.position.y) * 0.05;
      }
    }

    if (earLRef.current && earRRef.current) {
      const earFlop = Math.sin(breathRef.current * 1.8) * 0.08;
      earLRef.current.rotation.z = -0.3 + earFlop;
      earRRef.current.rotation.z = 0.3 - earFlop;
    }
  });

  return (
    <group ref={groupRef} position={[0, -0.3, 0]}>
      <Float speed={1.5} rotationIntensity={0.1} floatIntensity={0.3}>
        {/* Body - rounded fluffy shape */}
        <mesh position={[0, 0.1, 0]}>
          <sphereGeometry args={[0.55, 24, 20]} />
          <meshStandardMaterial color={furColor} roughness={0.9} />
        </mesh>
        {/* Body fur tufts */}
        <mesh position={[0, 0.35, 0.15]}>
          <sphereGeometry args={[0.35, 16, 14]} />
          <meshStandardMaterial color={furColor} roughness={0.95} />
        </mesh>
        <mesh position={[0.25, 0.05, 0.2]}>
          <sphereGeometry args={[0.25, 12, 10]} />
          <meshStandardMaterial color={furColor} roughness={0.95} />
        </mesh>
        <mesh position={[-0.25, 0.05, 0.2]}>
          <sphereGeometry args={[0.25, 12, 10]} />
          <meshStandardMaterial color={furColor} roughness={0.95} />
        </mesh>

        {/* Head group */}
        <group ref={headRef} position={[0, 0.65, 0.2]}>
          {/* Head sphere */}
          <mesh>
            <sphereGeometry args={[0.38, 24, 20]} />
            <meshStandardMaterial color={furColor} roughness={0.85} />
          </mesh>
          {/* Head fur pouf (top) */}
          <mesh position={[0, 0.18, -0.05]}>
            <sphereGeometry args={[0.28, 16, 14]} />
            <meshStandardMaterial color={furColor} roughness={0.95} />
          </mesh>
          {/* Cheek fluff left */}
          <mesh position={[0.22, -0.05, 0.1]}>
            <sphereGeometry args={[0.18, 12, 10]} />
            <meshStandardMaterial color={furColor} roughness={0.95} />
          </mesh>
          {/* Cheek fluff right */}
          <mesh position={[-0.22, -0.05, 0.1]}>
            <sphereGeometry args={[0.18, 12, 10]} />
            <meshStandardMaterial color={furColor} roughness={0.95} />
          </mesh>
          {/* Snout */}
          <mesh position={[0, -0.08, 0.28]}>
            <sphereGeometry args={[0.15, 14, 12]} />
            <meshStandardMaterial color={furColor} roughness={0.85} />
          </mesh>
          {/* Nose */}
          <mesh position={[0, -0.03, 0.4]}>
            <sphereGeometry args={[0.055, 10, 8]} />
            <meshStandardMaterial color={noseColor} roughness={0.3} />
          </mesh>
          {/* Left eye */}
          <mesh position={[0.12, 0.06, 0.3]}>
            <sphereGeometry args={[0.055, 10, 8]} />
            <meshStandardMaterial color={eyeColor} roughness={0.2} />
          </mesh>
          {/* Left eye shine */}
          <mesh position={[0.1, 0.08, 0.35]}>
            <sphereGeometry args={[0.018, 8, 6]} />
            <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.5} />
          </mesh>
          {/* Right eye */}
          <mesh position={[-0.12, 0.06, 0.3]}>
            <sphereGeometry args={[0.055, 10, 8]} />
            <meshStandardMaterial color={eyeColor} roughness={0.2} />
          </mesh>
          {/* Right eye shine */}
          <mesh position={[-0.14, 0.08, 0.35]}>
            <sphereGeometry args={[0.018, 8, 6]} />
            <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.5} />
          </mesh>
          {/* Tongue */}
          <mesh ref={tongueRef} position={[0.03, -0.18, 0.3]} rotation={[0.3, 0, 0]}>
            <boxGeometry args={[0.06, 0.12, 0.03]} />
            <meshStandardMaterial color={tongueColor} roughness={0.6} />
          </mesh>
          {/* Left ear */}
          <mesh ref={earLRef} position={[0.25, 0.22, -0.05]}>
            <sphereGeometry args={[0.12, 10, 8]} />
            <meshStandardMaterial color={furColor} roughness={0.9} />
          </mesh>
          <mesh position={[0.25, 0.19, 0.0]}>
            <sphereGeometry args={[0.06, 8, 6]} />
            <meshStandardMaterial color={innerEarColor} roughness={0.8} />
          </mesh>
          {/* Right ear */}
          <mesh ref={earRRef} position={[-0.25, 0.22, -0.05]}>
            <sphereGeometry args={[0.12, 10, 8]} />
            <meshStandardMaterial color={furColor} roughness={0.9} />
          </mesh>
          <mesh position={[-0.25, 0.19, 0.0]}>
            <sphereGeometry args={[0.06, 8, 6]} />
            <meshStandardMaterial color={innerEarColor} roughness={0.8} />
          </mesh>
        </group>

        {/* Front left paw */}
        <mesh ref={pawLRef} position={[0.22, -0.35, 0.25]}>
          <sphereGeometry args={[0.12, 10, 8]} />
          <meshStandardMaterial color={furColor} roughness={0.9} />
        </mesh>
        {/* Front right paw */}
        <mesh ref={pawRRef} position={[-0.22, -0.35, 0.25]}>
          <sphereGeometry args={[0.12, 10, 8]} />
          <meshStandardMaterial color={furColor} roughness={0.9} />
        </mesh>
        {/* Back left paw */}
        <mesh position={[0.25, -0.4, -0.2]}>
          <sphereGeometry args={[0.13, 10, 8]} />
          <meshStandardMaterial color={furColor} roughness={0.9} />
        </mesh>
        {/* Back right paw */}
        <mesh position={[-0.25, -0.4, -0.2]}>
          <sphereGeometry args={[0.13, 10, 8]} />
          <meshStandardMaterial color={furColor} roughness={0.9} />
        </mesh>

        {/* Tail */}
        <mesh ref={tailRef} position={[0, 0.3, -0.45]}>
          <sphereGeometry args={[0.15, 10, 8]} />
          <meshStandardMaterial color={furColor} roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.42, -0.5]}>
          <sphereGeometry args={[0.1, 8, 6]} />
          <meshStandardMaterial color={furColor} roughness={0.95} />
        </mesh>
      </Float>
    </group>
  );
}

function PabloScene() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 5, 4]} intensity={1.2} castShadow color="#fff5ee" />
      <directionalLight position={[-2, 3, -1]} intensity={0.3} color="#a8d8ff" />
      <pointLight position={[0, 2, 3]} intensity={0.5} color="#38bdf8" />
      <MalteseBody />
      <ContactShadows position={[0, -0.72, 0]} opacity={0.4} scale={3} blur={2.5} far={2} />
      <Environment preset="city" />
    </>
  );
}

function PabloFallback2D() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame(f => f + 1), 120);
    return () => clearInterval(id);
  }, []);
  const bobY = Math.sin(frame * 0.15) * 4;
  const tailWag = Math.sin(frame * 0.4) * 8;
  const earFlop = Math.sin(frame * 0.12) * 3;
  const blink = frame % 30 < 2;
  const tongueOut = frame % 50 < 25;
  return (
    <div style={{ width: '100%', aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <svg viewBox="0 0 200 180" width="260" height="200" style={{ transform: `translateY(${bobY}px)` }}>
        <ellipse cx="100" cy="165" rx="45" ry="6" fill="rgba(0,0,0,0.2)" />
        <ellipse cx="100" cy="120" rx="38" ry="32" fill="#f5f0e8" />
        <ellipse cx="80" cy="115" rx="14" ry="10" fill="#f5f0e8" />
        <ellipse cx="120" cy="115" rx="14" ry="10" fill="#f5f0e8" />
        <ellipse cx="85" cy="145" rx="9" ry="10" fill="#f5f0e8" />
        <ellipse cx="115" cy="145" rx="9" ry="10" fill="#f5f0e8" />
        <g transform={`translate(145, 95) rotate(${tailWag})`}>
          <ellipse cx="0" cy="-8" rx="10" ry="12" fill="#f5f0e8" />
          <ellipse cx="2" cy="-18" rx="7" ry="8" fill="#f5f0e8" />
        </g>
        <ellipse cx="100" cy="82" rx="28" ry="25" fill="#f5f0e8" />
        <ellipse cx="100" cy="68" rx="20" ry="16" fill="#f5f0e8" />
        <g transform={`translate(78, 65) rotate(${-12 + earFlop})`}>
          <ellipse cx="0" cy="0" rx="9" ry="11" fill="#f5f0e8" />
          <ellipse cx="1" cy="1" rx="4" ry="5" fill="#f0c4c4" />
        </g>
        <g transform={`translate(122, 65) rotate(${12 - earFlop})`}>
          <ellipse cx="0" cy="0" rx="9" ry="11" fill="#f5f0e8" />
          <ellipse cx="-1" cy="1" rx="4" ry="5" fill="#f0c4c4" />
        </g>
        <ellipse cx="100" cy="88" rx="10" ry="8" fill="#f5f0e8" />
        <ellipse cx="100" cy="84" rx="4" ry="3" fill="#1a1a1a" />
        {!blink && <circle cx="91" cy="78" r="4" fill="#1c1008" />}
        {!blink && <circle cx="109" cy="78" r="4" fill="#1c1008" />}
        {!blink && <circle cx="89.5" cy="76.5" r="1.2" fill="white" />}
        {!blink && <circle cx="107.5" cy="76.5" r="1.2" fill="white" />}
        {blink && <line x1="87" y1="78" x2="95" y2="78" stroke="#1c1008" strokeWidth="2" strokeLinecap="round" />}
        {blink && <line x1="105" y1="78" x2="113" y2="78" stroke="#1c1008" strokeWidth="2" strokeLinecap="round" />}
        {tongueOut && <ellipse cx="103" cy="93" rx="3" ry="5" fill="#e8607a" />}
      </svg>
    </div>
  );
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export default function PabloMascot() {
  const [quote, setQuote] = useState('');
  const [quoteVisible, setQuoteVisible] = useState(false);
  const [nameLabel, setNameLabel] = useState(true);
  const [webgl] = useState(() => hasWebGL());
  const [canvasError, setCanvasError] = useState(false);

  useEffect(() => {
    setQuote(PABLO_QUOTES[Math.floor(Math.random() * PABLO_QUOTES.length)]);
    setQuoteVisible(true);

    const interval = setInterval(() => {
      setQuoteVisible(false);
      setTimeout(() => {
        setQuote(PABLO_QUOTES[Math.floor(Math.random() * PABLO_QUOTES.length)]);
        setQuoteVisible(true);
      }, 6000);
    }, 6500);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setNameLabel(false), 4000);
    return () => clearTimeout(t);
  }, []);

  const use3D = webgl && !canvasError;

  return (
    <div className="relative w-full" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div style={{ width: '100%', position: 'relative' }}>
        {use3D ? (
          <div style={{ width: '100%', aspectRatio: '4/3', position: 'relative' }}>
            <Canvas
              camera={{ position: [0, 0.8, 2.8], fov: 35 }}
              style={{ borderRadius: 16, background: 'transparent' }}
              gl={{ alpha: true, antialias: true }}
              onCreated={() => {}}
              fallback={<PabloFallback2D />}
              onError={() => setCanvasError(true)}
            >
              <PabloScene />
            </Canvas>
          </div>
        ) : (
          <PabloFallback2D />
        )}

        <AnimatePresence>
          {nameLabel && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              style={{
                position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(56,189,248,0.3)',
                borderRadius: 8, padding: '4px 14px',
                fontFamily: "'Share Tech Mono', 'VT323', monospace",
                fontSize: 11, letterSpacing: '0.15em', color: '#38bdf8',
                textTransform: 'uppercase', whiteSpace: 'nowrap',
              }}
            >
              PABLO · CHIEF EXECUTIVE DOG
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {quoteVisible && (
          <motion.div
            key={quote}
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            style={{
              position: 'relative',
              marginTop: 8,
              background: 'rgba(0,8,16,0.85)',
              border: '1px solid rgba(56,189,248,0.2)',
              borderRadius: 12,
              padding: '12px 18px',
              maxWidth: 400,
              margin: '8px auto 0',
            }}
          >
            <div style={{
              position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)',
              width: 0, height: 0,
              borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
              borderBottom: '6px solid rgba(56,189,248,0.2)',
            }} />
            <p style={{
              fontFamily: "'VT323', 'Share Tech Mono', monospace",
              fontSize: 14,
              color: 'rgba(56,189,248,0.85)',
              lineHeight: 1.5,
              textAlign: 'center',
              letterSpacing: '0.04em',
              margin: 0,
            }}>
              "{quote}"
            </p>
            <p style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 9,
              color: 'rgba(56,189,248,0.35)',
              textAlign: 'right',
              marginTop: 6,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}>
              — PABLO, CEO
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
