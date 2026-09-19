import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import {
  assertFinanceCrudAuthority,
  isEseosaGlory,
  isLoveth,
  isDaniel,
} from '../../common/rbac/authorization-rules';
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
  importDuesMatrix(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    assertFinanceCrudAuthority(user);
    return this.duesImport.importMatrix(body, user.userId, body?.apply === true);
  }

  // ---- Dashboard -----------------------------------------------------------
  @Get('dashboard')
  @RequirePermissions('reports.view', 'expenses.read')
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    assertFinanceCrudAuthority(user);
    return this.finance.dashboard();
  }

  // ---- Expense categories -------------------------------------------------
  @Get('expense-categories')
  @RequirePermissions('expenses.read')
  expenseCategories(@CurrentUser() user: AuthenticatedUser) {
    if (!isEseosaGlory(user.email) && !isLoveth(user.email)) {
      assertFinanceCrudAuthority(user);
    }
    return this.expenses.categories();
  }

  // ---- Expenses ---------------------------------------------------------
  @Get('expenses')
  @RequirePermissions('expenses.read')
  listExpenses(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
  ) {
    if (!isEseosaGlory(user.email) && !isLoveth(user.email) && !isDaniel(user.email)) {
      assertFinanceCrudAuthority(user);
    }
    return this.expenses.list({ status, categoryId, from, to, search });
  }

  @Get('expenses/:id')
  @RequirePermissions('expenses.read')
  getExpense(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!isEseosaGlory(user.email) && !isLoveth(user.email) && !isDaniel(user.email)) {
      assertFinanceCrudAuthority(user);
    }
    return this.expenses.getOne(id);
  }

  @Post('expenses')
  @RequirePermissions('expenses.create')
  createExpense(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    if (!isEseosaGlory(user.email) && !isLoveth(user.email)) {
      throw new ForbiddenException(
        'Only Eseosa Glory and Loveth are authorized to create expense requests.'
      );
    }
    return this.expenses.create(user.userId, body);
  }

  @Patch('expenses/:id')
  @RequirePermissions('expenses.update')
  updateExpense(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    assertFinanceCrudAuthority(user);
    return this.expenses.update(id, user.userId, body);
  }

  @Post('expenses/:id/submit')
  @RequirePermissions('expenses.create')
  submitExpense(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!isEseosaGlory(user.email) && !isLoveth(user.email)) {
      assertFinanceCrudAuthority(user);
    }
    return this.expenses.submit(id, user.userId);
  }

  @Post('expenses/:id/pay')
  @RequirePermissions('expenses.approve')
  async payExpense(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    const expense = await this.expenses.getOne(id);
    const createdByEmail = (expense as any).createdByUser?.email ?? (expense as any).createdBy;
    if (isLoveth(createdByEmail) && isLoveth(user.email)) {
      throw new ForbiddenException('Self-approval is not permitted for financial requests.');
    }
    if (isLoveth(createdByEmail) && !isEseosaGlory(user.email) && !isDaniel(user.email)) {
      throw new ForbiddenException(
        "Only Eseosa Glory and Daniel are authorized to approve Loveth's fund and expense requests."
      );
    }
    if (!isLoveth(createdByEmail) && !isEseosaGlory(user.email)) {
      assertFinanceCrudAuthority(user);
    }
    return this.expenses.markPaid(id, user.userId, body ?? {});
  }

  @Post('expenses/:id/cancel')
  @RequirePermissions('expenses.delete')
  cancelExpense(@Param('id') id: string, @Body() body: { reason?: string }, @CurrentUser() user: AuthenticatedUser) {
    if (!isEseosaGlory(user.email) && !isLoveth(user.email)) {
      assertFinanceCrudAuthority(user);
    }
    return this.expenses.cancel(id, user.userId, body?.reason);
  }

  // ---- Payment accounts -----------------------------------------------
  @Get('payment-accounts')
  @RequirePermissions('payments.read')
  listAccounts(@CurrentUser() user: AuthenticatedUser) {
    assertFinanceCrudAuthority(user);
    return this.accounts.list(false);
  }

  @Post('payment-accounts')
  @RequirePermissions('payments.configure')
  createAccount(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    assertFinanceCrudAuthority(user);
    return this.accounts.create(body, user.userId);
  }

  @Patch('payment-accounts/:id')
  @RequirePermissions('payments.configure')
  updateAccount(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    assertFinanceCrudAuthority(user);
    return this.accounts.update(id, body, user.userId);
  }

  @Delete('payment-accounts/:id')
  @RequirePermissions('payments.configure')
  deleteAccount(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertFinanceCrudAuthority(user);
    return this.accounts.remove(id, user.userId);
  }

  // ---- Dues (admin) -----------------------------------------------------
  @Get('dues/periods')
  @RequirePermissions('dues.read')
  listPeriods(@CurrentUser() user: AuthenticatedUser) {
    assertFinanceCrudAuthority(user);
    return this.dues.listPeriods();
  }

  @Get('dues/matrix')
  @RequirePermissions('dues.read')
  annualMatrix(@Query('year') year: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    assertFinanceCrudAuthority(user);
    const parsedYear = year ? parseInt(year, 10) : new Date().getFullYear();
    return this.dues.getAnnualMatrix(parsedYear);
  }

  @Post('dues/periods')
  @RequirePermissions('dues.create')
  createPeriod(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    assertFinanceCrudAuthority(user);
    return this.dues.createPeriod(body, user.userId);
  }

  @Get('dues/periods/:id')
  @RequirePermissions('dues.read')
  getPeriod(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertFinanceCrudAuthority(user);
    return this.dues.getPeriod(id);
  }

  @Post('dues/periods/:id/generate')
  @RequirePermissions('dues.create')
  generate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertFinanceCrudAuthority(user);
    return this.dues.generateAssignments(id, user.userId);
  }

  @Post('dues/periods/:id/toggle-status')
  @RequirePermissions('dues.update')
  togglePeriod(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertFinanceCrudAuthority(user);
    return this.dues.closePeriod(id, user.userId);
  }

  @Post('dues/assignments/:id/status')
  @RequirePermissions('dues.update')
  assignmentStatus(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    assertFinanceCrudAuthority(user);
    return this.dues.setAssignmentStatus(id, body, user.userId);
  }

  @Post('dues/assignments/:id/adjust')
  @RequirePermissions('dues.update')
  adjust(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    assertFinanceCrudAuthority(user);
    return this.dues.adjustAmount(id, body, user.userId);
  }

  // ---- Payments (admin) ----------------------------------------------
  @Get('payments')
  @RequirePermissions('payments.read')
  listPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('purpose') purpose?: string,
    @Query('memberId') memberId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    assertFinanceCrudAuthority(user);
    return this.payments.list({ status, purpose, memberId, from, to });
  }

  @Post('payments/record')
  @RequirePermissions('payments.manage')
  recordPayment(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    assertFinanceCrudAuthority(user);
    return this.payments.record(user.userId, body);
  }

  @Post('payments/:id/confirm')
  @RequirePermissions('payments.manage')
  confirmPayment(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertFinanceCrudAuthority(user);
    return this.payments.confirm(id, user.userId);
  }

  @Post('payments/:id/reject')
  @RequirePermissions('payments.manage')
  rejectPayment(@Param('id') id: string, @Body() body: { reason?: string }, @CurrentUser() user: AuthenticatedUser) {
    assertFinanceCrudAuthority(user);
    return this.payments.reject(id, user.userId, body?.reason);
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

  @Get('campaigns')
  myCampaigns(@CurrentUser('memberId') memberId?: string) {
    return this.dues.myCampaigns(memberId);
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
