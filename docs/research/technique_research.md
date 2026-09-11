# Técnica de guitarra clásica para principiantes — Investigación de referencia

> **Documento de investigación interna de GuitAI**
> Ruta: `docs/research/technique_research.md`
> Ámbito: guitarra clásica (cuerdas de nailon, técnica clásica), de principiante absoluto a intermedio temprano.
> Estado: cuerpo de conocimiento vivo — no es una especificación de producto ni un entregable cerrado.

---

## 1. Introducción y alcance

### 1.1 Doble propósito

Este documento existe por dos razones explícitas:

1. **Aprendizaje del agente.** Reunir y organizar el conocimiento pedagógico y técnico de la guitarra clásica para que el agente (asistente de IA de GuitAI) pueda **razonar con criterio** sobre el dominio: entender qué es correcto, qué es un error, en qué orden se aprende y cómo se mide el progreso. Sin este contexto, cualquier sugerencia automática tendería a ser genérica o superficial.
2. **Inspiración y referencia para GuitAI.** Servir como material base para un futuro **módulo de práctica técnica guiada**, sin comprometer todavía diseño, nomenclatura ni prioridades. Aquí se documenta *qué* se practica y *cómo se verifica*; el *cómo* implementarlo vendrá después.

### 1.2 Preguntas que guían la investigación

- ¿Cuál es la postura y la ergonomía correctas, y qué señales indican que algo va mal?
- ¿Cómo se ataca la cuerda con la mano derecha (apoyado/tirando, alternancia, preparación)?
- ¿Cómo se coloca y dosifica la mano izquierda (curvatura, presión mínima, cejilla progresiva)?
- ¿Qué se calienta, con qué ejercicios y cuánto tiempo?
- ¿Cómo se sincronizan ambas manos y se controla el tempo con metrónomo?
- ¿Qué son los arpegios de Giuliani y cómo se progresan?
- ¿Cuáles son los errores típicos de principiante y cómo detectarlos?
- ¿Cuál es un orden pedagógico razonable, semana a semana?
- ¿Qué señales observables indican mejora real?

### 1.3 Criterio de priorización: verificabilidad con audio

Como GuitAI ya cuenta con **afinador** (frecuencia/cents, YIN), **reconocimiento por cuerda y acordes** (rasgueo/arpegio) y **metrónomo**, se ha priorizado aquello que **puede verificarse con audio**:

| Dimensión | Verificable con audio | Cómo |
| --- | --- | --- |
| Entonación / afinación | Sí | Afinador: desviación en cents respecto a la nota objetivo |
| Limpieza de una nota o acorde | Sí | Detección de la fundamental + ausencia de cuerdas no deseadas |
| Tempo y estabilidad | Sí | Metrónomo + desviación temporal de los ataques detectados |
| Igualdad de volumen/ataque | Parcialmente | RMS/envolvente por nota y por cuerda |
| Alternancia correcta de dedos | No directamente | Solo indirecto (regularidad temporal, no identificación de dedo) |
| Relajación / tensión | No | Requiere observación (vídeo) o autoevaluación guiada |
| Postura | No | Checklist de autoevaluación y espejo/cámara |

Esta tabla es también una advertencia de diseño: **no todo lo importante es medible con un micrófono**. Un módulo futuro debe combinar métricas automáticas con rúbricas de autoevaluación, sin fingir una precisión que el audio no puede dar.

### 1.4 Método y limitaciones (transparencia)

- Investigación **documental de escritorio**: se han consultado métodos clásicos de referencia y fuentes pedagógicas online reputadas (enlazadas en §14).
- **No es una revisión sistemática** con evidencia experimental. Mucho de lo aquí recogido es **consenso pedagógico** transmitido por métodos y profesores, no resultado de estudios controlados. Donde una afirmación es práctica y extendida pero no "demostrada", se indica con lenguaje matizado.
- Algunas fuentes no fueron accesibles íntegramente en el momento de la investigación (por ejemplo, varias lecciones de Justinguitar devolvieron HTTP 403, y algunas páginas comerciales devuelven contenido dinámico truncado). Se citan igualmente por su relevancia pedagógica, sin atribuirles afirmaciones que no se hayan podido leer.
- Las cifras de tempo (BPM) y duraciones son **orientativas** y deben adaptarse a cada persona; se ofrecen como puntos de partida, no como reglas rígidas.

---

## 2. Marco general: el principiante de guitarra clásica

### 2.1 Particularidades del instrumento

- **Cuerdas de nailon** (las tres agudas suelen ser nylon simple; las tres graves, entorchadas). Menor tensión y sonoridad más dulce que una guitarra de acero; el ataque y el timbre dependen mucho de la uña y del ángulo del dedo.
- **Mástil ancho y plano**: facilita la técnica de pulgar detrás del mástil y el uso independiente de los dedos, pero exige más extensión y precisión en la mano izquierda.
- **Repertorio y notación**: la guitarra clásica se lee en clave de sol (a veces con voces simultáneas); el principiante se enfrenta a leer **dos o tres líneas a la vez** (bajo, acompañamiento y melodía), lo que añade dificultad cognitiva a la técnica.

### 2.2 Qué significa "tocar bien" en el nivel inicial

Cuatro criterios que se repiten en la pedagogía y que son buenos objetivos de módulo:

1. **Sonido limpio** (sin zumbidos ni cuerdas pisadas a medias).
2. **Regularidad rítmica** (tempo estable, sin parar entre notas ni al cambiar de posición).
3. **Economía de movimiento** (sin tensión innecesaria; los dedos se mueven juntos y lo mínimo posible).
4. **Control del sonido** (saber producir al menos dos calidades: ataque apoyado, proyectado; y ataque libre, más suave y brillante) — este es el objetivo técnico más característico de la guitarra clásica.

---

## 3. Tema 1 — Postura y ergonomía

### 3.1 Posición sentada clásica

La posición clásica se describe de forma consistente en las fuentes consultadas ([Guitar Wiz — Posture Guide](https://guitarwiz.app/articles/guitar-posture-guide/); [Dummies — How to Properly Hold a Classical Guitar](https://www.dummies.com/article/how-to-properly-hold-a-classical-guitar-198026)):

- **Sentado en una silla con respaldo recto y sin blandura excesiva**; glúteos hacia atrás, espalda erguida pero no rígida, pies apoyados (pie derecho plano en el suelo).
- **La guitarra se apoya en el muslo izquierdo** (para diestros), con la **cintura del cuerpo** en el pliegue de la pierna.
- **El pie izquierdo se eleva con un banquito** (o con soporte alternativo: cojín, *guitar support*, reposapiés tipo Ergoplay), de modo que el **mástil quede inclinado hacia arriba en torno a 40–45°** respecto a la horizontal.
- **El cuerpo de la guitarra se inclina ligeramente hacia el intérprete** (para ver el diapasón sin encorvarse).
- **Punto de contacto**: el borde inferior del aro descansa en el muslo; la parte trasera se apoya suavemente en el pecho; **el antebrazo derecho se apoya en el borde superior del aro**, sin presionar.
- **Hombros nivelados y bajos**, cuello alineado, mirada hacia el diapasón moviendo los ojos antes que la cabeza.

**Alternativas al banquito** (cada vez más recomendadas por ergonomía y por salud lumbar): soportes que elevan la guitarra sin elevar el pie izquierdo (cojines, soportes de ventosa, reposapiés de pie). La ventaja es que **ambos pies quedan planos** y la pelvis no se torsionan; el resultado acústico y técnico es equivalente. La elección es personal y debe probarse.

### 3.2 Por qué importa (no es estética)

- La postura determina el **acceso de la mano izquierda** a todo el mástil y el **ángulo natural de la muñeca derecha**.
- Una postura incorrecta produce **dolor lumbar, tensión de hombros, dolor de muñeca** y, con el tiempo, lesiones por esfuerzo repetitivo (el artículo de postura citado incluye explícitamente advertencias sobre síndrome del túnel carpiano y signos de alarma: dolor agudo, hormigueo, sensación de quemazón).
- Regla práctica: **si duele, algo está mal**; la técnica correcta es sostenible durante sesiones largas con fatiga moderada.

### 3.3 Pausas y prevención

- **Regla 20-20** citada por [Guitar Wiz](https://guitarwiz.app/articles/guitar-posture-guide/): cada 20 minutos, una pausa de 20 segundos para soltar manos, girar hombros y estirar el cuello. En la práctica guitarrística se suele recomendar algo más generoso: **micro-pausas cada 10–15 minutos** y una pausa real cada 45–60 minutos.
- **Estiramientos suaves** de antebrazo, flexores y extensores antes y después de practicar.
- **Señales de alarma** (parar y consultar): dolor que persiste tras tocar, hormigueo, pérdida de fuerza, dolor en la base del pulgar.

### 3.4 Checklist de postura (autoevaluación)

| Zona | Correcto | Señal de alarma |
| --- | --- | --- |
| Espalda | Erguida, sin encorvarse hacia el diapasón | Dolor lumbar al cabo de 20 min |
| Hombros | Nivelados, relajados hacia abajo | Hombro elevado, cuello rígido |
| Cabeza | Alineada; se mueven los ojos, no el cuello | Dolor cervical, mirar siempre hacia abajo |
| Pie izquierdo | Elevado lo justo para inclinar el mástil ~45° | Cadera torsionada, pie dormido |
| Mano izquierda | Muñeca neutra, pulgar detrás del mástil | Muñeca doblada en ángulo extremo |
| Mano derecha | Antebrazo apoyado sin peso muerto, muñeca suelta | Muñeca rígida, mano "colgando" sobre las cuerdas |
| Respiración | Continua, sin bloquear | Aguantar la respiración al tocar pasajes difíciles |

---

## 4. Tema 2 — Mano derecha (pulsación)

### 4.1 Los dos ataques fundamentales: apoyado y tirando

La distinción es la base de la escuela clásica y está bien descrita en [Guitar Wiz — Rest Stroke vs Free Stroke](https://guitarwiz.app/articles/rest-stroke-vs-free-stroke-guitar/):

| | **Apoyado** (*rest stroke*) | **Tirando** (*free stroke*) |
| --- | --- | --- |
| Movimiento | El dedo pulsa y **descansa en la cuerda adyacente inferior** | El dedo pulsa y **sigue hacia la palma, sin tocar la cuerda vecina** |
| Sonido | Más lleno, redondo, proyectado | Más ligero, brillante, con más aire |
| Uso típico | Melodías, escalas, notas que deben destacar | Arpegios, acompañamiento, notas que deben sonar juntas |
| Riesgo | Exceso de fuerza; colapso de la mano | Ataque inconsistente entre dedos |

**Regla de oro**: la mano **no cambia de posición** al alternar entre ambos ataques; el cambio está en la trayectoria del dedo, no en la muñeca. Un error frecuente es "recolocar" toda la mano al pasar a apoyado.

### 4.2 Ángulo de ataque y timbre

- El **ángulo del dedo respecto a la cuerda** modifica el timbre: ataque más perpendicular (hacia dentro, "hacia la palma") produce un sonido más redondo y con menos ruido de uña; ataque más lateral produce un sonido más brillante y percusivo.
- **Punto de contacto**: pulsar más cerca del puente da brillo y proyección; más cerca del mástil, sonido más dulce y redondo. Trabajar deliberadamente puntos de contacto distintos es un ejercicio de control tímbrico.
- **Uñas**: en la escuela clásica la uña es una extensión del dedo que da definición y proyección. Se recomienda forma y pulido constantes (el principiante puede empezar **sin uñas o con uñas muy cortas** y decidir después). La uña no debe "engancharse" ni rascar: se busca un deslizamiento limpio sobre la cuerda.

### 4.3 Alternancia de dedos

- Nomenclatura estándar: **p** = pulgar, **i** = índice, **m** = medio, **a** = anular, **c/ñ** = meñique (poco usado).
- **Alternancia estricta**: en pasajes de notas sucesivas se alternan dedos: **i–m**, **m–a** o **i–a**. No se repite el mismo dedo para notas consecutivas (salvo indicaciones musicales concretas).
- Razón: repetir dedo obliga a "recargar" y produce irregularidad; alternar mantiene el flujo y reparte el esfuerzo.
- **Ejercicio canónico**: una cuerda, una nota repetida, alternando i–m lento y parejo; luego m–a; luego i–a. Después, cuerdas contiguas y cruces de cuerda.

### 4.4 Preparación ("planting") y toque a la cuerda

- **Plantar** = apoyar el dedo en la cuerda antes de pulsar, de forma que el ataque sea intencionado y controlado, no un "manotazo".
- La escuela de **Abel Carlevaro** sistematiza el trabajo de la mano derecha con el concepto de **"fijaciones"**: posiciones de referencia de la mano a partir de las cuales se organizan movimientos, evitando desplazamientos innecesarios. Existe investigación académica específica sobre este recurso y su relación con la acción de la mano derecha ([Amplificar — O recurso das fixações e a escola carlevariana](https://amplificar.mus.br/data/referencias/ver/O-recurso-das-fixacoes-e-a-escola-carlevariana-de-violao--Perspectivas-interdisciplinares-sobre-a-acao-de-mao-direita); [repositorio UDESC](https://repositorio.udesc.br/entities/publication/0268351d-013d-48a6-8713-2a1db1e331d2)).
- La preparación es un recurso **de estudio**: se practica lento "plantando" cada dedo; en tempo real el gesto se reduce a una intención.
- El **pulgar** pulsa hacia abajo/apoyándose en la cuerda grave (apoyado en bajos para línea melódica de bajo; tirando para acompañamientos), y en la técnica clásica **no se apoya en el aro**; su movimiento nace del pulgar, no de la muñeca.

### 4.5 Evidencia sobre la posición de la mano derecha

Un documento de investigación doctoral sobre enseñanza inicial insiste en que **la primera lección es encontrar una posición de mano derecha adaptada al cuerpo de cada estudiante**, detectando hábitos perjudiciales ([Liberty University — documento doctoral](https://digitalcommons.liberty.edu/cgi/viewcontent.cgi?article=9311&context=doctoral)). No existe una única "posición universal": hay parámetros comunes (antebrazo apoyado, muñeca natural, dedos curvados) y ajustes individuales.

### 4.6 Ejercicios de mano derecha (progresión)

| # | Ejercicio | Objetivo | Verificación |
| --- | --- | --- | --- |
| MD-1 | Cuerda al aire, notas repetidas **i–m**, luego **m–a**, luego **i–a** | Alternancia limpia y homogénea | Metrónomo; volumen/ataques regulares (RMS) |
| MD-2 | Mismo ejercicio con **apoyado** y luego con **tirando** | Diferenciar calidades de sonido | Escucha A/B; proyección comparada |
| MD-3 | Cruces de cuerda (cuerda 1 → 2 → 3) con i–m | Control de cruces y ángulo | Sin zumbidos ni roces; ritmo estable |
| MD-4 | Nota con **p** (bajos) tirando y apoyado | Sonido del pulgar sin muñeca | Estabilidad rítmica; timbre pleno |
| MD-5 | "Preparación" lenta: plantar cada dedo antes de pulsar | Intención y control | Tempo muy bajo (50–60 BPM); cero ataques accidentales |

---

## 5. Tema 3 — Mano izquierda

### 5.1 Colocación básica

- **Pulgar detrás del mástil**, aproximadamente detrás del dedo medio (con matices según la posición y la extensión requerida), **sin sobresalir por encima** del diapasón.
- **Dedos curvados**, pisando con la **yema/punta** (no con la parte blanda central), con la articulación metacarpofalángica "arqueada" y la falange distal relativamente perpendicular a la cuerda.
- **Muñeca neutra**: ni doblada hacia fuera ni hacia dentro en ángulo extremo. La referencia útil: si el antebrazo y el dorso de la mano forman una línea casi continua, la muñeca está bien.
- **Codo cerca del cuerpo**, sin "alearse" hacia fuera salvo en posiciones concretas.

### 5.2 Presión mínima

- La presión correcta es **la mínima que produce un sonido limpio**, justo detrás del traste (no encima). Apretar de más:
  - cansa y aumenta el riesgo de lesión;
  - **ralentiza** los cambios (cuesta más soltar);
  - desafina la nota por exceso de tensión sobre la cuerda.
- El método para encontrarla: pulsar muy suave e incrementar por milímetros hasta que la nota suene limpia, memorizando esa sensación. La **regla de "nota limpia con la menor presión"** es un ejercicio en sí mismo.
- Fuentes pedagógicas sobre mano izquierda ([Siccas Guitars — Left-Hand Technique](https://www.siccasguitars.com/blogs/stories/classical-guitar-left-hand-technique); [Guitar Wiz](https://guitarwiz.app/articles/guitar-posture-guide/)) recomiendan además **evitar ángulos extremos de muñeca** y ajustar la posición del pulgar cuando aparece dolor o fatiga.

### 5.3 Independencia de dedos

- Objetivo: que cada dedo se mueva **sin arrastrar a los demás** y sin "colapsar" las falanges.
- Ejercicios clásicos: **cromáticos** (1-2-3-4 por cuerda, subiendo y bajando), **araña** (*spider*), **switcharoo** (movimientos opuestos) y **hopping** (saltos de un dedo entre cuerdas). El currículo de [Douglas Niedt](https://douglasniedt.com/beginners-course-of-study.html) los introduce de forma progresiva (mes 3: *press-release*, *switching*, cromáticos; mes 5: *spider* y *switcharoo*; final de año: *switcharoo* y *spider* completos).
- **Press-release**: pisar y soltar conscientemente, notando que el dedo "suelta" sin dejar tensión residual.
- **Plant 2 - Move 2**: dos dedos plantados, dos en movimiento; entrena la independencia con economía de movimiento.

### 5.4 Cejilla progresiva (*barre*)

La cejilla es el mayor obstáculo técnico del principiante y hay que **prepararla mucho antes** de tocarla en repertorio:

1. **Etapa 0 — Dedos fuertes**: cromáticos y ejercicios de presión mínima. Sin cejilla.
2. **Etapa 1 — Cejilla de 2 cuerdas**: el índice pisa dos cuerdas en un traste alto (por ejemplo, traste 5–7 donde la tensión cede); el resto de dedos libres.
3. **Etapa 2 — Cejilla parcial de 3–4 cuerdas**, buscando el punto de contacto óseo del índice (lateral, no la parte blanda).
4. **Etapa 3 — Cejilla completa** (6 cuerdas) en trastes altos; después bajar progresivamente de traste (a más cerca de la cejuela, más tensión).
5. **Etapa 4 — Cejilla en contexto musical**: acordes con cejilla (F, Bm…) y cambios hacia/desde ellos.

Claves técnicas: **el índice rueda ligeramente hacia el lado del hueso**, el codo se acerca al cuerpo y **la mano "tira" suavemente con la ayuda del brazo** (no solo fuerza de dedos); la presión del pulgar es de apoyo, no de oposición máxima. Ejercicios de cejilla requieren **sesiones cortas y frecuentes**, nunca "machacar" hasta el dolor.

### 5.5 Cambios de posición

- Movimiento guiado por el **dedo que se queda** o por el que se desplaza; en posiciones cercanas, deslizar en lugar de levantar y recolocar.
- La mano debe **anticipar la posición** (aplicación del "hover": visualizar la forma destino antes de moverse), idea que enlaces pedagógicos generales aplican igualmente a los cambios de acorde ([Guitar Wiz](https://guitarwiz.app/articles/switching-chords-faster/)).
- Ejercicios: escalas en una sola cuerda con cambio de posición, cromáticos en posiciones 1ª, 2ª, 5ª y 7ª, y **saltos de posición** con nota guía.

---

## 6. Tema 4 — Calentamiento

### 6.1 Principios

- El calentamiento busca **activar sin fatigar**: circulación, coordinación y sensibilidad; no es un entrenamiento de fuerza.
- Debe ser **lento, consciente y corto**: 8–15 minutos bastan para el nivel inicial (el currículo de [Niedt](https://douglasniedt.com/beginners-course-of-study.html) recomienda una rutina diaria de 30 minutos que puede crecer a una hora, con un bloque breve de técnica).
- Estructura típica: **manos separadas → manos juntas lentas → coordinación/tempo → aplicación musical breve**.

### 6.2 Bloque de calentamiento propuesto (10–12 min)

| Min | Contenido | Detalle | BPM orientativo |
| --- | --- | --- | --- |
| 0–2 | Mano izquierda sola | Cromático 1-2-3-4 en una cuerda, sin pulsar (o con pulsación suave) | 50–60 |
| 2–4 | Ligados | Ascendentes (hammer-on) y descendentes (pull-off) en cuerdas 1–3 | 45–55 |
| 4–6 | Extensiones suaves | 1–3, 2–4, 1–4 en trastes 1–4; sin forzar; parar si hay dolor | 45–50 |
| 6–8 | Manos juntas, cromático | 1-2-3-4 con alternancia i–m, cuerdas 6→1 y vuelta | 55–65 |
| 8–10 | Cambios de posición | Cromático en 1ª → 5ª posición con nota guía | 50–60 |
| 10–12 | Escala corta (p. ej. Do mayor 1 octava) con metrónomo | Notas parejas, ligera dinámica | 50–70 |

### 6.3 Ligados (hammer-on / pull-off)

- **Hammer-on**: el dedo cae con energía controlada sobre el traste, sin ayuda de la mano derecha; el sonido debe ser **igual de fuerte** que una nota pulsada.
- **Pull-off**: el dedo "tira" ligeramente de la cuerda al retirarse (no solo se levanta), para que la cuerda vibre.
- Errores: ligados "flojos" (volumen desigual), tensión del pulgar y muñeca rígida. Verificación: **comparar la envolvente/volumen de la nota ligada con la pulsada** (audio: sí, mediante RMS/envolvente).

### 6.4 Advertencia

Nunca usar el calentamiento para "ganar fuerza" con dolor. Los ejercicios de fuerza (ceja, extensiones) se dosifican y se intercalan; el calentamiento es preparación neuromuscular.

---

## 7. Tema 5 — Sincronización y control del tempo

### 7.1 Por qué el metrónomo

- El metrónomo convierte una impresión subjetiva ("creo que voy bien") en una **referencia externa objetiva**; es el estándar en la pedagogía clásica para escalas, arpegios y estudios.
- La práctica recomendada por las fuentes de referencia es **empezar lento y subir solo cuando esté limpio** ([Guitar Wiz](https://guitarwiz.app/articles/switching-chords-faster/): "si a 100 BPM suena sucio, baja a 60; la velocidad sigue a la precisión"; [Guitar Wiz — Metronome FAQ](https://guitarwiz.app/faq/metronome/); [Guitar-Scale — Scale Practice Methods](https://www.guitar-scale.com/en/articles/scale-practice)).
- Procedimiento de tempo escalonado:
  1. Elegir un tempo en el que **todo** salga limpio (a menudo 50–60 BPM para el principiante).
  2. Tocar 3–4 veces sin errores.
  3. Subir **+5 BPM**.
  4. Si fallas **dos veces** en el nuevo tempo, **vuelve 5 BPM atrás** y consolida.
  5. Registrar el tempo máximo cómodo: es una **métrica de progreso** objetiva.

### 7.2 Alternancia estricta y sincronización

- En escalas de una nota por tiempo, la mano derecha alterna **i–m** estricta (o **m–a**), y la izquierda **no** debe "correr" para adelantarse: la coordinación se entrena **lentamente**, con ataques y pisadas simultáneos.
- Ejercicio clave: **nota repetida con alternancia**, luego escalas de una octava, luego dos octavas; el paso a cuerdas contiguas obliga a coordinar cruce de cuerda y cambio de traste.
- **Contar en voz alta** (o con subdivisiones: "1 y 2 y…") es una recomendación explícita del currículo de [Niedt](https://douglasniedt.com/beginners-course-of-study.html) y del material de [This is Classical Guitar](https://www.thisisclassicalguitar.com/lesson-beginner-technique-exercises-for-classical-guitar/). Ayuda a separar "tempo" de "digitación".

### 7.3 Escalas: progresión sugerida

| Etapa | Contenido | Extensión | Tempo objetivo típico |
| --- | --- | --- | --- |
| E1 | Cromático en cuerdas sueltas a 1ª posición | 4 trastes por cuerda | 50–60 BPM (corcheas) |
| E2 | Escala de Do mayor | 1 octava, 1ª posición | 60–70 BPM |
| E3 | Sol mayor / La menor | 1–2 octavas | 70–80 BPM |
| E4 | Escalas con cambio de posición | 2 octavas | 70–90 BPM |
| E5 | Escalas en dos octavas con dinámica | 2–3 octavas | 80–100 BPM |

Los valores son orientativos y dependen del tempo de subdivisión: a igual BPM, en corcheas se tocan el doble de notas que en negras. Un módulo futuro debe registrar **BPM + subdivisión** para que las marcas sean comparables.

### 7.4 Verificación con audio

- **Estabilidad temporal**: comparar los instantes de ataque detectados con la rejilla del metrónomo (desviación media y desviación típica). Un objetivo pedagógico razonable para principiantes es una desviación **perceptible pero pequeña** (±30–50 ms) y, sobre todo, **sin "paradas"** (huecos largos o notas agrupadas).
- **Afinación**: cada nota de la escala puede comprobarse con el afinador (los cents deben mantenerse dentro de un margen; el principiante suele desafinar por exceso de presión).
- **Limpieza**: detección de nota correcta (YIN) y ausencia de cuerdas vecinas sonando.

---

## 8. Tema 6 — Arpegios

### 8.1 Qué son y por qué se estudian

Un arpegio es la ejecución sucesiva de las notas de un acorde. En la guitarra clásica son **el recurso técnico más rentable** del principiante porque:

- entrenan la **independencia de p, i, m, a**;
- obligan a que cada nota **suene y se sostenga** (ataque *tirando*);
- aparecen constantemente en el repertorio (estudios de Sor, Giuliani, Tárrega, Brouwer);
- permiten trabajar simultáneamente **tempo, limpieza y control dinámico**.

### 8.2 Los 120 estudios de Giuliani

- **Mauro Giuliani, *120 Right-Hand Studies* (Op. 1A / Op. 1)**: colección de 120 fórmulas de mano derecha sobre progresiones armónicas sencillas. Cada estudio es una **célula de arpegio** que se repite; el valor didáctico está en la variedad sistemática de patrones y en la exigencia de regularidad ([Giuliani — 120 Right-Hand Studies, edición moderna](https://www.abebooks.com/products/isbn/9798368351513)).
- Se consideran el equivalente para la mano derecha de lo que los cromáticos son para la izquierda: **gimnasia de patrones**.
- Uso recomendado: elegir 2–4 estudios por sesión, tempo lento, patrón idéntico todas las repeticiones, **sin acelerar** hasta que el sonido sea homogéneo.

### 8.3 Patrones fundamentales

Los patrones se escriben con la notación p–i–m–a sobre las cuerdas del acorde (por ejemplo, en La menor: p en 5ª, i en 3ª, m en 2ª, a en 1ª). Familias típicas:

| Familia | Ejemplos | Notas |
| --- | --- | --- |
| Tresillos simples | `p-i-m`, `p-m-i`, `p-i-a`, `p-a-i` | Base para acompañamientos y estudios |
| Cuatro voces | `p-i-m-a`, `p-m-i-a`, `p-a-m-i` | El clásico "arpegio de Giuliani" |
| Con repetición | `p-i-m-i`, `p-m-a-m`, `p-a-m-a` | Introduce alternancia y control del retorno |
| Bajos alternos | `p-i-p-m`, `p-i-p-a` | Independencia del pulgar del resto |
| Bajos con dos dedos | `p(5ª)-p(6ª)` alternando con i-m | Control del pulgar y cambios de bajo |

La progresión pedagógica habitual es: **3 voces → 4 voces → repeticiones → bajo alterno → cambios de acorde dentro del patrón**.

### 8.4 Cómo practicarlos (método)

1. **Solo mano derecha** sobre cuerdas al aire: el patrón debe sonar *igual* en cada repetición.
2. **Acorde con la izquierda**: sostener el acorde y repetir el patrón; el reto es que **ninguna nota se corte**.
3. **Cambio de acorde**: dos acordes alternos con el mismo patrón (por ejemplo, Am ↔ E); aquí aparece el problema real: mantener el arpegio *mientras* la izquierda cambia.
4. **Con metrónomo**: un ataque por clic (o dos, según subdivisión), sin acelerar ni arrastrar.
5. **Con dinámica**: destacar la melodía (habitualmente en la voz superior) apoyando el dedo correspondiente.

### 8.5 La visión de Carlevaro ("fijaciones")

Abel Carlevaro organiza la mano derecha en **posiciones de referencia ("fijaciones")** que permiten que los dedos actúen desde una base estable, minimizando desplazamientos y mejorando la seguridad del ataque. La investigación académica sobre este recurso ([Amplificar](https://amplificar.mus.br/data/referencias/ver/O-recurso-das-fixacoes-e-a-escola-carlevariana-de-violao--Perspectivas-interdisciplinares-sobre-a-acao-de-mao-direita); [UDESC](https://repositorio.udesc.br/entities/publication/0268351d-013d-48a6-8713-2a1db1e331d2)) muestra que no es una técnica "exótica" sino un sistema coherente de economía de movimiento, coherente con lo que hoy llamaríamos **ergonomía y control motor**.

### 8.6 Errores típicos en arpegios

- **Acelerar** al llegar a un cruce de cuerda "fácil" y frenar en el difícil (irregularidad).
- **Cortar notas**: usar apoyado donde debería ser tirando, o levantar un dedo antes de tiempo.
- **Tensión del pulgar**: el pulgar "espera" rígido; debe moverse relajado y volver a su posición.
- **Cambio de acorde con parada**: la mano izquierda llega tarde y el patrón se interrumpe; se corrige bajando el tempo y **anticipando** el cambio.
- **Sonido desigual**: unos dedos pulsan más fuerte que otros (a menudo el anular es el más débil).

---

## 9. Tema 7 — Errores comunes del principiante y cómo corregirlos

Tabla de diagnóstico: **síntoma visible/audible → causa probable → corrección**, agrupada por área. Es la sección más directamente reutilizable en un futuro módulo de diagnóstico.

### 9.1 Postura y tensión

| Síntoma | Causa probable | Corrección |
| --- | --- | --- |
| Dolor lumbar a los 15–20 min | Encorvarse para ver el diapasón | Inclinar la guitarra hacia el cuerpo; atril a la altura de los ojos; pausas |
| Hombro elevado, cuello rígido | Tensión por concentración | Bajar hombros conscientemente; respirar; pausas 20-20 |
| Muñeca izquierda muy doblada | Mástil demasiado bajo o guitarra mal apoyada | Subir el mástil (~45°); acercar el codo; revisar banquito/soporte |
| Mano derecha "pesada" | Apoyo excesivo del antebrazo | Apoyar sin cargar peso; muñeca suelta |
| Fatiga en 5 minutos | Presión excesiva y agarre | Presión mínima; revisar pulsación |

### 9.2 Mano derecha

| Síntoma | Causa probable | Corrección |
| --- | --- | --- |
| Sonido irregular entre notas | Falta de alternancia o ataques desiguales | Alternancia estricta i–m; lento con metrónomo; escuchar la homogeneidad |
| Chasquidos y ruido de uña | Ángulo/uña mal ajustado | Revisar forma y pulido; ajustar ángulo y punto de contacto |
| La mano se mueve al cambiar a apoyado | Compensación con la muñeca | Mantener la mano estable; solo cambia la trayectoria del dedo |
| Arpegios con notas cortadas | Apoyado donde hace falta tirando | Revisar la técnica por nota: cada nota debe quedar vibrando |
| Pulgar tenso o "clavado" | Exceso de fuerza, apoyo rígido | Relajar; usar el pulgar desde su articulación; practicar bajos lentos |

### 9.3 Mano izquierda

| Síntoma | Causa probable | Corrección |
| --- | --- | --- |
| Zumbidos / trasteo | Pisar lejos del traste o poca presión | Pisar **junto al traste**; subir presión hasta el mínimo limpio |
| Nota desafinada | Exceso de presión (estira la cuerda) | Bajar presión; comprobar con afinador |
| Dedo "plano" que apaga cuerdas vecinas | Falta de curvatura / colocación | Curvar dedos; yema sobre la cuerda; revisar ángulo de muñeca |
| Cansancio rápido en la mano | Presión excesiva y pulgar oponiéndose con fuerza | Presión mínima; pulgar de apoyo |
| Cambios lentos y con parada | Soltar antes de tener la forma destino | Hover (visualizar); mover dedos juntos; practicar el par aislado |
| Cejilla que no suena | Índice en la parte blanda o sin apoyo del brazo | Rodar el índice al hueso; subir trastes; acercar el codo; sesiones cortas |

### 9.4 Tempo, práctica y hábitos

| Síntoma | Causa probable | Corrección |
| --- | --- | --- |
| Correr en los pasajes fáciles | Falta de control interno | Metrónomo y **contar en voz alta**; tempo escalonado |
| Parar y repetir al fallar al tocar la pieza completa | Hábito de "reinicio" | Practicar en fragmentos pequeños; tocar la pieza completa lenta sin parar |
| Siete días con la misma pieza y ningún ejercicio | Práctica sin objetivos | Bloque de técnica diario de 10–15 min; registro de tempo |
| "Suena bien" pero no hay progreso | Falta de medición | Registrar BPM, cambios/min, cents; comparar semana a semana |
| Dolor persistente | Lesión por esfuerzo repetitivo | Parar, descansar, consultar; revisar técnica y pausas |
| Mirar siempre las manos | Dependencia visual | Practicar fragmentos cortos con los ojos cerrados; conocimiento del diapasón |

### 9.5 Cómo detectar errores (protocolo)

1. **Grabar** la práctica (audio o vídeo): el oído propio se adapta y deja de oír el error.
2. **Aislar**: repetir el fragmento a 50 BPM; si aparece el error, es técnico; si desaparece, es de tempo/automatización.
3. **Cambiar una variable a la vez**: tempo, dinámica, punto de contacto, posición. No todo a la vez.
4. **Comprobar con herramientas**: afinador para entonación, metrónomo para tempo, análisis de envolvente para limpieza/ligados.
5. **Preguntar a un profesor** cuando el error persista: hay cosas (postura, presión, uña) que necesitan ojos externos.

---

## 10. Tema 8 — Progresión pedagógica (semana a semana)

### 10.1 Currículo anual de referencia

La estructura más clara y accionable encontrada es el **plan anual mes a mes** de [Douglas Niedt](https://douglasniedt.com/beginners-course-of-study.html), diseñado para 30 minutos diarios. Resumen adaptado:

| Mes | Contenido principal | Hitos |
| --- | --- | --- |
| 1 | Postura, afinación, posición de mano derecha, cuerdas al aire, apoyado/tirando, primeros patrones i-m-a | Sonido limpio en cuerdas al aire |
| 2 | Notación musical, estudios de cuerdas al aire con ritmos variados, arpegios básicos | Leer y contar en voz alta |
| 3 | Mano izquierda, notas en 1ª cuerda, cromáticos, combinación con bajos | Estudios con 1ª y bajos; comenzar "switching" |
| 4 | Notas en 2ª, 3ª y 4ª cuerdas, cruces de cuerda, lectura a dos voces | Escalas cromáticas en varias cuerdas |
| 5 | Notas en 5ª y 6ª cuerdas, escalas diatónicas en 1ª posición, ejercicios de independencia | Spider, switcharoo, estudios con todas las cuerdas |
| 6 | Acordes abiertos, primeras piezas de Carulli, Aguado, Sor, Giuliani, Carcassi | Tocar piezas sencillas completas |
| 7–12 | Método(s) de base + piezas de dificultad creciente (Sor, Tárrega, etc.); rutina diaria de 30–60 min | Repertorio inicial y técnica consolidada |

Puntos clave de este plan:

- **La mano derecha va antes que la izquierda**: se empieza con cuerdas al aire y ataques, no con acordes.
- **La lectura y el conteo en voz alta** se trabajan desde el mes 2.
- **La técnica se dosifica**: ejercicios cortos dentro de una rutina diaria, no sesiones maratónicas.
- **La motivación viene del repertorio**: el propio Niedt advierte que los estudiantes (sobre todo jóvenes) no deben obsesionarse con ejercicios; la técnica acompaña a la música.

### 10.2 Alternativa por "bloques" de 8 semanas

Combinando el plan anterior con la lógica de niveles de los métodos modernos ([Werner — Classical Guitar Method Vol. 1](https://www.thisisclassicalguitar.com/free-classical-guitar-method-book-pdf/); [Powis — Cornerstone Grade 1](https://www.douglasniedt.com/beginners-course-of-study.html); [Parkening](https://www.douglasniedt.com/beginners-course-of-study.html); [Shearer](https://www.douglasniedt.com/beginners-course-of-study.html); [Tennant](https://www.douglasniedt.com/beginners-course-of-study.html); [Duncan](https://www.douglasniedt.com/beginners-course-of-study.html)):

| Bloque | Foco | Criterio de salida |
| --- | --- | --- |
| B1 (sem 1–8) | Postura, afinación, cuerdas al aire, p/i/m/a, apoyado/tirando | 8 compases a 60 BPM con sonido parejo |
| B2 (sem 9–16) | Mano izquierda 1ª posición, cromáticos, ligados, 1ª cuerda | Cromático 1-2-3-4 a 60 BPM limpio |
| B3 (sem 17–24) | Escalas de 1 octava, arpegios p-i-m-a, cruces | Escala de Do a 70 BPM sin parar |
| B4 (sem 25–32) | Acordes abiertos, cambios, primeras piezas; cejilla de 2 cuerdas | Pieza sencilla completa a tempo |
| B5 (sem 33–40) | Escalas 2 octavas, arpegios de Giuliani, cambios de posición; cejilla parcial | 2 estudios de Giuliani parejos a 60–70 BPM |
| B6 (sem 41–52) | Repertorio, cejilla completa, dinámica y timbre | Pieza de grado 1–2 con dinámica y sin tensión |

### 10.3 Sesión diaria modelo (30–45 min)

| Bloque | Tiempo | Contenido |
| --- | --- | --- |
| Calentamiento | 8–12 min | Cromáticos, ligados, extensiones suaves (tabla §6.2) |
| Técnica nueva | 8–10 min | El ejercicio del bloque actual (escala/arpegio/ceja) con metrónomo |
| Repertorio | 10–15 min | Pieza en curso: fragmentos difíciles → pieza completa lenta → completa |
| Cierre | 3–5 min | Repaso del ejercicio más difícil a tempo lento; registro de métricas |

Recomendación de registro: anotar **BPM máximo limpio** de cada ejercicio, **cambios por minuto** de los acordes y **notas desafinadas** detectadas. Es exactamente el tipo de dato que GuitAI puede capturar automáticamente.

---

## 11. Tema 9 — Métricas de progreso

### 11.1 Señales observables (cualitativas)

Fuentes pedagógicas y de divulgación coinciden en un conjunto de señales ([Green Hills Guitar Studio — 10 signs you're getting better](https://greenhillsguitarstudio.com/10-signs-youre-getting-better-at-guitar/); [Guitar Wiz — Metronome FAQ](https://guitarwiz.app/faq/metronome/); [Siccas — Scales & Arpeggios](https://www.siccasguitars.com/blogs/stories/classical-guitar-scales-arpeggios-guide)):

- El tempo se mantiene **sin parar** en fragmentos cada vez más largos.
- Las notas suenan **parejas** (volumen y duración) y **limpias** (sin zumbidos).
- **Menos tensión**: se puede tocar el mismo pasaje sin "agarrarse".
- Los cambios de acorde/posición llegan **antes** del tiempo (anticipación), sin huecos.
- El sonido mejora: más redondo con apoyado, más brillante con tirando, a voluntad.
- El oído detecta errores que antes no se oían.
- Se aprende más rápido: menos repeticiones para fijar un pasaje.
- La práctica es más larga sin fatiga.

### 11.2 Métricas medibles con audio (cuantitativas)

| Métrica | Definición operativa | Cómo medirla | Objetivo orientativo inicial |
| --- | --- | --- | --- |
| **Desviación de afinación** | cents respecto a la nota objetivo | Afinador (YIN) por nota | Mantener |cents| < 10–15 durante la escala |
| **Tempo máximo limpio** | BPM en que no hay errores en 3 pasadas | Metrónomo + registro | +5 BPM por semana en el mismo ejercicio |
| **Estabilidad temporal** | desviación típica de los ataques vs. rejilla | Detección de ataques + metrónomo | Sin paradas; dispersión baja y decreciente |
| **% de notas limpias** | notas correctas sin cuerdas vecinas | Detección monofónica + energía de cuerdas no deseadas | > 90 % en fragmento de 8 compases |
| **Cambios por minuto** | cambios de acorde limpios en 60 s | Módulo de cambios (ya existe) | 30 → 50 → 70 |
| **Regularidad de volumen** | dispersión de RMS entre notas del mismo ejercicio | Envolvente por nota | Disminuye con las semanas |
| **Duración sin fatiga** | minutos tocando antes de notar tensión | Autoevaluación + pausas | Aumenta de 15 a 30–45 min |
| **Recuperación tras error** | capacidad de seguir sin parar | Contar "reinicios" | 0 reinicios en una pasada |

### 11.3 Sistema de "semáforo" para el usuario

- 🟢 **Verde**: métrica en objetivo (tempo, cents, limpieza).
- 🟡 **Ámbar**: cerca, con irregularidad (p. ej., tempo bien pero con 1 parada).
- 🔴 **Rojo**: error sostenido (zumbidos, paradas, tensión declarada).

La honestidad es clave: **el rojo debe ser informativo, no punitivo**. La pedagogía consultada insiste en que la motivación viene de la música; las métricas son una ayuda, no un jurado.

### 11.4 Advertencia sobre medir

- Medir **no es** lo mismo que mejorar: la métrica debe llevar a una acción de práctica concreta (bajar tempo, aislar un compás, revisar presión).
- Algunos indicadores importantes (**relajación, postura, calidad de movimiento**) no se miden bien con audio; deben ir con rúbricas de autoevaluación o revisión por vídeo/profesor.
- Evitar la "tiranía del número": un tempo alto con sonido sucio es un retroceso, no un logro.

---

## 12. Síntesis de hallazgos clave

1. **La mano derecha se enseña antes que la izquierda** en los currículos clásicos serios: cuerdas al aire, ataque, alternancia y arpegios básicos primero (Niedt, Werner).
2. **Apoyado y tirando no son "niveles" sino dos calidades** que se aprenden temprano y se alternan según la función musical (melodía vs. acompañamiento).
3. **La preparación (planting) y las "fijaciones" (Carlevaro) son economía de movimiento**: atacan el problema de la irregularidad antes de que se convierta en hábito.
4. **La mano izquierda se rige por la presión mínima**: pisar junto al traste, con la yema, sin apretar de más; el exceso de presión causa desafinación, fatiga y lentitud en los cambios.
5. **La cejilla se prepara con etapas** (2 cuerdas → parcial → completa → trastes altos → contexto), nunca de golpe.
6. **El calentamiento es corto, lento y consciente** (8–15 min), con cromáticos, ligados, extensiones suaves y cambios de posición.
7. **El tempo se progresa con reglas explícitas** (+5 BPM solo si está limpio; si fallas dos veces, bajas) y con conteo en voz alta.
8. **Los 120 estudios de Giuliani** son la referencia para sistematizar la mano derecha con patrones de arpegio progresivos.
9. **La progresión pedagógica estándar** es: postura → cuerdas al aire/ataques → mano izquierda 1ª posición → escalas y arpegios → acordes/cambios → repertorio, con la técnica dosificada a diario.
10. **Los errores típicos son predecibles y diagnosticables**: zumbidos (pisar mal/poca presión), desafinación (exceso de presión), irregularidad (falta de alternancia), paradas (cambios no anticipados), tensión (fuerza bruta).
11. **Lo verificable con audio** (afinación, limpieza, tempo, cambios) cubre una parte importante del progreso, pero **no todo**: postura y relajación requieren rúbricas.
12. **La motivación viene del repertorio**: los ejercicios son un medio, no un fin; cualquier sistema de práctica debe terminar sonando a música.

---

## 13. Reflexiones personales del agente

### 13.1 Qué aprendí

- Que la técnica clásica es, en gran medida, **gestión de la economía y la tensión**: casi todos los errores "técnicos" que se ven en un principiante son formas de gastar energía de más o de mover algo que no hacía falta mover.
- Que existe un **orden pedagógico muy establecido** (mano derecha antes que izquierda, cuerdas al aire antes que acordes, lento antes que rápido) que no es un capricho: cada etapa prepara la siguiente.
- Que **medir bien es más difícil que medir mucho**: el audio da métricas excelentes de afinación, tempo y limpieza, y métricas pobres de postura y tensión.
- Que los métodos clásicos (Sagreras, Carlevaro, Shearer, Brouwer) no son solo repertorio: sus progresiones y sistemas (fijaciones, estudios sencillos, primeros estudios con acompañamiento del profesor) contienen **decisiones pedagógicas explícitas**.

### 13.2 Lo que me resultó más revelador

1. **La "presión mínima" como ejercicio en sí mismo** (subir la presión milímetro a milímetro hasta que la nota suene limpia): convierte una sensación difusa en un procedimiento comprobable, y explica por qué tantos principiantes tocan desafinados y cansados.
2. **La cejilla como preparación de semanas, no como acorde que "ya tocará"**: la escalera 2 cuerdas → parcial → completa → trastes altos evita el hábito de "agarrar con fuerza".
3. **La regla del tempo (+5 BPM / −5 si fallas dos veces)**: es una política sencilla, medible y no arbitraria para la práctica deliberada.
4. **La advertencia de Niedt sobre no sobrecargar de ejercicios**: la técnica debe acompañar a la música, y el material pedagógico de calidad lo dice abiertamente. Es una vacuna contra el "modo gimnasio" en una app de práctica.
5. **Que la mano derecha se enseñe primero**: contradice la intuición del principiante (que quiere poner acordes cuanto antes) y ordena todo el currículo.

### 13.3 Ideas que me inspiran para GuitAI

- **Un módulo de práctica técnica basado en bloques**, no en listas infinitas: el usuario elige un objetivo (p. ej. "cromáticos a 60 BPM limpios") y la app guía la sesión de 10–15 minutos con criterios de salida.
- **Verificación audio-first honesta**: comprobar afinación, limpieza de nota y estabilidad temporal con lo que ya existe (YIN, detección de ataques, metrónomo), y **declarar explícitamente lo que no se puede medir** (postura, tensión) para no dar una falsa sensación de evaluación.
- **Rúbricas de autoevaluación** para postura/tensión: checklists breves antes y después de la sesión (¿dolor? ¿hombros? ¿pausas?), que alimenten recomendaciones y pausas activas.
- **Política de tempo transparente** (+5/−5) integrada en el metrónomo: el propio módulo decide cuándo subir y cuándo bajar, y lo explica.
- **Progresiones verificables**: cromáticos → escalas de una octava → dos octavas; arpegios de Giuliani en orden; cejilla por etapas. Cada etapa con su criterio de salida medible.
- **Diagnóstico basado en síntomas**: reutilizar la tabla de errores (§9) para convertir una métrica mala en una recomendación concreta ("tu escala se desvía ±35 ms: baja a 60 BPM y cuenta en voz alta").
- **Conexión con el repertorio**: cada bloque técnico debería terminar con una pieza corta que use lo aprendido; el módulo no debe ser un gimnasio aislado.

---

## 14. Implicaciones potenciales para un futuro módulo de práctica guiada

> Sin comprometer diseño, nomenclatura ni prioridades. Son posibilidades derivadas de la investigación.

### 14.1 Capacidades que encajan con lo ya construido

| Capacidad propuesta | Reutiliza | Verificable |
| --- | --- | --- |
| Sesión de calentamiento guiada (temporizador + bloques) | Metrónomo, UI de ejercicios | Parcial (tiempo y tempo) |
| Cromáticos/escalas con criterio de tempo | Afinador (cents por nota), metrónomo, detección de ataques | Sí (afinación, tempo, limpieza) |
| Arpegios de Giuliani por patrones | Detección de nota + envolvente (regularidad de volumen) | Sí (tempo, limpieza, regularidad) |
| Preparación de cejilla por etapas | Detección de cuerdas sonando/mudas (ya usado en acordes) | Sí (qué cuerdas suenan) |
| Cambios de posición con nota guía | Afinador + metrónomo | Sí (nota correcta, tempo) |
| Rúbrica de postura/tensión | Formularios + recordatorios de pausa | No (autoevaluación) |
| Registro de progreso (BPM, cents, limpieza) | Almacenamiento local ya existente | Sí (datos) |
| Recomendaciones según diagnóstico | Tabla de errores §9 + métricas | — |

### 14.2 Principios de diseño que la investigación sugiere

1. **Empezar por la mano derecha** en el nivel absoluto (cuerdas al aire, ataques, alternancia) antes de acordes.
2. **Una cosa a la vez**: cada sesión propone un objetivo técnico, no cinco.
3. **Criterios de salida explícitos** ("limpio 3 veces a 60 BPM" → subir a 65).
4. **Tempo y subdivisión** registrados juntos para que las comparaciones tengan sentido.
5. **Lo no medible se pregunta, no se inventa**: postura y tensión mediante checklists.
6. **La música cierra la sesión**: un fragmento musical corto que aplique la técnica del día.
7. **El error se convierte en instrucción**: cada métrica mala debe mapear a una corrección concreta (tabla §9).
8. **Motivación a largo plazo**: progreso visible, récords personales, sin castigos.

### 14.3 Riesgos a evitar

- **Sobremedir**: convertir la práctica en una persecución de números y perder la musicalidad.
- **Falsa objetividad**: presentar como "evaluación" lo que el audio no puede juzgar (postura, relajación, calidad de movimiento).
- **Rigidez curricular**: el plan anual es una guía, no un riel; el usuario debe poder saltar y elegir.
- **Exceso de contenido**: el propio Niedt advierte contra sobrecargar de ejercicios; el módulo debe ser breve y terminar en música.
- **Lesiones**: cualquier señal de dolor debe activar pausa y recomendación de consultar, nunca "seguir practicando".

---

## 15. Referencias

### 15.1 Métodos y obras clásicas citadas

- **Julio S. Sagreras** — *Las Primeras Lecciones de Guitarra* (método progresivo en varios cuadernos, con acompañamiento de profesor). [Ficha editorial](https://bookshop.org/p/books/sagreras-las-primeras-lecciones-de-guitarra-metodo-para-aprender-a-tocar-la-guitarra-julio-sagreras/9f22d176e642025b) · [Edición comercial](https://www.woodbrass.com/en-es/sheet+music/acoustic-guitar-transatlantiques-sagreras-j-s-premieres-lecons-de-guitare-p54343.html)
- **Abel Carlevaro** — *Escuela de la Guitarra: exposición de la teoría instrumental* y *Cuadernos*; técnica de mano derecha basada en "fijaciones". [Estudio académico sobre las fijaciones](https://amplificar.mus.br/data/referencias/ver/O-recurso-das-fixacoes-e-a-escola-carlevariana-de-violao--Perspectivas-interdisciplinares-sobre-a-acao-de-mao-direita) · [Repositorio UDESC](https://repositorio.udesc.br/entities/publication/0268351d-013d-48a6-8713-2a1db1e331d2)
- **Aaron Shearer** — *Learning the Classic Guitar* (Part 1) y *Classical Guitar Technique Vol. 1*. [Ficha del libro](https://books.google.com.sg/books?id=j_nYAwAAQBAJ) · [Ficha editorial](https://www.forsyths.co.uk/music/sheet-music/instruments/guitar-plucked-instruments/guitar/45448-shearer-aaron-learning-the-classic-guitar-part-1-9780871668547.html)
- **Leo Brouwer** — *Estudios Sencillos* (dos cuadernos de diez estudios, con intención pedagógica y elementos afrocubanos). [Tesis/acceso académico](https://core.ac.uk/works/84223364/)
- **Mauro Giuliani** — *120 Right-Hand Studies* (Op. 1A / Op. 1). [Edición moderna](https://www.abebooks.com/products/isbn/9798368351513)
- **Hubert Kappel** — *The Bible of Classical Guitar Technique*. [Ficha editorial](https://www.broekmans.com/en/bladmuziek/the-bible-of-classical-guitar-technique-908436) · [Ficha comercial](https://www.abebooks.com/products/isbn/9783899221916)
- **Scott Tennant** — *Pumping Nylon: A Classical Guitarist's Technique Handbook* (Alfred). [Ficha](https://www.long-mcquade.com/69146/Print-Music/Classical_Guitar/Alfred_Publishing)
- **Gohar Vardanyan** — *Complete Warm-Up for Classical Guitar*. [Ficha editorial](https://www.forsyths.co.uk/music/sheet-music/instruments/guitar-plucked-instruments/guitar/149715-complete-warm-up-for-classical-guitar-9780786685028.html)
- **Walt Lawry** — *Left Hand Studies for Classical Guitar* (Mel Bay). [Ficha](https://www.sheetmusicplus.com/en/product/left-hand-studies-for-classical-guitar-18427898.html)
- Métodos de iniciación recomendados por Niedt: **Christopher Parkening** (*Guitar Method*), **Bradford Werner** (*Classical Guitar Method Vol. 1*), **Simon Powis** (*Cornerstone Method Grade 1*), **Charles Duncan** (*A Modern Approach to Classical Guitar, Book 1*), **Scott Tennant** (*Basic Classical Guitar Method, Book 1*). Todos listados en [Niedt — Course of Study](https://douglasniedt.com/beginners-course-of-study.html).

### 15.2 Fuentes pedagógicas y técnicas consultadas

- **Douglas Niedt** — *Monthly and One-Year Course of Study for a Beginning Classical Guitarist*: [artículo](https://douglasniedt.com/beginners-course-of-study.html) · [PDF](https://douglasniedt.com/Beginners-Course-Monthly-and-One-Year-Classical-Guitar-Course-Outline-Version-2.0.pdf) · [ejercicios para principiantes (press-release, switching, hopping, plant 2-move 2, cromáticos)](https://douglasniedt.com/tech-tip-exercises-for-beginners.html)
- **Bradford Werner / This is Classical Guitar** — [Rutinas de técnica para principiantes (manos derecha e izquierda)](https://www.thisisclassicalguitar.com/lesson-beginner-technique-exercises-for-classical-guitar/) · [Método gratuito Vol. 1](https://www.thisisclassicalguitar.com/free-classical-guitar-method-book-pdf/) · [¿Por dónde empezar?](https://www.thisisclassicalguitar.com/where-to-start-classical-guitar/)
- **Guitar Wiz** — [Guía de postura (sentado, de pie, problemas y correcciones)](https://guitarwiz.app/articles/guitar-posture-guide/) · [Apoyado vs. tirando](https://guitarwiz.app/articles/rest-stroke-vs-free-stroke-guitar/) · [Técnicas clásicas para acústica (patrones de arpegio)](https://guitarwiz.app/articles/classical-techniques-acoustic-guitar-players/) · [Metrónomo FAQ](https://guitarwiz.app/faq/metronome/) · [Cómo cambiar acordes más rápido](https://guitarwiz.app/articles/switching-chords-faster/)
- **Siccas Guitars** — [Técnica de mano izquierda](https://www.siccasguitars.com/blogs/stories/classical-guitar-left-hand-technique) · [Guía técnica de escalas y arpegios](https://www.siccasguitars.com/blogs/stories/classical-guitar-scales-arpeggios-guide) · [Plan de práctica de 30 días](https://www.siccasguitars.com/blogs/stories/the-30-day-classical-guitar-practice-plan-a-structured-daily-routine-for-real-progress)
- **Dummies** — [Cómo sostener correctamente una guitarra clásica](https://www.dummies.com/article/how-to-properly-hold-a-classical-guitar-198026)
- **Guitar-Scale** — [Métodos de práctica de escalas](https://www.guitar-scale.com/en/articles/scale-practice)
- **Music Street** — [Las escalas que más rápido construyen técnica](https://www.musicstreet.co.uk/ja/blogs/blog-post/classical-guitar-scales)
- **Green Hills Guitar Studio** — [10 señales de que estás mejorando](https://greenhillsguitarstudio.com/10-signs-youre-getting-better-at-guitar/)
- **Liberty University (documento doctoral)** — [Enseñanza inicial: posición de mano derecha y hábitos](https://digitalcommons.liberty.edu/cgi/viewcontent.cgi?article=9311&context=doctoral)
- **Trabajo académico en español sobre arpegios progresivos** (Universidad de la República, Uruguay): [PDF](https://www.colibri.udelar.edu.uy/jspui/bitstream/20.500.12008/33201/1/invenguitarra.pdf)
- **Classical Guitar Delcamp** — [hilo sobre el cuaderno de práctica](https://www.classicalguitardelcamp.com/viewtopic.php?t=143670)
- **Justinguitar** — lecciones *One Minute Changes* y *Air Changes* (referencias clásicas de pedagogía para principiantes; en el momento de esta investigación el sitio devolvió HTTP 403 al acceso automático): [One Minute Changes](https://www.justinguitar.com/guitar-lessons/one-minute-changes-exercise-b1-110) · [Air Changes](https://www.justinguitar.com/guitar-lessons/air-changes-bc-153)

### 15.3 Relación con la documentación existente de GuitAI

- `docs/pitch-detection.md` — detector YIN, cents y gating (base de la verificación de afinación).
- `docs/chord-module.md` — validación de acordes por cuerda y por rasgueo (base de la verificación de limpieza).
- `docs/change-exercises.md` — ejercicios de cambio con metrónomo y validación (precedente directo del módulo de práctica).
- `README.md` — arquitectura general del proyecto.

---

*Fin del documento. Este archivo es material de referencia: si se usa para justificar decisiones de producto, conviene contrastar las cifras orientativas (BPM, duraciones) con la práctica real de los usuarios.*
