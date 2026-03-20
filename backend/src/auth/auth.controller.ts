import { Controller, Get, Post, Body, UseGuards, InternalServerErrorException, Req } from '@nestjs/common';
import { Request } from 'express';
import { IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/user.decorator';
import { PERMISSIONS, PERMISSION_LABELS, PERMISSION_DEPENDENCIES, PERMISSION_MODULES } from './permissions';

class LoginDto {
  @IsString()
  @MinLength(1, { message: 'اسم المستخدم مطلوب' })
  username: string;

  @IsString()
  @MinLength(1, { message: 'كلمة المرور مطلوبة' })
  password: string;
}

class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'كلمة المرور الحالية مطلوبة' })
  currentPassword: string;

  @IsString()
  @MinLength(6, { message: 'كلمة المرور الجديدة 6 أحرف على الأقل' })
  newPassword: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    try {
      return await this.authService.login(dto.username.trim(), dto.password, req);
    } catch (err) {
      if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: number }).statusCode === 401) {
        throw err;
      }
      console.error('[auth/login]', err);
      throw new InternalServerErrorException('خطأ داخلي في الخادم. تحقق من سجلات الـ API (Logs) على Render.');
    }
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: { id: string },
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    return this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword, req);
  }

  @Get('permissions')
  @UseGuards(JwtAuthGuard)
  listPermissions() {
    return {
      list: Object.entries(PERMISSION_LABELS).map(([code, label]) => ({ code, label })),
      dependencies: PERMISSION_DEPENDENCIES,
      modules: PERMISSION_MODULES,
    };
  }
}
