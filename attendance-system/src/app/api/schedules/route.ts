import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }
  try {
    const schedules = await prisma.workSchedule.findMany({
      where: { userId },
      orderBy: { dayOfWeek: 'asc' },
    });
    return NextResponse.json(schedules);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { userId, dayOfWeek, startTime, endTime } = body;

    if (userId == null || dayOfWeek == null || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'userId, dayOfWeek, startTime, and endTime are required' },
        { status: 400 }
      );
    }

    const schedule = await prisma.workSchedule.upsert({
      where: {
        userId_dayOfWeek: { userId, dayOfWeek: Number(dayOfWeek) },
      },
      create: { userId, dayOfWeek: Number(dayOfWeek), startTime, endTime },
      update: { startTime, endTime },
    });
    return NextResponse.json(schedule);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to save schedule' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const dayOfWeek = searchParams.get('dayOfWeek');

  if (!userId || dayOfWeek == null) {
    return NextResponse.json({ error: 'userId and dayOfWeek are required' }, { status: 400 });
  }

  try {
    await prisma.workSchedule.deleteMany({
      where: { userId, dayOfWeek: Number(dayOfWeek) },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to delete schedule' }, { status: 500 });
  }
}
