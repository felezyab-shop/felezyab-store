-- ساخت مدیر فروشگاه
-- قبل از اجرا: در Supabase ← Authentication ← Users ← Add user، یک کاربر با ایمیل و رمز قوی بسازید
-- (گزینه‌ی Auto Confirm User را بزنید). سپس ایمیل همان کاربر را در خط زیر بنویسید و اجرا کنید.
insert into public.admins(user_id)
select id from auth.users where email = 'EMAIL-MODIR@example.com'
on conflict do nothing;

-- بررسی: باید یک سطر برگرداند
select a.user_id, u.email from public.admins a join auth.users u on u.id = a.user_id;
