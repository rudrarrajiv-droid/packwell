require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });

client.connect().then(async () => {
  const res = await client.query('SELECT id, "itemName", "customerName", "customer_id", "createdAt", "createdBy", raw_data FROM products WHERE "customerName" = $1 LIMIT 5', ['MAT']);
  console.log(JSON.stringify(res.rows, null, 2));
  process.exit(0);
}).catch(console.error);
