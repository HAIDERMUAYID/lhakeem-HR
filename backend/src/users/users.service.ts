import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PERMISSION_DEPENDENCIES } from '../auth/permissions';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { department: true },
    });
  }

  /** تسجيل الدخول: اسم مستخدم أو بريد إلكتروني (للتوافق مع البيانات القديمة) */
  async findByLogin(login: string) {
    const trimmed = login.trim().toLowerCase();
    return this.prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: login.trim(), mode: 'insensitive' } },
          ...(trimmed ? [{ email: trimmed }] : []),
        ],
      },
      include: { department: true },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        phone: true,
        jobCode: true,
        role: true,
        permissions: true,
        isActive: true,
        departmentId: true,
        department: { select: { id: true, name: true } },
        fingerprintDepartments: { select: { departmentId: true, department: { select: { id: true, name: true } } } },
      },
    });
    if (!user) return null;
    const { fingerprintDepartments, ...rest } = user;
    return {
      ...rest,
      assignedDepartmentIds: fingerprintDepartments?.map((fd) => fd.departmentId) ?? [],
      assignedDepartments: fingerprintDepartments?.map((fd) => fd.department) ?? [],
    };
  }

  async findOptionsForManager() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        phone: true,
        jobCode: true,
        role: true,
        permissions: true,
        departmentId: true,
        department: { select: { name: true } },
        fingerprintDepartments: { select: { departmentId: true, department: { select: { id: true, name: true } } } },
      },
      orderBy: { name: 'asc' },
    });
    return users.map((u) => {
      const { fingerprintDepartments, ...rest } = u;
      return {
        ...rest,
        assignedDepartmentIds: fingerprintDepartments?.map((fd) => fd.departmentId) ?? [],
        assignedDepartments: fingerprintDepartments?.map((fd) => fd.department) ?? [],
      };
    });
  }

  /** إضافة الصلاحيات المعتمدة عليها تلقائياً (مثلاً EMPLOYEES_MANAGE → EMPLOYEES_VIEW) */
  private expandWithDependencies(permissions: string[]): string[] {
    const set = new Set(permissions);
    let added = true;
    while (added) {
      added = false;
      for (const code of set) {
        const deps = PERMISSION_DEPENDENCIES[code];
        if (deps) for (const d of deps) if (!set.has(d)) { set.add(d); added = true; }
      }
    }
    return Array.from(set);
  }

  async updatePermissions(id: string, permissions: string[]) {
    const expanded = this.expandWithDependencies(permissions);
    return this.prisma.user.update({
      where: { id },
      data: { permissions: expanded },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        permissions: true,
      },
    });
  }

  async create(data: {
    username: string;
    email?: string;
    password: string;
    name: string;
    phone?: string;
    jobCode?: string;
    role: UserRole;
    departmentId?: string;
    assignedDepartmentIds?: string[];
  }) {
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        username: data.username.trim(),
        email: data.email?.trim() ? data.email.toLowerCase() : undefined,
        passwordHash,
        name: data.name,
        phone: data.phone?.trim() || undefined,
        jobCode: data.jobCode?.trim() || undefined,
        role: data.role,
        departmentId: data.departmentId,
      },
      select: { id: true, username: true, email: true, name: true, role: true, departmentId: true },
    });
    if (data.assignedDepartmentIds?.length) {
      await this.prisma.userDepartmentAssignment.createMany({
        data: data.assignedDepartmentIds.map((departmentId) => ({
          userId: user.id,
          departmentId,
        })),
        skipDuplicates: true,
      });
    }
    return user;
  }

  async findByIdWithPassword(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, passwordHash: true },
    });
  }

  async updatePassword(id: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
  }

  async getAssignedDepartmentIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.userDepartmentAssignment.findMany({
      where: { userId },
      select: { departmentId: true },
    });
    return rows.map((r) => r.departmentId);
  }

  /** أقسام يسمح للمستخدم برؤية جداول الدوام لها (null = الكل، [] = لا شيء) */
  async getScheduleAllowedDepartmentIds(
    userId: string,
    permissions?: string[],
  ): Promise<string[] | null> {
    if (permissions?.includes('ADMIN') || permissions?.includes('SCHEDULES_MANAGE')) {
      return null;
    }
    const [user, assigned, managed] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      }),
      this.prisma.userDepartmentAssignment.findMany({
        where: { userId },
        select: { departmentId: true },
      }),
      this.prisma.department.findMany({
        where: { managerUserId: userId, isActive: true },
        select: { id: true },
      }),
    ]);
    const ids = new Set<string>();
    if (user?.departmentId) ids.add(user.departmentId);
    assigned.forEach((r) => ids.add(r.departmentId));
    managed.forEach((d) => ids.add(d.id));
    return ids.size ? Array.from(ids) : [];
  }

  /** قائمة الأقسام المسموح للمستخدم بعرض جداول الدوام لها (للقائمة المنسدلة) */
  async getScheduleDepartmentsForUser(userId: string, permissions?: string[]) {
    const allowedIds = await this.getScheduleAllowedDepartmentIds(userId, permissions);
    const departments = await this.prisma.department.findMany({
      where: allowedIds === null ? { isActive: true } : { id: { in: allowedIds }, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return {
      departmentIds: departments.map((d) => d.id),
      departments,
    };
  }

  async setAssignedDepartments(userId: string, departmentIds: string[]) {
    await this.prisma.userDepartmentAssignment.deleteMany({ where: { userId } });
    if (departmentIds.length) {
      await this.prisma.userDepartmentAssignment.createMany({
        data: departmentIds.map((departmentId) => ({ userId, departmentId })),
        skipDuplicates: true,
      });
    }
    return this.getAssignedDepartmentIds(userId);
  }

  async update(
    id: string,
    data: Partial<{
      email: string;
      name: string;
      role: UserRole;
      departmentId: string | null;
      assignedDepartmentIds: string[];
    }>,
  ) {
    const { assignedDepartmentIds, ...rest } = data;
    const updateData: Record<string, unknown> = { ...rest };
    if (data.email) updateData.email = data.email.toLowerCase();
    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, departmentId: true },
    });
    if (assignedDepartmentIds !== undefined) {
      await this.setAssignedDepartments(id, assignedDepartmentIds);
    }
    return user;
  }
}
