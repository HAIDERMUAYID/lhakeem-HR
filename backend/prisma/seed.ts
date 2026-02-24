import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10);

  // ========== USERS ==========
  const admin = await prisma.user.upsert({
    where: { email: 'admin@alhakeem.com' },
    update: { username: 'admin', permissions: ['ADMIN'] },
    create: {
      username: 'admin',
      email: 'admin@alhakeem.com',
      passwordHash,
      name: 'مدير النظام',
      role: 'ADMIN',
      permissions: ['ADMIN'],
    },
  });

  await prisma.user.upsert({
    where: { email: 'leave@alhakeem.com' },
    update: { username: 'leave' },
    create: {
      username: 'leave',
      email: 'leave@alhakeem.com',
      passwordHash,
      name: 'مدير الإجازات',
      role: 'LEAVE_MANAGER',
      permissions: ['LEAVES_APPROVE', 'LEAVES_VIEW'],
    },
  });

  await prisma.user.upsert({
    where: { email: 'fingerprint@alhakeem.com' },
    update: { username: 'fingerprint' },
    create: {
      username: 'fingerprint',
      email: 'fingerprint@alhakeem.com',
      passwordHash,
      name: 'مسؤول البصمة',
      role: 'FINGERPRINT',
      permissions: ['FINGERPRINT_OFFICER', 'ABSENCES_CREATE', 'ABSENCES_CANCEL'],
    },
  });

  // ========== LEAVE TYPES ==========
  const leaveTypes = await prisma.leaveType.findMany();
  if (leaveTypes.length === 0) {
    await prisma.leaveType.createMany({
      data: [
        { name: 'Annual', nameAr: 'اعتيادية', deductFromBalance: true, requiresApproval: true, annualAllowance: 36, monthlyAccrual: 3 },
        { name: 'Sick', nameAr: 'مرضية', deductFromBalance: true, requiresApproval: true },
        { name: 'Emergency', nameAr: 'اضطرارية', deductFromBalance: true, requiresApproval: true },
        { name: 'Unpaid', nameAr: 'بدون راتب', deductFromBalance: false, requiresApproval: true },
        { name: 'TimeBased', nameAr: 'إجازة زمنية', deductFromBalance: true, requiresApproval: true },
      ],
    });
  }
  const allLeaveTypes = await prisma.leaveType.findMany();
  const hasTimeBased = allLeaveTypes.some((lt) => lt.name === 'TimeBased' || lt.nameAr === 'إجازة زمنية');
  if (!hasTimeBased) {
    await prisma.leaveType.create({
      data: { name: 'TimeBased', nameAr: 'إجازة زمنية', deductFromBalance: true, requiresApproval: true },
    });
  }

  // ========== DEPARTMENTS ==========
  const dept1 = await prisma.department.upsert({
    where: { code: 'MED' },
    update: {},
    create: { name: 'الطب الباطني', code: 'MED', description: 'قسم الطب الباطني' },
  });
  const dept2 = await prisma.department.upsert({
    where: { code: 'SURG' },
    update: {},
    create: { name: 'الجراحة', code: 'SURG', description: 'قسم الجراحة' },
  });
  const dept3 = await prisma.department.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: { name: 'الإدارة', code: 'ADMIN', description: 'الإدارة العامة' },
  });
  const dept4 = await prisma.department.upsert({
    where: { code: 'EMERG' },
    update: {},
    create: { name: 'الطوارئ', code: 'EMERG', description: 'قسم الطوارئ' },
  });

  // ========== EMPLOYEES ==========
  const emp1 = await prisma.employee.upsert({
    where: { id: 'seed-emp-1' },
    update: {},
    create: {
      id: 'seed-emp-1',
      fullName: 'أحمد محمد علي',
      jobTitle: 'طبيب اختصاص',
      departmentId: dept1.id,
      workType: 'MORNING',
      leaveBalance: 24,
    },
  });
  const emp2 = await prisma.employee.upsert({
    where: { id: 'seed-emp-2' },
    update: {},
    create: {
      id: 'seed-emp-2',
      fullName: 'فاطمة حسن',
      jobTitle: 'ممرضة',
      departmentId: dept1.id,
      workType: 'SHIFTS',
      leaveBalance: 18,
    },
  });
  const emp3 = await prisma.employee.upsert({
    where: { id: 'seed-emp-3' },
    update: {},
    create: {
      id: 'seed-emp-3',
      fullName: 'خالد عبدالله',
      jobTitle: 'جراح',
      departmentId: dept2.id,
      workType: 'MORNING',
      leaveBalance: 30,
    },
  });
  const emp4 = await prisma.employee.upsert({
    where: { id: 'seed-emp-4' },
    update: {},
    create: {
      id: 'seed-emp-4',
      fullName: 'سارة إبراهيم',
      jobTitle: 'موظفة إدارية',
      departmentId: dept3.id,
      workType: 'MORNING',
      leaveBalance: 21,
    },
  });
  const emp5 = await prisma.employee.upsert({
    where: { id: 'seed-emp-5' },
    update: {},
    create: {
      id: 'seed-emp-5',
      fullName: 'محمد عمر',
      jobTitle: 'طبيب طوارئ',
      departmentId: dept4.id,
      workType: 'SHIFTS',
      leaveBalance: 15,
    },
  });

  // ========== LEAVE REQUESTS ==========
  const ltAnnual = allLeaveTypes.find((l) => l.name === 'Annual') ?? allLeaveTypes[0];
  const ltSick = allLeaveTypes.find((l) => l.name === 'Sick') ?? allLeaveTypes[0];

  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 14);

  await prisma.leaveRequest.upsert({
    where: { id: 'seed-leave-1' },
    update: {},
    create: {
      id: 'seed-leave-1',
      employeeId: emp1.id,
      leaveTypeId: ltAnnual.id,
      startDate: nextWeek,
      endDate: new Date(nextWeek.getTime() + 3 * 24 * 60 * 60 * 1000),
      daysCount: 3,
      reason: 'إجازة عائلية',
      status: 'PENDING',
    },
  });

  await prisma.leaveRequest.upsert({
    where: { id: 'seed-leave-2' },
    update: {},
    create: {
      id: 'seed-leave-2',
      employeeId: emp2.id,
      leaveTypeId: ltSick.id,
      startDate: lastWeek,
      endDate: new Date(lastWeek.getTime() + 2 * 24 * 60 * 60 * 1000),
      daysCount: 2,
      reason: 'مرض',
      status: 'APPROVED',
      approvedBy: admin.id,
      approvedAt: new Date(),
    },
  });

  await prisma.leaveRequest.upsert({
    where: { id: 'seed-leave-3' },
    update: {},
    create: {
      id: 'seed-leave-3',
      employeeId: emp3.id,
      leaveTypeId: ltAnnual.id,
      startDate: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(today.getTime() - 25 * 24 * 60 * 60 * 1000),
      daysCount: 5,
      status: 'REJECTED',
      approvedBy: admin.id,
      approvedAt: new Date(),
    },
  });

  // ========== ABSENCES ==========
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  await prisma.absence.upsert({
    where: { id: 'seed-abs-1' },
    update: {},
    create: {
      id: 'seed-abs-1',
      employeeId: emp4.id,
      date: yesterday,
      reason: 'تأخر عن الدوام',
      status: 'RECORDED',
      recordedBy: admin.id,
    },
  });

  await prisma.absence.upsert({
    where: { id: 'seed-abs-2' },
    update: {},
    create: {
      id: 'seed-abs-2',
      employeeId: emp5.id,
      date: today,
      reason: 'غياب بدون إبلاغ',
      status: 'RECORDED',
      recordedBy: admin.id,
    },
  });

  // ========== HOLIDAYS ==========
  const holidaysData = [
    { name: 'Eid Al-Fitr', nameAr: 'عيد الفطر', date: new Date(today.getFullYear(), 2, 10) },
    { name: 'Eid Al-Adha', nameAr: 'عيد الأضحى', date: new Date(today.getFullYear(), 5, 16) },
    { name: 'National Day', nameAr: 'العيد الوطني', date: new Date(today.getFullYear(), 8, 23) },
    { name: 'New Year', nameAr: 'رأس السنة', date: new Date(today.getFullYear(), 0, 1) },
  ];

  for (const h of holidaysData) {
    const existing = await prisma.holiday.findFirst({ where: { nameAr: h.nameAr, date: h.date } });
    if (!existing) {
      await prisma.holiday.create({ data: { ...h, appliesTo: 'ALL' } });
    }
  }

  // ========== WORK SCHEDULES ==========
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  for (const emp of [emp2, emp5]) {
    if (emp.workType === 'SHIFTS') {
      await prisma.workSchedule.upsert({
        where: { employeeId_year_month: { employeeId: emp.id, year, month } },
        update: {},
        create: {
          employeeId: emp.id,
          year,
          month,
          workType: 'SHIFTS',
          daysOfWeek: '0,1,2,3,4,5,6',
          startTime: '08:00',
          endTime: '20:00',
          breakStart: '12:00',
          breakEnd: '13:00',
        },
      });
    }
  }

  console.log('✅ Seed completed successfully');
  console.log('');
  console.log('📋 بيانات الاختبار:');
  console.log('   مستخدمون (كلمة المرور: admin123):');
  console.log('   - admin@alhakeem.com (مدير النظام)');
  console.log('   - leave@alhakeem.com (مدير الإجازات)');
  console.log('   - fingerprint@alhakeem.com (مسؤول البصمة)');
  console.log('');
  console.log('   أقسام: الطب الباطني، الجراحة، الإدارة، الطوارئ');
  console.log('   موظفون: 5 موظفين');
  console.log('   طلبات إجازات: 3 (قيد الانتظار، معتمدة، مرفوضة)');
  console.log('   غيابات: 2');
  console.log('   عطل: 4');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
