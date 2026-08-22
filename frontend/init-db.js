import pkg from 'pg';
const { Client } = pkg;
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    
    // Create the table
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.user_credentials (
        user_id TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // Enable RLS
    await client.query(`ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;`);
    
    // Create policies for anon/authenticated roles (since we use anon keys)
    // We allow full access as this is a simple internal app with hardcoded users.
    await client.query(`
      DROP POLICY IF EXISTS "Allow full access to user_credentials" ON public.user_credentials;
      CREATE POLICY "Allow full access to user_credentials" ON public.user_credentials
        FOR ALL
        USING (true)
        WITH CHECK (true);
    `);

    console.log("Table 'user_credentials' created successfully.");
  } catch (err) {
    console.error("Error creating table:", err);
  } finally {
    await client.end();
  }
}

run();
