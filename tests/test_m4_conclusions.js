/**
 * SIMTELE-RISK · Test de Conclusiones de Interpretación del Módulo 4 (Fase 7)
 * 
 * Verifica:
 *  1. Existencia de dos textos claramente separados: Conclusión Numérica y Conclusión del Problema.
 *  2. Generación en los tres escenarios (Normal, Estrés, Mal Condicionado) tanto en modo interactivo
 *     (render4) como en modo consulta (renderSimulationFromDB desde SQLite).
 *  3. Variación de los textos según los datos reales de cada escenario (no textos fijos).
 *  4. Coincidencia con al menos 5 números guardados por escenario.
 *  5. Pruebas negativas: datos faltantes omiten oraciones limpiamente sin "undefined" ni "NaN".
 *  6. Ausencia estricta de palabras prohibidas y cifras descartadas (Regla 10).
 *  7. Presencia de vocabulario obligatorio ('curva reconstruida', 'cruce del umbral') y descargo didáctico (Regla 11).
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');
const DB = require('../js/db.js');
const Mapper = require('../js/mapper.js');
const { mod4, modInterp, PRE, render4, chart, ds, tbl } = require('../js/app.js');

function assert(cond, msg) {
  if (!cond) {
    console.error(`[AssertionError] ${msg}`);
    throw new Error(msg);
  }
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
  // PARTE 1: Verificación de función Mapper.buildM4Conclusions
  // -------------------------------------------------------------------------
  console.log('1. Verificando Mapper.buildM4Conclusions...');
  assert(typeof Mapper.buildM4Conclusions === 'function', 'Mapper.buildM4Conclusions debe estar exportado');

  // Generar conclusiones para los tres escenarios
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

  // -------------------------------------------------------------------------
  // PARTE 2: Verificación de textos no vacíos y distintos entre escenarios
  // -------------------------------------------------------------------------
  console.log('2. Verificando variación de conclusiones por escenario...');
  scenarios.forEach(scen => {
    const { conc } = scenResults[scen];
    assert(conc.conclusion_numerica && conc.conclusion_numerica.length > 50, `Conclusión numérica en ${scen} no debe estar vacía`);
    assert(conc.conclusion_problema && conc.conclusion_problema.length > 50, `Conclusión del problema en ${scen} no debe estar vacía`);
  });

  const cN = scenResults['N'].conc;
  const cE = scenResults['E'].conc;
  const cM = scenResults['MC'].conc;

  assert(cN.conclusion_numerica !== cE.conclusion_numerica, 'Conclusiones numéricas N y E deben ser distintas');
  assert(cE.conclusion_numerica !== cM.conclusion_numerica, 'Conclusiones numéricas E y MC deben ser distintas');
  assert(cN.conclusion_problema !== cE.conclusion_problema, 'Conclusiones del problema N y E deben ser distintas');
  assert(cE.conclusion_problema !== cM.conclusion_problema, 'Conclusiones del problema E y MC deben ser distintas');

  // -------------------------------------------------------------------------
  // PARTE 3: Coincidencia con al menos 5 números guardados por escenario
  // -------------------------------------------------------------------------
  console.log('3. Verificando coincidencia con al menos 5 números por escenario...');

  function countMatchingNumbers(text, numbers) {
    let matched = 0;
    numbers.forEach(num => {
      if (text.includes(String(num))) matched++;
    });
    return matched;
  }

  // Normal: n=5 usados, k=3 ocultos, sigma=0, Lebesgue N=8, etc.
  const rNorm = scenResults['N'].ri;
  const normNumbers = [
    rNorm.n, // 5
    rNorm.k, // 3
    '0', // sigma = 0
    rNorm.subexp_lebesgue ? Number(rNorm.subexp_lebesgue.lebesgue_equi).toFixed(1) : '—', // 6.9
    rNorm.subexp_lebesgue ? Number(rNorm.subexp_lebesgue.lebesgue_cheb).toFixed(2) : '—', // 2.20
    '2000', // malla 2000 puntos
    '220' // malla 220 puntos
  ];
  const combinedNorm = cN.conclusion_numerica + ' ' + cN.conclusion_problema;
  const matchedNorm = countMatchingNumbers(combinedNorm, normNumbers);
  assert(matchedNorm >= 5, `Normal debe contener al menos 5 números coincidentes con datos (encontrados ${matchedNorm})`);

  // Estrés: n=37 usados, sigma=0.05, semilla=2026, n_total=40, etc.
  const rEstr = scenResults['E'].ri;
  const estrNumbers = [
    rEstr.n, // 37
    rEstr.k, // 3
    '0.05', // sigma
    '2026', // semilla
    rEstr.allNodes.length, // 40
    '220' // malla 220
  ];
  const combinedEstr = cE.conclusion_numerica + ' ' + cE.conclusion_problema;
  const matchedEstr = countMatchingNumbers(combinedEstr, estrNumbers);
  assert(matchedEstr >= 5, `Estrés debe contener al menos 5 números coincidentes con datos (encontrados ${matchedEstr})`);

  // Mal Condicionado: n=18 usados, k=3, n_total=21, etc.
  const rMal = scenResults['MC'].ri;
  const malNumbers = [
    rMal.n, // 18
    rMal.k, // 3
    '0', // sigma
    rMal.allNodes.length, // 21
    rMal.subexp_lebesgue ? Number(rMal.subexp_lebesgue.lebesgue_equi).toFixed(1) : '—',
    '220'
  ];
  const combinedMal = cM.conclusion_numerica + ' ' + cM.conclusion_problema;
  const matchedMal = countMatchingNumbers(combinedMal, malNumbers);
  assert(matchedMal >= 5, `Mal condicionado debe contener al menos 5 números coincidentes con datos (encontrados ${matchedMal})`);

  // -------------------------------------------------------------------------
  // PARTE 4: Modo Interactivo (render4)
  // -------------------------------------------------------------------------
  console.log('4. Verificando renderizado interactivo (render4)...');
  scenarios.forEach(scen => {
    const { r4, ri, conc } = scenResults[scen];
    render4(r4, ri);
    const html = dom['s5'].innerHTML;
    assert(html.includes('BORRADOR DEL SISTEMA'), `render4 (${scen}) debe mostrar el badge BORRADOR DEL SISTEMA`);
    assert(html.includes('CONCLUSIÓN NUMÉRICA'), `render4 (${scen}) debe incluir encabezado CONCLUSIÓN NUMÉRICA`);
    assert(html.includes('CONCLUSIÓN DEL PROBLEMA'), `render4 (${scen}) debe incluir encabezado CONCLUSIÓN DEL PROBLEMA`);
    assert(html.includes('id="m4ConcNumText"'), `render4 (${scen}) debe incluir elemento m4ConcNumText`);
    assert(html.includes('id="m4ConcProbText"'), `render4 (${scen}) debe incluir elemento m4ConcProbText`);
    assert(html.includes(conc.conclusion_numerica), `render4 (${scen}) debe incluir el texto de conclusión numérica`);
    assert(html.includes(conc.conclusion_problema), `render4 (${scen}) debe incluir el texto de conclusión del problema`);
  });

  // -------------------------------------------------------------------------
  // PARTE 5: Modo Consulta (renderSimulationFromDB desde SQLite)
  // -------------------------------------------------------------------------
  console.log('5. Verificando renderizado en modo consulta (renderSimulationFromDB)...');
  // Usar la simulación #4 existente en db/seed.sql (M4 Normal)
  const loaded = DB.loadSimulation(4, db);
  assert(loaded && loaded.simulacion && loaded.simulacion.id === 4, 'Simulación #4 debe cargarse correctamente');

  const s5El = dom['s5'];
  assert(s5El.innerHTML.includes('BORRADOR DEL SISTEMA'), 'renderSimulationFromDB debe renderizar BORRADOR DEL SISTEMA en #s5');
  assert(s5El.innerHTML.includes('CONCLUSIÓN NUMÉRICA'), 'renderSimulationFromDB debe renderizar CONCLUSIÓN NUMÉRICA en #s5');
  assert(s5El.innerHTML.includes('CONCLUSIÓN DEL PROBLEMA'), 'renderSimulationFromDB debe renderizar CONCLUSIÓN DEL PROBLEMA en #s5');
  assert(s5El.innerHTML.includes('id="m4ConcNumText"'), 'renderSimulationFromDB debe incluir id="m4ConcNumText"');
  assert(s5El.innerHTML.includes('id="m4ConcProbText"'), 'renderSimulationFromDB debe incluir id="m4ConcProbText"');

  // Verificar que también se alimentó concNum y concProb
  assert(dom['concNum'].innerHTML.includes('Spline') || dom['concNum'].innerHTML.includes('puntos ocultos'), 'concNum debe incluir conclusión numérica de M4');
  assert(dom['concProb'].innerHTML.includes('curva reconstruida'), 'concProb debe incluir conclusión del problema de M4 con vocabulario formal');

  // -------------------------------------------------------------------------
  // PARTE 6: Pruebas Negativas (Datos Faltantes)
  // -------------------------------------------------------------------------
  console.log('6. Ejecutando pruebas negativas con datos omitidos...');

  // Caso 6.1: subexp_lebesgue es null
  const riSinLeb = { ...rNorm, subexp_lebesgue: null };
  const cSinLeb = Mapper.buildM4Conclusions(riSinLeb);
  assert(!cSinLeb.conclusion_numerica.includes('Distinción conceptual:'), 'Sin subexp_lebesgue no debe emitir texto de Lebesgue');
  assert(!cSinLeb.conclusion_numerica.includes('undefined'), 'Sin subexp_lebesgue no debe contener "undefined"');
  assert(!cSinLeb.conclusion_numerica.includes('NaN'), 'Sin subexp_lebesgue no debe contener "NaN"');

  // Caso 6.2: sweep es null
  const riSinSweep = { ...rNorm, sweep: null };
  const cSinSweep = Mapper.buildM4Conclusions(riSinSweep);
  assert(!cSinSweep.conclusion_numerica.includes('Órdenes locales de convergencia'), 'Sin sweep no debe emitir órdenes locales');
  assert(!cSinSweep.conclusion_numerica.includes('undefined'), 'Sin sweep no debe contener "undefined"');
  assert(!cSinSweep.conclusion_numerica.includes('NaN'), 'Sin sweep no debe contener "NaN"');

  // Caso 6.3: cruce_umbral es null
  const riSinCruce = { ...rNorm, cruce_umbral: null };
  const cSinCruce = Mapper.buildM4Conclusions(riSinCruce);
  assert(!cSinCruce.conclusion_problema.includes('Newton-Raphson:'), 'Sin cruce_umbral no debe emitir iteraciones de raíces');
  assert(!cSinCruce.conclusion_problema.includes('undefined'), 'Sin cruce_umbral no debe contener "undefined"');
  assert(!cSinCruce.conclusion_problema.includes('NaN'), 'Sin cruce_umbral no debe contener "NaN"');

  // Caso 6.4: Objeto vacío {}
  const cVacio = Mapper.buildM4Conclusions({});
  assert(typeof cVacio.conclusion_numerica === 'string', 'Con ri vacío debe retornar string');
  assert(typeof cVacio.conclusion_problema === 'string', 'Con ri vacío debe retornar string');
  assert(!cVacio.conclusion_numerica.includes('undefined'), 'Con ri vacío no debe contener "undefined"');
  assert(!cVacio.conclusion_numerica.includes('NaN'), 'Con ri vacío no debe contener "NaN"');
  assert(!cVacio.conclusion_problema.includes('undefined'), 'Con ri vacío no debe contener "undefined"');
  assert(!cVacio.conclusion_problema.includes('NaN'), 'Con ri vacío no debe contener "NaN"');

  // Caso 6.5: ri es null
  const cNull = Mapper.buildM4Conclusions(null);
  assert(cNull.conclusion_numerica === '', 'Con null debe retornar string vacío');
  assert(cNull.conclusion_problema === '', 'Con null debe retornar string vacío');

  // -------------------------------------------------------------------------
  // PARTE 7: Palabras Prohibidas y Vocabulario Requerido
  // -------------------------------------------------------------------------
  console.log('7. Verificando palabras prohibidas y vocabulario formal...');

  const allTextsToValidate = [
    cN.conclusion_numerica, cN.conclusion_problema,
    cE.conclusion_numerica, cE.conclusion_problema,
    cM.conclusion_numerica, cM.conclusion_problema,
    cSinLeb.conclusion_numerica, cSinLeb.conclusion_problema,
    cSinSweep.conclusion_numerica, cSinSweep.conclusion_problema,
    cSinCruce.conclusion_numerica, cSinCruce.conclusion_problema,
    cVacio.conclusion_numerica, cVacio.conclusion_problema
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
