import { describe, expect, it } from 'vitest';
import {
  CHORD_CATALOG,
  chordById,
  chordPitchClasses,
  expectedFrequency,
  expectedMidi,
  expectedNoteName,
  mutedStrings,
  soundingStrings,
} from './catalog';
import { midiToFrequency } from '../theory/music';

describe('chord catalog invariants', () => {
  it('contains the seven starter chords', () => {
    expect(CHORD_CATALOG.ids).toEqual(['em', 'e', 'am', 'a', 'd', 'c', 'g']);
  });

  it('passes the load-time shape check (module already validated)', () => {
    for (const id of CHORD_CATALOG.ids) {
      const chord = chordById(id);
      expect(chord).toBeDefined();
      expect(soundingStrings(chord!).length).toBeGreaterThanOrEqual(3);
      // The root pitch class must sound somewhere.
      expect(chordPitchClasses(chord!).has(chord!.rootPitchClass)).toBe(true);
    }
  });

  it('spells each chord correctly from its fingering (pitch classes)', () => {
    // For each chord: the pitch classes besides the root that must sound.
    // em → E G B · e → E G# B · am → A C E · a → A C# E · d → D F# A
    // c → C E G · g → G B D
    const expectations: Record<string, number[]> = {
      em: [7, 11],
      e: [8, 11],
      am: [0, 4],
      a: [1, 4],
      d: [6, 9],
      c: [4, 7],
      g: [2, 11],
    };
    for (const [id, otherTones] of Object.entries(expectations)) {
      const chord = chordById(id)!;
      const pcs = [...chordPitchClasses(chord)].sort((a, b) => a - b);
      expect(pcs).toEqual([chord.rootPitchClass, ...otherTones].sort((a, b) => a - b));
    }
  });
});

describe('expected notes per string', () => {
  it('low E string of Em sounds E2 open (fret 0)', () => {
    const em = chordById('em')!;
    expect(expectedNoteName(em, 6)).toBe('E2');
    expect(expectedFrequency(em, 6)).toBeCloseTo(midiToFrequency(40), 9);
  });

  it('E major: 5th string fretted at 2 → B2; 3rd string fret 1 → G#3', () => {
    const e = chordById('e')!;
    expect(expectedMidi(e, 5)).toBe(47);
    expect(expectedNoteName(e, 5)).toBe('B2');
    expect(expectedNoteName(e, 3)).toBe('G#3');
  });

  it('A major mutes the low E and sounds A on the 5th (open)', () => {
    const a = chordById('a')!;
    expect(mutedStrings(a).map((s) => s.number)).toEqual([6]);
    expect(expectedMidi(a, 6)).toBeNull();
    expect(expectedNoteName(a, 5)).toBe('A2');
  });

  it('G major frets both E strings at fret 3 → G2 and G4', () => {
    const g = chordById('g')!;
    expect(expectedNoteName(g, 6)).toBe('G2');
    expect(expectedNoteName(g, 1)).toBe('G4');
  });

  it('C major frets A string at 3 → C3 (the bass note)', () => {
    const c = chordById('c')!;
    expect(expectedNoteName(c, 5)).toBe('C3');
    expect(expectedMidi(c, 6)).toBeNull();
  });

  it('unknown chord ids and strings are handled safely', () => {
    expect(chordById('nope')).toBeUndefined();
    const em = chordById('em')!;
    expect(expectedMidi(em, 7 as never)).toBeNull();
  });
});

describe('sounding / muted helpers', () => {
  it('Em and E ring all six strings', () => {
    expect(soundingStrings(chordById('em')!).length).toBe(6);
    expect(soundingStrings(chordById('e')!).length).toBe(6);
  });

  it('D mutes strings 6 and 5, Am and A mute only the 6th, C mutes the 6th', () => {
    expect(mutedStrings(chordById('d')!).map((s) => s.number)).toEqual([6, 5]);
    expect(mutedStrings(chordById('am')!).map((s) => s.number)).toEqual([6]);
    expect(mutedStrings(chordById('a')!).map((s) => s.number)).toEqual([6]);
    expect(mutedStrings(chordById('c')!).map((s) => s.number)).toEqual([6]);
    expect(mutedStrings(chordById('g')!).length).toBe(0);
  });
});
