import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('customers').select('name');
  if (error) console.error(error);
  console.log('Customers count:', data?.length);
  const counts = {};
  data?.forEach(d => {
    counts[d.name] = (counts[d.name] || 0) + 1;
  });
  const dupes = Object.entries(counts).filter(([name, count]) => count > 1);
  console.log('Duplicate customers:', dupes.length, dupes.slice(0, 5));

  const { data: pData } = await supabase.from('products').select('item_name, artwork_no');
  console.log('Products count:', pData?.length);
  const pCounts = {};
  pData?.forEach(d => {
    pCounts[d.artwork_no] = (pCounts[d.artwork_no] || 0) + 1;
  });
  const pDupes = Object.entries(pCounts).filter(([name, count]) => count > 1);
  console.log('Duplicate products:', pDupes.length, pDupes.slice(0, 5));
}
run();
