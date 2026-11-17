const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appPath = path.join(__dirname, '../js/app.js');
let code = fs.readFileSync(appPath, 'utf8');

const dom = {};
const $ = id => dom[id] || (dom[id] = { innerHTML: '', value: '', addEventListener: () => {} });
const document = {
  getElementById: $,
  querySelectorAll: () => [],
  addEventListener: () => {}
};
const window = {};

const script = `
${code.replace(/document\./g, 'docRef.').replace(/window\./g, 'winRef.')}

console.log('=== VERIFICACIÓN COMPLETA SIMTELE-RISK ===\\n');

// 1. M1 VERIFICATION
console.log('--- MÓDULO 1 ---');
const m1N = mod1(PRE.N.m1);
console.log('M1 Normal: D_total =', m1N.D.toFixed(4), '(esperado: 12.0000), seguro =', m1N.seguro);
const m1E = mod1(PRE.E.m1);
console.log('M1 Estrés: D_total =', m1E.D.toFixed(4), '(esperado: 49.2333), seguro =', m1E.seguro);
const m1MC = mod1(PRE.MC.m1);
console.log('M1 MC: D_total =', m1MC.D.toFixed(4), '(esperado: 8.6667), seguro =', m1MC.seguro);

const m1Sys = SYS.m1;
const m1Rows = solverRows(m1Sys.A, m1Sys.b, m1Sys.x, m1Sys.tol, 50000, m1Sys.norm);
console.log('M1 Sistema 4x4 kappa2:', kappaOf(m1Sys.A).toFixed(4), '(esperado: 2.1266)');
m1Rows.forEach(r => console.log('  ', r.nombre, 'k =', r.k, r.estado));

// 2. M2 VERIFICATION
console.log('\\n--- MÓDULO 2 ---');
const m2N = mod2(PRE.N.m2);
console.log('M2 Normal: t* =', m2N.tStar.toFixed(4), '(esperado: 8.5078), sens =', m2N.sens.toFixed(4), '(esperado: 31.2348)');
const m2nRows = solverRows(SYS.m2n.A, SYS.m2n.b, SYS.m2n.x, SYS.m2n.tol, 50000, SYS.m2n.norm);
console.log('M2 Normal Sys kappa2:', kappaOf(SYS.m2n.A).toFixed(4), '(esperado: 2.6087)');
m2nRows.forEach(r => console.log('  ', r.nombre, 'k =', r.k, r.estado));

const m2E = mod2(PRE.E.m2);
console.log('M2 Estrés: t* =', m2E.tStar.toFixed(4), '(esperado: 5.1106), sens =', m2E.sens.toFixed(4), '(esperado: 22.0059)');
const m2eRows = solverRows(SYS.m2e.A, SYS.m2e.b, SYS.m2e.x, SYS.m2e.tol, 50000, SYS.m2e.norm);
console.log('M2 Estrés Sys kappa2:', kappaOf(SYS.m2e.A).toFixed(4), '(esperado: 3.6055)');
m2eRows.forEach(r => console.log('  ', r.nombre, 'k =', r.k, r.estado));

const m2MC = mod2(PRE.MC.m2);
console.log('M2 MC: t* =', m2MC.tStar.toFixed(4), '(esperado: 0.0499), sens =', m2MC.sens.toFixed(4), '(esperado: 497.5186)');
const m2mRows = solverRows(SYS.m2m.A, SYS.m2m.b, SYS.m2m.x, SYS.m2m.tol, 50000, SYS.m2m.norm);
console.log('M2 MC Sys kappa2:', kappaOf(SYS.m2m.A).toFixed(1), '(esperado: ~199900)');
m2mRows.forEach(r => console.log('  ', r.nombre, 'k =', r.k, r.estado));

// 3. M3 VERIFICATION
console.log('\\n--- MÓDULO 3 ---');
const m3N = mod3(PRE.N.m3);
console.log('M3 Normal: X =', m3N.X.toFixed(4), '(esperado: 0.1556 -> 0.16 m), cumple Alim (0.50):', m3N.X <= 0.50);
const m3E = mod3(PRE.E.m3);
console.log('M3 Estrés: X =', m3E.X.toFixed(4), '(esperado: 0.9220), cruce =', m3E.cross, '(esperado: ~6.24 s), cumple Alim:', m3E.X <= 0.50);
const m3MC = mod3(PRE.MC.m3);
console.log('M3 MC: X =', m3MC.X.toFixed(4), '(esperado: 1.0000)');
console.log('M3 Calibración 3x3 kappa2:', m3N.cal.kS.toFixed(2), '(esperado: 304.57)');
const m3Rows = solverRows(m3N.cal.N, m3N.cal.bN, m3N.cal.sT, 1e-10, 50000, 'rel2');
m3Rows.forEach(r => console.log('  ', r.nombre, 'k =', r.k, r.estado));

// 4. M4 VERIFICATION
console.log('\\n--- MÓDULO 4 ---');
const m4N = mod4(PRE.N.m4);
console.log('M4 Normal: kappa2 =', m4N.kap.toFixed(2), '(esperado: 51.27)');
m4N.rows.forEach(r => console.log('  ', r.nombre, 'k =', r.k, r.estado));

const m4E = mod4(PRE.E.m4);
console.log('M4 Estrés: kappa2 =', m4E.kap.toFixed(2), '(esperado: 63.05)');
m4E.rows.forEach(r => console.log('  ', r.nombre, 'k =', r.k, r.estado));

const m4MC = mod4(PRE.MC.m4);
console.log('M4 MC: kappa2 =', m4MC.kap.toExponential(2), '(esperado: ~1.15e7)');
m4MC.rows.forEach(r => console.log('  ', r.nombre, 'k =', r.k, r.estado));
`;

const sandbox = {
  Math, Array, Number, String, isFinite, NaN, console,
  docRef: document, winRef: window,
  $: $, setTimeout: (fn) => fn(), clearTimeout: () => {},
  URL: { createObjectURL: () => 'blob:dummy', revokeObjectURL: () => {} }
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
