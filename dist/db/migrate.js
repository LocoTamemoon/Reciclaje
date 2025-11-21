"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pool_1 = require("./pool");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
async function ensureMigrationsTable() {
    await pool_1.pool.query("CREATE TABLE IF NOT EXISTS migraciones (id SERIAL PRIMARY KEY, nombre VARCHAR(255) UNIQUE, aplicada_en TIMESTAMP DEFAULT NOW())");
}
async function applied() {
    const res = await pool_1.pool.query("SELECT nombre FROM migraciones ORDER BY id");
    return new Set(res.rows.map((r) => r.nombre));
}
async function run() {
    await ensureMigrationsTable();
    const dir = path_1.default.resolve("migrations");
    const files = fs_1.default
        .readdirSync(dir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
    const done = await applied();
    for (const f of files) {
        if (done.has(f))
            continue;
        const sql = fs_1.default.readFileSync(path_1.default.join(dir, f), "utf-8");
        const client = await pool_1.pool.connect();
        try {
            await client.query("BEGIN");
            await client.query(sql);
            await client.query("INSERT INTO migraciones (nombre) VALUES ($1)", [f]);
            await client.query("COMMIT");
            console.log("Aplicada", f);
        }
        catch (e) {
            await client.query("ROLLBACK");
            throw e;
        }
        finally {
            client.release();
        }
    }
    console.log("Migraciones completadas");
    await pool_1.pool.end();
}
run().catch((e) => {
    console.error(e);
    process.exit(1);
});
