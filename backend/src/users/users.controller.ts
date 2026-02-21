import { Controller, Get, Post, Put, Body, Param, UseGuards, ConflictException } from '@nestjs/common';
import { IsString, IsOptional, IsArray, MinLength, IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { PERMISSIONS } from '../auth/permissions';

class CreateUserDto {
  @IsString()
  @MinLength(2, { message: 'اسم المستخدم حرفان على الأقل' })
  username: string;

  @IsString()
  @MinLength(6, { message: 'كلمة المرور 6 أحرف على الأقل' })
  password: string;

  @IsString()
  @MinLength(2, { message: 'الاسم مطلوب' })
  name: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  jobCode?: string;

  @IsEnum(UserRole, { message: 'الدور غير صالح' })
  role: UserRole;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedDepartmentIds?: string[];
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  async create(@Body() dto: CreateUserDto) {
    const existing = await this.usersService.findByLogin(dto.username.trim());
    if (existing) {
      throw new ConflictException('اسم المستخدم مستخدم مسبقاً');
    }
    return this.usersService.create({
      username: dto.username.trim(),
      email: dto.email?.trim() || undefined,
      password: dto.password,
      name: dto.name.trim(),
      phone: dto.phone?.trim() || undefined,
      jobCode: dto.jobCode?.trim() || undefined,
      role: dto.role,
      departmentId: dto.departmentId || undefined,
      assignedDepartmentIds: dto.assignedDepartmentIds?.length ? dto.assignedDepartmentIds : undefined,
    });
  }

  @Get('options')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.EMPLOYEES_VIEW, PERMISSIONS.EMPLOYEES_MANAGE)
  async options() {
    return this.usersService.findOptionsForManager();
  }

  @Get('me/department-assignments')
  async getMyDepartmentAssignments(@CurrentUser() user: { id: string }) {
    const ids = await this.usersService.getAssignedDepartmentIds(user.id);
    return { departmentIds: ids };
  }

  @Get('me/schedule-departments')
  async getMyScheduleDepartments(@CurrentUser() user: { id: string; permissions?: string[] }) {
    return this.usersService.getScheduleDepartmentsForUser(user.id, user.permissions);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  async findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  async findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Put(':id/permissions')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  async updatePermissions(
    @Param('id') id: string,
    @Body() body: { permissions: string[] },
  ) {
    return this.usersService.updatePermissions(id, body.permissions ?? []);
  }

  @Put(':id/department-assignments')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  async setUserDepartmentAssignments(
    @Param('id') id: string,
    @Body() body: { departmentIds: string[] },
  ) {
    return this.usersService.setAssignedDepartments(id, body.departmentIds ?? []);
  }
}
