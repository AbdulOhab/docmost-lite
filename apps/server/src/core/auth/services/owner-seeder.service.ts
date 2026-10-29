import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { SignupService } from './signup.service';

/**
 * Creates the first workspace and its owner from OWNER_* env vars when the
 * database is empty, so no setup page is needed. Does nothing once a
 * workspace exists.
 */
@Injectable()
export class OwnerSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OwnerSeederService.name);

  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly signupService: SignupService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const owner = this.environmentService.getOwnerSeed();
    if (!owner) return;

    if ((await this.workspaceRepo.count()) > 0) return;

    if (owner.password.length < 8) {
      this.logger.error('OWNER_PASSWORD must be at least 8 characters; skipping');
      return;
    }

    try {
      await this.signupService.initialSetup({
        name: owner.name,
        email: owner.email,
        password: owner.password,
        workspaceName: owner.workspaceName,
      });
      this.logger.log(`Created workspace and owner ${owner.email}`);
    } catch (err) {
      this.logger.error(`Owner seeding failed: ${err?.['message']}`);
    }
  }
}
