import { Global, Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { TerminusModule } from '@nestjs/terminus';
import { PostgresHealthIndicator } from './postgres.health';

@Global()
@Module({
  controllers: [HealthController],
  providers: [PostgresHealthIndicator],
  imports: [TerminusModule],
})
export class HealthModule {}
