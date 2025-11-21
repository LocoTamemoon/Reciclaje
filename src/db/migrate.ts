import { pool } from "./pool";
import fs from "fs";
import path from "path";

async function ensureMigrationsTable() {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS migraciones (id SERIAL PRIMARY KEY, nombre VARCHAR(255) UNIQUE, aplicada_en TIMESTAMP DEFAULT NOW())"
  );
}

async function applied(): Promise<Set<string>> {
  const res = await pool.query("SELECT nombre FROM migraciones ORDER BY id");
  return new Set(res.rows.map((r: any) => r.nombre));
}

async function run() {
  await ensureMigrationsTable();
  const dir = path.resolve("migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const done = await applied();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf-8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO migraciones (nombre) VALUES ($1)", [f]);
      await client.query("COMMIT");
      console.log("Aplicada", f);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  console.log("Migraciones completadas");
  await pool.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});