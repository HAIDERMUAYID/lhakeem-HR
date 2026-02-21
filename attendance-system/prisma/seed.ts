import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // موظفون
  const manager = await prisma.user.upsert({
    where: { email: 'manager@example.com' },
    update: {},
    create: {
      email: 'manager@example.com',
      name: 'أحمد المدير',
      jobTitle: 'مدير الموارد البشرية',
    },
  });

  const employee = await prisma.user.upsert({
    where: { email: 'employee@example.com' },
    update: {},
    create: {
      email: 'employee@example.com',
      name: 'محمد الموظف',
      jobTitle: 'موظف إداري',
      managerId: manager.id,
    },
  });

  // أجهزة البصمة (إن لم تكن موجودة)
  let deviceAdmin = await prisma.device.findFirst({ where: { code: 'ADM-01' } });
  if (!deviceAdmin) {
    deviceAdmin = await prisma.device.create({
      data: {
        name: 'جهاز الإدارة',
        code: 'ADM-01',
        location: 'مبنى الإدارة',
        isActive: true,
      },
    });
  }

  let deviceEmergency = await prisma.device.findFirst({ where: { code: 'EMR-01' } });
  if (!deviceEmergency) {
    deviceEmergency = await prisma.device.create({
      data: {
        name: 'جهاز الطوارئ',
        code: 'EMR-01',
        location: 'قسم الطوارئ',
        isActive: true,
      },
    });
  }

  // معرفات البصمة: المدير 1، الموظف 2 على كلا الجهازين
  for (const device of [deviceAdmin, deviceEmergency]) {
    await prisma.employeeFingerprint.upsert({
      where: {
        deviceId_fingerprintId: { deviceId: device.id, fingerprintId: '1' },
      },
      update: { userId: manager.id },
      create: { userId: manager.id, deviceId: device.id, fingerprintId: '1' },
    });
    await prisma.employeeFingerprint.upsert({
      where: {
        deviceId_fingerprintId: { deviceId: device.id, fingerprintId: '2' },
      },
      update: { userId: employee.id },
      create: { userId: employee.id, deviceId: device.id, fingerprintId: '2' },
    });
  }

  // جداول عمل (أحد–خميس 08:00–16:00)
  const workDays = [0, 1, 2, 3, 4]; // 0=الأحد .. 4=الخميس
  for (const user of [manager, employee]) {
    for (const dayOfWeek of workDays) {
      await prisma.workSchedule.upsert({
        where: { userId_dayOfWeek: { userId: user.id, dayOfWeek } },
        update: { startTime: '08:00', endTime: '16:00' },
        create: {
          userId: user.id,
          dayOfWeek,
          startTime: '08:00',
          endTime: '16:00',
        },
      });
    }
  }

  console.log('Seed completed: موظفون، أجهزة بصمة، معرفات البصمة، جداول العمل.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
