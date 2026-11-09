import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
const localPoolConfig = connectionString
  ? { connectionString }
  : {
      host: process.env.PGHOST ?? "/tmp",
      port: Number(process.env.PGPORT ?? 5432),
      database: process.env.PGDATABASE ?? "patient_flow",
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
    };

export const pool = new Pool({
  ...localPoolConfig,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});
