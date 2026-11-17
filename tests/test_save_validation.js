/**
 * test_save_validation.js
 * Prueba para validar que saveCurrentSimulation no falle silenciosamente
 * y arroje errores explícitos cuando Mapper o sus ejecuciones falten.
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');

async function testSaveValidation() {
  console.log('--- Iniciando prueba de validación estricta de saveCurrentSimulation ---');

  const wasmBinary = fs.readFileSync(path.join(__dirname, '../vendor/sqljs/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  db.run(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));

  const DB = require('../js/db.js');
  const Mapper = require('../js/mapper.js');
  DB.setDB(db);

  let alertMessage = null;
  global.alert = (msg) => { alertMessage = msg; };
  global.window = {
    LAST: {
      r1: {
        num: { tdet: 1.2, xdet: 5, steps: 10, T: [0, 1], V: [5, 0], X: [0, 5] },
        D: 12.0,
        margen: 3.0,
        seguro: true
      }
    },
    alert: (msg) => { alertMessage = msg; },
    readForm: () => ({ v0: 5 })
  };
  global.document = {
    getElementById: () => ({ value: 'N' })
  };

  // 1. Caso: window.Mapper indefinido -> Debe mostrar error legible
  window.Mapper = undefined;
  alertMessage = null;
  await DB.saveCurrentSimulation();
  console.log(`[Test 1: Mapper indefinido] Mensaje recibido: "${alertMessage}"`);
  if (!alertMessage || !alertMessage.includes('Mapper no está cargado (window.Mapper indefinido)')) {
    throw new Error('No arrojó el error esperado para Mapper indefinido');
  }

  // 2. Caso: buildAllExecutions devuelve 0 ejecuciones -> Debe arrojar error
  window.Mapper = {
    toDbEscenario: () => 'NORMAL',
    buildAllExecutions: () => []
  };
  alertMessage = null;
  await DB.saveCurrentSimulation();
  console.log(`[Test 2: 0 ejecuciones] Mensaje recibido: "${alertMessage}"`);
  if (!alertMessage || !alertMessage.includes('buildAllExecutions devolvió 0 ejecuciones')) {
    throw new Error('No arrojó el error esperado para 0 ejecuciones');
  }

  // 3. Caso: totalSims === 0 -> Si por alguna razón ninguna ejecución entra a los casos
  // Por ejemplo, allExecutions tiene un elemento pero casesMap no tiene ejecuciones
  // Para forzar totalSims === 0 de manera limpia en la prueba, podemos sobrescribir Object.keys temporalmente o verificar la condición
  const origKeys = Object.keys;
  Object.keys = (obj) => {
    if (obj && obj[1] && obj[1].ejecs) return []; // simular casos vacíos
    return origKeys(obj);
  };
  window.Mapper = {
    toDbEscenario: () => 'NORMAL',
    buildAllExecutions: () => [{ caso_id: 1, metodo: 'Test' }]
  };
  alertMessage = null;
  await DB.saveCurrentSimulation();
  Object.keys = origKeys;

  console.log(`[Test 3: totalSims === 0] Mensaje recibido: "${alertMessage}"`);
  if (!alertMessage || !alertMessage.includes('No se guardó ninguna simulación')) {
    throw new Error('No arrojó el error esperado cuando no se guarda ninguna simulación');
  }

  // 4. Caso exitoso: Mapper real expuesto en window.Mapper
  window.Mapper = Mapper;
  alertMessage = null;
  await DB.saveCurrentSimulation();
  console.log(`[Test 4: Exitoso] Mensaje recibido: "${alertMessage}"`);
  if (!alertMessage || !alertMessage.includes('Guardado completado exitosamente')) {
    throw new Error('Falló el guardado exitoso con window.Mapper cargado');
  }

  console.log('✔ Todas las validaciones de saveCurrentSimulation pasaron satisfactoriamente.');
}

testSaveValidation().catch(e => {
  console.error('Error en testSaveValidation:', e);
  process.exit(1);
});
