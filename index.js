// proxy.js
// HTTP(S) proxy with Basic auth.
// Can be used as a standalone script or required as a CommonJS module:
// const startProxy = require('./proxy');
// const { server } = startProxy({ port: 8000, user: 'user', pass: 'pass' });

const http = require('http');
const net = require('net');
const HttpProxy = require('http-proxy');

function createProxyServerInstance({ port = 8000, user = 'user', pass = 'pass' } = {}) {
  const PORT = Number(port);

  // --- Auth helpers
  function checkAuth(header) {
    if (!header) return false;
    const parts = header.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Basic') return false;
    const creds = Buffer.from(parts[1], 'base64').toString();
    const [u, p] = creds.split(':');
    return u === String(user) && p === String(pass);
  }
  function send407(res) {
    res.writeHead(407, {
      'Proxy-Authenticate': 'Basic realm="Proxy"',
      'Content-Type': 'text/plain'
    });
    res.end('Proxy Authentication Required\n');
  }

  // --- proxy implementation
  const proxy = HttpProxy.createProxyServer({});
  const server = http.createServer((req, res) => {
    const auth = req.headers['proxy-authorization'];
    if (!checkAuth(auth)) return send407(res);

    delete req.headers['proxy-authorization'];
    delete req.headers['proxy-connection'];

    let target;
    try {
      const parsed = new URL(req.url);
      target = parsed.origin;
    } catch {
      res.writeHead(400);
      return res.end('Bad request: expected absolute URL in proxy request\n');
    }

    proxy.web(req, res, { target, changeOrigin: true }, (err) => {
      console.error('Proxy error (HTTP):', err && err.message);
      if (!res.headersSent) res.writeHead(502);
      res.end('Bad Gateway\n');
    });
  });

  server.on('connect', (req, clientSocket, head) => {
    const auth = req.headers['proxy-authorization'];
    if (!checkAuth(auth)) {
      clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Proxy"\r\n\r\n');
      return clientSocket.destroy();
    }

    const [host, portStr] = req.url.split(':');
    const destPort = parseInt(portStr, 10) || 443;
    const serverSocket = net.connect(destPort, host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length) serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
      console.error('Tunnel error:', err && err.message);
      try { clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n'); } catch (e) {}
      clientSocket.destroy();
    });
  });

  server.on('clientError', (err, socket) => {
    console.error('Client error:', err && err.message);
    try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch (e) {}
  });

  // --- ALWAYS show the PowerShell command to open the port
  function printFirewallCommands(portNum) {
    console.log('\n--------------------------------------------------');
    console.log('To allow inbound TCP traffic for this proxy port on Windows Firewall, run (AS ADMIN):\n');
    console.log(`New-NetFirewallRule -DisplayName "Node Proxy Port ${portNum}" -Direction Inbound -Protocol TCP -LocalPort ${portNum} -Action Allow`);
    console.log('--------------------------------------------------\n');
  }

  // start listening
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Proxy listening on 0.0.0.0:${PORT}`);
    console.log(`Auth credentials -> user: ${user}  pass: ${pass}`);
    printFirewallCommands(PORT);
  });

  // return objects so caller can control lifecycle
  return {
    server,
    proxy,
    stop: (cb) => {
      // close proxy server and optionally call callback when done
      server.close((err) => {
        try { proxy.close(); } catch (e) {}
        if (typeof cb === 'function') cb(err);
      });
    }
  };
}

// Export the starter function for require(...)
module.exports = createProxyServerInstance;

// If invoked directly, run with env/defaults
if (require.main === module) {
  // Read from environment vars if present
  const PORT = process.env.PORT ? Number(process.env.PORT) : 8000;
  const AUTH_USER = process.env.PROXY_USER || 'user';
  const AUTH_PASS = process.env.PROXY_PASS || 'pass';

  createProxyServerInstance({ port: PORT, user: AUTH_USER, pass: AUTH_PASS });
}
