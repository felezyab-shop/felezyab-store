/* فروشگاه فلزیاب: برنامه‌ی سمت مرورگر.
   دو حالت دارد:
   • نمایشی (بدون config.js پر): داده‌ی نمونه‌ی js/demo-data.js و سفارش‌های ذخیره‌شده فقط در همین مرورگر.
   • متصل به Supabase: همه‌چیز از پایگاه داده می‌آید. داده‌ی نمونه هرگز نمایش داده نمی‌شود.
   فقط «کلید عمومی» (publishable یا anon) مجاز است. */
(function () {
  'use strict';
  var CFG = (window.STORE_CONFIG && typeof window.STORE_CONFIG === 'object') ? window.STORE_CONFIG : {};

  /* ───────── ابزارها ───────── */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fa = function (n) { return Number(n).toLocaleString('fa-IR'); };
  var money = function (n) { return fa(n) + ' تومان'; };
  var toLatin = function (s) { return String(s || '').replace(/[۰-۹]/g, function (d) { return d.charCodeAt(0) - 1776; }).replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 1632; }); };
  var safeImg = function (u) { u = String(u || ''); return /^(https?:\/\/|data:image\/)/i.test(u) || /^[A-Za-z0-9_.\-\/]+$/.test(u) ? u : ''; };
  var safeLink = function (u) { u = String(u || ''); return /^#[A-Za-z0-9_\-\/?=&%.]*$/.test(u) || /^https?:\/\//i.test(u) ? u : '#shop'; };
  var lsGet = function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (_) { return d; } };
  var lsSet = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { } };

  /* ───────── اتصال ───────── */
  var CONN = (function () {
    var r = { live: false, url: '', key: '', problem: '' };
    var url = String(CFG.supabaseUrl || '').trim().replace(/\/+$/, '');
    var key = String(CFG.supabaseKey || '').trim();
    if (CFG.demo === true || (!url && !key)) return r;
    if (!/^(https:\/\/[a-z0-9.-]+|http:\/\/(localhost|127\.0\.0\.1))(:\d{1,5})?$/i.test(url)) { r.problem = 'آدرس پروژه (supabaseUrl) در config.js درست نیست.'; return r; }
    if (!key) { r.problem = 'کلید عمومی (supabaseKey) در config.js وارد نشده است.'; return r; }
    var bad = 'کلید واردشده محرمانه است (secret یا service_role) و نباید داخل سایت باشد. اتصال انجام نشد.';
    if (/^sb_secret_/i.test(key)) { r.problem = bad; return r; }
    var seg = key.split('.');
    if (seg.length === 3) { try { var pl = JSON.parse(atob(seg[1].replace(/-/g, '+').replace(/_/g, '/'))); if (pl && pl.role && pl.role !== 'anon') { r.problem = bad; return r; } } catch (_) { } }
    r.live = true; r.url = url; r.key = key; return r;
  })();
  var LIVE = CONN.live, DEMO = !LIVE && !CONN.problem;

  function hdr(extra) {
    var h = { apikey: CONN.key, 'Content-Type': 'application/json' };
    if (CONN.key.split('.').length === 3) h.Authorization = 'Bearer ' + CONN.key;
    for (var k in (extra || {})) h[k] = extra[k];
    return h;
  }
  function api(path, opt) {
    opt = opt || {};
    return fetch(CONN.url + path, { method: opt.method || 'GET', headers: hdr(opt.headers), body: opt.body ? JSON.stringify(opt.body) : undefined })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (_) { }
          if (!r.ok) { var e = new Error((j && (j.message || j.msg)) || ('http_' + r.status)); e.status = r.status; throw e; }
          return j;
        });
      });
  }
  function rpc(fn, args) { return api('/rest/v1/rpc/' + fn, { method: 'POST', body: args }); }

  /* ───────── داده ───────── */
  var D = { products: [], categories: [], banners: [], articles: [], pages: {}, settings: {}, at: 0 };
  function byAsc(a, b) { return (a.sort || 0) - (b.sort || 0); }
  function loadAll(force) {
    if (!force && D.at && Date.now() - D.at < 60000) return Promise.resolve();
    if (DEMO) {
      var S = window.STORE_DEMO; D.products = S.products.slice(); D.categories = S.categories.slice(); D.banners = S.banners.slice();
      D.articles = S.articles.slice(); D.pages = {}; S.pages.forEach(function (p) { D.pages[p.slug] = p; }); D.settings = S.settings; D.at = Date.now();
      return Promise.resolve();
    }
    var q = function (t, extra) { return api('/rest/v1/' + t + '?select=*' + (extra || '')); };
    return Promise.all([
      q('products', '&active=eq.true&order=sort.asc,created_at.desc'), q('categories', '&active=eq.true&order=sort.asc'),
      q('banners', '&active=eq.true&order=sort.asc'), q('articles', '&active=eq.true&order=created_at.desc'),
      q('pages'), q('settings')
    ]).then(function (r) {
      D.products = r[0] || []; D.categories = r[1] || []; D.banners = r[2] || []; D.articles = r[3] || [];
      D.pages = {}; (r[4] || []).forEach(function (p) { D.pages[p.slug] = p; });
      D.settings = {}; (r[5] || []).forEach(function (s) { D.settings[s.key] = s.value; });
      D.at = Date.now();
    });
  }
  var prod = function (id) { return D.products.filter(function (p) { return p.id === id; })[0]; };
  var bySlug = function (s) { return D.products.filter(function (p) { return p.slug === s; })[0]; };
  var S = function (k) { return (D.settings && D.settings[k]) || ''; };
  var discount = function (p) { return p.old_price && p.old_price > p.price ? Math.round((1 - p.price / p.old_price) * 100) : 0; };

 
  /* ───────── سبد و مقایسه ───────── */
  var cart = lsGet('fl_cart', []).filter(function (x) {
    return x && typeof x.id === 'string' && x.qty > 0;
  });

  var cmp = lsGet('fl_cmp', []);

  function saveCart() {
    lsSet('fl_cart', cart);

    var n = cart.reduce(function (a, b) {
      return a + b.qty;
    }, 0);

    var counter = $('#cart-count');

    if (counter) {
      counter.textContent = fa(n);
    }
  }


  function cartAdd(id, n) {
    var p = prod(id); if (!p) return;
    var line = cart.filter(function (x) { return x.id === id; })[0];
    var cur = line ? line.qty : 0, add = n || 1;
    if (p.stock <= 0) return toast('این محصول فعلاً موجود نیست.');
    if (cur + add > Math.min(10, p.stock)) { toast('بیشتر از موجودی یا ۱۰ عدد ممکن نیست.'); return; }
    if (line) line.qty += add; else cart.push({ id: id, qty: add });
    saveCart(); toast('به سبد خرید اضافه شد.');
  }
  function toggleCmp(id) {
    var i = cmp.indexOf(id);
    if (i >= 0) { cmp.splice(i, 1); toast('از مقایسه برداشته شد.'); }
    else if (cmp.length >= 3) toast('حداکثر ۳ محصول را می‌توان مقایسه کرد.');
    else { cmp.push(id); toast('به مقایسه اضافه شد.'); }
    lsSet('fl_cmp', cmp);
  }
  var toastT = null;
  function toast(m) {
    var t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2400);
  }

  /* ───────── سئو و تماس ───────── */
  function waLink(num, text) {
    var n = toLatin(num).replace(/\D/g, ''); if (!n) return '';
    if (n[0] === '0') n = '98' + n.slice(1);
    return 'https://wa.me/' + n + (text ? '?text=' + encodeURIComponent(text) : '');
  }
  var telLink = function (num) { var n = toLatin(num).replace(/[^\d+]/g, ''); return n ? 'tel:' + n : ''; };
  function setMeta(title, desc, o) {
    o = o || {};
    var shop = S('shop_name') || 'فروشگاه فلزیاب';
    document.title = title ? title + ' | ' + shop : shop;
    var set = function (sel, attr, val) { var el = $(sel); if (el) el.setAttribute(attr, val); };
    var d = desc || 'فروش مستقیم دستگاه‌های فلزیاب با مشخصات فنی دقیق، ثبت سفارش آنلاین و پیگیری سفارش.';
    set('meta[name=description]', 'content', d); set('meta[property="og:title"]', 'content', document.title); set('meta[property="og:description"]', 'content', d);
    var img = $('meta[property="og:image"]');
    if (o.image && /^https?:\/\//i.test(o.image)) { if (!img) { img = document.createElement('meta'); img.setAttribute('property', 'og:image'); document.head.appendChild(img); } img.setAttribute('content', o.image); }
    else if (img) img.remove();
    var old = $('#jsonld'); if (old) old.remove();
    if (o.jsonld) { var s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'jsonld'; s.textContent = JSON.stringify(o.jsonld).replace(/</g, '\\u003c'); document.head.appendChild(s); }
  }
  function chrome() {
    var shop = S('shop_name') || 'فروشگاه فلزیاب';
    $('#shop-name').textContent = shop; $('#f-name').textContent = shop;
    $('#demo-bar').hidden = !DEMO;
    var ph = S('phone'), wa = S('whatsapp'), f = '';
    if (ph) f += '<li>تلفن: <a class="ltr" href="' + esc(telLink(ph)) + '">' + esc(ph) + '</a></li>';
    if (wa) f += '<li>واتساپ: <a class="ltr" href="' + esc(waLink(wa)) + '" rel="noopener" target="_blank">' + esc(wa) + '</a></li>';
    if (S('address')) f += '<li>' + esc(S('address')) + '</li>';
    $('#f-contact').innerHTML = f || '<li>اطلاعات تماس در پنل مدیریت وارد می‌شود.</li>';
    $('#f-license').textContent = S('license_note');
    var fl = '';
    if (ph) fl += '<a class="btn-gold" href="' + esc(telLink(ph)) + '" aria-label="تماس تلفنی" style="background:var(--gold);color:var(--goldink)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg></a>';
    if (wa) fl += '<a href="' + esc(waLink(wa)) + '" target="_blank" rel="noopener" aria-label="واتساپ" style="background:#1f8f55;color:#fff"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z"/></svg></a>';
    $('#float').innerHTML = fl;
  }

  /* ───────── اجزای نمایش ───────── */
  var PH = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#17171a"/><circle cx="400" cy="270" r="110" fill="none" stroke="#555" stroke-width="20"/></svg>');
  var img0 = function (p) { return safeImg((p.images || [])[0]) || PH; };
  function stockTxt(p) { return p.stock > 0 ? '<span class="instock">موجود</span>' : '<span class="soldout">ناموجود</span>'; }
  function priceHtml(p) { return '<div class="price"><b>' + money(p.price) + '</b>' + (discount(p) ? '<s>' + money(p.old_price) + '</s>' : '') + '</div>'; }
  function card(p) {
    var d = discount(p), inC = cmp.indexOf(p.id) >= 0;
    return '<article class="pcard">' + (d ? '<span class="badge">' + fa(d) + '٪ تخفیف</span>' : '') + (DEMO ? '<span class="tagdemo">نمونه</span>' : '') +
      '<a class="pic" href="#product/' + esc(p.slug) + '"><img loading="lazy" src="' + esc(img0(p)) + '" alt="' + esc(p.name) + '"></a>' +
      '<div class="bd"><h3><a href="#product/' + esc(p.slug) + '" style="color:inherit">' + esc(p.name) + '</a></h3>' +
      (p.model ? '<div class="md ltr">' + esc(p.model) + '</div>' : '') + stockTxt(p) + priceHtml(p) +
      '<div class="acts"><button class="btn btn-gold btn-sm" type="button" data-act="add" data-id="' + esc(p.id) + '"' + (p.stock > 0 ? '' : ' disabled') + '>افزودن به سبد</button>' +
      '<button class="btn btn-sm btn-ghost" type="button" data-act="cmp" data-id="' + esc(p.id) + '" aria-pressed="' + inC + '" title="مقایسه">' + (inC ? '✓ مقایسه' : 'مقایسه') + '</button></div></div></article>';
  }
  function grid(list) { return list.length ? '<div class="grid">' + list.map(card).join('') + '</div>' : '<div class="empty">محصولی برای نمایش نیست.</div>'; }
  function rich(t) {
    var out = [], lines = String(t || '').split(/\r?\n/), list = null;
    function flush() { if (list) { out.push('<ul>' + list.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'); list = null; } }
    var para = [];
    function fp() { if (para.length) { out.push('<p>' + para.map(esc).join('<br>') + '</p>'); para = []; } }
    lines.forEach(function (l) {
      if (/^##\s+/.test(l)) { fp(); flush(); out.push('<h2>' + esc(l.replace(/^##\s+/, '')) + '</h2>'); }
      else if (/^-\s+/.test(l)) { fp(); (list = list || []).push(l.replace(/^-\s+/, '')); }
      else if (!l.trim()) { fp(); flush(); }
      else { flush(); para.push(l); }
    });
    fp(); flush(); return out.join('');
  }
  function contactBtns(text) {
    var ph = S('phone'), wa = S('whatsapp'), h = '';
    if (ph) h += '<a class="btn" href="' + esc(telLink(ph)) + '">تماس تلفنی</a>';
    if (wa) h += '<a class="btn btn-wa" target="_blank" rel="noopener" href="' + esc(waLink(wa, text)) + '">واتساپ</a>';
    return h;
  }

  /* ───────── صفحه‌ها ───────── */
  var slideTimer = null;
  function viewHome() {
    setMeta('', S('shop_name') ? 'فروشگاه ' + S('shop_name') + ': فروش مستقیم دستگاه‌های فلزیاب با مشخصات فنی دقیق.' : '');
    var heroes = D.banners.filter(function (b) { return b.kind === 'hero'; }).sort(byAsc);
    var occ = D.banners.filter(function (b) { return b.kind === 'occasion'; }).sort(byAsc);
    if (!heroes.length) heroes = [{ title: S('shop_name') || 'فروشگاه فلزیاب', subtitle: 'فروش مستقیم دستگاه‌های فلزیاب، با مشخصات فنی دقیق و پیگیری سفارش.', link: '#shop', image: '' }];
    var h = '<section class="hero" aria-roledescription="carousel" aria-label="بنرها">' + heroes.map(function (b, i) {
      return '<div class="slide' + (i === 0 ? ' on' : '') + '">' + (safeImg(b.image) ? '<img class="bg" src="' + esc(safeImg(b.image)) + '" alt="">' : '') +
        '<div class="tx"><h1>' + esc(b.title) + '</h1>' + (b.subtitle ? '<p>' + esc(b.subtitle) + '</p>' : '') +
        '<a class="btn btn-gold" href="' + esc(safeLink(b.link)) + '">مشاهده</a></div></div>';
    }).join('') + (heroes.length > 1 ? '<div class="dots">' + heroes.map(function (_, i) { return '<button type="button" class="' + (i === 0 ? 'on' : '') + '" data-act="slide" data-i="' + i + '" aria-label="بنر ' + fa(i + 1) + '"></button>'; }).join('') + '</div>' : '') + '</section>';
    occ.forEach(function (b) {
      h += '<div class="occasion section"><div><b>' + esc(b.title) + '</b><div class="muted">' + esc(b.subtitle) + '</div></div><a class="btn btn-gold btn-sm" href="' + esc(safeLink(b.link)) + '">مشاهده</a></div>';
    });
    h += '<section class="section trust"><div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 7h13l5 5v5h-3M3 7v10h2m4 0h6"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg><span><b>فروش مستقیم</b>دستگاه از فروشنده به مشتری</span></div>' +
      '<div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg><span><b>مشخصات فنی شفاف</b>هر مورد در صفحه‌ی محصول</span></div>' +
      '<div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span><b>پیگیری سفارش</b>با کد سفارش و شماره موبایل</span></div>' +
      '<div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12l4 4 10-10"/></svg><span><b>دو روش ثبت سفارش</b>هماهنگی مستقیم یا پرداخت آنلاین</span></div></section>';
    var feat = D.products.filter(function (p) { return p.featured; }).slice(0, 8);
    var best = D.products.filter(function (p) { return p.bestseller; }).slice(0, 8);
    var disc = D.products.filter(function (p) { return discount(p) > 0; }).slice(0, 8);
    if (!D.products.length) h += '<div class="empty section">محصولی ثبت نشده است. محصولات از پنل مدیریت اضافه می‌شوند.</div>';
    [['محصولات ویژه', feat], ['پرفروش‌ها', best], ['تخفیف‌ها', disc]].forEach(function (s) {
      if (s[1].length) h += '<section class="section"><div class="sec-head"><h2>' + s[0] + '</h2><a href="#shop">همه‌ی محصولات</a></div>' + grid(s[1]) + '</section>';
    });
    if (D.articles.length) h += '<section class="section"><div class="sec-head"><h2>مقاله‌ها و آموزش‌ها</h2><a href="#articles">همه‌ی مقاله‌ها</a></div><div class="grid">' +
      D.articles.slice(0, 3).map(function (a) { return '<a class="acard" href="#article/' + esc(a.slug) + '"><h3>' + esc(a.title) + '</h3><p class="muted small">' + esc(a.excerpt) + '</p></a>'; }).join('') + '</div></section>';
    h += '<section class="section notice"><b>پیش از خرید:</b> خرید و استفاده از دستگاه فلزیاب باید مطابق قوانین باشد. <a href="#terms">قوانین و شرایط خرید</a> را بخوانید.' + (contactBtns('') ? '<div class="row" style="margin-top:10px">' + contactBtns('سلام، درباره‌ی خرید فلزیاب سؤال دارم.') + '</div>' : '') + '</section>';
    return h;
  }
  function startSlides() {
    clearInterval(slideTimer);
    var slides = $$('.slide'); if (slides.length < 2 || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var i = 0; slideTimer = setInterval(function () { go(i + 1); }, 6500);
    function go(n) { i = (n + slides.length) % slides.length; slides.forEach(function (s, k) { s.classList.toggle('on', k === i); }); $$('.dots button').forEach(function (b, k) { b.classList.toggle('on', k === i); }); }
    window.__go = go;
  }

  function viewShop(params) {
    setMeta('فروشگاه', 'فهرست دستگاه‌های فلزیاب و لوازم جانبی با قیمت و مشخصات فنی.');
    var cat = params.cat || '', q = (params.q || '').trim().toLowerCase(), sort = params.sort || 'new', only = params.stock === '1';
    var list = D.products.filter(function (p) {
      if (cat) { var c = D.categories.filter(function (x) { return x.slug === cat; })[0]; if (!c || p.category_id !== c.id) return false; }
      if (only && p.stock <= 0) return false;
      if (q && (p.name + ' ' + p.model + ' ' + p.short_text).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    list.sort({
      'price-asc': function (a, b) { return a.price - b.price; }, 'price-desc': function (a, b) { return b.price - a.price; },
      'discount': function (a, b) { return discount(b) - discount(a); }, 'new': function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); }
    }[sort] || function () { return 0; });
    return '<h1>فروشگاه</h1><form class="toolbar" id="shop-form" role="search">' +
      '<input class="in q" name="q" type="search" placeholder="جست‌وجوی نام یا مدل" aria-label="جست‌وجو" value="' + esc(params.q || '') + '">' +
      '<select class="in" name="cat" aria-label="دسته‌بندی"><option value="">همه‌ی دسته‌ها</option>' + D.categories.map(function (c) { return '<option value="' + esc(c.slug) + '"' + (c.slug === cat ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select>' +
      '<select class="in" name="sort" aria-label="مرتب‌سازی">' + [['new', 'جدیدترین'], ['price-asc', 'ارزان‌ترین'], ['price-desc', 'گران‌ترین'], ['discount', 'بیشترین تخفیف']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sort ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<label class="chip' + (only ? ' on' : '') + '" style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" name="stock" value="1"' + (only ? ' checked' : '') + ' style="accent-color:var(--gold)">فقط موجود</label></form>' +
      '<p class="muted small" aria-live="polite">' + fa(list.length) + ' محصول</p>' + grid(list);
  }

  function viewProduct(slug) {
    var p = bySlug(slug);
    if (!p) { setMeta('محصول پیدا نشد', ''); return '<div class="empty">این محصول پیدا نشد یا دیگر عرضه نمی‌شود. <a href="#shop">بازگشت به فروشگاه</a></div>'; }
    var cname = (D.categories.filter(function (c) { return c.id === p.category_id; })[0] || {}).name;
    var imgs = (p.images || []).map(safeImg).filter(Boolean); if (!imgs.length) imgs = [PH];
    var specs = (p.specs || []).filter(function (s) { return s && s.k; });
    var url = location.href.split('#')[0] + '#product/' + p.slug;
    var shareText = p.name + ' - ' + money(p.price);
    setMeta(p.seo_title || p.name, p.seo_desc || p.short_text || (p.name + (p.model ? ' (' + p.model + ')' : '')), {
      image: imgs[0], jsonld: {
        '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: p.model || p.slug, image: imgs.filter(function (u) { return /^https?:/i.test(u); }),
        description: p.short_text || p.name, offers: { '@type': 'Offer', priceCurrency: 'IRR', price: String(p.price * 10), availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: url }
      }
    });
    var rel = D.products.filter(function (x) { return x.id !== p.id && x.category_id === p.category_id; }).slice(0, 4);
    var inC = cmp.indexOf(p.id) >= 0;
    return '<div class="crumbs"><a href="#home">خانه</a> / <a href="#shop">فروشگاه</a>' + (cname ? ' / ' + esc(cname) : '') + '</div>' +
      '<div class="pd"><div class="gal"><div class="main"><img id="pmain" src="' + esc(imgs[0]) + '" alt="' + esc(p.name) + '"></div>' +
      (imgs.length > 1 ? '<div class="thumbs">' + imgs.map(function (u, i) { return '<button type="button" data-act="thumb" data-src="' + esc(u) + '" class="' + (i === 0 ? 'on' : '') + '" aria-label="تصویر ' + fa(i + 1) + '"><img src="' + esc(u) + '" alt=""></button>'; }).join('') + '</div>' : '') + '</div>' +
      '<div class="buybox"><div>' + (DEMO ? '<span class="tagdemo" style="position:static;display:inline-block;margin-bottom:6px">نمونه</span>' : '') + '<h1 style="margin-bottom:.1em">' + esc(p.name) + '</h1>' + (p.model ? '<div class="muted ltr">' + esc(p.model) + '</div>' : '') + '</div>' +
      '<div>' + (discount(p) ? '<span class="badge" style="position:static;display:inline-block">' + fa(discount(p)) + '٪ تخفیف</span> ' : '') + stockTxt(p) + (p.stock > 0 && p.stock <= 3 ? ' <span class="muted small">(' + fa(p.stock) + ' عدد باقی مانده)</span>' : '') + '</div>' +
      '<div class="price"><span class="big">' + money(p.price) + '</span>' + (discount(p) ? '<s>' + money(p.old_price) + '</s>' : '') + '</div>' +
      (p.short_text ? '<p class="muted" style="margin:0">' + esc(p.short_text) + '</p>' : '') +
      '<div class="row"><div class="qty" role="group" aria-label="تعداد"><button type="button" data-act="q-" aria-label="کم کردن">−</button><span id="pq">۱</span><button type="button" data-act="q+" aria-label="زیاد کردن">+</button></div>' +
      '<button class="btn btn-gold" type="button" data-act="add-q" data-id="' + esc(p.id) + '"' + (p.stock > 0 ? '' : ' disabled') + '>افزودن به سبد</button>' +
      '<button class="btn" type="button" data-act="buy-q" data-id="' + esc(p.id) + '"' + (p.stock > 0 ? '' : ' disabled') + '>خرید سریع</button></div>' +
      '<div class="row"><button class="btn btn-sm btn-ghost" type="button" data-act="cmp" data-id="' + esc(p.id) + '" aria-pressed="' + inC + '">' + (inC ? '✓ در مقایسه' : 'مقایسه') + '</button>' + contactBtns('سلام، درباره‌ی «' + p.name + '» سؤال دارم.') + '</div>' +
      '<div class="row small muted">اشتراک‌گذاری: ' + (navigator.share ? '<button class="btn btn-sm btn-ghost" type="button" data-act="share" data-url="' + esc(url) + '" data-text="' + esc(shareText) + '">ارسال</button>' : '') +
      '<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(shareText + ' ' + url) + '">واتساپ</a>' +
      '<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(shareText) + '">تلگرام</a>' +
      '<button class="btn btn-sm btn-ghost" type="button" data-act="copy" data-url="' + esc(url) + '">کپی لینک</button></div>' +
      '<div class="notice">خرید و استفاده از این دستگاه باید مطابق قوانین باشد. نتیجه‌ی کار دستگاه به شرایط محیط و کاربر بستگی دارد. ' + esc(S('license_note')) + '</div></div></div>' +
      (specs.length ? '<section class="section"><h2>مشخصات فنی</h2><div class="tbl-wrap"><table class="spec"><tbody>' + specs.map(function (s) { return '<tr><th scope="row">' + esc(s.k) + '</th><td>' + esc(s.v) + '</td></tr>'; }).join('') + '</tbody></table></div></section>' : '') +
      (p.description ? '<section class="section prose"><h2>توضیحات</h2>' + rich(p.description) + '</section>' : '') +
      (rel.length ? '<section class="section"><h2>محصولات مرتبط</h2>' + grid(rel) + '</section>' : '');
  }

  function viewCompare() {
    setMeta('مقایسه‌ی دستگاه‌ها', 'مقایسه‌ی مشخصات فنی و قیمت دستگاه‌های فلزیاب.');
    var list = cmp.map(prod).filter(Boolean);
    if (list.length < 1) return '<h1>مقایسه‌ی دستگاه‌ها</h1><div class="empty">هنوز محصولی برای مقایسه انتخاب نشده است. در فهرست محصولات، دکمه‌ی «مقایسه» را بزنید (تا ۳ محصول).<br><a class="btn btn-gold" href="#shop" style="margin-top:12px">رفتن به فروشگاه</a></div>';
    var keys = []; list.forEach(function (p) { (p.specs || []).forEach(function (s) { if (s && s.k && keys.indexOf(s.k) < 0) keys.push(s.k); }); });
    var val = function (p, k) { var s = (p.specs || []).filter(function (x) { return x && x.k === k; })[0]; return s ? esc(s.v) : '<span class="muted">—</span>'; };
    return '<h1>مقایسه‌ی دستگاه‌ها</h1><div class="tbl-wrap"><table class="spec cmpt"><thead><tr><th scope="col"></th>' + list.map(function (p) {
      return '<th scope="col" style="width:auto"><a href="#product/' + esc(p.slug) + '"><img src="' + esc(img0(p)) + '" alt="" style="width:120px;height:90px;object-fit:cover;border-radius:8px;margin-bottom:6px"><br>' + esc(p.name) + '</a><br><button class="btn btn-sm btn-ghost" type="button" data-act="cmp" data-id="' + esc(p.id) + '" data-re="1">حذف</button></th>'; }).join('') + '</tr></thead><tbody>' +
      '<tr><th scope="row">قیمت</th>' + list.map(function (p) { return '<td><b class="gold">' + money(p.price) + '</b>' + (discount(p) ? '<br><s class="muted small">' + money(p.old_price) + '</s>' : '') + '</td>'; }).join('') + '</tr>' +
      '<tr><th scope="row">موجودی</th>' + list.map(function (p) { return '<td>' + (p.stock > 0 ? 'موجود' : 'ناموجود') + '</td>'; }).join('') + '</tr>' +
      '<tr><th scope="row">مدل</th>' + list.map(function (p) { return '<td class="ltr">' + esc(p.model || '—') + '</td>'; }).join('') + '</tr>' +
      keys.map(function (k) { return '<tr><th scope="row">' + esc(k) + '</th>' + list.map(function (p) { return '<td>' + val(p, k) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '<tr><th scope="row"></th>' + list.map(function (p) { return '<td><button class="btn btn-gold btn-sm" type="button" data-act="add" data-id="' + esc(p.id) + '"' + (p.stock > 0 ? '' : ' disabled') + '>افزودن به سبد</button></td>'; }).join('') + '</tr></tbody></table></div>';
  }

  function cartLines() { return cart.map(function (l) { var p = prod(l.id); return p ? { p: p, qty: Math.min(l.qty, 10) } : null; }).filter(Boolean); }
  function cartTotal(ls) { return ls.reduce(function (a, l) { return a + l.p.price * l.qty; }, 0); }
  function viewCart() {
    setMeta('سبد خرید', '');
    cart = cart.filter(function (l) { return prod(l.id); }); saveCart();
    var ls = cartLines();
    if (!ls.length) return '<h1>سبد خرید</h1><div class="empty">سبد خرید خالی است.<br><a class="btn btn-gold" href="#shop" style="margin-top:12px">رفتن به فروشگاه</a></div>';
    return '<h1>سبد خرید</h1><div class="two"><div class="cart-box">' + ls.map(function (l) {
      var over = l.p.stock < l.qty;
      return '<div class="cart-line"><img src="' + esc(img0(l.p)) + '" alt=""><div style="min-width:0"><a href="#product/' + esc(l.p.slug) + '" style="color:inherit"><b>' + esc(l.p.name) + '</b></a><div class="muted small">' + money(l.p.price) + (over ? ' · <span class="soldout">موجودی کافی نیست (' + fa(l.p.stock) + ')</span>' : '') + '</div></div>' +
        '<div style="text-align:end"><div class="qty" role="group" aria-label="تعداد"><button type="button" data-act="cq-" data-id="' + esc(l.p.id) + '" aria-label="کم کردن">−</button><span>' + fa(l.qty) + '</span><button type="button" data-act="cq+" data-id="' + esc(l.p.id) + '" aria-label="زیاد کردن">+</button></div>' +
        '<div><button class="btn btn-sm btn-ghost" type="button" data-act="rm" data-id="' + esc(l.p.id) + '" style="margin-top:6px">حذف</button></div></div></div>'; }).join('') + '</div>' +
      '<aside class="cart-box" style="padding:16px"><h2>خلاصه‌ی سفارش</h2><div class="sum"><span>جمع کالاها</span><span>' + money(cartTotal(ls)) + '</span></div><div class="sum muted small"><span>هزینه‌ی ارسال</span><span>هنگام هماهنگی اعلام می‌شود</span></div><div class="sum t"><span>مبلغ قابل پرداخت</span><span>' + money(cartTotal(ls)) + '</span></div>' +
      '<a class="btn btn-gold" href="#checkout" style="width:100%;margin-top:10px"' + (ls.some(function (l) { return l.p.stock < l.qty; }) ? ' aria-disabled="true"' : '') + '>ادامه و ثبت سفارش</a></aside></div>';
  }

  var lastOrder = null;
  function viewCheckout() {
    setMeta('ثبت سفارش', '');
    var ls = cartLines(); if (!ls.length) return '<h1>ثبت سفارش</h1><div class="empty">سبد خرید خالی است. <a href="#shop">فروشگاه</a></div>';
    var onlineOK = LIVE && S('online_payment') === 'on';
    return '<h1>ثبت سفارش</h1>' + (DEMO ? '<div class="notice" style="margin-bottom:14px">نسخه نمایشی: سفارش فقط در همین مرورگر ذخیره می‌شود و برای فروشنده ارسال نمی‌شود.</div>' : '') +
      '<div class="two"><form class="form cart-box" id="order-form" novalidate style="padding:16px">' +
      '<label>نام و نام خانوادگی<input class="in" name="name" autocomplete="name" required maxlength="80"></label>' +
      '<label>شماره موبایل<input class="in ltr" name="phone" inputmode="numeric" autocomplete="tel" placeholder="09123456789" required maxlength="14" dir="ltr"></label>' +
      '<label>شهر<input class="in" name="city" autocomplete="address-level2" required maxlength="60"></label>' +
      '<label>نشانی کامل<textarea class="in" name="address" autocomplete="street-address" required maxlength="400"></textarea></label>' +
      '<label>توضیحات (اختیاری)<textarea class="in" name="note" maxlength="400" style="min-height:64px"></textarea></label>' +
      '<div class="hp" aria-hidden="true"><label>وب‌سایت<input name="website" tabindex="-1" autocomplete="off"></label></div>' +
      '<fieldset style="border:0;padding:0;margin:0;display:grid;gap:8px"><legend style="font-weight:600;margin-bottom:6px">روش ثبت سفارش</legend>' +
      '<label class="opt on"><input type="radio" name="method" value="contact" checked><span><b>ثبت سفارش و هماهنگی با فروشنده</b><br><span class="muted small">بعد از ثبت، فروشنده با شما تماس می‌گیرد یا از طریق واتساپ هماهنگ می‌کنید.</span></span></label>' +
      '<label class="opt' + (onlineOK ? '' : '" style="opacity:.55') + '"><input type="radio" name="method" value="online"' + (onlineOK ? '' : ' disabled') + '><span><b>پرداخت آنلاین (زرین‌پال)</b><br><span class="muted small">' + (onlineOK ? 'پس از ثبت، به درگاه پرداخت می‌روید.' : (DEMO ? 'در نسخه نمایشی فعال نیست.' : 'فعلاً فعال نیست. سفارش را با هماهنگی مستقیم ثبت کنید.')) + '</span></span></label></fieldset>' +
      '<div class="err" id="order-err" role="alert"></div><button class="btn btn-gold" type="submit" id="order-btn">ثبت سفارش</button></form>' +
      '<aside class="cart-box" style="padding:16px"><h2>سفارش شما</h2>' + ls.map(function (l) { return '<div class="sum"><span>' + esc(l.p.name) + ' × ' + fa(l.qty) + '</span><span>' + money(l.p.price * l.qty) + '</span></div>'; }).join('') + '<div class="sum t"><span>جمع</span><span>' + money(cartTotal(ls)) + '</span></div><p class="muted small">قیمت نهایی را سرور هنگام ثبت محاسبه می‌کند.</p></aside></div>';
  }
  var ERR = {
    bad_phone: 'شماره موبایل درست نیست. نمونه: 09123456789', bad_name: 'نام را کامل وارد کنید.', bad_city: 'شهر را وارد کنید.', bad_address: 'نشانی را کامل‌تر بنویسید (حداقل ۱۰ حرف).',
    out_of_stock: 'موجودی یکی از محصولات کافی نیست. سبد خرید را بازبینی کنید.', product_unavailable: 'یکی از محصولات دیگر عرضه نمی‌شود.', too_many_orders: 'تعداد سفارش‌های این شماره در یک ساعت زیاد است. بعداً دوباره امتحان کنید یا تماس بگیرید.',
    online_disabled: 'پرداخت آنلاین فعلاً فعال نیست.', bad_items: 'سبد خرید معتبر نیست.', too_many_attempts: 'تلاش‌های پیاپی زیاد بود. چند دقیقه بعد دوباره امتحان کنید.'
  };
  var errMsg = function (e) { var m = String((e && e.message) || ''); for (var k in ERR) if (m.indexOf(k) >= 0) return ERR[k]; return 'ارتباط با سرور برقرار نشد. اینترنت را بررسی کنید و دوباره تلاش کنید.'; };

  function submitOrder(form) {
    var f = form.elements, err = $('#order-err'), btn = $('#order-btn');
    if (f.website.value) return;                                    // تله‌ی ربات
    var phone = toLatin(f.phone.value).replace(/\s/g, '');
    var v = { name: f.name.value.trim(), phone: phone, city: f.city.value.trim(), address: f.address.value.trim(), note: f.note.value.trim(), method: form.querySelector('input[name=method]:checked').value };
    if (v.name.length < 3) return err.textContent = ERR.bad_name;
    if (!/^09\d{9}$/.test(v.phone)) return err.textContent = ERR.bad_phone;
    if (v.city.length < 2) return err.textContent = ERR.bad_city;
    if (v.address.length < 10) return err.textContent = ERR.bad_address;
    err.textContent = ''; btn.disabled = true; btn.textContent = 'در حال ثبت…';
    var ls = cartLines(), items = ls.map(function (l) { return { id: l.p.id, qty: l.qty }; });
    var done = function (o) { lastOrder = { code: o.code, total: o.total, method: v.method, phone: v.phone, lines: ls.map(function (l) { return { name: l.p.name, qty: l.qty, price: l.p.price }; }) }; cart = []; saveCart(); location.hash = '#done'; };
    if (DEMO) {
      var code = 'F' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'), os = lsGet('fl_demo_orders', []);
      os.push({ code: code, phone: v.phone, status: 'new', payment_status: 'unpaid', method: 'contact', total: cartTotal(ls), created_at: new Date().toISOString(), city: v.city, items: ls.map(function (l) { return { name: l.p.name, qty: l.qty, price: l.p.price }; }) });
      lsSet('fl_demo_orders', os); v.method = 'contact'; return done({ code: code, total: cartTotal(ls) });
    }
    rpc('place_order', { p_name: v.name, p_phone: v.phone, p_city: v.city, p_address: v.address, p_note: v.note, p_items: items, p_method: v.method })
      .then(function (r) {
        if (v.method === 'online') return startPay(r.code, v.phone).then(function (ok) { lastOrder_payFail = !ok; done(r); });
        done(r);
      }).catch(function (e) { err.textContent = errMsg(e); btn.disabled = false; btn.textContent = 'ثبت سفارش'; });
  }
  var lastOrder_payFail = false;
  function startPay(code, phone) {
    return fetch(CONN.url + '/functions/v1/pay-create', { method: 'POST', headers: hdr(), body: JSON.stringify({ code: code, phone: phone }) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) { if (j && typeof j.url === 'string' && /^https:\/\/[a-z0-9.-]*zarinpal\.com\//i.test(j.url) || (j && /^http:\/\/(127\.0\.0\.1|localhost)/.test(j.url || ''))) { setTimeout(function () { location.href = j.url; }, 60); return true; } return false; })
      .catch(function () { return false; });
  }
  function viewDone() {
    setMeta('سفارش ثبت شد', '');
    if (!lastOrder) return '<div class="empty">سفارشی برای نمایش نیست. <a href="#track">پیگیری سفارش</a></div>';
    var o = lastOrder;
    return '<h1>سفارش شما ثبت شد</h1><div class="cart-box" style="padding:18px;max-width:640px">' +
      (DEMO ? '<div class="notice" style="margin-bottom:12px">نسخه نمایشی: این سفارش واقعی نیست.</div>' : '') +
      '<p>کد سفارش شما:</p><p style="font-size:1.8rem;font-weight:800;color:var(--gold2)" class="ltr" id="done-code">' + esc(o.code) + '</p>' +
      '<p class="muted">این کد و شماره موبایل ثبت‌شده را برای پیگیری نگه دارید.</p>' +
      o.lines.map(function (l) { return '<div class="sum"><span>' + esc(l.name) + ' × ' + fa(l.qty) + '</span><span>' + money(l.price * l.qty) + '</span></div>'; }).join('') +
      '<div class="sum t"><span>جمع</span><span>' + money(o.total) + '</span></div>' +
      (o.method === 'online' ? (lastOrder_payFail ? '<div class="notice" style="margin:12px 0">سفارش ثبت شد، ولی اتصال به درگاه برقرار نشد. از صفحه‌ی پیگیری دوباره پرداخت را امتحان کنید یا با فروشنده تماس بگیرید.</div>' : '<div class="notice" style="margin:12px 0">در حال انتقال به درگاه پرداخت…</div>') : '<div class="notice" style="margin:12px 0">فروشنده برای هماهنگی نهایی با شما تماس می‌گیرد. می‌توانید خودتان هم تماس بگیرید.</div>') +
      '<div class="row">' + contactBtns('سلام، سفارش من با کد ' + o.code + ' را ثبت کرده‌ام.') + '<a class="btn btn-gold" href="#track?code=' + encodeURIComponent(o.code) + '">پیگیری سفارش</a></div></div>';
  }

  var STEPS = [['new', 'ثبت شد'], ['confirmed', 'تأیید شد'], ['preparing', 'آماده‌سازی'], ['shipped', 'ارسال شد'], ['delivered', 'تحویل شد']];
  var PAYTXT = { unpaid: ['پرداخت نشده', 'wait'], pending: ['در انتظار پرداخت', 'wait'], paid: ['پرداخت شده', 'ok'], failed: ['پرداخت ناموفق', 'bad'] };
  var PAYMSG = { ok: 'پرداخت شما ثبت شد. برای دیدن وضعیت قطعی، شماره موبایل را وارد کنید.', failed: 'پرداخت تأیید نشد. اگر مبلغی کسر شده، معمولاً تا ۷۲ ساعت برمی‌گردد. می‌توانید دوباره پرداخت کنید.',
    canceled: 'پرداخت انجام نشد (انصراف). می‌توانید دوباره پرداخت کنید.', pending: 'نتیجه‌ی پرداخت هنوز مشخص نیست. چند دقیقه بعد وضعیت سفارش را دوباره ببینید.', duplicate: 'این پرداخت قبلاً ثبت شده است.', unknown: 'تراکنش پیدا نشد.' };
  function viewTrack(params) {
    setMeta('پیگیری سفارش', 'با کد سفارش و شماره موبایل، وضعیت سفارش خود را ببینید.');
    return '<h1>پیگیری سفارش</h1>' + (params.pay && PAYMSG[params.pay] ? '<div class="notice" style="margin-bottom:14px" role="status">' + esc(PAYMSG[params.pay]) + '</div>' : '') +
      '<form class="form cart-box" id="track-form" style="padding:16px;max-width:520px"><label>کد سفارش<input class="in ltr" name="code" placeholder="F12345678" required maxlength="12" dir="ltr" value="' + esc((params.code || '').toUpperCase()) + '"></label>' +
      '<label>شماره موبایل ثبت‌شده<input class="in ltr" name="phone" inputmode="numeric" placeholder="09123456789" required maxlength="14" dir="ltr"></label>' +
      '<div class="err" id="track-err" role="alert"></div><button class="btn btn-gold" type="submit">مشاهده‌ی وضعیت</button></form><div id="track-out" style="margin-top:18px;max-width:640px"></div>';
  }
  function trackLookup(code, phone) {
    code = code.trim().toUpperCase(); phone = toLatin(phone).replace(/\s/g, '');
    if (!/^09\d{9}$/.test(phone)) return Promise.reject(new Error('bad_phone'));
    if (DEMO) { var o = lsGet('fl_demo_orders', []).filter(function (x) { return x.code === code && x.phone === phone; })[0]; return Promise.resolve(o ? o : { error: 'not_found' }); }
    return rpc('track_order', { p_code: code, p_phone: phone });
  }
  function renderTrack(t, phone) {
    if (!t || t.error) return '<div class="empty">سفارشی با این کد و شماره پیدا نشد. کد و شماره را دوباره بررسی کنید.</div>';
    var idx = STEPS.map(function (s) { return s[0]; }).indexOf(t.status), cancelled = t.status === 'cancelled', pay = PAYTXT[t.payment_status] || ['—', 'wait'];
    var canPay = LIVE && t.method === 'online' && !cancelled && t.payment_status !== 'paid' && S('online_payment') === 'on';
    return '<div class="cart-box" style="padding:18px"><div class="row" style="justify-content:space-between"><b class="ltr">' + esc(t.code) + '</b><span class="pill ' + (cancelled ? 'bad' : 'wait') + '">' + (cancelled ? 'لغو شده' : esc(STEPS[idx] ? STEPS[idx][1] : t.status)) + '</span></div>' +
      (cancelled ? '' : '<div class="steps" aria-label="مراحل سفارش">' + STEPS.map(function (s, i) { return '<div class="' + (i <= idx ? 'on' : '') + '">' + s[1] + '</div>'; }).join('') + '</div>') +
      '<div class="row" style="margin:8px 0"><span class="muted">روش:</span> ' + (t.method === 'online' ? 'پرداخت آنلاین' : 'هماهنگی مستقیم با فروشنده') + ' <span class="pill ' + pay[1] + '">' + pay[0] + '</span></div>' +
      (t.items || []).map(function (l) { return '<div class="sum"><span>' + esc(l.name) + ' × ' + fa(l.qty) + '</span><span>' + money(l.price * l.qty) + '</span></div>'; }).join('') +
      '<div class="sum t"><span>جمع</span><span>' + money(t.total) + '</span></div><p class="muted small">ثبت: ' + esc(new Date(t.created_at).toLocaleDateString('fa-IR')) + '</p>' +
      '<div class="row">' + (canPay ? '<button class="btn btn-gold" type="button" data-act="pay" data-code="' + esc(t.code) + '" data-phone="' + esc(phone) + '">' + (t.payment_status === 'failed' ? 'پرداخت دوباره' : 'پرداخت آنلاین') + '</button>' : '') + contactBtns('سلام، درباره‌ی سفارش ' + t.code + ' سؤال دارم.') + '</div></div>';
  }

  function viewPage(slug) {
    var pg = D.pages[slug] || { title: '', body: '' };
    setMeta(pg.title, String(pg.body).slice(0, 150).replace(/\s+/g, ' '));
    var h = '<h1>' + esc(pg.title) + '</h1><div class="prose">' + rich(pg.body) + '</div>';
    if (slug === 'contact') {
      var li = '';
      if (S('phone')) li += '<li>تلفن: <a class="ltr" href="' + esc(telLink(S('phone'))) + '">' + esc(S('phone')) + '</a></li>';
      if (S('whatsapp')) li += '<li>واتساپ: <a class="ltr" target="_blank" rel="noopener" href="' + esc(waLink(S('whatsapp'))) + '">' + esc(S('whatsapp')) + '</a></li>';
      if (S('address')) li += '<li>نشانی: ' + esc(S('address')) + '</li>';
      if (S('hours')) li += '<li>ساعت پاسخ‌گویی: ' + esc(S('hours')) + '</li>';
      h += '<div class="cart-box" style="padding:16px;max-width:560px"><ul style="margin:0;padding-inline-start:20px">' + (li || '<li class="muted">هنوز اطلاعات تماس وارد نشده است.</li>') + '</ul><div class="row" style="margin-top:12px">' + contactBtns('سلام') + '</div></div>';
    }
    return h;
  }
  function viewArticles() {
    setMeta('مقاله‌ها و آموزش‌ها', 'مقاله‌ها و نکات آموزشی درباره‌ی انتخاب و نگهداری دستگاه‌های فلزیاب.');
    return '<h1>مقاله‌ها و آموزش‌ها</h1>' + (D.articles.length ? '<div class="grid">' + D.articles.map(function (a) { return '<a class="acard" href="#article/' + esc(a.slug) + '"><h3>' + esc(a.title) + '</h3><p class="muted small">' + esc(a.excerpt) + '</p><span class="small">' + esc(new Date(a.created_at).toLocaleDateString('fa-IR')) + '</span></a>'; }).join('') + '</div>' : '<div class="empty">هنوز مقاله‌ای منتشر نشده است.</div>');
  }
  function viewArticle(slug) {
    var a = D.articles.filter(function (x) { return x.slug === slug; })[0];
    if (!a) { setMeta('مقاله پیدا نشد', ''); return '<div class="empty">این مقاله پیدا نشد. <a href="#articles">همه‌ی مقاله‌ها</a></div>'; }
    setMeta(a.title, a.excerpt, { jsonld: { '@context': 'https://schema.org', '@type': 'Article', headline: a.title, datePublished: a.created_at, inLanguage: 'fa' } });
    return '<div class="crumbs"><a href="#home">خانه</a> / <a href="#articles">مقاله‌ها</a></div><article class="prose"><h1>' + esc(a.title) + '</h1><p class="muted small">' + esc(new Date(a.created_at).toLocaleDateString('fa-IR')) + '</p>' + rich(a.body) + '</article>';
  }

  /* ───────── مسیریابی ───────── */
  function parseHash() {
    var h = location.hash.replace(/^#/, ''), q = {}, i = h.indexOf('?');
    if (i >= 0) { h.slice(i + 1).split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); }); h = h.slice(0, i); }
    var seg = h.split('/'); return { name: seg[0] || 'home', arg: seg.slice(1).join('/'), q: q };
  }
  var routing = 0;
  function route() {
    var r = parseHash(), app = $('#app'), my = ++routing;
    clearInterval(slideTimer);
    $$('nav.main a').forEach(function (a) { a.classList.toggle('on', a.dataset.r === r.name); });
    $('#nav').classList.remove('open'); $('#menu-btn').setAttribute('aria-expanded', 'false');
    if (CONN.problem) { app.innerHTML = '<div class="empty"><b>اتصال به پایگاه داده انجام نشد</b><br>' + esc(CONN.problem) + '</div>'; return; }
    loadAll(r.name === 'track' || r.name === 'done').then(function () {
      if (my !== routing) return;
      chrome();
      var v = { home: viewHome, shop: function () { return viewShop(r.q); }, product: function () { return viewProduct(r.arg); }, compare: viewCompare, cart: viewCart, checkout: viewCheckout, done: viewDone,
        track: function () { return viewTrack(r.q); }, about: function () { return viewPage('about'); }, contact: function () { return viewPage('contact'); }, guide: function () { return viewPage('guide'); },
        terms: function () { return viewPage('terms'); }, articles: viewArticles, article: function () { return viewArticle(r.arg); } }[r.name] || viewHome;
      app.innerHTML = v();
      if (r.name === 'home') startSlides();
      if (r.name === 'track' && r.q.code && r.q.pay) { /* فرم پر شده؛ کاربر شماره را وارد می‌کند */ }
      window.scrollTo(0, 0);
    }).catch(function () {
      if (my !== routing) return;
      app.innerHTML = '<div class="empty">بارگذاری اطلاعات فروشگاه انجام نشد. اینترنت را بررسی کنید.<br><button class="btn btn-gold" type="button" data-act="retry" style="margin-top:12px">تلاش دوباره</button></div>';
    });
  }

  /* ───────── رویدادها ───────── */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.dataset.act, id = el.dataset.id;
    if (act === 'add') { cartAdd(id, 1); }
    else if (act === 'cmp') { toggleCmp(id); route(); }
    else if (act === 'thumb') { $('#pmain').src = el.dataset.src; $$('.thumbs button').forEach(function (b) { b.classList.toggle('on', b === el); }); }
    else if (act === 'q+' || act === 'q-') { var s = $('#pq'), n = Number(toLatin(s.textContent)) + (act === 'q+' ? 1 : -1), p = prod($('[data-act=add-q]').dataset.id); s.textContent = fa(Math.max(1, Math.min(10, p ? p.stock : 1, n))); }
    else if (act === 'add-q' || act === 'buy-q') { cartAdd(id, Number(toLatin($('#pq').textContent))); if (act === 'buy-q') location.hash = '#cart'; }
    else if (act === 'cq+' || act === 'cq-') { var l = cart.filter(function (x) { return x.id === id; })[0], pp = prod(id); if (l && pp) { var nn = l.qty + (act === 'cq+' ? 1 : -1); if (nn >= 1 && nn <= Math.min(10, Math.max(pp.stock, 1))) { l.qty = nn; saveCart(); route(); } else if (nn > 1) toast('بیشتر از موجودی یا ۱۰ عدد ممکن نیست.'); } }
    else if (act === 'rm') { cart = cart.filter(function (x) { return x.id !== id; }); saveCart(); route(); }
    else if (act === 'slide') { if (window.__go) window.__go(Number(el.dataset.i)); }
    else if (act === 'share') { navigator.share({ title: el.dataset.text, url: el.dataset.url }).catch(function () { }); }
    else if (act === 'copy') { var u = el.dataset.url; (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast('لینک کپی شد.'); }, function () { window.prompt('لینک را کپی کنید:', u); }); }
    else if (act === 'retry') { D.at = 0; route(); }
    else if (act === 'pay') {
      el.disabled = true; el.textContent = 'در حال انتقال…';
      startPay(el.dataset.code, el.dataset.phone).then(function (ok) { if (!ok) { el.disabled = false; el.textContent = 'پرداخت آنلاین'; toast('اتصال به درگاه برقرار نشد. بعداً دوباره امتحان کنید.'); } });
    }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.id === 'order-form') { e.preventDefault(); submitOrder(f); }
    else if (f.id === 'track-form') {
      e.preventDefault(); var out = $('#track-out'), er = $('#track-err'); er.textContent = ''; out.innerHTML = '';
      trackLookup(f.elements.code.value, f.elements.phone.value).then(function (t) { out.innerHTML = renderTrack(t, toLatin(f.elements.phone.value).replace(/\s/g, '')); }).catch(function (x) { er.textContent = errMsg(x); });
    } else if (f.id === 'shop-form') { e.preventDefault(); }
  });
  document.addEventListener('input', function (e) {
    var f = e.target.form; if (!f || f.id !== 'shop-form') return;
    clearTimeout(f._t); f._t = setTimeout(function () {
      var d = new FormData(f), p = [];
      ['q', 'cat', 'sort', 'stock'].forEach(function (k) { var v = d.get(k); if (v) p.push(k + '=' + encodeURIComponent(v)); });
      var qEl = f.elements.q, pos = qEl.selectionStart, focused = document.activeElement === qEl;
      history.replaceState(null, '', '#shop' + (p.length ? '?' + p.join('&') : ''));
      route2();
      function route2() { var r = parseHash(); $('#app').innerHTML = viewShop(r.q); var nq = $('#shop-form').elements.q; if (focused) { nq.focus(); try { nq.setSelectionRange(pos, pos); } catch (_) { } } }
    }, 200);
  });
  document.addEventListener('change', function (e) {
    if (e.target.name === 'method') $$('.opt').forEach(function (o) { o.classList.toggle('on', $('input', o).checked); });
  });
  $('#menu-btn').addEventListener('click', function () { var n = $('#nav'); var o = n.classList.toggle('open'); this.setAttribute('aria-expanded', String(o)); });
  window.addEventListener('hashchange', route);

  saveCart();
  route();
})();
