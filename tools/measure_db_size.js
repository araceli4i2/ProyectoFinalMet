const fs = require('fs');
const path = require('path');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');
const DB = require('../js/db.js');
const Mapper = require('../js/mapper.js');

async function measure() {
  const wasmBinary = fs.readFileSync(path.join(__dirname, '../vendor/sqljs/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  db.run(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  db.run(fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8'));

  const baseExport = db.export();
  console.log(`Tamaño base inicial (seed: 4 simulaciones completas): ${baseExport.length} bytes (${(baseExport.length/1024).toFixed(2)} KB / ${(baseExport.length/(1024*1024)).toFixed(2)} MB)`);

  // Simular guardado de 5 simulaciones completas (interactivas)
  const appCode = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const vm = require('vm');
  const doc = { getElementById: () => ({ value: 'N', closest: () => null }), querySelectorAll: () => [], addEventListener: () => {} };
  const win = { addEventListener: () => {}, document: doc };
  const sandbox = { window: win, document: doc, console, setTimeout: () => {}, clearTimeout: () => {}, Math };
  vm.createContext(sandbox);
  vm.runInContext(appCode + '; this.PRE = PRE; this.SYS = SYS; this.solverRows = solverRows; this.mod1 = mod1; this.mod2 = mod2; this.mod3 = mod3; this.mod4 = mod4; this.modInterp = modInterp;', sandbox);

  const { mod1, mod2, mod3, mod4, modInterp, SYS, solverRows, PRE } = sandbox;
  const p1 = PRE.N.m1, p2 = PRE.N.m2, p3 = PRE.N.m3, p4 = PRE.N.m4, pi = PRE.N.mi || {};
  const r1 = mod1(p1), r2 = mod2(p2), r3 = mod3(p3), r4 = mod4(p4), ri = modInterp(pi);
  const s1Rows = solverRows(SYS.m1.A, SYS.m1.b, SYS.m1.x, SYS.m1.tol, 50000, 'inf');
  const s2Rows = solverRows(SYS.m2n.A, SYS.m2n.b, SYS.m2n.x, SYS.m2n.tol, 50000, 'inf');
  const s3Rows = (r3 && r3.cal) ? solverRows(r3.cal.N, r3.cal.bN, r3.cal.sT, 1e-10, 50000, 'rel2') : [];
  const s4Rows = r4.rows;

  const mockResults = { r1, r2, r3, r4, ri, s1Rows, s2Rows, s3Rows, s4Rows };
  const allExecs = Mapper.buildAllExecutions(mockResults, { m1: p1, m2: p2, m3: p3, m4: p4, mi: pi }, 'N');

  for (let i = 1; i <= 5; i++) {
    DB.saveSimulationTransaction({
      escenario: {
        caso_id: 1,
        tipo: 'NORMAL',
        parametros_json: p1,
        fuente_datos: 'Auditoría F3'
      },
      simulacion: {
        fecha: `2026-11-20 12:0${i}:00`,
        usuario_equipo: `Operador_${i}`,
        estado: 'COMPLETADO'
      },
      ejecuciones: allExecs.filter(e => e.caso_id === 1)
    }, db);
  }

  const export5 = db.export();
  console.log(`Tamaño base tras guardar 5 simulaciones normales completas (total 9 sims): ${export5.length} bytes (${(export5.length/1024).toFixed(2)} KB / ${(export5.length/(1024*1024)).toFixed(2)} MB)`);
}

measure().catch(console.error);
