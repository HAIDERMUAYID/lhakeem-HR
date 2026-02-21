-- AlterTable
ALTER TABLE "employees" ADD COLUMN "manager_user_id" TEXT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_user_id_fkey" FOREIGN KEY ("manager_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
