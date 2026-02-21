import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { startOfDay } from 'date-fns';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const dateStr = searchParams.get('date');

  if (!userId || !dateStr) {
    return NextResponse.json({ error: 'userId and date are required' }, { status: 400 });
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  const dayOfWeek = date.getDay();

  try {
    const [schedule, approvedLeaves, existingLog] = await Promise.all([
      prisma.workSchedule.findUnique({
        where: { userId_dayOfWeek: { userId, dayOfWeek } },
      }),
      prisma.leaveRequest.findMany({
        where: {
          userId,
          status: 'APPROVED',
          startDate: { lte: date },
          endDate: { gte: date },
        },
      }),
      prisma.attendanceLog.findUnique({
        where: { userId_date: { userId, date: startOfDay(date) } },
      }),
    ]);

    const hasLeave = approvedLeaves.length > 0;

    return NextResponse.json({
      schedule: schedule ? { startTime: schedule.startTime, endTime: schedule.endTime } : null,
      hasLeave,
      existingLog: existingLog
        ? {
            status: existingLog.status,
            checkInTime: existingLog.checkInTime,
            checkOutTime: existingLog.checkOutTime,
            notes: existingLog.notes,
          }
        : null,
    });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to check attendance' }, { status: 500 });
  }
}
