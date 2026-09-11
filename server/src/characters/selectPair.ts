import type { Character } from './types';
import type { SimilarityLevel } from '../types';

export interface SelectPairResult {
  civilCharacter: Character;
  undercoverCharacter: Character;
  levelUsed: SimilarityLevel;
  wasRelaxed: boolean;
}

const LEVELS: SimilarityLevel[] = ['very_close', 'close', 'none'];

/** Chance that, once a civil character with attributes is picked, the undercover word becomes
 * one of its own attributes instead of a genuinely different character. */
const ATTRIBUTE_SWAP_CHANCE = 0.15;
/** Only anime characters carry curated attributes for now (see data.ts). */
const ATTRIBUTE_SWAP_THEME = 'anime';

/** With ATTRIBUTE_SWAP_CHANCE probability, replaces `undercoverCharacter` with a synthetic
 * "character" whose name is one of `civilCharacter`'s own attributes -- eligible only when the
 * civil character is in ATTRIBUTE_SWAP_THEME and has at least one attribute. */
function maybeSwapForAttribute(
  civilCharacter: Character,
  undercoverCharacter: Character,
  random: () => number
): Character {
  if (civilCharacter.theme !== ATTRIBUTE_SWAP_THEME || !civilCharacter.attributes?.length) {
    return undercoverCharacter;
  }
  if (random() >= ATTRIBUTE_SWAP_CHANCE) {
    return undercoverCharacter;
  }
  const attribute = civilCharacter.attributes[Math.floor(random() * civilCharacter.attributes.length)];
  return { id: `${civilCharacter.id}-attribute`, name: attribute, theme: civilCharacter.theme, tags: [] };
}

function sharedTagCount(a: Character, b: Character): number {
  const tagsB = new Set(b.tags);
  return a.tags.filter((tag) => tagsB.has(tag)).length;
}

function matchesLevel(count: number, level: SimilarityLevel): boolean {
  // Tuned for characters carrying 10 tags each (was 1-2 / 3+ when characters had 5 tags).
  if (level === 'none') return count === 0;
  if (level === 'close') return count >= 2 && count <= 4;
  return count >= 5;
}

export function selectCharacterPair(
  characters: Character[],
  themes: string[],
  requestedLevel: SimilarityLevel,
  random: () => number = Math.random,
  seriesFilter: Record<string, string[]> = {}
): SelectPairResult {
  const pool = characters.filter((c) => {
    if (!themes.includes(c.theme)) return false;
    // A missing/empty entry for a theme means "no filter" -- every character in that theme stays eligible.
    const allowedSeries = seriesFilter[c.theme];
    if (allowedSeries && allowedSeries.length > 0) {
      return c.series !== undefined && allowedSeries.includes(c.series);
    }
    return true;
  });
  if (pool.length < 2) {
    throw new Error('Not enough characters in the selected themes to form a pair');
  }

  const startIndex = LEVELS.indexOf(requestedLevel);
  for (let i = startIndex; i < LEVELS.length; i++) {
    const level = LEVELS[i];
    const pairs: [Character, Character][] = [];
    for (let a = 0; a < pool.length; a++) {
      for (let b = a + 1; b < pool.length; b++) {
        if (matchesLevel(sharedTagCount(pool[a], pool[b]), level)) {
          pairs.push([pool[a], pool[b]]);
        }
      }
    }
    if (pairs.length > 0) {
      const [charA, charB] = pairs[Math.floor(random() * pairs.length)];
      const civilFirst = random() < 0.5;
      const civilCharacter = civilFirst ? charA : charB;
      const undercoverCharacter = civilFirst ? charB : charA;
      return {
        civilCharacter,
        undercoverCharacter: maybeSwapForAttribute(civilCharacter, undercoverCharacter, random),
        levelUsed: level,
        wasRelaxed: level !== requestedLevel,
      };
    }
  }

  throw new Error('No valid character pair found even after relaxing the similarity level');
}
