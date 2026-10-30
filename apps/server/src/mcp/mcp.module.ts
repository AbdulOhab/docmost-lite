import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpTokensController } from './mcp-tokens.controller';
import { McpService } from './mcp.service';
import { McpTokenService } from './mcp-token.service';

@Module({
  controllers: [McpController, McpTokensController],
  providers: [McpService, McpTokenService],
})
export class McpModule {}
