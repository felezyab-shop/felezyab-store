
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
    '<div class="err" id="login-err" role="alert">' + esc(msg || '') + '</div><button class="btn btn-gold" type="submit">ورود</button>' +
    '<button class="btn" type="button" id="forgot-password" style="margin-top:12px">فراموشی رمز عبور</button></form>';

  $('#login').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target.elements, er = $('#login-err');
    er.textContent = '';
    fetch(URL_ + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: f.email.value.trim(),
        password: f.password.value
      })
    })
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error('bad');
          return j;
        });
      })
   .then(function (r) {
  return r.json().catch(function () { return {}; }).then(function (j) {
    if (!r.ok) {
      throw new Error(j.msg || j.message || j.error_description || j.error || 'HTTP ' + r.status);
    }
    er.textContent = 'درخواست ارسال شد. ایمیلت را بررسی کن.';
  });
})
.catch(function (err) {
  er.textContent = 'خطای واقعی: ' + err.message;
});  
  $('#forgot-password').addEventListener('click', function () {
    var email = $('#login').elements.email.value.trim();
    var er = $('#login-err');
    if (!email) {
      er.textContent = 'ابتدا ایمیل خود را وارد کنید.';
      return;
    }
    er.textContent = 'در حال ارسال درخواست...';
    var redirectTo = location.origin + location.pathname;
    fetch(URL_ + '/auth/v1/recover?redirect_to=' + encodeURIComponent(redirectTo), {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email })
    })
      .then(function (r) {
        if (!r.ok) throw new Error('recovery failed');
        er.textContent = 'اگر این ایمیل ثبت شده باشد، لینک بازیابی برایتان ارسال می‌شود.';
      })
      .catch(function () {
        er.textContent = 'ارسال لینک ناموفق بود. دوباره تلاش کنید.';
      });
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

  function showRecovery(token) {
    history.replaceState(null, '', location.pathname + location.search);
    $('#logout').hidden = true;

    root.innerHTML =
      '<form class="form cart-box" id="recovery-form" style="padding:18px;max-width:420px;margin:30px auto">' +
      '<h1 style="font-size:1.4rem">تعیین رمز جدید</h1>' +
      '<label>رمز جدید<input class="in ltr" type="password" name="password" minlength="6" required dir="ltr"></label>' +
      '<label>تکرار رمز جدید<input class="in ltr" type="password" name="confirm" minlength="6" required dir="ltr"></label>' +
      '<div class="err" id="recovery-err" role="alert"></div>' +
      '<button class="btn btn-gold" type="submit">ذخیره رمز جدید</button></form>';

    $('#recovery-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target.elements;
      var er = $('#recovery-err');

      if (f.password.value.length < 6) {
        er.textContent = 'رمز باید حداقل ۶ کاراکتر باشد.';
        return;
      }
      if (f.password.value !== f.confirm.value) {
        er.textContent = 'تکرار رمز با رمز جدید یکسان نیست.';
        return;
      }

      er.textContent = 'در حال ذخیره رمز جدید...';

      fetch(URL_ + '/auth/v1/user', {
        method: 'PUT',
        headers: {
          apikey: KEY,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: f.password.value })
      })
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(j.message || j.msg || 'خطا در تغییر رمز');
          return j;
        });
      })
      .then(function () {
        saveSess(null);
        showLogin('رمز جدید با موفقیت ذخیره شد. اکنون وارد شوید.');
      })
      .catch(function (err) {
        er.textContent = err.message || 'تغییر رمز انجام نشد. لینک ممکن است منقضی شده باشد.';
      });
    });
  }

  var recoveryParams = new URLSearchParams(location.hash.substring(1));
  var recoveryToken = recoveryParams.get('access_token');
  var recoveryType = recoveryParams.get('type');
  var recoveryError = recoveryParams.get('error_code');

  if (recoveryType === 'recovery' && recoveryToken) {
    showRecovery(recoveryToken);
  } else if (recoveryError === 'otp_expired') {
    history.replaceState(null, '', location.pathname + location.search);
    showLogin('لینک بازیابی منقضی شده است. دوباره درخواست لینک کنید.');
    } else if (sess && sess.access_token) {
    start();
  } else {
    showLogin('');
  }
})();

 
