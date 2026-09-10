import type { Character } from './types';
import type { SimilarityLevel } from '../types';

export interface SelectPairResult {
  civilCharacter: Character;
  undercoverCharacter: Character;
  levelUsed: SimilarityLevel;
  wasRelaxed: boolean;
}

const LEVELS: SimilarityLevel[] = ['very_close', 'close', 'none'];

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
  animeSeries: string[] = []
): SelectPairResult {
  const pool = characters.filter((c) => {
    if (!themes.includes(c.theme)) return false;
    // An empty/omitted animeSeries means "no filter" -- every anime character stays eligible.
    if (c.theme === 'anime' && animeSeries.length > 0) {
      return c.series !== undefined && animeSeries.includes(c.series);
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
      return {
        civilCharacter: civilFirst ? charA : charB,
        undercoverCharacter: civilFirst ? charB : charA,
        levelUsed: level,
        wasRelaxed: level !== requestedLevel,
      };
    }
  }

  throw new Error('No valid character pair found even after relaxing the similarity level');
}
