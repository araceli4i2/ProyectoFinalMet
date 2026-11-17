const fs = require('fs');
const path = require('path');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');
const DB = require('../js/db.js');
const { loadEngine } = require('../tools/gen_seed.js');

function assert(cond, msg) {
  if (!cond) {
    console.error(`[AssertionError] ${msg}`);
    throw new Error(msg);
  }
}

async function runVersioningTest() {
  console.log('=== TEST DE VERSIONADO DE BASE DE DATOS Y ACTUALIZACIÓN DE EJEMPLOS (PRAGMA user_version) ===\n');

  const SQL = await initSqlJs({
    locateFile: file => path.join(__dirname, '../vendor/sqljs', file)
  });

  // 1. Simular una base antigua en versión 1 (v1)
  console.log('1. Creando base de datos simulada en versión antigua (v1)...');
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  const schemaSql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  db.run(schemaSql);
  db.run('PRAGMA user_version = 1;'); // Forzar versión 1 antigua

  // Insertar un escenario inicial para la simulación de ejemplo antigua
  db.run(`
    INSERT INTO escenario (id, caso_id, tipo, parametros_json, fuente_datos)
    VALUES (1, 1, 'NORMAL', '{"model":"const","v0":5,"a0":1.25}', 'Escenario v1 antiguo');
  `);

  // Insertar una simulación de ejemplo antigua
  db.run(`
    INSERT INTO simulacion (id, escenario_id, fecha, usuario_equipo, estado)
    VALUES (99, 1, '2026-11-01 08:00:00', 'EJEMPLO', 'COMPLETADO');
  `);
  db.run(`
    INSERT INTO ejecucion_metodo (id, simulacion_id, familia, metodo, convergio, estado)
    VALUES (991, 99, 'EDO', 'Metodo Antiguo Ejemplo', 1, 'COMPLETADO');
  `);

  // Insertar una simulación personal del usuario
  console.log('2. Insertando simulación personalizada del usuario (usuario_equipo = "Investigador UMSA")...');
  const userSimRes = DB.saveSimulationTransaction({
    escenario: {
      caso_id: 1,
      tipo: 'NORMAL',
      parametros_json: { v0: 8.5, tau: 0.9, dseg: 25 },
      fuente_datos: 'Medición personalizada del usuario'
    },
    simulacion: {
      fecha: '2026-11-17 15:30:00',
      usuario_equipo: 'Investigador UMSA',
      estado: 'COMPLETADO'
    },
    ejecuciones: [
      {
        familia: 'EDO',
        metodo: 'RK4 Personalizado',
        tolerancia: null,
        paso: 0.01,
        max_iter: 500,
        convergio: 1,
        estado: 'COMPLETADO',
        tiempo_ms: 1.2,
        resumen: {
          referencia: 'Propia',
          valor_json: { D_total: 18.45 },
          metrica_error_json: { error_rel: 1e-7 }
        },
        iteraciones: [
          { numero: 1, aproximacion_json: { v: 8.4 }, residual: 0.1, error_abs: 0.05, error_rel: 0.005 }
        ],
        series: [
          { nombre: 'curva_usuario', datos_json: '[{"x":0,"y":8.5},{"x":1,"y":0}]' }
        ]
      }
    ]
  }, db);

  const userSimId = userSimRes.simulacion_id;
  console.log(`   ✔ Simulación de usuario creada con ID #${userSimId}.`);

  // Verificar estado antes de actualizar
  const verBefore = db.exec('PRAGMA user_version;')[0].values[0][0];
  assert(verBefore === 1, `Versión antes de actualizar debe ser 1, obtenida: ${verBefore}`);
  const totalSimsBefore = db.exec('SELECT COUNT(*) FROM simulacion;')[0].values[0][0];
  assert(totalSimsBefore === 2, `Deben existir 2 simulaciones (ejemplo + usuario), obtenidas: ${totalSimsBefore}`);

  // 3. Ejecutar DB.upgradeExamples()
  console.log('3. Ejecutando DB.upgradeExamples() para migrar a v2 e instalar seed real...');
  const success = await DB.upgradeExamples(db);
  assert(success === true, 'upgradeExamples debe retornar true');

  // 4. Verificaciones posteriores a la actualización
  const verAfter = db.exec('PRAGMA user_version;')[0].values[0][0];
  console.log(`   • Versión posterior en SQLite: v${verAfter}`);
  assert(verAfter === 2, `Versión tras actualización DEBE ser 2, obtenida: ${verAfter}`);

  // Verificar que la simulación de ejemplo antigua (id=99) fue borrada
  const oldEjemploQuery = db.exec('SELECT COUNT(*) FROM simulacion WHERE id = 99;')[0].values[0][0];
  assert(oldEjemploQuery === 0, 'La simulación antigua id=99 debe haber sido eliminada');

  // Verificar que la simulación de usuario SIGUE EXACTAMENTE INTACTA
  console.log('4. Verificando integridad de la simulación de usuario...');
  const userSimCheck = DB.readSimulationFromDB(userSimId, db);
  assert(userSimCheck !== null, 'La simulación de usuario DEBE existir en la base');
  assert(userSimCheck.simulacion.usuario_equipo === 'Investigador UMSA', 'usuario_equipo intacto');
  assert(userSimCheck.ejecuciones.length === 1, 'Ejecuciones del usuario intactas');
  assert(userSimCheck.ejecuciones[0].metodo === 'RK4 Personalizado', 'Método intacto');
  assert(userSimCheck.ejecuciones[0].resumen.referencia === 'Propia', 'Resumen intacto');
  assert(userSimCheck.ejecuciones[0].iteraciones.length === 1, 'Iteraciones intactas');
  assert(userSimCheck.ejecuciones[0].series.length === 1, 'Series intactas');
  console.log('   ✔ Simulación de usuario conservada al 100% con ejecuciones, resumen, iteraciones y series intactas.');

  // 5. Verificar que los nuevos ejemplos del seed existen y son relanzables
  console.log('5. Verificando que las simulaciones de ejemplo v2 cargadas pueden relanzarse con éxito...');
  const engine = loadEngine();
  const ejemploSims = db.exec("SELECT id FROM simulacion WHERE usuario_equipo = 'EJEMPLO';")[0].values.map(v => v[0]);
  assert(ejemploSims.length === 4, `Deben existir 4 simulaciones de ejemplo en el seed, obtenidas: ${ejemploSims.length}`);

  for (const sId of ejemploSims) {
    const relRes = await DB.relaunchSimulation(sId, 1e-9, db, engine);
    assert(relRes.comparacion.coincide === true, `Simulación de ejemplo #${sId} debe coincidir al relanzar`);
    assert(relRes.comparacion.diferencia_max <= 1e-9, `Diferencia máxima en simulación #${sId} debe ser <= 1e-9`);
  }
  console.log('   ✔ Todas las simulaciones de ejemplo v2 relanzadas con coincide = 1 y diferencia_max <= 1e-9.');

  console.log('\n===============================================================');
  console.log('   TEST DE VERSIONADO (PRAGMA user_version) PASÓ CON ÉXITO (100%)');
  console.log('===============================================================\n');
}

runVersioningTest().catch(err => {
  console.error('\n❌ ERROR EN TEST DE VERSIONADO:', err);
  process.exit(1);
});
