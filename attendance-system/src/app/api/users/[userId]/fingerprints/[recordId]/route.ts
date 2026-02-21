import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string; recordId: string }> }
) {
  try {
    const { userId, recordId } = await params;
    const record = await prisma.employeeFingerprint.findFirst({
      where: { id: recordId, userId },
    });
    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }
    await prisma.employeeFingerprint.delete({ where: { id: recordId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to delete fingerprint' }, { status: 500 });
  }
}
