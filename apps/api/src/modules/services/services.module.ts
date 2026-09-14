import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { RbacModule } from '../../common/rbac/rbac.module';

@Module({
  imports: [PrismaModule, RbacModule],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
