import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video/hooks';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';

const SCENE_DURATIONS = {
  logo: 2500,
  platform: 3000,
  features: 8000,
  cityscape: 3500,
  hud: 3500,
  lockup: 3000,
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
        {currentScene === 1 && <Scene2 key="platform" />}
        {currentScene === 2 && <Scene3 key="features" />}
        {currentScene === 3 && <Scene4 key="cityscape" />}
        {currentScene === 4 && <Scene5 key="hud" />}
        {currentScene === 5 && <Scene6 key="lockup" />}
      </AnimatePresence>
    </div>
  );
}
