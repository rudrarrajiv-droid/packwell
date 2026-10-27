import pkg from 'pg';
const { Client } = pkg;
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log("Connected to Supabase Postgres.");

    const sqlPath = path.resolve(__dirname, '../supabase/sql/create_plant_daily_mis.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    await client.query(sqlContent);
    console.log("Migration 'create_plant_daily_mis.sql' executed successfully!");

  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await client.end();
  }
}

run();
