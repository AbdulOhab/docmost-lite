import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { PostgresHealthIndicator } from './postgres.health';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private postgres: PostgresHealthIndicator,
  ) {}

  @SkipTransform()
  @Get()
  @HealthCheck()
  async check() {
    return this.health.check([
      () => this.postgres.pingCheck('database'),
    ]);
  }

  @Get('live')
  async checkLive() {
    return 'ok';
  }
}
