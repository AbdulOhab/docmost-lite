import {
  Connection,
  Extension,
  Hocuspocus,
  onAuthenticatePayload,
  onConfigurePayload,
} from '@hocuspocus/server';
import { Forbidden } from '@hocuspocus/common';
import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { TokenService } from '../../core/auth/services/token.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { findHighestUserSpaceRole } from '@docmost/db/repos/space/utils';
import { Page, User } from '@docmost/db/types/entity.types';
import { SpaceRole } from '../../common/helpers/types/permission';
import { isUserDisabled } from '../../common/helpers';
import { getPageId } from '../collaboration.util';
import {
  CollabAccessRecheck,
  CollabAccessService,
} from '../services/collab-access.service';
import { JwtCollabPayload, JwtType } from '../../core/auth/dto/jwt-payload';

type CollabAccess = 'none' | 'read' | 'write';

@Injectable()
export class AuthenticationExtension implements Extension {
  private readonly logger = new Logger(AuthenticationExtension.name);
  private instance: Hocuspocus;

  constructor(
    private tokenService: TokenService,
    private userRepo: UserRepo,
    private pageRepo: PageRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly collabAccessService: CollabAccessService,
  ) {}

  async onConfigure({ instance }: onConfigurePayload) {
    this.instance = instance;
    this.collabAccessService.onRecheck((recheck) =>
      this.recheckAccess(recheck).catch((err) =>
        this.logger.error({ err }, 'Failed to recheck collab access'),
      ),
    );
  }

  async onAuthenticate(data: onAuthenticatePayload) {
    const { documentName, token } = data;
    const pageId = getPageId(documentName);

    let jwtPayload: JwtCollabPayload;

    try {
      jwtPayload = await this.tokenService.verifyJwt(token, JwtType.COLLAB);
    } catch (error) {
      throw new UnauthorizedException('Invalid collab token');
    }

    const userId = jwtPayload.sub;
    const workspaceId = jwtPayload.workspaceId;

    const [user, page] = await Promise.all([
      this.userRepo.findById(userId, workspaceId),
      this.pageRepo.findById(pageId),
    ]);

    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException();
    }

    if (!page || page.workspaceId !== workspaceId) {
      this.logger.debug(`Page not found: ${pageId}`);
      throw new NotFoundException('Page not found');
    }

    const access = await this.getAccess(user, page);

    if (access === 'none') {
      this.logger.warn(`User ${user.id} not authorized to access page: ${pageId}`);
      throw new UnauthorizedException();
    }

    if (access === 'read') {
      data.connectionConfig.readOnly = true;
    }

    this.logger.debug(`Authenticated user ${user.id} on page ${pageId}`);

    return {
      user,
    };
  }

  async recheckAccess({
    userIds = [],
    pageIds = [],
  }: CollabAccessRecheck): Promise<void> {
    if (!this.instance?.documents.size) return;

    const recheckUserIds = new Set(userIds);
    const recheckPageIds = new Set<string>();
    for (const pageId of pageIds) {
      const pages = await this.pageRepo.getPageAndDescendants(pageId, {
        includeContent: false,
      });
      pages.forEach((page) => recheckPageIds.add(page.id));
    }

    for (const document of this.instance.documents.values()) {
      const pageId = getPageId(document.name);
      const connections = document.getConnections().filter((connection) => {
        const userId = connection.context?.user?.id;
        return (
          userId && (recheckPageIds.has(pageId) || recheckUserIds.has(userId))
        );
      });
      if (connections.length === 0) continue;

      for (const connection of connections) {
        try {
          await this.recheckConnection(connection, pageId);
        } catch (err) {
          this.logger.error(
            { err },
            `Failed to recheck collab access on ${document.name}`,
          );
        }
      }
    }
  }

  private async recheckConnection(
    connection: Connection,
    pageId: string,
  ): Promise<void> {
    const { id, workspaceId } = connection.context.user;
    const [user, page] = await Promise.all([
      this.userRepo.findById(id, workspaceId),
      this.pageRepo.findById(pageId),
    ]);

    let access: CollabAccess = 'none';
    if (user && !isUserDisabled(user) && page) {
      access = await this.getAccess(user, page);
    }

    if (access === 'write' || (access === 'read' && connection.readOnly)) {
      return;
    }

    connection.sendStateless(
      JSON.stringify({ type: 'page.permissions', access }),
    );
    connection.readOnly = true;
    if (access === 'none') {
      connection.close(Forbidden);
    }
  }

  // a connection outlives this check, so it must not see a stale cached allow
  private async getAccess(user: User, page: Page): Promise<CollabAccess> {
    const [spaceRoles, { hasAnyRestriction, canAccess, canEdit }] =
      await Promise.all([
        this.spaceMemberRepo.getUserSpaceRoles(user.id, page.spaceId, {
          skipCache: true,
        }),
        this.pagePermissionRepo.canUserEditPage(user.id, page.id, {
          skipCache: true,
        }),
      ]);

    const userSpaceRole = findHighestUserSpaceRole(spaceRoles);
    if (!userSpaceRole) return 'none';
    if (hasAnyRestriction && !canAccess) return 'none';

    const canWrite = hasAnyRestriction
      ? canEdit
      : userSpaceRole !== SpaceRole.READER;
    return canWrite && !page.deletedAt ? 'write' : 'read';
  }
}
