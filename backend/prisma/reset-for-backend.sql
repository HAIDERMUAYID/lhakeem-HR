-- إعادة قاعدة البيانات لحالة الـ Backend (حذف جداول نظام الحضور)
-- تشغيل من مجلد backend: npx prisma db execute --file prisma/reset-for-backend.sql

-- حذف الجداول (بالترتيب بسبب العلاقات)
DROP TABLE IF EXISTS "attendance_logs" CASCADE;
DROP TABLE IF EXISTS "employee_fingerprints" CASCADE;
DROP TABLE IF EXISTS "leave_requests" CASCADE;
DROP TABLE IF EXISTS "work_schedules" CASCADE;
DROP TABLE IF EXISTS "devices" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

-- حذف الأنواع (Enums) من نظام الحضور
DROP TYPE IF EXISTS "AttendanceStatus" CASCADE;
DROP TYPE IF EXISTS "LeaveStatus" CASCADE;

-- مسح سجل migrations السابقة ليطبق الـ Backend migrations من جديد
DELETE FROM "_prisma_migrations";
