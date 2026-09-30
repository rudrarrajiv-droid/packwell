create table if not exists public.reel_audits (
  id uuid primary key default gen_random_uuid(),
  audit_date text not null,
  created_by text,
  total_difference numeric default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.reel_audit_items (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid references public.reel_audits(id) on delete cascade,
  reel_id text references public.reels(firestore_document_id),
  reel_number text,
  system_weight numeric,
  system_balance numeric,
  audited_weight numeric,
  audited_in numeric,
  audited_out numeric,
  audited_balance numeric,
  difference numeric,
  created_at timestamptz not null default now()
);

create or replace function public.execute_reel_audit(
  p_audit_date text,
  p_items jsonb,
  p_user text
) returns boolean
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
  v_audit_id uuid := gen_random_uuid();
  v_item jsonb;
  v_reel_id text;
  v_reel public.reels%rowtype;
  v_audited_weight numeric;
  v_audited_balance numeric;
  v_system_weight numeric;
  v_system_balance numeric;
  v_difference numeric;
  v_total_difference numeric := 0;
  v_transaction_id text;
begin
  -- Insert into reel_audits
  insert into public.reel_audits (id, audit_date, created_by, created_at)
  values (v_audit_id, p_audit_date, p_user, v_now);

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_reel_id := v_item ->> 'reelId';
    v_audited_weight := coalesce((v_item ->> 'auditedWeight')::numeric, 0);
    v_audited_balance := coalesce((v_item ->> 'auditedBalance')::numeric, 0);
    v_system_weight := coalesce((v_item ->> 'systemWeight')::numeric, 0);
    v_system_balance := coalesce((v_item ->> 'systemBalance')::numeric, 0);
    v_difference := v_audited_balance - v_system_balance;
    v_total_difference := v_total_difference + v_difference;
    
    insert into public.reel_audit_items (
      audit_id, reel_id, reel_number, system_weight, system_balance,
      audited_weight, audited_in, audited_out, audited_balance, difference
    ) values (
      v_audit_id, v_reel_id, v_item ->> 'reelNumber', v_system_weight, v_system_balance,
      v_audited_weight, coalesce((v_item ->> 'auditedIn')::numeric, 0), coalesce((v_item ->> 'auditedOut')::numeric, 0),
      v_audited_balance, v_difference
    );

    -- Update reel
    select * into v_reel from public.reels where firestore_document_id = v_reel_id for update;
    
    update public.reels
    set weight = v_audited_weight,
        current_balance = v_audited_balance,
        updated_at = v_now,
        updated_by = p_user,
        raw_data = coalesce(v_reel.raw_data, '{}'::jsonb) || jsonb_build_object(
          'weight', v_audited_weight,
          'currentBalance', v_audited_balance,
          'updatedAt', v_now,
          'updatedBy', p_user
        )
    where firestore_document_id = v_reel_id;

    -- Add transaction if there's a difference in balance
    if v_difference <> 0 then
      v_transaction_id := gen_random_uuid()::text;
      insert into public.reel_transactions (
        firestore_document_id, reel_id, reel_number, type, quantity, remaining_balance,
        performed_by, notes, transaction_date, is_archived, created_by, updated_by,
        created_at, updated_at, raw_data, imported_at, synced_at
      ) values (
        v_transaction_id, v_reel_id, v_item ->> 'reelNumber', 
        case when v_difference > 0 then 'INWARD' else 'OUTWARD' end,
        abs(v_difference), v_audited_balance, p_user, 'Audit Adjustment', p_audit_date,
        false, p_user, p_user, v_now, v_now,
        jsonb_build_object(
          'reelId', v_reel_id,
          'reelNumber', v_item ->> 'reelNumber',
          'type', case when v_difference > 0 then 'INWARD' else 'OUTWARD' end,
          'quantity', abs(v_difference),
          'remainingBalance', v_audited_balance,
          'performedBy', p_user,
          'date', p_audit_date,
          'notes', 'Audit Adjustment',
          'createdAt', v_now,
          'updatedAt', v_now,
          'createdBy', p_user,
          'updatedBy', p_user,
          'isArchived', false
        ),
        v_now, v_now
      );
    end if;
  end loop;

  update public.reel_audits set total_difference = v_total_difference where id = v_audit_id;

  return true;
end;
$$;

alter table public.reel_audits enable row level security;
alter table public.reel_audit_items enable row level security;

drop policy if exists audit_select on public.reel_audits;
create policy audit_select on public.reel_audits for select to anon, authenticated using (true);

drop policy if exists audit_insert on public.reel_audits;
create policy audit_insert on public.reel_audits for insert to anon, authenticated with check (true);

drop policy if exists audit_items_select on public.reel_audit_items;
create policy audit_items_select on public.reel_audit_items for select to anon, authenticated using (true);

drop policy if exists audit_items_insert on public.reel_audit_items;
create policy audit_items_insert on public.reel_audit_items for insert to anon, authenticated with check (true);

drop policy if exists audit_items_update on public.reel_audit_items;
create policy audit_items_update on public.reel_audit_items for update to anon, authenticated using (true);

grant all on public.reel_audits to anon, authenticated;
grant all on public.reel_audit_items to anon, authenticated;
grant execute on function public.execute_reel_audit(text, jsonb, text) to anon, authenticated;

create or replace function public.update_reel_audit_item(
  p_item_id uuid,
  p_audited_weight numeric,
  p_audited_in numeric,
  p_audited_out numeric,
  p_audited_balance numeric,
  p_user text
) returns boolean
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
  v_item public.reel_audit_items%rowtype;
  v_reel public.reels%rowtype;
  v_new_difference numeric;
  v_balance_delta numeric;
  v_weight_delta numeric;
  v_transaction_id text;
begin
  select * into v_item from public.reel_audit_items where id = p_item_id for update;
  if not found then
    raise exception 'Audit item not found';
  end if;

  select * into v_reel from public.reels where firestore_document_id = v_item.reel_id for update;
  if not found then
    raise exception 'Reel not found';
  end if;

  v_balance_delta := p_audited_balance - coalesce(v_item.audited_balance, 0);
  v_weight_delta := p_audited_weight - coalesce(v_item.audited_weight, 0);
  v_new_difference := p_audited_balance - coalesce(v_item.system_balance, 0);

  update public.reel_audit_items
  set audited_weight = p_audited_weight,
      audited_in = p_audited_in,
      audited_out = p_audited_out,
      audited_balance = p_audited_balance,
      difference = v_new_difference
  where id = p_item_id;

  update public.reel_audits
  set total_difference = coalesce(total_difference, 0) + (v_new_difference - coalesce(v_item.difference, 0))
  where id = v_item.audit_id;

  update public.reels
  set weight = weight + v_weight_delta,
      current_balance = current_balance + v_balance_delta,
      updated_at = v_now,
      updated_by = p_user,
      raw_data = coalesce(raw_data, '{}'::jsonb) || jsonb_build_object(
        'weight', weight + v_weight_delta,
        'currentBalance', current_balance + v_balance_delta,
        'updatedAt', v_now,
        'updatedBy', p_user
      )
  where firestore_document_id = v_item.reel_id;

  if v_balance_delta <> 0 then
    v_transaction_id := gen_random_uuid()::text;
    insert into public.reel_transactions (
      firestore_document_id, reel_id, reel_number, type, quantity, remaining_balance,
      performed_by, notes, transaction_date, is_archived, created_by, updated_by,
      created_at, updated_at, raw_data, imported_at, synced_at
    ) values (
      v_transaction_id, v_item.reel_id, v_item.reel_number,
      case when v_balance_delta > 0 then 'INWARD' else 'OUTWARD' end,
      abs(v_balance_delta), v_reel.current_balance + v_balance_delta, p_user, 'Audit Correction', v_now::date::text,
      false, p_user, p_user, v_now, v_now,
      jsonb_build_object(
        'reelId', v_item.reel_id,
        'reelNumber', v_item.reel_number,
        'type', case when v_balance_delta > 0 then 'INWARD' else 'OUTWARD' end,
        'quantity', abs(v_balance_delta),
        'remainingBalance', v_reel.current_balance + v_balance_delta,
        'performedBy', p_user,
        'date', v_now::date::text,
        'notes', 'Audit Correction',
        'createdAt', v_now,
        'updatedAt', v_now,
        'createdBy', p_user,
        'updatedBy', p_user,
        'isArchived', false
      ),
      v_now, v_now
    );
  end if;

  return true;
end;
$$;

grant execute on function public.update_reel_audit_item(uuid, numeric, numeric, numeric, numeric, text) to anon, authenticated;
