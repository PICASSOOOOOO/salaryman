export interface SpellMatch {
  word: string;
  offset: number;
  length: number;
  suggestions: string[];
}

export async function checkSpelling(text: string): Promise<SpellMatch[]> {
  if (!text.trim()) return [];
  try {
    const params = new URLSearchParams({ text, language: 'en-US' });
    const res = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      matches: {
        message: string;
        offset: number;
        length: number;
        replacements: { value: string }[];
        rule: { issueType: string };
      }[];
    };
    return data.matches
      .filter(m => m.rule.issueType === 'misspelling')
      .map(m => ({
        word: text.slice(m.offset, m.offset + m.length),
        offset: m.offset,
        length: m.length,
        suggestions: m.replacements.slice(0, 5).map(r => r.value),
      }));
  } catch {
    return [];
  }
}
