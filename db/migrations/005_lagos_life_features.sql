-- Lagos Life Upgrade: Cash & Bank System, Vehicle Dealership, and Sleep & Living Mechanics.

-- 1. Profiles cash balance (₦ Naira)
alter table public.profiles
  add column if not exists cash_naira numeric not null default 1500000 check (cash_naira >= 0);

-- 2. Cash transfers & money spraying
create table if not exists public.cash_transfers (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  amount numeric not null check (amount > 0),
  note text check (char_length(note) <= 140),
  kind text not null default 'transfer' check (kind in ('transfer', 'spray', 'gift')),
  created_at timestamptz not null default now()
);

create index if not exists cash_transfers_world_idx on public.cash_transfers (world_id, created_at desc);
create index if not exists cash_transfers_sender_idx on public.cash_transfers (sender_id);
create index if not exists cash_transfers_recipient_idx on public.cash_transfers (recipient_id);

alter table public.cash_transfers enable row level security;
create policy cash_transfers_select on public.cash_transfers
  for select to authenticated using (public.is_world_member(world_id));

-- Realtime notification trigger for cash transfers
create trigger cash_transfers_notify after insert on public.cash_transfers
  for each row execute function public.notify_change();

-- 3. Owned vehicles (Purchased from Lagos Dealership)
create table if not exists public.owned_vehicles (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_model text not null,
  name text not null,
  plate_number text not null,
  color text not null default '#c2476e',
  is_active boolean not null default true,
  purchased_at timestamptz not null default now()
);

create index if not exists owned_vehicles_world_idx on public.owned_vehicles (world_id);
alter table public.owned_vehicles enable row level security;
create policy owned_vehicles_select on public.owned_vehicles
  for select to authenticated using (public.is_world_member(world_id));
create policy owned_vehicles_update on public.owned_vehicles
  for update to authenticated using (public.is_world_member(world_id));

create trigger owned_vehicles_notify after insert or update or delete on public.owned_vehicles
  for each row execute function public.notify_change();

-- 4. Sleep sessions
create table if not exists public.sleep_sessions (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'sleep' check (kind in ('sleep', 'nap', 'cuddle')),
  energy_gained integer not null default 100,
  love_points_gained integer not null default 5,
  cash_reward numeric not null default 25000,
  created_at timestamptz not null default now()
);

create index if not exists sleep_sessions_world_idx on public.sleep_sessions (world_id, created_at desc);
alter table public.sleep_sessions enable row level security;
create policy sleep_sessions_select on public.sleep_sessions
  for select to authenticated using (public.is_world_member(world_id));

-- 5. Additional furniture for comfortable sleeping & living
insert into public.decor_items (id, name, emoji, cost) values
  ('bed_kingsize', 'Lekki Luxury King Bed', '🛏️', 85),
  ('bed_vono', 'Classic Lagos Vono Bed', '🛌', 45),
  ('couch_leather', 'Executive Leather Sofa', '🛋️', 55)
on conflict (id) do nothing;

-- 6. RPC: Send Cash between partners / friends
create or replace function public.send_cash(
  p_recipient uuid,
  p_amount numeric,
  p_note text default null,
  p_kind text default 'transfer'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_world uuid := public.my_world_id();
  v_sender_bal numeric;
  v_recip_name text;
  v_recip_world uuid;
begin
  if v_world is null then raise exception 'not allowed'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if auth.uid() = p_recipient then raise exception 'cannot send money to yourself'; end if;

  -- Ensure recipient is in the same world or valid
  select world_id into v_recip_world from public.world_members where user_id = p_recipient limit 1;
  if v_recip_world is null or v_recip_world <> v_world then
    raise exception 'recipient is not in your world';
  end if;

  -- Lock sender row for update
  select cash_naira into v_sender_bal from public.profiles where id = auth.uid() for update;
  if v_sender_bal < p_amount then
    raise exception 'insufficient funds: balance is ₦%', v_sender_bal;
  end if;

  -- Deduct from sender
  update public.profiles set cash_naira = cash_naira - p_amount, updated_at = now() where id = auth.uid();
  -- Add to recipient
  update public.profiles set cash_naira = cash_naira + p_amount, updated_at = now() where id = p_recipient;

  -- Record transfer
  insert into public.cash_transfers (world_id, sender_id, recipient_id, amount, note, kind)
  values (v_world, auth.uid(), p_recipient, p_amount, left(p_note, 140), p_kind);

  select display_name into v_recip_name from public.profiles where id = p_recipient;

  if p_kind = 'spray' then
    perform public.add_points(v_world, 5);
    perform public.log_activity(v_world, 'spray', format('sprayed ₦%s cash at the party! 💸', to_char(p_amount, 'FM999,999,999')));
  else
    perform public.log_activity(v_world, 'transfer', format('sent ₦%s to %s 💳', to_char(p_amount, 'FM999,999,999'), coalesce(v_recip_name, 'partner')));
  end if;

  return jsonb_build_object(
    'ok', true,
    'sender_balance', (select cash_naira from public.profiles where id = auth.uid()),
    'amount', p_amount,
    'kind', p_kind
  );
end $$;

-- 7. RPC: Spray Cash in Lagos (celebration / party / street spray)
create or replace function public.spray_cash(
  p_amount numeric default 50000
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_world uuid := public.my_world_id();
  v_partner uuid;
begin
  if v_world is null then raise exception 'not allowed'; end if;
  -- Find partner in world
  select user_id into v_partner from public.world_members where world_id = v_world and user_id <> auth.uid() limit 1;
  if v_partner is null then
    -- Partner hasn't joined yet; still allow spraying into world points & burn cash for fun
    update public.profiles set cash_naira = cash_naira - p_amount, updated_at = now() where id = auth.uid() and cash_naira >= p_amount;
    if not found then raise exception 'insufficient funds'; end if;
    perform public.add_points(v_world, 5);
    perform public.log_activity(v_world, 'spray', format('sprayed ₦%s in Lagos streets! 💸', to_char(p_amount, 'FM999,999,999')));
    return jsonb_build_object('ok', true, 'sprayed', p_amount, 'sender_balance', (select cash_naira from public.profiles where id = auth.uid()));
  end if;

  return public.send_cash(v_partner, p_amount, 'Lagos Money Spraying 💸', 'spray');
end $$;

-- 8. RPC: Buy vehicle from Dealership
create or replace function public.buy_vehicle(
  p_model text,
  p_name text,
  p_cost numeric,
  p_color text default '#c2476e',
  p_plate text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_world uuid := public.my_world_id();
  v_plate text;
  v_veh_id uuid;
begin
  if v_world is null then raise exception 'not allowed'; end if;
  if p_cost < 0 then raise exception 'invalid cost'; end if;

  -- Check and deduct cash
  update public.profiles set cash_naira = cash_naira - p_cost, updated_at = now()
   where id = auth.uid() and cash_naira >= p_cost;
  if not found then
    raise exception 'insufficient funds to buy vehicle';
  end if;

  v_plate := coalesce(p_plate, 'LAG-' || lpad((floor(random() * 900) + 100)::text, 3, '0') || chr((65 + floor(random() * 26))::int) || chr((65 + floor(random() * 26))::int));

  insert into public.owned_vehicles (world_id, user_id, vehicle_model, name, plate_number, color, is_active)
  values (v_world, auth.uid(), p_model, p_name, v_plate, p_color, true)
  returning id into v_veh_id;

  perform public.add_points(v_world, 25);
  perform public.log_activity(v_world, 'car', format('bought a new %s (%s) 🚙', p_name, v_plate));

  return jsonb_build_object(
    'ok', true,
    'vehicle_id', v_veh_id,
    'plate_number', v_plate,
    'cash_remaining', (select cash_naira from public.profiles where id = auth.uid())
  );
end $$;

-- 9. RPC: Record sleep / nap and claim morning reward
create or replace function public.record_sleep(
  p_kind text default 'sleep'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_world uuid := public.my_world_id();
  v_energy int := case when p_kind = 'sleep' then 100 else 40 end;
  v_pts int := case when p_kind = 'sleep' then 10 else 3 end;
  v_cash numeric := case when p_kind = 'sleep' then 25000 else 5000 end;
begin
  if v_world is null then raise exception 'not allowed'; end if;

  insert into public.sleep_sessions (world_id, user_id, kind, energy_gained, love_points_gained, cash_reward)
  values (v_world, auth.uid(), p_kind, v_energy, v_pts, v_cash);

  -- Award bonus cash & points
  update public.profiles set cash_naira = cash_naira + v_cash, updated_at = now() where id = auth.uid();
  perform public.add_points(v_world, v_pts);

  if p_kind = 'sleep' then
    perform public.log_activity(v_world, 'sleep', 'woke up feeling refreshed (+₦25,000 allowance) ☀️');
  else
    perform public.log_activity(v_world, 'nap', 'took a cosy power nap (+✦3 love points) 😴');
  end if;

  return jsonb_build_object(
    'ok', true,
    'kind', p_kind,
    'energy', v_energy,
    'points_awarded', v_pts,
    'cash_reward', v_cash,
    'new_balance', (select cash_naira from public.profiles where id = auth.uid())
  );
end $$;

-- Grants
revoke execute on function public.send_cash(uuid, numeric, text, text), public.spray_cash(numeric), public.buy_vehicle(text, text, numeric, text, text), public.record_sleep(text) from public, anon;
grant execute on function public.send_cash(uuid, numeric, text, text), public.spray_cash(numeric), public.buy_vehicle(text, text, numeric, text, text), public.record_sleep(text) to authenticated;
