import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video/hooks';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';

const SCENE_DURATIONS = {
  logo: 2000,
  platform: 2000,
  features: 7000,
  version: 2000,
  lockup: 2000
};

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#09090b]">
      {/* Background CRT scanlines effect */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, #000 2px, #000 4px)',
          backgroundSize: '100% 4px'
        }}
      />
      
      {/* Subtle animated noise/grain */}
      <motion.div 
        className="absolute -inset-[100%] opacity-10 pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")',
        }}
        animate={{ x: ['0%', '-5%', '5%', '0%'], y: ['0%', '5%', '-5%', '0%'] }}
        transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
      />

      <AnimatePresence mode="popLayout">
        {currentScene === 0 && <Scene1 key="logo" />}
        {currentScene === 1 && <Scene2 key="platform" />}
        {currentScene === 2 && <Scene3 key="features" />}
        {currentScene === 3 && <Scene4 key="version" />}
        {currentScene === 4 && <Scene5 key="lockup" />}
      </AnimatePresence>
    </div>
  );
}
