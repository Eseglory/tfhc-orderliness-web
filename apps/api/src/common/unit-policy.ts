import { DEFAULT_SCORING_RUBRIC } from '@tfhc/shared';
import { BadRequestException } from '@nestjs/common';
export const DEFAULT_UNIT_POLICY = {...DEFAULT_SCORING_RUBRIC, attendanceWeight:0.6, punctualityWeight:0.4, followUpAbsences:2, warningAbsences:3, reviewAttendanceBelow:70, minimumMeetings:5, rewardAttendance:100, rewardPunctuality:100};
export async function unitPolicy(prisma: any): Promise<typeof DEFAULT_UNIT_POLICY> {
  const saved = await prisma.systemSetting.findUnique({where:{key:'unit_policy'}});
  return {...DEFAULT_UNIT_POLICY,...(saved?.value ? JSON.parse(saved.value) : {})};
}
export function validateUnitPolicy(value: any) {
  if (!value || Object.keys(value).some(key=>!(key in DEFAULT_UNIT_POLICY))) throw new BadRequestException('Invalid settings');
  const policy = {...DEFAULT_UNIT_POLICY,...value};
  if (Object.values(policy).some(n=>typeof n !== 'number'||!Number.isFinite(n))) throw new BadRequestException('Settings must be valid numbers');
  if (Math.abs(policy.attendanceWeight+policy.punctualityWeight-1)>0.00001 || policy.attendanceWeight<0 || policy.punctualityWeight<0) throw new BadRequestException('Attendance and punctuality weights must total 1');
  for (const key of ['followUpAbsences','warningAbsences','minimumMeetings'] as const) if (!Number.isInteger(policy[key])||policy[key]<1) throw new BadRequestException('Meeting thresholds must be positive whole numbers');
  for (const key of ['reviewAttendanceBelow','rewardAttendance','rewardPunctuality'] as const) if (policy[key]<0||policy[key]>100) throw new BadRequestException('Percentage thresholds must be between 0 and 100');
  return policy;
}
