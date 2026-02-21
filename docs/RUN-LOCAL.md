# تشغيل النظام محلياً

## سبب خطأ "تعذر الاتصال بالخادم"

الواجهة (Frontend) على `localhost:3000` تتصل بالـ API على `localhost:3001`. إذا لم يكن الـ Backend يعمل، يظهر الخطأ:
**تعذر الاتصال بالخادم - تأكد من تشغيل الخدمة الخلفية (Backend) على المنفذ 3001**

## الحل: تشغيل الـ Backend

### الطريقة 1: تشغيل الـ Backend والواجهة معاً (من جذر المشروع)

```bash
cd /Users/haider.m/Desktop/project/alhakeem-HR
npm run dev
```

هذا يشغّل الـ API على المنفذ **3001** والواجهة على **3000** معاً.

### الطريقة 2: تشغيل الـ Backend فقط (إذا كانت الواجهة تعمل بالفعل)

```bash
cd /Users/haider.m/Desktop/project/alhakeem-HR/backend
npm install   # مرة واحدة فقط
npm run dev
```

انتظر حتى ترى رسالة مثل: `Nest application successfully started` أو أن التطبيق يستمع على المنفذ 3001.

### الطريقة 3: تشغيل الواجهة فقط (بعد تشغيل الـ Backend في طرفية أخرى)

```bash
cd /Users/haider.m/Desktop/project/alhakeem-HR/frontend
npm run dev
```

## قبل التشغيل لأول مرة

1. **قاعدة البيانات:** تأكد من وجود PostgreSQL وتشغيله، وأن ملف `backend/.env` يحتوي على `DATABASE_URL` الصحيح.
2. **الـ Backend:** نفّذ الهجرات والـ seed إن لزم:
   ```bash
   cd backend
   npx prisma migrate dev
   npx prisma db seed
   ```

## بعد التشغيل

- الواجهة: **http://localhost:3000**
- الـ API: **http://localhost:3001**
- حساب افتراضي بعد الـ seed: `admin` / `admin123` (أو كما في ملف seed)
