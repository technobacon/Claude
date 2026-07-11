import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const migrationDirectory = path.join(process.cwd(), "supabase", "migrations");
const files = (await readdir(migrationDirectory)).filter((file) => file.endsWith(".sql")).sort();

if (files.length === 0) {
  throw new Error("At least one Supabase migration is required.");
}

for (const file of files) {
  if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(file)) {
    throw new Error(`Migration ${file} must use a 14-digit timestamp prefix.`);
  }

  const sql = await readFile(path.join(migrationDirectory, file), "utf8");
  if (!sql.toLowerCase().includes("begin;") || !sql.toLowerCase().includes("commit;")) {
    throw new Error(`Migration ${file} must be wrapped in BEGIN/COMMIT.`);
  }
}

console.log(`Validated ${files.length} migration file(s).`);
