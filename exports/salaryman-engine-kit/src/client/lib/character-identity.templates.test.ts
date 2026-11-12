import { describe, it, expect } from 'vitest';
import {
  type Appearance,
  defaultAppearance,
  templateGender,
  templateFromAppearance,
  factionGarb,
  applyTemplateGarb,
  applyCharacterTemplate,
  isWorkAppropriate,
  workOutfitStyle,
  toWorkAttire,
  asFaction,
  CHARACTER_TEMPLATES,
} from './character-identity';

const base = (over: Partial<Appearance> = {}): Appearance => ({
  ...defaultAppearance(),
  ...over,
});

describe('character templates', () => {
  it('exposes exactly the three templates', () => {
    expect(CHARACTER_TEMPLATES.map(t => t.id).sort()).toEqual(['man', 'replicant', 'woman']);
  });

  it('maps template -> body gender (replicant is neutral)', () => {
    expect(templateGender('man')).toBe('m');
    expect(templateGender('woman')).toBe('f');
    expect(templateGender('replicant')).toBe('nb');
  });

  it('derives a template from existing save data (migration)', () => {
    // Replicant identity wins via faction or legacy class.
    expect(templateFromAppearance(base({ gender: 'f' }), 'trader', 'replicant')).toBe('replicant');
    expect(templateFromAppearance(base({ gender: 'm' }), 'replicant')).toBe('replicant');
    // Otherwise body gender decides; neutral bodies fall back to man.
    expect(templateFromAppearance(base({ gender: 'f' }), 'trader', 'suit')).toBe('woman');
    expect(templateFromAppearance(base({ gender: 'm' }), 'trader', 'suit')).toBe('man');
    expect(templateFromAppearance(base({ gender: 'nb' }), 'trader', 'suit')).toBe('man');
    expect(templateFromAppearance(undefined)).toBe('man');
  });
});

describe('faction garb', () => {
  it('gives corporate (suit faction) work-appropriate defaults', () => {
    expect(isWorkAppropriate({ ...base(), ...factionGarb('man', 'suit') })).toBe(true);
    expect(isWorkAppropriate({ ...base(), ...factionGarb('woman', 'suit') })).toBe(true);
    expect(factionGarb('woman', 'suit').outfitStyle).toBe('dress');
    expect(factionGarb('man', 'suit').outfitStyle).toBe('suit');
  });

  it('gives nomad/replicant factions non-suit defaults (visible work swap)', () => {
    expect(isWorkAppropriate({ ...base(), ...factionGarb('man', 'nomad') })).toBe(false);
    expect(isWorkAppropriate({ ...base(), ...factionGarb('woman', 'nomad') })).toBe(false);
    expect(isWorkAppropriate({ ...base(), ...factionGarb('replicant', 'replicant') })).toBe(false);
  });

  it('applyTemplateGarb sets gender + garb but preserves customization', () => {
    const a = base({ skinTone: '#abcdef', hairStyle: 'long', faceStyle: 'shades' });
    const out = applyTemplateGarb(a, 'woman', 'suit');
    expect(out.gender).toBe('f');
    expect(out.outfitStyle).toBe('dress');
    expect(out.skinTone).toBe('#abcdef');
    expect(out.hairStyle).toBe('long');
    expect(out.faceStyle).toBe('shades');
  });

  it('asFaction falls back to suit for unknown input', () => {
    expect(asFaction('nomad')).toBe('nomad');
    expect(asFaction('garbage')).toBe('suit');
    expect(asFaction(undefined)).toBe('suit');
  });
});

describe('applyCharacterTemplate', () => {
  it('applies gender + faction garb AND valid look hints', () => {
    const out = applyCharacterTemplate(base(), 'woman', 'suit', {
      skinTone: '#3a2a1a',
      hairColor: '#0a0a0a',
      hairStyle: 'long',
      faceStyle: 'shades',
    });
    expect(out.gender).toBe('f');
    expect(out.outfitStyle).toBe('dress'); // suit faction garb
    expect(out.skinTone).toBe('#3a2a1a');
    expect(out.hairColor).toBe('#0a0a0a');
    expect(out.hairStyle).toBe('long');
    expect(out.faceStyle).toBe('shades');
  });

  it('falls back to garb-only when no look is supplied', () => {
    const a = base({ skinTone: '#abcdef', hairStyle: 'long' });
    const out = applyCharacterTemplate(a, 'man', 'suit');
    expect(out.gender).toBe('m');
    expect(out.outfitStyle).toBe('suit');
    // No look → existing customization preserved.
    expect(out.skinTone).toBe('#abcdef');
    expect(out.hairStyle).toBe('long');
  });

  it('ignores garbage look hints (degrades to current values)', () => {
    const a = base({ skinTone: '#abcdef', hairColor: '#112233', hairStyle: 'long', faceStyle: 'shades' });
    const out = applyCharacterTemplate(a, 'man', 'suit', {
      skinTone: 'not-a-hex',
      hairColor: 'rgb(1,2,3)',
      hairStyle: 'bogus-style',
      faceStyle: '???',
    });
    expect(out.skinTone).toBe('#abcdef');
    expect(out.hairColor).toBe('#112233');
    expect(out.hairStyle).toBe('long');
    expect(out.faceStyle).toBe('shades');
  });

  it('never mutates the input appearance', () => {
    const a = base({ gender: 'm', outfitStyle: 'jumpsuit' });
    const snapshot = { ...a };
    applyCharacterTemplate(a, 'woman', 'nomad', { skinTone: '#111111' });
    expect(a).toEqual(snapshot);
  });

  it('does not set portraitUrl (caller owns that)', () => {
    const out = applyCharacterTemplate(base(), 'replicant', 'replicant', { skinTone: '#445566' });
    expect(out.portraitUrl).toBeUndefined();
  });
});

describe('work dress code', () => {
  it('suit and dress satisfy the dress code; others do not', () => {
    expect(isWorkAppropriate(base({ outfitStyle: 'suit' }))).toBe(true);
    expect(isWorkAppropriate(base({ outfitStyle: 'dress' }))).toBe(true);
    expect(isWorkAppropriate(base({ outfitStyle: 'hoodie' }))).toBe(false);
    expect(isWorkAppropriate(base({ outfitStyle: 'duster' }))).toBe(false);
  });

  it('femme bodies get a dress, others a suit', () => {
    expect(workOutfitStyle(base({ gender: 'f' }))).toBe('dress');
    expect(workOutfitStyle(base({ gender: 'm' }))).toBe('suit');
    expect(workOutfitStyle(base({ gender: 'nb' }))).toBe('suit');
  });

  it('toWorkAttire swaps only the silhouette and preserves everything else', () => {
    const a = base({ gender: 'f', outfitStyle: 'hoodie', outfitColor: '#7a3a18', hairColor: '#112233' });
    const work = toWorkAttire(a);
    expect(work.outfitStyle).toBe('dress');
    expect(work.outfitColor).toBe('#7a3a18'); // color identity preserved
    expect(work.hairColor).toBe('#112233');
  });

  it('toWorkAttire is a no-op (same reference) when already compliant', () => {
    const a = base({ outfitStyle: 'suit' });
    expect(toWorkAttire(a)).toBe(a);
  });

  it('never mutates the input appearance', () => {
    const a = base({ gender: 'm', outfitStyle: 'jumpsuit' });
    const snapshot = { ...a };
    toWorkAttire(a);
    expect(a).toEqual(snapshot);
  });
});
