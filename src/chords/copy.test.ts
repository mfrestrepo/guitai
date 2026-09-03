import { describe, expect, it } from 'vitest';
import { chordById } from './catalog';
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
  strumIssueLine,
} from './copy';
import { evaluateStringNote } from './evaluate';

describe('Spanish copy helpers (short, letter-only labels)', () => {
  it('formats ordinals and note labels', () => {
    expect(stringOrdinal(5)).toBe('5ª cuerda');
    expect(noteLabelEs(40)).toBe('Mi (E2)');
    expect(midiToLetter(69)).toBe('A4');
  });

  it('converts note names', () => {
    expect(noteNameToMidi('E2')).toBe(40);
    expect(noteNameToMidi('C4')).toBe(60);
    expect(noteLabelFromName('E2')).toBe('Mi (E2)');
  });

  it('describes how to form the Em chord step by step', () => {
    const lines = chordHowToLines(chordById('em')!);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines[0]).toContain('dedo 2');
    expect(lines[0]).toContain('5ª cuerda');
  });

  it('builds short expected-note labels per string (letters only)', () => {
    const em = chordById('em')!;
    expect(expectedPhrase(em, 6)).toBe('6ª cuerda → E2');
    expect(expectedPhrase(em, 5)).toContain('B2');
    const a = chordById('a')!;
    expect(expectedPhrase(a, 6)).toContain('muda');
  });

  it('describes an ok check as a tiny success label', () => {
    const em = chordById('em')!;
    const check = evaluateStringNote(em, 6, 82.4069);
    const msg = describeCheck(em, check);
    expect(msg.style).toBe('success');
    expect(msg.text).toContain('✓ E2');
  });

  it('describes an almost check tersely as a tuning hint', () => {
    const em = chordById('em')!;
    const check = evaluateStringNote(em, 6, 82.4069 * 2 ** (60 / 1200));
    const msg = describeCheck(em, check);
    expect(msg.style).toBe('warning');
    expect(msg.text).toContain('¿afinada?');
  });

  it('describes a wrong note and hints at the string actually played', () => {
    const em = chordById('em')!;
    const check = evaluateStringNote(em, 5, 164.8138); // E3 instead of B2
    const msg = describeCheck(em, check);
    expect(msg.style).toBe('error');
    expect(msg.text).toContain('Suena E3');
    expect(msg.text).toContain('debe B2');
    expect(otherStringMatched(em, 164.8138)).toBe(4);
    expect(msg.text).toContain('4ª cuerda');
  });

  it('writes strum issues as terse chips', () => {
    expect(strumIssueLine('missing', undefined, 3)).toBe('No suena la 3ª cuerda');
    expect(strumIssueLine('muted-ring', undefined, 6)).toBe('La 6ª cuerda no debe sonar');
    expect(strumIssueLine('foreign', 'F3 (174.6 Hz)')).toContain('Se oye F3');
  });
});
