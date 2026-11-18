const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require('../vendor/sqljs/sql-wasm.js');
const DB = require('../js/db.js');
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
  addEventListener: () => { }
};
const win = { addEventListener: () => { }, document: doc };
const sandbox = { window: win, document: doc, console, setTimeout: () => { }, clearTimeout: () => { }, Math };
vm.createContext(sandbox);
vm.runInContext(appCode + '; this.PRE = PRE; this.SYS = SYS; this.solverRows = solverRows; this.mod1 = mod1; this.mod2 = mod2; this.mod3 = mod3; this.mod4 = mod4; this.newtonCoef = newtonCoef; this.newtonEval = newtonEval; this.lagrangeEval = lagrangeEval; this.modInterp = modInterp; this.lebesgueConstant = lebesgueConstant; this.sweepInterpolation = sweepInterpolation;', sandbox);

const newtonCoef = sandbox.newtonCoef;
const newtonEval = sandbox.newtonEval;
const lagrangeEval = sandbox.lagrangeEval;
const modInterp = sandbox.modInterp;
const lebesgueConstant = sandbox.lebesgueConstant;
const sweepInterpolation = sandbox.sweepInterpolation;
const PRE = sandbox.PRE;
const mod4 = sandbox.mod4;

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
console.log(`   ✔ f[x0, x1] = ${table[1][0].toFixed(8)} (teórico 2/pi = ${(2 / pi).toFixed(8)})`);
console.log(`   ✔ f[x1, x2] = ${table[1][1].toFixed(8)} (teórico -2/pi = ${(-2 / pi).toFixed(8)})`);

// Orden 2:
// f[x0, x1, x2] = (-2/pi - 2/pi) / (pi - 0) = -4/pi^2
assert(table[2].length === 1, 'Orden 2 debe contener 1 diferencia dividida');
const f_x0_x1_x2_expected = -4 / (pi * pi);
assertClose(table[2][0], f_x0_x1_x2_expected, tol, 'f[x0, x1, x2]');
console.log(`   ✔ f[x0, x1, x2] = ${table[2][0].toFixed(8)} (teórico -4/pi^2 = ${(-4 / (pi * pi)).toFixed(8)})`);

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

assertClose(lagValor.dif_max_lagrange_newton, 0, tol, 'dif_max_lagrange_newton en Lagrange <= tol');
assertClose(newtValor.dif_max_lagrange_newton, 0, tol, 'dif_max_lagrange_newton en Newton <= tol');

console.log('   ✔ dif_max_lagrange_newton persistido en valor_json y metrica_error_json en ambas ejecuciones.');

// 7. Verificación de punto oculto retirado en ejemplo manual de 3 nodos
console.log('\n6. Verificando retiro de nodo interior en malla de 3 nodos (0, pi/2, pi con sin t)...');
const p3Retire = { func: 'sin', a: 0, b: pi, n: 3, k: 1 };
const ri3 = modInterp(p3Retire);
assert(ri3 !== null, 'modInterp debe procesar n=3, k=1');
assert(ri3.nodos_usados.length === 2, 'Deben quedar 2 nodos usados (0 y pi)');
assert(ri3.puntos_ocultos.length === 1, 'Debe haber 1 punto oculto retirado (pi/2)');
assertClose(ri3.nodos_usados[0], 0, tol, 'Nodo usado 0');
assertClose(ri3.nodos_usados[1], pi, tol, 'Nodo usado pi');
assertClose(ri3.puntos_ocultos[0], pi / 2, tol, 'Punto oculto pi/2');

// Con nodos (0,0) y (pi,0), el polinomio interpolante lineal es P1(t) = 0.
// En t = pi/2: f(pi/2) = sin(pi/2) = 1, P1(pi/2) = 0 -> Error = |1 - 0| = 1 exacto.
const ptOculto3 = ri3.eval_lagrange.puntos[0];
const errEsperado3 = Math.abs(Math.sin(pi / 2) - 0); // = 1.0
assertClose(ptOculto3.error_abs, errEsperado3, tol, 'Error absoluto en nodo retirado');
assertClose(ptOculto3.error_abs, 1.0, tol, 'Error absoluto igual a 1');
assertClose(ri3.eL, 1.0, tol, 'ri.eL igual a 1.0');
assertClose(ri3.eN, 1.0, tol, 'ri.eN igual a 1.0');
console.log(`   ✔ Nodo retirado x̂ = ${ptOculto3.x.toFixed(4)}: exacto = ${ptOculto3.exacto}, reconstruido = ${ptOculto3.valor}, error = ${ptOculto3.error_abs}`);
console.log('   ✔ Error en el nodo retirado coincide exactamente con |f(t) - P(t)| = 1.0.');

// 8. Verificación de punto oculto retirado en malla de 4 nodos (retirando pi/4)
console.log('\n7. Verificando retiro de nodo con polinomio cuadrático (4 nodos: 0, pi/4, pi/2, pi)...');
const p4Retire = {
  func: 'sin',
  nodos: `0, ${pi / 4}, ${pi / 2}, ${pi}`,
  k: [1] // lista de índices: retira el índice 1 (pi/4)
};
const ri4 = modInterp(p4Retire);
assert(ri4.puntos_ocultos.length === 1, 'Debe retirarse 1 nodo');
assertClose(ri4.puntos_ocultos[0], pi / 4, tol, 'Punto oculto debe ser pi/4');
assert(ri4.nodos_usados.length === 3, 'Deben quedar 3 nodos usados: 0, pi/2, pi');
assertClose(ri4.nodos_usados[0], 0, tol, 'Nodo usado 0');
assertClose(ri4.nodos_usados[1], pi / 2, tol, 'Nodo usado pi/2');
assertClose(ri4.nodos_usados[2], pi, tol, 'Nodo usado pi');

// Los 3 nodos usados son 0, pi/2, pi -> P2(pi/4) = 0.75 y error = |sin(pi/4) - 0.75| = 0.042893
const ptOculto4 = ri4.eval_lagrange.puntos[0];
const errEsperado4 = Math.abs(Math.sin(pi / 4) - 0.75);
assertClose(ptOculto4.valor, 0.75, tol, 'P2(pi/4) reconstruido en el nodo retirado');
assertClose(ptOculto4.error_abs, errEsperado4, tol, 'Error en nodo retirado pi/4 coincide con |f(t) - P(t)|');
console.log(`   ✔ Nodo retirado pi/4: exacto = ${ptOculto4.exacto.toFixed(6)}, P2 = ${ptOculto4.valor.toFixed(6)}, error = ${ptOculto4.error_abs.toFixed(6)}`);
console.log(`   ✔ Coincide exactamente con el valor manual 0.042893 (|f(pi/4) - P(pi/4)|).`);

// 9. Verificación de varios puntos ocultos (n=7, k=3 en [0, pi])
console.log('\n8. Verificando caso múltiple con n=7 nodos y k=3 puntos ocultos...');
const p7Mult = { func: 'sin', a: 0, b: pi, n: 7, k: 3, M: 1 };
const ri7 = modInterp(p7Mult);
assert(ri7 !== null, 'modInterp debe procesar n=7, k=3');
assert(ri7.allNodes.length === 7, 'allNodes debe tener 7 nodos');
assert(ri7.nodos_usados.length === 4, 'nodos_usados debe tener 4 nodos');
assert(ri7.puntos_ocultos.length === 3, 'puntos_ocultos debe tener 3 puntos');

// Comprobar que los extremos NUNCA se ocultan
assertClose(ri7.nodos_usados[0], 0, tol, 'Extremo a=0 siempre usado');
assertClose(ri7.nodos_usados[3], pi, tol, 'Extremo b=pi siempre usado');
assert(!ri7.puntos_ocultos.includes(0), 'Extremo 0 nunca debe estar oculto');
assert(!ri7.puntos_ocultos.includes(pi), 'Extremo pi nunca debe estar oculto');

// Puntos ocultos esperados: pi/6, pi/2, 5pi/6
assertClose(ri7.puntos_ocultos[0], pi / 6, tol, 'Punto oculto 0: pi/6');
assertClose(ri7.puntos_ocultos[1], pi / 2, tol, 'Punto oculto 1: pi/2');
assertClose(ri7.puntos_ocultos[2], 5 * pi / 6, tol, 'Punto oculto 2: 5pi/6');

// Verificar métricas de predicción para cada método
['eval_lagrange', 'eval_newton', 'eval_spline'].forEach(mKey => {
  const ev = ri7[mKey];
  assert(ev && Array.isArray(ev.puntos), `${mKey} debe contener array de puntos`);
  assert(ev.puntos.length === 3, `${mKey} debe evaluar 3 puntos`);
  ev.puntos.forEach(p => {
    const esperado = Math.abs(p.exacto - p.valor);
    assertClose(p.error_abs, esperado, tol, `${mKey} error_abs`);
    if (Math.abs(p.exacto) > 1e-14) {
      assertClose(p.error_rel, esperado / Math.abs(p.exacto), tol, `${mKey} error_rel`);
    } else {
      assert(p.error_rel === null, `${mKey} error_rel debe ser null cuando exacto=0`);
    }
  });
  assert(typeof ev.error_max === 'number' && ev.error_max > 0, `${mKey} error_max válido`);
  assert(typeof ev.error_rms === 'number' && ev.error_rms > 0, `${mKey} error_rms válido`);
  assert(ev.peor_punto !== null, `${mKey} peor_punto válido`);
  assertClose(ev.peor_punto.error_abs, ev.error_max, tol, `${mKey} peor_punto coincide con error_max`);
});

// Comprobar que Spline reduce drásticamente el error frente a Lagrange
assert(ri7.eval_spline.error_max < ri7.eval_lagrange.error_max, 'Spline debe tener menor error máximo que Lagrange');
console.log(`   ✔ Lagrange: error máx = ${ri7.eval_lagrange.error_max.toFixed(6)}, RMS = ${ri7.eval_lagrange.error_rms.toFixed(6)}`);
console.log(`   ✔ Spline:   error máx = ${ri7.eval_spline.error_max.toFixed(6)}, RMS = ${ri7.eval_spline.error_rms.toFixed(6)}`);
console.log(`   ✔ Reducción de error por Spline comprobada (factor ${(ri7.eval_lagrange.error_max / ri7.eval_spline.error_max).toFixed(1)}x más preciso).`);

// 10. Verificación de las series requeridas en Mapper.buildAllExecutions
console.log('\n9. Verificando series generadas para persistencia...');
const last7 = { ri: ri7 };
const execs7 = Mapper.buildAllExecutions(last7, { m4: {}, mi: p7Mult }, 'N');
const interpExecs = execs7.filter(e => e.familia === 'INTERPOLACION');
assert(interpExecs.length === 3, 'Deben existir 3 ejecuciones de interpolación');

const splineExec = interpExecs.find(e => e.metodo === 'Spline Cúbico Natural');
const lagExec = interpExecs.find(e => e.metodo === 'Polinomio de Lagrange');
const newtExec = interpExecs.find(e => e.metodo === 'Newton Diferencias Divididas');

assert(splineExec && lagExec && newtExec, 'Las 3 ejecuciones deben existir');

const getSeriesNames = ej => ej.series.map(s => s.nombre);
const splineSeries = getSeriesNames(splineExec);
const lagSeries = getSeriesNames(lagExec);
const newtSeries = getSeriesNames(newtExec);

console.log('   Series en Spline:', splineSeries.join(', '));
console.log('   Series en Lagrange:', lagSeries.join(', '));
console.log('   Series en Newton:', newtSeries.join(', '));

assert(splineSeries.includes('M4_interp_spline'), 'Spline debe incluir M4_interp_spline');
assert(splineSeries.includes('M4_curva_exacta'), 'Spline debe incluir M4_curva_exacta');
assert(splineSeries.includes('M4_nodos_usados'), 'Spline debe incluir M4_nodos_usados');
assert(splineSeries.includes('M4_puntos_ocultos'), 'Spline debe incluir M4_puntos_ocultos');
assert(splineSeries.includes('M4_error_por_punto'), 'Spline debe incluir M4_error_por_punto');

assert(lagSeries.includes('M4_interp_lagrange'), 'Lagrange debe incluir M4_interp_lagrange');
assert(lagSeries.includes('M4_error_por_punto'), 'Lagrange debe incluir M4_error_por_punto');

assert(newtSeries.includes('M4_interp_newton_dd'), 'Newton debe incluir M4_interp_newton_dd');
assert(newtSeries.includes('M4_error_por_punto'), 'Newton debe incluir M4_error_por_punto');

assert(splineExec.series.length === 11, `Spline debe tener 11 series (5 base + 6 barrido, obtenido ${splineExec.series.length})`);
assert(lagExec.series.length === 6, `Lagrange debe tener 6 series (2 base + 4 barrido, obtenido ${lagExec.series.length})`);
assert(newtExec.series.length === 6, `Newton debe tener 6 series (2 base + 4 barrido, obtenido ${newtExec.series.length})`);

console.log('   ✔ Todas las 7 series requeridas verificadas con sus nombres exactos.');

// 11. Verificación de compatibilidad con k=1 y xt
console.log('\n10. Verificando compatibilidad con k=1 y xt legacy...');
const pLeg = { func: 'sin', nodos: '0, 1.5708, 3.1416', xt: 0.7854, M: 1, k: 1 };
const riLeg = modInterp(pLeg);
assert(riLeg !== null, 'modInterp debe procesar caso legacy');
assertClose(riLeg.L, 0.75, 1e-4, 'Lagrange legacy en xt=0.7854');
assertClose(riLeg.Nw, 0.75, 1e-4, 'Newton legacy en xt=0.7854');
assertClose(riLeg.eL, 0.042893, 1e-5, 'Error Lagrange legacy');
assertClose(riLeg.cota, 0.2422, 1e-3, 'Cota teórica legacy');
console.log(`   ✔ Compatibilidad legacy confirmada: L(0.7854) = ${riLeg.L.toFixed(6)}, eL = ${riLeg.eL.toFixed(6)}, cota = ${riLeg.cota.toFixed(4)}.`);

async function runFase3Tests() {
  // 12. Verificación analítica de la constante de Lebesgue para n=3 (Lambda_3 = 1.25)
  console.log('\n11. Verificando constante de Lebesgue analítica para n=3...');
  // Analítico: para 3 nodos equiespaciados en [-1, 1], l0=(x^2-x)/2, l1=1-x^2, l2=(x^2+x)/2
  // En [0, 1], Lambda(x) = 1 + x - x^2. Máximo en x=1/2: Lambda(1/2) = 1 + 1/2 - 1/4 = 5/4 = 1.25.
  // Invariante por transformación afín a cualquier [a, b].
  const leb3Standard = lebesgueConstant([-1, 0, 1], 600);
  const leb3Pi = lebesgueConstant([0, pi, 2 * pi], 600);
  assertClose(leb3Standard, 1.25, 0.005, 'Constante de Lebesgue en [-1, 1]');
  assertClose(leb3Pi, 1.25, 0.005, 'Constante de Lebesgue en [0, 2pi]');
  console.log(`   ✔ Lambda_3 en [-1, 0, 1]  = ${leb3Standard.toFixed(4)} (esperado analítico: 1.2500)`);
  console.log(`   ✔ Lambda_3 en [0, pi, 2pi] = ${leb3Pi.toFixed(4)} (esperado analítico: 1.2500)`);
  console.log('   ✔ Invariancia afín y coincidencia con el cálculo manual de lápiz y papel confirmadas.');

  // 13. Subexperimento de Mal Condicionado (n=21 nodos equiespaciados vs Chebyshev)
  console.log('\n12. Verificando subexperimento de Mal Condicionado (n=21 nodos)...');
  const riMC = modInterp(PRE.MC.mi);
  assert(riMC !== null, 'modInterp debe procesar escenario MC');
  assert(riMC.subexp_lebesgue !== null, 'MC debe ejecutar y reportar subexp_lebesgue');

  const sl = riMC.subexp_lebesgue;
  console.log(`   • Nodos totales: ${sl.n_total}, usados: ${sl.n}`);
  console.log(`   • Constante de Lebesgue equiespaciada Λ_equi = ${sl.lebesgue_equi.toFixed(2)}`);
  console.log(`   • Constante de Lebesgue Chebyshev     Λ_cheb = ${sl.lebesgue_cheb.toFixed(2)}`);
  console.log(`   • Perturbación ε = ${sl.epsilon_perturbacion} -> Error inducido máx = ${sl.error_perturbado_max.toExponential(4)}`);
  console.log(`   • Factor de amplificación medido = ${sl.amplificacion_medida.toFixed(1)}x (cota Λ·ε = ${sl.cota_lebesgue_epsilon.toExponential(4)})`);
  console.log(`   • Error nominal para sen(t) sin ruido = ${sl.error_nominal_max.toExponential(4)}`);
  console.log(`   • Fenómeno de Runge observado = ${sl.runge_observado}`);

  assert(sl.lebesgue_equi > 10000, 'Lambda_equi para n=21 debe ser > 10000 (aprox. 10986)');
  assert(sl.lebesgue_cheb < 3.5, 'Lambda_cheb para n=21 debe ser < 3.5 (aprox. 2.87)');
  assert(sl.amplificacion_medida > 8000, 'Amplificación medida debe ser > 8000x');
  assert(sl.amplificacion_medida <= sl.lebesgue_equi * 1.05, 'Amplificación debe estar acotada por Lambda_equi');
  assert(sl.error_nominal_max < 1e-10, 'Para sen(t) sin ruido, el error nominal debe ser despreciable (< 1e-10)');
  assert(sl.runge_observado === false, 'El fenómeno de Runge NO se observa para sen(t) por ser entera y analítica');

  assert(sl.diagnostico.mal_condicionamiento.includes('Propiedad del problema'), 'Diagnóstico debe indicar mal condicionamiento como propiedad del problema');
  assert(sl.diagnostico.falta_convergencia.includes('Propiedad del método'), 'Diagnóstico debe indicar convergencia como propiedad del método');
  assert(sl.diagnostico.riesgo_fisico.includes('No aplica'), 'Diagnóstico debe indicar que el riesgo físico no aplica a la tarea');
  console.log('   ✔ Subexperimento numérico riguroso de mal condicionamiento verificado.');

  // 14. Verificación de escenario de Estrés (alta demanda de datos n=40 y ruido gaussiano)
  console.log('\n13. Verificando escenario de Estrés (n=40, ruido sigma=0.05)...');
  const riE = modInterp(PRE.E.mi);
  assert(riE !== null, 'modInterp debe procesar escenario Estrés');
  assert(riE.allNodes.length === 40, 'Estrés debe generar 40 nodos');
  assert(riE.puntos_ocultos.length === 3, 'Estrés debe retirar 3 puntos ocultos');
  assert(riE.sigma === 0.05, 'Estrés debe usar sigma=0.05');
  assert(riE.seed === 2026, 'Estrés debe fijar semilla determinista 2026');
  assert(riE.eval_lagrange.error_rms > 0.005, 'Ruido sensorial debe propagarse en el error de predicción');
  console.log(`   ✔ Estrés: N=40, σ=0.05, semilla=2026 -> Error RMS = ${riE.eval_lagrange.error_rms.toFixed(5)} medido frente a la curva pura.`);

  // 15. Verificación de relanzamiento y comparación matemática en SQLite de los 3 escenarios
  console.log('\n14. Verificando relanzamiento de los 3 escenarios (Normal, Estrés, MC) en SQLite...');
  const wasmBinary = fs.readFileSync(path.join(__dirname, '../vendor/sqljs/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  db.run(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));

  const engine = {
    mod1: sandbox.mod1,
    mod2: sandbox.mod2,
    mod3: sandbox.mod3,
    mod4: sandbox.mod4,
    modInterp: sandbox.modInterp,
    SYS: sandbox.SYS,
    solverRows: sandbox.solverRows,
    PRE: sandbox.PRE
  };

  const scenCodes = ['N', 'E', 'MC'];
  for (let i = 0; i < scenCodes.length; i++) {
    const sc = scenCodes[i];
    const scenTipo = sc === 'N' ? 'NORMAL' : sc === 'E' ? 'ESTRES' : 'MAL_CONDICIONADO';
    const p4 = PRE[sc].m4;
    const pmi = PRE[sc].mi;
    const r4 = mod4(p4);
    const ri = modInterp(pmi);
    const s4Rows = r4.rows;

    const last = { r4, ri, s4Rows };
    const execs = Mapper.buildAllExecutions(last, { m4: p4, mi: pmi }, sc);
    const m4Execs = execs.filter(e => e.caso_id === 4);

    const saveRes = DB.saveSimulationTransaction({
      escenario: {
        caso_id: 4,
        tipo: scenTipo,
        parametros_json: { ...p4, mi: pmi },
        fuente_datos: `Test Relanzamiento Escenario ${sc}`
      },
      simulacion: {
        fecha: `2026-11-18 10:0${i}:00`,
        usuario_equipo: 'Investigador UMSA / Test M4',
        estado: 'COMPLETADO'
      },
      ejecuciones: m4Execs
    }, db);

    const simId = saveRes.simulacion_id;
    console.log(`   -> Simulación #${simId} (${scenTipo}) guardada con ${saveRes.ejecuciones_guardadas} ejecuciones.`);

    // Relanzar y comparar
    const relaunchRes = await DB.relaunchSimulation(simId, 1e-9, db, engine);
    const comp = relaunchRes.comparacion;

    console.log(`      ↳ Relanzada #${relaunchRes.simulacion_id}: coincide=${comp.coincide}, dif_max=${comp.diferencia_max}`);
    assert(comp.coincide === true, `El relanzamiento del escenario ${sc} DEBE coincidir con la BD`);
    assert(comp.diferencia_max <= 1e-9, `La diferencia máxima en escenario ${sc} debe ser <= 1e-9 (obtenido ${comp.diferencia_max})`);
  }
  console.log('   ✔ Todos los 3 escenarios relanzados exitosamente con coincide = 1 y diferencia_max <= 1e-9.');
  console.log('   ✔ Ruido gaussiano en Estrés es 100% reproducible y determinista.');

  console.log('\n15. Verificando barrido de nodos y convergencia del Spline Natural (Fase 4)...');
  const sw = sweepInterpolation({ func: 'sin', a: 0, b: 2 * Math.PI }, 24);
  assert(sw && sw.series, 'sweepInterpolation debe devolver un objeto con series');

  console.log(`   -> Orden de convergencia del spline natural p = ${sw.p_spline.toFixed(3)} (teórico ~4.0)`);
  assert(sw.p_spline >= 3.5 && sw.p_spline <= 5.2, `El orden de convergencia observado del spline debe ser cercano a 4 (obtenido ${sw.p_spline})`);

  console.log(`   -> Punto óptimo de bifurcación con ruido n* = ${sw.n_optimo_ruido} (error mín = ${sw.min_noise_error.toExponential(4)})`);
  assert(sw.n_optimo_ruido === 10, `El punto de mínimo error ante ruido sigma=0.05 debe ser n*=10 (obtenido ${sw.n_optimo_ruido})`);

  // Verificar series requeridas
  const reqSeries = [
    'M4_barrido_error_equi_lagrange',
    'M4_barrido_error_equi_newton_dd',
    'M4_barrido_error_equi_spline',
    'M4_barrido_error_cheb_lagrange',
    'M4_barrido_error_cheb_newton_dd',
    'M4_barrido_error_cheb_spline',
    'M4_barrido_lebesgue_equi',
    'M4_barrido_lebesgue_cheb',
    'M4_barrido_ruido_media_lagrange',
    'M4_barrido_ruido_std_lagrange',
    'M4_barrido_ruido_media_newton_dd',
    'M4_barrido_ruido_std_newton_dd',
    'M4_barrido_ruido_media_spline',
    'M4_barrido_ruido_std_spline'
  ];
  for (const sName of reqSeries) {
    assert(Array.isArray(sw.series[sName]) && sw.series[sName].length === 11, `Serie ${sName} debe existir con 11 puntos (n=4..24 paso 2)`);
  }
  console.log(`   ✔ Todas las 14 series de barrido verificadas (11 puntos cada una).`);

  // Verificar constantes de Lebesgue
  const lebEqui24 = sw.series.M4_barrido_lebesgue_equi.find(p => p.x === 24).y;
  const lebCheb24 = sw.series.M4_barrido_lebesgue_cheb.find(p => p.x === 24).y;
  console.log(`   -> Constantes de Lebesgue en n=24: Equi = ${lebEqui24.toFixed(1)}, Cheb = ${lebCheb24.toFixed(2)}`);
  assert(lebEqui24 > 50000, `Lebesgue equiespaciado en n=24 debe ser > 50000 (obtenido ${lebEqui24})`);
  assert(lebCheb24 < 3.5, `Lebesgue Chebyshev en n=24 debe ser < 3.5 (obtenido ${lebCheb24})`);

  // Verificar explosión de error polinomial ante ruido vs estabilidad del spline
  const noiseL_10 = sw.series.M4_barrido_ruido_media_lagrange.find(p => p.x === 10).y;
  const noiseL_24 = sw.series.M4_barrido_ruido_media_lagrange.find(p => p.x === 24).y;
  const noiseS_24 = sw.series.M4_barrido_ruido_media_spline.find(p => p.x === 24).y;
  console.log(`   -> Ruido medio Lagrange: n=10 -> ${noiseL_10.toFixed(4)}, n=24 -> ${noiseL_24.toFixed(2)}`);
  console.log(`   -> Ruido medio Spline natural: n=24 -> ${noiseS_24.toFixed(4)}`);
  assert(noiseL_24 > 500, `Lagrange con ruido en n=24 debe explotar (>500 por Lebesgue, obtenido ${noiseL_24})`);
  assert(noiseS_24 < 0.25, `Spline con ruido en n=24 debe permanecer acotado (<0.25, obtenido ${noiseS_24})`);
  console.log('   ✔ Comportamiento de bifurcación de estabilidad y constante de Lebesgue validado numéricamente.');

  console.log('\n✅ PRUEBA DE VERIFICACIÓN MANUAL DE M4 Y ESCENARIOS COMPLETADA AL 100% SATISFACTORIAMENTE.');
}

runFase3Tests().catch(err => {
  console.error('\n❌ ERROR EN PRUEBA FASE 3 M4:', err);
  process.exit(1);
});
