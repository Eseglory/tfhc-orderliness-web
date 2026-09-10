import {
  LoginDto,
  RegisterDto,
  AcceptInviteDto,
  VerifyEmailDto,
  EmailOnlyDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './auth.dto';
import { Controller, Post, Body, Get, HttpCode, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// Relaxed only for automated test runs; see app.module.ts.
const authThrottle = { default: { limit: process.env.NODE_ENV !== 'production' && process.env.DISABLE_RATE_LIMIT === 'true' ? 100000 : 10, ttl: 60000 } };

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Throttle(authThrottle)
  @Post('register')
  async register(@Body() body: RegisterDto) {
    return this.authService.registerUser(body);
  }

  @Throttle(authThrottle)
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() body: VerifyEmailDto) {
    return this.authService.verifyEmail(body);
  }

  @Throttle(authThrottle)
  @Post('resend-verification')
  @HttpCode(200)
  async resendVerification(@Body() body: EmailOnlyDto) {
    return this.authService.resendVerification(body);
  }

  @Throttle(authThrottle)
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() body: EmailOnlyDto) {
    return this.authService.forgotPassword(body);
  }

  @Throttle(authThrottle)
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(200)
  async changePassword(@CurrentUser('userId') userId: string, @Body() body: ChangePasswordDto) {
    return this.authService.changePassword(userId, body);
  }

  @Throttle(authThrottle)
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

  @Throttle(authThrottle)
  @Post('accept-invite')
  async acceptInvite(@Body() body: AcceptInviteDto) {
    return this.authService.acceptInvite(body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser('userId') userId: string) {
    return this.authService.logout(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@CurrentUser() user: any) {
    return user;
  }
}
