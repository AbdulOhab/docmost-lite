import { Injectable, OnModuleInit } from '@nestjs/common';
import { AttachmentService } from '../services/attachment.service';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';
import {
  InjectQueue,
  Job,
  Queue,
} from '../../../integrations/queue/local-queue';

@Injectable()
export class AttachmentProcessor implements OnModuleInit {
  constructor(
    @InjectQueue(QueueName.ATTACHMENT_QUEUE) private readonly queue: Queue,
    private readonly attachmentService: AttachmentService,
  ) {}

  onModuleInit() {
    this.queue.process((job) => this.process(job));
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case QueueJob.DELETE_SPACE_ATTACHMENTS:
        await this.attachmentService.handleDeleteSpaceAttachments(job.data.id);
        break;
      case QueueJob.DELETE_USER_AVATARS:
        await this.attachmentService.handleDeleteUserAvatars(job.data.id);
        break;
      case QueueJob.DELETE_PAGE_ATTACHMENTS:
        await this.attachmentService.handleDeletePageAttachments(
          job.data.pageId,
        );
        break;
    }
  }
}
