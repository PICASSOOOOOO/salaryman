import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const FEATURES = [
  { title: "7 AI AGENTS", subtitle: "MULTI-AGENT WORKFORCE" },
  { title: "8 CHANNELS", subtitle: "OMNICHANNEL DEPLOYMENT" },
  { title: "DARK ROOM", subtitle: "CREATIVE STUDIO" },
  { title: "PHONE SYSTEM", subtitle: "AUTONOMOUS CALL AGENTS" },
  { title: "CRM & PIPELINE", subtitle: "DEALS CONTACTS LEADS" },
  { title: "BOT FACTORY", subtitle: "CUSTOM AI BOTS" },
  { title: "24 CITIES", subtitle: "WORLDWIDE NETWORK" }
];

export function Scene3() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // 7 features over 7 seconds -> 1 second per feature
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev < FEATURES.length - 1 ? prev + 1 : prev));
    }, 950); // Slightly less than 1s to allow exit animation
    
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 bg-[#09090b] flex flex-col justify-center pl-[10vw]"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 1.2 }}
      transition={{ duration: 0.4 }}
    >
      {/* Decorative grid */}
      <div className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'linear-gradient(to right, #38bdf8 1px, transparent 1px), linear-gradient(to bottom, #38bdf8 1px, transparent 1px)',
          backgroundSize: '4vw 4vw'
        }}
      />
      
      {FEATURES.map((feature, index) => (
        <motion.div
          key={index}
          className="absolute"
          initial={{ opacity: 0, y: 50, filter: 'blur(10px)' }}
          animate={
            currentIndex === index 
              ? { opacity: 1, y: 0, filter: 'blur(0px)', scale: 1 } 
              : currentIndex > index 
                ? { opacity: 0, y: -50, filter: 'blur(10px)', scale: 0.9 }
                : { opacity: 0, y: 50, filter: 'blur(10px)', scale: 0.9 }
          }
          transition={{ duration: 0.3 }}
        >
          <div className="flex flex-col">
            <span 
              className="text-[#10b981] text-[2vw] mb-2"
              style={{ fontFamily: '"Share Tech Mono", monospace' }}
            >
              SYS.MODULE_{index + 1}
            </span>
            <h2 
              className="text-[8vw] font-bold text-white uppercase leading-none tracking-tight"
              style={{ fontFamily: '"VT323", monospace' }}
            >
              {feature.title}
            </h2>
            <p 
              className="text-[#38bdf8] text-[3vw] mt-2 uppercase tracking-widest"
              style={{ fontFamily: '"VT323", monospace' }}
            >
              {feature.subtitle}
            </p>
          </div>
        </motion.div>
      ))}
      
      {/* Progress bar */}
      <div className="absolute bottom-[10vh] left-[10vw] w-[80vw] h-[2px] bg-white/20">
        <motion.div 
          className="h-full bg-[#10b981]"
          animate={{ width: `${((currentIndex + 1) / FEATURES.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </motion.div>
  );
}
