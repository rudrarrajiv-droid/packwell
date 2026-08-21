import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const dbUrl = process.env.DATABASE_URL;

const client = new Client({
  connectionString: dbUrl,
});

async function main() {
  try {
    await client.connect();
    console.log("Connected to DB.");

    await client.query(`
    create or replace function public.execute_finish_good_outward_transaction(
      p_logistics jsonb,
      p_payloads jsonb,
      p_user text
    ) returns boolean
    language plpgsql
    security definer
    set search_path = public
    as $$
    declare
      v_now timestamptz := now();
      v_user text := coalesce(nullif(btrim(p_user), ''), 'System');
      v_payload jsonb;
      v_product_id text;
      v_quantity numeric;
      v_category text;
      v_transaction_id text;
      v_loaded_fg_ids text[] := '{}';
      v_fg_snapshots jsonb := '{}'::jsonb;
      v_fg public.finish_goods%rowtype;
      v_fg_json jsonb;
      v_in_qty numeric;
      v_out_qty numeric;
      v_closing_balance numeric;
      v_non_moving_balance numeric;
      v_new_out_qty numeric;
      v_new_closing_balance numeric;
      v_new_non_moving_balance numeric;
      v_remaining_balance numeric;
    begin
      if p_payloads is null or jsonb_typeof(p_payloads) <> 'array' or jsonb_array_length(p_payloads) = 0 then
        raise exception 'At least one finish goods outward row is required';
      end if;

      for v_payload in select value from jsonb_array_elements(p_payloads) loop
        v_product_id := nullif(btrim(coalesce(v_payload ->> 'productId', '')), '');
        if v_product_id is null then raise exception 'Finish Good product ID is required'; end if;

        if not coalesce(v_product_id = any(v_loaded_fg_ids), false) then
          select * into v_fg from public.finish_goods where firestore_document_id = v_product_id for update;
          if not found then raise exception 'Finish Good record not found for product %', v_product_id; end if;
          v_fg_snapshots := v_fg_snapshots || jsonb_build_object(v_product_id, to_jsonb(v_fg));
          v_loaded_fg_ids := array_append(v_loaded_fg_ids, v_product_id);
        end if;
      end loop;

      for v_payload in select value from jsonb_array_elements(p_payloads) loop
        v_product_id := nullif(btrim(coalesce(v_payload ->> 'productId', '')), '');
        v_quantity := coalesce(nullif(v_payload ->> 'quantity', '')::numeric, 0);
        v_category := coalesce(v_payload ->> 'category', '');
        v_transaction_id := nullif(btrim(coalesce(v_payload ->> 'transactionId', '')), '');
        if v_transaction_id is null then raise exception 'Finish Good transaction ID is required'; end if;

        v_fg_json := v_fg_snapshots -> v_product_id;
        v_in_qty := coalesce(nullif(v_fg_json ->> 'in_qty', '')::numeric, 0);
        v_out_qty := coalesce(nullif(v_fg_json ->> 'out_qty', '')::numeric, 0);
        v_closing_balance := coalesce(nullif(v_fg_json ->> 'closing_balance', '')::numeric, 0);
        v_non_moving_balance := coalesce(nullif(v_fg_json ->> 'non_moving_balance', '')::numeric, 0);
        v_new_out_qty := v_out_qty + v_quantity;
        v_new_closing_balance := v_closing_balance;
        v_new_non_moving_balance := v_non_moving_balance;

        if v_category = 'DISPATCH' then
          v_new_closing_balance := v_new_closing_balance - v_quantity;
        elsif v_category = 'NON-MOVING' or v_category = 'REJECTED' then
          v_new_non_moving_balance := v_new_non_moving_balance - v_quantity;
        end if;

        update public.finish_goods
        set out_qty = v_new_out_qty,
            closing_balance = v_new_closing_balance,
            non_moving_balance = v_new_non_moving_balance,
            updated_at = v_now,
            updated_by = v_user,
            raw_data = coalesce(raw_data, '{}'::jsonb) || jsonb_build_object(
              'outQty', v_new_out_qty,
              'closingBalance', v_new_closing_balance,
              'nonMovingBalance', v_new_non_moving_balance,
              'updatedAt', v_now,
              'updatedBy', v_user
            )
        where firestore_document_id = v_product_id;

        v_remaining_balance := case when v_category = 'DISPATCH' then v_new_closing_balance else v_new_non_moving_balance end;

        insert into public.finish_good_transactions (
          firestore_document_id, finish_good_id, type, category, quantity, remaining_balance, rate, transaction_date, reference_id, reference_no, invoice_no, place, transporter_name, vehicle_no, vehicle_size, freight, holding, point, others, receiving_status, receiving_confirmed_at, receiving_confirmed_by, performed_by, created_by, updated_by, created_at, updated_at, is_archived, raw_data, imported_at, synced_at
        ) values (
          v_transaction_id, v_product_id, 'OUT', nullif(v_category, ''), v_quantity, v_remaining_balance, null, nullif(p_logistics ->> 'date', ''), null, nullif(p_logistics ->> 'invoiceNo', ''), nullif(p_logistics ->> 'invoiceNo', ''), nullif(p_logistics ->> 'place', ''), nullif(p_logistics ->> 'transporterName', ''), nullif(p_logistics ->> 'vehicleNo', ''), nullif(p_logistics ->> 'vehicleSize', ''), nullif(p_logistics ->> 'freight', '')::numeric, nullif(p_logistics ->> 'holding', '')::numeric, nullif(p_logistics ->> 'point', ''), nullif(p_logistics ->> 'others', ''), null, null, null, v_user, v_user, v_user, v_now, v_now, false,
          jsonb_build_object(
            'finishGoodId', v_product_id, 'type', 'OUT', 'category', nullif(v_category, ''), 'quantity', v_quantity, 'remainingBalance', v_remaining_balance, 'performedBy', v_user, 'createdAt', v_now, 'updatedAt', v_now, 'createdBy', v_user, 'updatedBy', v_user, 'isArchived', false, 'date', nullif(p_logistics ->> 'date', ''), 'invoiceNo', nullif(p_logistics ->> 'invoiceNo', ''), 'place', nullif(p_logistics ->> 'place', ''), 'transporterName', nullif(p_logistics ->> 'transporterName', ''), 'vehicleNo', nullif(p_logistics ->> 'vehicleNo', ''), 'vehicleSize', nullif(p_logistics ->> 'vehicleSize', ''), 'freight', nullif(p_logistics ->> 'freight', '')::numeric, 'holding', nullif(p_logistics ->> 'holding', '')::numeric, 'point', nullif(p_logistics ->> 'point', ''), 'others', nullif(p_logistics ->> 'others', ''), 'referenceNo', nullif(p_logistics ->> 'invoiceNo', '')
          ),
          now(), now()
        );
      end loop;
      return true;
    end;
    $$;
    `);
    console.log("Updated function execute_finish_good_outward_transaction!");
  } catch (err) {
    console.error("Error executing query", err);
  } finally {
    await client.end();
  }
}

main();
