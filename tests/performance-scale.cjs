// Representative synthetic workload. Never points at Supabase or production.
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const database = process.env.TEST_DATABASE_URL;
if (!/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/tfhc_e2e(?:\?|$)/.test(database || '')) throw new Error('Use an isolated local tfhc_e2e database');
async function main() {
  const db = new PrismaClient({ datasources: { db: { url: database } } });
  const run = randomUUID();
  const categoryId = randomUUID();
  const members = Array.from({length:1000},(_,i)=>({id:randomUUID(),memberCode:`LOAD-${run}-${i}`,firstName:'Load',lastName:`Member ${i}`,phoneNumber:'08000000000',status:'ACTIVE'}));
  const meetings = Array.from({length:52},(_,i)=> {
    const at = new Date(Date.UTC(2025,0,5+i*7,9));
    return {id:randomUUID(),categoryId,title:`Load ${run} ${i}`,meetingDate:at,startTime:at,expectedArrivalTime:at,attendanceOpenTime:at,attendanceCloseTime:at,locationName:'Synthetic venue',latitude:6.5,longitude:3.3,status:'CLOSED'};
  });
  try {
    await db.meetingCategory.create({data:{id:categoryId,name:`Load ${run}`}});
    await db.member.createMany({data:members});
    await db.meeting.createMany({data:meetings});
    let batch=[];
    for (const [i,member] of members.entries()) for (const [j,meeting] of meetings.entries()) {
      const absent=(i+j)%5===0;
      batch.push({memberId:member.id,meetingId:meeting.id,expectedArrivalTime:meeting.startTime,actualArrivalTime:absent?null:meeting.startTime,status:absent?'ABSENT':'ON_TIME',pointsEarned:absent?0:10,method:'MANUAL'});
      if(batch.length===1000){await db.attendanceRecord.createMany({data:batch});batch=[];}
    }
    if(batch.length)await db.attendanceRecord.createMany({data:batch});
    console.log('Added 1,000 synthetic members, 52 meetings, and 52,000 attendance records.');
    const result=spawnSync(process.execPath,[path.join(__dirname,'performance-smoke.cjs')],{env:process.env,stdio:'inherit'});
    if(result.status!==0)throw new Error('Scale workload failed');
  } finally {
    // Delete only this run's generated IDs; normal browser fixtures are preserved.
    await db.meeting.deleteMany({where:{id:{in:meetings.map(item=>item.id)}}});
    await db.member.deleteMany({where:{id:{in:members.map(item=>item.id)}}});
    await db.meetingCategory.deleteMany({where:{id:categoryId}});
    await db.$disconnect();
    console.log('Synthetic scale fixtures removed.');
  }
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
