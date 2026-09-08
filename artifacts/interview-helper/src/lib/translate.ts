import { apiFetch } from '@/lib/api-client';

// In-memory translation cache so toggling the same passage doesn't re-hit the
// LLM. Keyed by target language + source text.
const cache = new Map<string, string>();

export interface TranslationLanguage {
  code: string;
  name: string;
  nativeName: string;
  speechLocale: string;
}

// The first six languages mirror Gemma Translator's reference app. The rest
// keep the existing SALARYMAN language coverage available to conversations.
export const TRANSLATION_LANGUAGES: TranslationLanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English', speechLocale: 'en-US' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', speechLocale: 'vi-VN' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', speechLocale: 'es-ES' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', speechLocale: 'ja-JP' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', speechLocale: 'zh-CN' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', speechLocale: 'ko-KR' },
  { code: 'fr', name: 'French', nativeName: 'Français', speechLocale: 'fr-FR' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', speechLocale: 'pt-BR' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', speechLocale: 'de-DE' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', speechLocale: 'ar-SA' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', speechLocale: 'hi-IN' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', speechLocale: 'id-ID' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', speechLocale: 'th-TH' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', speechLocale: 'ru-RU' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', speechLocale: 'it-IT' },
];

export interface TranslationPreferences {
  source: string;
  target: string;
}

const TRANSLATION_PREFS_KEY = 'sm_translation_preferences';
const LEGACY_SOURCE_KEY = 'sm_xlat_from';
const LEGACY_TARGET_KEY = 'sm_xlat_to';

function isSupportedLanguage(code: string): boolean {
  return TRANSLATION_LANGUAGES.some(language => language.code === code);
}

export function getTranslationPreferences(): TranslationPreferences {
  const fallback = { source: 'vi', target: 'en' };
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = JSON.parse(localStorage.getItem(TRANSLATION_PREFS_KEY) ?? 'null') as Partial<TranslationPreferences> | null;
    const source = stored?.source ?? localStorage.getItem(LEGACY_SOURCE_KEY) ?? fallback.source;
    const target = stored?.target ?? localStorage.getItem(LEGACY_TARGET_KEY) ?? fallback.target;
    return {
      source: isSupportedLanguage(source) ? source : fallback.source,
      target: isSupportedLanguage(target) ? target : fallback.target,
    };
  } catch {
    return fallback;
  }
}

export function saveTranslationPreferences(preferences: TranslationPreferences): void {
  if (typeof window === 'undefined') return;
  const next = {
    source: isSupportedLanguage(preferences.source) ? preferences.source : 'vi',
    target: isSupportedLanguage(preferences.target) ? preferences.target : 'en',
  };
  try {
    localStorage.setItem(TRANSLATION_PREFS_KEY, JSON.stringify(next));
    // Keep old callers harmlessly in sync while the duplicate WorldPlay
    // controls are removed.
    localStorage.setItem(LEGACY_SOURCE_KEY, next.source);
    localStorage.setItem(LEGACY_TARGET_KEY, next.target);
    window.dispatchEvent(new CustomEvent('salaryman:translation-preferences', { detail: next }));
  } catch {}
}

export async function translateText(text: string, target: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const key = `${target}::${trimmed}`;
  const hit = cache.get(key);
  if (hit != null) return hit;
  const res = await apiFetch('/api/education/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, target }),
  });
  if (!res.ok) throw new Error('translate failed');
  const data = await res.json();
  const translated = String(data.translated ?? '');
  cache.set(key, translated);
  return translated;
}

const freeCache = new Map<string, string>();

/**
 * Free conversation translation. This intentionally uses a separate route
 * from the LLM-backed education helper: conversation translation must never
 * silently incur a Pablo/PRIME charge.
 */
export async function translateFreeText(text: string, source: string, target: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed || source === target) return trimmed || text;
  const key = `${source}:${target}:${trimmed}`;
  const hit = freeCache.get(key);
  if (hit != null) return hit;
  const res = await apiFetch('/api/education/translate/free', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: trimmed, source, target }),
  });
  if (!res.ok) throw new Error('free translation failed');
  const data = await res.json() as { translated?: unknown };
  const translated = String(data.translated ?? '').trim();
  if (!translated) throw new Error('empty translation');
  freeCache.set(key, translated);
  return translated;
}

export function getTranslationLanguage(code: string): TranslationLanguage {
  return TRANSLATION_LANGUAGES.find(language => language.code === code) ?? TRANSLATION_LANGUAGES[0];
}
