import { Module } from '@nestjs/common';
import { WelfareController } from './welfare.controller';
import { WelfareService } from './welfare.service';

@Module({
  controllers: [WelfareController],
  providers: [WelfareService],
})
export class WelfareModule {}
