// app.js — your own code for the Frontend SDK.
// It is loaded after the Dasenter snippet in index.html, so Dasenter is already set up here.

// Must be the same Store ID you put in index.html.
var STORE_ID = 'PASTE_YOUR_STORE_ID';

// Your Dasenter server's address, taken from the SDK script tag in index.html so you only set it once, there.
var DASENTER = new URL(document.querySelector('script[src$="/sdk/nexora.js"]').src).origin;

// Optional: report a product this page shows. It goes to "Detected from your website" on the Products page
// for you to review — it never changes your real catalog by itself. Uncomment to try it.
// Dasenter.trackProduct({ sku: 'DEMO-001', name: 'Demo product', price: 1000, currency: 'NGN' });

// Show your real catalog from Dasenter, each product with its image and an Order button.
Dasenter.getProducts().then(function (products) {
  // each product: { id, sku, name, price, currency, imageUrl, quantity }
  var list = document.getElementById('products');

  if (!products.length) {
    list.innerHTML = '<li>No products yet.</li>';
    return;
  }

  products.forEach(function (p) {
    var item = document.createElement('li');

    var img = document.createElement('img');
    img.alt = p.name;
    img.width = 64;
    img.height = 64;
    if (p.imageUrl) img.src = p.imageUrl;

    var info = document.createElement('span');
    info.textContent = ' ' + p.name + ' — ' + p.currency + ' ' + p.price + ' ';

    // Dasenter Checkout takes the order for you — a plain link, no server and no key on your site.
    var order = document.createElement('a');
    order.textContent = 'Order';
    order.href = DASENTER + '/checkout/' + STORE_ID + '?sku=' + encodeURIComponent(p.sku) + '&quantity=1';
    order.target = '_blank';

    item.appendChild(img);
    item.appendChild(info);
    item.appendChild(order);
    list.appendChild(item);
  });
});
