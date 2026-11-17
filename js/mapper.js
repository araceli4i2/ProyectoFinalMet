/**
 * SIMTELE-RISK · Módulo Unificado de Mapeo (JSON <-> Base de Datos <-> UI)
 * Módulo: js/mapper.js
 * 
 * Centraliza la conversión bidireccional entre la interfaz, los contratos JSON (v1 y v2)
 * y las tablas del esquema relacional SQLite según el DER acordado.
 */

const Mapper = (() => {
  'use strict';

  // 1. Mapeo bidireccional de Escenarios
  const ESCENARIO_UI_TO_DB = {
    'N': 'NORMAL',
    'E': 'ESTRES',
    'MC': 'MAL_CONDICIONADO',
    'M': 'MAL_CONDICIONADO',
    'NORMAL': 'NORMAL',
    'ESTRES': 'ESTRES',
    'MAL_CONDICIONADO': 'MAL_CONDICIONADO'
  };

  const ESCENARIO_DB_TO_UI = {
    'NORMAL': 'N',
    'ESTRES': 'E',
    'MAL_CONDICIONADO': 'MC',
    'N': 'N',
    'E': 'E',
    'MC': 'MC',
    'M': 'MC'
  };

  function toDbEscenario(code) {
    if (!code) return 'NORMAL';
    const key = String(code).trim().toUpperCase();
    return ESCENARIO_UI_TO_DB[key] || 'NORMAL';
  }

  function toUiEscenario(tipoDb) {
    if (!tipoDb) return 'N';
    const key = String(tipoDb).trim().toUpperCase();
    return ESCENARIO_DB_TO_UI[key] || 'N';
  }

  // 2. Mapeo bidireccional de Estados de Métodos Numéricos
  function toDbEstado(estadoRaw, convergioHint) {
    if (!estadoRaw) {
      return convergioHint ? 'COMPLETADO' : 'NO_ALCANZO_TOL';
    }
    const s = String(estadoRaw)
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Quita tildes: Ó -> O

    if (s.includes('CONVERGIO') || s === 'CONVERGE') return 'CONVERGIO';
    if (s.includes('DIVERGIO') || s === 'DIVERGE') return 'DIVERGIO';
    if (s.includes('DIRECTO')) return 'DIRECTO';
    if (s.includes('NO_ALCANZO') || s.includes('TOLERANCIA') || s === 'NO_ALCANZO_TOL') return 'NO_ALCANZO_TOL';
    if (s.includes('COMPLETADO') || s.includes('EXITO') || s === 'OK') return 'COMPLETADO';

    return convergioHint ? 'COMPLETADO' : 'NO_ALCANZO_TOL';
  }

  function toUiEstado(estadoDb) {
    if (!estadoDb) return '—';
    const s = String(estadoDb).trim().toUpperCase();
    if (s === 'CONVERGIO') return 'CONVERGIÓ';
    if (s === 'DIVERGIO') return 'DIVERGIÓ';
    if (s === 'DIRECTO') return 'DIRECTO';
    if (s === 'NO_ALCANZO_TOL') return 'NO_ALCANZÓ_TOL';
    if (s === 'COMPLETADO') return 'COMPLETADO';
    return s;
  }

  function isConverged(estadoDb) {
    return estadoDb === 'CONVERGIO' || estadoDb === 'DIRECTO' || estadoDb === 'COMPLETADO';
  }

  // 3. Sanitización estricta de números y errores (evita 0 falso, NaN, Infinity)
  function sanitizeNumber(val) {
    if (val === null || val === undefined) return null;
    const num = Number(val);
    if (!Number.isFinite(num) || Number.isNaN(num)) return null;
    if (Math.abs(num) > 1e99) return null; // Overflow / divergencia asintótica
    return num;
  }

  function safeRelError(errAbs, refVal) {
    const e = sanitizeNumber(errAbs);
    const r = sanitizeNumber(refVal);
    if (e === null || r === null) return null;
    if (Math.abs(r) < 1e-14) return null; // No división por cero
    return sanitizeNumber(Math.abs(e / r));
  }

  // 4. Extractor genérico de ejecuciones para cualquier familia de métodos
  // Soporta: EDO, SISTEMAS_LINEALES, RAICES, ANALITICO, EDO_SISTEMA, INTERPOLACION
  function buildAllExecutions(results, params, scenKey) {
    const { r1, r2, r3, r4, ri } = results || {};
    const executions = [];

    // --- MÓDULO 1: Detención de emergencia (caso_id = 1) ---
    if (r1) {
      const p1 = r1.p || params.m1 || {};
      const an1 = r1.an;
      const rk4_1 = r1.num;
      const heu1 = r1.heu;

      if (rk4_1) {
        executions.push({
          caso_id: 1,
          familia: 'EDO',
          metodo: 'Runge-Kutta 4',
          tolerancia: null,
          paso: sanitizeNumber(p1.h) || 0.05,
          max_iter: rk4_1.steps || 200,
          convergio: true,
          estado: 'COMPLETADO',
          tiempo_ms: null,
          iteraciones: [],
          resumen: {
            referencia: 'Solución analítica',
            valor_json: JSON.stringify({
              t_det: sanitizeNumber(rk4_1.tdet),
              d_frenado: sanitizeNumber(rk4_1.xdet),
              D_total: sanitizeNumber(r1.D),
              margen: sanitizeNumber(r1.margen),
              seguro: Boolean(r1.seguro)
            }),
            metrica_error_json: JSON.stringify({
              error_t: sanitizeNumber(r1.eT4),
              error_x: sanitizeNumber(r1.eX4)
            }),
            conclusion_numerica: r1.ok ? 'RK4 reproduce la referencia analítica con precisión de orden O(h^4).' : 'Con arrastre c != 0, RK4 actúa como referencia.',
            conclusion_problema: r1.seguro ? 'La parada se efectúa dentro del límite D_seg. Operación SEGURA.' : 'Riesgo crítico: distancia de parada supera el límite de seguridad.'
          },
          series: [
            { nombre: 'v(t) RK4', datos_json: JSON.stringify(rk4_1.T && rk4_1.V ? rk4_1.T.map((t, i) => ({ x: t, y: rk4_1.V[i] })) : []) },
            { nombre: 'x(t) RK4', datos_json: JSON.stringify(rk4_1.T && rk4_1.X ? rk4_1.T.map((t, i) => ({ x: t, y: rk4_1.X[i] })) : []) }
          ]
        });
      }

      if (heu1) {
        executions.push({
          caso_id: 1,
          familia: 'EDO',
          metodo: 'Heun (RK2)',
          tolerancia: null,
          paso: sanitizeNumber(p1.h) || 0.05,
          max_iter: heu1.steps || 200,
          convergio: true,
          estado: 'COMPLETADO',
          tiempo_ms: null,
          iteraciones: [],
          resumen: {
            referencia: 'Solución analítica',
            valor_json: JSON.stringify({
              t_det: sanitizeNumber(heu1.tdet),
              d_frenado: sanitizeNumber(heu1.xdet),
              D_total: sanitizeNumber(r1.dR + heu1.xdet)
            }),
            metrica_error_json: JSON.stringify({
              error_t: sanitizeNumber(r1.eT2),
              error_x: sanitizeNumber(r1.eX2)
            }),
            conclusion_numerica: 'Método predictor-corrector de orden O(h^2).',
            conclusion_problema: 'Integración rápida con menor coste computacional.'
          },
          series: [
            { nombre: 'v(t) Heun', datos_json: JSON.stringify(heu1.T && heu1.V ? heu1.T.map((t, i) => ({ x: t, y: heu1.V[i] })) : []) }
          ]
        });
      }

      // 4 solucionadores del sistema auxiliar 4x4 SPD de M1
      if (typeof window !== 'undefined' && window.SYS && window.SYS.m1 && typeof window.solverRows === 'function') {
        const s1 = window.SYS.m1;
        const rows1 = window.solverRows(s1.A, s1.b, s1.x, s1.tol, 50000, s1.norm || 'inf');
        rows1.forEach(q => {
          const estDb = toDbEstado(q.estado, true);
          executions.push({
            caso_id: 1,
            familia: 'SISTEMAS_LINEALES',
            metodo: q.nombre,
            tolerancia: sanitizeNumber(s1.tol),
            paso: null,
            max_iter: 50000,
            convergio: isConverged(estDb),
            estado: estDb,
            tiempo_ms: null,
            iteraciones: (q.hist || []).map((resVal, idx) => ({
              numero: idx,
              aproximacion_json: '{}',
              residual: sanitizeNumber(resVal),
              error_abs: null,
              error_rel: null
            })),
            resumen: {
              referencia: 'x*=[2, 3, 2.5, 1.5]',
              valor_json: JSON.stringify({ iteraciones: q.k, residual: sanitizeNumber(q.res) }),
              metrica_error_json: JSON.stringify({ error_inf: sanitizeNumber(q.eI), error_rel: sanitizeNumber(q.eR) }),
              conclusion_numerica: `${q.nombre} finaliza en ${q.k} iteraciones con estado ${q.estado}.`,
              conclusion_problema: 'Presiones electrohidráulicas balanceadas.'
            },
            series: [
              { nombre: `Residual ${q.nombre}`, datos_json: JSON.stringify((q.hist || []).map((v, k) => ({ x: k, y: sanitizeNumber(v) }))) }
            ]
          });
        });
      }
    }

    // --- MÓDULO 2: Deterioro mecánico (caso_id = 2) ---
    if (r2) {
      const p2 = r2.p || params.m2 || {};
      const st = r2.tStar;

      executions.push({
        caso_id: 2,
        familia: 'RAICES',
        metodo: 'Newton-Raphson',
        tolerancia: 1e-8,
        paso: null,
        max_iter: 100,
        convergio: st != null,
        estado: st != null ? 'CONVERGIO' : 'NO_ALCANZO_TOL',
        tiempo_ms: null,
        iteraciones: [],
        resumen: {
          referencia: 'Vieta Estable',
          valor_json: JSON.stringify({
            t_star: sanitizeNumber(r2.tN),
            iteraciones: r2.itN,
            sensibilidad: sanitizeNumber(r2.sens),
            condicion_relativa: sanitizeNumber(r2.kRel)
          }),
          metrica_error_json: JSON.stringify({
            residuo: sanitizeNumber(st != null ? Math.abs(r2.D(r2.tN) - p2.Du) : null),
            error_rel: safeRelError(st != null ? Math.abs(r2.tN - st) : null, st)
          }),
          conclusion_numerica: 'Newton-Raphson converge cuadráticamente al cruce.',
          conclusion_problema: `Cruce del umbral Du = ${p2.Du} proyectado a ${sanitizeNumber(st)} meses.`
        },
        series: [
          { nombre: 'D(t) Deterioro', datos_json: JSON.stringify((r2.ts || []).map((t, idx) => ({ x: t, y: r2.Dts ? r2.Dts[idx] : null }))) }
        ]
      });

      if (r2.bis) {
        executions.push({
          caso_id: 2,
          familia: 'RAICES',
          metodo: 'Bisección',
          tolerancia: 1e-8,
          paso: null,
          max_iter: 100,
          convergio: r2.bis.x != null,
          estado: 'CONVERGIO',
          tiempo_ms: null,
          iteraciones: [],
          resumen: {
            referencia: 'Vieta Estable',
            valor_json: JSON.stringify({ t_star: sanitizeNumber(r2.bis.x), iteraciones: r2.bis.it }),
            metrica_error_json: JSON.stringify({ error_rel: safeRelError(st != null ? Math.abs(r2.bis.x - st) : null, st) }),
            conclusion_numerica: 'Convergencia lineal monótona asegurada.',
            conclusion_problema: 'Cota de error estricta de bisección.'
          },
          series: []
        });
      }

      executions.push({
        caso_id: 2,
        familia: 'ANALITICO',
        metodo: 'Fórmula Vieta Estable',
        tolerancia: null,
        paso: null,
        max_iter: 1,
        convergio: true,
        estado: 'DIRECTO',
        tiempo_ms: null,
        iteraciones: [],
        resumen: {
          referencia: 'Solución cerrada',
          valor_json: JSON.stringify({ t_star: sanitizeNumber(st) }),
          metrica_error_json: JSON.stringify({ error_rel: 0.0 }),
          conclusion_numerica: 'Formulación 2ΔD/(α+√Δ) neutraliza cancelación catastrófica.',
          conclusion_problema: 'Referencia matemática patrón para el cruce de fatiga.'
        },
        series: []
      });

      // 4 solucionadores del sistema 4x4 SPD de calibración activo de M2
      const m2Key = (scenKey === 'E') ? 'm2e' : (scenKey === 'MC' || scenKey === 'M') ? 'm2m' : 'm2n';
      if (typeof window !== 'undefined' && window.SYS && window.SYS[m2Key] && typeof window.solverRows === 'function') {
        const s2 = window.SYS[m2Key];
        const rows2 = window.solverRows(s2.A, s2.b, s2.x, s2.tol, 50000, s2.norm || 'inf');
        rows2.forEach(q => {
          const estDb = toDbEstado(q.estado, true);
          executions.push({
            caso_id: 2,
            familia: 'SISTEMAS_LINEALES',
            metodo: q.nombre,
            tolerancia: sanitizeNumber(s2.tol),
            paso: null,
            max_iter: 50000,
            convergio: isConverged(estDb),
            estado: estDb,
            tiempo_ms: null,
            iteraciones: (q.hist || []).slice(0, 100).map((resVal, idx) => ({
              numero: idx,
              aproximacion_json: '{}',
              residual: sanitizeNumber(resVal),
              error_abs: null,
              error_rel: null
            })),
            resumen: {
              referencia: `Calibración Módulo 2 (${m2Key})`,
              valor_json: JSON.stringify({ iteraciones: q.k, residual: sanitizeNumber(q.res) }),
              metrica_error_json: JSON.stringify({ error_inf: sanitizeNumber(q.eI), error_rel: sanitizeNumber(q.eR) }),
              conclusion_numerica: `${q.nombre} finaliza con ${q.k} iteraciones (estado ${q.estado}).`,
              conclusion_problema: 'Identificación de parámetros de desgaste.'
            },
            series: []
          });
        });
      }
    }

    // --- MÓDULO 3: Oscilaciones por viento (caso_id = 3) ---
    if (r3) {
      executions.push({
        caso_id: 3,
        familia: 'EDO_SISTEMA',
        metodo: 'RK4 Armónico',
        tolerancia: null,
        paso: 0.05,
        max_iter: Math.round((r3.p ? r3.p.Tsim : 60) / 0.05) || 1200,
        convergio: true,
        estado: 'COMPLETADO',
        tiempo_ms: null,
        iteraciones: [],
        resumen: {
          referencia: 'Solución analítica régimen permanente',
          valor_json: JSON.stringify({
            X: sanitizeNumber(r3.X),
            omega: sanitizeNumber(r3.w),
            zeta: sanitizeNumber(r3.z),
            Alim: sanitizeNumber(r3.Alim),
            cumple: Boolean(r3.X <= r3.Alim),
            primer_cruce_s: sanitizeNumber(r3.cross)
          }),
          metrica_error_json: JSON.stringify({
            error_amplitud_rel: safeRelError(Math.abs(r3.Aper - r3.X), r3.X)
          }),
          conclusion_numerica: 'Integración temporal de segundo orden acoplada coincide con la amplitud analítica.',
          conclusion_problema: r3.X <= r3.Alim ? 'Amplitud lateral segura bajo el límite de 0.50 m. CUMPLE.' : 'Alerta crítica: la amplitud supera el límite reglamentario.'
        },
        series: [
          { nombre: '|X(Ω)| Resonancia', datos_json: JSON.stringify(r3.fr || []) },
          { nombre: 'x(t) Respuesta lateral', datos_json: JSON.stringify((r3.ts || []).map((t, i) => ({ x: t, y: r3.xs ? r3.xs[i] : null }))) }
        ]
      });

      // 4 solucionadores del sistema normal 3x3 de calibración
      if (r3.cal && typeof window !== 'undefined' && typeof window.solverRows === 'function') {
        const c3 = r3.cal;
        const rows3 = window.solverRows(c3.N, c3.bN, c3.sT, 1e-10, 50000, 'rel2');
        rows3.forEach(q => {
          const estDb = toDbEstado(q.estado, true);
          executions.push({
            caso_id: 3,
            familia: 'SISTEMAS_LINEALES',
            metodo: q.nombre,
            tolerancia: 1e-10,
            paso: null,
            max_iter: 50000,
            convergio: isConverged(estDb),
            estado: estDb,
            tiempo_ms: null,
            iteraciones: (q.hist || []).slice(0, 100).map((resVal, idx) => ({
              numero: idx,
              aproximacion_json: '{}',
              residual: sanitizeNumber(resVal),
              error_abs: null,
              error_rel: null
            })),
            resumen: {
              referencia: 'Parámetros estructurales nominales',
              valor_json: JSON.stringify({ iteraciones: q.k, residual: sanitizeNumber(q.res) }),
              metrica_error_json: JSON.stringify({ error_inf: sanitizeNumber(q.eI), error_rel: sanitizeNumber(q.eR) }),
              conclusion_numerica: `${q.nombre} en sistema 3x3 escalado (kappa2 = ${sanitizeNumber(c3.kS)}).`,
              conclusion_problema: 'Calibración de masa, amortiguamiento y rigidez.'
            },
            series: []
          });
        });
      }
    }

    // --- MÓDULO 4: Sensores e interpolación (caso_id = 4) ---
    if (r4) {
      // 4 solucionadores lineales del ajuste por mínimos cuadrados
      (r4.rows || []).forEach(q => {
        const estDb = toDbEstado(q.estado, true);
        executions.push({
          caso_id: 4,
          familia: 'SISTEMAS_LINEALES',
          metodo: q.nombre,
          tolerancia: sanitizeNumber(r4.tol) || 1e-10,
          paso: null,
          max_iter: 50000,
          convergio: isConverged(estDb),
          estado: estDb,
          tiempo_ms: null,
          iteraciones: (q.hist || []).slice(0, 100).map((resVal, idx) => ({
            numero: idx,
            aproximacion_json: '{}',
            residual: sanitizeNumber(resVal),
            error_abs: null,
            error_rel: null
          })),
          resumen: {
            referencia: 'Coeficientes teóricos x*',
            valor_json: JSON.stringify({ iteraciones: q.k, residual: sanitizeNumber(q.res), kappa2: sanitizeNumber(r4.kap) }),
            metrica_error_json: JSON.stringify({ error_inf: sanitizeNumber(q.eI), error_rel: sanitizeNumber(q.eR) }),
            conclusion_numerica: `${q.nombre} en ecuaciones normales Vandermonde (kappa2 = ${sanitizeNumber(r4.kap)}).`,
            conclusion_problema: 'Reconstrucción de señal sensorial.'
          },
          series: [
            { nombre: `Residual ${q.nombre}`, datos_json: JSON.stringify((q.hist || []).map((v, k) => ({ x: k, y: sanitizeNumber(v) }))) }
          ]
        });
      });

      // Interpolación (si existe)
      if (ri) {
        executions.push({
          caso_id: 4,
          familia: 'INTERPOLACION',
          metodo: 'Spline Cúbico Natural',
          tolerancia: null,
          paso: null,
          max_iter: ri.n || 3,
          convergio: true,
          estado: 'COMPLETADO',
          tiempo_ms: null,
          iteraciones: [],
          resumen: {
            referencia: 'Función exacta f(x̂)',
            valor_json: JSON.stringify({ P_xt: sanitizeNumber(ri.Sv), exacto: sanitizeNumber(ri.ex) }),
            metrica_error_json: JSON.stringify({ error_abs: sanitizeNumber(ri.eS), cota_lagrange: sanitizeNumber(ri.cota) }),
            conclusion_numerica: 'Spline cúbico C^2 minimiza oscilaciones espurias.',
            conclusion_problema: 'Interpolación suave entre nodos de telemetría.'
          },
          series: [
            { nombre: 'Spline Natural', datos_json: JSON.stringify((ri.grid || []).map((x, i) => ({ x, y: ri.fS ? ri.fS[i] : null }))) }
          ]
        });
      }
    }

    return executions;
  }

  // 5. Conversión a Contrato JSON v1 (Legacy)
  function toContractV1(scenCode, params, results, solversList) {
    return {
      contrato: 'simtele-risk/simulacion/v1',
      escenario: toUiEscenario(scenCode),
      parametros: params || {},
      resultados: {
        m1: results && results.r1 ? {
          t_reaccion: sanitizeNumber(results.r1.tr),
          distancia_reaccion: sanitizeNumber(results.r1.dR),
          t_detencion: sanitizeNumber(results.r1.tdet),
          D_total: sanitizeNumber(results.r1.D),
          margen: sanitizeNumber(results.r1.margen),
          seguro: Boolean(results.r1.seguro)
        } : null,
        m2: results && results.r2 ? {
          t_star: sanitizeNumber(results.r2.tStar),
          t_newton: sanitizeNumber(results.r2.tN),
          sensibilidad: sanitizeNumber(results.r2.sens),
          estado: results.r2.estado
        } : null,
        m3: results && results.r3 ? {
          X: sanitizeNumber(results.r3.X),
          omega: sanitizeNumber(results.r3.w),
          zeta: sanitizeNumber(results.r3.z),
          A_lim: sanitizeNumber(results.r3.Alim),
          cruce_s: sanitizeNumber(results.r3.cross)
        } : null,
        m4: results && results.r4 ? {
          kappa2: sanitizeNumber(results.r4.kap),
          lambda_min: sanitizeNumber(results.r4.lmin),
          lambda_max: sanitizeNumber(results.r4.lmax),
          error_relativo: sanitizeNumber(results.r4.eStat)
        } : null,
        mi: results && results.ri ? {
          valor: sanitizeNumber(results.ri.L),
          error: sanitizeNumber(results.ri.eL),
          cota: sanitizeNumber(results.ri.cota)
        } : null
      },
      solvers: solversList || {}
    };
  }

  // 6. Conversión a Contrato JSON v2 (Extendido)
  function toContractV2(simMeta, scenCode, params, results, executions) {
    const v1 = toContractV1(scenCode, params, results);
    return {
      contrato: 'simtele-risk/simulacion/v2',
      escenario: toUiEscenario(scenCode),
      simulacion: {
        id: simMeta && simMeta.id ? simMeta.id : null,
        simulacion_origen_id: simMeta && simMeta.simulacion_origen_id ? simMeta.simulacion_origen_id : null,
        fecha: simMeta && simMeta.fecha ? simMeta.fecha : new Date().toISOString(),
        usuario_equipo: simMeta && simMeta.usuario_equipo ? simMeta.usuario_equipo : 'SIMTELE-RISK / Equipo Métodos UMSA',
        estado: simMeta && simMeta.estado ? simMeta.estado : 'COMPLETADO',
        comparacion: {
          coincide: simMeta && simMeta.coincide !== undefined ? Boolean(simMeta.coincide) : null,
          diferencia_max: simMeta && simMeta.diferencia_max !== undefined ? sanitizeNumber(simMeta.diferencia_max) : null,
          tol_comparacion: simMeta && simMeta.tol_comparacion !== undefined ? sanitizeNumber(simMeta.tol_comparacion) : 1e-9
        }
      },
      parametros: params || {},
      resultados: v1.resultados,
      solvers: v1.solvers, // Mantenido para retrocompatibilidad
      ejecuciones: (executions || []).map(e => ({
        caso_id: e.caso_id,
        familia: e.familia,
        metodo: e.metodo,
        tolerancia: sanitizeNumber(e.tolerancia),
        paso: sanitizeNumber(e.paso),
        max_iter: e.max_iter,
        convergio: Boolean(e.convergio),
        estado: toDbEstado(e.estado, e.convergio),
        tiempo_ms: sanitizeNumber(e.tiempo_ms),
        iteraciones: (e.iteraciones || []).map(it => ({
          numero: it.numero,
          aproximacion: it.aproximacion_json,
          residual: sanitizeNumber(it.residual),
          error_abs: sanitizeNumber(it.error_abs),
          error_rel: sanitizeNumber(it.error_rel)
        })),
        resumen: e.resumen ? {
          referencia: e.resumen.referencia,
          valor: e.resumen.valor_json,
          metrica_error: e.resumen.metrica_error_json,
          conclusion_numerica: e.resumen.conclusion_numerica,
          conclusion_problema: e.resumen.conclusion_problema
        } : null,
        series: (e.series || []).map(s => ({
          nombre: s.nombre,
          datos: s.datos_json
        }))
      }))
    };
  }

  // 7. Parseador Universal de Contratos JSON (Acepta v1 o v2 y normaliza)
  function parseContract(jsonDoc) {
    if (!jsonDoc || typeof jsonDoc !== 'object') {
      throw new Error('Documento JSON inválido o nulo.');
    }

    const version = jsonDoc.contrato === 'simtele-risk/simulacion/v2' ? 'v2' : 'v1';
    const scenCode = toUiEscenario(jsonDoc.escenario || 'N');
    const params = jsonDoc.parametros || {};

    let simulacionMeta = null;
    let ejecuciones = [];

    if (version === 'v2') {
      simulacionMeta = jsonDoc.simulacion || null;
      ejecuciones = jsonDoc.ejecuciones || [];
    }

    return {
      version,
      scenCode,
      scenDb: toDbEscenario(scenCode),
      params,
      resultados: jsonDoc.resultados || {},
      solvers: jsonDoc.solvers || {},
      simulacionMeta,
      ejecuciones
    };
  }

  return {
    toDbEscenario,
    toUiEscenario,
    toDbEstado,
    toUiEstado,
    isConverged,
    sanitizeNumber,
    safeRelError,
    buildAllExecutions,
    toContractV1,
    toContractV2,
    parseContract
  };
})();

// Exportación para Node.js y navegadores
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Mapper;
}
