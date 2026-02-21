import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const devices = await prisma.device.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(devices);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch devices' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, code, location, isActive } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'اسم الجهاز مطلوب' }, { status: 400 });
    }

    const device = await prisma.device.create({
      data: {
        name: name.trim(),
        code: code?.trim() || null,
        location: location?.trim() || null,
        isActive: isActive !== false,
      },
    });
    return NextResponse.json(device);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to create device' }, { status: 500 });
  }
}
