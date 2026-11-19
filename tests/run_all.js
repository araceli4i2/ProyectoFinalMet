/**
 * SIMTELE-RISK · Suite Completa de Pruebas Automatizadas
 * Ejecuta todas las pruebas en tests/ y tools/audit_persistence_cycle.js
 * Cero dependencias externas.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function runAll() {
  console.log('======================================================================');
  console.log('SIMTELE-RISK · EJECUTOR UNIVERSAL DE PRUEBAS AUTOMATIZADAS');
  console.log('======================================================================\n');

  const testsDir = __dirname;
  const projectRoot = path.resolve(__dirname, '..');

  // Listar todos los archivos .js en tests/ excepto run_all.js
  const testFiles = fs.readdirSync(testsDir)
    .filter(f => f.endsWith('.js') && f !== 'run_all.js')
    .sort()
    .map(f => path.join('tests', f));

  // Incluir auditoría de persistencia en tools/
  const toolsAudit = path.join('tools', 'audit_persistence_cycle.js');
  if (fs.existsSync(path.join(projectRoot, toolsAudit))) {
    testFiles.push(toolsAudit);
  }

  console.log(`Total de pruebas a ejecutar: ${testFiles.length}\n`);

  let passed = 0;
  let failed = 0;
  const failures = [];

  testFiles.forEach((file, idx) => {
    const fullPath = path.join(projectRoot, file);
    process.stdout.write(`[${idx + 1}/${testFiles.length}] Ejecutando ${file}... `);

    const startTime = Date.now();
    const res = spawnSync(process.execPath, [fullPath], {
      cwd: projectRoot,
      encoding: 'utf8'
    });
    const elapsed = Date.now() - startTime;

    if (res.status === 0) {
      console.log(`PASS (${elapsed} ms, exit code 0)`);
      passed++;
    } else {
      console.log(`FAIL (${elapsed} ms, exit code ${res.status})`);
      failed++;
      failures.push({
        file,
        status: res.status,
        output: (res.stdout || '') + (res.stderr || '')
      });
    }
  });

  console.log('\n======================================================================');
  console.log(`RESUMEN DE PRUEBAS: ${passed} PASARON, ${failed} FALLARON DE ${testFiles.length} TOTAL`);
  console.log('======================================================================\n');

  if (failed > 0) {
    console.error('Detalle de pruebas fallidas:\n');
    failures.forEach(f => {
      console.error(`--- ${f.file} (código ${f.status}) ---`);
      console.error(f.output.trim());
      console.error('--------------------------------------------------\n');
    });
    process.exit(1);
  } else {
    console.log('✔ Todas las pruebas pasaron satisfactoriamente al 100%.\n');
    process.exit(0);
  }
}

runAll();
