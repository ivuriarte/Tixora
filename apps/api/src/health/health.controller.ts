import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Health check' })
  async check() {
    const [db, redis] = await Promise.all([
      this.healthService.checkDatabase(),
      this.healthService.checkRedis(),
    ]);

    const healthy = db && redis;

    return {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        database: db ? 'ok' : 'error',
        redis: redis ? 'ok' : 'error',
      },
    };
  }
}
