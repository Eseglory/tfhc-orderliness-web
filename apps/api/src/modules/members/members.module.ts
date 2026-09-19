import { Module } from '@nestjs/common';
import { MembersService } from './members.service';
import { MemberImportService } from './member-import.service';
import { MembersController } from './members.controller';
import { LookupsModule } from '../lookups/lookups.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [LookupsModule, PushModule],
  providers: [MembersService, MemberImportService],
  controllers: [MembersController],
  exports: [MembersService],
})
export class MembersModule {}
