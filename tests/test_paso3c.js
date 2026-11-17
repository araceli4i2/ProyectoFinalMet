const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');
const DB = require('../js/db.js');
const Mapper = require('../js/mapper.js');

function assert(cond, msg) {
  if (!cond) {
    console.error(`[AssertionError] ${msg}`);
    throw new Error(msg);
  }
}

async function runTestPaso3C() {
  console.log('=== TEST PASO 3C · RELANZAR Y COMPARAR CONTRA BASE DE DATOS ===\n');

  // 1. Inicializar sql.js y cargar schema + seed
  const SQL = await initSqlJs({
    locateFile: file => path.join(__dirname, '../vendor/sqljs', file)
  });
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  const schemaSql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  db.run(schemaSql);
  const seedSql = fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8');
  db.run(seedSql);

  // 2. Cargar motor numérico de app.js en contexto headless
  const appCode = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const doc = {
    getElementById: () => ({ value: 'N', closest: () => null }),
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
  const win = { addEventListener: () => {}, document: doc };
  const sandbox = { window: win, document: doc, console, setTimeout: () => {}, clearTimeout: () => {}, Math };
  vm.createContext(sandbox);
  vm.runInContext(appCode + '; this.PRE = PRE; this.SYS = SYS; this.solverRows = solverRows; this.mod1 = mod1; this.mod2 = mod2; this.mod3 = mod3; this.mod4 = mod4; this.modInterp = modInterp;', sandbox);

  const engine = {
    mod1: sandbox.mod1,
    mod2: sandbox.mod2,
    mod3: sandbox.mod3,
    mod4: sandbox.mod4,
    modInterp: sandbox.modInterp,
    SYS: sandbox.SYS,
    solverRows: sandbox.solverRows,
    PRE: sandbox.PRE,
    Mapper
  };

  // =========================================================================
  // TEST (e): Aviso para simulaciones de seed.sql (no generadas por la app)
  // =========================================================================
  console.log('1. Verificando regla de protección para simulaciones de seed.sql (#1 a #4)...');
  const seedRelaunch = await DB.relaunchSimulation(1, 1e-9, db, engine);
  assert(seedRelaunch.isSeedWarning === true, 'Debe devolver isSeedWarning = true para simulación de seed.sql');
  assert(seedRelaunch.message.includes('simulación de ejemplo no generada por la aplicación'), 'Mensaje descriptivo claro');

  const countAfterSeedTry = db.exec("SELECT COUNT(*) FROM simulacion;")[0].values[0][0];
  assert(countAfterSeedTry === 4, `No debe insertar una simulación engañosa; count esperado 4, obtenido ${countAfterSeedTry}`);
  console.log('   ✔ Simulación semilla rechazada con aviso claro sin contaminar la BD con coincide=0 engañoso.\n');

  // =========================================================================
  // TEST (a): Relanzar módulo determinista (Módulo 1) -> coincide = 1, diff <= 1e-9
  // =========================================================================
  console.log('2. Guardando simulación original de Módulo 1 (Determinista)...');
  const p1 = { ...sandbox.PRE.N.m1 };
  const r1 = engine.mod1(p1);
  const s1Rows = engine.solverRows(engine.SYS.m1.A, engine.SYS.m1.b, engine.SYS.m1.x, engine.SYS.m1.tol, 50000, engine.SYS.m1.norm);
  const lastM1 = { r1, s1Rows, SYS: engine.SYS, solverRows: engine.solverRows };
  const execsM1 = Mapper.buildAllExecutions(lastM1, { m1: p1 }, 'N').filter(e => e.caso_id === 1);

  const saveM1Res = DB.saveSimulationTransaction({
    escenario: {
      caso_id: 1,
      tipo: 'NORMAL',
      parametros_json: p1,
      fuente_datos: 'SIMTELE-RISK / Ejecución interactiva'
    },
    simulacion: {
      fecha: '2026-11-17 12:00:00',
      usuario_equipo: 'Investigador Métodos UMSA',
      estado: 'COMPLETADO',
      simulacion_origen_id: null,
      coincide: null,
      diferencia_max: null,
      tol_comparacion: null
    },
    ejecuciones: execsM1
  }, db);

  const origIdM1 = saveM1Res.simulacion_id;
  console.log(`   ✔ Simulación original M1 registrada con ID #${origIdM1}.`);

  console.log('   Relanzando simulación M1 y comparando matemáticamente contra la base de datos...');
  const relaunchM1Res = await DB.relaunchSimulation(origIdM1, 1e-9, db, engine);
  const newIdM1 = relaunchM1Res.simulacion_id;
  const compM1 = relaunchM1Res.comparacion;

  console.log(`   • Simulación nueva: #${newIdM1} (↳ #${origIdM1})`);
  console.log(`   • Diferencia máxima calculada: ${compM1.diferencia_max.toExponential(4)}`);
  console.log(`   • Tolerancia: ${compM1.tol_comparacion}`);
  console.log(`   • Coincide: ${compM1.coincide}`);

  assert(compM1.coincide === true, 'Módulo 1 determinista DEBE coincidir al relanzar');
  assert(compM1.diferencia_max <= 1e-9, `Diferencia máxima ${compM1.diferencia_max} debe ser <= 1e-9`);
  assert(relaunchM1Res.origSimId === origIdM1, 'origSimId debe coincidir');

  // Verificar en la base de datos SQLite directamente
  const checkRowM1 = db.exec(`
    SELECT coincide, diferencia_max, tol_comparacion, simulacion_origen_id, estado
    FROM simulacion WHERE id = ${newIdM1};
  `)[0].values[0];

  assert(checkRowM1[0] === 1, `coincide en SQLite debe ser 1, obtenido ${checkRowM1[0]}`);
  assert(checkRowM1[1] <= 1e-9, `diferencia_max en SQLite debe ser <= 1e-9, obtenido ${checkRowM1[1]}`);
  assert(checkRowM1[2] === 1e-9, `tol_comparacion en SQLite debe ser 1e-9, obtenido ${checkRowM1[2]}`);
  assert(checkRowM1[3] === origIdM1, `simulacion_origen_id en SQLite debe ser ${origIdM1}, obtenido ${checkRowM1[3]}`);
  assert(checkRowM1[4] === 'COMPLETADO', 'Estado debe ser COMPLETADO');
  console.log('   ✔ Test (a) PASADO: Relanzamiento determinista certificado con coincide = 1.\n');

  // =========================================================================
  // TEST (b): Relanzar módulo con ruido y semilla fija (Módulo 3, seed=2026) -> coincide = 1
  // =========================================================================
  console.log('3. Guardando simulación original de Módulo 3 (Ruido pseudoaleatorio con seed=2026)...');
  const p3 = { ...sandbox.PRE.N.m3, seed: 2026 };
  const r3 = engine.mod3(p3);
  const s3Rows = engine.solverRows(r3.cal.N, r3.cal.bN, r3.cal.sT, 1e-10, 50000, 'rel2');
  const lastM3 = { r3, s3Rows, SYS: engine.SYS, solverRows: engine.solverRows };
  const execsM3 = Mapper.buildAllExecutions(lastM3, { m3: p3 }, 'N').filter(e => e.caso_id === 3);

  const saveM3Res = DB.saveSimulationTransaction({
    escenario: {
      caso_id: 3,
      tipo: 'NORMAL',
      parametros_json: p3,
      fuente_datos: 'SIMTELE-RISK / Ejecución interactiva'
    },
    simulacion: {
      fecha: '2026-11-17 12:05:00',
      usuario_equipo: 'Investigador Métodos UMSA',
      estado: 'COMPLETADO',
      simulacion_origen_id: null,
      coincide: null,
      diferencia_max: null,
      tol_comparacion: null
    },
    ejecuciones: execsM3
  }, db);

  const origIdM3 = saveM3Res.simulacion_id;
  console.log(`   ✔ Simulación original M3 registrada con ID #${origIdM3} (seed=2026).`);

  console.log('   Relanzando simulación M3 y validando reproducibilidad matemática...');
  const relaunchM3Res = await DB.relaunchSimulation(origIdM3, 1e-9, db, engine);
  const newIdM3 = relaunchM3Res.simulacion_id;
  const compM3 = relaunchM3Res.comparacion;

  console.log(`   • Simulación nueva: #${newIdM3} (↳ #${origIdM3})`);
  console.log(`   • Diferencia máxima calculada: ${compM3.diferencia_max.toExponential(4)}`);
  console.log(`   • Coincide: ${compM3.coincide}`);

  assert(compM3.coincide === true, 'Módulo 3 con semilla fija DEBE coincidir exactamente');
  assert(compM3.diferencia_max <= 1e-9, `Diferencia máxima ${compM3.diferencia_max} debe ser <= 1e-9`);

  const checkRowM3 = db.exec(`
    SELECT coincide, diferencia_max, simulacion_origen_id FROM simulacion WHERE id = ${newIdM3};
  `)[0].values[0];
  assert(checkRowM3[0] === 1, `coincide en SQLite debe ser 1, obtenido ${checkRowM3[0]}`);
  assert(checkRowM3[2] === origIdM3, `simulacion_origen_id debe ser ${origIdM3}`);
  console.log('   ✔ Test (b) PASADO: Reproducibilidad determinista de PRNG mulberry32 certificada.\n');

  // =========================================================================
  // TEST (c): Prueba negativa: alterar parámetros en la base -> coincide = 0, diff > tol
  // =========================================================================
  console.log('4. Prueba negativa: Alterar parámetros en el escenario de la base de datos...');
  // Guardamos Módulo 2 original con Du = 0.30
  const p2 = { ...sandbox.PRE.N.m2, Du: 0.30 };
  const r2 = engine.mod2(p2);
  const s2Rows = engine.solverRows(engine.SYS.m2n.A, engine.SYS.m2n.b, engine.SYS.m2n.x, engine.SYS.m2n.tol, 50000, engine.SYS.m2n.norm);
  const lastM2 = { r2, s2Rows, SYS: engine.SYS, solverRows: engine.solverRows };
  const execsM2 = Mapper.buildAllExecutions(lastM2, { m2: p2 }, 'N').filter(e => e.caso_id === 2);

  const saveM2Res = DB.saveSimulationTransaction({
    escenario: {
      caso_id: 2,
      tipo: 'NORMAL',
      parametros_json: p2,
      fuente_datos: 'SIMTELE-RISK / Ejecución interactiva'
    },
    simulacion: {
      fecha: '2026-11-17 12:10:00',
      usuario_equipo: 'Investigador Métodos UMSA',
      estado: 'COMPLETADO',
      simulacion_origen_id: null,
      coincide: null,
      diferencia_max: null,
      tol_comparacion: null
    },
    ejecuciones: execsM2
  }, db);

  const origIdM2 = saveM2Res.simulacion_id;
  const escIdM2 = saveM2Res.escenario_id;

  // Modificamos artificialmente los parámetros del escenario en SQLite para forzar discrepancia
  const modifiedP2 = { ...p2, Du: 0.45 };
  db.run(`UPDATE escenario SET parametros_json = ? WHERE id = ?;`, [JSON.stringify(modifiedP2), escIdM2]);

  console.log(`   Se alteró escenario #${escIdM2} (Du cambió de 0.30 a 0.45). Relanzando simulación #${origIdM2}...`);
  const relaunchM2NegRes = await DB.relaunchSimulation(origIdM2, 1e-9, db, engine);
  const newIdM2 = relaunchM2NegRes.simulacion_id;
  const compM2Neg = relaunchM2NegRes.comparacion;

  console.log(`   • Simulación nueva: #${newIdM2} (↳ #${origIdM2})`);
  console.log(`   • Diferencia máxima calculada: ${compM2Neg.diferencia_max}`);
  console.log(`   • Coincide: ${compM2Neg.coincide}`);

  assert(compM2Neg.coincide === false, 'Debe fallar la coincidencia cuando los parámetros cambiaron');
  assert(compM2Neg.diferencia_max > 1e-9, `diferencia_max ${compM2Neg.diferencia_max} debe superar la tolerancia`);

  const checkRowM2Neg = db.exec(`
    SELECT coincide, diferencia_max, simulacion_origen_id, estado FROM simulacion WHERE id = ${newIdM2};
  `)[0].values[0];
  assert(checkRowM2Neg[0] === 0, `coincide en SQLite debe ser 0, obtenido ${checkRowM2Neg[0]}`);
  assert(checkRowM2Neg[1] > 1e-9, `diferencia_max en SQLite debe ser > 1e-9, obtenido ${checkRowM2Neg[1]}`);
  assert(checkRowM2Neg[2] === origIdM2, `simulacion_origen_id debe ser ${origIdM2}`);
  assert(checkRowM2Neg[3] === 'ERROR_VALIDACION', 'Estado debe ser ERROR_VALIDACION');
  console.log('   ✔ Test (c) PASADO: Detección rigurosa de discrepancia con coincide = 0 y estado = ERROR_VALIDACION.\n');

  // =========================================================================
  // TEST (d): Verificación de clave foránea e integridad de simulacion_origen_id
  // =========================================================================
  console.log('5. Verificando clave foránea y relaciones de simulacion_origen_id...');
  const relQuery = db.exec(`
    SELECT s.id, s.simulacion_origen_id, s.coincide, s.diferencia_max, orig.fecha AS fecha_origen
    FROM simulacion s
    JOIN simulacion orig ON s.simulacion_origen_id = orig.id
    WHERE s.simulacion_origen_id IS NOT NULL;
  `);

  assert(relQuery.length > 0 && relQuery[0].values.length === 3, `Deben existir 3 simulaciones relanzadas, obtenidas ${relQuery[0].values.length}`);
  console.log(`   ✔ ${relQuery[0].values.length} enlaces relanzamiento ↳ origen verificados con JOIN relacional.\n`);

  // =========================================================================
  // TEST (f): Verificación de showComparisonDetail
  // =========================================================================
  console.log('6. Verificando showComparisonDetail...');
  const detailComp = DB.showComparisonDetail(newIdM2, db);
  assert(detailComp != null, 'showComparisonDetail debe retornar el objeto de comparación');
  assert(Array.isArray(detailComp.detalles), 'detalles debe ser un arreglo');
  assert(detailComp.detalles.length > 0, 'debe contener diferencias registradas');
  console.log(`   ✔ Detalle extraído con éxito (${detailComp.detalles.length} variables comparadas).\n`);

  console.log('===============================================================');
  console.log('   TODAS LAS PRUEBAS DEL PASO 3C PASARON EXITOSAMENTE (100%)   ');
  console.log('===============================================================\n');
}

runTestPaso3C().catch(err => {
  console.error('\n❌ ERROR EN TEST PASO 3C:', err);
  process.exit(1);
});
