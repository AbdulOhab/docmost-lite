import {
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { SkipTransform } from '../common/decorators/skip-transform.decorator';
import { McpService } from './mcp.service';

// Authenticated by the MCP bearer token inside McpService, not by a user session.
@Public()
@SkipTransform()
@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Post()
  @HttpCode(200)
  async post(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    if (!(await this.mcpService.isEnabled())) throw new NotFoundException();
    return this.mcpService.handle(req, reply);
  }

  // The endpoint is stateless, so there are no sessions to open or close.
  @Get()
  @Delete()
  @HttpCode(405)
  notAllowed(@Res() reply: FastifyReply) {
    return reply.status(405).header('allow', 'POST').send();
  }
}
