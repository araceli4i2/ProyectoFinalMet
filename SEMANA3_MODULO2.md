# Semana 3 · Módulo 2 · Validación y evidencias

Esta entrega corresponde únicamente al **Módulo 2: Deterioro mecánico y mantenimiento**. Los archivos de los demás módulos se conservan sin cambios.

## Objetivo de la Semana 3

Cerrar la validación del Módulo 2 y demostrar que los resultados son correctos, persistentes y reproducibles en la aplicación.

## Actividades que se deben realizar

1. Ejecutar los tres escenarios del Módulo 2: **NORMAL**, **ESTRÉS** y **MAL CONDICIONADO**.
2. Verificar que la referencia estable de Vieta y los métodos Bisección, Newton-Raphson y Secante convergen a la misma raíz dentro de la tolerancia.
3. Revisar que se registren las iteraciones, residuos, errores relativos y estados de convergencia de cada método.
4. Confirmar que se visualicen la curva de deterioro `D(t)`, el umbral `Du`, el punto de cruce `t*` y el gráfico logarítmico de convergencia.
5. Analizar la sensibilidad `dt*/dDu` y la condición relativa, especialmente en el escenario MAL CONDICIONADO.
6. Guardar la simulación, abrirla nuevamente desde el historial y comprobar que los resultados y gráficos se recuperan sin recalcularse de forma inconsistente.
7. Exportar e importar el JSON de la simulación y comprobar la reproducibilidad con la semilla del proyecto.
8. Ejecutar la auditoría automática incluida en `tests/test_semana3_m2.js` y conservar el archivo generado en `evidencias/semana3_m2_auditoria.json`.
9. Completar las evidencias de la entrega con capturas de los tres escenarios, la tabla de resultados, los gráficos y el historial guardado.

## Resultados de referencia

| Escenario | `t*` esperado (meses) | Bisección | Newton-Raphson | Secante | Sensibilidad aproximada |
|---|---:|---:|---:|---:|---:|
| NORMAL | 8,5078106 | 31 | 5 | 6 | 31,23 |
| ESTRÉS | 5,1105678 | 31 | 4 | 6 | 22,01 |
| MAL CONDICIONADO | 0,0498756 | 31 | 2 | 4 | 497,52 |

En MAL CONDICIONADO debe documentarse también que `κ_rel ≈ 2,395 × 10³`, por lo que pequeñas variaciones del umbral producen cambios importantes en el tiempo estimado.

## Cómo ejecutar la auditoría

Desde la carpeta raíz del proyecto:

```bash
node tests/test_semana3_m2.js
```

La prueba no modifica la base de datos ni los archivos de los otros módulos. Solo analiza el motor numérico del Módulo 2 y genera un JSON de evidencia.

## Evidencias que se deben presentar

- Captura del escenario NORMAL con la tabla de los tres métodos.
- Captura del escenario ESTRÉS y explicación de la reducción del tiempo `t*`.
- Captura del escenario MAL CONDICIONADO con el análisis de sensibilidad.
- Gráfico `D(t)` frente al umbral `Du`.
- Gráfico de residuos por iteración.
- Evidencia de guardado, reapertura, exportación e importación.
- Archivo `evidencias/semana3_m2_auditoria.json` generado por la prueba automática.
