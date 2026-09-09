import { Module } from '@nestjs/common';
import { MembersService } from './members.service';
import { MemberImportService } from './member-import.service';
import { MembersController } from './members.controller';

@Module({
  providers: [MembersService, MemberImportService],
  controllers: [MembersController],
  exports: [MembersService],
})
export class MembersModule {}
