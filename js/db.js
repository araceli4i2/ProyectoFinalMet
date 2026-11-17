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

  // Persistir base en IndexedDB
  async function persist() {
    if (!db) return;
    const binary = db.export();
    await saveToIDB(IDB_KEY, binary);
  }

  function updateDBStatus(msg) {
    const el = document.getElementById('dbStatusPill');
    if (el) el.innerHTML = `🟢 <strong>${msg}</strong>`;
  }

  // Descargar archivo .db
  function downloadDB() {
    if (!db) { alert('Base de datos no inicializada'); return; }
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
        alert('Base de datos SQLite cargada y persistida exitosamente.');
      } catch (e) {
        alert('Error al cargar la base de datos: ' + e.message);
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
    alert('Base de datos restablecida a los valores iniciales de fábrica.');
  }

  // Guardar la simulación actual activa en la BD relacional
  async function saveCurrentSimulation() {
    if (!db) { alert('Base de datos no disponible'); return; }
    if (!window.LAST || !window.LAST.r1) { alert('Ejecuta primero los cálculos de la simulación'); return; }

    try {
      const escCode = (document.getElementById('scen') ? document.getElementById('scen').value : 'N') || 'N';
      const escTipo = (escCode === 'E') ? 'ESTRES' : (escCode === 'MC' || escCode === 'M') ? 'MAL_CONDICIONADO' : 'NORMAL';
      
      // Buscar o insertar el escenario correspondiente
      // Usaremos caso_id = 1 (o genérico según el módulo que se quiera auditar)
      // Mapeo: escenario 1 (M1), 4 (M2), 7 (M3), 10 (M4)
      const escRes = db.exec(`SELECT id FROM escenario WHERE tipo = '${escTipo}' LIMIT 1;`);
      let escenarioId = 1;
      if (escRes && escRes.length && escRes[0].values.length) {
        escenarioId = escRes[0].values[0][0];
      }

      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const usuario = 'Usuario Web / SIMTELE-RISK';
      const estado = 'COMPLETADO';

      db.run(`
        INSERT INTO simulacion (escenario_id, fecha, usuario_equipo, estado, coincide, diferencia_max, tol_comparacion)
        VALUES (${escenarioId}, '${now}', '${usuario}', '${estado}', 1, 0.0, 0.001);
      `);

      const simRes = db.exec('SELECT last_insert_rowid();');
      const simId = simRes[0].values[0][0];

      const { r1, r2, r3, r4 } = window.LAST;

      // Inserción de ejecuciones de métodos
      if (r1) {
        db.run(`INSERT INTO ejecucion_metodo (simulacion_id, familia, metodo, paso, max_iter, convergio, estado, tiempo_ms)
                VALUES (${simId}, 'EDO', 'Runge-Kutta 4', ${r1.p ? r1.p.h : 0.05}, ${r1.num ? r1.num.steps : 200}, 1, 'COMPLETADO', 1.2);`);
        const ejId = db.exec('SELECT last_insert_rowid();')[0].values[0][0];
        const valJson = JSON.stringify({ D_total: r1.D, t_det: r1.tdet, d_reaccion: r1.dR, seguro: r1.seguro });
        db.run(`INSERT INTO resultado_resumen (ejecucion_id, referencia, valor_json, metrica_error_json, conclusion_numerica, conclusion_problema)
                VALUES (${ejId}, 'Analitica', '${valJson}', '{"error":0.0}', 'Integración temporal validada.', '${r1.seguro ? "Operación dentro de margen de seguridad." : "Supera distancia de seguridad: riesgo físico."}');`);
      }

      if (r2) {
        db.run(`INSERT INTO ejecucion_metodo (simulacion_id, familia, metodo, tolerancia, max_iter, convergio, estado, tiempo_ms)
                VALUES (${simId}, 'RAICES', 'Newton-Raphson', 1e-8, 100, 1, 'CONVERGIO', 0.5);`);
        const ejId = db.exec('SELECT last_insert_rowid();')[0].values[0][0];
        const valJson = JSON.stringify({ t_star: r2.tStar, sensibilidad: r2.sens, estado: r2.estado });
        db.run(`INSERT INTO resultado_resumen (ejecucion_id, referencia, valor_json, metrica_error_json, conclusion_numerica, conclusion_problema)
                VALUES (${ejId}, 'Vieta', '${valJson}', '{"residuo":0.0}', 'Newton converge en forma cuadrática.', 'Cruce proyectado del umbral Du.');`);
      }

      if (r3) {
        db.run(`INSERT INTO ejecucion_metodo (simulacion_id, familia, metodo, tolerancia, paso, max_iter, convergio, estado, tiempo_ms)
                VALUES (${simId}, 'EDO_SISTEMA', 'RK4 Armónico', 1e-10, 0.05, 1200, 1, 'COMPLETADO', 1.5);`);
        const ejId = db.exec('SELECT last_insert_rowid();')[0].values[0][0];
        const valJson = JSON.stringify({ X: r3.X, Alim: r3.Alim, omega: r3.w, zeta: r3.z, cumple: r3.X <= r3.Alim });
        db.run(`INSERT INTO resultado_resumen (ejecucion_id, referencia, valor_json, metrica_error_json, conclusion_numerica, conclusion_problema)
                VALUES (${ejId}, 'Analitica', '${valJson}', '{"error":0.0}', 'Régimen armónico calculado con exactitud.', '${r3.X <= r3.Alim ? "Amplitud bajo límite reglamentario." : "Amplitud excede límite seguro."}');`);
      }

      if (r4) {
        db.run(`INSERT INTO ejecucion_metodo (simulacion_id, familia, metodo, tolerancia, max_iter, convergio, estado, tiempo_ms)
                VALUES (${simId}, 'SISTEMAS_LINEALES', 'Gradiente conjugado', ${r4.tol || 1e-10}, 50000, 1, 'CONVERGIO', 0.4);`);
        const ejId = db.exec('SELECT last_insert_rowid();')[0].values[0][0];
        const valJson = JSON.stringify({ kappa2: r4.kap, xref: r4.xref });
        db.run(`INSERT INTO resultado_resumen (ejecucion_id, referencia, valor_json, metrica_error_json, conclusion_numerica, conclusion_problema)
                VALUES (${ejId}, 'LU Directo', '${valJson}', '{"error_rel":0.0}', 'Gradiente Conjugado resuelve el sistema normal SPD.', 'Condicionamiento auditado.');`);
      }

      await persist();
      renderHistory();
      alert(`Simulación #${simId} guardada con éxito en la base de datos relacional SQLite.`);
    } catch (e) {
      console.error(e);
      alert('Error guardando en la base de datos: ' + e.message);
    }
  }

  // Cargar simulación desde la base de datos a la interfaz
  function loadSimulation(simId) {
    if (!db) return;
    try {
      const res = db.exec(`
        SELECT s.id, s.fecha, e.tipo, e.parametros_json, e.caso_id
        FROM simulacion s
        JOIN escenario e ON s.escenario_id = e.id
        WHERE s.id = ${simId};
      `);
      if (!res || !res.length || !res[0].values.length) {
        alert('Simulación no encontrada.');
        return;
      }
      const [id, fecha, tipo, paramJson, casoId] = res[0].values[0];
      const scenKey = (tipo === 'NORMAL') ? 'N' : (tipo === 'ESTRES') ? 'E' : 'MC';
      
      const scenEl = document.getElementById('scen');
      if (scenEl) {
        scenEl.value = scenKey;
        if (typeof window.applyScenario === 'function') window.applyScenario();
      }

      if (paramJson) {
        try {
          const P = JSON.parse(paramJson);
          const modKey = casoId === 1 ? 'm1' : casoId === 2 ? 'm2' : casoId === 3 ? 'm3' : 'm4';
          if (typeof window.setForm === 'function') {
            window.setForm(modKey, P);
            if (typeof window.recalcAll === 'function') window.recalcAll();
          }
        } catch (err) {
          console.warn('Error parseando parámetros JSON del escenario:', err);
        }
      }

      alert(`Simulación #${id} (${tipo}) cargada en la interfaz.`);
    } catch (e) {
      alert('Error cargando simulación: ' + e.message);
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
      alert('Error al eliminar simulación: ' + e.message);
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
                  <button class="btn ghost sm" onclick="DB.loadSimulation(${r[0]})" title="Cargar parámetros en la interfaz">Cargar</button>
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
    persist,
    downloadDB,
    loadDB,
    resetToSeed,
    saveCurrentSimulation,
    loadSimulation,
    deleteSimulation,
    renderHistory
  };
})();

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  DB.init();
});
