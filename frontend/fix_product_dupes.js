import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log('Fetching products...');
  const { data: products } = await supabase.from('products').select('*').eq('is_archived', false);
  
  const productGroups = {};
  for (const p of products) {
    const art = (p.artwork_no || '').trim().toLowerCase();
    const item = (p.item_name || '').trim().toLowerCase();
    const key = art + '|' + item;
    if (!key || key === '|') continue;
    
    if (!productGroups[key]) productGroups[key] = [];
    productGroups[key].push(p);
  }

  let productDuplicatesToDelete = [];
  const productIdMap = {};

  for (const [key, group] of Object.entries(productGroups)) {
    if (group.length > 1) {
      group.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const original = group[0];
      const duplicates = group.slice(1);
      
      duplicates.forEach(d => {
        productDuplicatesToDelete.push(d.firestore_document_id);
        productIdMap[d.firestore_document_id] = original.firestore_document_id;
      });
    }
  }

  console.log(`Found ${productDuplicatesToDelete.length} duplicate products to remove.`);

  if (productDuplicatesToDelete.length === 0) return;

  console.log('Remapping product references...');
  for (const [dupId, origId] of Object.entries(productIdMap)) {
    await supabase.from('job_cards').update({ product_id_raw: origId }).eq('product_id_raw', dupId);
    await supabase.from('purchase_orders').update({ product_id_raw: origId }).eq('product_id_raw', dupId);
    await supabase.from('finish_goods').update({ product_id: origId }).eq('product_id', dupId);
    await supabase.from('finish_good_transactions').update({ product_id: origId }).eq('product_id', dupId);
  }

  console.log('Archiving duplicate products...');
  for (let i = 0; i < productDuplicatesToDelete.length; i += 50) {
    const batch = productDuplicatesToDelete.slice(i, i + 50);
    const { error } = await supabase.from('products').update({ is_archived: true }).in('firestore_document_id', batch);
    if (error) console.error('Error archiving products:', error);
  }

  console.log('Cleanup completed successfully!');
}

run().catch(console.error);
