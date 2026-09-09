import { Module } from '@nestjs/common';
import { FinanceController, MemberFinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { ExpensesService } from './expenses.service';
import { PaymentAccountsService } from './payment-accounts.service';
import { DuesService } from './dues.service';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [FinanceController, MemberFinanceController],
  providers: [FinanceService, ExpensesService, PaymentAccountsService, DuesService, PaymentsService],
  exports: [DuesService],
})
export class FinanceModule {}
