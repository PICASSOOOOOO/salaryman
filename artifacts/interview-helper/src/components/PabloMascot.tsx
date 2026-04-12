import { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';

const SALARYMAN_QUOTES = [
  "THE GRIND DOESN'T STOP. THE GRIND NEVER STOPS.",
  "I DIDN'T CHOOSE THE SALARYMAN LIFE. I SIGNED A CONTRACT.",
  "MEETINGS COULD HAVE BEEN EMAILS. EMAILS COULD HAVE BEEN SILENCE.",
  "MY TIE IS RED BECAUSE IT'S STAINED WITH AMBITION.",
  "COFFEE IS NOT A BEVERAGE. IT'S INFRASTRUCTURE.",
  "I'VE OPTIMIZED MY COMMUTE DOWN TO 47 STEPS.",
  "WORK-LIFE BALANCE IS A MYTH INVENTED BY PEOPLE WHO DON'T WORK.",
  "THEY SAID DRESS FOR THE JOB YOU WANT. SO I NEVER TAKE THE SUIT OFF.",
  "I DON'T WALK TO WORK. WORK WALKS TO ME. BUT I STILL WALK.",
  "EVERY EMPIRE STARTS WITH ONE MAN IN A SUIT.",
  "MY BRIEFCASE CONTAINS THE FUTURE. AND A SANDWICH.",
  "THE EARLY BIRD GETS THE WORM. I GET THE QUARTERLY BONUS.",
  "SUBSCRIBE TO SALARYMAN. YOUR BOSS ALREADY DID.",
  "I'VE BEEN WALKING TO WORK SINCE BEFORE THERE WAS WORK.",
  "PABLO CORP RUNS ON TWO THINGS: COFFEE AND FEAR.",
  "THE ALGORITHM? I TRAINED IT DURING MY LUNCH BREAK.",
  "JEAN CLAW HANDLES THE BOTS. I HANDLE EVERYTHING ELSE.",
  "SOME PEOPLE SEE A COMMUTE. I SEE CHARACTER DEVELOPMENT.",
];

function SalarymanSideView() {
  const groupRef = useRef<THREE.Group>(null!);
  const frontLegRef = useRef<THREE.Group>(null!);
  const backLegRef = useRef<THREE.Group>(null!);
  const frontArmRef = useRef<THREE.Group>(null!);
  const backArmRef = useRef<THREE.Group>(null!);
  const briefcaseRef = useRef<THREE.Group>(null!);
  const tieRef = useRef<THREE.Mesh>(null!);
  const hairBangRef = useRef<THREE.Mesh>(null!);

  const walkRef = useRef(0);
  const posXRef = useRef(-2.5);

  const suitColor = useMemo(() => new THREE.Color('#1a1a2e'), []);
  const skinColor = useMemo(() => new THREE.Color('#f2d4b0'), []);
  const hairColor = useMemo(() => new THREE.Color('#0a0a0a'), []);
  const tieColor = useMemo(() => new THREE.Color('#cc2233'), []);
  const shoeColor = useMemo(() => new THREE.Color('#0e0e0e'), []);
  const pantsColor = useMemo(() => new THREE.Color('#16162a'), []);
  const briefcaseColor = useMemo(() => new THREE.Color('#2a1810'), []);

  useFrame((_, delta) => {
    walkRef.current += delta * 4;
    const t = walkRef.current;
    const s = Math.sin(t);

    posXRef.current += delta * 0.6;
    if (posXRef.current > 3) posXRef.current = -3;

    if (groupRef.current) {
      groupRef.current.position.x = posXRef.current;
      groupRef.current.position.y = Math.abs(Math.sin(t * 2)) * 0.03;
    }

    if (frontLegRef.current) frontLegRef.current.rotation.x = s * 0.5;
    if (backLegRef.current) backLegRef.current.rotation.x = -s * 0.5;
    if (frontArmRef.current) frontArmRef.current.rotation.x = -s * 0.4;
    if (backArmRef.current) backArmRef.current.rotation.x = s * 0.4;
    if (briefcaseRef.current) briefcaseRef.current.rotation.x = s * 0.2;
    if (tieRef.current) tieRef.current.rotation.x = s * 0.12;
    if (hairBangRef.current) hairBangRef.current.rotation.z = Math.sin(t * 2) * 0.04;
  });

  return (
    <group ref={groupRef} rotation={[0, -Math.PI / 2, 0]} scale={0.75} position={[0, -0.95, 0]}>
      <group ref={backLegRef} position={[0, 0.45, -0.05]}>
        <mesh position={[0, -0.22, 0]}>
          <capsuleGeometry args={[0.06, 0.32, 8, 12]} />
          <meshStandardMaterial color={pantsColor} roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.44, 0.03]}>
          <boxGeometry args={[0.1, 0.06, 0.16]} />
          <meshStandardMaterial color={shoeColor} roughness={0.3} metalness={0.1} />
        </mesh>
      </group>

      <group ref={backArmRef} position={[0, 1.15, -0.08]}>
        <mesh position={[0, -0.18, 0]}>
          <capsuleGeometry args={[0.045, 0.28, 6, 10]} />
          <meshStandardMaterial color={suitColor} roughness={0.65} />
        </mesh>
        <mesh position={[0, -0.36, 0]}>
          <sphereGeometry args={[0.04, 8, 6]} />
          <meshStandardMaterial color={skinColor} roughness={0.5} />
        </mesh>
      </group>

      <mesh position={[0, 0.95, 0]}>
        <capsuleGeometry args={[0.16, 0.35, 10, 14]} />
        <meshStandardMaterial color={suitColor} roughness={0.6} />
      </mesh>

      <mesh position={[0, 1.2, 0.1]}>
        <boxGeometry args={[0.08, 0.12, 0.01]} />
        <meshStandardMaterial color="#eee" roughness={0.5} />
      </mesh>

      <mesh ref={tieRef} position={[0, 1.0, 0.12]}>
        <boxGeometry args={[0.04, 0.22, 0.01]} />
        <meshStandardMaterial color={tieColor} roughness={0.35} />
      </mesh>

      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[0.26, 0.06, 0.16]} />
        <meshStandardMaterial color="#111122" roughness={0.3} metalness={0.15} />
      </mesh>

      <group ref={frontLegRef} position={[0, 0.45, 0.05]}>
        <mesh position={[0, -0.22, 0]}>
          <capsuleGeometry args={[0.065, 0.32, 8, 12]} />
          <meshStandardMaterial color={pantsColor} roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.44, 0.03]}>
          <boxGeometry args={[0.1, 0.06, 0.16]} />
          <meshStandardMaterial color={shoeColor} roughness={0.3} metalness={0.1} />
        </mesh>
      </group>

      <group ref={frontArmRef} position={[0, 1.15, 0.12]}>
        <mesh position={[0, -0.18, 0]}>
          <capsuleGeometry args={[0.048, 0.28, 6, 10]} />
          <meshStandardMaterial color={suitColor} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.36, 0]}>
          <sphereGeometry args={[0.042, 8, 6]} />
          <meshStandardMaterial color={skinColor} roughness={0.5} />
        </mesh>
        <group ref={briefcaseRef} position={[0, -0.42, 0.02]}>
          <mesh>
            <boxGeometry args={[0.04, 0.16, 0.22]} />
            <meshStandardMaterial color={briefcaseColor} roughness={0.45} metalness={0.15} />
          </mesh>
          <mesh position={[0, 0.09, 0]}>
            <boxGeometry args={[0.03, 0.015, 0.1]} />
            <meshStandardMaterial color="#c8a84e" roughness={0.2} metalness={0.5} />
          </mesh>
        </group>
      </group>

      <group position={[0, 1.48, 0.02]}>
        <mesh>
          <sphereGeometry args={[0.2, 20, 18]} />
          <meshStandardMaterial color={skinColor} roughness={0.5} />
        </mesh>

        <mesh position={[0, 0.08, 0]}>
          <sphereGeometry args={[0.21, 20, 18]} />
          <meshStandardMaterial color={hairColor} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.12, -0.08]}>
          <sphereGeometry args={[0.2, 16, 14]} />
          <meshStandardMaterial color={hairColor} roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.02, -0.12]}>
          <boxGeometry args={[0.36, 0.24, 0.08]} />
          <meshStandardMaterial color={hairColor} roughness={0.8} />
        </mesh>

        <mesh ref={hairBangRef} position={[0, 0.06, 0.16]}>
          <boxGeometry args={[0.12, 0.14, 0.06]} />
          <meshStandardMaterial color={hairColor} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.1, 0.14]} rotation={[0.3, 0, 0]}>
          <boxGeometry args={[0.18, 0.08, 0.06]} />
          <meshStandardMaterial color={hairColor} roughness={0.8} />
        </mesh>

        <mesh position={[0, 0.02, 0.18]}>
          <sphereGeometry args={[0.045, 10, 8]} />
          <meshStandardMaterial color="#0a0a0a" roughness={0.15} />
        </mesh>
        <mesh position={[0, 0.035, 0.21]}>
          <sphereGeometry args={[0.016, 8, 6]} />
          <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.6} />
        </mesh>

        <mesh position={[0, -0.04, 0.16]}>
          <sphereGeometry args={[0.04, 8, 6]} />
          <meshStandardMaterial color={skinColor} roughness={0.5} />
        </mesh>

        <mesh position={[0, -0.09, 0.14]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.06, 0.01, 0.02]} />
          <meshStandardMaterial color="#a07060" roughness={0.5} />
        </mesh>

        <mesh position={[0, -0.02, -0.04]}>
          <sphereGeometry args={[0.08, 8, 6]} />
          <meshStandardMaterial color={skinColor} roughness={0.5} />
        </mesh>
      </group>

      <mesh position={[0, 1.3, 0.02]}>
        <cylinderGeometry args={[0.06, 0.08, 0.1, 8]} />
        <meshStandardMaterial color={skinColor} roughness={0.5} />
      </mesh>
    </group>
  );
}

function SalarymanScene() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 3]} intensity={1.3} castShadow color="#fff8f0" />
      <directionalLight position={[-3, 3, -2]} intensity={0.25} color="#a8c8ff" />
      <pointLight position={[2, 1, 3]} intensity={0.3} color="#ff8844" />
      <SalarymanSideView />
      <ContactShadows position={[0, -0.98, 0]} opacity={0.45} scale={8} blur={2.5} far={3} />
      <Environment preset="city" />
    </>
  );
}

function SalarymanFallback2D() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame(f => f + 1), 50);
    return () => clearInterval(id);
  }, []);

  const walkCycle = frame * 0.12;
  const legSwing = Math.sin(walkCycle) * 18;
  const armSwing = Math.sin(walkCycle) * 14;
  const bodyBob = Math.abs(Math.sin(walkCycle * 2)) * 2;
  const hairSway = Math.sin(walkCycle * 2) * 2;
  const tieSway = Math.sin(walkCycle) * 4;
  const blink = frame % 60 < 3;

  const posX = ((frame * 1.2) % 500) - 50;

  return (
    <div style={{ width: '100%', aspectRatio: '16/7', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
      <svg viewBox="0 0 400 175" width="100%" preserveAspectRatio="xMidYMid meet">
        <line x1="0" y1="158" x2="400" y2="158" stroke="rgba(56,189,248,0.08)" strokeWidth="1" />

        <g transform={`translate(${posX}, ${-bodyBob})`}>
          <g transform={`translate(196, 80) rotate(${-legSwing * 0.8}, 0, 0)`}>
            <rect x="-5" y="0" width="10" height="42" rx="5" fill="#16162a" />
            <rect x="-6" y="38" width="14" height="6" rx="2" fill="#0e0e0e" />
          </g>

          <g transform={`translate(200, 80) rotate(${legSwing * 0.8}, 0, 0)`}>
            <rect x="-5" y="0" width="10" height="42" rx="5" fill="#1a1a30" />
            <rect x="-6" y="38" width="14" height="6" rx="2" fill="#111" />
          </g>

          <g transform="translate(200, 35)">
            <rect x="-14" y="0" width="28" height="48" rx="8" fill="#1a1a2e" />

            <rect x="-4" y="2" width="10" height="12" rx="1" fill="#eee" />

            <rect x="-1" y="12" width="4" height="28" rx="1" fill="#cc2233" transform={`rotate(${tieSway}, 1, 0)`} />
            <polygon points="-2,38 4,38 1,44" fill="#cc2233" transform={`translate(0, ${tieSway * 0.3})`} />

            <rect x="-14" y="44" width="28" height="5" rx="1.5" fill="#111122" />
          </g>

          <g transform={`translate(208, 50) rotate(${-armSwing}, 0, 0)`}>
            <rect x="-4" y="0" width="9" height="32" rx="4.5" fill="#1a1a2e" />
            <circle cx="0.5" cy="34" r="4" fill="#f2d4b0" />
          </g>

          <g transform={`translate(189, 50) rotate(${armSwing}, 0, 0)`}>
            <rect x="-4" y="0" width="9" height="32" rx="4.5" fill="#16162a" />
            <circle cx="0.5" cy="34" r="4" fill="#f2d4b0" />

            <g transform={`translate(1, 40) rotate(${armSwing * 0.3})`}>
              <rect x="-10" y="-2" width="20" height="14" rx="2" fill="#2a1810" />
              <rect x="-4" y="-3" width="8" height="2" rx="1" fill="#c8a84e" />
            </g>
          </g>

          <g transform={`translate(200, 14)`}>
            <circle cx="0" cy="0" r="18" fill="#f2d4b0" />

            <path d="M-16,2 Q-18,-16 -4,-20 Q8,-22 16,-14 Q20,-8 18,0 L16,-2 Q16,-10 10,-14 Q4,-18 -4,-16 Q-12,-12 -14,2 Z" fill="#0a0a0a" />

            <g transform={`translate(0, 0) rotate(${hairSway * 0.5})`}>
              <path d="M-6,-18 Q-2,-22 4,-20 Q0,-14 -4,-16 Z" fill="#0a0a0a" />
              <path d="M2,-20 Q8,-22 10,-16 Q6,-14 4,-18 Z" fill="#0a0a0a" />
            </g>

            <rect x="-18" y="-6" width="5" height="14" rx="2" fill="#0a0a0a" />

            {!blink && (
              <>
                <ellipse cx="6" cy="-1" rx="4.5" ry="5" fill="white" />
                <circle cx="7.5" cy="-1" r="2.8" fill="#1a0a00" />
                <circle cx="8.5" cy="-2.5" r="1" fill="white" />
              </>
            )}
            {blink && (
              <line x1="2" y1="-1" x2="12" y2="-1" stroke="#0a0a0a" strokeWidth="2" strokeLinecap="round" />
            )}

            <ellipse cx="8" cy="5" rx="2.5" ry="1.8" fill="#e0b898" />

            <line x1="4" y1="8" x2="10" y2="8" stroke="#8a6050" strokeWidth="1" strokeLinecap="round" />

            <circle cx="14" cy="4" r="4" fill="#f2d4b0" opacity="0.6" />
          </g>

          <rect x="197" y="28" width="6" height="10" rx="2" fill="#f2d4b0" />
        </g>
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
    setQuote(SALARYMAN_QUOTES[Math.floor(Math.random() * SALARYMAN_QUOTES.length)]);
    setQuoteVisible(true);

    const interval = setInterval(() => {
      setQuoteVisible(false);
      setTimeout(() => {
        setQuote(SALARYMAN_QUOTES[Math.floor(Math.random() * SALARYMAN_QUOTES.length)]);
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
    <div className="relative w-full" style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ width: '100%', position: 'relative' }}>
        {use3D ? (
          <div style={{ width: '100%', aspectRatio: '16/7', position: 'relative' }}>
            <Canvas
              camera={{ position: [0, 0.3, 3.5], fov: 30 }}
              style={{ borderRadius: 16, background: 'transparent' }}
              gl={{ alpha: true, antialias: true }}
              onCreated={() => {}}
              fallback={<SalarymanFallback2D />}
              onError={() => setCanvasError(true)}
            >
              <SalarymanScene />
            </Canvas>
          </div>
        ) : (
          <SalarymanFallback2D />
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
              THE SALARYMAN · ON THE CLOCK
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
              — THE SALARYMAN
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
