import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        jobTitle: true,
        managerId: true,
        manager: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(users);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, jobTitle, managerId } = body;

    if (!name || !email || !jobTitle) {
      return NextResponse.json({ error: 'Name, email, and job title are required' }, { status: 400 });
    }

    const user = await prisma.user.create({
      data: {
        name,
        email,
        jobTitle,
        managerId: managerId || null,
      },
    });
    return NextResponse.json(user);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
