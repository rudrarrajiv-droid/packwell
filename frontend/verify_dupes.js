import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: pData, error } = await supabase.from('products').select('*').eq('is_archived', false);
  if (error) console.error(error);
  console.log('Active Products count:', pData?.length);
  
  const pCounts = {};
  pData?.forEach(d => {
    const key = d.artwork_no + '|' + d.item_name;
    pCounts[key] = (pCounts[key] || 0) + 1;
  });
  
  const pDupes = Object.entries(pCounts).filter(([name, count]) => count > 1);
  console.log('Duplicate active products (artwork+item):', pDupes.length, pDupes.slice(0, 5));

  const aCounts = {};
  pData?.forEach(d => {
    const key = d.artwork_no;
    aCounts[key] = (aCounts[key] || 0) + 1;
  });
  
  const aDupes = Object.entries(aCounts).filter(([name, count]) => count > 1);
  console.log('Duplicate active products (artwork only):', aDupes.length, aDupes.slice(0, 5));
}
run();
