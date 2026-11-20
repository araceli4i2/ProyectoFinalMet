const fs = require('fs');
const path = require('path');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');
const DB = require('../js/db.js');
const Mapper = require('../js/mapper.js');
const { loadEngine } = require('./gen_seed.js');

async function testRelaunchAll() {
  const SQL = await initSqlJs({ locateFile: f => path.join(__dirname, '../vendor/sqljs', f) });
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  db.run(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  db.run(fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8'));
  const engine = loadEngine();

  console.log('--- 1. Relanzando 4 ejemplos oficiales del seed (#1..#4) ---');
  for (let id = 1; id <= 4; id++) {
    const res = await DB.relaunchSimulation(id, 1e-9, db, engine);
    console.log(`Ejemplo #${id}: coincide=${res.comparacion.coincide}, diff_max=${res.comparacion.diferencia_max}`);
    if (!res.comparacion.coincide) throw new Error(`Ejemplo #${id} falló`);
  }

  console.log('--- 2. Guardando y relanzando simulaciones de usuario N, E, MC ---');
  const scenCodes = ['N', 'E', 'MC'];
  for (const sc of scenCodes) {
    const p4 = engine.PRE[sc].m4;
    const pmi = engine.PRE[sc].mi;
    const r4 = engine.mod4(p4);
    const ri = engine.modInterp(pmi);
    const s4Rows = r4.rows;
    const last = { r4, ri, s4Rows };
    const execs = Mapper.buildAllExecutions(last, { m4: p4, mi: pmi }, sc);
    const m4Execs = execs.filter(e => e.caso_id === 4);

    const tipo = sc === 'N' ? 'NORMAL' : sc === 'E' ? 'ESTRES' : 'MAL_CONDICIONADO';
    const saveRes = DB.saveSimulationTransaction({
      escenario: {
        caso_id: 4,
        tipo: tipo,
        parametros_json: { ...p4, mi: pmi },
        fuente_datos: `Test usuario ${sc}`
      },
      simulacion: {
        fecha: '2026-11-20 18:00:00',
        usuario_equipo: 'Investigador UMSA',
        estado: DB.determineSimulationStatus(4, m4Execs)
      },
      ejecuciones: m4Execs
    }, db);

    const simId = saveRes.simulacion_id;
    const relRes = await DB.relaunchSimulation(simId, 1e-9, db, engine);
    console.log(`Usuario ${sc} (ID #${simId}): coincide=${relRes.comparacion.coincide}, diff_max=${relRes.comparacion.diferencia_max}`);
    if (!relRes.comparacion.coincide) throw new Error(`Usuario ${sc} falló relanzamiento`);
  }
  console.log('✔ Todos los relanzamientos dan coincide = 1 con diferencia <= 1e-9.');
}

testRelaunchAll().catch(e => { console.error(e); process.exit(1); });
