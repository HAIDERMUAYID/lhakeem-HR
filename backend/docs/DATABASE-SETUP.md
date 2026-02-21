# إعداد قاعدة بيانات الـ Backend (حل أخطاء 500)

**تمت استعادة القاعدة السابقة:** حُذفت جداول نظام الحضور وطُبّقت migrations الـ Backend + الـ seed. التطبيق (الموظفون، الأقسام، الإجازات) يعمل الآن على `alhakeem_hr`. لاستخدام نظام الحضور لاحقاً أنشئ له قاعدة منفصلة.

---

## السبب (للمرجع)
قاعدة البيانات الحالية (`alhakeem_hr` على Render) تحتوي على **جداول نظام الحضور (attendance-system)** فقط:
- `users` (بصيغة الحضور: job_title, manager_id)
- `devices`, `employee_fingerprints`, `work_schedules`, `leave_requests`, `attendance_logs` بصيغة نظام الحضور

بينما الـ **Backend** (التطبيق الرئيسي للموظفين والأقسام) يتوقع جداول مختلفة:
- `users` (بصيغة مختلفة: password_hash, role, permissions)
- `departments`, `employees`, `leave_types`, `leave_requests` (بصيغة الـ backend)، إلخ.

لذلك طلبات مثل `/api/departments` و `/api/employees` تفشل (500) لأن الجداول المطلوبة غير موجودة.

## الحل: قاعدة بيانات منفصلة للـ Backend

يجب أن يستخدم الـ Backend قاعدة بيانات **خاصة به**، ثم تشغيل migrations والـ seed عليها.

### الخطوات

1. **إنشاء قاعدة بيانات جديدة (PostgreSQL)**
   - في [Render](https://render.com): Dashboard → New → PostgreSQL، أو أنشئ قاعدة جديدة في نفس المشروع.
   - أو استخدم أي مزود PostgreSQL آخر (مثل Supabase، أو PostgreSQL محلي).
   - انسخ **Connection String** (الداخلي إن أمكن، للـ migrations).

2. **تحديث `backend/.env`**
   - غيّر `DATABASE_URL` ليشير إلى قاعدة البيانات **الجديدة** (وليست `alhakeem_hr` المستخدمة لنظام الحضور).

   مثال:
   ```env
   DATABASE_URL="postgresql://user:password@host:5432/backend_db?sslmode=require"
   ```

3. **تشغيل migrations الـ Backend**
   ```bash
   cd backend
   npx prisma migrate deploy
   ```

4. **تشغيل الـ Seed (بيانات أولية)**
   ```bash
   npm run prisma:seed
   ```
   أو:
   ```bash
   npx prisma db seed
   ```

5. **إعادة تشغيل الـ Backend**
   ```bash
   npm run dev
   ```

بعد ذلك يجب أن تعمل واجهات الموظفين والأقسام والإجازات بدون أخطاء 500.

---

## ملخص قواعد البيانات المقترحة

| التطبيق            | قاعدة البيانات        | الاستخدام                    |
|--------------------|------------------------|------------------------------|
| **Backend** (منفذ 3001) | قاعدة جديدة (مثلاً `alhakeem_hr_backend`) | الموظفون، الأقسام، الإجازات، المستخدمون |
| **attendance-system** (Next) | القاعدة الحالية `alhakeem_hr` | الحضور، أجهزة البصمة، معرفات البصمة   |

يمكن أن تبقى `attendance-system/.env` كما هي (تشير إلى `alhakeem_hr`).
