/**
 * SIMTELE-RISK · Capa de Persistencia Relacional SQLite (sql.js + IndexedDB)
 * Módulo: js/db.js
 * Cumple con el DER acordado (7 tablas) y persistencia binaria en IndexedDB.
 */

const DB = (() => {
  let db = null;
  let SQL = null;
  const IDB_NAME = 'simtele_risk_idb';
  const IDB_STORE = 'sqlite_store';
  const IDB_KEY = 'simtele_risk_db_binary';

  // Fallbacks de schema y seed en caso de apertura directa via file:/// (donde fetch() puede bloquearse por CORS)
  const FALLBACK_SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS caso_estudio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    modelo_version TEXT NOT NULL,
    descripcion_fisica TEXT
);

CREATE TABLE IF NOT EXISTS escenario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caso_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('NORMAL', 'ESTRES', 'MAL_CONDICIONADO')),
    parametros_json TEXT NOT NULL,
    fuente_datos TEXT NOT NULL,
    FOREIGN KEY (caso_id) REFERENCES caso_estudio(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS simulacion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    escenario_id INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    usuario_equipo TEXT,
    estado TEXT CHECK (estado IN ('COMPLETADO', 'DIVERGIO', 'ERROR_VALIDACION')),
    simulacion_origen_id INTEGER,
    coincide BOOLEAN,
    diferencia_max REAL,
    tol_comparacion REAL,
    FOREIGN KEY (escenario_id) REFERENCES escenario(id) ON DELETE CASCADE,
    FOREIGN KEY (simulacion_origen_id) REFERENCES simulacion(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ejecucion_metodo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    simulacion_id INTEGER NOT NULL,
    familia TEXT NOT NULL,
    metodo TEXT NOT NULL,
    tolerancia REAL,
    paso REAL,
    max_iter INTEGER,
    convergio BOOLEAN NOT NULL,
    estado TEXT NOT NULL CHECK (estado IN ('CONVERGIO', 'DIVERGIO', 'NO_ALCANZO_TOL', 'DIRECTO', 'COMPLETADO')),
    tiempo_ms REAL,
    FOREIGN KEY (simulacion_id) REFERENCES simulacion(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS iteracion_resultado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ejecucion_id INTEGER NOT NULL,
    numero INTEGER NOT NULL,
    aproximacion_json TEXT NOT NULL,
    residual REAL,
    error_abs REAL,
    error_rel REAL,
    FOREIGN KEY (ejecucion_id) REFERENCES ejecucion_metodo(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS resultado_resumen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ejecucion_id INTEGER NOT NULL UNIQUE,
    referencia TEXT NOT NULL,
    valor_json TEXT NOT NULL,
    metrica_error_json TEXT NOT NULL,
    conclusion_numerica TEXT,
    conclusion_problema TEXT,
    FOREIGN KEY (ejecucion_id) REFERENCES ejecucion_metodo(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS serie_grafico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ejecucion_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    datos_json TEXT NOT NULL,
    FOREIGN KEY (ejecucion_id) REFERENCES ejecucion_metodo(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_escenario_caso ON escenario(caso_id);
CREATE INDEX IF NOT EXISTS idx_simulacion_escenario ON simulacion(escenario_id);
CREATE INDEX IF NOT EXISTS idx_simulacion_fecha ON simulacion(fecha);
CREATE INDEX IF NOT EXISTS idx_simulacion_origen ON simulacion(simulacion_origen_id);
CREATE INDEX IF NOT EXISTS idx_ejecucion_simulacion ON ejecucion_metodo(simulacion_id);
CREATE INDEX IF NOT EXISTS idx_iteracion_ejecucion_num ON iteracion_resultado(ejecucion_id, numero);
CREATE INDEX IF NOT EXISTS idx_serie_ejecucion ON serie_grafico(ejecucion_id);

INSERT INTO caso_estudio (id, nombre, modelo_version, descripcion_fisica) VALUES
(1, 'Módulo 1 · Detención de emergencia', 'v1.0', 'Dinámica de frenado electrohidráulico, integración de EDOs (Heun vs RK4), cadena de latencias distribuidas y sistema 4×4 SPD auxiliar de presiones.'),
(2, 'Módulo 2 · Deterioro mecánico', 'v1.0', 'Modelo de fatiga acumulada en cables tractores, leyes no lineales de desgaste, algoritmos de raíces (Bisección y Newton-Raphson), resolución de cancelación catastrófica mediante Vieta y sensibilidad dt*/dDu.'),
(3, 'Módulo 3 · Oscilaciones por viento', 'v1.0', 'Dinámica pendular y aeroelástica de cabinas bajo ráfagas armónicas forzadas con amortiguamiento, verificación frente a umbral Alim = 0.50 m y calibración de parámetros estructurales 3×3 SPD.'),
(4, 'Módulo 4 · Reconstrucción de sensores', 'v1.0', 'Reconstrucción de señales con ruido por mínimos cuadrados polinómicos, análisis de mal condicionamiento con base monomial, comparativa de solucionadores lineales (LU, Jacobi, Gauss-Seidel, Gradiente Conjugado) e interpolación (Lagrange, Newton, Splines).');
`;

  // Helper de IndexedDB
  function openIDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = ev => {
        const d = ev.target.result;
        if (!d.objectStoreNames.contains(IDB_STORE)) {
          d.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getFromIDB(key) {
    try {
      const idb = await openIDB();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('IndexedDB no disponible:', e);
      return null;
    }
  }

  async function saveToIDB(key, val) {
    try {
      const idb = await openIDB();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const req = store.put(val, key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('Error guardando en IndexedDB:', e);
      return false;
    }
  }

  async function loadSqlScript(path, fallback) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    } catch (e) {
      return fallback;
    }
  }

  // Inicialización de la base de datos
  async function init() {
    try {
      if (typeof initSqlJs !== 'function') {
        console.warn('sql.js no está cargado en window.');
        return false;
      }
      SQL = await initSqlJs({
        locateFile: file => 'vendor/sqljs/' + file
      });

      const savedBinary = await getFromIDB(IDB_KEY);
      if (savedBinary && savedBinary.length > 0) {
        db = new SQL.Database(savedBinary);
        db.run('PRAGMA foreign_keys = ON;');
        console.log('Base de datos SQLite restaurada desde IndexedDB.');
      } else {
        db = new SQL.Database();
        db.run('PRAGMA foreign_keys = ON;');
        const schemaSql = await loadSqlScript('db/schema.sql', FALLBACK_SCHEMA);
        db.run(schemaSql);
        const seedSql = await loadSqlScript('db/seed.sql', '');
        if (seedSql) db.run(seedSql);
        await persist();
        console.log('Base de datos SQLite inicializada y precargada con seed.sql.');
      }

      renderHistory();
      updateDBStatus('SQLite activo · Persistido en IndexedDB');
      return true;
    } catch (err) {
      console.error('Error inicializando SQLite:', err);
      updateDBStatus('Error al iniciar SQLite: ' + err.message);
      return false;
    }
  }

  function uiAlert(msg) {
    if (typeof alert !== 'undefined') {
      alert(msg);
    } else {
      console.log('[ALERT]', msg);
    }
  }

  // Persistir base en IndexedDB
  async function persist() {
    if (!db) return;
    if (typeof indexedDB === 'undefined') return;
    const binary = db.export();
    await saveToIDB(IDB_KEY, binary);
  }

  function updateDBStatus(msg) {
    const el = document.getElementById('dbStatusPill');
    if (el) el.innerHTML = `🟢 <strong>${msg}</strong>`;
  }

  // Descargar archivo .db
  function downloadDB() {
    if (!db) { uiAlert('Base de datos no inicializada'); return; }
    const binary = db.export();
    const blob = new Blob([binary], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simtele_risk_${new Date().toISOString().slice(0, 10)}.db`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Cargar archivo .db existente
  function loadDB(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const u8 = new Uint8Array(reader.result);
        const testDb = new SQL.Database(u8);
        testDb.run('PRAGMA foreign_keys = ON;');
        // Verificar que contenga las tablas
        const res = testDb.exec("SELECT COUNT(*) FROM caso_estudio;");
        if (!res || !res.length) throw new Error('El archivo no parece ser una base de datos SIMTELE-RISK válida');
        db = testDb;
        await persist();
        renderHistory();
        uiAlert('Base de datos SQLite cargada y persistida exitosamente.');
      } catch (e) {
        uiAlert('Error al cargar la base de datos: ' + e.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Reiniciar a datos semilla
  async function resetToSeed() {
    if (!confirm('¿Deseas restaurar la base de datos al estado inicial de seed.sql? Se perderán las simulaciones no guardadas en archivo.')) return;
    db = new SQL.Database();
    db.run('PRAGMA foreign_keys = ON;');
    const schemaSql = await loadSqlScript('db/schema.sql', FALLBACK_SCHEMA);
    db.run(schemaSql);
    const seedSql = await loadSqlScript('db/seed.sql', '');
    if (seedSql) db.run(seedSql);
    await persist();
    renderHistory();
    uiAlert('Base de datos restablecida a los valores iniciales de fábrica.');
  }

  // Helper determinista para ordenación de claves de objetos (evita discrepancias por orden)
  function sortKeys(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sortKeys);
    const sorted = {};
    Object.keys(obj).sort().forEach(k => {
      sorted[k] = sortKeys(obj[k]);
    });
    return sorted;
  }

  function normalizeParamJson(param) {
    if (typeof param === 'string') {
      try {
        return JSON.stringify(sortKeys(JSON.parse(param)));
      } catch (e) {
        return param;
      }
    }
    if (param && typeof param === 'object') {
      return JSON.stringify(sortKeys(param));
    }
    return '{}';
  }

  /**
   * Guarda una simulación de forma transaccional (BEGIN/COMMIT/ROLLBACK)
   * cumpliendo las 7 tablas del DER:
   * - Escenarios inmutables: busca si existe un escenario con mismo caso_id, tipo y parametros_json;
   *   si existe lo reutiliza; si no, inserta uno nuevo. NUNCA UPDATE de parametros_json.
   * - Inserta simulacion
   * - Inserta ejecucion_metodo para cualquier familia
   * - Inserta iteracion_resultado
   * - Inserta resultado_resumen (relación 1:1)
   * - Inserta serie_grafico genérica (cualquier lista de { nombre, puntos | datos_json })
   * Si ocurre un error, ejecuta ROLLBACK sin dejar filas parciales.
   */
  function saveSimulationTransaction(data, customDb) {
    const activeDb = customDb || db;
    if (!activeDb) throw new Error('Base de datos SQLite no disponible');

    const { escenario, simulacion = {}, ejecuciones = [] } = data || {};
    if (!escenario) throw new Error('Se requiere especificar la información del escenario.');

    activeDb.run('BEGIN TRANSACTION;');
    try {
      let escenarioId = null;

      if (escenario.id) {
        const check = activeDb.exec(`SELECT id FROM escenario WHERE id = ${Number(escenario.id)};`);
        if (check && check.length && check[0].values.length) {
          escenarioId = Number(escenario.id);
        }
      }

      if (!escenarioId) {
        const casoId = Number(escenario.caso_id || 1);
        const tipo = String(escenario.tipo || 'NORMAL');
        const pNorm = normalizeParamJson(escenario.parametros_json);

        // Buscar si existe un escenario con idéntico caso_id, tipo y parametros_json
        const findStmt = activeDb.prepare('SELECT id, parametros_json FROM escenario WHERE caso_id = ? AND tipo = ?;');
        findStmt.bind([casoId, tipo]);
        let matchId = null;
        while (findStmt.step()) {
          const row = findStmt.getAsObject();
          const existingNorm = normalizeParamJson(row.parametros_json);
          if (existingNorm === pNorm) {
            matchId = row.id;
            break;
          }
        }
        findStmt.free();

        if (matchId) {
          escenarioId = matchId;
        } else {
          // Inserción de un nuevo escenario inmutable (NUNCA UPDATE)
          const fuente = escenario.fuente_datos || 'SIMTELE-RISK / Ejecución interactiva';
          activeDb.run(
            'INSERT INTO escenario (caso_id, tipo, parametros_json, fuente_datos) VALUES (?, ?, ?, ?);',
            [casoId, tipo, pNorm, fuente]
          );
          escenarioId = activeDb.exec('SELECT last_insert_rowid();')[0].values[0][0];
        }
      }

      // 2. Inserción en `simulacion`
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const fecha = simulacion.fecha || now;
      const usuario = simulacion.usuario_equipo || 'Usuario Web / SIMTELE-RISK';
      const estado = simulacion.estado || 'COMPLETADO';
      const coincide = simulacion.coincide !== undefined ? (simulacion.coincide ? 1 : 0) : 1;
      const diffMax = simulacion.diferencia_max !== undefined ? simulacion.diferencia_max : 0.0;
      const tolComp = simulacion.tol_comparacion !== undefined ? simulacion.tol_comparacion : 0.001;
      const origenId = simulacion.simulacion_origen_id || null;

      activeDb.run(
        `INSERT INTO simulacion (escenario_id, fecha, usuario_equipo, estado, simulacion_origen_id, coincide, diferencia_max, tol_comparacion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [escenarioId, fecha, usuario, estado, origenId, coincide, diffMax, tolComp]
      );
      const simId = activeDb.exec('SELECT last_insert_rowid();')[0].values[0][0];

      // 3. Inserción de ejecuciones genéricas
      const savedExecutions = [];
      for (const ej of ejecuciones) {
        const familia = ej.familia || 'EDO';
        const metodo = ej.metodo || 'Método';
        const tol = ej.tolerancia !== undefined ? ej.tolerancia : null;
        const paso = ej.paso !== undefined ? ej.paso : null;
        const maxIter = ej.max_iter !== undefined ? ej.max_iter : null;
        const convergio = ej.convergio ? 1 : 0;
        const est = ej.estado || 'COMPLETADO';
        const tMs = ej.tiempo_ms !== undefined ? ej.tiempo_ms : null;

        activeDb.run(
          `INSERT INTO ejecucion_metodo (simulacion_id, familia, metodo, tolerancia, paso, max_iter, convergio, estado, tiempo_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [simId, familia, metodo, tol, paso, maxIter, convergio, est, tMs]
        );
        const ejId = activeDb.exec('SELECT last_insert_rowid();')[0].values[0][0];
        savedExecutions.push(ejId);

        // 4. Iteraciones (si las hay)
        if (Array.isArray(ej.iteraciones) && ej.iteraciones.length > 0) {
          for (const it of ej.iteraciones) {
            const num = it.numero !== undefined ? it.numero : 0;
            const aproxJson = typeof it.aproximacion_json === 'string'
              ? it.aproximacion_json
              : JSON.stringify(it.aproximacion_json || {});
            const res = it.residual !== undefined ? it.residual : null;
            const eAbs = it.error_abs !== undefined ? it.error_abs : null;
            const eRel = it.error_rel !== undefined ? it.error_rel : null;

            activeDb.run(
              `INSERT INTO iteracion_resultado (ejecucion_id, numero, aproximacion_json, residual, error_abs, error_rel)
               VALUES (?, ?, ?, ?, ?, ?);`,
              [ejId, num, aproxJson, res, eAbs, eRel]
            );
          }
        }

        // 5. Resumen (relación 1:1)
        if (ej.resumen) {
          const ref = ej.resumen.referencia || 'Referencia';
          const valJson = typeof ej.resumen.valor_json === 'string'
            ? ej.resumen.valor_json
            : JSON.stringify(ej.resumen.valor_json || {});
          const errJson = typeof ej.resumen.metrica_error_json === 'string'
            ? ej.resumen.metrica_error_json
            : JSON.stringify(ej.resumen.metrica_error_json || {});
          const concNum = ej.resumen.conclusion_numerica || null;
          const concProb = ej.resumen.conclusion_problema || null;

          activeDb.run(
            `INSERT INTO resultado_resumen (ejecucion_id, referencia, valor_json, metrica_error_json, conclusion_numerica, conclusion_problema)
             VALUES (?, ?, ?, ?, ?, ?);`,
            [ejId, ref, valJson, errJson, concNum, concProb]
          );
        }

        // 6. Series de datos para gráficos (genérica: cualquier lista de { nombre, puntos | datos_json })
        if (Array.isArray(ej.series) && ej.series.length > 0) {
          for (const s of ej.series) {
            const sNom = s.nombre || 'serie_grafico';
            let sDatos = s.datos_json;
            if (!sDatos && s.puntos) {
              sDatos = JSON.stringify(s.puntos); // sin redondear
            }
            if (!sDatos) sDatos = '[]';

            activeDb.run(
              `INSERT INTO serie_grafico (ejecucion_id, nombre, datos_json)
               VALUES (?, ?, ?);`,
              [ejId, sNom, sDatos]
            );
          }
        }
      }

      activeDb.run('COMMIT;');
      return {
        success: true,
        simulacion_id: simId,
        escenario_id: escenarioId,
        ejecuciones_guardadas: savedExecutions.length
      };
    } catch (err) {
      try { activeDb.run('ROLLBACK;'); } catch (rbErr) {}
      throw err;
    }
  }

  // Wrapper asíncrono que persiste en IndexedDB únicamente tras el COMMIT exitoso
  async function saveSimulation(data, customDb) {
    const res = saveSimulationTransaction(data, customDb);
    if (!customDb && typeof persist === 'function') {
      await persist();
    }
    return res;
  }

  // Guardar la simulación actual activa de la interfaz web
  async function saveCurrentSimulation() {
    if (!db) { uiAlert('Base de datos no disponible'); return; }
    if (!window.LAST || !window.LAST.r1) { uiAlert('Ejecuta primero los cálculos de la simulación'); return; }

    try {
      const escCode = (document.getElementById('scen') ? document.getElementById('scen').value : 'N') || 'N';
      const escTipo = (typeof window.Mapper !== 'undefined' && window.Mapper.toDbEscenario)
        ? window.Mapper.toDbEscenario(escCode)
        : ((escCode === 'E') ? 'ESTRES' : (escCode === 'MC' || escCode === 'M') ? 'MAL_CONDICIONADO' : 'NORMAL');

      const params = {
        m1: typeof window.readForm === 'function' ? window.readForm('m1') : {},
        m2: typeof window.readForm === 'function' ? window.readForm('m2') : {},
        m3: typeof window.readForm === 'function' ? window.readForm('m3') : {},
        m4: typeof window.readForm === 'function' ? window.readForm('m4') : {},
        mi: typeof window.readForm === 'function' ? window.readForm('mi') : {}
      };

      let allExecutions = [];
      if (typeof window.Mapper !== 'undefined' && typeof window.Mapper.buildAllExecutions === 'function') {
        allExecutions = window.Mapper.buildAllExecutions(window.LAST, params, escCode);
      }

      const casesMap = {
        1: { params: params.m1, ejecs: [] },
        2: { params: params.m2, ejecs: [] },
        3: { params: params.m3, ejecs: [] },
        4: { params: { ...params.m4, mi: params.mi }, ejecs: [] }
      };

      allExecutions.forEach(ej => {
        const cId = ej.caso_id || 1;
        if (!casesMap[cId]) casesMap[cId] = { params: {}, ejecs: [] };
        casesMap[cId].ejecs.push(ej);
      });

      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      let totalSims = 0;
      let totalEjecs = 0;

      for (const cIdStr of Object.keys(casesMap)) {
        const cId = Number(cIdStr);
        const cData = casesMap[cId];
        if (!cData.ejecs.length) continue;

        const res = saveSimulationTransaction({
          escenario: {
            caso_id: cId,
            tipo: escTipo,
            parametros_json: cData.params,
            fuente_datos: 'SIMTELE-RISK / Ejecución interactiva'
          },
          simulacion: {
            fecha: now,
            usuario_equipo: 'Usuario Web / SIMTELE-RISK',
            estado: 'COMPLETADO',
            coincide: 1,
            diferencia_max: 0.0,
            tol_comparacion: 0.001
          },
          ejecuciones: cData.ejecs
        });

        totalSims++;
        totalEjecs += res.ejecuciones_guardadas;
      }

      // Persistencia en IndexedDB ÚNICAMENTE después de confirmar todos los commits
      await persist();
      renderHistory();
      uiAlert(`Guardado completado exitosamente: ${totalSims} simulaciones y ${totalEjecs} ejecuciones registradas en SQLite.`);
    } catch (e) {
      console.error(e);
      uiAlert('Error guardando en la base de datos: ' + e.message);
    }
  }

  // Estado de Modo Consulta (Solo lectura sin recálculo)
  let isQueryMode = false;
  let lastLoadedSimulation = null;

  function getQueryMode() {
    return isQueryMode;
  }

  function getLastLoadedSimulation() {
    return lastLoadedSimulation;
  }

  function exitQueryMode() {
    isQueryMode = false;
    if (typeof window !== 'undefined') {
      window.IS_QUERY_MODE = false;
    }

    if (typeof document !== 'undefined') {
      const banner = document.getElementById('queryModeBanner');
      if (banner) banner.style.display = 'none';

      // Habilitar todos los controles de formularios
      const formControls = document.querySelectorAll('#scen, [data-m] input, [data-m] select, button.btn-preset, input[data-live]');
      formControls.forEach(el => el.disabled = false);

      // Restablecer el recálculo reactivo con el estado actual
      if (typeof window.recalcAll === 'function') {
        window.recalcAll();
      }
    }
    uiAlert('Modo consulta finalizado. Se ha restablecido el cálculo reactivo interactivo.');
  }

  // Renderiza en la interfaz gráfica los datos guardados en SQLite directamente (sin recalcular)
  function renderSimulationFromDB(loaded) {
    if (typeof document === 'undefined') return;

    const { simulacion, escenario, ejecuciones } = loaded;
    const fmt = (typeof window.fmt === 'function') ? window.fmt : (x, d=2) => (x == null ? '—' : Number(x).toFixed(d));
    const sci = (typeof window.sci === 'function') ? window.sci : (x, d=2) => (x == null ? '—' : Number(x).toExponential(d));
    const pill = (typeof window.pill === 'function') ? window.pill : (cls, txt) => `<span class="pill ${cls}">${txt}</span>`;
    const kpi = (typeof window.kpi === 'function') ? window.kpi : (t, v, s) => `<div class="kpi"><div class="t">${t}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
    const ds = (typeof window.ds === 'function') ? window.ds : (l, data, color, o={}) => ({ label: l, data, borderColor: color, ...o });
    const C = window.C || { O: '#ff7a00', O2: '#ffa53d', W: '#f4f4f4', Y: '#ffd166', R: '#ff3b3b', G: '#7ee787', GR: '#9a9a9a' };
    const chart = (typeof window.chart === 'function') ? window.chart : () => {};

    // 1. Extraer resúmenes de cada ejecución por familia
    let r1Val = {}, r2Val = {}, r3Val = {}, r4Val = {};
    let conclNum = [], conclProb = [];

    ejecuciones.forEach(ej => {
      let val = {};
      if (ej.resumen && ej.resumen.valor_json) {
        try { val = JSON.parse(ej.resumen.valor_json); } catch (e) { val = {}; }
      }
      if (ej.resumen) {
        if (ej.resumen.conclusion_numerica) conclNum.push(ej.resumen.conclusion_numerica);
        if (ej.resumen.conclusion_problema) conclProb.push(ej.resumen.conclusion_problema);
      }

      if (ej.metodo.includes('Runge-Kutta') || ej.metodo.includes('RK4')) {
        r1Val = { ...val, estado: ej.estado, metodo: ej.metodo };
      } else if (ej.familia === 'EDO' && r1Val.D_total === undefined) {
        r1Val = { ...val, estado: ej.estado, metodo: ej.metodo };
      } else if (ej.metodo.includes('Newton') || (ej.familia === 'RAICES' && r2Val.t_star === undefined)) {
        r2Val = { ...val, estado: ej.estado };
      } else if (ej.familia === 'EDO_SISTEMA' || ej.metodo.includes('Armonico') || ej.metodo.includes('Armónico')) {
        r3Val = { ...val, estado: ej.estado };
      } else if (ej.familia === 'SISTEMAS_LINEALES' || ej.familia === 'INTERPOLACION') {
        r4Val = { ...r4Val, ...val, estado: ej.estado };
      }
    });

    // 2. Renderizar KPIs generales (#kpis) directamente de la BD
    const kpisEl = document.getElementById('kpis');
    if (kpisEl) {
      let htmlKpis = '';
      if (r1Val.D_total !== undefined) {
        htmlKpis += kpi('D_total · Módulo 1', fmt(r1Val.D_total, 2) + ' m', r1Val.seguro ? pill('ok', 'Dentro de D_seg') : pill('bad', 'Supera D_seg'));
      }
      if (r2Val.t_star !== undefined) {
        htmlKpis += kpi('Cruce t* · Módulo 2', r2Val.t_star == null ? '—' : fmt(r2Val.t_star, 2) + ' meses', pill('ok', r2Val.estado || 'Calculado'));
      }
      if (r3Val.X !== undefined) {
        htmlKpis += kpi('Amplitud X(Ω) · Módulo 3', fmt(r3Val.X, 2) + ' m', r3Val.cumple ? pill('ok', '≤ 0.50 m (Cumple)') : pill('bad', '> 0.50 m (No cumple)'));
      }
      if (r4Val.kappa2 !== undefined) {
        htmlKpis += kpi('κ₂ sensores · Módulo 4', sci(r4Val.kappa2), r4Val.kappa2 < 1e3 ? 'Bien condicionado' : 'Mal condicionado');
      }
      if (htmlKpis) kpisEl.innerHTML = htmlKpis;
    }

    // 3. Renderizar Módulo 1
    if (r1Val.D_total !== undefined) {
      const k1 = document.getElementById('k1');
      if (k1) {
        k1.innerHTML =
          kpi('t_det (parada)', fmt(r1Val.t_det, 3) + ' s', 'Desde base de datos') +
          kpi('D_total', fmt(r1Val.D_total, 2) + ' m', r1Val.seguro ? pill('ok', 'Seguro') : pill('bad', 'Riesgo'));
      }
      const s1 = document.getElementById('s1');
      if (s1 && r1Val.conclusion_problema) {
        s1.innerHTML = `<p class="note"><strong>Resultado cargado de SQLite:</strong> ${r1Val.conclusion_problema}</p>`;
      }
    }

    // 4. Renderizar Módulo 2
    if (r2Val.t_star !== undefined) {
      const k2 = document.getElementById('k2');
      if (k2) {
        k2.innerHTML =
          kpi('Cruce t*', fmt(r2Val.t_star, 4) + ' meses', pill('ok', r2Val.estado || 'CONVERGIO')) +
          kpi('Sensibilidad dt*/dDu', r2Val.sensibilidad == null ? '—' : fmt(r2Val.sensibilidad, 2), 'Desde base de datos');
      }
      const s2 = document.getElementById('s2');
      if (s2 && r2Val.conclusion_problema) {
        s2.innerHTML = `<p class="note"><strong>Resultado cargado de SQLite:</strong> ${r2Val.conclusion_problema}</p>`;
      }
    }

    // 5. Renderizar Módulo 3
    if (r3Val.X !== undefined) {
      const k3 = document.getElementById('k3');
      if (k3) {
        k3.innerHTML =
          kpi('Amplitud en régimen X(Ω)', fmt(r3Val.X, 4) + ' m', r3Val.cumple ? pill('ok', 'Bajo A_lim') : pill('bad', 'Supera A_lim')) +
          kpi('Primer cruce', r3Val.primer_cruce_s == null ? '—' : fmt(r3Val.primer_cruce_s, 2) + ' s', 'Desde base de datos');
      }
      const s3 = document.getElementById('s3');
      if (s3 && r3Val.conclusion_problema) {
        s3.innerHTML = `<p class="note"><strong>Resultado cargado de SQLite:</strong> ${r3Val.conclusion_problema}</p>`;
      }
    }

    // 6. Renderizar Módulo 4
    if (r4Val.kappa2 !== undefined) {
      const k4 = document.getElementById('k4');
      if (k4) {
        k4.innerHTML =
          kpi('κ₂(AᵀA)', sci(r4Val.kappa2), r4Val.kappa2 < 1e3 ? pill('ok', 'Bien condicionado') : pill('bad', 'Mal condicionado')) +
          kpi('Estado Solucionador', pill('ok', r4Val.estado || 'COMPLETADO'), 'Desde base de datos');
      }
    }

    // 7. Renderizar Gráficos directamente desde serie_grafico
    // Si alguna serie no existe, emitir aviso claro sin error
    const allSeries = [];
    ejecuciones.forEach(ej => {
      (ej.series || []).forEach(s => allSeries.push(s));
    });

    const plotOrWarn = (canvasId, serieNamePrefix, xLabel, yLabel, color, opts={}) => {
      const s = allSeries.find(item => item.nombre.includes(serieNamePrefix));
      if (s && s.datos_json) {
        try {
          const pts = JSON.parse(s.datos_json);
          if (Array.isArray(pts) && pts.length > 0) {
            chart(canvasId, 'line', [ds(s.nombre, pts, color, opts)], xLabel, yLabel);
            return true;
          }
        } catch (e) {
          console.warn(`Aviso: Error parseando datos de la serie ${s.nombre}:`, e.message);
        }
      }
      console.warn(`Aviso: La simulación #${simulacion.id} no incluye la serie '${serieNamePrefix}'. Se omite la visualización de ${canvasId} sin error.`);
      return false;
    };

    plotOrWarn('c1', 'velocidad', 'Tiempo t (s)', 'Velocidad v (m/s)', C.O, { bw: 3 });
    plotOrWarn('c2', 'posicion', 'Tiempo t (s)', 'Distancia (m)', C.Y, { bw: 3 });
    plotOrWarn('c4', 'deterioro', 'Tiempo t (meses)', 'D(t)', C.O, { bw: 3 });
    plotOrWarn('c5', 'sensibilidad', 'Margen ΔD', 't* (meses)', C.O, { bw: 3, xType: 'logarithmic', yType: 'logarithmic' });
    plotOrWarn('c6', 'resonancia', 'Frecuencia Ω (rad/s)', 'Amplitud X (m)', C.O, { bw: 3 });
    plotOrWarn('c7', 'oscilacion', 'Tiempo t (s)', 'Desplazamiento x (m)', C.O, { bw: 2 });
    plotOrWarn('c8', 'ajuste', 'Variable r', 'y(r)', C.O, { bw: 3 });

    // 8. Renderizar Conclusiones
    if (conclNum.length > 0) {
      const elNum = document.getElementById('concNum');
      if (elNum) elNum.innerHTML = `<ul>${conclNum.map(c => `<li>${c}</li>`).join('')}</ul>`;
    }
    if (conclProb.length > 0) {
      const elProb = document.getElementById('concProb');
      if (elProb) elProb.innerHTML = `<ul>${conclProb.map(c => `<li>${c}</li>`).join('')}</ul>`;
    }
  }

  // Abrir y cargar simulación desde la base de datos a la interfaz (sin recálculo)
  function loadSimulation(simId, customDb) {
    const activeDb = customDb || db;
    if (!activeDb) { uiAlert('Base de datos no inicializada.'); return null; }

    try {
      const simQuery = activeDb.exec(`
        SELECT s.id, s.fecha, s.usuario_equipo, s.estado, s.coincide, s.diferencia_max, s.tol_comparacion,
               e.id AS escenario_id, e.caso_id, e.tipo AS escenario_tipo, e.parametros_json, e.fuente_datos,
               c.nombre AS caso_nombre
        FROM simulacion s
        JOIN escenario e ON s.escenario_id = e.id
        JOIN caso_estudio c ON e.caso_id = c.id
        WHERE s.id = ${Number(simId)};
      `);

      if (!simQuery || !simQuery.length || !simQuery[0].values.length) {
        uiAlert(`Simulación #${simId} no encontrada en la base de datos.`);
        return null;
      }

      const r = simQuery[0].values[0];
      const loaded = {
        simulacion: {
          id: r[0],
          fecha: r[1],
          usuario_equipo: r[2],
          estado: r[3],
          coincide: r[4],
          diferencia_max: r[5],
          tol_comparacion: r[6]
        },
        escenario: {
          id: r[7],
          caso_id: r[8],
          tipo: r[9],
          parametros_json: r[10],
          parametros: JSON.parse(r[10] || '{}'),
          fuente_datos: r[11],
          caso_nombre: r[12]
        },
        ejecuciones: []
      };

      // Consultar ejecuciones de la simulación
      const ejQuery = activeDb.exec(`
        SELECT id, familia, metodo, tolerancia, paso, max_iter, convergio, estado, tiempo_ms
        FROM ejecucion_metodo
        WHERE simulacion_id = ${loaded.simulacion.id}
        ORDER BY id ASC;
      `);

      if (ejQuery && ejQuery.length && ejQuery[0].values.length) {
        for (const ejRow of ejQuery[0].values) {
          const ejId = ejRow[0];
          const ej = {
            id: ejId,
            familia: ejRow[1],
            metodo: ejRow[2],
            tolerancia: ejRow[3],
            paso: ejRow[4],
            max_iter: ejRow[5],
            convergio: Boolean(ejRow[6]),
            estado: ejRow[7],
            tiempo_ms: ejRow[8],
            resumen: null,
            iteraciones: [],
            series: []
          };

          // Resumen
          const resQuery = activeDb.exec(`
            SELECT referencia, valor_json, metrica_error_json, conclusion_numerica, conclusion_problema
            FROM resultado_resumen WHERE ejecucion_id = ${ejId};
          `);
          if (resQuery && resQuery.length && resQuery[0].values.length) {
            const rr = resQuery[0].values[0];
            ej.resumen = {
              referencia: rr[0],
              valor_json: rr[1],
              metrica_error_json: rr[2],
              conclusion_numerica: rr[3],
              conclusion_problema: rr[4]
            };
          }

          // Iteraciones
          const itQuery = activeDb.exec(`
            SELECT numero, aproximacion_json, residual, error_abs, error_rel
            FROM iteracion_resultado WHERE ejecucion_id = ${ejId} ORDER BY numero ASC;
          `);
          if (itQuery && itQuery.length && itQuery[0].values.length) {
            ej.iteraciones = itQuery[0].values.map(itRow => ({
              numero: itRow[0],
              aproximacion_json: itRow[1],
              residual: itRow[2],
              error_abs: itRow[3],
              error_rel: itRow[4]
            }));
          }

          // Series
          const serQuery = activeDb.exec(`
            SELECT id, nombre, datos_json
            FROM serie_grafico WHERE ejecucion_id = ${ejId} ORDER BY id ASC;
          `);
          if (serQuery && serQuery.length && serQuery[0].values.length) {
            ej.series = serQuery[0].values.map(sRow => ({
              id: sRow[0],
              nombre: sRow[1],
              datos_json: sRow[2]
            }));
          }

          loaded.ejecuciones.push(ej);
        }
      }

      lastLoadedSimulation = loaded;

      // Activar bandera de modo consulta
      isQueryMode = true;
      if (typeof window !== 'undefined') {
        window.IS_QUERY_MODE = true;
      }

      // Si estamos en un navegador con DOM activo:
      if (typeof document !== 'undefined') {
        // 1. Mostrar banner
        const banner = document.getElementById('queryModeBanner');
        if (banner) {
          banner.style.display = 'flex';
          const qId = document.getElementById('querySimId');
          if (qId) qId.textContent = loaded.simulacion.id;
        }

        // 2. Poblar select de escenario
        const scenKey = (typeof window.Mapper !== 'undefined' && window.Mapper.toUiEscenario)
          ? window.Mapper.toUiEscenario(loaded.escenario.tipo)
          : (loaded.escenario.tipo === 'ESTRES' ? 'E' : loaded.escenario.tipo === 'MAL_CONDICIONADO' ? 'MC' : 'N');
        const scenEl = document.getElementById('scen');
        if (scenEl) scenEl.value = scenKey;

        // 3. Poblar formulario del caso correspondiente
        const modKey = loaded.escenario.caso_id === 1 ? 'm1' : loaded.escenario.caso_id === 2 ? 'm2' : loaded.escenario.caso_id === 3 ? 'm3' : 'm4';
        if (typeof window.setForm === 'function') {
          window.setForm(modKey, loaded.escenario.parametros);
        }

        // 4. Establecer formularios en modo sólo lectura
        const formControls = document.querySelectorAll('#scen, [data-m] input, [data-m] select, button.btn-preset, input[data-live]');
        formControls.forEach(el => {
          if (el.closest && (el.closest('#queryModeBanner') || el.closest('#arquitectura'))) {
            return;
          }
          el.disabled = true;
        });

        // 5. Renderizar directamente desde la base (SIN recalcular)
        renderSimulationFromDB(loaded);

        uiAlert(`Simulación #${loaded.simulacion.id} (${loaded.escenario.tipo}) abierta en modo consulta (solo lectura, sin recálculo).`);
      }

      return loaded;
    } catch (e) {
      console.error(e);
      uiAlert('Error cargando simulación: ' + e.message);
      return null;
    }
  }

  // Eliminar una simulación de la base
  async function deleteSimulation(simId) {
    if (!db) return;
    if (!confirm(`¿Eliminar la simulación #${simId} de la base de datos?`)) return;
    try {
      db.run(`DELETE FROM simulacion WHERE id = ${simId};`);
      await persist();
      renderHistory();
    } catch (e) {
      uiAlert('Error al eliminar simulación: ' + e.message);
    }
  }

  // Renderizar la tabla de historial en el DOM
  function renderHistory() {
    const container = document.getElementById('tHistorial');
    if (!container || !db) return;

    try {
      const res = db.exec(`
        SELECT s.id, s.fecha, s.estado, s.coincide, s.diferencia_max,
               c.nombre AS caso_nombre, e.tipo AS escenario_tipo
        FROM simulacion s
        JOIN escenario e ON s.escenario_id = e.id
        JOIN caso_estudio c ON e.caso_id = c.id
        ORDER BY s.id DESC;
      `);

      if (!res || !res.length || !res[0].values.length) {
        container.innerHTML = '<p class="note">No hay simulaciones registradas en la base de datos.</p>';
        return;
      }

      const rows = res[0].values;
      const html = `
        <table class="tbl" style="width:100%;font-size:0.85rem">
          <thead>
            <tr>
              <th># ID</th>
              <th>Fecha y hora</th>
              <th>Caso de estudio / Módulo</th>
              <th>Escenario</th>
              <th>Estado</th>
              <th>Validación</th>
              <th style="text-align:center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><strong>#${r[0]}</strong></td>
                <td>${r[1]}</td>
                <td>${r[5]}</td>
                <td><span class="pill ${r[6] === 'NORMAL' ? 'ok' : r[6] === 'ESTRES' ? 'bad' : 'warn'}">${r[6]}</span></td>
                <td><span class="pill ${r[2] === 'COMPLETADO' ? 'ok' : 'bad'}">${r[2]}</span></td>
                <td>${r[3] ? '✔ Coincide (Δ=' + Number(r[4]).toFixed(4) + ')' : '—'}</td>
                <td style="text-align:center;display:flex;gap:6px;justify-content:center">
                  <button class="btn ghost sm" onclick="DB.loadSimulation(${r[0]})" title="Abrir simulación guardada (sin recálculo)">Abrir</button>
                  <button class="btn ghost sm" style="color:#ff5c5c;border-color:rgba(255,92,92,0.4)" onclick="DB.deleteSimulation(${r[0]})" title="Eliminar de la BD">✕</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      container.innerHTML = html;
    } catch (e) {
      console.error('Error renderizando historial:', e);
      container.innerHTML = `<p class="note" style="color:#ff5c5c">Error al consultar el historial: ${e.message}</p>`;
    }
  }

  // API pública del módulo DB
  return {
    init,
    getDB: () => db,
    setDB: customDb => { db = customDb; },
    persist,
    downloadDB,
    loadDB,
    resetToSeed,
    saveSimulationTransaction,
    saveSimulation,
    saveCurrentSimulation,
    loadSimulation,
    exitQueryMode,
    getQueryMode,
    getLastLoadedSimulation,
    renderSimulationFromDB,
    deleteSimulation,
    renderHistory,
    sortKeys,
    normalizeParamJson
  };
})();

// Exportación para Node.js y navegadores
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DB;
}
if (typeof window !== 'undefined') {
  window.DB = DB;
}

// Inicializar en navegador cuando el DOM esté listo
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    DB.init();
  });
}
