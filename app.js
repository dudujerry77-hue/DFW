// Dtest's own code: shows the store's products (image, name, price) from Dasenter and an Order button
// that opens Dasenter's hosted checkout for that product. Dasenter.init runs first, in index.html.

// This store's Dasenter ID — only used to build the checkout link below.
var STORE_ID = 'cmu6q0t6j0001l2agtxrdjc4v';
// Where your Dasenter server lives — the checkout link points here.
var DASENTER = 'https://app.dasenter.com';

// Ask Dasenter for this store's products. The SDK sends GET /api/sdk/products with the public key
// (set in Dasenter.init in index.html). It returns a promise; .then() runs when the list arrives.
// `products` is a list of { id, sku, name, price, currency, imageUrl, quantity }.
Dasenter.getProducts().then(function (products) {
  // The empty <ul id="products"> in index.html — the cards get added here.
  var list = document.getElementById('products');

  // No products (or the request failed, which the SDK turns into an empty list): say so and stop.
  if (!products.length) {
    list.innerHTML = '<li>No products yet.</li>';
    return;
  }

  // Build one card for each product `p`.
  products.forEach(function (p) {
    // The card itself: an <li> styled by .product in style.css.
    var item = document.createElement('li');
    item.className = 'product';

    // The product image. alt = the name, for accessibility.
    var img = document.createElement('img');
    img.className = 'product-img';
    img.alt = p.name;
    // Use the product's image if it has one; otherwise .no-img shows the grey placeholder square.
    if (p.imageUrl) img.src = p.imageUrl;
    else img.classList.add('no-img');

    // The text, e.g. "Rice — NGN 12500". textContent (not innerHTML) so a product name can't inject HTML.
    var info = document.createElement('div');
    info.className = 'product-info';
    info.textContent = p.name + ' — ' + p.currency + ' ' + p.price;

    // The Order button: a plain link to Dasenter's hosted checkout for this product (no key needed).
    // encodeURIComponent makes the SKU safe to put in a URL; quantity=1 orders one item.
    var order = document.createElement('a');
    order.className = 'order-btn';
    order.textContent = 'Order';
    order.href = DASENTER + '/checkout/' + STORE_ID + '?sku=' + encodeURIComponent(p.sku) + '&quantity=1';
    order.target = '_blank'; // open checkout in a new tab

    // Put the image, text and Order button inside the card, then add the card to the page.
    item.appendChild(img);
    item.appendChild(info);
    item.appendChild(order);
    list.appendChild(item);
  });
});
