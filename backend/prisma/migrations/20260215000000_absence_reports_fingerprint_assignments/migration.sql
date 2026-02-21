-- CreateTable: أقسام مسؤول عنها (موظف البصمة)
CREATE TABLE "user_department_assignments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_department_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_department_assignments_user_id_department_id_key" ON "user_department_assignments"("user_id", "department_id");

ALTER TABLE "user_department_assignments" ADD CONSTRAINT "user_department_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_department_assignments" ADD CONSTRAINT "user_department_assignments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "AbsenceReportStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateTable: كشف غياب
CREATE TABLE "absence_reports" (
    "id" TEXT NOT NULL,
    "report_date" TIMESTAMP(3) NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "status" "AbsenceReportStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absence_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "absence_reports_created_by_user_id_report_date_key" ON "absence_reports"("created_by_user_id", "report_date");

ALTER TABLE "absence_reports" ADD CONSTRAINT "absence_reports_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: كشف يومي معتمد
CREATE TABLE "daily_consolidations" (
    "id" TEXT NOT NULL,
    "report_date" TIMESTAMP(3) NOT NULL,
    "approved_by_user_id" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_consolidations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_consolidations_report_date_key" ON "daily_consolidations"("report_date");

ALTER TABLE "daily_consolidations" ADD CONSTRAINT "daily_consolidations_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable absences: add report_id
ALTER TABLE "absences" ADD COLUMN "report_id" TEXT;

CREATE UNIQUE INDEX "absences_report_id_employee_id_key" ON "absences"("report_id", "employee_id");

ALTER TABLE "absences" ADD CONSTRAINT "absences_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "absence_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
