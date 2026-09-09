import { Module } from '@nestjs/common';
import { AccessRolesController } from './access-roles.controller';
import { AccessRolesService } from './access-roles.service';

@Module({
  controllers: [AccessRolesController],
  providers: [AccessRolesService],
  exports: [AccessRolesService],
})
export class AccessRolesModule {}
