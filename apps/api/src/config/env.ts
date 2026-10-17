import path from 'node:path';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_PATH: z
    .string()
    .default(path.resolve(process.cwd(), '../../data/bills.sqlite')),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function loadEnv(rawEnv: NodeJS.ProcessEnv = process.env): AppEnv {
  return EnvSchema.parse(rawEnv);
}
