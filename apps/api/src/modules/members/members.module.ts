import { Module } from '@nestjs/common';
import { MembersService } from './members.service';
import { MemberImportService } from './member-import.service';
import { MembersReportPdfService } from './members-report-pdf.service';
import { MembersReportExcelService } from './members-report-excel.service';
import { MembersController } from './members.controller';
import { LookupsModule } from '../lookups/lookups.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [LookupsModule, PushModule],
  providers: [
    MembersService,
    MemberImportService,
    MembersReportPdfService,
    MembersReportExcelService,
  ],
  controllers: [MembersController],
  exports: [MembersService, MembersReportPdfService, MembersReportExcelService],
})
export class MembersModule {}
