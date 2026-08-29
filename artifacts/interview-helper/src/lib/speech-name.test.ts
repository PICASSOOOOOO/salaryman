import { describe, expect, it } from 'vitest';
import { formatSpeechName } from './speech-name';

describe('formatSpeechName', () => {
  it('turns canonical all-caps multi-word names into natural speech casing', () => {
    expect(formatSpeechName('ALEX DUONG')).toBe('Alex Duong');
  });

  it('capitalizes punctuation-separated name parts', () => {
    expect(formatSpeechName("MARY-JANE O'CONNOR")).toBe("Mary-Jane O'Connor");
    expect(formatSpeechName('J.R. PARK')).toBe('J.R. Park');
  });

  it('leaves naturally cased names unchanged', () => {
    expect(formatSpeechName('Alex McDuong')).toBe('Alex McDuong');
  });

  it('does not invent a name from punctuation or digits', () => {
    expect(formatSpeechName('007')).toBe('007');
    expect(formatSpeechName('—')).toBe('—');
  });
});