create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

create table private.roster_editor_config (
  singleton boolean primary key default true check (singleton),
  password_hash text not null,
  token_secret_id uuid references vault.secrets(id)
);
create table private.roster_editor_attempts (
  bucket_key text primary key,
  window_started timestamptz not null,
  attempts integer not null
);
alter table private.roster_editor_config enable row level security;
alter table private.roster_editor_attempts enable row level security;
revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

create function public.authorize_roster_editor(p_password text, p_client_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
  v_hash text;
  v_secret_id uuid;
  v_token text;
  v_now timestamptz := clock_timestamp();
begin
  if p_password is null or length(p_password) not between 1 and 256
    or p_client_key is null or p_client_key !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status', 401, 'message', 'Mật khẩu không đúng.');
  end if;

  delete from private.roster_editor_attempts where window_started < v_now - interval '2 hours';
  insert into private.roster_editor_attempts values ('global', v_now, 1)
  on conflict (bucket_key) do update set
    attempts = case when roster_editor_attempts.window_started <= v_now - interval '1 minute'
      then 1 else roster_editor_attempts.attempts + 1 end,
    window_started = case when roster_editor_attempts.window_started <= v_now - interval '1 minute'
      then v_now else roster_editor_attempts.window_started end
  returning attempts into v_count;
  if v_count > 60 then
    return jsonb_build_object('status', 429, 'message', 'Thử lại sau một phút.');
  end if;

  insert into private.roster_editor_attempts values (p_client_key, v_now, 1)
  on conflict (bucket_key) do update set
    attempts = case when roster_editor_attempts.window_started <= v_now - interval '1 minute'
      then 1 else roster_editor_attempts.attempts + 1 end,
    window_started = case when roster_editor_attempts.window_started <= v_now - interval '1 minute'
      then v_now else roster_editor_attempts.window_started end
  returning attempts into v_count;
  if v_count > 10 then
    return jsonb_build_object('status', 429, 'message', 'Thử lại sau một phút.');
  end if;

  select password_hash, token_secret_id into v_hash, v_secret_id
  from private.roster_editor_config where singleton;
  if v_hash is null then
    return jsonb_build_object('status', 503, 'message', 'Chưa bật lưu trực tuyến.');
  end if;
  if extensions.crypt(p_password, v_hash) <> v_hash then
    return jsonb_build_object('status', 401, 'message', 'Mật khẩu không đúng.');
  end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where id = v_secret_id;
  if v_token is null then
    return jsonb_build_object('status', 503, 'message', 'Chưa bật lưu trực tuyến.');
  end if;
  return jsonb_build_object('status', 200, 'token', v_token);
end;
$function$;

revoke all on function public.authorize_roster_editor(text,text) from public, anon, authenticated;
grant execute on function public.authorize_roster_editor(text,text) to service_role;
