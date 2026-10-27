// store.js — the code all three pages share: where the server is, the cart, and the list of your orders.
// The cart and the orders are kept in this browser (localStorage), so they survive a page reload.

// The address of server.js (the PORT in .env). It is written out so the pages also work when they are opened
// from another address, such as VS Code Live Server.
var SERVER = "http://localhost:4003";

function readList(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; }
}

// ---- the cart: a list of { sku, name, price, currency, quantity } ----
function getCart() { return readList("dasenter_cart"); }
function saveCart(cart) {
  localStorage.setItem("dasenter_cart", JSON.stringify(cart));
  showCartCount();
}
function addToCart(product) {
  var cart = getCart();
  var line = cart.filter(function (l) { return l.sku === product.sku; })[0];
  if (line) { line.quantity += 1; }
  else { cart.push({ sku: product.sku, name: product.name, price: product.price, currency: product.currency, quantity: 1 }); }
  saveCart(cart);
}

// ---- your orders: a list of { id, date, total, currency, items } ----
function getOrders() { return readList("dasenter_orders"); }
function saveOrders(orders) { localStorage.setItem("dasenter_orders", JSON.stringify(orders)); }

// The "Cart (2)" number in the menu.
function showCartCount() {
  var count = getCart().reduce(function (sum, l) { return sum + l.quantity; }, 0);
  var el = document.getElementById("cart-count");
  if (el) el.textContent = count;
}
showCartCount();
