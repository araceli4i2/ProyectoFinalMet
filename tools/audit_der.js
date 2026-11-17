const fs = require('fs');
const path = require('path');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');

async function auditDER() {
  const wasmBinary = fs.readFileSync(path.join(__dirname, '../vendor/sqljs/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  db.run(schema);

  console.log('=================================================================');
  console.log('AUDITORÍA TÉCNICA DEL DER (db/schema.sql)');
  console.log('=================================================================');

  const tablesRes = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
  const tables = tablesRes[0].values.map(v => v[0]);
  console.log('\n[A1] TABLAS REGISTRADAS EN SQLITE (' + tables.length + ' tablas):');
  console.log(tables);

  console.log('\n[A2 & A8] ESTRUCTURA DETALLADA DE TABLAS, COLUMNAS Y CLAVES FORÁNEAS:');
  const schemaDump = [];

  for (const t of tables) {
    console.log('\n-------------------------------------------------------------');
    console.log(`TABLA: ${t}`);
    console.log('-------------------------------------------------------------');
    const cols = db.exec(`PRAGMA table_info(${t});`)[0];
    const colList = cols.values.map(v => ({
      cid: v[0],
      columna: v[1],
      tipo: v[2],
      notnull: v[3] === 1 ? 'NOT NULL' : 'NULL',
      default: v[4],
      pk: v[5] === 1 ? 'PK' : ''
    }));
    console.log('Columnas:');
    console.table(colList);

    const fks = db.exec(`PRAGMA foreign_key_list(${t});`);
    if (fks.length > 0 && fks[0].values.length > 0) {
      console.log('Claves Foráneas (FK):');
      const fkList = fks[0].values.map(v => ({
        id: v[0],
        tabla_destino: v[2],
        col_origen: v[3],
        col_destino: v[4],
        on_update: v[5],
        on_delete: v[6]
      }));
      console.table(fkList);
    } else {
      console.log('Claves Foráneas (FK): Ninguna');
    }

    schemaDump.push({ tabla: t, columnas: colList, fks: (fks.length > 0 ? fks[0].values : []) });
  }

  console.log('\n[A3] COMPROBACIÓN DE PRAGMA user_version:');
  const ver = db.exec('PRAGMA user_version;')[0].values[0][0];
  console.log(`PRAGMA user_version = ${ver}`);

  console.log('\n[A4] ÍNDICES SECUNDARIOS CREADOS:');
  const indexes = db.exec("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%';");
  if (indexes.length > 0 && indexes[0].values.length > 0) {
    console.table(indexes[0].values.map(v => ({ indice: v[0], tabla: v[1], definicion: v[2] })));
  }

  // Comprobar UNIQUE en resultado_resumen(ejecucion_id)
  console.log('\n[A4] RESTRICCIÓN UNIQUE EN resultado_resumen(ejecucion_id):');
  const unq = db.exec("PRAGMA index_list('resultado_resumen');");
  console.table(unq[0].values.map(v => ({ seq: v[0], name: v[1], unique: v[2], origin: v[3], partial: v[4] })));

  return schemaDump;
}

auditDER().catch(err => {
  console.error('Error en auditoría DER:', err);
  process.exit(1);
});
