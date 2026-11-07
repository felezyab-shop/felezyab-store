/* تنظیمات اتصال فروشگاه.
   خالی بگذارید تا «نسخه نمایشی» با اطلاعات آزمایشی اجرا شود.
   برای نسخه‌ی واقعی، این دو مقدار را از Supabase (Project Settings ← API) کپی کنید.
   ⚠ فقط «Publishable key» (یا anon) را بنویسید. کلید secret یا service_role هرگز نباید اینجا باشد. */
window.STORE_CONFIG = {
  supabaseUrl: "",   // مثال: https://abcdxyz.supabase.co
  supabaseKey: ""    // مثال: sb_publishable_...
  // demo: true      // برای دیدن دوباره‌ی نسخه‌ی نمایشی روی سایت متصل (فقط آزمایش)
};
