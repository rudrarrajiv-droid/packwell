alter table public.job_cards enable row level security;

revoke all on table public.job_cards from anon, authenticated;
grant select, insert, update on table public.job_cards to anon, authenticated;
revoke delete, truncate, references, trigger on table public.job_cards from anon, authenticated;

drop policy if exists job_cards_select on public.job_cards;
create policy job_cards_select
  on public.job_cards
  for select
  to anon, authenticated
  using (true);

drop policy if exists job_cards_insert on public.job_cards;
create policy job_cards_insert
  on public.job_cards
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists job_cards_update on public.job_cards;
create policy job_cards_update
  on public.job_cards
  for update
  to anon, authenticated
  using (true)
  with check (true);

create or replace function public.execute_job_card_transaction(
  p_job_id text,
  p_new_payload jsonb,
  p_user text,
  p_is_create boolean
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_user text := coalesce(nullif(btrim(p_user), ''), 'System');
  v_job_id text := nullif(btrim(coalesce(p_job_id, '')), '');
  v_existing public.job_cards%rowtype;
  v_old_state jsonb := '{}'::jsonb;
  v_final_state jsonb := coalesce(p_new_payload, '{}'::jsonb);
  v_is_old_active boolean := false;
  v_is_new_active boolean := false;
  v_delta record;
  v_reel public.reels%rowtype;
  v_current_reserved numeric;
  v_new_reserved numeric;
  v_job_card_no text;
  v_existing_recycled jsonb;
  v_new_recycled jsonb;
begin
  if v_job_id is null then
    raise exception 'Job Card ID is required';
  end if;

  if p_is_create then
    if exists (
      select 1
      from public.job_cards
      where firestore_document_id = v_job_id
    ) then
      raise exception 'Job Card already exists';
    end if;
  else
    select *
      into v_existing
    from public.job_cards
    where firestore_document_id = v_job_id
    for update;

    if not found then
      raise exception 'Job Card not found';
    end if;

    v_old_state := coalesce(v_existing.raw_data, '{}'::jsonb);
    v_final_state := v_old_state || coalesce(p_new_payload, '{}'::jsonb);
    v_is_old_active := coalesce(v_old_state ->> 'status', '') in ('PENDING', 'PENDING APPROVAL', 'IN_PROCESS')
                       and coalesce((v_old_state ->> 'isArchived')::boolean, false) = false;
  end if;

  v_is_new_active := coalesce(v_final_state ->> 'status', '') in ('PENDING', 'PENDING APPROVAL', 'IN_PROCESS')
                     and coalesce((v_final_state ->> 'isArchived')::boolean, false) = false;

  for v_delta in
    with old_allocations as (
      select reel_id, max(reel_number) as reel_number, sum(weight) as total_weight
      from (
        select nullif(btrim(coalesce(alloc.alloc_value ->> 'reelId', '')), '') as reel_id,
               coalesce(alloc.alloc_value ->> 'reelNumber', '') as reel_number,
               coalesce(nullif(alloc.alloc_value ->> 'allocatedWeight', '')::numeric, 0) as weight
        from jsonb_array_elements(
               case
                 when v_is_old_active then coalesce(v_old_state -> 'productSnapshot' -> 'layers', '[]'::jsonb)
                 else '[]'::jsonb
               end
             ) as layer(layer_value)
        cross join lateral jsonb_array_elements(coalesce(layer.layer_value -> 'allocatedReels', '[]'::jsonb)) as alloc(alloc_value)
      ) as expanded
      where reel_id is not null
      group by reel_id
    ),
    new_allocations as (
      select reel_id, max(reel_number) as reel_number, sum(weight) as total_weight
      from (
        select nullif(btrim(coalesce(alloc.alloc_value ->> 'reelId', '')), '') as reel_id,
               coalesce(alloc.alloc_value ->> 'reelNumber', '') as reel_number,
               coalesce(nullif(alloc.alloc_value ->> 'allocatedWeight', '')::numeric, 0) as weight
        from jsonb_array_elements(
               case
                 when v_is_new_active then coalesce(v_final_state -> 'productSnapshot' -> 'layers', '[]'::jsonb)
                 else '[]'::jsonb
               end
             ) as layer(layer_value)
        cross join lateral jsonb_array_elements(coalesce(layer.layer_value -> 'allocatedReels', '[]'::jsonb)) as alloc(alloc_value)
      ) as expanded
      where reel_id is not null
      group by reel_id
    )
    select coalesce(new_allocations.reel_id, old_allocations.reel_id) as reel_id,
           coalesce(new_allocations.reel_number, old_allocations.reel_number, '') as reel_number,
           coalesce(new_allocations.total_weight, 0) - coalesce(old_allocations.total_weight, 0) as delta
    from old_allocations
    full outer join new_allocations
      on new_allocations.reel_id = old_allocations.reel_id
    where abs(coalesce(new_allocations.total_weight, 0) - coalesce(old_allocations.total_weight, 0)) >= 0.001
  loop
    select *
      into v_reel
    from public.reels
    where firestore_document_id = v_delta.reel_id
    for update;

    if not found then
      if v_delta.delta < 0 then
        continue;
      end if;
      raise exception 'Reel % does not exist.', v_delta.reel_number;
    end if;

    v_current_reserved := coalesce(v_reel.active_reserved_weight, 0);
    v_new_reserved := v_current_reserved + v_delta.delta;

    if v_delta.delta > 0.001 and v_new_reserved > coalesce(v_reel.current_balance, 0) + 0.1 then
      raise exception 'Insufficient available weight for Reel %. Available: % Kg, Requested Extra: % Kg.%s%s',
        coalesce(v_reel.reel_number, v_delta.reel_number),
        coalesce(v_reel.current_balance, 0) - v_current_reserved,
        v_delta.delta,
        E'\n\n',
        'Reel availability has changed. Please review the reel allocation.';
    end if;

    update public.reels
    set active_reserved_weight = greatest(0, v_new_reserved),
        updated_at = v_now,
        updated_by = v_user,
        raw_data = coalesce(v_reel.raw_data, '{}'::jsonb) || jsonb_build_object(
          'activeReservedWeight', greatest(0, v_new_reserved),
          'updatedAt', v_now,
          'updatedBy', v_user
        )
    where firestore_document_id = v_delta.reel_id;
  end loop;

  if p_is_create then
    insert into public.job_cards (
      firestore_document_id,
      job_card_no,
      target_date_raw,
      target_date,
      po_id_raw,
      po_no,
      resolved_po_id,
      customer_id_raw,
      customer_name,
      resolved_customer_id,
      product_id_raw,
      product_name,
      resolved_product_id,
      order_qty,
      one_box_weight,
      total_weight,
      paper_quantity,
      ply_quantity,
      priority,
      remarks,
      product_snapshot,
      reel_allocation_skipped,
      approval_status,
      approval_reason,
      approval_requested_by,
      approval_requested_at,
      approval_expires_at,
      status,
      is_archived,
      issued_by,
      issued_at,
      expected_delivery_at,
      completed_at,
      completed_by,
      completion_status,
      fg_qty,
      produced_qty,
      deleted_at,
      deleted_by,
      created_by,
      updated_by,
      created_at,
      updated_at,
      raw_data,
      imported_at,
      synced_at
    ) values (
      v_job_id,
      nullif(v_final_state ->> 'jobCardNo', ''),
      nullif(v_final_state ->> 'targetDate', ''),
      case when coalesce(v_final_state ->> 'targetDate', '') ~ '^\d{4}-\d{2}-\d{2}$' then (v_final_state ->> 'targetDate')::date else null end,
      nullif(v_final_state ->> 'poId', ''),
      nullif(v_final_state ->> 'poNo', ''),
      null,
      nullif(v_final_state ->> 'customerId', ''),
      nullif(v_final_state ->> 'customerName', ''),
      null,
      nullif(v_final_state ->> 'productId', ''),
      nullif(v_final_state ->> 'productName', ''),
      nullif(v_final_state ->> 'productId', ''),
      nullif(v_final_state ->> 'orderQty', '')::numeric,
      nullif(v_final_state ->> 'oneBoxWeight', '')::numeric,
      nullif(v_final_state ->> 'totalWeight', '')::numeric,
      nullif(v_final_state ->> 'paperQuantity', '')::numeric,
      nullif(v_final_state ->> 'plyQuantity', '')::numeric,
      nullif(v_final_state ->> 'priority', ''),
      v_final_state -> 'remarks',
      coalesce(v_final_state -> 'productSnapshot', '{}'::jsonb),
      case when v_final_state ? 'reelAllocationSkipped' then (v_final_state ->> 'reelAllocationSkipped')::boolean else null end,
      nullif(v_final_state ->> 'approvalStatus', ''),
      nullif(v_final_state ->> 'approvalReason', ''),
      nullif(v_final_state ->> 'approvalRequestedBy', ''),
      nullif(v_final_state ->> 'approvalRequestedAt', '')::timestamptz,
      nullif(v_final_state ->> 'approvalExpiresAt', '')::timestamptz,
      nullif(v_final_state ->> 'status', ''),
      coalesce((v_final_state ->> 'isArchived')::boolean, false),
      nullif(v_final_state ->> 'issuedBy', ''),
      nullif(v_final_state ->> 'issuedAt', '')::timestamptz,
      nullif(v_final_state ->> 'expectedDeliveryAt', '')::timestamptz,
      nullif(v_final_state ->> 'completedAt', '')::timestamptz,
      nullif(v_final_state ->> 'completedBy', ''),
      nullif(v_final_state ->> 'completionStatus', ''),
      nullif(v_final_state ->> 'fgQty', '')::numeric,
      nullif(v_final_state ->> 'producedQty', '')::numeric,
      nullif(v_final_state ->> 'deletedAt', '')::timestamptz,
      nullif(v_final_state ->> 'deletedBy', ''),
      v_user,
      v_user,
      v_now,
      v_now,
      v_final_state || jsonb_build_object(
        'createdAt', v_now,
        'updatedAt', v_now,
        'createdBy', v_user,
        'updatedBy', v_user,
        'isArchived', false
      ),
      now(),
      now()
    );

    v_job_card_no := nullif(v_final_state ->> 'jobCardNo', '');
    if v_job_card_no is not null then
      select coalesce(
               jsonb_agg(to_jsonb(filtered.value)),
               '[]'::jsonb
             )
        into v_new_recycled
      from (
        select value
        from jsonb_array_elements_text(
               case
                 when exists (
                   select 1
                   from public.metadata
                   where firestore_document_id = 'jobCardsConfig'
                 ) then coalesce(
                   (select recycled_numbers from public.metadata where firestore_document_id = 'jobCardsConfig' for update),
                   (select raw_data -> 'recycledNumbers' from public.metadata where firestore_document_id = 'jobCardsConfig'),
                   '[]'::jsonb
                 )
                 else '[]'::jsonb
               end
             ) as value
        where value <> v_job_card_no
      ) as filtered;

      insert into public.metadata (
        firestore_document_id,
        recycled_numbers,
        raw_data,
        imported_at,
        synced_at
      ) values (
        'jobCardsConfig',
        coalesce(v_new_recycled, '[]'::jsonb),
        jsonb_build_object('recycledNumbers', coalesce(v_new_recycled, '[]'::jsonb)),
        now(),
        now()
      )
      on conflict (firestore_document_id) do update
      set recycled_numbers = excluded.recycled_numbers,
          raw_data = coalesce(public.metadata.raw_data, '{}'::jsonb) || jsonb_build_object('recycledNumbers', excluded.recycled_numbers),
          synced_at = now();
    end if;
  else
    update public.job_cards
    set job_card_no = nullif(v_final_state ->> 'jobCardNo', ''),
        target_date_raw = nullif(v_final_state ->> 'targetDate', ''),
        target_date = case when coalesce(v_final_state ->> 'targetDate', '') ~ '^\d{4}-\d{2}-\d{2}$' then (v_final_state ->> 'targetDate')::date else null end,
        po_id_raw = nullif(v_final_state ->> 'poId', ''),
        po_no = nullif(v_final_state ->> 'poNo', ''),
        customer_id_raw = nullif(v_final_state ->> 'customerId', ''),
        customer_name = nullif(v_final_state ->> 'customerName', ''),
        product_id_raw = nullif(v_final_state ->> 'productId', ''),
        product_name = nullif(v_final_state ->> 'productName', ''),
        resolved_product_id = nullif(v_final_state ->> 'productId', ''),
        order_qty = nullif(v_final_state ->> 'orderQty', '')::numeric,
        one_box_weight = nullif(v_final_state ->> 'oneBoxWeight', '')::numeric,
        total_weight = nullif(v_final_state ->> 'totalWeight', '')::numeric,
        paper_quantity = nullif(v_final_state ->> 'paperQuantity', '')::numeric,
        ply_quantity = nullif(v_final_state ->> 'plyQuantity', '')::numeric,
        priority = nullif(v_final_state ->> 'priority', ''),
        remarks = case when v_final_state ? 'remarks' then v_final_state -> 'remarks' else remarks end,
        product_snapshot = coalesce(v_final_state -> 'productSnapshot', product_snapshot, '{}'::jsonb),
        reel_allocation_skipped = case when v_final_state ? 'reelAllocationSkipped' then (v_final_state ->> 'reelAllocationSkipped')::boolean else reel_allocation_skipped end,
        approval_status = nullif(v_final_state ->> 'approvalStatus', ''),
        approval_reason = nullif(v_final_state ->> 'approvalReason', ''),
        approval_requested_by = nullif(v_final_state ->> 'approvalRequestedBy', ''),
        approval_requested_at = nullif(v_final_state ->> 'approvalRequestedAt', '')::timestamptz,
        approval_expires_at = nullif(v_final_state ->> 'approvalExpiresAt', '')::timestamptz,
        status = nullif(v_final_state ->> 'status', ''),
        is_archived = case when v_final_state ? 'isArchived' then (v_final_state ->> 'isArchived')::boolean else is_archived end,
        issued_by = nullif(v_final_state ->> 'issuedBy', ''),
        issued_at = nullif(v_final_state ->> 'issuedAt', '')::timestamptz,
        expected_delivery_at = nullif(v_final_state ->> 'expectedDeliveryAt', '')::timestamptz,
        completed_at = nullif(v_final_state ->> 'completedAt', '')::timestamptz,
        completed_by = nullif(v_final_state ->> 'completedBy', ''),
        completion_status = nullif(v_final_state ->> 'completionStatus', ''),
        fg_qty = nullif(v_final_state ->> 'fgQty', '')::numeric,
        produced_qty = nullif(v_final_state ->> 'producedQty', '')::numeric,
        deleted_at = nullif(v_final_state ->> 'deletedAt', '')::timestamptz,
        deleted_by = nullif(v_final_state ->> 'deletedBy', ''),
        updated_by = v_user,
        updated_at = v_now,
        raw_data = v_final_state || jsonb_build_object(
          'updatedAt', v_now,
          'updatedBy', v_user
        )
    where firestore_document_id = v_job_id;
  end if;

  return v_job_id;
end;
$$;

create or replace function public.delete_job_card_soft(
  p_job_id text,
  p_user text
) returns boolean
language plpgsql
security invoker
as $$
declare
  v_now timestamptz := now();
  v_user text := coalesce(nullif(btrim(p_user), ''), 'System');
  v_job_card public.job_cards%rowtype;
  v_reel public.reels%rowtype;
begin
  select *
    into v_job_card
  from public.job_cards
  where firestore_document_id = p_job_id
  for update;

  if not found then
    raise exception 'Job Card not found';
  end if;

  update public.job_cards
  set status = 'DELETED',
      is_archived = true,
      deleted_at = v_now,
      deleted_by = v_user,
      updated_at = v_now,
      updated_by = v_user,
      raw_data = coalesce(v_job_card.raw_data, '{}'::jsonb) || jsonb_build_object(
        'status', 'DELETED',
        'isArchived', true,
        'deletedAt', v_now,
        'deletedBy', v_user,
        'updatedAt', v_now,
        'updatedBy', v_user
      )
  where firestore_document_id = p_job_id;

  for v_reel in
    select *
    from public.reels
    where reserved_for_jc = p_job_id
    for update
  loop
    update public.reels
    set reserved_for_jc = null,
        updated_at = v_now,
        raw_data = coalesce(v_reel.raw_data, '{}'::jsonb) || jsonb_build_object(
          'reservedForJC', null,
          'updatedAt', v_now
        )
    where firestore_document_id = v_reel.firestore_document_id;
  end loop;

  return true;
end;
$$;

grant execute on function public.execute_job_card_transaction(text, jsonb, text, boolean) to anon, authenticated;
grant execute on function public.delete_job_card_soft(text, text) to anon, authenticated;