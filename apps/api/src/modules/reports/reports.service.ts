import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MemberStatus } from '@tfhc/shared';
import * as ExcelJS from 'exceljs';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getUnitDashboardStats() {
    const totalActiveMembers = await this.prisma.member.count({
      where: { status: MemberStatus.ACTIVE },
    });

    const meetingsHeld = await this.prisma.meeting.count({
      where: { status: 'CLOSED' },
    });

    const summaries = await this.prisma.meetingSummary.findMany();

    const avgAttendance = summaries.length
      ? Math.round(
          (summaries.reduce((sum, s) => sum + s.attendanceRate, 0) / summaries.length) * 10
        ) / 10
      : 0;

    const avgPunctuality = summaries.length
      ? Math.round(
          (summaries.reduce((sum, s) => sum + s.punctualityRate, 0) / summaries.length) * 10
        ) / 10
      : 0;

    const activeFlagsCount = await this.prisma.followUpFlag.count({
      where: { isResolved: false },
    });

    const pendingExcusesCount = await this.prisma.absenceExcuse.count({
      where: { status: 'PENDING' },
    });

    return {
      totalActiveMembers,
      meetingsHeld,
      avgAttendance,
      avgPunctuality,
      activeFlagsCount,
      pendingExcusesCount,
    };
  }

  async generateExcelReport(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TFHC Orderliness System';
    workbook.created = new Date();

    // Sheet 1: Attendance Records
    const sheetRecords = workbook.addWorksheet('Attendance Records');
    sheetRecords.columns = [
      { header: 'Member Code', key: 'memberCode', width: 15 },
      { header: 'Member Name', key: 'memberName', width: 25 },
      { header: 'Sub-Team', key: 'subTeam', width: 20 },
      { header: 'Meeting Title', key: 'meetingTitle', width: 30 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Arrival Time', key: 'arrivalTime', width: 20 },
      { header: 'Method', key: 'method', width: 20 },
      { header: 'Points', key: 'points', width: 10 },
    ];

    const records = await this.prisma.attendanceRecord.findMany({
      include: {
        member: { include: { subTeam: true } },
        meeting: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    for (const r of records) {
      sheetRecords.addRow({
        memberCode: r.member.memberCode,
        memberName: `${r.member.firstName} ${r.member.lastName}`,
        subTeam: r.member.subTeam?.name || 'Unassigned',
        meetingTitle: r.meeting.title,
        date: r.meeting.meetingDate.toISOString().split('T')[0],
        status: r.status,
        arrivalTime: r.actualArrivalTime ? r.actualArrivalTime.toISOString().split('T')[1].slice(0, 8) : 'N/A',
        method: r.method,
        points: r.pointsEarned,
      });
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
