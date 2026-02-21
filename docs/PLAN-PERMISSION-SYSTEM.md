# خطة ضبط الصلاحيات الشامل (System-Wide Permission Binding)

## الهدف
تحويل النظام إلى **Fully Permission-Driven Architecture** بحيث كل عنصر قابل للتفاعل (صفحة، زر، API، Route) مربوط بصلاحية واضحة، مع **Deny by Default** و**Zero Visibility** للمستخدم الجديد بدون صلاحيات.

---

# 1️⃣ خطة تحليل النظام

## 1.1 منهجية الاستخراج

| المصدر | ما يُستخرج | الطريقة |
|--------|-------------|---------|
| **Backend** | كل Controller + Method | مسح `@Controller` و `@Get/@Post/@Put/@Patch/@Delete` مع وجود أو غياب `@RequirePermissions` |
| **Frontend** | كل Route (صفحة) | مسح `app/(dashboard)/dashboard/**/page.tsx` وربطها بـ sidebar permission |
| **Frontend** | أزرار/عمليات داخل الصفحة | مسح الأزرار التي تطلق API أو تغيّر حالة (إضافة، تعديل، حذف، اعتماد، تصدير، استيراد) |
| **Frontend** | Modals و Forms | نفس الربط: أي modal يرسل طلب API → صلاحية الطلب |
| **API ↔ Page** | ربط Endpoint → صلاحية | كل استدعاء `apiGet/apiPost/apiPut/apiPatch/apiDelete` يُربط بصلاحية الـ endpoint |

## 1.2 نتائج المسح الحالي (ملخص)

### Backend – الـ Endpoints حسب الحماية

| الحالة | الوحدات | الملاحظة |
|--------|---------|----------|
| **محمية بـ RequirePermissions** | audit, leave-types, employees (جزئي), users, absences (جزئي), leave-requests (جزئي), balance | كل استدعاء يمر عبر PermissionsGuard |
| **JwtAuthGuard فقط** | departments, holidays, devices, fingerprint-calendar, work-schedules (مع فحص يدوي داخل الخدمة) | أي مستخدم مسجل دخول يمكنه استدعاء الـ API |
| **فحص يدوي (بدون Decorator)** | absence-reports, work-schedules | استخدام `isOfficer` / `isManager` / `canApprove` داخل الـ handler |

### Frontend – الحماية الحالية

| العنصر | الوضع الحالي |
|--------|---------------|
| **Routes (URL)** | لا يوجد فحص صلاحية: أي مستخدم يمكنه كتابة `/dashboard/departments` أو `/dashboard/users` والوصول إن كان لديه توكن |
| **Sidebar** | يخفي الروابط حسب `hasAccess(permission)` — إخفاء بصري فقط |
| **لوحة التحكم** | البطاقات الإحصائية تُفلتر حسب صلاحية |
| **صفحات محددة** | بعض الصفحات تقرأ `permissions` وتخفي أزراراً (مثل التقارير، الإعدادات) |
| **الأزرار/النماذج** | لا يوجد فحص موحد: كثير من الأزرار يظهر للجميع وتُرفض الطلبات من الـ Backend فقط |

---

# 2️⃣ Permission Matrix المقترحة (هيكل هرمي)

## 2.1 التصنيف الهرمي

```
Module (وحدة وظيفية)
  └── Page / Resource (صفحة أو مورد)
        └── Action (إجراء: عرض، إضافة، تعديل، حذف، اعتماد، تصدير، …)
              └── Sub-action (إن لزم: مثلاً حذف بصمة من جهاز)
```

## 2.2 المصفوفة المقترحة (Master Permission Matrix)

الصلاحيات تُعرّف كـ **أكواد ثابتة** (مثل الحالي) مع تنظيم منطقي. لا حاجة لجدول صلاحيات ديناميكي في أول مرحلة إذا كانت القائمة محدودة ومعروفة؛ يمكن لاحقاً نقلها إلى DB مع واجهة إدارة.

### الوحدات (Modules) والصفحات والأفعال

| Module | Page / Resource | صلاحية العرض (View) | صلاحيات الإجراء (Actions) |
|--------|-----------------|---------------------|---------------------------|
| **لوحة التحكم** | Dashboard | (بدون صلاحية أو صلاحية دخول عامة) | — |
| **الموظفين** | Employees list | EMPLOYEES_VIEW | EMPLOYEES_MANAGE (إضافة، تعديل، استيراد، حذف دفعات)، عرض ملف: EMPLOYEES_VIEW |
| **إكمال البيانات** | Data completion | EMPLOYEES_VIEW | EMPLOYEES_MANAGE |
| **الاستيراد** | Imports | EMPLOYEES_MANAGE | (نفس الصلاحية) |
| **الأقسام** | Departments | DEPARTMENTS_MANAGE | (نفس: عرض، إضافة، تعديل، عرض موظفين، نقل موظفين) |
| **أجهزة البصمة** | Devices | FINGERPRINT_DEVICES_VIEW أو استخدام FINGERPRINT_OFFICER كحد أدنى | FINGERPRINT_DEVICES_MANAGE (إضافة/تعديل/حذف جهاز)، FINGERPRINT_DEVICES_EMPLOYEES (إدارة بصمات الموظفين على الجهاز) |
| **تقويم وحدة البصمة** | Fingerprint calendar | نفس أجهزة البصمة | عرض فقط (لا تعديل) |
| **الإجازات** | Leaves list | LEAVES_VIEW | LEAVES_CREATE، LEAVES_APPROVE (اعتماد/رفض) |
| **تقويم الإجازات** | Leaves calendar | LEAVES_VIEW | — |
| **أنواع الإجازات** | Leave types | LEAVE_TYPES_MANAGE | (نفس) |
| **الغيابات** | Absences | FINGERPRINT_OFFICER أو FINGERPRINT_MANAGER | ABSENCES_CREATE، ABSENCES_CANCEL؛ كشوف الغياب: حسب absence-reports |
| **كشوف الغياب (يومي)** | Absences day report | FINGERPRINT_OFFICER | إنشاء/تعديل/إرسال كشف |
| **التجميع/المصادقة** | Consolidation | FINGERPRINT_MANAGER | مصادقة، حل التكرار |
| **العطل** | Holidays | LEAVES_VIEW أو HOLIDAYS_VIEW | HOLIDAYS_MANAGE (إضافة، تعديل، حذف) |
| **جداول الدوام** | Schedules | SCHEDULES_VIEW | SCHEDULES_MANAGE، SCHEDULES_APPROVE |
| **التقارير** | Reports | REPORTS_VIEW | REPORTS_EXPORT |
| **الإعدادات** | Settings | SETTINGS_VIEW | BALANCE_ACCRUAL (استحقاق الرصيد) إن وُجد |
| **المستخدمون** | Users | USERS_MANAGE | (نفس: عرض، إضافة، تعديل، صلاحيات، أقسام) |
| **سجل التدقيق** | Audit logs | AUDIT_VIEW | — |

### صلاحيات إضافية مقترحة (لتفكيك الحالي وتغطية كل فعل)

| الكود المقترح | الوصف | الاعتماد (Dependency) |
|---------------|--------|------------------------|
| FINGERPRINT_DEVICES_VIEW | عرض أجهزة البصمة وتقويم الوحدة | — |
| FINGERPRINT_DEVICES_MANAGE | إضافة/تعديل/حذف جهاز | FINGERPRINT_DEVICES_VIEW أو FINGERPRINT_OFFICER |
| FINGERPRINT_DEVICES_EMPLOYEES | إدارة ربط الموظفين بالجهاز (بصمة، إضافة/حذف من جهاز) | FINGERPRINT_DEVICES_VIEW |
| HOLIDAYS_VIEW | عرض العطل | يمكن دمجه مع LEAVES_VIEW |
| HOLIDAYS_MANAGE | إضافة/تعديل/حذف عطلة | LEAVES_VIEW أو HOLIDAYS_VIEW |

يمكن تنفيذ المرحلة الأولى **بدون** تكثير الصلاحيات: الإبقاء على نفس الأكواد الحالية وربط كل endpoint وصفحة وزر بأحد هذه الأكواد، ثم في مرحلة لاحقة تفكيك VIEW من MANAGE حيث يلزم.

---

# 3️⃣ هيكلة قاعدة البيانات

## 3.1 الوضع الحالي

- **User** يحتوي على `permissions String[] @default([])`.
- لا يوجد جدول `Permission` ولا `Role`؛ الصلاحيات مخزنة كقائمة نصوص في المستخدم.
- واجهة المستخدمين تسمح باختيار صلاحيات من قائمة ثابتة (من `/api/auth/permissions`).

## 3.2 خياران للهيكلة

### الخيار أ (الحد الأدنى – مُوصى به للمرحلة الأولى)
- الإبقاء على **User.permissions: String[]**.
- تعريف كل الصلاحيات وأسمائها العربية وتبعياتها في الكود (مثل `permissions.ts` + توسيع PERMISSION_LABELS وربط Dependencies).
- **لا تغيير في الـ DB**؛ التوسع يكون في الـ Backend (Guards + Decorators) والـ Frontend (Route guard + إخفاء أزرار).

### الخيار ب (قابل للتوسع لاحقاً)
- إنشاء جدول **Permission** (code, labelAr, module, dependsOn[]).
- إنشاء جدول **UserPermission** (userId, permissionCode) بدلاً من عمود واحد.
- إبقاء صلاحية **ADMIN** تعني منح كل الأكواد المعرّفة في الجدول (أو عدم التحقق من القائمة).
- يفيد إذا أردت لاحقاً إدارة الصلاحيات من الواجهة أو ربط أدوار (Roles) بمجموعات صلاحيات.

**التوصية:** البدء بالخيار أ، وإدراج الخيار ب كمرحلة لاحقة إذا ظهرت حاجة لإدارة ديناميكية أو أدوار معقدة.

---

# 4️⃣ خطة التنفيذ المرحلية

## المرحلة 1: تأمين الـ Backend بالكامل (Deny by Default)

1. **تعداد كل الـ Endpoints غير المحمية:**
   - departments: إضافة `@UseGuards(PermissionsGuard)` + `@RequirePermissions(DEPARTMENTS_MANAGE)` على كل من Get/Post/Put.
   - holidays: إضافة صلاحيات (مثلاً LEAVES_VIEW للقراءة، LEAVE_TYPES_MANAGE أو صلاحية HOLIDAYS_MANAGE للكتابة).
   - devices: إضافة FINGERPRINT_OFFICER أو FINGERPRINT_DEVICES_VIEW للقراءة، وواحدة للكتابة (إنشاء/تعديل/حذف جهاز، وإدارة بصمات الموظفين).
   - fingerprint-calendar: نفس صلاحية عرض أجهزة البصمة (FINGERPRINT_OFFICER أو FINGERPRINT_DEVICES_VIEW).
   - work-schedules: توحيد الفحص: إما استخدام RequirePermissions(SCHEDULES_VIEW, SCHEDULES_MANAGE, SCHEDULES_APPROVE) حسب الفعل، أو الاحتفاظ بالمنطق الحالي مع التأكد أن كل مسار يتحقق من صلاحية.

2. **توحيد آلية التحقق:**
   - استبدال أي فحص يدوي (مثل `isOfficer(user.permissions)`) بـ `@RequirePermissions(...)` على الـ endpoint المناسب حتى لا يبقى أي endpoint بدون حماية.

3. **سياسة افتراضية:** أي route لا يحمل `@RequirePermissions` صريحاً إما أن يُمنع للجميع (إذا كان حساساً) أو يُربط بصلاحية دخول دنيا بعد الاتفاق عليها.

## المرحلة 2: حماية الـ Routes في الواجهة (Frontend)

1. **Route Guard مركزي:**
   - إنشاء مكون أو طبقة (مثلاً `ProtectedRoute` أو HOC) يقرأ الصلاحية المطلوبة للـ path (من خريطة path → permission).
   - إذا لم يكن لدى المستخدم الصلاحية: إما إعادة توجيه إلى `/dashboard` أو عرض صفحة "غير مصرح".

2. **تحديث Middleware (اختياري):**
   - الـ middleware الحالي يتحقق فقط من وجود توكن. يمكن إضافة تحقق من صلاحية الصفحة إذا كانت الصلاحيات متوفرة في JWT أو في cookie (لا يُنصح بوضع قائمة صلاحيات كاملة في الـ cookie). البديل الأفضل: التحقق داخل الصفحة أو داخل Layout بعد تحميل المستخدم.

3. **خريطة المسارات:**
   - ملف مركزي (مثلاً `routePermissions.ts`) يربط كل مسار dashboard بصلاحية واحدة أو أكثر (أول صلاحية = للعرض).

## المرحلة 3: ربط الأزرار والإجراءات بالصلاحيات

1. **استخراج قائمة إجراءات كل صفحة:**
   - من كل صفحة: أزرار (إضافة، تعديل، حذف، اعتماد، تصدير، استيراد، …).
   - ربط كل زر بصلاحية الـ API الذي يستدعيه.

2. **مكون مساعد:** مثلاً `CanDo({ permission, children })` يظهر `children` فقط إذا كان المستخدم لديه الصلاحية.

3. **تطبيق المكون على كل الأزرار/النماذج الحساسة** حتى لا يظهر زر "حذف" أو "اعتماد" لمستخدم غير مخوّل.

## المرحلة 4: صفحة الصلاحيات وإدارة المستخدمين

1. **عرض هرمي للصلاحيات:**
   - تجميع حسب Module ثم Page ثم Action.
   - عرض التبعيات (مثل: "تعديل يتطلب عرض").

2. **منح/سحب صلاحيات المستخدم:**
   - الإبقاء على الوضع الحالي (قائمة اختيار) مع إمكانية تجميع الصلاحيات تحت عناوين (وحدات) لتقليل الفوضى.

3. **Critical Permissions:**
   - تمييز صلاحيات حساسة (مثل USERS_MANAGE، ADMIN، SCHEDULES_APPROVE) بعلامة تحذير أو قسم خاص.

## المرحلة 5: Dependency و Default State

1. **في الكود:** تعريف `PERMISSION_DEPENDENCIES` (مثل: EDIT يتطلب VIEW).
2. **عند حفظ صلاحيات المستخدم:** إما منح الصلاحيات المعتمدة تلقائياً، أو عرض تحذير فقط ("هذه الصلاحية تتطلب صلاحية العرض").
3. **مستخدم جديد:** التأكد أن `permissions = []` افتراضياً ولا يُمنح أي صلاحية إلا صراحة — Zero Visibility.

## المرحلة 6: التدقيق والاختبار

1. **قائمة اختبار:** كل endpoint يُستدعى مع توكن مستخدم بدون الصلاحية → يتوقع 403.
2. **قائمة اختبار:** كل مسار يُفتح مباشرة بدون صلاحية → إما إعادة توجيه أو صفحة "غير مصرح".
3. **قائمة اختبار:** كل زر محمي لا يظهر للمستخدم الذي لا يملك الصلاحية.
4. **مستخدم جديد بدون صلاحيات:** لا يرى أي رابط في الـ sidebar ولا يمكنه الوصول لأي صفحة وظيفية إلا لوحة التحكم (إن كانت مسموحة بدون صلاحية).

---

# 5️⃣ آلية الاختبار للتأكد أن النظام 100% Permission Controlled

## 5.1 اختبارات الـ Backend

| الاختبار | الطريقة | النتيجة المتوقعة |
|----------|---------|-------------------|
| استدعاء كل GET/POST/PUT/DELETE بدون توكن | Request بدون Header Authorization | 401 |
| استدعاء كل endpoint بتوكن مستخدم له `permissions: []` | توكن صالح، صلاحيات فارغة | 403 (ما عدا endpoints مع عدم وجود RequirePermissions – يجب إزالة أو حماية كل حساس) |
| استدعاء endpoint بصلاحية صحيحة | توكن + صلاحية مناسبة | 200/201 حسب المنطق |

## 5.2 اختبارات الواجهة

| الاختبار | الطريقة | النتيجة المتوقعة |
|----------|---------|-------------------|
| مستخدم بدون صلاحيات | تسجيل دخول بمستخدم permissions = [] | لا يظهر في الـ sidebar إلا "لوحة التحكم" (إن كانت مسموحة)، ولا يصل لصفحات أخرى عبر URL أو يرى "غير مصرح" |
| الدخول المباشر لـ URL محمي | مثال: /dashboard/users بصلاحيات [] | إعادة توجيه أو صفحة عدم صلاحية |
| ظهور الأزرار | مستخدم لديه VIEW فقط بدون MANAGE | لا يظهر زر الإضافة/التعديل/الحذف حيث الربط صحيح |

## 5.3 قائمة التحقق النهائية

- [ ] لا يوجد Controller method يغيّر بيانات بدون `@RequirePermissions` (أو فحص مكافئ).
- [ ] لا يوجد Route في dashboard يمكن أن يعرض محتوى حساس بدون التحقق من صلاحية الصفحة.
- [ ] كل زر "إضافة / تعديل / حذف / اعتماد / تصدير" مربوط بصلاحية ويُخفى عند عدم الترخيص.
- [ ] مستخدم جديد (permissions = []) لا يصل لأي مورد حساس من الواجهة ولا من الـ API.
- [ ] صلاحية ADMIN تمنح الوصول الكامل دون استثناءات عشوائية.

---

# 6️⃣ ملخص الإجراءات الفورية (بدون قائمة جاهزة منك)

1. **تثبيت صلاحيات الـ Backend:** إضافة `PermissionsGuard` + `@RequirePermissions` على: departments, holidays, devices, fingerprint-calendar، وتوحيد work-schedules و absence-reports بالـ decorator حيث أمكن.
2. **تعريف خريطة مسارات الواجهة:** path → required permission.
3. **تنفيذ Route Guard في الواجهة:** منع عرض الصفحة أو السماح حسب الصلاحية.
4. **استخراج أزرار/إجراءات كل صفحة وربطها بصلاحية** واستخدام مكون CanDo أو ما يعادله.
5. **تحسين صفحة إدارة صلاحيات المستخدمين:** عرض هرمي، تبعيات، تمييز صلاحيات حرجة.
6. **تشغيل قائمة الاختبار أعلاه** وتسجيل أي ثغرة وإصلاحها.

بعد تنفيذ هذه الخطة يصبح النظام **قابل للتدقيق، قابل للتوسع، وآمناً** مع عدم اعتماد على إخفاء بصري فقط وضبط كل عنصر بالصلاحيات دون استثناء.

---

# الملحق: خريطة Endpoint → صلاحية (للتنفيذ)

جدول يربط كل مسار API بالصلاحية المطلوبة. الـ endpoints التي بدون عمود "محمي حالياً" تحتاج إضافة `@UseGuards(PermissionsGuard)` و `@RequirePermissions(...)`.

| Controller | Method | Path (تقريبي) | صلاحية مقترحة | محمي حالياً |
|------------|--------|----------------|----------------|-------------|
| **auth** | POST | login | — | لا يحتاج |
| **auth** | POST | change-password | (المستخدم الحالي) | JWT فقط |
| **auth** | GET | permissions | JWT | نعم |
| **audit** | GET | / | AUDIT_VIEW | نعم |
| **users** | GET | / | USERS_MANAGE | نعم |
| **users** | GET | :id | USERS_MANAGE | نعم |
| **users** | POST | / | USERS_MANAGE | نعم |
| **users** | PUT | :id | USERS_MANAGE | نعم |
| **users** | PUT | :id/permissions | USERS_MANAGE | نعم |
| **users** | PUT | :id/department-assignments | USERS_MANAGE | نعم |
| **users** | GET | options | EMPLOYEES_VIEW أو EMPLOYEES_MANAGE | نعم |
| **users** | GET | me/department-assignments | (مستخدم حالي) | JWT |
| **users** | GET | me/schedule-departments | SCHEDULES_VIEW أو أعلى | نعم |
| **employees** | GET/POST/PUT/Delete/… | مختلف | EMPLOYEES_VIEW / EMPLOYEES_MANAGE | نعم |
| **departments** | GET stats, GET, GET :id | جميع | DEPARTMENTS_MANAGE | **لا** |
| **departments** | POST, PUT :id | جميع | DEPARTMENTS_MANAGE | **لا** |
| **leave-types** | GET | جميع | LEAVES_VIEW أو LEAVE_TYPES_MANAGE | GET بدون، الباقي نعم |
| **leave-types** | POST, PUT :id | — | LEAVE_TYPES_MANAGE | نعم |
| **holidays** | GET range, GET | جميع | LEAVES_VIEW (أو HOLIDAYS_VIEW) | **لا** |
| **holidays** | POST, PUT, Delete | — | LEAVE_TYPES_MANAGE أو HOLIDAYS_MANAGE | **لا** |
| **devices** | GET stats, GET, GET :id | جميع | FINGERPRINT_OFFICER أو FINGERPRINT_MANAGER | **لا** |
| **devices** | POST, PUT :id, Delete :id | — | نفس (أو FINGERPRINT_MANAGER فقط للتعديل) | **لا** |
| **employees/:id/fingerprints** | GET, POST, PATCH, Delete | جميع | FINGERPRINT_OFFICER أو EMPLOYEES_MANAGE | **لا** |
| **fingerprint-calendar** | GET month, GET day | جميع | FINGERPRINT_OFFICER أو FINGERPRINT_MANAGER | **لا** |
| **work-schedules** | GET, GET months | — | SCHEDULES_VIEW | **لا** (فحص يدوي فلتر أقسام) |
| **work-schedules** | POST, POST bulk | — | SCHEDULES_MANAGE أو SCHEDULES_VIEW + فلتر قسم | **لا** |
| **work-schedules** | POST approve-department-month | — | SCHEDULES_APPROVE | **لا** |
| **work-schedules** | Delete :id | — | SCHEDULES_MANAGE أو SCHEDULES_APPROVE | **لا** |
| **work-schedules** | GET official-report, POST copy-from-month | — | SCHEDULES_VIEW | **لا** |
| **absence-reports** | جميع الـ endpoints | — | FINGERPRINT_OFFICER أو FINGERPRINT_MANAGER (حسب الفعل) | فحص يدوي (يُفضّل استبداله بـ RequirePermissions) |
| **absences** | GET | — | FINGERPRINT_OFFICER أو FINGERPRINT_MANAGER | JWT فقط للـ GET |
| **absences** | POST, POST :id/cancel | — | ABSENCES_CREATE, ABSENCES_CANCEL | نعم |
| **leave-requests** | GET (قائمة، تقارير، …) | مختلف | LEAVES_VIEW / LEAVES_PRINT / REPORTS_VIEW | نعم حيث مذكور |
| **leave-requests** | POST, POST approve/reject, Delete | — | LEAVES_CREATE / LEAVES_APPROVE | نعم |
| **balance** | POST accrual, daily-accrual | — | BALANCE_ACCRUAL | نعم |

**ملاحظة:** الـ GET للـ leave-types و holidays يمكن أن تبقى مفتوحة لمن لديه LEAVES_VIEW إذا أردت تقليل الصلاحيات الدقيقة، أو ربطها بصلاحية عرض العطل/الأنواع فقط.
