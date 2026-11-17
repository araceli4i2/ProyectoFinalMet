const fs = require('fs');
const path = require('path');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');

async function compareSchemas() {
  const wasmBinary = fs.readFileSync(path.join(__dirname, '../vendor/sqljs/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });

  // 1. Cargar db/schema.sql en db1
  const db1 = new SQL.Database();
  db1.run('PRAGMA foreign_keys = ON;');
  const schemaSql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  db1.run(schemaSql);

  // 2. Extraer FALLBACK_SCHEMA de js/db.js
  const dbJsContent = fs.readFileSync(path.join(__dirname, '../js/db.js'), 'utf8');
  const match = dbJsContent.match(/const FALLBACK_SCHEMA = `([\s\S]*?)`;/);
  if (!match) throw new Error('No se pudo encontrar FALLBACK_SCHEMA en js/db.js');
  const fallbackSchema = match[1];

  const db2 = new SQL.Database();
  db2.run('PRAGMA foreign_keys = ON;');
  db2.run(fallbackSchema);

  // 3. Comparar objetos en sqlite_master
  const getObjects = (db) => {
    const res = db.exec("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name;");
    return res[0].values.map(v => ({ type: v[0], name: v[1], tbl: v[2], sql: (v[3] || '').replace(/\s+/g, ' ').trim() }));
  };

  const objs1 = getObjects(db1);
  const objs2 = getObjects(db2);

  console.log('Comparando db/schema.sql vs FALLBACK_SCHEMA en js/db.js:');
  console.log(`Objetos en db/schema.sql: ${objs1.length}`);
  console.log(`Objetos en FALLBACK_SCHEMA: ${objs2.length}`);

  let diffs = 0;
  const names1 = new Set(objs1.map(o => o.name));
  const names2 = new Set(objs2.map(o => o.name));

  for (const n of names1) {
    if (!names2.has(n)) {
      console.log(`- FALTANTE en FALLBACK_SCHEMA: ${n}`);
      diffs++;
    }
  }
  for (const n of names2) {
    if (!names1.has(n)) {
      console.log(`- EXTRA en FALLBACK_SCHEMA: ${n}`);
      diffs++;
    }
  }

  for (const o1 of objs1) {
    const o2 = objs2.find(o => o.name === o1.name);
    if (o2) {
      if (o1.sql !== o2.sql) {
        console.log(`\n[DIFERENCIA EN DEFINICIÓN SQL: ${o1.name}]`);
        console.log(`db/schema.sql:    ${o1.sql}`);
        console.log(`FALLBACK_SCHEMA:  ${o2.sql}`);
        diffs++;
      }
    }
  }

  const ver1 = db1.exec('PRAGMA user_version;')[0].values[0][0];
  const ver2 = db2.exec('PRAGMA user_version;')[0].values[0][0];
  console.log(`PRAGMA user_version: schema.sql = ${ver1}, FALLBACK_SCHEMA = ${ver2}`);
  if (ver1 !== ver2) {
    console.log(`- DIFERENCIA en user_version: ${ver1} !== ${ver2}`);
    diffs++;
  }

  if (diffs === 0) {
    console.log('\n✔ db/schema.sql y FALLBACK_SCHEMA son 100% IDÉNTICOS Y EQUIVALENTES.');
  } else {
    console.log(`\n❌ Se encontraron ${diffs} diferencias.`);
  }
}

compareSchemas().catch(console.error);
