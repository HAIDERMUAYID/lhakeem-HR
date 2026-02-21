# نظام إدارة الإجازات والدوام – مستشفى الحكيم

نظام احترافي لإدارة الإجازات، الغيابات، جداول الدوام، والرصيد التراكمي للإجازات.

## البنية

```
alhakeem-HR/
├── backend/     # NestJS API + Prisma + PostgreSQL
├── frontend/    # Next.js 14 + Tailwind + RTL
└── package.json # Root scripts
```

## المتطلبات

- Node.js 18+
- PostgreSQL
- npm

## التشغيل المحلي

### 1. إعداد قاعدة البيانات

```bash
# إنشاء ملف .env في المجلد backend
cp .env.example backend/.env

# تعديل DATABASE_URL في backend/.env
# مثال: postgresql://user:pass@localhost:5432/alhakeem_hr

cd backend
npm install
npx prisma migrate dev --name init
npx prisma db seed
```

### 2. تشغيل الـ API

```bash
cd backend
npm run dev
# يعمل على http://localhost:3001
```

### 3. تشغيل الواجهة

```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > .env.local
npm run dev
# يعمل على http://localhost:3000
```

### أو تشغيل الاثنين معاً من الجذر

```bash
npm install
npm run dev
```

## الحساب الافتراضي (بعد تشغيل Seed)

- **البريد:** admin@alhakeem.com
- **كلمة المرور:** admin123

## النشر على GitHub

1. إنشاء مستودع جديد على [GitHub](https://github.com/new) (بدون تهيئة README إن أردت استخدام الموجود).
2. من جذر المشروع نفّذ:

```bash
git init
git add .
git commit -m "Initial commit: Al-Hakeem HR System"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/alhakeem-HR.git
git push -u origin main
```

استبدل `YOUR_USERNAME` باسم المستخدم أو المنظمة. للتفاصيل انظر [docs/GITHUB-PUBLISH.md](docs/GITHUB-PUBLISH.md).

## نشر النظام (Deploy)

لنشر النظام على الإنترنت (مثلاً على Render):

1. ارفع الكود إلى **GitHub** إن لم يكن مرفوعاً (`git push origin main`).
2. في [Render](https://render.com): **New** → **Blueprint** → اختر المستودع؛ سيُنشأ من `render.yaml` قاعدة البيانات + API + الواجهة.
3. بعد النشر، عيّن في خدمة **alhakeem-web** المتغير `NEXT_PUBLIC_API_URL` برابط الـ API، ثم أعد النشر.
4. شغّل **مرة واحدة** من مجلد backend: `npx prisma db seed` لإنشاء المستخدم الافتراضي.

**دليل مفصل خطوة بخطوة:** [docs/DEPLOY-GUIDE.md](docs/DEPLOY-GUIDE.md)  
تفاصيل Render وقاعدة بيانات موجودة: [docs/RENDER-DEPLOY.md](docs/RENDER-DEPLOY.md).

## الميزات

- ✅ إدارة الموظفين والأقسام
- ✅ أنواع الإجازات والرصيد التراكمي
- ✅ تسجيل الغيابات وربطها بالإجازات
- ✅ العطل الرسمية وجداول الدوام
- ✅ صلاحيات متعددة (Admin, مدير إجازات, مسؤول بصمة, مدير قسم)
- ✅ واجهة RTL عربية responsive
- ✅ Mobile-First + Touch-friendly
