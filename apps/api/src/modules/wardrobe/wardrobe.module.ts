import { Module } from '@nestjs/common';
import { WardrobeController } from './wardrobe.controller';
import { WardrobeAdminController } from './wardrobe-admin.controller';
import { WardrobeService } from './wardrobe.service';
import { WardrobeAdminService } from './wardrobe-admin.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [WardrobeController, WardrobeAdminController],
  providers: [WardrobeService, WardrobeAdminService],
  exports: [WardrobeService, WardrobeAdminService],
})
export class WardrobeModule {}
