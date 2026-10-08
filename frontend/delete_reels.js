import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  await pool.query("BEGIN");
  try {
    const { rows: reels } = await pool.query(
      `SELECT firestore_document_id as id FROM reels WHERE reel_number IN ('92669', '92670', '92671', '92672')`
    );
    const ids = reels.map(r => r.id);

    if (ids.length > 0) {
      const resAudit = await pool.query(
        `DELETE FROM reel_audit_items WHERE reel_id = ANY($1)`, [ids]
      );
      console.log(`Deleted ${resAudit.rowCount} audit items.`);

      const resTxns = await pool.query(
        `DELETE FROM reel_transactions WHERE reel_id = ANY($1)`, [ids]
      );
      console.log(`Deleted ${resTxns.rowCount} transactions.`);
      
      const resReels = await pool.query(
        `DELETE FROM reels WHERE firestore_document_id = ANY($1)`, [ids]
      );
      console.log(`Deleted ${resReels.rowCount} reels.`);
    }

    await pool.query("COMMIT");
    console.log("Successfully deleted repeated reels, their transactions, and audit items.");
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error("Error deleting:", err);
  } finally {
    await pool.end();
  }
}

run();
