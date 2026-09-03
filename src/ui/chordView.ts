/**
 * ChordUi — the "Aprende acordes" module UI.
 *
 * Screens (inside #view-chords):
 *  1. home: levels with big chord tiles + change drills.
 *  2. lesson: chord card (diagram + how-to + tips) and validation, in two modes:
 *     - "Rasgueo"      → StrumMicSession (spectral check of a sustained strum)
 *     - "Cuerda a cuerda" → ChordMicSession (per-string arpeggio)
 *
 * Wording is generated in chords/copy.ts; detection lives in chords/*; this
 * module only renders snapshots. It is the only DOM-touching code here.
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
  strumIssueLine,
} from '../chords/copy';
import { chordDiagramSvg } from './chordDiagram';
import { ChordMicSession, type ChordSessionSnapshot } from '../chords/micSession';
import { StrumMicSession, type StrumSessionSnapshot } from '../chords/strumSession';
import type { PracticeSnapshot, StepState } from '../chords/practice';
import type { StrumCheckResult } from '../chords/strumCheck';

type PracticeMode = 'arpeggio' | 'strum';

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
  tips: HTMLDetailsElement;
  tipsBody: HTMLElement;
  modeStrum: HTMLButtonElement;
  modeArpeggio: HTMLButtonElement;
  // arpeggio practice
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
  // strum practice
  practiceStrum: HTMLElement;
  strumMicStatus: HTMLElement;
  strumMicButton: HTMLButtonElement;
  strumChordName: HTMLElement;
  strumVerdict: HTMLElement;
  strumIssues: HTMLUListElement;
  strumLights: HTMLElement;
  strumNext: HTMLButtonElement;
  strumFinish: HTMLButtonElement;
}

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
  private readonly strum: StrumMicSession;

  private lessonChordIds: readonly string[] = [];
  private lessonIndex = 0;
  private lessonKind: LessonKind | null = null;
  private currentChord: ChordDef | null = null;
  private activeMode: PracticeMode | null = null;

  private forceFailedMessage = '';
  private strumLearnedMarked = new Set<string>();

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
      tips: mustGet<HTMLDetailsElement>(root, '#chord-tips'),
      tipsBody: mustGet(root, '#chord-tips-body'),
      modeStrum: mustGet<HTMLButtonElement>(root, '#mode-strum'),
      modeArpeggio: mustGet<HTMLButtonElement>(root, '#mode-arpeggio'),
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
      practiceStrum: mustGet(root, '#practice-strum'),
      strumMicStatus: mustGet(root, '#strum-mic-status'),
      strumMicButton: mustGet<HTMLButtonElement>(root, '#strum-mic-button'),
      strumChordName: mustGet(root, '#strum-chord-name'),
      strumVerdict: mustGet(root, '#strum-verdict'),
      strumIssues: mustGet<HTMLUListElement>(root, '#strum-issues'),
      strumLights: mustGet(root, '#strum-lights'),
      strumNext: mustGet<HTMLButtonElement>(root, '#strum-next'),
      strumFinish: mustGet<HTMLButtonElement>(root, '#strum-finish'),
    };

    this.els.lessonBack.addEventListener('click', () => this.showHome());
    this.els.modeStrum.addEventListener('click', () => this.startMode('strum'));
    this.els.modeArpeggio.addEventListener('click', () => this.startMode('arpeggio'));
    this.els.micButton.addEventListener('click', () => this.toggleArpeggioMic());
    this.els.forceButton.addEventListener('click', () => this.forceCheck());
    this.els.skipButton.addEventListener('click', () => this.session.skipCurrent());
    this.els.repeatButton.addEventListener('click', () => this.repeatArpeggio());
    this.els.nextButton.addEventListener('click', () => this.advanceLesson());
    this.els.finishButton.addEventListener('click', () => this.showHome());
    this.els.strumMicButton.addEventListener('click', () => this.toggleStrumMic());
    this.els.strumNext.addEventListener('click', () => this.advanceLesson());
    this.els.strumFinish.addEventListener('click', () => this.showHome());

    // Sessions emit snapshots immediately, so they need the DOM ready first.
    this.session = new ChordMicSession({ onChange: (s) => this.onArpeggioChange(s) });
    this.strum = new StrumMicSession({ onChange: (s) => this.onStrumChange(s) });
  }

  /** Render the home screen and stop any running practice. */
  showHome(): void {
    this.session.stop();
    this.strum.stop();
    this.currentChord = null;
    this.lessonKind = null;
    this.activeMode = null;
    this.setScreen('home');
    this.renderHome();
  }

  /** Stop everything (used when leaving the module tab). */
  deactivate(): void {
    this.session.stop();
    this.strum.stop();
  }

  /* ---------------- mode startup ---------------- */

  private startMode(mode: PracticeMode): void {
    const chord = this.currentChord;
    if (!chord) return;
    this.activeMode = mode;
    this.els.practice.hidden = mode !== 'arpeggio';
    this.els.practiceStrum.hidden = mode !== 'strum';
    this.els.modeStrum.classList.toggle('pressed', mode === 'strum');
    this.els.modeArpeggio.classList.toggle('pressed', mode === 'arpeggio');

    if (mode === 'strum') {
      this.session.stop();
      this.strum.stop();
      this.renderStrumIdle(chord);
      void this.strum.start(chord.id);
    } else {
      this.strum.stop();
      this.renderArpeggioIdle(chord);
      void this.session.start(chord.id);
    }
  }

  private toggleArpeggioMic(): void {
    const { mic } = this.session.snapshot();
    const chord = this.currentChord;
    if (!chord) return;
    if (mic === 'running' || mic === 'starting') this.session.stop();
    else void this.session.start(chord.id);
    if (chord && this.activeMode === 'arpeggio') this.renderArpeggioIdle(chord);
  }

  private toggleStrumMic(): void {
    const { mic } = this.strum.snapshot();
    const chord = this.currentChord;
    if (!chord) return;
    if (mic === 'running' || mic === 'starting') this.strum.stop();
    else void this.strum.start(chord.id);
    if (this.activeMode === 'strum') this.renderStrumIdle(chord);
  }

  private forceCheck(): void {
    const ok = this.session.forceCheckNow();
    this.forceFailedMessage = ok ? '' : 'No te he oído — toca la cuerda y pulsa de nuevo.';
    this.onArpeggioChange(this.session.snapshot());
  }

  private repeatArpeggio(): void {
    const chord = this.currentChord;
    if (!chord) return;
    this.els.done.hidden = true;
    this.els.feedback.hidden = true;
    this.forceFailedMessage = '';
    if (this.session.snapshot().mic === 'running') {
      this.session.changeChord(chord.id);
    } else {
      void this.session.start(chord.id);
    }
    this.onArpeggioChange(this.session.snapshot());
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
    this.activeMode = null;
    this.setScreen('lesson');

    const level = CHORD_LEVELS.findIndex((l) => l.chordIds.includes(id));
    const drill = this.lessonKind?.type === 'drill' ? this.lessonKind.drill : undefined;
    this.els.lessonTitle.textContent =
      this.lessonKind?.type === 'drill' ? `Progresión ${drill!.title}` : chord.displayName;
    this.els.lessonContext.textContent =
      drill !== undefined
        ? drill.descriptionEs
        : `${chord.spanishName} · nivel ${level + 1}`;
    this.els.lessonProgress.textContent =
      this.lessonChordIds.length > 1
        ? `Paso ${this.lessonIndex + 1} de ${this.lessonChordIds.length}`
        : '';

    // Chord card.
    this.els.diagram.innerHTML = chordDiagramSvg(chord);
    this.els.chordName.textContent = `${chord.displayName} · ${chord.spanishName}`;
    this.els.chordNotes.textContent = chordNotesLine(chord);
    this.els.howto.replaceChildren(
      ...chordHowToLines(chord).map((line) => {
        const li = el('li', 'howto-line', line);
        return li;
      }),
    );
    this.els.tipsBody.replaceChildren(
      ...(chord.tipsEs ?? []).map((tip) => {
        const p = el('p', 'tip', `💡 ${tip}`);
        return p;
      }),
    );
    this.els.tips.open = false;

    // Panels closed until a mode is chosen.
    this.els.practice.hidden = true;
    this.els.practiceStrum.hidden = true;
    this.els.modeStrum.classList.remove('pressed');
    this.els.modeArpeggio.classList.remove('pressed');
    this.els.done.hidden = true;
    this.els.nextButton.hidden = true;
    this.els.strumNext.hidden = true;

    this.renderHome(); // keep progress badges fresh
  }

  /* ---------------- arpeggio rendering ---------------- */

  private onArpeggioChange(snapshot: ChordSessionSnapshot): void {
    if (this.activeMode !== 'arpeggio') return;
    this.renderMicBar(snapshot);
    const practice = snapshot.practice;
    if (!practice || !this.currentChord) return;
    this.renderArpeggio(snapshot, practice);
  }

  private renderMicBar(snapshot: ChordSessionSnapshot): void {
    const mic = snapshot.mic;
    const button = this.els.micButton;
    switch (mic) {
      case 'idle':
        this.els.micStatus.textContent = 'Micrófono apagado.';
        button.textContent = 'Iniciar micrófono';
        button.disabled = false;
        break;
      case 'starting':
        this.els.micStatus.textContent = 'Pidiendo acceso…';
        button.textContent = 'Iniciando…';
        button.disabled = true;
        break;
      case 'error':
        this.els.micStatus.textContent = snapshot.errorMessage ?? 'Error con el micrófono.';
        button.textContent = 'Iniciar micrófono';
        button.disabled = false;
        break;
      case 'running':
        this.els.micStatus.textContent = 'Te escucho — toca la cuerda indicada.';
        button.textContent = 'Detener';
        button.disabled = false;
        break;
    }
  }

  private renderArpeggioIdle(chord: ChordDef): void {
    const strings = chordStepStrings(chord);
    this.renderStepChips(strings.map((n) => ({ stringNumber: n, status: 'pending' as const })));
    this.els.prompt.textContent = 'Escucha la primera cuerda…';
    this.els.feedback.hidden = true;
    this.els.done.hidden = true;
    this.els.forceButton.hidden = true;
    this.els.skipButton.hidden = true;
    this.forceFailedMessage = '';
  }

  private renderArpeggio(snapshot: ChordSessionSnapshot, practice: PracticeSnapshot): void {
    const chord = this.currentChord!;
    this.renderStepChips(practice.steps);

    if (practice.phase === 'complete') {
      this.renderArpeggioDone(practice, chord);
      return;
    }

    this.els.done.hidden = true;
    this.els.nextButton.hidden = true;
    this.els.forceButton.hidden = snapshot.mic !== 'running' || !snapshot.canForceCheck;
    this.els.skipButton.hidden = snapshot.mic !== 'running';

    const target = practice.steps[practice.activeIndex];
    if (target) {
      this.els.prompt.textContent = `${expectedPhrase(chord, target.stringNumber)} Silencia entre cuerda y cuerda.`;
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

  private renderArpeggioDone(practice: PracticeSnapshot, chord: ChordDef): void {
    this.els.done.hidden = false;
    this.els.feedback.hidden = true;
    this.els.forceButton.hidden = true;
    this.els.skipButton.hidden = true;

    if (practice.mastered) {
      markChordLearned(this.storage, chord.id);
      this.renderHome();
      this.els.doneText.textContent =
        this.lessonChordIds.length > 1
          ? `🎉 ¡${chord.displayName}! (${this.lessonIndex + 1}/${this.lessonChordIds.length})`
          : `🎉 ¡${chord.displayName} dominado!`;
      const hasNext = this.lessonIndex + 1 < this.lessonChordIds.length;
      this.els.nextButton.hidden = !hasNext;
      if (hasNext) {
        const next = chordById(this.lessonChordIds[this.lessonIndex + 1]);
        this.els.nextButton.textContent = `Siguiente: ${next?.displayName ?? ''} →`;
      }
    } else {
      this.els.doneText.textContent = 'Terminaste, pero saltaste alguna cuerda. Repite para dominarlo.';
      this.els.nextButton.hidden = true;
    }
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

  /* ---------------- strum rendering ---------------- */

  private onStrumChange(snapshot: StrumSessionSnapshot): void {
    if (this.activeMode !== 'strum') return;
    this.renderStrumMic(snapshot);
    const chord = this.currentChord;
    if (!chord || snapshot.result === null) return;
    this.renderStrumResult(chord, snapshot);
  }

  private renderStrumMic(snapshot: StrumSessionSnapshot): void {
    const button = this.els.strumMicButton;
    switch (snapshot.mic) {
      case 'idle':
        this.els.strumMicStatus.textContent = 'Micrófono apagado.';
        button.textContent = 'Iniciar micrófono';
        button.disabled = false;
        break;
      case 'starting':
        this.els.strumMicStatus.textContent = 'Pidiendo acceso…';
        button.textContent = 'Iniciando…';
        button.disabled = true;
        break;
      case 'error':
        this.els.strumMicStatus.textContent = snapshot.errorMessage ?? 'Error con el micrófono.';
        button.textContent = 'Iniciar micrófono';
        button.disabled = false;
        break;
      case 'running':
        this.els.strumMicStatus.textContent = 'Rasguea y deja sonar el acorde…';
        button.textContent = 'Detener';
        button.disabled = false;
        break;
    }
  }

  private renderStrumIdle(chord: ChordDef): void {
    this.els.strumChordName.textContent = chord.displayName;
    this.els.strumVerdict.textContent = 'Rasguea el acorde y déjalo sonar…';
    this.els.strumVerdict.dataset.state = 'idle';
    this.els.strumIssues.replaceChildren();
    this.renderStrumLights([]);
    this.els.strumNext.hidden = true;
    this.strumLearnedMarked.delete(chord.id);
  }

  private renderStrumResult(chord: ChordDef, snapshot: StrumSessionSnapshot): void {
    const result = snapshot.result!;
    const verdictEl = this.els.strumVerdict;
    this.els.strumChordName.textContent = chord.displayName;

    if (result.verdict === 'quiet') {
      verdictEl.textContent = 'Rasguea el acorde y déjalo sonar…';
      verdictEl.dataset.state = 'idle';
      this.els.strumIssues.replaceChildren();
      this.renderStrumLights([]);
      this.els.strumNext.hidden = true;
      return;
    }

    if (result.verdict === 'correct') {
      verdictEl.textContent = `¡Bien! Suena a ${chord.displayName}`;
      verdictEl.dataset.state = 'success';
      this.els.strumIssues.replaceChildren();
      this.renderStrumLights(result);

      // Two consecutive clean strums → mark as learned.
      const hasNext = this.lessonIndex + 1 < this.lessonChordIds.length;
      this.els.strumNext.hidden = !hasNext;
      if (hasNext) {
        const next = chordById(this.lessonChordIds[this.lessonIndex + 1]);
        this.els.strumNext.textContent = `Siguiente: ${next?.displayName ?? ''} →`;
      }
      if (snapshot.correctStreak >= 2 && !this.strumLearnedMarked.has(chord.id)) {
        this.strumLearnedMarked.add(chord.id);
        markChordLearned(this.storage, chord.id);
        verdictEl.textContent += ' ✓ aprendido';
        this.renderHome();
      }
      return;
    }

    // issues
    verdictEl.textContent = 'Casi… revisa esto:';
    verdictEl.dataset.state = 'warning';
    this.els.strumNext.hidden = true;
    const lines = result.issues.map((issue) =>
      strumIssueLine(issue.kind, issue.noteLabel, issue.stringNumber),
    );
    this.els.strumIssues.replaceChildren(
      ...lines.map((line) => {
        const li = el('li', 'strum-issue', line);
        return li;
      }),
    );
    this.renderStrumLights(result);
  }

  /** Six light dots: one per string, colored by its detected state. */
  private renderStrumLights(result: StrumCheckResult | []): void {
    const chord = this.currentChord;
    const lights: HTMLElement[] = [];
    if (chord && result instanceof Object && 'scores' in result) {
      const scores = (result as StrumCheckResult).scores;
      for (const score of scores) {
        const band = chord.strings.find((s) => s.number === score.stringNumber)!;
        const light = el('div', `strum-light string-${score.stringNumber}`);
        const cls = band.fret === null
          ? (score.ringing ? 'bad' : 'muted')
          : (score.ringing ? 'on' : 'off');
        light.classList.add(cls);
        light.style.setProperty('--level', String(Math.max(0.15, Math.min(1, score.score))));
        light.title = `${score.stringNumber}ª ${score.expectedLabel ?? ''}`;
        lights.push(light);
      }
    }
    this.els.strumLights.replaceChildren(...lights);
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
          const button = el('button', 'chord-tile');
          button.type = 'button';
          button.dataset.learned = String(learnedFlag);
          const main = el('span', 'chord-tile-main', chord.displayName);
          const sub = el('span', 'chord-tile-sub', learnedFlag ? `${chord.spanishName} ✓` : chord.spanishName);
          button.append(main, sub);
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
            button.addEventListener('click', () =>
              this.startLesson(drill.chordIds, { type: 'drill', drill }),
            );
            drillRow.appendChild(button);
          }
          card.appendChild(drillRow);
        }
        return card;
      }),
    );
  }

  private setScreen(screen: 'home' | 'lesson'): void {
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
  return notes.join(' · ');
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
