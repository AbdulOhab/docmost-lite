import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiConfigService } from './ai-config.service';

@Module({
  controllers: [AiController],
  providers: [AiService, AiConfigService],
})
export class AiModule {}
