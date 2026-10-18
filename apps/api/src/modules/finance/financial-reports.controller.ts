import { Controller, Get, Query, Res, UseGuards, Header } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { assertClassOwnerAuthority } from '../../common/rbac/authorization-rules';
import { FinancialReportsService, ReportFilterDto } from './financial-reports.service';

@Controller('finance/reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FinancialReportsController {
  constructor(private readonly reportsService: FinancialReportsService) {}

  @Get('dashboard')
  async getDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportFilterDto,
  ) {
    assertClassOwnerAuthority(user);
    return this.reportsService.getDashboardMetrics(query);
  }

  @Get('annual')
  async getAnnualReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('year') year?: string,
  ) {
    assertClassOwnerAuthority(user);
    return this.reportsService.getAnnualReport(year);
  }

  @Get('members')
  async getMemberReports(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportFilterDto,
  ) {
    assertClassOwnerAuthority(user);
    return this.reportsService.getMemberPaymentReports(query);
  }

  @Get('freelance')
  async getFreelanceReports(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportFilterDto,
  ) {
    assertClassOwnerAuthority(user);
    return this.reportsService.getFreelanceReports(query);
  }

  @Get('transactions')
  async getTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportFilterDto,
  ) {
    assertClassOwnerAuthority(user);
    return this.reportsService.getDetailedTransactions(query);
  }

  @Get('pdf')
  @Header('Content-Type', 'application/pdf')
  async downloadPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportFilterDto,
    @Res() res: Response,
  ) {
    assertClassOwnerAuthority(user);
    const ownerName = user.email === 'engreseglory@gmail.com' ? 'Eseosa Glory (Platform Owner)' : `${user.email} (Authorized Owner)`;
    const pdfBuffer = await this.reportsService.generatePdf(query, ownerName);

    const year = query.year || new Date().getFullYear();
    const category = query.category || 'ANNUAL';
    let filename = `Annual_Financial_Report_${year}.pdf`;
    if (category === 'MONTHLY' && query.month) {
      filename = `Monthly_Transaction_Report_${year}-${String(query.month).padStart(2, '0')}.pdf`;
    } else if (category === 'MEMBER') {
      filename = `Member_Payment_Report_${year}.pdf`;
    } else if (category === 'FREELANCE') {
      filename = `Freelance_Payment_Report_${year}.pdf`;
    } else if (category === 'DETAILED') {
      filename = `Detailed_Transactions_${year}.pdf`;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  }
}
