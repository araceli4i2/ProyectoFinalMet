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

## 🛠️ Stack Tecnológico

- **Frontend Core**: HTML5 Semántico, CSS3 modular (con variables y diseño adaptable para escritorio y dispositivos móviles).
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
├── img/
│   └── fon.jpg             # Imagen de fondo institucional / cabecera
├── js/
│   └── app.js              # Núcleo de cálculo numérico, solucionadores y reactividad
├── index.html              # Interfaz unificada tipo Single-Page Application (SPA)
└── README.md               # Documentación ejecutiva del proyecto
```

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
