/* ============================================================
   SignageWorks Configurator — JavaScript App
   ============================================================
   Single-page configurator extracted from the prototype HTML.
   Reads catalog data from <script id="configurator-catalog">
   (rendered by snippets/configurator-catalog.liquid) and mounts
   into the markup rendered by sections/configurator-app.liquid.

   Wait for DOMContentLoaded, then render(). Cart "Add to Cart"
   posts to /cart/add.js using the per-sign-type variant ID from
   the catalog snippet.

   TODO (deploy step): Replace data: URL logo handling with a
   POST to /api/upload-logo that returns a Shopify Files CDN URL.
   See addLineItemToShopifyCart() below.
   ============================================================ */

(function () {
  'use strict';

  /* ====================================================================
     CATALOG / MATERIALS / SHAPES / BACKGROUNDS / FONTS
     Loaded from the inline JSON the Liquid snippet emits.
     ==================================================================== */
  let CATALOG, MATERIALS, SHAPES, BACKGROUNDS, FONTS, CATEGORY_ORDER;

  function loadCatalog() {
    const node = document.getElementById('configurator-catalog');
    if (!node) {
      console.error('[configurator] Missing #configurator-catalog snippet.');
      return false;
    }
    let data;
    try {
      data = JSON.parse(node.textContent);
    } catch (e) {
      console.error('[configurator] Failed to parse catalog JSON', e);
      return false;
    }
    CATALOG        = data.catalog        || {};
    MATERIALS      = data.materials      || {};
    SHAPES         = data.shapes         || {};
    BACKGROUNDS    = data.backgrounds    || {};
    FONTS          = data.fonts          || {};
    CATEGORY_ORDER = data.category_order || [];
    return true;
  }

  /* ====================================================================
     STATE
     ==================================================================== */
  const STEPS = ['Sign Type', 'Material', 'Size', 'Shape', 'Background', 'Logo', 'Customize', 'Quantity', 'Review'];
  const state = {
    step: 1,
    signTypeKey: null,
    material: null,
    sizeIndex: null,
    shape: null,
    background: null,
    logoDataUrl: null,
    font: 'modern-sans',
    textValues: {},
    quantity: 1,
    approvalName: ''
  };

  /* ============= CART STATE (in-memory; mirrored to Shopify cart on add) ============= */
  const cart = [];

  function addCurrentToCart() {
    const sign = CATALOG[state.signTypeKey];
    const size = sign.sizes[state.sizeIndex];
    const unit = size[state.material];
    const item = {
      id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      signKey: state.signTypeKey,
      signName: sign.name,
      category: sign.category,
      // Variant ID is per material × size combination (see configurator-catalog.liquid).
      // Each size entry carries a `variantIds` map keyed by material key (metro/summit).
      shopify_variant_id: (size.variantIds && size.variantIds[state.material]) || null,
      material: state.material,
      materialName: MATERIALS[state.material].name,
      sizeIndex: state.sizeIndex,
      sizeLabel: size.label,
      shape: state.shape,
      background: state.background,
      font: state.font,
      logoDataUrl: state.logoDataUrl,
      textValues: Object.assign({}, state.textValues),
      quantity: state.quantity,
      approvalName: state.approvalName,
      unitPrice: unit,
      subtotal: unit * state.quantity,
      addedAt: new Date().toISOString()
    };
    cart.push(item);
    updateCartBadge();
    // Fire-and-forget Shopify cart sync. Failure here is logged but doesn't block UI.
    addLineItemToShopifyCart(item).catch(err => console.warn('[configurator] Shopify cart sync failed', err));
  }

  /* ============================================================
     Shopify cart integration
     ============================================================
     Posts the configured sign to /cart/add.js as one line item.
     Design choices go through as line item properties (prefixed
     with `_` so they show on the order but are hidden from the
     customer-facing cart line item display in many themes).

     The variant ID is loaded from the catalog snippet — make sure
     the placeholder values are replaced with real Shopify variant
     IDs before going live.

     TODO: For large data: URL logos, swap this for an upload to
     Shopify Files CDN via a /api/upload-logo backend endpoint
     and pass the resulting public URL in _logo_url instead.
     ============================================================ */
  async function addLineItemToShopifyCart(cartItem) {
    if (!cartItem.shopify_variant_id || String(cartItem.shopify_variant_id).indexOf('VARIANT_ID_PLACEHOLDER') === 0) {
      console.warn('[configurator] No Shopify variant ID configured for', cartItem.signKey, '— skipping /cart/add.js POST.');
      return null;
    }
    const response = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: cartItem.shopify_variant_id,
        quantity: cartItem.quantity,
        properties: {
          '_sign_type_key':      cartItem.signKey,
          '_sign_type_name':     cartItem.signName,
          '_sign_category':      cartItem.category,
          '_material_key':       cartItem.material,
          '_material_name':      cartItem.materialName,
          '_size_label':         cartItem.sizeLabel,
          '_shape':              cartItem.shape,
          '_background':         cartItem.background,
          '_font':               cartItem.font,
          '_logo_url':           cartItem.logoDataUrl || '',
          '_text_values':        JSON.stringify(cartItem.textValues),
          '_approval_signature': cartItem.approvalName,
          '_unit_price':         cartItem.unitPrice,
          '_subtotal':           cartItem.subtotal
        }
      })
    });
    return response.json();
  }

  function updateCartBadge() {
    const badge = document.getElementById('cart-badge-num');
    if (!badge) return;
    const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
    if (totalQty > 0) {
      badge.textContent = totalQty > 99 ? '99+' : totalQty;
      badge.classList.add('visible');
    } else {
      badge.classList.remove('visible');
    }
  }

  function renderCartThumb(item) {
    // Temporarily put state into the item's config, render, restore
    const saved = {
      signTypeKey: state.signTypeKey, sizeIndex: state.sizeIndex, shape: state.shape,
      background: state.background, material: state.material, font: state.font,
      logoDataUrl: state.logoDataUrl, textValues: state.textValues
    };
    state.signTypeKey = item.signKey;
    state.sizeIndex = item.sizeIndex;
    state.shape = item.shape;
    state.background = item.background;
    state.material = item.material;
    state.font = item.font;
    state.logoDataUrl = item.logoDataUrl;
    state.textValues = item.textValues;
    const svg = renderSignSVG();
    Object.assign(state, saved);
    return svg;
  }

  function openCartView() {
    document.getElementById('cart-view-modal').classList.remove('hidden');
    renderCartView();
    renderSavedCartsList();
  }

  function renderCartView() {
    const list = document.getElementById('cart-list');
    const summary = document.getElementById('cart-summary');
    const checkoutBtn = document.getElementById('cart-checkout-btn');
    if (!list) return;
    list.innerHTML = '';
    if (cart.length === 0) {
      list.innerHTML = '<div class="cart-empty"><div class="icon">🛒</div><div>Your cart is empty.</div><div style="margin-top: 6px; font-size: 12px;">Design a sign and add it to your cart to get started.</div></div>';
      summary.innerHTML = '';
      checkoutBtn.disabled = true;
      return;
    }
    let total = 0;
    let totalQty = 0;
    cart.forEach(item => {
      total += item.subtotal;
      totalQty += item.quantity;
      const row = el(
        '<div class="cart-row">' +
          '<div class="cart-thumb">' + renderCartThumb(item) + '</div>' +
          '<div class="cart-info">' +
            '<div class="cart-name">' + esc(item.signName) + '</div>' +
            '<div class="cart-meta">' + esc(item.materialName) + ' · ' + esc(item.sizeLabel) + ' · Qty ' + item.quantity + '</div>' +
          '</div>' +
          '<div class="cart-price">$' + item.subtotal.toLocaleString() + '</div>' +
          '<button class="cart-remove" data-id="' + item.id + '" title="Remove">×</button>' +
        '</div>'
      );
      list.appendChild(row);
    });
    list.querySelectorAll('.cart-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const idx = cart.findIndex(i => i.id === id);
        if (idx >= 0) cart.splice(idx, 1);
        updateCartBadge();
        renderCartView();
      });
    });
    summary.innerHTML =
      '<div class="cart-summary-row"><span class="label">Items</span><span class="val">' + cart.length + '</span></div>' +
      '<div class="cart-summary-row"><span class="label">Total Qty</span><span class="val">' + totalQty + '</span></div>' +
      '<div class="cart-summary-row"><span class="label">Free Shipping</span><span class="val" style="color: var(--cyan);">Included</span></div>' +
      '<div class="cart-summary-row total"><span class="label">Subtotal</span><span class="val">$' + total.toLocaleString() + '</span></div>';
    checkoutBtn.disabled = false;
  }

  /* ============= SAVE / LOAD CART ============= */
  function saveCurrentCart() {
    if (cart.length === 0) { alert('Your cart is empty.'); return; }
    const defaultName = 'Cart ' + new Date().toLocaleDateString();
    const name = prompt('Name this saved cart:', defaultName);
    if (!name) return;
    try {
      const saved = JSON.parse(localStorage.getItem('sw_saved_carts') || '{}');
      saved[name] = { items: cart, savedAt: new Date().toISOString() };
      localStorage.setItem('sw_saved_carts', JSON.stringify(saved));
      renderSavedCartsList();
      alert('Cart saved as "' + name + '".');
    } catch (e) { console.error(e); alert('Could not save cart.'); }
  }

  function loadSavedCart(name) {
    try {
      const saved = JSON.parse(localStorage.getItem('sw_saved_carts') || '{}');
      if (!saved[name]) return;
      cart.length = 0;
      saved[name].items.forEach(i => cart.push(i));
      updateCartBadge();
      renderCartView();
    } catch (e) { console.error(e); }
  }

  function deleteSavedCart(name) {
    if (!confirm('Delete saved cart "' + name + '"?')) return;
    try {
      const saved = JSON.parse(localStorage.getItem('sw_saved_carts') || '{}');
      delete saved[name];
      localStorage.setItem('sw_saved_carts', JSON.stringify(saved));
      renderSavedCartsList();
    } catch (e) { console.error(e); }
  }

  function renderSavedCartsList() {
    const section = document.getElementById('saved-carts-section');
    const listEl = document.getElementById('saved-carts-list');
    if (!section) return;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('sw_saved_carts') || '{}'); } catch (e) {}
    const names = Object.keys(saved);
    if (names.length === 0) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    listEl.innerHTML = '';
    names.forEach(name => {
      const c = saved[name];
      const itemCount = c.items.length;
      const when = new Date(c.savedAt).toLocaleString();
      const row = el(
        '<div class="saved-cart-row">' +
          '<div><div class="name">' + esc(name) + '</div><div class="when">' + itemCount + ' item' + (itemCount === 1 ? '' : 's') + ' · ' + esc(when) + '</div></div>' +
          '<div class="actions">' +
            '<button class="load" data-load="' + escAttr(name) + '">Load</button>' +
            '<button class="delete" data-del="' + escAttr(name) + '">Delete</button>' +
          '</div>' +
        '</div>'
      );
      row.querySelector('.load').addEventListener('click', () => loadSavedCart(name));
      row.querySelector('.delete').addEventListener('click', () => deleteSavedCart(name));
      listEl.appendChild(row);
    });
  }

  /* ============= CHECKOUT FLOW ============= */
  function openCheckout() {
    // For a real Shopify deployment, simply navigate to /checkout:
    //   window.location.href = '/checkout';
    // The configurator's "in-memory" cart has already been synced to Shopify's cart
    // via /cart/add.js inside addLineItemToShopifyCart, so /checkout has what it needs.
    //
    // The placeholder modal below mirrors the prototype's UX so the page is testable
    // before merchants connect real variants. Once variant IDs are filled in, you can
    // switch this to: window.location.href = '/checkout';
    document.getElementById('cart-view-modal').classList.add('hidden');
    document.getElementById('checkout-modal').classList.remove('hidden');
    renderCheckoutSummary();
    renderDeliveryEstimate();
  }

  function renderCheckoutSummary() {
    const summary = document.getElementById('checkout-summary');
    if (!summary) return;
    let total = 0, totalQty = 0;
    cart.forEach(i => { total += i.subtotal; totalQty += i.quantity; });
    summary.innerHTML =
      '<div class="cart-summary-row"><span class="label">Items in Cart</span><span class="val">' + cart.length + '</span></div>' +
      '<div class="cart-summary-row"><span class="label">Total Qty</span><span class="val">' + totalQty + '</span></div>' +
      '<div class="cart-summary-row"><span class="label">Free Shipping (FedEx Ground)</span><span class="val" style="color: var(--cyan);">$0</span></div>' +
      '<div class="cart-summary-row total"><span class="label">Total</span><span class="val">$' + total.toLocaleString() + '</span></div>';
  }

  function renderDeliveryEstimate() {
    const d = new Date();
    let hoursLeft = 36;
    while (hoursLeft > 0) {
      d.setHours(d.getHours() + 1);
      const day = d.getDay();
      if (day !== 0 && day !== 6) hoursLeft -= 1;
    }
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const elE = document.getElementById('delivery-est-date');
    if (elE) elE.textContent = dateStr;
  }

  /* ============= WIRE-UP (called from DOMContentLoaded) ============= */
  function initCartUI() {
    const cartBtn = document.getElementById('header-cart-btn');
    if (cartBtn) cartBtn.addEventListener('click', openCartView);

    const saveBtn = document.getElementById('cart-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveCurrentCart);

    const keepBtn = document.getElementById('cart-keep-shopping');
    if (keepBtn) keepBtn.addEventListener('click', () => {
      document.getElementById('cart-view-modal').classList.add('hidden');
      state.step = 1;
      state.signTypeKey = null; state.material = null; state.sizeIndex = null;
      state.shape = null; state.background = null; state.logoDataUrl = null;
      state.textValues = {}; state.quantity = 1; state.approvalName = '';
      render();
    });

    const checkoutBtn = document.getElementById('cart-checkout-btn');
    if (checkoutBtn) checkoutBtn.addEventListener('click', openCheckout);

    const placeOrderBtn = document.getElementById('checkout-place-order');
    if (placeOrderBtn) placeOrderBtn.addEventListener('click', () => {
      // In production, redirect into Shopify's secure checkout. The cart was synced
      // server-side via /cart/add.js when each item was approved & added.
      window.location.href = '/checkout';
    });

    document.querySelectorAll('.modal-overlay').forEach(o => {
      o.addEventListener('click', (e) => { if (e.target === o) o.classList.add('hidden'); });
    });

    updateCartBadge();
  }

  const STEP_TITLES = {
    1: { title: 'Choose Your Sign',           sub: 'Pick the apartment sign you need. Sizes and pricing are preset for each.' },
    2: { title: 'Choose Your Material',       sub: 'Metro Beach (acrylic) or Summit View (J-Bond aluminum). Only materials available for your sign are shown.' },
    3: { title: 'Choose Your Size',           sub: 'Pick from the standard sizes available for this sign.' },
    4: { title: 'Choose Your Shape',          sub: 'Predetermined shapes that work in production. Each sign allows the shapes that fit it.' },
    5: { title: 'Choose Your Background',     sub: 'Pick the background design — the look and feel of your sign panel.' },
    6: { title: 'Upload Your Property Logo',  sub: 'Drop your logo file. We auto-convert it to a transparent PNG. Optional — skip if you do not have one ready.' },
    7: { title: 'Customize Your Sign',        sub: 'Pick your font and type the text for your sign. Your live proof updates as you go.' },
    8: { title: 'How Many Do You Need?',      sub: 'Average apartment community orders ~180 signs in a refresh. No quantity discounts — your shipping &amp; artwork are already free.' },
    9: { title: 'Approve Your Proof',         sub: 'Final review. Approve and add to cart, or jump back to make changes.' }
  };

  /* ====================================================================
     RENDERING
     ==================================================================== */
  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  function esc(s) { return String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
  function escAttr(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function render() {
    // Toggle .step-1 on the .configurator-page wrapper (not body — Shopify owns body)
    const page = document.querySelector('.configurator-page');
    if (page) page.classList.toggle('step-1', state.step === 1);
    renderStepIndicator();
    renderStepHeader();
    renderStepBody();
    renderPreview();
    renderPrice();
    renderNavButtons();
  }

  function renderStepIndicator() {
    const nav = document.getElementById('step-indicator');
    if (!nav) return;
    nav.innerHTML = '';
    STEPS.forEach((label, idx) => {
      const n = idx + 1;
      const cls = n === state.step ? 'active' : (n < state.step ? 'done' : (canJumpTo(n) ? '' : 'locked'));
      const pill = el('<div class="step-pill ' + cls + '" data-step="' + n + '"><span class="num">' + n + '</span><span>' + label + '</span></div>');
      pill.addEventListener('click', () => { if (canJumpTo(n)) { state.step = n; render(); } });
      nav.appendChild(pill);
      if (idx < STEPS.length - 1) nav.appendChild(el('<span class="step-arrow">›</span>'));
    });
  }
  function canJumpTo(n) { return n <= furthestStepReached(); }
  function furthestStepReached() {
    let s = 1;
    if (state.signTypeKey) s = Math.max(s, 2);
    if (state.material) s = Math.max(s, 3);
    if (state.sizeIndex !== null) s = Math.max(s, 4);
    if (state.shape) s = Math.max(s, 5);
    if (state.background) s = Math.max(s, 6);
    s = Math.max(s, 7);
    if (Object.keys(state.textValues).length > 0) s = Math.max(s, 8);
    if (state.quantity > 0) s = Math.max(s, 9);
    return Math.max(s, state.step);
  }

  function renderStepHeader() {
    document.getElementById('step-eyebrow').textContent = 'Step ' + state.step + ' of 9';
    document.getElementById('step-title').innerHTML = STEP_TITLES[state.step].title;
    document.getElementById('step-sub').innerHTML = STEP_TITLES[state.step].sub;
  }

  function renderStepBody() {
    const body = document.getElementById('step-body');
    body.innerHTML = '';
    if (state.step >= 2 && state.signTypeKey) {
      body.appendChild(renderSignContextBar());
    }
    switch (state.step) {
      case 1: renderSignTypeStep(body); break;
      case 2: renderMaterialStep(body); break;
      case 3: renderSizeStep(body); break;
      case 4: renderShapeStep(body); break;
      case 5: renderBackgroundStep(body); break;
      case 6: renderLogoStep(body); break;
      case 7: renderDesignTextStep(body); break;
      case 8: renderQuantityStep(body); break;
      case 9: renderReviewStep(body); break;
    }
  }

  function renderSignContextBar() {
    const sign = CATALOG[state.signTypeKey];
    const matName = state.material ? MATERIALS[state.material].name : '—';
    const sizeLabel = state.sizeIndex !== null ? sign.sizes[state.sizeIndex].label : '—';
    const isProof = state.step === 9;
    const thumb = isProof ? renderSignSVG() : generateSignThumbnail(state.signTypeKey);
    const btnLabel = isProof ? 'View Proof' : 'View Example';
    const ttl = isProof ? 'Click to view your full-size proof' : 'Click to view full-size example';
    const bar = el(
      '<div class="sign-context-bar">' +
        '<div class="sign-context-thumb" id="ctx-thumb" title="' + ttl + '">' + thumb + '</div>' +
        '<div class="sign-context-info">' +
          '<div class="sign-context-name">' + sign.name + '</div>' +
          '<div class="sign-context-meta">' + sign.category + ' · ' + sizeLabel + ' · ' + matName + '</div>' +
        '</div>' +
        '<div class="sign-context-view" id="ctx-view">' + btnLabel + '</div>' +
      '</div>'
    );
    bar.querySelector('#ctx-thumb').addEventListener('click', () => showExampleModal(state.signTypeKey, isProof));
    bar.querySelector('#ctx-view').addEventListener('click', () => showExampleModal(state.signTypeKey, isProof));
    return bar;
  }

  /* ----- Step 1: Sign Type ----- */
  function renderSignTypeStep(body) {
    const groups = {};
    Object.entries(CATALOG).forEach(([key, sign]) => {
      if (!groups[sign.category]) groups[sign.category] = [];
      groups[sign.category].push([key, sign]);
    });
    CATEGORY_ORDER.forEach(catName => {
      if (!groups[catName] || groups[catName].length === 0) return;
      const header = el('<div style="font-size: 11px; font-weight: 800; color: var(--cyan); letter-spacing: 0.12em; text-transform: uppercase; margin: 18px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border);">' + catName + '</div>');
      body.appendChild(header);
      const grid = el('<div class="option-grid"></div>');
      groups[catName].forEach(([key, sign]) => {
        const sel = state.signTypeKey === key ? 'selected' : '';
        const prices = sign.sizes.flatMap(s => sign.materials.map(m => s[m]).filter(p => p != null));
        const minPrice = prices.length ? Math.min(...prices) : null;
        const priceLine = minPrice != null ? 'From $' + minPrice : '';
        const matBadges = sign.materials.map(m => '<span class="badge" style="margin-right:4px; font-size:10px; padding:2px 8px;">' + MATERIALS[m].name + '</span>').join('');
        const thumb = generateSignThumbnail(key);
        const card = el(
          '<div class="option-card ' + sel + '">' +
            '<div class="sign-card-thumb" data-view="' + key + '" title="Click to view full-size example">' + thumb + '</div>' +
            '<div class="option-name">' + sign.name + '</div>' +
            '<div class="option-meta">' + sign.category + '</div>' +
            '<div class="option-desc">' + sign.desc + '</div>' +
            '<div style="margin-top: 8px;">' + matBadges + '</div>' +
            '<div style="font-size: 13px; color: var(--yellow); margin-top: 8px; font-weight: 700;">' + priceLine + '</div>' +
          '</div>'
        );
        card.addEventListener('click', (e) => {
          if (e.target.closest('.sign-card-thumb')) { e.stopPropagation(); showExampleModal(key); return; }
          if (state.signTypeKey !== key) clearFrom('signTypeKey');
          state.signTypeKey = key;
          const sgn = CATALOG[key];
          state.shape = sgn.shapes[0];
          state.background = sgn.defaultBg;
          state.sizeIndex = 0;
          if (sgn.materials.length === 1) state.material = sgn.materials[0];
          state.textValues = {};
          sgn.textFields.forEach(f => state.textValues[f.key] = f.default);
          state.step = 2;
          render();
        });
        grid.appendChild(card);
      });
      body.appendChild(grid);
    });
    body.appendChild(el('<div class="phase2-note">📌 Phase 2: Now Leasing / Move-in Special / Welcome Home banners (Marketing Signs &amp; Print category)</div>'));
  }

  function generateSignThumbnail(signKey) {
    const sign = CATALOG[signKey];
    if (!sign) return '';
    const savedState = Object.assign({}, state, { textValues: Object.assign({}, state.textValues) });
    state.signTypeKey = signKey;
    state.sizeIndex = 0;
    state.shape = sign.shapes[0];
    state.background = sign.defaultBg;
    state.material = sign.materials[0];
    state.textValues = {};
    sign.textFields.forEach(f => state.textValues[f.key] = f.default);
    const svg = renderSignSVG();
    state.signTypeKey = savedState.signTypeKey;
    state.sizeIndex = savedState.sizeIndex;
    state.shape = savedState.shape;
    state.background = savedState.background;
    state.material = savedState.material;
    state.textValues = savedState.textValues;
    return svg;
  }

  function showExampleModal(signKey, useCurrent) {
    const sign = CATALOG[signKey];
    const svg = useCurrent ? renderSignSVG() : generateSignThumbnail(signKey);
    let exModal = document.getElementById('example-modal');
    if (!exModal) {
      exModal = el(
        '<div class="modal-overlay hidden" id="example-modal">' +
          '<div class="example-modal-content">' +
            '<div id="example-modal-eyebrow" style="font-size: 11px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: var(--cyan); margin-bottom: 4px;">EXAMPLE</div>' +
            '<h2 id="example-modal-title" style="margin-bottom: 6px;">Sign Name</h2>' +
            '<p id="example-modal-meta" style="color: var(--muted); font-size: 13px; margin-bottom: 16px;"></p>' +
            '<div class="example-sign-render" id="example-sign-render"></div>' +
            '<p id="example-modal-foot" style="font-size: 12px; color: var(--muted); margin-bottom: 14px;">This is an example layout. You\'ll customize the text, logo, and design in the next steps.</p>' +
            '<button class="btn btn-primary" id="example-modal-close">Close</button>' +
          '</div>' +
        '</div>'
      );
      document.body.appendChild(exModal);
      document.getElementById('example-modal-close').addEventListener('click', () => exModal.classList.add('hidden'));
      exModal.addEventListener('click', (e) => { if (e.target === exModal) exModal.classList.add('hidden'); });
    }
    const mat = state.material ? MATERIALS[state.material].name : sign.materials.map(m => MATERIALS[m].name).join(' or ');
    const size = state.sizeIndex !== null ? sign.sizes[state.sizeIndex].label : sign.sizes[0].label;
    if (useCurrent) {
      document.getElementById('example-modal-eyebrow').textContent = 'YOUR PROOF';
      document.getElementById('example-modal-eyebrow').style.color = 'var(--magenta)';
      document.getElementById('example-modal-title').textContent = sign.name + ' — Approve Your Design';
      document.getElementById('example-modal-meta').textContent = sign.category + ' · ' + size + ' · ' + mat;
      document.getElementById('example-modal-foot').innerHTML = '<strong style="color: var(--magenta);">This is your customized proof.</strong> Approve it below to add to cart.';
    } else {
      document.getElementById('example-modal-eyebrow').textContent = 'EXAMPLE';
      document.getElementById('example-modal-eyebrow').style.color = 'var(--cyan)';
      document.getElementById('example-modal-title').textContent = sign.name;
      document.getElementById('example-modal-meta').textContent = sign.category + ' · ' + sign.sizes[0].label + ' · Available in ' + sign.materials.map(m => MATERIALS[m].name).join(' or ');
      document.getElementById('example-modal-foot').textContent = "This is an example layout. You'll customize the text, logo, and design in the next steps.";
    }
    document.getElementById('example-sign-render').innerHTML = svg;
    exModal.classList.remove('hidden');
  }

  /* ----- Step 2: Material ----- */
  function renderMaterialStep(body) {
    if (!state.signTypeKey) { body.innerHTML = '<p style="color: var(--muted); font-size: 13px;">Pick a sign first.</p>'; return; }
    const sign = CATALOG[state.signTypeKey];

    body.appendChild(el(
      '<div class="material-callout">' +
        'Your sign comes in two professional-grade material choices. <strong>Metro Beach</strong> is reverse-printed acrylic — a glass-like premium finish. <strong>Summit View</strong> is custom-printed J-Bond aluminum composite — durable, weather-tough, and lighter. Both are built to last.' +
      '</div>'
    ));

    const grid = el('<div class="option-grid"></div>');
    Object.values(MATERIALS).forEach(m => {
      const available = sign.materials.includes(m.key);
      if (!available) return;
      const sel = state.material === m.key ? 'selected' : '';
      const samplePrice = sign.sizes[0][m.key];
      const card = el(
        '<div class="option-card ' + sel + '">' +
          '<div style="height:6px; background:' + m.accent + '; border-radius:3px; margin-bottom:10px;"></div>' +
          '<div class="option-name">' + m.name + '</div>' +
          '<div class="option-meta">' + m.substrate + '</div>' +
          '<div class="option-desc">' + m.desc + '</div>' +
          (samplePrice != null ? '<div style="font-size: 14px; color: var(--yellow); margin-top: 10px; font-weight: 700;">$' + samplePrice + '<span style="font-size: 11px; color: var(--muted); font-weight: 400;"> · ' + sign.sizes[0].label + '</span></div>' : '') +
        '</div>'
      );
      card.addEventListener('click', () => { state.material = m.key; render(); });
      grid.appendChild(card);
    });
    body.appendChild(grid);
    if (sign.materials.length === 1) {
      body.appendChild(el('<p style="margin-top: 14px; font-size: 12px; color: var(--muted);">This sign type is only available in ' + MATERIALS[sign.materials[0]].name + '.</p>'));
    }
  }

  /* ----- Step 3: Size ----- */
  function renderSizeStep(body) {
    if (!state.signTypeKey) { body.innerHTML = '<p style="color: var(--muted); font-size: 13px;">Pick a sign first.</p>'; return; }
    const sign = CATALOG[state.signTypeKey];
    const row = el('<div class="size-btn-row"></div>');
    sign.sizes.forEach((sz, idx) => {
      const sel = state.sizeIndex === idx ? 'selected' : '';
      const price = sz[state.material];
      const btn = el('<button class="size-btn ' + sel + '">' + sz.label + '<div style="font-size:11px; opacity:0.8; margin-top:2px;">$' + price + '</div></button>');
      btn.addEventListener('click', () => { state.sizeIndex = idx; render(); });
      row.appendChild(btn);
    });
    body.appendChild(row);
    if (sign.sizes.length === 1) {
      body.appendChild(el('<p style="margin-top: 14px; font-size: 12px; color: var(--muted);">This sign comes in one standard size. Just hit Continue.</p>'));
    } else {
      body.appendChild(el('<p style="margin-top: 14px; font-size: 12px; color: var(--muted);">Sizes are fixed standards. Custom sizes are not offered in v1 — this keeps production fast and pricing predictable.</p>'));
    }
  }

  /* ----- Step 4: Shape ----- */
  function renderShapeStep(body) {
    if (!state.signTypeKey) { body.innerHTML = '<p style="color: var(--muted); font-size: 13px;">Pick a sign first.</p>'; return; }
    const sign = CATALOG[state.signTypeKey];
    const grid = el('<div class="shape-grid"></div>');
    Object.entries(SHAPES).forEach(([key, s]) => {
      if (!sign.shapes.includes(key)) return;
      const sel = state.shape === key ? 'selected' : '';
      const card = el(
        '<div class="shape-card ' + sel + '">' +
          '<div class="shape-mini">' + shapePreviewSVG(key) + '</div>' +
          '<div class="shape-name">' + s.name + '</div>' +
        '</div>'
      );
      card.addEventListener('click', () => { state.shape = key; render(); });
      grid.appendChild(card);
    });
    body.appendChild(grid);
    body.appendChild(el('<p style="margin-top: 12px; font-size: 12px; color: var(--muted);">Predetermined shapes ensure clean production cuts. Only shapes that work with this sign type are shown.</p>'));
  }

  function shapePreviewSVG(shape) {
    const W = 80, H = 50;
    let path = '';
    switch (shape) {
      case 'rectangle': path = '<rect x="2" y="2" width="' + (W - 4) + '" height="' + (H - 4) + '" fill="#00AEEF"/>'; break;
      case 'rounded':   path = '<rect x="2" y="2" width="' + (W - 4) + '" height="' + (H - 4) + '" rx="8" ry="8" fill="#EC008C"/>'; break;
      case 'monument':  path = '<path d="M 2 ' + (H - 2) + ' L 2 ' + (H * 0.4) + ' C 2 0 ' + (W - 2) + ' 0 ' + (W - 2) + ' ' + (H * 0.4) + ' L ' + (W - 2) + ' ' + (H - 2) + ' Z" fill="#FFD700"/>'; break;
      case 'capsule':   path = '<rect x="2" y="2" width="' + (W - 4) + '" height="' + (H - 4) + '" rx="' + ((H - 4) / 2) + '" fill="#00AEEF"/>'; break;
      case 'shield':    path = '<path d="M 4 4 L ' + (W - 4) + ' 4 L ' + (W - 4) + ' ' + (H * 0.55) + ' Q ' + (W - 4) + ' ' + (H - 4) + ' ' + (W / 2) + ' ' + (H - 4) + ' Q 4 ' + (H - 4) + ' 4 ' + (H * 0.55) + ' Z" fill="#EC008C"/>'; break;
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '">' + path + '</svg>';
  }

  /* ----- Step 5: Background ----- */
  function renderBackgroundStep(body) {
    const grid = el('<div class="option-grid"></div>');
    Object.entries(BACKGROUNDS).forEach(([key, bg]) => {
      const sel = state.background === key ? 'selected' : '';
      const waveStyle = bg.wave
        ? 'background: linear-gradient(135deg, #0a2540 0%, #1a4a7a 50%, #2980b9 100%);'
        : 'background: ' + bg.fg + ';';
      const card = el(
        '<div class="option-card ' + sel + '">' +
          '<div class="bg-swatch" style="' + waveStyle + '">' +
            '<div class="strip" style="background:' + bg.accent + ';"></div>' +
          '</div>' +
          '<div class="option-name">' + bg.name + '</div>' +
        '</div>'
      );
      card.addEventListener('click', () => { state.background = key; render(); });
      grid.appendChild(card);
    });
    body.appendChild(grid);
  }

  /* ----- Step 6: Logo ----- */
  function renderLogoStep(body) {
    const hasLogo = !!state.logoDataUrl;
    const dz = el(
      '<div>' +
        '<div class="logo-dropzone ' + (hasLogo ? 'has-logo' : '') + '" id="logo-dz">' +
          (hasLogo
            ? '<img src="' + state.logoDataUrl + '" class="logo-preview-img" alt="Property Logo"/><div class="logo-text" style="margin-top:8px;">Logo Uploaded</div><div class="logo-sub">Click to replace</div>'
            : '<div class="logo-icon">📷</div><div class="logo-text">Drop your property logo here</div><div class="logo-sub">PNG, JPG, SVG, or AI. We auto-convert to transparent PNG.</div>'
          ) +
        '</div>' +
        '<input type="file" id="logo-input" accept="image/*" style="display:none">' +
        '<div class="logo-skip">' +
          'Don\'t have a logo handy? <a id="logo-skip-link">Skip for now</a> — your text-only sign will still look sharp.' +
        '</div>' +
      '</div>'
    );
    body.appendChild(dz);
    const dzEl = document.getElementById('logo-dz');
    const input = document.getElementById('logo-input');
    dzEl.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      // TODO (deploy): POST file to /api/upload-logo, get back Shopify Files CDN URL,
      // and store THAT in state.logoDataUrl instead of the data: URL. The cart line-item
      // property has a length limit and data: URLs commonly blow past it for real logos.
      const reader = new FileReader();
      reader.onload = () => { state.logoDataUrl = reader.result; render(); };
      reader.readAsDataURL(file);
    });
    document.getElementById('logo-skip-link').addEventListener('click', () => {
      state.logoDataUrl = null;
      state.step = 7;
      render();
    });
  }

  /* ----- Step 7: Design & Text ----- */
  function renderDesignTextStep(body) {
    if (!state.signTypeKey) { body.innerHTML = '<p style="color: var(--muted); font-size: 13px;">Pick a sign first.</p>'; return; }
    const sign = CATALOG[state.signTypeKey];

    const fontOpts = Object.entries(FONTS).map(([key, f]) => {
      const sel = state.font === key ? 'selected' : '';
      return '<option value="' + key + '" ' + sel + ' style="font-family: ' + f.family + '; font-weight: ' + f.weight + ';">' + f.name + '</option>';
    }).join('');
    const fontSection = el(
      '<div class="design-section">' +
        '<div class="design-section-title">Font</div>' +
        '<div class="font-dropdown-wrap">' +
          '<select class="font-dropdown" id="font-select">' + fontOpts + '</select>' +
        '</div>' +
        '<div class="font-preview-card">' +
          '<div class="font-preview-label">Preview</div>' +
          '<div class="font-preview-sample" id="font-preview-sample" style="font-family: ' + FONTS[state.font].family + '; font-weight: ' + FONTS[state.font].weight + ';">' + FONTS[state.font].sample + '</div>' +
        '</div>' +
      '</div>'
    );
    body.appendChild(fontSection);
    const fontSelect = fontSection.querySelector('#font-select');
    fontSelect.addEventListener('change', (e) => {
      state.font = e.target.value;
      const f = FONTS[state.font];
      const prev = fontSection.querySelector('#font-preview-sample');
      prev.style.fontFamily = f.family;
      prev.style.fontWeight = f.weight;
      prev.textContent = f.sample;
      renderPreview();
    });

    const textSection = el(
      '<div class="design-section">' +
        '<div class="design-section-title">Sign Text</div>' +
        '<div id="text-fields"></div>' +
      '</div>'
    );
    body.appendChild(textSection);
    const fieldsHost = textSection.querySelector('#text-fields');
    sign.textFields.forEach(f => {
      const cur = state.textValues[f.key] != null ? state.textValues[f.key] : f.default;
      let inputHtml = '';
      if (f.options) {
        const opts = f.options.map(o => '<option value="' + o + '" ' + (o === cur ? 'selected' : '') + '>' + o + '</option>').join('');
        inputHtml = '<select class="field-input" data-key="' + f.key + '">' + opts + '</select>';
      } else if (f.multiline) {
        inputHtml = '<textarea class="field-textarea" data-key="' + f.key + '">' + escAttr(cur) + '</textarea>';
      } else {
        inputHtml = '<input class="field-input" data-key="' + f.key + '" value="' + escAttr(cur) + '">';
      }
      const group = el('<div class="field-group"><label class="field-label">' + f.label + '</label>' + inputHtml + '</div>');
      fieldsHost.appendChild(group);
      const input = group.querySelector('[data-key]');
      const evt = input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(evt, (e) => { state.textValues[f.key] = e.target.value; renderPreview(); });
    });

    body.appendChild(el('<p style="margin-top: 4px; font-size: 12px; color: var(--muted);">Your sign updates live in the preview as you type. Text is auto-positioned within safe zones for production consistency across your community.</p>'));
  }

  /* ----- Step 8: Quantity ----- */
  function renderQuantityStep(body) {
    const row = el(
      '<div>' +
        '<div class="qty-row">' +
          '<button class="qty-btn" id="qty-minus">−</button>' +
          '<div class="qty-display" id="qty-display">' + state.quantity + '</div>' +
          '<button class="qty-btn" id="qty-plus">+</button>' +
        '</div>' +
      '</div>'
    );
    body.appendChild(row);
    body.appendChild(el(
      '<div style="margin-top: 18px; display:flex; flex-wrap: wrap; gap: 8px;">' +
        '<button class="size-btn" data-qty="1">1</button>' +
        '<button class="size-btn" data-qty="10">10</button>' +
        '<button class="size-btn" data-qty="25">25</button>' +
        '<button class="size-btn" data-qty="50">50</button>' +
        '<button class="size-btn" data-qty="100">100</button>' +
        '<button class="size-btn" data-qty="180">Full Community (180)</button>' +
      '</div>'
    ));

    body.appendChild(el(
      '<div class="qty-decorative">' +
        '<div class="line-1">Instant Online Proofs · Free Shipping</div>' +
        '<div class="line-2">The price you see is the price you pay.</div>' +
        '<div class="line-3">Apartment Direct · Communities Only</div>' +
      '</div>'
    ));

    document.getElementById('qty-minus').addEventListener('click', () => { if (state.quantity > 1) { state.quantity--; render(); } });
    document.getElementById('qty-plus').addEventListener('click', () => { state.quantity++; render(); });
    body.querySelectorAll('[data-qty]').forEach(b => b.addEventListener('click', () => { state.quantity = parseInt(b.dataset.qty); render(); }));
  }

  /* ----- Step 9: Review + Signature ----- */
  function renderReviewStep(body) {
    const sign = CATALOG[state.signTypeKey];
    const size = sign.sizes[state.sizeIndex];
    const block = el(
      '<div class="review-block">' +
        '<div class="review-line"><span class="label">Sign Type</span><span class="val">' + sign.name + '</span></div>' +
        '<div class="review-line"><span class="label">Material</span><span class="val">' + MATERIALS[state.material].name + ' (' + MATERIALS[state.material].substrate + ')</span></div>' +
        '<div class="review-line"><span class="label">Size</span><span class="val">' + size.label + '</span></div>' +
        '<div class="review-line"><span class="label">Shape</span><span class="val">' + SHAPES[state.shape].name + '</span></div>' +
        '<div class="review-line"><span class="label">Background</span><span class="val">' + BACKGROUNDS[state.background].name + '</span></div>' +
        '<div class="review-line"><span class="label">Font</span><span class="val">' + FONTS[state.font].name + '</span></div>' +
        '<div class="review-line"><span class="label">Logo</span><span class="val">' + (state.logoDataUrl ? 'Uploaded' : 'Not uploaded') + '</span></div>' +
        '<div class="review-line"><span class="label">Quantity</span><span class="val">' + state.quantity + '</span></div>' +
      '</div>'
    );
    body.appendChild(block);

    body.appendChild(el(
      '<div class="signature-block">' +
        '<div class="signature-label">✍️ Approve Your Proof</div>' +
        '<input type="text" class="signature-input" id="signature-input" placeholder="Type your name or initials" value="' + escAttr(state.approvalName || '') + '">' +
        '<div class="signature-sub">By typing your name, you approve this proof as shown. We use this signature on file to confirm authorization for production. Once approved, your design moves to print exactly as previewed.</div>' +
      '</div>'
    ));

    const sigInput = body.querySelector('#signature-input');
    sigInput.addEventListener('input', (e) => { state.approvalName = e.target.value; renderNavButtons(); renderPrice(); });

    body.appendChild(el('<p style="margin-top: 14px; font-size: 12px; color: var(--muted);">Hit <strong style="color: var(--magenta);">Approve &amp; Add to Cart</strong> in the price panel to proceed. In production, this routes to Shopify checkout, and on payment, your order auto-creates a new request on Monday.com.</p>'));
  }

  /* ====================================================================
     NAV BUTTONS
     ==================================================================== */
  function renderNavButtons() {
    const prev = document.getElementById('prev-btn');
    const next = document.getElementById('next-btn');
    prev.disabled = state.step <= 1;
    prev.style.opacity = state.step <= 1 ? 0.4 : 1;
    prev.onclick = () => { if (state.step > 1) { state.step--; render(); } };
    next.disabled = !canAdvance();
    next.textContent = state.step === 9 ? 'Approve & Add to Cart' : 'Continue →';
    next.onclick = () => {
      if (state.step < 9) { state.step++; render(); }
      else { openCartModal(); }
    };
  }

  function openCartModal() {
    addCurrentToCart();

    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden');

    document.getElementById('modal-checkout').onclick = () => {
      overlay.classList.add('hidden');
      openCartView();
    };
    document.getElementById('modal-customize-another').onclick = () => {
      overlay.classList.add('hidden');
      state.quantity = 1;
      state.approvalName = '';
      state.step = 7;
      render();
    };
    document.getElementById('modal-continue-shopping').onclick = () => {
      overlay.classList.add('hidden');
      state.step = 1;
      state.signTypeKey = null;
      state.material = null;
      state.sizeIndex = null;
      state.shape = null;
      state.background = null;
      state.logoDataUrl = null;
      state.textValues = {};
      state.quantity = 1;
      state.approvalName = '';
      render();
    };
  }

  function canAdvance() {
    switch (state.step) {
      case 1: return !!state.signTypeKey;
      case 2: return !!state.material;
      case 3: return state.sizeIndex !== null;
      case 4: return !!state.shape;
      case 5: return !!state.background;
      case 6: return true;
      case 7: return !!state.font && Object.keys(state.textValues).length > 0;
      case 8: return state.quantity > 0;
      case 9: return !!(state.approvalName && state.approvalName.trim().length >= 2);
    }
  }

  /* ====================================================================
     LIVE PREVIEW (SVG)
     ==================================================================== */
  function renderPreview() {
    const empty = document.getElementById('preview-empty');
    const wrap = document.getElementById('preview-svg-wrap');
    const helper = document.getElementById('helper-bar');
    const spec = document.getElementById('preview-spec');

    if (!state.signTypeKey || state.sizeIndex === null || !state.material) {
      empty.style.display = 'block';
      wrap.style.display = 'none';
      helper.style.display = 'none';
      spec.textContent = state.signTypeKey ? CATALOG[state.signTypeKey].name + ' — pick a material to see your preview' : 'Make your selections to see your sign →';
      return;
    }
    empty.style.display = 'none';
    wrap.style.display = 'flex';
    helper.style.display = 'flex';
    document.getElementById('helper-text').textContent = CATALOG[state.signTypeKey].name + ' · ' + MATERIALS[state.material].name + ' · ' + CATALOG[state.signTypeKey].sizes[state.sizeIndex].label;

    const sign = CATALOG[state.signTypeKey];
    const size = sign.sizes[state.sizeIndex];
    spec.textContent = size.label + '  ·  ' + MATERIALS[state.material].name + '  ·  ' + SHAPES[state.shape].name;
    wrap.innerHTML = renderSignSVG();
  }

  let _CLIP_ID = 0;
  function nextClipId() { return 'clip_' + (++_CLIP_ID); }

  function fitText(text, maxWidth, baseFontSize, opts) {
    opts = opts || {};
    const minFontSize = opts.minFontSize || baseFontSize * 0.50;
    const maxLines = opts.maxLines || 2;
    const activeFontKey = state && state.font;
    const fontRatio = (activeFontKey && FONTS[activeFontKey] && FONTS[activeFontKey].widthRatio) || 0.52;
    const charWidthRatio = opts.charWidthRatio || fontRatio;
    text = String(text || '').trim();
    if (!text) return { lines: [''], fontSize: baseFontSize, lineHeight: baseFontSize * 1.15 };

    let fontSize = baseFontSize;
    while (fontSize >= minFontSize) {
      const charsPerLine = Math.max(1, Math.floor(maxWidth / (fontSize * charWidthRatio)));
      if (text.length <= charsPerLine) {
        return { lines: [text], fontSize: fontSize, lineHeight: fontSize * 1.15 };
      }
      const wrapped = wrapText(text, charsPerLine);
      if (wrapped.length <= maxLines) {
        return { lines: wrapped, fontSize: fontSize, lineHeight: fontSize * 1.15 };
      }
      fontSize *= 0.92;
    }
    const charsPerLine = Math.max(1, Math.floor(maxWidth / (minFontSize * charWidthRatio)));
    return { lines: wrapText(text, charsPerLine).slice(0, maxLines), fontSize: minFontSize, lineHeight: minFontSize * 1.15 };
  }

  function wrapText(text, maxCharsPerLine) {
    const words = String(text).split(/\s+/);
    const lines = []; let current = '';
    for (const w of words) {
      if (!current) { current = w; continue; }
      if ((current + ' ' + w).length <= maxCharsPerLine) current += ' ' + w;
      else { lines.push(current); current = w; }
    }
    if (current) lines.push(current);
    return lines;
  }

  function renderFittedText(fit, x, centerY, attrs) {
    const totalH = fit.lineHeight * fit.lines.length;
    const startY = centerY - totalH / 2 + fit.fontSize * 0.85;
    return fit.lines.map((line, i) =>
      '<text x="' + x + '" y="' + (startY + i * fit.lineHeight) + '" font-size="' + fit.fontSize + '" ' + attrs + '>' + esc(line) + '</text>'
    ).join('');
  }

  function renderSignSVG() {
    const sign = CATALOG[state.signTypeKey];
    const size = sign.sizes[state.sizeIndex];
    const bg = BACKGROUNDS[state.background];
    const font = FONTS[state.font];
    const t = state.textValues;

    const aspect = size.w / size.h;
    const W = 600;
    const H = Math.round(W / aspect);
    const maxH = 480;
    let vbW = W, vbH = H;
    if (vbH > maxH) { vbH = maxH; vbW = Math.round(maxH * aspect); }

    const clipId = nextClipId();
    const waveId = 'wave_' + clipId;
    const shapeDef = shapePath(state.shape, vbW, vbH);
    const wavePattern = bg.wave
      ? '<defs><linearGradient id="' + waveId + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#0a2540"/>' +
          '<stop offset="50%" stop-color="#1a4a7a"/>' +
          '<stop offset="100%" stop-color="#2980b9"/>' +
        '</linearGradient></defs>'
      : '';
    const fillRef = bg.wave ? 'url(#' + waveId + ')' : bg.fg;
    const stripH = Math.max(8, Math.round(vbH * 0.045));
    const strip = '<rect x="0" y="' + (vbH - stripH) + '" width="' + vbW + '" height="' + stripH + '" fill="' + bg.accent + '"/>';
    const content = renderTemplate(sign.template, vbW, vbH, bg, font, t, stripH);

    return (
      '<svg viewBox="0 0 ' + vbW + ' ' + vbH + '" xmlns="http://www.w3.org/2000/svg" style="width: ' + vbW + 'px; max-width: 100%;">' +
        wavePattern +
        '<defs><clipPath id="' + clipId + '"><path d="' + shapeDef + '"/></clipPath></defs>' +
        '<g clip-path="url(#' + clipId + ')">' +
          '<rect x="0" y="0" width="' + vbW + '" height="' + vbH + '" fill="' + fillRef + '"/>' +
          strip +
          content +
        '</g>' +
        '<path d="' + shapeDef + '" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="1.5"/>' +
      '</svg>'
    );
  }

  function shapePath(shape, W, H) {
    switch (shape) {
      case 'rectangle': return 'M 0 0 L ' + W + ' 0 L ' + W + ' ' + H + ' L 0 ' + H + ' Z';
      case 'rounded':   { const r = Math.min(W, H) * 0.06; return 'M ' + r + ' 0 L ' + (W - r) + ' 0 Q ' + W + ' 0 ' + W + ' ' + r + ' L ' + W + ' ' + (H - r) + ' Q ' + W + ' ' + H + ' ' + (W - r) + ' ' + H + ' L ' + r + ' ' + H + ' Q 0 ' + H + ' 0 ' + (H - r) + ' L 0 ' + r + ' Q 0 0 ' + r + ' 0 Z'; }
      case 'monument':  return 'M 0 ' + H + ' L 0 ' + (H * 0.32) + ' C 0 0 ' + W + ' 0 ' + W + ' ' + (H * 0.32) + ' L ' + W + ' ' + H + ' Z';
      case 'capsule':   { const r = H / 2; return 'M ' + r + ' 0 L ' + (W - r) + ' 0 A ' + r + ' ' + r + ' 0 0 1 ' + (W - r) + ' ' + H + ' L ' + r + ' ' + H + ' A ' + r + ' ' + r + ' 0 0 1 ' + r + ' 0 Z'; }
      case 'shield':    return 'M 0 0 L ' + W + ' 0 L ' + W + ' ' + (H * 0.6) + ' Q ' + W + ' ' + H + ' ' + (W / 2) + ' ' + H + ' Q 0 ' + H + ' 0 ' + (H * 0.6) + ' Z';
      default: return 'M 0 0 L ' + W + ' 0 L ' + W + ' ' + H + ' L 0 ' + H + ' Z';
    }
  }

  function logoBlock(W, H, padX, padY, logoSize, bg, font) {
    if (state.logoDataUrl) {
      return '<image href="' + state.logoDataUrl + '" x="' + padX + '" y="' + padY + '" width="' + logoSize + '" height="' + logoSize + '" preserveAspectRatio="xMidYMid meet"/>';
    }
    return '<g>' +
      '<rect x="' + padX + '" y="' + padY + '" width="' + logoSize + '" height="' + logoSize + '" rx="6" fill="' + bg.accent + '" opacity="0.85"/>' +
      '<circle cx="' + (padX + logoSize / 2) + '" cy="' + (padY + logoSize * 0.42) + '" r="' + (logoSize * 0.22) + '" fill="' + bg.fg + '" opacity="0.9"/>' +
      '<text x="' + (padX + logoSize / 2) + '" y="' + (padY + logoSize * 0.78) + '" text-anchor="middle" fill="' + bg.fg + '" font-family="' + font.family + '" font-weight="' + font.weight + '" font-size="' + (logoSize * 0.16) + '">LOGO</text>' +
    '</g>';
  }

  function arrowSVG(dir, x, y, size, color) {
    let path = '';
    if (dir === 'right') path = 'M 0 ' + (size / 2) + ' L ' + size + ' ' + (size / 2) + ' M ' + (size * 0.6) + ' ' + (size * 0.2) + ' L ' + size + ' ' + (size / 2) + ' L ' + (size * 0.6) + ' ' + (size * 0.8);
    else if (dir === 'left') path = 'M ' + size + ' ' + (size / 2) + ' L 0 ' + (size / 2) + ' M ' + (size * 0.4) + ' ' + (size * 0.2) + ' L 0 ' + (size / 2) + ' L ' + (size * 0.4) + ' ' + (size * 0.8);
    else if (dir === 'up') path = 'M ' + (size / 2) + ' ' + size + ' L ' + (size / 2) + ' 0 M ' + (size * 0.2) + ' ' + (size * 0.4) + ' L ' + (size / 2) + ' 0 L ' + (size * 0.8) + ' ' + (size * 0.4);
    else path = 'M ' + (size / 2) + ' 0 L ' + (size / 2) + ' ' + size + ' M ' + (size * 0.2) + ' ' + (size * 0.6) + ' L ' + (size / 2) + ' ' + size + ' L ' + (size * 0.8) + ' ' + (size * 0.6);
    return '<g transform="translate(' + x + ',' + y + ')"><path d="' + path + '" stroke="' + color + '" stroke-width="' + (size * 0.10) + '" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>';
  }

  function renderTemplate(tmpl, W, H, bg, font, t, stripH) {
    const padX = W * 0.06;
    const padY = H * 0.06;
    const logoSize = Math.min(W * 0.16, H * 0.22);
    const ff = font.family;
    const fw = font.weight;
    const txtCol = bg.text;
    const subCol = bg.sub;
    const lb = logoBlock(W, H, padX, padY, logoSize, bg, font);

    switch (tmpl) {
      case 'leasing-office': {
        const safeW = W - 2 * padX;
        const propFit = fitText(t.propertyName, W - padX - logoSize - 22, H * 0.055, { maxLines: 2 });
        const titleFit = fitText(t.title, safeW, H * 0.10, { maxLines: 2 });
        return (
          lb +
          renderFittedText(propFit, padX + logoSize + 14, padY + logoSize * 0.55, 'fill="' + txtCol + '" font-family="' + ff + '" font-weight="' + fw + '"') +
          renderFittedText(titleFit, W / 2, H * 0.42, 'text-anchor="middle" fill="' + txtCol + '" font-family="' + ff + '" font-weight="' + fw + '"') +
          '<text x="' + (W / 2) + '" y="' + (H * 0.60) + '" text-anchor="middle" fill="' + txtCol + '" font-family="' + ff + '" font-weight="500" font-size="' + (H * 0.032) + '">' + esc(t.hoursLine1 || '') + '</text>' +
          '<text x="' + (W / 2) + '" y="' + (H * 0.66) + '" text-anchor="middle" fill="' + txtCol + '" font-family="' + ff + '" font-weight="500" font-size="' + (H * 0.032) + '">' + esc(t.hoursLine2 || '') + '</text>' +
          '<text x="' + (W / 2) + '" y="' + (H * 0.72) + '" text-anchor="middle" fill="' + txtCol + '" font-family="' + ff + '" font-weight="500" font-size="' + (H * 0.032) + '">' + esc(t.hoursLine3 || '') + '</text>' +
          '<text x="' + (W / 2) + '" y="' + (H * 0.86) + '" text-anchor="middle" fill="' + txtCol + '" font-family="' + ff + '" font-weight="' + fw + '" font-size="' + (H * 0.04) + '">' + esc(t.phone || '') + '</text>'
        );
      }
      case 'directional': {
        const arrow = arrowSVG(t.arrow || 'right', W * 0.65, H * 0.48, H * 0.22, bg.accent);
        const propFit = fitText(t.propertyName, W - padX - logoSize - 22, H * 0.045, { maxLines: 2 });
        const titleFit = fitText(t.title, W * 0.55, H * 0.10, { maxLines: 2, minFontSize: H * 0.05 });
        return (
          lb +
          renderFittedText(propFit, padX + logoSize + 14, padY + logoSize * 0.55, 'fill="' + txtCol + '" font-family="' + ff + '" font-weight="' + fw + '"') +
          renderFittedText(titleFit, W * 0.32, H * 0.58, 'text-anchor="middle" fill="' + txtCol + '" font-family="' + ff + '" font-weight="' + fw + '"') +
          arrow
        );
      }
      case 'pool-rules': {
        const rules = (t.rules || '').split('\n');
        const startY = H * 0.32;
        const lineH = H * 0.034;
        const ruleLines = rules.map((r, i) => '<text x="' + (padX * 2) + '" y="' + (startY + i * lineH) + '" fill="' + txtCol + '" font-family="' + ff + '" font-weight="400" font-size="' + (H * 0.022) + '">' + esc(r) + '</text>').join('');
        return (
          lb +
          '<text x="' + (W - padX) + '" y="' + (padY + logoSize * 0.55) + '" text-anchor="end" fill="' + txtCol + '" font-family="' + ff + '" font-weight="' + fw + '" font-size="' + (H * 0.06) + '">' + esc(t.title || '') + '</text>' +
          '<text x="' + (W - padX) + '" y="' + (padY + logoSize * 0.85) + '" text-anchor="end" fill="' + subCol + '" font-family="' + ff + '" font-weight="400" font-size="' + (H * 0.025) + '">' + esc(t.propertyName || '') + '</text>' +
          ruleLines +
          '<text x="' + (W / 2) + '" y="' + (H * 0.93) + '" text-anchor="middle" fill="' + txtCol + '" font-family="' + ff + '" font-weight="' + fw + '" font-size="' + (H * 0.026) + '">In Emergency: ' + esc(t.phone || '') + '</text>'
        );
      }
      case 'simple': {
        const safeW = W - 2 * padX;
        const propFit = fitText(t.propertyName, W - padX - logoSize - 22, H * 0.045, { maxLines: 2 });
        const titleFit = fitText(t.title, safeW, H * 0.12, { maxLines: 2, minFontSize: H * 0.05 });
        const subFit = t.subtext ? fitText(t.subtext, safeW, H * 0.055, { maxLines: 2 }) : null;
        return (
          lb +
          renderFittedText(propFit, padX + logoSize + 14, padY + logoSize * 0.55, 'fill="' + txtCol + '" font-family="' + ff + '" font-weight="' + fw + '"') +
          renderFittedText(titleFit, W / 2, H * 0.55, 'text-anchor="middle" fill="' + txtCol + '" font-family="' + ff + '" font-weight="' + fw + '"') +
          (subFit ? renderFittedText(subFit, W / 2, H * 0.82, 'text-anchor="middle" fill="' + subCol + '" font-family="' + ff + '" font-weight="500"') : '')
        );
      }
      case 'building-address': {
        const safeW = W - 2 * padX;
        const propFit = fitText(t.propertyName, W - padX - logoSize - 22, H * 0.05, { maxLines: 2 });
        const labelFit = fitText(t.label, safeW, H * 0.10, { maxLines: 1 });
        const numFit = fitText(t.number, safeW, H * 0.32, { maxLines: 1, minFontSize: H * 0.14, charWidthRatio: 0.62 });
        return (
          lb +
          renderFittedText(propFit, padX + logoSize + 14, padY + logoSize * 0.55, 'fill="' + txtCol + '" font-family="' + ff + '" font-weight="' + fw + '"') +
          renderFittedText(labelFit, W / 2, H * 0.42, 'text-anchor="middle" fill="' + txtCol + '" font-family="' + ff + '" font-weight="' + fw + '"') +
          renderFittedText(numFit, W / 2, H * 0.72, 'text-anchor="middle" fill="' + txtCol + '" font-family="' + ff + '" font-weight="800"')
        );
      }
      case 'unit-number': {
        const logoSmall = state.logoDataUrl
          ? '<image href="' + state.logoDataUrl + '" x="' + (H * 0.18) + '" y="' + (H * 0.18) + '" width="' + (H * 0.64) + '" height="' + (H * 0.64) + '" preserveAspectRatio="xMidYMid meet"/>'
          : '<circle cx="' + (H * 0.5) + '" cy="' + (H * 0.5) + '" r="' + (H * 0.32) + '" fill="' + bg.accent + '"/>';
        const numAreaW = W - H - W * 0.06;
        const numFit = fitText(t.number, numAreaW, H * 0.65, { maxLines: 1, minFontSize: H * 0.28, charWidthRatio: 0.62 });
        const ny = H * 0.5 + numFit.fontSize * 0.35;
        return (
          '<g>' + logoSmall + '</g>' +
          '<text x="' + (H + numAreaW / 2) + '" y="' + ny + '" text-anchor="middle" fill="' + txtCol + '" font-family="' + ff + '" font-weight="800" font-size="' + numFit.fontSize + '">' + esc(numFit.lines[0] || '') + '</text>'
        );
      }
      case 'amenity-strip': {
        const logoSmall = state.logoDataUrl
          ? '<image href="' + state.logoDataUrl + '" x="' + (H * 0.2) + '" y="' + (H * 0.2) + '" width="' + (H * 0.6) + '" height="' + (H * 0.6) + '" preserveAspectRatio="xMidYMid meet"/>'
          : '<rect x="' + (H * 0.2) + '" y="' + (H * 0.2) + '" width="' + (H * 0.6) + '" height="' + (H * 0.6) + '" rx="4" fill="' + bg.accent + '" opacity="0.85"/>';
        const textAreaW = W - H - W * 0.08;
        const titleFit = fitText(t.title, textAreaW, H * 0.55, { maxLines: 1, minFontSize: H * 0.25, charWidthRatio: 0.52 });
        const ty = H * 0.5 + titleFit.fontSize * 0.34;
        return (
          logoSmall +
          '<text x="' + (H + W * 0.05) + '" y="' + ty + '" fill="' + txtCol + '" font-family="' + ff + '" font-weight="' + fw + '" font-size="' + titleFit.fontSize + '">' + esc(titleFit.lines[0] || '') + '</text>'
        );
      }
      case 'monument': {
        const safeW = W * 0.86;
        const propFit = fitText(t.propertyName, safeW, H * 0.22, { maxLines: 2, minFontSize: H * 0.08 });
        const urlFit = fitText(t.url, safeW, H * 0.075, { maxLines: 1, minFontSize: H * 0.04 });
        return (
          renderFittedText(propFit, W / 2, H * 0.45, 'text-anchor="middle" fill="' + txtCol + '" font-family="' + ff + '" font-weight="' + fw + '"') +
          renderFittedText(urlFit, W / 2, H * 0.78, 'text-anchor="middle" fill="' + subCol + '" font-family="' + ff + '" font-weight="400"')
        );
      }
      default: return '';
    }
  }

  /* ====================================================================
     PRICE
     ==================================================================== */
  function renderPrice() {
    const unitEl = document.getElementById('unit-price');
    const qtyEl = document.getElementById('qty-line');
    const subEl = document.getElementById('subtotal');
    const ctaBtn = document.getElementById('add-to-cart-btn');

    if (!state.signTypeKey || state.sizeIndex === null || !state.material) {
      unitEl.textContent = '—'; qtyEl.textContent = '—'; subEl.textContent = '—';
      ctaBtn.disabled = true; return;
    }
    const sign = CATALOG[state.signTypeKey];
    const size = sign.sizes[state.sizeIndex];
    const unit = size[state.material];
    if (unit == null) {
      unitEl.textContent = 'Not avail.'; qtyEl.textContent = state.quantity; subEl.textContent = '—';
      ctaBtn.disabled = true; return;
    }
    const sub = unit * state.quantity;
    unitEl.textContent = '$' + unit.toLocaleString();
    qtyEl.textContent = state.quantity.toLocaleString();
    subEl.textContent = '$' + sub.toLocaleString();
    ctaBtn.disabled = !(state.step >= 9 && state.approvalName && state.approvalName.trim().length >= 2);
    ctaBtn.textContent = state.step >= 9 ? 'Approve & Add to Cart' : 'Add to Cart';
    ctaBtn.onclick = () => { openCartModal(); };
  }

  /* ====================================================================
     HELPERS
     ==================================================================== */
  function clearFrom(field) {
    const order = ['signTypeKey', 'material', 'sizeIndex', 'shape', 'background', 'logoDataUrl', 'textValues', 'quantity', 'approvalName'];
    const i = order.indexOf(field);
    if (i < 0) return;
    for (let j = i; j < order.length; j++) {
      const k = order[j];
      if (k === 'textValues') state[k] = {};
      else if (k === 'quantity') state[k] = 1;
      else if (k === 'approvalName') state[k] = '';
      else state[k] = null;
    }
  }

  /* ====================================================================
     INIT
     ==================================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    if (!loadCatalog()) return;
    // Only boot if the configurator markup is actually on the page (i.e. customer is logged in)
    if (!document.getElementById('step-body')) return;
    render();
    initCartUI();
    // Chat widget (Ask Inky) is rendered globally by layout/theme.liquid (sections/chat-widget.liquid)
    // and wired up by assets/signageworks-main.js — do NOT call initChatWidget() here, or both
    // scripts will double-bind the launcher click. The fallback below is kept for standalone
    // use cases (e.g. previewing the configurator outside the theme).
    if (!window.SignageWorks || typeof window.SignageWorks !== 'object') {
      initChatWidget();
    }
  });

  /* ============= AI CHAT WIDGET (Ask Inky) — fallback =============
     Only used when the configurator runs outside the Shopify theme
     (e.g. opening the section markup standalone for QA). In the
     Shopify theme this is dead code — signageworks-main.js owns it.
     =============================================================== */
  function initChatWidget() {
    const launcher = document.getElementById('chat-launcher');
    const panel = document.getElementById('chat-panel');
    const closeBtn = document.getElementById('chat-close');
    const body = document.getElementById('chat-body');
    const input = document.getElementById('chat-input');
    const send = document.getElementById('chat-send');
    if (!launcher || !panel || !body || !input || !send) return;

    function openChat() {
      launcher.classList.add('hidden');
      panel.classList.remove('hidden');
      if (body.dataset.greeted !== '1') {
        botGreet();
        body.dataset.greeted = '1';
      }
      setTimeout(() => input.focus(), 50);
    }
    function closeChat() {
      panel.classList.add('hidden');
      launcher.classList.remove('hidden');
    }
    launcher.addEventListener('click', openChat);
    if (closeBtn) closeBtn.addEventListener('click', closeChat);

    function chEl(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
    function scrollDown() { body.scrollTop = body.scrollHeight; }
    function botSay(html) { const m = chEl('<div class="chat-msg bot"></div>'); m.innerHTML = html; body.appendChild(m); scrollDown(); }
    function userSay(text) { const m = chEl('<div class="chat-msg user"></div>'); m.textContent = text; body.appendChild(m); scrollDown(); }
    function addChips(chips) {
      const wrap = chEl('<div class="chat-chips"></div>');
      chips.forEach(c => {
        const chip = chEl('<button class="chat-chip"></button>');
        chip.textContent = c;
        chip.addEventListener('click', () => { wrap.remove(); userSay(c); setTimeout(() => respond(c), 350); });
        wrap.appendChild(chip);
      });
      body.appendChild(wrap); scrollDown();
    }

    function botGreet() {
      botSay('<strong>Hi! I\'m Inky 🐙</strong><br>I can answer questions about your apartment signage — materials, sizes, pricing tiers, turnaround, the design tool, or opening an account.');
      setTimeout(() => addChips([
        'What materials do you offer?', 'How long does it take?', 'How do I open an account?',
        'What signs do you make?', 'Do you ship for free?', 'Talk to a human'
      ]), 300);
    }

    function respond(text) {
      const q = text.toLowerCase();
      let reply;
      if (/(material|metro beach|summit view|acrylic|j-?bond|aluminum)/i.test(q)) reply = '<strong>Two materials</strong>, both made-to-order:<br><br><strong>Metro Beach</strong> — reverse-printed acrylic. A premium, glass-like finish. Best for leasing offices, amenity-area signs, anywhere you want a high-end look.<br><br><strong>Summit View</strong> — custom-printed J-Bond aluminum composite. Durable, weather-tough, lighter. The workhorse for monuments, outdoor signs, and property-wide signage.';
      else if (/(how long|how fast|turnaround|days|production|deliver|when will|arrive)/i.test(q)) reply = '<strong>Standard signs can arrive in as little as 3 business days after approval.</strong> Custom, oversized, bulk, monument, or revised orders may take longer. Free shipping always — no rush fees, no surprise charges.';
      else if (/(ship|shipping|delivery|fedex|cost to ship|free shipping)/i.test(q)) reply = '<strong>Shipping is always free</strong> on every order — no thresholds, no add-ons at checkout. FedEx ground to anywhere in the lower 48.';
      else if (/(account|apply|sign up|register|how do i join|wholesale|approved)/i.test(q)) reply = 'Open a free <strong>SignageWorks Account</strong> from the homepage — we approve apartment-community, property-manager, and multifamily-portfolio accounts the same business day. Once approved you can see pricing and design signs online.';
      else if (/(price|pricing|cost|how much|expensive|cheap)/i.test(q)) reply = 'Pricing is preset per sign type and material — what you see is what you pay. Quantity doesn\'t change the per-unit price (most apartment communities order 100+ signs at once, so volume is already baked in). You\'ll see all pricing once your account is approved.';
      else if (/(design|proof|customize|configurator|customizer|online|how do i make)/i.test(q)) reply = 'Our online customizer lets you pick a sign, choose material/size/shape/background/font, drop your property logo, and type your text — and you\'ll see an <strong>instant online proof</strong> as you go. Approve when ready and the order moves into production.';
      else if (/(monument|entrance|entry)/i.test(q)) reply = 'Monument Face Replacements are available in <strong>Summit View</strong> (J-Bond aluminum composite) at 38"×48" and 48"×96". Outdoor-grade, weather-tough. The classic apartment-community entrance sign.';
      else if (/(pool|lifeguard|swimming)/i.test(q)) reply = 'Pool signs include <strong>Pool Rules</strong>, <strong>No Lifeguard On Duty</strong>, and <strong>Shallow Water / No Diving</strong>. State-compliant warning sizes available in Summit View. Pool Rules also available in Metro Beach acrylic for an upscale look.';
      else if (/(unit number|door number|apartment number|building address|building number|address sign)/i.test(q)) reply = 'Unit Numbers (4"×9" strips) and Building Address signs (18"×24") are core wayfinding. A 200-unit refresh is a typical order — both materials available, both ship within standard turnaround.';
      else if (/(parking|reserved|future resident)/i.test(q)) reply = 'Parking signs include <strong>Reserved Parking</strong> (12"×18" and 18"×24"), <strong>Future Resident Parking</strong>, and <strong>No Parking Anytime</strong> — all in Metro Beach or Summit View.';
      else if (/(leasing|leasing office)/i.test(q)) reply = 'Leasing signs include <strong>Leasing Office Wall</strong> (18"×24"), <strong>Leasing Office Post</strong> (24"×36"), <strong>Leasing Office Directional</strong>, and <strong>Future Resident Parking</strong>. The Post version is the premium tier at 24"×36".';
      else if (/(rules|safety|notice|warning|compliance)/i.test(q)) reply = 'Rules & Property Notice signs include Pool Rules, Fire Pit Rules, Dog Park Rules, Dumpster Rules, Fitness Center Rules, Play Area Rules, Private Property / No Trespassing, and No Fishing. Both materials available.';
      else if (/(amenity|amenities|fitness|laundry|mail|grill|car care)/i.test(q)) reply = 'Amenity Signs cover Fitness Center, Laundry Room, Mail Center (all 8"×36" door-label strips), plus Grilling & Picnic Area and Car Care Center.';
      else if (/(sign type|what.*signs|catalog|categories|browse)/i.test(q)) reply = 'We make 11 categories of apartment signs: Address & Building, Amenity, Pool, Parking & Traffic, Wayfinding, Leasing & Future Resident, Monument & Entrance, Rules & Property Notice, Maintenance & Facility, Marketing/Print (Phase 2), and Custom Apartment Sign Packages. About 30 sign types across them — every sign your property needs.';
      else if (/(custom|special|unique|different|specific)/i.test(q)) reply = 'All signs are customized to your property — your logo, your text, your property name, the right address number. The design tool handles all of that. If you need something that isn\'t in the catalog, mention it after you open an account.';
      else if (/(human|person|call|phone|talk to|speak to|representative)/i.test(q)) reply = 'I can answer most questions right here. If you\'d still like a human, <strong>open a free SignageWorks Account</strong> — approved customers get a direct contact line. Or drop us an email at <strong>hello@signageworks.com</strong> and we\'ll respond within one business day.';
      else if (/(broker|reseller|wholesale|sign company|reseller)/i.test(q)) reply = 'SignageWorks is <strong>Apartment Direct · Communities Only</strong> — we open accounts for apartment communities, property managers, management companies, and multifamily portfolios only. No brokers, no resellers, no general public.';
      else if (/(logo|artwork|file|upload|png|jpg|svg|ai|illustrator)/i.test(q)) reply = 'Upload your property logo in the design tool — PNG, JPG, SVG, or AI. We auto-convert to a transparent PNG so it sits cleanly on any background. Don\'t have a logo? You can still create great-looking text-only signs.';
      else if (/(hello|hi|hey|hola|howdy)/i.test(q)) reply = 'Hey there! 🐙 What can I help you with — products, pricing, the design tool, or opening an account?';
      else if (/(thank|thanks|thx)/i.test(q)) reply = 'Anytime! 🐙 Anything else?';
      else reply = "I'm best at apartment-signage questions — materials (Metro Beach vs Summit View), sizes, turnaround, shipping, the design tool, or opening an account. Try one of the suggestions below, or rephrase your question.";

      setTimeout(() => {
        botSay(reply);
        setTimeout(() => addChips(['What materials do you offer?', 'How do I open an account?', 'How long does it take?', 'Email us instead']), 350);
      }, 250);
    }

    function submit() {
      const text = input.value.trim();
      if (!text) return;
      userSay(text);
      input.value = '';
      body.querySelectorAll('.chat-chips').forEach(c => c.remove());
      respond(text);
    }
    send.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }
})();
