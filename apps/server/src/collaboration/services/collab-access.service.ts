import { Injectable } from '@nestjs/common';

export type CollabAccessRecheck = {
  userIds?: string[];
  pageIds?: string[];
};

type RecheckHandler = (recheck: CollabAccessRecheck) => Promise<void>;

@Injectable()
export class CollabAccessService {
  private handler?: RecheckHandler;

  onRecheck(handler: RecheckHandler): void {
    this.handler = handler;
  }

  async recheckAccess(recheck: CollabAccessRecheck): Promise<void> {
    if (!recheck.userIds?.length && !recheck.pageIds?.length) return;
    await this.handler?.(recheck);
  }
}
