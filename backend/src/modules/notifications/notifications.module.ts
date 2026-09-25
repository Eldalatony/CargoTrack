import { Module } from '@nestjs/common';

import { JobsModule } from '../../jobs/jobs.module';
import { NotificationRelay } from './notification-relay';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * API side of the pipeline: the relay that enqueues, and the endpoints that
 * read and retry. Delivery lives in the worker (WorkerModule).
 */
@Module({
  imports: [JobsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationRelay],
  exports: [NotificationRelay],
})
export class NotificationsModule {}
