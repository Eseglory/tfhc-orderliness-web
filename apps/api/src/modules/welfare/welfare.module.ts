import { Module } from '@nestjs/common';
import { WelfareController } from './welfare.controller';
import { WelfareService } from './welfare.service';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PushModule],
  controllers: [WelfareController],
  providers: [WelfareService],
  exports: [WelfareService],
})
export class WelfareModule {}
