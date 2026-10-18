import { Module } from '@nestjs/common';
import { FinanceController, MemberFinanceController } from './finance.controller';
import { FinancialReportsController } from './financial-reports.controller';
import { FinanceService } from './finance.service';
import { ExpensesService } from './expenses.service';
import { PaymentAccountsService } from './payment-accounts.service';
import { DuesService } from './dues.service';
import { DuesImportService } from './dues-import.service';
import { PaymentsService } from './payments.service';
import { FinancialReportsService } from './financial-reports.service';
import { FinancialReportPdfService } from './financial-report-pdf.service';

@Module({
  controllers: [FinanceController, MemberFinanceController, FinancialReportsController],
  providers: [
    FinanceService,
    ExpensesService,
    PaymentAccountsService,
    DuesService,
    DuesImportService,
    PaymentsService,
    FinancialReportsService,
    FinancialReportPdfService,
  ],
  exports: [DuesService, FinancialReportsService, FinancialReportPdfService],
})
export class FinanceModule {}
