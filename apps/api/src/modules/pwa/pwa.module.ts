import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MembersModule } from '../members/members.module';
import { PwaService } from './pwa.service';
import { PwaController } from './pwa.controller';
@Module({ imports: [AuthModule, MembersModule], providers: [PwaService], controllers: [PwaController] })
export class PwaModule {}
