const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 8080;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.sql': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function startServer(port) {
  const rootDir = path.resolve(__dirname, '..');
  const server = http.createServer((req, res) => {
    let reqPath = decodeURI((req.url || '/').split('?')[0]);
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    const filePath = path.normalize(path.join(rootDir, reqPath));

    // Seguridad básica contra directory traversal
    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Prohibido');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 No encontrado: ' + reqPath);
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(filePath).pipe(res);
    });
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[AVISO] El puerto ${port} está ocupado. Probando puerto ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Error del servidor:', err.message);
    }
  });

  server.listen(port, () => {
    console.log(`\n=============================================================`);
    console.log(` Servidor local activo en: http://localhost:${port}`);
    console.log(` Abre en tu navegador:   http://localhost:${port}/index.html`);
    console.log(` Presiona Ctrl + C en esta terminal para detenerlo.`);
    console.log(`=============================================================\n`);
  });
}

const initialPort = parseInt(process.argv[2], 10) || DEFAULT_PORT;
startServer(initialPort);
