import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('job_cards').select('job_card_no, is_archived, created_at, status').order('created_at', { ascending: false }).limit(20);
  if (error) console.error(error);
  console.log(data);
}
run();
