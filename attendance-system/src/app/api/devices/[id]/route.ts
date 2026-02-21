import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const device = await prisma.device.findUnique({
      where: { id },
      include: { fingerprints: { include: { user: { select: { name: true } } } } },
    });
    if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    return NextResponse.json(device);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch device' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, code, location, isActive } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'اسم الجهاز مطلوب' }, { status: 400 });
    }

    const device = await prisma.device.update({
      where: { id },
      data: {
        name: name.trim(),
        code: code?.trim() ?? undefined,
        location: location?.trim() ?? undefined,
        isActive: isActive !== false,
      },
    });
    return NextResponse.json(device);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to update device' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const device = await prisma.device.findUnique({
      where: { id },
      include: { _count: { select: { fingerprints: true } } },
    });
    if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    if (device._count.fingerprints > 0) {
      return NextResponse.json(
        { error: 'لا يمكن حذف الجهاز لأنه مرتبط ببصمات موظفين. أزل البصمات أولاً.' },
        { status: 400 }
      );
    }
    await prisma.device.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to delete device' }, { status: 500 });
  }
}
