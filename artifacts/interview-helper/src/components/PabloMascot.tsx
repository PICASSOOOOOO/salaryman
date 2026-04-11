import { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Environment, ContactShadows } from '@react-three/drei';
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

function SalarymanBody() {
  const groupRef = useRef<THREE.Group>(null!);
  const headRef = useRef<THREE.Group>(null!);
  const armLRef = useRef<THREE.Group>(null!);
  const armRRef = useRef<THREE.Group>(null!);
  const legLRef = useRef<THREE.Group>(null!);
  const legRRef = useRef<THREE.Group>(null!);
  const briefcaseRef = useRef<THREE.Group>(null!);

  const walkCycleRef = useRef(0);
  const breathRef = useRef(0);

  const suitColor = useMemo(() => new THREE.Color('#1a1a2e'), []);
  const shirtColor = useMemo(() => new THREE.Color('#f0f0f0'), []);
  const tieColor = useMemo(() => new THREE.Color('#cc2233'), []);
  const skinColor = useMemo(() => new THREE.Color('#e8c39e'), []);
  const hairColor = useMemo(() => new THREE.Color('#0a0a0a'), []);
  const shoeColor = useMemo(() => new THREE.Color('#111111'), []);
  const briefcaseColor = useMemo(() => new THREE.Color('#2a1810'), []);
  const pantsColor = useMemo(() => new THREE.Color('#16162a'), []);

  useFrame((_, delta) => {
    walkCycleRef.current += delta * 3.2;
    breathRef.current += delta;
    const t = walkCycleRef.current;
    const walkSin = Math.sin(t);
    const walkCos = Math.cos(t);

    if (groupRef.current) {
      groupRef.current.position.y = Math.abs(Math.sin(t * 2)) * 0.02;
      groupRef.current.rotation.y += (0.15 - groupRef.current.rotation.y) * 0.02;
    }

    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(breathRef.current * 0.5) * 0.06;
      headRef.current.position.y = 1.58 + Math.abs(Math.sin(t * 2)) * 0.01;
    }

    if (legLRef.current && legRRef.current) {
      legLRef.current.rotation.x = walkSin * 0.4;
      legRRef.current.rotation.x = -walkSin * 0.4;
    }

    if (armLRef.current && armRRef.current) {
      armLRef.current.rotation.x = -walkSin * 0.35;
      armRRef.current.rotation.x = walkSin * 0.25;
    }

    if (briefcaseRef.current) {
      briefcaseRef.current.rotation.x = walkSin * 0.15;
      briefcaseRef.current.rotation.z = Math.sin(t * 0.5) * 0.05;
    }
  });

  return (
    <group ref={groupRef} position={[0, -1.0, 0]} scale={0.65}>
      <Float speed={0.8} rotationIntensity={0.03} floatIntensity={0.08}>
        <group ref={headRef} position={[0, 1.58, 0]}>
          <mesh>
            <sphereGeometry args={[0.22, 20, 18]} />
            <meshStandardMaterial color={skinColor} roughness={0.6} />
          </mesh>

          <mesh position={[0, 0.14, 0]}>
            <sphereGeometry args={[0.23, 20, 18]} />
            <meshStandardMaterial color={hairColor} roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.05, -0.14]}>
            <boxGeometry args={[0.46, 0.2, 0.12]} />
            <meshStandardMaterial color={hairColor} roughness={0.85} />
          </mesh>
          <mesh position={[0.18, 0.0, -0.08]}>
            <boxGeometry args={[0.1, 0.28, 0.18]} />
            <meshStandardMaterial color={hairColor} roughness={0.85} />
          </mesh>
          <mesh position={[-0.18, 0.0, -0.08]}>
            <boxGeometry args={[0.1, 0.28, 0.18]} />
            <meshStandardMaterial color={hairColor} roughness={0.85} />
          </mesh>

          <mesh position={[0.08, 0.02, 0.18]}>
            <sphereGeometry args={[0.032, 8, 6]} />
            <meshStandardMaterial color="#0a0a0a" roughness={0.2} />
          </mesh>
          <mesh position={[0.065, 0.03, 0.2]}>
            <sphereGeometry args={[0.01, 6, 4]} />
            <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.4} />
          </mesh>
          <mesh position={[-0.08, 0.02, 0.18]}>
            <sphereGeometry args={[0.032, 8, 6]} />
            <meshStandardMaterial color="#0a0a0a" roughness={0.2} />
          </mesh>
          <mesh position={[-0.095, 0.03, 0.2]}>
            <sphereGeometry args={[0.01, 6, 4]} />
            <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.4} />
          </mesh>

          <mesh position={[0.08, 0.08, 0.17]} rotation={[0, 0, -0.1]}>
            <boxGeometry args={[0.08, 0.012, 0.01]} />
            <meshStandardMaterial color="#1a1008" roughness={0.5} />
          </mesh>
          <mesh position={[-0.08, 0.08, 0.17]} rotation={[0, 0, 0.1]}>
            <boxGeometry args={[0.08, 0.012, 0.01]} />
            <meshStandardMaterial color="#1a1008" roughness={0.5} />
          </mesh>

          <mesh position={[0, -0.06, 0.18]}>
            <sphereGeometry args={[0.04, 8, 6]} />
            <meshStandardMaterial color={skinColor} roughness={0.5} />
          </mesh>

          <mesh position={[0.18, -0.02, 0.02]}>
            <sphereGeometry args={[0.06, 8, 6]} />
            <meshStandardMaterial color={skinColor} roughness={0.6} />
          </mesh>
          <mesh position={[-0.18, -0.02, 0.02]}>
            <sphereGeometry args={[0.06, 8, 6]} />
            <meshStandardMaterial color={skinColor} roughness={0.6} />
          </mesh>
        </group>

        <mesh position={[0, 1.15, 0]}>
          <boxGeometry args={[0.5, 0.55, 0.28]} />
          <meshStandardMaterial color={suitColor} roughness={0.65} />
        </mesh>
        <mesh position={[0.22, 1.3, 0.02]}>
          <boxGeometry args={[0.12, 0.14, 0.22]} />
          <meshStandardMaterial color={suitColor} roughness={0.65} />
        </mesh>
        <mesh position={[-0.22, 1.3, 0.02]}>
          <boxGeometry args={[0.12, 0.14, 0.22]} />
          <meshStandardMaterial color={suitColor} roughness={0.65} />
        </mesh>

        <mesh position={[0, 1.32, 0.13]}>
          <boxGeometry args={[0.14, 0.08, 0.04]} />
          <meshStandardMaterial color={shirtColor} roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.27, 0.13]}>
          <boxGeometry args={[0.12, 0.04, 0.04]} />
          <meshStandardMaterial color={shirtColor} roughness={0.5} />
        </mesh>

        <mesh position={[0, 1.18, 0.145]}>
          <boxGeometry args={[0.06, 0.32, 0.02]} />
          <meshStandardMaterial color={tieColor} roughness={0.4} metalness={0.1} />
        </mesh>
        <mesh position={[0, 1.0, 0.15]}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={3}
              array={new Float32Array([-0.04, 0, 0, 0.04, 0, 0, 0, -0.06, 0])}
              itemSize={3}
            />
          </bufferGeometry>
          <meshStandardMaterial color={tieColor} roughness={0.4} side={THREE.DoubleSide} />
        </mesh>

        <group ref={armLRef} position={[0.3, 1.28, 0]}>
          <mesh position={[0, -0.2, 0]}>
            <boxGeometry args={[0.13, 0.38, 0.14]} />
            <meshStandardMaterial color={suitColor} roughness={0.65} />
          </mesh>
          <mesh position={[0, -0.42, 0]}>
            <sphereGeometry args={[0.055, 8, 6]} />
            <meshStandardMaterial color={skinColor} roughness={0.6} />
          </mesh>
        </group>

        <group ref={armRRef} position={[-0.3, 1.28, 0]}>
          <mesh position={[0, -0.2, 0]}>
            <boxGeometry args={[0.13, 0.38, 0.14]} />
            <meshStandardMaterial color={suitColor} roughness={0.65} />
          </mesh>
          <group ref={briefcaseRef} position={[0, -0.45, 0.05]}>
            <mesh>
              <boxGeometry args={[0.28, 0.22, 0.06]} />
              <meshStandardMaterial color={briefcaseColor} roughness={0.5} metalness={0.15} />
            </mesh>
            <mesh position={[0, 0.12, 0.02]}>
              <boxGeometry args={[0.1, 0.015, 0.04]} />
              <meshStandardMaterial color="#886644" roughness={0.3} metalness={0.3} />
            </mesh>
            <mesh position={[0.06, 0.05, 0.035]}>
              <boxGeometry args={[0.025, 0.015, 0.015]} />
              <meshStandardMaterial color="#c8a84e" roughness={0.2} metalness={0.6} />
            </mesh>
            <mesh position={[-0.06, 0.05, 0.035]}>
              <boxGeometry args={[0.025, 0.015, 0.015]} />
              <meshStandardMaterial color="#c8a84e" roughness={0.2} metalness={0.6} />
            </mesh>
          </group>
        </group>

        <mesh position={[0, 0.65, 0]}>
          <boxGeometry args={[0.38, 0.08, 0.24]} />
          <meshStandardMaterial color="#111122" roughness={0.4} metalness={0.1} />
        </mesh>

        <group ref={legLRef} position={[0.1, 0.58, 0]}>
          <mesh position={[0, -0.22, 0]}>
            <boxGeometry args={[0.15, 0.42, 0.16]} />
            <meshStandardMaterial color={pantsColor} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.46, 0.04]}>
            <boxGeometry args={[0.13, 0.06, 0.2]} />
            <meshStandardMaterial color={shoeColor} roughness={0.3} />
          </mesh>
        </group>

        <group ref={legRRef} position={[-0.1, 0.58, 0]}>
          <mesh position={[0, -0.22, 0]}>
            <boxGeometry args={[0.15, 0.42, 0.16]} />
            <meshStandardMaterial color={pantsColor} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.46, 0.04]}>
            <boxGeometry args={[0.13, 0.06, 0.2]} />
            <meshStandardMaterial color={shoeColor} roughness={0.3} />
          </mesh>
        </group>
      </Float>
    </group>
  );
}

function SalarymanScene() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 4]} intensity={1.4} castShadow color="#fff8f0" />
      <directionalLight position={[-2, 3, -1]} intensity={0.3} color="#a8c8ff" />
      <pointLight position={[0, 2, 3]} intensity={0.4} color="#ff6644" />
      <SalarymanBody />
      <ContactShadows position={[0, -1.05, 0]} opacity={0.5} scale={4} blur={2.5} far={3} />
      <Environment preset="city" />
    </>
  );
}

function SalarymanFallback2D() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame(f => f + 1), 80);
    return () => clearInterval(id);
  }, []);

  const walkCycle = frame * 0.18;
  const legSwing = Math.sin(walkCycle) * 12;
  const armSwing = Math.sin(walkCycle) * 10;
  const bodyBob = Math.abs(Math.sin(walkCycle * 2)) * 2;
  const headBob = Math.sin(frame * 0.04) * 1;
  const blink = frame % 40 < 2;

  return (
    <div style={{ width: '100%', aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <svg viewBox="0 0 200 220" width="260" height="220" style={{ transform: `translateY(${-bodyBob}px)` }}>
        <ellipse cx="100" cy="210" rx="35" ry="5" fill="rgba(0,0,0,0.25)" />

        <g transform={`translate(85, 140) rotate(${legSwing}, 5, 0)`}>
          <rect x="0" y="0" width="12" height="45" rx="3" fill="#16162a" />
          <rect x="-1" y="42" width="14" height="7" rx="2" fill="#111" />
        </g>
        <g transform={`translate(103, 140) rotate(${-legSwing}, 5, 0)`}>
          <rect x="0" y="0" width="12" height="45" rx="3" fill="#16162a" />
          <rect x="-1" y="42" width="14" height="7" rx="2" fill="#111" />
        </g>

        <rect x="80" y="90" width="40" height="55" rx="4" fill="#1a1a2e" />

        <rect x="93" y="92" width="14" height="10" rx="1" fill="#f0f0f0" />
        <rect x="97" y="98" width="6" height="38" rx="1" fill="#cc2233" />
        <polygon points="97,136 100,142 103,136" fill="#cc2233" />

        <g transform={`translate(72, 95) rotate(${-armSwing}, 8, 0)`}>
          <rect x="0" y="0" width="12" height="40" rx="4" fill="#1a1a2e" />
          <circle cx="6" cy="42" r="5" fill="#e8c39e" />
        </g>
        <g transform={`translate(116, 95) rotate(${armSwing}, 4, 0)`}>
          <rect x="0" y="0" width="12" height="40" rx="4" fill="#1a1a2e" />
          <g transform={`translate(6, 45)`}>
            <rect x="-12" y="-8" width="24" height="18" rx="2" fill="#2a1810" />
            <rect x="-4" y="-9" width="8" height="3" rx="1" fill="#886644" />
            <rect x="4" y="-3" width="3" height="2" rx="0.5" fill="#c8a84e" />
            <rect x="-7" y="-3" width="3" height="2" rx="0.5" fill="#c8a84e" />
          </g>
        </g>

        <g transform={`translate(100, ${72 + headBob})`}>
          <circle cx="0" cy="0" r="18" fill="#e8c39e" />

          <path d="M-18,-4 Q-18,-22 0,-22 Q18,-22 18,-4 L16,-2 Q16,-18 0,-18 Q-16,-18 -16,-2 Z" fill="#0a0a0a" />
          <rect x="-19" y="-10" width="5" height="14" rx="2" fill="#0a0a0a" />
          <rect x="14" y="-10" width="5" height="14" rx="2" fill="#0a0a0a" />

          {!blink && <circle cx="-6" cy="-1" r="2.8" fill="#0a0a0a" />}
          {!blink && <circle cx="6" cy="-1" r="2.8" fill="#0a0a0a" />}
          {!blink && <circle cx="-7.2" cy="-2" r="0.9" fill="white" />}
          {!blink && <circle cx="4.8" cy="-2" r="0.9" fill="white" />}
          {blink && <line x1="-10" y1="-1" x2="-2" y2="-1" stroke="#0a0a0a" strokeWidth="1.5" strokeLinecap="round" />}
          {blink && <line x1="2" y1="-1" x2="10" y2="-1" stroke="#0a0a0a" strokeWidth="1.5" strokeLinecap="round" />}

          <rect x="-10" y="-5" width="8" height="1.5" rx="0.5" fill="#1a1008" opacity="0.7" />
          <rect x="2" y="-5" width="8" height="1.5" rx="0.5" fill="#1a1008" opacity="0.7" />

          <ellipse cx="0" cy="4" rx="3" ry="2" fill="#d4a882" />

          <line x1="-4" y1="9" x2="4" y2="9" stroke="#0a0a0a" strokeWidth="1.2" strokeLinecap="round" />

          <circle cx="-12" cy="5" r="4" fill="#e8c39e" opacity="0.7" />
          <circle cx="12" cy="5" r="4" fill="#e8c39e" opacity="0.7" />
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
    <div className="relative w-full" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div style={{ width: '100%', position: 'relative' }}>
        {use3D ? (
          <div style={{ width: '100%', aspectRatio: '4/3', position: 'relative' }}>
            <Canvas
              camera={{ position: [0, 0.8, 3.2], fov: 35 }}
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
