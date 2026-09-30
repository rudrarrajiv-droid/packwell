import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, './supabase/.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRpc() {
  const { data, error } = await supabase.rpc('execute_fg_audit', {
    p_audit_date: '2026-09-29',
    p_items: [
      {
        fgId: null,
        productId: 'some-prod-id',
        productName: 'TEST PRODUCT',
        customerId: 'some-cust-id',
        customerName: 'TEST CUST',
        sysRegBal: 0,
        sysNmBal: 0,
        audRegBal: 10,
        audNmBal: 0,
        rate: 5
      }
    ],
    p_user: 'Test User'
  });

  console.log('Result:', { data, error });
}

testRpc();
