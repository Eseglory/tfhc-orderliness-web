const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
console.log(Object.keys(prisma).filter(k => !k.startsWith('$') && !k.startsWith('_')));
prisma.$disconnect();
