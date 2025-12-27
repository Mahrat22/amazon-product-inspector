chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'getProductData') return;

  try {
    const productData = {};

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

    const normalizePriceText = (raw) => {
      const s = (raw || '').replace(/\s+/g, ' ').trim();
      const lowered = s.toLowerCase();

      // “See price in cart” cases
      if (
        lowered.includes('price in cart') ||
        lowered.includes('see price') ||
        lowered.includes('add to cart')
      ) {
        return { display: s, numeric: null, isRange: false, isUnavailable: true };
      }

      const nums = s.replace(/,/g, '').match(/([0-9]+(\.[0-9]+)?)/g) || [];
      if (!nums.length) return { display: s, numeric: null, isRange: false, isUnavailable: false };

      const first = parseFloat(nums[0]);
      const isRange = nums.length >= 2 && (s.includes('-') || s.includes('–'));
      return { display: s, numeric: isFinite(first) ? first : null, isRange, isUnavailable: false };
    };

    // Meta tag fallback
    const metaPrice = () => {
      const candidates = [
        qs('meta[itemprop="price"]')?.getAttribute('content'),
        qs('meta[property="product:price:amount"]')?.getAttribute('content'),
        qs('meta[property="og:price:amount"]')?.getAttribute('content'),
        qs('meta[name="twitter:data1"]')?.getAttribute('content')
      ].filter(Boolean);

      for (const c of candidates) {
        const p = normalizePriceText(c);
        if (p.numeric != null) return c;
      }
      return candidates[0] || '';
    };

    // ✅ BEST fallback for “Price not found” pages:
    // Read JSON-LD offers price (very common on Amazon pages)
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

          // Sometimes product node is nested in @graph
          const graph = Array.isArray(node['@graph']) ? node['@graph'] : null;
          const candidates = graph ? graph : [node];

          for (const obj of candidates) {
            if (!obj) continue;

            const offers = obj.offers;
            const offersArr = Array.isArray(offers) ? offers : (offers ? [offers] : []);

            for (const offer of offersArr) {
              if (!offer) continue;

              // offer.price (number/string)
              if (offer.price != null) {
                const p = String(offer.price);
                if (!isNaN(Number(p))) return `$${p}`;
                const normalized = normalizePriceText(p);
                if (normalized.numeric != null) return p;
              }

              // offer.priceSpecification.price
              if (offer.priceSpecification?.price != null) {
                const p = String(offer.priceSpecification.price);
                if (!isNaN(Number(p))) return `$${p}`;
                const normalized = normalizePriceText(p);
                if (normalized.numeric != null) return p;
              }

              // lowPrice/highPrice (range)
              if (offer.lowPrice != null && offer.highPrice != null) {
                const lo = String(offer.lowPrice);
                const hi = String(offer.highPrice);
                if (!isNaN(Number(lo)) && !isNaN(Number(hi))) return `$${lo} - $${hi}`;
              }
            }

            // Sometimes price is directly on the Product node
            if (obj.price != null) {
              const p = String(obj.price);
              if (!isNaN(Number(p))) return `$${p}`;
              const normalized = normalizePriceText(p);
              if (normalized.numeric != null) return p;
            }
          }
        }
      }
      return '';
    };

    // Script scan fallback (kept conservative)
    const scriptPrice = () => {
      const scripts = qsa('script');
      const patterns = [
        /"priceAmount"\s*:\s*([0-9]+(\.[0-9]+)?)/i,
        /"displayPrice"\s*:\s*"\$?([0-9,]+(\.[0-9]+)?)"/i,
        /"price"\s*:\s*"?([0-9]+(\.[0-9]+)?)"?/i
      ];

      for (const sc of scripts) {
        const s = sc.textContent || '';
        if (!s || s.length < 200) continue;

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

    // Selected variation (best effort)
    const selectedVarBits = [];
    const colorLabel = qs('#variation_color_name .selection') || qs('#variation_color_name .a-dropdown-prompt');
    const sizeLabel = qs('#variation_size_name .selection') || qs('#variation_size_name .a-dropdown-prompt');
    const styleLabel = qs('#variation_style_name .selection') || qs('#variation_style_name .a-dropdown-prompt');

    if (text(colorLabel)) selectedVarBits.push(`Color: ${text(colorLabel)}`);
    if (text(sizeLabel)) selectedVarBits.push(`Size: ${text(sizeLabel)}`);
    if (text(styleLabel)) selectedVarBits.push(`Style: ${text(styleLabel)}`);

    const selectedTextGeneric = pickFirst([
      '#centerCol #variation_values .selection',
      '#twister .selection'
    ]);

    productData.selectedVariant = (selectedVarBits.join(' | ') || selectedTextGeneric || '').trim();

    // PRICE (strong selector set + JSON-LD fallback)
    const rawPrice = pickFirst([
      // Apex/new layouts
      '#apex_desktop .a-price .a-offscreen',
      '#apex_desktop .priceToPay .a-offscreen',
      '#apex_desktop .apexPriceToPay .a-offscreen',
      '#apex_offerDisplay_desktop .a-price .a-offscreen',
      '#apex_offerDisplay_desktop .priceToPay .a-offscreen',
      '#apex_offerDisplay_desktop .apexPriceToPay .a-offscreen',
      '#apex_offerDisplay_desktop [data-a-color="price"] .a-offscreen',
      '#apex_offerDisplay_desktop [data-a-color="price"]',

      // Core price display
      '#corePriceDisplay_desktop_feature_div .a-price.aok-align-center .a-offscreen',
      '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
      '#corePriceDisplay_desktop_feature_div [data-a-color="price"] .a-offscreen',
      '#corePriceDisplay_desktop_feature_div [data-a-color="price"]',

      // Other blocks / legacy
      '#corePrice_feature_div .a-offscreen',
      '.priceToPay .a-offscreen',
      '.apexPriceToPay .a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '#priceblock_saleprice',

      // Fallback
      '.a-price .a-offscreen'
    ]);

    // Compose whole/fraction if needed
    let composed = '';
    const whole = pickFirst([
      '#apex_desktop .a-price-whole',
      '#apex_offerDisplay_desktop .a-price-whole',
      '#corePriceDisplay_desktop_feature_div .a-price-whole',
      '.a-price-whole'
    ]);

    const frac = pickFirst([
      '#apex_desktop .a-price-fraction',
      '#apex_offerDisplay_desktop .a-price-fraction',
      '#corePriceDisplay_desktop_feature_div .a-price-fraction',
      '.a-price-fraction'
    ]);

    const sym = pickFirst([
      '#apex_desktop .a-price-symbol',
      '#apex_offerDisplay_desktop .a-price-symbol',
      '#corePriceDisplay_desktop_feature_div .a-price-symbol',
      '.a-price-symbol'
    ]);

    if (whole && frac) composed = `${sym || ''}${whole}.${frac}`.trim();

    // ✅ Fallback chain (DOM -> composed -> JSON-LD -> meta -> script)
    const finalRaw =
      rawPrice ||
      composed ||
      jsonLdPrice() ||
      metaPrice() ||
      scriptPrice() ||
      '';

    const p = normalizePriceText(finalRaw);

    productData.priceRaw = p.display || finalRaw || '';
    productData.price = p.display || finalRaw || 'Price not found';
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
    const crumbs = qsa('#wayfinding-breadcrumbs_container ul.a-unordered-list a, #wayfinding-breadcrumbs_feature_div ul.a-unordered-list a')
      .map(a => text(a))
      .filter(Boolean);
    productData.category = crumbs.join(' > ');

    // Bullets
    productData.bullets = qsa('#feature-bullets ul li span.a-list-item')
      .map(el => text(el))
      .filter(s => s && s.length > 3)
      .slice(0, 10);

    // BSR
    let bsr = 'No BSR found';
    const ths = qsa('th');
    const bsrTh = ths.find(th => {
      const t = text(th);
      return t.includes('Best Sellers Rank') || t.includes('Amazon Best Sellers Rank') || t.includes('Amazon Bestsellers Rank');
    });

    if (bsrTh) {
      const row = bsrTh.closest('tr');
      const td = row ? qs('td', row) : null;
      bsr = text(td) || text(bsrTh.nextElementSibling) || bsr;
    } else {
      const detailLis = qsa('#detailBullets_feature_div li, #detailBulletsWrapper_feature_div li');
      const bsrLi = detailLis.find(li => text(li).includes('Best Sellers Rank'));
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
      qsa('tr', buybox).forEach(tr => {
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
    productData.buyBoxSeller =
      text(qs('#merchant-info a')) ||
      text(qs('#sellerProfileTriggerId')) ||
      '';

    // Reviews
    let reviews = [];
    const reviewEls = qsa('[data-hook="review"]');
    if (reviewEls.length) {
      reviews = reviewEls.slice(0, 10).map(el => {
        const body = qs('[data-hook="review-body"]', el) || qs('.review-text-content span', el);
        return text(body);
      }).filter(Boolean);
    }
    if (!reviews.length) {
      reviews = qsa('.review-text-content span, .a-expander-content span')
        .map(el => text(el))
        .filter(Boolean)
        .slice(0, 10);
    }
    productData.reviews = reviews.length ? reviews : ['No reviews visible on this page'];

    sendResponse({ data: productData });
  } catch (e) {
    sendResponse({ data: null, error: String(e) });
  }

  return true;
});
