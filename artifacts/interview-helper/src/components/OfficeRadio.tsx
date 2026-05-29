import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  channelGain,
  getAudioSettings,
  subscribeAudioSettings,
} from "../lib/audio-settings";

// ── Distant office radio ─────────────────────────────────────────────────────
// Plays the uploaded soundtrack (public/callhome/track-01..31.mp3) VERY LOW in
// the background — "as if from a distant radio in the office" — but ONLY while an
// office / video-game scene is on screen. Volume follows the `soundtrack` channel
// of the central audio store (scaled by master, silenced on mute). Headless:
// renders nothing, just owns one <audio> element.

const BASE = import.meta.env.BASE_URL;
const TRACKS: string[] = Array.from({ length: 31 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return `${BASE}callhome/track-${n}.mp3`;
});

// Route prefixes that count as "an office or part of the video game".
const SCENE_PREFIXES = ["/world/play", "/world", "/game", "/office"];

function isSceneRoute(path: string): boolean {
  return SCENE_PREFIXES.some((p) => path === p || path.startsWith(p + "/")) ||
    path === "/world" || path === "/game" || path === "/office";
}

export function OfficeRadio() {
  const [location] = useLocation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const idxRef = useRef<number>(Math.floor(Math.random() * TRACKS.length));
  const onSceneRef = useRef(false);

  // Create the audio element once.
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audio.loop = false;
    audioRef.current = audio;

    const onEnded = () => {
      idxRef.current = (idxRef.current + 1) % TRACKS.length;
      audio.src = TRACKS[idxRef.current];
      audio.load();
      if (onSceneRef.current) audio.play().catch(() => {});
    };
    audio.addEventListener("ended", onEnded);
    audio.src = TRACKS[idxRef.current];

    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  // Apply the current volume from the store; subscribe for live changes.
  useEffect(() => {
    const apply = () => {
      const audio = audioRef.current;
      if (!audio) return;
      const s = getAudioSettings();
      audio.volume = channelGain("soundtrack");
      audio.muted = s.muted;
    };
    apply();
    return subscribeAudioSettings(apply);
  }, []);

  // Start/stop based on whether we're on a scene route.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onScene = isSceneRoute(location);
    onSceneRef.current = onScene;
    if (onScene) {
      audio.volume = channelGain("soundtrack");
      audio.muted = getAudioSettings().muted;
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [location]);

  return null;
}
