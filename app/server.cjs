const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const products = [
  { id: 'keyboard', name: 'Mechanical Keyboard', price: 89 },
  { id: 'mouse', name: 'Wireless Mouse', price: 35 },
  { id: 'monitor', name: 'Studio Monitor', price: 249 }
];
const delay = () => 150 + Math.floor(Math.random() * 900);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/api/products') {
    return setTimeout(() => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(products));
    }, delay());
  }
  if (url.pathname === '/api/orders' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let order;
      try { order = JSON.parse(body); } catch { res.writeHead(400); return res.end(); }
      const valid = order && typeof order.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email)
        && typeof order.address === 'string' && order.address.trim().length >= 5
        && Array.isArray(order.items) && order.items.length > 0
        && order.items.every(id => products.some(p => p.id === id));
      setTimeout(() => {
        res.writeHead(valid ? 201 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(valid ? { id: 'ORD-' + Date.now() } : { error: 'Invalid order' }));
      }, delay());
    });
    return;
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  }
  res.writeHead(404); res.end('Not found');
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log('Training Shop: http://127.0.0.1:4173'));
