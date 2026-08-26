import { Module } from '@nestjs/common';
import { ExcusesService } from './excuses.service';
import { ExcusesController } from './excuses.controller';

@Module({
  providers: [ExcusesService],
  controllers: [ExcusesController],
  exports: [ExcusesService],
})
export class ExcusesModule {}
