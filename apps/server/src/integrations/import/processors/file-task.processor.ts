import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QueueJob, QueueName } from '../../queue/constants';
import { InjectQueue, Job, Queue } from '../../queue/local-queue';
import { FileImportTaskService } from '../services/file-import-task.service';
import { FileTaskStatus } from '../utils/file.utils';
import { StorageService } from '../../storage/storage.service';

@Injectable()
export class FileTaskProcessor implements OnModuleInit {
  private readonly logger = new Logger(FileTaskProcessor.name);

  constructor(
    @InjectQueue(QueueName.FILE_TASK_QUEUE) private readonly queue: Queue,
    private readonly fileTaskService: FileImportTaskService,
    private readonly storageService: StorageService,
  ) {}

  onModuleInit() {
    this.queue.process((job) => this.process(job));
  }

  async process(job: Job): Promise<void> {
    if (job.name !== QueueJob.IMPORT_TASK) return;

    const { fileTaskId } = job.data;
    try {
      await this.fileTaskService.processZIpImport(fileTaskId);
      this.logger.log(`Completed import for file task ${fileTaskId}`);
    } catch (err) {
      this.logger.error(`Import failed for file task ${fileTaskId}`, err);
      await this.fileTaskService.updateTaskStatus(
        fileTaskId,
        FileTaskStatus.Failed,
        (err as Error)?.message || 'Unknown error',
      );
    }

    try {
      const fileTask = await this.fileTaskService.getFileTask(fileTaskId);
      if (fileTask) await this.storageService.delete(fileTask.filePath);
    } catch (err) {
      this.logger.error('Failed to delete imported zip file', err);
    }
  }
}
