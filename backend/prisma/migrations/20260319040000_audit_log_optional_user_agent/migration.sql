-- سجل التدقيق: مستخدم اختياري (فشل تسجيل دخول) + وكيل المتصفح
ALTER TABLE "audit_logs" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "user_agent" TEXT;
