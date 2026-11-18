const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
require('dotenv').config();

async function generateCleanupSheet() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to PostgreSQL');

  // Fetch active products
  const prodRes = await client.query(`
    SELECT * FROM public.products 
    WHERE is_archived = false 
    ORDER BY customer_name ASC, item_name ASC
  `);
  console.log(`Active products count: ${prodRes.rows.length}`);

  // Fetch usage counts
  // 1. POs
  const poRes = await client.query(`
    SELECT coalesce(product_id_raw, resolved_product_id) as pid, count(*) as cnt 
    FROM public.purchase_orders 
    WHERE coalesce(product_id_raw, resolved_product_id) IS NOT NULL 
    GROUP BY coalesce(product_id_raw, resolved_product_id)
  `);
  const poUsageMap = new Map();
  poRes.rows.forEach(r => poUsageMap.set(r.pid, parseInt(r.cnt)));

  // 2. Job Cards
  const jcRes = await client.query(`
    SELECT coalesce(product_id_raw, resolved_product_id) as pid, count(*) as cnt 
    FROM public.job_cards 
    WHERE coalesce(product_id_raw, resolved_product_id) IS NOT NULL 
    GROUP BY coalesce(product_id_raw, resolved_product_id)
  `);
  const jcUsageMap = new Map();
  jcRes.rows.forEach(r => jcUsageMap.set(r.pid, parseInt(r.cnt)));

  // 3. Finish Goods
  const fgRes = await client.query(`
    SELECT product_id as pid, count(*) as cnt 
    FROM public.finish_goods 
    WHERE product_id IS NOT NULL 
    GROUP BY product_id
  `);
  const fgUsageMap = new Map();
  fgRes.rows.forEach(r => fgUsageMap.set(r.pid, parseInt(r.cnt)));

  const rows = prodRes.rows.map((p, idx) => {
    const id = p.firestore_document_id;
    const raw = p.raw_data || {};

    const poCount = poUsageMap.get(id) || 0;
    const jcCount = jcUsageMap.get(id) || 0;
    const fgCount = fgUsageMap.get(id) || 0;
    const totalUsage = poCount + jcCount + fgCount;

    // Layer specs
    const layers = p.layers || raw.layers || [];
    let topPaper = '';
    let fluting = '';
    let bottomPaper = '';
    if (Array.isArray(layers) && layers.length > 0) {
      topPaper = layers[0]?.gsm ? `${layers[0].gsm} GSM ${layers[0].bf || ''}`.trim() : (layers[0]?.paperType || '');
      if (layers.length > 1) {
        fluting = layers[1]?.gsm ? `${layers[1].gsm} GSM ${layers[1].bf || ''}`.trim() : (layers[1]?.paperType || '');
      }
      if (layers.length > 2) {
        bottomPaper = layers[layers.length - 1]?.gsm ? `${layers[layers.length - 1].gsm} GSM ${layers[layers.length - 1].bf || ''}`.trim() : (layers[layers.length - 1]?.paperType || '');
      }
    }

    return {
      'S.No': idx + 1,
      'Product ID': id,
      'Customer Name': p.customer_name || '',
      'Item Name': p.item_name || '',
      'Artwork No': p.artwork_no || '',
      'Box Type': raw.boxType || p.box_type || '',
      'Die Number': raw.dieNumber || p.die_number || '',
      'Length (mm)': p.length ?? '',
      'Width (mm)': p.width ?? '',
      'Height (mm)': p.height ?? '',
      'Reel Size (Inch)': p.reel_size ?? '',
      'Cut Size (Inch)': p.cut_size ?? '',
      'Ply': p.ply ?? '',
      'Flute': p.flute ?? '',
      'Rate (₹)': p.actual_costing ?? raw.rate ?? '',
      'Top Paper': topPaper,
      'Fluting Paper': fluting,
      'Bottom Paper': bottomPaper,
      'Color': p.color || '',
      'Pinning / Pasting': p.pin_pasting || '',
      'Pin Qty': p.pin_qty ?? '',
      'Pin Type': p.pin_type || '',
      'Ups': p.ups ?? '',
      'Creasing': p.creasing || '',
      'Packing': p.packing || '',
      'Special Requirement': p.special_requirement || '',
      'Usage Count': totalUsage,
      'Usage Details': `JC:${jcCount}, PO:${poCount}, FG:${fgCount}`,
      'Action': '', // User will write UPDATE, DELETE, MERGE, or leave blank
      'Merge Into ID': '' // Target Product ID if Action == MERGE
    };
  });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 6 },  // S.No
    { wch: 25 }, // Product ID
    { wch: 25 }, // Customer Name
    { wch: 35 }, // Item Name
    { wch: 15 }, // Artwork No
    { wch: 15 }, // Box Type
    { wch: 15 }, // Die Number
    { wch: 12 }, // Length
    { wch: 12 }, // Width
    { wch: 12 }, // Height
    { wch: 15 }, // Reel Size
    { wch: 15 }, // Cut Size
    { wch: 8 },  // Ply
    { wch: 10 }, // Flute
    { wch: 12 }, // Rate
    { wch: 18 }, // Top Paper
    { wch: 18 }, // Fluting
    { wch: 18 }, // Bottom Paper
    { wch: 12 }, // Color
    { wch: 16 }, // Pinning/Pasting
    { wch: 10 }, // Pin Qty
    { wch: 12 }, // Pin Type
    { wch: 8 },  // Ups
    { wch: 12 }, // Creasing
    { wch: 15 }, // Packing
    { wch: 20 }, // Special Requirement
    { wch: 12 }, // Usage Count
    { wch: 20 }, // Usage Details
    { wch: 14 }, // Action
    { wch: 25 }  // Merge Into ID
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Master_Products');

  const exportPath = path.join(__dirname, '..', 'Master_Products_Correction_Sheet.xlsx');
  XLSX.writeFile(workbook, exportPath);
  console.log(`Correction sheet successfully created at: ${exportPath}`);

  await client.end();
}

generateCleanupSheet().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
