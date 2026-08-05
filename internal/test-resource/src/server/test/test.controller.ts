import { Controller, Inject, Logger, OnResourceStart, PersistenceAdapter } from '@noverna/core';
import { PRISMA } from '../database/database.module';
import type { PrismaClient } from '../generated/prisma/client';

@Controller()
export class TestController {
  public constructor(
    private readonly persistenceAdapter: PersistenceAdapter,
    private readonly logger: Logger,
  ) {}

  @OnResourceStart()
  public async TestAsync(resourceName: string) {
    this.logger.info(`${resourceName} was successfully started!`);
  }
}

// Custom way, if CRUD Repos arent enough for you.
@Controller()
export class SecondTestController {
  public constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}
}
