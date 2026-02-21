import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { startOfDay } from 'date-fns';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');

  if (!startDateStr || !endDateStr) {
    return NextResponse.json(
      { error: 'startDate and endDate are required (yyyy-MM-dd)' },
      { status: 400 }
    );
  }

  const startDate = startOfDay(new Date(startDateStr));
  const endDate = startOfDay(new Date(endDateStr));

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: 'Invalid dates' }, { status: 400 });
  }

  try {
    const where: { date: { gte: Date; lte: Date }; userId?: string } = {
      date: { gte: startDate, lte: endDate },
    };
    if (userId) where.userId = userId;

    const logs = await prisma.attendanceLog.findMany({
      where,
      select: { status: true, userId: true, date: true },
    });

    const present = logs.filter((l) => l.status === 'PRESENT').length;
    const absent = logs.filter((l) => l.status === 'ABSENT').length;
    const restDay = logs.filter((l) => l.status === 'REST_DAY').length;
    const leave = logs.filter((l) => l.status === 'LEAVE').length;
    const unexcused = logs.filter((l) => l.status === 'UNEXCUSED').length;

    return NextResponse.json({
      totalRecords: logs.length,
      present,
      absent,
      restDay,
      leave,
      unexcused,
      totalAbsences: absent + unexcused,
    });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch report' }, { status: 500 });
  }
}
