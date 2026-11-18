const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Mapper = require('../js/mapper.js');

function assert(cond, msg) {
  if (!cond) {
    console.error(`[AssertionError] ${msg}`);
    throw new Error(msg);
  }
}

function assertClose(actual, expected, tol, label) {
  const diff = Math.abs(actual - expected);
  assert(diff <= tol, `${label}: esperado ${expected}, obtenido ${actual} (diff=${diff.toExponential(4)} > tol=${tol})`);
}

console.log('=== TEST M4: VERIFICACIÓN MANUAL DE DIFERENCIAS DIVIDIDAS Y LAGRANGE-NEWTON ===\n');

// 1. Cargar js/app.js en contexto headless
const appCode = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const doc = {
  getElementById: () => ({ value: 'N', closest: () => null }),
  querySelectorAll: () => [],
  addEventListener: () => {}
};
const win = { addEventListener: () => {}, document: doc };
const sandbox = { window: win, document: doc, console, setTimeout: () => {}, clearTimeout: () => {}, Math };
vm.createContext(sandbox);
vm.runInContext(appCode + '; this.newtonCoef = newtonCoef; this.newtonEval = newtonEval; this.lagrangeEval = lagrangeEval; this.modInterp = modInterp;', sandbox);

const newtonCoef = sandbox.newtonCoef;
const newtonEval = sandbox.newtonEval;
const lagrangeEval = sandbox.lagrangeEval;
const modInterp = sandbox.modInterp;

const tol = 1e-12;
const pi = Math.PI;

// 2. Parámetros del ejemplo manual:
// Nodos x0 = 0, x1 = pi/2, x2 = pi con f(t) = sin(t)
const xs = [0, pi / 2, pi];
const ys = [0, 1, 0]; // sin(0)=0, sin(pi/2)=1, sin(pi)=0
const xt = pi / 4;

console.log('1. Verificando tabla triangular de diferencias divididas...');
const resN = newtonCoef(xs, ys);
const table = resN.table;
const coefs = resN.coefs || resN;

assert(Array.isArray(table), 'newtonCoef debe retornar una propiedad .table');
assert(table.length === 3, 'La tabla debe tener 3 órdenes (0, 1, 2)');

// Orden 0: [f(x0), f(x1), f(x2)] = [0, 1, 0]
assert(table[0].length === 3, 'Orden 0 debe contener 3 valores');
assertClose(table[0][0], 0, tol, 'f[x0]');
assertClose(table[0][1], 1, tol, 'f[x1]');
assertClose(table[0][2], 0, tol, 'f[x2]');

// Orden 1:
// f[x0, x1] = (1 - 0) / (pi/2 - 0) = 2/pi
// f[x1, x2] = (0 - 1) / (pi - pi/2) = -2/pi
assert(table[1].length === 2, 'Orden 1 debe contener 2 diferencias divididas');
const f_x0_x1_expected = 2 / pi;
const f_x1_x2_expected = -2 / pi;
assertClose(table[1][0], f_x0_x1_expected, tol, 'f[x0, x1]');
assertClose(table[1][1], f_x1_x2_expected, tol, 'f[x1, x2]');
console.log(`   ✔ f[x0, x1] = ${table[1][0].toFixed(8)} (teórico 2/pi = ${(2/pi).toFixed(8)})`);
console.log(`   ✔ f[x1, x2] = ${table[1][1].toFixed(8)} (teórico -2/pi = ${(-2/pi).toFixed(8)})`);

// Orden 2:
// f[x0, x1, x2] = (-2/pi - 2/pi) / (pi - 0) = -4/pi^2
assert(table[2].length === 1, 'Orden 2 debe contener 1 diferencia dividida');
const f_x0_x1_x2_expected = -4 / (pi * pi);
assertClose(table[2][0], f_x0_x1_x2_expected, tol, 'f[x0, x1, x2]');
console.log(`   ✔ f[x0, x1, x2] = ${table[2][0].toFixed(8)} (teórico -4/pi^2 = ${(-4/(pi*pi)).toFixed(8)})`);

// Coeficientes de Newton: c0 = 0, c1 = 2/pi, c2 = -4/pi^2
assertClose(coefs[0], 0, tol, 'Coeficiente Newton c0');
assertClose(coefs[1], 2 / pi, tol, 'Coeficiente Newton c1');
assertClose(coefs[2], -4 / (pi * pi), tol, 'Coeficiente Newton c2');
console.log('   ✔ Coeficientes de Newton coincidentes con la diagonal superior.');

// 3. Evaluación en el punto de prueba x̂ = pi/4
console.log('\n2. Evaluando interpolación en x̂ = pi/4...');
const valNewton = newtonEval(xs, coefs, xt);
const valLagrange = lagrangeEval(xs, ys, xt);

// P2(pi/4) = 0 + (2/pi)*(pi/4) - (4/pi^2)*(pi/4)*(pi/4 - pi/2) = 1/2 + 1/4 = 0.75
assertClose(valNewton, 0.75, tol, 'P2_Newton(pi/4)');
assertClose(valLagrange, 0.75, tol, 'P2_Lagrange(pi/4)');
assertClose(valNewton, valLagrange, tol, '|P2_Newton - P2_Lagrange| en xt');
console.log(`   ✔ P2_Newton(pi/4) = ${valNewton.toFixed(8)} (esperado exacto 0.75)`);
console.log(`   ✔ P2_Lagrange(pi/4) = ${valLagrange.toFixed(8)} (esperado exacto 0.75)`);

// 4. Verificación de error real y cota teórica
console.log('\n3. Verificando error real y cota teórica...');
const ex = Math.sin(xt); // sin(pi/4) = sqrt(2)/2 ≈ 0.70710678
const errorReal = Math.abs(ex - 0.75); // ≈ 0.04289322
const cotaTeorica = (pi ** 3) / 128;   // ≈ 0.24223654 (M=1, 3!=6, prod=(pi/4)*(pi/4)*(3pi/4) -> (3pi^3/64)/6 = pi^3/128)

assertClose(errorReal, Math.abs(Math.sin(pi / 4) - 0.75), tol, 'Error real');
assertClose(cotaTeorica, (pi ** 3) / 128, tol, 'Cota teórica pi^3/128');
assert(errorReal.toFixed(6) === '0.042893', `Error real esperado '0.042893', obtenido '${errorReal.toFixed(6)}'`);
assert(cotaTeorica.toFixed(4) === '0.2422', `Cota teórica esperada '0.2422', obtenida '${cotaTeorica.toFixed(4)}'`);
assert(errorReal <= cotaTeorica, 'El error real debe ser estrictamente menor o igual a la cota teórica');
console.log(`   ✔ Error real |sin(pi/4) - 0.75| = ${errorReal.toFixed(6)} (esperado: 0.042893)`);
console.log(`   ✔ Cota teórica pi^3/128 = ${cotaTeorica.toFixed(4)} (esperado: 0.2422)`);
console.log(`   ✔ Relación satisfecha: error real (${errorReal.toFixed(6)}) <= cota teórica (${cotaTeorica.toFixed(4)})`);

// 5. Comparación sistemática en la malla de evaluación (Lagrange vs Newton)
console.log('\n4. Verificando equivalencia de polinomios sobre la malla completa (220 puntos)...');
const pInterp = {
  func: 'sin',
  nodos: `${xs[0]}, ${xs[1]}, ${xs[2]}`,
  xt: xt,
  M: 1
};
const ri = modInterp(pInterp);
assert(ri !== null, 'modInterp debe retornar un objeto');
assert(typeof ri.diffLN === 'number', 'modInterp debe calcular ri.diffLN');
assert(ri.diffLN <= tol, `La diferencia máxima entre Lagrange y Newton debe ser < 1e-12 (obtenido ${ri.diffLN.toExponential(4)})`);
console.log(`   ✔ Diferencia máxima medida |P_Lagrange - P_Newton|_max = ${ri.diffLN.toExponential(4)} (orden de precisión de máquina)`);

// 6. Verificando que buildAllExecutions incluye dif_max_lagrange_newton en resumen
console.log('\n5. Verificando resumen de ejecuciones en Mapper.buildAllExecutions...');
const mockLast = { ri };
const execs = Mapper.buildAllExecutions(mockLast, { m4: {}, mi: pInterp }, 'N');
const execLagrange = execs.find(e => e.metodo === 'Polinomio de Lagrange');
const execNewton = execs.find(e => e.metodo === 'Newton Diferencias Divididas');

assert(execLagrange, 'Debe existir la ejecución "Polinomio de Lagrange"');
assert(execNewton, 'Debe existir la ejecución "Newton Diferencias Divididas"');

const lagValor = JSON.parse(execLagrange.resumen.valor_json);
const lagErr = JSON.parse(execLagrange.resumen.metrica_error_json);
const newtValor = JSON.parse(execNewton.resumen.valor_json);
const newtErr = JSON.parse(execNewton.resumen.metrica_error_json);

assert(lagValor.dif_max_lagrange_newton !== undefined, 'Lagrange valor_json debe contener dif_max_lagrange_newton');
assert(lagErr.dif_max_lagrange_newton !== undefined, 'Lagrange metrica_error_json debe contener dif_max_lagrange_newton');
assert(newtValor.dif_max_lagrange_newton !== undefined, 'Newton valor_json debe contener dif_max_lagrange_newton');
assert(newtErr.dif_max_lagrange_newton !== undefined, 'Newton metrica_error_json debe contener dif_max_lagrange_newton');

assert(lagValor.dif_max_lagrange_newton <= tol, 'dif_max_lagrange_newton en Lagrange <= tol');
assert(newtValor.dif_max_lagrange_newton <= tol, 'dif_max_lagrange_newton en Newton <= tol');

console.log('   ✔ dif_max_lagrange_newton persistido en valor_json y metrica_error_json en ambas ejecuciones.');
console.log('\n✅ PRUEBA DE VERIFICACIÓN MANUAL DE M4 COMPLETADA AL 100% SATISFACTORIAMENTE.');
