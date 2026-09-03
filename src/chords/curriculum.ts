/**
 * Progressive curriculum for beginner chord learning.
 *
 * Pedagogy notes (why this order):
 *  - Level 1 starts with the easiest *shapes* and shares forms: Em and E differ
 *    by one finger; Am reuses Em's shape shifted a string; A is Am +1 finger.
 *    D ends the level with a different shape but very forgiving.
 *  - Level 2 introduces the "difficult" open chords C and G once basic hand
 *    mechanics exist.
 *  - Level 3 stops teaching new chords and practices *changes* between real
 *    chord progressions used by countless songs.
 *
 * Everything is plain data so adding levels/chords/drills never touches code
 * that detects or validates audio.
 */

export interface ChangeDrill {
  readonly id: string;
  /** Human title, e.g. "A – D – E". */
  readonly title: string;
  /** Spanish description of what to practice. */
  readonly descriptionEs: string;
  /** Chord ids in the order they should be played (see catalog.ts). */
  readonly chordIds: readonly string[];
}

export interface ChordLevel {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Chord ids introduced at this level. */
  readonly chordIds: readonly string[];
  /** Change drills available at this level. */
  readonly drillIds: readonly string[];
}

export const CHANGE_DRILLS: readonly ChangeDrill[] = [
  {
    id: 'ade',
    title: 'A – D – E',
    descriptionEs:
      'La progresión clásica de miles de canciones. Toca cada acorde, suéltalo y cambia de forma.',
    chordIds: ['a', 'd', 'e'],
  },
  {
    id: 'gcd',
    title: 'G – C – D',
    descriptionEs: 'Trabaja el cambio G↔C, el más famoso para principiantes.',
    chordIds: ['g', 'c', 'd'],
  },
  {
    id: 'ecgd',
    title: 'Em – C – G – D',
    descriptionEs:
      'Cuatro acordes que aparecen en muchísimas canciones. Si llegas hasta aquí, ¡felicidades!',
    chordIds: ['em', 'c', 'g', 'd'],
  },
];

export const CHORD_LEVELS: readonly ChordLevel[] = [
  {
    id: 'level-1',
    title: 'Nivel 1 · Primeros acordes',
    description: 'Em, E, Am, A y D: formas sencillas que comparten digitación.',
    chordIds: ['em', 'e', 'am', 'a', 'd'],
    drillIds: [],
  },
  {
    id: 'level-2',
    title: 'Nivel 2 · C y G, los "difíciles"',
    description: 'Dos acordes esenciales que requieren más estiramiento de la mano.',
    chordIds: ['c', 'g'],
    drillIds: [],
  },
  {
    id: 'level-3',
    title: 'Nivel 3 · Cambios entre acordes',
    description: 'Suéltalos y cámbialos: aquí empieza la música de verdad.',
    chordIds: [],
    drillIds: ['ade', 'gcd', 'ecgd'],
  },
];

/** All ids referenced anywhere in the curriculum, in a stable, ordered set. */
export function curriculumChordIds(): readonly string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const level of CHORD_LEVELS) {
    for (const id of level.chordIds) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    for (const drillId of level.drillIds) {
      const drill = CHANGE_DRILLS.find((d) => d.id === drillId);
      if (!drill) throw new Error(`Drill "${drillId}" referenced by level ${level.id} is missing.`);
      for (const chordId of drill.chordIds) {
        if (!seen.has(chordId)) {
          seen.add(chordId);
          ids.push(chordId);
        }
      }
    }
  }
  return ids;
}
