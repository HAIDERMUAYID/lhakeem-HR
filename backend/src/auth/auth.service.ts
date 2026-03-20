import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Request } from 'express';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private audit: AuditService,
  ) {}

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    req?: Pick<Request, 'headers' | 'socket'>,
  ) {
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
    }
    const user = await this.usersService.findByIdWithPassword(userId);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException();
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException('كلمة المرور الحالية غير صحيحة');
    }
    await this.usersService.updatePassword(userId, newPassword);
    await this.audit.log({
      userId,
      action: 'PASSWORD_CHANGE',
      entity: 'Auth',
      details: { ok: true },
      ipAddress: req ? AuditService.clientIp(req) : undefined,
      userAgent: req ? AuditService.clientUserAgent(req) : undefined,
    });
    return { message: 'تم تغيير كلمة المرور بنجاح' };
  }

  async validateUser(login: string, password: string) {
    const user = await this.usersService.findByLogin(login);
    if (!user?.passwordHash) return null;
    let valid = false;
    try {
      valid = await bcrypt.compare(password, user.passwordHash);
    } catch {
      return null;
    }
    if (!valid) return null;
    const { passwordHash, ...result } = user;
    return result;
  }

  async login(username: string, password: string, req?: Pick<Request, 'headers' | 'socket'>) {
    const ip = req ? AuditService.clientIp(req) : undefined;
    const ua = req ? AuditService.clientUserAgent(req) : undefined;

    const user = await this.validateUser(username, password);
    if (!user) {
      await this.audit.log({
        userId: null,
        action: 'LOGIN_FAILED',
        entity: 'Auth',
        details: { username, reason: 'اسم المستخدم أو كلمة المرور غير صحيحة' },
        ipAddress: ip,
        userAgent: ua,
      });
      throw new UnauthorizedException('اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    if (!user.isActive) {
      await this.audit.log({
        userId: user.id,
        action: 'LOGIN_FAILED',
        entity: 'Auth',
        details: { username, reason: 'الحساب غير مفعّل' },
        ipAddress: ip,
        userAgent: ua,
      });
      throw new UnauthorizedException('الحساب غير مفعّل');
    }

    await this.audit.log({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      entity: 'Auth',
      details: {
        username: user.username,
        name: user.name,
        role: user.role,
      },
      ipAddress: ip,
      userAgent: ua,
    });

    return {
      access_token: this.jwtService.sign({
        sub: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions ?? [],
      }),
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        phone: user.phone ?? undefined,
        jobCode: user.jobCode ?? undefined,
        role: user.role,
        permissions: user.permissions ?? [],
        departmentId: user.departmentId,
      },
    };
  }
}
