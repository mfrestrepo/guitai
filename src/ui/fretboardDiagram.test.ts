import { describe, expect, it } from 'vitest';
import { techniqueExerciseById } from '../technique/exercises';
import { fretboardSvg, uniquePositions } from './fretboardDiagram';

const chromatic = techniqueExerciseById('chromatic-low-strings')!;
const scale = techniqueExerciseById('scale-c-major-1oct')!;

describe('fretboardSvg', () => {
  it('draws a neck with strings, frets and numbers', () => {
    const svg = fretboardSvg(chromatic, { current: chromatic.notes[0] });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('fb-nut');
    expect(svg).toContain('fb-fret');
    expect(svg).toContain('fb-string');
    for (const stringNumber of [1, 2, 3, 4, 5, 6]) {
      expect(svg).toContain(`>${stringNumber}</text>`);
    }
  });

  it('writes the left-hand finger numbers on the dots', () => {
    const svg = fretboardSvg(chromatic, { current: chromatic.notes[0] });
    // Chromatic 1-2-3-4 → the pattern is readable as finger numbers.
    expect(svg).toContain('fb-finger');
    for (const finger of [1, 2, 3, 4]) {
      expect(svg).toContain(`>${finger}</text>`);
    }
  });

  it('highlights exactly one current position', () => {
    const svg = fretboardSvg(chromatic, { current: chromatic.notes[1] });
    expect((svg.match(/fb-dot current/g) ?? []).length).toBe(1);
    expect(svg).toContain('fb-finger current');
  });

  it('shows the note name on the current dot when there is no fingering', () => {
    // The repeated-note drill plays an open string (no finger).
    const drill = techniqueExerciseById('repeated-note-i-m')!;
    const svg = fretboardSvg(drill, { current: drill.notes[0] });
    expect(svg).toContain('>B3</text>');
  });

  it('includes the scale fingerings', () => {
    const svg = fretboardSvg(scale, { current: scale.notes[0] });
    expect(svg).toContain('>3</text>'); // C3 uses the ring finger
  });
});

describe('uniquePositions', () => {
  it('deduplicates the positions of the drill and keeps the finger', () => {
    const positions = uniquePositions(chromatic);
    expect(positions).toHaveLength(12); // 3 strings × 4 frets
    expect(positions[0]).toMatchObject({ stringNumber: 6, fret: 1, finger: 1 });
    expect(positions[3]).toMatchObject({ stringNumber: 6, fret: 4, finger: 4 });
  });

  it('keeps the scale positions with their fingers', () => {
    const positions = uniquePositions(scale);
    expect(positions).toHaveLength(8);
    expect(positions.find((p) => p.midi === 48)?.finger).toBe(3); // C3
  });
});
