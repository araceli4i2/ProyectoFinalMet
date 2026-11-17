const fs = require('fs');
const path = require('path');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');

async function runTests() {
  console.log('=== TEST DE PERSISTENCIA RELACIONAL (SQLite / sql.js) ===\n');

  const wasmBinary = fs.readFileSync(path.join(__dirname, '../vendor/sqljs/sql-wasm.wasm'));
  const SQL = await initSqlJs({
    wasmBinary: wasmBinary
  });

  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');

  console.log('1. Cargando y ejecutando db/schema.sql...');
  const schemaSql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  db.run(schemaSql);
  console.log('   -> schema.sql ejecutado exitosamente.');

  // Verificar que existen las 7 tablas requeridas
  const requiredTables = [
    'caso_estudio',
    'escenario',
    'simulacion',
    'ejecucion_metodo',
    'iteracion_resultado',
    'resultado_resumen',
    'serie_grafico'
  ];

  const resTables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
  const tableNames = resTables[0].values.map(r => r[0]);
  console.log('   Tablas encontradas:', tableNames.join(', '));

  for (const t of requiredTables) {
    if (!tableNames.includes(t)) {
      throw new Error(`Falta la tabla requerida: ${t}`);
    }
  }
  console.log('   -> Las 7 tablas del DER acordado existen en la BD.');

  // Verificar que caso_estudio tiene 4 filas
  const resCasos = db.exec('SELECT COUNT(*) FROM caso_estudio;');
  const numCasos = resCasos[0].values[0][0];
  console.log(`   Casos de estudio precargados: ${numCasos}`);
  if (numCasos !== 4) throw new Error(`Esperado 4 casos de estudio, obtenido ${numCasos}`);

  console.log('\n2. Cargando y ejecutando db/seed.sql...');
  const seedSql = fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8');
  db.run(seedSql);
  console.log('   -> seed.sql ejecutado exitosamente.');

  // Verificar escenarios
  const resEsc = db.exec('SELECT COUNT(*) FROM escenario;');
  const numEsc = resEsc[0].values[0][0];
  console.log(`   Escenarios insertados: ${numEsc} (esperado 12: 3 por módulo)`);
  if (numEsc !== 12) throw new Error(`Esperado 12 escenarios, obtenido ${numEsc}`);

  // Verificar simulaciones
  const resSim = db.exec('SELECT COUNT(*) FROM simulacion;');
  const numSim = resSim[0].values[0][0];
  console.log(`   Simulaciones en historial inicial: ${numSim} (esperado >= 4)`);
  if (numSim < 4) throw new Error(`Esperado al menos 4 simulaciones en el seed, obtenido ${numSim}`);

  // 3. Probar integridad referencial y ON DELETE CASCADE
  console.log('\n3. Verificando integridad referencial (Foreign Keys y CASCADE)...');
  
  // Insertar una simulación de prueba para borrarla
  db.run(`INSERT INTO simulacion (id, escenario_id, fecha, usuario_equipo, estado)
          VALUES (999, 1, '2026-11-16 12:00:00', 'Test User', 'COMPLETADO');`);
  db.run(`INSERT INTO ejecucion_metodo (id, simulacion_id, familia, metodo, convergio, estado)
          VALUES (999, 999, 'EDO', 'RK4 Test', 1, 'COMPLETADO');`);
  db.run(`INSERT INTO resultado_resumen (id, ejecucion_id, referencia, valor_json, metrica_error_json)
          VALUES (999, 999, 'Ref', '{}', '{}');`);
  db.run(`INSERT INTO serie_grafico (id, ejecucion_id, nombre, datos_json)
          VALUES (999, 999, 'Serie Test', '[]');`);

  // Al borrar simulacion 999, deben eliminarse ejecucion 999, resumen 999 y serie 999
  db.run('DELETE FROM simulacion WHERE id = 999;');
  const checkEjec = db.exec('SELECT COUNT(*) FROM ejecucion_metodo WHERE id = 999;')[0].values[0][0];
  const checkRes = db.exec('SELECT COUNT(*) FROM resultado_resumen WHERE id = 999;')[0].values[0][0];
  const checkSer = db.exec('SELECT COUNT(*) FROM serie_grafico WHERE id = 999;')[0].values[0][0];

  if (checkEjec !== 0 || checkRes !== 0 || checkSer !== 0) {
    throw new Error('ON DELETE CASCADE falló en alguna tabla dependiente.');
  }
  console.log('   -> ON DELETE CASCADE opera correctamente.');

  // Probar restricción UNIQUE en resultado_resumen (relación 1:1)
  console.log('\n4. Verificando relación 1:1 en resultado_resumen...');
  let uniqueViolated = false;
  try {
    db.run(`INSERT INTO resultado_resumen (ejecucion_id, referencia, valor_json, metrica_error_json)
            VALUES (1, 'Duplicado', '{}', '{}');`);
  } catch (err) {
    uniqueViolated = true;
    console.log('   -> Restricción UNIQUE en ejecucion_id previene duplicados correctamente:', err.message);
  }
  if (!uniqueViolated) throw new Error('Se permitió insertar dos resultado_resumen para la misma ejecucion_id');

  // 5. Probar exportación binaria y persistencia
  console.log('\n5. Verificando exportación e importación binaria (.db)...');
  const binary = db.export();
  console.log(`   -> Binario exportado: ${binary.length} bytes.`);
  const dbReloaded = new SQL.Database(binary);
  dbReloaded.run('PRAGMA foreign_keys = ON;');
  const reloadedCount = dbReloaded.exec('SELECT COUNT(*) FROM simulacion;')[0].values[0][0];
  if (reloadedCount !== numSim) {
    throw new Error(`La base de datos recargada tiene ${reloadedCount} simulaciones, esperado ${numSim}`);
  }
  console.log(`   -> Base de datos recargada con éxito. Contiene ${reloadedCount} simulaciones persistidas.`);

  console.log('\n✅ TODOS LOS TESTS DE BASE DE DATOS Y ESQUEMA PASARON SATISFACTORIAMENTE.');
}

runTests().catch(err => {
  console.error('\n❌ ERROR EN TEST:', err);
  process.exit(1);
});
