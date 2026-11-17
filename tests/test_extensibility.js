/**
 * test_extensibility.js
 * Prueba automatizada para verificar la extensibilidad del guardado
 * con nuevas familias (e.g. INTEGRACION) y nuevos métodos (e.g. Secante, Simpson 1/3)
 * sin modificar el esquema relacional de SQLite.
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');

async function runExtensibilityTest() {
  console.log('--- Iniciando prueba de extensibilidad sin cambio de esquema ---');

  const wasmBinary = fs.readFileSync(path.join(__dirname, '../vendor/sqljs/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  db.run(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  db.run(fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8'));

  const DB = require('../js/db.js');
  const Mapper = require('../js/mapper.js');
  DB.setDB(db);

  // 1. Simular resultados con métodos extendidos mediante results.extraExecutions
  const mockResults = {
    r1: null,
    r2: null,
    r3: null,
    r4: null,
    extraExecutions: [
      {
        caso_id: 1,
        familia: 'INTEGRACION',
        metodo: 'Simpson 1/3 Compuesto',
        tolerancia: null,
        paso: 0.02,
        max_iter: 100,
        convergio: true,
        estado: 'COMPLETADO',
        tiempo_ms: 1.5,
        iteraciones: [],
        resumen: {
          referencia: 'Solución Analítica',
          valor_json: JSON.stringify({ integral: 45.678, energia: 1200 }),
          metrica_error_json: JSON.stringify({ error_truncamiento: 1.2e-6 }),
          conclusion_numerica: 'Regla de Simpson de orden O(h^4).',
          conclusion_problema: 'Energía disipada dentro de límites seguros.'
        },
        series: [
          {
            nombre: 'M1_integracion_simpson',
            datos_json: JSON.stringify([{ x: 0, y: 0 }, { x: 1, y: 45.678 }])
          }
        ]
      },
      {
        caso_id: 2,
        familia: 'RAICES',
        metodo: 'Método de la Secante',
        tolerancia: 1e-8,
        paso: null,
        max_iter: 50,
        convergio: true,
        estado: 'CONVERGIO',
        tiempo_ms: 2.1,
        iteraciones: [
          {
            numero: 0,
            aproximacion_json: JSON.stringify({ x: 8.0, fx: 0.05 }),
            residual: 0.05,
            error_abs: null,
            error_rel: null
          },
          {
            numero: 1,
            aproximacion_json: JSON.stringify({ x: 8.5078, fx: 1e-9 }),
            residual: 1e-9,
            error_abs: 0.5078,
            error_rel: 0.059
          }
        ],
        resumen: {
          referencia: 'Vieta Estable',
          valor_json: JSON.stringify({ t_star: 8.5078, iteraciones: 2 }),
          metrica_error_json: JSON.stringify({ error_rel: 1e-9 }),
          conclusion_numerica: 'Secante converge superlinealmente.',
          conclusion_problema: 'Cruce del umbral detectado con alta velocidad.'
        },
        series: []
      }
    ]
  };

  // 2. Extraer ejecuciones con Mapper.buildAllExecutions
  const executions = Mapper.buildAllExecutions(mockResults, { m1: {}, m2: {} });
  console.log(`Ejecuciones extraídas por Mapper: ${executions.length}`);
  if (executions.length !== 2) {
    throw new Error(`Esperadas 2 ejecuciones, obtenidas ${executions.length}`);
  }

  // 3. Guardar en SQLite mediante DB.saveSimulationTransaction
  const saveRes = DB.saveSimulationTransaction({
    escenario: {
      caso_id: 1,
      tipo: 'NORMAL',
      parametros_json: JSON.stringify({ m1: { v0: 5 } }),
      fuente_datos: 'interfaz'
    },
    simulacion: {
      usuario_equipo: 'Investigador_Extensible',
      estado: 'COMPLETADO',
      fecha: '2026-11-20 16:00:00'
    },
    ejecuciones: executions
  });

  console.log(`Simulación extendida guardada exitosamente con ID #${saveRes.simulacion_id}`);

  // 4. Consultar SQLite para verificar las filas insertadas
  const rows = db.exec(`
    SELECT e.id, e.familia, e.metodo, e.estado, r.referencia, s.nombre AS serie_nombre
    FROM ejecucion_metodo e
    LEFT JOIN resultado_resumen r ON r.ejecucion_id = e.id
    LEFT JOIN serie_grafico s ON s.ejecucion_id = e.id
    WHERE e.simulacion_id = ${saveRes.simulacion_id}
    ORDER BY e.id ASC;
  `)[0].values;

  console.log('Filas insertadas en SQLite para la nueva simulación:');
  console.table(rows);

  const fams = rows.map(r => r[1]);
  if (!fams.includes('INTEGRACION') || !fams.includes('RAICES')) {
    throw new Error('No se encontraron las familias INTEGRACION y RAICES en la base de datos');
  }

  const itCount = db.exec(`
    SELECT COUNT(*) FROM iteracion_resultado i
    JOIN ejecucion_metodo e ON i.ejecucion_id = e.id
    WHERE e.simulacion_id = ${saveRes.simulacion_id};
  `)[0].values[0][0];

  console.log(`Iteraciones registradas para el nuevo método Secante: ${itCount} (esperadas: 2)`);
  if (itCount !== 2) {
    throw new Error(`Esperadas 2 iteraciones, obtenidas ${itCount}`);
  }

  console.log('✔ La prueba de extensibilidad confirmó que nuevos métodos y familias se guardan sin tocar el esquema SQL.');
}

runExtensibilityTest().catch(err => {
  console.error('Error en test_extensibility:', err);
  process.exit(1);
});
