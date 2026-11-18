const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const res = await client.query("SELECT * FROM public.products WHERE item_name ILIKE '%BLACK BERRY%' OR firestore_document_id = 'f24d96cc-5ed9-4d01-965c-ef2de9a2fca6'");
  console.log('Product row count:', res.rows.length);
  for (const p of res.rows) {
    console.log('ID:', p.firestore_document_id, 'Name:', p.item_name, 'ReelSize:', p.reel_size, 'CutSize:', p.cut_size, 'Flute:', p.flute, 'Ply:', p.ply);
    console.log('Layers column:', JSON.stringify(p.layers, null, 2));
    console.log('Raw Data Layers:', JSON.stringify(p.raw_data ? p.raw_data.layers : null, null, 2));
  }
  await client.end();
}
run().catch(console.error);
