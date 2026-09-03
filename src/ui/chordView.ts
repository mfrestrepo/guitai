/**
 * ChordUi — the "Aprende acordes" module UI.
 *
 * Two screens (both inside #view-chords):
 *  1. home: the progressive levels with chord chips and change drills
 *  2. lesson: chord card (diagram + "cómo se hace" + tips) and the live
 *     per-string validation ("practice") driven by ChordMicSession.
 *
 * This is the only DOM-touching module for chords. Copy/wording is generated
 * in chords/copy.ts; detection logic lives in chords/*; here we only render.
 */

import type { ChordDef, StringNumber } from '../chords/catalog';
import { chordById, expectedMidi } from '../chords/catalog';
import { CHORD_LEVELS, CHANGE_DRILLS, type ChangeDrill } from '../chords/curriculum';
import {
  browserProgressStorage,
  isChordLearned,
  loadLearnedChordIds,
  markChordLearned,
  type ProgressStorage,
} from '../chords/progress';
import {
  chordHowToLines,
  describeCheck,
  expectedPhrase,
  noteLabelEs,
} from '../chords/copy';
import { chordDiagramSvg } from './chordDiagram';
import { ChordMicSession, type ChordSessionSnapshot } from '../chords/micSession';
import type { PracticeSnapshot, StepState } from '../chords/practice';

interface ChordElements {
  home: HTMLElement;
  lesson: HTMLElement;
  progressHome: HTMLElement;
  levels: HTMLElement;
  lessonBack: HTMLButtonElement;
  lessonTitle: HTMLElement;
  lessonContext: HTMLElement;
  lessonProgress: HTMLElement;
  chordCard: HTMLElement;
  diagram: HTMLElement;
  chordName: HTMLElement;
  chordNotes: HTMLElement;
  howto: HTMLElement;
  tips: HTMLElement;
  chordStart: HTMLButtonElement;
  practice: HTMLElement;
  micStatus: HTMLElement;
  micButton: HTMLButtonElement;
  steps: HTMLElement;
  prompt: HTMLElement;
  feedback: HTMLElement;
  forceButton: HTMLButtonElement;
  skipButton: HTMLButtonElement;
  done: HTMLElement;
  doneText: HTMLElement;
  repeatButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
  finishButton: HTMLButtonElement;
}

type Screen = 'home' | 'lesson';
type LessonKind = { type: 'chord'; levelIndex?: number } | { type: 'drill'; drill: ChangeDrill };

function mustGet<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element in index.html: ${selector}`);
  return el;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class ChordUi {
  private readonly els: ChordElements;
  private readonly storage: ProgressStorage;
  private readonly session: ChordMicSession;

  /** Currently open lesson: an ordered list of chord ids. */
  private lessonChordIds: readonly string[] = [];
  /** Index of the chord being practiced inside the lesson. */
  private lessonIndex = 0;
  private lessonKind: LessonKind | null = null;
  private currentChord: ChordDef | null = null;

  private forceFailedMessage = '';

  constructor(root: ParentNode) {
    this.storage = browserProgressStorage();
    this.els = {
      home: mustGet(root, '#chords-home'),
      lesson: mustGet(root, '#chord-lesson'),
      progressHome: mustGet(root, '#chords-progress'),
      levels: mustGet(root, '#chord-levels'),
      lessonBack: mustGet<HTMLButtonElement>(root, '#chord-lesson-back'),
      lessonTitle: mustGet(root, '#chord-lesson-title'),
      lessonContext: mustGet(root, '#chord-lesson-context'),
      lessonProgress: mustGet(root, '#chord-lesson-progress'),
      chordCard: mustGet(root, '#chord-card'),
      diagram: mustGet(root, '#chord-diagram'),
      chordName: mustGet(root, '#chord-name'),
      chordNotes: mustGet(root, '#chord-notes'),
      howto: mustGet(root, '#chord-howto'),
      tips: mustGet(root, '#chord-tips'),
      chordStart: mustGet<HTMLButtonElement>(root, '#chord-start'),
      practice: mustGet(root, '#practice'),
      micStatus: mustGet(root, '#practice-mic-status'),
      micButton: mustGet<HTMLButtonElement>(root, '#practice-mic-button'),
      steps: mustGet(root, '#practice-steps'),
      prompt: mustGet(root, '#practice-prompt'),
      feedback: mustGet(root, '#practice-feedback'),
      forceButton: mustGet<HTMLButtonElement>(root, '#practice-force'),
      skipButton: mustGet<HTMLButtonElement>(root, '#practice-skip'),
      done: mustGet(root, '#practice-done'),
      doneText: mustGet(root, '#practice-done-text'),
      repeatButton: mustGet<HTMLButtonElement>(root, '#practice-repeat'),
      nextButton: mustGet<HTMLButtonElement>(root, '#practice-next'),
      finishButton: mustGet<HTMLButtonElement>(root, '#practice-finish'),
    };

    this.els.lessonBack.addEventListener('click', () => this.showHome());
    this.els.chordStart.addEventListener('click', () => this.beginPractice());
    this.els.micButton.addEventListener('click', () => this.toggleMic());
    this.els.forceButton.addEventListener('click', () => this.forceCheck());
    this.els.skipButton.addEventListener('click', () => this.session.skipCurrent());
    this.els.repeatButton.addEventListener('click', () => this.repeatPractice());
    this.els.nextButton.addEventListener('click', () => this.advanceLesson());
    this.els.finishButton.addEventListener('click', () => this.showHome());

    // The session emits a snapshot immediately, so it must be created after
    // the DOM elements it renders into.
    this.session = new ChordMicSession({ onChange: (s) => this.onSessionChange(s) });
  }

  /** Full re-render of the home screen (levels + progress). */
  showHome(): void {
    this.session.stop();
    this.currentChord = null;
    this.lessonKind = null;
    this.setScreen('home');
    this.renderHome();
  }

  /** Deactivate everything (used when leaving the module tab). */
  deactivate(): void {
    this.session.stop();
  }

  /** User pressed "Empezar a tocar" on the chord card. */
  private beginPractice(): void {
    const chord = this.currentChord;
    if (!chord) return;
    this.els.practice.hidden = false;
    this.els.done.hidden = true;
    this.els.feedback.hidden = true;
    this.forceFailedMessage = '';
    this.renderPracticeIdle(chord);
    void this.session.start(chord.id);
  }

  private toggleMic(): void {
    const { mic } = this.session.snapshot();
    if (mic === 'running' || mic === 'starting') {
      this.session.stop();
      const chord = this.currentChord;
      if (chord) this.renderPracticeIdle(chord);
    } else {
      const chord = this.currentChord;
      if (chord) void this.session.start(chord.id);
    }
  }

  private forceCheck(): void {
    const ok = this.session.forceCheckNow();
    this.forceFailedMessage = ok ? '' : 'No te he oído — toca la cuerda y pulsa de nuevo.';
    this.onSessionChange(this.session.snapshot());
  }

  private repeatPractice(): void {
    const chord = this.currentChord;
    if (!chord) return;
    this.els.done.hidden = true;
    this.els.feedback.hidden = true;
    this.forceFailedMessage = '';
    if (this.session.snapshot().mic === 'running') {
      this.session.changeChord(chord.id); // reconfigures practice to a fresh run
    } else {
      void this.session.start(chord.id);
    }
    this.onSessionChange(this.session.snapshot());
  }

  private advanceLesson(): void {
    this.lessonIndex += 1;
    if (this.lessonIndex >= this.lessonChordIds.length) {
      this.showHome();
      return;
    }
    this.openLessonChord();
  }

  /* ---------------- lessons ---------------- */

  private startLesson(chordIds: readonly string[], kind: LessonKind): void {
    this.lessonChordIds = chordIds;
    this.lessonIndex = 0;
    this.lessonKind = kind;
    this.openLessonChord();
  }

  private openLessonChord(): void {
    const id = this.lessonChordIds[this.lessonIndex];
    const chord = chordById(id);
    if (!chord) return;
    this.currentChord = chord;
    this.setScreen('lesson');

    // Header
    const level = CHORD_LEVELS.findIndex((l) => l.chordIds.includes(id));
    const drill = this.lessonKind?.type === 'drill' ? this.lessonKind.drill : undefined;
    this.els.lessonTitle.textContent =
      this.lessonKind?.type === 'drill' ? `Progresión ${drill!.title}` : `Acorde ${chord.displayName}`;
    this.els.lessonContext.textContent =
      drill !== undefined
        ? drill.descriptionEs
        : `Nivel ${level + 1}: ${CHORD_LEVELS[level]?.title ?? ''}`.trim();
    this.els.lessonProgress.textContent =
      this.lessonChordIds.length > 1
        ? `Paso ${this.lessonIndex + 1} de ${this.lessonChordIds.length}`
        : '';

    // Chord card
    this.els.diagram.innerHTML = chordDiagramSvg(chord);
    this.els.chordName.textContent = `${chord.displayName} · ${chord.spanishName}`;
    this.els.chordNotes.textContent = chordNotesLine(chord);
    this.els.howto.replaceChildren(
      ...chordHowToLines(chord).map((line, i) => {
        const li = el('li', 'howto-line');
        li.textContent = line;
        li.dataset.index = String(i);
        return li;
      }),
    );
    this.els.tips.replaceChildren(
      ...(chord.tipsEs ?? []).map((tip) => {
        const p = el('p', 'tip');
        p.textContent = `💡 ${tip}`;
        return p;
      }),
    );

    // Practice area is closed until "Empezar a tocar".
    this.els.practice.hidden = true;
    this.els.done.hidden = true;
    this.els.nextButton.hidden = true;
    this.els.nextButton.textContent = '';

    // Keep the "next" affordance visible at the top of practice when needed.
    this.renderHome(); // keeps progress badges fresh
  }

  /* ---------------- session rendering ---------------- */

  private onSessionChange(snapshot: ChordSessionSnapshot): void {
    this.renderMicBar(snapshot);
    const practice = snapshot.practice;
    if (!practice || !this.currentChord) return;
    this.renderPractice(snapshot, practice);
  }

  private renderMicBar(snapshot: ChordSessionSnapshot): void {
    const mic = snapshot.mic;
    const chord = this.currentChord;
    if (mic === 'idle') {
      this.els.micStatus.textContent = chord
        ? 'El micrófono está apagado. Pulsa Iniciar para validar.'
        : '';
      this.els.micButton.textContent = 'Iniciar micrófono';
      this.els.micButton.disabled = false;
      return;
    }
    if (mic === 'starting') {
      this.els.micStatus.textContent = 'Pidiendo acceso al micrófono…';
      this.els.micButton.textContent = 'Iniciando…';
      this.els.micButton.disabled = true;
      return;
    }
    if (mic === 'error') {
      this.els.micStatus.textContent = snapshot.errorMessage ?? 'Error con el micrófono.';
      this.els.micButton.textContent = 'Iniciar micrófono';
      this.els.micButton.disabled = false;
      return;
    }
    // running
    this.els.micStatus.textContent = 'Micrófono activo — escuchando…';
    this.els.micButton.textContent = 'Detener';
    this.els.micButton.disabled = false;
  }

  private renderPracticeIdle(chord: ChordDef): void {
    const strings = chordStepStrings(chord);
    this.renderStepChips(strings.map((n) => ({ stringNumber: n, status: 'pending' as const })));
    this.els.prompt.textContent =
      'Prepara el acorde y pulsa "Iniciar micrófono". Te iré pidiendo cada cuerda.';
    this.els.feedback.hidden = true;
    this.els.done.hidden = true;
    this.els.forceButton.hidden = true;
    this.els.skipButton.hidden = true;
    this.forceFailedMessage = '';
  }

  private renderPractice(snapshot: ChordSessionSnapshot, practice: PracticeSnapshot): void {
    const chord = this.currentChord!;
    this.renderStepChips(practice.steps);

    if (practice.phase === 'complete') {
      this.renderDone(practice, chord);
      return;
    }

    // In progress → prompt for the current string.
    this.els.done.hidden = true;
    this.els.nextButton.hidden = true;
    this.els.forceButton.hidden = snapshot.mic !== 'running' || !snapshot.canForceCheck;
    this.els.skipButton.hidden = snapshot.mic !== 'running';

    const target = practice.steps[practice.activeIndex];
    if (target) {
      this.els.prompt.textContent =
        `🎵 ${expectedPhrase(chord, target.stringNumber)} Silencia con la palma entre cuerda y cuerda.`;
    }

    if (practice.lastCheck) {
      const message = describeCheck(chord, practice.lastCheck);
      this.els.feedback.hidden = false;
      this.els.feedback.textContent = message.text;
      this.els.feedback.className = `practice-feedback ${message.style}`;
    } else if (this.forceFailedMessage) {
      this.els.feedback.hidden = false;
      this.els.feedback.textContent = this.forceFailedMessage;
      this.els.feedback.className = 'practice-feedback error';
    } else {
      this.els.feedback.hidden = true;
    }
  }

  private renderDone(practice: PracticeSnapshot, chord: ChordDef): void {
    this.els.done.hidden = false;
    this.els.feedback.hidden = true;
    this.els.forceButton.hidden = true;
    this.els.skipButton.hidden = true;

    if (practice.mastered) {
      markChordLearned(this.storage, chord.id);
      this.renderHome();
      this.els.doneText.textContent =
        this.lessonChordIds.length > 1
          ? `🎉 ¡${chord.displayName} dominado! (${this.lessonIndex + 1}/${this.lessonChordIds.length})`
          : `🎉 ¡${chord.displayName} dominado! Cámbialo de vez en cuando y repite para afianzarlo.`;
      const hasNext = this.lessonIndex + 1 < this.lessonChordIds.length;
      this.els.nextButton.hidden = !hasNext;
      if (hasNext) {
        const next = chordById(this.lessonChordIds[this.lessonIndex + 1]);
        this.els.nextButton.textContent = `Siguiente: ${next?.displayName ?? ''} →`;
      }
    } else {
      this.els.doneText.textContent =
        'Terminaste con cuerdas saltadas. Para dominarlo de verdad, repite sin saltarte ninguna.';
      this.els.nextButton.hidden = true;
    }
    this.els.repeatButton.hidden = false;
  }

  private renderStepChips(steps: readonly StepState[]): void {
    const chord = this.currentChord;
    this.els.steps.replaceChildren(
      ...steps.map((step) => {
        const midi = chord ? expectedMidi(chord, step.stringNumber) : null;
        const chip = el('div', `step-chip ${step.status}`);
        const num = el('span', 'step-num', `${step.stringNumber}ª`);
        const note = el('span', 'step-note', midi !== null ? noteLabelEs(midi) : '—');
        const mark = el('span', 'step-mark', stepMark(step.status));
        chip.append(num, note, mark);
        return chip;
      }),
    );
  }

  /* ---------------- home screen ---------------- */

  private renderHome(): void {
    const allIds = curriculumChordIdsAll();
    const learned = loadLearnedChordIds(this.storage);
    const done = allIds.filter((id) => learned.has(id)).length;
    this.els.progressHome.textContent = `Progreso: ${done} de ${allIds.length} acordes dominados`;
    this.els.progressHome.dataset.done = String(done === allIds.length);

    this.els.levels.replaceChildren(
      ...CHORD_LEVELS.map((level, levelIndex) => {
        const card = el('section', 'level-card');
        card.appendChild(el('h3', 'level-title', level.title));
        card.appendChild(el('p', 'level-desc', level.description));

        const chips = el('div', 'level-chords');
        for (const chordId of level.chordIds) {
          const chord = chordById(chordId);
          if (!chord) continue;
          const learnedFlag = isChordLearned(this.storage, chord.id);
          const button = el('button', 'chord-chip', `${chord.displayName}${learnedFlag ? ' ✓' : ''}`);
          button.type = 'button';
          button.dataset.learned = String(learnedFlag);
          button.title = `${chord.spanishName} — haz clic para ver cómo se hace`;
          button.addEventListener('click', () =>
            this.startLesson([chord.id], { type: 'chord', levelIndex }),
          );
          chips.appendChild(button);
        }
        card.appendChild(chips);

        const drills = level.drillIds
          .map((id) => CHANGE_DRILLS.find((d) => d.id === id))
          .filter((d): d is ChangeDrill => d !== undefined);
        if (drills.length > 0) {
          const drillRow = el('div', 'level-drills');
          for (const drill of drills) {
            const button = el('button', 'drill-chip', `🔄 ${drill.title}`);
            button.type = 'button';
            button.title = drill.descriptionEs;
            button.addEventListener('click', () => this.startLesson(drill.chordIds, { type: 'drill', drill }));
            drillRow.appendChild(button);
          }
          card.appendChild(drillRow);
        }
        return card;
      }),
    );
  }

  private setScreen(screen: Screen): void {
    this.els.home.hidden = screen !== 'home';
    this.els.lesson.hidden = screen !== 'lesson';
  }
}

function stepMark(status: StepState['status']): string {
  switch (status) {
    case 'ok':
      return '✓';
    case 'wrong':
      return '✗';
    case 'almost':
      return '~';
    case 'skipped':
      return '→';
    default:
      return '';
  }
}

function chordNotesLine(chord: ChordDef): string {
  const notes: string[] = [];
  for (const string of chord.strings) {
    const midi = expectedMidi(chord, string.number);
    if (midi === null) continue;
    notes.push(noteLabelEs(midi));
  }
  return `Sonido esperado (de grave a agudo): ${notes.join(' · ')}`;
}

function chordStepStrings(chord: ChordDef): readonly StringNumber[] {
  return chord.strings.filter((s) => s.fret !== null).map((s) => s.number);
}

function curriculumChordIdsAll(): readonly string[] {
  const ids: string[] = [];
  for (const level of CHORD_LEVELS) {
    for (const id of level.chordIds) ids.push(id);
  }
  return ids;
}
