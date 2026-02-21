import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction([
    prisma.employee.updateMany({ data: { managerId: null } }),
    prisma.leaveRequest.deleteMany({}),
    prisma.absence.deleteMany({}),
    prisma.workSchedule.deleteMany({}),
    prisma.employee.deleteMany({}),
    prisma.importBatch.deleteMany({}),
  ]);
  console.log('تم حذف جميع الموظفين والسجلات المرتبطة.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
