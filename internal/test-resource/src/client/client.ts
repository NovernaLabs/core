import { Application, Initialize, LogLevel } from '@noverna/core/client';
import { RootModule } from './root.module';

Initialize(
  async (app: Application) => {
    app.registerRootModule(RootModule);

    await app.start();
  },
  {
    logLevel: LogLevel.Debug,
  },
);
