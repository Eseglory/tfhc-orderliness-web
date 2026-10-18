const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== CREATING USHERING UNIT MONTHLY HOSTING & GENERAL MEETING ===\n');

  // 1. Resolve or Create Supervising Minister: Jiko
  console.log('1. Resolving Supervising Minister Jiko...');
  let jiko = await prisma.member.findFirst({
    where: {
      OR: [
        { firstName: { equals: 'Jiko', mode: 'insensitive' } },
        { lastName: { equals: 'Jiko', mode: 'insensitive' } },
        { preferredName: { equals: 'Jiko', mode: 'insensitive' } }
      ]
    }
  });

  const execSubTeam = await prisma.subTeam.findFirst({
    where: { name: 'Executive' }
  });

  if (!jiko) {
    console.log('   Creating Member record for Supervising Minister Jiko (without duplicate user)...');
    jiko = await prisma.member.create({
      data: {
        memberCode: 'TFHC-MIN-JIKO',
        firstName: 'Minister',
        lastName: 'Jiko',
        preferredName: 'Jiko',
        roleInUnit: 'Executive',
        phoneNumber: '08000000000',
        status: 'ACTIVE',
        subTeamId: execSubTeam ? execSubTeam.id : null,
      }
    });
    console.log(`   ✓ Created Member record for Jiko: ID ${jiko.id}, Code: ${jiko.memberCode}`);
  } else {
    console.log(`   ✓ Found existing Member record for Jiko: ID ${jiko.id}, Name: ${jiko.firstName} ${jiko.lastName}`);
  }

  // 2. Resolve Category & EventType
  console.log('\n2. Resolving Meeting Category & Event Type...');
  let category = await prisma.meetingCategory.findFirst({
    where: {
      OR: [
        { name: { equals: 'Unit Meeting', mode: 'insensitive' } },
        { name: { contains: 'Unit', mode: 'insensitive' } }
      ]
    }
  });
  if (!category) {
    category = await prisma.meetingCategory.create({
      data: {
        name: 'Unit Meeting',
        basePoints: 10,
        pointWeight: 1.0,
        isSystem: true,
        active: true
      }
    });
  }
  console.log(`   ✓ Category: "${category.name}" (ID: ${category.id})`);

  let eventType = await prisma.eventType.findFirst({
    where: { key: 'MEETING' }
  });
  console.log(`   ✓ EventType: "${eventType?.name || 'MEETING'}" (ID: ${eventType?.id || 'none'})`);

  // 3. Resolve Agenda Members
  console.log('\n3. Resolving Agenda Members...');
  const agendaAssignments = [
    {
      order: 1,
      title: 'Opening Prayer',
      assigneeSearch: 'ngoziloveth41@gmail.com',
      assigneeLabel: 'Sis Loveth (@Mrs. Loveth TFHC)',
      description: 'Opening prayer led by Sis Loveth (@Mrs. Loveth TFHC)',
      durationMinutes: 10
    },
    {
      order: 2,
      title: 'Praise and Worship',
      assigneeSearch: 'somtotega@gmail.com',
      assigneeLabel: 'Sis Somto (@Somto)',
      description: 'Praise and worship session led by Sis Somto (@Somto)',
      durationMinutes: 20
    },
    {
      order: 3,
      title: 'Short Exhortation',
      assigneeSearch: 'onojamonday123@gmail.com',
      assigneeLabel: 'Bro Jacob (@Jacob Onoja TFHC)',
      description: 'Short exhortation word by Bro Jacob (@Jacob Onoja TFHC)',
      durationMinutes: 25
    },
    {
      order: 4,
      title: 'Testimony',
      assigneeSearch: 'prudentvee@gmail.com',
      assigneeLabel: 'Sis Vivian (@Vivian)',
      description: 'Testimonies session coordinated by Sis Vivian (@Vivian)',
      durationMinutes: 15
    },
    {
      order: 5,
      title: 'Any Other Business (AOB)',
      assigneeSearch: 'folashadeogunlade86@gmail.com',
      assigneeLabel: 'Brother Femi (@Oluwafemi Paseda TFHC)',
      description: 'Any Other Business (AOB) moderated by Brother Femi (@Oluwafemi Paseda TFHC)',
      durationMinutes: 20
    },
    {
      order: 6,
      title: 'Financial Report',
      assigneeSearch: 'engreseglory@gmail.com',
      assigneeLabel: 'Bro Ese (@EseGlory)',
      description: 'Unit financial report presented by Bro Ese (@EseGlory)',
      durationMinutes: 20
    },
    {
      order: 7,
      title: 'Closing Prayer',
      assigneeSearch: 'nicoleokafor0@gmail.com',
      assigneeLabel: 'Sis Nichole (@Nicole)',
      description: 'Closing prayer and benediction led by Sis Nichole (@Nicole)',
      durationMinutes: 10
    }
  ];

  const resolvedAgenda = [];
  for (const item of agendaAssignments) {
    const member = await prisma.member.findFirst({
      where: {
        OR: [
          { user: { email: { equals: item.assigneeSearch, mode: 'insensitive' } } },
          { approvedMember: { normalizedEmail: item.assigneeSearch.toLowerCase() } }
        ]
      },
      select: { id: true, firstName: true, lastName: true, memberCode: true }
    });

    if (!member) {
      throw new Error(`Failed to resolve member for agenda item "${item.title}" (${item.assigneeLabel}) with search ${item.assigneeSearch}`);
    }

    console.log(`   ✓ Agenda #${item.order}: ${item.title} -> Assigned to: ${member.firstName} ${member.lastName} (${member.memberCode}, ID: ${member.id})`);
    resolvedAgenda.push({
      order: item.order,
      title: item.title,
      description: item.description,
      durationMinutes: item.durationMinutes,
      assignedMemberId: member.id
    });
  }

  // 4. Meeting Timestamps (WAT = UTC+1)
  // Date: Sunday, 18 October 2026
  // Start Time: 1:00 PM WAT = 13:00 WAT = 12:00 UTC
  // End Time: 4:00 PM WAT = 16:00 WAT = 15:00 UTC
  console.log('\n4. Configuring Schedule & Timezone (Africa/Lagos, WAT UTC+1)...');
  const meetingDate = new Date('2026-10-18T00:00:00.000Z');
  const startTime = new Date('2026-10-18T12:00:00.000Z'); // 1:00 PM WAT
  const endTime = new Date('2026-10-18T15:00:00.000Z');   // 4:00 PM WAT
  const expectedArrivalTime = new Date('2026-10-18T11:45:00.000Z'); // 12:45 PM WAT
  const attendanceOpenTime = new Date('2026-10-18T11:45:00.000Z');  // 12:45 PM WAT
  const attendanceCloseTime = new Date('2026-10-18T15:00:00.000Z'); // 4:00 PM WAT

  const announcement = 
`HOSTING! HOSTING! HOSTING!

Good day, Family!

Our monthly hosting is today, Sunday, 18 October 2026. Please plan to attend immediately after the third service.

**Venue:** Sis Comfort's Residence

**Address:** No. 2, Ogo-Oluwa Close, Okesuna Street, Akute / Ishashi Road, Ogun State.

Please inform every member of the Ushering Unit to attend, as we will also be holding our General Meeting.

Please note that failure to attend the Monthly Hosting without obtaining permission will attract a fine.

Thank you for your selfless service.`;

  // 5. Check for Existing Meeting to Prevent Duplicates
  console.log('\n5. Checking for existing meeting to prevent duplicate creation...');
  const existingMeeting = await prisma.meeting.findFirst({
    where: {
      title: 'Ushering Unit Monthly Hosting and General Meeting',
      meetingDate: {
        gte: new Date('2026-10-18T00:00:00.000Z'),
        lte: new Date('2026-10-18T23:59:59.999Z')
      }
    },
    include: {
      agendaItems: true
    }
  });

  let meeting;
  if (existingMeeting) {
    console.log(`   Found existing meeting record (ID: ${existingMeeting.id}). Updating to exact specifications...`);
    meeting = await prisma.meeting.update({
      where: { id: existingMeeting.id },
      data: {
        title: 'Ushering Unit Monthly Hosting and General Meeting',
        description: announcement,
        categoryId: category.id,
        eventTypeId: eventType?.id || null,
        supervisingMinisterId: jiko.id,
        meetingDate,
        startTime,
        endTime,
        expectedArrivalTime,
        attendanceOpenTime,
        attendanceCloseTime,
        gracePeriodMinutes: 10,
        locationName: "Sis Comfort's Residence",
        address: "No. 2, Ogo-Oluwa Close, Okesuna Street, Akute / Ishashi Road, Ogun State.",
        latitude: 6.6854,
        longitude: 3.3421,
        geofenceRadiusMeters: 150.0,
        status: 'SCHEDULED',
        scheduleCancelled: false,
        isCompulsory: true,
        pointWeight: 1.0,
        visibility: 'PUBLIC',
      }
    });

    // Delete existing agenda items to replace with canonical set
    await prisma.meetingAgendaItem.deleteMany({
      where: { meetingId: meeting.id }
    });
  } else {
    console.log('   Creating new meeting record...');
    meeting = await prisma.meeting.create({
      data: {
        title: 'Ushering Unit Monthly Hosting and General Meeting',
        description: announcement,
        categoryId: category.id,
        eventTypeId: eventType?.id || null,
        supervisingMinisterId: jiko.id,
        meetingDate,
        startTime,
        endTime,
        expectedArrivalTime,
        attendanceOpenTime,
        attendanceCloseTime,
        gracePeriodMinutes: 10,
        locationName: "Sis Comfort's Residence",
        address: "No. 2, Ogo-Oluwa Close, Okesuna Street, Akute / Ishashi Road, Ogun State.",
        latitude: 6.6854,
        longitude: 3.3421,
        geofenceRadiusMeters: 150.0,
        status: 'SCHEDULED',
        scheduleCancelled: false,
        isCompulsory: true,
        pointWeight: 1.0,
        visibility: 'PUBLIC',
      }
    });
    console.log(`   ✓ Created meeting record (ID: ${meeting.id})`);
  }

  // 6. Create Agenda Items
  console.log('\n6. Creating Agenda Items...');
  for (const item of resolvedAgenda) {
    const createdItem = await prisma.meetingAgendaItem.create({
      data: {
        meetingId: meeting.id,
        order: item.order,
        title: item.title,
        description: item.description,
        durationMinutes: item.durationMinutes,
        assignedMemberId: item.assignedMemberId
      }
    });
    console.log(`   ✓ Agenda #${item.order} [${item.title}] saved (ID: ${createdItem.id})`);
  }

  // 7. Verify Saved Meeting
  console.log('\n7. Verifying Saved Meeting Record from Database...');
  const verified = await prisma.meeting.findUnique({
    where: { id: meeting.id },
    include: {
      category: true,
      eventType: true,
      supervisingMinister: {
        select: { id: true, firstName: true, lastName: true, preferredName: true, roleInUnit: true }
      },
      agendaItems: {
        orderBy: { order: 'asc' },
        include: {
          assignedMember: {
            select: { id: true, firstName: true, lastName: true, memberCode: true }
          }
        }
      }
    }
  });

  console.log('\n=== VERIFICATION SUMMARY ===');
  console.log(`Meeting ID: ${verified.id}`);
  console.log(`Title: ${verified.title}`);
  console.log(`Date: ${verified.meetingDate.toISOString().split('T')[0]}`);
  console.log(`Start Time: ${verified.startTime.toISOString()} (1:00 PM WAT)`);
  console.log(`End Time: ${verified.endTime.toISOString()} (4:00 PM WAT)`);
  console.log(`Venue: ${verified.locationName}`);
  console.log(`Address: ${verified.address}`);
  console.log(`Supervising Minister: ${verified.supervisingMinister?.firstName} ${verified.supervisingMinister?.lastName} (ID: ${verified.supervisingMinister?.id})`);
  console.log(`Status: ${verified.status}`);
  console.log(`Category: ${verified.category.name}`);
  console.log(`EventType: ${verified.eventType?.name} (${verified.eventType?.key})`);
  console.log(`Agenda Items (${verified.agendaItems.length}):`);
  for (const ag of verified.agendaItems) {
    console.log(`  ${ag.order}. ${ag.title} — Assigned to: ${ag.assignedMember?.firstName} ${ag.assignedMember?.lastName} (${ag.assignedMember?.memberCode})`);
  }

  console.log('\nMeeting creation and verification completed successfully!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
