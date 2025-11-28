const { Client } = require('pg');

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL no configurado');
    process.exit(1);
  }
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const cols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='usuarios' ORDER BY ordinal_position");
    console.log('USUARIOS COLUMNS');
    console.log(JSON.stringify(cols.rows, null, 2));
    const migs = await c.query("SELECT nombre FROM migraciones ORDER BY id");
    console.log('MIGRACIONES');
    console.log(JSON.stringify(migs.rows, null, 2));
  } finally {
    await c.end();
  }
}

run().catch((e)=> { console.error(e); process.exit(1); });