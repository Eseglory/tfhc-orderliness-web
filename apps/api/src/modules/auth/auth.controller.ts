import { LoginDto, RegisterDto, AcceptInviteDto } from './auth.dto';
import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '@tfhc/shared';

// Relaxed only for automated test runs; see app.module.ts.
const loginThrottle = { default: { limit: process.env.NODE_ENV !== 'production' && process.env.DISABLE_RATE_LIMIT === 'true' ? 100000 : 10, ttl: 60000 } };

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('register')
  async register(@Body() body: RegisterDto) {
    return this.authService.registerUser(body);
  }

  @Throttle(loginThrottle)
  @Post('login')
  async login(@Body() body: LoginDto) {
    return this.authService.loginUser(body);
  }

  // Not throttled as tightly as password login: the guessable secret here is
  // a Google-signed ID token, not a password, so brute force isn't a realistic
  // attack surface — the global per-IP limit above still applies.
  @Post('google/member')
  async googleMemberLogin(@Body() body: { idToken: string }) {
    return this.authService.loginMemberWithGoogle(body.idToken);
  }

  @Throttle(loginThrottle)
  @Post('accept-invite')
  async acceptInvite(@Body() body: AcceptInviteDto) {
    return this.authService.acceptInvite(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@CurrentUser() user: any) {
    return user;
  }
}
