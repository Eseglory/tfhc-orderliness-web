import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ExpensesService } from './expenses.service';
import { PaymentAccountsService } from './payment-accounts.service';
import { DuesService } from './dues.service';
import { DuesImportService } from './dues-import.service';
import { PaymentsService } from './payments.service';
import { FinanceService } from './finance.service';

@Controller('finance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly expenses: ExpensesService,
    private readonly accounts: PaymentAccountsService,
    private readonly dues: DuesService,
    private readonly duesImport: DuesImportService,
    private readonly payments: PaymentsService,
  ) {}

  @Post('dues/import')
  @RequirePermissions('dues.create')
  importDuesMatrix(@Body() body: any, @CurrentUser('userId') userId: string) {
    return this.duesImport.importMatrix(body, userId, body?.apply === true);
  }

  // ---- Dashboard -----------------------------------------------------------
  @Get('dashboard')
  @RequirePermissions('reports.view', 'expenses.read')
  dashboard() {
    return this.finance.dashboard();
  }

  // ---- Expense categories -------------------------------------------------
  @Get('expense-categories')
  @RequirePermissions('expenses.read')
  expenseCategories() {
    return this.expenses.categories();
  }

  // ---- Expenses ---------------------------------------------------------
  @Get('expenses')
  @RequirePermissions('expenses.read')
  listExpenses(
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
  ) {
    return this.expenses.list({ status, categoryId, from, to, search });
  }

  @Get('expenses/:id')
  @RequirePermissions('expenses.read')
  getExpense(@Param('id') id: string) {
    return this.expenses.getOne(id);
  }

  @Post('expenses')
  @RequirePermissions('expenses.create')
  createExpense(@Body() body: any, @CurrentUser('userId') userId: string) {
    return this.expenses.create(userId, body);
  }

  @Patch('expenses/:id')
  @RequirePermissions('expenses.update')
  updateExpense(@Param('id') id: string, @Body() body: any, @CurrentUser('userId') userId: string) {
    return this.expenses.update(id, userId, body);
  }

  @Post('expenses/:id/submit')
  @RequirePermissions('expenses.create')
  submitExpense(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.expenses.submit(id, userId);
  }

  @Post('expenses/:id/pay')
  @RequirePermissions('expenses.approve')
  payExpense(@Param('id') id: string, @Body() body: any, @CurrentUser('userId') userId: string) {
    return this.expenses.markPaid(id, userId, body ?? {});
  }

  @Post('expenses/:id/cancel')
  @RequirePermissions('expenses.delete')
  cancelExpense(@Param('id') id: string, @Body() body: { reason?: string }, @CurrentUser('userId') userId: string) {
    return this.expenses.cancel(id, userId, body?.reason);
  }

  // ---- Payment accounts -----------------------------------------------
  @Get('payment-accounts')
  @RequirePermissions('payments.read')
  listAccounts() {
    return this.accounts.list(false);
  }

  @Post('payment-accounts')
  @RequirePermissions('payments.configure')
  createAccount(@Body() body: any, @CurrentUser('userId') userId: string) {
    return this.accounts.create(body, userId);
  }

  @Patch('payment-accounts/:id')
  @RequirePermissions('payments.configure')
  updateAccount(@Param('id') id: string, @Body() body: any, @CurrentUser('userId') userId: string) {
    return this.accounts.update(id, body, userId);
  }

  @Delete('payment-accounts/:id')
  @RequirePermissions('payments.configure')
  deleteAccount(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.accounts.remove(id, userId);
  }

  // ---- Dues (admin) -----------------------------------------------------
  @Get('dues/periods')
  @RequirePermissions('dues.read')
  listPeriods() {
    return this.dues.listPeriods();
  }

  @Post('dues/periods')
  @RequirePermissions('dues.create')
  createPeriod(@Body() body: any, @CurrentUser('userId') userId: string) {
    return this.dues.createPeriod(body, userId);
  }

  @Get('dues/periods/:id')
  @RequirePermissions('dues.read')
  getPeriod(@Param('id') id: string) {
    return this.dues.getPeriod(id);
  }

  @Post('dues/periods/:id/generate')
  @RequirePermissions('dues.create')
  generate(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.dues.generateAssignments(id, userId);
  }

  @Post('dues/periods/:id/toggle-status')
  @RequirePermissions('dues.update')
  togglePeriod(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.dues.closePeriod(id, userId);
  }

  @Post('dues/assignments/:id/status')
  @RequirePermissions('dues.update')
  assignmentStatus(@Param('id') id: string, @Body() body: any, @CurrentUser('userId') userId: string) {
    return this.dues.setAssignmentStatus(id, body, userId);
  }

  @Post('dues/assignments/:id/adjust')
  @RequirePermissions('dues.update')
  adjust(@Param('id') id: string, @Body() body: any, @CurrentUser('userId') userId: string) {
    return this.dues.adjustAmount(id, body, userId);
  }

  // ---- Payments (admin) ----------------------------------------------
  @Get('payments')
  @RequirePermissions('payments.read')
  listPayments(
    @Query('status') status?: string,
    @Query('purpose') purpose?: string,
    @Query('memberId') memberId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.payments.list({ status, purpose, memberId, from, to });
  }

  @Post('payments/record')
  @RequirePermissions('payments.manage')
  recordPayment(@Body() body: any, @CurrentUser('userId') userId: string) {
    return this.payments.record(userId, body);
  }

  @Post('payments/:id/confirm')
  @RequirePermissions('payments.manage')
  confirmPayment(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.payments.confirm(id, userId);
  }

  @Post('payments/:id/reject')
  @RequirePermissions('payments.manage')
  rejectPayment(@Param('id') id: string, @Body() body: { reason?: string }, @CurrentUser('userId') userId: string) {
    return this.payments.reject(id, userId, body?.reason);
  }
}

// ---------------------------------------------------------------------------
// Member-facing finance
// ---------------------------------------------------------------------------
@Controller('me/finance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MemberFinanceController {
  constructor(
    private readonly dues: DuesService,
    private readonly payments: PaymentsService,
    private readonly accounts: PaymentAccountsService,
  ) {}

  @Get('payment-accounts')
  paymentAccounts() {
    return this.accounts.list(true);
  }

  @Get('dues')
  myDues(@CurrentUser('memberId') memberId?: string) {
    return this.dues.myDues(memberId);
  }

  @Get('payments')
  myPayments(@CurrentUser('memberId') memberId?: string) {
    return this.payments.myPayments(memberId);
  }

  @Post('payments')
  declarePayment(
    @Body() body: any,
    @CurrentUser('memberId') memberId: string | undefined,
    @CurrentUser('userId') userId: string,
  ) {
    return this.payments.declare(memberId, userId, body);
  }
}
