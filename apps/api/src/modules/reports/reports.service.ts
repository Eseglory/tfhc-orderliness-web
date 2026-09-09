import { unitPolicy, validateUnitPolicy } from '../../common/unit-policy';
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MemberStatus } from '@tfhc/shared';
import * as ExcelJS from 'exceljs';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async settings() { return unitPolicy(this.prisma); }
  async updateSettings(body: any) { const value = validateUnitPolicy(body); await this.prisma.systemSetting.upsert({where:{key:'unit_policy'},create:{key:'unit_policy',value:JSON.stringify(value)},update:{value:JSON.stringify(value)}}); return value; }

  async getAnalytics(days: number) {
    if (![7, 30, 90, 365].includes(days)) throw new BadRequestException('Choose 7, 30, 90 or 365 days');
    const now = new Date();
    const since = new Date(now.getTime() - days * 86400000);
    const meetings = await this.prisma.meeting.findMany({
      where: { startTime: { gte: since, lte: now }, status: 'CLOSED' },
      select: { id: true, title: true, startTime: true, category: { select: { name: true } }, attendanceRecords: { select: { status: true } } },
      orderBy: { startTime: 'asc' },
    });
    const periodMeeting = { startTime: { gte: since, lte: now }, status: { not: 'CANCELLED' as const } };
    const [responses, excuses, members] = await Promise.all([
      this.prisma.eventResponse.groupBy({ by: ['attending'], where: { meeting: periodMeeting }, _count: { _all: true } }),
      this.prisma.absenceExcuse.groupBy({ by: ['status'], where: { meeting: periodMeeting }, _count: { _all: true } }),
      this.prisma.member.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const statuses: Record<string, number> = {};
    const categories: Record<string, { name: string; attended: number; absent: number; excused: number }> = {};
    const services = meetings.map(meeting => {
      let attended = 0, punctual = 0, absent = 0, excused = 0;
      for (const record of meeting.attendanceRecords) {
        statuses[record.status] = (statuses[record.status] || 0) + 1;
        if (['EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE'].includes(record.status)) attended++;
        if (['EARLY', 'ON_TIME'].includes(record.status)) punctual++;
        if (record.status === 'ABSENT') absent++;
        if (record.status === 'EXCUSED') excused++;
      }
      const group = categories[meeting.category.name] ||= { name: meeting.category.name, attended: 0, absent: 0, excused: 0 };
      group.attended += attended; group.absent += absent; group.excused += excused;
      return { id: meeting.id, title: meeting.title, date: meeting.startTime, attended, punctual, absent, excused };
    });
    const totals = services.reduce((sum, service) => ({ attended: sum.attended + service.attended, punctual: sum.punctual + service.punctual, absent: sum.absent + service.absent, excused: sum.excused + service.excused }), { attended: 0, punctual: 0, absent: 0, excused: 0 });
    const rate = (value: number, total: number) => total ? Math.round(value / total * 1000) / 10 : null;
    return { days, since, until: now, services, statuses, categories: Object.values(categories), totals,
      attendanceRate: rate(totals.attended, totals.attended + totals.absent), punctualityRate: rate(totals.punctual, totals.attended),
      responses: { attending: responses.find(r => r.attending)?._count._all || 0, notAttending: responses.find(r => !r.attending)?._count._all || 0 },
      excuses: Object.fromEntries(excuses.map(r => [r.status, r._count._all])), members: Object.fromEntries(members.map(r => [r.status, r._count._all])),
    };
  }

  async getUnitDashboardStats() {
    const [totalActiveMembers, meetingsHeld, summaries, activeFlagsCount, pendingExcusesCount] = await Promise.all([
      this.prisma.member.count({ where: { status: MemberStatus.ACTIVE } }),
      this.prisma.meeting.count({ where: { status: 'CLOSED' } }),
      this.prisma.meetingSummary.aggregate({ _avg: { attendanceRate: true, punctualityRate: true } }),
      this.prisma.followUpFlag.count({ where: { isResolved: false } }),
      this.prisma.absenceExcuse.count({ where: { status: 'PENDING' } }),
    ]);
    const avgAttendance = Math.round((summaries._avg.attendanceRate ?? 0) * 10) / 10;
    const avgPunctuality = Math.round((summaries._avg.punctualityRate ?? 0) * 10) / 10;

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

    const summaries = workbook.addWorksheet('Meeting Summaries');
    summaries.columns = [{header:'Meeting',key:'title',width:35},{header:'Date',key:'date',width:24},{header:'Expected',key:'expected'},{header:'Present',key:'present'},{header:'Absent',key:'absent'},{header:'Excused',key:'excused'},{header:'Attendance %',key:'attendance'},{header:'Punctuality %',key:'punctuality'}];
    const closed = await this.prisma.meeting.findMany({where:{status:'CLOSED'},include:{attendanceRecords:true},orderBy:{startTime:'desc'}});
    for (const meeting of closed) {
      const eligible = meeting.attendanceRecords.filter(r=>!['EXCUSED','EXEMPT'].includes(r.status));
      const present = eligible.filter(r=>['EARLY','ON_TIME','GRACE_PERIOD','LATE'].includes(r.status)).length;
      const punctual = eligible.filter(r=>['EARLY','ON_TIME'].includes(r.status)).length;
      summaries.addRow({title:meeting.title,date:meeting.startTime.toISOString(),expected:eligible.length,present,absent:eligible.filter(r=>r.status==='ABSENT').length,excused:meeting.attendanceRecords.filter(r=>r.status==='EXCUSED').length,attendance:eligible.length?present/eligible.length*100:0,punctuality:present?punctual/present*100:0});
    }
    const audit = workbook.addWorksheet('Audit Trail');
    audit.columns = [{header:'Recorded at',key:'date',width:25},{header:'Actor ID',key:'actor',width:38},{header:'Action',key:'action',width:35},{header:'Entity',key:'entity',width:25},{header:'Entity ID',key:'entityId',width:38},{header:'Reason',key:'reason',width:45},{header:'Previous values',key:'previous',width:50},{header:'New values',key:'next',width:50}];
    for (const entry of await this.prisma.auditLog.findMany({orderBy:{createdAt:'desc'}})) audit.addRow({date:entry.createdAt.toISOString(),actor:entry.actorUserId,action:entry.action,entity:entry.entity,entityId:entry.entityId,reason:entry.reason,previous:JSON.stringify(entry.previousData),next:JSON.stringify(entry.newData)});
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
