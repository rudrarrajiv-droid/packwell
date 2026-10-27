import pkg from 'pg';
const { Client } = pkg;
import * as dotenv from 'dotenv';
dotenv.config();

async function seed() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log("Connected to Supabase.");

    // Seed 25/05/2026 (Previous Working Day)
    await client.query(`
      INSERT INTO public.daily_plant_mis_reports (
        report_date, self_sale_excl_gst, self_sale_incl_gst, 
        outsource_sale_excl_gst, outsource_sale_incl_gst,
        total_sale_excl_gst, total_sale_incl_gst, remarks, created_by
      ) VALUES (
        '2026-05-25', 5810200, 6100710, 1010300, 1060815, 6820500, 7161525, 'Saturday regular production', 'Admin'
      ) ON CONFLICT (report_date) DO NOTHING;
    `);

    // Seed 27/05/2026 (From User's Excel sheet)
    await client.query(`
      INSERT INTO public.daily_plant_mis_reports (
        report_date, self_sale_excl_gst, self_sale_incl_gst, 
        outsource_sale_excl_gst, outsource_sale_incl_gst,
        total_sale_excl_gst, total_sale_incl_gst, remarks, created_by
      ) VALUES (
        '2026-05-27', 6240188, 6552197, 1100000, 1177798, 7340188, 7729995, 'Full plant operating with Semi Auto under maintenance', 'Admin'
      ) ON CONFLICT (report_date) DO UPDATE SET
        self_sale_excl_gst = EXCLUDED.self_sale_excl_gst,
        self_sale_incl_gst = EXCLUDED.self_sale_incl_gst,
        outsource_sale_excl_gst = EXCLUDED.outsource_sale_excl_gst,
        outsource_sale_incl_gst = EXCLUDED.outsource_sale_incl_gst,
        total_sale_excl_gst = EXCLUDED.total_sale_excl_gst,
        total_sale_incl_gst = EXCLUDED.total_sale_incl_gst;
    `);

    // Clean previous FG items for 2026-05-27
    await client.query(`DELETE FROM public.daily_plant_mis_fg_items WHERE report_date = '2026-05-27';`);

    const fgItems = [
      ['ROYALUX', '1240mm', 1542, 0, 1],
      ['ROYALUX', 'MONO LIGHT INNER', 195, 0, 2],
      ['ROYALUX', 'MONO LIGHT OUTER', 1514, 0, 3],
      ['MAT', '01U512352', 2360, 0, 4],
      ['MAT', '01U512140', 1570, 0, 5],
      ['RBC', 'BIG', 500, 0, 6],
      ['MAT', '01U512141', 296, 0, 7],
      ['MAT', '01U512045B2W', 1972, 0, 8],
      ['MAT', '01U512361', 2582, 0, 9],
      ['MAT', '01U512360', 3058, 0, 10]
    ];

    for (const item of fgItems) {
      await client.query(`
        INSERT INTO public.daily_plant_mis_fg_items (
          report_date, vendor_name, item_name, qty_box, scrap_box, sort_order
        ) VALUES ('2026-05-27', $1, $2, $3, $4, $5);
      `, item);
    }

    // Clean previous machine logs for 2026-05-27
    await client.query(`DELETE FROM public.daily_plant_mis_machine_logs WHERE report_date = '2026-05-27';`);

    const machineLogs = [
      {
        name: 'Semi Auto Corrugation Machine',
        shift: 'Day',
        hours: 12,
        timing: '08:00 AM - 08:00 PM',
        status: 'MAINTENANCE',
        sqMtr: 0,
        kg: 0,
        ply: 0,
        paper: 0,
        scrapKg: 0,
        scrapSheet: 0,
        notes: 'MAINTENANCE',
        sort: 1,
        cutSize: []
      },
      {
        name: 'Manual Corrugation Machine',
        shift: 'Day',
        hours: 8,
        timing: '08:00 AM - 04:00 PM',
        status: 'RUNNING',
        sqMtr: 3145,
        kg: 838,
        ply: 2075,
        paper: 200,
        scrapKg: 17,
        scrapSheet: 0,
        notes: 'Cut size: 59.8" x 2075',
        sort: 2,
        cutSize: [
          { id: '1', jobName: 'Job A - Box 1240', cutSize: 59.8, qty: 2075, sqMtr: 3145 }
        ]
      },
      {
        name: 'Manual Corrugation Machine',
        shift: 'Night',
        hours: 8,
        timing: '08:00 PM - 04:00 AM',
        status: 'RUNNING',
        sqMtr: 3144,
        kg: 838,
        ply: 2075,
        paper: 200,
        scrapKg: 17,
        scrapSheet: 0,
        notes: 'Cut size: 59.8" x 2075',
        sort: 3,
        cutSize: [
          { id: '2', jobName: 'Job B - Outer Box', cutSize: 59.8, qty: 2075, sqMtr: 3144 }
        ]
      },
      {
        name: 'Pasting M/c - 1',
        shift: 'Day',
        hours: 8,
        timing: '08:00 AM - 04:00 PM',
        status: 'RUNNING',
        sqMtr: 0,
        kg: 0,
        ply: 3900,
        paper: 0,
        scrapKg: 0,
        scrapSheet: 0,
        notes: '',
        sort: 4,
        cutSize: []
      },
      {
        name: 'Pasting M/c - 2',
        shift: 'Night',
        hours: 3,
        timing: '08:00 PM - 11:00 PM',
        status: 'RUNNING',
        sqMtr: 0,
        kg: 0,
        ply: 1000,
        paper: 0,
        scrapKg: 0,
        scrapSheet: 0,
        notes: '',
        sort: 5,
        cutSize: []
      },
      {
        name: 'RS-4 Printing M/c',
        shift: 'Day',
        hours: 12,
        timing: '08:00 AM - 08:00 PM',
        status: 'RUNNING',
        sqMtr: 0,
        kg: 0,
        ply: 0,
        paper: 0,
        scrapKg: 0,
        scrapSheet: 4508,
        notes: '4508 Sheets printed',
        sort: 6,
        cutSize: []
      },
      {
        name: 'Die M/c',
        shift: 'Day',
        hours: 12,
        timing: '08:00 AM - 08:00 PM',
        status: 'RUNNING',
        sqMtr: 0,
        kg: 0,
        ply: 0,
        paper: 0,
        scrapKg: 0,
        scrapSheet: 3650,
        notes: '3650 Sheets die cut',
        sort: 7,
        cutSize: []
      },
      {
        name: 'Paper Cutting M/c',
        shift: 'General',
        hours: 12,
        timing: '08:00 AM - 08:00 PM',
        status: 'RUNNING',
        sqMtr: 4159,
        kg: 589,
        ply: 0,
        paper: 3850,
        scrapKg: 0,
        scrapSheet: 0,
        notes: 'Cut size: 42.5" x 3850',
        sort: 8,
        cutSize: [
          { id: '3', jobName: 'Reel Slitting Job', cutSize: 42.5, qty: 3850, sqMtr: 4159 }
        ]
      }
    ];

    for (const m of machineLogs) {
      await client.query(`
        INSERT INTO public.daily_plant_mis_machine_logs (
          report_date, machine_name, shift, shift_hours, shift_timing,
          status, running_sq_mtr, running_kg, total_ply, total_paper,
          scrap_kg, scrap_sheet, notes, sort_order, cut_size_breakdown
        ) VALUES (
          '2026-05-27', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        );
      `, [
        m.name, m.shift, m.hours, m.timing, m.status,
        m.sqMtr, m.kg, m.ply, m.paper, m.scrapKg, m.scrapSheet,
        m.notes, m.sort, JSON.stringify(m.cutSize)
      ]);
    }

    console.log("Seeding completed successfully for 27/05/2026!");

  } catch (err) {
    console.error("Seeding error:", err);
  } finally {
    await client.end();
  }
}

seed();
