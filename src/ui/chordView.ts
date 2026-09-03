/**
 * ChordUi — the "Aprende acordes" module UI (highly visual, minimal text).
 *
 * Visual model:
 *  - home: a "learning path" of level blocks; every chord is a card whose own
 *    little diagram speaks for it; drills are drawn as chord chains.
 *  - lesson: hero diagram (big), a few fact chips, "how-to" + tips tucked
 *    behind compact toggles, and two illustrated validation-mode cards.
 *  - practice: the *diagram itself* lights the current string (sounding/ok/
 *    wrong) while validation runs; words are reduced to tiny labels.
 *
 * Logic untouched: sessions (micSession/strumSession), gates, spectral and
 * pure helpers all live in src/chords and are only rendered here.
 */

import type { ChordDef, StringNumber } from '../chords/catalog';
import { chordById, expectedMidi, expectedNoteName } from '../chords/catalog';
import { CHORD_LEVELS, CHANGE_DRILLS, type ChangeDrill } from '../chords/curriculum';
import {
  browserProgressStorage,
  loadLearnedChordIds,
  markChordLearned,
  type ProgressStorage,
} from '../chords/progress';
import { chordHowToLines, describeCheck, strumIssueLine } from '../chords/copy';
import { chordDiagramSvg, type StringState } from './chordDiagram';
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
  diagram: HTMLElement;
  chordName: HTMLElement;
  chordNotes: HTMLElement;
  chordFacts: HTMLElement;
  howto: HTMLOListElement;
  tips: HTMLDetailsElement;
  tipsBody: HTMLElement;
  modeStrum: HTMLButtonElement;
  modeArpeggio: HTMLButtonElement;
  // arpeggio practice
  practice: HTMLElement;
  practiceClose: HTMLButtonElement;
  practiceDiagram: HTMLElement;
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
  strumClose: HTMLButtonElement;
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

const kindLabel = (chord: ChordDef) => (chord.kind === 'major' ? 'mayor' : 'menor');

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
      diagram: mustGet(root, '#chord-diagram'),
      chordName: mustGet(root, '#chord-name'),
      chordNotes: mustGet(root, '#chord-notes'),
      chordFacts: mustGet(root, '#chord-facts'),
      howto: mustGet<HTMLOListElement>(root, '#chord-howto'),
      tips: mustGet<HTMLDetailsElement>(root, '#chord-tips'),
      tipsBody: mustGet(root, '#chord-tips-body'),
      modeStrum: mustGet<HTMLButtonElement>(root, '#mode-strum'),
      modeArpeggio: mustGet<HTMLButtonElement>(root, '#mode-arpeggio'),
      practice: mustGet(root, '#practice'),
      practiceClose: mustGet<HTMLButtonElement>(root, '#practice-close'),
      practiceDiagram: mustGet(root, '#practice-diagram'),
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
      strumClose: mustGet<HTMLButtonElement>(root, '#strum-close'),
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
    this.els.practiceClose.addEventListener('click', () => this.closePractice());
    this.els.strumClose.addEventListener('click', () => this.closePractice());
    this.els.micButton.addEventListener('click', () => this.toggleArpeggioMic());
    this.els.forceButton.addEventListener('click', () => this.forceCheck());
    this.els.skipButton.addEventListener('click', () => this.session.skipCurrent());
    this.els.repeatButton.addEventListener('click', () => this.repeatArpeggio());
    this.els.nextButton.addEventListener('click', () => this.advanceLesson());
    this.els.finishButton.addEventListener('click', () => this.showHome());
    this.els.strumMicButton.addEventListener('click', () => this.toggleStrumMic());
    this.els.strumNext.addEventListener('click', () => this.advanceLesson());
    this.els.strumFinish.addEventListener('click', () => this.showHome());

    this.session = new ChordMicSession({ onChange: (s) => this.onArpeggioChange(s) });
    this.strum = new StrumMicSession({ onChange: (s) => this.onStrumChange(s) });
  }

  showHome(): void {
    this.closePractice();
    this.currentChord = null;
    this.lessonKind = null;
    this.activeMode = null;
    this.setScreen('home');
    this.renderHome();
  }

  deactivate(): void {
    this.session.stop();
    this.strum.stop();
  }

  /** Close any open practice panel and go back to the chord card. */
  private closePractice(): void {
    this.session.stop();
    this.strum.stop();
    this.activeMode = null;
    this.els.practice.hidden = true;
    this.els.practiceStrum.hidden = true;
    this.els.modeStrum.classList.remove('pressed');
    this.els.modeArpeggio.classList.remove('pressed');
  }

  /* ---------------- modes ---------------- */

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
    const chord = this.currentChord;
    if (!chord) return;
    const { mic } = this.session.snapshot();
    if (mic === 'running' || mic === 'starting') this.session.stop();
    else void this.session.start(chord.id);
    if (this.activeMode === 'arpeggio') this.renderArpeggioIdle(chord);
  }

  private toggleStrumMic(): void {
    const chord = this.currentChord;
    if (!chord) return;
    const { mic } = this.strum.snapshot();
    if (mic === 'running' || mic === 'starting') this.strum.stop();
    else void this.strum.start(chord.id);
    if (this.activeMode === 'strum') this.renderStrumIdle(chord);
  }

  private forceCheck(): void {
    const ok = this.session.forceCheckNow();
    this.forceFailedMessage = ok ? '' : 'No te oí — toca la cuerda y pulsa de nuevo.';
    this.onArpeggioChange(this.session.snapshot());
  }

  private repeatArpeggio(): void {
    const chord = this.currentChord;
    if (!chord) return;
    this.els.done.hidden = true;
    this.els.feedback.hidden = true;
    this.forceFailedMessage = '';
    if (this.session.snapshot().mic === 'running') this.session.changeChord(chord.id);
    else void this.session.start(chord.id);
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
    this.els.practice.hidden = true;
    this.els.practiceStrum.hidden = true;

    const level = CHORD_LEVELS.findIndex((l) => l.chordIds.includes(id));
    const drill = this.lessonKind?.type === 'drill' ? this.lessonKind.drill : undefined;
    this.els.lessonTitle.textContent = drill
      ? drill.title
      : `${chord.displayName} · ${chord.spanishName}`;
    this.els.lessonContext.textContent = drill
      ? 'Suena cada acorde limpio y cambia rápido.'
      : `Nivel ${level + 1}`;
    this.els.lessonProgress.textContent =
      this.lessonChordIds.length > 1
        ? `${this.lessonIndex + 1}/${this.lessonChordIds.length}`
        : '';

    this.els.diagram.innerHTML = chordDiagramSvg(chord, { scale: 1 });
    this.els.chordName.textContent = chord.displayName;
    this.els.chordNotes.textContent = chordNotesLine(chord);
    this.renderFacts(chord);

    this.els.howto.replaceChildren(
      ...chordHowToLines(chord).map((line) => el('li', 'howto-line', line)),
    );
    this.els.tipsBody.replaceChildren(
      ...(chord.tipsEs ?? []).map((tip) => el('p', 'tip', `💡 ${tip}`)),
    );
    this.els.tips.open = false;

    this.els.done.hidden = true;
    this.els.nextButton.hidden = true;
    this.els.strumNext.hidden = true;
    this.renderHome();
  }

  private renderFacts(chord: ChordDef): void {
    const sounding = chord.strings.filter((s) => s.fret !== null).length;
    const muted = chord.strings.length - sounding;
    const maxFret = Math.max(0, ...chord.strings.map((s) => s.fret ?? 0));
    const items = [
      kindLabel(chord),
      `${sounding} suenan`,
      muted > 0 ? `${muted} muda${muted > 1 ? 's' : ''}` : 'todas suenan',
      maxFret > 0 ? `traste ${maxFret}` : '',
    ]
      .filter(Boolean)
      .map((text) => el('span', 'fact-chip', text));
    this.els.chordFacts.replaceChildren(...items);
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
    const button = this.els.micButton;
    switch (snapshot.mic) {
      case 'idle':
        this.els.micStatus.textContent = '';
        button.textContent = 'Iniciar';
        button.disabled = false;
        break;
      case 'starting':
        this.els.micStatus.textContent = '';
        button.textContent = '…';
        button.disabled = true;
        break;
      case 'error':
        this.els.micStatus.textContent = snapshot.errorMessage ?? '';
        button.textContent = 'Iniciar';
        button.disabled = false;
        break;
      case 'running':
        this.els.micStatus.textContent = 'Te escucho';
        button.textContent = 'Parar';
        button.disabled = false;
        break;
    }
  }

  private renderArpeggioIdle(chord: ChordDef): void {
    this.renderPracticeDiagram(chord, {});
    this.els.prompt.textContent = 'Inicia y toca la cuerda marcada.';
    this.els.feedback.hidden = true;
    this.els.done.hidden = true;
    this.els.forceButton.hidden = true;
    this.els.skipButton.hidden = true;
    this.forceFailedMessage = '';
    this.els.steps.replaceChildren();
  }

  private renderArpeggio(snapshot: ChordSessionSnapshot, practice: PracticeSnapshot): void {
    const chord = this.currentChord!;
    this.renderStepChips(practice.steps);
    this.renderPracticeDiagram(chord, diagramStatesFrom(practice));

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
      const note = expectedNoteName(chord, target.stringNumber);
      this.els.prompt.textContent = `${target.stringNumber}ª → ${note ?? '—'}`;
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
      this.els.doneText.textContent = `🎉 ${chord.displayName}`;
      const hasNext = this.lessonIndex + 1 < this.lessonChordIds.length;
      this.els.nextButton.hidden = !hasNext;
      if (hasNext) {
        const next = chordById(this.lessonChordIds[this.lessonIndex + 1]);
        this.els.nextButton.textContent = `Siguiente: ${next?.displayName ?? ''}`;
      }
    } else {
      this.els.doneText.textContent = 'Faltaron cuerdas. Repite para dominarlo.';
      this.els.nextButton.hidden = true;
    }
  }

  private renderStepChips(steps: readonly StepState[]): void {
    const chord = this.currentChord;
    this.els.steps.replaceChildren(
      ...steps.map((step) => {
        const note = chord ? expectedNoteName(chord, step.stringNumber) : null;
        const chip = el('div', `step-chip ${step.status}`);
        chip.textContent = `${step.stringNumber} · ${note ?? ''}`;
        chip.title = step.status;
        return chip;
      }),
    );
  }

  /** Light the diagram strings according to the practice state. */
  private renderPracticeDiagram(
    chord: ChordDef,
    states: Partial<Record<StringNumber, StringState>>,
  ): void {
    this.els.practiceDiagram.innerHTML = chordDiagramSvg(chord, {
      highlight: states,
      scale: 0.85,
    });
  }

  /* ---------------- strum rendering ---------------- */

  private onStrumChange(snapshot: StrumSessionSnapshot): void {
    if (this.activeMode !== 'strum') return;
    this.renderStrumMic(snapshot);
    const chord = this.currentChord;
    if (!chord) return;
    this.renderStrumResult(chord, snapshot);
  }

  private renderStrumMic(snapshot: StrumSessionSnapshot): void {
    const button = this.els.strumMicButton;
    switch (snapshot.mic) {
      case 'idle':
        this.els.strumMicStatus.textContent = '';
        button.textContent = 'Iniciar';
        button.disabled = false;
        break;
      case 'starting':
        this.els.strumMicStatus.textContent = '';
        button.textContent = '…';
        button.disabled = true;
        break;
      case 'error':
        this.els.strumMicStatus.textContent = snapshot.errorMessage ?? '';
        button.textContent = 'Iniciar';
        button.disabled = false;
        break;
      case 'running':
        this.els.strumMicStatus.textContent = 'Escuchando';
        button.textContent = 'Parar';
        button.disabled = false;
        break;
    }
  }

  private renderStrumIdle(chord: ChordDef): void {
    this.els.strumChordName.textContent = chord.displayName;
    this.els.strumVerdict.textContent = 'Rasguea y mantenlo…';
    this.els.strumVerdict.dataset.state = 'idle';
    this.els.strumIssues.replaceChildren();
    this.renderStrumLights(null);
    this.els.strumNext.hidden = true;
    this.strumLearnedMarked.delete(chord.id);
  }

  private renderStrumResult(chord: ChordDef, snapshot: StrumSessionSnapshot): void {
    const verdictEl = this.els.strumVerdict;
    this.els.strumChordName.textContent = chord.displayName;

    if (snapshot.mic !== 'running') {
      this.renderStrumIdle(chord);
      return;
    }

    this.renderStrumLights(snapshot.analysis);

    if (snapshot.stage === 'listening') {
      const analyzing = snapshot.analysis !== null && snapshot.analysis.verdict !== 'quiet';
      verdictEl.textContent = analyzing ? '…' : 'Rasguea y mantenlo…';
      verdictEl.dataset.state = 'idle';
      this.els.strumIssues.replaceChildren();
      this.els.strumNext.hidden = true;
      return;
    }

    if (snapshot.verdict === 'correct') {
      verdictEl.textContent = `✓ ${chord.displayName}`;
      verdictEl.dataset.state = 'success';
      this.els.strumIssues.replaceChildren();
      const hasNext = this.lessonIndex + 1 < this.lessonChordIds.length;
      this.els.strumNext.hidden = !hasNext;
      if (hasNext) {
        const next = chordById(this.lessonChordIds[this.lessonIndex + 1]);
        this.els.strumNext.textContent = `Siguiente: ${next?.displayName ?? ''}`;
      }
      if (snapshot.stableMs >= 1200 && !this.strumLearnedMarked.has(chord.id)) {
        this.strumLearnedMarked.add(chord.id);
        markChordLearned(this.storage, chord.id);
        this.renderHome();
      }
      return;
    }

    verdictEl.textContent = `Casi ${chord.displayName}`;
    verdictEl.dataset.state = 'warning';
    this.els.strumNext.hidden = true;
    const lines = snapshot.issues.map((issue) =>
      strumIssueLine(issue.kind, issue.noteLabel, issue.stringNumber),
    );
    this.els.strumIssues.replaceChildren(...lines.map((line) => el('li', 'strum-issue', line)));
  }

  private renderStrumLights(analysis: StrumCheckResult | null): void {
    const chord = this.currentChord;
    if (!chord || !analysis) {
      this.els.strumLights.replaceChildren();
      return;
    }
    const lights: HTMLElement[] = [];
    for (const score of analysis.scores) {
      const band = chord.strings.find((s) => s.number === score.stringNumber)!;
      const light = el('div', `strum-light string-${score.stringNumber}`);
      const cls =
        band.fret === null
          ? score.ringing
            ? 'bad'
            : 'muted'
          : score.ringing
            ? 'on'
            : 'off';
      light.classList.add(cls);
      light.style.setProperty('--level', String(Math.max(0.15, Math.min(1, score.score))));
      light.title = `${score.stringNumber}ª ${score.expectedLabel ?? ''}`;
      lights.push(light);
    }
    this.els.strumLights.replaceChildren(...lights);
  }

  /* ---------------- home ---------------- */

  private renderHome(): void {
    const allIds = curriculumChordIdsAll();
    const learned = loadLearnedChordIds(this.storage);
    const done = allIds.filter((id) => learned.has(id)).length;
    this.els.progressHome.innerHTML =
      progressRing(done / allIds.length) +
      `<span class="progress-text">${done}/${allIds.length}</span>`;
    this.els.progressHome.dataset.done = String(done === allIds.length);

    const blocks: HTMLElement[] = [];
    CHORD_LEVELS.forEach((level, levelIndex) => {
      const block = el('section', 'level-block');
      const head = el('div', 'level-head');
      head.appendChild(el('span', 'level-badge', String(levelIndex + 1)));
      const titles = el('div', 'level-head-text');
      titles.appendChild(el('h2', 'level-title', level.title.replace(/^Nivel \d · /, '')));
      head.appendChild(titles);
      head.appendChild(el('span', 'level-count', `${level.chordIds.length} acordes`));
      block.appendChild(head);

      const grid = el('div', 'chord-grid');
      for (const chordId of level.chordIds) {
        const chord = chordById(chordId);
        if (!chord) continue;
        const learnedFlag = learned.has(chord.id);
        const card = el('button', 'chord-card-mini');
        card.type = 'button';
        card.dataset.learned = String(learnedFlag);
        card.dataset.level = String(levelIndex + 1);
        const dia = el('div', 'chord-mini');
        dia.innerHTML = chordDiagramSvg(chord, { scale: 0.42, showNut: true });
        const name = el('span', 'chord-card-name', chord.displayName);
        const sub = el('span', 'chord-card-sub', kindLabel(chord));
        card.append(dia, name, sub);
        if (learnedFlag) card.appendChild(el('span', 'chord-card-check', '✓'));
        card.addEventListener('click', () =>
          this.startLesson([chord.id], { type: 'chord', levelIndex }),
        );
        grid.appendChild(card);
      }
      block.appendChild(grid);

      const drills = level.drillIds
        .map((id) => CHANGE_DRILLS.find((d) => d.id === id))
        .filter((d): d is ChangeDrill => d !== undefined);
      if (drills.length > 0) {
        const drillRow = el('div', 'drill-row');
        for (const drill of drills) {
          const chip = el('button', 'drill-chip');
          chip.type = 'button';
          chip.title = drill.descriptionEs;
          chip.innerHTML = drill.chordIds
            .map(
              (cid) =>
                `<span class="drill-chord">${chordById(cid)?.displayName ?? cid}</span>`,
            )
            .join('<span class="drill-arrow">→</span>');
          chip.addEventListener('click', () =>
            this.startLesson(drill.chordIds, { type: 'drill', drill }),
          );
          drillRow.appendChild(chip);
        }
        block.appendChild(drillRow);
      }
      blocks.push(block);
    });
    this.els.levels.replaceChildren(...blocks);
  }

  private setScreen(screen: 'home' | 'lesson'): void {
    this.els.home.hidden = screen !== 'home';
    this.els.lesson.hidden = screen !== 'lesson';
  }
}

/* ---------------- pure helpers ---------------- */

function chordNotesLine(chord: ChordDef): string {
  const notes: string[] = [];
  for (const string of chord.strings) {
    if (expectedMidi(chord, string.number) === null) continue;
    notes.push(expectedNoteName(chord, string.number) ?? '—');
  }
  return notes.join(' · ');
}

function diagramStatesFrom(practice: PracticeSnapshot): Partial<Record<StringNumber, StringState>> {
  const chord = chordById(practice.chordId)!;
  const states: Partial<Record<StringNumber, StringState>> = {};
  practice.steps.forEach((step, i) => {
    if (step.status === 'ok') states[step.stringNumber] = 'ok';
    else if (step.status === 'wrong' || step.status === 'almost')
      states[step.stringNumber] = 'wrong';
    else if (i === practice.activeIndex) states[step.stringNumber] = 'sounding';
  });
  void chord;
  return states;
}

/** SVG circular progress ring with the fraction filled. */
function progressRing(fraction: number): string {
  const size = 54;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, fraction)) * c;
  const color = fraction >= 1 ? '#34d399' : '#22d3ee';
  return `<svg class="progress-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Progreso">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-track"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fill" stroke="${color}"
      stroke-dasharray="${filled} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

function curriculumChordIdsAll(): readonly string[] {
  const ids: string[] = [];
  for (const level of CHORD_LEVELS) {
    for (const id of level.chordIds) ids.push(id);
  }
  return ids;
}
