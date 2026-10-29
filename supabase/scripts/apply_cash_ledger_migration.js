import pkg from 'pg';
const { Client } = pkg;
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from frontend/.env or root .env
const envPath = path.resolve(__dirname, '../../frontend/.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not defined in environment.");
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to Supabase Postgres.");

    const sqlPath = path.resolve(__dirname, '../sql/create_cash_ledger.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    await client.query(sqlContent);
    console.log("Migration 'create_cash_ledger.sql' executed successfully!");

  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await client.end();
  }
}

run();
