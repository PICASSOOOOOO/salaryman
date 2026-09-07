// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const { spokenTts } = vi.hoisted(() => ({
  spokenTts: [] as string[],
}));

vi.mock('@/lib/tts', () => ({
  speakWithTTS: (text: string) => {
    spokenTts.push(text);
    return { cancel: vi.fn() };
  },
}));

vi.mock('@/soundEngine', () => ({
  resumeAudioContext: vi.fn(),
  sfxElevatorChime: vi.fn(),
  sfxDoorSlide: vi.fn(),
  startOfficeAmbient: vi.fn(),
  stopOfficeAmbient: vi.fn(),
}));

vi.mock('@/lib/audio-settings', () => ({
  getMusicEnabled: () => true,
}));

import { PostOnboardingIntro } from './PostOnboardingIntro';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  spokenTts.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('PostOnboardingIntro speech names', () => {
  it('passes a natural first name to Pablo TTS for an all-caps identity', async () => {
    await act(async () => {
      root.render(<PostOnboardingIntro playerName="ALEX DUONG" onComplete={vi.fn()} />);
    });

    await act(async () => {
      vi.advanceTimersByTime(650);
    });

    expect(spokenTts[0]).toBe('Ah. Alex. You made it to Shadow Tower.');
    expect(spokenTts[0]).not.toContain('ALEX');
  });
});