/**
 * Convert a canonical all-caps player name into text that speech synthesis
 * treats like a name instead of an acronym. This is intentionally a
 * player-name helper, not a global TTS cleanup pass: unrelated acronyms and
 * product names must keep the spelling they were given.
 */
const HAS_LETTER = /\p{L}/u;
const HAS_LOWERCASE_LETTER = /\p{Ll}/u;
const NAME_PART_START = /(^|[^\p{L}\p{N}])(\p{L})/gu;

export function formatSpeechName(name: string): string {
  const value = name.trim();
  if (!value || !HAS_LETTER.test(value) || HAS_LOWERCASE_LETTER.test(value)) {
    return value;
  }

  const lowercase = value.toLocaleLowerCase();
  return lowercase.replace(NAME_PART_START, (_match, separator: string, letter: string) => (
    `${separator}${letter.toLocaleUpperCase()}`
  ));
}