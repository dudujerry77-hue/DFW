// server.js — one small Node server for the whole Dasenter connection:
// the Dasenter API, the JavaScript SDK and Dasenter Webhooks, all on one website.
// Verified Reconnect ON: it answers every real check.
//
//   1. Fill in .env and public/index.html (replace every PASTE_... value).
//   2. Start it:   node server.js
//   3. In Dasenter, save this address as the website address in Settings, and
//      http://127.0.0.1:4003/dasenter/products as the Outbound product push destination.
//   4. Press Verify Connection in Dasenter. Pushed products show on the website at http://127.0.0.1:4003/
'use strict';

var http = require('http');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

// ---- settings from .env (read once, when the server starts — restart it after any change) ----
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split('\n').forEach(function (line) {
    var m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}
loadEnv(path.join(__dirname, '.env'));

var PORT = Number(process.env.PORT) || 4003;
var DASENTER = (process.env.DASENTER_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
var STORE_ID = process.env.DASENTER_STORE_ID;
var API_KEY = process.env.DASENTER_API_KEY;               // nx_live_ key of the Dasenter API integration
var WEBHOOK_KEY = process.env.DASENTER_WEBHOOK_KEY;       // nx_live_ key of the Dasenter Webhooks integration
var WEBHOOK_SECRET = process.env.DASENTER_WEBHOOK_SECRET; // whsec_ secret shown when you saved the destination URL

// ---- Dasenter signs every request it sends here: HMAC-SHA256 of  timestamp + "." + rawBody ----
function verifySignature(timestampHeader, signatureHeader, rawBody) {
  if (!WEBHOOK_SECRET || !timestampHeader || !signatureHeader) return false;
  var timestamp = Number(timestampHeader);
  if (!isFinite(timestamp)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) return false; // reject old requests
  var expected = 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(timestamp + '.' + rawBody).digest('hex');
  var a = Buffer.from(expected);
  var b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
}

function sendText(res, status, text) {
  res.writeHead(status, { 'content-type': 'text/plain' });
  res.end(text);
}

// ---- send an order to Dasenter with a key (the Dasenter API) ----
// A real, read-only request to Dasenter with your API key (GET /api/orders). Dasenter marks the API connection
// as used only when it genuinely receives a request made with the key — this is that request. It runs once when
// the server starts, and again whenever you open http://127.0.0.1:PORT/dasenter/api-check.
async function checkApiConnection() {
  if (!API_KEY) return { ok: false, error: 'DASENTER_API_KEY is not set in .env.' };
  try {
    var response = await fetch(DASENTER + '/api/orders?pageSize=1', { headers: { authorization: 'Bearer ' + API_KEY } });
    if (!response.ok) return { ok: false, status: response.status, error: 'Dasenter rejected the API key (HTTP ' + response.status + ').' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'Could not reach Dasenter at ' + DASENTER + ': ' + err.message };
  }
}

// The products Dasenter pushed to you. They are saved in products.json (next to server.js) so a restart keeps them.
var PRODUCTS_FILE = path.join(__dirname, 'products.json');
var products = [];
try { products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8')); } catch (e) { products = []; }
function saveProducts() { fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2)); }

async function postOrder(order, key) {
  var response = await fetch(DASENTER + '/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify({
      storeId: STORE_ID,
      externalId: order.externalId,
      customer: order.customer,
      items: order.items,
      total: order.total,
      currency: order.currency || 'NGN'
    })
  });
  var body = await response.json().catch(function () { return {}; });
  return { ok: response.ok, message: body.error && body.error.message };
}

// A real order uses the Dasenter API key. Dasenter's own connection tests (an order id starting
// "dasenter-verify-") are answered by whichever of your two keys belongs to the integration being
// verified, so for those try both.
async function forwardOrder(order) {
  var keys = String(order.externalId).indexOf('dasenter-verify-') === 0 ? [API_KEY, WEBHOOK_KEY] : [API_KEY];
  var last = { ok: false, message: 'No Dasenter API key is set in .env.' };
  for (var i = 0; i < keys.length; i++) {
    if (!keys[i]) continue;
    last = await postOrder(order, keys[i]);
    if (last.ok) return last;
  }
  return last;
}

// ---- serve the website in ./public ----
var TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.txt': 'text/plain' };
function serveStatic(res, pathname) {
  var root = path.join(__dirname, 'public');
  var file = path.join(root, pathname === '/' ? 'index.html' : pathname);
  if (file.indexOf(root) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return sendJson(res, 404, { error: 'not_found' });
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
}


var VERIFY_CODE = process.env.DASENTER_VERIFY_CODE; // the code under "Prove you control this destination"
var orderStatuses = {};

var server = http.createServer(async function (req, res) {
  try {
    var url = new URL(req.url, 'http://localhost');
    var p = url.pathname;
    // Dasenter's older /nexora/... addresses work exactly like /dasenter/...
    if (p.indexOf('/nexora/') === 0) p = '/dasenter/' + p.slice('/nexora/'.length);
    // lets your page read /dasenter/store-products even when it is opened from another address (e.g. VS Code Live Server)
    if (req.method === 'GET' && p === '/dasenter/api-check') { var checked = await checkApiConnection(); return sendJson(res, checked.ok ? 200 : 502, checked); }
    // The list your own web page shows. (Dasenter's signed pull is /dasenter/products; this one is for visitors.)
    if (req.method === 'GET' && p === '/dasenter/order-statuses') return sendJson(res, 200, orderStatuses);
    if (req.method === 'GET' && p === '/dasenter/store-products') return sendJson(res, 200, { products: products, storeId: STORE_ID, dasenter: DASENTER });
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS' }); return res.end(); }

    // Domain Verified: prove you control this address.
    if (req.method === 'GET' && p === '/.well-known/dasenter-verify.txt') return sendText(res, 200, VERIFY_CODE || '');

    // Store ID Verified (optional): confirm this server knows the right Store ID.
    if (req.method === 'GET' && p === '/.well-known/dasenter-store-id.txt') return sendText(res, 200, STORE_ID || '');

    // The destination URL you saved in Dasenter — Pull (GET). The signature is over an EMPTY body.
    if (req.method === 'GET' && p === '/dasenter/products') {
      if (!verifySignature(req.headers['x-nexora-timestamp'], req.headers['x-nexora-signature'], '')) return sendJson(res, 401, { error: 'invalid_signature' });
      return sendJson(res, 200, { products: products });
    }

    // The same URL — Push (POST), and the Order Forwarding test.
    if (req.method === 'POST' && p === '/dasenter/products') {
      var raw = await readBody(req);
      if (!verifySignature(req.headers['x-nexora-timestamp'], req.headers['x-nexora-signature'], raw)) return sendJson(res, 401, { error: 'invalid_signature' });
      var message = JSON.parse(raw);

      // Order Forwarding: Dasenter sends a one-time challenge; call back with your Dasenter Webhooks key.
      if (message.event === 'order_forwarding.verify') {
        await fetch(DASENTER + '/api/integrations/verify-order-forwarding-callback', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + WEBHOOK_KEY },
          body: JSON.stringify({ challenge: message.data.challenge, storeId: STORE_ID })
        });
        return sendJson(res, 200, { status: 'ok' });
      }

      // Push: Dasenter sends a product.
      if (message.event === 'product.push' && message.data && message.data.sku) {
        var existing = products.filter(function (x) { return x.sku === message.data.sku; })[0];
        products = products.filter(function (x) { return x.sku !== message.data.sku; }).concat([message.data]);
        saveProducts();
        return sendJson(res, 200, { status: 'ok', action: existing ? 'updated' : 'created', productRef: message.data.sku });
      }
      return sendJson(res, 200, { status: 'ok' });
    }

    // Delete: Dasenter removes a product — signed over an EMPTY body.
    if (req.method === 'DELETE' && p.indexOf('/dasenter/products/') === 0) {
      if (!verifySignature(req.headers['x-nexora-timestamp'], req.headers['x-nexora-signature'], '')) return sendJson(res, 401, { error: 'invalid_signature' });
      var sku = decodeURIComponent(p.slice('/dasenter/products/'.length));
      products = products.filter(function (x) { return x.sku !== sku; });
      saveProducts();
      return sendJson(res, 200, { status: 'ok', sku: sku });
    }

    // Status: Dasenter tells you an order's new status.
    if (req.method === 'POST' && p === '/dasenter/orders/status') {
      var rawStatus = await readBody(req);
      if (!verifySignature(req.headers['x-nexora-timestamp'], req.headers['x-nexora-signature'], rawStatus)) return sendJson(res, 401, { error: 'invalid_signature' });
      var update = JSON.parse(rawStatus).data;
      orderStatuses[update.externalId] = update.status;
      return sendJson(res, 200, { status: 'ok' });
    }

    // Orders from your website: forward them to Dasenter with your key.
    if (req.method === 'POST' && p === '/dasenter/orders') {
      var order = JSON.parse(await readBody(req));
      var result = await forwardOrder(order);
      if (!result.ok) return sendJson(res, 502, { status: 'failed', error: result.message });
      return sendJson(res, 200, { status: 'ok' });
    }

    serveStatic(res, p);
  } catch (error) {
    sendJson(res, 500, { error: String(error && error.message) });
  }
});

server.listen(PORT, '127.0.0.1', function () {
  console.log('Dasenter connection server on http://127.0.0.1:' + PORT);
  checkApiConnection().then(function (r) { console.log(r.ok ? 'Dasenter API check: the API key works.' : 'Dasenter API check failed: ' + r.error); });
});
