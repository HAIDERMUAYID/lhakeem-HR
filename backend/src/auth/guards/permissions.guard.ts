import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS } from '../permissions';

export const PERMISSIONS_KEY = 'permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions?.length) return true;

    const { user } = context.switchToHttp().getRequest();
    const userPerms: string[] = user?.permissions ?? [];

    // صلاحية ADMIN تعطي كل شيء
    if (userPerms.includes(PERMISSIONS.ADMIN)) return true;

    return requiredPermissions.some((p) => userPerms.includes(p));
  }
}
