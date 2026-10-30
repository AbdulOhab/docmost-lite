import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EnvironmentService } from './integrations/environment/environment.service';
import { AuditActorInterceptor } from './common/interceptors/audit-actor.interceptor';
import { CoreModule } from './core/core.module';
import { EnvironmentModule } from './integrations/environment/environment.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { CollabAccessModule } from './collaboration/collab-access.module';
import { WsModule } from './ws/ws.module';
import { DatabaseModule } from '@docmost/db/database.module';
import { StorageModule } from './integrations/storage/storage.module';
import { QueueModule } from './integrations/queue/queue.module';
import { StaticModule } from './integrations/static/static.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HealthModule } from './integrations/health/health.module';
import { ExportModule } from './integrations/export/export.module';
import { ImportModule } from './integrations/import/import.module';
import { SecurityModule } from './integrations/security/security.module';
import { CacheModule } from '@nestjs/cache-manager';
import { LoggerModule } from './common/logger/logger.module';
import { ClsModule } from 'nestjs-cls';
import { NoopAuditModule } from './integrations/audit/audit.module';
import { ThrottleModule } from './integrations/throttle/throttle.module';
import { McpModule } from './mcp/mcp.module';
import { DiagramsModule } from './diagrams/diagrams.module';
import { OutboundModule } from './integrations/outbound/outbound.module';
import { EncryptionModule } from './integrations/encryption/encryption.module';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    LoggerModule,
    NoopAuditModule,
    CoreModule,
    DatabaseModule,
    EnvironmentModule,
    EncryptionModule,
    CacheModule.register({ isGlobal: true, ttl: 5 * 1000 }),
    CollaborationModule,
    CollabAccessModule,
    WsModule,
    QueueModule,
    StaticModule,
    HealthModule,
    ImportModule,
    ExportModule,
    StorageModule.forRootAsync({
      imports: [EnvironmentModule],
    }),
    EventEmitterModule.forRoot(),
    SecurityModule,
    ThrottleModule,
    OutboundModule,
    McpModule,
    DiagramsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditActorInterceptor,
    },
  ],
})
export class AppModule {}
