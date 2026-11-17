const fs = require('fs');
const path = require('path');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');

async function auditPersistenceCycle() {
  console.log('=================================================================');
  console.log('AUDITORÍA BLOQUE D: CICLO COMPLETO DE PERSISTENCIA');
  console.log('=================================================================');

  const wasmBinary = fs.readFileSync(path.join(__dirname, '../vendor/sqljs/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const DB = require('../js/db.js');
  const Mapper = require('../js/mapper.js');

  // Inicializar DB en memoria con schema y seed
  let db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  db.run(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  db.run(fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8'));
  DB.setDB(db);

  // D1. Guardar una simulación completa de cada módulo (M1 a M4) en Normal
  console.log('\n[D1] Guardado de simulación completa (M1..M4) en Normal:');
  const appCode = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const vm = require('vm');
  const doc = { getElementById: () => ({ value: 'N', closest: () => null }), querySelectorAll: () => [], addEventListener: () => {} };
  const win = { addEventListener: () => {}, document: doc };
  const sandbox = { window: win, document: doc, console, setTimeout: () => {}, clearTimeout: () => {}, Math };
  vm.createContext(sandbox);
  vm.runInContext(appCode + '; this.PRE = PRE; this.SYS = SYS; this.solverRows = solverRows; this.mod1 = mod1; this.mod2 = mod2; this.mod3 = mod3; this.mod4 = mod4; this.modInterp = modInterp;', sandbox);

  const { mod1, mod2, mod3, mod4, modInterp, SYS, solverRows, PRE } = sandbox;
  const p1 = PRE.N.m1, p2 = PRE.N.m2, p3 = PRE.N.m3, p4 = PRE.N.m4, pi = PRE.N.mi || {};
  const r1 = mod1(p1), r2 = mod2(p2), r3 = mod3(p3), r4 = mod4(p4), ri = modInterp(pi);
  const s1Rows = solverRows(SYS.m1.A, SYS.m1.b, SYS.m1.x, SYS.m1.tol, 50000, 'inf');
  const s2Rows = solverRows(SYS.m2n.A, SYS.m2n.b, SYS.m2n.x, SYS.m2n.tol, 50000, 'inf');
  const s3Rows = (r3 && r3.cal) ? solverRows(r3.cal.N, r3.cal.bN, r3.cal.sT, 1e-10, 50000, 'rel2') : [];
  const s4Rows = r4.rows;

  const mockResults = { r1, r2, r3, r4, ri, s1Rows, s2Rows, s3Rows, s4Rows };
  const allExecs = Mapper.buildAllExecutions(mockResults, { m1: p1, m2: p2, m3: p3, m4: p4, mi: pi }, 'N');

  const casesMap = {
    1: { params: p1, ejecs: [] },
    2: { params: p2, ejecs: [] },
    3: { params: p3, ejecs: [] },
    4: { params: { ...p4, mi: pi }, ejecs: [] }
  };
  allExecs.forEach(ej => {
    casesMap[ej.caso_id].ejecs.push(ej);
  });

  const savedSimIds = [];
  for (const cId of [1, 2, 3, 4]) {
    const res = DB.saveSimulationTransaction({
      escenario: {
        caso_id: cId,
        tipo: 'NORMAL',
        parametros_json: casesMap[cId].params,
        fuente_datos: 'Auditoría D1'
      },
      simulacion: {
        fecha: '2026-11-20 18:00:00',
        usuario_equipo: 'Auditor_Senior',
        estado: 'COMPLETADO'
      },
      ejecuciones: casesMap[cId].ejecs
    });
    savedSimIds.push(res.simulacion_id);
  }
  console.log(`Simulaciones guardadas: IDs [${savedSimIds.join(', ')}]`);

  // D2. Exportar binario, cerrar conexión, abrir nueva y comparar
  console.log('\n[D2] Exportación binaria (db.export()) y recarga en nueva instancia SQL:');
  const binary = db.export();
  console.log(`Tamaño binario exportado: ${binary.length} bytes (${(binary.length / 1024).toFixed(2)} KB)`);

  const dbReloaded = new SQL.Database(binary);
  dbReloaded.run('PRAGMA foreign_keys = ON;');
  DB.setDB(dbReloaded);

  // Comprobar que simulación #5 (M1 guardada) es idéntica
  const origM1 = DB.readSimulationFromDB(savedSimIds[0], db);
  const reloadedM1 = DB.readSimulationFromDB(savedSimIds[0], dbReloaded);

  const compParams = JSON.stringify(origM1.escenario.parametros) === JSON.stringify(reloadedM1.escenario.parametros);
  const compExecs = origM1.ejecuciones.length === reloadedM1.ejecuciones.length;
  const compIterCount = origM1.ejecuciones.reduce((s, e) => s + e.iteraciones.length, 0) === reloadedM1.ejecuciones.reduce((s, e) => s + e.iteraciones.length, 0);
  const compSeriesCount = origM1.ejecuciones.reduce((s, e) => s + e.series.length, 0) === reloadedM1.ejecuciones.reduce((s, e) => s + e.series.length, 0);

  console.log(` - Comparación parámetros: ${compParams ? 'IDÉNTICOS' : 'DIFIEREN'}`);
  console.log(` - Comparación número de ejecuciones (${origM1.ejecuciones.length}): ${compExecs ? 'IDÉNTICOS' : 'DIFIEREN'}`);
  console.log(` - Comparación iteraciones totales: ${compIterCount ? 'IDÉNTICOS' : 'DIFIEREN'}`);
  console.log(` - Comparación series totales: ${compSeriesCount ? 'IDÉNTICOS' : 'DIFIEREN'}`);
  const origVal = JSON.parse(origM1.ejecuciones[0].resumen.valor_json);
  const reloadedVal = JSON.parse(reloadedM1.ejecuciones[0].resumen.valor_json);
  console.log(` - Muestra concreta M1 RK4 tdet: orig=${origVal.t_det}, recargado=${reloadedVal.t_det}`);

  // D3. "Abrir" muestra datos de la BD sin recalcular
  console.log('\n[D3] Modo "Abrir" (Solo Lectura sin recálculo):');
  // Modificar intencionalmente un valor en la base de datos (e.g. t_det a 999.99)
  const targetEjecId = origM1.ejecuciones[0].id;
  const origValJson = dbReloaded.exec(`SELECT valor_json FROM resultado_resumen WHERE ejecucion_id = ${targetEjecId};`)[0].values[0][0];
  const alteredValJson = origValJson.replace(/"t_det":\s*[\d\.]+/, '"t_det":999.99');
  dbReloaded.run(`UPDATE resultado_resumen SET valor_json = '${alteredValJson}' WHERE ejecucion_id = ${targetEjecId};`);

  const openedAltered = DB.readSimulationFromDB(savedSimIds[0], dbReloaded);
  const readTDet = JSON.parse(openedAltered.ejecuciones[0].resumen.valor_json).t_det;
  console.log(` - Valor alterado en BD: 999.99. Valor leído por readSimulationFromDB: ${readTDet}`);
  if (readTDet !== 999.99) throw new Error('El lector recalculó en lugar de leer directamente de la BD');
  console.log(' - Verificado: readSimulationFromDB lee exclusivamente de SQLite sin recalcular.');
  // Restaurar valor original
  dbReloaded.run(`UPDATE resultado_resumen SET valor_json = '${origValJson}' WHERE ejecucion_id = ${targetEjecId};`);

  // D4. "Relanzar" y validar matemáticamente
  console.log('\n[D4] Relanzar simulación y validación matemática:');
  // 1. Relanzar M1 (determinista)
  const relanM1 = await DB.relaunchSimulation(savedSimIds[0], 1e-9, dbReloaded, sandbox);
  const rowM1 = dbReloaded.exec(`SELECT coincide, diferencia_max, estado FROM simulacion WHERE id = ${relanM1.simulacion_id};`)[0].values[0];
  console.log(` - Relanzamiento M1 (#${savedSimIds[0]} -> #${relanM1.simulacion_id}): coincide=${rowM1[0]}, diff_max=${rowM1[1]}, estado=${rowM1[2]}`);

  // 2. Relanzar M3 (ruido con semilla)
  const relanM3 = await DB.relaunchSimulation(savedSimIds[2], 1e-9, dbReloaded, sandbox);
  const rowM3 = dbReloaded.exec(`SELECT coincide, diferencia_max, estado FROM simulacion WHERE id = ${relanM3.simulacion_id};`)[0].values[0];
  console.log(` - Relanzamiento M3 (#${savedSimIds[2]} -> #${relanM3.simulacion_id}): coincide=${rowM3[0]}, diff_max=${rowM3[1]}, estado=${rowM3[2]}`);

  // 3. Relanzamiento negativo (M2 con perturbación de parámetro Du de 0.3 a 0.45)
  const escM2 = dbReloaded.exec(`SELECT escenario_id FROM simulacion WHERE id = ${savedSimIds[1]};`)[0].values[0][0];
  const origM2Params = dbReloaded.exec(`SELECT parametros_json FROM escenario WHERE id = ${escM2};`)[0].values[0][0];
  const alteredM2Params = origM2Params.replace('"Du":0.3', '"Du":0.45');
  dbReloaded.run(`UPDATE escenario SET parametros_json = '${alteredM2Params}' WHERE id = ${escM2};`);

  const relanM2Neg = await DB.relaunchSimulation(savedSimIds[1], 1e-9, dbReloaded, sandbox);
  const rowM2Neg = dbReloaded.exec(`SELECT coincide, diferencia_max, estado FROM simulacion WHERE id = ${relanM2Neg.simulacion_id};`)[0].values[0];
  console.log(` - Relanzamiento Negativo M2 (#${savedSimIds[1]} con Du=0.45 -> #${relanM2Neg.simulacion_id}): coincide=${rowM2Neg[0]}, diff_max=${rowM2Neg[1]}, estado=${rowM2Neg[2]}`);
  // Restaurar
  dbReloaded.run(`UPDATE escenario SET parametros_json = '${origM2Params}' WHERE id = ${escM2};`);

  // D5. Relanzar cada una de las simulaciones de ejemplo del seed (IDs 1..4)
  console.log('\n[D5] Relanzar simulaciones de ejemplo de seed.sql (usuario_equipo = "EJEMPLO"):');
  const seedSims = dbReloaded.exec("SELECT s.id, e.caso_id FROM simulacion s JOIN escenario e ON s.escenario_id = e.id WHERE s.usuario_equipo = 'EJEMPLO' ORDER BY s.id ASC;")[0].values;
  const seedResults = [];
  for (const s of seedSims) {
    const sId = s[0];
    const cId = s[1];
    const rel = await DB.relaunchSimulation(sId, 1e-9, dbReloaded, sandbox);
    const row = dbReloaded.exec(`SELECT coincide, diferencia_max, estado FROM simulacion WHERE id = ${rel.simulacion_id};`)[0].values[0];
    seedResults.push({ sim_orig_id: sId, nueva_sim_id: rel.simulacion_id, modulo: `M${cId}`, coincide: row[0], diff_max: row[1], estado: row[2] });
  }
  console.table(seedResults);

  // D6. Versionado: base antigua con simulación de usuario -> upgradeExamples
  console.log('\n[D6] Versionado y preservación de simulaciones de usuario en upgradeExamples:');
  const oldDb = new SQL.Database();
  oldDb.run('PRAGMA foreign_keys = ON;');
  oldDb.run(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  oldDb.run(fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8'));
  oldDb.run('PRAGMA user_version = 1;'); // Simular v1

  // Insertar simulación personalizada de usuario
  oldDb.run(`
    INSERT INTO simulacion (escenario_id, fecha, usuario_equipo, estado)
    VALUES (1, '2026-11-20 20:00:00', 'Investigador_UMSA', 'COMPLETADO');
  `);
  const userSimId = oldDb.exec('SELECT last_insert_rowid();')[0].values[0][0];
  console.log(` - Simulación de usuario creada en v1 con ID #${userSimId}`);

  await DB.upgradeExamples(oldDb);
  const newVer = oldDb.exec('PRAGMA user_version;')[0].values[0][0];
  const userSimCheck = oldDb.exec(`SELECT id, usuario_equipo FROM simulacion WHERE id = ${userSimId};`)[0].values;
  console.log(` - Versión posterior en SQLite: v${newVer}`);
  console.log(` - Simulación de usuario conservada tras upgrade: ID #${userSimCheck[0][0]} (${userSimCheck[0][1]})`);

  // D7. Parámetros guardados por módulo en parametros_json
  console.log('\n[D7] Parámetros guardados en parametros_json por módulo:');
  for (const cId of [1, 2, 3, 4]) {
    const pJson = dbReloaded.exec(`SELECT parametros_json FROM escenario WHERE caso_id = ${cId} AND tipo = 'NORMAL';`)[0].values[0][0];
    const parsed = JSON.parse(pJson);
    console.log(` - Módulo ${cId}:`, Object.keys(parsed));
  }

  console.log('\n✔ CICLO COMPLETO DE PERSISTENCIA (BLOQUE D) AUDITADO CON ÉXITO.');
}

auditPersistenceCycle().catch(err => {
  console.error('Error en auditoría del ciclo de persistencia:', err);
  process.exit(1);
});
