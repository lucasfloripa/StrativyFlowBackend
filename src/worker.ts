import { NestFactory } from '@nestjs/core'

import { WorkerModule } from './worker.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule)
  // On deploy/stop, finish in-flight Rabbit messages before closing
  // connections instead of dying mid-job.
  app.enableShutdownHooks()
}

void bootstrap()
