const fs = require('fs');
const path = require('path');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');

async function testHistory() {
  const wasmBinary = fs.readFileSync(path.join(__dirname, '../vendor/sqljs/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  db.run(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  db.run(fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8'));

  const stmt = db.prepare(`
    SELECT s.id, s.fecha, s.estado, s.coincide, s.diferencia_max,
           c.nombre AS caso_nombre, e.tipo AS escenario_tipo, s.escenario_id
    FROM simulacion s
    JOIN escenario e ON s.escenario_id = e.id
    JOIN caso_estudio c ON e.caso_id = c.id
    ORDER BY s.id DESC;
  `);

  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();

  console.log('Simulaciones encontradas en el historial:');
  console.table(rows);

  if (rows.length < 4) {
    throw new Error('Faltan simulaciones en el historial');
  }
  console.log('Test de consulta de historial exitoso.');
}

testHistory().catch(e => {
  console.error(e);
  process.exit(1);
});
