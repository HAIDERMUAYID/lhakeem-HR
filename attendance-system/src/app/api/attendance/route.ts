import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { startOfDay } from 'date-fns';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, date, status, checkInTime, checkOutTime, notes } = body;

    if (!userId || !date || !status) {
      return NextResponse.json(
        { error: 'userId, date, and status are required' },
        { status: 400 }
      );
    }

    const validStatuses = ['PRESENT', 'ABSENT', 'REST_DAY', 'LEAVE', 'UNEXCUSED'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }

    const log = await prisma.attendanceLog.upsert({
      where: {
        userId_date: { userId, date: startOfDay(dateObj) },
      },
      create: {
        userId,
        date: startOfDay(dateObj),
        status,
        checkInTime: status === 'PRESENT' ? checkInTime ?? null : null,
        checkOutTime: status === 'PRESENT' ? checkOutTime ?? null : null,
        notes: notes ?? null,
      },
      update: {
        status,
        checkInTime: status === 'PRESENT' ? checkInTime ?? null : null,
        checkOutTime: status === 'PRESENT' ? checkOutTime ?? null : null,
        notes: notes ?? null,
      },
    });

    return NextResponse.json(log);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to save attendance' }, { status: 500 });
  }
}
