# Semana 2 · Módulo 2 · Evidencia generada

Esta versión conserva los módulos 1, 3 y 4 y completa únicamente el flujo del Módulo 2.

## Qué genera la aplicación

Al abrir `index.html` y seleccionar NORMAL, ESTRÉS o MAL CONDICIONADO, el Módulo 2 muestra y calcula:

- La referencia analítica estable de Vieta.
- Bisección en `[0, tmax]`.
- Newton-Raphson desde `t0 = 0`, con estado real de convergencia.
- Secante con semillas `t0 = 0` y `t1 = tmax`.
- Iteraciones, residuo `|f(tk)|`, error relativo respecto de Vieta y número de iteraciones.
- Curva `D(t)` con el umbral `Du` y el punto de cruce.
- Sensibilidad `dt*/dDu` y condición relativa.
- Gráfico logarítmico de convergencia para Bisección, Newton-Raphson y Secante.

## Persistencia y exportación

Al guardar una simulación, Secante se registra como ejecución `RAICES` con sus iteraciones, resumen de errores y la serie `M2_convergencia_secante`. El JSON exportado incluye `t_secante`.

El seed oficial fue regenerado para incluir la ejecución de Secante en la simulación de ejemplo del Módulo 2. Las pruebas automatizadas verifican los tres escenarios y la relanzabilidad.
