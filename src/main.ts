/**
 * GuitAI entry point — module 1: real-time guitar tuner.
 *
 * The composition is intentionally tiny: the engine owns the analysis
 * pipeline and the view owns the DOM. They only know each other through
 * narrow callbacks, so swapping the UI (or running the engine headless) is
 * straightforward.
 */

import './style.css';
import { TunerEngine } from './tuner/engine';
import { TunerView } from './ui/view';
import { TUNINGS } from './theory/tunings';

const root = document.getElementById('app');
if (!root) {
  throw new Error('GuitAI: #app root element missing from index.html.');
}

const tuningOptions = TUNINGS.map((tuning) => ({ id: tuning.id, name: tuning.name }));

const engine = new TunerEngine({
  onReading: (reading) => view.render(reading),
  onStatusChange: (status) => view.setStatus(status),
});

const view = new TunerView(root, {
  onStartStop: () => {
    const phase = engine.statusSnapshot.phase;
    if (phase === 'running') {
      engine.stop();
    } else if (phase === 'starting') {
      // Button is disabled while starting; ignore double clicks.
      return;
    } else {
      void engine.start();
    }
  },
  onTuningChange: (id) => {
    engine.setTuning(id);
    const tuning = TUNINGS.find((t) => t.id === id);
    if (tuning) {
      view.setStrings(tuning.strings);
      view.resetDisplay();
    }
  },
  onStringSelect: (number) => engine.setPreferredString(number),
});

view.setTuningOptions(tuningOptions, engine.tuningId);
view.setStrings(TUNINGS[0].strings);
