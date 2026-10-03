import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/user.decorator';
import { MeService } from './me.service';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private me: MeService) {}

  @Get()
  home(@CurrentUser() user: { id: string }, @Query('month') month?: string) {
    return this.me.home(user.id, month);
  }
}
