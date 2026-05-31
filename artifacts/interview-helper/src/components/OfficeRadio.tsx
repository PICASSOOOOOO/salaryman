import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  channelGain,
  getAudioSettings,
  getMusicEnabled,
  subscribeAudioSettings,
} from "../lib/audio-settings";

// ── Office radio (MUSIC) ─────────────────────────────────────────────────────
// Plays the uploaded soundtrack (public/callhome/track-01..31.mp3) — the game's
// MUSIC — but ONLY when BOTH conditions hold: (1) an office / video-game scene is
// on screen, AND (2) the player has opted in via the MUSIC toggle (`musicEnabled`,
// default OFF). It never auto-plays. Volume follows the `soundtrack` channel of
// the central audio store (scaled by master, silenced on mute / when disabled).
// Headless: renders nothing, just owns one <audio> element.

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

  // Apply the current volume from the store AND start/stop playback to match the
  // MUSIC opt-in. Subscribe so toggling MUSIC on/off takes effect immediately.
  useEffect(() => {
    const apply = () => {
      const audio = audioRef.current;
      if (!audio) return;
      const s = getAudioSettings();
      audio.volume = channelGain("soundtrack");
      audio.muted = s.muted;
      // MUSIC plays only when opted in AND on a game/office scene — never auto-plays.
      if (onSceneRef.current && getMusicEnabled()) {
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    };
    apply();
    return subscribeAudioSettings(apply);
  }, []);

  // Start/stop based on whether we're on a scene route (still gated on MUSIC opt-in).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onScene = isSceneRoute(location);
    onSceneRef.current = onScene;
    audio.volume = channelGain("soundtrack");
    audio.muted = getAudioSettings().muted;
    if (onScene && getMusicEnabled()) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [location]);

  return null;
}
