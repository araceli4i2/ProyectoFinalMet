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

async function runPaso3BTests() {
  console.log('=== TEST DEL PASO 3B: ABRIR SIMULACIÓN (SOLO LECTURA, SIN RECÁLCULO) ===\n');

  const wasmBinary = fs.readFileSync(path.join(__dirname, '../vendor/sqljs/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');

  const schemaSql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  db.run(schemaSql);
  const seedSql = fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8');
  db.run(seedSql);

  DB.setDB(db);

  // Mock de entorno DOM para verificar que la pantalla / helpers reciben los datos
  const domElements = {};
  const mock$ = id => domElements[id] || (domElements[id] = { innerHTML: '', value: '', style: {}, textContent: '', disabled: false, closest: () => null });
  global.document = {
    getElementById: mock$,
    querySelectorAll: selector => {
      // Retorna lista de elementos simulados
      return [mock$('scen'), mock$('m1_v0'), mock$('m1_a0')];
    }
  };
  global.window = {
    IS_QUERY_MODE: false,
    Mapper: Mapper,
    chart: (id, type, datasets) => {
      domElements['chart_' + id] = { type, datasets };
    },
    setForm: (mod, params) => {
      domElements['form_' + mod] = params;
    },
    recalcAll: () => {
      domElements['recalc_called'] = true;
    }
  };

  // --- TEST 1: Abrir simulación existente del seed (sin recálculo) ---
  console.log('1. Probando apertura de simulación #1 desde SQLite...');
  const sim1 = DB.loadSimulation(1, db);

  assert(sim1 !== null, 'Simulación #1 debe cargarse exitosamente');
  assert(sim1.simulacion.id === 1, 'ID de simulación debe ser 1');
  assert(sim1.escenario.tipo === 'NORMAL', 'Escenario debe ser NORMAL');
  assert(DB.getQueryMode() === true, 'Debe activar isQueryMode = true');
  assert(global.window.IS_QUERY_MODE === true, 'window.IS_QUERY_MODE debe ser true');
  assert(domElements['queryModeBanner'].style.display === 'flex', 'El banner debe estar visible');
  assert(domElements['querySimId'].textContent === 1, 'El banner debe indicar simulación #1');
  console.log('   -> Banner y modo consulta activados correctamente.');

  console.log('   -> Verificando redibujado de gráficos para Módulo 1 (#1)...');
  assert(domElements['chart_c1'], 'El gráfico c1 debe haberse redibujado para M1');
  assert(domElements['chart_c2'], 'El gráfico c2 debe haberse redibujado para M1');
  domElements['chart_c1'].datasets.forEach(ds => {
    console.log(`      c1 [${ds.label}]: ${ds.data.length} puntos`);
    assert(ds.data && ds.data.length > 0, `c1 [${ds.label}] debe tener puntos`);
  });
  domElements['chart_c2'].datasets.forEach(ds => {
    console.log(`      c2 [${ds.label}]: ${ds.data.length} puntos`);
    assert(ds.data && ds.data.length > 0, `c2 [${ds.label}] debe tener puntos`);
  });

  // Verificando que Abrir redibuja los gráficos de M2, M3 y M4 desde serie_grafico
  console.log('   -> Verificando redibujado de gráficos para Módulo 2 (#2)...');
  const sim2 = DB.loadSimulation(2, db);
  assert(sim2 !== null, 'Simulación #2 debe cargarse');
  assert(domElements['chart_c4'], 'c4 (deterioro) debe haberse redibujado para M2');
  assert(domElements['chart_c5'], 'c5 (sensibilidad) debe haberse redibujado para M2');
  domElements['chart_c4'].datasets.forEach(ds => {
    console.log(`      c4 [${ds.label}]: ${ds.data.length} puntos`);
    assert(ds.data && ds.data.length > 0, `c4 [${ds.label}] debe tener puntos`);
  });
  domElements['chart_c5'].datasets.forEach(ds => {
    console.log(`      c5 [${ds.label}]: ${ds.data.length} puntos`);
    assert(ds.data && ds.data.length > 0, `c5 [${ds.label}] debe tener puntos`);
  });

  console.log('   -> Verificando redibujado de gráficos para Módulo 3 (#3)...');
  const sim3 = DB.loadSimulation(3, db);
  assert(sim3 !== null, 'Simulación #3 debe cargarse');
  assert(domElements['chart_c6'], 'c6 (resonancia) debe haberse redibujado para M3');
  assert(domElements['chart_c7'], 'c7 (oscilación) debe haberse redibujado para M3');
  domElements['chart_c6'].datasets.forEach(ds => {
    console.log(`      c6 [${ds.label}]: ${ds.data.length} puntos`);
    assert(ds.data && ds.data.length > 0, `c6 [${ds.label}] debe tener puntos`);
  });
  domElements['chart_c7'].datasets.forEach(ds => {
    console.log(`      c7 [${ds.label}]: ${ds.data.length} puntos`);
    assert(ds.data && ds.data.length > 0, `c7 [${ds.label}] debe tener puntos`);
  });

  console.log('   -> Verificando redibujado de gráficos para Módulo 4 (#4)...');
  const sim4 = DB.loadSimulation(4, db);
  assert(sim4 !== null, 'Simulación #4 debe cargarse');
  assert(domElements['chart_c8'], 'c8 (ajuste) debe haberse redibujado para M4');
  assert(domElements['chart_c9'], 'c9 (interpolación) debe haberse redibujado para M4');
  assert(domElements['chart_c12'], 'c12 (barrido) debe haberse redibujado para M4');
  domElements['chart_c8'].datasets.forEach(ds => {
    console.log(`      c8 [${ds.label}]: ${ds.data.length} puntos`);
    assert(ds.data && ds.data.length > 0, `c8 [${ds.label}] debe tener puntos`);
  });
  domElements['chart_c9'].datasets.forEach(ds => {
    console.log(`      c9 [${ds.label}]: ${ds.data.length} puntos`);
    assert(ds.data && ds.data.length > 0, `c9 [${ds.label}] debe tener puntos`);
  });
  domElements['chart_c12'].datasets.forEach(ds => {
    console.log(`      c12 [${ds.label}]: ${ds.data.length} puntos`);
    assert(ds.data && ds.data.length > 0, `c12 [${ds.label}] debe tener puntos`);
  });

  // Restaurar simulación #1 para los siguientes tests
  DB.loadSimulation(1, db);


  // --- TEST 2: Prueba que demuestra que NO recalcula ---
  console.log('\n2. Probando que NO recalcula (modificación manual en la base)...');
  // En la simulación 1, el valor guardado de D_total es 12.00
  // Modificamos a mano en SQLite el valor_json a D_total = 99.99
  const originalResumen = db.exec("SELECT valor_json FROM resultado_resumen WHERE ejecucion_id = 1;")[0].values[0][0];
  const modificadoResumen = JSON.stringify({ D_total: 99.99, t_det: 4.00, seguro: false });

  db.run("UPDATE resultado_resumen SET valor_json = ? WHERE ejecucion_id = 1;", [modificadoResumen]);

  // Cargamos la simulación #1
  const simModificada = DB.loadSimulation(1, db);
  const rk4Ej = simModificada.ejecuciones.find(e => e.metodo === 'Runge-Kutta 4');
  const valJsonParsed = JSON.parse(rk4Ej.resumen.valor_json);

  assert(valJsonParsed.D_total === 99.99, `Debe mostrar 99.99 leído directamente de la BD (obtenido ${valJsonParsed.D_total})`);
  assert(domElements['k1'].innerHTML.includes('99.99'), 'El DOM de KPIs muestra el valor 99.99 modificado en la BD');
  console.log(`   -> Valor en pantalla: D_total = ${valJsonParsed.D_total} m (modificado manualmente).`);
  console.log('   -> Comprobado: NO recalculó (de haber recalculado daría 12.00 m con v0=5, a0=1.25).');

  // Restaurar el valor original en la base de datos
  db.run("UPDATE resultado_resumen SET valor_json = ? WHERE ejecucion_id = 1;", [originalResumen]);
  const simRestaurada = DB.loadSimulation(1, db);
  const valRestaurado = JSON.parse(simRestaurada.ejecuciones.find(e => e.metodo === 'Runge-Kutta 4').resumen.valor_json);
  assert(valRestaurado.D_total === 12.0, 'Valor original restaurado a 12.0');
  console.log('   -> Valor original restaurado con éxito.');


  // --- TEST 3: Prueba de cierre y recarga desde binario exportado ---
  console.log('\n3. Probando persistencia tras cierre y reapertura con binario exportado...');
  // Guardamos una nueva simulación de prueba #5
  const payloadTest = {
    escenario: {
      caso_id: 2,
      tipo: 'NORMAL',
      parametros_json: { D0: 0.10, alpha: 0.015, beta: 0.001, Du: 0.30, tmax: 20 },
      fuente_datos: 'Test Cierre Paso 3B'
    },
    simulacion: {
      fecha: '2026-11-16 22:30:00',
      usuario_equipo: 'Tester SQLite',
      estado: 'COMPLETADO',
      coincide: 1,
      diferencia_max: 0.0
    },
    ejecuciones: [
      {
        familia: 'RAICES',
        metodo: 'Newton-Raphson',
        tolerancia: 1e-8,
        convergio: true,
        estado: 'CONVERGIO',
        resumen: {
          referencia: 'Vieta',
          valor_json: JSON.stringify({ t_star: 8.5078125, sensibilidad: 31.2348 }),
          metrica_error_json: JSON.stringify({ residuo: 0.0 })
        },
        series: [
          { nombre: 'M2_deterioro_curva', puntos: [{ x: 0, y: 0.1 }, { x: 8.5078, y: 0.3 }] }
        ]
      }
    ]
  };

  const saveRes = DB.saveSimulationTransaction(payloadTest, db);
  const newSimId = saveRes.simulacion_id;
  console.log(`   -> Simulación de prueba #${newSimId} guardada.`);

  // Exportar binario y cerrar conexión
  const binaryExportado = db.export();
  assert(binaryExportado instanceof Uint8Array, 'Exporta binario Uint8Array');
  assert(binaryExportado.length > 0, 'Binario exportado no está vacío');

  // Abrir NUEVA conexión con el binario exportado
  const dbNueva = new SQL.Database(binaryExportado);
  dbNueva.run('PRAGMA foreign_keys = ON;');
  DB.setDB(dbNueva);

  // Cargar simulación desde la nueva conexión
  const simCargadaNueva = DB.loadSimulation(newSimId, dbNueva);
  assert(simCargadaNueva !== null, 'Simulación debe cargarse en la nueva conexión');
  assert(simCargadaNueva.simulacion.id === newSimId, 'ID coincide');
  assert(simCargadaNueva.simulacion.usuario_equipo === 'Tester SQLite', 'Usuario coincide');
  const nrEj = simCargadaNueva.ejecuciones[0];
  assert(nrEj.metodo === 'Newton-Raphson', 'Método coincide');
  const valNr = JSON.parse(nrEj.resumen.valor_json);
  assert(valNr.t_star === 8.5078125, 'Valor de t_star idéntico');
  assert(nrEj.series.length === 1, 'Serie de deterioro presente');
  console.log('   -> Cierre y recarga con binario exportado exitosa: datos 100% idénticos.');


  // --- TEST 4: Simulación sin series (aviso claro, cero errores) ---
  console.log('\n4. Probando manejo de simulación sin series en serie_grafico...');
  const payloadSinSeries = {
    escenario: { id: 1 },
    simulacion: { fecha: '2026-11-16 22:35:00', estado: 'COMPLETADO' },
    ejecuciones: [
      {
        familia: 'EDO',
        metodo: 'MetodoSinSeries',
        convergio: true,
        estado: 'COMPLETADO',
        resumen: { referencia: 'N/A', valor_json: '{}', metrica_error_json: '{}' },
        series: [] // Cero series
      }
    ]
  };

  const resSinSeries = DB.saveSimulationTransaction(payloadSinSeries, dbNueva);
  let sinError = true;
  let loadedSinSeries = null;
  try {
    loadedSinSeries = DB.loadSimulation(resSinSeries.simulacion_id, dbNueva);
  } catch (err) {
    sinError = false;
  }

  assert(sinError === true, 'No debe arrojar ningún error al faltar series');
  assert(loadedSinSeries !== null, 'Carga simulación sin series');
  assert(loadedSinSeries.ejecuciones[0].series.length === 0, 'La lista de series está vacía');
  assert(domElements['queryBannerNotice'].style.display === 'block', 'El aviso visible de series faltantes debe mostrarse en pantalla');
  assert(domElements['queryBannerNotice'].innerHTML.includes('Esta simulación no incluye series para gráficos'), 'El texto de aviso en banner debe indicar que no incluye series');
  console.log('   -> Aviso visible en pantalla comprobado: ' + domElements['queryBannerNotice'].innerHTML);
  console.log('   -> Simulación sin series manejada limpiamente sin errores.');


  // --- TEST 5: Salir del Modo Consulta (restablecimiento reactivo) ---
  console.log('\n5. Probando salida del modo consulta (exitQueryMode)...');
  DB.exitQueryMode();
  assert(DB.getQueryMode() === false, 'isQueryMode debe volver a false');
  assert(global.window.IS_QUERY_MODE === false, 'window.IS_QUERY_MODE debe volver a false');
  assert(domElements['queryModeBanner'].style.display === 'none', 'El banner debe ocultarse');
  assert(domElements['queryBannerNotice'].style.display === 'none', 'El aviso de series debe ocultarse al salir del modo consulta');
  assert(domElements['recalc_called'] === true, 'recalcAll fue invocado para restaurar reactividad');
  console.log('   -> Salida del modo consulta y recálculo reactivo restablecido con éxito.');

  console.log('\n✅ TODOS LOS TESTS DEL PASO 3B PASARON SATISFACTORIAMENTE.');
}

runPaso3BTests().catch(err => {
  console.error('\n❌ ERROR EN LOS TESTS DEL PASO 3B:', err);
  process.exit(1);
});
