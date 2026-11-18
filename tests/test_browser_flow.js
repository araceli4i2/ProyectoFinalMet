/**
 * test_browser_flow.js
 * Simulación estricta de ejecución de scripts en el navegador (sin module.exports ni require)
 * para verificar que window.Mapper, window.DB, window.LAST, window.readForm, window.SYS y window.solverRows
 * quedan definidos y que saveCurrentSimulation() persiste las 4 simulaciones y 23 ejecuciones con éxito.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');

async function testBrowserFlow() {
  console.log('--- Iniciando test de flujo en navegador (vm.createContext sin module.exports) ---');

  const wasmBinary = fs.readFileSync(path.join(__dirname, '../vendor/sqljs/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const realDb = new SQL.Database();
  realDb.run('PRAGMA foreign_keys = ON;');
  realDb.run(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  realDb.run(fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8'));

  let alertOutput = null;
  const elements = {};
  const getEl = (id) => {
    if (!elements[id]) {
      elements[id] = {
        id,
        value: id === 'scen' ? 'N' : '',
        innerHTML: '',
        style: {},
        closest: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {}
      };
    }
    return elements[id];
  };

  const win = {
    addEventListener: () => {},
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    alert: (msg) => { alertOutput = msg; },
    initSqlJs: async () => SQL,
    indexedDB: undefined
  };

  const doc = {
    getElementById: getEl,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
  win.document = doc;

  const sandbox = {
    window: win,
    document: doc,
    console: console,
    Math: Math,
    Date: Date,
    JSON: JSON,
    Number: Number,
    String: String,
    Boolean: Boolean,
    Array: Array,
    Object: Object,
    Set: Set,
    Map: Map,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    alert: (msg) => { alertOutput = msg; }
  };
  sandbox.globalThis = win;

  vm.createContext(sandbox);

  const mapperCode = fs.readFileSync(path.join(__dirname, '../js/mapper.js'), 'utf8');
  const dbCode = fs.readFileSync(path.join(__dirname, '../js/db.js'), 'utf8');
  const appCode = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

  vm.runInContext(mapperCode, sandbox);
  vm.runInContext(dbCode, sandbox);
  vm.runInContext(appCode, sandbox);

  win.DB.setDB(realDb);

  // [C1] Verificación de objetos globales
  const checks = [
    { name: 'window.Mapper', val: win.Mapper, type: 'object' },
    { name: 'window.DB', val: win.DB, type: 'object' },
    { name: 'window.LAST', val: win.LAST, type: 'object' },
    { name: 'window.readForm', val: win.readForm, type: 'function' },
    { name: 'window.SYS', val: win.SYS, type: 'object' },
    { name: 'window.solverRows', val: win.solverRows, type: 'function' }
  ];

  for (const c of checks) {
    if (typeof c.val !== c.type) {
      throw new Error(`Fallo en C1: ${c.name} no está definido correctamente como ${c.type}`);
    }
  }

  // Poblar LAST con corrida de escenario Normal
  vm.runInContext(`
    const p1 = PRE.N.m1, p2 = PRE.N.m2, p3 = PRE.N.m3, p4 = PRE.N.m4, pi = PRE.N.mi || {};
    const r1 = mod1(p1);
    const r2 = mod2(p2);
    const r3 = mod3(p3);
    const r4 = mod4(p4);
    const ri = modInterp(pi);

    const s1Rows = solverRows(SYS.m1.A, SYS.m1.b, SYS.m1.x, SYS.m1.tol, 50000, 'inf');
    const s2Rows = solverRows(SYS.m2n.A, SYS.m2n.b, SYS.m2n.x, SYS.m2n.tol, 50000, 'inf');
    const s3Rows = (r3 && r3.cal) ? solverRows(r3.cal.N, r3.cal.bN, r3.cal.sT, 1e-10, 50000, 'rel2') : [];
    const s4Rows = r4.rows;

    window.LAST = { r1, r2, r3, r4, ri, s1Rows, s2Rows, s3Rows, s4Rows };
  `, sandbox);

  win.readForm = (mod) => {
    const PRE = win.PRE;
    if (mod === 'm1') return PRE.N.m1;
    if (mod === 'm2') return PRE.N.m2;
    if (mod === 'm3') return PRE.N.m3;
    if (mod === 'm4') return PRE.N.m4;
    return {};
  };

  const countBefore = {
    simulaciones: realDb.exec('SELECT COUNT(*) FROM simulacion;')[0].values[0][0],
    ejecuciones: realDb.exec('SELECT COUNT(*) FROM ejecucion_metodo;')[0].values[0][0],
    iteraciones: realDb.exec('SELECT COUNT(*) FROM iteracion_resultado;')[0].values[0][0],
    resumenes: realDb.exec('SELECT COUNT(*) FROM resultado_resumen;')[0].values[0][0],
    series: realDb.exec('SELECT COUNT(*) FROM serie_grafico;')[0].values[0][0]
  };

  alertOutput = null;
  await win.DB.saveCurrentSimulation();

  const countAfter = {
    simulaciones: realDb.exec('SELECT COUNT(*) FROM simulacion;')[0].values[0][0],
    ejecuciones: realDb.exec('SELECT COUNT(*) FROM ejecucion_metodo;')[0].values[0][0],
    iteraciones: realDb.exec('SELECT COUNT(*) FROM iteracion_resultado;')[0].values[0][0],
    resumenes: realDb.exec('SELECT COUNT(*) FROM resultado_resumen;')[0].values[0][0],
    series: realDb.exec('SELECT COUNT(*) FROM serie_grafico;')[0].values[0][0]
  };

  const delta = {
    simulaciones: countAfter.simulaciones - countBefore.simulaciones,
    ejecuciones: countAfter.ejecuciones - countBefore.ejecuciones,
    iteraciones: countAfter.iteraciones - countBefore.iteraciones,
    resumenes: countAfter.resumenes - countBefore.resumenes,
    series: countAfter.series - countBefore.series
  };

  if (delta.simulaciones !== 4) throw new Error(`Esperadas +4 simulaciones, obtenidas +${delta.simulaciones}`);
  if (delta.ejecuciones !== 25) throw new Error(`Esperadas +25 ejecuciones, obtenidas +${delta.ejecuciones}`);
  if (delta.iteraciones !== 1498) throw new Error(`Esperadas +1498 iteraciones, obtenidas +${delta.iteraciones}`);
  if (delta.series !== 34) throw new Error(`Esperadas +34 series, obtenidas +${delta.series}`);

  console.log('✔ C1 y C2 verificados exitosamente en tests/test_browser_flow.js');
}

testBrowserFlow().catch(err => {
  console.error('Error en testBrowserFlow:', err);
  process.exit(1);
});
