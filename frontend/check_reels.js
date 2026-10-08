import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function check() {
  const { rows: txns } = await pool.query(
    `SELECT reel_number, type, quantity, job_card_id 
     FROM reel_transactions 
     WHERE reel_number IN ('92669', '92670', '92671', '92672')
     ORDER BY reel_number, transaction_date`
  );
  console.log("TXNS:");
  console.table(txns);
  
  await pool.end();
}
check().catch(console.error);
