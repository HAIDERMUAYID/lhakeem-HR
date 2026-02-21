# نشر نظام الحكيم على Render

## لدي بالفعل قاعدة بيانات على Render ومربوطة بالنظام

إذا كانت قاعدة البيانات موجودة ومربوطة:

1. **لا تنشئ قاعدة جديدة.** استخدم فقط خدمتي الواجهة والـ API.
2. **خدمة الـ API (Backend):**
   - **New** → **Web Service** → ربط المستودع.
   - **Root Directory:** `backend`
   - **Build Command:** `npm install --include=dev && npx prisma generate && npm run build` (الـ `--include=dev` يثبّت أدوات البناء مثل Nest CLI)
   - **Start Command:** `npx prisma migrate deploy && npm run start:prod`
   - **Environment:** أضف `DATABASE_URL` واختر **قاعدة البيانات الموجودة** من القائمة (أو الصق Internal Database URL)، ثم `JWT_SECRET` و `NODE_ENV=production`.
3. **خدمة الواجهة (Frontend):**
   - **New** → **Web Service** → نفس المستودع.
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start`
   - **Environment:** `NEXT_PUBLIC_API_URL` = رابط خدمة الـ API بعد نشرها (مثل `https://alhakeem-api.onrender.com`).

**إذا ظهر خطأ `relation "users" already exists` عند النشر:**  
قاعدة البيانات تحتوي بالفعل على جداول. خياران:
- **قاعدة مخصصة لنظام الحكيم (نفس الـ schema):** شغّل مرة واحدة من **Render Shell** لخدمة الـ API (أو من جهازك مع نفس `DATABASE_URL`):  
  `cd backend && npm run db:resolve-all`  
  ثم أعد النشر. بعدها `prisma migrate deploy` سيعتبر كل الـ migrations مطبّقة ولن يعيد إنشاء الجداول.
- **قاعدة لمشروع آخر (مثلاً نظام مستشفى):** استخدم **قاعدة بيانات جديدة** على Render لهذا المشروع فقط وحدّث `DATABASE_URL` في Environment.

يمكنك أيضاً استخدام الملف **render-existing-db.yaml** (بدون إنشاء DB): عند إنشاء Blueprint اختر أو عدّل الملف ليكون هذا، ثم في خدمة **alhakeem-api** اضغط **Environment** واربط `DATABASE_URL` بقاعدة البيانات الموجودة من القائمة أو الصق الرابط.

---

## هل يمكن النشر على نفس الـ Web Service الحالي؟

**لا.** في Render كل **Web Service** يشغّل تطبيقاً واحداً فقط. لا يمكن تشغيل تطبيقين مختلفين على نفس الخدمة.

لديك خياران:

| الخيار | الوصف |
|--------|--------|
| **1. مشروع جديد (مستحسَن)** | تنشئ **مشروعاً جديداً** على Render لهذا النظام (Backend + Frontend + DB). التطبيق الحالي على خدمتك الحالية يبقى كما هو. |
| **2. استبدال التطبيق الحالي** | تغيّر إعدادات الخدمة الحالية لتصبح مشروع الحكيم (ويختفي التطبيق القديم من هذه الخدمة). |

الأسفل يشرح **الخيار 1** (مشروع جديد) لأنك تريد الإبقاء على تطبيقك الحالي.

---

## النشر كمشروع جديد على Render

هذا المشروع يحتاج **3 مكوّنات** على Render:

1. **قاعدة بيانات PostgreSQL** (Database)
2. **خدمة الـ API** (Backend – NestJS) على منفذ مثل 3001
3. **خدمة الواجهة** (Frontend – Next.js) على منفذ مثل 3000

كل واحد منها **خدمة منفصلة** في Render.

### الطريقة أ: استخدام Blueprint (من ملف render.yaml)

1. ادخل إلى [dashboard.render.com](https://dashboard.render.com).
2. اضغط **New** → **Blueprint**.
3. اختر **Connect a repository** وربط مستودع GitHub: `HAIDERMUAYID/lhakeem-HR` (أو المستودع الذي نشرت عليه).
4. Render يقرأ `render.yaml` من الجذر ويقترح:
   - قاعدة بيانات: `alhakeem-db`
   - خدمة ويب: `alhakeem-api` (الـ Backend)
   - خدمة ويب: `alhakeem-web` (الـ Frontend)
5. اضغط **Apply** لإنشاء الخدمات.
6. بعد النشر، خذ رابط الـ API (مثل `https://alhakeem-api.onrender.com`).
7. في خدمة **alhakeem-web** → **Environment** أضف:
   - المفتاح: `NEXT_PUBLIC_API_URL`
   - القيمة: `https://alhakeem-api.onrender.com` (أو الرابط الفعلي لـ API)
8. أعد نشر **alhakeem-web** (Redeploy) حتى تأخذ الواجهة عنوان الـ API الجديد.

بهذا يكون النظام منشوراً على **خدمات جديدة** وتطبيقك الحالي على خدمتك القديمة ما زال يعمل كما هو.

### الطريقة ب: إنشاء الخدمات يدوياً (بدون Blueprint)

#### 1. قاعدة البيانات

- **New** → **PostgreSQL**.
- اسم: مثلاً `alhakeem-db`.
- بعد الإنشاء، انسخ **Internal Database URL** (ستستخدمه في الـ Backend).

#### 2. خدمة الـ API (Backend)

- **New** → **Web Service**.
- ربط المستودع نفسه واختيار الفرع (مثلاً `main`).
- الإعدادات:
  - **Root Directory:** `backend`
  - **Runtime:** Node
  - **Build Command:** `npm install && npx prisma generate && npm run build`
  - **Start Command:** `npx prisma migrate deploy && npm run start:prod`
- **Environment:**
  - `DATABASE_URL` = Internal Database URL من الخطوة 1
  - `JWT_SECRET` = قيمة سرية طويلة (أو Generate)
  - `NODE_ENV` = `production`
- احفظ الرابط النهائي للخدمة (مثل `https://alhakeem-api.onrender.com`).

#### 3. خدمة الواجهة (Frontend)

- **New** → **Web Service**.
- نفس المستودع والفرع.
- الإعدادات:
  - **Root Directory:** `frontend`
  - **Runtime:** Node
  - **Build Command:** `npm install && npm run build`
  - **Start Command:** `npm run start`
- **Environment:**
  - `NEXT_PUBLIC_API_URL` = رابط الـ API من الخطوة 2 (مثل `https://alhakeem-api.onrender.com`)
- بعد أول نشر ناجح، رابط الواجهة يكون مثل `https://alhakeem-web.onrender.com`.

#### 4. تشغيل الـ Seed (مرة واحدة)

بعد أن تعمل الـ API وقاعدة البيانات:

- من جهازك (مع إمكانية الوصول إلى DB)، أو عبر **Shell** في Render إن وُجد:
  - في مجلد `backend`:  
    `npx prisma db seed`  
  (تأكد أن `DATABASE_URL` في البيئة يشير إلى نفس قاعدة البيانات).

أو استخدم **Render Shell** لخدمة الـ API ثم نفّذ من هناك:

```bash
cd backend
npx prisma db seed
```

بعدها يمكنك الدخول بالحساب الافتراضي (مثل admin / admin123 حسب الـ seed).

---

## ملخص

- **نفس الـ Web Service الحالي:** لا يمكن تشغيل نظام الحكيم وتطبيقك الحالي معاً على خدمة واحدة.
- **الحل:** إنشاء **مشروع جديد** على Render (قاعدة بيانات + خدمة API + خدمة ويب للواجهة) وربط المستودع، ثم تعيين `NEXT_PUBLIC_API_URL` للواجهة. تطبيقك الحالي يبقى على خدمته كما هي.

إذا أردت، يمكن توضيح خطوة معينة (مثلاً فقط Blueprint أو فقط المتغيرات) حسب ما تراه في لوحة Render.
