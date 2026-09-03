/**
 * GuitAI entry point.
 *
 * Module 1: real-time tuner. Module 2: learn chords (beginners, progressive).
 * Each module is an independent engine + view pair; the only shared things are
 * the audio analysis helpers and the music-theory modules. Navigation is a
 * tiny two-tab switcher that makes sure only one module owns the microphone.
 */

import './style.css';
import { TunerEngine } from './tuner/engine';
import { TunerView } from './ui/view';
import { ChordUi } from './ui/chordView';
import { TUNINGS } from './theory/tunings';

const root = document.getElementById('app');
if (!root) {
  throw new Error('GuitAI: #app root element missing from index.html.');
}

type ViewName = 'tuner' | 'chords';

// ---- Module 1: tuner -------------------------------------------------------
let tunerView!: TunerView;
const engine = new TunerEngine({
  onReading: (reading) => tunerView.render(reading),
  onStatusChange: (status) => tunerView.setStatus(status),
});

const tuningOptions = TUNINGS.map((tuning) => ({ id: tuning.id, name: tuning.name }));

tunerView = new TunerView(root, {
  onStartStop: () => {
    const phase = engine.statusSnapshot.phase;
    if (phase === 'running') {
      engine.stop();
    } else if (phase === 'starting') {
      return;
    } else {
      void engine.start();
    }
  },
  onTuningChange: (id) => {
    engine.setTuning(id);
    const tuning = TUNINGS.find((t) => t.id === id);
    if (tuning) {
      tunerView.setStrings(tuning.strings);
      tunerView.resetDisplay();
    }
  },
  onStringSelect: (number) => engine.setPreferredString(number),
});
tunerView.setTuningOptions(tuningOptions, engine.tuningId);
tunerView.setStrings(TUNINGS[0].strings);

// ---- Module 2: chords ------------------------------------------------------
const chordUi = new ChordUi(root);
chordUi.showHome();

// ---- Navigation ------------------------------------------------------------
const tunerPanel = root.querySelector('#view-tuner') as HTMLElement;
const chordsPanel = root.querySelector('#view-chords') as HTMLElement;
const navButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.nav-btn'));

function showView(name: ViewName): void {
  tunerPanel.hidden = name !== 'tuner';
  chordsPanel.hidden = name !== 'chords';
  for (const button of navButtons) {
    button.classList.toggle('active', button.dataset.view === name);
  }

  // Only one module may own the microphone at a time.
  if (name === 'chords') {
    if (engine.statusSnapshot.phase === 'running') engine.stop();
  } else {
    chordUi.deactivate();
  }
}

for (const button of navButtons) {
  button.addEventListener('click', () => {
    const view = button.dataset.view;
    if (view === 'tuner' || view === 'chords') showView(view);
  });
}

// Initial module: the tuner (module 1) unless the URL says #chords.
const initial: ViewName = window.location.hash === '#chords' ? 'chords' : 'tuner';
showView(initial);
