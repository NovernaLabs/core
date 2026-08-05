import { type Application, Initialize, LogLevel } from '@noverna/core/server';
import { ensurePrismaRuntime, PrismaAdapter } from '@noverna/persistence-prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import { RootModule } from './root.module';

ensurePrismaRuntime();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: GetConvar('DATABASE_URL', '') }),
});

Initialize(
  async (app: Application) => {
    app.registerRootModule(RootModule);

    await app.start();
  },
  {
    logLevel: LogLevel.Debug,
    persistence: new PrismaAdapter(prisma),
  },
);
