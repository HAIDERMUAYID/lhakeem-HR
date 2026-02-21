import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const list = await prisma.employeeFingerprint.findMany({
      where: { userId },
      include: { device: { select: { id: true, name: true, code: true } } },
      orderBy: { device: { name: 'asc' } },
    });
    return NextResponse.json(list);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch fingerprints' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const body = await request.json();
    const { deviceId, fingerprintId } = body;

    const fid = typeof fingerprintId === 'string' ? fingerprintId.trim() : String(fingerprintId ?? '').trim();
    if (!deviceId || !fid) {
      return NextResponse.json(
        { error: 'جهاز الحضور ومعرف البصمة مطلوبان' },
        { status: 400 }
      );
    }

    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device || !device.isActive) {
      return NextResponse.json({ error: 'الجهاز غير موجود أو غير مفعّل' }, { status: 400 });
    }

    const existing = await prisma.employeeFingerprint.findUnique({
      where: { deviceId_fingerprintId: { deviceId, fingerprintId: fid } },
      include: { user: { select: { name: true } } },
    });
    if (existing) {
      if (existing.userId === userId) {
        return NextResponse.json(
          { error: 'هذا الموظف مسجّل بالفعل بهذا المعرف على هذا الجهاز' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: `معرف البصمة "${fid}" مستخدم على هذا الجهاز للموظف: ${existing.user.name}. اختر معرفاً آخر.` },
        { status: 409 }
      );
    }

    const record = await prisma.employeeFingerprint.create({
      data: { userId, deviceId, fingerprintId: fid },
      include: { device: { select: { id: true, name: true, code: true } } },
    });
    return NextResponse.json(record);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to add fingerprint' }, { status: 500 });
  }
}
