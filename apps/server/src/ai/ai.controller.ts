import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireSessionAuth } from '../common/decorators/require-session-auth.decorator';
import { AuthUser } from '../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AiService } from './ai.service';
import { AiConfigService, ENV_PROVIDER_ID } from './ai-config.service';

class ChatDto {
  // UI messages from the AI SDK's useChat; the service keeps only their plain text
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(80)
  messages: unknown[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  model?: string;
}

class ModelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  id: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;
}

class ProviderDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  baseUrl: string;

  // blank keeps the stored key
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ModelDto)
  models: ModelDto[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

class ProviderIdDto {
  @IsUUID()
  id: string;
}

class ToggleDto extends ProviderIdDto {
  @IsBoolean()
  enabled: boolean;
}

class ConnectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;
}

class TestDto extends ConnectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  model: string;
}

class SettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  defaultModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  instructions?: string;

  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsNumber()
  maxSteps?: number;
}

// Needs a real signed-in session: the assistant acts as that user.
@UseGuards(JwtAuthGuard)
@RequireSessionAuth()
@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly config: AiConfigService,
  ) {}

  private assertAdmin(user: User) {
    if (user.role !== 'owner' && user.role !== 'admin') throw new ForbiddenException();
  }

  @HttpCode(HttpStatus.OK)
  @Post('status')
  status(@AuthWorkspace() workspace: Workspace) {
    return this.ai.status(workspace.id);
  }

  @Post('chat')
  chat(
    @Body() dto: ChatDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.ai.chat(req, reply, user, workspace.id, dto.messages, dto.model);
  }

  // ---- settings (owner / admin) ----

  @HttpCode(HttpStatus.OK)
  @Post('settings')
  async settings(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertAdmin(user);
    const [providers, settings, models] = await Promise.all([
      this.config.providersForAdmin(workspace.id),
      this.config.getSettings(workspace.id),
      this.config.availableModels(workspace.id),
    ]);
    return { providers, settings, models };
  }

  @HttpCode(HttpStatus.OK)
  @Post('settings/save')
  saveSettings(@Body() dto: SettingsDto, @AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertAdmin(user);
    return this.config.saveSettings(workspace.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('providers/save')
  async saveProvider(@Body() dto: ProviderDto, @AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertAdmin(user);
    return { id: await this.config.saveProvider(workspace.id, dto) };
  }

  @HttpCode(HttpStatus.OK)
  @Post('providers/toggle')
  async toggleProvider(@Body() dto: ToggleDto, @AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertAdmin(user);
    await this.config.setEnabled(workspace.id, dto.id, dto.enabled);
  }

  @HttpCode(HttpStatus.OK)
  @Post('providers/delete')
  async deleteProvider(@Body() dto: ProviderIdDto, @AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertAdmin(user);
    await this.config.deleteProvider(workspace.id, dto.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('providers/test')
  testProvider(@Body() dto: TestDto, @AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertAdmin(user);
    return this.config.testConnection(workspace.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('providers/models')
  providerModels(@Body() dto: ConnectionDto, @AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertAdmin(user);
    return this.config.fetchModels(workspace.id, dto);
  }
}

export { ENV_PROVIDER_ID };
