-- QA hardening for downloader_videos (applied as migration "harden_downloader_videos_ingest").
-- 1) Look the API key up by its stored prefix first, so one call runs bcrypt on ~1 row, not all keys.
-- 2) A row belongs to the key that created it: another key cannot overwrite it.
-- 3) Signed-in users may only change is_hidden / updated_at (never the links), and nothing else.

revoke insert, update, truncate, references, trigger on public.downloader_videos from authenticated;
grant update (is_hidden, updated_at) on public.downloader_videos to authenticated;

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
    finished_at = excluded.finished_at, is_hidden = false, updated_at = now()
  where d.api_key_id is null or d.api_key_id = excluded.api_key_id
  returning d.id into v_id;

  if v_id is null then
    raise exception 'source_video_id % belongs to another API key', v_src using errcode = '42501';
  end if;
  return jsonb_build_object('id', v_id, 'source_video_id', v_src);
end;
$$;

revoke all on function public.ingest_downloader_video(text, jsonb) from public;
grant execute on function public.ingest_downloader_video(text, jsonb) to anon, authenticated, service_role;
