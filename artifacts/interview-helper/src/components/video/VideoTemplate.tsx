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
  intro: 2800,
  pitch: 3200,
  botGrid: 4800,   // STEP INSIDE — lobby walk-in (Nano Banana)
  command: 5400,   // YOUR OFFICE — desk/cabinet/player (Nano Banana)
  workflow: 6200,  // SUMMON PABLO — terminal + orb + voice (Nano Banana)
  roster: 5400,   // REAL BUSINESS — receptionist + courier + bot tube (Nano Banana)
  pricing: 4000,
  lockup: 3500,
};

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#06080d]">
      <AnimatePresence mode="wait">
        {currentScene === 0 && <Scene1 key="intro" />}
        {currentScene === 1 && <Scene2 key="pitch" />}
        {currentScene === 2 && <Scene3 key="botGrid" />}
        {currentScene === 3 && <Scene4 key="command" />}
        {currentScene === 4 && <Scene5 key="workflow" />}
        {currentScene === 5 && <Scene6 key="roster" />}
        {currentScene === 6 && <Scene7 key="pricing" />}
        {currentScene === 7 && <Scene8 key="lockup" />}
      </AnimatePresence>
    </div>
  );
}
