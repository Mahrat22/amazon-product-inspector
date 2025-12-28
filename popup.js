document.addEventListener('DOMContentLoaded', async () => {
  const el = (id) => document.getElementById(id);

  // Buttons / UI
  const inspectBtn = el('inspect-btn');
  const settingsBtn = el('settings-btn');
  const spinner = el('loading-spinner');
  const results = el('results');
  const errorDiv = el('error-msg');

  const planPill = el('plan-pill');
  const usagePill = el('usage-pill');
  const savedPill = el('saved-pill');

  const basicDiv = el('basic-info');
  const reviewsDiv = el('reviews');
  const opportunityDiv = el('opportunity');
  const opportunityNotes = el('opportunity-notes');
  const seoScoreDiv = el('seo-score');
  const seoNotesDiv = el('seo-notes');
  const complaintsDiv = el('complaints');

  const keepaBtn = el('keepa-btn');
  const copyBtn = el('copy-btn');
  const saveBtn = el('save-btn');

  const saveHint = el('save-hint');
  const proHint = el('pro-hint');

  const profitDiv = el('profit-calc');
  const profitResult = el('profit-result');
  const costInput = el('cost-input');
  const sizeSelect = el('size-select');
  const storageInput = el('storage-input');
  const calcBtn = el('calc-btn');

  // Accordion toggles
  const advToggle = el('adv-toggle');
  const advPanel = el('adv-panel');
  const advArrow = el('adv-arrow');

  const listAdvToggle = el('list-adv-toggle');
  const listAdvPanel = el('list-adv-panel');
  const listAdvArrow = el('list-adv-arrow');

  // Upgrade overlay
  const overlay = el('upgrade-overlay');
  const overlayMsg = el('overlay-msg');
  const upgradeBtn = el('upgrade-btn');
  const closeOverlayBtn = el('close-overlay-btn');

  // Compare modal
  const compareModal = el('compare-modal');
  const compareTable = el('compare-table');
  const compareMeta = el('compare-meta');
  const closeCompareBtn = el('close-compare-btn');
  const closeCompareBtn2 = el('close-compare-btn-2');
  const copyCompareBtn = el('copy-compare-btn');

  // Tabs
  const tabOverview = el('tab-overview');
  const tabList = el('tab-list');
  const panelOverview = el('panel-overview');
  const panelList = el('panel-list');

  // List UI
  const listContainer = el('list-container');
  const listSubtext = el('list-subtext');
  const refreshListBtn = el('refresh-list-btn');
  const clearListBtn = el('clear-list-btn');
  const compareSelectedBtn = el('compare-selected-btn');
  const topPicksDiv = el('top-picks');

  // Controls
  const sortSelect = el('sort-select');
  const compactToggle = el('compact-toggle');
  const minRatingInput = el('min-rating');
  const maxReviewsInput = el('max-reviews');
  const minOppInput = el('min-opp');
  const hideNoPrice = el('hide-no-price');
  const hideRange = el('hide-range');

  // State
  let product = {};
  let currentTabUrl = '';
  let isPro = false;
  let devMode = false;

  const FREE_DAILY_LIMIT = 30;
  const FREE_SAVED_LIMIT = 10;
  const MAX_COMPARE = 5;

  // Helpers
  const safeText = (v) => (v == null ? '' : String(v));
  const esc = (s) => safeText(s).replace(/[<>&"]/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
  const moneyToNum = (s) => {
    const m = safeText(s).replace(/,/g, '').match(/([0-9]+(\.[0-9]+)?)/);
    return m ? parseFloat(m[1]) : NaN;
  };
  const parseReviewCount = (t) => {
    const m = safeText(t).replace(/,/g, '').match(/([0-9]+)/);
    return m ? parseInt(m[1], 10) : NaN;
  };
  const parseRating = (t) => {
    const m = safeText(t).match(/([0-9]+(\.[0-9]+)?)/);
    return m ? parseFloat(m[1]) : NaN;
  };
  const parseBsr = (t) => {
    const m = safeText(t).replace(/,/g, '').match(/#\s*([0-9]+)/);
    return m ? parseInt(m[1], 10) : NaN;
  };

  const showOverlay = (msg) => {
    overlayMsg.textContent = msg;
    overlay.classList.remove('hidden');
  };
  const hideOverlay = () => overlay.classList.add('hidden');

  closeOverlayBtn?.addEventListener('click', hideOverlay);
  upgradeBtn?.addEventListener('click', async () => chrome.tabs.create({ url: "https://chromewebstore.google.com/" }));

  settingsBtn?.addEventListener('click', () => chrome.runtime.openOptionsPage());

  // Accordions
  const setAccordion = (panel, arrow, open) => {
    if (!panel || !arrow) return;
    if (open) {
      panel.classList.remove('hidden');
      arrow.textContent = '▴';
    } else {
      panel.classList.add('hidden');
      arrow.textContent = '▾';
    }
  };

  let advOpen = false;
  let listAdvOpen = false;
  setAccordion(advPanel, advArrow, advOpen);
  setAccordion(listAdvPanel, listAdvArrow, listAdvOpen);

  advToggle?.addEventListener('click', () => {
    advOpen = !advOpen;
    setAccordion(advPanel, advArrow, advOpen);
  });

  listAdvToggle?.addEventListener('click', () => {
    listAdvOpen = !listAdvOpen;
    setAccordion(listAdvPanel, listAdvArrow, listAdvOpen);
  });

  // Compare modal
  const showCompare = () => compareModal?.classList.remove('hidden');
  const hideCompare = () => compareModal?.classList.add('hidden');
  closeCompareBtn?.addEventListener('click', hideCompare);
  closeCompareBtn2?.addEventListener('click', hideCompare);

  // Tabs
  const setActiveTab = (which) => {
    if (which === 'overview') {
      tabOverview?.classList.add('active');
      tabList?.classList.remove('active');
      panelOverview?.classList.remove('hidden');
      panelList?.classList.add('hidden');
    } else {
      tabList?.classList.add('active');
      tabOverview?.classList.remove('active');
      panelList?.classList.remove('hidden');
      panelOverview?.classList.add('hidden');
    }
  };

  tabOverview?.addEventListener('click', () => setActiveTab('overview'));
  tabList?.addEventListener('click', async () => {
    setActiveTab('list');
    await renderSavedList();
  });

  function seoScore(title, bullets, brand) {
    const t = safeText(title).trim();
    const b = Array.isArray(bullets) ? bullets : [];
    const notes = [];
    let score = 0;

    if (t.length >= 120) { score += 25; notes.push("Good title length (120+ chars)."); }
    else if (t.length >= 80) { score += 18; notes.push("Decent title length (80+ chars)."); }
    else if (t.length >= 50) { score += 10; notes.push("Short title (add key attributes)."); }
    else { score += 5; notes.push("Very short title."); }

    if (safeText(brand).trim().length > 0) { score += 10; notes.push("Brand detected."); }
    else { notes.push("Brand not detected."); }

    if (b.length >= 5) { score += 20; notes.push("5+ bullet points detected."); }
    else if (b.length >= 3) { score += 12; notes.push("3–4 bullet points detected."); }
    else if (b.length > 0) { score += 6; notes.push("Few bullet points detected."); }
    else { notes.push("No bullet points detected."); }

    const words = t.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
    const uniq = new Set(words);
    const uniqRatio = words.length ? (uniq.size / words.length) : 0;
    if (uniqRatio >= 0.75) { score += 20; notes.push("Good keyword variety."); }
    else if (uniqRatio >= 0.6) { score += 12; notes.push("Moderate keyword variety."); }
    else { score += 6; notes.push("Title may be repetitive."); }

    const attrHits = [
      /pack|pcs|pieces|count/i,
      /inch|in\.|cm|mm|oz|lb|kg|g\b/i,
      /size|small|medium|large|xl|xxl/i,
      /color|black|white|red|blue|green|pink|gray|grey/i
    ].some(r => r.test(t));
    if (attrHits) { score += 15; notes.push("Attributes detected (size/color/units)."); }
    else { score += 6; notes.push("Few attributes detected."); }

    score = Math.max(1, Math.min(100, Math.round(score)));
    return { score, notes };
  }

  function opportunityScore({ rating, reviewCount, bsr }) {
    const ratingNum = parseFloat(safeText(rating)) || 0;
    const reviews = Number(reviewCount) || 0;

    let bsrNum = null;
    const m = safeText(bsr).replace(/,/g, '').match(/#\s*([0-9]+)/);
    if (m) bsrNum = parseInt(m[1], 10);

    let score = 0;
    const notes = [];

    if (ratingNum >= 4.5) { score += 28; notes.push("Strong rating (4.5+)."); }
    else if (ratingNum >= 4.2) { score += 22; notes.push("Good rating (4.2+)."); }
    else if (ratingNum >= 3.9) { score += 15; notes.push("Okay rating (3.9+)."); }
    else { score += 8; notes.push("Low rating risk."); }

    if (reviews === 0) { score += 10; notes.push("Review count unknown/0."); }
    else if (reviews < 200) { score += 30; notes.push("Low competition (<200 reviews)."); }
    else if (reviews < 800) { score += 20; notes.push("Medium competition (200–800)."); }
    else { score += 10; notes.push("High competition (800+)."); }

    if (bsrNum == null) { score += 8; notes.push("BSR not found."); }
    else if (bsrNum < 5000) { score += 35; notes.push("Very strong demand (BSR < 5k)."); }
    else if (bsrNum < 20000) { score += 28; notes.push("Strong demand (BSR < 20k)."); }
    else if (bsrNum < 50000) { score += 18; notes.push("Moderate demand (BSR < 50k)."); }
    else { score += 10; notes.push("Lower demand (BSR 50k+)."); }

    score = Math.max(1, Math.min(100, Math.round(score)));
    return { score, notes };
  }

  function analyzeComplaints(reviews) {
    const buckets = [
      { key: "quality", label: "Quality / breaks", patterns: [/broke|broken|cheap|poor quality|fell apart|defect|faulty|crack/i] },
      { key: "size", label: "Size / fit wrong", patterns: [/too small|too big|smaller|larger|fit|size runs/i] },
      { key: "shipping", label: "Shipping / packaging", patterns: [/late|shipping|arrived|package|packaging|damaged box/i] },
      { key: "instructions", label: "Instructions / confusing", patterns: [/instructions|confusing|hard to use|difficult|complicated/i] },
      { key: "missing", label: "Missing parts", patterns: [/missing|didn't include|not included|no parts|incomplete/i] }
    ];

    const txt = (Array.isArray(reviews) ? reviews : []).join("\n").toLowerCase();
    const counts = {};
    buckets.forEach(b => counts[b.key] = 0);

    buckets.forEach(b => {
      b.patterns.forEach(p => {
        const matches = txt.match(new RegExp(p.source, 'gi'));
        if (matches) counts[b.key] += matches.length;
      });
    });

    return buckets
      .map(b => ({ ...b, count: counts[b.key] }))
      .sort((a, c) => c.count - a.count)
      .filter(x => x.count > 0)
      .slice(0, 2);
  }

  function renderBasicInfo(p) {
    const parts = [];
    parts.push(`<div><strong>Title:</strong> ${esc((p.title || '').slice(0, 110))}${(p.title || '').length > 110 ? '…' : ''}</div>`);
    if (p.asin) parts.push(`<div><strong>ASIN:</strong> <code>${esc(p.asin)}</code></div>`);
    if (p.selectedVariant) parts.push(`<div><strong>Variant:</strong> ${esc(p.selectedVariant)}</div>`);
    if (p.price) {
      const rangeNote = p.priceIsRange ? ' <span style="color:#b45f00;font-weight:900;">(range)</span>' : '';
      parts.push(`<div><strong>Price:</strong> ${esc(p.price)}${rangeNote}</div>`);
    }
    if (p.rating) parts.push(`<div><strong>Rating:</strong> ${esc(p.rating)}</div>`);
    if (p.reviewCountText) parts.push(`<div><strong>Reviews:</strong> ${esc(p.reviewCountText)}</div>`);
    if (p.bsr && p.bsr !== 'No BSR found') parts.push(`<div><strong>BSR:</strong> ${esc(p.bsr)}</div>`);
    return parts.join('');
  }

  async function updatePlanUI() {
    const stored = await chrome.storage.sync.get(['usageDate', 'usageCount', 'isPro', 'devMode', 'savedItems']);
    devMode = !!stored.devMode;
    isPro = !!stored.isPro || devMode;
    const usageCount = stored.usageCount || 0;
    const savedCount = Array.isArray(stored.savedItems) ? stored.savedItems.length : 0;

    planPill.textContent = isPro ? 'Pro' : 'Free';

    usagePill.textContent = isPro ? 'Unlimited' : `${Math.min(usageCount, FREE_DAILY_LIMIT)}/${FREE_DAILY_LIMIT} today`;
    savedPill.textContent = isPro ? `Saved: ${savedCount} (∞)` : `Saved: ${savedCount}/${FREE_SAVED_LIMIT}`;

    document.querySelectorAll('.pro-only').forEach(btn => {
      btn.disabled = !isPro;
      btn.style.opacity = isPro ? '1' : '0.55';
      btn.style.cursor = isPro ? 'pointer' : 'not-allowed';
    });

    if (isPro) {
      proHint?.classList.add('hidden');
      profitDiv?.classList.remove('hidden');
    } else {
      profitDiv?.classList.add('hidden');
    }
  }

  async function getProductDataFromTab(tabId) {
    try {
      return await chrome.tabs.sendMessage(tabId, { action: 'getProductData' });
    } catch {
      // If content script isn't ready, just fail gracefully.
      throw new Error("Could not connect to page. Refresh the Amazon tab and try again.");
    }
  }

  const defaultPrefs = {
    sort: 'savedAt_desc',
    compact: false,
    minRating: '',
    maxReviews: '',
    minOpp: '',
    hideNoPrice: false,
    hideRange: false
  };

  async function loadPrefs() {
    const stored = await chrome.storage.sync.get(['listPrefs']);
    return { ...defaultPrefs, ...(stored.listPrefs || {}) };
  }

  async function savePrefs(prefs) {
    await chrome.storage.sync.set({ listPrefs: prefs });
  }

  function applyFilters(items, prefs) {
    const minR = prefs.minRating !== '' ? Number(prefs.minRating) : null;
    const maxRev = prefs.maxReviews !== '' ? Number(prefs.maxReviews) : null;
    const minOpp = prefs.minOpp !== '' ? Number(prefs.minOpp) : null;

    return items.filter(it => {
      const priceTxt = (it.price || '').toLowerCase();
      const isNoPrice = !it.price || priceTxt.includes('price not found');
      if (prefs.hideNoPrice && isNoPrice) return false;
      if (prefs.hideRange && it.priceIsRange) return false;

      const r = parseRating(it.rating);
      const rev = parseReviewCount(it.reviewCountText);
      const opp = typeof it.opportunityScore === 'number' ? it.opportunityScore : NaN;

      if (minR != null && !isNaN(minR)) {
        if (isNaN(r) || r < minR) return false;
      }
      if (maxRev != null && !isNaN(maxRev)) {
        if (isNaN(rev) || rev > maxRev) return false;
      }
      if (minOpp != null && !isNaN(minOpp)) {
        if (isNaN(opp) || opp < minOpp) return false;
      }
      return true;
    });
  }

  function applySort(items, sortKey) {
    const arr = [...items];

    const cmpNum = (av, bv, dir) => {
      const aBad = (av == null || Number.isNaN(av));
      const bBad = (bv == null || Number.isNaN(bv));
      if (aBad && bBad) return 0;
      if (aBad) return 1;
      if (bBad) return -1;
      return dir * (av - bv);
    };

    switch (sortKey) {
      case 'savedAt_desc':
        arr.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
        break;
      case 'opportunity_desc':
        arr.sort((a, b) => (b.opportunityScore ?? -1) - (a.opportunityScore ?? -1));
        break;
      case 'bsr_asc':
        arr.sort((a, b) => cmpNum(parseBsr(a.bsr), parseBsr(b.bsr), 1));
        break;
      case 'reviews_asc':
        arr.sort((a, b) => cmpNum(parseReviewCount(a.reviewCountText), parseReviewCount(b.reviewCountText), 1));
        break;
      case 'rating_desc':
        arr.sort((a, b) => cmpNum(parseRating(b.rating), parseRating(a.rating), 1));
        break;
      case 'price_asc':
        arr.sort((a, b) => cmpNum(moneyToNum(a.price), moneyToNum(b.price), 1));
        break;
      case 'price_desc':
        arr.sort((a, b) => cmpNum(moneyToNum(b.price), moneyToNum(a.price), 1));
        break;
      default:
        arr.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    }

    return arr;
  }

  function buildTopPicks(items) {
    if (!topPicksDiv) return;

    if (!items.length) {
      topPicksDiv.innerHTML = `<div class="subtext" style="margin:0;">No items match your filters.</div>`;
      return;
    }

    const bestOpp = [...items].sort((a, b) => (b.opportunityScore ?? -1) - (a.opportunityScore ?? -1))[0];
    const bestDemand = [...items].sort((a, b) => (parseBsr(a.bsr) || 999999999) - (parseBsr(b.bsr) || 999999999))[0];

    const fmt = (it) => {
      const t = (it.title || '').slice(0, 46) + ((it.title || '').length > 46 ? '…' : '');
      return `<strong>${esc(t)}</strong> <span style="color:#68707a;">(Opp ${it.opportunityScore ?? '—'})</span>`;
    };

    topPicksDiv.innerHTML = `
      <div><strong>Top Picks</strong></div>
      <div>🟢 Best Opportunity: ${bestOpp ? fmt(bestOpp) : '—'}</div>
      <div>🔥 Best Demand (lowest BSR): ${bestDemand ? fmt(bestDemand) : '—'}</div>
      <div class="subtext" style="margin-top:8px;">Tip: Sort by Opportunity to find winners fast.</div>
    `;
  }

  function selectedKeysFromList() {
    const boxes = document.querySelectorAll('.select-box[data-select]');
    const keys = [];
    boxes.forEach(b => { if (b.checked) keys.push(b.getAttribute('data-select')); });
    return keys.filter(Boolean);
  }

  // ✅ FIXED COMPARE TABLE (no overlap)
  function buildCompareTable(items) {
    const headers = items.map(it => {
      const titleSafe = esc(it.title || 'Untitled');
      const priceSafe = esc(it.price || '—');
      const rangeNote = it.priceIsRange ? ' (range)' : '';
      return `
        <th>
          <div class="compare-h-title">${titleSafe}</div>
          <div class="compare-h-price">${priceSafe}${rangeNote}</div>
        </th>
      `;
    }).join('');

    const row = (k, fn) => {
      const cells = items.map(it => `<td>${fn(it)}</td>`).join('');
      return `<tr><td class="compare-k">${esc(k)}</td>${cells}</tr>`;
    };

    return `
      <table class="compare-table">
        <thead>
          <tr>
            <th class="compare-k">Metric</th>
            ${headers}
          </tr>
        </thead>
        <tbody>
          ${row('ASIN', it => it.asin ? `<code>${esc(it.asin)}</code>` : '—')}
          ${row('Variant', it => esc(it.selectedVariant || '—'))}
          ${row('Price', it => esc(it.price || '—') + (it.priceIsRange ? ' (range)' : ''))}
          ${row('Rating', it => esc(it.rating || '—'))}
          ${row('Reviews', it => esc(it.reviewCountText || '—'))}
          ${row('BSR #', it => {
            const n = parseBsr(it.bsr);
            return isNaN(n) ? esc(it.bsr || '—') : `#${n}`;
          })}
          ${row('Opportunity', it => (typeof it.opportunityScore === 'number') ? `<strong>${it.opportunityScore}/100</strong>` : '—')}
          ${row('SEO', it => (typeof it.seoScore === 'number') ? `${it.seoScore}/100` : '—')}
        </tbody>
      </table>
    `;
  }

  function buildCompareText(items) {
    const lines = [];
    lines.push(`Compare (${items.length} items):`);
    lines.push('---');
    items.forEach((it, idx) => {
      lines.push(`#${idx + 1} ${it.title || ''}`);
      if (it.asin) lines.push(`ASIN: ${it.asin}`);
      if (it.selectedVariant) lines.push(`Variant: ${it.selectedVariant}`);
      if (it.price) lines.push(`Price: ${it.price}${it.priceIsRange ? ' (range)' : ''}`);
      if (it.rating) lines.push(`Rating: ${it.rating}`);
      if (it.reviewCountText) lines.push(`Reviews: ${it.reviewCountText}`);
      if (it.bsr) lines.push(`BSR: ${it.bsr}`);
      if (typeof it.opportunityScore === 'number') lines.push(`Opportunity: ${it.opportunityScore}/100`);
      if (typeof it.seoScore === 'number') lines.push(`SEO: ${it.seoScore}/100`);
      if (it.url) lines.push(`URL: ${it.url}`);
      lines.push('---');
    });
    return lines.join('\n');
  }

  async function openCompareFromSelection() {
    if (!isPro) return showOverlay('Compare is Pro-only. Upgrade to compare products side-by-side.');

    const keys = selectedKeysFromList();
    if (!keys.length) return showOverlay('Select items (checkbox) first.');
    if (keys.length > MAX_COMPARE) return showOverlay(`Select up to ${MAX_COMPARE} items.`);

    const stored = await chrome.storage.sync.get(['savedItems']);
    const saved = Array.isArray(stored.savedItems) ? stored.savedItems : [];
    const selectedItems = saved.filter(it => keys.includes(it.key));
    if (!selectedItems.length) return showOverlay('Could not find selected items. Try Refresh.');

    compareMeta.textContent = `Comparing ${selectedItems.length} items (max ${MAX_COMPARE}).`;
    compareTable.innerHTML = buildCompareTable(selectedItems);
    showCompare();

    copyCompareBtn.onclick = async () => {
      if (!isPro) return showOverlay('Copy Compare Summary is Pro-only.');
      await navigator.clipboard.writeText(buildCompareText(selectedItems));
      copyCompareBtn.textContent = 'Copied!';
      setTimeout(() => (copyCompareBtn.textContent = 'Copy Compare Summary'), 1200);
    };
  }

  compareSelectedBtn?.addEventListener('click', openCompareFromSelection);

  async function renderSavedList() {
    const stored = await chrome.storage.sync.get(['savedItems', 'isPro', 'devMode']);
    devMode = !!stored.devMode;
    isPro = !!stored.isPro || devMode;

    const saved = Array.isArray(stored.savedItems) ? stored.savedItems : [];
    const prefs = await loadPrefs();

    if (sortSelect) sortSelect.value = prefs.sort;
    if (compactToggle) compactToggle.checked = !!prefs.compact;

    if (minRatingInput) minRatingInput.value = prefs.minRating;
    if (maxReviewsInput) maxReviewsInput.value = prefs.maxReviews;
    if (minOppInput) minOppInput.value = prefs.minOpp;
    if (hideNoPrice) hideNoPrice.checked = !!prefs.hideNoPrice;
    if (hideRange) hideRange.checked = !!prefs.hideRange;

    if (listSubtext) {
      listSubtext.innerHTML = isPro
        ? `You have <strong>${saved.length}</strong> saved items. (Pro: unlimited)`
        : `You have <strong>${saved.length}</strong> saved items. (Free: ${FREE_SAVED_LIMIT} max)`;
    }

    if (!listContainer) return;

    if (saved.length === 0) {
      topPicksDiv.innerHTML = '';
      listContainer.innerHTML = `<div class="subtext">No saved items yet. Inspect a product and click “Save”.</div>`;
      return;
    }

    let filtered = applyFilters(saved, prefs);
    filtered = applySort(filtered, prefs.sort);

    buildTopPicks(filtered);

    if (!filtered.length) {
      listContainer.innerHTML = `<div class="hint">No items match your filters.</div>`;
      return;
    }

    const compact = !!prefs.compact;

    listContainer.innerHTML = filtered.map(item => {
      const title = esc(item.title || 'Untitled');
      const url = esc(item.url || '');
      const key = esc(item.key);

      const rating = item.rating || '—';
      const reviews = item.reviewCountText || '—';
      const bsr = item.bsr || '—';
      const opp = (typeof item.opportunityScore === 'number') ? `${item.opportunityScore}/100` : '—';
      const price = item.price || '—';
      const rangeNote = item.priceIsRange ? ' (range)' : '';

      const selectorHtml = `
        <input class="select-box" type="checkbox" data-select="${key}" ${isPro ? '' : 'disabled'} title="${isPro ? 'Select for compare' : 'Compare is Pro'}">
      `;

      if (compact) {
        const smallTitle = (item.title || '').slice(0, 52) + ((item.title || '').强调 ? '…' : '');
        const line1 = `${esc(price)}${rangeNote} • ${esc(rating)} • ${esc(reviews)} • Opp ${esc(String(item.opportunityScore ?? '—'))}`;
        const line2 = `ASIN ${esc(item.asin || '—')} • BSR ${esc(String(parseBsr(item.bsr) || '—'))}`;
        return `
          <div class="row-item">
            ${selectorHtml}
            <div style="flex:1;">
              <div class="row-title">${esc((item.title || '').slice(0, 52))}${(item.title || '').length > 52 ? '…' : ''}</div>
              <div class="row-sub">${line1}</div>
              <div class="row-sub">${line2}</div>
            </div>
            <div class="row-actions">
              <button data-open="${url}">Open</button>
              <button data-remove="${key}" style="color:#d93025;">Remove</button>
            </div>
          </div>
        `;
      }

      const meta = [
        item.asin ? `ASIN: <code>${esc(item.asin)}</code>` : '',
        item.selectedVariant ? `Variant: ${esc(item.selectedVariant)}` : '',
        `Price: ${esc(price)}${rangeNote}`,
        `Rating: ${esc(rating)}`,
        `Reviews: ${esc(reviews)}`,
        `BSR: ${esc(bsr)}`,
        `Opp: ${esc(opp)}`
      ].filter(Boolean).join('<br>');

      return `
        <div class="item">
          <div style="display:flex; gap:10px; align-items:flex-start;">
            ${selectorHtml}
            <div style="flex:1;">
              <div class="item-title">${title}</div>
              <div class="item-meta">${meta}</div>
            </div>
          </div>

          <div class="item-actions">
            <button class="small-btn" data-open="${url}">Open</button>
            <button class="small-btn danger" data-remove="${key}">Remove</button>
          </div>
        </div>
      `;
    }).join('');

    listContainer.querySelectorAll('[data-open]').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-open');
        if (url) chrome.tabs.create({ url });
      });
    });

    listContainer.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.getAttribute('data-remove');
        const stored2 = await chrome.storage.sync.get(['savedItems']);
        const saved2 = Array.isArray(stored2.savedItems) ? stored2.savedItems : [];
        const next = saved2.filter(x => x.key !== key);
        await chrome.storage.sync.set({ savedItems: next });
        await updatePlanUI();
        await renderSavedList();
      });
    });

    if (!isPro) {
      listContainer.querySelectorAll('.select-box[disabled]').forEach(cb => {
        cb.addEventListener('click', () => showOverlay('Compare is Pro-only. Upgrade to compare products.'));
      });
    }
  }

  async function wireControlEvents() {
    const update = async (patch) => {
      const next = { ...(await loadPrefs()), ...patch };
      await savePrefs(next);
      await renderSavedList();
    };

    sortSelect?.addEventListener('change', () => update({ sort: sortSelect.value }));
    compactToggle?.addEventListener('change', () => update({ compact: compactToggle.checked }));

    minRatingInput?.addEventListener('input', () => update({ minRating: minRatingInput.value.trim() }));
    maxReviewsInput?.addEventListener('input', () => update({ maxReviews: maxReviewsInput.value.trim() }));
    minOppInput?.addEventListener('input', () => update({ minOpp: minOppInput.value.trim() }));
    hideNoPrice?.addEventListener('change', () => update({ hideNoPrice: hideNoPrice.checked }));
    hideRange?.addEventListener('change', () => update({ hideRange: hideRange.checked }));
  }

  refreshListBtn?.addEventListener('click', renderSavedList);
  clearListBtn?.addEventListener('click', async () => {
    await chrome.storage.sync.set({ savedItems: [] });
    await updatePlanUI();
    await renderSavedList();
  });

  inspectBtn?.addEventListener('click', async () => {
    errorDiv.textContent = '';
    saveHint?.classList.add('hidden');
    results.classList.add('hidden');
    spinner.style.display = 'block';
    inspectBtn.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || !tab.url.includes('amazon.')) throw new Error('Open an Amazon product page');

      currentTabUrl = tab.url;

      const today = new Date().toISOString().slice(0, 10);
      const stored = await chrome.storage.sync.get(['usageDate', 'usageCount', 'isPro', 'devMode']);
      let { usageDate, usageCount: uc = 0 } = stored;
      devMode = !!stored.devMode;
      isPro = !!stored.isPro || devMode;

      if (!isPro) {
        if (usageDate !== today) {
          await chrome.storage.sync.set({ usageDate: today, usageCount: 1 });
        } else if (uc >= FREE_DAILY_LIMIT) {
          await updatePlanUI();
          throw new Error(`Free limit reached (${FREE_DAILY_LIMIT}/day). Go Pro for unlimited!`);
        } else {
          await chrome.storage.sync.set({ usageCount: uc + 1 });
        }
      }

      const response = await getProductDataFromTab(tab.id);
      product = response?.data || {};
      if (!product.title || product.title === 'No title found') throw new Error('Could not read product data');

      product.reviewCount = parseReviewCount(product.reviewCountText);

      const seo = seoScore(product.title, product.bullets || [], product.brand);
      product._seoScore = seo.score;

      const opp = opportunityScore({ rating: product.rating, reviewCount: product.reviewCount, bsr: product.bsr });
      product._opportunityScore = opp.score;

      basicDiv.innerHTML = renderBasicInfo(product);

      const label = opp.score >= 80 ? 'Excellent' : opp.score >= 60 ? 'Good' : 'Fair';
      const color = opp.score >= 80 ? '#34A853' : opp.score >= 60 ? '#FF9900' : '#d93025';
      opportunityDiv.innerHTML =
        `<div style="font-size:28px;font-weight:900;color:${color}">${opp.score}/100</div>
         <div style="font-weight:900;margin-top:6px;">${label} Opportunity</div>`;
      opportunityNotes.innerHTML = opp.notes.map(n => `• ${esc(n)}`).join('<br>');

      seoScoreDiv.innerHTML =
        `<div style="font-size:28px;font-weight:900;color:${seo.score >= 80 ? '#1e7e34' : seo.score >= 60 ? '#b45f00' : '#d93025'}">${seo.score}/100</div>`;
      seoNotesDiv.innerHTML = seo.notes.map(n => `• ${esc(n)}`).join('<br>');

      const topComplaints = analyzeComplaints(product.reviews || []);
      complaintsDiv.innerHTML = topComplaints.length
        ? `<ul>${topComplaints.map(c => `<li><strong>${esc(c.label)}:</strong> ${c.count}</li>`).join('')}</ul>`
        : `<div class="subtext">No strong complaint patterns detected.</div>`;

      const reviews = Array.isArray(product.reviews) ? product.reviews : [];
      reviewsDiv.innerHTML = reviews.length
        ? `<ul>${reviews.slice(0, 6).map(r => `<li>${esc(r.slice(0, 160))}${r.length > 160 ? '…' : ''}</li>`).join('')}</ul>`
        : `<div class="subtext">No reviews visible on this page.</div>`;

      const asin = product.asin || tab.url.match(/\/dp\/([A-Z0-9]{10})/)?.[1];
      if (asin) {
        keepaBtn.onclick = () => chrome.tabs.create({ url: `https://keepa.com/#!product/1-${asin}` });
        keepaBtn.classList.remove('hidden');
      } else {
        keepaBtn.classList.add('hidden');
      }

      copyBtn.onclick = async () => {
        if (!isPro) return showOverlay("Copy is Pro-only. Upgrade to unlock.");

        const lines = [];
        lines.push(`Title: ${product.title || ''}`);
        if (product.asin) lines.push(`ASIN: ${product.asin}`);
        if (product.selectedVariant) lines.push(`Variant: ${product.selectedVariant}`);
        if (product.price) lines.push(`Price: ${product.price}${product.priceIsRange ? ' (range)' : ''}`);
        if (product.rating) lines.push(`Rating: ${product.rating}`);
        if (product.reviewCountText) lines.push(`Reviews: ${product.reviewCountText}`);
        if (product.bsr) lines.push(`BSR: ${product.bsr}`);
        lines.push(`Opportunity: ${product._opportunityScore}/100`);
        lines.push(`SEO: ${product._seoScore}/100`);
        await navigator.clipboard.writeText(lines.join('\n'));

        copyBtn.textContent = "Copied!";
        setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
      };

      saveBtn.onclick = async () => {
        saveHint?.classList.add('hidden');

        const storedS = await chrome.storage.sync.get(['savedItems', 'isPro', 'devMode']);
        devMode = !!storedS.devMode;
        isPro = !!storedS.isPro || devMode;
        const saved = Array.isArray(storedS.savedItems) ? storedS.savedItems : [];

        if (!isPro && saved.length >= FREE_SAVED_LIMIT) {
          saveHint.textContent = `Free limit: ${FREE_SAVED_LIMIT} saved items. Upgrade for unlimited.`;
          saveHint.classList.remove('hidden');
          return showOverlay(`Free saving limit reached (${FREE_SAVED_LIMIT}). Go Pro for unlimited.`);
        }

        const key = `${product.asin || 'noasin'}::${product.selectedVariant || ''}::${currentTabUrl || ''}`;
        const item = {
          key,
          asin: product.asin || '',
          title: product.title || '',
          selectedVariant: product.selectedVariant || '',
          price: product.price || '',
          priceIsRange: !!product.priceIsRange,
          rating: product.rating || '',
          reviewCountText: product.reviewCountText || '',
          bsr: product.bsr || '',
          opportunityScore: product._opportunityScore ?? null,
          seoScore: product._seoScore ?? null,
          url: currentTabUrl || '',
          savedAt: Date.now()
        };

        const already = saved.find(x => x.key === key);
        const next = already ? saved.map(x => x.key === key ? item : x) : [item, ...saved];

        await chrome.storage.sync.set({ savedItems: next });

        saveHint.textContent = already ? 'Updated ✅' : 'Saved ✅';
        saveHint.classList.remove('hidden');
        setTimeout(() => saveHint?.classList.add('hidden'), 1400);

        await updatePlanUI();
      };

      calcBtn.onclick = () => {
        if (!isPro) return showOverlay("Profit Calculator is Pro-only.");

        const cost = parseFloat(costInput?.value || "0") || 0;
        const price = moneyToNum(product.price);
        const storage = parseFloat(storageInput?.value || "0.78") || 0.78;

        if (cost <= 0 || !isFinite(price) || price <= 0) {
          profitResult.innerHTML = 'Enter a valid cost (and make sure price is visible).';
          return;
        }

        const referral = price * 0.15;
        const fbaFee = (sizeSelect?.value === 'small') ? 3.22 : 6.50;
        const net = price - cost - referral - fbaFee - storage;
        const roi = ((net / cost) * 100).toFixed(1);

        profitResult.innerHTML =
          `Net Profit: <strong>$${net.toFixed(2)}</strong><br>` +
          `ROI: <strong>${roi}%</strong><br>` +
          `Referral: $${referral.toFixed(2)} | FBA: $${fbaFee.toFixed(2)} | Storage: $${storage.toFixed(2)}`;
      };

      results.classList.remove('hidden');
      await updatePlanUI();

    } catch (err) {
      const msg = err?.message || 'Something went wrong';
      errorDiv.textContent = msg;
      await updatePlanUI();
      if (msg.includes('Free limit reached')) showOverlay(msg);
    } finally {
      spinner.style.display = 'none';
      inspectBtn.disabled = false;
    }
  });

  await wireControlEvents();
  await updatePlanUI();
  setActiveTab('overview');
});
