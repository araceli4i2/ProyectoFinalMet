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

async function runCountsTest() {
  console.log('=== TEST DE AUDITORÍA Y RECUENTO RIGUROSO (ESCENARIO NORMAL) ===\n');

  // 1. Cargar e inicializar app.js en contexto headless
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

  const PRE = sandbox.PRE;
  const SYS = sandbox.SYS;
  const solverRows = sandbox.solverRows;

  // 2. Ejecutar algoritmos numéricos con presets del Escenario Normal
  const r1 = sandbox.mod1(PRE.N.m1);
  const r2 = sandbox.mod2(PRE.N.m2);
  const r3 = sandbox.mod3(PRE.N.m3);
  const r4 = sandbox.mod4(PRE.N.m4);
  const ri = sandbox.modInterp(PRE.N.mi);

  const s1Rows = solverRows(SYS.m1.A, SYS.m1.b, SYS.m1.x, SYS.m1.tol, 50000, SYS.m1.norm);
  const s2Rows = solverRows(SYS.m2n.A, SYS.m2n.b, SYS.m2n.x, SYS.m2n.tol, 50000, SYS.m2n.norm);
  const s3Rows = r3.cal ? solverRows(r3.cal.N, r3.cal.bN, r3.cal.sT, 1e-10, 50000, 'rel2') : [];
  const s4Rows = r4.rows;

  const LAST = { r1, r2, r3, r4, ri, s1Rows, s2Rows, s3Rows, s4Rows, SYS, solverRows };

  // 3. Extraer ejecuciones con el mapper
  const executions = Mapper.buildAllExecutions(LAST, PRE.N, 'N');

  const counts = {
    1: { name: 'M1: Detención de emergencia', execs: 0, iters: 0, series: 0 },
    2: { name: 'M2: Deterioro mecánico', execs: 0, iters: 0, series: 0 },
    3: { name: 'M3: Oscilaciones por viento', execs: 0, iters: 0, series: 0 },
    4: { name: 'M4: Sensores e interpolación', execs: 0, iters: 0, series: 0 }
  };

  let totalExecs = 0, totalIters = 0, totalSeries = 0;

  executions.forEach(ej => {
    const c = counts[ej.caso_id];
    assert(c, `caso_id inválido: ${ej.caso_id}`);
    c.execs++;
    c.iters += ej.iteraciones.length;
    c.series += ej.series.length;
    totalExecs++;
    totalIters += ej.iteraciones.length;
    totalSeries += ej.series.length;
  });

  console.log('Resultados por módulo obtenidos:');
  Object.keys(counts).forEach(k => {
    const m = counts[k];
    console.log(` - ${m.name}: ${m.execs} ejecuciones, ${m.iters} iteraciones, ${m.series} series`);
  });
  console.log(`\nGran Total: ${totalExecs} ejecuciones, ${totalIters} iteraciones, ${totalSeries} series\n`);

  // 4. Verificaciones estrictas por módulo
  // Módulo 1: 6 ejecuciones, 37 iteraciones (Jacobi:20, GS:12, CG:5), 7 series
  assert(counts[1].execs === 6, `M1 esperado 6 ejecuciones, obtenido ${counts[1].execs}`);
  assert(counts[1].iters === 37, `M1 esperado 37 iteraciones, obtenido ${counts[1].iters}`);
  assert(counts[1].series === 7, `M1 esperado 7 series, obtenido ${counts[1].series}`);

  // Módulo 2: 7 ejecuciones, 96 iteraciones (Newton:6, Bisect:45, Jacobi:26, GS:14, CG:5), 6 series
  assert(counts[2].execs === 7, `M2 esperado 7 ejecuciones, obtenido ${counts[2].execs}`);
  assert(counts[2].iters === 96, `M2 esperado 96 iteraciones, obtenido ${counts[2].iters}`);
  assert(counts[2].series === 6, `M2 esperado 6 series, obtenido ${counts[2].series}`);

  // Módulo 3: 5 ejecuciones, 954 iteraciones (Jacobi:450, GS:500 muestreado, CG:4), 6 series
  assert(counts[3].execs === 5, `M3 esperado 5 ejecuciones, obtenido ${counts[3].execs}`);
  assert(counts[3].iters === 954, `M3 esperado 954 iteraciones, obtenido ${counts[3].iters}`);
  assert(counts[3].series === 6, `M3 esperado 6 series, obtenido ${counts[3].series}`);

  // Módulo 4: 5 ejecuciones, 402 iteraciones (Jacobi:280, GS:117, CG:5), 9 series
  assert(counts[4].execs === 5, `M4 esperado 5 ejecuciones, obtenido ${counts[4].execs}`);
  assert(counts[4].iters === 402, `M4 esperado 402 iteraciones, obtenido ${counts[4].iters}`);
  assert(counts[4].series === 9, `M4 esperado 9 series, obtenido ${counts[4].series}`);

  // Totales globales: 23 ejecuciones, 1489 iteraciones, 28 series
  assert(totalExecs === 23, `Total ejecuciones esperado 23, obtenido ${totalExecs}`);
  assert(totalIters === 1489, `Total iteraciones esperado 1489, obtenido ${totalIters}`);
  assert(totalSeries === 28, `Total series esperado 28, obtenido ${totalSeries}`);

  // 5. Verificación de inserción en base de datos SQLite transaccional
  console.log('5. Verificando persistencia física en base SQLite...');
  const wasmBinary = fs.readFileSync(path.join(__dirname, '../vendor/sqljs/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  db.run(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));

  // Guardar módulo por módulo (como lo hace saveCurrentSimulation)
  const casesMap = {
    1: { params: PRE.N.m1, ejecs: [] },
    2: { params: PRE.N.m2, ejecs: [] },
    3: { params: PRE.N.m3, ejecs: [] },
    4: { params: { ...PRE.N.m4, mi: PRE.N.mi }, ejecs: [] }
  };
  executions.forEach(ej => casesMap[ej.caso_id].ejecs.push(ej));

  for (const cId of [1, 2, 3, 4]) {
    DB.saveSimulationTransaction({
      escenario: {
        caso_id: cId,
        tipo: 'NORMAL',
        parametros_json: casesMap[cId].params,
        fuente_datos: 'Test de recuento'
      },
      simulacion: {
        fecha: '2026-11-17 08:00:00',
        usuario_equipo: 'Test Suite Counts',
        estado: 'COMPLETADO'
      },
      ejecuciones: casesMap[cId].ejecs
    }, db);
  }

  const countRows = table => db.exec(`SELECT COUNT(*) FROM ${table};`)[0].values[0][0];

  assert(countRows('simulacion') === 4, 'Deben existir 4 simulaciones guardadas (1 por módulo)');
  assert(countRows('ejecucion_metodo') === 23, `Deben existir 23 ejecuciones en BD (obtenido ${countRows('ejecucion_metodo')})`);
  assert(countRows('iteracion_resultado') === 1489, `Deben existir 1489 filas de iteración en BD (obtenido ${countRows('iteracion_resultado')})`);
  assert(countRows('serie_grafico') === 28, `Deben existir 28 series en BD (obtenido ${countRows('serie_grafico')})`);
  assert(countRows('resultado_resumen') === 23, `Deben existir 23 resúmenes 1:1 en BD (obtenido ${countRows('resultado_resumen')})`);

  console.log('   -> Filas confirmadas en SQLite:');
  console.log(`      ejecucion_metodo:    ${countRows('ejecucion_metodo')}`);
  console.log(`      iteracion_resultado: ${countRows('iteracion_resultado')}`);
  console.log(`      serie_grafico:       ${countRows('serie_grafico')}`);
  console.log(`      resultado_resumen:   ${countRows('resultado_resumen')}`);

  console.log('\n✅ PRUEBA DE RECUENTO PASÓ SATISFACTORIAMENTE (100% AUDITADO).');
}

runCountsTest().catch(err => {
  console.error('\n❌ ERROR EN LA PRUEBA DE RECUENTO:', err);
  process.exit(1);
});
