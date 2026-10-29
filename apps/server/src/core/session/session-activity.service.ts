import { Injectable } from '@nestjs/common';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';

const THROTTLE_MS = 15 * 60 * 1000; // 15 minutes

@Injectable()
export class SessionActivityService {
  private readonly lastTracked = new Map<string, number>();

  constructor(
    private readonly userSessionRepo: UserSessionRepo,
    private readonly userRepo: UserRepo,
  ) {}

  trackActivity(sessionId: string, userId: string, workspaceId: string): void {
    const now = Date.now();
    const last = this.lastTracked.get(sessionId);
    if (last && now - last < THROTTLE_MS) return; // throttled

    if (this.lastTracked.size > 10_000) this.lastTracked.clear();
    this.lastTracked.set(sessionId, now);

    this.userSessionRepo.updateLastActiveAt(sessionId).catch(() => {});
    this.userRepo
      .updateUser({ lastActiveAt: new Date() }, userId, workspaceId)
      .catch(() => {});
  }
}
