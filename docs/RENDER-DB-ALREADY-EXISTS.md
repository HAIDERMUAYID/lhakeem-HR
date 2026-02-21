# الجداول موجودة مسبقاً في القاعدة (علاج خطأ "relation already exists")

إذا كانت قاعدة البيانات تحتوي بالفعل على جداول نظام الحكيم، شغّل **مرة واحدة** الأمر التالي لاعتبار كل الـ migrations مطبّقة، ثم أعد النشر.

## الطريقة 1: من جهازك (موصى بها)

1. من لوحة Render → قاعدة البيانات → انسخ **External Database URL** (أو Internal إن كنت ستتصل من داخل شبكة Render).
2. من جذر المشروع على جهازك:

```bash
cd backend
export DATABASE_URL="postgresql://..."   # الصق الرابط هنا
npm run db:resolve-all
```

3. بعد ظهور "Done. All migrations marked as applied." ارجع إلى Render واضغط **Manual Deploy** لخدمة الـ API.

---

## الطريقة 2: من Render Shell

1. في Render → خدمة الـ API → **Shell** (إن وُجد).
2. نفّذ (الـ DATABASE_URL غالباً مضبوط في بيئة الخدمة):

```bash
cd backend
npm run db:resolve-all
```

3. بعد النجاح، أعد النشر من لوحة الخدمة.

---

## الطريقة 3: تجاوز migrate في التشغيل مؤقتاً

إذا لم تتوفر Shell ولا إمكانية التشغيل من جهازك:

1. في خدمة الـ API → **Settings** → **Build & Deploy**.
2. غيّر **Start Command** مؤقتاً إلى:
   ```bash
   npm run start:prod
   ```
3. احفظ ثم **Manual Deploy** — الخدمة ستشتغل دون تشغيل migrations.
4. عند أول فرصة، شغّل `npm run db:resolve-all` من جهازك (الطريقة 1) مع `DATABASE_URL` الصحيح.
5. بعد ذلك أرجع **Start Command** إلى:
   ```bash
   npx prisma migrate deploy && npm run start:prod
   ```
   حتى تعمل أي migrations جديدة لاحقاً تلقائياً.
