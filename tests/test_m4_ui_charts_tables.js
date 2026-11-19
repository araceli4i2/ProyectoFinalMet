/**
 * SIMTELE-RISK · Test de Interfaz, Gráficos y Tablas del Módulo 4 (Fase 6)
 * 
 * Verifica que en los tres escenarios (Normal, Estrés, Mal Condicionado):
 *  1. Gráfico 1 (c9): solución superpuesta, eje y acotado [-2.5, 2.5] y aviso en Estrés.
 *  2. Gráfico 2 (c13): error por punto oculto y método con escala logarítmica opcional.
 *  3. Gráfico 3 (c12): barrido de convergencia con n < 8 marcado como submuestreado (no válido).
 *  4. Tablas: diferencias divididas de Newton (triangular), error por punto oculto y método,
 *     iteraciones del cruce de umbral (bisección/Newton/secante) y comparativa de escenarios.
 *  5. Modo Consulta (Abrir): todo se renderiza desde SQLite (serie_grafico e iteracion_resultado)
 *     sin recalcular el motor numérico.
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');
const DB = require('../js/db.js');
const Mapper = require('../js/mapper.js');
const { mod4, modInterp, PRE, render4, chart, ds, tbl, toggleM4ErrorScale } = require('../js/app.js');

function assert(cond, msg) {
  if (!cond) {
    console.error(`[AssertionError] ${msg}`);
    throw new Error(msg);
  }
}

async function runTestM4UI() {
  console.log('=== TEST DE INTERFAZ, GRÁFICOS Y TABLAS DE M4 (FASE 6) ===\n');

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
    'c8', 'c9', 'c12', 'c13',
    'k4', 't4', 't5', 't5_dd', 't5_ocultos', 't5_raices', 't5_escenarios',
    's5', 'c9Note', 'queryModeBanner', 'queryBannerNotice', 'querySimId',
    'kpis', 'k1', 'k2', 'k3', 's1', 's2', 's3', 'concNum', 'concProb'
  ];
  mockElements.forEach(id => {
    dom[id] = { id, innerHTML: '', style: { display: 'none' }, textContent: '', closest: () => null };
  });
  dom['m4ErrorLogScale'] = { id: 'm4ErrorLogScale', checked: false, style: {} };

  const chartsDrawn = {};

  global.Chart = class Chart {
    constructor(el, cfg) {
      this.el = el;
      this.cfg = cfg;
      chartsDrawn[el.id] = {
        id: el.id,
        type: cfg.type,
        datasets: cfg.data.datasets,
        xl: cfg.options?.scales?.x?.title?.text,
        yl: cfg.options?.scales?.y?.title?.text,
        options: {
          yMin: cfg.options?.scales?.y?.min,
          yMax: cfg.options?.scales?.y?.max,
          yType: cfg.options?.scales?.y?.type
        }
      };
    }
    destroy() {}
  };

  global.document = {
    getElementById: id => dom[id] || null,
    querySelectorAll: () => []
  };

  global.window = {
    fmt: (x, d=2) => (x == null ? '—' : Number(x).toFixed(d)),
    sci: (x, d=2) => (x == null ? '—' : Number(x).toExponential(d)),
    pill: (cls, txt) => `<span class="pill ${cls}">${txt}</span>`,
    kpi: (t, v, s) => `<div class="kpi">${t}:${v}</div>`,
    ds: (label, data, color, o={}) => ({ label, data, borderColor: color, ...o }),
    tbl: (h, rows) => '<table><thead><tr>' + h.map(x => '<th>' + x + '</th>').join('') + '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>',
    chart: (id, type, datasets, xl, yl, o={}) => {
      chartsDrawn[id] = { id, type, datasets, xl, yl, options: o };
    },
    C: { O: '#ff7a00', O2: '#ffa53d', W: '#f4f4f4', Y: '#ffd166', R: '#ff3b3b', G: '#7ee787', GR: '#9a9a9a' },
    uiAlert: () => {},
    recalcAll: () => { dom.recalcCalled = true; },
    Mapper
  };
  global.$ = id => dom[id] || null;

  // -------------------------------------------------------------------------
  // PARTE 1: Modo Interactivo (render4) en los tres escenarios
  // -------------------------------------------------------------------------
  console.log('1. Probando modo interactivo (render4) en los tres escenarios...');

  const escenarios = [
    { nombre: 'NORMAL', presetKey: 'N', p4: PRE.N.m4, pi: PRE.N.mi },
    { nombre: 'ESTRES', presetKey: 'E', p4: PRE.E.m4, pi: PRE.E.mi },
    { nombre: 'MAL_CONDICIONADO', presetKey: 'MC', p4: PRE.MC.m4, pi: PRE.MC.mi }
  ];

  for (const sc of escenarios) {
    console.log(`\n   --- Verificando Escenario ${sc.nombre} (Interactivo) ---`);
    const r4 = mod4(sc.p4);
    const ri = modInterp(sc.pi);
    ri.escenario = sc.nombre;

    render4(r4, ri);

    // Gráfico 1: c9
    assert(chartsDrawn['c9'], `c9 debe haberse dibujado en ${sc.nombre}`);
    assert(chartsDrawn['c9'].datasets.length >= 5, `c9 debe tener al menos 5 datasets en ${sc.nombre}`);
    const dsEx = chartsDrawn['c9'].datasets.find(d => d.label.includes('exacta'));
    const dsLag = chartsDrawn['c9'].datasets.find(d => d.label.includes('Lagrange'));
    const dsSpl = chartsDrawn['c9'].datasets.find(d => d.label.includes('Spline'));
    const dsNod = chartsDrawn['c9'].datasets.find(d => d.label.includes('Nodos usados'));
    const dsOcu = chartsDrawn['c9'].datasets.find(d => d.label.includes('Puntos ocultos'));
    assert(dsEx && dsEx.data.length > 0, 'c9 debe incluir f(t) exacta');
    assert(dsLag && dsLag.data.length > 0, 'c9 debe incluir Lagrange');
    assert(dsSpl && dsSpl.data.length > 0, 'c9 debe incluir Spline natural');
    assert(dsNod && dsNod.data.length > 0, 'c9 debe incluir nodos usados');
    assert(dsOcu && dsOcu.data.length > 0, 'c9 debe incluir puntos ocultos');

    if (sc.nombre === 'ESTRES') {
      assert(chartsDrawn['c9'].options.yMin === -2.5 && chartsDrawn['c9'].options.yMax === 2.5,
        'En Estrés, el eje y de c9 debe estar limitado a [-2.5, 2.5]');
      assert(dom['c9Note'].style.display === 'block', 'En Estrés, el aviso c9Note debe mostrarse (display: block)');
      assert(dom['c9Note'].innerHTML.includes('Eje vertical limitado a [-2.5, 2.5]'), 'c9Note debe explicar el límite del eje y');
      console.log('      ✔ c9 acotado a [-2.5, 2.5] y nota visible de mal condicionamiento en Estrés.');
    } else {
      assert(dom['c9Note'].style.display === 'none', `En ${sc.nombre}, c9Note debe estar oculto`);
    }

    // Gráfico 2: c13 (Error por punto oculto)
    assert(chartsDrawn['c13'], `c13 debe haberse dibujado en ${sc.nombre}`);
    assert(chartsDrawn['c13'].datasets.length === 3, 'c13 debe tener datasets para Spline, Lagrange y Newton');
    chartsDrawn['c13'].datasets.forEach(d => {
      assert(d.data.length === ri.k, `c13 [${d.label}] debe tener ${ri.k} puntos ocultos`);
    });
    console.log(`      ✔ c13 contiene errores por punto oculto (k=${ri.k}) para los 3 métodos.`);

    // Gráfico 3: c12 (Barrido)
    assert(chartsDrawn['c12'], `c12 debe haberse dibujado en ${sc.nombre}`);
    const dsSub = chartsDrawn['c12'].datasets.find(d => d.label.includes('Submuestreado'));
    assert(dsSub, 'c12 debe incluir dataset diferenciado para submuestreo n < 8 (no válido)');
    assert(dsSub.data.every(p => p.x < 8), 'Todos los puntos de Submuestreado deben tener n < 8');
    const dsValLag = chartsDrawn['c12'].datasets.find(d => d.label.includes('n ≥ 8'));
    assert(dsValLag && dsValLag.data.every(p => p.x >= 8), 'Series normales de c12 deben conectar n ≥ 8');
    console.log('      ✔ c12 separa rango válido n ≥ 8 y marca n=4, 6 como submuestreados.');

    // Tablas
    assert(dom['t5'].innerHTML.includes('<table'), `t5 debe tener tabla en ${sc.nombre}`);
    assert(dom['t5_dd'].innerHTML.includes('<table') && dom['t5_dd'].innerHTML.includes('cₖ'),
      `t5_dd debe contener tabla triangular y coeficientes cₖ en ${sc.nombre}`);
    assert(dom['t5_ocultos'].innerHTML.includes('<table') && dom['t5_ocultos'].innerHTML.includes('Punto oculto'),
      `t5_ocultos debe contener tabla de puntos ocultos en ${sc.nombre}`);
    assert(dom['t5_raices'].innerHTML.includes('<table') && dom['t5_raices'].innerHTML.includes('Bisección') && dom['t5_raices'].innerHTML.includes('Newton-Raphson'),
      `t5_raices debe contener tabla de métodos de raíces en ${sc.nombre}`);
    const labelExpected = sc.nombre === 'ESTRES' ? 'ESTRÉS' : sc.nombre.replace('_', ' ');
    assert(dom['t5_escenarios'].innerHTML.includes('<table') && dom['t5_escenarios'].innerHTML.includes(`${labelExpected} (Activo)`),
      `t5_escenarios debe resaltar el escenario activo ${sc.nombre}`);
    console.log(`      ✔ Tablas t5, t5_dd, t5_ocultos, t5_raices y t5_escenarios renderizadas con datos.`);
  }

  // -------------------------------------------------------------------------
  // PARTE 2: Modo Consulta (Abrir desde SQLite) en los tres escenarios
  // -------------------------------------------------------------------------
  console.log('\n2. Probando Modo Consulta (Abrir desde SQLite) en los tres escenarios...');

  // Generar y persistir simulaciones para Estrés (caso 4, esc 11) y Mal Condicionado (caso 4, esc 12)
  console.log('   -> Guardando simulaciones en BD para Estrés (escenario #11) y Mal Condicionado (escenario #12)...');
  
  // Guardar simulación Estrés
  const pE = { m1: PRE.E.m1, m2: PRE.E.m2, m3: PRE.E.m3, m4: PRE.E.m4, mi: PRE.E.mi };
  const rE_r1 = global.window.mod1 ? global.window.mod1(pE.m1) : {};
  const rE_r2 = global.window.mod2 ? global.window.mod2(pE.m2) : {};
  const rE_r3 = global.window.mod3 ? global.window.mod3(pE.m3) : {};
  const rE_r4 = mod4(pE.m4);
  const rE_ri = modInterp(pE.mi);
  const simE_data = Mapper.buildAllExecutions(
    { r1: rE_r1, r2: rE_r2, r3: rE_r3, r4: rE_r4, ri: rE_ri, s1Rows: [], s2Rows: [], s3Rows: [], s4Rows: rE_r4.rows },
    pE, 'E'
  );
  const resE = await DB.saveSimulation({
    escenario: { id: 11, caso_id: 4, tipo: 'ESTRES' },
    simulacion: {
      fecha: '2026-11-19 10:00:00',
      usuario_equipo: 'Investigador UMSA - Test',
      estado: 'COMPLETADO'
    },
    ejecuciones: simE_data.filter(e => e.caso_id === 4)
  }, db);
  const simE_id = resE.simulacion_id;

  // Guardar simulación Mal Condicionado
  const pMC = { m1: PRE.MC.m1, m2: PRE.MC.m2, m3: PRE.MC.m3, m4: PRE.MC.m4, mi: PRE.MC.mi };
  const rMC_r4 = mod4(pMC.m4);
  const rMC_ri = modInterp(pMC.mi);
  const simMC_data = Mapper.buildAllExecutions(
    { r1: {}, r2: {}, r3: {}, r4: rMC_r4, ri: rMC_ri, s1Rows: [], s2Rows: [], s3Rows: [], s4Rows: rMC_r4.rows },
    pMC, 'MC'
  );
  const resMC = await DB.saveSimulation({
    escenario: { id: 12, caso_id: 4, tipo: 'MAL_CONDICIONADO' },
    simulacion: {
      fecha: '2026-11-19 10:05:00',
      usuario_equipo: 'Investigador UMSA - Test',
      estado: 'COMPLETADO'
    },
    ejecuciones: simMC_data.filter(e => e.caso_id === 4)
  }, db);
  const simMC_id = resMC.simulacion_id;

  console.log(`   -> Simulaciones creadas: Estrés ID=#${simE_id}, Mal Condicionado ID=#${simMC_id}.`);

  const simTests = [
    { simId: 4, nombre: 'NORMAL' },
    { simId: simE_id, nombre: 'ESTRES' },
    { simId: simMC_id, nombre: 'MAL_CONDICIONADO' }
  ];

  for (const st of simTests) {
    console.log(`\n   --- Verificando Consulta de Simulación #${st.simId} (${st.nombre}) ---`);
    dom.recalcCalled = false;
    delete chartsDrawn['c8'];
    delete chartsDrawn['c9'];
    delete chartsDrawn['c12'];
    delete chartsDrawn['c13'];

    const loaded = DB.loadSimulation(st.simId, db);
    assert(loaded !== null, `Simulación #${st.simId} debe cargarse con éxito`);
    assert(dom.recalcCalled !== true, 'ABRIR NO debe ejecutar recalcAll (cálculo reactivo deshabilitado)');
    assert(DB.getQueryMode() === true, 'Modo consulta debe estar activo');

    // Gráfico c8: Ajuste polinómico y muestras
    assert(chartsDrawn['c8'], `c8 debe redibujarse desde serie_grafico para #${st.simId}`);
    assert(chartsDrawn['c8'].datasets.length >= 2, 'c8 debe incluir datasets de muestras y ajuste');
    console.log(`      ✔ c8 redibujado desde serie_grafico (ajuste polinómico y muestras).`);

    // Gráfico 1: c9 desde serie_grafico
    assert(chartsDrawn['c9'], `c9 debe haberse redibujado desde serie_grafico para #${st.simId}`);
    assert(chartsDrawn['c9'].datasets.length >= 5, 'c9 en modo consulta debe tener sus datasets');
    if (st.nombre === 'ESTRES') {
      assert(chartsDrawn['c9'].options.yMin === -2.5 && chartsDrawn['c9'].options.yMax === 2.5,
        'En consulta Estrés, el eje y de c9 debe estar limitado a [-2.5, 2.5]');
      assert(dom['c9Note'].style.display === 'block', 'En consulta Estrés, c9Note debe mostrarse');
      console.log('      ✔ c9 acotado a [-2.5, 2.5] y c9Note visible leyendo de serie_grafico.');
    }

    // Gráfico 2: c13 desde serie_grafico (M4_error_por_punto)
    assert(chartsDrawn['c13'], `c13 debe redibujarse desde M4_error_por_punto para #${st.simId}`);
    assert(chartsDrawn['c13'].datasets.length >= 1, 'c13 debe tener datasets de error');
    console.log(`      ✔ c13 redibujado desde serie_grafico (${chartsDrawn['c13'].datasets.length} métodos).`);

    // Probar alternancia de escala logarítmica en c13 en modo consulta
    dom['m4ErrorLogScale'].checked = true;
    toggleM4ErrorScale();
    assert(chartsDrawn['c13'].options.yType === 'logarithmic', 'toggleM4ErrorScale debe conmutar a logarithmic');
    dom['m4ErrorLogScale'].checked = false;
    toggleM4ErrorScale();
    assert(chartsDrawn['c13'].options.yType === 'linear', 'toggleM4ErrorScale debe conmutar a linear');
    console.log('      ✔ Alternancia de escala logarítmica en c13 funciona en modo consulta.');

    // Gráfico 3: c12 desde serie_grafico
    assert(chartsDrawn['c12'], `c12 debe redibujarse desde M4_barrido_* para #${st.simId}`);
    const dsSub = chartsDrawn['c12'].datasets.find(d => d.label.includes('Submuestreado'));
    assert(dsSub && dsSub.data.length > 0, 'c12 debe marcar n < 8 como submuestreado');
    console.log('      ✔ c12 redibujado con separación de rango n ≥ 8 y puntos submuestreados.');

    // Tablas desde iteracion_resultado y resumen.valor_json
    assert(dom['t5'].innerHTML.includes('<table'), `t5 debe renderizarse en consulta para #${st.simId}`);
    assert(dom['t5_dd'].innerHTML.includes('<table'), `t5_dd debe renderizarse desde iteracion_resultado para #${st.simId}`);
    assert(dom['t5_ocultos'].innerHTML.includes('<table'), `t5_ocultos debe renderizarse para #${st.simId}`);
    assert(dom['t5_raices'].innerHTML.includes('<table') && dom['t5_raices'].innerHTML.includes('Bisección'),
      `t5_raices debe renderizarse desde ejecuciones de RAICES para #${st.simId}`);
    const labelExpected = st.nombre === 'ESTRES' ? 'ESTRÉS' : st.nombre.replace('_', ' ');
    assert(dom['t5_escenarios'].innerHTML.includes('<table') && dom['t5_escenarios'].innerHTML.includes(`${labelExpected} (Cargado)`),
      `t5_escenarios debe resaltar ${st.nombre} (Cargado)`);
    console.log('      ✔ Tablas t5, t5_dd, t5_ocultos, t5_raices y t5_escenarios reconstruidas sin recálculo.');
  }

  // Salir de modo consulta
  DB.exitQueryMode();
  assert(DB.getQueryMode() === false, 'Debe salir del modo consulta limpiamente');

  console.log('\n✅ TEST DE INTERFAZ, GRÁFICOS Y TABLAS DE M4 (FASE 6) COMPLETADO AL 100% CON ÉXITO.');
}

runTestM4UI().catch(err => {
  console.error('\n❌ ERROR EN EL TEST:', err);
  process.exit(1);
});
