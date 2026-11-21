-- Library of finished videos pushed by the local Universal Video Downloader
-- (repo techsixmark/6m-universal-downloader). The Downloader runs on a local machine, so it
-- pushes into Supabase; Autopost only reads this table (page admin-downloader + picker).
-- Applied to project hpsoflovdjvgfrejovvu as migration "add_downloader_videos_library".

create table if not exists public.downloader_videos (
  id               uuid primary key default gen_random_uuid(),
  source_video_id  bigint not null unique,          -- Video.id in the Downloader
  title            text,
  source_url       text,                            -- original platform link
  source_platform  text,
  duration_s       numeric,
  width            integer,
  height           integer,
  size_bytes       bigint,
  is_processed     boolean not null default false,  -- watermark-removed copy vs original
  drive_file_id    text not null,
  drive_view_link  text,
  download_url     text not null,                   -- direct, publicly downloadable mp4
  finished_at      timestamptz,
  is_hidden        boolean not null default false,
  api_key_id       uuid references public.api_keys(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists downloader_videos_finished_idx on public.downloader_videos (finished_at desc nulls last);
create index if not exists downloader_videos_api_key_idx on public.downloader_videos (api_key_id);

alter table public.downloader_videos enable row level security;

create policy downloader_videos_service_role_all on public.downloader_videos
  for all to service_role using (true) with check (true);
create policy downloader_videos_select_allowed on public.downloader_videos
  for select to authenticated using ((select public.is_allowed_user()));
create policy downloader_videos_update_editor on public.downloader_videos
  for update to authenticated using ((select public.is_editor())) with check ((select public.is_editor()));
create policy downloader_videos_delete_editor on public.downloader_videos
  for delete to authenticated using ((select public.is_editor()));

revoke all on public.downloader_videos from anon;
grant select, update, delete on public.downloader_videos to authenticated;

-- Ingest endpoint for the Downloader, called as POST /rest/v1/rpc/ingest_downloader_video with the
-- public anon key. Real auth = an Autopost API key (page /admin-keygen): active, not expired,
-- scope 'write'. Upserts by source_video_id and un-hides the row.
create or replace function public.ingest_downloader_video(p_api_key text, p_video jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_key   api_keys%rowtype;
  v_dl    text := nullif(trim(p_video->>'download_url'), '');
  v_view  text := nullif(trim(p_video->>'drive_view_link'), '');
  v_file  text := nullif(trim(p_video->>'drive_file_id'), '');
  v_src   bigint;
  v_id    uuid;
begin
  if p_api_key is null or length(p_api_key) < 20 then
    raise exception 'invalid api key' using errcode = '28000';
  end if;
  select * into v_key from api_keys
   where key_hash = crypt(p_api_key, key_hash)
     and is_active = true
     and (expires_at is null or expires_at > now())
   limit 1;
  if not found or not ('write' = any(coalesce(v_key.scopes, '{}'))) then
    raise exception 'invalid api key' using errcode = '28000';
  end if;
  update api_keys set last_used_at = now() where id = v_key.id;

  begin
    v_src := (p_video->>'source_video_id')::bigint;
  exception when others then
    raise exception 'source_video_id must be an integer' using errcode = '22023';
  end;
  if v_src is null or v_file is null or v_dl is null then
    raise exception 'source_video_id, drive_file_id and download_url are required' using errcode = '22023';
  end if;
  if v_file !~ '^[A-Za-z0-9_-]{10,200}$' then
    raise exception 'drive_file_id is invalid' using errcode = '22023';
  end if;
  -- Only Google Drive links: the library must never carry arbitrary URLs.
  if v_dl !~ '^https://(drive\.usercontent\.google\.com|drive\.google\.com)/' then
    raise exception 'download_url must be a Google Drive link' using errcode = '22023';
  end if;
  if v_view is not null and v_view !~ '^https://drive\.google\.com/' then
    raise exception 'drive_view_link must be a Google Drive link' using errcode = '22023';
  end if;

  insert into downloader_videos as d (
    source_video_id, title, source_url, source_platform, duration_s, width, height,
    size_bytes, is_processed, drive_file_id, drive_view_link, download_url, finished_at, api_key_id)
  values (
    v_src,
    left(nullif(p_video->>'title', ''), 500),
    left(nullif(p_video->>'source_url', ''), 2000),
    left(nullif(p_video->>'source_platform', ''), 50),
    nullif(p_video->>'duration_s', '')::numeric,
    nullif(p_video->>'width', '')::integer,
    nullif(p_video->>'height', '')::integer,
    nullif(p_video->>'size_bytes', '')::bigint,
    coalesce((p_video->>'is_processed')::boolean, false),
    v_file, v_view, v_dl,
    coalesce(nullif(p_video->>'finished_at', '')::timestamptz, now()),
    v_key.id)
  on conflict (source_video_id) do update set
    title = excluded.title, source_url = excluded.source_url,
    source_platform = excluded.source_platform, duration_s = excluded.duration_s,
    width = excluded.width, height = excluded.height, size_bytes = excluded.size_bytes,
    is_processed = excluded.is_processed, drive_file_id = excluded.drive_file_id,
    drive_view_link = excluded.drive_view_link, download_url = excluded.download_url,
    finished_at = excluded.finished_at, api_key_id = excluded.api_key_id,
    is_hidden = false, updated_at = now()
  returning d.id into v_id;

  return jsonb_build_object('id', v_id, 'source_video_id', v_src);
end;
$$;

revoke all on function public.ingest_downloader_video(text, jsonb) from public;
grant execute on function public.ingest_downloader_video(text, jsonb) to anon, authenticated, service_role;
