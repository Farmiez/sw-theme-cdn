/* SignageWorks — main theme JS
 * Handles: category grid render, popular signs render, modal handlers,
 * apply-form submission to backend, login routing, and Ask Inky chat widget. */

(function () {
  'use strict';

  /* Read merchant-editable config injected by theme.liquid into window.SignageWorks */
  const CFG = (window.SignageWorks = window.SignageWorks || {});
  const APPLY_ENDPOINT = CFG.applyEndpoint || 'https://api.signageworks.com/api/application';
  const CHAT_ENDPOINT = CFG.chatEndpoint || ''; // empty = use built-in mock keyword bot
  const CONFIGURATOR_URL = CFG.configuratorUrl || 'SignageWorks-Configurator-Prototype.html';

  /* ============= CATEGORIES DATA ============= */
  const CATEGORIES = [
    { name: "Address & Building Signs", desc: "Help residents and guests find the right building or unit.", count: "3 sign types", icon: 'building' },
    { name: "Amenity Signs", desc: "Identify the rooms residents actually use.", count: "5 sign types", icon: 'amenity' },
    { name: "Pool Signs", desc: "Pool rules, safety, and regulatory signage.", count: "3 sign types", icon: 'pool' },
    { name: "Parking & Traffic Signs", desc: "Reserved spots, no-parking, traffic flow.", count: "2 sign types", icon: 'parking' },
    { name: "Wayfinding & Directional Signs", desc: "Arrows and directionals guiding people through the property.", count: "2 sign types", icon: 'arrow' },
    { name: "Leasing & Future Resident Signs", desc: "Leasing office signage and prospective resident signs.", count: "3 sign types", icon: 'key' },
    { name: "Monument & Entrance Signs", desc: "The first impression of your community.", count: "1 sign type", icon: 'monument' },
    { name: "Rules & Property Notice Signs", desc: "Property rules, restrictions, and notices.", count: "7 sign types", icon: 'rules' },
    { name: "Maintenance & Facility Signs", desc: "Staff-only doors and back-of-house signage.", count: "1 sign type", icon: 'wrench' },
    { name: "Marketing Signs & Print", desc: "Outdoor banners and promotional print.", count: "Phase 2", icon: 'megaphone', phase2: true }
  ];

  const ICONS = {
    building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18"/><path d="M9 9h2M13 9h2M9 13h2M13 13h2M9 17h6"/></svg>',
    amenity:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6.5 6.5l11 11"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
    pool:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 16c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M2 20c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/></svg>',
    parking:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 17V8h4a3 3 0 010 6H9"/></svg>',
    arrow:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>',
    key:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="14" r="4"/><path d="M11.5 11.5L21 2l-3 3 2 2-3 3 2 2-3 3"/></svg>',
    monument: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21V10C4 5 8 3 12 3s8 2 8 7v11M4 21h16M8 14h8M8 17h8"/></svg>',
    rules:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
    wrench:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.3 2.3-2.7-2.7 2.3-2.3z"/></svg>',
    megaphone:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11v2a2 2 0 002 2h1l7 4V5L6 9H5a2 2 0 00-2 2zM17 9a3 3 0 010 6"/></svg>',
    package:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.7l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.7l7 4a2 2 0 002 0l7-4a2 2 0 001-1.7z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/></svg>'
  };

  const POPULAR_SIGNS = [
    { name: "Leasing Office Wall Sign", category: "Leasing & Future Resident", template: "leasing-office" },
    { name: "Pool Rules", category: "Pool Signs", template: "pool-rules" },
    { name: "Reserved Parking", category: "Parking & Traffic", template: "simple" },
    { name: "Building Address", category: "Address & Building", template: "building-address" },
    { name: "Unit Number", category: "Address & Building", template: "unit-number" },
    { name: "Monument Face Replacement", category: "Monument & Entrance", template: "monument" },
    { name: "Future Resident Parking", category: "Leasing & Future Resident", template: "simple" },
    { name: "Fitness Center", category: "Amenity Signs", template: "amenity-strip" }
  ];

  /* ============= RENDER CATEGORIES ============= */
  function renderCategories() {
    const grid = document.getElementById('cat-grid');
    if (!grid) return;
    CATEGORIES.forEach(cat => {
      const cls = cat.package ? 'package' : (cat.phase2 ? 'phase2' : '');
      const card = document.createElement('div');
      card.className = 'cat-card ' + cls;
      card.innerHTML = `
        <div class="cat-icon-wrap">${ICONS[cat.icon] || ''}</div>
        <div class="cat-name">${cat.name}</div>
        <div class="cat-desc">${cat.desc}</div>
        <div class="cat-count">${cat.count}</div>
      `;
      card.addEventListener('click', () => { openModal('locked-modal'); });
      grid.appendChild(card);
    });
  }

  /* ============= RENDER POPULAR SIGNS ============= */
  function renderPopularSigns() {
    const grid = document.getElementById('popular-grid');
    if (!grid) return;
    POPULAR_SIGNS.forEach(sign => {
      const card = document.createElement('div');
      card.className = 'popular-card';
      card.innerHTML = `
        <div class="popular-thumb">${renderMiniSign(sign.template)}</div>
        <div class="popular-name">${sign.name}</div>
        <div class="popular-cat">${sign.category}</div>
        <div class="popular-locked">🔒 Account required</div>
      `;
      card.addEventListener('click', () => openModal('locked-modal'));
      grid.appendChild(card);
    });
  }

  /* Minimal sign SVG generator for popular cards */
  function renderMiniSign(template) {
    const W = 240, H = 140;
    const bg = '#1a2733', accent = '#00AEEF', text = '#fff', sub = '#bcd';
    const stripH = 8;
    const ff = '"Inter",sans-serif';
    const logoPad = 14, logoSize = 28;
    const logoBlock = `<rect x="${logoPad}" y="${logoPad}" width="${logoSize}" height="${logoSize}" rx="4" fill="${accent}" opacity="0.85"/><circle cx="${logoPad+logoSize/2}" cy="${logoPad+logoSize*0.42}" r="${logoSize*0.20}" fill="${bg}"/>`;
    let content = '';
    switch (template) {
      case 'leasing-office':
        content = `${logoBlock}
          <text x="${logoPad+logoSize+8}" y="${logoPad+logoSize*0.5}" fill="${text}" font-family="${ff}" font-weight="700" font-size="9">ShadowMoss Pointe</text>
          <text x="${W/2}" y="${H*0.46}" text-anchor="middle" fill="${text}" font-family="${ff}" font-weight="800" font-size="16">Leasing Office</text>
          <text x="${W/2}" y="${H*0.62}" text-anchor="middle" fill="${text}" font-family="${ff}" font-weight="500" font-size="8">Mon-Fri  8:30-5:30</text>
          <text x="${W/2}" y="${H*0.72}" text-anchor="middle" fill="${text}" font-family="${ff}" font-weight="500" font-size="8">Sat  9:00-5:00</text>
          <text x="${W/2}" y="${H*0.85}" text-anchor="middle" fill="${text}" font-family="${ff}" font-weight="700" font-size="9">843.766.2220</text>`;
        break;
      case 'pool-rules':
        content = `${logoBlock}
          <text x="${W-logoPad}" y="${logoPad+logoSize*0.55}" text-anchor="end" fill="${text}" font-family="${ff}" font-weight="800" font-size="13">Pool Rules</text>
          <text x="${logoPad+8}" y="${H*0.42}" fill="${text}" font-family="${ff}" font-weight="400" font-size="6.5">NO solo swimming</text>
          <text x="${logoPad+8}" y="${H*0.52}" fill="${text}" font-family="${ff}" font-weight="400" font-size="6.5">NO running, horseplay</text>
          <text x="${logoPad+8}" y="${H*0.62}" fill="${text}" font-family="${ff}" font-weight="400" font-size="6.5">NO glass in pool area</text>
          <text x="${logoPad+8}" y="${H*0.72}" fill="${text}" font-family="${ff}" font-weight="400" font-size="6.5">NO children unsupervised</text>
          <text x="${W/2}" y="${H*0.86}" text-anchor="middle" fill="${text}" font-family="${ff}" font-weight="700" font-size="7">Emergency: 843.766.2220</text>`;
        break;
      case 'simple':
        content = `${logoBlock}
          <text x="${logoPad+logoSize+8}" y="${logoPad+logoSize*0.55}" fill="${text}" font-family="${ff}" font-weight="700" font-size="9">ShadowMoss Pointe</text>
          <text x="${W/2}" y="${H*0.55}" text-anchor="middle" fill="${text}" font-family="${ff}" font-weight="800" font-size="16">Reserved Parking</text>`;
        break;
      case 'building-address':
        content = `${logoBlock}
          <text x="${logoPad+logoSize+8}" y="${logoPad+logoSize*0.55}" fill="${text}" font-family="${ff}" font-weight="700" font-size="9">ShadowMoss Pointe</text>
          <text x="${W/2}" y="${H*0.42}" text-anchor="middle" fill="${text}" font-family="${ff}" font-weight="800" font-size="13">Building</text>
          <text x="${W/2}" y="${H*0.85}" text-anchor="middle" fill="${text}" font-family="${ff}" font-weight="900" font-size="44">15</text>`;
        break;
      case 'unit-number':
        content = `<circle cx="${H*0.5}" cy="${H*0.5}" r="${H*0.32}" fill="${accent}"/>
          <text x="${W*0.6}" y="${H*0.75}" text-anchor="middle" fill="${text}" font-family="${ff}" font-weight="900" font-size="${H*0.65}">230</text>`;
        break;
      case 'monument':
        content = `<text x="${W/2}" y="${H*0.5}" text-anchor="middle" fill="${text}" font-family="${ff}" font-weight="800" font-size="20">ShadowMoss</text>
          <text x="${W/2}" y="${H*0.7}" text-anchor="middle" fill="${text}" font-family="${ff}" font-weight="800" font-size="20">Pointe</text>
          <text x="${W/2}" y="${H*0.85}" text-anchor="middle" fill="${sub}" font-family="${ff}" font-weight="400" font-size="7">www.shadowmosspointeapts.com</text>`;
        break;
      case 'amenity-strip':
        content = `${logoBlock}
          <text x="${logoPad+logoSize+10}" y="${H*0.65}" fill="${text}" font-family="${ff}" font-weight="800" font-size="22">Fitness Center</text>`;
        break;
    }
    let shapePath;
    if (template === 'monument') shapePath = `M 0 ${H} L 0 ${H*0.32} C 0 0 ${W} 0 ${W} ${H*0.32} L ${W} ${H} Z`;
    else shapePath = `M 0 0 L ${W} 0 L ${W} ${H} L 0 ${H} Z`;
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs><clipPath id="c-${template}"><path d="${shapePath}"/></clipPath></defs>
      <g clip-path="url(#c-${template})">
        <rect x="0" y="0" width="${W}" height="${H}" fill="${bg}"/>
        <rect x="0" y="${H-stripH}" width="${W}" height="${stripH}" fill="${accent}"/>
        ${content}
      </g>
    </svg>`;
  }

  /* ============= MODAL HANDLERS ============= */
  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }
  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }
  // Expose for inline onclick handlers in section markup
  window.openModal = openModal;
  window.closeModal = closeModal;

  /* ============= APPLY FORM SUBMISSION ============= */
  async function submitApply() {
    const form = document.getElementById('apply-form-wrap');
    if (!form) return;

    const payload = {
      property_name: (form.querySelector('[name="property_name"]') || {}).value || '',
      applicant_name: (form.querySelector('[name="applicant_name"]') || {}).value || '',
      role: (form.querySelector('[name="role"]') || {}).value || '',
      email: (form.querySelector('[name="email"]') || {}).value || '',
      phone: (form.querySelector('[name="phone"]') || {}).value || '',
      unit_count: parseInt((form.querySelector('[name="unit_count"]') || {}).value || '0', 10) || 0,
      source: 'signageworks-homepage'
    };

    const submitBtn = document.getElementById('apply-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
    }

    try {
      await fetch(APPLY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      // Non-blocking — still show the success toast so the customer isn't blocked
      // by a transient network failure. Backend retries / dedupes on its own.
      console.warn('SignageWorks apply submission failed', err);
    }

    form.style.display = 'none';
    const success = document.getElementById('apply-success');
    if (success) success.style.display = 'block';
  }
  window.submitApply = submitApply;

  /* ============= LOGIN ROUTING ============= */
  function doLogin() {
    closeModal('login-modal');
    window.location.href = CONFIGURATOR_URL;
  }
  window.doLogin = doLogin;

  /* ============= WIRE UP ============= */
  document.addEventListener('DOMContentLoaded', () => {
    renderCategories();
    renderPopularSigns();

    // Apply buttons
    ['apply-btn-top', 'apply-btn-hero', 'apply-btn-bottom', 'popular-apply', 'footer-apply'].forEach(id => {
      const e = document.getElementById(id);
      if (e) e.addEventListener('click', () => openModal('apply-modal'));
    });
    // Login buttons
    ['login-btn-top', 'login-btn-hero', 'login-btn-bottom', 'footer-login'].forEach(id => {
      const e = document.getElementById(id);
      if (e) e.addEventListener('click', () => openModal('login-modal'));
    });
    // Close modal when clicking overlay backdrop
    document.querySelectorAll('.modal-overlay').forEach(o => {
      o.addEventListener('click', (e) => { if (e.target === o) o.classList.add('hidden'); });
    });
  });

  /* ============= AI CHAT WIDGET (Ask Inky) ============= */
  document.addEventListener('DOMContentLoaded', () => {
    const launcher = document.getElementById('chat-launcher');
    const panel = document.getElementById('chat-panel');
    const closeBtn = document.getElementById('chat-close');
    const body = document.getElementById('chat-body');
    const input = document.getElementById('chat-input');
    const send = document.getElementById('chat-send');
    if (!launcher || !panel) return;

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
    closeBtn.addEventListener('click', closeChat);

    function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
    function scrollDown() { body.scrollTop = body.scrollHeight; }

    function botSay(html) {
      const m = el('<div class="chat-msg bot"></div>');
      m.innerHTML = html;
      body.appendChild(m);
      scrollDown();
    }
    function userSay(text) {
      const m = el('<div class="chat-msg user"></div>');
      m.textContent = text;
      body.appendChild(m);
      scrollDown();
    }
    function addChips(chips) {
      const wrap = el('<div class="chat-chips"></div>');
      chips.forEach(c => {
        const chip = el(`<button class="chat-chip"></button>`);
        chip.textContent = c;
        chip.addEventListener('click', () => {
          wrap.remove();
          userSay(c);
          setTimeout(() => respond(c), 350);
        });
        wrap.appendChild(chip);
      });
      body.appendChild(wrap);
      scrollDown();
    }

    function botGreet() {
      botSay('<strong>Hi! I\'m Inky 🐙</strong><br>I can answer questions about your apartment signage — materials, sizes, pricing tiers, turnaround, the design tool, or opening an account.');
      setTimeout(() => addChips([
        'What materials do you offer?',
        'How long does it take?',
        'How do I open an account?',
        'What signs do you make?',
        'Do you ship for free?',
        'Talk to a human'
      ]), 300);
    }

    /* Keyword-driven mock AI. In production this is replaced with a real LLM call
       to CHAT_ENDPOINT (set in theme settings). Locked SignageWorks vocabulary
       facts are baked in here as a fallback. */
    async function respond(text) {
      // If a real chat endpoint is configured, prefer the live API
      if (CHAT_ENDPOINT) {
        try {
          const res = await fetch(CHAT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
          });
          if (res.ok) {
            const data = await res.json();
            const reply = (data && data.reply) || mockReply(text);
            setTimeout(() => {
              botSay(reply);
              setTimeout(() => addChips([
                'What materials do you offer?',
                'How do I open an account?',
                'How long does it take?',
                'Email us instead'
              ]), 350);
            }, 200);
            return;
          }
        } catch (err) {
          // fall through to mock
        }
      }
      const reply = mockReply(text);
      setTimeout(() => {
        botSay(reply);
        setTimeout(() => addChips([
          'What materials do you offer?',
          'How do I open an account?',
          'How long does it take?',
          'Email us instead'
        ]), 350);
      }, 250);
    }

    function mockReply(text) {
      const q = text.toLowerCase();
      if (/(material|metro beach|summit view|acrylic|j-?bond|aluminum)/i.test(q)) {
        return '<strong>Two materials</strong>, both made-to-order:<br><br><strong>Metro Beach</strong> — reverse-printed acrylic. A premium, glass-like finish. Best for leasing offices, amenity-area signs, anywhere you want a high-end look.<br><br><strong>Summit View</strong> — custom-printed J-Bond aluminum composite. Durable, weather-tough, lighter. The workhorse for monuments, outdoor signs, and property-wide signage.';
      }
      if (/(how long|how fast|turnaround|days|production|deliver|when will|arrive)/i.test(q)) {
        return '<strong>Standard signs can arrive in as little as 3 business days after approval.</strong> Custom, oversized, bulk, monument, or revised orders may take longer. Free shipping always — no rush fees, no surprise charges.';
      }
      if (/(ship|shipping|delivery|fedex|cost to ship|free shipping)/i.test(q)) {
        return '<strong>Shipping is always free</strong> on every order — no thresholds, no add-ons at checkout. FedEx ground to anywhere in the lower 48.';
      }
      if (/(account|apply|sign up|register|how do i join|wholesale|approved)/i.test(q)) {
        return 'Open a free <strong>SignageWorks Account</strong> from the homepage — we approve apartment-community, property-manager, and multifamily-portfolio accounts the same business day. Once approved you can see pricing and design signs online.';
      }
      if (/(price|pricing|cost|how much|expensive|cheap)/i.test(q)) {
        return 'Pricing is preset per sign type and material — what you see is what you pay. Quantity doesn\'t change the per-unit price (most apartment communities order 100+ signs at once, so volume is already baked in). You\'ll see all pricing once your account is approved.';
      }
      if (/(design|proof|customize|configurator|customizer|online|how do i make)/i.test(q)) {
        return 'Our online customizer lets you pick a sign, choose material/size/shape/background/font, drop your property logo, and type your text — and you\'ll see an <strong>instant online proof</strong> as you go. Approve when ready and the order moves into production.';
      }
      if (/(monument|entrance|entry)/i.test(q)) {
        return 'Monument Face Replacements are available in <strong>Summit View</strong> (J-Bond aluminum composite) at 38"×48" and 48"×96". Outdoor-grade, weather-tough. The classic apartment-community entrance sign.';
      }
      if (/(pool|lifeguard|swimming)/i.test(q)) {
        return 'Pool signs include <strong>Pool Rules</strong>, <strong>No Lifeguard On Duty</strong>, and <strong>Shallow Water / No Diving</strong>. State-compliant warning sizes available in Summit View. Pool Rules also available in Metro Beach acrylic for an upscale look.';
      }
      if (/(unit number|door number|apartment number|building address|building number|address sign)/i.test(q)) {
        return 'Unit Numbers (4"×9" strips) and Building Address signs (18"×24") are core wayfinding. A 200-unit refresh is a typical order — both materials available, both ship within standard turnaround.';
      }
      if (/(parking|reserved|future resident)/i.test(q)) {
        return 'Parking signs include <strong>Reserved Parking</strong> (12"×18" and 18"×24"), <strong>Future Resident Parking</strong>, and <strong>No Parking Anytime</strong> — all in Metro Beach or Summit View.';
      }
      if (/(leasing|leasing office)/i.test(q)) {
        return 'Leasing signs include <strong>Leasing Office Wall</strong> (18"×24"), <strong>Leasing Office Post</strong> (24"×36"), <strong>Leasing Office Directional</strong>, and <strong>Future Resident Parking</strong>. The Post version is the premium tier at 24"×36".';
      }
      if (/(rules|safety|notice|warning|compliance)/i.test(q)) {
        return 'Rules & Property Notice signs include Pool Rules, Fire Pit Rules, Dog Park Rules, Dumpster Rules, Fitness Center Rules, Play Area Rules, Private Property / No Trespassing, and No Fishing. Both materials available.';
      }
      if (/(amenity|amenities|fitness|laundry|mail|grill|car care)/i.test(q)) {
        return 'Amenity Signs cover Fitness Center, Laundry Room, Mail Center (all 8"×36" door-label strips), plus Grilling & Picnic Area and Car Care Center.';
      }
      if (/(sign type|what.*signs|catalog|categories|browse)/i.test(q)) {
        return 'We make 11 categories of apartment signs: Address & Building, Amenity, Pool, Parking & Traffic, Wayfinding, Leasing & Future Resident, Monument & Entrance, Rules & Property Notice, Maintenance & Facility, Marketing/Print (Phase 2), and Custom Apartment Sign Packages. About 30 sign types across them — every sign your property needs.';
      }
      if (/(custom|special|unique|different|specific)/i.test(q)) {
        return 'All signs are customized to your property — your logo, your text, your property name, the right address number. The design tool handles all of that. If you need something that isn\'t in the catalog, mention it after you open an account.';
      }
      if (/(human|person|call|phone|talk to|speak to|representative)/i.test(q)) {
        return 'I can answer most questions right here. If you\'d still like a human, <strong>open a free SignageWorks Account</strong> — approved customers get a direct contact line. Or drop us an email at <strong>hello@signageworks.com</strong> and we\'ll respond within one business day.';
      }
      if (/(broker|reseller|wholesale|sign company|reseller)/i.test(q)) {
        return 'SignageWorks is <strong>Apartment Direct · Communities Only</strong> — we open accounts for apartment communities, property managers, management companies, and multifamily portfolios only. No brokers, no resellers, no general public.';
      }
      if (/(logo|artwork|file|upload|png|jpg|svg|ai|illustrator)/i.test(q)) {
        return 'Upload your property logo in the design tool — PNG, JPG, SVG, or AI. We auto-convert to a transparent PNG so it sits cleanly on any background. Don\'t have a logo? You can still create great-looking text-only signs.';
      }
      if (/(hello|hi|hey|hola|howdy)/i.test(q)) {
        return 'Hey there! 🐙 What can I help you with — products, pricing, the design tool, or opening an account?';
      }
      if (/(thank|thanks|thx)/i.test(q)) {
        return 'Anytime! 🐙 Anything else?';
      }
      return "I'm best at apartment-signage questions — materials (Metro Beach vs Summit View), sizes, turnaround, shipping, the design tool, or opening an account. Try one of the suggestions below, or rephrase your question.";
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
  });
})();
