import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  channelGain,
  getAudioSettings,
  getMusicEnabled,
  subscribeAudioSettings,
} from "../lib/audio-settings";
import { BG_OWNERS, claimBackgroundAudio, registerBackgroundAudio, releaseBackgroundAudio } from "../lib/audio-bus";
import { isPhoneBusy, subscribePhoneBusy } from "../lib/phone-busy";
import { speakGameTTS, type TTSHandle } from "../lib/tts";

// ── Shadow Radio (MUSIC) ────────────────────────────────────────────────────
// One app-wide station, tuned in quietly by default. Unlike the retired WorldPlay player, this element
// never unmounts on navigation, so changing pages (or toggling it) tunes back
// into the same programme instead of restarting a track.

const BASE = import.meta.env.BASE_URL;
const TRACKS: string[] = Array.from({ length: 31 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return `${BASE}callhome/track-${n}.mp3`;
});

const STATION_STATE_KEY = "salaryman.pablo-radio.position.v1";
const DJ_LINES = [
  "You're listening to Shadow Radio, broadcasting from Call Home.",
  "Pablo on the air. Markets are moving, phones are ringing, and the Tower is still awake.",
  "Another track from the Call Home vault. Stay sharp, Salaryman.",
  "Shadow Radio traffic report: the Tower lobby is busy and the streets are unforgiving.",
  "This is your host Pablo. Keep your radio close and your business closer.",
  "Call Home news desk: another shift begins, another company tries to climb the Tower.",
  "You're on Shadow Radio. Music, city reports, and commentary from the top floor.",
];

type StationPosition = { index: number; time: number };

function readSavedPosition(): StationPosition {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATION_STATE_KEY) ?? "") as Partial<StationPosition>;
    if (typeof parsed.index === "number" && Number.isInteger(parsed.index) && typeof parsed.time === "number" && parsed.time >= 0) {
      return { index: parsed.index % TRACKS.length, time: parsed.time };
    }
  } catch {
    // A fresh station can start anywhere in the library.
  }
  return { index: Math.floor(Math.random() * TRACKS.length), time: 0 };
}

function isPhoneRoute(path: string): boolean {
  const pathname = path.split("?")[0];
  return pathname === "/phone" || pathname.startsWith("/phone/");
}

export function OfficeRadio() {
  const [location] = useLocation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const positionRef = useRef<StationPosition>(readSavedPosition());
  const shouldPlayRef = useRef(false);
  const phoneBlockedRef = useRef(isPhoneRoute(location) || isPhoneBusy());
  const djHandleRef = useRef<TTSHandle | null>(null);
  const lastSavedSecondRef = useRef(-1);
  // A radio is silent until WorldPlay reports that the player is near a
  // physical radio. This prevents the global station from becoming a second
  // soundtrack on every route.
  const proximityGainRef = useRef(0);

  const persistPosition = () => {
    const audio = audioRef.current;
    if (!audio) return;
    positionRef.current = { index: positionRef.current.index, time: Number.isFinite(audio.currentTime) ? audio.currentTime : 0 };
    try { localStorage.setItem(STATION_STATE_KEY, JSON.stringify(positionRef.current)); } catch {}
  };

  const startNextTrack = () => {
    const audio = audioRef.current;
    if (!audio) return;
    positionRef.current = { index: (positionRef.current.index + 1) % TRACKS.length, time: 0 };
    audio.src = TRACKS[positionRef.current.index];
    audio.load();
    if (shouldPlayRef.current) audio.play().catch(() => {});
  };

  const maybePlayDjLine = () => {
    const settings = getAudioSettings();
    if (
      !shouldPlayRef.current ||
      phoneBlockedRef.current ||
      settings.muted ||
      channelGain("voice") <= 0 ||
      proximityGainRef.current <= 0.03 ||
      Math.random() >= 0.7
    ) {
      startNextTrack();
      return;
    }
    const line = DJ_LINES[Math.floor(Math.random() * DJ_LINES.length)];
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      djHandleRef.current = null;
      startNextTrack();
    };
    djHandleRef.current = speakGameTTS(
      line,
      finish,
      finish,
      "PABLO",
      channelGain("voice") * proximityGainRef.current,
    );
  };

  // Create the audio element once.
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audio.loop = false;
    audioRef.current = audio;

    const onEnded = () => {
      positionRef.current.time = 0;
      maybePlayDjLine();
    };
    const onLoadedMetadata = () => {
      const wantedTime = positionRef.current.time;
      if (wantedTime > 0 && Number.isFinite(audio.duration)) {
        audio.currentTime = Math.min(wantedTime, Math.max(0, audio.duration - 0.25));
      }
    };
    const onTimeUpdate = () => {
      const wholeSecond = Math.floor(audio.currentTime);
      if (wholeSecond !== lastSavedSecondRef.current && wholeSecond % 10 === 0) {
        lastSavedSecondRef.current = wholeSecond;
        persistPosition();
      }
    };
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.src = TRACKS[positionRef.current.index];

    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      persistPosition();
      djHandleRef.current?.cancel();
      djHandleRef.current = null;
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  // Single chokepoint for the opt-in, phone priority, and background coordinator.
  // Route changes outside the phone section deliberately do not affect playback.
  const reconcile = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const s = getAudioSettings();
    audio.volume = channelGain("soundtrack") * proximityGainRef.current;
    audio.muted = s.muted;
    shouldPlayRef.current =
      getMusicEnabled() &&
      proximityGainRef.current > 0.03 &&
      !phoneBlockedRef.current;
    if (shouldPlayRef.current) {
      claimBackgroundAudio(BG_OWNERS.radioPablo);
      // A call can cancel DJ banter after a track has ended. Continue with a
      // fresh track when the phone releases instead of trying to replay an
      // exhausted media element.
      if (audio.ended) startNextTrack();
      else audio.play().catch(() => {});
    } else {
      audio.pause();
      persistPosition();
      djHandleRef.current?.cancel();
      djHandleRef.current = null;
      releaseBackgroundAudio(BG_OWNERS.radioPablo);
    }
  };

  // Register with the coordinator so another tier claiming ownership pauses us.
  useEffect(() => {
    return registerBackgroundAudio(BG_OWNERS.radioPablo, () => {
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

  // Phone pages and live calls are the only route/state that pauses Shadow Radio.
  useEffect(() => {
    phoneBlockedRef.current = isPhoneRoute(location) || isPhoneBusy();
    reconcile();
  }, [location]);

  useEffect(() => subscribePhoneBusy((busy) => {
    phoneBlockedRef.current = busy || isPhoneRoute(location);
    reconcile();
  }), [location]);

  // World stereos are positional sources. WorldPlay publishes the nearest
  // stereo's attenuation as the player moves; the station keeps its programme
  // position but becomes quieter with distance instead of following the player
  // as global background music.
  useEffect(() => {
    const onProximity = (event: Event) => {
      const detail = (event as CustomEvent<{ gain?: number }>).detail;
      const next = Math.max(0, Math.min(1, Number(detail?.gain ?? 0)));
      proximityGainRef.current = Number.isFinite(next) ? next : 0;
      const audio = audioRef.current;
      if (audio) audio.volume = channelGain("soundtrack") * proximityGainRef.current;
      reconcile();
    };
    window.addEventListener("salaryman:radio-proximity", onProximity);
    return () => window.removeEventListener("salaryman:radio-proximity", onProximity);
  }, []);

  return null;
}
