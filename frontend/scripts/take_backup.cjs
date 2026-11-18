const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
require('dotenv').config();

async function runBackup() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to PostgreSQL');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const tables = [
    'products',
    'customers',
    'job_cards',
    'finish_goods',
    'finish_good_transactions',
    'purchase_orders'
  ];

  const workbook = XLSX.utils.book_new();

  for (const table of tables) {
    console.log(`Backing up table: ${table}...`);
    const res = await client.query(`SELECT * FROM public.${table}`);
    console.log(`Fetched ${res.rows.length} rows for ${table}`);

    // Save JSON backup
    const jsonPath = path.join(backupDir, `${table}_backup_${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(res.rows, null, 2), 'utf8');

    // Create Excel sheet
    // Flatten rows for excel
    const flatRows = res.rows.map(row => {
      const flat = {};
      for (const [k, v] of Object.entries(row)) {
        if (v !== null && typeof v === 'object') {
          flat[k] = JSON.stringify(v);
        } else {
          flat[k] = v;
        }
      }
      return flat;
    });

    const worksheet = XLSX.utils.json_to_sheet(flatRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, table.substring(0, 31));
  }

  const excelPath = path.join(backupDir, `Packwell_Full_Backup_${timestamp}.xlsx`);
  XLSX.writeFile(workbook, excelPath);
  console.log(`Excel backup saved at: ${excelPath}`);

  await client.end();
  console.log('Backup completed successfully!');
}

runBackup().catch(err => {
  console.error('Backup error:', err);
  process.exit(1);
});
