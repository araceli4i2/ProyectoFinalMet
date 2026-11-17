-- =====================================================================
-- SIMTELE-RISK · Esquema de Base de Datos Relacional (SQLite)
-- Proyecto: Métodos Numéricos - UMSA
-- =====================================================================

PRAGMA foreign_keys = ON;

-- 1. Catálogo de Casos de Estudio (Módulos del Sistema)
CREATE TABLE IF NOT EXISTS caso_estudio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    modelo_version TEXT NOT NULL,
    descripcion_fisica TEXT
);

-- 2. Escenarios Operativos por Caso de Estudio
CREATE TABLE IF NOT EXISTS escenario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caso_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('NORMAL', 'ESTRES', 'MAL_CONDICIONADO')),
    parametros_json TEXT NOT NULL,
    fuente_datos TEXT NOT NULL,
    FOREIGN KEY (caso_id) REFERENCES caso_estudio(id) ON DELETE CASCADE
);

-- 3. Historial de Simulaciones (Corridas)
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

-- 4. Ejecución de Métodos Numéricos por Simulación
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

-- 5. Historial de Iteraciones por Método
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

-- 6. Resumen de Resultados Finales por Método (Relación 1:1 con ejecucion_metodo)
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

-- 7. Series de Datos para Gráficos
CREATE TABLE IF NOT EXISTS serie_grafico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ejecucion_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    datos_json TEXT NOT NULL,
    FOREIGN KEY (ejecucion_id) REFERENCES ejecucion_metodo(id) ON DELETE CASCADE
);

-- Índices obligatorios de búsqueda y relaciones
CREATE INDEX IF NOT EXISTS idx_escenario_caso ON escenario(caso_id);
CREATE INDEX IF NOT EXISTS idx_simulacion_escenario ON simulacion(escenario_id);
CREATE INDEX IF NOT EXISTS idx_simulacion_fecha ON simulacion(fecha);
CREATE INDEX IF NOT EXISTS idx_simulacion_origen ON simulacion(simulacion_origen_id);
CREATE INDEX IF NOT EXISTS idx_ejecucion_simulacion ON ejecucion_metodo(simulacion_id);
CREATE INDEX IF NOT EXISTS idx_iteracion_ejecucion_num ON iteracion_resultado(ejecucion_id, numero);
CREATE INDEX IF NOT EXISTS idx_serie_ejecucion ON serie_grafico(ejecucion_id);

-- Catálogo precargado: 4 filas en caso_estudio
INSERT INTO caso_estudio (id, nombre, modelo_version, descripcion_fisica) VALUES
(1, 'Módulo 1 · Detención de emergencia', 'v1.0', 'Dinámica de frenado electrohidráulico, integración de EDOs (Heun vs RK4), cadena de latencias distribuidas y sistema 4×4 SPD auxiliar de presiones.'),
(2, 'Módulo 2 · Deterioro mecánico', 'v1.0', 'Modelo de fatiga acumulada en cables tractores, leyes no lineales de desgaste, algoritmos de raíces (Bisección y Newton-Raphson), resolución de cancelación catastrófica mediante Vieta y sensibilidad dt*/dDu.'),
(3, 'Módulo 3 · Oscilaciones por viento', 'v1.0', 'Dinámica pendular y aeroelástica de cabinas bajo ráfagas armónicas forzadas con amortiguamiento, verificación frente a umbral Alim = 0.50 m y calibración de parámetros estructurales 3×3 SPD.'),
(4, 'Módulo 4 · Reconstrucción de sensores', 'v1.0', 'Reconstrucción de señales con ruido por mínimos cuadrados polinómicos, análisis de mal condicionamiento con base monomial, comparativa de solucionadores lineales (LU, Jacobi, Gauss-Seidel, Gradiente Conjugado) e interpolación (Lagrange, Newton, Splines).');
