-- =====================================================================
-- SIMTELE-RISK · Datos Semilla e Inicialización (SQLite)
-- Escenarios predefinidos e historial inicial demostrativo
-- =====================================================================

PRAGMA foreign_keys = ON;

-- 1. Inserción de Escenarios Oficiales por Caso de Estudio

-- Módulo 1 (caso_id = 1)
INSERT INTO escenario (id, caso_id, tipo, parametros_json, fuente_datos) VALUES
(1, 1, 'NORMAL', '{"model":"const","v0":5,"a0":1.25,"amax":1.5,"k":2,"c":0,"T":4,"sensor":0.1,"red":0.05,"plc":0.1,"act":0.15,"dseg":15,"h":0.05}', 'Informe Técnico SIMTELE-RISK v1.0 - Caso Nominal'),
(2, 1, 'ESTRES', '{"model":"const","v0":7,"a0":0.6,"amax":1.5,"k":0.8,"c":0,"T":4,"sensor":0.15,"red":0.55,"plc":0.2,"act":0.3,"dseg":15,"h":0.05}', 'Informe Técnico SIMTELE-RISK v1.0 - Alta Latencia y Velocidad'),
(3, 1, 'MAL_CONDICIONADO', '{"model":"tang","v0":5,"a0":1.25,"amax":1.5,"k":2,"c":0,"T":4,"sensor":0.1,"red":0.05,"plc":0.1,"act":0.15,"dseg":15,"h":0.05}', 'Informe Técnico SIMTELE-RISK v1.0 - Frenado Tangencial Raíz Doble');

-- Módulo 2 (caso_id = 2)
INSERT INTO escenario (id, caso_id, tipo, parametros_json, fuente_datos) VALUES
(4, 2, 'NORMAL', '{"D0":0.1,"alpha":0.015,"beta":0.001,"Du":0.3,"tmax":20}', 'Informe Técnico SIMTELE-RISK v1.0 - Desgaste Progresivo Normal'),
(5, 2, 'ESTRES', '{"D0":0.12,"alpha":0.025,"beta":0.002,"Du":0.3,"tmax":20}', 'Informe Técnico SIMTELE-RISK v1.0 - Desgaste Severo Acelerado'),
(6, 2, 'MAL_CONDICIONADO', '{"D0":0.24,"alpha":0.002,"beta":0.0001,"Du":0.2401,"tmax":20}', 'Informe Técnico SIMTELE-RISK v1.0 - Cancelación Catastrófica y Umbral Próximo');

-- Módulo 3 (caso_id = 3)
INSERT INTO escenario (id, caso_id, tipo, parametros_json, fuente_datos) VALUES
(7, 3, 'NORMAL', '{"m":1000,"k":4000,"c":200,"F0":400,"Om":1.2,"Alim":0.5,"Tsim":60,"ruido":0.05}', 'Informe Técnico SIMTELE-RISK v1.0 - Viento Moderado Subcrítico'),
(8, 3, 'ESTRES', '{"m":1000,"k":4000,"c":100,"F0":400,"Om":1.9,"Alim":0.5,"Tsim":60,"ruido":0.05}', 'Informe Técnico SIMTELE-RISK v1.0 - Viento Cercano a Resonancia'),
(9, 3, 'MAL_CONDICIONADO', '{"m":1000,"k":4000,"c":20,"F0":40,"Om":2.0,"Alim":0.5,"Tsim":150,"ruido":0.05}', 'Informe Técnico SIMTELE-RISK v1.0 - Resonancia Exacta Bajo Amortiguamiento');

-- Módulo 4 (caso_id = 4)
INSERT INTO escenario (id, caso_id, tipo, parametros_json, fuente_datos) VALUES
(10, 4, 'NORMAL', '{"pts":12,"grado":3,"a":-1,"b":1,"sigma":0,"seed":2026,"coefs":"1,2,-1.5,0.5","tol":1e-10}', 'Informe Técnico SIMTELE-RISK v1.0 - Ajuste Grado 3 Sin Ruido [-1, 1]'),
(11, 4, 'ESTRES', '{"pts":60,"grado":3,"a":-1,"b":1,"sigma":0.05,"seed":2026,"coefs":"1,2,-1.5,0.5","tol":1e-12}', 'Informe Técnico SIMTELE-RISK v1.0 - Ajuste con Ruido Blanco Gaussiano'),
(12, 4, 'MAL_CONDICIONADO', '{"pts":30,"grado":5,"a":0,"b":1,"sigma":0,"seed":2026,"coefs":"1,1,1,1,1,1","tol":1e-10}', 'Informe Técnico SIMTELE-RISK v1.0 - Base Monomial sobre [0, 1] Grado 5');


-- 2. Historial de Simulaciones Inicial (1 corrida representativa por módulo)

-- Simulación 1: Módulo 1 (Escenario NORMAL)
INSERT INTO simulacion (id, escenario_id, fecha, usuario_equipo, estado, simulacion_origen_id, coincide, diferencia_max, tol_comparacion) VALUES
(1, 1, '2026-11-14 10:00:00', 'EJEMPLO', 'COMPLETADO', NULL, NULL, NULL, NULL);

INSERT INTO ejecucion_metodo (id, simulacion_id, familia, metodo, tolerancia, paso, max_iter, convergio, estado, tiempo_ms) VALUES
(1, 1, 'EDO', 'Runge-Kutta 4', NULL, 0.05, 200, 1, 'COMPLETADO', 1.25),
(2, 1, 'EDO', 'Heun (RK2)', NULL, 0.05, 200, 1, 'COMPLETADO', 0.85),
(3, 1, 'SISTEMAS_LINEALES', 'Gradiente conjugado', 1e-6, NULL, 50000, 1, 'CONVERGIO', 0.32);

INSERT INTO resultado_resumen (id, ejecucion_id, referencia, valor_json, metrica_error_json, conclusion_numerica, conclusion_problema) VALUES
(1, 1, 'Analitica', '{"t_det":4.00,"d_frenado":10.00,"d_reaccion":2.00,"D_total":12.00,"margen":3.00,"seguro":true}', '{"error_t":0.0,"error_x":0.0}', 'Convergencia de orden O(h^4) con concordancia analítica estricta.', 'Parada completa a 12.00 m, dentro del margen de seguridad D_seg = 15.00 m. Operación SEGURA.'),
(2, 2, 'Analitica', '{"t_det":4.00,"d_frenado":10.00,"d_reaccion":2.00,"D_total":12.00,"margen":3.00,"seguro":true}', '{"error_t":0.0,"error_x":0.0}', 'Método predictor-corrector O(h^2) reproduce la parada nominal.', 'Sistema verificado con paso h = 0.05 s.'),
(3, 3, 'x*=[2, 3, 2.5, 1.5]', '{"x":[2.0,3.0,2.5,1.5],"residual":6.45e-17,"iteraciones":4}', '{"error_inf":6.45e-17,"error_rel":2.15e-17}', 'Gradiente Conjugado resuelve el sistema 4x4 SPD en n = 4 iteraciones exactas.', 'Circuito electrohidráulico de presiones balanceado.');

INSERT INTO serie_grafico (id, ejecucion_id, nombre, datos_json) VALUES
(1, 1, 'v(t) Frenado RK4', '[{"x":0,"y":5.0},{"x":1,"y":3.75},{"x":2,"y":2.5},{"x":3,"y":1.25},{"x":4,"y":0.0}]'),
(2, 1, 'x(t) Trayectoria RK4', '[{"x":0,"y":0.0},{"x":1,"y":4.375},{"x":2,"y":7.5},{"x":3,"y":9.375},{"x":4,"y":10.0}]');


-- Simulación 2: Módulo 2 (Escenario NORMAL)
INSERT INTO simulacion (id, escenario_id, fecha, usuario_equipo, estado, simulacion_origen_id, coincide, diferencia_max, tol_comparacion) VALUES
(2, 4, '2026-11-14 10:15:00', 'EJEMPLO', 'COMPLETADO', NULL, NULL, NULL, NULL);

INSERT INTO ejecucion_metodo (id, simulacion_id, familia, metodo, tolerancia, paso, max_iter, convergio, estado, tiempo_ms) VALUES
(4, 2, 'RAICES', 'Newton-Raphson', 1e-8, NULL, 100, 1, 'CONVERGIO', 0.42),
(5, 2, 'RAICES', 'Biseccion', 1e-8, NULL, 100, 1, 'CONVERGIO', 0.65),
(6, 2, 'ANALITICO', 'Formula Vieta Estable', NULL, NULL, 1, 1, 'DIRECTO', 0.05);

INSERT INTO resultado_resumen (id, ejecucion_id, referencia, valor_json, metrica_error_json, conclusion_numerica, conclusion_problema) VALUES
(4, 4, 'Vieta', '{"t_star":8.5078125,"sensibilidad":31.2348,"condicion_relativa":1.1014}', '{"residuo":0.0,"error_rel":0.0}', 'Newton-Raphson converge en 5 iteraciones con precisión de máquina.', 'Cruce del umbral Du = 0.30 proyectado a 8.51 meses. Mantenimiento preventivo programable.'),
(5, 5, 'Vieta', '{"t_star":8.5078125}', '{"residuo":1.2e-8,"error_rel":1.4e-9}', 'Bisección converge en 28 subdivisiones de intervalo.', 'Verificación de cota de error absoluta asegurada.'),
(6, 6, 'Solucion Cerrada', '{"t_star":8.5078125}', '{"residuo":0.0}', 'Formulación de Vieta 2ΔD/(α+√Δ) neutraliza cancelación sustractiva.', 'Referencia analítica patrón.');

INSERT INTO serie_grafico (id, ejecucion_id, nombre, datos_json) VALUES
(3, 4, 'D(t) Curva de Deterioro', '[{"x":0,"y":0.10},{"x":4,"y":0.176},{"x":8,"y":0.284},{"x":8.5078,"y":0.30},{"x":12,"y":0.424}]');


-- Simulación 3: Módulo 3 (Escenario NORMAL)
INSERT INTO simulacion (id, escenario_id, fecha, usuario_equipo, estado, simulacion_origen_id, coincide, diferencia_max, tol_comparacion) VALUES
(3, 7, '2026-11-14 10:30:00', 'EJEMPLO', 'COMPLETADO', NULL, NULL, NULL, NULL);

INSERT INTO ejecucion_metodo (id, simulacion_id, familia, metodo, tolerancia, paso, max_iter, convergio, estado, tiempo_ms) VALUES
(7, 3, 'EDO_SISTEMA', 'Runge-Kutta 4 Armonico', NULL, 0.05, 1200, 1, 'COMPLETADO', 1.80),
(8, 3, 'SISTEMAS_LINEALES', 'Gradiente conjugado 3x3', 1e-10, NULL, 50000, 1, 'CONVERGIO', 0.28);

INSERT INTO resultado_resumen (id, ejecucion_id, referencia, valor_json, metrica_error_json, conclusion_numerica, conclusion_problema) VALUES
(7, 7, 'Analitica', '{"X":0.1556,"omega":2.0,"zeta":0.05,"Alim":0.50,"cumple":true}', '{"error_X":0.0002}', 'Integración numérica temporal coincide con la envolvente estacionaria.', 'Amplitud lateral de 0.16 m por debajo del umbral de seguridad Alim = 0.50 m. CUMPLE.'),
(8, 8, 'Calibracion Sintetica', '{"m_cal":1000.0,"k_cal":4000.0,"c_cal":200.0,"kappa2":304.57}', '{"residual":5.13e-14}', 'Calibración 3x3 SPD converge en 3 iteraciones mediante Gradiente Conjugado.', 'Parámetros estructurales identificados con fidelidad.');

INSERT INTO serie_grafico (id, ejecucion_id, nombre, datos_json) VALUES
(4, 7, 'Oscilacion x(t)', '[{"x":0,"y":0.0},{"x":10,"y":0.154},{"x":20,"y":0.155},{"x":30,"y":0.1556}]');


-- Simulación 4: Módulo 4 (Escenario NORMAL)
INSERT INTO simulacion (id, escenario_id, fecha, usuario_equipo, estado, simulacion_origen_id, coincide, diferencia_max, tol_comparacion) VALUES
(4, 10, '2026-11-14 10:45:00', 'EJEMPLO', 'COMPLETADO', NULL, NULL, NULL, NULL);

INSERT INTO ejecucion_metodo (id, simulacion_id, familia, metodo, tolerancia, paso, max_iter, convergio, estado, tiempo_ms) VALUES
(9, 4, 'SISTEMAS_LINEALES', 'LU (directo)', NULL, NULL, 1, 1, 'DIRECTO', 0.15),
(10, 4, 'SISTEMAS_LINEALES', 'Gradiente conjugado', 1e-10, NULL, 50000, 1, 'CONVERGIO', 0.35),
(11, 4, 'SISTEMAS_LINEALES', 'Jacobi', 1e-10, NULL, 50000, 1, 'CONVERGIO', 0.90),
(12, 4, 'SISTEMAS_LINEALES', 'Gauss-Seidel', 1e-10, NULL, 50000, 1, 'CONVERGIO', 0.60);

INSERT INTO resultado_resumen (id, ejecucion_id, referencia, valor_json, metrica_error_json, conclusion_numerica, conclusion_problema) VALUES
(9, 9, 'x*=[1, 2, -1.5, 0.5]', '{"coefs":[1.0,2.0,-1.5,0.5],"kappa2":51.27}', '{"error_rel":0.0}', 'Factorización LU resuelve el sistema normal de mínimos cuadrados.', 'Curva calibrada con precisión exacta sin ruido.'),
(10, 10, 'x*=[1, 2, -1.5, 0.5]', '{"iteraciones":4,"residual":4.12e-16}', '{"error_rel":1.03e-16}', 'Gradiente Conjugado converge en n = 4 iteraciones para matriz SPD de grado 3.', 'Ajuste polinómico de sensores estable.'),
(11, 11, 'x*=[1, 2, -1.5, 0.5]', '{"iteraciones":279,"residual":9.37e-11}', '{"error_rel":2.34e-11}', 'Jacobi converge tras 279 iteraciones con criterio relativo rel2.', 'Convergencia monótona asegurada por diagonal dominante.'),
(12, 12, 'x*=[1, 2, -1.5, 0.5]', '{"iteraciones":116,"residual":9.98e-11}', '{"error_rel":2.49e-11}', 'Gauss-Seidel converge en 116 iteraciones, más del doble de rápido que Jacobi.', 'Factor asintótico de reducción de error confirmado.');

INSERT INTO serie_grafico (id, ejecucion_id, nombre, datos_json) VALUES
(5, 9, 'Ajuste Minimos Cuadrados', '[{"x":-1,"y":-4.0},{"x":-0.5,"y":-0.4375},{"x":0,"y":1.0},{"x":0.5,"y":1.6875},{"x":1,"y":2.0}]');
