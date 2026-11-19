const fs = require('fs');
const path = require('path');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');

async function main() {
  const wasmBinary = fs.readFileSync(path.join(__dirname, '../vendor/sqljs/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');

  const schemaSql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  db.run(schemaSql);

  const seedSql = fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8');
  db.run(seedSql);

  // Consultar todas las series del barrido guardadas en la simulación de ejemplo de M4
  const res = db.exec(`
    SELECT sg.nombre, sg.datos_json 
    FROM serie_grafico sg
    WHERE sg.nombre LIKE 'M4_barrido_%'
  `);

  if (!res.length || !res[0].values) {
    console.error('No se encontraron series de barrido en db/seed.sql');
    process.exit(1);
  }

  const seriesMap = {};
  for (const row of res[0].values) {
    const name = row[0];
    const data = JSON.parse(row[1]);
    if (!seriesMap[name]) {
      seriesMap[name] = {};
      for (const pt of data) {
        seriesMap[name][pt.x] = pt.y;
      }
    }
  }

  const nList = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

  console.log('========================================================================================================================');
  console.log('TABLA 1: BARRIDO DE INTERPOLACIÓN SIN RUIDO (sigma = 0) - M4_barrido_error_equi_* y M4_barrido_error_cheb_*');
  console.log('Métrica: Máximo error denso en malla uniforme de 220 puntos sobre [0, 2*pi]');
  console.log('========================================================================================================================');
  console.log(
    '  n  | k | n_usados |  Estado   |  Lagrange (equi) |  Newton DD (equi) |  Spline (equi)   |  Lagrange (cheb) |  Spline (cheb)'
  );
  console.log('-----+---+----------+-----------+------------------+-------------------+------------------+------------------+-----------------');

  for (const n of nList) {
    const k = (n <= 4) ? 1 : 3;
    const n_usados = n - k;
    const estado = (n_usados >= 4) ? 'VÁLIDO' : 'NO_VÁLIDO';
    const errLagEqui = seriesMap['M4_barrido_error_equi_lagrange'] ? seriesMap['M4_barrido_error_equi_lagrange'][n] : null;
    const errNewtEqui = seriesMap['M4_barrido_error_equi_newton_dd'] ? seriesMap['M4_barrido_error_equi_newton_dd'][n] : null;
    const errSplEqui = seriesMap['M4_barrido_error_equi_spline'] ? seriesMap['M4_barrido_error_equi_spline'][n] : null;
    const errLagCheb = seriesMap['M4_barrido_error_cheb_lagrange'] ? seriesMap['M4_barrido_error_cheb_lagrange'][n] : null;
    const errSplCheb = seriesMap['M4_barrido_error_cheb_spline'] ? seriesMap['M4_barrido_error_cheb_spline'][n] : null;

    const fmtNum = (val) => {
      if (val == null) return '        —        ';
      if (val >= 0.1) return val.toFixed(6).padEnd(16);
      return val.toExponential(5).padEnd(16);
    };

    console.log(
      `${String(n).padStart(3)}  | ` +
      `${k} | ` +
      `${String(n_usados).padStart(8)} | ` +
      `${estado.padEnd(9)} | ` +
      `${fmtNum(errLagEqui)} | ` +
      `${fmtNum(errNewtEqui)} | ` +
      `${fmtNum(errSplEqui)} | ` +
      `${fmtNum(errLagCheb)} | ` +
      `${fmtNum(errSplCheb)}`
    );
  }

  console.log('\n========================================================================================================================');
  console.log('TABLA 2: CONSTANTES DE LEBESGUE Y ESTABILIDAD ANTE RUIDO (sigma = 0.05, 5 semillas: 2026-2030)');
  console.log('Series: M4_barrido_lebesgue_*, M4_barrido_ruido_media_*, M4_barrido_ruido_std_*');
  console.log('========================================================================================================================');
  console.log(
    '  n  | k | n_usados | Lambda_equi (1000p) | Lambda_cheb (1000p) | Lagrange/Newton Media ± Std (sigma=0.05) | Spline Media ± Std (sigma=0.05)'
  );
  console.log('-----+---+----------+---------------------+---------------------+------------------------------------------+---------------------------------');

  for (const n of nList) {
    const k = (n <= 4) ? 1 : 3;
    const n_usados = n - k;
    const lebEqui = seriesMap['M4_barrido_lebesgue_equi'] ? seriesMap['M4_barrido_lebesgue_equi'][n] : null;
    const lebCheb = seriesMap['M4_barrido_lebesgue_cheb'] ? seriesMap['M4_barrido_lebesgue_cheb'][n] : null;
    const meanLag = seriesMap['M4_barrido_ruido_media_lagrange'] ? seriesMap['M4_barrido_ruido_media_lagrange'][n] : null;
    const stdLag = seriesMap['M4_barrido_ruido_std_lagrange'] ? seriesMap['M4_barrido_ruido_std_lagrange'][n] : null;
    const meanSpl = seriesMap['M4_barrido_ruido_media_spline'] ? seriesMap['M4_barrido_ruido_media_spline'][n] : null;
    const stdSpl = seriesMap['M4_barrido_ruido_std_spline'] ? seriesMap['M4_barrido_ruido_std_spline'][n] : null;

    const fmtLeb = (val) => {
      if (val == null) return '         —         ';
      if (val < 1000) return val.toFixed(3).padStart(19);
      return val.toExponential(4).padStart(19);
    };

    const fmtNoise = (m, s) => {
      if (m == null || s == null) return '                   —                      ';
      if (m < 1000) {
        return `${m.toFixed(4)} ± ${s.toFixed(4)}`.padStart(40);
      }
      return `${m.toExponential(3)} ± ${s.toExponential(3)}`.padStart(40);
    };

    console.log(
      `${String(n).padStart(3)}  | ` +
      `${k} | ` +
      `${String(n_usados).padStart(8)} | ` +
      `${fmtLeb(lebEqui)} | ` +
      `${fmtLeb(lebCheb)} | ` +
      `${fmtNoise(meanLag, stdLag)} | ` +
      `${fmtNoise(meanSpl, stdSpl)}`
    );
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
