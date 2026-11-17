/**
 * test_history_filters.js
 * Prueba unitaria y de integración para la barra de búsqueda y filtros reactivos del historial (Requisito 1).
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');

// Mock simple de DOM para entornos Node.js
class MockElement {
  constructor(id, value = '') {
    this.id = id;
    this.value = value;
    this.innerHTML = '';
  }
}

async function runTest() {
  console.log('--- Iniciando prueba de filtros y búsqueda del historial ---');

  const wasmBinary = fs.readFileSync(path.join(__dirname, '../vendor/sqljs/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  db.run(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  db.run(fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8'));

  // Cargar módulos DB y Mapper
  const DB = require('../js/db.js');
  const Mapper = require('../js/mapper.js');
  DB.setDB(db);

  // Insertar una simulación de usuario y una relanzada para probar todos los tipos
  db.run(`
    INSERT INTO simulacion (escenario_id, fecha, usuario_equipo, estado, coincide, diferencia_max, simulacion_origen_id)
    VALUES (1, '2026-11-20 15:30:00', 'Operador_Carlos', 'COMPLETADO', NULL, NULL, NULL);
  `);
  const userSimId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

  db.run(`
    INSERT INTO simulacion (escenario_id, fecha, usuario_equipo, estado, coincide, diferencia_max, simulacion_origen_id)
    VALUES (1, '2026-11-20 15:35:00', 'Sistema_Validador', 'COMPLETADO', 1, 0.0, ${userSimId});
  `);
  const relanSimId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

  // Configurar elementos Mock en global.document
  const elements = {
    histSearch: new MockElement('histSearch', ''),
    histModulo: new MockElement('histModulo', 'all'),
    histEscenario: new MockElement('histEscenario', 'all'),
    histEstado: new MockElement('histEstado', 'all'),
    histTipo: new MockElement('histTipo', 'all'),
    histFecha: new MockElement('histFecha', ''),
    tHistorial: new MockElement('tHistorial', '')
  };

  global.document = {
    getElementById: (id) => elements[id] || null
  };

  // 1. Render inicial sin filtros (debe mostrar 4 seed + 1 usuario + 1 relanzada = 6 filas)
  DB.renderHistory();
  let tableHtml = elements.tHistorial.innerHTML;
  let rowCount = (tableHtml.match(/<tr>/g) || []).length - 1; // restar header
  console.log(`[Test 1] Total de filas sin filtro: ${rowCount} (esperadas: 6)`);
  if (rowCount !== 6) throw new Error(`Esperadas 6 filas, obtenidas ${rowCount}`);

  // 2. Filtro por Módulo (M1 - Detención, caso_id = 1)
  elements.histModulo.value = '1';
  DB.renderHistory();
  tableHtml = elements.tHistorial.innerHTML;
  rowCount = (tableHtml.match(/<tr>/g) || []).length - 1;
  console.log(`[Test 2] Filtro módulo 1: ${rowCount} filas (esperadas: 3: seed M1, user M1, relan M1)`);
  if (rowCount !== 3) throw new Error(`Esperadas 3 filas para módulo 1, obtenidas ${rowCount}`);

  // 3. Filtro por Tipo: 'ejemplo'
  elements.histModulo.value = 'all';
  elements.histTipo.value = 'ejemplo';
  DB.renderHistory();
  tableHtml = elements.tHistorial.innerHTML;
  rowCount = (tableHtml.match(/<tr>/g) || []).length - 1;
  console.log(`[Test 3] Filtro tipo 'ejemplo': ${rowCount} filas (esperadas: 4)`);
  if (rowCount !== 4) throw new Error(`Esperadas 4 filas de ejemplo, obtenidas ${rowCount}`);

  // 4. Filtro por Tipo: 'usuario'
  elements.histTipo.value = 'usuario';
  DB.renderHistory();
  tableHtml = elements.tHistorial.innerHTML;
  rowCount = (tableHtml.match(/<tr>/g) || []).length - 1;
  console.log(`[Test 4] Filtro tipo 'usuario': ${rowCount} filas (esperadas: 1)`);
  if (rowCount !== 1 || !tableHtml.includes(`#${userSimId}`)) {
    throw new Error(`Esperada 1 fila de usuario con ID #${userSimId}`);
  }

  // 5. Filtro por Tipo: 'relanzada'
  elements.histTipo.value = 'relanzada';
  DB.renderHistory();
  tableHtml = elements.tHistorial.innerHTML;
  rowCount = (tableHtml.match(/<tr>/g) || []).length - 1;
  console.log(`[Test 5] Filtro tipo 'relanzada': ${rowCount} filas (esperadas: 1)`);
  if (rowCount !== 1 || !tableHtml.includes(`#${relanSimId}`)) {
    throw new Error(`Esperada 1 fila relanzada con ID #${relanSimId}`);
  }

  // 6. Filtro por Fecha (2026-11-20)
  elements.histTipo.value = 'all';
  elements.histFecha.value = '2026-11-20';
  DB.renderHistory();
  tableHtml = elements.tHistorial.innerHTML;
  rowCount = (tableHtml.match(/<tr>/g) || []).length - 1;
  console.log(`[Test 6] Filtro por fecha '2026-11-20': ${rowCount} filas (esperadas: 2)`);
  if (rowCount !== 2) throw new Error(`Esperadas 2 filas para fecha 2026-11-20, obtenidas ${rowCount}`);

  // 7. Búsqueda por texto: 'Carlos'
  elements.histFecha.value = '';
  elements.histSearch.value = 'Carlos';
  DB.renderHistory();
  tableHtml = elements.tHistorial.innerHTML;
  rowCount = (tableHtml.match(/<tr>/g) || []).length - 1;
  console.log(`[Test 7] Búsqueda por texto 'Carlos': ${rowCount} filas (esperadas: 1)`);
  if (rowCount !== 1 || !tableHtml.includes(`#${userSimId}`)) {
    throw new Error(`Búsqueda por texto 'Carlos' falló`);
  }

  // 8. Búsqueda por texto: 'viento' (M3)
  elements.histSearch.value = 'viento';
  DB.renderHistory();
  tableHtml = elements.tHistorial.innerHTML;
  rowCount = (tableHtml.match(/<tr>/g) || []).length - 1;
  console.log(`[Test 8] Búsqueda por texto 'viento': ${rowCount} filas (esperadas: 1)`);
  if (rowCount !== 1) throw new Error(`Búsqueda 'viento' esperaba 1 fila, obtuvo ${rowCount}`);

  // 9. Búsqueda que no arroja resultados
  elements.histSearch.value = 'Inexistente_12345';
  DB.renderHistory();
  console.log(`[Test 9] Búsqueda sin coincidencias muestra mensaje de vacío: ${elements.tHistorial.innerHTML.includes('No se encontraron simulaciones')}`);
  if (!elements.tHistorial.innerHTML.includes('No se encontraron simulaciones')) {
    throw new Error('Debe mostrar mensaje de vacío cuando ningún resultado coincide');
  }

  // 10. Limpiar filtros con DB.resetHistoryFilters()
  DB.resetHistoryFilters();
  tableHtml = elements.tHistorial.innerHTML;
  rowCount = (tableHtml.match(/<tr>/g) || []).length - 1;
  console.log(`[Test 10] Tras DB.resetHistoryFilters(): ${rowCount} filas (esperadas: 6)`);
  if (rowCount !== 6) throw new Error(`Esperadas 6 filas tras limpiar filtros, obtenidas ${rowCount}`);
  if (elements.histSearch.value !== '' || elements.histModulo.value !== 'all' || elements.histTipo.value !== 'all') {
    throw new Error('resetHistoryFilters() no restableció las propiedades de los inputs');
  }

  console.log('✔ Todas las pruebas de filtros y búsqueda del historial pasaron satisfactoriamente.');
}

runTest().catch(err => {
  console.error('Error en test_history_filters:', err);
  process.exit(1);
});
