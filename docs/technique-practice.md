# GuitAI — Práctica guiada de técnica (módulo 4, Fase 0+1)

Este documento describe el módulo de práctica técnica: qué mide, cómo lo mide,
qué decide por el usuario y — igual de importante — **qué no puede medir**. La
base pedagógica y las fuentes están en
[`docs/research/technique_research.md`](./research/technique_research.md).

---

## 1. Alcance de esta fase

Fase 0+1 del plan derivado de la investigación:

- **Cromáticos** 1-2-3-4 (por grupos de cuerdas y completo).
- **Nota repetida** con alternancia estricta i-m e i-a (regularidad).
- **Escalas** de una octava en primera posición: Do mayor, Sol mayor, La menor.
- Verificación **nota a nota** con micrófono: aciertos, cents, estabilidad
  temporal y pausas.
- **Política de tempo** explícita: +5 BPM tras 3 pasadas limpias seguidas,
  −5 BPM tras 2 pasadas con errores.
- Una **recomendación concreta** por pasada (nunca un simple número).
- **Récords** por ejercicio (mejor BPM limpio, mejor precisión, racha) y
  reanudación en el tempo de trabajo guardado.

Fuera de esta fase (fases 2–4 del plan): arpegios de Giuliani, generador de
sesión de calentamiento, cejilla progresiva, fragmentos de repertorio,
panel de progreso histórico.

---

## 2. Mapa de módulos

| Responsabilidad | Módulo |
| --- | --- |
| Eventos de nota **con tiempos** (inicio/fin, nivel) | `src/pitch/noteStream.ts` |
| Catálogo de ejercicios (notas esperadas, BPM, criterios, consejos) | `src/technique/exercises.ts` |
| Comparación secuencia tocada vs. esperada | `src/technique/sequenceMatcher.ts` |
| Resumen temporal (media, dispersión, correr/arrastrar, pausas) | `src/technique/timingAnalysis.ts` |
| Máquina de estados de la sesión (pases, rachas, política de tempo) | `src/technique/techniqueSession.ts` |
| Recomendaciones por reglas (métrica → acción) | `src/technique/recommendations.ts` |
| Récords persistentes | `src/technique/techniqueProgress.ts` |
| Micrófono (frame → eventos de nota) | `src/technique/micSession.ts` |
| UI: lista + runner | `src/ui/techniqueView.ts` |
| Diapasón SVG (posiciones y nota actual) | `src/ui/fretboardDiagram.ts` |

Nada de esto toca la lógica del afinador ni la de acordes: comparte
`audio/frameAnalysis`, `audio/metronome`, `audio/chime` y los patrones de
almacenamiento/UI ya existentes.

---

## 3. Cómo se verifica cada pasada

1. El ejercicio declara sus **notas esperadas** (MIDI + cuerda + traste) y su
   subdivisión; el metrónomo fija la rejilla (`paso = 60000/BPM`).
2. El micrófono analiza ventanas de **2048 muestras** (~46 ms) a ~60 Hz y el
   `NoteStreamDetector` emite **eventos de nota con timestamp**:
   - confirma la nota tras 2 frames consistentes (rechaza ruido de púa);
   - acepta un cambio de altura sostenido como **nota siguiente** (las cuerdas
     siguen sonando, no hace falta silencio);
   - cierra la nota tras 3 frames de silencio.
3. `matchSequence` asigna cada nota detectada al **hueco temporal** más cercano
   dentro de una ventana de ±0,7 × paso (el tiempo decide *qué* nota era) y
   compara la altura en **cents** para decidir si fue correcta.
4. Métricas resultantes: aciertos (%), cents (mediana de |desviación|),
   dispersión temporal (σ en ms), tendencia (corre/arrastra), pausas (huecos
   consecutivos), notas extra (reintentos) y, en los drills de regularidad,
   dispersión del nivel de ataque.
5. La pasada se considera **limpia** si cumple los criterios del ejercicio
   (aciertos ≥ umbral, cents ≤ umbral, σ temporal ≤ umbral y **cero pausas**).

### Límites honestos

- Es **monofónico**: un ejercicio con acordes o dos voces simultáneas no se
  evalúa (eso es territorio del módulo de acordes).
- La app **no sabe qué dedo ni qué cuerda** usaste: verifica la **nota**.
  Si tocas la nota correcta en otra cuerda, la métrica no lo distingue.
- La precisión temporal está acotada por la ventana de análisis (decenas de
  ms), así que se reporta **estabilidad relativa y pausas**, no milisegundos
  absolutos de estudio.
- **Postura y tensión** no se miden con audio: se cubrirán con rúbricas de
  autoevaluación (fase 2).

---

## 4. Política de tempo y recomendaciones

- Tras **3 pasadas limpias seguidas** en el mismo tempo → el siguiente pase sube
  **+5 BPM** (sin pasar del objetivo del ejercicio).
- Tras **2 pasadas con errores** por encima del tempo inicial → baja **−5 BPM**.
- Al alcanzar el BPM objetivo: mensaje de objetivo cumplido y sugerencia de
  cambiar de ejercicio.
- Las recomendaciones son **reglas explicables** (`recommendations.ts`), en este
  orden de prioridad:
  1. sesión larga con fallos repetidos → descansar;
  2. pausas → bajar tempo y **contar en voz alta**;
  3. notas correctas pero desafinadas (≤ 60 ¢) → revisar presión y afinación;
  4. aciertos insuficientes → aislar fragmento / bajar tempo;
  5. corre o arrastra / σ alta → trabajar con el clic;
  6. ataques desiguales (drills de regularidad) → igualar volumen y alternar;
  7. pasada limpia → subir tempo o consolidar.

---

## 5. Cómo añadir un ejercicio

Añade una entrada a `TECHNIQUE_EXERCISES` (`src/technique/exercises.ts`). El
validador de carga comprueba que cada nota concuerde con cuerda+traste
(afinación estándar), que el BPM esté en rango, que el objetivo no sea menor
que el inicio y que los criterios y consejos existan.

```ts
{
  id: 'scale-d-major-1oct',
  title: 'Escala de Re mayor · 1 octava',
  kind: 'scale',
  level: 'intermedio',
  descriptionEs: 'Primera escala con dos accidentes (F# y C#).',
  notes: scaleUpAndDown([[4, 0], [4, 2], [4, 3], [3, 0], [3, 2], [2, 0], [2, 1], [2, 3]]),
  startBpm: 50,
  targetBpm: 75,
  subdivision: 'quarter',
  verification: 'pitch-sequence',
  criteria: SCALE_CRITERIA,
  tipsEs: ['…'],
}
```

La lista, el runner, el metrónomo, el diagrama, las métricas y los récords lo
recogen automáticamente.

---

## 6. Verificación (tests)

| Área | Fichero |
| --- | --- |
| Eventos de nota con tiempos | `src/pitch/noteStream.test.ts` |
| Catálogo y matemática de tempo | `src/technique/exercises.test.ts` |
| Resumen temporal y pausas | `src/technique/timingAnalysis.test.ts` |
| Comparador de secuencia (perfecto, errores, pausas, reintentos, tendencias) | `src/technique/sequenceMatcher.test.ts` |
| Reglas de recomendación | `src/technique/recommendations.test.ts` |
| Récords y datos corruptos | `src/technique/techniqueProgress.test.ts` |
| Sesión, rachas y política de tempo | `src/technique/techniqueSession.test.ts` |
| **Audio sintético → métricas** | `src/technique/syntheticPipeline.test.ts` |
| UI (lista, runner, toggles, evaluación, path sin micro) | `src/ui/techniqueView.test.ts` |

El test de audio sintético "toca" el ejercicio en el código: sintetiza las notas
a tempo, pasa las ventanas por el analizador real y el detector real, y
comprueba que las métricas resultantes son las correctas (pasada perfecta,
nota equivocada, pausa y ejecución desafinada).

---

## 7. Próximos pasos (fases 2–4)

1. **Arpegios de Giuliani** por patrones (3 → 4 voces → bajos alternos) con
   regularidad de ataque y sostén de notas.
2. **Generador de sesión** de 15/20/30 min (calentamiento → foco → repertorio →
   cierre) + pausas activas + rúbrica de postura/tensión.
3. **Cejilla progresiva** (2 cuerdas → parcial → completa) reutilizando el
   análisis de sostén por cuerda del módulo de acordes.
4. **Progreso histórico** (BPM limpio, precisión y estabilidad por semana) y
   fragmentos de repertorio para cerrar cada sesión con música.
