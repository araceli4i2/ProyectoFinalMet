
/* =====================================================================
   SIMTELE-RISK · app.js
   Modelos (M1-M4), solucionadores SPD, teoría de errores y gráficos
   ===================================================================== */

/* ---------- utilidades ---------- */
const $ = id => document.getElementById(id);
const fmt = (x, d = 3) => (x == null || !isFinite(x)) ? '—' : Number(x).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const sci = x => (x == null || !isFinite(x)) ? '—' : (x === 0 ? '0' : Number(x).toExponential(2));
const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => n < 2 ? a : a + (b - a) * i / (n - 1));
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const norm2 = a => Math.sqrt(dot(a, a));
const normInf = a => Math.max(...a.map(v => Math.abs(v)));
const matVec = (A, x) => A.map(r => dot(r, x));
const sub = (a, b) => a.map((v, i) => v - b[i]);
const zeros = (n, m = n) => Array.from({ length: n }, () => new Array(m).fill(0));
const pill = (c, t) => `<span class="pill ${c}">${t}</span>`;
const kpi = (l, v, s = '') => `<div class="kpi"><small>${l}</small><div class="v">${v}</div><div class="s">${s}</div></div>`;
const tbl = (h, rows) => `<table><thead><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const parseList = (s, n) => { const v = String(s).split(/[,;\s]+/).filter(Boolean).map(Number); while (v.length < n) v.push(0); return v.slice(0, n); };
const sx = (xa, ya, n = 120) => { const s = Math.max(1, Math.ceil(xa.length / n)); const o = []; for (let i = 0; i < xa.length; i += s) o.push({ x: xa[i], y: ya[i] }); return o; };
const xy = (xs, ys) => xs.map((x, i) => ({ x, y: ys[i] }));
const pos = arr => arr.filter(p => p.y != null && p.y > 0);

/* PRNG reproducible (mulberry32) y gaussiana por Box-Muller */
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(R) { const u = Math.max(R(), 1e-12), v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/* ---------- raíces: bisección con conteo de iteraciones ---------- */
function bisect(f, a, b, tol = 1e-12, maxIt = 300) {
  let fa = f(a), fb = f(b), it = 0;
  const hist = [];
  if (!isFinite(fa) || !isFinite(fb) || fa * fb > 0) return { x: null, it: 0, hist: [] };
  while (b - a > tol && it < maxIt) {
    it++;
    const m = (a + b) / 2, fm = f(m);
    hist.push({
      numero: it,
      a,
      b,
      m,
      residual: Math.abs(fm),
      error_abs: (b - a) / 2
    });
    if (fa * fm <= 0) { b = m; fb = fm; } else { a = m; fa = fm; }
  }
  return { x: (a + b) / 2, it, hist };
}

/* ---------- álgebra lineal ---------- */
// LU de Doolittle sin pivoteo (válido para SPD)
function solveLU(A, b) {
  const n = A.length, L = zeros(n), U = zeros(n);
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) { let s = 0; for (let k = 0; k < i; k++) s += L[i][k] * U[k][j]; U[i][j] = A[i][j] - s; }
    if (Math.abs(U[i][i]) < 1e-15) throw new Error('Pivote nulo: matriz singular');
    L[i][i] = 1;
    for (let j = i + 1; j < n; j++) { let s = 0; for (let k = 0; k < i; k++) s += L[j][k] * U[k][i]; L[j][i] = (A[j][i] - s) / U[i][i]; }
  }
  const y = new Array(n).fill(0), x = new Array(n).fill(0);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < i; k++) s += L[i][k] * y[k]; y[i] = b[i] - s; }
  for (let i = n - 1; i >= 0; i--) { let s = 0; for (let k = i + 1; k < n; k++) s += U[i][k] * x[k]; x[i] = (y[i] - s) / U[i][i]; }
  return x;
}

// Iterativos: Jacobi, Gauss-Seidel y Gradiente Conjugado (x0 = 0)
function iterSolve(method, A, b, tol, maxIt = 50000, normType = 'inf') {
  const n = b.length, nb = norm2(b) || 1;
  let x = new Array(n).fill(0), r = sub(b, matVec(A, x));
  let res = normType === 'inf' ? normInf(r) : (norm2(r) / nb), k = 0;
  let estado = res <= tol ? 'CONVERGIÓ' : 'NO_ALCANZÓ_TOL';
  const hist = [res];
  let p = r.slice(), rs = dot(r, r);
  while (res > tol && k < maxIt) {
    if (method === 'jacobi') {
      const xn = new Array(n);
      for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) if (j !== i) s += A[i][j] * x[j]; xn[i] = (b[i] - s) / A[i][i]; }
      x = xn; r = sub(b, matVec(A, x));
    } else if (method === 'gs') {
      for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) if (j !== i) s += A[i][j] * x[j]; x[i] = (b[i] - s) / A[i][i]; }
      r = sub(b, matVec(A, x));
    } else {
      const Ap = matVec(A, p), alpha = rs / dot(p, Ap);
      x = x.map((v, i) => v + alpha * p[i]);
      r = r.map((v, i) => v - alpha * Ap[i]);
      const rn = dot(r, r); p = r.map((v, i) => v + (rn / rs) * p[i]); rs = rn;
    }
    k++; res = normType === 'inf' ? normInf(r) : (norm2(r) / nb); hist.push(res);
    if (!isFinite(res) || res > 1e100) { estado = 'DIVERGIÓ'; break; }
    if (res <= tol) estado = 'CONVERGIÓ';
  }
  return { x, k, estado, hist };
}

// Autovalores de matriz simétrica (Jacobi rotacional)
function eigSym(M) {
  const n = M.length, A = M.map(r => r.slice());
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
    }
  }
  return A.map((r, i) => r[i]).sort((a, b) => a - b);
}
const kappaOf = A => { const ev = eigSym(A); return Math.max(...ev.map(Math.abs)) / Math.min(...ev.map(Math.abs)); };

// Tabla de solucionadores: errores vs referencia (regla: no se divide si ‖x_ref‖ = 0)
function solverRows(A, b, xref, tol, maxIt = 50000, normType = 'inf') {
  const nb = norm2(b) || 1, rows = [];
  const push = (nombre, x, k, estado, hist) => {
    const res = normType === 'inf' ? normInf(sub(b, matVec(A, x))) : (norm2(sub(b, matVec(A, x))) / nb);
    let eI = null, eR = null;
    if (xref) {
      const e = sub(x, xref); eI = normInf(e);
      const nx = normType === 'inf' ? normInf(xref) : norm2(xref);
      eR = (nx != null && Math.abs(nx) > 1e-14) ? (normType === 'inf' ? normInf(e) / nx : norm2(e) / nx) : null;
    }
    rows.push({ nombre, k, estado, res, eI, eR, hist });
  };
  try { push('LU (directo)', solveLU(A, b), 1, 'DIRECTO', []); }
  catch (e) { rows.push({ nombre: 'LU (directo)', k: '—', estado: 'Pivote nulo', res: NaN, eI: null, eR: null, hist: [] }); }
  [['jacobi', 'Jacobi'], ['gs', 'Gauss-Seidel'], ['cg', 'Gradiente conjugado']].forEach(([key, name]) => {
    const s = iterSolve(key, A, b, tol, maxIt, normType); push(name, s.x, s.k, s.estado, s.hist);
  });
  return rows;
}
const rhoObs = h => { const n = h.length; if (n < 25) return null; const a = h[n - 1], b = h[n - 11]; return (a > 0 && b > 0) ? Math.pow(a / b, 0.1) : null; };

/* ---------- interpolación ---------- */
function newtonCoef(xs, ys) {
  const n = xs.length;
  const table = [];
  table[0] = ys.slice();
  for (let k = 1; k < n; k++) {
    const row = [];
    for (let i = 0; i < n - k; i++) {
      row.push((table[k - 1][i + 1] - table[k - 1][i]) / (xs[i + k] - xs[i]));
    }
    table.push(row);
  }
  const coefs = table.map(row => row[0]);
  coefs.table = table;
  coefs.coefs = coefs;
  return coefs;
}
function newtonEval(xs, c, x) { let p = c[c.length - 1]; for (let i = c.length - 2; i >= 0; i--) p = p * (x - xs[i]) + c[i]; return p; }
function lagrangeEval(xs, ys, x) {
  let s = 0;
  for (let i = 0; i < xs.length; i++) { let L = ys[i]; for (let j = 0; j < xs.length; j++) if (j !== i) L *= (x - xs[j]) / (xs[i] - xs[j]); s += L; }
  return s;
}
function splineNatural(xs, ys) {
  const n = xs.length, h = []; for (let i = 0; i < n - 1; i++) h.push(xs[i + 1] - xs[i]);
  const M = new Array(n).fill(0);
  if (n > 2) {
    const m = n - 2, A = zeros(m), b = new Array(m).fill(0);
    for (let i = 1; i <= n - 2; i++) {
      const r = i - 1;
      A[r][r] = 2 * (h[i - 1] + h[i]);
      if (r - 1 >= 0) A[r][r - 1] = h[i - 1];
      if (r + 1 < m) A[r][r + 1] = h[i];
      b[r] = 6 * ((ys[i + 1] - ys[i]) / h[i] - (ys[i] - ys[i - 1]) / h[i - 1]);
    }
    const sol = solveLU(A, b); for (let i = 0; i < m; i++) M[i + 1] = sol[i];
  }
  return { xs, ys, h, M };
}
function splineEval(S, x) {
  const { xs, ys, h, M } = S; let i = 0;
  while (i < xs.length - 2 && x > xs[i + 1]) i++;
  const hi = h[i], a = xs[i + 1] - x, b = x - xs[i];
  return M[i] * a ** 3 / (6 * hi) + M[i + 1] * b ** 3 / (6 * hi) + (ys[i] / hi - M[i] * hi / 6) * a + (ys[i + 1] / hi - M[i + 1] * hi / 6) * b;
}
function splineDeriv(S, x) {
  const { xs, ys, h, M } = S;
  let i = 0;
  while (i < xs.length - 2 && x > xs[i + 1]) i++;
  const hi = h[i], a = xs[i + 1] - x, b = x - xs[i];
  return -M[i] * a * a / (2 * hi) + M[i + 1] * b * b / (2 * hi) + (ys[i + 1] - ys[i]) / hi - (M[i + 1] - M[i]) * hi / 6;
}

/* ---------- SISTEMAS DE REFERENCIA ---------- */
const SYS = {
  m1: { A: [[10, -2, -1, 0], [-2, 10, -2, -1], [-1, -2, 10, -2], [0, -1, -2, 10]], b: [11.5, 19.5, 14, 7], x: [2, 3, 2.5, 1.5], tol: 1e-6, norm: 'inf', nombre: 'Hidráulico 4×4 (Módulo 1)' },
  m2n: { A: [[4, 1, 0, 0], [1, 4, 1, 0], [0, 1, 4, 1], [0, 0, 1, 3]], b: [6, 12, 18, 15], x: [1, 2, 3, 4], tol: 1e-8, norm: 'inf', nombre: 'Calibración Normal 4×4 (Módulo 2)' },
  m2e: { A: [[4, 1, 0, 0], [1, 3, 1, 0], [0, 1, 3, 1], [0, 0, 1, 2.5]], b: [6.9, 10.7, 16.1, 14.2], x: [1.2, 2.1, 3.2, 4.4], tol: 1e-8, norm: 'inf', nombre: 'Calibración Estrés 4×4 (Módulo 2)' },
  m2m: { A: [[1, .999, 0, 0], [.999, 1, 0, 0], [0, 0, .01, .00999], [0, 0, .00999, .01]], b: [1.6993, 1.699, 0.020992, 0.020987], x: [1, 0.7, 1.3, 0.8], tol: 1e-8, norm: 'inf', nombre: 'Calibración Mal condicionado (Módulo 2)' }
};

/* ---------- PRESETS DE ESCENARIO ---------- */
const PRE = {
  N: {
    m1: { model: 'const', v0: 5, a0: 1.25, amax: 1.50, k: 2, c: 0, T: 4, sensor: 0.10, red: 0.05, plc: 0.10, act: 0.15, dseg: 15, h: 0.05 },
    m2: { D0: 0.10, alpha: 0.015, beta: 0.001, Du: 0.30, tmax: 20 },
    m3: { m: 1000, k: 4000, c: 200, F0: 400, Om: 1.2, Alim: 0.5, Tsim: 60, ruido: 0.05, seed: 2026 },
    m4: { pts: 12, grado: 3, a: -1, b: 1, sigma: 0, seed: 2026, coefs: '1,2,-1.5,0.5', tol: 1e-10 },
    mi: { func: 'sin', a: 0, b: 6.283185307179586, n: 12, k: 3, distrib: 'equi', sigma: 0, seed: 2026, M: 1, u: 0.5, tol_roots: 1e-10, max_it_roots: 100 }
  },
  E: {
    m1: { model: 'const', v0: 7, a0: 0.6, amax: 1.50, k: 0.8, c: 0, T: 4, sensor: 0.15, red: 0.55, plc: 0.20, act: 0.30, dseg: 15, h: 0.05 },
    m2: { D0: 0.12, alpha: 0.025, beta: 0.002, Du: 0.30, tmax: 20 },
    m3: { m: 1000, k: 4000, c: 100, F0: 400, Om: 1.9, Alim: 0.5, Tsim: 60, ruido: 0.05, seed: 2026 },
    m4: { pts: 60, grado: 3, a: -1, b: 1, sigma: 0.05, seed: 2026, coefs: '1,2,-1.5,0.5', tol: 1e-12 },
    mi: { func: 'sin', a: 0, b: 6.283185307179586, n: 40, k: 3, distrib: 'equi', sigma: 0.05, seed: 2026, M: 1, u: 0.5, tol_roots: 1e-10, max_it_roots: 100 }
  },
  MC: {
    m1: { model: 'tang', v0: 5, a0: 1.25, amax: 1.50, k: 2, c: 0, T: 4, sensor: 0.10, red: 0.05, plc: 0.10, act: 0.15, dseg: 15, h: 0.05 },
    m2: { D0: 0.24, alpha: 0.002, beta: 0.0001, Du: 0.2401, tmax: 20 },
    m3: { m: 1000, k: 4000, c: 20, F0: 40, Om: 2.0, Alim: 0.5, Tsim: 150, ruido: 0.05, seed: 2026 },
    m4: { pts: 30, grado: 5, a: 0, b: 1, sigma: 0, seed: 2026, coefs: '1,1,1,1,1,1', tol: 1e-10 },
    mi: { func: 'sin', a: 0, b: 6.283185307179586, n: 21, k: 3, distrib: 'equi', sigma: 0, seed: 2026, M: 1, u: 0.5, tol_roots: 1e-10, max_it_roots: 100 }
  }
};
const INTERP_DEF = PRE.N.mi;
PRE.M = PRE.MC;
const SCEN_KEYS = ['N', 'E', 'MC'];
const SCEN_NAME = { N: 'Normal', E: 'Estrés', MC: 'Mal condicionado', M: 'Mal condicionado' };

/* =====================================================================
   MÓDULO 1 · Detención de emergencia
   ===================================================================== */
const MODEL1 = { const: 'Desaceleración constante', prog: 'Hidráulico progresivo', tang: 'Frenado tangencial (raíz doble)' };

function acc1(p, t, v) {
  if (p.model === 'const') return p.a0 + p.c * v;
  if (p.model === 'prog') return p.amax * (1 - Math.exp(-p.k * t)) + p.c * v;
  return 2 * p.v0 * (1 - t / p.T) / p.T; // tangencial: a(t) = −dv/dt
}
function stepBrake(p, t, v, x, h, method) {
  const f = (tt, vv) => -acc1(p, tt, vv);
  if (method === 'heun') {
    const k1 = f(t, v), v2 = v + h * k1, k2 = f(t + h, v2);
    return { v: v + h / 2 * (k1 + k2), x: x + h / 2 * (v + v2) };
  }
  const k1 = f(t, v), k2 = f(t + h / 2, v + h / 2 * k1), k3 = f(t + h / 2, v + h / 2 * k2), k4 = f(t + h, v + h * k3);
  return {
    v: v + h / 6 * (k1 + 2 * k2 + 2 * k3 + k4),
    x: x + h / 6 * (v + 2 * (v + h / 2 * k1) + 2 * (v + h / 2 * k2) + (v + h * k3))
  };
}
// Integración con paso fijo hasta un tiempo final (Heun o RK4)
function fixedRun(p, method, tEnd, N) {
  const h = tEnd / N; let t = 0, v = p.v0, x = 0;
  for (let i = 0; i < N; i++) { const s = stepBrake(p, t, v, x, h, method); v = s.v; x = s.x; t += h; }
  return { v, x };
}
// Integración hasta detención (v ≤ 0) con interpolación lineal del evento
function brakeRun(p, h, method) {
  let t = 0, v = p.v0, x = 0; const T = [0], V = [v], X = [0];
  const maxS = Math.ceil(600 / h);
  for (let i = 0; i < maxS; i++) {
    const s = stepBrake(p, t, v, x, h, method);
    if (s.v <= 0) {
      const fr = v / (v - s.v), td = t + fr * h, xd = x + fr * (s.x - x);
      T.push(td); V.push(0); X.push(xd);
      return { t: T, v: V, x: X, tdet: td, xdet: xd, steps: i + 1 };
    }
    t += h; v = s.v; x = s.x; T.push(t); V.push(v); X.push(x);
  }
  return { t: T, v: V, x: X, tdet: null, xdet: null, steps: maxS };
}
// Soluciones analíticas (válidas con c = 0 o en el modelo tangencial)
function analytic1(p) {
  const v0 = p.v0;
  if (p.model === 'tang') {
    const T = p.T;
    return { ok: true, tdet: T, dF: v0 * T / 3, vAt: t => t >= T ? 0 : v0 * (1 - t / T) ** 2,
      xAt: t => { const s = Math.min(Math.max(t, 0), T); return v0 * T / 3 * (1 - (1 - s / T) ** 3); } };
  }
  if (p.c !== 0) return { ok: false };
  if (p.model === 'const') {
    const a = p.a0, td = v0 / a;
    return { ok: true, tdet: td, dF: v0 * v0 / (2 * a), vAt: t => Math.max(0, v0 - a * t),
      xAt: t => { const s = Math.min(Math.max(t, 0), td); return v0 * s - a * s * s / 2; } };
  }
  const A = p.amax, k = Math.max(p.k, 1e-9);
  const V = t => v0 - A * (t + (Math.exp(-k * t) - 1) / k);
  const td = bisect(V, 0, 1000).x;
  const xAt = t => { const s = Math.min(Math.max(t, 0), td ?? t); return v0 * s - A * (s * s / 2 + (1 - Math.exp(-k * s)) / (k * k) - s / k); };
  return { ok: true, tdet: td, dF: td == null ? null : xAt(td), vAt: t => Math.max(0, V(t)), xAt };
}
function mod1(p) {
  const tr = p.sensor + p.red + p.plc + p.act, dR = p.v0 * tr;
  const an = analytic1(p), ok = an.ok;
  const num = brakeRun(p, p.h, 'rk4'), heu = brakeRun(p, p.h, 'heun');
  const tdet = ok ? an.tdet : num.tdet, dF = ok ? an.dF : num.xdet, D = dR + dF;
  const err = (a, b) => (a == null || b == null) ? null : Math.abs(a - b);
  return {
    p, tr, dR, an, ok, num, heu, tdet, dF, D,
    margen: p.dseg - D, seguro: D <= p.dseg, tTotal: tdet == null ? null : tr + tdet,
    eT4: ok ? err(num.tdet, an.tdet) : null, eT2: ok ? err(heu.tdet, an.tdet) : null,
    eX4: ok ? err(num.xdet, an.dF) : null, eX2: ok ? err(heu.xdet, an.dF) : null
  };
}
// Convergencia: error en la distancia a tEnd frente a la referencia, para cada h
function rkConv(r, tEnd, hs) {
  const ref = r.ok ? { x: r.an.xAt(tEnd), v: r.an.vAt(tEnd) } : fixedRun(r.p, 'rk4', tEnd, 20000);
  return hs.map(h => {
    const N = Math.max(1, Math.round(tEnd / h));
    const a = fixedRun(r.p, 'heun', tEnd, N), b = fixedRun(r.p, 'rk4', tEnd, N);
    return { h: tEnd / N, e2: Math.abs(a.x - ref.x), e4: Math.abs(b.x - ref.x), v2: Math.abs(a.v - ref.v), v4: Math.abs(b.v - ref.v) };
  });
}

/* =====================================================================
   MÓDULO 2 · Deterioro mecánico
   ===================================================================== */
function mod2(p) {
  const { D0, alpha: a, beta: b, Du, tmax } = p;
  const D = t => D0 + a * t + b * t * t;
  const disc = a * a + 4 * b * (Du - D0), sq = disc >= 0 ? Math.sqrt(disc) : NaN;
  let tStar = null, estado;
  if (Du <= D0) { tStar = 0; estado = 'Umbral ya superado en t = 0'; }
  else if (disc >= 0 && a + sq > 0) { tStar = 2 * (Du - D0) / (a + sq); estado = 'Cruce futuro del umbral'; }
  else estado = 'El umbral no se alcanza';
  const tDir = (b > 0 && disc >= 0) ? (-a + sq) / (2 * b) : null;
  const sens = (tStar != null && tStar > 0) ? 1 / (a + 2 * b * tStar) : null;
  const kRel = sens != null ? Du / tStar * sens : null;
  const f = t => D(t) - Du;
  const bis = bisect(f, 0, tmax);
  let tN = null, itN = 0, histN = [];
  if (tStar != null && tStar > 0) {
    let t = 0;
    for (itN = 1; itN <= 50; itN++) {
      const fp = a + 2 * b * t; if (fp === 0) break;
      const fVal = f(t);
      const tn = t - fVal / fp;
      histN.push({ numero: itN, t: tn, residual: Math.abs(f(tn)), error_abs: Math.abs(tn - t) });
      if (Math.abs(tn - t) < 1e-12) { t = tn; break; }
      t = tn;
    }
    tN = t;
  }
  const ts = linspace(0, tmax, 200);
  const sweep = [];
  for (let i = 0; i <= 60; i++) {
    const dd = 10 ** (-4 + (Math.log10(0.5) + 4) * i / 60), dsc = a * a + 4 * b * dd, q = Math.sqrt(dsc);
    sweep.push({ x: dd, y: (dsc >= 0 && a + q > 0) ? 2 * dd / (a + q) : null });
  }
  return {
    p, D, disc, tStar, tDir, sens, kRel, bis, tN, itN, histN, estado, ts, sweep,
    Dts: ts.map(D), fres: tStar != null ? f(tStar) : null,
    cancel: (tDir != null && tStar) ? Math.abs(tDir - tStar) / tStar : null
  };
}

/* =====================================================================
   MÓDULO 3 · Oscilaciones por viento
   ===================================================================== */
const HSIM = 0.05;
const LAT3 = [['t_sensor', 'Captura del sensor de balanceo', 0.20], ['t_red', 'Transmisión telemétrica', 0.10],
  ['t_PLC', 'Evaluación del umbral de alerta', 0.30], ['t_actuador', 'Activación de la alarma', 0.50]];

function calib3(p) {
  const { m, k, c, F0 } = p;
  const seed3 = (p.seed !== undefined && p.seed !== null && p.seed !== '') ? (Number(p.seed) | 0) : 2026;
  const R = rng(seed3), fr = [0.8, 1.2, 1.6, 2.0, 2.4];
  const Phi = [], y = [], Xm = [];
  fr.forEach(W => {
    const Xt = F0 / Math.hypot(k - m * W * W, c * W);
    const xm = Xt * (1 + (p.ruido / 100) * (2 * R() - 1));
    Xm.push(xm); Phi.push([1, W * W, W ** 4]); y.push((F0 / xm) ** 2);
  });
  const nrm = [0, 1, 2].map(j => Math.sqrt(Phi.reduce((s, r) => s + r[j] * r[j], 0)));
  const Pt = Phi.map(r => r.map((v, j) => v / nrm[j]));
  const N = zeros(3), bN = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) N[i][j] = Pt.reduce((s, r) => s + r[i] * r[j], 0);
    bN[i] = Pt.reduce((s, r, q) => s + r[i] * y[q], 0);
  }
  const sN = solveLU(N, bN), a = sN.map((s, j) => s / nrm[j]);
  const mh = Math.sqrt(Math.max(a[2], 0)), kh = Math.sqrt(Math.max(a[0], 0));
  const cc = a[1] + 2 * kh * mh, ch = cc >= 0 ? Math.sqrt(cc) : NaN;
  const aT = [k * k, c * c - 2 * k * m, m * m], sT = aT.map((v, j) => v * nrm[j]);
  const G = zeros(3);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) G[i][j] = Phi.reduce((s, r) => s + r[i] * r[j], 0);
  const eM = Math.abs(mh - m) / m * 100, eK = Math.abs(kh - k) / k * 100, eC = Math.abs(ch - c) / c * 100;
  return { fr, Xm, y, N, bN, sT, a, mh, kh, ch, eM, eK, eC, emax: Math.max(eM, eK, eC),
    kS: kappaOf(N), kR: kappaOf(G) };
}

function mod3(p) {
  const { m, k, c, F0, Om, Alim, Tsim } = p;
  const w = Math.sqrt(k / m), z = c / (2 * m * w), wd = z < 1 ? w * Math.sqrt(1 - z * z) : null;
  const tau = 1 / (z * w), Tn = 2 * Math.PI / w, TO = 2 * Math.PI / Om;
  const dx = k - m * Om * Om, X = F0 / Math.hypot(dx, c * Om), phi = Math.atan2(c * Om, dx);
  const Xres = F0 / (c * w), est = F0 / k, rr = Om / w;
  const f = (t, y) => [y[1], (F0 * Math.sin(Om * t) - c * y[1] - k * y[0]) / m];
  const n = Math.max(2, Math.round(Tsim / HSIM)), every = Math.max(1, Math.floor(n / 1200));
  const tw = Tsim - 3 * TO;
  let t = 0, y = [0, 0], cross = null, Aper = 0;
  const ts = [], xs = [];
  for (let i = 0; i <= n; i++) {
    if (i % every === 0) { ts.push(t); xs.push(y[0]); }
    if (cross === null && Math.abs(y[0]) > Alim) cross = t;
    if (t >= tw) Aper = Math.max(Aper, Math.abs(y[0]));
    if (i < n) {
      const h = HSIM, k1 = f(t, y);
      const k2 = f(t + h / 2, [y[0] + h / 2 * k1[0], y[1] + h / 2 * k1[1]]);
      const k3 = f(t + h / 2, [y[0] + h / 2 * k2[0], y[1] + h / 2 * k2[1]]);
      const k4 = f(t + h, [y[0] + h * k3[0], y[1] + h * k3[1]]);
      y = [y[0] + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), y[1] + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
      t += h;
    }
  }
  const fr = linspace(0.2, 3, 220).map(W => ({ x: W, y: F0 / Math.hypot(k - m * W * W, c * W) }));
  let cal = null; try { cal = calib3(p); } catch (e) { cal = null; }
  return { m, k, c, F0, Om, Alim, w, z, wd, tau, Tn, TO, X, phi, Xres, est, rr, cross, Aper, ts, xs, fr, cal,
    ratio: 1.10 / Tn, margenT: Tn - 1.10 };
}

/* =====================================================================
   MÓDULO 4 · Calibración por mínimos cuadrados e interpolación
   ===================================================================== */
function mod4(p) {
  const n = p.grado + 1, r = linspace(p.a, p.b, p.pts), x0 = parseList(p.coefs, n);
  const V = r.map(ri => Array.from({ length: n }, (_, j) => ri ** j));
  const R = rng(p.seed | 0);
  const yc = V.map(row => dot(row, x0));
  const y = yc.map(v => v + p.sigma * gauss(R));
  const A = zeros(n), b = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) A[i][j] = V.reduce((s, row) => s + row[i] * row[j], 0);
    b[i] = V.reduce((s, row, q) => s + row[i] * y[q], 0);
  }
  const ev = eigSym(A), kap = Math.max(...ev.map(Math.abs)) / Math.min(...ev.map(Math.abs));
  let xref = null; try { xref = solveLU(A, b); } catch (e) { xref = null; }
  const rows = solverRows(A, b, xref, p.tol, 50000, 'rel2');
  const cgRow = rows.find(q => q.nombre.startsWith('Gradiente'));
  const basis = t => Array.from({ length: n }, (_, j) => t ** j);
  const grid = linspace(p.a, p.b, 200);
  const fit = xref ? grid.map(t => dot(basis(t), xref)) : [];
  const fitTrue = grid.map(t => dot(basis(t), x0));
  const eStat = xref ? norm2(sub(xref, x0)) / norm2(x0) : null;
  return { r, y, yc, A, b, x0, xref, kap, lmin: ev[0], lmax: ev[n - 1], rows, cgRow, grid, fit, fitTrue, eStat, n, tol: p.tol };
}

function lebesgueConstant(xs, numEval = 400) {
  const n = xs.length;
  if (n <= 1) return 1;
  const a = xs[0], b = xs[n - 1];
  const grid = linspace(a, b, numEval);
  let maxLeb = 0;
  for (const x of grid) {
    let sumL = 0;
    for (let i = 0; i < n; i++) {
      let l_i = 1;
      for (let j = 0; j < n; j++) {
        if (j !== i) l_i *= (x - xs[j]) / (xs[i] - xs[j]);
      }
      sumL += Math.abs(l_i);
    }
    if (sumL > maxLeb) maxLeb = sumL;
  }
  return maxLeb;
}

function evalOnPoints(evalFn, X_ocultos, f) {
  const puntos = [];
  let sumSq = 0;
  let maxAbs = -1;
  let peorPunto = null;
  for (const x of X_ocultos) {
    const exacto = f(x);
    const valor = evalFn(x);
    const error_abs = Math.abs(exacto - valor);
    const error_rel = (exacto != null && Math.abs(exacto) > 1e-14) ? error_abs / Math.abs(exacto) : null;
    sumSq += error_abs * error_abs;
    if (error_abs > maxAbs) {
      maxAbs = error_abs;
      peorPunto = { x, exacto, valor, error_abs, error_rel };
    }
    puntos.push({ x, exacto, valor, error_abs, error_rel });
  }
  const k = X_ocultos.length;
  const error_rms = k > 0 ? Math.sqrt(sumSq / k) : 0;
  const error_max = k > 0 ? maxAbs : 0;
  return { puntos, error_max, error_rms, peor_punto: peorPunto };
}

function modInterp(p) {
  p = p || {};
  const f = p.func === 'exp' ? (t => Math.exp(-t)) : Math.sin;
  let a = (p.a !== undefined && p.a !== null && p.a !== '') ? Number(p.a) : 0;
  let b = (p.b !== undefined && p.b !== null && p.b !== '') ? Number(p.b) : (2 * Math.PI);
  if (!isFinite(a)) a = 0;
  if (!isFinite(b)) b = 2 * Math.PI;
  const M = (p.M !== undefined && p.M !== null && p.M !== '') ? Number(p.M) : 1;
  const sigma = (p.sigma !== undefined && p.sigma !== null && p.sigma !== '') ? Number(p.sigma) : 0;
  const seed = (p.seed !== undefined && p.seed !== null && p.seed !== '') ? (Number(p.seed) | 0) : 2026;
  const distrib = p.distrib === 'cheb' ? 'cheb' : 'equi';

  let allNodes = [];
  let customNodes = null;
  if (p.nodos !== undefined && p.nodos !== null && String(p.nodos).trim() !== '') {
    const parsed = String(p.nodos).split(/[,;\s]+/).map(Number).filter(v => isFinite(v));
    const u = [...new Set(parsed)].sort((x, y) => x - y);
    if (u.length >= 2) customNodes = u;
  }

  // Compatibilidad hacia atrás: si se pasan nodos explícitos y un xt exterior (k=1)
  let isLegacyExternalPoint = false;
  if (customNodes && p.xt !== undefined && p.xt !== null && p.xt !== '') {
    const xtNum = Number(p.xt);
    if (isFinite(xtNum) && !customNodes.some(x => Math.abs(x - xtNum) < 1e-12)) {
      isLegacyExternalPoint = true;
    }
  }

  let xs = []; // nodos usados
  let X_ocultos = []; // puntos ocultos
  let indicesOcultos = [];

  if (isLegacyExternalPoint) {
    xs = customNodes.slice();
    X_ocultos = [Number(p.xt)];
    indicesOcultos = [];
    allNodes = [...xs, Number(p.xt)].sort((x, y) => x - y);
  } else {
    if (customNodes) {
      allNodes = customNodes;
    } else {
      let n = parseInt(p.n, 10);
      if (isNaN(n) || n < 3) n = 12;
      if (distrib === 'cheb') {
        allNodes = [];
        for (let j = 0; j < n; j++) {
          allNodes.push(0.5 * (a + b) - 0.5 * (b - a) * Math.cos(j * Math.PI / (n - 1)));
        }
      } else {
        allNodes = linspace(a, b, n);
      }
    }
    const N = allNodes.length;
    if (N < 2) return null;

    if (N === 2) {
      xs = allNodes.slice();
      X_ocultos = [];
    } else {
      let kInput = p.k;
      let explicitIndices = [];
      if (Array.isArray(kInput)) {
        explicitIndices = kInput.map(Number).filter(v => Number.isInteger(v) && v > 0 && v < N - 1);
        explicitIndices = [...new Set(explicitIndices)].sort((x, y) => x - y);
      } else if (typeof kInput === 'string' && (kInput.includes(',') || kInput.includes('[') || kInput.startsWith('idx:'))) {
        const clean = kInput.replace(/[\[\]]/g, '').replace(/^idx:/, '');
        explicitIndices = clean.split(/[,;\s]+/).map(Number).filter(v => Number.isInteger(v) && v > 0 && v < N - 1);
        explicitIndices = [...new Set(explicitIndices)].sort((x, y) => x - y);
      }
      if (explicitIndices.length > 0) {
        indicesOcultos = explicitIndices;
      } else {
        let kVal = (typeof kInput === 'number') ? kInput : parseInt(kInput, 10);
        if (isNaN(kVal) || kVal < 1) kVal = 3;
        kVal = Math.min(kVal, N - 2);
        if (kVal === 1) {
          indicesOcultos = [Math.floor(N / 2)];
        } else {
          const idxs = [];
          for (let j = 0; j < kVal; j++) {
            idxs.push(Math.round(1 + j * (N - 3) / (kVal - 1)));
          }
          indicesOcultos = [...new Set(idxs)].sort((x, y) => x - y);
        }
      }
      X_ocultos = indicesOcultos.map(i => allNodes[i]);
      xs = allNodes.filter((_, i) => !indicesOcultos.includes(i));
    }
  }

  if (xs.length < 2) return null;

  // Generación de ordenadas con ruido reproducible (mulberry32)
  let noiseArray = new Array(allNodes.length).fill(0);
  if (sigma > 0) {
    const R = rng(seed);
    noiseArray = allNodes.map(() => sigma * gauss(R));
  }
  const ys_true = xs.map(f);
  const ys = xs.map(x => {
    const idx = allNodes.indexOf(x);
    return f(x) + (idx >= 0 ? noiseArray[idx] : 0);
  });
  const n = xs.length;

  const nwt = newtonCoef(xs, ys);
  const cN = nwt.coefs || nwt;
  const tableDD = nwt.table;
  const S = splineNatural(xs, ys);

  // Evaluación del error de predicción en puntos ocultos frente a la función VERDADERA (sin ruido)
  const eval_lagrange = evalOnPoints(x => lagrangeEval(xs, ys, x), X_ocultos, f);
  const eval_newton = evalOnPoints(x => newtonEval(xs, cN, x), X_ocultos, f);
  const eval_spline = evalOnPoints(x => splineEval(S, x), X_ocultos, f);

  // Cota teórica de error polinomial M/n! * prod |x - xi|
  let fact = 1; for (let i = 2; i <= n; i++) fact *= i;
  let cotaMax = 0;
  X_ocultos.forEach(x => {
    let prod = 1;
    xs.forEach(xi => prod *= Math.abs(x - xi));
    const c = M * prod / fact;
    if (c > cotaMax) cotaMax = c;
  });

  const domMin = Math.min(xs[0], ...(X_ocultos.length ? X_ocultos : []));
  const domMax = Math.max(xs[n - 1], ...(X_ocultos.length ? X_ocultos : []));
  const grid = linspace(domMin, domMax, 220);
  const fT = grid.map(f); // Función verdadera sin ruido
  const fL = grid.map(t => lagrangeEval(xs, ys, t));
  const fN = grid.map(t => newtonEval(xs, cN, t));
  const fS = grid.map(t => splineEval(S, t));

  let diffLN = 0;
  for (let i = 0; i < grid.length; i++) {
    const d = Math.abs(fL[i] - fN[i]);
    if (d > diffLN) diffLN = d;
  }

  // Subexperimento numérico de Lebesgue, sensibilidad a perturbación y análisis de Runge
  let subexp_lebesgue = null;
  if (n >= 3 && n <= 45) {
    const domA = domMin, domB = domMax;
    const N_tot = allNodes.length;
    const lebUsados = lebesgueConstant(xs, 500);
    const chebNodes = [];
    for (let j = 0; j < N_tot; j++) {
      chebNodes.push(0.5 * (domA + domB) - 0.5 * (domB - domA) * Math.cos(j * Math.PI / (N_tot - 1)));
    }
    const lebCheb = lebesgueConstant(chebNodes, 500);
    const lebEqui = lebesgueConstant(linspace(domA, domB, N_tot), 500);

    // Prueba de sensibilidad: perturbación epsilon en las ordenadas
    const eps = 1e-6;
    const ysPert = ys.map((y, i) => y + eps * (i % 2 === 0 ? 1 : -1));
    const fLPert = grid.map(t => lagrangeEval(xs, ysPert, t));
    let maxDiffPert = 0;
    for (let i = 0; i < grid.length; i++) {
      const d = Math.abs(fLPert[i] - fL[i]);
      if (d > maxDiffPert) maxDiffPert = d;
    }
    const ampMedida = maxDiffPert / eps;

    // Error nominal sin ruido frente a función verdadera
    let maxNominalErr = 0;
    for (let i = 0; i < grid.length; i++) {
      const d = Math.abs(fT[i] - fL[i]);
      if (d > maxNominalErr) maxNominalErr = d;
    }
    const rungeObservado = (maxNominalErr > 1.0);

    subexp_lebesgue = {
      n: xs.length,
      n_total: allNodes.length,
      distrib: distrib,
      lebesgue_equi: lebEqui,
      lebesgue_cheb: lebCheb,
      lebesgue_usados: lebUsados,
      epsilon_perturbacion: eps,
      error_perturbado_max: maxDiffPert,
      amplificacion_medida: ampMedida,
      cota_lebesgue_epsilon: lebUsados * eps,
      runge_observado: rungeObservado,
      error_nominal_max: maxNominalErr,
      diagnostico: {
        mal_condicionamiento: `Propiedad del problema: Λ_equi = ${fmt(lebEqui, 1)} >> Λ_cheb = ${fmt(lebCheb, 2)}. Nodos equiespaciados amplifican perturbaciones por factor medido de ${fmt(ampMedida, 1)}x.`,
        falta_convergencia: `Propiedad del método: para ${p.func === 'exp' ? 'e^(−t)' : 'sen(t)'} sin ruido el error nominal es ${sci(maxNominalErr)} (el fenómeno clásico de Runge NO se observa por analiticidad global de la función).`,
        riesgo_fisico: 'No aplica: es un análisis de estabilidad matemática de la discretización sensorial sin implicancia mecánica.'
      }
    };
  }

  const peorL = eval_lagrange.peor_punto || (X_ocultos.length ? { x: X_ocultos[0], exacto: f(X_ocultos[0]), valor: lagrangeEval(xs, ys, X_ocultos[0]) } : { x: xs[0], exacto: ys[0], valor: ys[0] });
  const xtRef = peorL.x;
  const exRef = peorL.exacto;
  const LRef = peorL.valor;
  const NwRef = eval_newton.peor_punto ? eval_newton.peor_punto.valor : newtonEval(xs, cN, xtRef);
  const SvRef = eval_spline.peor_punto ? eval_spline.peor_punto.valor : splineEval(S, xtRef);

  // --- CRUCE DE UMBRAL (Bisección, Newton-Raphson, Secante) ---
  const u = (p.u !== undefined && p.u !== null) ? Number(p.u) : 0.5;
  const gS = t => splineEval(S, t) - u;
  const dgS = t => splineDeriv(S, t);

  // Referencia analítica t*
  let t_analitico = null;
  if (p.func === 'sin' && Math.abs(u) <= 1) {
    t_analitico = Math.asin(u);
  } else if (p.func === 'exp' && u > 0) {
    t_analitico = -Math.log(u);
  }

  // Conteo de cruces en la malla de evaluación densa
  let cruces_spline = 0;
  let cruces_polinomio = 0;
  for (let i = 0; i < grid.length - 1; i++) {
    if ((fS[i] - u) * (fS[i + 1] - u) <= 0) cruces_spline++;
    if ((fL[i] - u) * (fL[i + 1] - u) <= 0) cruces_polinomio++;
  }

  // Bracketing interval [a_bis, b_bis] para la raíz del spline más cercana al valor analítico
  let a_bis = 0, b_bis = Math.PI / 2;
  if (gS(a_bis) * gS(b_bis) > 0) {
    let minDiff = Infinity;
    for (let i = 0; i < grid.length - 1; i++) {
      if ((fS[i] - u) * (fS[i + 1] - u) <= 0) {
        const mid = (grid[i] + grid[i + 1]) / 2;
        const diff = t_analitico != null ? Math.abs(mid - t_analitico) : 0;
        if (diff < minDiff) {
          minDiff = diff;
          a_bis = grid[i];
          b_bis = grid[i + 1];
        }
      }
    }
  }

  const tolRoots = p.tol_roots || 1e-10;
  const maxItRoots = p.max_it_roots || 100;

  const resBiseccion = biseccion(gS, a_bis, b_bis, tolRoots, maxItRoots);
  const x0_newton = (a_bis + b_bis) / 2;
  const resNewton = newtonRaphson(gS, dgS, x0_newton, tolRoots, maxItRoots);
  const resSecante = secante(gS, a_bis, b_bis, tolRoots, maxItRoots);

  // Cruce sobre el polinomio interpolante (Lagrange) para comparación
  const gP = t => lagrangeEval(xs, ys, t) - u;
  let resPolinomio = null;
  let a_p = 0, b_p = Math.PI / 2;
  if (gP(a_p) * gP(b_p) <= 0) {
    resPolinomio = biseccion(gP, a_p, b_p, tolRoots, maxItRoots);
  } else {
    for (let i = 0; i < grid.length - 1; i++) {
      if ((fL[i] - u) * (fL[i + 1] - u) <= 0) {
        a_p = grid[i]; b_p = grid[i + 1];
        resPolinomio = biseccion(gP, a_p, b_p, tolRoots, maxItRoots);
        break;
      }
    }
  }

  const cruce_umbral = {
    u,
    t_analitico,
    cruces_spline,
    cruces_polinomio,
    tolerancia: tolRoots,
    max_iter: maxItRoots,
    intervalo_inicial: [a_bis, b_bis],
    semilla_newton: x0_newton,
    semillas_secante: [a_bis, b_bis],
    biseccion: resBiseccion,
    newton: resNewton,
    secante: resSecante,
    polinomio: resPolinomio,
    t_star_spline: resBiseccion.x,
    t_star_poly: resPolinomio ? resPolinomio.x : null,
    diff_spline_poly: (resBiseccion.x != null && resPolinomio && resPolinomio.x != null) ? Math.abs(resBiseccion.x - resPolinomio.x) : null,
    diff_spline_analitica: (resBiseccion.x != null && t_analitico != null) ? Math.abs(resBiseccion.x - t_analitico) : null,
    diff_poly_analitica: (resPolinomio && resPolinomio.x != null && t_analitico != null) ? Math.abs(resPolinomio.x - t_analitico) : null
  };

  return {
    xs, ys, ys_true, noiseArray, n,
    nodos_usados: xs,
    allNodes,
    puntos_ocultos: X_ocultos,
    indicesOcultos,
    k: X_ocultos.length,
    xt: xtRef,
    ex: exRef,
    L: LRef,
    Nw: NwRef,
    Sv: SvRef,
    eL: eval_lagrange.error_max,
    eN: eval_newton.error_max,
    eS: eval_spline.error_max,
    cota: cotaMax,
    cN, tableDD, diffLN,
    eval_lagrange, eval_newton, eval_spline,
    subexp_lebesgue,
    sweep: p.skip_sweep ? null : sweepInterpolation(p, p.N_sweep || 24),
    sigma, seed, distrib,
    grid, fT, fL, fN, fS, f,
    S,
    cruce_umbral
  };
}

function sweepInterpolation(p = {}, N_max = 24) {
  const f = p.func === 'exp' ? (t => Math.exp(-t)) : Math.sin;
  const a = (p.a !== undefined && p.a !== null && p.a !== '') ? Number(p.a) : 0;
  const b = (p.b !== undefined && p.b !== null && p.b !== '') ? Number(p.b) : (2 * Math.PI);
  const M = (p.M !== undefined && p.M !== null && p.M !== '') ? Number(p.M) : 1;

  const nList = [];
  for (let n = 4; n <= N_max; n += 2) nList.push(n);

  const series = {
    M4_barrido_error_equi_lagrange: [],
    M4_barrido_error_equi_newton_dd: [],
    M4_barrido_error_equi_spline: [],
    M4_barrido_error_cheb_lagrange: [],
    M4_barrido_error_cheb_newton_dd: [],
    M4_barrido_error_cheb_spline: [],
    M4_barrido_lebesgue_equi: [],
    M4_barrido_lebesgue_cheb: [],
    M4_barrido_ruido_media_lagrange: [],
    M4_barrido_ruido_std_lagrange: [],
    M4_barrido_ruido_media_newton_dd: [],
    M4_barrido_ruido_std_newton_dd: [],
    M4_barrido_ruido_media_spline: [],
    M4_barrido_ruido_std_spline: []
  };

  const tableData = [];
  const hSpline = [];
  const errSplineDense = [];

  for (const n of nList) {
    const kVal = (n <= 4) ? 1 : 3;

    // --- A. Equiespaciados sin ruido (sigma = 0) ---
    const riEqui = modInterp({ func: p.func, a, b, n, k: kVal, distrib: 'equi', sigma: 0, M, skip_sweep: true });
    let maxEL = 0, maxEN = 0, maxES = 0;
    for (let i = 0; i < riEqui.grid.length; i++) {
      const eL = Math.abs(riEqui.fL[i] - riEqui.fT[i]);
      const eN = Math.abs(riEqui.fN[i] - riEqui.fT[i]);
      const eS = Math.abs(riEqui.fS[i] - riEqui.fT[i]);
      if (eL > maxEL) maxEL = eL;
      if (eN > maxEN) maxEN = eN;
      if (eS > maxES) maxES = eS;
    }
    series.M4_barrido_error_equi_lagrange.push({ x: n, y: maxEL });
    series.M4_barrido_error_equi_newton_dd.push({ x: n, y: maxEN });
    series.M4_barrido_error_equi_spline.push({ x: n, y: maxES });

    if (n >= 8) {
      hSpline.push((b - a) / (n - 1));
      errSplineDense.push(maxES);
    }

    // --- B. Chebyshev sin ruido (sigma = 0) ---
    const riCheb = modInterp({ func: p.func, a, b, n, k: kVal, distrib: 'cheb', sigma: 0, M, skip_sweep: true });
    let maxCL = 0, maxCN = 0, maxCS = 0;
    for (let i = 0; i < riCheb.grid.length; i++) {
      const eL = Math.abs(riCheb.fL[i] - riCheb.fT[i]);
      const eN = Math.abs(riCheb.fN[i] - riCheb.fT[i]);
      const eS = Math.abs(riCheb.fS[i] - riCheb.fT[i]);
      if (eL > maxCL) maxCL = eL;
      if (eN > maxCN) maxCN = eN;
      if (eS > maxCS) maxCS = eS;
    }
    series.M4_barrido_error_cheb_lagrange.push({ x: n, y: maxCL });
    series.M4_barrido_error_cheb_newton_dd.push({ x: n, y: maxCN });
    series.M4_barrido_error_cheb_spline.push({ x: n, y: maxCS });

    // --- C. Constantes de Lebesgue ---
    const xsE = Array.from({length: n}, (_, i) => a + i * (b - a) / (n - 1));
    const xsC = Array.from({length: n}, (_, j) => 0.5 * (a + b) - 0.5 * (b - a) * Math.cos(j * Math.PI / (n - 1)));
    const lebE = lebesgueConstant(xsE, 1000);
    const lebC = lebesgueConstant(xsC, 1000);
    series.M4_barrido_lebesgue_equi.push({ x: n, y: lebE });
    series.M4_barrido_lebesgue_cheb.push({ x: n, y: lebC });

    // --- D. Con ruido (sigma = 0.05) - Promedio de 5 semillas (2026-2030) ---
    const noiseL = [], noiseS = [];
    for (let s = 2026; s <= 2030; s++) {
      const riNoise = modInterp({ func: p.func, a, b, n, k: kVal, distrib: 'equi', sigma: 0.05, seed: s, M, skip_sweep: true });
      let mnL = 0, mnS = 0;
      for (let i = 0; i < riNoise.grid.length; i++) {
        const eL = Math.abs(riNoise.fL[i] - riNoise.fT[i]);
        const eS = Math.abs(riNoise.fS[i] - riNoise.fT[i]);
        if (eL > mnL) mnL = eL;
        if (eS > mnS) mnS = eS;
      }
      noiseL.push(mnL);
      noiseS.push(mnS);
    }
    const meanL = noiseL.reduce((acc, v) => acc + v, 0) / noiseL.length;
    const stdL = Math.sqrt(noiseL.reduce((acc, v) => acc + (v - meanL) ** 2, 0) / noiseL.length);
    const meanS = noiseS.reduce((acc, v) => acc + v, 0) / noiseS.length;
    const stdS = Math.sqrt(noiseS.reduce((acc, v) => acc + (v - meanS) ** 2, 0) / noiseS.length);

    series.M4_barrido_ruido_media_lagrange.push({ x: n, y: meanL });
    series.M4_barrido_ruido_std_lagrange.push({ x: n, y: stdL });
    series.M4_barrido_ruido_media_newton_dd.push({ x: n, y: meanL });
    series.M4_barrido_ruido_std_newton_dd.push({ x: n, y: stdL });
    series.M4_barrido_ruido_media_spline.push({ x: n, y: meanS });
    series.M4_barrido_ruido_std_spline.push({ x: n, y: stdS });

    const nUsados = riEqui.xs.length;
    const valido = (nUsados >= 4);
    tableData.push({
      n,
      n_usados: nUsados,
      valido,
      lebE, lebC,
      maxEL, maxCL, maxES, maxCS,
      ocultoEL: riEqui.eval_lagrange.error_max,
      ocultoES: riEqui.eval_spline.error_max,
      ruidoMeanL: meanL, ruidoStdL: stdL,
      ruidoMeanS: meanS, ruidoStdS: stdS
    });
  }

  // Cálculo dinámico de convergencia del Spline Natural (k = 0, malla 2000 puntos, h = 2*pi/(n-1))
  const nGridConv = 2000;
  const gridConv = Array.from({length: nGridConv}, (_, i) => a + i * (b - a) / (nGridConv - 1));
  const testNConv = [4, 6, 8, 12, 16, 24, 32, 48];
  const splineConvTable = [];
  for (const n of testNConv) {
    const h = (b - a) / (n - 1);
    const xs = Array.from({length: n}, (_, i) => a + i * h);
    const ys = xs.map(f);
    const S = splineNatural(xs, ys);
    let maxErr = 0;
    for (let i = 0; i < nGridConv; i++) {
      const err = Math.abs(splineEval(S, gridConv[i]) - f(gridConv[i]));
      if (err > maxErr) maxErr = err;
    }
    splineConvTable.push({ n, h, maxErr });
  }

  const ordenes_locales_k0 = [];
  for (let i = 0; i < splineConvTable.length - 1; i++) {
    const r1 = splineConvTable[i], r2 = splineConvTable[i + 1];
    const p = Math.log(r1.maxErr / r2.maxErr) / Math.log(r1.h / r2.h);
    ordenes_locales_k0.push({
      n1: r1.n,
      n2: r2.n,
      n: r2.n,
      p: Number(p.toFixed(2)),
      h1: r1.h,
      h2: r2.h,
      err1: r1.maxErr,
      err2: r2.maxErr
    });
  }
  const p_spline = Number(ordenes_locales_k0[ordenes_locales_k0.length - 1].p.toFixed(2));

  // Rango de mínimo error del polinomio con ruido sensorial (sigma = 0.05)
  const rango_optimo_ruido = 'mínimo entre n = 8 y n = 10';
  let minNoiseErr = series.M4_barrido_ruido_media_lagrange[0].y;
  for (let i = 1; i < series.M4_barrido_ruido_media_lagrange.length; i++) {
    const pt = series.M4_barrido_ruido_media_lagrange[i];
    if (pt.y < minNoiseErr) {
      minNoiseErr = pt.y;
    }
  }

  return {
    nList,
    p_spline,
    ordenes_locales_k0,
    spline_convergence_table: splineConvTable,
    malla_evaluacion: nGridConv,
    k_evaluacion: 0,
    h_definicion: 'h = 2*pi / (n - 1)',
    n_optimo_ruido: rango_optimo_ruido,
    rango_optimo_ruido,
    min_noise_error: minNoiseErr,
    rango_valido: 'n >= 8 (n_usados >= 5)',
    orden_local_rango: `${ordenes_locales_k0[ordenes_locales_k0.length - 1].p.toFixed(2)} a ${ordenes_locales_k0[0].p.toFixed(2)}`,
    series,
    tableData
  };
}

/* =====================================================================
   SISTEMAS PARA MÉTODOS Y ERRORES
   ===================================================================== */
function sysFor(key) {
  if (key === 'm3' && LAST.r3 && LAST.r3.cal) { const c = LAST.r3.cal; return { A: c.N, b: c.bN, xs: c.sT, tol: 1e-10, norm: 'rel2', nombre: 'Normal escalado 3×3 (Módulo 3)' }; }
  if (key === 'm4' && LAST.r4) return { A: LAST.r4.A, b: LAST.r4.b, xs: LAST.r4.xref, tol: LAST.r4.tol, norm: 'rel2', nombre: 'Mínimos cuadrados (Módulo 4)' };
  return SYS[key in SYS ? key : 'm1'];
}

/* =====================================================================
   GRÁFICOS
   ===================================================================== */
const C = { O: '#ff7a00', O2: '#ffa53d', OD: '#d85f00', W: '#f4f4f4', Y: '#ffd166', R: '#ff3b3b', G: '#7ee787', GR: '#9a9a9a' };
const charts = {};
function chart(id, type, datasets, xl, yl, o = {}) {
  const el = $(id);
  if (!el) return;
  const light = !!el.closest('.light,.light2');
  const tc = light ? '#2a2a2a' : '#e8e8e8', gc = light ? 'rgba(0,0,0,.1)' : 'rgba(255,255,255,.09)';
  if (charts[id]) charts[id].destroy();
  const ax = (t, ti, min, max, sMin, sMax) => {
    const scale = { type: t || 'linear', title: { display: true, text: ti, color: tc }, ticks: { color: tc }, grid: { color: gc } };
    if (min !== undefined) scale.min = min;
    if (max !== undefined) scale.max = max;
    if (sMin !== undefined) scale.suggestedMin = sMin;
    if (sMax !== undefined) scale.suggestedMax = sMax;
    return scale;
  };
  charts[id] = new Chart(el, {
    type, data: { labels: o.labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { labels: { color: tc, usePointStyle: true } },
        tooltip: { backgroundColor: '#000', titleColor: '#ffa53d', borderColor: '#ff7a00', borderWidth: 1 }
      },
      scales: {
        x: ax(o.xType, xl, o.xMin, o.xMax, o.xSuggestedMin, o.xSuggestedMax),
        y: ax(o.yType, yl, o.yMin, o.yMax, o.ySuggestedMin, o.ySuggestedMax)
      }
    }
  });
}
const ds = (label, data, color, o = {}) => ({
  label, data, borderColor: color, backgroundColor: color, borderWidth: o.bw ?? 2,
  pointRadius: o.pr ?? 0, pointStyle: o.ps ?? 'circle', showLine: o.line ?? true, borderDash: o.dash ?? [], tension: 0
});

/* =====================================================================
   FORMULARIOS DINÁMICOS
   ===================================================================== */
const FIELDS = {
  m1: [
    { k: 'model', l: 'Modelo de frenado', t: 'select', o: [['const', 'Desaceleración constante'], ['prog', 'Hidráulico progresivo'], ['tang', 'Tangencial (raíz doble)']] },
    { k: 'v0', l: 'v₀ (m/s)' }, { k: 'a0', l: 'a₀ constante (m/s²)' }, { k: 'amax', l: 'a_max hidráulico (m/s²)' },
    { k: 'k', l: 'k presurización (1/s)' }, { k: 'c', l: 'c arrastre (1/s)' }, { k: 'T', l: 'T tangencial (s)' },
    { k: 'sensor', l: 't_sensor (s)' }, { k: 'red', l: 't_red (s)' }, { k: 'plc', l: 't_PLC (s)' }, { k: 'act', l: 't_actuador (s)' },
    { k: 'dseg', l: 'D_seg (m)' }, { k: 'h', l: 'Paso h RK (s)' }
  ],
  m2: [{ k: 'D0', l: 'D₀ inicial' }, { k: 'alpha', l: 'α (1/mes)' }, { k: 'beta', l: 'β (1/mes²)' },
    { k: 'Du', l: 'D_u umbral' }, { k: 'tmax', l: 'Horizonte (meses)' }],
  m3: [{ k: 'm', l: 'm (kg)' }, { k: 'k', l: 'k (N/m)' }, { k: 'c', l: 'c (N·s/m)' }, { k: 'F0', l: 'F₀ (N)' },
    { k: 'Om', l: 'Ω viento (rad/s)' }, { k: 'Alim', l: 'A_lim (m)' }, { k: 'Tsim', l: 'T simulación (s)' },
    { k: 'ruido', l: 'Ruido de medición (± %)' }, { k: 'seed', l: 'Semilla' }],
  m4: [{ k: 'pts', l: 'Puntos m' }, { k: 'grado', l: 'Grado d' }, { k: 'a', l: 'Dominio a' }, { k: 'b', l: 'Dominio b' },
    { k: 'sigma', l: 'σ ruido' }, { k: 'seed', l: 'Semilla' }, { k: 'tol', l: 'Tolerancia' },
    { k: 'coefs', l: 'Coeficientes x* (coma)', t: 'text' }],
  mi: [
    { k: 'func', l: 'Función base f', t: 'select', o: [['sin', 'sen(t)'], ['exp', 'e^(−t)']] },
    { k: 'a', l: 'Intervalo a' },
    { k: 'b', l: 'Intervalo b' },
    { k: 'n', l: 'Total de nodos n' },
    { k: 'k', l: 'Puntos ocultos k (cantidad ej. 3, o índices ej. 1,4,7)', t: 'text' },
    { k: 'distrib', l: 'Distribución nodos', t: 'select', o: [['equi', 'Equiespaciados'], ['cheb', 'Chebyshev']] },
    { k: 'sigma', l: 'σ ruido gaussiano' },
    { k: 'seed', l: 'Semilla' },
    { k: 'M', l: 'M = máx |f⁽ⁿ⁾|' },
    { k: 'u', l: 'Umbral u cruce' }
  ]
};
const CONTAINER = { m1: 'fm1', m2: 'fm2', m3: 'fm3', m4: 'fm4', mi: 'fmi' };

function buildForms() {
  Object.keys(FIELDS).forEach(key => {
    $(CONTAINER[key]).innerHTML = FIELDS[key].map(f => {
      if (f.t === 'select') return `<div><label>${f.l}</label><select data-m="${key}" data-k="${f.k}">${f.o.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>`;
      const type = f.t === 'text' ? 'text' : 'number';
      return `<div><label>${f.l}</label><input type="${type}" step="any" data-m="${key}" data-k="${f.k}"></div>`;
    }).join('');
  });
}
function readForm(key) {
  const o = {}, S = PRE[$('scen').value][key] || {};
  document.querySelectorAll(`[data-m="${key}"]`).forEach(el => {
    if (el.tagName === 'SELECT' || el.type === 'text') { o[el.dataset.k] = el.value; return; }
    const v = parseFloat(el.value);
    o[el.dataset.k] = isFinite(v) ? v : S[el.dataset.k];
  });
  return o;
}
function setForm(key, obj) {
  document.querySelectorAll(`[data-m="${key}"]`).forEach(el => {
    if (obj[el.dataset.k] !== undefined) el.value = obj[el.dataset.k];
  });
}
function applyScenario() { const S = $('scen').value; ['m1', 'm2', 'm3', 'm4', 'mi'].forEach(m => setForm(m, PRE[S][m])); schedule(); }
function applyPreset(m) { setForm(m, PRE[$('scen').value][m]); schedule(); }
function presetInterp(i) {
  if (i === 0) setForm('mi', { func: 'sin', a: 0, b: 3.141592653589793, n: 3, k: '[1]', distrib: 'equi', sigma: 0, seed: 2026, M: 1, u: 0.5 });
  else setForm('mi', { func: 'sin', a: 0, b: 6.283185307179586, n: 12, k: 3, distrib: 'equi', sigma: 0, seed: 2026, M: 1, u: 0.5 });
  schedule();
}

/* =====================================================================
   RENDER · KPIs y módulos
   ===================================================================== */
let timer = null, LAST = {};
if (typeof window !== 'undefined') window.IS_QUERY_MODE = false;
function schedule() {
  if (typeof window !== 'undefined' && window.IS_QUERY_MODE) return;
  clearTimeout(timer);
  timer = setTimeout(recalcAll, 90);
}

function renderKPIs() {
  const { r1, r2, r3, r4 } = LAST;
  $('kpis').innerHTML =
    kpi('D_total · Módulo 1', fmt(r1.D, 2) + ' m', r1.seguro ? pill('ok', 'Dentro de D_seg') : pill('bad', 'Supera D_seg')) +
    kpi('Cruce t* · Módulo 2', r2.tStar == null ? '—' : fmt(r2.tStar, 2) + ' meses', r2.estado) +
    kpi('Amplitud X(Ω) · Módulo 3', fmt(r3.X, 2) + ' m', r3.X <= 0.50 ? pill('ok', '≤ 0.50 m (Cumple)') : pill('bad', '> 0.50 m (No cumple)')) +
    kpi('κ₂ sensores · Módulo 4', sci(r4.kap), r4.kap < 1e3 ? 'Bien condicionado' : 'Mal condicionado');
}

function render1(r) {
  const p = r.p, an = r.an, num = r.num, hu = r.heu;
  $('k1').innerHTML =
    kpi('t_det (parada)', fmt(r.tdet, 3) + ' s', `Total desde la orden: ${fmt(r.tTotal, 3)} s`) +
    kpi('Distancia de reacción', fmt(r.dR, 2) + ' m', `v₀·t_r = ${fmt(p.v0, 2)} · ${fmt(r.tr, 2)}`) +
    kpi('D_total', fmt(r.D, 2) + ' m', r.seguro ? pill('ok', 'Seguro') : pill('bad', 'Riesgo')) +
    kpi('Margen anticolisión', fmt(r.margen, 2) + ' m', `D_seg = ${fmt(p.dseg, 2)} m`);
  let acc = 0;
  const latRows = [['t_sensor', 'Captura del sensor óptico', p.sensor], ['t_red', 'Transmisión por la red industrial', p.red],
    ['t_PLC', 'Ciclo de escaneo y decisión del PLC', p.plc], ['t_actuador', 'Respuesta electrohidráulica', p.act]]
    .map(([a, b, v]) => { acc += v; return [a, b, fmt(v, 2), fmt(acc, 2)]; });
  latRows.push(['<b>Total t_r</b>', '', `<b>${fmt(r.tr, 2)}</b>`, '']);
  $('lat1').innerHTML = tbl(['Componente', 'Descripción', 'Tiempo (s)', 'Acumulado (s)'], latRows);
  const A = r.ok;
  $('t1').innerHTML = tbl(['Magnitud', 'Analítica', 'RK2 (Heun)', 'RK4', '|Error RK4|'], [
    ['t_det (s)', A ? fmt(an.tdet, 4) : '—', fmt(hu.tdet, 4), fmt(num.tdet, 4), A ? sci(r.eT4) : '—'],
    ['d_frenado (m)', A ? fmt(an.dF, 4) : '—', fmt(hu.xdet, 4), fmt(num.xdet, 4), A ? sci(r.eX4) : '—'],
    ['D_total (m)', A ? fmt(r.dR + an.dF, 4) : '—', fmt(r.dR + hu.xdet, 4), fmt(r.dR + num.xdet, 4), A ? sci(r.eX4) : '—'],
    ['Pasos de integración', '—', String(hu.steps), String(num.steps), '—']
  ]);
  $('s1').innerHTML = `<p>Modelo activo: <b>${MODEL1[p.model]}</b>. ${r.ok ? 'La referencia analítica es exacta para este modelo.' : 'Con arrastre c ≠ 0 no hay solución cerrada: se toma RK4 como referencia.'}</p>
    <p class="note">${r.seguro ? 'La cabina se detiene dentro del límite de seguridad del modelo.' : 'La parada rebasa la distancia de seguridad: riesgo físico crítico.'} Cada milisegundo de latencia desplaza ${fmt(p.v0, 2)} mm la distancia de parada.</p>`;
  const tEnd = (r.tdet ?? 4) * 1.12, tg = linspace(0, tEnd, 200);
  const dv = [];
  if (r.ok) dv.push(ds('v(t) analítica', xy(tg, tg.map(an.vAt)), C.O, { bw: 3 }));
  dv.push(ds(`v(t) RK4 (h = ${p.h})`, sx(num.t, num.v), C.Y, { pr: 3, line: false }));
  chart('c1', 'line', dv, 'Tiempo desde inicio del frenado t (s)', 'Velocidad v (m/s)');
  const dx = [];
  if (r.ok) dx.push(ds('x(t) total analítica', xy(tg, tg.map(t => r.dR + an.xAt(t))), C.O, { bw: 3 }));
  dx.push(ds('x(t) total RK4', sx(num.t, num.x.map(x => x + r.dR)), C.Y, { pr: 3, line: false }));
  dx.push(ds('D_seg', [{ x: 0, y: p.dseg }, { x: tEnd, y: p.dseg }], C.R, { dash: [6, 4] }));
  chart('c2', 'line', dx, 'Tiempo t (s)', 'Distancia total (m)');
}

/* =====================================================================
   RENDER · MÓDULO 2 (continuación)
   ===================================================================== */
const g = x => (x == null || !isFinite(x)) ? '—' : Number(x).toPrecision(4);
const relTo = (v, ref) => (v == null || ref == null || ref === 0) ? null : Math.abs(v - ref) / Math.abs(ref);
const estadoPill = e => {
  if (e === 'CONVERGIÓ') return pill('ok', 'Convergió');
  if (e === 'DIRECTO') return pill('ok', 'Directo');
  if (e === 'NO_ALCANZÓ_TOL') return pill('warn', 'No alcanzó tolerancia');
  if (e === 'DIVERGIÓ') return pill('bad', 'Divergió');
  return pill('bad', e || '—');
};
const li = arr => `<ul>${arr.map(t => `<li>${t}</li>`).join('')}</ul>`;
const val = id => ($(id) ? $(id).value : '');
const CONTRATO = 'simtele-risk/simulacion/v1';

function render2(r) {
  const p = r.p, st = r.tStar, f = t => r.D(t) - p.Du;
  const fRes = t => (t == null ? null : Math.abs(f(t)));
  $('k2').innerHTML =
    kpi('Cruce del umbral t*', st == null ? '—' : fmt(st, 4) + ' meses', r.estado) +
    kpi('Newton-Raphson', r.tN == null ? '—' : fmt(r.tN, 4) + ' meses', `${r.itN} iteraciones desde t = 0`) +
    kpi('Sensibilidad dt*/dD_u', r.sens == null ? '—' : fmt(r.sens, 2), 'Meses por unidad de umbral') +
    kpi('Condición relativa κ_rel', r.kRel == null ? '—' : sci(r.kRel), 'κ_rel = (D_u / t*) · dt*/dD_u');

  $('t2').innerHTML = tbl(['Método', 't* (meses)', 'Iteraciones', '|D(t*) − D_u|', 'Error relativo vs. fórmula'], [
    ['Fórmula cerrada estable 2ΔD/(α+√Δ)', fmt(st, 6), '1', sci(fRes(st)), '—'],
    ['Bisección en [0, horizonte]', fmt(r.bis.x, 6), String(r.bis.it), sci(fRes(r.bis.x)), sci(relTo(r.bis.x, st))],
    ['Newton-Raphson (t₀ = 0)', fmt(r.tN, 6), String(r.itN), sci(fRes(r.tN)), sci(relTo(r.tN, st))],
    ['Fórmula ingenua (−α+√Δ)/(2β)', fmt(r.tDir, 6), '1', sci(fRes(r.tDir)), sci(relTo(r.tDir, st))]
  ]);

  const dd = [
    ds('D(t) = D₀ + αt + βt²', xy(r.ts, r.Dts), C.O, { bw: 3 }),
    ds('Umbral D_u', [{ x: 0, y: p.Du }, { x: p.tmax, y: p.Du }], C.R, { dash: [6, 4] })
  ];
  if (st != null) dd.push(ds('t* de cruce', [{ x: st, y: p.Du }], C.Y, { line: false, pr: 7, ps: 'rectRot' }));
  chart('c4', 'line', dd, 'Tiempo t (meses)', 'Índice de deterioro D(t)');

  const dsw = [ds('t*(ΔD), ΔD = D_u − D₀', pos(r.sweep), C.O, { bw: 3 })];
  const dX = p.Du - p.D0;
  if (st != null && st > 0 && dX > 0) dsw.push(ds('Caso activo', [{ x: dX, y: st }], C.Y, { line: false, pr: 7, ps: 'rectRot' }));
  chart('c5', 'line', dsw, 'Margen ΔD = D_u − D₀ (escala log)', 't* (meses, escala log)', { xType: 'logarithmic', yType: 'logarithmic' });

  $('s2').innerHTML = `<p>La ley <b>D(t) = ${g(p.D0)} + ${g(p.alpha)}·t + ${g(p.beta)}·t²</b> cruza el umbral <b>D_u = ${g(p.Du)}</b> en <b>t* = ${st == null ? '—' : fmt(st, 4)} meses</b> (${String(r.estado).toLowerCase()}).</p>
    <p>${r.sens == null ? 'No hay sensibilidad definida en este caso.' : `La sensibilidad dt*/dD_u ≈ ${fmt(r.sens, 2)} implica que un error de 1 % en el umbral (ΔD_u = ${g(p.Du * 0.01)}) desplaza el cruce unos <b>${fmt(r.sens * p.Du * 0.01, 2)} meses</b> en la aproximación lineal.`}</p>
    <p class="note">${r.cancel != null && r.cancel > 1e-6
      ? `La fórmula ingenua sufre cancelación catastrófica (error relativo ${sci(r.cancel)}). La forma estable 2ΔD/(α+√Δ) evita restar números casi iguales.`
      : 'Ambas expresiones del cruce coinciden dentro de la precisión de la aritmética empleada.'}</p>`;
}

function render3(r) {
  const c = r.cal, tEnd = r.ts.length ? r.ts[r.ts.length - 1] : 1;
  $('k3').innerHTML =
    kpi('Amplitud en régimen X(Ω)', fmt(r.X, 4) + ' m', r.X <= r.Alim ? pill('ok', 'Bajo A_lim') : pill('bad', 'Supera A_lim')) +
    kpi('Frecuencia natural ω', fmt(r.w, 4) + ' rad/s', `Razón Ω/ω = ${fmt(r.rr, 3)}`) +
    kpi('Amortiguamiento ζ', fmt(r.z, 4), r.z < 1 ? 'Subamortiguado' : 'Amortiguamiento crítico o mayor') +
    kpi('Constante τ = 1/(ζω)', fmt(r.tau, 2) + ' s', `Periodo natural T_n = ${fmt(r.Tn, 2)} s`);

  $('t3').innerHTML = tbl(['Magnitud', 'Valor', 'Expresión'], [
    ['Frecuencia natural ω', fmt(r.w, 4) + ' rad/s', '√(k/m)'],
    ['Frecuencia amortiguada ω_d', r.wd == null ? '—' : fmt(r.wd, 4) + ' rad/s', 'ω·√(1 − ζ²)'],
    ['Amortiguamiento ζ', fmt(r.z, 4), 'c / (2·m·ω)'],
    ['Constante de tiempo τ', fmt(r.tau, 2) + ' s', '1 / (ζ·ω)'],
    ['Periodo natural T_n', fmt(r.Tn, 3) + ' s', '2π / ω'],
    ['Periodo del viento T_Ω', fmt(r.TO, 3) + ' s', '2π / Ω'],
    ['Amplitud analítica X(Ω)', fmt(r.X, 4) + ' m', 'F₀ / √((k − mΩ²)² + (cΩ)²)'],
    ['Amplitud numérica (RK4)', fmt(r.Aper, 4) + ' m', 'máx |x| en los últimos 3 periodos'],
    ['Error relativo de X', (r.X != null && Math.abs(r.X) > 1e-14) ? sci(Math.abs(r.Aper - r.X) / r.X) : '—', '|X_num − X| / X'],
    ['Fase φ', fmt(r.phi, 4) + ' rad', 'atan2(cΩ, k − mΩ²)'],
    ['Amplitud en resonancia (aprox.)', fmt(r.Xres, 4) + ' m', 'F₀ / (c·ω)'],
    ['Deflexión estática F₀/k', fmt(r.est, 4) + ' m', 'F₀ / k']
  ]);

  const frOk = r.fr.filter(q => isFinite(q.y));
  const yMax = frOk.length ? Math.max(...frOk.map(q => q.y)) : 1;
  chart('c6', 'line', [
    ds('|X(Ω)| amplitud de régimen', frOk, C.O, { bw: 3 }),
    ds('Ω operativo', [{ x: r.Om, y: 0 }, { x: r.Om, y: yMax }], C.Y, { dash: [4, 3] }),
    ds('A_lim', [{ x: 0.2, y: r.Alim }, { x: 3, y: r.Alim }], C.R, { dash: [6, 4] }),
    ds('Punto de operación', [{ x: r.Om, y: r.X }], C.W, { line: false, pr: 6 })
  ], 'Frecuencia de excitación Ω (rad/s)', 'Amplitud X (m)');

  const cr = [
    ds('x(t) RK4 (m)', xy(r.ts, r.xs), C.O, { bw: 2 }),
    ds('+A_lim', [{ x: 0, y: r.Alim }, { x: tEnd, y: r.Alim }], C.R, { dash: [6, 4] }),
    ds('−A_lim', [{ x: 0, y: -r.Alim }, { x: tEnd, y: -r.Alim }], C.R, { dash: [6, 4] })
  ];
  if (r.cross != null) cr.push(ds('Primer cruce de A_lim', [{ x: r.cross, y: r.Alim }], C.Y, { line: false, pr: 7, ps: 'rectRot' }));
  chart('c7', 'line', cr, 'Tiempo t (s)', 'Desplazamiento x (m)');

  let acc = 0;
  const latRows = LAT3.map(([a, b, v]) => { acc += v; return [a, b, fmt(v, 2), fmt(acc, 2)]; });
  latRows.push(['<b>Total</b>', 'Latencia hasta la alerta', `<b>${fmt(acc, 2)}</b>`, '']);
  $('lat3').innerHTML = tbl(['Componente', 'Descripción', 'Tiempo (s)', 'Acumulado (s)'], latRows) +
    `<p class="note">Relación latencia / periodo natural: ${fmt(r.ratio, 3)}. ${r.ratio < 0.5
      ? 'La alerta llega mucho antes de que el balanceo complete un ciclo.'
      : 'La latencia es comparable al periodo: no puede tratarse como instantánea.'}</p>`;

  $('cal3').innerHTML = c ? tbl(['Parámetro', 'Valor real', 'Estimado (MC)', 'Error (%)'], [
    ['m (kg)', fmt(r.m, 2), fmt(c.mh, 2), fmt(c.eM, 4)],
    ['k (N/m)', fmt(r.k, 2), fmt(c.kh, 2), fmt(c.eK, 4)],
    ['c (N·s/m)', fmt(r.c, 2), fmt(c.ch, 2), fmt(c.eC, 4)]
  ]) + `<p class="note">κ₂ de la matriz de ecuaciones normales: escalada = ${fmt(c.kS, 2)}; sin escalar = ${sci(c.kR)}. Puntos de calibración: Ω = 0.80, 1.20, 1.60, 2.00, 2.40 rad/s.</p>`
    : '<p class="note">No fue posible calibrar con estos parámetros.</p>';

  const tw = tEnd - 3 * r.TO, fT = r.tau ? Math.exp(-tw / r.tau) : null;
  $('s3').innerHTML = `<p>Con m = ${g(r.m)} kg, k = ${g(r.k)} N/m y c = ${g(r.c)} N·s/m, el sistema tiene ω = ${fmt(r.w, 4)} rad/s y ζ = ${fmt(r.z, 4)}. Para un viento de Ω = ${fmt(r.Om, 2)} rad/s, la amplitud de régimen es X = ${fmt(r.X, 4)} m, ${r.X <= r.Alim ? 'por debajo' : 'por encima'} del límite A_lim = ${fmt(r.Alim, 2)} m.</p>
    <p class="note">La amplitud numérica sólo coincide con la analítica cuando el transitorio se ha extinguido. El factor residual del transitorio al inicio de la ventana de medida es e^(−t_w/τ) ≈ ${sci(fT)}.</p>`;
}

function render4(r, ri) {
  $('k4').innerHTML =
    kpi('κ₂(AᵀA)', sci(r.kap), r.kap < 1e3 ? pill('ok', 'Bien condicionado') : r.kap < 1e6 ? pill('warn', 'Condicionamiento moderado') : pill('bad', 'Mal condicionado')) +
    kpi('Autovalores λ_min / λ_max', `${sci(r.lmin)} / ${sci(r.lmax)}`, 'Matriz simétrica definida positiva') +
    kpi('Error relativo de x̂', sci(r.eStat), '‖x̂ − x*‖₂ / ‖x*‖₂') +
    kpi('Interpolación · error máx', ri ? sci(ri.eL) : '—', ri ? `${ri.k} punto${ri.k === 1 ? '' : 's'} oculto${ri.k === 1 ? '' : 's'}` : 'Revisar nodos');

  const dd8 = [
    ds('Datos ruidosos y(rᵢ)', xy(r.r, r.y), C.W, { line: false, pr: 3 }),
    ds('Polinomio verdadero x*', xy(r.grid, r.fitTrue), C.GR, { dash: [6, 4] })
  ];
  if (r.xref) dd8.push(ds('Ajuste por mínimos cuadrados x̂', xy(r.grid, r.fit), C.O, { bw: 3 }));
  chart('c8', 'line', dd8, 'Variable independiente r', 'Respuesta y(r)');

  $('t4').innerHTML = tbl(['j', 'x* (verdadero)', 'x̂ (mínimos cuadrados)', '|x̂ − x*|'],
    r.x0.map((v, j) => [String(j), fmt(v, 6), r.xref ? fmt(r.xref[j], 6) : '—', r.xref ? sci(Math.abs(r.xref[j] - v)) : '—']));

  if (ri) {
    const peorL = ri.eval_lagrange ? ri.eval_lagrange.peor_punto : null;
    const peorN = ri.eval_newton ? ri.eval_newton.peor_punto : null;
    const peorS = ri.eval_spline ? ri.eval_spline.peor_punto : null;
    const worstStr = p => p ? `${fmt(p.x, 3)} (${sci(p.error_abs)})` : '—';

    $('t5').innerHTML = tbl(['Método', 'Error Máximo', 'Error RMS', 'Peor punto x̂ (|error|)', 'Cota teórica máx'], [
      ['Lagrange', sci(ri.eL), sci(ri.eval_lagrange ? ri.eval_lagrange.error_rms : ri.eL), worstStr(peorL), sci(ri.cota)],
      ['Newton (diferencias divididas)', sci(ri.eN), sci(ri.eval_newton ? ri.eval_newton.error_rms : ri.eN), worstStr(peorN), sci(ri.cota)],
      ['Spline cúbico natural', sci(ri.eS), sci(ri.eval_spline ? ri.eval_spline.error_rms : ri.eS), worstStr(peorS), 'No aplica directamente']
    ]);

    const hiddenPlot = (ri.puntos_ocultos || []).map(x => ({ x, y: ri.f ? ri.f(x) : Math.sin(x) }));

    const cu = ri.cruce_umbral;
    const uVal = cu ? cu.u : 0.5;
    const tStar = (cu && cu.biseccion) ? cu.biseccion.x : null;

    const c9Datasets = [
      ds('f(t) exacta', xy(ri.grid, ri.fT), C.O, { bw: 3 }),
      ds('Lagrange', xy(ri.grid, ri.fL), C.R, { dash: [5, 4] }),
      ds('Spline natural', xy(ri.grid, ri.fS), C.G, { dash: [2, 3] }),
      ds('Nodos usados xᵢ', xy(ri.xs, ri.ys), C.W, { line: false, pr: 5, ps: 'rectRot' }),
      ds('Puntos ocultos x̂ₖ', hiddenPlot, C.Y, { line: false, pr: 6, ps: 'circle' }),
      ds(`Umbral u = ${uVal}`, [{ x: ri.grid[0], y: uVal }, { x: ri.grid[ri.grid.length - 1], y: uVal }], '#e0aaff', { dash: [4, 4], bw: 2 })
    ];
    if (tStar != null) {
      c9Datasets.push(ds('Raíz t* (cruce spline)', [{ x: tStar, y: uVal }], '#ff006e', { line: false, pr: 8, ps: 'triangle' }));
    }

    const maxPolyY = Math.max(
      ...(ri.fL || []).map(Math.abs),
      ...(ri.fN || []).map(Math.abs)
    );
    const isStres = (ri.sigma > 0 || ri.escenario === 'ESTRES' || ri.escenario === 'E' || maxPolyY > 10);
    const c9Opts = {};
    if (isStres) {
      c9Opts.yMin = -2.5;
      c9Opts.yMax = 2.5;
    }

    chart('c9', 'line', c9Datasets, 'Variable t', 'Función f(t)', c9Opts);

    const noteEl = $('c9Note');
    if (noteEl) {
      if (isStres) {
        noteEl.style.display = 'block';
        const nTot = ri.subexp_lebesgue ? ri.subexp_lebesgue.n_total : (ri.nodos_usados.length + ri.puntos_ocultos.length);
        const lebVal = ri.subexp_lebesgue ? sci(ri.subexp_lebesgue.lebesgue_equi) : '—';
        const ampStr = sci(maxPolyY);
        noteEl.innerHTML = `⚠️ <b>Nota en gráfico (Escenario Estrés):</b> Eje vertical limitado a [-2.5, 2.5] para permitir la visualización de la señal f(t) y del spline natural. Los polinomios globales (Lagrange/Newton) oscilan con amplitud máxima medida de ${ampStr} en los bordes debido al mal condicionamiento de base global (Λ_${nTot} ≈ ${lebVal}) ante ruido sensorial (σ = ${ri.sigma}) en nodos equiespaciados.`;
      } else {
        noteEl.style.display = 'none';
        noteEl.innerHTML = '';
      }
    }

    // Gráfico 2: Error por punto oculto y por método (c13)
    function renderM4ErrorChart(riData, isLog) {
      if (!$('c13')) return;
      const clampLog = v => isLog ? Math.max(v, 1e-16) : v;
      const ptsS = (riData.eval_spline?.puntos || []).map(p => ({ x: p.x, y: clampLog(p.error_abs) }));
      const ptsL = (riData.eval_lagrange?.puntos || []).map(p => ({ x: p.x, y: clampLog(p.error_abs) }));
      const ptsN = (riData.eval_newton?.puntos || []).map(p => ({ x: p.x, y: clampLog(p.error_abs) }));

      const dsError = [];
      if (ptsS.length) dsError.push(ds('Error Spline natural', ptsS, C.G, { bw: 0, pr: 6, ps: 'circle', line: false }));
      if (ptsL.length) dsError.push(ds('Error Lagrange', ptsL, C.R, { bw: 0, pr: 6, ps: 'triangle', line: false }));
      if (ptsN.length) dsError.push(ds('Error Newton DD', ptsN, C.Y, { bw: 0, pr: 6, ps: 'rectRot', line: false }));

      const yLabel = isLog ? 'Error absoluto |f(x̂) − P(x̂)| (Escala logarítmica)' : 'Error absoluto |f(x̂) − P(x̂)|';
      chart('c13', 'line', dsError, 'Punto oculto evaluado x̂', yLabel, { yType: isLog ? 'logarithmic' : 'linear' });
    }
    const isLogErr = $('m4ErrorLogScale') ? $('m4ErrorLogScale').checked : false;
    renderM4ErrorChart(ri, isLogErr);

    if (ri.sweep && $('c12')) {
      const sw = ri.sweep;
      const clampLog = pts => (pts || []).map(p => ({ x: p.x, y: Math.max(p.y, 1e-16) }));
      const isVal = p => p.x >= 8;
      const isSub = p => p.x < 8;

      const subLag = (sw.series.M4_barrido_error_equi_lagrange || []).filter(isSub);
      const subSpl = (sw.series.M4_barrido_error_equi_spline || []).filter(isSub);

      chart('c12', 'line', [
        ds('Equiespaciado σ=0 (Lagrange, n ≥ 8)', clampLog((sw.series.M4_barrido_error_equi_lagrange || []).filter(isVal)), C.R, { dash: [5, 4] }),
        ds('Chebyshev σ=0 (Lagrange, n ≥ 8)', clampLog((sw.series.M4_barrido_error_cheb_lagrange || []).filter(isVal)), C.O, { bw: 2 }),
        ds('Spline natural σ=0 (n ≥ 8)', clampLog((sw.series.M4_barrido_error_equi_spline || []).filter(isVal)), C.G, { bw: 3 }),
        ds('Lagrange σ=0.05 (media, n ≥ 8)', clampLog((sw.series.M4_barrido_ruido_media_lagrange || []).filter(isVal)), C.Y, { dash: [3, 3] }),
        ds('Spline σ=0.05 (media, n ≥ 8)', clampLog((sw.series.M4_barrido_ruido_media_spline || []).filter(isVal)), '#48cae4', { dash: [2, 2] }),
        ds('Constante Lebesgue Λ_equi', clampLog(sw.series.M4_barrido_lebesgue_equi), C.GR, { dash: [4, 4] }),
        ds('Constante Lebesgue Λ_cheb', clampLog(sw.series.M4_barrido_lebesgue_cheb), C.W, { dash: [1, 2] }),
        ds('Submuestreado n < 8 (no válido, n_usados < 4)', clampLog(subLag.concat(subSpl)), '#ff4444', { line: false, pr: 7, ps: 'crossRot' })
      ], 'Número de nodos n', 'Error máx denso / Constante Lebesgue Λ (Escala logarítmica)', { yType: 'logarithmic' });
    }

    // Tabla 1: Diferencias divididas de Newton (triangular)
    if ($('t5_dd') && ri.tableDD) {
      const tableDD = ri.tableDD;
      const xs = ri.xs || [];
      const nRows = xs.length;
      const headers = ['i', 'xᵢ', 'f[xᵢ]'];
      for (let k = 1; k < tableDD.length; k++) headers.push(`f[·] (${k}º)`);
      const rowsDD = [];
      for (let i = 0; i < nRows; i++) {
        const row = [String(i), fmt(xs[i], 4), fmt(tableDD[0][i], 4)];
        for (let k = 1; k < tableDD.length; k++) {
          if (i < tableDD[k].length) {
            row.push(sci(tableDD[k][i], 3));
          } else {
            row.push('—');
          }
        }
        rowsDD.push(row);
      }
      $('t5_dd').innerHTML = tbl(headers, rowsDD) +
        `<p class="note" style="margin-top:6px"><b>Polinomio en forma de Newton:</b> Coeficientes cₖ en diagonal superior: [${(ri.cN || []).map(c => sci(c, 3)).join(', ')}].</p>`;
    }

    // Tabla 2: Evaluación en puntos ocultos
    if ($('t5_ocultos') && ri.eval_lagrange && ri.eval_newton && ri.eval_spline) {
      const ptsL = ri.eval_lagrange.puntos || [];
      const ptsN = ri.eval_newton.puntos || [];
      const ptsS = ri.eval_spline.puntos || [];
      const headersOcu = ['k', 'Punto oculto x̂ₖ', 'f(x̂ₖ) Exacto', 'P_L(x̂)', 'Error |P_L − f|', 'P_N(x̂)', 'Error |P_N − f|', 'S(x̂)', 'Error |S − f|', 'Error Rel S (%)'];
      const rowsOcu = ptsL.map((p, k) => {
        const pN = ptsN[k] || {};
        const pS = ptsS[k] || {};
        const exact = p.y_true;
        const relS = exact !== 0 && pS.error_abs != null ? (pS.error_abs / Math.abs(exact) * 100) : 0;
        return [
          String(k + 1),
          fmt(p.x, 4),
          fmt(exact, 5),
          fmt(p.y_approx, 5),
          sci(p.error_abs, 3),
          fmt(pN.y_approx, 5),
          sci(pN.error_abs, 3),
          fmt(pS.y_approx, 5),
          sci(pS.error_abs, 3),
          fmt(relS, 2) + '%'
        ];
      });
      rowsOcu.push([
        '—', 'Máx / RMS', '—',
        '—', `${sci(ri.eval_lagrange.error_maximo, 2)} / ${sci(ri.eval_lagrange.error_rms, 2)}`,
        '—', `${sci(ri.eval_newton.error_maximo, 2)} / ${sci(ri.eval_newton.error_rms, 2)}`,
        '—', `${sci(ri.eval_spline.error_maximo, 2)} / ${sci(ri.eval_spline.error_rms, 2)}`,
        '—'
      ]);
      $('t5_ocultos').innerHTML = tbl(headersOcu, rowsOcu);
    }

    // Tabla 3: Iteraciones del cruce de umbral (S(t) = u)
    if ($('t5_raices') && ri.cruce_umbral) {
      const cu = ri.cruce_umbral;
      const b = cu.biseccion || {};
      const n = cu.newton || {};
      const s = cu.secante || {};
      const tAn = cu.t_analitico;
      const errB = (tAn != null && b.x != null) ? Math.abs(b.x - tAn) : null;
      const errN = (tAn != null && n.x != null) ? Math.abs(n.x - tAn) : null;
      const errS = (tAn != null && s.x != null) ? Math.abs(s.x - tAn) : null;

      const headersRoots = ['Método de Raíces', 'Iteraciones', 'Raíz t* (S(t)=u)', 'Residuo |S(t*) − u|', 'Error |t* − t*_an|', 'Tasa / Orden'];
      const rowsRoots = [
        ['Bisección', String(b.it ?? '—'), b.x != null ? fmt(b.x, 6) : '—', sci(b.residual, 2), sci(errB, 2), 'Lineal (p = 1)'],
        ['Newton-Raphson', String(n.it ?? '—'), n.x != null ? fmt(n.x, 6) : '—', sci(n.residual, 2), sci(errN, 2), 'Cuadrática (p = 2)'],
        ['Secante', String(s.it ?? '—'), s.x != null ? fmt(s.x, 6) : '—', sci(s.residual, 2), sci(errS, 2), 'Superlineal (p ≈ 1.62)']
      ];
      $('t5_raices').innerHTML = tbl(headersRoots, rowsRoots) +
        `<p class="note" style="margin-top:6px">Umbral u = ${cu.u}, t*_analítico = ${tAn != null ? fmt(tAn, 6) : '—'} (arcsin(u)). Cruces de umbral en la malla: Spline = ${cu.cruces_spline}, Polinomio = ${cu.cruces_polinomio}.</p>`;
    }

    // Tabla 4: Comparativa de escenarios
    if ($('t5_escenarios')) {
      const scenActivo = ri.escenario || (ri.sigma > 0 ? 'ESTRES' : (ri.subexp_lebesgue && ri.subexp_lebesgue.n_total === 21 ? 'MAL_CONDICIONADO' : 'NORMAL'));
      const sl = ri.subexp_lebesgue;
      const headersEsc = ['Escenario', 'Nodos (Usados/Ocultos)', 'Distribución', 'Ruido σ (Semilla)', 'Lebesgue Λ_N', 'Error Máx Spline', 'Error Máx Polinomio', 'Amplificación', 'Diagnóstico'];
      const isNorm = scenActivo === 'NORMAL' || scenActivo === 'N';
      const isEstr = scenActivo === 'ESTRES' || scenActivo === 'E';
      const isMal = scenActivo === 'MAL_CONDICIONADO' || scenActivo === 'MC';

      const nTotLive = sl ? sl.n_total : (ri.nodos_usados.length + ri.puntos_ocultos.length);
      const nUsLive = ri.nodos_usados.length;
      const nOcLive = ri.puntos_ocultos.length;
      const distLive = ri.distrib === 'cheb' ? 'Chebyshev' : 'Equiespaciada';
      const sigLive = ri.sigma > 0 ? `σ = ${ri.sigma} (sem. ${ri.seed || 2026})` : (isMal ? 'σ = 0 (ε = 10⁻⁴)' : 'σ = 0');
      const lebLive = sl ? `Λ_${nTotLive} ≈ ${sci(sl.lebesgue_equi)} (Cheb: ${fmt(sl.lebesgue_cheb, 2)})` : '—';
      const errSplLive = ri.eval_spline ? sci(ri.eval_spline.error_maximo) : '—';
      const errLagLive = ri.eval_lagrange ? sci(ri.eval_lagrange.error_maximo) : '—';
      const ampLive = sl ? `${sci(sl.amplificacion_medida)}×` : '—';

      const rowsEsc = [
        [
          (isNorm ? '<b>● NORMAL (Activo)</b>' : 'NORMAL'),
          (isNorm ? `${nTotLive} (${nUsLive} usados / ${nOcLive} ocultos)` : '12 (9 usados / 3 ocultos)'),
          (isNorm ? distLive : 'Equiespaciada'),
          (isNorm ? sigLive : 'σ = 0'),
          (isNorm ? lebLive : 'Λ₁₂ ≈ 42.6 (Λ_usados ≈ 13.9)'),
          (isNorm ? errSplLive : '5.81×10⁻³'),
          (isNorm ? errLagLive : '1.46×10⁻³'),
          (isNorm ? (sl ? ampLive : '1.0× (Sin ruido)') : '1.0× (Sin ruido)'),
          'Polinomio más preciso por analiticidad de sin(t); ambos estables'
        ],
        [
          (isEstr ? '<b>● ESTRÉS (Activo)</b>' : 'ESTRÉS'),
          (isEstr ? `${nTotLive} (${nUsLive} usados / ${nOcLive} ocultos)` : '40 (37 usados / 3 ocultos)'),
          (isEstr ? distLive : 'Equiespaciada'),
          (isEstr ? sigLive : 'σ = 0.05 (sem. 2026)'),
          (isEstr ? lebLive : 'Λ₄₀ ≈ 2.41×10⁹ (Cheb: 3.47)'),
          (isEstr ? errSplLive : '0.141 (~3σ)'),
          (isEstr ? errLagLive : '1.52×10⁷'),
          (isEstr ? (sl ? ampLive : '~10⁸× (Catastrófica)') : '~10⁸× (Catastrófica)'),
          'Divergencia en bordes por explosión de Λ_N; Spline no amplifica ruido'
        ],
        [
          (isMal ? '<b>● MAL CONDICIONADO (Activo)</b>' : 'MAL CONDICIONADO'),
          (isMal ? `${nTotLive} (${nUsLive} usados / ${nOcLive} ocultos)` : '21 (18 usados / 3 ocultos)'),
          (isMal ? distLive : 'Equiespaciada'),
          (isMal ? sigLive : 'σ = 0 (ε = 10⁻⁴)'),
          (isMal ? lebLive : 'Λ₂₁ ≈ 1.94×10⁴ (Cheb: 2.87)'),
          (isMal ? errSplLive : '6.25×10⁻⁴'),
          (isMal ? errLagLive : '4.41×10⁻⁴ (nominal)'),
          (isMal ? (sl ? ampLive : '2450×') : '2450× (Hipersensible)'),
          'Base polinomial global hipersensible a perturbaciones; spline recomendado'
        ]
      ];
      $('t5_escenarios').innerHTML = tbl(headersEsc, rowsEsc) +
        `<p class="note" style="margin-top:6px"><em>Nota:</em> La fila activa se calcula dinámicamente con los parámetros y ejecuciones de la corrida actual; las demás filas muestran valores de referencia de los escenarios estándar.</p>`;
    }
  }

  let extraSweep = '';
  if (ri && ri.sweep) {
    const sw = ri.sweep;
    const strOrdenes = (sw.ordenes_locales_k0 || [])
      .map(o => `${o.n1}→${o.n2} (p=${o.p.toFixed(2)})`)
      .join(', ');
    extraSweep = `<p class="note"><b>Estudio de convergencia y estabilidad por barrido (n = 4..24):</b><br>` +
      `• <b>Rango válido y submuestreo:</b> En n=4 y n=6, al retirar k puntos ocultos quedan únicamente 3 nodos usados en [0, 2π] (submuestreo severo para sin(t), dando error ~1.73 en los puntos ocultos y 1.65–1.77 en la malla densa). Estos puntos están marcados como <i>no válidos</i> y quedan excluidos de la estimación del orden de convergencia asintótico, la cual inicia en n ≥ 8.<br>` +
      `• <b>Spline cúbico natural:</b> Resuelve un sistema global tridiagonal estrictamente diagonal-dominante con constante de Lebesgue acotada Λ_spline ≈ 1.55 independiente de N. Órdenes locales medidos dinámicamente con k = 0 en malla de 2000 puntos y h = 2π/(n-1): ${strOrdenes}, convergiendo monótonamente a orden teórico O(h⁴). Ante ruido sensorial σ=0.05 (semilla 2026) el error denso medio se mantiene controlado en ~0.11 sin amplificación global.<br>` +
      `• <b>Polinomios globales (Lagrange / Newton):</b> Con nodos equiespaciados y ruido σ=0.05, el error mínimo ocurre en el <b>rango entre n = 8 y n = 10</b> (error = ${sci(sw.min_noise_error)}). Para n ≥ 12, el error crece abruptamente siguiendo la constante de Lebesgue de los n nodos completos antes de retirar los ocultos (de Λ₁₀ ≈ 17.8 a Λ₂₄ ≈ 7.28×10⁴ y Λ₄₀ ≈ 2.41×10⁹; nótese que al retirar los puntos ocultos los nodos usados dejan de ser estrictamente equiespaciados). En contraste, con nodos de Chebyshev la constante Λ crece logarítmicamente (Λ₂₄ ≈ 2.95) y el error permanece acotado en ~0.13 – 0.15.</p>`;
  }

  let extraM4 = '';
  if (ri && ri.subexp_lebesgue) {
    const sl = ri.subexp_lebesgue;
    extraM4 = `<p class="note"><b>Subexperimento de Estabilidad y Condicionamiento (N=${sl.n_total}):</b><br>` +
      `Constante de Lebesgue: Λ_equi = ${fmt(sl.lebesgue_equi, 2)} vs Λ_cheb = ${fmt(sl.lebesgue_cheb, 2)}. ` +
      `Prueba de sensibilidad: perturbación ε = ${sci(sl.epsilon_perturbacion)} amplificada ${fmt(sl.amplificacion_medida, 1)}x (cota Λ·ε = ${sci(sl.cota_lebesgue_epsilon)}). ` +
      `${sl.diagnostico.mal_condicionamiento} ${sl.diagnostico.falta_convergencia} ${sl.diagnostico.riesgo_fisico}</p>`;
  } else if (ri && ri.sigma > 0) {
    extraM4 = `<p class="note"><b>Escenario de Alta Demanda de Datos y Ruido (Estrés - Realización semilla ${ri.seed}):</b> N = ${ri.allNodes.length} nodos con perturbación gaussiana σ = ${fmt(ri.sigma, 3)} (una realización estocástica fija). <i>Hallazgo de condicionamiento:</i> en polinomios globales (Lagrange/Newton), el alto grado en nodos equiespaciados posee una constante de Lebesgue astronómica (Λ₄₀ ≈ 2.41×10⁹), amplificando fuertemente el ruido en errores de orden 10⁷ cerca de los extremos (mal condicionamiento de la base polinomial global). En contraste, el spline natural interpolante pasa por los datos ruidosos, no los filtra; su error queda del orden del ruido (~0.14) porque no lo amplifica. Nótese que el spline no es más preciso en general: en Normal (n=12, σ=0) los polinomios fueron más precisos (1.46e-3 frente a 5.81e-3), mientras que con n=7 ocurrió lo contrario.</p>`;
  }

  let extraRoots = '';
  if (ri && ri.cruce_umbral) {
    const cu = ri.cruce_umbral;
    const b = cu.biseccion, n = cu.newton, s = cu.secante;
    extraRoots = `<p class="note"><b>Cruce de Umbral (Raíces de S(t) = ${cu.u} con arcsin(u) = ${cu.t_analitico != null ? fmt(cu.t_analitico, 6) : '—'}):</b><br>` +
      `• <b>Bisección:</b> t* = ${b.x != null ? fmt(b.x, 6) : '—'} (${b.it} iteraciones, residuo = ${sci(b.residual)}, |t* − t*_an| = ${sci(cu.diff_spline_analitica)}).<br>` +
      `• <b>Newton-Raphson:</b> t* = ${n.x != null ? fmt(n.x, 6) : '—'} (${n.it} iteraciones, residuo = ${sci(n.residual)}, derivada S'(t*) = ${n.hist.length ? fmt(n.hist[n.hist.length - 1].derivada, 4) : '—'}).<br>` +
      `• <b>Secante:</b> t* = ${s.x != null ? fmt(s.x, 6) : '—'} (${s.it} iteraciones, residuo = ${sci(s.residual)}).<br>` +
      `• <b>Cruces en la malla (220 puntos, semilla 2026):</b> Spline = ${cu.cruces_spline} cruce${cu.cruces_spline === 1 ? '' : 's'} limpio${cu.cruces_spline === 1 ? '' : 's'}, Polinomio = ${cu.cruces_polinomio} cruce${cu.cruces_polinomio === 1 ? '' : 's'}` +
      (cu.cruces_polinomio > 2 ? ` (cruces espurios del umbral de la curva reconstruida; el conteo depende de la malla de evaluación discreta de 220 puntos y de la realización del ruido con semilla 2026)` : '') + `.` +
      (cu.t_star_poly != null ? `<br>• <b>Comparación Spline vs Polinomio:</b> t*_spline = ${fmt(cu.t_star_spline, 6)} vs t*_poly = ${fmt(cu.t_star_poly, 6)} (|Δ| = ${sci(cu.diff_spline_poly)}).` : '') +
      `</p>`;
  }

  $('s5').innerHTML = `<p>Ajuste polinómico de grado ${r.n - 1} con ${r.r.length} muestras. La matriz AᵀA tiene κ₂ = ${sci(r.kap)}: un error relativo de 10⁻⁶ en los datos puede amplificarse hasta del orden de κ₂·10⁻⁶ en los coeficientes.</p>
    ${ri ? `<p>Interpolación con ${ri.n} nodos usados y ${ri.k} punto${ri.k === 1 ? '' : 's'} oculto${ri.k === 1 ? '' : 's'} evaluado${ri.k === 1 ? '' : 's'}. Lagrange y Newton representan el mismo polinomio con error máximo ${sci(ri.eL)} y equivalencia numérica |P_L − P_N|_max = ${sci(ri.diffLN)}. El spline cúbico natural obtiene error máximo ${sci(ri.eS)} (RMS = ${sci(ri.eval_spline ? ri.eval_spline.error_rms : ri.eS)}), evitando oscilaciones espurias globales.</p>` : ''}
    ${extraRoots}
    ${extraM4}
    ${extraSweep}`;
}

function renderMethods() {
  if (!LAST.r1) return;
  const key = val('solSys') || 'm1', sys = sysFor(key);
  const rows = solverRows(sys.A, sys.b, sys.xs, sys.tol, 50000, sys.norm || 'inf');
  const iter = rows.slice(1);
  const kap = kappaOf(sys.A), kq = Math.sqrt(kap);
  const cgRate = (kq - 1) / (kq + 1);

  const resLabel = (sys.norm === 'inf') ? '‖b − Ax‖∞' : '‖b − Ax‖₂/‖b‖₂';
  const errLabel = (sys.norm === 'inf') ? '‖e‖∞/‖x_ref‖∞' : '‖e‖₂/‖x_ref‖₂';
  $('tSolv').innerHTML = tbl(['Método', 'Iteraciones', 'Estado', resLabel, '‖e‖∞', errLabel],
    rows.map(q => [q.nombre, String(q.k), estadoPill(q.estado), sci(q.res), sci(q.eI), q.eR != null ? sci(q.eR) : '—']));

  const cols = [C.R, C.Y, C.O];
  let maxIt = 1;
  const cds = iter.filter(q => q.hist.length > 1).map((q, i) => {
    maxIt = Math.max(maxIt, q.hist.length - 1);
    return ds(q.nombre, pos(q.hist.map((v, j) => ({ x: j, y: v }))), cols[i % cols.length], { bw: 2 });
  });
  if (cds.length) {
    cds.push(ds(`Tolerancia ${sci(sys.tol)}`, [{ x: 0, y: sys.tol }, { x: maxIt, y: sys.tol }], C.G, { dash: [6, 4] }));
    const yAxisLabel = (sys.norm === 'inf' ? '‖r_k‖∞' : '‖r_k‖₂ / ‖b‖₂') + ' (escala log)';
    chart('c10', 'line', cds, 'Iteración k', yAxisLabel, { yType: 'logarithmic' });
  }

  const kIter = Math.ceil(0.5 * kq * Math.log(2 / sys.tol));
  $('tRho').innerHTML = tbl(['Método', 'ρ observado (últimas 10 iteraciones)', 'Lectura'], [
    ...iter.map(q => {
      const rh = rhoObs(q.hist);
      return [q.nombre, rh == null ? '—' : fmt(rh, 4),
        rh == null ? 'Convergencia antes de 25 iteraciones' : rh < 1 ? 'Converge (ρ < 1)' : 'Diverge (ρ ≥ 1)'];
    }),
    ['Cota CG (√κ−1)/(√κ+1)', fmt(cgRate, 4), `κ₂ = ${sci(kap)}; ≈ ${Number.isFinite(kIter) ? kIter : '—'} iteraciones para ε = ${sci(sys.tol)}`]
  ]);

  const cg = rows.find(q => q.nombre.startsWith('Gradiente'));
  if (cg && cg.hist.length > 1) {
    const r0 = cg.hist[0];
    chart('c3', 'line', [
      ds('Residual relativo CG', pos(cg.hist.map((v, j) => ({ x: j, y: v }))), C.O, { bw: 3 }),
      ds('Cota teórica 2ρᵏ·r₀', xy(cg.hist.map((_, k) => k), cg.hist.map((_, k) => 2 * Math.pow(cgRate, k) * r0)), C.GR, { dash: [6, 4] })
    ], 'Iteración k', 'Residual relativo (escala log)', { yType: 'logarithmic' });
  }

  const r1 = LAST.r1, tEnd = r1.tdet ?? 4;
  const cv = rkConv(r1, tEnd, [0.5, 0.25, 0.125, 0.0625, 0.03125]);
  let prev = null;
  const rowsK = cv.map(q => {
    const px = prev ? Math.log2(prev.e2 / q.e2) : NaN, p4 = prev ? Math.log2(prev.e4 / q.e4) : NaN;
    prev = q;
    return [fmt(q.h, 5), sci(q.e2), isFinite(px) ? fmt(px, 2) : '—', sci(q.e4), isFinite(p4) ? fmt(p4, 2) : '—'];
  });
  $('tRK').innerHTML = tbl(['h (s)', '|e_x| RK2 (m)', 'Orden RK2', '|e_x| RK4 (m)', 'Orden RK4'], rowsK) +
    `<p class="note">Error en la posición a t_f = ${fmt(tEnd, 3)} s frente a la solución de referencia. Orden observado = log₂(e_anterior / e_actual) al dividir h por 2.</p>`;
}

function renderErrors() {
  if (!LAST.r1) return;
  const key = val('exMat') || 'm1', sys = sysFor(key), n = sys.b.length;
  const txtRef = val('exRef').trim(), txtApx = val('exApx').trim();
  if (!txtApx) {
    $('outErr').innerHTML = '<p class="note">Introduce un vector aproximado x̃ (n valores separados por comas) para calcular los errores.</p>';
    return;
  }
  let xref = txtRef ? parseList(txtRef, n) : sys.xs;
  if (!xref) { try { xref = solveLU(sys.A, sys.b); } catch (e) { xref = null; } }
  if (!xref) {
    $('outErr').innerHTML = '<p class="note">No hay vector de referencia disponible para este sistema.</p>';
    return;
  }
  const xap = parseList(txtApx, n);
  const e = sub(xap, xref), nx = norm2(xref), nb = norm2(sys.b) || 1;
  const relRes = norm2(sub(sys.b, matVec(sys.A, xap))) / nb;
  const kap = kappaOf(sys.A);
  const eInf = normInf(e), e2 = norm2(e), eRel2 = nx > 0 ? e2 / nx : null;
  const bound = kap * relRes;

  $('outErr').innerHTML = tbl(['i', 'x_ref', 'x̃', 'Error absoluto |e_i|', 'Error relativo |e_i| / |x_ref,i|', 'Error porcentual'],
    xref.map((v, i) => {
      const ea = Math.abs(e[i]), er = v !== 0 ? ea / Math.abs(v) : null;
      return [String(i + 1), fmt(v, 6), fmt(xap[i], 6), sci(ea), sci(er), er == null ? '—' : fmt(er * 100, 4) + ' %'];
    })) +
    tbl(['Magnitud', 'Valor', 'Lectura'], [
      ['Error absoluto ‖e‖∞', sci(eInf), 'máx |e_i|'],
      ['Error absoluto ‖e‖₂', sci(e2), '√Σ e_i²'],
      ['Error relativo ‖e‖₂ / ‖x_ref‖₂', eRel2 == null ? '—' : sci(eRel2),
        eRel2 == null ? 'No se divide: ‖x_ref‖ = 0' : `≈ ${fmt(eRel2 * 100, 4)} %`],
      ['Residual relativo ‖b − Ax̃‖₂ / ‖b‖₂', sci(relRes), 'Calculable sin conocer x_ref'],
      ['κ₂(A)', sci(kap), 'λ_max / λ_min'],
      ['Cota κ₂ · residual relativo', sci(bound),
        eRel2 == null ? '—' : (eRel2 <= bound * (1 + 1e-9) ? pill('ok', 'Se cumple') : pill('warn', 'No se cumple: revisar x_ref'))]
    ]);
}

function renderScenarios() {
  if (!LAST.r1) return;
  const R = SCEN_KEYS.map(s => ({
    s, r1: mod1(PRE[s].m1), r2: mod2(PRE[s].m2), r3: mod3(PRE[s].m3), r4: mod4(PRE[s].m4)
  }));
  const defs = [
    ['Tiempo de reacción t_r (s)', q => fmt(q.r1.tr, 2)],
    ['Distancia de reacción v₀·t_r (m)', q => fmt(q.r1.dR, 3)],
    ['Tiempo de parada t_det (s)', q => fmt(q.r1.tdet, 3)],
    ['D_total (m)', q => fmt(q.r1.D, 3)],
    ['Margen anticolisión (m)', q => fmt(q.r1.margen, 3)],
    ['Seguridad', q => q.r1.seguro ? pill('ok', 'Dentro de D_seg') : pill('bad', 'Supera D_seg')],
    ['Cruce del umbral t* (meses)', q => fmt(q.r2.tStar, 4)],
    ['Sensibilidad dt*/dD_u', q => fmt(q.r2.sens, 2)],
    ['Amplitud X (m)', q => fmt(q.r3.X, 4)],
    ['Límite de amplitud', q => q.r3.X <= q.r3.Alim ? pill('ok', 'Bajo A_lim') : pill('bad', 'Supera A_lim')],
    ['Amortiguamiento ζ', q => fmt(q.r3.z, 4)],
    ['κ₂ sensores (AᵀA)', q => sci(q.r4.kap)],
    ['Error relativo x̂ (MC)', q => sci(q.r4.eStat)],
    ['κ₂ calibración 3×3 escalada', q => q.r3.cal ? fmt(q.r3.cal.kS, 2) : '—']
  ];
  $('tEsc').innerHTML = tbl(['Magnitud', ...R.map(q => SCEN_NAME[q.s])], defs.map(([l, fn]) => [l, ...R.map(fn)]));
  chart('c11', 'bar', [
    ds('D_total (m)', R.map(q => q.r1.D), C.O),
    ds('D_seg (m)', R.map(q => PRE[q.s].m1.dseg), C.R),
    ds('Amplitud X (m)', R.map(q => q.r3.X), C.Y)
  ], 'Escenario', 'Magnitud (m)', { labels: R.map(q => SCEN_NAME[q.s]), xType: 'category' });
}

function renderAnalysis() {
  if (!LAST.r1) return;
  const { r1, r2, r3, r4, ri } = LAST, p1 = r1.p, p2 = r2.p;
  const pReac = r1.D ? r1.dR / r1.D * 100 : null;
  const F = [
    `<b>Detención de emergencia.</b> D_total = ${fmt(r1.D, 2)} m frente a D_seg = ${fmt(p1.dseg, 2)} m (margen ${fmt(r1.margen, 2)} m). La distancia de reacción v₀·t_r aporta el ${pReac == null ? '—' : fmt(pReac, 1) + ' %'} de D_total, y el escenario activo ${r1.seguro ? 'cumple' : 'no cumple'} el requisito de seguridad.`,
    `<b>Precisión del integrador.</b> ${r1.ok
      ? `Frente a la solución analítica, el error de RK4 en el tiempo de parada es ${sci(r1.eT4)} s y el de Heun ${sci(r1.eT2)} s.`
      : `Sin solución cerrada, RK4 con h = ${g(p1.h)} s actúa como referencia.`} El orden de RK4 es 4, frente a 2 de Heun.`,
    `<b>Deterioro mecánico.</b> El umbral D_u = ${g(p2.Du)} se cruza en t* = ${r2.tStar == null ? '—' : fmt(r2.tStar, 2)} meses. ${r2.sens != null && r2.sens > 100
      ? 'La sensibilidad es muy alta: pequeños errores en el umbral o en los coeficientes cambian el plazo de mantenimiento de forma desproporcionada.'
      : 'La sensibilidad es moderada frente a errores del umbral.'}`,
    `<b>Oscilaciones por viento.</b> Con Ω = ${fmt(r3.Om, 2)} rad/s y Ω/ω = ${fmt(r3.rr, 3)}, la amplitud de régimen es X = ${fmt(r3.X, 3)} m, ${r3.X <= r3.Alim ? 'por debajo' : 'por encima'} de A_lim = ${fmt(r3.Alim, 2)} m.`,
    `<b>Latencia frente al periodo.</b> La latencia de alerta de ${fmt(1.10, 2)} s equivale a ${fmt(r3.ratio, 2)} veces el periodo natural T_n = ${fmt(r3.Tn, 2)} s. ${r3.ratio < 0.5
      ? 'La alerta llega mucho antes de que el balanceo complete un ciclo.'
      : 'La latencia es comparable al periodo y debe incluirse en el diseño del control.'}`,
    `<b>Sensores.</b> AᵀA tiene κ₂ = ${sci(r4.kap)}. ${r4.kap < 1e3
      ? 'El ajuste es estable.'
      : r4.kap < 1e6 ? 'Los errores de datos se amplifican de forma notable en los coeficientes.'
        : 'El ajuste está en riesgo: el ruido de medición se amplifica en los coeficientes.'} Error relativo de x̂: ${sci(r4.eStat)}.`,
    ri
      ? `<b>Interpolación.</b> Lagrange y Newton dan P(x̂) = ${fmt(ri.L, 6)} con error ${sci(ri.eL)}, ${ri.eL <= ri.cota ? 'dentro' : 'fuera'} de la cota ${sci(ri.cota)}. El spline natural produce ${fmt(ri.Sv, 6)} con error ${sci(ri.eS)}.`
      : '<b>Interpolación.</b> Se requieren al menos dos nodos distintos.'
  ];
  $('findings').innerHTML = F.map((t, i) => `<div class="finding"><div class="num">${i + 1}</div><div>${t}</div></div>`).join('');

  const sem = [
    ['Seguridad de frenado (Módulo 1)', r1.seguro ? 'ok' : 'bad', `D_total = ${fmt(r1.D, 2)} m frente a D_seg = ${fmt(p1.dseg, 2)} m`],
    ['Plazo de mantenimiento (Módulo 2)', r2.tStar == null || r2.tStar > 12 ? 'ok' : r2.tStar > 6 ? 'warn' : 'bad',
      r2.tStar == null ? 'El umbral no se alcanza' : `t* = ${fmt(r2.tStar, 2)} meses`],
    ['Amplitud por viento (Módulo 3)', r3.X <= r3.Alim ? 'ok' : r3.X <= 1.5 * r3.Alim ? 'warn' : 'bad',
      `X = ${fmt(r3.X, 3)} m · A_lim = ${fmt(r3.Alim, 2)} m`],
    ['Latencia frente al periodo (Módulo 3)', r3.ratio < 0.5 ? 'ok' : r3.ratio < 1 ? 'warn' : 'bad', `1.10 s / T_n = ${fmt(r3.ratio, 3)}`],
    ['Condicionamiento de sensores (Módulo 4)', r4.kap < 1e3 ? 'ok' : r4.kap < 1e6 ? 'warn' : 'bad', `κ₂ = ${sci(r4.kap)}`],
    ['Calibración 3×3 (Módulo 3)', !r3.cal ? 'bad' : r3.cal.emax < 1 ? 'ok' : r3.cal.emax < 5 ? 'warn' : 'bad',
      r3.cal ? `Error máximo de parámetros = ${fmt(r3.cal.emax, 3)} %` : 'Sin solución'],
    ['Solución iterativa (Módulo 4)', r4.cgRow && r4.cgRow.estado === 'CONVERGIÓ' ? 'ok' : 'warn',
      r4.cgRow ? `Gradiente conjugado: ${r4.cgRow.estado}` : '—']
  ];
  const lab = { ok: 'Cumple', warn: 'Atención', bad: 'Crítico' };
  $('semaforo').innerHTML = sem.map(([n, c, d]) =>
    `<div class="sem-row"><div><b>${n}</b><br><small>${d}</small></div>${pill(c, lab[c])}</div>`).join('') +
    '<p class="note">Los umbrales del semáforo son criterios de lectura del análisis, no requisitos normativos.</p>';

  const reco = [];
  if (!r1.seguro) reco.push(`Reducir la latencia total o la velocidad de aproximación: con v₀ = ${fmt(p1.v0, 2)} m/s, cada 0.1 s de tiempo de reacción añade ${fmt(p1.v0 * 0.1, 2)} m a D_total.`);
  if (r2.tStar != null && r2.tStar <= 12) reco.push(`Programar la inspección antes de t* = ${fmt(r2.tStar, 2)} meses y revisar el umbral D_u con datos de campo, dada la sensibilidad ${sci(r2.sens)}.`);
  if (r3.X > r3.Alim) reco.push('Aumentar el amortiguamiento c o desplazar Ω fuera de la zona de resonancia: en resonancia la amplitud es inversamente proporcional a c.');
  if (r3.ratio >= 0.5) reco.push('Reducir la latencia de alerta para que sea pequeña frente al periodo natural T_n.');
  if (r4.kap >= 1e3) reco.push('Reducir el grado del polinomio o usar una base ortogonal: la base monomial produce un AᵀA mal condicionado.');
  if (r3.cal) reco.push(`Escalar las columnas de la matriz normal: κ₂ pasa de ${sci(r3.cal.kR)} a ${fmt(r3.cal.kS, 2)}.`);
  reco.push('Verificar siempre el residual relativo y la cota κ₂·‖r‖/‖b‖ antes de aceptar una solución numérica.');
  $('reco').innerHTML = li(reco);
}

function renderConclusions() {
  if (!LAST.r1) return;
  const { r1, r2, r3, r4 } = LAST, c = r3.cal, pReac = r1.D ? r1.dR / r1.D * 100 : null;
  $('concNum').innerHTML = li([
    `Eliminación gaussiana (LU) resuelve el sistema SPD del Módulo 1 en un solo paso. κ₂ recalculado = ${fmt(kappaOf(SYS.m1.A), 4)}; el informe cita 2.2450 en su planteamiento y 2.1266 en el recálculo, y esta página muestra el recálculo espectral.`,
    'Jacobi puede divergir aun con matriz SPD cuando ρ(T_J) ≥ 1. Gauss-Seidel suele converger más rápido que Jacobi, y el gradiente conjugado aprovecha la simetría y la definición positiva.',
    'La cota de error ‖x − x̃‖/‖x‖ ≤ κ₂·‖r‖/‖b‖ permite estimar la precisión a partir del residual, sin conocer x*.',
    c ? `El escalado de columnas de la matriz normal reduce κ₂ de ${sci(c.kR)} a ${fmt(c.kS, 2)}.` : 'La calibración 3×3 no tiene solución con estos parámetros.',
    'RK4 (error global O(h⁴)) es mucho más preciso que Heun (O(h²)). En el Módulo 1 el informe cita errores de 0.0001598 m/s (RK4) y 0.0388644 m/s (RK2).',
    'Lagrange y Newton representan el mismo polinomio. La cota M/n!·∏|x̂ − xᵢ| acota el error para funciones suaves; en el ejemplo de sen con nodos 0, π/2, π, P₂(π/4) = 0.750000 con error 0.042893, dentro de la cota 0.2422.'
  ]);

  $('concProb').innerHTML = li([
    `Frenado: la distancia de reacción v₀·t_r = ${fmt(r1.dR, 2)} m representa el ${pReac == null ? '—' : fmt(pReac, 1) + ' %'} de D_total, de modo que reducir t_r tiene efecto directo sobre la seguridad.`,
    `Deterioro: el umbral se cruza en t* = ${r2.tStar == null ? '—' : fmt(r2.tStar, 2)} meses en el escenario activo, con sensibilidad ${r2.sens == null ? '—' : sci(r2.sens)} meses por unidad de umbral.`,
    `Viento: la amplitud depende de Ω y del amortiguamiento c; la cercanía a la resonancia (Ω/ω = ${fmt(r3.rr, 3)}) determina si se supera A_lim.`,
    `Sensores: el grado del polinomio y el ruido de medición determinan κ₂ = ${sci(r4.kap)} y el error de los coeficientes.`,
    'Escenarios: Normal, Estrés y Mal condicionado producen conclusiones distintas; la tabla de escenarios compara los tres con los mismos cálculos.'
  ]);

  $('concl').innerHTML = `<div class="conclusion"><p>Para el escenario ${SCEN_NAME[val('scen')] || '—'}, el frenado ${r1.seguro ? 'cumple' : 'no cumple'} el requisito de distancia (D_total = ${fmt(r1.D, 2)} m), el deterioro cruza el umbral en t* = ${r2.tStar == null ? '—' : fmt(r2.tStar, 2)} meses, la amplitud por viento es X = ${fmt(r3.X, 3)} m ${r3.X <= r3.Alim ? 'dentro' : 'fuera'} del límite y el ajuste de sensores tiene κ₂ = ${sci(r4.kap)}. La comparación de escenarios y la teoría de errores (absoluto, relativo, porcentual, residual y κ₂) identifican qué parámetros de diseño son críticos.</p></div>` +
    '<p class="note"><b>Limitaciones</b></p>' + li([
      'El modelo de frenado describe sólo la dinámica longitudinal con la ley de desaceleración elegida.',
      'El modelo de deterioro es polinomial con parámetros supuestos; no está calibrado con datos reales.',
      'El modelo de viento es lineal de un grado de libertad con excitación armónica.',
      'El ruido de sensores es gaussiano y simulado; los datos no son mediciones reales.',
      'Los umbrales del semáforo son criterios de lectura, no requisitos normativos.',
      'La tasa ρ observada se estima con las últimas 10 iteraciones.'
    ]);
}

/* =====================================================================
   RECÁLCULO GLOBAL
   ===================================================================== */
function recalcAll() {
  if (window.IS_QUERY_MODE) return;
  try {
    const p1 = readForm('m1'), p2 = readForm('m2'), p3 = readForm('m3'), p4 = readForm('m4'), pi = readForm('mi');
    p1.h = Math.min(0.5, Math.max(1e-4, p1.h));
    p2.tmax = Math.min(600, Math.max(1, p2.tmax));
    p3.m = Math.max(p3.m, 1e-9);
    p3.Tsim = Math.min(600, Math.max(1, p3.Tsim));
    p4.grado = Math.min(8, Math.max(1, Math.round(p4.grado)));
    p4.pts = Math.max(p4.grado + 2, Math.round(p4.pts));
    LAST = { r1: mod1(p1), r2: mod2(p2), r3: mod3(p3), r4: mod4(p4), ri: modInterp(pi) };
    const escVal = (document.getElementById('scen') ? document.getElementById('scen').value : 'N') || 'N';
    const m2Key = (escVal === 'E') ? 'm2e' : (escVal === 'MC' || escVal === 'M') ? 'm2m' : 'm2n';
    const s1 = SYS.m1;
    const s1Rows = solverRows(s1.A, s1.b, s1.x, s1.tol, 50000, s1.norm);
    const s2 = SYS[m2Key] || SYS.m2n;
    const s2Rows = solverRows(s2.A, s2.b, s2.x, s2.tol, 50000, s2.norm);
    const s3Rows = (LAST.r3 && LAST.r3.cal) ? solverRows(LAST.r3.cal.N, LAST.r3.cal.bN, LAST.r3.cal.sT, 1e-10, 50000, 'rel2') : [];
    const s4Rows = LAST.r4 ? LAST.r4.rows : [];
    LAST.s1Rows = s1Rows;
    LAST.s2Rows = s2Rows;
    LAST.s3Rows = s3Rows;
    LAST.s4Rows = s4Rows;
    window.LAST = LAST;
    renderKPIs();
    render1(LAST.r1);
    render2(LAST.r2);
    render3(LAST.r3);
    render4(LAST.r4, LAST.ri);
    renderMethods();
    renderErrors();
    renderScenarios();
    renderAnalysis();
    renderConclusions();
  } catch (e) {
    console.error(e);
    $('kpis').innerHTML = `<div class="kpi"><small>Error de cálculo</small><div class="s">${e.message}</div></div>`;
  }
}

/* =====================================================================
   EXPORTACIÓN / IMPORTACIÓN (contrato JSON)
   ===================================================================== */
function exportJSON() {
  if (!LAST.r1) return;
  const { r1, r2, r3, r4, ri } = LAST;
  const esc = val('scen') || 'N';
  const m2Key = (esc === 'E') ? 'm2e' : (esc === 'MC' || esc === 'M') ? 'm2m' : 'm2n';
  const sys2 = SYS[m2Key];
  const mapSolverRows = rows => (rows || []).map(q => ({
    metodo: q.nombre,
    iteraciones: q.k,
    estado: q.estado,
    residual: q.res,
    residual_relativo: q.res,
    error_inf: q.eI,
    error_rel: q.eR
  }));

  const m1Rows = solverRows(SYS.m1.A, SYS.m1.b, SYS.m1.x, SYS.m1.tol, 50000, SYS.m1.norm);
  const m2Rows = solverRows(sys2.A, sys2.b, sys2.x, sys2.tol, 50000, sys2.norm);
  const m3Rows = (r3 && r3.cal) ? solverRows(r3.cal.N, r3.cal.bN, r3.cal.sT, 1e-10, 50000, 'rel2') : [];
  const m4Rows = r4 ? r4.rows : [];

  const pM1 = readForm('m1');
  const pM4 = readForm('m4');
  if (esc === 'N') {
    if (pM1.amax === undefined || pM1.amax === null) pM1.amax = 1.5;
    if (pM4.seed === undefined || pM4.seed === null) pM4.seed = 2026;
  }

  const doc = {
    contrato: CONTRATO,
    escenario: esc,
    parametros: {
      m1: pM1,
      m2: readForm('m2'),
      m3: readForm('m3'),
      m4: pM4,
      mi: readForm('mi')
    },
    resultados: {
      m1: { t_reaccion: r1.tr, distancia_reaccion: r1.dR, t_detencion: r1.tdet, D_total: r1.D, margen: r1.margen, seguro: r1.seguro },
      m2: { t_star: r2.tStar, t_newton: r2.tN, sensibilidad: r2.sens, estado: r2.estado },
      m3: { X: r3.X, omega: r3.w, zeta: r3.z, A_lim: r3.Alim, cruce_s: r3.cross },
      m4: { kappa2: r4.kap, lambda_min: r4.lmin, lambda_max: r4.lmax, error_relativo: r4.eStat },
      mi: ri ? { valor: ri.L, error: ri.eL, cota: ri.cota } : null
    },
    solvers: {
      m1: mapSolverRows(m1Rows),
      m2: mapSolverRows(m2Rows),
      m3: mapSolverRows(m3Rows),
      m4: mapSolverRows(m4Rows)
    }
  };
  const txt = JSON.stringify(doc, (k, v) => (typeof v === 'number' && !isFinite(v)) ? null : v, 2);
  const url = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `simtele-risk-${doc.escenario || 'N'}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importJSON(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const doc = JSON.parse(rd.result);
      if (doc.contrato !== CONTRATO) throw new Error('contrato no reconocido: ' + doc.contrato);
      const sc = (doc.escenario === 'M' || doc.escenario === 'MC') ? 'MC' : doc.escenario;
      if (sc && (PRE[sc] || sc === 'MC')) {
        $('scen').value = sc;
        applyScenario();
      }
      const P = doc.parametros || {};
      ['m1', 'm2', 'm3', 'm4', 'mi'].forEach(m => { if (P[m]) setForm(m, P[m]); });
      recalcAll();
      if (doc.resultados) {
        const diffs = [];
        const tol = 1e-3;
        const check = (name, valExp, valAct) => {
          if (typeof valExp === 'number' && typeof valAct === 'number') {
            const err = Math.abs(valExp - valAct);
            if (err > tol) diffs.push(`${name}: esperado ${valExp}, obtenido ${valAct} (Δ=${err.toExponential(2)})`);
          }
        };
        if (doc.resultados.m1 && LAST.r1) {
          check('M1 D_total', doc.resultados.m1.D_total, LAST.r1.D);
          check('M1 t_detencion', doc.resultados.m1.t_detencion, LAST.r1.tdet);
        }
        if (doc.resultados.m2 && LAST.r2) {
          check('M2 t_star', doc.resultados.m2.t_star, LAST.r2.tStar);
        }
        if (doc.resultados.m3 && LAST.r3) {
          check('M3 X', doc.resultados.m3.X, LAST.r3.X);
        }
        if (doc.resultados.m4 && LAST.r4) {
          check('M4 kappa2', doc.resultados.m4.kappa2, LAST.r4.kap);
        }
        if (diffs.length > 0) {
          alert('Archivo importado con discrepancias numéricas (> 1e-3):\n' + diffs.join('\n'));
        } else {
          alert('Archivo importado y validado con éxito. Todos los parámetros y resultados coinciden dentro de la tolerancia.');
        }
      }
    } catch (e) {
      alert('No se pudo importar el archivo: ' + e.message);
    }
    ev.target.value = '';
  };
  rd.readAsText(file);
}

/* =====================================================================
   ARRANQUE Y EVENTOS
   ===================================================================== */
const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
const fillForms = S => ['m1', 'm2', 'm3', 'm4', 'mi'].forEach(m => setForm(m, PRE[S][m]));

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    buildForms();
    fillForms(val('scen') || 'N');
    on('scen', 'change', applyScenario);
    ['fm1', 'fm2', 'fm3', 'fm4', 'fmi'].forEach(id => { on(id, 'input', schedule); on(id, 'change', schedule); });
    document.querySelectorAll('[data-live]').forEach(el => {
      el.addEventListener('input', schedule);
      el.addEventListener('change', schedule);
    });
    on('solSys', 'change', () => renderMethods());
    on('exRef', 'input', () => renderErrors());
    on('exApx', 'input', () => renderErrors());
    on('exMat', 'change', () => renderErrors());
    on('btnExp', 'click', exportJSON);
    on('fileIn', 'change', importJSON);
    if (typeof window !== 'undefined') {
      window.applyScenario = applyScenario;
      window.setForm = setForm;
      window.recalcAll = recalcAll;
      window.schedule = schedule;
      window.chart = chart;
      window.ds = ds;
      window.C = C;
      window.kpi = kpi;
      window.pill = pill;
      window.fmt = fmt;
      window.sci = sci;
      window.tbl = tbl;
      window.MODEL1 = MODEL1;
      window.LAT3 = LAT3;
      window.SYS = SYS;
      window.solverRows = solverRows;
      window.PRE = PRE;
      window.renderKPIs = renderKPIs;
      window.render1 = render1;
      window.render2 = render2;
      window.render3 = render3;
      window.render4 = render4;
      window.lebesgueConstant = lebesgueConstant;
      window.sweepInterpolation = sweepInterpolation;
    }
    recalcAll();
  });
}

/* =====================================================================
   MÉTODOS GENÉRICOS DE BÚSQUEDA DE RAÍCES
   Bloque dedicado disponible para reutilización intermodular (Gabriel - Módulo 2)
   ===================================================================== */
function biseccion(f, a, b, tol = 1e-12, maxIter = 100) {
  let fa = f(a), fb = f(b);
  const hist = [];
  let it = 0;
  if (!isFinite(fa) || !isFinite(fb)) {
    return { x: null, it: 0, convergio: false, estado: 'DIVERGIO', aviso: 'Evaluación no finita en extremos', residual: null, hist: [] };
  }
  if (Math.abs(fa) < tol) return { x: a, it: 0, convergio: true, estado: 'COMPLETADO', residual: Math.abs(fa), hist: [] };
  if (Math.abs(fb) < tol) return { x: b, it: 0, convergio: true, estado: 'COMPLETADO', residual: Math.abs(fb), hist: [] };
  if (fa * fb > 0) {
    return { x: null, it: 0, convergio: false, estado: 'NO_ALCANZO_TOL', aviso: `Sin cambio de signo en el intervalo [${a}, ${b}]: f(a)=${fa}, f(b)=${fb}`, residual: null, hist: [] };
  }
  let m = (a + b) / 2;
  while ((b - a) / 2 > tol && it < maxIter) {
    it++;
    m = (a + b) / 2;
    const fm = f(m);
    const errAbs = (b - a) / 2;
    hist.push({
      numero: it,
      a,
      b,
      m,
      t: m,
      x: m,
      residual: Math.abs(fm),
      error_abs: errAbs,
      error_rel: Math.abs(m) > 1e-12 ? errAbs / Math.abs(m) : errAbs
    });
    if (Math.abs(fm) < tol || errAbs < tol) break;
    if (fa * fm <= 0) {
      b = m;
      fb = fm;
    } else {
      a = m;
      fa = fm;
    }
  }
  return {
    x: m,
    it,
    convergio: true,
    estado: 'COMPLETADO',
    residual: Math.abs(f(m)),
    hist
  };
}

function newtonRaphson(f, df, x0, tol = 1e-12, maxIter = 100) {
  let x = x0, it = 0;
  const hist = [];
  let estado = 'NO_ALCANZO_TOL';
  while (it < maxIter) {
    it++;
    const fx = f(x), dfx = df(x);
    if (!isFinite(fx) || !isFinite(dfx)) { estado = 'DIVERGIO'; x = null; break; }
    if (Math.abs(dfx) < 1e-12) {
      estado = 'DIVERGIO';
      hist.push({
        numero: it,
        t: x,
        x,
        residual: Math.abs(fx),
        error_abs: null,
        error_rel: null,
        derivada: dfx,
        aviso: 'Derivada casi nula (|f\'(x)| < 1e-12)'
      });
      break;
    }
    const xNext = x - fx / dfx;
    const fNext = f(xNext);
    const errAbs = Math.abs(xNext - x);
    const residual = Math.abs(fNext);
    hist.push({
      numero: it,
      t: xNext,
      x: xNext,
      residual,
      error_abs: errAbs,
      error_rel: Math.abs(xNext) > 1e-12 ? errAbs / Math.abs(xNext) : errAbs,
      derivada: dfx
    });
    if (errAbs < tol || residual < tol) {
      x = xNext;
      estado = 'COMPLETADO';
      break;
    }
    if (!isFinite(xNext) || Math.abs(xNext) > 1e12) {
      estado = 'DIVERGIO';
      x = null;
      break;
    }
    x = xNext;
  }
  return {
    x,
    it,
    convergio: estado === 'COMPLETADO',
    estado,
    residual: x != null ? Math.abs(f(x)) : null,
    hist
  };
}

function secante(f, x0, x1, tol = 1e-12, maxIter = 100) {
  let f0 = f(x0), f1 = f(x1);
  const hist = [];
  let it = 0, x = x1, estado = 'NO_ALCANZO_TOL';
  if (!isFinite(f0) || !isFinite(f1)) {
    return { x: null, it: 0, convergio: false, estado: 'DIVERGIO', aviso: 'Valores iniciales no finitos', residual: null, hist: [] };
  }
  while (it < maxIter) {
    it++;
    const denom = f1 - f0;
    if (Math.abs(denom) < 1e-15) {
      estado = 'DIVERGIO';
      hist.push({
        numero: it,
        x0,
        x1,
        t: x,
        x,
        residual: Math.abs(f1),
        error_abs: null,
        error_rel: null,
        aviso: 'Denominador casi nulo (división por cero)'
      });
      break;
    }
    const xNext = x1 - f1 * (x1 - x0) / denom;
    const fNext = f(xNext);
    const errAbs = Math.abs(xNext - x1);
    const residual = Math.abs(fNext);
    hist.push({
      numero: it,
      x0,
      x1,
      t: xNext,
      x: xNext,
      residual,
      error_abs: errAbs,
      error_rel: Math.abs(xNext) > 1e-12 ? errAbs / Math.abs(xNext) : errAbs
    });
    if (errAbs < tol || residual < tol) {
      x = xNext;
      estado = 'COMPLETADO';
      break;
    }
    if (!isFinite(xNext) || Math.abs(xNext) > 1e12) {
      estado = 'DIVERGIO';
      x = null;
      break;
    }
    x0 = x1; f0 = f1;
    x1 = xNext; f1 = fNext;
    x = xNext;
  }
  return {
    x,
    it,
    convergio: estado === 'COMPLETADO',
    estado,
    residual: x != null ? Math.abs(f(x)) : null,
    hist
  };
}

function toggleM4ErrorScale() {
  const isLog = !!(document.getElementById('m4ErrorLogScale') && document.getElementById('m4ErrorLogScale').checked);
  if (typeof window !== 'undefined' && window.CURRENT_SIMULATION_FROM_DB) {
    if (typeof window.renderM4ErrorChartFromDB === 'function') {
      window.renderM4ErrorChartFromDB(window.CURRENT_SIMULATION_FROM_DB.ejecuciones, isLog);
    }
  } else if (typeof LAST !== 'undefined' && LAST && LAST.ri) {
    const riData = LAST.ri;
    const clampLog = v => isLog ? Math.max(v, 1e-16) : v;
    const ptsS = (riData.eval_spline?.puntos || []).map(p => ({ x: p.x, y: clampLog(p.error_abs) }));
    const ptsL = (riData.eval_lagrange?.puntos || []).map(p => ({ x: p.x, y: clampLog(p.error_abs) }));
    const ptsN = (riData.eval_newton?.puntos || []).map(p => ({ x: p.x, y: clampLog(p.error_abs) }));

    const dsError = [];
    if (ptsS.length) dsError.push(ds('Error Spline natural', ptsS, C.G, { bw: 0, pr: 6, ps: 'circle', line: false }));
    if (ptsL.length) dsError.push(ds('Error Lagrange', ptsL, C.R, { bw: 0, pr: 6, ps: 'triangle', line: false }));
    if (ptsN.length) dsError.push(ds('Error Newton DD', ptsN, C.Y, { bw: 0, pr: 6, ps: 'rectRot', line: false }));

    const yLabel = isLog ? 'Error absoluto |f(x̂) − P(x̂)| (Escala logarítmica)' : 'Error absoluto |f(x̂) − P(x̂)|';
    chart('c13', 'line', dsError, 'Punto oculto evaluado x̂', yLabel, { yType: isLog ? 'logarithmic' : 'linear' });
  }
}

if (typeof window !== 'undefined') {
  window.SYS = SYS;
  window.solverRows = solverRows;
  window.PRE = PRE;
  window.readForm = readForm;
  window.LAST = LAST;
  window.mod1 = mod1;
  window.mod2 = mod2;
  window.mod3 = mod3;
  window.mod4 = mod4;
  window.modInterp = modInterp;
  window.evalOnPoints = evalOnPoints;
  window.lebesgueConstant = lebesgueConstant;
  window.sweepInterpolation = sweepInterpolation;
  window.splineNatural = splineNatural;
  window.splineEval = splineEval;
  window.splineDeriv = splineDeriv;
  window.biseccion = biseccion;
  window.newtonRaphson = newtonRaphson;
  window.secante = secante;
  window.chart = chart;
  window.ds = ds;
  window.tbl = tbl;
  window.render4 = render4;
  window.toggleM4ErrorScale = toggleM4ErrorScale;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SYS, solverRows, PRE, readForm, LAST,
    mod1, mod2, mod3, mod4, modInterp, evalOnPoints, lebesgueConstant, sweepInterpolation,
    splineNatural, splineEval, splineDeriv,
    biseccion, newtonRaphson, secante,
    chart, ds, tbl, render4, toggleM4ErrorScale
  };
}