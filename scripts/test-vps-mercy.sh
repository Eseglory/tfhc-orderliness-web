docker exec tfhc-production-api node -e '
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
prisma.absenceExcuse.findMany({ where: { memberId: "459baa9f-190f-4296-a8c0-7a927e58dfb6" } })
  .then(rows => {
    console.log("CONTAINER MERCY EXCUSES:", rows.length);
    rows.forEach(r => console.log(r.id, r.status, r.reason.slice(0, 40)));
    process.exit(0);
  });
'
