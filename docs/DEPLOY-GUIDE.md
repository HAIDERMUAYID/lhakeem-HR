# نشر نظام الحكيم (Al-Hakeem HR) — دليل سريع

## التحقق قبل النشر

تم التحقق من أن البناء يعمل محلياً:

```bash
npm run build
```

يُبنى الـ **Backend** (NestJS) ثم الـ **Frontend** (Next.js). إذا نجح الأمر، يمكنك المتابعة.

---

## ترتيب النشر

| الخطوة | الوصف |
|--------|--------|
| **1** | رفع الكود إلى **GitHub** (إن لم يكن مرفوعاً بعد) |
| **2** | إنشاء المشروع على **Render** (قاعدة بيانات + API + واجهة) |
| **3** | تعيين متغيرات البيئة وإعادة النشر إن لزم |
| **4** | تشغيل الـ Seed مرة واحدة والدخول بالنظام |

---

## 1. رفع الكود إلى GitHub

إذا كان المستودع غير مرتبط أو لم تُرفع التغييرات بعد:

```bash
cd /path/to/alhakeem-HR
git status
git add .
git commit -m "جاهز للنشر: نظام الحكيم مع النسخة المتجاوبة"
git push origin main
```

- تفاصيل إنشاء المستودع وربطه: **[docs/GITHUB-PUBLISH.md](GITHUB-PUBLISH.md)**  
- لا ترفع أبداً `backend/.env` أو `frontend/.env.local` (يجب أن تكون في `.gitignore`).

---

## 2. النشر على Render

المشروع مضبوط للنشر على [Render](https://render.com) عبر ملف **Blueprint**.

### الطريقة الموصى بها: Blueprint من المستودع

1. ادخل إلى **[dashboard.render.com](https://dashboard.render.com)** وسجّل الدخول.
2. **New** → **Blueprint**.
3. **Connect a repository** واختر مستودع المشروع (مثلاً `alhakeem-HR`).
4. Render يقرأ **render.yaml** من الجذر ويقترح:
   - **قاعدة بيانات:** `alhakeem-db` (PostgreSQL)
   - **خدمة ويب:** `alhakeem-api` (الـ Backend)
   - **خدمة ويب:** `alhakeem-web` (الـ Frontend)
5. اضغط **Apply** لإنشاء الخدمات وبدء البناء والنشر.

### إذا كانت لديك قاعدة بيانات موجودة على Render

استخدم الملف **render-existing-db.yaml** بدلاً من **render.yaml** عند إنشاء الـ Blueprint، ثم في خدمة **alhakeem-api** عيّن **DATABASE_URL** يدوياً من قاعدة البيانات الموجودة.

التفاصيل الكاملة: **[docs/RENDER-DEPLOY.md](RENDER-DEPLOY.md)** و **[docs/RENDER-DB-ALREADY-EXISTS.md](RENDER-DB-ALREADY-EXISTS.md)**.

---

## 3. متغيرات البيئة المطلوبة

### خدمة الـ API (alhakeem-api)

| المفتاح | القيمة |
|---------|--------|
| `DATABASE_URL` | من قاعدة البيانات (Internal Database URL على Render) أو مُعيّن يدوياً |
| `JWT_SECRET` | سلسلة سرية طويلة (أو Generate من Render) |
| `NODE_ENV` | `production` |
| `WEB_URL` | رابط الواجهة النهائي، مثال: `https://alhakeem-web.onrender.com` (لـ CORS) |

### خدمة الواجهة (alhakeem-web)

| المفتاح | القيمة |
|---------|--------|
| `NEXT_PUBLIC_API_URL` | رابط خدمة الـ API، مثال: `https://alhakeem-api.onrender.com` |

**مهم:** بعد أول نشر ناجح للـ API، انسخ رابطها ثم أضفه في **alhakeem-web** → **Environment** كـ `NEXT_PUBLIC_API_URL`، ثم **Manual Deploy** أو **Redeploy** لخدمة الواجهة.

---

## 4. بعد النشر

1. **تشغيل الـ Seed (مرة واحدة)** لإنشاء المستخدم الافتراضي:
   - من **Render Dashboard** → خدمة **alhakeem-api** → **Shell** (إن وُجد)، أو من جهازك مع `DATABASE_URL` المؤقت:
   ```bash
   cd backend
   npx prisma db seed
   ```
2. **تسجيل الدخول:**
   - افتح رابط الواجهة (مثل `https://alhakeem-web.onrender.com`).
   - الحساب الافتراضي (حسب الـ seed): **admin@alhakeem.com** / **admin123**.
3. غيّر كلمة المرور من الإعدادات أو صفحة تغيير كلمة المرور فوراً في بيئة الإنتاج.

---

## 5. استكشاف الأخطاء

| المشكلة | ما تفعله |
|---------|-----------|
| خطأ عند البناء (Backend) | تأكد أن **Build Command** يتضمن: `npm install --include=dev && npx prisma generate && npm run build` |
| خطأ CORS أو لا يعمل تسجيل الدخول | تحقق من `WEB_URL` في الـ API و `NEXT_PUBLIC_API_URL` في الواجهة، ثم Redeploy |
| `relation "users" already exists` | انظر قسم "قاعدة بيانات موجودة" في [RENDER-DEPLOY.md](RENDER-DEPLOY.md) |
| 500 عند تسجيل الدخول | تحقق من **Logs** لخدمة الـ API واتصال `DATABASE_URL`؛ شغّل الـ seed إن لم يكن قد نُفّذ |

تفاصيل أكثر: **[docs/RENDER-DEPLOY.md](RENDER-DEPLOY.md)** (قسم استكشاف الأخطاء).

---

## ملخص سريع

1. **Git:** `git push origin main`  
2. **Render:** New → Blueprint → ربط المستودع → Apply  
3. **Environment:** تعيين `NEXT_PUBLIC_API_URL` في alhakeem-web ورابط الـ API، و `WEB_URL` في alhakeem-api  
4. **Seed:** `npx prisma db seed` من مجلد backend (مرة واحدة)  
5. **الدخول:** الواجهة + admin@alhakeem.com / admin123 ثم تغيير كلمة المرور

بعد ذلك يكون **النظام منشوراً** ومتاحاً عبر روابط Render.
