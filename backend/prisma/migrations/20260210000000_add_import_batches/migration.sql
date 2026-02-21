-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "file_name" TEXT,
    "imported_count" INTEGER NOT NULL,
    "failed_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "employees" ADD COLUMN "import_batch_id" TEXT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
