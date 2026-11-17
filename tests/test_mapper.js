const Mapper = require('../js/mapper.js');

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}

console.log('=== TEST DE MAPEO BIDIRECCIONAL (js/mapper.js) ===\n');

// 1. Escenarios
console.log('1. Probando mapeo de escenarios...');
assert(Mapper.toDbEscenario('N') === 'NORMAL', 'N -> NORMAL');
assert(Mapper.toDbEscenario('E') === 'ESTRES', 'E -> ESTRES');
assert(Mapper.toDbEscenario('MC') === 'MAL_CONDICIONADO', 'MC -> MAL_CONDICIONADO');
assert(Mapper.toDbEscenario('M') === 'MAL_CONDICIONADO', 'M -> MAL_CONDICIONADO');
assert(Mapper.toUiEscenario('NORMAL') === 'N', 'NORMAL -> N');
assert(Mapper.toUiEscenario('ESTRES') === 'E', 'ESTRES -> E');
assert(Mapper.toUiEscenario('MAL_CONDICIONADO') === 'MC', 'MAL_CONDICIONADO -> MC');
console.log('   -> Mapeo bidireccional de escenarios correcto.');

// 2. Estados
console.log('2. Probando normalización de estados...');
assert(Mapper.toDbEstado('CONVERGIÓ') === 'CONVERGIO', 'CONVERGIÓ -> CONVERGIO');
assert(Mapper.toDbEstado('DIVERGIÓ') === 'DIVERGIO', 'DIVERGIÓ -> DIVERGIO');
assert(Mapper.toDbEstado('DIRECTO') === 'DIRECTO', 'DIRECTO -> DIRECTO');
assert(Mapper.toDbEstado('NO_ALCANZÓ_TOL') === 'NO_ALCANZO_TOL', 'NO_ALCANZÓ_TOL -> NO_ALCANZO_TOL');
assert(Mapper.toDbEstado('COMPLETADO') === 'COMPLETADO', 'COMPLETADO -> COMPLETADO');
assert(Mapper.toUiEstado('CONVERGIO') === 'CONVERGIÓ', 'CONVERGIO -> CONVERGIÓ');
assert(Mapper.toUiEstado('DIVERGIO') === 'DIVERGIÓ', 'DIVERGIO -> DIVERGIÓ');
assert(Mapper.toUiEstado('NO_ALCANZO_TOL') === 'NO_ALCANZÓ_TOL', 'NO_ALCANZO_TOL -> NO_ALCANZÓ_TOL');
console.log('   -> Normalización de estados correcta.');

// 3. Sanitización de errores numéricos y división por cero
console.log('3. Probando sanitización de números y división por cero...');
assert(Mapper.sanitizeNumber(null) === null, 'null -> null');
assert(Mapper.sanitizeNumber(undefined) === null, 'undefined -> null');
assert(Mapper.sanitizeNumber(NaN) === null, 'NaN -> null');
assert(Mapper.sanitizeNumber(Infinity) === null, 'Infinity -> null');
assert(Mapper.sanitizeNumber(-Infinity) === null, '-Infinity -> null');
assert(Mapper.sanitizeNumber(1.2e100) === null, 'Divergencia asintótica (> 1e99) -> null');
assert(Mapper.sanitizeNumber(12.34) === 12.34, 'Número finito válido -> 12.34');

// Regla de no división por cero
assert(Mapper.safeRelError(0.5, 0.0) === null, 'División por cero en error relativo -> NULL');
assert(Mapper.safeRelError(0.5, 1e-15) === null, 'Referencia infinitesimal (< 1e-14) -> NULL');
assert(Mapper.safeRelError(null, 10.0) === null, 'Error absoluto nulo -> NULL');
assert(Math.abs(Mapper.safeRelError(0.05, 10.0) - 0.005) < 1e-12, 'Cálculo correcto de error relativo');
console.log('   -> Reglas de sanitización y no división por cero aplicadas correctamente.');

// 4. Parseo y generación de contratos
console.log('4. Probando contratos JSON v1 y v2...');
const dummyV1 = {
  contrato: 'simtele-risk/simulacion/v1',
  escenario: 'N',
  parametros: { m1: { v0: 5 } },
  resultados: { m1: { D_total: 12 } }
};
const parsedV1 = Mapper.parseContract(dummyV1);
assert(parsedV1.version === 'v1', 'Detecta versión v1');
assert(parsedV1.scenCode === 'N', 'scenCode N');
assert(parsedV1.scenDb === 'NORMAL', 'scenDb NORMAL');

const dummyV2 = Mapper.toContractV2({ id: 10, estado: 'COMPLETADO', coincide: true }, 'MC', { m1: { v0: 5 } }, { r1: { D: 8.67 } }, []);
assert(dummyV2.contrato === 'simtele-risk/simulacion/v2', 'Genera contrato v2');
assert(dummyV2.escenario === 'MC', 'Escenario MC en v2');
assert(dummyV2.simulacion.id === 10, 'Metadatos de simulación presentes');

const parsedV2 = Mapper.parseContract(dummyV2);
assert(parsedV2.version === 'v2', 'Detecta versión v2');
assert(parsedV2.scenDb === 'MAL_CONDICIONADO', 'scenDb MAL_CONDICIONADO');
console.log('   -> Contratos v1 y v2 interoperables y validados.');

console.log('\n✅ TODOS LOS TESTS DEL MAPPER PASARON SATISFACTORIAMENTE.');
