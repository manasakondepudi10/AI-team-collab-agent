import { createServer } from 'node:http';
import { app } from './server.js';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';
import { seedDemoData } from './seed.js';

async function bootstrap() {
  await connectDb();
  await seedDemoData();

  const server = createServer(app);
  server.listen(env.PORT, () => {
    console.log(`API listening on :${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start API', error);
  process.exit(1);
});
