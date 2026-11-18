const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkTypes() {
  const { data, error } = await supabase
    .from('job_cards')
    .select('firestore_document_id, job_card_no, product_snapshot, raw_data')
    .eq('job_card_no', '4031126');

  const row = data[0];
  console.log('typeof row.product_snapshot:', typeof row.product_snapshot);
  console.log('typeof row.raw_data:', typeof row.raw_data);
  console.log('typeof row.raw_data.productSnapshot:', typeof row.raw_data?.productSnapshot);

  console.log('\n--- row.product_snapshot.layers ---');
  row.product_snapshot.layers.forEach((l, i) => {
    console.log(`L${i}: name=${l.layerName}, alloc=${l.allocatedReels?.[0]?.allocatedWeight}`);
  });

  console.log('\n--- row.raw_data.productSnapshot.layers ---');
  row.raw_data.productSnapshot.layers.forEach((l, i) => {
    console.log(`L${i}: name=${l.layerName}, alloc=${l.allocatedReels?.[0]?.allocatedWeight}`);
  });
}
checkTypes();
