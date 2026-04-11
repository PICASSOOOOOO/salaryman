import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video/hooks';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';
import { Scene7 } from './video_scenes/Scene7';
import { Scene8 } from './video_scenes/Scene8';

const SCENE_DURATIONS = {
  logo: 2800,
  tagline: 3200,
  city: 5500,
  business: 4500,
  creative: 4500,
  phone: 4000,
  hud: 4000,
  lockup: 3500,
};

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#06080d]">
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.06] z-50"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.03) 1px, rgba(255,255,255,0.03) 2px)',
          backgroundSize: '100% 2px',
        }}
      />

      <AnimatePresence mode="wait">
        {currentScene === 0 && <Scene1 key="logo" />}
        {currentScene === 1 && <Scene2 key="tagline" />}
        {currentScene === 2 && <Scene3 key="city" />}
        {currentScene === 3 && <Scene4 key="business" />}
        {currentScene === 4 && <Scene5 key="creative" />}
        {currentScene === 5 && <Scene6 key="phone" />}
        {currentScene === 6 && <Scene7 key="hud" />}
        {currentScene === 7 && <Scene8 key="lockup" />}
      </AnimatePresence>
    </div>
  );
}
