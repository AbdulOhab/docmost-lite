import { Global, Module } from '@nestjs/common';
import { QueueName } from './constants';
import { getQueueToken, LocalQueue } from './local-queue';
import { GeneralQueueProcessor } from './processors/general-queue.processor';

const queues = [
  QueueName.ATTACHMENT_QUEUE,
  QueueName.GENERAL_QUEUE,
  QueueName.FILE_TASK_QUEUE,
  QueueName.HISTORY_QUEUE,
  QueueName.NOTIFICATION_QUEUE,
].map((name) => ({
  provide: getQueueToken(name),
  useValue: new LocalQueue(name),
}));

@Global()
@Module({
  providers: [...queues, GeneralQueueProcessor],
  exports: queues.map((q) => q.provide),
})
export class QueueModule {}
