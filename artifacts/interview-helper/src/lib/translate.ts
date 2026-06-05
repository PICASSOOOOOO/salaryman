import { apiFetch } from '@/lib/api-client';

// In-memory translation cache so toggling the same passage doesn't re-hit the
// LLM. Keyed by target language + source text.
const cache = new Map<string, string>();

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
