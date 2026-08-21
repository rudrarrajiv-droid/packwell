import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log('Fetching customers...');
  const { data: customers } = await supabase.from('customers').select('*');

  const customerGroups = {};
  for (const c of customers) {
    const name = (c.name || '').trim().toLowerCase();
    if (!name) continue;
    if (!customerGroups[name]) customerGroups[name] = [];
    customerGroups[name].push(c);
  }

  let customerDuplicatesToDelete = [];
  const customerIdMap = {};

  for (const [name, group] of Object.entries(customerGroups)) {
    if (group.length > 1) {
      group.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const original = group[0];
      const duplicates = group.slice(1);

      duplicates.forEach(d => {
        customerDuplicatesToDelete.push(d.firestore_document_id);
        customerIdMap[d.firestore_document_id] = original.firestore_document_id;
      });
    }
  }

  console.log(`Found ${customerDuplicatesToDelete.length} duplicate customers to remove.`);

  console.log('Fetching products...');
  const { data: products } = await supabase.from('products').select('*');

  const productGroups = {};
  for (const p of products) {
    const art = (p.artwork_no || '').trim().toLowerCase();
    if (!art) continue;
    if (!productGroups[art]) productGroups[art] = [];
    productGroups[art].push(p);
  }

  let productDuplicatesToDelete = [];
  const productIdMap = {};

  for (const [art, group] of Object.entries(productGroups)) {
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

  console.log('Remapping customer references...');
  for (const [dupId, origId] of Object.entries(customerIdMap)) {
    await supabase.from('job_cards').update({ customer_id_raw: origId }).eq('customer_id_raw', dupId);
    await supabase.from('purchase_orders').update({ customer_id_raw: origId }).eq('customer_id_raw', dupId);
    await supabase.from('finish_goods').update({ customer_id: origId }).eq('customer_id', dupId);
    await supabase.from('finish_good_transactions').update({ customer_id: origId }).eq('customer_id', dupId);
  }

  console.log('Remapping product references...');
  for (const [dupId, origId] of Object.entries(productIdMap)) {
    await supabase.from('job_cards').update({ product_id_raw: origId }).eq('product_id_raw', dupId);
    await supabase.from('purchase_orders').update({ product_id_raw: origId }).eq('product_id_raw', dupId);
    await supabase.from('finish_goods').update({ product_id: origId }).eq('product_id', dupId);
    await supabase.from('finish_good_transactions').update({ product_id: origId }).eq('product_id', dupId);
  }

  console.log('Deleting duplicate customers...');
  if (customerDuplicatesToDelete.length > 0) {
    for (let i = 0; i < customerDuplicatesToDelete.length; i += 50) {
      const batch = customerDuplicatesToDelete.slice(i, i + 50);
      const { error } = await supabase.from('customers').update({ is_archived: true }).in('firestore_document_id', batch);
      if (error) console.error('Error deleting customers:', error);
    }
  }

  console.log('Deleting duplicate products...');
  if (productDuplicatesToDelete.length > 0) {
    for (let i = 0; i < productDuplicatesToDelete.length; i += 50) {
      const batch = productDuplicatesToDelete.slice(i, i + 50);
      const { error } = await supabase.from('products').update({ is_archived: true }).in('firestore_document_id', batch);
      if (error) console.error('Error deleting products:', error);
    }
  }

  console.log('Cleanup completed successfully!');
}

run().catch(console.error);
