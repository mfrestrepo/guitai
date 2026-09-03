import { describe, expect, it } from 'vitest';
import { chordById } from '../chords/catalog';
import {
  chordHowToLines,
  describeCheck,
  expectedPhrase,
  midiToLetter,
  noteLabelEs,
  noteLabelFromName,
  noteNameToMidi,
  otherStringMatched,
  stringOrdinal,
} from '../chords/copy';
import { evaluateStringNote } from '../chords/evaluate';

describe('Spanish copy helpers', () => {
  it('formats ordinals and note labels', () => {
    expect(stringOrdinal(5)).toBe('5ª cuerda');
    expect(noteLabelEs(40)).toBe('Mi (E2)');
    expect(noteLabelEs(56)).toBe('Sol# (G#3)');
    expect(midiToLetter(69)).toBe('A4');
  });

  it('converts note names and back', () => {
    expect(noteNameToMidi('E2')).toBe(40);
    expect(noteNameToMidi('A2')).toBe(45);
    expect(noteNameToMidi('C4')).toBe(60);
    expect(noteLabelFromName('E2')).toBe('Mi (E2)');
    expect(noteLabelFromName('G#3')).toBe('Sol# (G#3)');
  });

  it('describes how to form the Em chord step by step', () => {
    const lines = chordHowToLines(chordById('em')!);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('dedo 2');
    expect(lines[0]).toContain('traste 2');
    expect(lines[0]).toContain('5ª cuerda');
    expect(lines[1]).toContain('dedo 3');
    expect(lines[1]).toContain('4ª cuerda');
    expect(lines.some((l) => l.includes('al aire'))).toBe(true);
  });

  it('tells which strings are muted in A (6th) and D (6th and 5th)', () => {
    const aLines = chordHowToLines(chordById('a')!);
    expect(aLines.some((l) => l.includes('NO toques') && l.includes('6'))).toBe(true);
    const dLines = chordHowToLines(chordById('d')!);
    expect(dLines.some((l) => l.includes('NO toques') && l.includes('6 y 5'))).toBe(true);
  });

  it('builds the "expected note" phrase per string', () => {
    const em = chordById('em')!;
    expect(expectedPhrase(em, 6)).toBe('La 6ª cuerda debe sonar Mi (E2).');
    expect(expectedPhrase(em, 5)).toContain('Si (B2)');
    const a = chordById('a')!;
    expect(expectedPhrase(a, 6)).toContain('no debe sonar');
  });

  it('describes an ok check as success', () => {
    const em = chordById('em')!;
    const check = evaluateStringNote(em, 6, 82.4069);
    const msg = describeCheck(em, check);
    expect(msg.style).toBe('success');
    expect(msg.text).toContain('Correcta');
    expect(msg.text).toContain('Mi (E2)');
  });

  it('describes an almost check as a tuning warning', () => {
    const em = chordById('em')!;
    const check = evaluateStringNote(em, 6, 82.4069 * 2 ** (60 / 1200));
    const msg = describeCheck(em, check);
    expect(msg.style).toBe('warning');
    expect(msg.text).toContain('Muy cerca');
  });

  it('describes a wrong note and suggests the string that was actually played', () => {
    const em = chordById('em')!;
    // Target string 5 (should be B2) but the learner plays E3 — the note of
    // string 4 of the same chord.
    const check = evaluateStringNote(em, 5, 164.8138);
    const msg = describeCheck(em, check);
    expect(msg.style).toBe('error');
    expect(msg.text).toContain('Suena Mi (E3)');
    expect(msg.text).toContain('Si (B2)');
    expect(otherStringMatched(em, 164.8138)).toBe(4);
    expect(msg.text).toContain('4ª cuerda');
  });
});
