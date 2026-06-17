import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  channelGain,
  getAudioSettings,
  getMusicEnabled,
  subscribeAudioSettings,
} from "../lib/audio-settings";
import { BG_OWNERS, claimBackgroundAudio, registerBackgroundAudio, releaseBackgroundAudio } from "../lib/audio-bus";

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
const SCENE_PREFIXES = ["/world", "/game", "/office"];

// WorldPlay mounts its OWN manual RadioPlayer (the in-world RADIO HUD) on these
// routes, so the headless office radio must stand down there to avoid two
// soundtrack sources fighting over the `soundtrack` channel. (See the
// RadioPlayer-vs-OfficeRadio double-ownership resolution in task-1157.)
const WORLD_PLAY_PREFIXES = ["/world/play"];

function isSceneRoute(path: string): boolean {
  if (WORLD_PLAY_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) {
    return false;
  }
  return SCENE_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
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

  // Single chokepoint that reconciles playback with the current scene + MUSIC
  // opt-in AND the background-tier coordinator. When this radio should play it
  // claims ownership (pausing any other tier — world score, office bed,
  // Hummingbird, the in-world RadioPlayer); when it shouldn't, it pauses and
  // releases ownership so it doesn't keep a stale claim.
  const reconcile = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const s = getAudioSettings();
    audio.volume = channelGain("soundtrack");
    audio.muted = s.muted;
    // MUSIC plays only when opted in AND on a game/office scene — never auto-plays.
    if (onSceneRef.current && getMusicEnabled()) {
      claimBackgroundAudio(BG_OWNERS.radioOffice);
      audio.play().catch(() => {});
    } else {
      audio.pause();
      releaseBackgroundAudio(BG_OWNERS.radioOffice);
    }
  };

  // Register with the coordinator so another tier claiming ownership pauses us.
  useEffect(() => {
    return registerBackgroundAudio(BG_OWNERS.radioOffice, () => {
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        try { audio.pause(); } catch {}
      }
    });
  }, []);

  // Apply the current volume from the store AND start/stop playback to match the
  // MUSIC opt-in. Subscribe so toggling MUSIC on/off takes effect immediately.
  useEffect(() => {
    reconcile();
    return subscribeAudioSettings(reconcile);
  }, []);

  // Start/stop based on whether we're on a scene route (still gated on MUSIC opt-in).
  useEffect(() => {
    onSceneRef.current = isSceneRoute(location);
    reconcile();
  }, [location]);

  return null;
}
