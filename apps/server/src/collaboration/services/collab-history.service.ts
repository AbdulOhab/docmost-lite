import { Injectable } from '@nestjs/common';

@Injectable()
export class CollabHistoryService {
  private readonly contributors = new Map<string, Set<string>>();

  async addContributors(pageId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const set = this.contributors.get(pageId) ?? new Set<string>();
    userIds.forEach((id) => set.add(id));
    this.contributors.set(pageId, set);
  }

  async popContributors(pageId: string): Promise<string[]> {
    const set = this.contributors.get(pageId);
    this.contributors.delete(pageId);
    return set ? [...set] : [];
  }

  async clearContributors(pageId: string): Promise<void> {
    this.contributors.delete(pageId);
  }
}
