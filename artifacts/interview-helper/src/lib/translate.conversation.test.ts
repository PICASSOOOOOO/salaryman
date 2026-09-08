import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiFetch }));

import {
  getTranslationPreferences,
  saveTranslationPreferences,
  TRANSLATION_LANGUAGES,
  translateFreeText,
} from './translate';

describe('conversation translation contract', () => {
  beforeEach(() => {
    localStorage.clear();
    apiFetch.mockReset();
  });

  it('supports Gemma Translator languages and preserves the language pair', () => {
    expect(TRANSLATION_LANGUAGES.slice(0, 6).map(language => language.code))
      .toEqual(['en', 'vi', 'es', 'ja', 'zh', 'ko']);
    saveTranslationPreferences({ source: 'ja', target: 'vi' });
    expect(getTranslationPreferences()).toEqual({ source: 'ja', target: 'vi' });
  });

  it('migrates the legacy WorldPlay language keys', () => {
    localStorage.setItem('sm_xlat_from', 'ko');
    localStorage.setItem('sm_xlat_to', 'en');
    expect(getTranslationPreferences()).toEqual({ source: 'ko', target: 'en' });
  });

  it('uses the free route and does not call the server for identity translations', async () => {
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ translated: 'Xin chào' }),
    });
    await expect(translateFreeText('Hello', 'en', 'vi')).resolves.toBe('Xin chào');
    expect(apiFetch).toHaveBeenCalledWith('/api/education/translate/free', expect.objectContaining({
      method: 'POST',
    }));
    await expect(translateFreeText('Hello', 'en', 'en')).resolves.toBe('Hello');
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});