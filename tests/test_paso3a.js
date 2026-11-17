const fs = require('fs');
const path = require('path');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');
const DB = require('../js/db.js');
const Mapper = require('../js/mapper.js');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[AssertionFailed] ${message}`);
  }
}

async function runPaso3ATests() {
  console.log('=== TEST DEL PASO 3A: GUARDADO TRANSACCIONAL Y ESCENARIOS INMUTABLES ===\n');

  const wasmBinary = fs.readFileSync(path.join(__dirname, '../vendor/sqljs/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');

  // Cargar esquema
  const schemaSql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  db.run(schemaSql);
  DB.setDB(db);

  function countRows(table) {
    const res = db.exec(`SELECT COUNT(*) FROM ${table};`);
    return res[0].values[0][0];
  }

  function getCounts() {
    return {
      caso_estudio: countRows('caso_estudio'),
      escenario: countRows('escenario'),
      simulacion: countRows('simulacion'),
      ejecucion_metodo: countRows('ejecucion_metodo'),
      iteracion_resultado: countRows('iteracion_resultado'),
      resultado_resumen: countRows('resultado_resumen'),
      serie_grafico: countRows('serie_grafico')
    };
  }

  console.log('1. Conteo inicial tras schema.sql:');
  console.log(getCounts());
  assert(countRows('caso_estudio') === 4, 'caso_estudio debe tener 4 filas precargadas');
  assert(countRows('escenario') === 0, 'escenario debe iniciar vacío');
  assert(countRows('simulacion') === 0, 'simulacion debe iniciar vacía');

  // --- TEST 1: Guardado exitoso y verificación en las 7 tablas ---
  console.log('\n2. Probando guardado transaccional exitoso (todas las familias y 7 tablas)...');

  const payload1 = {
    escenario: {
      caso_id: 1,
      tipo: 'NORMAL',
      parametros_json: { v0: 5.0, a0: 1.25, dseg: 15.0, h: 0.05 },
      fuente_datos: 'Test Unitario Paso 3A'
    },
    simulacion: {
      fecha: '2026-11-16 22:00:00',
      usuario_equipo: 'Test Suite Node',
      estado: 'COMPLETADO',
      coincide: 1,
      diferencia_max: 0.0,
      tol_comparacion: 0.001
    },
    ejecuciones: [
      {
        familia: 'EDO',
        metodo: 'Runge-Kutta 4',
        paso: 0.05,
        max_iter: 200,
        convergio: true,
        estado: 'COMPLETADO',
        tiempo_ms: 1.2,
        iteraciones: [],
        resumen: {
          referencia: 'Solución analítica',
          valor_json: JSON.stringify({ D_total: 12.0, t_det: 4.0, seguro: true }),
          metrica_error_json: JSON.stringify({ error_t: 0.0, error_x: 0.0 }),
          conclusion_numerica: 'RK4 reproduce orden O(h^4).',
          conclusion_problema: 'Operación segura bajo D_seg.'
        },
        series: [
          { nombre: 'M1_velocidad_rk4', puntos: [{ x: 0, y: 5.0 }, { x: 4, y: 0.0 }] },
          { nombre: 'M1_posicion_rk4', puntos: [{ x: 0, y: 0.0 }, { x: 4, y: 10.0 }] }
        ]
      },
      {
        familia: 'SISTEMAS_LINEALES',
        metodo: 'Gradiente conjugado',
        tolerancia: 1e-6,
        max_iter: 50000,
        convergio: true,
        estado: 'CONVERGIO',
        tiempo_ms: 0.35,
        iteraciones: [
          { numero: 0, aproximacion_json: JSON.stringify([0, 0, 0, 0]), residual: 1.5, error_abs: null, error_rel: null },
          { numero: 1, aproximacion_json: JSON.stringify([1.1, 1.9, 1.4, 0.7]), residual: 0.2, error_abs: null, error_rel: null },
          { numero: 4, aproximacion_json: JSON.stringify([2.0, 3.0, 2.5, 1.5]), residual: 1e-16, error_abs: 0.0, error_rel: 0.0 }
        ],
        resumen: {
          referencia: 'x*=[2, 3, 2.5, 1.5]',
          valor_json: JSON.stringify({ iteraciones: 4, residual: 1e-16 }),
          metrica_error_json: JSON.stringify({ error_inf: 1e-16, error_rel: 0.0 }),
          conclusion_numerica: 'Gradiente conjugado converge en 4 iteraciones exactas.',
          conclusion_problema: 'Presiones electrohidráulicas balanceadas.'
        },
        series: [
          { nombre: 'M1_residual_gradiente_conjugado', puntos: [{ x: 0, y: 1.5 }, { x: 1, y: 0.2 }, { x: 4, y: 1e-16 }] }
        ]
      }
    ]
  };

  const res1 = DB.saveSimulationTransaction(payload1, db);
  assert(res1.success === true, 'Guardado reporta éxito');
  assert(res1.simulacion_id === 1, 'Simulación ID debe ser 1');
  assert(res1.escenario_id === 1, 'Escenario ID debe ser 1');

  const counts1 = getCounts();
  console.log('   Conteo tras guardar simulación 1:');
  console.log(counts1);

  assert(counts1.caso_estudio === 4, '4 casos de estudio');
  assert(counts1.escenario === 1, '1 escenario');
  assert(counts1.simulacion === 1, '1 simulacion');
  assert(counts1.ejecucion_metodo === 2, '2 ejecuciones');
  assert(counts1.iteracion_resultado === 3, '3 iteraciones');
  assert(counts1.resultado_resumen === 2, '2 filas de resumen (1 por ejecución)');
  assert(counts1.serie_grafico === 3, '3 series de gráfico registradas');
  console.log('   -> Verificación en las 7 tablas satisfactoria.');


  // --- TEST 2: Prueba de ROLLBACK en fallo a mitad de transacción ---
  console.log('\n3. Probando atomicidad y ROLLBACK ante error en mitad de la transacción...');

  const countsBeforeFail = getCounts();

  const payloadFalla = {
    escenario: {
      caso_id: 1,
      tipo: 'NORMAL',
      parametros_json: { v0: 5.0, a0: 1.25, dseg: 15.0, h: 0.05 }
    },
    simulacion: {
      fecha: '2026-11-16 22:05:00',
      estado: 'COMPLETADO'
    },
    ejecuciones: [
      {
        familia: 'EDO',
        metodo: 'Método válido previo al error',
        convergio: true,
        estado: 'COMPLETADO',
        resumen: {
          referencia: 'OK',
          valor_json: '{}',
          metrica_error_json: '{}'
        },
        series: [{ nombre: 'M1_serie_valida', puntos: [{ x: 1, y: 1 }] }]
      },
      {
        // Esta ejecución viola el CHECK constraint de estado en SQLite
        familia: 'EDO',
        metodo: 'Metodo Fallido',
        convergio: true,
        estado: 'ESTADO_INVALIDO_VIOLA_CHECK'
      }
    ]
  };

  let errorDisparado = false;
  try {
    DB.saveSimulationTransaction(payloadFalla, db);
  } catch (err) {
    errorDisparado = true;
    console.log(`   -> Error capturado correctamente: ${err.message}`);
  }

  assert(errorDisparado === true, 'La transacción debió lanzar una excepción');
  const countsAfterFail = getCounts();
  console.log('   Conteos tras intento fallido con ROLLBACK:');
  console.log(countsAfterFail);

  assert(countsAfterFail.simulacion === countsBeforeFail.simulacion, 'No deben quedar simulaciones parciales');
  assert(countsAfterFail.ejecucion_metodo === countsBeforeFail.ejecucion_metodo, 'No deben quedar ejecuciones parciales');
  assert(countsAfterFail.iteracion_resultado === countsBeforeFail.iteracion_resultado, 'No deben quedar iteraciones parciales');
  assert(countsAfterFail.resultado_resumen === countsBeforeFail.resultado_resumen, 'No deben quedar resúmenes parciales');
  assert(countsAfterFail.serie_grafico === countsBeforeFail.serie_grafico, 'No deben quedar series parciales');
  console.log('   -> Atomicidad verificada: ROLLBACK no dejó ninguna fila huérfana o parcial.');


  // --- TEST 3: Escenarios inmutables y reutilización por parámetros idénticos ---
  console.log('\n4. Probando regla de escenarios inmutables...');

  // 3a. Mismos parámetros en distinto orden de claves -> debe REUTILIZAR escenario_id = 1
  const payloadReutilizar = {
    escenario: {
      caso_id: 1,
      tipo: 'NORMAL',
      parametros_json: { h: 0.05, dseg: 15.0, a0: 1.25, v0: 5.0 } // claves desordenadas
    },
    simulacion: {
      fecha: '2026-11-16 22:10:00',
      estado: 'COMPLETADO'
    },
    ejecuciones: [
      {
        familia: 'EDO',
        metodo: 'Segunda corrida',
        convergio: true,
        estado: 'COMPLETADO'
      }
    ]
  };

  const resReutil = DB.saveSimulationTransaction(payloadReutilizar, db);
  assert(resReutil.escenario_id === 1, `Debe reutilizar escenario_id = 1 (obtenido ${resReutil.escenario_id})`);
  assert(countRows('escenario') === 1, 'No debe crearse nueva fila en escenario cuando los parámetros son idénticos');
  assert(countRows('simulacion') === 2, 'Debe crearse una nueva simulación (#2) enlazada al mismo escenario');
  console.log('   -> Parámetros idénticos reutilizan escenario_id existente.');

  // 3b. Parámetros alterados -> debe crear un NUEVO escenario_id = 2, sin UPDATE del anterior
  const payloadNuevoEscenario = {
    escenario: {
      caso_id: 1,
      tipo: 'NORMAL',
      parametros_json: { v0: 7.5, a0: 1.25, dseg: 15.0, h: 0.05 } // v0 cambió a 7.5
    },
    simulacion: {
      fecha: '2026-11-16 22:15:00',
      estado: 'COMPLETADO'
    },
    ejecuciones: [
      {
        familia: 'EDO',
        metodo: 'Corrida modificada',
        convergio: true,
        estado: 'COMPLETADO'
      }
    ]
  };

  const resNuevo = DB.saveSimulationTransaction(payloadNuevoEscenario, db);
  assert(resNuevo.escenario_id !== 1, 'Debe crear un NUEVO escenario_id distinto de 1');
  assert(resNuevo.escenario_id === 2, `Nuevo escenario debe tener id = 2 (obtenido ${resNuevo.escenario_id})`);
  assert(countRows('escenario') === 2, 'La tabla escenario debe tener ahora 2 filas');

  // Verificar que el escenario 1 original no fue modificado en la base
  const esc1Row = db.exec('SELECT parametros_json FROM escenario WHERE id = 1;')[0].values[0][0];
  const esc1Parsed = JSON.parse(esc1Row);
  assert(esc1Parsed.v0 === 5.0, 'El escenario original permanece inmutable (v0 = 5.0 intacto)');
  console.log('   -> Parámetros modificados crearon nuevo escenario; escenario original intacto (Inmutabilidad garantizada).');


  // --- TEST 4: Series genéricas y números sin redondear ---
  console.log('\n5. Probando series genéricas y precisión numérica unrounded...');

  const numExacto = 12.345678901234567;
  const payloadSeries = {
    escenario: { id: 1 },
    simulacion: { fecha: '2026-11-16 22:20:00', estado: 'COMPLETADO' },
    ejecuciones: [
      {
        familia: 'RAICES',
        metodo: 'Newton-Raphson',
        convergio: true,
        estado: 'CONVERGIO',
        series: [
          { nombre: 'M2_deterioro_curva', puntos: [{ x: 1.1111111111, y: numExacto }] },
          { nombre: 'M2_sensibilidad_sweep', puntos: [{ x: 1e-4, y: 497.518607123 }] }
        ]
      }
    ]
  };

  DB.saveSimulationTransaction(payloadSeries, db);
  const resSerie = db.exec("SELECT nombre, datos_json FROM serie_grafico WHERE nombre = 'M2_deterioro_curva';");
  assert(resSerie && resSerie.length, 'Serie guardada encontrada');
  const datosJsonGuardados = resSerie[0].values[0][1];
  const puntosGuardados = JSON.parse(datosJsonGuardados);
  assert(puntosGuardados[0].y === numExacto, 'El número en punto flotante no fue redondeado artificialmente');
  console.log(`   -> Preservación bit-exacta verificada: ${puntosGuardados[0].y} === ${numExacto}`);

  console.log('\n✅ TODOS LOS TESTS DEL PASO 3A PASARON SATISFACTORIAMENTE.');
}

runPaso3ATests().catch(err => {
  console.error('\n❌ ERROR EN LOS TESTS DEL PASO 3A:', err);
  process.exit(1);
});
