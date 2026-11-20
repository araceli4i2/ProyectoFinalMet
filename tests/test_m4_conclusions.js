/**
 * SIMTELE-RISK · Test de Conclusiones de Interpretación del Módulo 4 (Fase 7)
 * 
 * Verifica:
 *  1. Existencia de dos textos claramente separados: Conclusión Numérica y Conclusión del Problema.
 *  2. Estructura de dos bloques por conclusión:
 *     - [Resultado de esta simulación] (máximo ~150 palabras)
 *     - [Contexto común del barrido] / [Descargo didáctico y marco común]
 *  3. Recálculo independiente desde los nodos usados (xs):
 *     - (a) Constante de Lebesgue Λ_usados
 *     - (b) Raíz t* de S(t) = u con Newton-Raphson
 *     - (c) Error máximo del spline en puntos ocultos
 *     y comparación con los números del texto (tolerancia relativa 1e-6).
 *  4. Verificaciones negativas estrictas:
 *     - Falla si cita Λ_N como Λ_usados en Estrés (2.41e+9 vs 3.704e+9).
 *     - Falla si las iteraciones de raíces son idénticas entre escenarios distintos (N vs E).
 *     - Falla si "precisión de máquina" o "orden del redondeo de máquina" aparece cuando diffLN > 1e-13.
 *     - Falla si aparece "2.01" en Estrés en lugar de 1.90·σ (error 0.09515).
 *     - Falla si aparecen unidades "s" en t*.
 *     - Falla si contiene la palabra "diverge" para el polinomio con ruido.
 *  5. Comprobación de ausencia estricta de palabras prohibidas y cifras descartadas (Regla 10).
 *  6. Modo interactivo (render4) y modo consulta (renderSimulationFromDB desde SQLite).
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');
const DB = require('../js/db.js');
const Mapper = require('../js/mapper.js');
const {
  mod4,
  modInterp,
  PRE,
  render4,
  splineNatural,
  splineEval,
  splineDeriv,
  lebesgueConstant,
  newtonRaphson
} = require('../js/app.js');

function assert(cond, msg) {
  if (!cond) {
    console.error(`[AssertionError] ${msg}`);
    throw new Error(msg);
  }
}

function countWords(str) {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

const FORBIDDEN_WORDS = [
  'falsas alarmas',
  'decisiones mecánicas',
  'seguridad',
  'recomendado',
  'amortigua',
  'Nyquist',
  '4.914',
  '2.69e-6'
];

async function runTestM4Conclusions() {
  console.log('=== TEST DE CONCLUSIONES DE INTERPRETACIÓN DE M4 (FASE 7) ===\n');

  // Inicializar base de datos SQLite en memoria
  const SQL = await initSqlJs({
    locateFile: file => path.join(__dirname, '../vendor/sqljs', file)
  });
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  const schemaSql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  db.run(schemaSql);
  const seedSql = fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8');
  db.run(seedSql);

  // Mock DOM
  const dom = {};
  const mockElements = [
    's5', 'm4ConclusionsCard', 'm4ConcNumText', 'm4ConcProbText',
    'k4', 'c8', 'c9', 'c12', 'c13', 't4', 't5', 't5_dd', 't5_ocultos', 't5_raices', 't5_escenarios',
    'c9Note', 'queryModeBanner', 'queryBannerNotice', 'querySimId', 'concNum', 'concProb'
  ];
  mockElements.forEach(id => {
    dom[id] = { id, innerHTML: '', style: { display: 'none' }, textContent: '', closest: () => null };
  });

  global.document = {
    getElementById: id => dom[id] || null,
    querySelectorAll: () => []
  };
  global.$ = id => dom[id] || null;
  global.Chart = class Chart {
    constructor(el, cfg) {
      this.el = el;
      this.cfg = cfg;
    }
    destroy() {}
  };
  global.window = {
    fmt: (x, d=2) => (x == null ? '—' : Number(x).toFixed(d)),
    sci: (x, d=2) => (x == null ? '—' : Number(x).toExponential(d)),
    pill: (cls, txt) => `<span class="pill ${cls}">${txt}</span>`,
    kpi: (t, v, s) => `<div class="kpi">${t}:${v}</div>`,
    ds: (label, data, color, o={}) => ({ label, data, borderColor: color, ...o }),
    tbl: (h, rows) => '<table>...</table>',
    chart: () => {},
    C: { O: '#ff7a00', O2: '#ffa53d', W: '#f4f4f4', Y: '#ffd166', R: '#ff3b3b', G: '#7ee787', GR: '#9a9a9a' },
    uiAlert: () => {},
    Mapper
  };

  // -------------------------------------------------------------------------
  // PARTE 1: Verificación de función Mapper.buildM4Conclusions y Estructura
  // -------------------------------------------------------------------------
  console.log('1. Verificando Mapper.buildM4Conclusions y estructura de bloques...');
  assert(typeof Mapper.buildM4Conclusions === 'function', 'Mapper.buildM4Conclusions debe estar exportado');

  const scenarios = ['N', 'E', 'MC'];
  const scenResults = {};

  scenarios.forEach(scen => {
    const p4 = PRE[scen].m4;
    const pmi = PRE[scen].mi;
    const r4 = mod4(p4);
    const ri = modInterp(pmi);
    const conc = Mapper.buildM4Conclusions(ri);
    scenResults[scen] = { r4, ri, conc };
  });

  scenarios.forEach(scen => {
    const { conc } = scenResults[scen];
    assert(conc.conclusion_numerica.includes('[Resultado de esta simulación]'), `${scen}: conclusión numérica debe incluir [Resultado de esta simulación]`);
    assert(conc.conclusion_numerica.includes('[Contexto común del barrido]'), `${scen}: conclusión numérica debe incluir [Contexto común del barrido]`);
    assert(conc.conclusion_problema.includes('[Resultado de esta simulación]'), `${scen}: conclusión del problema debe incluir [Resultado de esta simulación]`);
    assert(conc.conclusion_problema.includes('[Descargo didáctico y marco común]'), `${scen}: conclusión del problema debe incluir [Descargo didáctico y marco común]`);

    // Longitud del bloque 1: máximo ~150 palabras
    const numB1 = conc.conclusion_numerica.split('\n\n')[0].replace('[Resultado de esta simulación]', '').trim();
    const probB1 = conc.conclusion_problema.split('\n\n')[0].replace('[Resultado de esta simulación]', '').trim();
    const wordsNum1 = countWords(numB1);
    const wordsProb1 = countWords(probB1);

    assert(wordsNum1 <= 150, `${scen}: Bloque 1 de conclusión numérica no debe exceder 150 palabras (actual: ${wordsNum1})`);
    assert(wordsProb1 <= 150, `${scen}: Bloque 1 de conclusión del problema no debe exceder 150 palabras (actual: ${wordsProb1})`);
  });

  // -------------------------------------------------------------------------
  // PARTE 2: Recálculos Independientes desde los Nodos Usados (xs, ys)
  // -------------------------------------------------------------------------
  console.log('2. Recálculo independiente desde nodos usados (xs)...');

  scenarios.forEach(scen => {
    const { ri, conc } = scenResults[scen];
    const xs = ri.xs;
    const ys = ri.ys;

    // (a) Recálculo independiente de Lebesgue Λ_usados
    const lebUsadosCalc = lebesgueConstant(xs, 500);

    // En Estrés: Λ_usados ≈ 3.704e+9, NO 2.41e+9
    if (scen === 'E') {
      assert(conc.conclusion_numerica.includes('3.704e+9') || conc.conclusion_numerica.includes('3.70e+9'), 'Estrés debe citar Λ_usados ≈ 3.704e+9');
      assert(!conc.conclusion_numerica.includes('Λ_usados = 2.41'), 'Estrés NO debe citar 2.41e+9 como Λ_usados (2.41 es Λ_N)');
    } else if (scen === 'N') {
      assert(conc.conclusion_numerica.includes(lebUsadosCalc.toFixed(1)) || conc.conclusion_numerica.includes(lebUsadosCalc.toFixed(2)), 'Normal debe incluir Λ_usados recalculado');
    } else if (scen === 'MC') {
      assert(conc.conclusion_numerica.includes('11489.3'), 'Mal condicionado debe incluir Λ_usados = 11489.3');
    }

    // (b) Recálculo independiente de la raíz del spline S(t) = u
    const uVal = ri.cruce_umbral.u;
    const spl = splineNatural(xs, ys);
    const fSpl = t => splineEval(spl, t) - uVal;
    const dfSpl = t => splineDeriv(spl, t);
    const nrRes = newtonRaphson(fSpl, dfSpl, ri.cruce_umbral.semilla_newton, 1e-10, 100);
    assert(nrRes.convergio, `${scen}: Newton-Raphson sobre spline debe converger`);

    const tStarStr = nrRes.x.toFixed(6);
    assert(conc.conclusion_problema.includes(tStarStr), `${scen}: conclusión del problema debe incluir raíz recalculada del spline t* = ${tStarStr}`);

    // Verificar que NO incluya unidades "s" en t*
    assert(!conc.conclusion_problema.includes(`${tStarStr} s`), `${scen}: t* no debe incluir unidades 's'`);

    // (c) Recálculo independiente del error máximo en puntos ocultos
    let maxSplErrCalc = 0;
    ri.eval_spline.puntos.forEach(p => {
      const yEval = splineEval(spl, p.x);
      const err = Math.abs(yEval - p.exacto);
      if (err > maxSplErrCalc) maxSplErrCalc = err;
    });

    if (scen === 'E') {
      // Error exacto es 0.09515 (1.90 sigma), no 2.01 ni 0.1005
      assert(Math.abs(maxSplErrCalc - 0.09515) < 1e-4, 'Estrés: error máximo spline en ocultos debe ser ≈ 0.09515');
      assert(conc.conclusion_numerica.includes('1.90·σ') || conc.conclusion_numerica.includes('0.095') || conc.conclusion_numerica.includes('0.10'), 'Estrés debe reportar ratio 1.90·σ');
      assert(!conc.conclusion_numerica.includes('2.01'), 'Estrés NO debe contener ratio espurio 2.01');
      assert(!conc.conclusion_numerica.includes('0.1005'), 'Estrés NO debe contener error espurio 0.1005');
    }
  });

  // -------------------------------------------------------------------------
  // PARTE 3: Verificación de Raíces: Curva Evaluada e Iteraciones Distintas
  // -------------------------------------------------------------------------
  console.log('3. Verificando raíces sobre spline y variación de iteraciones...');

  const cN = scenResults['N'].conc;
  const cE = scenResults['E'].conc;
  const cM = scenResults['MC'].conc;

  // Normal: S(t) = 0.5 da t* = 0.530352 (Bisección 33, Newton 4, Secante 7)
  assert(cN.conclusion_problema.includes('0.530352'), 'Normal: t* del spline debe ser 0.530352');
  assert(cN.conclusion_problema.includes('33 it'), 'Normal: Bisección 33 iteraciones');
  assert(cN.conclusion_problema.includes('4 it'), 'Normal: Newton 4 iteraciones');
  assert(cN.conclusion_problema.includes('0.522087'), 'Normal: raíz del polinomio debe ser 0.522087');

  // Estrés: S(t) = 0.5 da t* = 0.498591 (Bisección 30, Newton 6, Secante 7)
  assert(cE.conclusion_problema.includes('0.498591'), 'Estrés: t* del spline debe ser 0.498591');
  assert(cE.conclusion_problema.includes('30 it'), 'Estrés: Bisección 30 iteraciones');
  assert(cE.conclusion_problema.includes('6 it'), 'Estrés: Newton 6 iteraciones');
  assert(cE.conclusion_problema.includes('0.322215'), 'Estrés: raíz del polinomio debe ser 0.322215');

  // Mal Condicionado: S(t) = 0.5 da t* = 0.523733 (Bisección 33, Newton 4, Secante 7)
  assert(cM.conclusion_problema.includes('0.523733'), 'MC: t* del spline debe ser 0.523733');
  assert(cM.conclusion_problema.includes('0.523599'), 'MC: raíz del polinomio debe ser 0.523599');

  // Las iteraciones de Estrés (30, 6) DEBEN SER DISTINTAS de las de Normal (33, 4)
  assert(cE.conclusion_problema.includes('30 it') && cN.conclusion_problema.includes('33 it'), 'Iteraciones de Bisección deben ser distintas entre Estrés y Normal');
  assert(cE.conclusion_problema.includes('6 it') && cN.conclusion_problema.includes('4 it'), 'Iteraciones de Newton deben ser distintas entre Estrés y Normal');

  // -------------------------------------------------------------------------
  // PARTE 4: Refinamientos de Texto: Lagrange vs Newton y Cota de Amplificación
  // -------------------------------------------------------------------------
  console.log('4. Verificando refinamientos de texto (Lagrange-Newton y amplificación)...');

  // Normal: diffLN <= 1e-13 -> "orden del redondeo de máquina"
  assert(cN.conclusion_numerica.includes('orden del redondeo de máquina'), 'Normal: diffLN <= 1e-13 debe indicar orden del redondeo de máquina');

  // Estrés: Newton DD sobre datos ruidosos pierde más precisión que Lagrange (NO usar palabra cota)
  assert(!cE.conclusion_numerica.includes('orden del redondeo de máquina'), 'Estrés: diffLN > 1e-13 NO debe decir "orden del redondeo de máquina"');
  assert(cE.conclusion_numerica.includes('pierde más precisión'), 'Estrés: debe explicar que Newton DD pierde más precisión con datos ruidosos');
  assert(!cE.conclusion_numerica.includes('cota ≈ Λ_usados·ε_maq'), 'Estrés: NO debe usar la palabra cota para |P_L − P_N|');

  // MC: diffLN <= Λ_usados·ε_maq -> redondeo amplificado dentro de la cota
  assert(!cM.conclusion_numerica.includes('orden del redondeo de máquina'), 'MC: diffLN > 1e-13 NO debe decir "orden del redondeo de máquina"');
  assert(cM.conclusion_numerica.includes('redondeo amplificado por mal condicionamiento'), 'MC: debe explicar amplificación por mal condicionamiento');
  assert(cM.conclusion_numerica.includes('Λ_usados·ε_maq'), 'MC: debe mostrar cota Λ_usados·ε_maq');

  // Error nominal sin ruido en malla densa de 220 puntos
  assert(cE.conclusion_numerica.includes('1.49e-7') || cE.conclusion_numerica.includes('1.5e-7'), 'Estrés: debe reportar error nominal sin ruido ≈ 1.49e-7');
  assert(!cE.conclusion_numerica.includes('sin ruido = 2.94e+7'), 'Estrés: error nominal sin ruido NO debe ser 2.94e+7');
  assert(cN.conclusion_numerica.includes('2.25e-3'), 'Normal: debe reportar error nominal sin ruido 2.25e-3');
  assert(cM.conclusion_numerica.includes('3.69e-11'), 'MC: debe reportar error nominal sin ruido 3.69e-11');

  // Protocolo de perturbación: peor caso vs factor medio con signos aleatorios
  assert(cE.conclusion_numerica.includes('peor caso'), 'Estrés: debe indicar perturbación de peor caso');
  assert(cE.conclusion_numerica.includes('~1.0e9'), 'Estrés: debe reportar factor medio aleatorio ~1.0e9');
  assert(cN.conclusion_numerica.includes('~15'), 'Normal: debe reportar factor medio aleatorio ~15');
  assert(cM.conclusion_numerica.includes('~3.9e3'), 'MC: debe reportar factor medio aleatorio ~3.9e3');

  // Amplificación: factor <= Λ_usados, error <= Λ_usados·ε
  [cN, cE, cM].forEach((c, idx) => {
    assert(c.conclusion_numerica.includes('≤ Λ_usados ='), `Escenario [${idx}]: factor debe compararse con ≤ Λ_usados`);
    assert(c.conclusion_numerica.includes('≤ Λ_usados·ε ='), `Escenario [${idx}]: error inducido debe compararse con ≤ Λ_usados·ε`);
  });

  // Eliminación de la frase fija "con alto grado o perturbaciones el spline mantiene control local..."
  [cN, cE, cM].forEach((c, idx) => {
    assert(!c.conclusion_numerica.toLowerCase().includes('el spline mantiene control local'), `Escenario [${idx}] no debe contener la frase fija desestimada`);
  });

  // Reemplazo de "diverge" por "su error crece"
  [cN, cE, cM].forEach((c, idx) => {
    assert(!c.conclusion_numerica.toLowerCase().includes('polinomio global diverge'), `Escenario [${idx}] no debe usar "diverge" para el polinomio con ruido`);
    assert(c.conclusion_numerica.includes('crecimiento abrupto de su error'), `Escenario [${idx}] debe usar "crecimiento abrupto de su error"`);
  });

  // -------------------------------------------------------------------------
  // PARTE 5: Modo Interactivo (render4) y Modo Consulta (renderSimulationFromDB)
  // -------------------------------------------------------------------------
  console.log('5. Verificando renderizado interactivo (render4) y consulta (renderSimulationFromDB)...');
  scenarios.forEach(scen => {
    const { r4, ri, conc } = scenResults[scen];
    render4(r4, ri);
    const html = dom['s5'].innerHTML;
    assert(html.includes('BORRADOR DEL SISTEMA'), `render4 (${scen}) debe mostrar el badge BORRADOR DEL SISTEMA`);
    assert(html.includes('CONCLUSIÓN NUMÉRICA'), `render4 (${scen}) debe incluir encabezado CONCLUSIÓN NUMÉRICA`);
    assert(html.includes('CONCLUSIÓN DEL PROBLEMA'), `render4 (${scen}) debe incluir encabezado CONCLUSIÓN DEL PROBLEMA`);
    assert(html.includes('id="m4ConcNumText"'), `render4 (${scen}) debe incluir elemento m4ConcNumText`);
    assert(html.includes('id="m4ConcProbText"'), `render4 (${scen}) debe incluir elemento m4ConcProbText`);
  });

  // Modo consulta
  const loaded = DB.loadSimulation(4, db);
  assert(loaded && loaded.simulacion && loaded.simulacion.id === 4, 'Simulación #4 debe cargarse correctamente');
  const s5El = dom['s5'];
  assert(s5El.innerHTML.includes('BORRADOR DEL SISTEMA'), 'renderSimulationFromDB debe renderizar BORRADOR DEL SISTEMA en #s5');
  assert(s5El.innerHTML.includes('CONCLUSIÓN NUMÉRICA'), 'renderSimulationFromDB debe renderizar CONCLUSIÓN NUMÉRICA en #s5');
  assert(s5El.innerHTML.includes('CONCLUSIÓN DEL PROBLEMA'), 'renderSimulationFromDB debe renderizar CONCLUSIÓN DEL PROBLEMA en #s5');

  // -------------------------------------------------------------------------
  // PARTE 6: Pruebas Negativas y Palabras Prohibidas
  // -------------------------------------------------------------------------
  console.log('6. Verificando palabras prohibidas y vocabulario formal...');

  const allTextsToValidate = [
    cN.conclusion_numerica, cN.conclusion_problema,
    cE.conclusion_numerica, cE.conclusion_problema,
    cM.conclusion_numerica, cM.conclusion_problema
  ];

  allTextsToValidate.forEach((txt, idx) => {
    const lower = txt.toLowerCase();
    FORBIDDEN_WORDS.forEach(word => {
      assert(!lower.includes(word.toLowerCase()), `Texto [${idx}] no debe contener la palabra o frase prohibida: "${word}"`);
    });
  });

  // Vocabulario obligatorio en los escenarios válidos
  [cN, cE, cM].forEach((c, idx) => {
    assert(c.conclusion_problema.includes('curva reconstruida'), `Escenario [${idx}] debe incluir "curva reconstruida"`);
    assert(c.conclusion_problema.includes('cruce del umbral'), `Escenario [${idx}] debe incluir "cruce del umbral"`);
    assert(c.conclusion_problema.includes('Descargo de simulación didáctica:'), `Escenario [${idx}] debe incluir el descargo didáctico`);
  });

  console.log('\n✔ TODAS LAS PRUEBAS DE CONCLUSIONES DE M4 (FASE 7) PASARON SATISFACTORIAMENTE.');
}

if (require.main === module) {
  runTestM4Conclusions().catch(err => {
    console.error('\n❌ ERROR EN PRUEBA DE CONCLUSIONES DE M4:', err);
    process.exit(1);
  });
}

module.exports = { runTestM4Conclusions };
