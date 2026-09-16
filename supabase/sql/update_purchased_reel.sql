-- Function to update a purchased reel, its INWARD transaction, and optionally its OUTWARD transaction(s) atomically
create or replace function public.update_purchased_reel(
  p_reel_id text,
  p_reel_number text,
  p_paper_type text,
  p_reel_size numeric,
  p_bf text,
  p_gsm numeric,
  p_rate numeric,
  p_weight numeric,
  p_inward_date text,
  p_supplier_name text,
  p_manufacturer_name text,
  p_user text,
  p_consumed_weight numeric default null
) returns boolean
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
  v_user text := coalesce(nullif(btrim(p_user), ''), 'System');
  v_inward_date text := coalesce(nullif(btrim(p_inward_date), ''), v_now::text);
  v_reel public.reels%rowtype;
  v_existing_consumed numeric;
  v_consumed numeric;
  v_new_balance numeric;
  v_clean_reel_no text;
  v_old_outward_sum numeric := 0;
  v_outward_diff numeric := 0;
  v_latest_outward_id text;
begin
  if p_reel_id is null or btrim(p_reel_id) = '' then
    raise exception 'Reel ID is required';
  end if;

  v_clean_reel_no := upper(coalesce(nullif(btrim(p_reel_number), ''), ''));
  if v_clean_reel_no = '' then
    raise exception 'Reel number is required';
  end if;

  if p_weight is null or p_weight <= 0 then
    raise exception 'Reel weight must be greater than 0';
  end if;

  -- Lock and read reel
  select *
    into v_reel
  from public.reels
  where firestore_document_id = p_reel_id
  for update;

  if not found then
    raise exception 'Reel not found: %', p_reel_id;
  end if;

  v_existing_consumed := greatest(0, coalesce(v_reel.weight, 0) - coalesce(v_reel.current_balance, 0));

  -- Determine target consumed weight:
  -- If p_consumed_weight is explicitly provided:
  if p_consumed_weight is not null then
    v_consumed := greatest(0, least(p_weight, p_consumed_weight));
  else
    -- If reel was fully consumed previously (balance = 0), entire reel was used in production
    if coalesce(v_reel.current_balance, 0) <= 0 then
      v_consumed := p_weight;
    else
      v_consumed := greatest(0, least(p_weight, v_existing_consumed));
    end if;
  end if;

  v_new_balance := greatest(0, p_weight - v_consumed);

  -- Update reels table
  update public.reels
  set reel_number = v_clean_reel_no,
      paper_type = nullif(btrim(p_paper_type), ''),
      reel_size = p_reel_size,
      bf = nullif(btrim(p_bf), ''),
      gsm = p_gsm,
      rate = coalesce(p_rate, 0),
      weight = p_weight,
      current_balance = v_new_balance,
      supplier_name = nullif(btrim(p_supplier_name), ''),
      supplier = nullif(btrim(p_supplier_name), ''),
      manufacturer_name = nullif(btrim(p_manufacturer_name), ''),
      inward_date = v_inward_date::timestamptz,
      updated_at = v_now,
      updated_by = v_user,
      raw_data = coalesce(v_reel.raw_data, '{}'::jsonb) || jsonb_build_object(
        'reelNumber', v_clean_reel_no,
        'paperType', nullif(btrim(p_paper_type), ''),
        'reelSize', p_reel_size,
        'bf', nullif(btrim(p_bf), ''),
        'gsm', p_gsm,
        'rate', coalesce(p_rate, 0),
        'weight', p_weight,
        'currentBalance', v_new_balance,
        'supplierName', nullif(btrim(p_supplier_name), ''),
        'manufacturerName', nullif(btrim(p_manufacturer_name), ''),
        'inwardDate', v_inward_date,
        'updatedAt', v_now,
        'updatedBy', v_user
      )
  where firestore_document_id = p_reel_id;

  -- Update corresponding INWARD transaction
  update public.reel_transactions
  set reel_number = v_clean_reel_no,
      quantity = p_weight,
      remaining_balance = p_weight,
      transaction_date = v_inward_date,
      updated_at = v_now,
      updated_by = v_user,
      raw_data = coalesce(raw_data, '{}'::jsonb) || jsonb_build_object(
        'reelNumber', v_clean_reel_no,
        'quantity', p_weight,
        'remainingBalance', p_weight,
        'date', v_inward_date,
        'updatedAt', v_now,
        'updatedBy', v_user
      )
  where reel_id = p_reel_id
    and type = 'INWARD'
    and is_archived = false;

  -- If OUTWARD transaction(s) exist, update them automatically
  if exists (select 1 from public.reel_transactions where reel_id = p_reel_id and type = 'OUTWARD' and is_archived = false) then
    select coalesce(sum(quantity), 0) into v_old_outward_sum
    from public.reel_transactions
    where reel_id = p_reel_id and type = 'OUTWARD' and is_archived = false;

    v_outward_diff := v_consumed - v_old_outward_sum;

    if v_outward_diff <> 0 then
      select firestore_document_id into v_latest_outward_id
      from public.reel_transactions
      where reel_id = p_reel_id and type = 'OUTWARD' and is_archived = false
      order by transaction_date desc, created_at desc
      limit 1;

      if v_latest_outward_id is not null then
        update public.reel_transactions
        set quantity = greatest(0, coalesce(quantity, 0) + v_outward_diff),
            remaining_balance = v_new_balance,
            reel_number = v_clean_reel_no,
            updated_at = v_now,
            updated_by = v_user,
            raw_data = coalesce(raw_data, '{}'::jsonb) || jsonb_build_object(
              'quantity', greatest(0, coalesce(quantity, 0) + v_outward_diff),
              'remainingBalance', v_new_balance,
              'reelNumber', v_clean_reel_no,
              'updatedAt', v_now,
              'updatedBy', v_user
            )
        where firestore_document_id = v_latest_outward_id;
      end if;
    else
      -- Sync reel_number on all outward transactions if name changed
      update public.reel_transactions
      set reel_number = v_clean_reel_no,
          updated_at = v_now,
          updated_by = v_user,
          raw_data = coalesce(raw_data, '{}'::jsonb) || jsonb_build_object(
            'reelNumber', v_clean_reel_no,
            'updatedAt', v_now,
            'updatedBy', v_user
          )
      where reel_id = p_reel_id and type = 'OUTWARD' and is_archived = false;
    end if;
  end if;

  return true;
end;
$$;

-- Grant execute to anon and authenticated
grant execute on function public.update_purchased_reel(
  text, text, text, numeric, text, numeric, numeric, numeric, text, text, text, text, numeric
) to anon, authenticated;

-- Ensure update on reel_transactions is permitted
grant update on table public.reel_transactions to anon, authenticated;

drop policy if exists reel_transactions_update on public.reel_transactions;
create policy reel_transactions_update
  on public.reel_transactions
  for update
  to anon, authenticated
  using (true)
  with check (true);
