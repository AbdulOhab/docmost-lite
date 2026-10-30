import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsIn, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireSessionAuth } from '../common/decorators/require-session-auth.decorator';
import { AuthUser } from '../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../integrations/environment/environment.service';
import { MCP_SCOPES, McpScope } from './mcp.constants';
import { McpTokenService } from './mcp-token.service';

class CreateMcpTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(MCP_SCOPES as unknown as string[], { each: true })
  scopes: McpScope[];
}

class McpTokenIdDto {
  @IsUUID()
  id: string;
}

// Managing tokens needs a real signed-in owner or admin, never an API credential.
@UseGuards(JwtAuthGuard)
@RequireSessionAuth()
@Controller('mcp-tokens')
export class McpTokensController {
  constructor(
    private readonly tokens: McpTokenService,
    private readonly env: EnvironmentService,
  ) {}

  private assertAdmin(user: User) {
    if (user.role !== 'owner' && user.role !== 'admin') {
      throw new ForbiddenException();
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  async info(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertAdmin(user);
    return {
      endpoint: `${this.env.getAppUrl()}/mcp`,
      // tokens set in .env cannot be changed here, so only a hint is shown
      envTokens: this.env.getMcpTokens().map((t) => ({
        hint: `…${t.token.slice(-4)}`,
        scopes: [...t.scopes],
      })),
      tokens: await this.tokens.list(workspace.id),
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async create(
    @Body() dto: CreateMcpTokenDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user);
    // handing out delete rights is reserved for the owner
    if (dto.scopes.includes('delete') && user.role !== 'owner') {
      throw new ForbiddenException('Only the owner can grant the delete scope');
    }
    const { token, row } = await this.tokens.create(
      workspace.id,
      user.id,
      dto.name.trim(),
      dto.scopes,
    );
    return { token, ...row };
  }

  @HttpCode(HttpStatus.OK)
  @Post('revoke')
  async revoke(
    @Body() dto: McpTokenIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user);
    if (!(await this.tokens.revoke(workspace.id, dto.id))) {
      throw new NotFoundException('Token not found');
    }
  }
}
