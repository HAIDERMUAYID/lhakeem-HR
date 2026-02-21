# نشر المشروع على GitHub

## قبل النشر

- تأكد أن الملفات الحساسة **لا تُرفع** (مهمة عبر `.gitignore`):
  - `backend/.env` — قاعدة البيانات و JWT
  - `frontend/.env.local` — عنوان الـ API
  - `attendance-system/.env`
- يمكنك الاعتماد على `.env.example` ونسخها يدوياً على كل جهة أو بيئة.

## الخطوات

### 1. إنشاء مستودع على GitHub

1. ادخل إلى [github.com](https://github.com) وسجّل الدخول.
2. اضغط **New repository**.
3. اختر اسم المستودع (مثلاً `alhakeem-HR`).
4. اختر **Private** أو **Public**.
5. **لا** تختر "Add a README" إذا كان لديك بالفعل README في المشروع.
6. اضغط **Create repository**.

### 2. ربط المشروع المحلي بالمستودع

من مجلد جذر المشروع (`alhakeem-HR`) نفّذ:

```bash
# تهيئة Git (إن لم تكن قد نفذتها)
git init

# إضافة الملفات (يُستبعد ما في .gitignore)
git add .

# أول commit
git commit -m "Initial commit: إدارة الموارد البشرية لمستشفى الحكيم العام"

# تسمية الفرع الرئيسي main
git branch -M main

# ربط المستودع البعيد (استبدل YOUR_USERNAME و REPO_NAME بقيمك)
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git

# رفع التغييرات
git push -u origin main
```

### 3. استخدام SSH بدلاً من HTTPS

إذا كنت تستخدم مفاتيح SSH:

```bash
git remote add origin git@github.com:YOUR_USERNAME/REPO_NAME.git
git push -u origin main
```

### 4. بعد النشر

- أضف وصف المستودع والـ About من صفحة المستودع على GitHub.
- لا ترفع أبداً ملفات `.env`؛ استخدم GitHub Secrets للـ CI/CD أو متغيرات البيئة في منصة الاستضافة.

## ملاحظات

- اسم النظام: **إدارة الموارد البشرية لمستشفى الحكيم العام**
- المشروع يتضمن: `backend` (NestJS)، `frontend` (Next.js)، و`attendance-system` حسب الحاجة.
