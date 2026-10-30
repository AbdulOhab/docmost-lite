import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireSessionAuth } from '../common/decorators/require-session-auth.decorator';
import { AuthUser } from '../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { DiagramLibraryService } from './diagram-library.service';

class UploadLibraryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsObject()
  content: Record<string, any>;
}

class InstallLibraryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

class ToggleLibraryDto {
  @IsUUID()
  id: string;

  @IsBoolean()
  enabled: boolean;
}

class LibraryIdDto {
  @IsUUID()
  id: string;
}

@UseGuards(JwtAuthGuard)
@RequireSessionAuth()
@Controller('diagram-libraries')
export class DiagramLibraryController {
  constructor(private readonly libraries: DiagramLibraryService) {}

  private assertAdmin(user: User) {
    if (user.role !== 'owner' && user.role !== 'admin') {
      throw new ForbiddenException();
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post()
  list(@AuthWorkspace() workspace: Workspace) {
    return this.libraries.list(workspace.id);
  }

  // everyone who can draw gets the enabled libraries in their editor
  @HttpCode(HttpStatus.OK)
  @Post('enabled')
  enabled(@AuthWorkspace() workspace: Workspace) {
    return this.libraries.enabledItems(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('catalog')
  catalog(@AuthUser() user: User) {
    this.assertAdmin(user);
    return this.libraries.getCatalog();
  }

  @HttpCode(HttpStatus.OK)
  @Post('upload')
  upload(
    @Body() dto: UploadLibraryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user);
    return this.libraries.create(workspace.id, user.id, dto.name.trim(), dto.content, null);
  }

  @HttpCode(HttpStatus.OK)
  @Post('install')
  install(
    @Body() dto: InstallLibraryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user);
    return this.libraries.install(workspace.id, user.id, dto.url.trim(), dto.name);
  }

  @HttpCode(HttpStatus.OK)
  @Post('toggle')
  async toggle(
    @Body() dto: ToggleLibraryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user);
    if (!(await this.libraries.setEnabled(workspace.id, dto.id, dto.enabled))) {
      throw new NotFoundException('Library not found');
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async remove(
    @Body() dto: LibraryIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user);
    if (!(await this.libraries.remove(workspace.id, dto.id))) {
      throw new NotFoundException('Library not found');
    }
  }
}
