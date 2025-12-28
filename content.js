// content.js (MV3)
// Robust Amazon product scraper: title, ASIN, selected variant, price (variant-aware), rating, reviews, BSR, bullets, seller info

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.action !== 'getProductData') return; // ignore other messages

  try {
    const productData = {};

    // Helpers
    const qs = (sel, root = document) => root.querySelector(sel);
    const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const text = (el) => (el?.innerText || el?.textContent || '').trim();

    const isVisible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const pickFirst = (selectors, { visibleOnly = true } = {}) => {
      for (const sel of selectors) {
        const els = qsa(sel);
        for (const el of els) {
          if (!el) continue;
          if (visibleOnly && !isVisible(el)) continue;
          const t = text(el);
          if (t) return t;
        }
      }
      return '';
    };

    const normalizeSpaces = (s) => (s || '').replace(/\s+/g, ' ').trim();

    const normalizePriceText = (raw) => {
      const s = normalizeSpaces(raw);
      const lowered = s.toLowerCase();

      // "See price in cart" / unavailable cases
      if (
        lowered.includes('price in cart') ||
        allowedIncludes(lowered, ['see price', 'add to cart']) ||
        lowered.includes('currently unavailable')
      ) {
        return { display: s || 'See price in cart', numeric: null, isRange: false, isUnavailable: true };
      }

      // Extract numbers
      const nums = s.replace(/,/g, '').match(/([0-9]+(\.[0-9]+)?)/g) || [];
      if (!nums.length) return { display: s, numeric: null, isRange: false, isUnavailable: false };

      const first = parseFloat(nums[0]);
      // Range detection: "$12.99 - $18.99" or "$12.99 – $18.99"
      const isRange = nums.length >= 2 && (s.includes('-') || s.includes('–'));
      return { display: s, numeric: Number.isFinite(first) ? first : null, isRange, isUnavailable: false };
    };

    function allowedIncludes(str, needles) {
      for (const n of needles) if (str.includes(n)) return true;
      return false;
    }

    // === PRICE helpers ===

    // Meta tag fallback
    const metaPrice = () => {
      const candidates = [
        qs('meta[itemprop="price"]')?.getAttribute('content'),
        qs('meta[property="product:price:amount"]')?.getAttribute('content'),
        qs('meta[property="og:price:amount"]')?.getAttribute('content'),
        qs('meta[name="twitter:data1"]')?.getAttribute('content'),
        qs('meta[name="twitter:label1"]')?.getAttribute('content'), // sometimes labels/values swap
        qs('meta[name="twitter:data2"]')?.getAttribute('content'),
      ].filter(Boolean);

      for (const c of candidates) {
        const p = normalizePriceText(c);
        if (p.numeric != null) return c;
      }
      return candidates[0] || '';
    };

    // JSON-LD offers price (often best on pages where DOM price is weird)
    const jsonLdPrice = () => {
      const scripts = qsa('script[type="application/ld+json"]');
      for (const sc of scripts) {
        const raw = sc.textContent?.trim();
        if (!raw) continue;

        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          continue;
        }

        const nodes = Array.isArray(data) ? data : [data];

        for (const node of nodes) {
          if (!node) continue;

          const graph = Array.isArray(node['@graph']) ? node['@graph'] : null;
          const candidates = graph ? graph : [node];

          for (const obj of candidates) {
            if (!obj) continue;

            const offers = obj.offers;
            const offersArr = Array.isArray(offers) ? offers : (offers ? [offers] : []);

            for (const offer of offersArr) {
              if (!offer) continue;

              // priceCurrency sometimes exists
              const currency = offer.priceCurrency || obj.priceCurrency || '';

              // offer.price
              if (offer.price != null) {
                const p = String(offer.price);
                const normalized = normalizePriceText(p);
                if (normalized.numeric != null) return currency ? `${currency} ${p}` : p;
              }

              // offer.priceSpecification.price
              if (offer.priceSpecification?.price != null) {
                const p = String(offer.priceSpecification.price);
                const normalized = normalizePriceText(p);
                if (normalized.numeric != null) return currency ? `${currency} ${p}` : p;
              }

              // Range
              if (offer.lowPrice != null && offer.highPrice != null) {
                const lo = String(offer.lowPrice);
                const hi = String(offer.highPrice);
                const ok = !isNaN(Number(lo)) && !isNaN(Number(hi));
                if (ok) return currency ? `${currency} ${lo} - ${hi}` : `${lo} - ${hi}`;
              }
            }

            // sometimes direct price
            if (obj.price != null) {
              const p = String(obj.price);
              const normalized = normalizePriceText(p);
              if (normalized.numeric != null) return p;
            }
          }
        }
      }
      return '';
    };

    // Build a DOM price by composing symbol+whole+fraction (works when offscreen is missing)
    const composedPrice = () => {
      const whole = pickFirst(
        [
          '#apex_desktop .a-price-whole',
          '#apex_offerDisplay_desktop .a-price-whole',
          '#corePriceDisplay_desktop_feature_div .a-price-whole',
          '#corePrice_feature_div .a-price-whole',
          '.a-price-whole',
        ],
        { visibleOnly: true }
      );

      const frac = pickFirst(
        [
          '#apex_desktop .a-price-fraction',
          '#apex_offerDisplay_desktop .a-price-fraction',
          '#corePriceDisplay_desktop_feature_div .a-price-fraction',
          '#corePrice_feature_div .a-price-fraction',
          '.a-price-fraction',
        ],
        { visibleOnly: true }
      );

      const sym = pickFirst(
        [
          '#apex_desktop .a-price-symbol',
          '#apex_offerDisplay_desktop .a-price-symbol',
          '#corePriceDisplay_desktop_feature_div .a-price-symbol',
          '#corePrice_feature_div .a-price-symbol',
          '.a-price-symbol',
        ],
        { visibleOnly: true }
      );

      if (whole && frac) return `${sym || ''}${whole}.${frac}`.trim();
      if (whole) return `${sym || ''}${whole}`.trim();
      return '';
    };

    // Main “visible price” selector set (variant-aware)
    const domPrice = () => {
      // IMPORTANT: we prefer *visible* price blocks first to match selected variant.
      // Amazon sometimes shows multiple prices (subscribe & save, list price, etc).
      return pickFirst(
        [
          // New layout: apex / offer display
          '#apex_desktop .apexPriceToPay .a-offscreen',
          '#apex_desktop .priceToPay .a-offscreen',
          '#apex_offerDisplay_desktop .apexPriceToPay .a-offscreen',
          '#apex_offerDisplay_desktop .priceToPay .a-offscreen',
          '#apex_offerDisplay_desktop [data-a-color="price"] .a-offscreen',
          '#apex_offerDisplay_desktop .a-price .a-offscreen',

          // Core price display (usually correct)
          '#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen',
          '#corePriceDisplay_desktop_feature_div .apexPriceToPay .a-offscreen',
          '#corePriceDisplay_desktop_feature_div [data-a-color="price"] .a-offscreen',
          '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',

          // Legacy ids
          '#priceblock_ourprice',
          '#priceblock_dealprice',
          '#priceblock_saleprice',

          // Some pages use "a-price-range" or show a range text
          '#corePriceDisplay_desktop_feature_div .a-price-range',
          '.a-price-range',

          // last resort
          '.a-price .a-offscreen',
        ],
        { visibleOnly: true }
      );
    };

    // Some pages show correct price only inside "twister" selection area as text
    const twisterPrice = () => {
      // Example: #twister-plus-price-data is sometimes JSON-like, but not stable.
      // We read visible "Selected" price if Amazon renders it near variation values.
      const t = pickFirst(
        [
          '#twister-plus-price-data',
          '#twister .a-price .a-offscreen',
          '#twister .priceToPay .a-offscreen',
          '#twister .a-color-price',
          '#twister .a-color-base',
        ],
        { visibleOnly: true }
      );

      // #twister-plus-price-data might include huge JSON — only extract first numeric price safely
      if (t && t.length > 200) {
        const m = t.match(/"price"\s*:\s*"?\$?([0-9,]+(\.[0-9]+)?)"?/i);
        if (m?.[1]) return `$${m[1]}`;
        const m2 = t.match(/"priceAmount"\s*:\s*([0-9]+(\.[0-9]+)?)/i);
        if (m2?.[1]) return `$${m2[1]}`;
        return '';
      }

      return t || '';
    };

    // Conservative script scan fallback (kept small)
    const scriptPrice = () => {
      const scripts = qsa('script');
      const patterns = [
        /"priceAmount"\s*:\s*([0-9]+(\.[0-9]+)?)/i,
        /"displayPrice"\s*:\s*"\$?([0-9,]+(\.[0-9]+)?)"/i,
      ];

      for (const sc of scripts) {
        const s = sc.textContent || '';
        if (!s || s.length < 500) continue; // skip tiny scripts

        for (const re of patterns) {
          const m = s.match(re);
          if (m && m[1]) {
            const num = m[1].replace(/,/g, '');
            if (!isNaN(Number(num))) return `$${num}`;
          }
        }
      }
      return '';
    };

    // === URL ===
    const url = location.href;

    // ASIN
    productData.asin =
      url.match(/\/dp\/([A-Z0-9]{10})/)?.[1] ||
      url.match(/\/gp\/product\/([A-Z0-9]{10})/)?.[1] ||
      '';

    // Title
    productData.title =
      text(qs('#productTitle')) ||
      text(qs('#title span')) ||
      text(qs('h1#title span')) ||
      text(qs('h1 span#productTitle')) ||
      text(qs('h1.a-size-large')) ||
      text(qs('span#productTitle')) ||
      'No title found';

    // Brand
    const byline =
      text(qs('#bylineInfo')) ||
      text(qs('#bylineInfo_feature_div #bylineInfo')) ||
      '';
    productData.brand = byline
      .replace(/^Visit the /i, '')
      .replace(/ Store$/i, '')
      .replace(/^Brand:\s*/i, '')
      .trim();

    // Selected variation
    const selectedVarBits = [];
    const colorLabel = qs('#variation_color_name .selection') || qs('#variation_color_name .a-dropdown-prompt');
    const sizeLabel = qs('#variation_size_name .selection') || qs('#variation_size_name .a-dropdown-prompt');
    const styleLabel = qs('#variation_style_name .selection') || qs('#variation_style_name .a-dropdown-prompt');

    if (text(colorLabel)) selectedVarBits.push(`Color: ${text(colorLabel)}`);
    if (text(sizeLabel)) selectedVarBits.push(`Size: ${text(sizeLabel)}`);
    if (text(styleLabel)) selectedVarBits.push(`Style: ${text(styleLabel)}`);

    const selectedTextGeneric = pickFirst(
      ['#centerCol #variation_values .selection', '#twister .selection'],
      { visibleOnly: true }
    );

    productData.selectedVariant = (selectedVarBits.join(' | ') || selectedTextGeneric || '').trim();

    // ✅ PRICE: DOM (visible) -> composed -> twister -> JSON-LD -> meta -> script
    const rawPrice =
      domPrice() ||
      composedPrice() ||
      twisterPrice() ||
      jsonLdPrice() ||
      metaPrice() ||
      scriptPrice() ||
      '';

    const p = normalizePriceText(rawPrice);
    productData.priceRaw = p.display || rawPrice || '';
    productData.price = p.display || rawPrice || 'Price not found';
    productData.priceIsRange = !!p.isRange;
    productData.priceNumeric = p.numeric;
    productData.priceUnavailable = !!p.isUnavailable;

    // Rating
    productData.rating =
      text(qs('#acrPopover span.a-icon-alt')) ||
      text(qs('#averageCustomerReviews .a-icon-alt')) ||
      text(qs('.a-icon-star .a-icon-alt')) ||
      text(qs('.a-icon-alt')) ||
      'No rating';

    // Review count
    productData.reviewCountText =
      text(qs('#acrCustomerReviewText')) ||
      text(qs('[data-hook="total-review-count"]')) ||
      '';

    // Category
    const crumbs = qsa(
      '#wayfinding-breadcrumbs_container ul.a-unordered-list a, #wayfinding-breadcrumbs_feature_div ul.a-unordered-list a'
    )
      .map((a) => text(a))
      .filter(Boolean);
    productData.category = crumbs.join(' > ');

    // Bullets
    productData.bullets = qsa('#feature-bullets ul li span.a-list-item')
      .map((el) => text(el))
      .filter((s) => s && s.length > 3)
      .slice(0, 10);

    // BSR
    let bsr = 'No BSR found';
    const ths = qsa('th');
    const bsrTh = ths.find((th) => {
      const t = text(th);
      return t.includes('Best Sellers Rank') || t.includes('Amazon Best Sellers Rank') || t.includes('Amazon Bestsellers Rank');
    });

    if (bsrTh) {
      const row = bsrTh.closest('tr');
      const td = row ? qs('td', row) : null;
      bsr = text(td) || text(bsrTh.nextElementSibling) || bsr;
    } else {
      const detailLis = qsa('#detailBullets_feature_div li, #detailBulletsWrapper_feature_div li');
      const bsrLi = detailLis.find((li) => text(li).includes('Best Sellers Rank'));
      if (bsrLi) bsr = text(bsrLi);
    }
    productData.bsr = bsr;

    // Seller info
    const merchantInfo = text(qs('#merchant-info')) || '';
    let shipsFrom = '';
    let soldBy = '';

    if (merchantInfo) {
      const s1 = merchantInfo.match(/Ships from\s*([^\.]+)\.?/i);
      const s2 = merchantInfo.match(/Sold by\s*([^\.]+)\.?/i);
      shipsFrom = s1 ? s1[1].trim() : '';
      soldBy = s2 ? s2[1].trim() : '';
    }

    const buybox = qs('#tabular-buybox');
    if (buybox) {
      qsa('tr', buybox).forEach((tr) => {
        const tds = qsa('td', tr);
        if (tds.length >= 2) {
          const label = text(tds[0]);
          const val = text(tds[1]);
          if (/ships from/i.test(label) && val) shipsFrom = shipsFrom || val;
          if (/sold by/i.test(label) && val) soldBy = soldBy || val;
        }
      });
    }

    productData.shipsFrom = shipsFrom;
    productData.soldBy = soldBy;
    productData.buyBoxSeller = text(qs('#merchant-info a')) || text(qs('#sellerProfileTriggerId')) || '';

    // Reviews (only what's visible)
    let reviews = [];
    const reviewEls = qsa('[data-hook="review"]');
    if (reviewEls.length) {
      reviews = reviewEls
        .slice(0, 10)
        .map((el) => {
          const body = qs('[data-hook="review-body"]', el) || qs('.review-text-content span', el);
          return text(body);
        })
        .filter(Boolean);
    }
    if (!reviews.length) {
      reviews = qsa('.review-text-content span, .a-expander-content span')
        .map((el) => text(el))
        .filter(Boolean)
        .slice(0, 10);
    }
    productData.reviews = reviews.length ? reviews : ['No reviews visible on this page'];

    sendResponse({ data: productData });
  } catch (e) {
    sendResponse({ data: null, error: String(e) });
  }

  return true; // keep the message channel open for sendResponse
});
