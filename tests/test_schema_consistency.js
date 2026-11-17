/**
 * test_schema_consistency.js
 * Verifica que db/schema.sql y FALLBACK_SCHEMA en js/db.js sean 100% idénticos y equivalentes.
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');

async function testSchemaConsistency() {
  const wasmBinary = fs.readFileSync(path.join(__dirname, '../vendor/sqljs/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });

  const db1 = new SQL.Database();
  db1.run('PRAGMA foreign_keys = ON;');
  const schemaSql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  db1.run(schemaSql);

  const dbJsContent = fs.readFileSync(path.join(__dirname, '../js/db.js'), 'utf8');
  const match = dbJsContent.match(/const FALLBACK_SCHEMA = `([\s\S]*?)`;/);
  if (!match) throw new Error('No se pudo encontrar FALLBACK_SCHEMA en js/db.js');
  const fallbackSchema = match[1];

  const db2 = new SQL.Database();
  db2.run('PRAGMA foreign_keys = ON;');
  db2.run(fallbackSchema);

  const getObjects = (db) => {
    const res = db.exec("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name;");
    return res[0].values.map(v => ({ type: v[0], name: v[1], tbl: v[2], sql: (v[3] || '').replace(/\s+/g, ' ').trim() }));
  };

  const objs1 = getObjects(db1);
  const objs2 = getObjects(db2);

  if (objs1.length !== objs2.length) {
    throw new Error(`Cantidad de objetos en esquema difiere: ${objs1.length} vs ${objs2.length}`);
  }

  for (let i = 0; i < objs1.length; i++) {
    const o1 = objs1[i];
    const o2 = objs2.find(o => o.name === o1.name);
    if (!o2) throw new Error(`Objeto ${o1.name} falta en FALLBACK_SCHEMA`);
    if (o1.sql !== o2.sql) {
      throw new Error(`Definición SQL difiere para ${o1.name}:\nSchema:   ${o1.sql}\nFallback: ${o2.sql}`);
    }
  }

  const ver1 = db1.exec('PRAGMA user_version;')[0].values[0][0];
  const ver2 = db2.exec('PRAGMA user_version;')[0].values[0][0];
  if (ver1 !== ver2) {
    throw new Error(`PRAGMA user_version difiere: ${ver1} vs ${ver2}`);
  }

  console.log('✔ Test de consistencia entre db/schema.sql y FALLBACK_SCHEMA exitoso (100% equivalentes).');
}

testSchemaConsistency().catch(e => {
  console.error('Error en testSchemaConsistency:', e);
  process.exit(1);
});
