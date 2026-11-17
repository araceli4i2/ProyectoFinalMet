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
PRAGMA user_version = 2;
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

        // Comprobación de PRAGMA user_version para detectar base antigua (v1 < v2)
        const verRes = db.exec('PRAGMA user_version;');
        const currentVer = (verRes && verRes.length && verRes[0].values.length) ? verRes[0].values[0][0] : 0;
        if (currentVer < 2) {
          console.warn(`Base de datos en versión ${currentVer} (< 2). Se sugiere actualizar ejemplos.`);
          if (typeof document !== 'undefined') {
            const upBanner = document.getElementById('dbUpgradeBanner');
            if (upBanner) upBanner.style.display = 'flex';
          }
        }
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

  // Actualizar datos de ejemplo a la versión v2 conservando intactas las simulaciones de usuario
  async function upgradeExamples(customDb) {
    const activeDb = customDb || db;
    if (!activeDb) { uiAlert('Base de datos no inicializada.'); return false; }

    try {
      activeDb.run('BEGIN TRANSACTION;');

      // 1. Eliminar únicamente simulaciones de ejemplo (CASCADE elimina ejecuciones, iteraciones, resúmenes y series)
      activeDb.run("DELETE FROM simulacion WHERE usuario_equipo = 'EJEMPLO';");

      // 2. Limpiar escenarios huérfanos que no pertenezcan ni a simulaciones de usuario ni al catálogo base (1..12)
      activeDb.run(`
        DELETE FROM escenario
        WHERE id NOT IN (SELECT DISTINCT escenario_id FROM simulacion)
          AND id NOT IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);
      `);

      // 3. Cargar y ejecutar seed.sql nuevo
      let seedSql = '';
      if (typeof fetch === 'function') {
        seedSql = await loadSqlScript('db/seed.sql', '');
      }
      if (!seedSql && typeof require !== 'undefined') {
        try {
          const fs = require('fs');
          const path = require('path');
          const p = path.resolve(__dirname, '../db/seed.sql');
          if (fs.existsSync(p)) seedSql = fs.readFileSync(p, 'utf8');
        } catch (e) {}
      }

      if (seedSql) {
        activeDb.run(seedSql);
      }

      // 4. Actualizar PRAGMA user_version a 2
      activeDb.run('PRAGMA user_version = 2;');
      activeDb.run('COMMIT;');

      if (!customDb && typeof persist === 'function') {
        await persist();
      }

      if (typeof document !== 'undefined') {
        const upBanner = document.getElementById('dbUpgradeBanner');
        if (upBanner) upBanner.style.display = 'none';
        renderHistory();
      }

      uiAlert('Datos de ejemplo actualizados a la versión 2. Tus simulaciones personales fueron conservadas intactas.');
      return true;
    } catch (e) {
      try { activeDb.run('ROLLBACK;'); } catch (rb) {}
      console.error('Error al actualizar datos de ejemplo:', e);
      uiAlert('Error al actualizar ejemplos: ' + e.message);
      return false;
    }
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
      const origenId = simulacion.simulacion_origen_id || null;
      // Regla de integridad DER: solo las simulaciones relanzadas (origenId !== null)
      // tienen coincide, diferencia_max y tol_comparacion. Las originales llevan NULL.
      const coincide = (origenId !== null && simulacion.coincide !== undefined && simulacion.coincide !== null)
        ? (simulacion.coincide ? 1 : 0)
        : null;
      const diffMax = (origenId !== null && simulacion.diferencia_max !== undefined && simulacion.diferencia_max !== null)
        ? simulacion.diferencia_max
        : null;
      const tolComp = (origenId !== null && simulacion.tol_comparacion !== undefined && simulacion.tol_comparacion !== null)
        ? simulacion.tol_comparacion
        : null;

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
            simulacion_origen_id: null,
            coincide: null,
            diferencia_max: null,
            tol_comparacion: null
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
      const notice = document.getElementById('queryBannerNotice');
      if (notice) {
        notice.style.display = 'none';
        notice.innerHTML = '';
      }

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
    // Si alguna serie no existe, emitir aviso visible en pantalla y console.warn
    const allSeries = [];
    ejecuciones.forEach(ej => {
      (ej.series || []).forEach(s => allSeries.push(s));
    });

    const noticeEl = (typeof document !== 'undefined') ? document.getElementById('queryBannerNotice') : null;
    if (allSeries.length === 0) {
      if (noticeEl) {
        noticeEl.style.display = 'block';
        noticeEl.innerHTML = 'ℹ️ <strong>Aviso:</strong> Esta simulación no incluye series para gráficos; se muestran solo los datos tabulares.';
      }
    } else {
      const missingPlots = [];
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
        missingPlots.push(serieNamePrefix);
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

      if (noticeEl) {
        if (missingPlots.length > 0) {
          noticeEl.style.display = 'block';
          noticeEl.innerHTML = `ℹ️ <strong>Aviso:</strong> Esta simulación no incluye series para ciertos gráficos (${missingPlots.join(', ')}); se visualizan solo las series disponibles.`;
        } else {
          noticeEl.style.display = 'none';
          noticeEl.innerHTML = '';
        }
      }
    }

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

  // Lee una simulación completa directamente de la base de datos sin alterar la interfaz gráfica
  function readSimulationFromDB(simId, customDb) {
    const activeDb = customDb || db;
    if (!activeDb) return null;

    try {
      const simQuery = activeDb.exec(`
        SELECT s.id, s.fecha, s.usuario_equipo, s.estado, s.simulacion_origen_id,
               s.coincide, s.diferencia_max, s.tol_comparacion,
               e.id AS escenario_id, e.caso_id, e.tipo AS escenario_tipo, e.parametros_json, e.fuente_datos,
               c.nombre AS caso_nombre
        FROM simulacion s
        JOIN escenario e ON s.escenario_id = e.id
        JOIN caso_estudio c ON e.caso_id = c.id
        WHERE s.id = ${Number(simId)};
      `);

      if (!simQuery || !simQuery.length || !simQuery[0].values.length) {
        return null;
      }

      const r = simQuery[0].values[0];
      const loaded = {
        simulacion: {
          id: r[0],
          fecha: r[1],
          usuario_equipo: r[2],
          estado: r[3],
          simulacion_origen_id: r[4],
          coincide: r[5],
          diferencia_max: r[6],
          tol_comparacion: r[7]
        },
        escenario: {
          id: r[8],
          caso_id: r[9],
          tipo: r[10],
          parametros_json: r[11],
          parametros: JSON.parse(r[11] || '{}'),
          fuente_datos: r[12],
          caso_nombre: r[13]
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

      return loaded;
    } catch (e) {
      console.error('Error leyendo simulación de BD:', e);
      return null;
    }
  }

  // Abrir y cargar simulación desde la base de datos a la interfaz (sin recálculo)
  function loadSimulation(simId, customDb) {
    const activeDb = customDb || db;
    if (!activeDb) { uiAlert('Base de datos no inicializada.'); return null; }

    try {
      const loaded = readSimulationFromDB(simId, activeDb);
      if (!loaded) {
        uiAlert(`Simulación #${simId} no encontrada en la base de datos.`);
        return null;
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

  /**
   * Recalcula las ejecuciones numéricas para una simulación dada a partir de sus parámetros guardados.
   * Utiliza las funciones del motor numérico y Mapper.buildAllExecutions.
   */
  function recomputeExecutions(origSim, customEngine) {
    if (!origSim || !origSim.escenario) {
      throw new Error('No se proporcionó la información del escenario original para relanzar.');
    }
    const env = customEngine || (typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {}));
    const mod1 = env.mod1;
    const mod2 = env.mod2;
    const mod3 = env.mod3;
    const mod4 = env.mod4;
    const modInterp = env.modInterp;
    const solverRows = env.solverRows;
    const SYS = env.SYS;
    const MapperMod = (typeof window !== 'undefined' && window.Mapper)
      ? window.Mapper
      : (typeof Mapper !== 'undefined' ? Mapper : (typeof require !== 'undefined' ? require('./mapper.js') : null));

    if (!MapperMod || typeof MapperMod.buildAllExecutions !== 'function') {
      throw new Error('Mapper.buildAllExecutions no disponible en el entorno.');
    }

    const cId = origSim.escenario.caso_id;
    const p = origSim.escenario.parametros || {};
    const scenTipo = origSim.escenario.tipo || 'NORMAL';
    const scenCode = (MapperMod.toUiEscenario)
      ? MapperMod.toUiEscenario(scenTipo)
      : (scenTipo === 'ESTRES' ? 'E' : scenTipo === 'MAL_CONDICIONADO' ? 'MC' : 'N');

    const LAST = { SYS, solverRows };
    const paramsMap = { m1: {}, m2: {}, m3: {}, m4: {}, mi: {} };

    // Identificar qué casos deben recalcularse
    const targetCases = new Set();
    if (cId) targetCases.add(cId);
    (origSim.ejecuciones || []).forEach(e => {
      if (e.caso_id) targetCases.add(e.caso_id);
    });
    if (targetCases.size === 0) {
      targetCases.add(1); targetCases.add(2); targetCases.add(3); targetCases.add(4);
    }

    if (targetCases.has(1) && typeof mod1 === 'function') {
      const p1 = (p.v0 !== undefined || p.tau !== undefined) ? p : (p.m1 || p);
      paramsMap.m1 = p1;
      const r1 = mod1(p1);
      const s1Rows = (SYS && SYS.m1 && typeof solverRows === 'function')
        ? solverRows(SYS.m1.A, SYS.m1.b, SYS.m1.x, SYS.m1.tol, 50000, SYS.m1.norm)
        : [];
      LAST.r1 = r1;
      LAST.s1Rows = s1Rows;
    }

    if (targetCases.has(2) && typeof mod2 === 'function') {
      const p2 = (p.Du !== undefined || p.tol !== undefined) ? p : (p.m2 || p);
      paramsMap.m2 = p2;
      const r2 = mod2(p2);
      const s2Rows = (SYS && SYS.m2n && typeof solverRows === 'function')
        ? solverRows(SYS.m2n.A, SYS.m2n.b, SYS.m2n.x, SYS.m2n.tol, 50000, SYS.m2n.norm)
        : [];
      LAST.r2 = r2;
      LAST.s2Rows = s2Rows;
    }

    if (targetCases.has(3) && typeof mod3 === 'function') {
      const p3 = (p.omega !== undefined || p.zeta !== undefined || p.seed !== undefined) ? p : (p.m3 || p);
      paramsMap.m3 = p3;
      const r3 = mod3(p3);
      const s3Rows = (r3 && r3.cal && typeof solverRows === 'function')
        ? solverRows(r3.cal.N, r3.cal.bN, r3.cal.sT, 1e-10, 50000, 'rel2')
        : [];
      LAST.r3 = r3;
      LAST.s3Rows = s3Rows;
    }

    if (targetCases.has(4) && typeof mod4 === 'function') {
      const p4 = (p.N !== undefined || p.grado !== undefined) ? p : (p.m4 || p);
      const pmi = p.mi || (env.PRE && env.PRE.N ? env.PRE.N.mi : (p.x_eval !== undefined ? p : {}));
      paramsMap.m4 = p4;
      paramsMap.mi = pmi;
      const r4 = mod4(p4);
      const ri = (typeof modInterp === 'function') ? modInterp(pmi) : null;
      const s4Rows = (r4 && r4.rows) ? r4.rows : [];
      LAST.r4 = r4;
      LAST.ri = ri;
      LAST.s4Rows = s4Rows;
    }

    const allExecs = MapperMod.buildAllExecutions(LAST, paramsMap, scenCode);
    return allExecs.filter(e => targetCases.has(e.caso_id));
  }

  /**
   * Paso 3C: Relanzar una simulación existente y compararla matemáticamente contra la BD.
   * - Lee parametros_json de la simulación original (incluyendo la semilla).
   * - Crea una simulación NUEVA con simulacion_origen_id = id de la original.
   * - Recalcula con el motor actual y compara CONTRA LO LEÍDO DE LA BASE.
   * - diferencia_max = máx diferencia absoluta entre resúmenes, residuales, errores, aproximaciones y series.
   * - Guarda coincide (diferencia_max <= tol), diferencia_max y tol_comparacion.
   */
  async function relaunchSimulation(origSimId, tol = 1e-9, customDb, customEngine) {
    const activeDb = customDb || db;
    if (!activeDb) throw new Error('Base de datos SQLite no disponible.');

    const origSim = readSimulationFromDB(origSimId, activeDb);
    if (!origSim) {
      throw new Error(`Simulación original #${origSimId} no encontrada.`);
    }

    // Recalcular ejecuciones con los parámetros guardados
    const newExecs = recomputeExecutions(origSim, customEngine);

    // Comparar contra lo LEÍDO DE LA BASE
    const MapperMod = (typeof window !== 'undefined' && window.Mapper)
      ? window.Mapper
      : (typeof Mapper !== 'undefined' ? Mapper : (typeof require !== 'undefined' ? require('./mapper.js') : null));

    if (!MapperMod || typeof MapperMod.compareExecutions !== 'function') {
      throw new Error('Mapper.compareExecutions no disponible en el entorno.');
    }

    const comp = MapperMod.compareExecutions(origSim.ejecuciones, newExecs, tol);

    // Registrar la nueva simulación en SQLite
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const hasDiverged = newExecs.some(e => e.estado === 'DIVERGIO');
    const simEstado = hasDiverged ? 'DIVERGIO' : 'COMPLETADO';

    const saveRes = saveSimulationTransaction({
      escenario: {
        caso_id: origSim.escenario.caso_id,
        tipo: origSim.escenario.tipo,
        parametros_json: origSim.escenario.parametros_json,
        fuente_datos: origSim.escenario.fuente_datos || 'SIMTELE-RISK / Ejecución interactiva'
      },
      simulacion: {
        fecha: now,
        usuario_equipo: 'SIMTELE-RISK / Relanzamiento validado',
        estado: simEstado,
        simulacion_origen_id: origSim.simulacion.id,
        coincide: comp.coincide ? 1 : 0,
        diferencia_max: comp.diferencia_max,
        tol_comparacion: tol
      },
      ejecuciones: newExecs
    }, activeDb);

    if (!customDb && typeof persist === 'function') {
      await persist();
    }

    if (typeof renderHistory === 'function' && typeof document !== 'undefined') {
      renderHistory();
    }

    return {
      success: true,
      simulacion_id: saveRes.simulacion_id,
      comparacion: comp,
      origSimId: origSim.simulacion.id
    };
  }

  // Interfaz de usuario para relanzar simulación
  async function relaunchSimulationUI(simId) {
    if (!db) { uiAlert('Base de datos no disponible'); return; }
    const tolInput = (typeof document !== 'undefined') ? document.getElementById('relaunchTol') : null;
    let tol = 1e-9;
    if (tolInput && tolInput.value) {
      const parsed = parseFloat(tolInput.value);
      if (!isNaN(parsed) && parsed > 0) tol = parsed;
    }

    try {
      const res = await relaunchSimulation(simId, tol);
      const c = res.comparacion;
      const fmtExp = (n) => (n != null ? (Math.abs(n) < 1e-3 || Math.abs(n) >= 1e4 ? Number(n).toExponential(3) : Number(n).toFixed(6)) : '0.00');
      let msg = `Relanzamiento de simulación #${simId} finalizado.\n\n` +
        `• Nueva simulación: #${res.simulacion_id} (↳ #${simId})\n` +
        `• Tolerancia configurada: ${tol}\n` +
        `• Diferencia máxima (|Δ|): ${fmtExp(c.diferencia_max)}\n` +
        `• Resultado: ${c.coincide ? '✔ COINCIDE (dentro de tolerancia)' : '✘ DIFIERE (supera tolerancia)'}\n`;

      if (c.unmatchedOrig && c.unmatchedOrig.length > 0) {
        msg += `\n⚠ Ejecuciones originales no recalculables: ${c.unmatchedOrig.join(', ')}`;
      }
      if (c.unmatchedNew && c.unmatchedNew.length > 0) {
        msg += `\n⚠ Ejecuciones nuevas no presentes en original: ${c.unmatchedNew.join(', ')}`;
      }
      uiAlert(msg);
    } catch (err) {
      console.error(err);
      uiAlert('Error al relanzar la simulación: ' + err.message);
    }
  }

  // Muestra el modal con la tabla detallada de diferencias por magnitud
  function showComparisonDetail(simId, customDb) {
    const activeDb = customDb || db;
    if (!activeDb) return;

    const current = readSimulationFromDB(simId, activeDb);
    if (!current) {
      uiAlert(`No se pudo leer la simulación #${simId}`);
      return;
    }

    const origId = current.simulacion.simulacion_origen_id;
    if (!origId) {
      uiAlert(`La simulación #${simId} es original (no proviene del relanzamiento de otra simulación).`);
      return;
    }

    const orig = readSimulationFromDB(origId, activeDb);
    if (!orig) {
      uiAlert(`No se encontró la simulación original #${origId} en la base de datos.`);
      return;
    }

    const tol = current.simulacion.tol_comparacion || 1e-9;
    const MapperMod = (typeof window !== 'undefined' && window.Mapper)
      ? window.Mapper
      : (typeof Mapper !== 'undefined' ? Mapper : (typeof require !== 'undefined' ? require('./mapper.js') : null));

    if (!MapperMod || typeof MapperMod.compareExecutions !== 'function') {
      uiAlert('Mapper.compareExecutions no disponible.');
      return;
    }

    const comp = MapperMod.compareExecutions(orig.ejecuciones, current.ejecuciones, tol);

    if (typeof document === 'undefined') return comp;

    const modal = document.getElementById('comparisonModal');
    const content = document.getElementById('compModalContent');
    const title = document.getElementById('compModalTitle');
    if (!modal || !content) return;

    if (title) {
      title.textContent = `Detalle de Validación · Simulación #${simId} ↳ #${origId}`;
    }

    const fmtNum = (n) => {
      if (n == null) return '—';
      if (typeof n === 'number') {
        return (Math.abs(n) < 1e-4 || Math.abs(n) > 1e4) ? n.toExponential(4) : n.toFixed(6);
      }
      return String(n);
    };

    // Ordenar detalles por magnitud de diferencia descendente (mayor a menor)
    const sortedDetalles = [...(comp.detalles || [])].sort((a, b) => {
      const diffA = a.diff != null ? a.diff : -1;
      const diffB = b.diff != null ? b.diff : -1;
      return diffB - diffA;
    });

    let html = `
      <div style="margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap">
        <div class="kpi" style="padding:10px;flex:1;min-width:140px">
          <div class="t">Resultado Global</div>
          <div class="v">${comp.coincide ? '<span class="pill ok">✔ COINCIDE</span>' : '<span class="pill bad">✘ DIFIERE</span>'}</div>
        </div>
        <div class="kpi" style="padding:10px;flex:1;min-width:140px">
          <div class="t">Diferencia Máxima |Δ|</div>
          <div class="v" style="font-family:monospace">${fmtNum(comp.diferencia_max)}</div>
        </div>
        <div class="kpi" style="padding:10px;flex:1;min-width:140px">
          <div class="t">Tolerancia Aplicada</div>
          <div class="v" style="font-family:monospace">${fmtNum(tol)}</div>
        </div>
      </div>
    `;

    if (comp.unmatchedOrig && comp.unmatchedOrig.length > 0) {
      html += `<p class="note" style="color:#ffa53d">⚠ Ejecuciones en BD original no recalculadas: ${comp.unmatchedOrig.join(', ')}</p>`;
    }
    if (comp.unmatchedNew && comp.unmatchedNew.length > 0) {
      html += `<p class="note" style="color:#ffa53d">⚠ Ejecuciones recalculadas ausentes en BD original: ${comp.unmatchedNew.join(', ')}</p>`;
    }
    if (comp.mismatchedMeta && comp.mismatchedMeta.length > 0) {
      html += `<p class="note" style="color:#ff5c5c">✘ Discrepancias de estado o total de iteraciones: ${comp.mismatchedMeta.join(' | ')}</p>`;
    }

    if (sortedDetalles.length === 0) {
      html += `<p class="note" style="color:#7ee787">✔ Identidad numérica exacta en todas las variables y puntos comparados (|Δ| = 0).</p>`;
    } else {
      html += `
        <table class="tbl" style="width:100%;font-size:0.8rem">
          <thead>
            <tr>
              <th>Ejecución / Método</th>
              <th>Variable / Campo</th>
              <th style="text-align:right">Valor Original (BD)</th>
              <th style="text-align:right">Valor Relanzado</th>
              <th style="text-align:right">Diferencia |Δ|</th>
              <th style="text-align:center">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${sortedDetalles.slice(0, 100).map(d => {
              const isOver = d.diff != null && d.diff > tol;
              return `
                <tr style="${isOver ? 'background:rgba(255,92,92,0.1)' : ''}">
                  <td><code>${d.ejecucion}</code></td>
                  <td><code>${d.campo}</code></td>
                  <td style="text-align:right;font-family:monospace">${fmtNum(d.orig)}</td>
                  <td style="text-align:right;font-family:monospace">${fmtNum(d.nuevo)}</td>
                  <td style="text-align:right;font-family:monospace;font-weight:600;color:${isOver ? '#ff5c5c' : '#7ee787'}">
                    ${d.diff != null ? fmtNum(d.diff) : '—'}
                  </td>
                  <td style="text-align:center">
                    <span class="pill ${isOver ? 'bad' : 'ok'}">${isOver ? 'Difiere' : 'OK'}</span>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        ${sortedDetalles.length > 100 ? `<p class="sub" style="margin-top:8px">Mostrando las 100 diferencias de mayor magnitud de ${sortedDetalles.length} evaluadas.</p>` : ''}
      `;
    }

    content.innerHTML = html;
    modal.style.display = 'flex';
  }

  function closeComparisonModal() {
    if (typeof document !== 'undefined') {
      const modal = document.getElementById('comparisonModal');
      if (modal) modal.style.display = 'none';
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

  // Restablecer los filtros de búsqueda del historial
  function resetHistoryFilters() {
    if (typeof document === 'undefined') return;
    const s = document.getElementById('histSearch'); if (s) s.value = '';
    const m = document.getElementById('histModulo'); if (m) m.value = 'all';
    const e = document.getElementById('histEscenario'); if (e) e.value = 'all';
    const est = document.getElementById('histEstado'); if (est) est.value = 'all';
    const t = document.getElementById('histTipo'); if (t) t.value = 'all';
    const f = document.getElementById('histFecha'); if (f) f.value = '';
    renderHistory();
  }

  // Renderizar la tabla de historial en el DOM con soporte de búsqueda y filtros
  function renderHistory() {
    const container = document.getElementById('tHistorial');
    if (!container || !db) return;

    try {
      const res = db.exec(`
        SELECT s.id, s.fecha, s.estado, s.coincide, s.diferencia_max,
               c.nombre AS caso_nombre, e.tipo AS escenario_tipo,
               s.simulacion_origen_id, s.tol_comparacion,
               s.usuario_equipo, e.caso_id
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
      const fmtExp = (n) => (n != null ? (Math.abs(n) < 1e-3 || Math.abs(n) >= 1e4 ? Number(n).toExponential(2) : Number(n).toFixed(4)) : '—');

      // Leer valores de los controles de filtrado (con guards de seguridad)
      const search = (typeof document !== 'undefined' && document.getElementById('histSearch'))
        ? document.getElementById('histSearch').value.trim().toLowerCase() : '';
      const filterMod = (typeof document !== 'undefined' && document.getElementById('histModulo'))
        ? document.getElementById('histModulo').value : 'all';
      const filterEsc = (typeof document !== 'undefined' && document.getElementById('histEscenario'))
        ? document.getElementById('histEscenario').value : 'all';
      const filterEst = (typeof document !== 'undefined' && document.getElementById('histEstado'))
        ? document.getElementById('histEstado').value : 'all';
      const filterTipo = (typeof document !== 'undefined' && document.getElementById('histTipo'))
        ? document.getElementById('histTipo').value : 'all';
      const filterFecha = (typeof document !== 'undefined' && document.getElementById('histFecha'))
        ? document.getElementById('histFecha').value : '';

      // Aplicar filtros en memoria
      const filtered = rows.filter(r => {
        const simId = r[0];
        const fecha = r[1] || '';
        const estado = r[2] || '';
        const casoNom = r[5] || '';
        const escTipo = r[6] || '';
        const origenId = r[7];
        const usuarioEquipo = r[9] || '';
        const casoId = r[10];

        if (filterMod !== 'all' && Number(filterMod) !== casoId) return false;
        if (filterEsc !== 'all' && escTipo !== filterEsc) return false;
        if (filterEst !== 'all' && estado !== filterEst) return false;
        if (filterTipo === 'ejemplo' && usuarioEquipo !== 'EJEMPLO') return false;
        if (filterTipo === 'usuario' && (usuarioEquipo === 'EJEMPLO' || origenId !== null)) return false;
        if (filterTipo === 'relanzada' && origenId === null) return false;
        if (filterFecha && !fecha.startsWith(filterFecha)) return false;

        if (search) {
          const matchId = String(simId).includes(search);
          const matchOrigen = origenId != null && String(origenId).includes(search);
          const matchMod = casoNom.toLowerCase().includes(search);
          const matchEsc = escTipo.toLowerCase().includes(search);
          const matchEst = estado.toLowerCase().includes(search);
          const matchUser = usuarioEquipo.toLowerCase().includes(search);
          if (!matchId && !matchOrigen && !matchMod && !matchEsc && !matchEst && !matchUser) {
            return false;
          }
        }
        return true;
      });

      if (filtered.length === 0) {
        container.innerHTML = `
          <div style="padding:24px;text-align:center;background:rgba(255,255,255,0.02);border-radius:6px;border:1px dashed rgba(255,255,255,0.15)">
            <p class="note" style="margin-bottom:8px">No se encontraron simulaciones que coincidan con los criterios de búsqueda y filtros seleccionados.</p>
            <button class="btn ghost sm" onclick="DB.resetHistoryFilters()">Restablecer filtros</button>
          </div>
        `;
        return;
      }

      const counterNotice = (filtered.length < rows.length)
        ? `<div style="font-size:0.8rem;color:var(--text-muted, #888);margin-bottom:8px">Mostrando <strong>${filtered.length}</strong> de <strong>${rows.length}</strong> simulaciones registradas</div>`
        : '';

      const html = `
        ${counterNotice}
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
            ${filtered.map(r => {
              const simId = r[0];
              const fecha = r[1];
              const estado = r[2];
              const coincide = r[3];
              const diffMax = r[4];
              const casoNom = r[5];
              const escTipo = r[6];
              const origenId = r[7];

              let idDisplay = `<strong>#${simId}</strong>`;
              if (origenId != null) {
                idDisplay += `<span style="font-size:0.75rem;color:var(--text-muted, #888);display:block">↳ #${origenId}</span>`;
              }

              let valBadge = '<span class="pill" style="opacity:0.7">Original</span>';
              if (origenId != null) {
                if (coincide === 1) {
                  valBadge = `<button class="pill ok" style="cursor:pointer;border:none;font-weight:600" onclick="DB.showComparisonDetail(${simId})" title="Clic para ver detalle de comparación">✔ Coincide (Δ=${fmtExp(diffMax)})</button>`;
                } else if (coincide === 0) {
                  valBadge = `<button class="pill bad" style="cursor:pointer;border:none;font-weight:600" onclick="DB.showComparisonDetail(${simId})" title="Clic para ver detalle de discrepancias">✘ Difiere (Δ=${fmtExp(diffMax)})</button>`;
                }
              }

              return `
              <tr>
                <td>${idDisplay}</td>
                <td>${fecha}</td>
                <td>${casoNom}</td>
                <td><span class="pill ${escTipo === 'NORMAL' ? 'ok' : escTipo === 'ESTRES' ? 'bad' : 'warn'}">${escTipo}</span></td>
                <td><span class="pill ${estado === 'COMPLETADO' ? 'ok' : 'bad'}">${estado}</span></td>
                <td>${valBadge}</td>
                <td style="text-align:center;display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
                  <button class="btn ghost sm" onclick="DB.loadSimulation(${simId})" title="Abrir simulación guardada (sin recálculo)">Abrir</button>
                  <button class="btn ghost sm" style="color:#7ee787;border-color:rgba(126,231,135,0.4)" onclick="DB.relaunchSimulationUI(${simId})" title="Relanzar y comparar matemáticamente">Relanzar</button>
                  <button class="btn ghost sm" style="color:#ff5c5c;border-color:rgba(255,92,92,0.4)" onclick="DB.deleteSimulation(${simId})" title="Eliminar de la BD">✕</button>
                </td>
              </tr>
            `;}).join('')}
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
    upgradeExamples,
    saveSimulationTransaction,
    saveSimulation,
    saveCurrentSimulation,
    loadSimulation,
    readSimulationFromDB,
    recomputeExecutions,
    relaunchSimulation,
    relaunchSimulationUI,
    showComparisonDetail,
    closeComparisonModal,
    exitQueryMode,
    getQueryMode,
    getLastLoadedSimulation,
    renderSimulationFromDB,
    deleteSimulation,
    renderHistory,
    resetHistoryFilters,
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
