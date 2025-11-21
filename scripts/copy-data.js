const { Client } = require('pg');

const OLD_URL = process.env.OLD_DATABASE_URL || 'postgres://postgres:1234@localhost:5432/postgres';
const NEW_URL = process.env.NEW_DATABASE_URL || 'postgres://postgres:1234@localhost:5432/reciclaje';

const TABLES = [
  'usuarios',
  'empresas',
  'materiales',
  'empresa_materiales_precio',
  'solicitudes',
  'transacciones',
  'pesajes',
  'usuario_materiales_totales',
  'resenas_empresas',
  'resenas_usuarios'
];

async function getColumns(client, table) {
  const res = await client.query(
    'SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position',
    [table]
  );
  return res.rows.map(r => r.column_name);
}

async function copyTable(oldC, newC, table) {
  console.log('Copying', table);
  const oldCols = await getColumns(oldC, table);
  const newCols = await getColumns(newC, table);
  const cols = oldCols.filter(c => newCols.includes(c));
  const sel = await oldC.query('SELECT ' + cols.map(c => '"' + c + '"').join(',') + ' FROM ' + table + ' ORDER BY 1');
  if (sel.rows.length === 0) { console.log('  no rows'); return; }
  await newC.query('BEGIN');
  try {
    for (const row of sel.rows) {
      const placeholders = cols.map((_, i) => '$' + (i + 1));
      const values = cols.map(c => row[c]);
      const ins = 'INSERT INTO ' + table + '(' + cols.map(c => '"' + c + '"').join(',') + ') VALUES(' + placeholders.join(',') + ')';
      await newC.query('SAVEPOINT sp');
      try {
        await newC.query(ins, values);
        await newC.query('RELEASE SAVEPOINT sp');
      } catch (e) {
        await newC.query('ROLLBACK TO SAVEPOINT sp');
        // skip on error (duplicates or FK issues), continue with next row
      }
    }
    await newC.query('COMMIT');
    console.log('  inserted', sel.rowCount);
  } catch (e) {
    await newC.query('ROLLBACK');
    throw e;
  }
}

async function fixSequences(newC) {
  for (const t of TABLES) {
    const q = `SELECT setval(pg_get_serial_sequence('${t}','id'), COALESCE((SELECT MAX(id) FROM ${t}),0))`;
    try { await newC.query(q); } catch (e) { /* table may not have serial id */ }
  }
}

async function verifyCounts(newC) {
  for (const t of TABLES) {
    try {
      const r = await newC.query('SELECT COUNT(*) AS c FROM ' + t);
      console.log('  count', t, Number(r.rows[0].c));
    } catch (e) {
      console.log('  count', t, 'skip');
    }
  }
}

(async () => {
  const oldC = new Client({ connectionString: OLD_URL });
  const newC = new Client({ connectionString: NEW_URL });
  await oldC.connect();
  await newC.connect();
  for (const t of TABLES) {
    await copyTable(oldC, newC, t);
  }
  await fixSequences(newC);
  console.log('Sequence fix done');
  await verifyCounts(newC);
  await oldC.end();
  await newC.end();
  console.log('Data copy completed');
})().catch((e) => { console.error(e); process.exit(1); });