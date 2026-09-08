import { useState, useEffect, useRef, useCallback } from 'react';

interface UseVideoPlayerOptions {
  durations: Record<string, number>;
}

export function useVideoPlayer({ durations }: UseVideoPlayerOptions) {
  const scenes = Object.keys(durations);
  const [currentScene, setCurrentScene] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const advance = useCallback(() => {
    setCurrentScene(prev => (prev + 1) % scenes.length);
  }, [scenes.length]);

  useEffect(() => {
    const key = scenes[currentScene];
    const dur = durations[key];
    timerRef.current = setTimeout(advance, dur);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentScene, scenes, durations, advance]);

  return { currentScene, totalScenes: scenes.length };
}
