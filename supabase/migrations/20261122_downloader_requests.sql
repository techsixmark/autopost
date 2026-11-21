-- Download requests made in Autopost and executed by the local Universal Video Downloader.
-- Autopost cannot reach the Downloader (it runs on a local machine), so the Downloader polls:
--   downloader_claim_requests(key)     -> takes pending requests / pending actions (retry, cancel)
--   downloader_report_requests(key, …) -> writes back progress, errors and the Downloader video id
-- Applied as migration "add_downloader_requests".

create table if not exists public.downloader_requests (
  id                 uuid primary key default gen_random_uuid(),
  url                text not null check (url ~ '^https?://' and length(url) <= 2000),
  rights_confirmed   boolean not null check (rights_confirmed),
  processing_mode    text check (processing_mode in ('AUTO', 'MANUAL', 'PRESERVE', 'PREMIUM')),
  note               text check (length(note) <= 500),
  requested_by       uuid default auth.uid() references auth.users(id) on delete set null,
  requested_email    text default (auth.jwt() ->> 'email'),
  status             text not null default 'pending' check (status in (
                       'pending', 'claimed', 'downloading', 'scanning', 'processing',
                       'completed', 'needs_review', 'failed', 'duplicate', 'cancelled')),
  action             text check (action in ('retry')),   -- asked in Autopost, done by the Downloader
  error              text,
  video_id           bigint,                             -- Video.id in the Downloader
  title              text,
  api_key_id         uuid references public.api_keys(id) on delete set null,
  claimed_at         timestamptz,
  finished_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists downloader_requests_status_idx on public.downloader_requests (status, created_at);
create index if not exists downloader_requests_created_idx on public.downloader_requests (created_at desc);
create index if not exists downloader_requests_user_idx on public.downloader_requests (requested_by);
create index if not exists downloader_requests_key_idx on public.downloader_requests (api_key_id);

alter table public.downloader_requests enable row level security;

create policy downloader_requests_service_role_all on public.downloader_requests
  for all to service_role using (true) with check (true);
create policy downloader_requests_select_allowed on public.downloader_requests
  for select to authenticated using ((select public.is_allowed_user()));
create policy downloader_requests_insert_editor on public.downloader_requests
  for insert to authenticated with check (
    (select public.is_editor()) and requested_by = (select auth.uid()) and status = 'pending'
    and action is null and video_id is null and api_key_id is null);

revoke all on public.downloader_requests from anon, authenticated;
grant select on public.downloader_requests to authenticated;
-- Only these columns can be written by people; the rest come from defaults / the Downloader.
grant insert (url, rights_confirmed, processing_mode, note) on public.downloader_requests to authenticated;

-- People: cancel a request that has not started, or ask the Downloader to retry a failed one.
create or replace function public.downloader_request_action(p_id uuid, p_action text)
returns public.downloader_requests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r downloader_requests%rowtype;
begin
  if not public.is_editor() then
    raise exception 'Bạn không có quyền thao tác yêu cầu tải' using errcode = '42501';
  end if;
  select * into r from downloader_requests where id = p_id for update;
  if not found then
    raise exception 'Không tìm thấy yêu cầu' using errcode = 'P0002';
  end if;
  if p_action = 'cancel' then
    if r.status <> 'pending' then
      raise exception 'Chỉ huỷ được yêu cầu chưa bắt đầu' using errcode = '22023';
    end if;
    update downloader_requests set status = 'cancelled', finished_at = now(), updated_at = now()
     where id = p_id returning * into r;
  elsif p_action = 'retry' then
    if r.status not in ('failed', 'needs_review') then
      raise exception 'Chỉ chạy lại được yêu cầu bị lỗi hoặc cần xem lại' using errcode = '22023';
    end if;
    if r.video_id is null then  -- never reached the Downloader's queue: just queue it again
      update downloader_requests set status = 'pending', error = null, action = null, api_key_id = null,
             claimed_at = null, finished_at = null, updated_at = now()
       where id = p_id returning * into r;
    else
      update downloader_requests set action = 'retry', updated_at = now() where id = p_id returning * into r;
    end if;
  else
    raise exception 'Thao tác không hợp lệ' using errcode = '22023';
  end if;
  return r;
end;
$$;
revoke all on function public.downloader_request_action(uuid, text) from public, anon;
grant execute on function public.downloader_request_action(uuid, text) to authenticated, service_role;

-- Downloader: API key -> key row (same rules as ingest_downloader_video).
create or replace function public._downloader_key(p_api_key text)
returns api_keys
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_key api_keys%rowtype;
begin
  if p_api_key is null or p_api_key !~ '^ap_[0-9a-f]{64}$' then
    raise exception 'invalid api key' using errcode = '28000';
  end if;
  select * into v_key from api_keys
   where key_prefix = left(p_api_key, 12) || '...'
     and is_active = true
     and (expires_at is null or expires_at > now())
     and key_hash = crypt(p_api_key, key_hash)
   limit 1;
  if not found or not ('write' = any(coalesce(v_key.scopes, '{}'))) then
    raise exception 'invalid api key' using errcode = '28000';
  end if;
  update api_keys set last_used_at = now() where id = v_key.id;
  return v_key;
end;
$$;
revoke all on function public._downloader_key(text) from public, anon, authenticated;

-- Downloader: take up to p_limit new requests (oldest first) and the pending actions of its own
-- requests. New ones become 'claimed' by this key so two Downloaders never take the same one.
create or replace function public.downloader_claim_requests(p_api_key text, p_limit integer default 10)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_key api_keys%rowtype := public._downloader_key(p_api_key);
  v_new jsonb;
  v_act jsonb;
begin
  with picked as (
    select id from downloader_requests
     where status = 'pending'
        -- claimed but never turned into a video (Downloader stopped in between): take it again
        or (status = 'claimed' and video_id is null and claimed_at < now() - interval '10 minutes')
     order by created_at
     limit greatest(1, least(coalesce(p_limit, 10), 50))
     for update skip locked
  ), upd as (
    update downloader_requests d
       set status = 'claimed', api_key_id = v_key.id, claimed_at = now(), updated_at = now()
      from picked where d.id = picked.id
    returning d.id, d.url, d.processing_mode, d.requested_email, d.note
  )
  select coalesce(jsonb_agg(to_jsonb(upd)), '[]'::jsonb) into v_new from upd;

  -- RETURNING shows the new row, so the action is read before it is cleared
  -- (fixed by migration "fix_downloader_claim_actions").
  with pend as (
    select id, action from downloader_requests
     where api_key_id = v_key.id and action is not null
     for update skip locked
  ), acted as (
    update downloader_requests d
       set action = null, updated_at = now()
      from pend where d.id = pend.id
    returning d.id, pend.action, d.video_id, d.requested_email
  )
  select coalesce(jsonb_agg(to_jsonb(acted)), '[]'::jsonb) into v_act from acted;

  return jsonb_build_object('requests', v_new, 'actions', v_act);
end;
$$;
revoke all on function public.downloader_claim_requests(text, integer) from public;
grant execute on function public.downloader_claim_requests(text, integer) to anon, authenticated, service_role;

-- Downloader: write back progress for its own requests.
-- p_updates = [{id, status, error?, video_id?, title?}]
create or replace function public.downloader_report_requests(p_api_key text, p_updates jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_key api_keys%rowtype := public._downloader_key(p_api_key);
  u jsonb;
  n integer := 0;
  k integer;
begin
  if jsonb_typeof(p_updates) <> 'array' or jsonb_array_length(p_updates) > 200 then
    raise exception 'p_updates must be an array of at most 200 items' using errcode = '22023';
  end if;
  -- One malformed item is skipped, the others still apply
  -- (migration "downloader_report_skip_bad_items").
  for u in select * from jsonb_array_elements(p_updates) loop
    begin
      if (u->>'status') not in ('claimed', 'downloading', 'scanning', 'processing',
                                'completed', 'needs_review', 'failed', 'duplicate') then
        raise exception 'invalid status %', u->>'status' using errcode = '22023';
      end if;
      update downloader_requests set
        status = u->>'status',
        error = left(nullif(u->>'error', ''), 1000),
        video_id = coalesce(nullif(u->>'video_id', '')::bigint, video_id),
        title = coalesce(left(nullif(u->>'title', ''), 500), title),
        finished_at = case when u->>'status' in ('completed', 'needs_review', 'failed', 'duplicate')
                           then now() else null end,
        updated_at = now()
       where id = (u->>'id')::uuid and api_key_id = v_key.id and status <> 'cancelled';
      get diagnostics k = row_count;
      n := n + k;
    exception when others then
      null;
    end;
  end loop;
  return n;
end;
$$;
revoke all on function public.downloader_report_requests(text, jsonb) from public;
grant execute on function public.downloader_report_requests(text, jsonb) to anon, authenticated, service_role;
