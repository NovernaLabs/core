import { Module } from '@noverna/core';
import { TestModule } from './test/test.module';

@Module({
  imports: [TestModule],
})
export class RootModule {}
