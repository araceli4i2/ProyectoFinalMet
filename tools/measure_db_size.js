/**
 * tools/measure_db_size.js
 * Medición rigurosa y unificada del tamaño de la base de datos SQLite (db.export()):
 * 1. seed solo (4 simulaciones de ejemplo)
 * 2. seed + 1 guardado interactivo completo de Normal (M1 a M4, 23 ejecuciones)
 * 3. seed + 5 guardados interactivos completos de Normal
 * 4. seed + guardados interactivos completos de Normal, Estrés y Mal Condicionado
 * 
 * Incluye desglose de bytes por tabla y peso de cadenas JSON en iteracion_resultado y serie_grafico.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');
const DB = require('../js/db.js');
const Mapper = require('../js/mapper.js');

function loadEngine() {
  const appCode = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const doc = { getElementById: () => ({ value: 'N', closest: () => null }), querySelectorAll: () => [], addEventListener: () => {} };
  const win = { addEventListener: () => {}, document: doc };
  const sandbox = { window: win, document: doc, console, setTimeout: () => {}, clearTimeout: () => {}, Math };
  vm.createContext(sandbox);
  vm.runInContext(appCode + '; this.PRE = PRE; this.SYS = SYS; this.solverRows = solverRows; this.mod1 = mod1; this.mod2 = mod2; this.mod3 = mod3; this.mod4 = mod4; this.modInterp = modInterp;', sandbox);
  return sandbox;
}

function runFullScenario(engine, scenKey) {
  const { mod1, mod2, mod3, mod4, modInterp, SYS, solverRows, PRE } = engine;
  const p = PRE[scenKey];
  const p1 = p.m1, p2 = p.m2, p3 = p.m3, p4 = p.m4, pi = p.mi || {};

  const r1 = mod1(p1);
  const r2 = mod2(p2);
  const r3 = mod3(p3);
  const r4 = mod4(p4);
  const ri = modInterp(pi);

  const m2Key = (scenKey === 'E') ? 'm2e' : (scenKey === 'MC' || scenKey === 'M') ? 'm2m' : 'm2n';
  const s1Rows = solverRows(SYS.m1.A, SYS.m1.b, SYS.m1.x, SYS.m1.tol, 50000, 'inf');
  const s2Rows = (SYS[m2Key]) ? solverRows(SYS[m2Key].A, SYS[m2Key].b, SYS[m2Key].x, SYS[m2Key].tol, 50000, 'inf') : [];
  const s3Rows = (r3 && r3.cal) ? solverRows(r3.cal.N, r3.cal.bN, r3.cal.sT, 1e-10, 50000, 'rel2') : [];
  const s4Rows = r4.rows;

  const mockResults = { r1, r2, r3, r4, ri, s1Rows, s2Rows, s3Rows, s4Rows };
  const allExecs = Mapper.buildAllExecutions(mockResults, { m1: p1, m2: p2, m3: p3, m4: p4, mi: pi }, scenKey);

  return {
    scenKey,
    params: { m1: p1, m2: p2, m3: p3, m4: p4, mi: pi },
    execs: allExecs
  };
}

function saveFullRun(db, runData, userLabel, runIndex = 1) {
  const casesMap = {
    1: { params: runData.params.m1, ejecs: [] },
    2: { params: runData.params.m2, ejecs: [] },
    3: { params: runData.params.m3, ejecs: [] },
    4: { params: { ...runData.params.m4, mi: runData.params.mi }, ejecs: [] }
  };
  runData.execs.forEach(ej => {
    casesMap[ej.caso_id].ejecs.push(ej);
  });

  const tipo = (runData.scenKey === 'E') ? 'ESTRES' : (runData.scenKey === 'MC') ? 'MAL_CONDICIONADO' : 'NORMAL';

  for (const cId of [1, 2, 3, 4]) {
    DB.saveSimulationTransaction({
      escenario: {
        caso_id: cId,
        tipo: tipo,
        parametros_json: casesMap[cId].params,
        fuente_datos: `Guardado interactivo ${userLabel}`
      },
      simulacion: {
        fecha: `2026-11-20 12:${String(runIndex).padStart(2, '0')}:00`,
        usuario_equipo: userLabel,
        estado: DB.determineSimulationStatus(cId, casesMap[cId].ejecs)
      },
      ejecuciones: casesMap[cId].ejecs
    }, db);
  }
}

function analyzeTableSizes(db) {
  const tables = ['caso_estudio', 'escenario', 'simulacion', 'ejecucion_metodo', 'iteracion_resultado', 'resultado_resumen', 'serie_grafico'];
  const breakdown = {};

  for (const t of tables) {
    const rowCount = db.exec(`SELECT COUNT(*) FROM ${t};`)[0].values[0][0];
    let payloadBytes = 0;

    if (t === 'iteracion_resultado') {
      const res = db.exec('SELECT SUM(LENGTH(aproximacion_json) + 24) FROM iteracion_resultado;')[0];
      payloadBytes = res.values[0][0] || 0;
    } else if (t === 'serie_grafico') {
      const res = db.exec('SELECT SUM(LENGTH(nombre) + LENGTH(datos_json) + 16) FROM serie_grafico;')[0];
      payloadBytes = res.values[0][0] || 0;
    } else if (t === 'resultado_resumen') {
      const res = db.exec('SELECT SUM(LENGTH(referencia) + LENGTH(valor_json) + LENGTH(metrica_error_json) + IFNULL(LENGTH(conclusion_numerica),0) + IFNULL(LENGTH(conclusion_problema),0) + 16) FROM resultado_resumen;')[0];
      payloadBytes = res.values[0][0] || 0;
    } else if (t === 'escenario') {
      const res = db.exec('SELECT SUM(LENGTH(tipo) + LENGTH(parametros_json) + LENGTH(fuente_datos) + 16) FROM escenario;')[0];
      payloadBytes = res.values[0][0] || 0;
    } else if (t === 'ejecucion_metodo') {
      const res = db.exec('SELECT SUM(LENGTH(familia) + LENGTH(metodo) + LENGTH(estado) + 40) FROM ejecucion_metodo;')[0];
      payloadBytes = res.values[0][0] || 0;
    } else if (t === 'simulacion') {
      const res = db.exec('SELECT SUM(LENGTH(fecha) + IFNULL(LENGTH(usuario_equipo),0) + IFNULL(LENGTH(estado),0) + 32) FROM simulacion;')[0];
      payloadBytes = res.values[0][0] || 0;
    } else {
      payloadBytes = rowCount * 64;
    }

    breakdown[t] = { filas: rowCount, bytes_payload: payloadBytes };
  }

  return breakdown;
}

async function runMeasurements() {
  console.log('================================================================================');
  console.log('MEDICIÓN RIGUROSA Y DESGLOSE DEL TAMAÑO DE LA BASE DE DATOS (db.export())');
  console.log('================================================================================\n');

  const wasmBinary = fs.readFileSync(path.join(__dirname, '../vendor/sqljs/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const schemaSql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  const seedSql = fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8');
  const engine = loadEngine();

  const normalRun = runFullScenario(engine, 'N');
  const estresRun = runFullScenario(engine, 'E');
  const mcRun = runFullScenario(engine, 'MC');

  // --- ESCENARIO 1: Seed solo ---
  const db1 = new SQL.Database();
  db1.run('PRAGMA foreign_keys = ON;');
  db1.run(schemaSql);
  db1.run(seedSql);
  const bin1 = db1.export();
  const bd1 = analyzeTableSizes(db1);

  // --- ESCENARIO 2: Seed + 1 guardado completo Normal ---
  const db2 = new SQL.Database();
  db2.run('PRAGMA foreign_keys = ON;');
  db2.run(schemaSql);
  db2.run(seedSql);
  saveFullRun(db2, normalRun, 'Usuario_Normal_1', 1);
  const bin2 = db2.export();
  const bd2 = analyzeTableSizes(db2);

  // --- ESCENARIO 3: Seed + 5 guardados completos Normal ---
  const db3 = new SQL.Database();
  db3.run('PRAGMA foreign_keys = ON;');
  db3.run(schemaSql);
  db3.run(seedSql);
  for (let k = 1; k <= 5; k++) {
    saveFullRun(db3, normalRun, `Usuario_Normal_${k}`, k);
  }
  const bin3 = db3.export();
  const bd3 = analyzeTableSizes(db3);

  // --- ESCENARIO 4: Seed + Normal + Estrés + Mal Condicionado ---
  const db4 = new SQL.Database();
  db4.run('PRAGMA foreign_keys = ON;');
  db4.run(schemaSql);
  db4.run(seedSql);
  saveFullRun(db4, normalRun, 'Usuario_Normal', 1);
  saveFullRun(db4, estresRun, 'Usuario_Estres', 2);
  saveFullRun(db4, mcRun, 'Usuario_MalCondicionado', 3);
  const bin4 = db4.export();
  const bd4 = analyzeTableSizes(db4);

  // Reporte consolidado
  const summary = [
    {
      configuracion: '1. Seed solo (4 simulaciones iniciales)',
      simulaciones: db1.exec('SELECT COUNT(*) FROM simulacion;')[0].values[0][0],
      ejecuciones: db1.exec('SELECT COUNT(*) FROM ejecucion_metodo;')[0].values[0][0],
      iteraciones: db1.exec('SELECT COUNT(*) FROM iteracion_resultado;')[0].values[0][0],
      series: db1.exec('SELECT COUNT(*) FROM serie_grafico;')[0].values[0][0],
      bytes_export: bin1.length,
      kb_export: (bin1.length / 1024).toFixed(2),
      mb_export: (bin1.length / (1024 * 1024)).toFixed(2)
    },
    {
      configuracion: '2. Seed + 1 guardado completo Normal (+4 sims)',
      simulaciones: db2.exec('SELECT COUNT(*) FROM simulacion;')[0].values[0][0],
      ejecuciones: db2.exec('SELECT COUNT(*) FROM ejecucion_metodo;')[0].values[0][0],
      iteraciones: db2.exec('SELECT COUNT(*) FROM iteracion_resultado;')[0].values[0][0],
      series: db2.exec('SELECT COUNT(*) FROM serie_grafico;')[0].values[0][0],
      bytes_export: bin2.length,
      kb_export: (bin2.length / 1024).toFixed(2),
      mb_export: (bin2.length / (1024 * 1024)).toFixed(2)
    },
    {
      configuracion: '3. Seed + 5 guardados completos Normal (+20 sims)',
      simulaciones: db3.exec('SELECT COUNT(*) FROM simulacion;')[0].values[0][0],
      ejecuciones: db3.exec('SELECT COUNT(*) FROM ejecucion_metodo;')[0].values[0][0],
      iteraciones: db3.exec('SELECT COUNT(*) FROM iteracion_resultado;')[0].values[0][0],
      series: db3.exec('SELECT COUNT(*) FROM serie_grafico;')[0].values[0][0],
      bytes_export: bin3.length,
      kb_export: (bin3.length / 1024).toFixed(2),
      mb_export: (bin3.length / (1024 * 1024)).toFixed(2)
    },
    {
      configuracion: '4. Seed + Normal + Estrés + Mal Condicionado (+12 sims)',
      simulaciones: db4.exec('SELECT COUNT(*) FROM simulacion;')[0].values[0][0],
      ejecuciones: db4.exec('SELECT COUNT(*) FROM ejecucion_metodo;')[0].values[0][0],
      iteraciones: db4.exec('SELECT COUNT(*) FROM iteracion_resultado;')[0].values[0][0],
      series: db4.exec('SELECT COUNT(*) FROM serie_grafico;')[0].values[0][0],
      bytes_export: bin4.length,
      kb_export: (bin4.length / 1024).toFixed(2),
      mb_export: (bin4.length / (1024 * 1024)).toFixed(2)
    }
  ];

  console.log('TABLA COMPARATIVA DE TAMAÑOS (db.export()):');
  console.table(summary);

  console.log('\nDESGLOSE DE CARGA ÚTIL (PAYLOAD) POR TABLA:');
  const formatBD = (bd, label) => {
    console.log(`\n--- ${label} ---`);
    const rows = Object.keys(bd).map(k => ({
      tabla: k,
      filas: bd[k].filas,
      bytes_aprox: bd[k].bytes_payload,
      kb_aprox: (bd[k].bytes_payload / 1024).toFixed(2)
    }));
    console.table(rows);
  };

  formatBD(bd1, '1. Seed solo');
  formatBD(bd2, '2. Seed + 1 Guardado Normal');
  formatBD(bd3, '3. Seed + 5 Guardados Normales');
  formatBD(bd4, '4. Seed + Normal + Estrés + Mal Condicionado');

  return { summary, bd1, bd2, bd3, bd4 };
}

runMeasurements().catch(err => {
  console.error('Error en measure_db_size:', err);
  process.exit(1);
});
