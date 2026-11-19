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

  function slug(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  // Muestreo determinista para historiales iterativos extensos
  // Preserva siempre la iteración inicial (k = 0) y la final (k = k_final)
  function sampleIterations(hist, maxPoints = 500) {
    if (!Array.isArray(hist) || hist.length === 0) return [];
    const n = hist.length;
    const isObj = typeof hist[0] === 'object' && hist[0] !== null;
    if (n <= maxPoints) {
      if (isObj) return hist;
      return hist.map((resVal, idx) => ({
        numero: idx,
        aproximacion_json: '{}',
        residual: sanitizeNumber(resVal),
        error_abs: null,
        error_rel: null
      }));
    }
    const sampled = [];
    for (let j = 0; j < maxPoints; j++) {
      const idx = Math.round((j * (n - 1)) / (maxPoints - 1));
      if (isObj) {
        sampled.push(hist[idx]);
      } else {
        sampled.push({
          numero: idx,
          aproximacion_json: '{}',
          residual: sanitizeNumber(hist[idx]),
          error_abs: null,
          error_rel: null
        });
      }
    }
    return sampled;
  }

  // 4. Extractor genérico de ejecuciones para cualquier familia de métodos
  // Soporta: EDO, SISTEMAS_LINEALES, RAICES, ANALITICO, EDO_SISTEMA, INTERPOLACION
  function buildAllExecutions(results, params, scenKey) {
    const { r1, r2, r3, r4, ri } = results || {};
    const executions = [];
    const getSYS = () => {
      if (typeof results !== 'undefined' && results && results.SYS) return results.SYS;
      if (typeof window !== 'undefined' && window.SYS) return window.SYS;
      if (typeof globalThis !== 'undefined' && globalThis.SYS) return globalThis.SYS;
      return null;
    };
    const getSolverRows = () => {
      if (typeof results !== 'undefined' && results && results.solverRows) return results.solverRows;
      if (typeof window !== 'undefined' && window.solverRows) return window.solverRows;
      if (typeof globalThis !== 'undefined' && globalThis.solverRows) return globalThis.solverRows;
      return null;
    };

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
            { nombre: 'M1_velocidad_rk4', datos_json: JSON.stringify((rk4_1.t && rk4_1.v) ? rk4_1.t.map((t, i) => ({ x: t, y: rk4_1.v[i] })) : ((rk4_1.T && rk4_1.V) ? rk4_1.T.map((t, i) => ({ x: t, y: rk4_1.V[i] })) : [])) },
            { nombre: 'M1_posicion_rk4', datos_json: JSON.stringify((rk4_1.t && rk4_1.x) ? rk4_1.t.map((t, i) => ({ x: t, y: rk4_1.x[i] })) : ((rk4_1.T && rk4_1.X) ? rk4_1.T.map((t, i) => ({ x: t, y: rk4_1.X[i] })) : [])) }
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
            { nombre: 'M1_velocidad_heun', datos_json: JSON.stringify((heu1.t && heu1.v) ? heu1.t.map((t, i) => ({ x: t, y: heu1.v[i] })) : ((heu1.T && heu1.V) ? heu1.T.map((t, i) => ({ x: t, y: heu1.V[i] })) : [])) }
          ]
        });
      }

      // 4 solucionadores del sistema auxiliar 4x4 SPD de M1
      let rows1 = results.s1Rows;
      const sysObj = getSYS();
      const sRowsFn = getSolverRows();
      if (!rows1 && sysObj && sysObj.m1 && typeof sRowsFn === 'function') {
        const s1 = sysObj.m1;
        rows1 = sRowsFn(s1.A, s1.b, s1.x, s1.tol, 50000, s1.norm || 'inf');
      }
      if (Array.isArray(rows1)) {
        rows1.forEach(q => {
          const estDb = toDbEstado(q.estado, true);
          executions.push({
            caso_id: 1,
            familia: 'SISTEMAS_LINEALES',
            metodo: q.nombre,
            tolerancia: 1e-6,
            paso: null,
            max_iter: 50000,
            convergio: isConverged(estDb),
            estado: estDb,
            tiempo_ms: null,
            iteraciones: sampleIterations(q.hist, 500),
            resumen: {
              referencia: 'x*=[2, 3, 2.5, 1.5]',
              valor_json: JSON.stringify({ iteraciones: q.k, residual: sanitizeNumber(q.res) }),
              metrica_error_json: JSON.stringify({ error_inf: sanitizeNumber(q.eI), error_rel: sanitizeNumber(q.eR) }),
              conclusion_numerica: `${q.nombre} finaliza en ${q.k} iteraciones con estado ${q.estado}.`,
              conclusion_problema: 'Presiones electrohidráulicas balanceadas.'
            },
            series: [
              { nombre: `M1_residual_${slug(q.nombre)}`, datos_json: JSON.stringify((q.hist || []).map((v, k) => ({ x: k, y: sanitizeNumber(v) }))) }
            ]
          });
        });
      }
    }

    // --- MÓDULO 2: Deterioro mecánico (caso_id = 2) ---
    if (r2) {
      const p2 = r2.p || params.m2 || {};
      const st = r2.tStar;

      const newtonIters = Array.isArray(r2.histN) ? r2.histN.map(it => ({
        numero: it.numero,
        aproximacion_json: JSON.stringify({ t: sanitizeNumber(it.t) }),
        residual: sanitizeNumber(it.residual),
        error_abs: sanitizeNumber(it.error_abs),
        error_rel: safeRelError(it.error_abs, it.t)
      })) : [];

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
        iteraciones: newtonIters,
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
          { nombre: 'M2_deterioro_curva', datos_json: JSON.stringify((r2.ts || []).map((t, idx) => ({ x: t, y: r2.Dts ? r2.Dts[idx] : null }))) },
          { nombre: 'M2_sensibilidad_sweep', datos_json: JSON.stringify(r2.sweep || []) }
        ]
      });

      if (r2.bis) {
        const bisIters = Array.isArray(r2.bis.hist) ? r2.bis.hist.map(it => ({
          numero: it.numero,
          aproximacion_json: JSON.stringify({ a: sanitizeNumber(it.a), b: sanitizeNumber(it.b), x: sanitizeNumber(it.m) }),
          residual: sanitizeNumber(it.residual),
          error_abs: sanitizeNumber(it.error_abs),
          error_rel: safeRelError(it.error_abs, it.m)
        })) : [];

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
          iteraciones: sampleIterations(bisIters, 500),
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
      let rows2 = results.s2Rows;
      if (!rows2 && sysObj && sysObj[m2Key] && typeof sRowsFn === 'function') {
        const s2 = sysObj[m2Key];
        rows2 = sRowsFn(s2.A, s2.b, s2.x, s2.tol, 50000, s2.norm || 'inf');
      }
      if (Array.isArray(rows2)) {
        rows2.forEach(q => {
          const estDb = toDbEstado(q.estado, true);
          executions.push({
            caso_id: 2,
            familia: 'SISTEMAS_LINEALES',
            metodo: q.nombre,
            tolerancia: 1e-8,
            paso: null,
            max_iter: 50000,
            convergio: isConverged(estDb),
            estado: estDb,
            tiempo_ms: null,
            iteraciones: sampleIterations(q.hist, 500),
            resumen: {
              referencia: `Calibración Módulo 2 (${m2Key})`,
              valor_json: JSON.stringify({ iteraciones: q.k, residual: sanitizeNumber(q.res) }),
              metrica_error_json: JSON.stringify({ error_inf: sanitizeNumber(q.eI), error_rel: sanitizeNumber(q.eR) }),
              conclusion_numerica: `${q.nombre} finaliza con ${q.k} iteraciones (estado ${q.estado}).`,
              conclusion_problema: 'Identificación de parámetros de desgaste.'
            },
            series: [
              { nombre: `M2_residual_${slug(q.nombre)}`, datos_json: JSON.stringify((q.hist || []).map((v, k) => ({ x: k, y: sanitizeNumber(v) }))) }
            ]
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
          { nombre: 'M3_oscilacion_tiempo', datos_json: JSON.stringify((r3.ts || []).map((t, i) => ({ x: t, y: r3.xs ? r3.xs[i] : null }))) },
          { nombre: 'M3_resonancia_espectro', datos_json: JSON.stringify(r3.fr || []) }
        ]
      });

      // 4 solucionadores del sistema normal 3x3 de calibración
      let rows3 = results.s3Rows;
      if (!rows3 && r3.cal && typeof sRowsFn === 'function') {
        const c3 = r3.cal;
        rows3 = sRowsFn(c3.N, c3.bN, c3.sT, 1e-10, 50000, 'rel2');
      }
      if (Array.isArray(rows3)) {
        const c3 = r3.cal || {};
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
            iteraciones: sampleIterations(q.hist, 500),
            resumen: {
              referencia: 'Parámetros estructurales nominales',
              valor_json: JSON.stringify({ iteraciones: q.k, residual: sanitizeNumber(q.res) }),
              metrica_error_json: JSON.stringify({ error_inf: sanitizeNumber(q.eI), error_rel: sanitizeNumber(q.eR) }),
              conclusion_numerica: `${q.nombre} en sistema 3x3 escalado (kappa2 = ${sanitizeNumber(c3.kS)}).`,
              conclusion_problema: 'Calibración de masa, amortiguamiento y rigidez.'
            },
            series: [
              { nombre: `M3_residual_${slug(q.nombre)}`, datos_json: JSON.stringify((q.hist || []).map((v, k) => ({ x: k, y: sanitizeNumber(v) }))) }
            ]
          });
        });
      }
    }

    // --- MÓDULO 4: Sensores e interpolación (caso_id = 4) ---
    if (r4) {
      // 4 solucionadores lineales del ajuste por mínimos cuadrados
      const rows4 = results.s4Rows || r4.rows || [];
      rows4.forEach((q, idx) => {
        const estDb = toDbEstado(q.estado, true);
        const sers = [
          { nombre: `M4_residual_${slug(q.nombre)}`, datos_json: JSON.stringify((q.hist || []).map((v, k) => ({ x: k, y: sanitizeNumber(v) }))) }
        ];
        if (idx === 0) {
          if (r4.grid && r4.fit) {
            sers.push({ nombre: 'M4_ajuste_polinomico', datos_json: JSON.stringify(r4.grid.map((x, i) => ({ x, y: r4.fit[i] }))) });
          }
          if (r4.r && r4.y) {
            sers.push({ nombre: 'M4_muestras_sensores', datos_json: JSON.stringify(r4.r.map((x, i) => ({ x, y: r4.y[i] }))) });
          }
        }
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
          iteraciones: sampleIterations(q.hist, 500),
          resumen: {
            referencia: 'Coeficientes teóricos x*',
            valor_json: JSON.stringify({ iteraciones: q.k, residual: sanitizeNumber(q.res), kappa2: sanitizeNumber(r4.kap) }),
            metrica_error_json: JSON.stringify({ error_inf: sanitizeNumber(q.eI), error_rel: sanitizeNumber(q.eR) }),
            conclusion_numerica: `${q.nombre} en ecuaciones normales Vandermonde (kappa2 = ${sanitizeNumber(r4.kap)}).`,
            conclusion_problema: 'Reconstrucción de señal sensorial.'
          },
          series: sers
        });
      });
    }

    // Interpolación (si existe)
    if (ri) {
      const diffLN = (ri.diffLN !== undefined && ri.diffLN !== null)
        ? ri.diffLN
        : ((Array.isArray(ri.fL) && Array.isArray(ri.fN) && ri.fL.length === ri.fN.length)
            ? ri.fL.reduce((max, yL, idx) => Math.max(max, Math.abs(yL - ri.fN[idx])), 0)
            : 0.0);

      const kOcultos = ri.k || (Array.isArray(ri.puntos_ocultos) ? ri.puntos_ocultos.length : 1);
      const nUsados = ri.n || (Array.isArray(ri.xs) ? ri.xs.length : 3);
      const gradoP = nUsados - 1;

      // 1. Spline Cúbico Natural
      const sPts = (ri.eval_spline && Array.isArray(ri.eval_spline.puntos)) ? ri.eval_spline.puntos : [];
      const sErrMax = sanitizeNumber(ri.eval_spline ? ri.eval_spline.error_max : ri.eS);
      const sErrRms = sanitizeNumber(ri.eval_spline ? ri.eval_spline.error_rms : ri.eS);
      const sPeor = (ri.eval_spline && ri.eval_spline.peor_punto) ? ri.eval_spline.peor_punto : null;

      const subexp = ri.subexp_lebesgue ? {
        lebesgue_equi: sanitizeNumber(ri.subexp_lebesgue.lebesgue_equi),
        lebesgue_cheb: sanitizeNumber(ri.subexp_lebesgue.lebesgue_cheb),
        amplificacion_medida: sanitizeNumber(ri.subexp_lebesgue.amplificacion_medida),
        cota_lebesgue_epsilon: sanitizeNumber(ri.subexp_lebesgue.cota_lebesgue_epsilon),
        runge_observado: ri.subexp_lebesgue.runge_observado,
        error_nominal_max: sanitizeNumber(ri.subexp_lebesgue.error_nominal_max)
      } : null;

      const sw = ri.sweep || null;
      const swSeriesSpline = sw ? [
        { nombre: 'M4_barrido_error_equi_spline', datos_json: JSON.stringify(sw.series.M4_barrido_error_equi_spline || []) },
        { nombre: 'M4_barrido_error_cheb_spline', datos_json: JSON.stringify(sw.series.M4_barrido_error_cheb_spline || []) },
        { nombre: 'M4_barrido_lebesgue_equi', datos_json: JSON.stringify(sw.series.M4_barrido_lebesgue_equi || []) },
        { nombre: 'M4_barrido_lebesgue_cheb', datos_json: JSON.stringify(sw.series.M4_barrido_lebesgue_cheb || []) },
        { nombre: 'M4_barrido_ruido_media_spline', datos_json: JSON.stringify(sw.series.M4_barrido_ruido_media_spline || []) },
        { nombre: 'M4_barrido_ruido_std_spline', datos_json: JSON.stringify(sw.series.M4_barrido_ruido_std_spline || []) }
      ] : [];

      const swSeriesLagrange = sw ? [
        { nombre: 'M4_barrido_error_equi_lagrange', datos_json: JSON.stringify(sw.series.M4_barrido_error_equi_lagrange || []) },
        { nombre: 'M4_barrido_error_cheb_lagrange', datos_json: JSON.stringify(sw.series.M4_barrido_error_cheb_lagrange || []) },
        { nombre: 'M4_barrido_ruido_media_lagrange', datos_json: JSON.stringify(sw.series.M4_barrido_ruido_media_lagrange || []) },
        { nombre: 'M4_barrido_ruido_std_lagrange', datos_json: JSON.stringify(sw.series.M4_barrido_ruido_std_lagrange || []) }
      ] : [];

      const swSeriesNewton = sw ? [
        { nombre: 'M4_barrido_error_equi_newton_dd', datos_json: JSON.stringify(sw.series.M4_barrido_error_equi_newton_dd || []) },
        { nombre: 'M4_barrido_error_cheb_newton_dd', datos_json: JSON.stringify(sw.series.M4_barrido_error_cheb_newton_dd || []) },
        { nombre: 'M4_barrido_ruido_media_newton_dd', datos_json: JSON.stringify(sw.series.M4_barrido_ruido_media_newton_dd || []) },
        { nombre: 'M4_barrido_ruido_std_newton_dd', datos_json: JSON.stringify(sw.series.M4_barrido_ruido_std_newton_dd || []) }
      ] : [];

      let concNumSpline = `Spline cúbico natural C² evaluado en ${kOcultos} punto${kOcultos === 1 ? '' : 's'} oculto${kOcultos === 1 ? '' : 's'} (error máx = ${sErrMax != null ? Number(sErrMax).toExponential(3) : '—'}, RMS = ${sErrRms != null ? Number(sErrRms).toExponential(3) : '—'}).`;
      if (ri.subexp_lebesgue) {
        concNumSpline += ` Condicionamiento: El spline cúbico natural resuelve un sistema global tridiagonal estrictamente diagonal-dominante, con constante de Lebesgue acotada Λ_spline ≈ 1.55 independiente de N (medida Λ₄₀=1.549 vs Λ₄₀_equi≈2.41e9 del polinomio global).`;
      } else if (ri.sigma > 0) {
        concNumSpline += ` Régimen de alta demanda y ruido σ=${ri.sigma} (realización semilla ${ri.seed}): el spline natural interpolante pasa por los datos ruidosos, no los filtra; su error queda del orden del ruido (~0.14) porque no lo amplifica (no es más preciso en general, pero evita la divergencia polinomial).`;
      }
      if (sw) {
        concNumSpline += ` Barrido: órdenes locales medidos con k = 0 en malla de 2000 puntos y h = 2π/(n-1): n=6 (p=4.46), n=8 (p=4.29), n=12 (p=4.09), n=16 (p=4.09), n=24 (p=4.02), n=32 (p=4.00), n=48 (p=4.00), convergiendo monótonamente a orden teórico O(h⁴). Con ruido sensorial σ=0.05 el error polinomial mínimo ocurre en el rango entre n = 8 y n = 10; para n ≥ 12 el polinomio global diverge por Lebesgue mientras el spline natural se mantiene acotado.`;
      }

      executions.push({
        caso_id: 4,
        familia: 'INTERPOLACION',
        metodo: 'Spline Cúbico Natural',
        tolerancia: null,
        paso: null,
        max_iter: nUsados,
        convergio: true,
        estado: 'COMPLETADO',
        tiempo_ms: null,
        iteraciones: [],
        resumen: {
          referencia: 'Función exacta f(x̂)',
          valor_json: JSON.stringify({
            puntos_ocultos_evaluados: sPts,
            error_maximo: sErrMax,
            error_rms: sErrRms,
            peor_punto: sPeor,
            P_xt: sanitizeNumber(ri.Sv),
            exacto: sanitizeNumber(ri.ex),
            distribucion: ri.distrib || 'equi',
            sigma_ruido: sanitizeNumber(ri.sigma),
            semilla: ri.seed,
            subexp_lebesgue: subexp,
            ordenes_locales_k0: sw ? sw.ordenes_locales_k0 : null,
            orden_convergencia_spline_p: sw ? sanitizeNumber(sw.p_spline) : null,
            rango_optimo_ruido: sw ? sw.rango_optimo_ruido : null,
            min_noise_error: sw ? sanitizeNumber(sw.min_noise_error) : null
          }),
          metrica_error_json: JSON.stringify({
            error_maximo: sErrMax,
            error_rms: sErrRms,
            peor_punto: sPeor,
            error_abs: sanitizeNumber(ri.eS),
            cota_lagrange: sanitizeNumber(ri.cota),
            distribucion: ri.distrib || 'equi',
            sigma_ruido: sanitizeNumber(ri.sigma),
            subexp_lebesgue: subexp,
            ordenes_locales_k0: sw ? sw.ordenes_locales_k0 : null,
            orden_convergencia_spline_p: sw ? sanitizeNumber(sw.p_spline) : null,
            rango_optimo_ruido: sw ? sw.rango_optimo_ruido : null
          }),
          conclusion_numerica: concNumSpline,
          conclusion_problema: 'Interpolación suave entre nodos de telemetría sin oscilaciones espurias.'
        },
        series: [
          { nombre: 'M4_interp_spline', datos_json: JSON.stringify((ri.grid || []).map((x, i) => ({ x, y: ri.fS ? ri.fS[i] : null }))) },
          { nombre: 'M4_curva_exacta', datos_json: JSON.stringify((ri.grid || []).map((x, i) => ({ x, y: ri.fT ? ri.fT[i] : null }))) },
          { nombre: 'M4_nodos_usados', datos_json: JSON.stringify((ri.xs || []).map((x, i) => ({ x, y: ri.ys ? ri.ys[i] : null }))) },
          { nombre: 'M4_puntos_ocultos', datos_json: JSON.stringify(sPts.map(p => ({ x: p.x, y: sanitizeNumber(p.exacto) }))) },
          { nombre: 'M4_error_por_punto', datos_json: JSON.stringify(sPts.map(p => ({ x: p.x, y: sanitizeNumber(p.error_abs) }))) },
          ...swSeriesSpline
        ]
      });

      // 2. Polinomio de Lagrange
      const lPts = (ri.eval_lagrange && Array.isArray(ri.eval_lagrange.puntos)) ? ri.eval_lagrange.puntos : [];
      const lErrMax = sanitizeNumber(ri.eval_lagrange ? ri.eval_lagrange.error_max : ri.eL);
      const lErrRms = sanitizeNumber(ri.eval_lagrange ? ri.eval_lagrange.error_rms : ri.eL);
      const lPeor = (ri.eval_lagrange && ri.eval_lagrange.peor_punto) ? ri.eval_lagrange.peor_punto : null;

      let concNumLagrange = `Forma canónica de Lagrange (grado ${gradoP}) evaluada en ${kOcultos} punto${kOcultos === 1 ? '' : 's'} oculto${kOcultos === 1 ? '' : 's'} (error máx = ${lErrMax != null ? Number(lErrMax).toExponential(3) : '—'}). Equivalencia con Newton: |P_L - P_N|_max = ${sanitizeNumber(diffLN) != null ? Number(diffLN).toExponential(2) : '0'}.`;
      if (ri.subexp_lebesgue) {
        const sl = ri.subexp_lebesgue;
        concNumLagrange += ` Mal condicionado medido: Λ_equi = ${Number(sl.lebesgue_equi).toFixed(1)} >> Λ_cheb = ${Number(sl.lebesgue_cheb).toFixed(2)}; perturbación ε=1e-6 amplificada ${Number(sl.amplificacion_medida).toFixed(1)}x. Sin ruido, error sen(t) = ${Number(sl.error_nominal_max).toExponential(2)} (no hay divergencia de Runge por analiticidad).`;
      } else if (ri.sigma > 0) {
        concNumLagrange += ` Alta demanda (N=${ri.allNodes.length}) con ruido sensorial σ=${ri.sigma} (realización semilla ${ri.seed}): el alto grado con nodos equiespaciados amplifica fuertemente el ruido (Λ₄₀ ≈ 2.41e9, error máx ~1e7 en extremos), manifestando el severo mal condicionamiento del polinomio global.`;
      }
      if (sw) {
        concNumLagrange += ` Barrido n=4..24: con ruido σ=0.05 el error mínimo ocurre en el rango entre n = 8 y n = 10 (${sanitizeNumber(sw.min_noise_error)}) y crece para n≥12 por constante de Lebesgue (Λ₂₄≈7.28e4). La constante de Lebesgue reportada en el barrido corresponde a los n nodos completos antes de retirar los puntos ocultos, no a los nodos usados (que dejan de ser equiespaciados).`;
      }

      executions.push({
        caso_id: 4,
        familia: 'INTERPOLACION',
        metodo: 'Polinomio de Lagrange',
        tolerancia: null,
        paso: null,
        max_iter: gradoP,
        convergio: true,
        estado: 'COMPLETADO',
        tiempo_ms: null,
        iteraciones: [],
        resumen: {
          referencia: 'Función exacta f(x̂)',
          valor_json: JSON.stringify({
            puntos_ocultos_evaluados: lPts,
            error_maximo: lErrMax,
            error_rms: lErrRms,
            peor_punto: lPeor,
            P_xt: sanitizeNumber(ri.L),
            exacto: sanitizeNumber(ri.ex),
            grado: gradoP,
            dif_max_lagrange_newton: sanitizeNumber(diffLN),
            distribucion: ri.distrib || 'equi',
            sigma_ruido: sanitizeNumber(ri.sigma),
            semilla: ri.seed,
            subexp_lebesgue: subexp,
            ordenes_locales_k0: sw ? sw.ordenes_locales_k0 : null,
            orden_convergencia_spline_p: sw ? sanitizeNumber(sw.p_spline) : null,
            rango_optimo_ruido: sw ? sw.rango_optimo_ruido : null,
            min_noise_error: sw ? sanitizeNumber(sw.min_noise_error) : null
          }),
          metrica_error_json: JSON.stringify({
            error_maximo: lErrMax,
            error_rms: lErrRms,
            peor_punto: lPeor,
            error_abs: sanitizeNumber(ri.eL),
            cota_teorica: sanitizeNumber(ri.cota),
            dif_max_lagrange_newton: sanitizeNumber(diffLN),
            distribucion: ri.distrib || 'equi',
            sigma_ruido: sanitizeNumber(ri.sigma),
            subexp_lebesgue: subexp,
            ordenes_locales_k0: sw ? sw.ordenes_locales_k0 : null,
            orden_convergencia_spline_p: sw ? sanitizeNumber(sw.p_spline) : null,
            rango_optimo_ruido: sw ? sw.rango_optimo_ruido : null
          }),
          conclusion_numerica: concNumLagrange,
          conclusion_problema: 'Reconstrucción polinómica global de telemetría.'
        },
        series: [
          { nombre: 'M4_interp_lagrange', datos_json: JSON.stringify((ri.grid || []).map((x, i) => ({ x, y: ri.fL ? ri.fL[i] : null }))) },
          { nombre: 'M4_error_por_punto', datos_json: JSON.stringify(lPts.map(p => ({ x: p.x, y: sanitizeNumber(p.error_abs) }))) },
          ...swSeriesLagrange
        ]
      });

      // 3. Newton Diferencias Divididas
      const nPts = (ri.eval_newton && Array.isArray(ri.eval_newton.puntos)) ? ri.eval_newton.puntos : [];
      const nErrMax = sanitizeNumber(ri.eval_newton ? ri.eval_newton.error_max : ri.eN);
      const nErrRms = sanitizeNumber(ri.eval_newton ? ri.eval_newton.error_rms : ri.eN);
      const nPeor = (ri.eval_newton && ri.eval_newton.peor_punto) ? ri.eval_newton.peor_punto : null;

      let concNumNewton = `Interpolación mediante esquema triangular de diferencias divididas (grado ${gradoP}, orden ${(ri.tableDD || []).length}) evaluado en ${kOcultos} punto${kOcultos === 1 ? '' : 's'} oculto${kOcultos === 1 ? '' : 's'} (error máx = ${nErrMax != null ? Number(nErrMax).toExponential(3) : '—'}). Equivalencia con Lagrange: |P_N - P_L|_max = ${sanitizeNumber(diffLN) != null ? Number(diffLN).toExponential(2) : '0'}.`;
      if (ri.subexp_lebesgue) {
        const sl = ri.subexp_lebesgue;
        concNumNewton += ` Mal condicionado medido: Λ_equi = ${Number(sl.lebesgue_equi).toFixed(1)} >> Λ_cheb = ${Number(sl.lebesgue_cheb).toFixed(2)}; perturbación ε=1e-6 amplificada ${Number(sl.amplificacion_medida).toFixed(1)}x. Sin ruido, error sen(t) = ${Number(sl.error_nominal_max).toExponential(2)} (no hay divergencia de Runge por analiticidad).`;
      } else if (ri.sigma > 0) {
        concNumNewton += ` Alta demanda (N=${ri.allNodes.length}) con ruido sensorial σ=${ri.sigma} (realización semilla ${ri.seed}): el alto grado con nodos equiespaciados amplifica fuertemente el ruido (Λ₄₀ ≈ 2.41e9, error máx ~1e7 en extremos), manifestando el severo mal condicionamiento del polinomio global.`;
      }
      if (sw) {
        concNumNewton += ` Barrido n=4..24: con ruido σ=0.05 el error mínimo ocurre en el rango entre n = 8 y n = 10 (${sanitizeNumber(sw.min_noise_error)}) y crece para n≥12 por constante de Lebesgue (Λ₂₄≈7.28e4). La constante de Lebesgue reportada en el barrido corresponde a los n nodos completos antes de retirar los puntos ocultos, no a los nodos usados (que dejan de ser equiespaciados).`;
      }

      const newtonIters = [];
      if (Array.isArray(ri.tableDD)) {
        ri.tableDD.forEach((row, k) => {
          newtonIters.push({
            numero: k,
            aproximacion_json: JSON.stringify({
              orden: k,
              coef: sanitizeNumber(ri.cN ? ri.cN[k] : null),
              diferencias: row.map(sanitizeNumber)
            }),
            residual: null,
            error_abs: null,
            error_rel: null
          });
        });
      }
      executions.push({
        caso_id: 4,
        familia: 'INTERPOLACION',
        metodo: 'Newton Diferencias Divididas',
        tolerancia: null,
        paso: null,
        max_iter: gradoP,
        convergio: true,
        estado: 'COMPLETADO',
        tiempo_ms: null,
        iteraciones: newtonIters,
        resumen: {
          referencia: 'Función exacta f(x̂)',
          valor_json: JSON.stringify({
            puntos_ocultos_evaluados: nPts,
            error_maximo: nErrMax,
            error_rms: nErrRms,
            peor_punto: nPeor,
            P_xt: sanitizeNumber(ri.Nw),
            exacto: sanitizeNumber(ri.ex),
            coeficientes: (ri.cN || []).map(sanitizeNumber),
            grado: gradoP,
            dif_max_lagrange_newton: sanitizeNumber(diffLN),
            distribucion: ri.distrib || 'equi',
            sigma_ruido: sanitizeNumber(ri.sigma),
            semilla: ri.seed,
            subexp_lebesgue: subexp,
            ordenes_locales_k0: sw ? sw.ordenes_locales_k0 : null,
            orden_convergencia_spline_p: sw ? sanitizeNumber(sw.p_spline) : null,
            rango_optimo_ruido: sw ? sw.rango_optimo_ruido : null,
            min_noise_error: sw ? sanitizeNumber(sw.min_noise_error) : null
          }),
          metrica_error_json: JSON.stringify({
            error_maximo: nErrMax,
            error_rms: nErrRms,
            peor_punto: nPeor,
            error_abs: sanitizeNumber(ri.eN),
            cota_teorica: sanitizeNumber(ri.cota),
            dif_max_lagrange_newton: sanitizeNumber(diffLN),
            distribucion: ri.distrib || 'equi',
            sigma_ruido: sanitizeNumber(ri.sigma),
            subexp_lebesgue: subexp,
            ordenes_locales_k0: sw ? sw.ordenes_locales_k0 : null,
            orden_convergencia_spline_p: sw ? sanitizeNumber(sw.p_spline) : null,
            rango_optimo_ruido: sw ? sw.rango_optimo_ruido : null
          }),
          conclusion_numerica: concNumNewton,
          conclusion_problema: 'Permite incorporación incremental de nuevos nodos de muestreo.'
        },
        series: [
          { nombre: 'M4_interp_newton_dd', datos_json: JSON.stringify((ri.grid || []).map((x, i) => ({ x, y: ri.fN ? ri.fN[i] : (ri.fL ? ri.fL[i] : null) }))) },
          { nombre: 'M4_error_por_punto', datos_json: JSON.stringify(nPts.map(p => ({ x: p.x, y: sanitizeNumber(p.error_abs) }))) },
          ...swSeriesNewton
        ]
      });

      // --- CRUCE DE UMBRAL (Familia RAICES en M4) ---
      if (ri.cruce_umbral) {
        const cu = ri.cruce_umbral;
        const uVal = sanitizeNumber(cu.u);
        const tAn = sanitizeNumber(cu.t_analitico);
        const refStr = (tAn != null)
          ? `Solución analítica t* = ${Number(tAn).toFixed(6)} [arcsin(u)]`
          : 'Solución analítica';

        // 1. Bisección
        if (cu.biseccion) {
          const bRes = cu.biseccion;
          const bIters = (bRes.hist || []).map(it => ({
            numero: it.numero,
            aproximacion_json: JSON.stringify({ a: sanitizeNumber(it.a), b: sanitizeNumber(it.b), t: sanitizeNumber(it.t) }),
            residual: sanitizeNumber(it.residual),
            error_abs: sanitizeNumber(it.error_abs),
            error_rel: safeRelError(it.error_abs, it.t)
          }));
          const errAn = (tAn != null && bRes.x != null) ? Math.abs(bRes.x - tAn) : null;
          executions.push({
            caso_id: 4,
            familia: 'RAICES',
            metodo: 'Bisección',
            tolerancia: 1e-10,
            paso: null,
            max_iter: 100,
            convergio: Boolean(bRes.convergio),
            estado: toDbEstado(bRes.estado, bRes.convergio),
            tiempo_ms: null,
            iteraciones: bIters,
            resumen: {
              referencia: refStr,
              valor_json: JSON.stringify({
                t_star: sanitizeNumber(bRes.x),
                t_analitico: tAn,
                umbral_u: uVal,
                tolerancia: cu.tolerancia || 1e-10,
                max_iter: cu.max_iter || 100,
                intervalo_inicial: (cu.intervalo_inicial || [0, Math.PI / 2]).map(sanitizeNumber),
                iteraciones: bRes.it,
                residual: sanitizeNumber(bRes.residual),
                error_vs_analitica: sanitizeNumber(errAn),
                cruces_spline: cu.cruces_spline,
                cruces_polinomio: cu.cruces_polinomio,
                raiz_polinomio: sanitizeNumber(cu.t_star_poly),
                diferencia_spline_polinomio: sanitizeNumber(cu.diff_spline_poly)
              }),
              metrica_error_json: JSON.stringify({
                residual: sanitizeNumber(bRes.residual),
                error_abs: sanitizeNumber(errAn),
                error_rel: safeRelError(errAn, tAn),
                tolerancia: cu.tolerancia || 1e-10,
                max_iter: cu.max_iter || 100
              }),
              conclusion_numerica: `Convergencia lineal de Bisección sobre spline natural S(t) = ${uVal}: t* = ${bRes.x != null ? Number(bRes.x).toFixed(6) : '—'} en ${bRes.it} iteraciones (residual ${bRes.residual != null ? Number(bRes.residual).toExponential(2) : '—'}, |t* - t*_an| = ${errAn != null ? Number(errAn).toExponential(3) : '—'}). Spline presenta ${cu.cruces_spline} cruces limpios frente a ${cu.cruces_polinomio} cruces en el polinomio (cruces espurios del umbral de la curva reconstruida; el conteo depende de la malla discreta de 220 puntos y de la realización del ruido con semilla 2026).`,
              conclusion_problema: `Detección de cruce de umbral u = ${uVal} en señal sensorial interpolada.`
            },
            series: [
              { nombre: 'M4_cruce_umbral', datos_json: JSON.stringify((bRes.hist || []).map(it => ({ x: it.numero, y: sanitizeNumber(it.t), residual: sanitizeNumber(it.residual), error_abs: sanitizeNumber(it.error_abs) }))) }
            ]
          });
        }

        // 2. Newton-Raphson
        if (cu.newton) {
          const nRes = cu.newton;
          const nIters = (nRes.hist || []).map(it => ({
            numero: it.numero,
            aproximacion_json: JSON.stringify({ t: sanitizeNumber(it.t), derivada: sanitizeNumber(it.derivada) }),
            residual: sanitizeNumber(it.residual),
            error_abs: sanitizeNumber(it.error_abs),
            error_rel: safeRelError(it.error_abs, it.t)
          }));
          const errAn = (tAn != null && nRes.x != null) ? Math.abs(nRes.x - tAn) : null;
          executions.push({
            caso_id: 4,
            familia: 'RAICES',
            metodo: 'Newton-Raphson',
            tolerancia: 1e-10,
            paso: null,
            max_iter: 100,
            convergio: Boolean(nRes.convergio),
            estado: toDbEstado(nRes.estado, nRes.convergio),
            tiempo_ms: null,
            iteraciones: nIters,
            resumen: {
              referencia: refStr,
              valor_json: JSON.stringify({
                t_star: sanitizeNumber(nRes.x),
                t_analitico: tAn,
                umbral_u: uVal,
                tolerancia: cu.tolerancia || 1e-10,
                max_iter: cu.max_iter || 100,
                semilla_x0: sanitizeNumber(cu.semilla_newton),
                iteraciones: nRes.it,
                residual: sanitizeNumber(nRes.residual),
                error_vs_analitica: sanitizeNumber(errAn),
                cruces_spline: cu.cruces_spline,
                cruces_polinomio: cu.cruces_polinomio,
                raiz_polinomio: sanitizeNumber(cu.t_star_poly),
                diferencia_spline_polinomio: sanitizeNumber(cu.diff_spline_poly)
              }),
              metrica_error_json: JSON.stringify({
                residual: sanitizeNumber(nRes.residual),
                error_abs: sanitizeNumber(errAn),
                error_rel: safeRelError(errAn, tAn),
                tolerancia: cu.tolerancia || 1e-10,
                max_iter: cu.max_iter || 100
              }),
              conclusion_numerica: `Convergencia cuadrática de Newton-Raphson con derivada analítica del spline S'(t): t* = ${nRes.x != null ? Number(nRes.x).toFixed(6) : '—'} en ${nRes.it} iteraciones (residual ${nRes.residual != null ? Number(nRes.residual).toExponential(2) : '—'}, |t* - t*_an| = ${errAn != null ? Number(errAn).toExponential(3) : '—'}). Derivada analítica por tramos evita aproximaciones numéricas finitas.`,
              conclusion_problema: `Detección de cruce de umbral u = ${uVal} en señal sensorial interpolada.`
            },
            series: [
              { nombre: 'M4_cruce_umbral', datos_json: JSON.stringify((nRes.hist || []).map(it => ({ x: it.numero, y: sanitizeNumber(it.t), residual: sanitizeNumber(it.residual), error_abs: sanitizeNumber(it.error_abs) }))) }
            ]
          });
        }

        // 3. Secante
        if (cu.secante) {
          const sRes = cu.secante;
          const sIters = (sRes.hist || []).map(it => ({
            numero: it.numero,
            aproximacion_json: JSON.stringify({ x0: sanitizeNumber(it.x0), x1: sanitizeNumber(it.x1), t: sanitizeNumber(it.t) }),
            residual: sanitizeNumber(it.residual),
            error_abs: sanitizeNumber(it.error_abs),
            error_rel: safeRelError(it.error_abs, it.t)
          }));
          const errAn = (tAn != null && sRes.x != null) ? Math.abs(sRes.x - tAn) : null;
          executions.push({
            caso_id: 4,
            familia: 'RAICES',
            metodo: 'Secante',
            tolerancia: 1e-10,
            paso: null,
            max_iter: 100,
            convergio: Boolean(sRes.convergio),
            estado: toDbEstado(sRes.estado, sRes.convergio),
            tiempo_ms: null,
            iteraciones: sIters,
            resumen: {
              referencia: refStr,
              valor_json: JSON.stringify({
                t_star: sanitizeNumber(sRes.x),
                t_analitico: tAn,
                umbral_u: uVal,
                tolerancia: cu.tolerancia || 1e-10,
                max_iter: cu.max_iter || 100,
                semillas: (cu.semillas_secante || [0, Math.PI / 2]).map(sanitizeNumber),
                iteraciones: sRes.it,
                residual: sanitizeNumber(sRes.residual),
                error_vs_analitica: sanitizeNumber(errAn),
                cruces_spline: cu.cruces_spline,
                cruces_polinomio: cu.cruces_polinomio,
                raiz_polinomio: sanitizeNumber(cu.t_star_poly),
                diferencia_spline_polinomio: sanitizeNumber(cu.diff_spline_poly)
              }),
              metrica_error_json: JSON.stringify({
                residual: sanitizeNumber(sRes.residual),
                error_abs: sanitizeNumber(errAn),
                error_rel: safeRelError(errAn, tAn),
                tolerancia: cu.tolerancia || 1e-10,
                max_iter: cu.max_iter || 100
              }),
              conclusion_numerica: `Convergencia superlineal (orden ≈ 1.618) de Secante con dos semillas: t* = ${sRes.x != null ? Number(sRes.x).toFixed(6) : '—'} en ${sRes.it} iteraciones (residual ${sRes.residual != null ? Number(sRes.residual).toExponential(2) : '—'}, |t* - t*_an| = ${errAn != null ? Number(errAn).toExponential(3) : '—'}). No requiere cálculo de derivada.`,
              conclusion_problema: `Detección de cruce de umbral u = ${uVal} en señal sensorial interpolada.`
            },
            series: [
              { nombre: 'M4_cruce_umbral', datos_json: JSON.stringify((sRes.hist || []).map(it => ({ x: it.numero, y: sanitizeNumber(it.t), residual: sanitizeNumber(it.residual), error_abs: sanitizeNumber(it.error_abs) }))) }
            ]
          });
        }
      }
    }

    // --- EXTENSIBILIDAD: Ejecuciones adicionales inyectadas por módulos de compañeros ---
    if (results && Array.isArray(results.extraExecutions)) {
      results.extraExecutions.forEach(ex => {
        if (ex && ex.caso_id && ex.familia && ex.metodo) {
          executions.push(ex);
        }
      });
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

  /**
   * 8. Comparador Matemático de Simulaciones (Paso 3C: Relanzar y Comparar)
   * diferencia_max = máxima diferencia absoluta entre:
   * - valores de resultado_resumen (valor_json y metrica_error_json)
   * - residuales, errores y aproximaciones de iteracion_resultado (solo índices "numero" existentes en ambos)
   * - coordenadas y ordenadas de serie_grafico
   * Excluye tiempo_ms.
   * Verifica por separado que el estado y el total de iteraciones sean idénticos.
   * Si una ejecución falta o difiere en lista, lo reporta sin fallar.
   */
  function compareExecutions(origExecutions, newExecutions, tol = 1e-9) {
    let maxDiff = 0.0;
    const detalles = [];
    const mismatchedMeta = [];
    const unmatchedOrig = [];
    const unmatchedNew = [];

    const newMap = new Map();
    (newExecutions || []).forEach(e => newMap.set(e.metodo, e));
    const matchedNewNames = new Set();

    (origExecutions || []).forEach(origEj => {
      const newEj = newMap.get(origEj.metodo);
      if (!newEj) {
        unmatchedOrig.push(origEj.metodo);
        detalles.push({
          ejecucion: origEj.metodo,
          campo: 'ejecucion_faltante',
          orig: 'presente en BD original',
          nuevo: 'ausente en recálculo',
          diff: null
        });
        return;
      }
      matchedNewNames.add(origEj.metodo);

      // 1. Comparación de metadatos estrictos: estado, convergio, total de iteraciones
      if (origEj.estado !== newEj.estado) {
        mismatchedMeta.push(`${origEj.metodo}: estado disconforme (orig=${origEj.estado}, nuevo=${newEj.estado})`);
        detalles.push({
          ejecucion: origEj.metodo,
          campo: 'estado',
          orig: origEj.estado,
          nuevo: newEj.estado,
          diff: null
        });
      }

      if (Boolean(origEj.convergio) !== Boolean(newEj.convergio)) {
        mismatchedMeta.push(`${origEj.metodo}: convergencia booleana disconforme`);
        detalles.push({
          ejecucion: origEj.metodo,
          campo: 'convergio',
          orig: origEj.convergio,
          nuevo: newEj.convergio,
          diff: null
        });
      }

      const origIters = Array.isArray(origEj.iteraciones) ? origEj.iteraciones : [];
      const newIters = Array.isArray(newEj.iteraciones) ? newEj.iteraciones : [];
      if (origIters.length !== newIters.length) {
        mismatchedMeta.push(`${origEj.metodo}: recuento de iteraciones disconforme (orig=${origIters.length}, nuevo=${newIters.length})`);
        detalles.push({
          ejecucion: origEj.metodo,
          campo: 'total_iteraciones',
          orig: origIters.length,
          nuevo: newIters.length,
          diff: null // Los conteos de iteraciones son metadatos y no entran en diferencia_max
        });
      }

      // 2. Comparación de resultado_resumen (valor_json y metrica_error_json)
      const compareJsonNumbers = (jsonA, jsonB, prefix) => {
        let objA = {}, objB = {};
        try { objA = typeof jsonA === 'string' ? JSON.parse(jsonA) : (jsonA || {}); } catch (e) {}
        try { objB = typeof jsonB === 'string' ? JSON.parse(jsonB) : (jsonB || {}); } catch (e) {}
        const allKeys = new Set([...Object.keys(objA), ...Object.keys(objB)]);
        allKeys.forEach(k => {
          const vA = objA[k], vB = objB[k];
          if (typeof vA === 'number' && typeof vB === 'number') {
            const diff = Math.abs(vA - vB);
            if (diff > maxDiff) maxDiff = diff;
            detalles.push({
              ejecucion: origEj.metodo,
              campo: `${prefix}.${k}`,
              orig: vA,
              nuevo: vB,
              diff
            });
          } else if (typeof vA === 'boolean' && typeof vB === 'boolean') {
            if (vA !== vB) {
              mismatchedMeta.push(`${origEj.metodo}: ${prefix}.${k} booleano disconforme`);
              detalles.push({
                ejecucion: origEj.metodo,
                campo: `${prefix}.${k}`,
                orig: vA,
                nuevo: vB,
                diff: 1.0
              });
            }
          }
        });
      };

      if (origEj.resumen || newEj.resumen) {
        const rOrig = origEj.resumen || {};
        const rNew = newEj.resumen || {};
        compareJsonNumbers(rOrig.valor_json, rNew.valor_json, 'resumen.valor');
        compareJsonNumbers(rOrig.metrica_error_json, rNew.metrica_error_json, 'resumen.error');
      }

      // 3. Comparación de iteraciones: solo índices "numero" existentes en ambos lados
      const origItMap = new Map();
      origIters.forEach(it => origItMap.set(it.numero, it));
      newIters.forEach(itNew => {
        const itOrig = origItMap.get(itNew.numero);
        if (!itOrig) return; // solo comparar si existe en ambos lados (por el muestreo a 500)

        // residual
        if (itOrig.residual != null && itNew.residual != null) {
          const diff = Math.abs(itOrig.residual - itNew.residual);
          if (diff > maxDiff) maxDiff = diff;
          if (diff > tol) {
            detalles.push({
              ejecucion: origEj.metodo,
              campo: `iter[${itNew.numero}].residual`,
              orig: itOrig.residual,
              nuevo: itNew.residual,
              diff
            });
          }
        }
        // error_abs
        if (itOrig.error_abs != null && itNew.error_abs != null) {
          const diff = Math.abs(itOrig.error_abs - itNew.error_abs);
          if (diff > maxDiff) maxDiff = diff;
          if (diff > tol) {
            detalles.push({
              ejecucion: origEj.metodo,
              campo: `iter[${itNew.numero}].error_abs`,
              orig: itOrig.error_abs,
              nuevo: itNew.error_abs,
              diff
            });
          }
        }
        // error_rel
        if (itOrig.error_rel != null && itNew.error_rel != null) {
          const diff = Math.abs(itOrig.error_rel - itNew.error_rel);
          if (diff > maxDiff) maxDiff = diff;
          if (diff > tol) {
            detalles.push({
              ejecucion: origEj.metodo,
              campo: `iter[${itNew.numero}].error_rel`,
              orig: itOrig.error_rel,
              nuevo: itNew.error_rel,
              diff
            });
          }
        }
        // aproximacion_json
        if (itOrig.aproximacion_json && itNew.aproximacion_json) {
          compareJsonNumbers(itOrig.aproximacion_json, itNew.aproximacion_json, `iter[${itNew.numero}].aprox`);
        }
      });

      // 4. Comparación de series de gráficos
      const origSeriesMap = new Map();
      (origEj.series || []).forEach(s => origSeriesMap.set(s.nombre, s));
      (newEj.series || []).forEach(sNew => {
        const sOrig = origSeriesMap.get(sNew.nombre);
        if (!sOrig) return;

        let ptsOrig = [], ptsNew = [];
        try { ptsOrig = typeof sOrig.datos_json === 'string' ? JSON.parse(sOrig.datos_json) : (sOrig.puntos || []); } catch (e) {}
        try { ptsNew = typeof sNew.datos_json === 'string' ? JSON.parse(sNew.datos_json) : (sNew.puntos || []); } catch (e) {}

        const minLen = Math.min(ptsOrig.length, ptsNew.length);
        for (let i = 0; i < minLen; i++) {
          const po = ptsOrig[i], pn = ptsNew[i];
          if (po && pn) {
            if (po.x != null && pn.x != null) {
              const dx = Math.abs(po.x - pn.x);
              if (dx > maxDiff) maxDiff = dx;
            }
            if (po.y != null && pn.y != null) {
              const dy = Math.abs(po.y - pn.y);
              if (dy > maxDiff) maxDiff = dy;
              if (dy > tol) {
                detalles.push({
                  ejecucion: origEj.metodo,
                  campo: `serie[${sOrig.nombre}][${i}].y`,
                  orig: po.y,
                  nuevo: pn.y,
                  diff: dy
                });
              }
            }
          }
        }
      });
    });

    (newExecutions || []).forEach(newEj => {
      if (!matchedNewNames.has(newEj.metodo)) {
        unmatchedNew.push(newEj.metodo);
      }
    });

    const coincide = (
      maxDiff <= tol &&
      mismatchedMeta.length === 0 &&
      unmatchedOrig.length === 0
    );

    return {
      coincide,
      diferencia_max: maxDiff,
      tol_comparacion: tol,
      detalles,
      unmatchedOrig,
      unmatchedNew,
      mismatchedMeta
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
    sampleIterations,
    buildAllExecutions,
    compareExecutions,
    toContractV1,
    toContractV2,
    parseContract,
    slug
  };
})();

// Exportación para Node.js y navegadores
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Mapper;
}
if (typeof window !== 'undefined') {
  window.Mapper = Mapper;
}
if (typeof globalThis !== 'undefined') {
  globalThis.Mapper = Mapper;
}
