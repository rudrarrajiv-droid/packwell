create table if not exists public.fg_audits (
  id uuid primary key default gen_random_uuid(),
  audit_date text not null,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.fg_audit_items (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid references public.fg_audits(id) on delete cascade,
  finish_good_id text references public.finish_goods(firestore_document_id),
  product_id text references public.products(firestore_document_id),
  product_name text,
  system_regular_balance numeric,
  system_non_moving_balance numeric,
  audited_regular_balance numeric,
  audited_non_moving_balance numeric,
  regular_difference numeric,
  non_moving_difference numeric,
  rate numeric,
  created_at timestamptz not null default now()
);

alter table public.fg_audits enable row level security;
alter table public.fg_audit_items enable row level security;

drop policy if exists audit_select on public.fg_audits;
create policy audit_select on public.fg_audits for select to anon, authenticated using (true);

drop policy if exists audit_insert on public.fg_audits;
create policy audit_insert on public.fg_audits for insert to anon, authenticated with check (true);

drop policy if exists audit_items_select on public.fg_audit_items;
create policy audit_items_select on public.fg_audit_items for select to anon, authenticated using (true);

drop policy if exists audit_items_insert on public.fg_audit_items;
create policy audit_items_insert on public.fg_audit_items for insert to anon, authenticated with check (true);

drop policy if exists audit_items_update on public.fg_audit_items;
create policy audit_items_update on public.fg_audit_items for update to anon, authenticated using (true);

grant all on public.fg_audits to anon, authenticated;
grant all on public.fg_audit_items to anon, authenticated;


create or replace function public.execute_fg_audit(
  p_audit_date text,
  p_items jsonb, 
  p_user text
) returns uuid
language plpgsql
security definer
as $$
declare
  v_audit_id uuid;
  v_item jsonb;
  v_now timestamptz := now();
  v_fg_id text;
  v_transaction_id text;
  v_reg_diff numeric;
  v_nm_diff numeric;
  v_fg_record public.finish_goods%rowtype;
begin
  insert into public.fg_audits (audit_date, created_by, created_at)
  values (p_audit_date, p_user, v_now)
  returning id into v_audit_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_fg_id := v_item->>'fgId';
    v_reg_diff := (v_item->>'audRegBal')::numeric - coalesce((v_item->>'sysRegBal')::numeric, 0);
    v_nm_diff := (v_item->>'audNmBal')::numeric - coalesce((v_item->>'sysNmBal')::numeric, 0);

    if v_fg_id is null or v_fg_id = '' then
      v_fg_id := gen_random_uuid()::text;
      insert into public.finish_goods (
        firestore_document_id, product_id, product_name, customer_id, customer_name,
        opening_qty, in_qty, out_qty, closing_balance, non_moving_balance, rate,
        created_by, updated_by, created_at, updated_at, is_archived, raw_data
      ) values (
        v_fg_id, v_item->>'productId', v_item->>'productName', v_item->>'customerId', v_item->>'customerName',
        0, 0, 0, 0, 0, (v_item->>'rate')::numeric,
        p_user, p_user, v_now, v_now, false,
        jsonb_build_object(
          'id', v_fg_id, 'productId', v_item->>'productId', 'productName', v_item->>'productName',
          'customerId', v_item->>'customerId', 'customerName', v_item->>'customerName',
          'openingQty', 0, 'inQty', 0, 'outQty', 0, 'closingBalance', 0, 'nonMovingBalance', 0,
          'rate', (v_item->>'rate')::numeric, 'createdBy', p_user, 'updatedBy', p_user,
          'createdAt', v_now, 'updatedAt', v_now, 'isArchived', false
        )
      );
    end if;

    select * into v_fg_record from public.finish_goods where firestore_document_id = v_fg_id for update;

    update public.finish_goods
    set closing_balance = coalesce(closing_balance, 0) + v_reg_diff,
        non_moving_balance = coalesce(non_moving_balance, 0) + v_nm_diff,
        rate = coalesce((v_item->>'rate')::numeric, rate),
        updated_at = v_now,
        updated_by = p_user,
        raw_data = coalesce(raw_data, '{}'::jsonb) || jsonb_build_object(
          'closingBalance', coalesce(closing_balance, 0) + v_reg_diff,
          'nonMovingBalance', coalesce(non_moving_balance, 0) + v_nm_diff,
          'rate', coalesce((v_item->>'rate')::numeric, rate),
          'updatedAt', v_now,
          'updatedBy', p_user
        )
    where firestore_document_id = v_fg_id;

    insert into public.fg_audit_items (
      audit_id, finish_good_id, product_id, product_name,
      system_regular_balance, system_non_moving_balance,
      audited_regular_balance, audited_non_moving_balance,
      regular_difference, non_moving_difference, rate, created_at
    ) values (
      v_audit_id, v_fg_id, v_item->>'productId', v_item->>'productName',
      coalesce((v_item->>'sysRegBal')::numeric, 0), coalesce((v_item->>'sysNmBal')::numeric, 0),
      coalesce((v_item->>'audRegBal')::numeric, 0), coalesce((v_item->>'audNmBal')::numeric, 0),
      v_reg_diff, v_nm_diff, (v_item->>'rate')::numeric, v_now
    );

    if v_reg_diff <> 0 then
      v_transaction_id := gen_random_uuid()::text;
      insert into public.finish_good_transactions (
        firestore_document_id, finish_good_id, type, category, quantity, remaining_balance,
        rate, transaction_date, reference_no, performed_by, created_by, updated_by,
        created_at, updated_at, is_archived, raw_data
      ) values (
        v_transaction_id, v_fg_id, case when v_reg_diff > 0 then 'IN' else 'OUT' end, 'ADJUSTMENT', abs(v_reg_diff), coalesce(v_fg_record.closing_balance, 0) + v_reg_diff,
        coalesce((v_item->>'rate')::numeric, v_fg_record.rate), p_audit_date, 'Audit Adj (Reg)', p_user, p_user, p_user,
        v_now, v_now, false,
        jsonb_build_object(
          'id', v_transaction_id, 'finishGoodId', v_fg_id,
          'type', case when v_reg_diff > 0 then 'IN' else 'OUT' end,
          'category', 'ADJUSTMENT', 'quantity', abs(v_reg_diff),
          'remainingBalance', coalesce(v_fg_record.closing_balance, 0) + v_reg_diff,
          'rate', coalesce((v_item->>'rate')::numeric, v_fg_record.rate),
          'date', p_audit_date, 'referenceNo', 'Audit Adj (Reg)',
          'performedBy', p_user, 'createdBy', p_user, 'updatedBy', p_user,
          'createdAt', v_now, 'updatedAt', v_now, 'isArchived', false
        )
      );
    end if;

    if v_nm_diff <> 0 then
      v_transaction_id := gen_random_uuid()::text;
      insert into public.finish_good_transactions (
        firestore_document_id, finish_good_id, type, category, quantity, remaining_balance,
        rate, transaction_date, reference_no, performed_by, created_by, updated_by,
        created_at, updated_at, is_archived, raw_data
      ) values (
        v_transaction_id, v_fg_id, case when v_nm_diff > 0 then 'IN' else 'OUT' end, 'ADJUSTMENT', abs(v_nm_diff), coalesce(v_fg_record.non_moving_balance, 0) + v_nm_diff,
        coalesce((v_item->>'rate')::numeric, v_fg_record.rate), p_audit_date, 'Audit Adj (NM)', p_user, p_user, p_user,
        v_now, v_now, false,
        jsonb_build_object(
          'id', v_transaction_id, 'finishGoodId', v_fg_id,
          'type', case when v_nm_diff > 0 then 'IN' else 'OUT' end,
          'category', 'ADJUSTMENT', 'quantity', abs(v_nm_diff),
          'remainingBalance', coalesce(v_fg_record.non_moving_balance, 0) + v_nm_diff,
          'rate', coalesce((v_item->>'rate')::numeric, v_fg_record.rate),
          'date', p_audit_date, 'referenceNo', 'Audit Adj (NM)',
          'performedBy', p_user, 'createdBy', p_user, 'updatedBy', p_user,
          'createdAt', v_now, 'updatedAt', v_now, 'isArchived', false
        )
      );
    end if;
  end loop;

  return v_audit_id;
end;
$$;

grant execute on function public.execute_fg_audit(text, jsonb, text) to anon, authenticated;

create or replace function public.update_fg_audit_item(
  p_item_id uuid,
  p_audited_regular numeric,
  p_audited_non_moving numeric,
  p_user text
) returns boolean
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
  v_item public.fg_audit_items%rowtype;
  v_fg public.finish_goods%rowtype;
  v_reg_delta numeric;
  v_nm_delta numeric;
  v_transaction_id text;
begin
  select * into v_item from public.fg_audit_items where id = p_item_id for update;
  if not found then
    raise exception 'Audit item not found';
  end if;

  select * into v_fg from public.finish_goods where firestore_document_id = v_item.finish_good_id for update;
  if not found then
    raise exception 'Finish Good not found';
  end if;

  v_reg_delta := p_audited_regular - coalesce(v_item.audited_regular_balance, 0);
  v_nm_delta := p_audited_non_moving - coalesce(v_item.audited_non_moving_balance, 0);

  update public.fg_audit_items
  set audited_regular_balance = p_audited_regular,
      audited_non_moving_balance = p_audited_non_moving,
      regular_difference = p_audited_regular - system_regular_balance,
      non_moving_difference = p_audited_non_moving - system_non_moving_balance
  where id = p_item_id;

  update public.finish_goods
  set closing_balance = coalesce(closing_balance, 0) + v_reg_delta,
      non_moving_balance = coalesce(non_moving_balance, 0) + v_nm_delta,
      updated_at = v_now,
      updated_by = p_user,
      raw_data = coalesce(raw_data, '{}'::jsonb) || jsonb_build_object(
        'closingBalance', coalesce(closing_balance, 0) + v_reg_delta,
        'nonMovingBalance', coalesce(non_moving_balance, 0) + v_nm_delta,
        'updatedAt', v_now,
        'updatedBy', p_user
      )
  where firestore_document_id = v_item.finish_good_id;

  if v_reg_delta <> 0 then
    v_transaction_id := gen_random_uuid()::text;
    insert into public.finish_good_transactions (
      firestore_document_id, finish_good_id, type, category, quantity, remaining_balance,
      rate, transaction_date, reference_no, performed_by, created_by, updated_by,
      created_at, updated_at, is_archived, raw_data
    ) values (
      v_transaction_id, v_item.finish_good_id, case when v_reg_delta > 0 then 'IN' else 'OUT' end, 'CORRECTION', abs(v_reg_delta), coalesce(v_fg.closing_balance, 0) + v_reg_delta,
      v_item.rate, v_now::date::text, 'Audit Correction (Reg)', p_user, p_user, p_user,
      v_now, v_now, false,
      jsonb_build_object(
        'id', v_transaction_id, 'finishGoodId', v_item.finish_good_id,
        'type', case when v_reg_delta > 0 then 'IN' else 'OUT' end,
        'category', 'CORRECTION', 'quantity', abs(v_reg_delta),
        'remainingBalance', coalesce(v_fg.closing_balance, 0) + v_reg_delta,
        'rate', v_item.rate,
        'date', v_now::date::text, 'referenceNo', 'Audit Correction (Reg)',
        'performedBy', p_user, 'createdBy', p_user, 'updatedBy', p_user,
        'createdAt', v_now, 'updatedAt', v_now, 'isArchived', false
      )
    );
  end if;

  if v_nm_delta <> 0 then
    v_transaction_id := gen_random_uuid()::text;
    insert into public.finish_good_transactions (
      firestore_document_id, finish_good_id, type, category, quantity, remaining_balance,
      rate, transaction_date, reference_no, performed_by, created_by, updated_by,
      created_at, updated_at, is_archived, raw_data
    ) values (
      v_transaction_id, v_item.finish_good_id, case when v_nm_delta > 0 then 'IN' else 'OUT' end, 'CORRECTION', abs(v_nm_delta), coalesce(v_fg.non_moving_balance, 0) + v_nm_delta,
      v_item.rate, v_now::date::text, 'Audit Correction (NM)', p_user, p_user, p_user,
      v_now, v_now, false,
      jsonb_build_object(
        'id', v_transaction_id, 'finishGoodId', v_item.finish_good_id,
        'type', case when v_nm_delta > 0 then 'IN' else 'OUT' end,
        'category', 'CORRECTION', 'quantity', abs(v_nm_delta),
        'remainingBalance', coalesce(v_fg.non_moving_balance, 0) + v_nm_delta,
        'rate', v_item.rate,
        'date', v_now::date::text, 'referenceNo', 'Audit Correction (NM)',
        'performedBy', p_user, 'createdBy', p_user, 'updatedBy', p_user,
        'createdAt', v_now, 'updatedAt', v_now, 'isArchived', false
      )
    );
  end if;

  return true;
end;
$$;

grant execute on function public.update_fg_audit_item(uuid, numeric, numeric, text) to anon, authenticated;
