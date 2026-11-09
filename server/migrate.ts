import { pool } from "./db.js";
import { runMigrations } from "./migrations.js";

try {
  await runMigrations(pool);
  process.stdout.write("Database migrations are current.\n");
} catch (error) {
  process.stderr.write(`Database migration failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
