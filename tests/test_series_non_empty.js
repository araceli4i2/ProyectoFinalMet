/**
 * test_series_non_empty.js
 * Verificación rigurosa de integridad de series gráficas:
 * 1. Comprueba que ninguna serie en las 4 simulaciones de ejemplo del seed tenga 0 puntos o valores no finitos.
 * 2. Realiza un guardado interactivo completo de escenario Normal (M1..M4) y valida que todas sus series tengan puntos > 0 y valores finitos.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');

const { mod1, mod2, mod3, mod4, modInterp, sweepInterpolation } = require('../js/app.js');
const Mapper = require('../js/mapper.js');
const DB = require('../js/db.js');

async function runSeriesIntegrityTest() {
  console.log('=== TEST DE INTEGRIDAD DE SERIES: COMPROBACIÓN DE SERIES NO VACÍAS Y VALORES FINITOS ===\n');

  const wasmBinary = fs.readFileSync(path.join(__dirname, '../vendor/sqljs/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');

  const schemaSql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  db.run(schemaSql);
  const seedSql = fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8');
  db.run(seedSql);

  // 1. Verificación de las 4 simulaciones de ejemplo del seed
  console.log('1. Verificando series de las 4 simulaciones de ejemplo oficial en seed.sql...');
  for (let simId = 1; simId <= 4; simId++) {
    const query = `
      SELECT s.id, s.nombre, s.datos_json, em.metodo, e.caso_id
      FROM serie_grafico s
      JOIN ejecucion_metodo em ON s.ejecucion_id = em.id
      JOIN simulacion sim ON em.simulacion_id = sim.id
      JOIN escenario e ON sim.escenario_id = e.id
      WHERE sim.id = ?
      ORDER BY s.id ASC;
    `;
    const rows = db.exec(query, [simId]);
    assert(rows.length > 0 && rows[0].values.length > 0, `La simulación #${simId} debe tener series guardadas`);

    const seriesList = rows[0].values;
    console.log(`   -> Simulación #${simId} (Módulo ${seriesList[0][4]}): ${seriesList.length} series auditadas.`);

    for (const [id, nombre, datosJson, metodo, casoId] of seriesList) {
      assert(typeof datosJson === 'string' && datosJson.length > 0, `Serie #${id} '${nombre}' tiene datos_json nulo o vacío`);
      let pts;
      try {
        pts = JSON.parse(datosJson);
      } catch (err) {
        assert.fail(`Error al parsear JSON de serie #${id} '${nombre}': ${err.message}`);
      }

      assert(Array.isArray(pts), `Serie #${id} '${nombre}' en simulación #${simId} debe ser un array`);
      assert(pts.length > 0, `ERROR: Serie #${id} '${nombre}' en simulación #${simId} (${metodo}) está VACÍA (0 puntos)`);

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        assert(typeof p.x === 'number' && Number.isFinite(p.x), `Punto [${i}].x en serie '${nombre}' (sim #${simId}) no es finito: ${p.x}`);
        assert(typeof p.y === 'number' && Number.isFinite(p.y), `Punto [${i}].y en serie '${nombre}' (sim #${simId}) no es finito: ${p.y}`);
      }
    }
  }
  console.log('   ✔ Todas las 51 series de las 4 simulaciones de ejemplo contienen puntos > 0 y valores estrictamente finitos.\n');

  // 2. Verificación con guardado interactivo en los 3 escenarios: NORMAL, ESTRÉS y MAL CONDICIONADO (M1..M4)
  console.log('2. Verificando guardado interactivo completo en los 3 escenarios (Normal, Estrés, Mal Condicionado)...');
  const { SYS, solverRows, PRE } = require('../js/app.js');

  const scenConfigs = [
    { code: 'N', name: 'NORMAL', pre: PRE.N },
    { code: 'E', name: 'ESTRES', pre: PRE.E },
    { code: 'MC', name: 'MAL_CONDICIONADO', pre: PRE.MC }
  ];

  let totalInteractiveSeries = 0;

  for (const sc of scenConfigs) {
    console.log(`\n   --- Auditando Guardado Interactivo para Escenario ${sc.name} ---`);
    const p1 = sc.pre.m1;
    const p2 = sc.pre.m2;
    const p3 = sc.pre.m3;
    const p4 = sc.pre.m4;

    const r1 = mod1(p1);
    const r2 = mod2(p2);
    const r3 = mod3(p3);
    const r4 = mod4(p4);
    const ri = modInterp(sc.pre.mi);

    const s4Rows = r4 ? r4.rows : [];
    const results = { r1, r2, r3, r4, ri, SYS, solverRows, s4Rows };
    const allExecs = Mapper.buildAllExecutions(results, sc.pre, sc.code);
    assert(allExecs.length === 28, `Debe generar 28 ejecuciones en ${sc.name}, obtenido ${allExecs.length}`);

    for (let cId = 1; cId <= 4; cId++) {
      const modExecs = allExecs.filter(e => e.caso_id === cId);
      const payload = {
        escenario: {
          caso_id: cId,
          tipo: sc.name,
          parametros_json: cId === 1 ? p1 : cId === 2 ? p2 : cId === 3 ? p3 : p4,
          fuente_datos: `Guardado interactivo auditoría M${cId} (${sc.name})`
        },
        simulacion: {
          fecha: '2026-11-19 12:00:00',
          usuario_equipo: 'Tester_Series',
          estado: 'COMPLETADO',
          coincide: 1,
          diferencia_max: 0
        },
        ejecuciones: modExecs
      };

      const saveRes = DB.saveSimulationTransaction(payload, db);
      const newSimId = saveRes.simulacion_id;
      console.log(`      -> Simulación interactiva M${cId} (${sc.name}) guardada con ID #${newSimId}.`);

      const qNew = `
        SELECT s.id, s.nombre, s.datos_json, em.metodo
        FROM serie_grafico s
        JOIN ejecucion_metodo em ON s.ejecucion_id = em.id
        WHERE em.simulacion_id = ?
        ORDER BY s.id ASC;
      `;
      const resNew = db.exec(qNew, [newSimId]);
      assert(resNew.length > 0 && resNew[0].values.length > 0, `La nueva simulación M${cId} (${sc.name}) debe contener series`);
      const newSeries = resNew[0].values;
      totalInteractiveSeries += newSeries.length;
      console.log(`         Series guardadas en M${cId}: ${newSeries.length}.`);

      // Para M4, verificar explícitamente que existan las series de ajuste y muestras
      if (cId === 4) {
        const hasAjuste = newSeries.some(s => s[1] === 'M4_ajuste_polinomico');
        const hasMuestras = newSeries.some(s => s[1] === 'M4_muestras_sensores');
        assert(hasAjuste, `M4 en ${sc.name} debe incluir la serie M4_ajuste_polinomico`);
        assert(hasMuestras, `M4 en ${sc.name} debe incluir la serie M4_muestras_sensores`);
      }

      for (const [id, nombre, datosJson, metodo] of newSeries) {
        const pts = JSON.parse(datosJson);
        assert(Array.isArray(pts), `Serie #${id} '${nombre}' en ${sc.name} debe ser array`);
        assert(pts.length > 0, `ERROR: Serie #${id} '${nombre}' (${metodo}) en guardado interactivo (${sc.name}) está VACÍA`);
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          assert(typeof p.x === 'number' && Number.isFinite(p.x), `Punto [${i}].x no finito en serie '${nombre}' (${sc.name})`);
          assert(typeof p.y === 'number' && Number.isFinite(p.y), `Punto [${i}].y no finito en serie '${nombre}' (${sc.name})`);
        }
      }
    }
  }
  console.log(`\n   ✔ Total de series auditadas en guardado interactivo (3 escenarios × 4 módulos = 12 simulaciones): ${totalInteractiveSeries} (todas con puntos > 0 y valores estrictamente finitos).`);

  console.log('\n✅ PRUEBA DE INTEGRIDAD DE SERIES NO VACÍAS COMPLETADA AL 100% SATISFACTORIAMENTE.');
}

runSeriesIntegrityTest().catch(err => {
  console.error('\n❌ ERROR EN TEST DE INTEGRIDAD DE SERIES:', err);
  process.exit(1);
});
