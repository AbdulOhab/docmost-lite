import { Injectable, OnModuleInit } from '@nestjs/common';
import { QueueJob, QueueName } from '../constants';
import {
  IAddPageWatchersJob,
  IPageBacklinkJob,
} from '../constants/queue.interface';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { BacklinkRepo } from '@docmost/db/repos/backlink/backlink.repo';
import {
  WatcherRepo,
  WatcherType,
} from '@docmost/db/repos/watcher/watcher.repo';
import { InsertableWatcher } from '@docmost/db/types/entity.types';
import { processBacklinks } from '../tasks/backlinks.task';
import { InjectQueue, Job, Queue } from '../local-queue';

@Injectable()
export class GeneralQueueProcessor implements OnModuleInit {
  constructor(
    @InjectQueue(QueueName.GENERAL_QUEUE) private readonly queue: Queue,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly backlinkRepo: BacklinkRepo,
    private readonly watcherRepo: WatcherRepo,
  ) {}

  onModuleInit() {
    this.queue.process((job) => this.process(job));
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case QueueJob.ADD_PAGE_WATCHERS: {
        const { userIds, pageId, spaceId, workspaceId } =
          job.data as IAddPageWatchersJob;
        const watchers: InsertableWatcher[] = userIds.map((userId) => ({
          userId,
          pageId,
          spaceId,
          workspaceId,
          type: WatcherType.PAGE,
          addedById: userId,
        }));
        await this.watcherRepo.insertMany(watchers);
        break;
      }

      case QueueJob.PAGE_BACKLINKS: {
        await processBacklinks(
          this.db,
          this.backlinkRepo,
          job.data as IPageBacklinkJob,
        );
        break;
      }
    }
  }
}
