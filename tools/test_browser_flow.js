const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');

async function testBrowserFlow() {
  console.log('=================================================================');
  console.log('AUDITORÍA C1 & C2: SIMULACIÓN DE EJECUCIÓN COMO EN NAVEGADOR (SIN module.exports)');
  console.log('=================================================================');

  const wasmBinary = fs.readFileSync(path.join(__dirname, '../vendor/sqljs/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const realDb = new SQL.Database();
  realDb.run('PRAGMA foreign_keys = ON;');
  realDb.run(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  realDb.run(fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8'));

  // Crear entorno ventana / documento simulado
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
    indexedDB: undefined // Forzar fallback a SQLite en memoria
  };

  const doc = {
    getElementById: getEl,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
  win.document = doc;

  // Sandbox estricto SIN module.exports ni require
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

  // Cargar scripts exactamente en el orden de index.html:
  // 1. vendor/sqljs/sql-wasm.js (ya inicializado)
  // 2. js/mapper.js
  // 3. js/db.js
  // 4. js/app.js
  const mapperCode = fs.readFileSync(path.join(__dirname, '../js/mapper.js'), 'utf8');
  const dbCode = fs.readFileSync(path.join(__dirname, '../js/db.js'), 'utf8');
  const appCode = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

  console.log('1. Ejecutando js/mapper.js en contexto de navegador...');
  vm.runInContext(mapperCode, sandbox);

  console.log('2. Ejecutando js/db.js en contexto de navegador...');
  vm.runInContext(dbCode, sandbox);

  console.log('3. Ejecutando js/app.js en contexto de navegador...');
  vm.runInContext(appCode, sandbox);

  // Asignar base de datos inicializada
  win.DB.setDB(realDb);

  // Verificar C1
  console.log('\n[C1] Verificación de objetos globales expuestos en window:');
  const checks = [
    { name: 'window.Mapper', val: win.Mapper, type: 'object' },
    { name: 'window.DB', val: win.DB, type: 'object' },
    { name: 'window.LAST', val: win.LAST, type: 'object' },
    { name: 'window.readForm', val: win.readForm, type: 'function' },
    { name: 'window.SYS', val: win.SYS, type: 'object' },
    { name: 'window.solverRows', val: win.solverRows, type: 'function' }
  ];

  for (const c of checks) {
    const ok = typeof c.val === c.type;
    console.log(` - ${c.name}: ${typeof c.val} (${ok ? 'CORRECTO' : 'FALLÓ'})`);
    if (!ok) throw new Error(`Fallo en C1: ${c.name} no está definido correctamente como ${c.type}`);
  }

  // Ejecutar cálculos en app.js con escenario Normal para poblar window.LAST
  console.log('\n[C2] Poblando window.LAST con ejecución de escenario Normal...');
  // Ejecutar el motor de cálculo
  vm.runInContext(`
    // Simular lectura de presets de escenario normal
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

  console.log('window.LAST poblado con éxito. r1:', typeof win.LAST.r1);

  // Mock readForm para que devuelva los parámetros del preset
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

  console.log('\n[C2] Estado en BD antes de saveCurrentSimulation:', countBefore);

  console.log('\n[C2] Ejecutando window.DB.saveCurrentSimulation()...');
  alertOutput = null;
  await win.DB.saveCurrentSimulation();

  console.log(`Mensaje de alerta emitido: "${alertOutput}"`);

  const countAfter = {
    simulaciones: realDb.exec('SELECT COUNT(*) FROM simulacion;')[0].values[0][0],
    ejecuciones: realDb.exec('SELECT COUNT(*) FROM ejecucion_metodo;')[0].values[0][0],
    iteraciones: realDb.exec('SELECT COUNT(*) FROM iteracion_resultado;')[0].values[0][0],
    resumenes: realDb.exec('SELECT COUNT(*) FROM resultado_resumen;')[0].values[0][0],
    series: realDb.exec('SELECT COUNT(*) FROM serie_grafico;')[0].values[0][0]
  };

  console.log('\n[C2] Estado en BD después de saveCurrentSimulation:', countAfter);

  const delta = {
    simulaciones: countAfter.simulaciones - countBefore.simulaciones,
    ejecuciones: countAfter.ejecuciones - countBefore.ejecuciones,
    iteraciones: countAfter.iteraciones - countBefore.iteraciones,
    resumenes: countAfter.resumenes - countBefore.resumenes,
    series: countAfter.series - countBefore.series
  };

  console.log('\n[C2] Filas agregadas por la corrida guardada:');
  console.table(delta);

  if (delta.simulaciones !== 4) throw new Error(`Esperadas +4 simulaciones, obtenidas +${delta.simulaciones}`);
  if (delta.ejecuciones !== 23) throw new Error(`Esperadas +23 ejecuciones, obtenidas +${delta.ejecuciones}`);
  if (delta.iteraciones !== 1489) throw new Error(`Esperadas +1489 iteraciones, obtenidas +${delta.iteraciones}`);
  if (delta.series !== 28) throw new Error(`Esperadas +28 series, obtenidas +${delta.series}`);

  console.log('✔ C1 y C2 VERIFICADOS EXITOSAMENTE EN ENTORNO SIMULADO DE NAVEGADOR.');
}

testBrowserFlow().catch(err => {
  console.error('Error en testBrowserFlow:', err);
  process.exit(1);
});
