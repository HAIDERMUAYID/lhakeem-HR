-- بصمة واحدة: حضور أو انصراف فقط (العمود الآخر يبقى فارغاً)
ALTER TABLE "attendance_daily_records" ALTER COLUMN "check_in_at" DROP NOT NULL;
ALTER TABLE "attendance_daily_records" ALTER COLUMN "check_out_at" DROP NOT NULL;
ALTER TABLE "attendance_daily_records" ALTER COLUMN "worked_minutes" DROP NOT NULL;

-- تخزين تفاصيل أخطاء الرفع لعرضها لاحقاً
ALTER TABLE "attendance_import_batches" ADD COLUMN "rejections" JSONB;
