# SIMTELE-RISK 🚡
### Plataforma de Simulación Numérica y Evaluación de Riesgos para Transporte Urbano por Cable

[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/es/docs/Web/HTML)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/es/docs/Web/JavaScript)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)](https://developer.mozilla.org/es/docs/Web/CSS)
[![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white)](https://www.chartjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Status: Production](https://img.shields.io/badge/Status-Verified_&_Audited-success?style=for-the-badge)]()

---

## 📋 Resumen Ejecutivo

**SIMTELE-RISK** es un entorno interactivo de cómputo científico y simulación numérica orientado a la ingeniería de transporte por cable urbano (inspirado en la infraestructura topográfica y electromecánica de sistemas como *Mi Teleférico* en La Paz – El Alto).

La plataforma permite modelar, simular y auditar fenómenos físicos y mecánicos críticos que comprometen la seguridad de los pasajeros:
1. **Dinámica de frenado de emergencia** bajo retardos de telemetría y control electrohidráulico.
2. **Degradación progresiva y fatiga de componentes mecánicos**, previniendo fallos por cancelación catastrófica de punto flotante.
3. **Respuesta aeroelástica y oscilaciones transversales de cabinas** inducidas por ráfagas de viento y resonancia armónica.
4. **Reconstrucción e interpolación de señales de sensores** mediante mínimos cuadrados y resolución de sistemas lineales simétricos definidos positivos (SPD).

La aplicación está diseñada bajo una arquitectura desacoplada de alto rendimiento, ejecutada completamente en el navegador (Client-Side), garantizando precisión numérica estricta, reproducibilidad determinista y visualización en tiempo real.

---

## ⚙️ Arquitectura Modular y Métodos Numéricos

El núcleo computacional implementa rigurosamente las familias fundamentales de **Métodos Numéricos para Ingeniería**:

```
                           ┌─────────────────────────────────────────┐
                           │         SIMTELE-RISK PLATFORM           │
                           └────────────────────┬────────────────────┘
                                                │
         ┌──────────────────┬───────────────────┴───────────────────┬──────────────────┐
         │                  │                                       │                  │
         ▼                  ▼                                       ▼                  ▼
┌─────────────────┐┌─────────────────┐                     ┌─────────────────┐┌─────────────────┐
│    MÓDULO 1     ││    MÓDULO 2     │                     │    MÓDULO 3     ││    MÓDULO 4     │
│  Frenado & EDO  ││ Fatiga & Raíces │                     │Viento & Armónico││Sensores & Álg. L│
├─────────────────┤├─────────────────┤                     ├─────────────────┤├─────────────────┤
│• Heun (RK2)     ││• Bisección      │                     │• RK4 Temporal   ││• LU Directo     │
│• Runge-Kutta 4  ││• Newton-Raphson │                     │• Reg. Permanente││• Jacobi & GS    │
│• Cadena latencia││• Vieta (estable)│                     │• Resonancia     ││• Grad. Conjugado│
│• Sist. 4x4 SPD  ││• Condición κ_rel│                     │• Calib. 3x3 SPD ││• Spline & Newt. │
└─────────────────┘└─────────────────┘                     └─────────────────┘└─────────────────┘
```

---

### Módulo 1 · Detención de Emergencia y Latencias Industriales
Modela la desaceleración de cabinas al activar la parada de emergencia en línea:
- **Ecuaciones Diferenciales Ordinarias (EDO)**: Simulación comparativa entre integradores de paso fijo:
  $$\frac{dv}{dt} = -a(t, v), \quad \frac{dx}{dt} = v(t)$$
  * **Heun (Runge-Kutta orden 2)**: $\mathcal{O}(h^2)$
  * **Runge-Kutta orden 4 clásico (RK4)**: $\mathcal{O}(h^4)$
- **Cadena de Latencia Distribuida**: Tiempo de reacción total $t_r = t_{\text{sensor}} + t_{\text{red}} + t_{\text{PLC}} + t_{\text{actuador}}$.
- **Distancia de Parada Total**:
  $$D_{\text{total}} = v_0 \cdot t_r + d_{\text{frenado}}$$
- **Sistema Auxiliar Hidráulico (4×4 SPD)**: Modelación de presiones intermedias en actuadores electrohidráulicos mediante matriz estrictamente diagonal dominante.

---

### Módulo 2 · Deterioro Mecánico y Cancelación Catastrófica
Modela el índice de degradación acumulada $D(t) \in [0, 1]$ en cables y poleas tractoras:
- **Ley Cuadrática de Fricción**: $D(t) = D_0 + \alpha t + \beta t^2$.
- **Cálculo del Cruce de Umbral Crítico ($D(t^*) = D_u$)**:
  * **Bisección**: Convergencia lineal garantizada y acotada.
  * **Newton-Raphson**: Convergencia cuadrática $\mathcal{O}(\epsilon^2)$ con condición de parada por residuo y tolerancia absoluta.
  * **Fórmula Cuadrática Estable**: Se demuestra y neutraliza el error por **cancelación catastrófica** de la fórmula ingenua cuando $\beta \to 0$ mediante la transformación racional de Vieta:
    $$t^* = \frac{2(D_u - D_0)}{\alpha + \sqrt{\alpha^2 + 4\beta(D_u - D_0)}}$$
- **Análisis de Sensibilidad**: Cálculo de $\frac{dt^*}{dD_u}$ y número de condición relativo $\kappa_{\text{rel}}$.
- **Sistemas 4×4 SPD de Calibración**: Benchmarking con sistemas mal condicionados ($\kappa_2 \approx 1.99 \times 10^5$).

---

### Módulo 3 · Dinámica Lateral de Cabinas y Oscilaciones por Viento
Simula la respuesta aeroelástica de las cabinas suspendidas sometidas a ráfagas transversales periódicas:
- **Oscilador Armónico Amortiguado y Forzado**:
  $$m \ddot{x} + c \dot{x} + k x = F_0 \sin(\Omega t)$$
- **Magnitudes Físicas Clave**:
  * Frecuencia natural: $\omega = \sqrt{k/m}$
  * Factor de amortiguamiento: $\zeta = \frac{c}{2\sqrt{km}}$
  * Amplitud analítica en régimen permanente:
    $$X(\Omega) = \frac{F_0}{\sqrt{(k - m\Omega^2)^2 + (c\Omega)^2}}$$
- **Criterio de Seguridad Operativa**: Verificación frente al umbral crítico $A_{\text{lim}} = 0.50\text{ m}$.
- **Calibración Estructural (3×3 SPD Escalada)**: Ajuste de parámetros estructurales $(m, c, k)$ a partir de $5$ frecuencias operativas con ruido sintético ($\le 0.05\%$).

---

### Módulo 4 · Reconstrucción de Señales de Sensores e Interpolación
Tratamiento y regularización de mediciones procedentes de sensores de tensión y posición:
- **Mínimos Cuadrados Polinómicos**: Solución de las ecuaciones normales:
  $$(V^T V) c = V^T y$$
  * Impacto del mal condicionamiento numérico de la **base monomial** $\{1, r, \dots, r^d\}$ en el dominio $[0, 1]$ ($\kappa_2 \approx 1.15 \times 10^7$).
- **Benchmark Exhaustivo de Solucionadores de Álgebra Lineal**:
  1. **Factorización Directa LU**: Resolución exacta por sustitución progresiva y regresiva.
  2. **Método Iterativo de Jacobi**: Matriz de iteración $T_J = -D^{-1}(L + U)$.
  3. **Método Iterativo de Gauss-Seidel**: Matriz de iteración $T_{GS} = -(D + L)^{-1}U$.
  4. **Gradiente Conjugado (CG)**: Optimizador para sistemas SPD con convergencia teórica en a lo más $n$ pasos bajo aritmética exacta.
  5. **Análisis Espectral**: Radio espectral $\rho$ y predicción de velocidad de convergencia.
- **Interpolación Avanzada**:
  * Polinomio de **Lagrange**.
  * Polinomio de **Newton con Diferencias Divididas** y cálculo de cota teórica del error.
  * **Splines Cúbicos Naturales** ($C^2$) para evitar el fenómeno de Runge.

---

## 📊 Matriz de Escenarios Predefinidos

La plataforma permite conmutar de manera instantánea entre tres escenarios deterministas auditados:

| Parámetro / Magnitud | Normal ("N") | Estrés ("E") | Mal Condicionado ("MC") |
| :--- | :---: | :---: | :---: |
| **Módulo 1: Velocidad $v_0$** | $5.00\text{ m/s}$ | $7.00\text{ m/s}$ | $5.00\text{ m/s}$ |
| **Módulo 1: Latencia $t_r$** | $0.40\text{ s}$ | $1.20\text{ s}$ | $0.40\text{ s}$ |
| **Módulo 1: Distancia Total $D_{\text{total}}$** | **$12.00\text{ m}$ (Seguro)** | **$49.23\text{ m}$ (Crítico)** | **$8.67\text{ m}$ (Raíz doble)** |
| **Módulo 1: Sistema 4×4 ($\|r\|_\infty \le 10^{-6}$)** | $\kappa_2 = 2.13$ (Jac: 19, GS: 11, CG: 4) | $\kappa_2 = 2.13$ (Jac: 19, GS: 11, CG: 4) | $\kappa_2 = 2.13$ (Jac: 19, GS: 11, CG: 4) |
| **Módulo 2: Cruce de Umbral $t^*$** | $8.5078\text{ meses}$ | $5.1106\text{ meses}$ | $0.0499\text{ meses}$ |
| **Módulo 2: Sensibilidad $\frac{dt^*}{dD_u}$** | $31.23$ | $22.01$ | **$497.52$ (Hiper-sensible)** |
| **Módulo 2: Sistema 4×4 ($\|r\|_\infty \le 10^{-8}$)** | $\kappa_2 = 2.61$ (Jac: 25, GS: 13, CG: 4) | $\kappa_2 = 3.61$ (Jac: 35, GS: 17, CG: 4) | **$\kappa_2 \approx 199\,900$ (Jac: 18942, GS: 5922)** |
| **Módulo 3: Amplitud $X(\Omega)$** | **$0.16\text{ m} \le 0.50\text{ m}$ (Cumple)** | **$0.92\text{ m} > 0.50\text{ m}$ (No cumple)** | **$1.00\text{ m}$ (Resonancia)** |
| **Módulo 3: Calibración ($\|r\|_2/\|b\|_2 \le 10^{-10}$)** | $\kappa_2 = 304.57$ (CG: 3, GS: 1141) | $\kappa_2 = 304.57$ (CG: 3, GS: 1141) | $\kappa_2 = 304.57$ (CG: 3, GS: 1141) |
| **Módulo 4: Grado $d$, Muestras $m$** | $d=3, m=12$ | $d=3, m=60$ ($\sigma=0.05$) | $d=5, m=30$ |
| **Módulo 4: Condicionamiento $\kappa_2(A^T A)$** | $\kappa_2 = 51.27$ | $\kappa_2 = 63.05$ | **$\kappa_2 \approx 1.15 \times 10^7$ (Severo)** |
| **Módulo 4: Solucionadores Lineales** | Jac: 279, GS: 116, CG: 4 | Jac: 317, GS: 137, CG: 4 | **Jac: Diverge (158), GS: Límite (50k), CG: 7** |

---

## 🔄 Contrato de Intercambio JSON (`simtele-risk/simulacion/v1`)

La plataforma garantiza **reproducibilidad científica completa**. Permite exportar e importar el estado completo de la simulación mediante un contrato estructurado en formato JSON:

```json
{
  "contrato": "simtele-risk/simulacion/v1",
  "escenario": "N",
  "parametros": {
    "m1": { "v0": 5, "a0": 1.25, "amax": 1.5, "sensor": 0.1, "red": 0.05, "plc": 0.1, "act": 0.15, "dseg": 15, "h": 0.05 },
    "m2": { "D0": 0.1, "alpha": 0.015, "beta": 0.001, "Du": 0.3, "tmax": 20 },
    "m3": { "m": 1000, "k": 4000, "c": 200, "F0": 400, "Om": 1.2, "Alim": 0.5, "Tsim": 60, "ruido": 0.05 },
    "m4": { "pts": 12, "grado": 3, "a": -1, "b": 1, "sigma": 0, "seed": 2026, "tol": 1e-10 }
  },
  "resultados": {
    "m1": { "D_total": 12.0, "seguro": true },
    "m2": { "t_star": 8.5078, "sensibilidad": 31.2348 },
    "m3": { "X": 0.1556, "omega": 2.0 },
    "m4": { "kappa2": 51.27 }
  },
  "solvers": {
    "m1": [ ... ],
    "m2": [ ... ],
    "m3": [ ... ],
    "m4": [ ... ]
  }
}
```

> **Validación Automática**: Al importar un archivo JSON, el sistema repuebla todos los campos, activa el escenario correspondiente, reejecuta los algoritmos y audita las diferencias numéricas frente a una tolerancia de $\Delta \le 10^{-3}$.

---

## 🗄️ Persistencia Relacional y Convenciones de Datos (SQLite + IndexedDB)

La arquitectura de persistencia implementa el **DER acordado de 7 tablas** (`caso_estudio`, `escenario`, `simulacion`, `ejecucion_metodo`, `iteracion_resultado`, `resultado_resumen`, `serie_grafico`) sobre SQLite WebAssembly (`sql.js`), con persistencia local en `IndexedDB`:

### 1. Guardado Transaccional y Atomicidad (ACID)
- Todo guardado de simulación se encapsula en una única transacción atómica:
  ```sql
  BEGIN TRANSACTION;
  -- Inserción / verificación de escenario
  -- Inserción de simulacion
  -- Inserción de ejecucion_metodo (cualquier familia)
  -- Inserción de iteracion_resultado
  -- Inserción de resultado_resumen (relación 1:1)
  -- Inserción de serie_grafico (genérica)
  COMMIT;
  ```
- Si ocurre algún error en cualquier nivel, se dispara automáticamente `ROLLBACK;`, garantizando que la base de datos no quede en estado corrupto ni con filas parciales/huérfanas.
- La persistencia física en el binario de `IndexedDB` (`db.export()`) se ejecuta **únicamente después de un COMMIT confirmado**.

### 2. Regla de Escenarios Inmutables
- Los escenarios son inmutables para garantizar trazabilidad histórica:
  * Si los parámetros coinciden exactamente con un escenario registrado (`caso_id`, `tipo` y `parametros_json` canónicos idénticos), se **reutiliza** el `escenario_id` existente.
  * Si el usuario modifica cualquier parámetro, se inserta un **NUEVO** escenario en la tabla `escenario`.
  * **NUNCA** se ejecuta `UPDATE` sobre `parametros_json`.

### 3. Convención de Nomenclatura para Series (`serie_grafico`)
Para desacoplar el motor de guardado de los módulos numéricos y permitir que futuros métodos se integren sin modificar el esquema SQL, las series se registran de forma genérica:
- **Estructura**: `{ nombre: string, puntos: Array<{x, y}> | datos_json: string }`.
- **Formato de nombres**: `<MODULO>_<descripcion>`
  * **Módulo 1**: `M1_velocidad_rk4`, `M1_posicion_rk4`, `M1_velocidad_heun`, `M1_residual_<metodo>`.
  * **Módulo 2**: `M2_deterioro_curva`, `M2_sensibilidad_sweep`, `M2_residual_<metodo>`.
  * **Módulo 3**: `M3_oscilacion_tiempo`, `M3_resonancia_espectro`, `M3_residual_<metodo>`.
  * **Módulo 4**: `M4_ajuste_polinomico`, `M4_muestras_sensores`, `M4_interp_spline`, `M4_interp_lagrange`, `M4_puntos_ocultos`, `M4_residual_<metodo>`.

### 4. Convención de Enlace para Barridos Paramétricos
- Aquellas curvas que representan barridos paramétricos globales del módulo:
  * `M2_sensibilidad_sweep`: Barrido de sensibilidad $\frac{dt^*}{dD_u}$ frente a variación de incremento $\Delta D$.
  * `M3_resonancia_espectro`: Espectro de amplitud en frecuencia $|X(\Omega)|$.
- Se enlazan directamente a la **ejecución principal del módulo** (Newton-Raphson en el caso de M2 y RK4 Armónico en M3), garantizando integridad referencial con el método rector del caso de estudio.

### 5. Precisión Numérica Estricta (Unrounded JSON)
- Las aproximaciones, residuos y series numéricas se serializan mediante `JSON.stringify` nativo **sin redondeo artificial ni truncamiento** (preservación completa en coma flotante IEEE 754 de 64 bits), asegurando bit-exactness al relanzar o auditar simulaciones.

### 6. Política de Muestreo de Iteraciones (Series Extensas)
- Para mantener la ligereza de la base de datos relacional y evitar congelamiento de la interfaz en navegadores ante algoritmos con historiales prolongados (como Gauss-Seidel en M4 Mal Condicionado con $50\,000$ iteraciones), se implementa una política de **muestreo determinista uniforme**:
  - Si el historial de iteraciones contiene $N \le 500$ puntos, se almacena el **100% íntegro**.
  - Si $N > 500$ puntos, se submuestrea a exactamente **500 puntos** aplicando la regla:
    $$\text{idx}_j = \text{round}\left(\frac{j \cdot (N - 1)}{499}\right), \quad j = 0, 1, \dots, 499$$
  - Se **garantiza la preservación estricta de la primera iteración ($k=0$, residuo inicial) y de la última ($k=k_{\text{final}}$, estado final de parada)**.
  - Cada fila en `iteracion_resultado` conserva su índice de iteración real (`numero = idx`), preservando la escala temporal y la fidelidad analítica de la curva de convergencia.

### 7. Recuento Esperado de Ejecuciones e Iteraciones (Escenario Normal)
Al guardar la simulación interactiva completa desde la interfaz web, se registran **23 ejecuciones numéricas**, **1,489 filas de iteraciones** y **28 series gráficas**:

| Módulo / Caso de Estudio | Método Numérico | Familia | Iteraciones ($k$) | Filas en `iteracion_resultado` | Series Gráficas |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **M1: Detención** | Runge-Kutta 4 | EDO | — | 0 | 2 |
| | Heun (RK2) | EDO | — | 0 | 1 |
| | LU (directo) | SISTEMAS_LINEALES | 1 | 0 | 1 |
| | Jacobi | SISTEMAS_LINEALES | 19 | 20 | 1 |
| | Gauss-Seidel | SISTEMAS_LINEALES | 11 | 12 | 1 |
| | Gradiente conjugado | SISTEMAS_LINEALES | 4 | 5 | 1 |
| **M2: Deterioro** | Newton-Raphson | RAICES | 6 | 6 | 2 |
| | Bisección | RAICES | 45 | 45 | 0 |
| | Fórmula Vieta Estable | ANALITICO | 1 | 0 | 0 |
| | LU (directo) | SISTEMAS_LINEALES | 1 | 0 | 1 |
| | Jacobi | SISTEMAS_LINEALES | 25 | 26 | 1 |
| | Gauss-Seidel | SISTEMAS_LINEALES | 13 | 14 | 1 |
| | Gradiente conjugado | SISTEMAS_LINEALES | 4 | 5 | 1 |
| **M3: Viento** | RK4 Armónico | EDO_SISTEMA | — | 0 | 2 |
| | LU (directo) | SISTEMAS_LINEALES | 1 | 0 | 1 |
| | Jacobi | SISTEMAS_LINEALES | 449 | 450 | 1 |
| | Gauss-Seidel | SISTEMAS_LINEALES | 1141 | 500 *(Muestreado)* | 1 |
| | Gradiente conjugado | SISTEMAS_LINEALES | 3 | 4 | 1 |
| **M4: Sensores** | LU (directo) | SISTEMAS_LINEALES | 1 | 0 | 3 |
| | Jacobi | SISTEMAS_LINEALES | 279 | 280 | 1 |
| | Gauss-Seidel | SISTEMAS_LINEALES | 116 | 117 | 1 |
| | Gradiente conjugado | SISTEMAS_LINEALES | 4 | 5 | 1 |
| | Spline Cúbico Natural | INTERPOLACION | — | 0 | 3 |
| **TOTAL** | **23 ejecuciones** | — | — | **1,489 iteraciones** | **28 series** |

### 8. Guía para el Equipo: Cómo Agregar un Método o Familia al Guardado (Sin Tocar el Esquema SQL)

El esquema relacional de SQLite (`db/schema.sql`) fue diseñado para ser **100% genérico y extensible**. **NO es necesario alterar tablas ni agregar columnas** para incorporar nuevos métodos o familias.

#### ¿Por qué el esquema ya soporta cualquier método nuevo?
- La columna `familia TEXT NOT NULL` de `ejecucion_metodo` **no tiene restricción fija**: acepta libremente `'INTEGRACION'`, `'RAICES'`, `'EDO'`, `'INTERPOLACION'`, `'SISTEMAS_LINEALES'` o cualquier otra.
- La columna `metodo TEXT NOT NULL` acepta cualquier nombre (`'Secante'`, `'Trapecio'`, `'Simpson 1/3'`, `'Romberg'`, `'RK2 en M3'`, `'Lagrange'`, `'Newton por diferencias divididas'`).
- Las magnitudes calculadas, iteraciones y métricas se serializan en campos JSON genéricos (`valor_json`, `metrica_error_json`, `aproximacion_json`, `datos_json`).

#### ¿Cómo se registra un método?
Existen dos formas transparentes de conectarlo:

##### Opción A (Recomendada): Inyectar en `results.extraExecutions`
Desde cualquier función de cálculo en `js/app.js` (o módulo propio), agrega tu método a la lista `extraExecutions` del objeto de resultados antes de guardar:

```javascript
results.extraExecutions = results.extraExecutions || [];
results.extraExecutions.push({
  caso_id: 1,                          // 1: M1, 2: M2, 3: M3, 4: M4
  familia: 'INTEGRACION',              // Nueva familia
  metodo: 'Simpson 1/3 Compuesto',     // Nombre del método
  tolerancia: null,                    // null si no aplica
  paso: h,                             // Paso de integración h
  max_iter: nSubintervalos,            // Cantidad de subintervalos
  convergio: true,                     // true/false
  estado: 'COMPLETADO',                // 'COMPLETADO' | 'CONVERGIO' | 'DIRECTO' | 'DIVERGIO'
  tiempo_ms: null,
  iteraciones: [],                     // Array de iteraciones (o [] si es directo)
  resumen: {
    referencia: 'Solución Analítica / Cuadratura Gauss',
    valor_json: JSON.stringify({
      integral: I_num,
      energia_frenado: E_joules
    }),
    metrica_error_json: JSON.stringify({
      error_truncamiento_estimado: errEst
    }),
    conclusion_numerica: 'Regla de Simpson 1/3 de orden O(h^4) con convergencia estricta.',
    conclusion_problema: 'Energía de disipación estimada dentro de la capacidad de los frenos.'
  },
  series: [
    {
      nombre: 'M1_integracion_simpson',
      datos_json: JSON.stringify(curvaIntegral.map(p => ({ x: p.t, y: p.val })))
    }
  ]
});
```

##### Opción B: Registrar directamente en `js/mapper.js` (`buildAllExecutions`)
Dentro de la función `buildAllExecutions(results, params)` en `js/mapper.js`, agrega un bloque para el módulo correspondiente.

**Ejemplo 1 — Método de la Secante (Familia `RAICES`, Módulo 2):**
```javascript
if (r2.secante) {
  executions.push({
    caso_id: 2,
    familia: 'RAICES',
    metodo: 'Secante',
    tolerancia: 1e-8,
    paso: null,
    max_iter: 100,
    convergio: r2.secante.convergio,
    estado: r2.secante.convergio ? 'CONVERGIO' : 'NO_ALCANZO_TOL',
    tiempo_ms: null,
    iteraciones: r2.secante.hist.map(it => ({
      numero: it.k,
      aproximacion_json: JSON.stringify({ x: it.x, f_x: it.fx }),
      residual: Math.abs(it.fx),
      error_abs: it.error,
      error_rel: it.error / Math.abs(it.x)
    })),
    resumen: {
      referencia: 'Vieta Estable',
      valor_json: JSON.stringify({ t_star: r2.secante.raiz, iteraciones: r2.secante.it }),
      metrica_error_json: JSON.stringify({ error_rel: r2.secante.errRel }),
      conclusion_numerica: 'Secante con orden de convergencia superlineal p ≈ 1.618.',
      conclusion_problema: 'Cruce del umbral calculado sin necesidad de evaluar derivadas analíticas.'
    },
    series: []
  });
}
```

**Ejemplo 2 — Newton por Diferencias Divididas / Lagrange (Familia `INTERPOLACION`, Módulo 4):**
```javascript
if (r4.newtonDD) {
  executions.push({
    caso_id: 4,
    familia: 'INTERPOLACION',
    metodo: 'Newton Diferencias Divididas',
    tolerancia: null,
    paso: null,
    max_iter: r4.newtonDD.grado,
    convergio: true,
    estado: 'COMPLETADO',
    tiempo_ms: null,
    iteraciones: [],
    resumen: {
      referencia: 'Spline Cúbico Natural',
      valor_json: JSON.stringify({ coeficientes: r4.newtonDD.coefs, evaluacion_media: r4.newtonDD.valMedio }),
      metrica_error_json: JSON.stringify({ cota_error_teorica: r4.newtonDD.cotaError }),
      conclusion_numerica: 'Polinomio interpolador calculado mediante tabla triangular de diferencias.',
      conclusion_problema: 'Reconstrucción de lectura en tramo ciego de telemetría.'
    },
    series: [
      { nombre: 'M4_interp_newton_dd', datos_json: JSON.stringify(r4.newtonDD.puntosCurva) }
    ]
  });
}
```

**Ejemplo 3 — Romberg / Trapecio Compuesto (Familia `INTEGRACION`, Módulo 1):**
```javascript
if (r1.romberg) {
  executions.push({
    caso_id: 1,
    familia: 'INTEGRACION',
    metodo: 'Integración de Romberg',
    tolerancia: 1e-8,
    paso: r1.romberg.h0,
    max_iter: r1.romberg.niveles,
    convergio: true,
    estado: 'CONVERGIO',
    tiempo_ms: null,
    iteraciones: r1.romberg.tabla.map((fila, k) => ({
      numero: k,
      aproximacion_json: JSON.stringify({ extrapolaciones: fila }),
      residual: Math.abs(fila[fila.length - 1] - fila[fila.length - 2] || 0),
      error_abs: null,
      error_rel: null
    })),
    resumen: {
      referencia: 'Solución Analítica',
      valor_json: JSON.stringify({ integral: r1.romberg.resultado, orden_acelerado: r1.romberg.orden }),
      metrica_error_json: JSON.stringify({ error_estimado: r1.romberg.error }),
      conclusion_numerica: 'Extrapolación de Richardson aplicada sucesivamente a la regla del trapecio.',
      conclusion_problema: 'Estimación de alta precisión para el trabajo mecánico disipado.'
    },
    series: []
  });
}
```

**Ejemplo 4 — Runge-Kutta 2 (Heun) en Módulo 3 (Familia `EDO` / `EDO_SISTEMA`):**
```javascript
if (r3.heun) {
  executions.push({
    caso_id: 3,
    familia: 'EDO_SISTEMA',
    metodo: 'Heun (RK2) Armónico',
    tolerancia: null,
    paso: r3.heun.dt,
    max_iter: r3.heun.steps,
    convergio: true,
    estado: 'COMPLETADO',
    tiempo_ms: null,
    iteraciones: [],
    resumen: {
      referencia: 'RK4 Armónico',
      valor_json: JSON.stringify({ amplitud_max: r3.heun.Xmax, cumple_seguridad: r3.heun.cumple }),
      metrica_error_json: JSON.stringify({ error_amplitud_vs_rk4: r3.heun.errAmp }),
      conclusion_numerica: 'Integración numérica de segundo orden O(dt^2).',
      conclusion_problema: 'Trayectoria dinámica transversal aproximada con menor coste computacional.'
    },
    series: [
      { nombre: 'M3_oscilacion_heun', datos_json: JSON.stringify(r3.heun.trayectoria) }
    ]
  });
}
```

---

## 🛠️ Stack Tecnológico

- **Frontend Core**: HTML5 Semántico, CSS3 modular (con variables y diseño adaptable para escritorio y dispositivos móviles).
- **Persistencia Relacional**: SQLite WebAssembly (`sql.js`) con almacenamiento persistente en `IndexedDB`, exportación/importación `.db` y scripts DDL estándar (`db/schema.sql` y `db/seed.sql`).
- **Lógica Matemática**: JavaScript (ES6+) sin dependencias pesadas de terceros. Implementación desde cero de:
  * Eliminación Gaussiana y Factorización LU.
  * Solucionadores iterativos (Jacobi, Gauss-Seidel, Gradiente Conjugado).
  * Autovalores simétricos mediante rotaciones de Jacobi.
  * Generadores congruenciales pseudoaleatorios y muestreador gaussiano (Box-Muller).
- **Visualización Científica**: [Chart.js](https://www.chartjs.org/) para trazado de curvas dinámicas, isolíneas y espectros de convergencia en escala semilogarítmica.
- **Tipografía y Rigor Notacional**: Compatibilidad KaTeX / MathJax con estilo formal de publicaciones científicas.

---

## 📂 Estructura del Repositorio

```text
ProyectoFinalMetodos/
├── css/
│   └── styles.css          # Sistema de diseño, layout responsivo y temas oscuros
├── db/
│   ├── schema.sql          # DDL estándar SQLite según DER (7 tablas e índices)
│   └── seed.sql            # Escenarios predefinidos e historial inicial
├── img/
│   └── fon.jpg             # Imagen de fondo institucional / cabecera
├── js/
│   ├── app.js              # Núcleo de cálculo numérico, solucionadores y reactividad
│   ├── db.js               # Capa de persistencia SQLite transaccional (sql.js + IndexedDB)
│   └── mapper.js           # Mapeo bidireccional JSON (v1/v2), estados y extracción genérica
├── tests/
│   ├── test_db.js          # Pruebas automatizadas de esquema, FKs y restricciones
│   ├── test_history.js     # Pruebas automatizadas de consultas y relaciones
│   ├── test_mapper.js      # Pruebas automatizadas de contratos v1/v2 y sanitización
│   ├── test_paso3a.js      # Pruebas de guardado transaccional, rollback y escenarios inmutables
│   ├── test_paso3b.js      # Pruebas de apertura en modo consulta (solo lectura, sin recálculo)
│   ├── test_counts.js      # Auditoría rigurosa de recuento de ejecuciones, iteraciones y series
│   ├── test_paso3c.js      # Pruebas de relanzamiento y validación matemática contra SQLite
│   ├── test_versioning.js  # Pruebas de versionado de BD (PRAGMA user_version) y migración limpia
│   └── e2e_verify.js       # Verificación numérica e2e rigurosa de todos los módulos y escenarios
├── tools/
│   └── gen_seed.js         # Generador determinista de db/seed.sql con corridas reales del motor
├── vendor/
│   └── sqljs/              # Binarios locales sql-wasm.js y sql-wasm.wasm (cero CDN)
├── index.html              # Interfaz unificada tipo Single-Page Application (SPA)
└── README.md               # Documentación ejecutiva del proyecto
```

---

### Validación y Relanzamiento de Simulaciones (Paso 3C)

El sistema incorpora un motor de certificación de reproducibilidad matemática:

1. **Relanzamiento Asíncrono contra la Base**: El botón **"Relanzar"** lee `parametros_json` desde SQLite (incluyendo la semilla estocástica `seed`), reejecuta los algoritmos del motor numérico y compara matemáticamente el nuevo cálculo contra los resultados originales guardados en SQLite (`simulacion_origen_id`).
2. **Métrica de Discrepancia Máxima ($|\Delta_{\max}|$):**
   $$\Delta_{\max} = \max \left( |v_{\text{resumen}} - v_{\text{nuevo}}|, |\text{err}_{\text{orig}} - \text{err}_{\text{nuevo}}|, |r_{\text{iter}} - r_{\text{nuevo}}|, |y_{\text{serie}} - y_{\text{nuevo}}| \right)$$
   Excluye variables de tiempo de ejecución no reproducibles (`tiempo_ms`).
3. **Criterio de Certificación:**
   - Si $\Delta_{\max} \le \text{tol}$ (por defecto $10^{-9}$, configurable en la interfaz `#relaunchTol`), se asigna `coincide = 1` y estado `COMPLETADO`.
   - Si $\Delta_{\max} > \text{tol}$, se asigna `coincide = 0` y estado `COMPLETADO` (o `DIVERGIO` si la corrida numérica diverge). El estado `ERROR_VALIDACION` queda reservado únicamente para parámetros de entrada físicamente inválidos.
4. **Trazabilidad Visual en Historial:**
   - Si una simulación proviene de un relanzamiento, muestra `#ID ↳ #OrigenID`.
   - La insignia de validación (`✔ Coincide` o `✘ Difiere`) es interactiva: un clic abre el modal `#comparisonModal` con el desglose tabular de discrepancias ordenado de mayor a menor magnitud.
   - Las simulaciones del historial inicial se identifican como `usuario_equipo = 'EJEMPLO'`, permitiendo su relanzamiento y validación contra el motor numérico.

---

### Datos Semilla Reales y Versionado de la Base (Paso 3D)

- **Generador Determinista (`tools/gen_seed.js`)**: Ejecuta el motor numérico real de la aplicación en un entorno headless y genera `db/seed.sql` con fechas fijas y hashes reproducibles.
  * Versión 4 Simulaciones (Normales): **338.90 KB (0.33 MB)**.
  * Versión 12 Simulaciones (Normal, Estrés, MC): **3.77 MB**.
- **Versionado (`PRAGMA user_version = 2`)**:
  * Detecta bases de datos v1 antiguas persistidas en el `IndexedDB` del navegador.
  * Muestra el banner interactivo `#dbUpgradeBanner` con el botón *"Actualizar ejemplos"*.
  * Función `DB.upgradeExamples()`: elimina únicamente las simulaciones con `usuario_equipo = 'EJEMPLO'` y escenarios huérfanos, inserta los datos de ejemplo del nuevo seed mediante enlaces dinámicos `(SELECT MAX(id) FROM ...)` y **conserva intactas** todas las simulaciones personales guardadas por el usuario.

---

## 🚀 Despliegue e Instalación Rápida

La aplicación es completamente autónoma (cero dependencias de backend, base de datos o gestores de paquetes).

### Opción 1: Ejecución Directa en Navegador
Descarga o clona el repositorio y abre directamente el archivo `index.html`:
```bash
git clone https://github.com/araceli4i2/ProyectoFinalMet.git
cd ProyectoFinalMet
# Abrir directamente index.html en Chrome, Edge, Firefox o Safari
```

### Opción 2: Servidor Local Ligero (Recomendado)
Para evitar restricciones de seguridad CORS al cargar archivos locales:

* **Con Python**:
  ```bash
  python -m http.server 8000
  # Acceder a: http://localhost:8000
  ```

* **Con Node.js**:
  ```bash
  npx serve .
  # O mediante la extensión Live Server de VS Code
  ```

---

## ⚠️ Descargo de Responsabilidad y Aviso Académico

> **Aviso Ético y Pedagógico**:
> Todos los datos, parámetros físicos, coeficientes de fricción, perfiles de viento y escenarios presentados en este software son **100% sintéticos** y han sido calibrados con fines **estrictamente pedagógicos, académicos y de investigación en Métodos Numéricos**. No representan mediciones operativas reales ni información confidencial de la empresa estatal *Mi Teleférico* ni de fabricantes electromecánicos.

---

## 📄 Licencia

Este proyecto se distribuye bajo los términos de la [Licencia MIT](https://opensource.org/licenses/MIT). Eres libre de usar, modificar y distribuir este código con fines académicos y de investigación.
