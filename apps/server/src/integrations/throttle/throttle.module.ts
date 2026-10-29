import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AUTH_THROTTLER } from './throttler-names';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: AUTH_THROTTLER, ttl: 60_000, limit: 10 }],
      errorMessage: 'Too many requests',
    }),
  ],
})
export class ThrottleModule {}
