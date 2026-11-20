const fs = require('fs');
const path = require('path');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');

async function extractFigures() {
  const SQL = await initSqlJs({ locateFile: f => path.join(__dirname, '../vendor/sqljs', f) });
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  db.run(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  db.run(fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8'));

  console.log('=== CIFRAS FINALES LEÍDAS DE DB/SEED.SQL ===\n');

  // 1. Conteo por módulo en el seed oficial
  console.log('1. Conteo por módulo en db/seed.sql:');
  const modCounts = [];
  for (let cId = 1; cId <= 4; cId++) {
    const qEj = db.exec(`SELECT COUNT(*) FROM ejecucion_metodo em JOIN simulacion s ON em.simulacion_id = s.id JOIN escenario e ON s.escenario_id = e.id WHERE e.caso_id = ${cId} AND s.usuario_equipo = 'EJEMPLO';`)[0].values[0][0];
    const qIt = db.exec(`SELECT COUNT(*) FROM iteracion_resultado ir JOIN ejecucion_metodo em ON ir.ejecucion_id = em.id JOIN simulacion s ON em.simulacion_id = s.id JOIN escenario e ON s.escenario_id = e.id WHERE e.caso_id = ${cId} AND s.usuario_equipo = 'EJEMPLO';`)[0].values[0][0];
    const qSg = db.exec(`SELECT COUNT(*) FROM serie_grafico sg JOIN ejecucion_metodo em ON sg.ejecucion_id = em.id JOIN simulacion s ON em.simulacion_id = s.id JOIN escenario e ON s.escenario_id = e.id WHERE e.caso_id = ${cId} AND s.usuario_equipo = 'EJEMPLO';`)[0].values[0][0];
    modCounts.push({ modulo: `M${cId}`, ejecuciones: qEj, iteraciones: qIt, series: qSg });
  }
  console.table(modCounts);

  // 2. Parámetros y Métricas de M4 en los 3 escenarios
  const { loadEngine } = require('./gen_seed.js');
  const engine = loadEngine();
  const scenCodes = ['N', 'E', 'MC'];

  console.log('\n2. Métricas de M4 por Escenario:');
  const summaryRows = [];
  for (const sc of scenCodes) {
    const p4 = engine.PRE[sc].m4;
    const pmi = engine.PRE[sc].mi;
    const ri = engine.modInterp(pmi);

    const sl = ri.subexp_lebesgue;
    const cu = ri.cruce_umbral;
    const sPts = ri.eval_spline;
    const lPts = ri.eval_lagrange;
    const nPts = ri.eval_newton;

    summaryRows.push({
      Escenario: sc === 'N' ? 'Normal' : (sc === 'E' ? 'Estrés' : 'Mal Condicionado'),
      'n_tot / n_us / k': `${sl.n_total} / ${sl.n} / ${ri.puntos_ocultos.length}`,
      'sigma / seed': `${ri.sigma} / ${ri.seed}`,
      'ErrMax Spline': sPts.error_max.toExponential(4),
      'RMS Spline': sPts.error_rms.toExponential(4),
      'ErrMax Poly': lPts.error_max.toExponential(4),
      'RMS Poly': lPts.error_rms.toExponential(4),
      '|P_L - P_N|': (ri.diffLN || 0).toExponential(4),
      't* Spline': cu.newton.x.toFixed(6),
      'Metodo Rapido': `Newton (${cu.newton.it} it, res=${cu.newton.residual.toExponential(2)})`,
      'Cruces Spl/Poly': `${cu.cruces_spline} / ${cu.cruces_polinomio}`,
      '|t* - t*an|': Math.abs(cu.newton.x - cu.t_analitico).toExponential(4),
      'Lambda_N / Lambda_us': `${sl.lebesgue_equi.toExponential(3)} / ${sl.lebesgue_usados.toExponential(3)}`,
      'Err Inducido (amp)': `${sl.error_perturbado_max.toExponential(3)} (${sl.amplificacion_medida.toExponential(3)}x)`,
      'Err Nom Sin Ruido': sl.error_nominal_max.toExponential(4)
    });
  }
  console.table(summaryRows);

  // 3. Órdenes locales del spline medidos con k = 0
  console.log('\n3. Órdenes locales de convergencia del spline natural medidos con k = 0:');
  const sw = engine.modInterp(engine.PRE.N.mi).sweep;
  console.table(sw.ordenes_locales_k0.map(o => ({
    Intervalo: `${o.n1} -> ${o.n2}`,
    h1: o.h1.toFixed(5),
    h2: o.h2.toFixed(5),
    Err1: o.err1.toExponential(4),
    Err2: o.err2.toExponential(4),
    Orden_p: o.p.toFixed(2),
    'Ratio err/(h^4/384)': (o.err2 / (Math.pow(o.h2, 4) / 384)).toFixed(4)
  })));
}

extractFigures().catch(console.error);
