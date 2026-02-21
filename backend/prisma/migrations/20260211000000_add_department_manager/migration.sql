-- AlterTable
ALTER TABLE "departments" ADD COLUMN "manager_user_id" TEXT;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_manager_user_id_fkey" FOREIGN KEY ("manager_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
