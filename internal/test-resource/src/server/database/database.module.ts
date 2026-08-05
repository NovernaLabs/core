import { createToken, Module } from '@noverna/core';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: GetConvar('DATABASE_URL', '') }),
});

export const PRISMA = createToken<PrismaClient>('PRISMA');

@Module({
  providers: [{ provide: PRISMA, useValue: prisma }],
})
export class DatabaseModule {}

//! Dont forget to Import the DatabaseModule in the RootModule
