const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Mapper = require('../js/mapper.js');

function loadEngine() {
  const appCode = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const doc = {
    getElementById: () => ({ value: 'N', closest: () => null }),
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
  const win = { addEventListener: () => {}, document: doc };
  const sandbox = { window: win, document: doc, console, setTimeout: () => {}, clearTimeout: () => {}, Math };
  vm.createContext(sandbox);
  vm.runInContext(appCode + '; this.PRE = PRE; this.SYS = SYS; this.solverRows = solverRows; this.mod1 = mod1; this.mod2 = mod2; this.mod3 = mod3; this.mod4 = mod4; this.modInterp = modInterp;', sandbox);

  return {
    mod1: sandbox.mod1,
    mod2: sandbox.mod2,
    mod3: sandbox.mod3,
    mod4: sandbox.mod4,
    modInterp: sandbox.modInterp,
    SYS: sandbox.SYS,
    solverRows: sandbox.solverRows,
    PRE: sandbox.PRE
  };
}

function escapeSql(str) {
  if (str == null) return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

function sqlVal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return escapeSql(v);
}

function generateSeedSql(includeAllScenarios = false) {
  const engine = loadEngine();
  const { mod1, mod2, mod3, mod4, modInterp, SYS, solverRows, PRE } = engine;

  const lines = [];
  lines.push('-- =====================================================================');
  lines.push('-- SIMTELE-RISK · Datos Semilla Generados con Motor Numérico Real');
  lines.push('-- Generado automáticamente por tools/gen_seed.js (Determinista)');
  lines.push('-- =====================================================================\n');
  lines.push('PRAGMA foreign_keys = ON;\n');

  // 1. Escenarios (12 en total: 4 módulos x 3 tipos)
  lines.push('-- ---------------------------------------------------------------------');
  lines.push('-- 1. ESCENARIOS OFICIALES (12 escenarios inmutables)');
  lines.push('-- ---------------------------------------------------------------------\n');

  const scenMap = [
    { id: 1, caso_id: 1, s: 'N', tipo: 'NORMAL', fuente: 'Informe Técnico SIMTELE-RISK v1.0 - Caso Nominal' },
    { id: 2, caso_id: 1, s: 'E', tipo: 'ESTRES', fuente: 'Informe Técnico SIMTELE-RISK v1.0 - Alta Latencia y Velocidad' },
    { id: 3, caso_id: 1, s: 'MC', tipo: 'MAL_CONDICIONADO', fuente: 'Informe Técnico SIMTELE-RISK v1.0 - Frenado Tangencial Raíz Doble' },

    { id: 4, caso_id: 2, s: 'N', tipo: 'NORMAL', fuente: 'Informe Técnico SIMTELE-RISK v1.0 - Desgaste Progresivo Normal' },
    { id: 5, caso_id: 2, s: 'E', tipo: 'ESTRES', fuente: 'Informe Técnico SIMTELE-RISK v1.0 - Desgaste Severo Acelerado' },
    { id: 6, caso_id: 2, s: 'MC', tipo: 'MAL_CONDICIONADO', fuente: 'Informe Técnico SIMTELE-RISK v1.0 - Cancelación Catastrófica y Umbral Próximo' },

    { id: 7, caso_id: 3, s: 'N', tipo: 'NORMAL', fuente: 'Informe Técnico SIMTELE-RISK v1.0 - Viento Moderado Subcrítico' },
    { id: 8, caso_id: 3, s: 'E', tipo: 'ESTRES', fuente: 'Informe Técnico SIMTELE-RISK v1.0 - Viento Cercano a Resonancia' },
    { id: 9, caso_id: 3, s: 'MC', tipo: 'MAL_CONDICIONADO', fuente: 'Informe Técnico SIMTELE-RISK v1.0 - Resonancia Exacta Bajo Amortiguamiento' },

    { id: 10, caso_id: 4, s: 'N', tipo: 'NORMAL', fuente: 'Informe Técnico SIMTELE-RISK v1.0 - Ajuste Grado 3 Sin Ruido [-1, 1]' },
    { id: 11, caso_id: 4, s: 'E', tipo: 'ESTRES', fuente: 'Informe Técnico SIMTELE-RISK v1.0 - Ajuste con Ruido Blanco Gaussiano' },
    { id: 12, caso_id: 4, s: 'MC', tipo: 'MAL_CONDICIONADO', fuente: 'Informe Técnico SIMTELE-RISK v1.0 - Base Monomial sobre [0, 1] Grado 5' }
  ];

  lines.push('INSERT INTO escenario (id, caso_id, tipo, parametros_json, fuente_datos) VALUES');
  const scenRows = scenMap.map(sc => {
    let p = {};
    if (sc.caso_id === 1) p = PRE[sc.s].m1;
    else if (sc.caso_id === 2) p = PRE[sc.s].m2;
    else if (sc.caso_id === 3) p = PRE[sc.s].m3;
    else if (sc.caso_id === 4) p = { ...PRE[sc.s].m4, mi: PRE[sc.s].mi };
    const pStr = JSON.stringify(p);
    return `(${sc.id}, ${sc.caso_id}, '${sc.tipo}', ${escapeSql(pStr)}, ${escapeSql(sc.fuente)})`;
  });
  lines.push(scenRows.join(',\n'));
  lines.push('ON CONFLICT(id) DO UPDATE SET');
  lines.push('  caso_id = excluded.caso_id,');
  lines.push('  tipo = excluded.tipo,');
  lines.push('  parametros_json = excluded.parametros_json,');
  lines.push('  fuente_datos = excluded.fuente_datos;\n');

  // 2. Corridas a simular
  // Si includeAllScenarios = true, simula los 12 escenarios; si false, solo los 4 Normales
  const targetScenarios = includeAllScenarios
    ? scenMap
    : scenMap.filter(s => s.s === 'N');

  lines.push('-- ---------------------------------------------------------------------');
  lines.push(`-- 2. HISTORIAL DE SIMULACIONES (${targetScenarios.length} simulaciones con corridas reales del motor)`);
  lines.push('-- ---------------------------------------------------------------------\n');

  let simIdCounter = 1;
  let execIdCounter = 1;
  let iterIdCounter = 1;
  let resIdCounter = 1;
  let serieIdCounter = 1;

  for (const sc of targetScenarios) {
    const s = sc.s;
    const cId = sc.caso_id;
    let execs = [];

    if (cId === 1) {
      const p1 = PRE[s].m1;
      const r1 = mod1(p1);
      const s1Rows = solverRows(SYS.m1.A, SYS.m1.b, SYS.m1.x, SYS.m1.tol, 50000, SYS.m1.norm);
      const LAST = { r1, s1Rows, SYS, solverRows };
      execs = Mapper.buildAllExecutions(LAST, { m1: p1 }, s).filter(e => e.caso_id === 1);
    } else if (cId === 2) {
      const p2 = PRE[s].m2;
      const r2 = mod2(p2);
      const m2Key = s === 'E' ? 'm2e' : (s === 'MC' || s === 'M') ? 'm2m' : 'm2n';
      const s2Sys = SYS[m2Key] || SYS.m2n;
      const s2Rows = solverRows(s2Sys.A, s2Sys.b, s2Sys.x, s2Sys.tol, 50000, s2Sys.norm);
      const LAST = { r2, s2Rows, SYS, solverRows };
      execs = Mapper.buildAllExecutions(LAST, { m2: p2 }, s).filter(e => e.caso_id === 2);
    } else if (cId === 3) {
      const p3 = PRE[s].m3;
      const r3 = mod3(p3);
      const s3Rows = (r3 && r3.cal) ? solverRows(r3.cal.N, r3.cal.bN, r3.cal.sT, 1e-10, 50000, 'rel2') : [];
      const LAST = { r3, s3Rows, SYS, solverRows };
      execs = Mapper.buildAllExecutions(LAST, { m3: p3 }, s).filter(e => e.caso_id === 3);
    } else if (cId === 4) {
      const p4 = PRE[s].m4;
      const pmi = PRE[s].mi;
      const r4 = mod4(p4);
      const ri = modInterp(pmi);
      const s4Rows = r4 ? r4.rows : [];
      const LAST = { r4, ri, s4Rows, SYS, solverRows };
      execs = Mapper.buildAllExecutions(LAST, { m4: p4, mi: pmi }, s).filter(e => e.caso_id === 4);
    }

    const simId = simIdCounter++;
    const fixedDate = '2026-11-15 10:00:00';
    lines.push(`-- Simulación #${simId}: Caso ${cId} · Escenario ${sc.tipo}`);
    lines.push('INSERT INTO simulacion (escenario_id, fecha, usuario_equipo, estado, simulacion_origen_id, coincide, diferencia_max, tol_comparacion) VALUES');
    lines.push(`(${sc.id}, '${fixedDate}', 'EJEMPLO', 'COMPLETADO', NULL, NULL, NULL, NULL);\n`);

    // Inserción de ejecuciones vinculadas dinámicamente con (SELECT MAX(id) FROM simulacion)
    for (const ej of execs) {
      const ejId = execIdCounter++;
      lines.push(`-- Ejecución #${ejId}: ${ej.metodo} (${ej.familia})`);
      lines.push('INSERT INTO ejecucion_metodo (simulacion_id, familia, metodo, tolerancia, paso, max_iter, convergio, estado, tiempo_ms) VALUES');
      lines.push(`((SELECT MAX(id) FROM simulacion), ${escapeSql(ej.familia)}, ${escapeSql(ej.metodo)}, ${sqlVal(ej.tolerancia)}, ${sqlVal(ej.paso)}, ${sqlVal(ej.max_iter)}, ${ej.convergio ? 1 : 0}, ${escapeSql(ej.estado)}, ${sqlVal(ej.tiempo_ms)});\n`);

      // Resumen vinculado con (SELECT MAX(id) FROM ejecucion_metodo)
      if (ej.resumen) {
        const resId = resIdCounter++;
        const valStr = typeof ej.resumen.valor_json === 'string' ? ej.resumen.valor_json : JSON.stringify(ej.resumen.valor_json);
        const errStr = typeof ej.resumen.metrica_error_json === 'string' ? ej.resumen.metrica_error_json : JSON.stringify(ej.resumen.metrica_error_json);
        lines.push('INSERT INTO resultado_resumen (ejecucion_id, referencia, valor_json, metrica_error_json, conclusion_numerica, conclusion_problema) VALUES');
        lines.push(`((SELECT MAX(id) FROM ejecucion_metodo), ${escapeSql(ej.resumen.referencia || 'Referencia')}, ${escapeSql(valStr)}, ${escapeSql(errStr)}, ${sqlVal(ej.resumen.conclusion_numerica)}, ${sqlVal(ej.resumen.conclusion_problema)});\n`);
      }

      // Iteraciones vinculadas con (SELECT MAX(id) FROM ejecucion_metodo)
      if (Array.isArray(ej.iteraciones) && ej.iteraciones.length > 0) {
        lines.push('INSERT INTO iteracion_resultado (ejecucion_id, numero, aproximacion_json, residual, error_abs, error_rel) VALUES');
        const itRows = ej.iteraciones.map(it => {
          iterIdCounter++;
          const aproxStr = typeof it.aproximacion_json === 'string' ? it.aproximacion_json : JSON.stringify(it.aproximacion_json);
          return `((SELECT MAX(id) FROM ejecucion_metodo), ${it.numero}, ${escapeSql(aproxStr)}, ${sqlVal(it.residual)}, ${sqlVal(it.error_abs)}, ${sqlVal(it.error_rel)})`;
        });
        lines.push(itRows.join(',\n') + ';\n');
      }

      // Series vinculadas con (SELECT MAX(id) FROM ejecucion_metodo)
      if (Array.isArray(ej.series) && ej.series.length > 0) {
        lines.push('INSERT INTO serie_grafico (ejecucion_id, nombre, datos_json) VALUES');
        const sRows = ej.series.map(s => {
          serieIdCounter++;
          const dStr = s.datos_json || JSON.stringify(s.puntos || []);
          return `((SELECT MAX(id) FROM ejecucion_metodo), ${escapeSql(s.nombre)}, ${escapeSql(dStr)})`;
        });
        lines.push(sRows.join(',\n') + ';\n');
      }
    }
  }

  return lines.join('\n');
}

// Ejecutar análisis de tamaño y escritura
const isAll = process.argv.includes('--all');
const shouldWrite = process.argv.includes('--write');

console.log('Generando y midiendo tamaño de seed.sql...');
const sql4 = generateSeedSql(false);
const size4 = Buffer.byteLength(sql4, 'utf8');
console.log(` - 4 Simulaciones (Normales): ${(size4 / 1024).toFixed(2)} KB (${(size4 / (1024 * 1024)).toFixed(2)} MB)`);

const sql12 = generateSeedSql(true);
const size12 = Buffer.byteLength(sql12, 'utf8');
console.log(` - 12 Simulaciones (Normal, Estrés, MC): ${(size12 / 1024).toFixed(2)} KB (${(size12 / (1024 * 1024)).toFixed(2)} MB)`);

if (shouldWrite) {
  const chosenSql = isAll ? sql12 : sql4;
  const targetPath = path.join(__dirname, '../db/seed.sql');
  fs.writeFileSync(targetPath, chosenSql, 'utf8');
  console.log(`\n✔ db/seed.sql generado y guardado exitosamente (${isAll ? '12 simulaciones' : '4 simulaciones'}, ${(Buffer.byteLength(chosenSql, 'utf8') / 1024).toFixed(2)} KB).`);
}

module.exports = { generateSeedSql, loadEngine };
