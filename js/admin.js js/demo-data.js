/* پنل مدیریت فروشگاه. فقط با «کلید عمومی» و ورود مدیر (ایمیل و رمز Supabase) کار می‌کند.
   دسترسی واقعی را قفل‌های پایگاه داده (RLS) کنترل می‌کنند، نه این صفحه. */
(function () {
  'use strict';
  var CFG = window.STORE_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fa = function (n) { return Number(n).toLocaleString('fa-IR'); };
  var toLatin = function (s) { return String(s || '').replace(/[۰-۹]/g, function (d) { return d.charCodeAt(0) - 1776; }).replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 1632; }); };
  var root = $('#root');
  var URL_ = String(CFG.supabaseUrl || '').trim().replace(/\/+$/, ''), KEY = String(CFG.supabaseKey || '').trim();
  var okUrl = /^(https:\/\/[a-z0-9.-]+|http:\/\/(localhost|127\.0\.0\.1))(:\d{1,5})?$/i.test(URL_);
  if (!okUrl || !KEY || /^sb_secret_/i.test(KEY)) { root.innerHTML = '<div class="empty"><b>پنل مدیریت به Supabase نیاز دارد</b><br>در فایل config.js آدرس پروژه و کلید عمومی را وارد کنید. کلید secret یا service_role را هرگز وارد نکنید.</div>'; return; }
  if (KEY.split('.').length === 3) { try { var pl = JSON.parse(atob(KEY.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (pl.role && pl.role !== 'anon') { root.innerHTML = '<div class="empty">کلید واردشده عمومی نیست و اتصال انجام نشد.</div>'; return; } } catch (_) { } }

  /* ───────── نشست ───────── */
  var sess = null;
  try { sess = JSON.parse(sessionStorage.getItem('fl_admin')); } catch (_) { }
  var saveSess = function (s) { sess = s; try { s ? sessionStorage.setItem('fl_admin', JSON.stringify(s)) : sessionStorage.removeItem('fl_admin'); } catch (_) { } };
  function baseHeaders(extra) {
    var h = { apikey: KEY, 'Content-Type': 'application/json' };
    if (sess && sess.access_token) h.Authorization = 'Bearer ' + sess.access_token;
    for (var k in (extra || {})) h[k] = extra[k];
    return h;
  }
  function raw(path, opt) {
    opt = opt || {};
    return fetch(URL_ + path, { method: opt.method || 'GET', headers: baseHeaders(opt.headers), body: opt.rawBody || (opt.body ? JSON.stringify(opt.body) : undefined) }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (_) { }
        if (!r.ok) { var e = new Error((j && (j.message || j.msg || j.error_description || j.error)) || ('http_' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function refresh() {
    if (!sess || !sess.refresh_token) return Promise.reject(new Error('no_session'));
    return fetch(URL_ + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: sess.refresh_token }) })
      .then(function (r) { if (!r.ok) throw new Error('expired'); return r.json(); }).then(function (j) { saveSess({ access_token: j.access_token, refresh_token: j.refresh_token, email: sess.email }); });
  }
  function api(path, opt) {
    return raw(path, opt).catch(function (e) {
      if (e.status === 401 || /jwt expired/i.test(e.message)) return refresh().then(function () { return raw(path, opt); }).catch(function () { saveSess(null); showLogin('نشست شما تمام شد. دوباره وارد شوید.'); throw e; });
      throw e;
    });
  }
  var REP = { Prefer: 'return=representation' };
  var rpc = function (fn, a) { return api('/rest/v1/rpc/' + fn, { method: 'POST', body: a }); };
  var ERRS = { not_admin: 'شما دسترسی مدیر ندارید.', already_cancelled: 'سفارش لغوشده قابل تغییر نیست.', payment_pending: 'پرداخت آنلاین این سفارش در انتظار نتیجه است.' };
  var emsg = function (e) { var m = String(e && e.message || ''); for (var k in ERRS) if (m.indexOf(k) >= 0) return ERRS[k]; if (/violates check|23514/.test(m)) return 'مقدار واردشده مجاز نیست (مثلاً قیمت قبلی باید از قیمت فعلی بیشتر باشد یا نشانک فقط حروف انگلیسی/عدد/خط تیره باشد).'; if (/duplicate|23505|unique/i.test(m)) return 'این مقدار (مثلاً نشانک/slug) قبلاً استفاده شده است.'; return m || 'خطا'; };
  var note = function (el, msg, good) { el.textContent = msg; el.className = good ? 'ok-msg' : 'err'; };

  /* ───────── ورود ───────── */
  function showLogin(msg) {
    $('#logout').hidden = true;
    root.innerHTML = '<form class="form cart-box" id="login" style="padding:18px;max-width:420px;margin:30px auto"><h1 style="font-size:1.4rem">ورود مدیر</h1>' +
      '<label>ایمیل<input class="in ltr" type="email" name="email" autocomplete="username" required dir="ltr"></label>' +
      '<label>رمز عبور<input class="in ltr" type="password" name="password" autocomplete="current-password" required dir="ltr"></label>' +
      '<div class="err" id="login-err" role="alert">' + esc(msg || '') + '</div><button class="btn btn-gold" type="submit">ورود</button></form>';
    $('#login').addEventListener('submit', function (e) {
      e.preventDefault(); var f = e.target.elements, er = $('#login-err'); er.textContent = '';
      fetch(URL_ + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: f.email.value.trim(), password: f.password.value }) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error('bad'); return j; }); })
        .then(function (j) { saveSess({ access_token: j.access_token, refresh_token: j.refresh_token, email: f.email.value.trim() }); start(); })
        .catch(function () { er.textContent = 'ایمیل یا رمز اشتباه است.'; });
    });
  }
  $('#logout').addEventListener('click', function () { saveSess(null); showLogin(''); });

  /* ───────── چارچوب ───────── */
  var TABS = [['orders', 'سفارش‌ها'], ['products', 'محصولات'], ['categories', 'دسته‌ها'], ['banners', 'بنرها'], ['articles', 'مقاله‌ها'], ['pages', 'صفحه‌ها'], ['settings', 'تنظیمات']];
  var tab = 'orders', cats = [];
  function start() {
    api('/rest/v1/admins?select=user_id').then(function (r) {
      if (!r || !r.length) { root.innerHTML = '<div class="empty"><b>این حساب مدیر نیست</b><br>ایمیل این حساب را با فایل sql/2-admin.sql به فهرست مدیران اضافه کنید.<br><button class="btn" id="lo2" type="button" style="margin-top:10px">خروج</button></div>'; $('#lo2').onclick = function () { saveSess(null); showLogin(''); }; return; }
      $('#logout').hidden = false;
      return api('/rest/v1/categories?select=*&order=sort.asc').then(function (c) { cats = c || []; frame(); });
    }).catch(function (e) { if (e.status !== 401) root.innerHTML = '<div class="empty">ارتباط با سرور برقرار نشد: ' + esc(e.message) + '</div>'; });
  }
  function frame() {
    root.innerHTML = '<div class="tabs" role="tablist">' + TABS.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div id="pane"></div>';
    $$('.tabs button').forEach(function (b) { b.onclick = function () { tab = b.dataset.tab; frame(); }; });
    ({ orders: tOrders, products: tProducts, categories: function () { crud('categories', 'دسته', CAT_F, 'sort.asc', 'name'); }, banners: function () { crud('banners', 'بنر', BAN_F, 'sort.asc', 'title'); },
      articles: function () { crud('articles', 'مقاله', ART_F, 'created_at.desc', 'title'); }, pages: tPages, settings: tSettings })[tab]();
  }
  var pane = function () { return $('#pane'); };
  var tableWrap = function (h) { return '<div class="tbl-wrap"><table class="tbl">' + h + '</table></div>'; };

  /* ───────── سفارش‌ها ───────── */
  var ST = { new: 'جدید', confirmed: 'تأییدشده', preparing: 'آماده‌سازی', shipped: 'ارسال‌شده', delivered: 'تحویل‌شده', cancelled: 'لغوشده' };
  var PAY = { unpaid: 'پرداخت‌نشده', pending: 'در انتظار پرداخت', paid: 'پرداخت‌شده', failed: 'ناموفق' };
  function tOrders() {
    var st = tOrders.f || '';
    pane().innerHTML = '<div class="row"><select class="in" id="of" style="max-width:220px" aria-label="فیلتر وضعیت"><option value="">همه‌ی وضعیت‌ها</option>' + Object.keys(ST).map(function (k) { return '<option value="' + k + '"' + (k === st ? ' selected' : '') + '>' + ST[k] + '</option>'; }).join('') + '</select><button class="btn btn-sm" type="button" id="orf">تازه‌سازی</button></div><div id="olist" class="section">در حال بارگذاری…</div><div id="odet"></div>';
    $('#of').onchange = function () { tOrders.f = this.value; tOrders(); }; $('#orf').onclick = tOrders;
    api('/rest/v1/orders?select=*&order=created_at.desc&limit=200' + (st ? '&status=eq.' + st : '')).then(function (os) {
      $('#olist').innerHTML = os.length ? tableWrap('<thead><tr><th>کد</th><th>مشتری</th><th>موبایل</th><th>مبلغ (تومان)</th><th>وضعیت</th><th>پرداخت</th><th>تاریخ</th></tr></thead><tbody>' + os.map(function (o) {
        return '<tr class="click" tabindex="0" data-id="' + o.id + '"><td class="ltr">' + esc(o.code) + '</td><td>' + esc(o.name) + '</td><td class="ltr">' + esc(o.phone) + '</td><td>' + fa(o.total) + '</td><td><span class="pill ' + (o.status === 'cancelled' ? 'bad' : o.status === 'new' ? 'wait' : 'ok') + '">' + ST[o.status] + '</span></td><td>' + PAY[o.payment_status] + '</td><td>' + new Date(o.created_at).toLocaleDateString('fa-IR') + '</td></tr>'; }).join('') + '</tbody>') : '<div class="empty">سفارشی نیست.</div>';
      $$('#olist tr.click').forEach(function (tr) { var open = function () { orderDetail(os.filter(function (o) { return o.id === tr.dataset.id; })[0]); }; tr.onclick = open; tr.onkeydown = function (e) { if (e.key === 'Enter') open(); }; });
    }).catch(function (e) { $('#olist').innerHTML = '<div class="err">' + esc(emsg(e)) + '</div>'; });
  }
  function orderDetail(o) {
    var box = $('#odet'); box.innerHTML = '<div class="panel">در حال بارگذاری…</div>'; box.scrollIntoView({ block: 'nearest' });
    api('/rest/v1/order_items?select=*&order_id=eq.' + o.id).then(function (items) {
      var wa = '98' + o.phone.slice(1);
      box.innerHTML = '<div class="panel"><h2>سفارش <span class="ltr">' + esc(o.code) + '</span></h2><div class="fgrid">' +
        '<div><b>نام:</b> ' + esc(o.name) + '</div><div><b>موبایل:</b> <a class="ltr" href="tel:' + esc(o.phone) + '">' + esc(o.phone) + '</a> · <a target="_blank" rel="noopener" href="https://wa.me/' + wa + '">واتساپ</a></div><div><b>شهر:</b> ' + esc(o.city) + '</div><div><b>روش:</b> ' + (o.method === 'online' ? 'پرداخت آنلاین' : 'هماهنگی مستقیم') + '</div>' +
        '<div class="full"><b>نشانی:</b> ' + esc(o.address) + '</div>' + (o.note ? '<div class="full"><b>توضیح مشتری:</b> ' + esc(o.note) + '</div>' : '') + (o.ref_id ? '<div><b>کد پیگیری پرداخت:</b> <span class="ltr">' + esc(o.ref_id) + '</span></div>' : '') + '</div>' +
        tableWrap('<thead><tr><th>کالا</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr></thead><tbody>' + items.map(function (i) { return '<tr><td>' + esc(i.name) + '</td><td>' + fa(i.qty) + '</td><td>' + fa(i.price) + '</td><td>' + fa(i.price * i.qty) + '</td></tr>'; }).join('') + '<tr><th colspan="3">جمع کل</th><th>' + fa(o.total) + ' تومان</th></tr></tbody>') +
        '<div class="row" style="margin-top:12px"><label>وضعیت <select class="in" id="ost" style="width:auto">' + Object.keys(ST).map(function (k) { return '<option value="' + k + '"' + (k === o.status ? ' selected' : '') + '>' + ST[k] + '</option>'; }).join('') + '</select></label>' +
        '<button class="btn btn-gold" id="osave" type="button">ثبت وضعیت</button>' + (o.payment_status !== 'paid' && o.status !== 'cancelled' ? '<button class="btn" id="opaid" type="button">ثبت دریافت وجه (دستی)</button>' : '') + '</div>' +
        '<p class="muted small">لغو سفارش، موجودی کالاها را به انبار برمی‌گرداند و برگشت‌پذیر نیست.</p>' +
        '<label style="display:grid;gap:4px;margin-top:8px">یادداشت مدیر (برای مشتری نمایش داده نمی‌شود)<textarea class="in" id="onote" maxlength="500">' + esc(o.admin_note) + '</textarea></label><div class="row"><button class="btn btn-sm" id="onsave" type="button">ذخیره‌ی یادداشت</button><span id="omsg" role="status"></span></div></div>';
      var m = $('#omsg');
      $('#osave').onclick = function () { var v = $('#ost').value; if (v === 'cancelled' && !confirm('سفارش لغو شود؟ این کار برگشت‌پذیر نیست.')) return; rpc('admin_set_order_status', { p_id: o.id, p_status: v }).then(function () { note(m, 'وضعیت ثبت شد.', 1); tOrders(); }).catch(function (e) { note(m, emsg(e)); }); };
      if ($('#opaid')) $('#opaid').onclick = function () { rpc('admin_mark_paid', { p_id: o.id }).then(function () { note(m, 'دریافت وجه ثبت شد.', 1); tOrders(); }).catch(function (e) { note(m, emsg(e)); }); };
      $('#onsave').onclick = function () { api('/rest/v1/orders?id=eq.' + o.id, { method: 'PATCH', body: { admin_note: $('#onote').value }, headers: REP }).then(function () { note(m, 'ذخیره شد.', 1); }).catch(function (e) { note(m, emsg(e)); }); };
    }).catch(function (e) { box.innerHTML = '<div class="panel err">' + esc(emsg(e)) + '</div>'; });
  }

  /* ───────── آپلود تصویر ───────── */
  function shrink(file) {
    return new Promise(function (res, rej) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return rej(new Error('فقط تصویر JPG، PNG یا WebP'));
      var fr = new FileReader(); fr.onerror = function () { rej(new Error('خواندن فایل ممکن نشد')); };
      fr.onload = function () {
        var im = new Image(); im.onerror = function () { rej(new Error('تصویر معتبر نیست')); };
        im.onload = function () {
          var w = im.naturalWidth, h = im.naturalHeight, s = Math.min(1, 1600 / Math.max(w, h)), c = document.createElement('canvas');
          c.width = Math.round(w * s); c.height = Math.round(h * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          var q = 0.85; (function t() { c.toBlob(function (b) { if (!b) return rej(new Error('تبدیل تصویر ممکن نشد')); if (b.size > 900000 && q > 0.4) { q -= 0.15; return t(); } if (b.size > 1000000) return rej(new Error('تصویر بیش از حد بزرگ است')); res(b); }, 'image/jpeg', q); })();
        };
        im.src = fr.result;
      }; fr.readAsDataURL(file);
    });
  }
  function upload(file) {
    return shrink(file).then(function (blob) {
      var d = new Date(), path = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + '/' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36) + '.jpg';
      return fetch(URL_ + '/storage/v1/object/product-images/' + path, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + sess.access_token, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: blob })
        .then(function (r) { if (!r.ok) throw new Error('آپلود انجام نشد (' + r.status + '). دسترسی مدیر و سطل product-images را بررسی کنید.'); return URL_ + '/storage/v1/object/public/product-images/' + path; });
    });
  }

  /* ───────── محصولات ───────── */
  function tProducts() {
    pane().innerHTML = '<div class="row"><button class="btn btn-gold" type="button" id="padd">+ محصول جدید</button></div><div id="plist" class="section">در حال بارگذاری…</div><div id="pform"></div>';
    $('#padd').onclick = function () { prodForm(null); };
    api('/rest/v1/products?select=*&order=sort.asc,created_at.desc').then(function (ps) {
      $('#plist').innerHTML = ps.length ? tableWrap('<thead><tr><th>نام</th><th>مدل</th><th>قیمت (تومان)</th><th>موجودی</th><th>وضعیت</th><th></th></tr></thead><tbody>' + ps.map(function (p) {
        return '<tr><td>' + esc(p.name) + '</td><td class="ltr">' + esc(p.model) + '</td><td>' + fa(p.price) + (p.old_price ? ' <s class="muted small">' + fa(p.old_price) + '</s>' : '') + '</td><td>' + fa(p.stock) + '</td><td>' + (p.active ? '<span class="pill ok">فعال</span>' : '<span class="pill">مخفی</span>') + '</td><td><button class="btn btn-sm" type="button" data-id="' + p.id + '">ویرایش</button></td></tr>'; }).join('') + '</tbody>') : '<div class="empty">هنوز محصولی ثبت نشده است. با «محصول جدید» شروع کنید.</div>';
      $$('#plist button[data-id]').forEach(function (b) { b.onclick = function () { prodForm(ps.filter(function (p) { return p.id === b.dataset.id; })[0]); }; });
    }).catch(function (e) { $('#plist').innerHTML = '<div class="err">' + esc(emsg(e)) + '</div>'; });
  }
  function prodForm(p) {
    var isNew = !p; p = p || { name: '', model: '', slug: '', category_id: '', price: '', old_price: '', stock: 0, images: [], specs: [], short_text: '', description: '', seo_title: '', seo_desc: '', featured: false, bestseller: false, active: true, sort: 0 };
    var imgs = (p.images || []).slice(), specs = (p.specs || []).map(function (s) { return { k: s.k, v: s.v }; });
    var box = $('#pform');
    function draw() {
      box.innerHTML = '<form class="panel" id="pf" novalidate><h2>' + (isNew ? 'محصول جدید' : 'ویرایش محصول') + '</h2><div class="fgrid">' +
        '<label>نام محصول<input class="in" name="name" required maxlength="160" value="' + esc(p.name) + '"></label>' +
        '<label>مدل<input class="in ltr" name="model" maxlength="80" dir="ltr" value="' + esc(p.model) + '"></label>' +
        '<label>نشانک آدرس (انگلیسی، مثل my-detector-1؛ خالی = خودکار)<input class="in ltr" name="slug" maxlength="80" dir="ltr" value="' + esc(p.slug) + '"></label>' +
        '<label>دسته<select class="in" name="category_id"><option value="">بدون دسته</option>' + cats.map(function (c) { return '<option value="' + c.id + '"' + (c.id === p.category_id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></label>' +
        '<label>قیمت (تومان)<input class="in ltr" name="price" inputmode="numeric" required dir="ltr" value="' + esc(p.price) + '"></label>' +
        '<label>قیمت قبلی برای نمایش تخفیف (اختیاری)<input class="in ltr" name="old_price" inputmode="numeric" dir="ltr" value="' + esc(p.old_price == null ? '' : p.old_price) + '"></label>' +
        '<label>موجودی (عدد)<input class="in ltr" name="stock" inputmode="numeric" required dir="ltr" value="' + esc(p.stock) + '"></label>' +
        '<label>ترتیب نمایش (کمتر = بالاتر)<input class="in ltr" name="sort" inputmode="numeric" dir="ltr" value="' + esc(p.sort) + '"></label>' +
        '<label class="full">توضیح کوتاه<input class="in" name="short_text" maxlength="300" value="' + esc(p.short_text) + '"></label>' +
        '<label class="full">توضیحات کامل (خط خالی = پاراگراف جدید، «## » = عنوان، «- » = فهرست)<textarea class="in" name="description" style="min-height:160px" maxlength="8000">' + esc(p.description) + '</textarea></label></div>' +
        '<h3 style="margin-top:14px">تصاویر (حداکثر ۸، اولی تصویر اصلی)</h3><div class="imgs">' + imgs.map(function (u, i) { return '<figure><img src="' + esc(u) + '" alt=""><figcaption><button type="button" data-i="' + i + '" data-a="first">اصلی</button><button type="button" data-i="' + i + '" data-a="del" aria-label="حذف تصویر">حذف</button></figcaption></figure>'; }).join('') + '</div>' +
        '<div class="row" style="margin-top:8px"><label class="btn btn-sm" style="cursor:pointer">افزودن تصویر<input type="file" id="pfile" accept="image/jpeg,image/png,image/webp" multiple class="sr"></label><span id="pup" class="muted small">تصویر خودکار کوچک می‌شود (حداکثر ۱ مگابایت).</span></div>' +
        '<h3 style="margin-top:14px">مشخصات فنی</h3><div id="sp">' + specs.map(function (s, i) { return '<div class="spr"><input class="in" data-k="' + i + '" placeholder="عنوان (مثلاً وزن)" value="' + esc(s.k) + '" aria-label="عنوان مشخصه"><input class="in" data-v="' + i + '" placeholder="مقدار" value="' + esc(s.v) + '" aria-label="مقدار مشخصه"><button class="btn btn-sm" type="button" data-sd="' + i + '" aria-label="حذف ردیف">حذف</button></div>'; }).join('') + '</div><button class="btn btn-sm" type="button" id="spadd">+ مشخصه</button>' +
        '<h3 style="margin-top:14px">نمایش و سئو</h3><div class="fgrid"><label class="chip" style="display:flex;gap:8px"><input type="checkbox" name="active"' + (p.active ? ' checked' : '') + '> فعال (نمایش در فروشگاه)</label><label class="chip" style="display:flex;gap:8px"><input type="checkbox" name="featured"' + (p.featured ? ' checked' : '') + '> محصول ویژه</label><label class="chip" style="display:flex;gap:8px"><input type="checkbox" name="bestseller"' + (p.bestseller ? ' checked' : '') + '> پرفروش</label>' +
        '<label class="full">عنوان سئو (اختیاری)<input class="in" name="seo_title" maxlength="120" value="' + esc(p.seo_title) + '"></label><label class="full">توضیح سئو (اختیاری، تا ۳۰۰ حرف)<textarea class="in" name="seo_desc" maxlength="300" style="min-height:64px">' + esc(p.seo_desc) + '</textarea></label></div>' +
        '<p class="notice">فقط مشخصاتی را بنویسید که سازنده یا شما می‌توانید ثابت کنید. درباره‌ی عمق کشف، کشف طلا یا نتیجه‌ی کار دستگاه ادعای تأییدنشده ننویسید.</p>' +
        '<div class="row" style="margin-top:12px"><button class="btn btn-gold" type="submit">ذخیره</button><button class="btn" type="button" id="pcancel">بستن</button>' + (isNew ? '' : '<button class="btn btn-sm" type="button" id="pdel" style="margin-inline-start:auto;color:var(--red)">حذف محصول</button>') + '<span id="pmsg" role="status"></span></div></form>';
      box.scrollIntoView({ block: 'nearest' });
      $('#pcancel').onclick = function () { box.innerHTML = ''; };
      $$('#pf [data-a]').forEach(function (b) { b.onclick = function () { var i = Number(b.dataset.i); if (b.dataset.a === 'del') imgs.splice(i, 1); else imgs.unshift(imgs.splice(i, 1)[0]); sync(); draw(); }; });
      $('#pfile').onchange = function () {
        var fs = Array.prototype.slice.call(this.files), m = $('#pup'); if (!fs.length) return; sync();
        if (imgs.length + fs.length > 8) return note(m, 'حداکثر ۸ تصویر مجاز است.');
        note(m, 'در حال آپلود…', 1);
        fs.reduce(function (pr, f) { return pr.then(function () { return upload(f).then(function (u) { imgs.push(u); }); }); }, Promise.resolve()).then(function () { draw(); }).catch(function (e) { note(m, e.message); });
      };
      $('#spadd').onclick = function () { sync(); specs.push({ k: '', v: '' }); draw(); };
      $$('#pf [data-sd]').forEach(function (b) { b.onclick = function () { sync(); specs.splice(Number(b.dataset.sd), 1); draw(); }; });
      if ($('#pdel')) $('#pdel').onclick = function () { var b = this; if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'برای حذف دوباره بزنید'; return; } api('/rest/v1/products?id=eq.' + p.id, { method: 'DELETE' }).then(function () { box.innerHTML = ''; tProducts(); }).catch(function (e) { note($('#pmsg'), emsg(e)); }); };
      $('#pf').onsubmit = function (e) { e.preventDefault(); save(); };
    }
    var cur = {};
    function sync() { var f = $('#pf'); if (!f) return; $$('#pf [data-k]').forEach(function (el) { specs[Number(el.dataset.k)].k = el.value; }); $$('#pf [data-v]').forEach(function (el) { specs[Number(el.dataset.v)].v = el.value; });['name', 'model', 'slug', 'category_id', 'price', 'old_price', 'stock', 'sort', 'short_text', 'description', 'seo_title', 'seo_desc'].forEach(function (k) { p[k] = f.elements[k].value; });['active', 'featured', 'bestseller'].forEach(function (k) { p[k] = f.elements[k].checked; }); }
    function save() {
      sync(); var m = $('#pmsg'); m.textContent = '';
      var num = function (v) { return Number(toLatin(String(v)).replace(/[,٬\s]/g, '')); };
      var price = num(p.price), stock = num(p.stock), old = String(p.old_price).trim() === '' ? null : num(p.old_price), sort = String(p.sort).trim() === '' ? 0 : num(p.sort);
      if (!String(p.name).trim()) return note(m, 'نام محصول را وارد کنید.');
      if (!Number.isInteger(price) || price < 0) return note(m, 'قیمت باید عدد صحیح (تومان) باشد.');
      if (!Number.isInteger(stock) || stock < 0) return note(m, 'موجودی باید عدد صحیح باشد.');
      if (old !== null && (!Number.isInteger(old) || old <= price)) return note(m, 'قیمت قبلی باید از قیمت فعلی بیشتر باشد (یا خالی بماند).');
      var slug = String(p.slug).trim().toLowerCase() || ('p-' + Math.random().toString(36).slice(2, 8));
      if (!/^[a-z0-9-]{1,80}$/.test(slug)) return note(m, 'نشانک آدرس فقط می‌تواند حروف انگلیسی کوچک، عدد و خط تیره باشد.');
      var body = { name: String(p.name).trim(), model: String(p.model).trim(), slug: slug, category_id: p.category_id || null, price: price, old_price: old, stock: stock, sort: Number.isInteger(sort) ? sort : 0,
        images: imgs, specs: specs.filter(function (s) { return String(s.k).trim(); }).map(function (s) { return { k: String(s.k).trim(), v: String(s.v).trim() }; }),
        short_text: p.short_text, description: p.description, seo_title: p.seo_title, seo_desc: p.seo_desc, active: p.active, featured: p.featured, bestseller: p.bestseller };
      note(m, 'در حال ذخیره…', 1);
      api(isNew ? '/rest/v1/products' : '/rest/v1/products?id=eq.' + p.id, { method: isNew ? 'POST' : 'PATCH', body: body, headers: REP })
        .then(function () { box.innerHTML = ''; tProducts(); }).catch(function (e) { note(m, emsg(e)); });
    }
    draw();
  }

  /* ───────── CRUD عمومی (دسته، بنر، مقاله) ───────── */
  var CAT_F = [['name', 'نام', 'text', 1], ['slug', 'نشانک (انگلیسی)', 'slug', 1], ['sort', 'ترتیب', 'int'], ['active', 'فعال', 'check']];
  var BAN_F = [['kind', 'نوع', 'select', 1, [['hero', 'بنر بالای صفحه اصلی'], ['occasion', 'نوار تخفیف مناسبتی']]], ['title', 'عنوان', 'text', 1], ['subtitle', 'زیرعنوان', 'text'], ['image', 'نشانی تصویر (اختیاری، می‌توانید آپلود کنید)', 'image'], ['link', 'پیوند (مثلاً #shop یا #product/نشانک)', 'text'], ['sort', 'ترتیب', 'int'], ['active', 'فعال', 'check']];
  var ART_F = [['title', 'عنوان', 'text', 1], ['slug', 'نشانک (انگلیسی)', 'slug', 1], ['excerpt', 'خلاصه', 'text'], ['body', 'متن (خط خالی = پاراگراف، «## » = عنوان، «- » = فهرست)', 'area'], ['active', 'منتشر شود', 'check']];
  function crud(table, label, fields, order, titleKey) {
    pane().innerHTML = '<div class="row"><button class="btn btn-gold" type="button" id="cadd">+ ' + label + ' جدید</button></div><div id="clist" class="section">در حال بارگذاری…</div><div id="cform"></div>';
    $('#cadd').onclick = function () { form(null); };
    function load() {
      api('/rest/v1/' + table + '?select=*&order=' + order).then(function (rows) {
        if (table === 'categories') cats = rows;
        $('#clist').innerHTML = rows.length ? tableWrap('<thead><tr><th>' + label + '</th><th>وضعیت</th><th></th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td>' + esc(r[titleKey]) + '</td><td>' + (r.active ? '<span class="pill ok">فعال</span>' : '<span class="pill">غیرفعال</span>') + '</td><td><button class="btn btn-sm" type="button" data-id="' + r.id + '">ویرایش</button></td></tr>'; }).join('') + '</tbody>') : '<div class="empty">موردی ثبت نشده است.</div>';
        $$('#clist button[data-id]').forEach(function (b) { b.onclick = function () { form(rows.filter(function (r) { return r.id === b.dataset.id; })[0]); }; });
      }).catch(function (e) { $('#clist').innerHTML = '<div class="err">' + esc(emsg(e)) + '</div>'; });
    }
    function form(r) {
      var isNew = !r; r = r || {}; if (isNew) fields.forEach(function (f) { r[f[0]] = f[2] === 'check' ? true : f[2] === 'int' ? 0 : f[0] === 'kind' ? 'hero' : ''; });
      $('#cform').innerHTML = '<form class="panel" id="cf" novalidate><h2>' + (isNew ? label + ' جدید' : 'ویرایش ' + label) + '</h2><div class="fgrid">' + fields.map(function (f) {
        var k = f[0], v = r[k] == null ? '' : r[k], full = (f[2] === 'area' || f[2] === 'image') ? ' class="full"' : '';
        if (f[2] === 'check') return '<label class="chip" style="display:flex;gap:8px"><input type="checkbox" name="' + k + '"' + (v ? ' checked' : '') + '> ' + f[1] + '</label>';
        if (f[2] === 'select') return '<label>' + f[1] + '<select class="in" name="' + k + '">' + f[4].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>';
        if (f[2] === 'area') return '<label class="full">' + f[1] + '<textarea class="in" name="' + k + '" style="min-height:200px">' + esc(v) + '</textarea></label>';
        if (f[2] === 'image') return '<label class="full">' + f[1] + '<input class="in ltr" name="' + k + '" dir="ltr" value="' + esc(v) + '"></label><div class="row full"><label class="btn btn-sm" style="cursor:pointer">آپلود تصویر<input type="file" id="cfile" accept="image/jpeg,image/png,image/webp" class="sr"></label><span id="cup" class="muted small"></span></div>';
        return '<label' + full + '>' + f[1] + '<input class="in' + (f[2] === 'slug' || f[2] === 'int' ? ' ltr' : '') + '" name="' + k + '"' + (f[2] === 'slug' || f[2] === 'int' ? ' dir="ltr"' : '') + ' value="' + esc(v) + '"></label>';
      }).join('') + '</div><div class="row" style="margin-top:12px"><button class="btn btn-gold" type="submit">ذخیره</button><button class="btn" type="button" id="ccancel">بستن</button>' + (isNew ? '' : '<button class="btn btn-sm" type="button" id="cdel" style="margin-inline-start:auto;color:var(--red)">حذف</button>') + '<span id="cmsg" role="status"></span></div></form>';
      $('#cform').scrollIntoView({ block: 'nearest' });
      $('#ccancel').onclick = function () { $('#cform').innerHTML = ''; };
      if ($('#cfile')) $('#cfile').onchange = function () { var f = this.files[0]; if (!f) return; note($('#cup'), 'در حال آپلود…', 1); upload(f).then(function (u) { $('#cf').elements.image.value = u; note($('#cup'), 'آپلود شد.', 1); }).catch(function (e) { note($('#cup'), e.message); }); };
      if ($('#cdel')) $('#cdel').onclick = function () { var b = this; if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'برای حذف دوباره بزنید'; return; } api('/rest/v1/' + table + '?id=eq.' + r.id, { method: 'DELETE' }).then(function () { $('#cform').innerHTML = ''; load(); }).catch(function (e) { note($('#cmsg'), emsg(e)); }); };
      $('#cf').onsubmit = function (e) {
        e.preventDefault(); var el = e.target.elements, body = {}, m = $('#cmsg');
        for (var i = 0; i < fields.length; i++) {
          var f = fields[i], k = f[0], v = f[2] === 'check' ? el[k].checked : el[k].value;
          if (f[2] === 'int') { v = Number(toLatin(v)); if (!Number.isInteger(v)) return note(m, f[1] + ' باید عدد صحیح باشد.'); }
          if (f[3] && !String(v).trim()) return note(m, f[1] + ' را وارد کنید.');
          if (f[2] === 'slug' && !/^[a-z0-9-]{1,80}$/.test(v)) return note(m, 'نشانک فقط حروف انگلیسی کوچک، عدد و خط تیره.');
          body[k] = typeof v === 'string' ? v.trim() === v || f[2] === 'area' ? v : v.trim() : v;
        }
        note(m, 'در حال ذخیره…', 1);
        api(isNew ? '/rest/v1/' + table : '/rest/v1/' + table + '?id=eq.' + r.id, { method: isNew ? 'POST' : 'PATCH', body: body, headers: REP }).then(function () { $('#cform').innerHTML = ''; load(); }).catch(function (e2) { note(m, emsg(e2)); });
      };
    }
    load();
  }

  /* ───────── صفحه‌ها و تنظیمات ───────── */
  var PNAME = { about: 'درباره ما', contact: 'تماس با ما', guide: 'راهنمای خرید', terms: 'قوانین و شرایط خرید' };
  function tPages() {
    var cur = tPages.s || 'about';
    pane().innerHTML = '<div class="tabs">' + Object.keys(PNAME).map(function (k) { return '<button type="button" data-p="' + k + '" class="' + (k === cur ? 'on' : '') + '">' + PNAME[k] + '</button>'; }).join('') + '</div><div id="pg">در حال بارگذاری…</div>';
    $$('#pane [data-p]').forEach(function (b) { b.onclick = function () { tPages.s = b.dataset.p; tPages(); }; });
    api('/rest/v1/pages?select=*&slug=eq.' + cur).then(function (r) {
      var pg = r[0] || { slug: cur, title: PNAME[cur], body: '' };
      $('#pg').innerHTML = '<form class="panel" id="pgf"><label style="display:grid;gap:4px">عنوان<input class="in" name="title" maxlength="120" value="' + esc(pg.title) + '"></label><label style="display:grid;gap:4px;margin-top:10px">متن<textarea class="in" name="body" style="min-height:260px" maxlength="20000">' + esc(pg.body) + '</textarea></label>' +
        (cur === 'terms' ? '<p class="notice">متن قوانین را پیش از انتشار با مشاور حقوقی بازبینی کنید، به‌ویژه درباره‌ی مجوز عرضه‌ی دستگاه‌های فلزیاب.</p>' : '') + '<div class="row" style="margin-top:10px"><button class="btn btn-gold" type="submit">ذخیره</button><span id="pgm" role="status"></span></div></form>';
      $('#pgf').onsubmit = function (e) { e.preventDefault(); var f = e.target.elements; api('/rest/v1/pages?slug=eq.' + cur, { method: 'PATCH', body: { title: f.title.value.trim() || PNAME[cur], body: f.body.value }, headers: REP }).then(function (x) { if (!x.length) throw new Error('صفحه در پایگاه داده پیدا نشد. فایل 1-setup.sql را دوباره اجرا کنید.'); note($('#pgm'), 'ذخیره شد.', 1); }).catch(function (e2) { note($('#pgm'), emsg(e2)); }); };
    }).catch(function (e) { $('#pg').innerHTML = '<div class="err">' + esc(emsg(e)) + '</div>'; });
  }
  var SET_F = [['shop_name', 'نام فروشگاه'], ['phone', 'شماره تلفن (مثلاً 09121234567)'], ['whatsapp', 'شماره واتساپ'], ['address', 'نشانی'], ['hours', 'ساعت پاسخ‌گویی'], ['license_note', 'توضیح مجوز (زیر هر صفحه نمایش داده می‌شود؛ مثلاً شماره مجوز واقعی)']];
  function tSettings() {
    pane().innerHTML = '<div id="sf">در حال بارگذاری…</div>';
    api('/rest/v1/settings?select=*').then(function (rows) {
      var s = {}; rows.forEach(function (r) { s[r.key] = r.value; });
      $('#sf').innerHTML = '<form class="panel" id="stf"><div class="fgrid">' + SET_F.map(function (f) { return '<label' + (f[0] === 'license_note' || f[0] === 'address' ? ' class="full"' : '') + '>' + f[1] + '<input class="in" name="' + f[0] + '" maxlength="500" value="' + esc(s[f[0]] || '') + '"></label>'; }).join('') + '</div>' +
        '<h3 style="margin-top:16px">پرداخت آنلاین (زرین‌پال)</h3><label class="chip" style="display:flex;gap:8px"><input type="checkbox" name="online_payment"' + (s.online_payment === 'on' ? ' checked' : '') + '> پرداخت آنلاین فعال باشد</label>' +
        '<p class="notice">فقط پس از ساخت توابع pay-create و pay-callback، ثبت Secrets و یک پرداخت آزمایشی موفق (Sandbox) روشن کنید. تا آن زمان، مشتری فقط «ثبت سفارش و هماهنگی با فروشنده» را می‌بیند و فروشگاه کار می‌کند.</p>' +
        '<div class="row" style="margin-top:10px"><button class="btn btn-gold" type="submit">ذخیره</button><span id="stm" role="status"></span></div></form>';
      $('#stf').onsubmit = function (e) {
        e.preventDefault(); var el = e.target.elements, vals = {}; SET_F.forEach(function (f) { vals[f[0]] = el[f[0]].value.trim(); }); vals.online_payment = el.online_payment.checked ? 'on' : 'off';
        Object.keys(vals).reduce(function (pr, k) {
          return pr.then(function () { return api('/rest/v1/settings?key=eq.' + k, { method: 'PATCH', body: { value: vals[k] }, headers: REP }).then(function (r) { return r.length ? r : api('/rest/v1/settings', { method: 'POST', body: { key: k, value: vals[k] }, headers: REP }); }); });
        }, Promise.resolve()).then(function () { note($('#stm'), 'ذخیره شد.', 1); }).catch(function (e2) { note($('#stm'), emsg(e2)); });
      };
    }).catch(function (e) { $('#sf').innerHTML = '<div class="err">' + esc(emsg(e)) + '</div>'; });
  }

  if (sess && sess.access_token) start(); else showLogin('');
})();
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
  var cart = lsGet('fl_cart', []).filter(function (x) { return x && typeof x.id === 'string' && x.qty > 0; });
  var cmp = lsGet('fl_cmp', []);
  function saveCart() { lsSet('fl_cart', cart); var n = cart.reduce(function (a, b) { return a + b.qty; }, 0); $('#cart-count').textContent = fa(n); }
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
/* اطلاعات آزمایشی نسخه نمایشی.
   فقط وقتی استفاده می‌شود که سایت به Supabase وصل نباشد (یا در config.js نوشته باشید demo:true).
   همه‌ی نام‌ها، قیمت‌ها و مشخصات اینجا ساختگی‌اند و نباید به‌عنوان محصول واقعی نمایش داده شوند.
   در حالت متصل به Supabase این فایل هیچ تأثیری ندارد. */
window.STORE_DEMO = (function () {
  function ph(label, n) {
    var hues = ['#d4a937', '#b8892b', '#c9b36a', '#9c8a5a', '#e0c068', '#a98f3f'];
    var c = hues[n % hues.length];
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#17171a"/>' +
      '<circle cx="400" cy="250" r="120" fill="none" stroke="' + c + '" stroke-width="22"/>' +
      '<path d="M400 370v140" stroke="' + c + '" stroke-width="22" stroke-linecap="round"/>' +
      '<text x="400" y="560" text-anchor="middle" font-family="Tahoma,sans-serif" font-size="34" fill="#a2a2a8">' + label + '</text></svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }
  var d = new Date();
  function ago(days) { return new Date(d.getTime() - days * 86400000).toISOString(); }
  var cats = [
    { id: 'c1', slug: 'metal-detectors', name: 'دستگاه‌های فلزیاب', sort: 1, active: true },
    { id: 'c2', slug: 'accessories', name: 'لوازم جانبی', sort: 2, active: true },
    { id: 'c3', slug: 'batteries', name: 'باتری و شارژر', sort: 3, active: true }
  ];
  function specs(extra) {
    return [
      { k: 'نوع دستگاه', v: 'دستی (نمونه)' }, { k: 'منبع تغذیه', v: 'باتری قابل شارژ (نمونه)' },
      { k: 'نمایشگر', v: 'دیجیتال (نمونه)' }, { k: 'وزن', v: extra + ' کیلوگرم (نمونه)' },
      { k: 'گارانتی', v: '[مدت گارانتی واقعی را بنویسید]' }
    ];
  }
  var DESC = 'این متن نمونه است. در فروشگاه واقعی، توضیحات اختصاصی هر دستگاه را در پنل مدیریت وارد کنید.\n\nفقط مشخصاتی را بنویسید که سازنده یا شما می‌توانید ثابت کنید. درباره‌ی عمق کشف، نوع فلز یا نتیجه‌ی کار دستگاه در خاک‌های مختلف ادعای بی‌پشتوانه نکنید.';
  function P(i, slug, name, model, price, old, stock, feat, best, cat, w) {
    return {
      id: 'p' + i, slug: slug, category_id: cat, name: name, model: model, price: price, old_price: old, stock: stock,
      images: [ph('تصویر نمونه ' + i, i), ph('نمای دوم ' + i, i + 2)], specs: specs(w),
      short_text: 'محصول نمونه برای نمایش چیدمان فروشگاه.', description: DESC, seo_title: '', seo_desc: '',
      featured: feat, bestseller: best, active: true, sort: i, created_at: ago(30 - i), demo: true
    };
  }
  var products = [
    P(1, 'demo-detector-1', 'دستگاه فلزیاب نمونه ۱', 'DEMO-100', 12900000, 14500000, 5, true, true, 'c1', '1٫4'),
    P(2, 'demo-detector-2', 'دستگاه فلزیاب نمونه ۲', 'DEMO-200', 18400000, null, 3, true, false, 'c1', '1٫7'),
    P(3, 'demo-detector-3', 'دستگاه فلزیاب نمونه ۳', 'DEMO-300', 26900000, 29900000, 2, true, true, 'c1', '1٫9'),
    P(4, 'demo-coil', 'سرچ‌کوئل نمونه', 'DEMO-COIL', 3200000, null, 8, false, true, 'c2', '0٫6'),
    P(5, 'demo-bag', 'کیف حمل نمونه', 'DEMO-BAG', 890000, 990000, 12, false, false, 'c2', '0٫5'),
    P(6, 'demo-battery', 'باتری قابل شارژ نمونه', 'DEMO-BAT', 1450000, null, 0, false, false, 'c3', '0٫2')
  ];
  var banners = [
    { id: 'b1', kind: 'hero', title: 'فروش مستقیم دستگاه‌های فلزیاب', subtitle: 'مشخصات فنی دقیق، ثبت سفارش آنلاین و پیگیری سفارش با کد (متن نمونه).', image: '', link: '#shop', active: true, sort: 1 },
    { id: 'b2', kind: 'hero', title: 'قبل از خرید، راهنمای خرید را بخوانید', subtitle: 'نکات انتخاب و قوانین را در چند دقیقه ببینید (متن نمونه).', image: '', link: '#guide', active: true, sort: 2 },
    { id: 'b3', kind: 'occasion', title: 'تخفیف مناسبتی نمونه', subtitle: 'برای تغییر یا حذف این نوار، پنل مدیریت ← بنرها.', image: '', link: '#shop', active: true, sort: 1 }
  ];
  var articles = [
    { id: 'a1', slug: 'before-you-buy', title: 'پیش از خرید فلزیاب به چه نکاتی توجه کنیم؟', excerpt: 'فهرستی از پرسش‌هایی که پیش از خرید باید از فروشنده بپرسید (متن نمونه).',
      body: 'این مقاله‌ی نمونه است و باید با متن خودتان جایگزین شود.\n\n## مشخصات را بخوانید\nنوع دستگاه، منبع تغذیه، وزن و گارانتی را در صفحه‌ی محصول بررسی کنید. اگر مشخصه‌ای نوشته نشده، از فروشنده بپرسید.\n\n## ادعاهای بی‌پشتوانه را جدی نگیرید\nنتیجه‌ی کار هر دستگاه به محیط، نوع خاک و مهارت کاربر بستگی دارد. وعده‌ی عدد دقیق برای عمق یا نوع فلز را بدون مدرک نپذیرید.\n\n## قوانین را بدانید\nخرید و استفاده از دستگاه باید مطابق قوانین محل فعالیت باشد.', active: true, created_at: ago(9) },
    { id: 'a2', slug: 'battery-care', title: 'نگهداری از باتری و دستگاه', excerpt: 'چند اصل ساده برای نگهداری بهتر (متن نمونه).',
      body: 'این مقاله‌ی نمونه است.\n\n## دستگاه را خشک نگه دارید\nپس از استفاده، دستگاه و کیف حمل را از رطوبت و گرد و غبار پاک کنید.\n\n## دستورالعمل سازنده را دنبال کنید\nشارژ و نگهداری باتری را مطابق دفترچه‌ی همان دستگاه انجام دهید.\n\n- دستگاه را در دمای زیاد رها نکنید.\n- باتری را با شارژر مخصوص همان مدل شارژ کنید.', active: true, created_at: ago(5) },
    { id: 'a3', slug: 'rules-and-permits', title: 'قوانین و مجوزها را فراموش نکنید', excerpt: 'چرا باید پیش از استفاده از دستگاه، قوانین محل را بدانید (متن نمونه).',
      body: 'این مقاله‌ی نمونه است و نظر حقوقی نیست.\n\nقوانین مربوط به خرید، نگهداری و استفاده از دستگاه فلزیاب در هر کشور و منطقه فرق می‌کند. پیش از استفاده، از مراجع رسمی یا مشاور حقوقی خود بپرسید.', active: true, created_at: ago(2) }
  ];
  var pages = [
    { slug: 'about', title: 'درباره ما', body: 'این متن نمونه است. [نام فروشگاه] دستگاه‌های فلزیاب را مستقیم به مشتری عرضه می‌کند.\n\nمعرفی خودتان، سابقه و اطلاعات مجوز کسب‌وکار را در پنل مدیریت ← صفحه‌ها بنویسید.' },
    { slug: 'contact', title: 'تماس با ما', body: 'اطلاعات تماس واقعی را در پنل مدیریت ← تنظیمات وارد کنید. شماره‌های زیر نمونه‌اند.' },
    { slug: 'guide', title: 'راهنمای خرید', body: '۱. محصول را از فروشگاه انتخاب کنید و به سبد اضافه کنید.\n۲. در صفحه‌ی ثبت سفارش، نام، شماره موبایل و نشانی را وارد کنید.\n۳. روش ثبت سفارش را انتخاب کنید: هماهنگی مستقیم با فروشنده یا پرداخت آنلاین (در صورت فعال بودن).\n۴. با کد سفارش و شماره موبایل، وضعیت سفارش را در «پیگیری سفارش» ببینید.\n\nپیش از خرید، مشخصات فنی هر دستگاه را در صفحه‌ی همان محصول بخوانید.' },
    { slug: 'terms', title: 'قوانین و شرایط خرید', body: 'این متن نمونه است و باید پیش از انتشار با مشاور حقوقی شما بازبینی شود.\n\n۱. مسئولیت رعایت قوانین: خرید، نگهداری و استفاده از دستگاه‌های فلزیاب باید مطابق قوانین محل فعالیت و استفاده باشد.\n۲. اطلاعات محصول: مشخصات فنی همان است که در صفحه‌ی محصول آمده است. فروشگاه درباره‌ی نتیجه‌ی کار دستگاه وعده نمی‌دهد.\n۳. قیمت‌ها: قیمت نهایی هنگام ثبت سفارش نمایش داده می‌شود.\n۴. ارسال و مرجوعی: [شرایط خود را بنویسید].\n۵. حریم خصوصی: نام، شماره موبایل و نشانی فقط برای پردازش و ارسال سفارش استفاده می‌شود.' }
  ];
  var settings = { shop_name: 'فروشگاه فلزیاب (نمونه)', phone: '09120000000', whatsapp: '09120000000', address: '[نشانی واقعی فروشگاه]', hours: 'شنبه تا پنجشنبه، ۹ تا ۱۸ (نمونه)', license_note: '', online_payment: 'off' };
  return { categories: cats, products: products, banners: banners, articles: articles, pages: pages, settings: settings };
})();
