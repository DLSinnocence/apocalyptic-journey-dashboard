create or replace function public.dashboard_jsonb_safe(value text)
returns jsonb
language plpgsql
immutable
as $$
begin
  return value::jsonb;
exception when others then
  return null;
end;
$$;

create or replace function public.dashboard_jsonb_increment(target jsonb, path text[], amount integer default 1)
returns jsonb
language plpgsql
immutable
as $$
declare
  current_value integer;
begin
  current_value := coalesce((target #>> path)::integer, 0);
  return jsonb_set(coalesce(target, '{}'::jsonb), path, to_jsonb(current_value + amount), true);
end;
$$;

create or replace function public.dashboard_int_safe(value text, fallback integer default 1)
returns integer
language plpgsql
immutable
as $$
begin
  return coalesce(nullif(value, '')::integer, fallback);
exception when others then
  return fallback;
end;
$$;

create or replace function public.dashboard_jsonb_object_length_safe(value jsonb)
returns integer
language sql
immutable
as $$
  select count(*)::integer
  from jsonb_object_keys(coalesce(value, '{}'::jsonb));
$$;

create or replace function public.dashboard_record_items(payload jsonb)
returns table(kind text, bucket text, item_id text)
language plpgsql
stable
as $$
declare
  category text;
  category_key text;
  bucket_name text;
  source_key text;
  item jsonb;
begin
  foreach category in array array['cards', 'relics', 'blessings', 'hardTags'] loop
    category_key := case category
      when 'cards' then 'Cards'
      when 'relics' then 'Relics'
      when 'blessings' then 'Blessings'
      else 'HardTags'
    end;

    if jsonb_typeof(payload -> category_key) = 'array' then
      for item in select value from jsonb_array_elements(payload -> category_key) loop
        kind := category;
        bucket := 'select';
        item_id := coalesce(item ->> 'Name', item ->> 'name', trim(both '"' from item::text));
        if item_id <> '' then return next; end if;
      end loop;
    elsif jsonb_typeof(payload -> category_key) = 'object' then
      foreach source_key in array array['RewardShow', 'ShopShow', 'Show'] loop
        if jsonb_typeof(payload -> category_key -> source_key) = 'array' then
          for item in select value from jsonb_array_elements(payload -> category_key -> source_key) loop
            kind := category;
            bucket := 'show';
            item_id := coalesce(item ->> 'Name', item ->> 'name', trim(both '"' from item::text));
            if item_id <> '' then return next; end if;
          end loop;
        end if;
      end loop;

      foreach source_key in array array['Select', 'Selected', 'Picked'] loop
        if jsonb_typeof(payload -> category_key -> source_key) = 'array' then
          for item in select value from jsonb_array_elements(payload -> category_key -> source_key) loop
            kind := category;
            bucket := 'select';
            item_id := coalesce(item ->> 'Name', item ->> 'name', trim(both '"' from item::text));
            if item_id <> '' then return next; end if;
          end loop;
        end if;
      end loop;

      foreach source_key in array array['Buy', 'Bought', 'Purchased'] loop
        if jsonb_typeof(payload -> category_key -> source_key) = 'array' then
          for item in select value from jsonb_array_elements(payload -> category_key -> source_key) loop
            kind := category;
            bucket := 'buy';
            item_id := coalesce(item ->> 'Name', item ->> 'name', trim(both '"' from item::text));
            if item_id <> '' then return next; end if;
          end loop;
        end if;
      end loop;
    end if;
  end loop;
end;
$$;

create or replace function public.dashboard_data_summary(error_page_size integer default 100)
returns jsonb
language plpgsql
stable
as $$
declare
  cutoff timestamptz := now() - interval '2 months';
  rec record;
  payload jsonb;
  player_id text;
  item record;
  item_stats jsonb := '{
    "cards":{"show":{},"select":{},"buy":{}},
    "relics":{"show":{},"select":{},"buy":{}},
    "blessings":{"show":{},"select":{},"buy":{}},
    "hardTags":{"show":{},"select":{},"buy":{}}
  }'::jsonb;
  item_counts jsonb := '{}'::jsonb;
  player_stats jsonb := '{}'::jsonb;
  unique_players jsonb := '{}'::jsonb;
  hourly_stats integer[] := array_fill(0, array[24]);
  weekly_stats jsonb := '{"周日":0,"周一":0,"周二":0,"周三":0,"周四":0,"周五":0,"周六":0}'::jsonb;
  daily_stats jsonb := '{}'::jsonb;
  recent_activity jsonb := '[]'::jsonb;
  total_records integer := 0;
  total_selections integer := 0;
  last_update timestamptz := null;
  day_names text[] := array['周日','周一','周二','周三','周四','周五','周六'];
  day_name text;
  date_key text;
  hour_index integer;
  top_items jsonb;
  players jsonb;
  daily_rows jsonb;
  ping_rows jsonb;
  error_rows jsonb;
  error_total integer;
begin
  perform set_config('statement_timeout', '120000', true);
  error_page_size := least(greatest(coalesce(error_page_size, 100), 1), 500);

  for rec in
    select id, created_at, data
    from public.save_selection
    where created_at >= cutoff
    order by created_at desc, id desc
  loop
    total_records := total_records + 1;
    if last_update is null then last_update := rec.created_at; end if;

    payload := public.dashboard_jsonb_safe(rec.data::text);
    if payload is null then continue; end if;

    player_id := payload ->> 'PlayerId';
    if player_id is not null and player_id <> '' then
      unique_players := jsonb_set(unique_players, array[player_id], 'true'::jsonb, true);
      player_stats := jsonb_set(
        player_stats,
        array[player_id],
        jsonb_build_object(
          'count', coalesce((player_stats #>> array[player_id, 'count'])::integer, 0) + 1,
          'lastSeen', greatest(coalesce(player_stats #>> array[player_id, 'lastSeen'], rec.created_at::text), rec.created_at::text)
        ),
        true
      );
    end if;

    if jsonb_array_length(recent_activity) < 10 then
      recent_activity := recent_activity || jsonb_build_array(jsonb_build_object(
        'time', rec.created_at,
        'playerId', coalesce(nullif(player_id, ''), '未知玩家')
      ));
    end if;

    for item in select * from public.dashboard_record_items(payload) loop
      item_stats := public.dashboard_jsonb_increment(item_stats, array[item.kind, item.bucket, item.item_id], 1);
      if item.bucket = 'select' then
        item_counts := public.dashboard_jsonb_increment(item_counts, array[item.item_id], 1);
        total_selections := total_selections + 1;
      end if;
    end loop;

    hour_index := extract(hour from rec.created_at at time zone 'Asia/Shanghai')::integer + 1;
    hourly_stats[hour_index] := hourly_stats[hour_index] + 1;
    date_key := to_char(rec.created_at at time zone 'Asia/Shanghai', 'YYYY/FMMM/FMDD');
    daily_stats := public.dashboard_jsonb_increment(daily_stats, array[date_key], 1);
    day_name := day_names[extract(dow from rec.created_at at time zone 'Asia/Shanghai')::integer + 1];
    weekly_stats := public.dashboard_jsonb_increment(weekly_stats, array[day_name], 1);
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('id', key, 'count', value::integer) order by value::integer desc), '[]'::jsonb)
  into top_items
  from (
    select key, value
    from jsonb_each_text(item_counts)
    order by value::integer desc
    limit 10
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
    'playerId', key,
    'count', (value ->> 'count')::integer,
    'lastSeen', value ->> 'lastSeen'
  ) order by (value ->> 'count')::integer desc), '[]'::jsonb)
  into players
  from (
    select key, value
    from jsonb_each(player_stats)
    order by (value ->> 'count')::integer desc
    limit 100
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('date', key, 'count', value::integer) order by to_date(key, 'YYYY/MM/DD') desc), '[]'::jsonb)
  into daily_rows
  from (
    select key, value
    from jsonb_each_text(daily_stats)
    order by to_date(key, 'YYYY/MM/DD') desc
    limit 30
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'avg', avg_ping, 'max', max_ping) order by day), '[]'::jsonb)
  into ping_rows
  from (
    select
      created_at::date::text as day,
      round(avg(average_ping))::integer as avg_ping,
      round(avg(max_ping))::integer as max_ping
    from public.ping_selection
    where created_at >= cutoff
    group by created_at::date
  ) p;

  select count(*) into error_total
  from public.error_selection
  where created_at >= cutoff;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc, e.id desc), '[]'::jsonb)
  into error_rows
  from (
    select *
    from public.error_selection
    where created_at >= cutoff
    order by created_at desc, id desc
    limit error_page_size
  ) e;

  return jsonb_build_object(
    'generatedAt', now(),
    'stats', jsonb_build_object(
      'totalRecords', total_records,
      'activePlayers', public.dashboard_jsonb_object_length_safe(unique_players),
      'lastUpdate', last_update
    ),
    'overview', jsonb_build_object(
      'totalRecords', total_records,
      'activePlayers', public.dashboard_jsonb_object_length_safe(unique_players),
      'totalSelections', total_selections,
      'uniqueItemCount', public.dashboard_jsonb_object_length_safe(item_counts),
      'topItems', top_items,
      'recentActivity', recent_activity
    ),
    'players', jsonb_build_object(
      'totalPlayers', public.dashboard_jsonb_object_length_safe(player_stats),
      'rows', players
    ),
    'itemStats', item_stats,
    'time', jsonb_build_object(
      'hourlyStats', to_jsonb(hourly_stats),
      'weeklyStats', weekly_stats,
      'dailyStats', daily_rows
    ),
    'ping', ping_rows,
    'errors', jsonb_build_object(
      'rows', error_rows,
      'pagination', jsonb_build_object(
        'nextCursor', case when error_total > error_page_size then jsonb_build_object('offset', error_page_size) else null end,
        'hasMore', error_total > error_page_size,
        'pageSize', least(error_total, error_page_size),
        'totalRows', error_total
      )
    )
  );
end;
$$;

create or replace function public.dashboard_item_detail(item_id text)
returns jsonb
language plpgsql
stable
as $$
declare
  cutoff timestamptz := now() - interval '2 months';
  rec record;
  payload jsonb;
  item jsonb;
  item_data jsonb;
  item_type text;
  source_key text;
  found_show boolean;
  found_select boolean;
  found_buy boolean;
  current_layer integer;
  normalized_layer integer;
  layer_data jsonb := '{}'::jsonb;
  i integer;
  total_show integer := 0;
  total_select integer := 0;
  total_buy integer := 0;
  first_seen timestamptz := null;
  last_seen timestamptz := null;
  candidate_id text;
begin
  perform set_config('statement_timeout', '120000', true);
  for i in 1..30 loop
    layer_data := jsonb_set(layer_data, array[i::text], '{"show":0,"select":0,"buy":0,"total":0}'::jsonb, true);
  end loop;

  for rec in
    select id, created_at, data
    from public.save_selection
    where created_at >= cutoff
    order by created_at desc, id desc
  loop
    payload := public.dashboard_jsonb_safe(rec.data::text);
    if payload is null then continue; end if;

    found_show := false;
    found_select := false;
    found_buy := false;
    current_layer := 1;

    foreach item_type in array array['Cards', 'Relics', 'Blessings', 'HardTags'] loop
      item_data := payload -> item_type;
      if item_data is null then continue; end if;

      foreach source_key in array array['RewardShow', 'ShopShow', 'Show'] loop
        if jsonb_typeof(item_data -> source_key) = 'array' then
          for item in select value from jsonb_array_elements(item_data -> source_key) loop
            candidate_id := coalesce(item ->> 'Name', item ->> 'name', trim(both '"' from item::text));
            if candidate_id = item_id then
              current_layer := coalesce(
                public.dashboard_int_safe(item ->> 'Level', null),
                public.dashboard_int_safe(item ->> 'level', null),
                public.dashboard_int_safe(item ->> 'floor', null),
                1
              );
              found_show := true;
            end if;
          end loop;
        end if;
      end loop;

      foreach source_key in array array['Select', 'Selected', 'Picked'] loop
        if jsonb_typeof(item_data -> source_key) = 'array' then
          for item in select value from jsonb_array_elements(item_data -> source_key) loop
            candidate_id := coalesce(item ->> 'Name', item ->> 'name', trim(both '"' from item::text));
            if candidate_id = item_id then
              current_layer := coalesce(
                public.dashboard_int_safe(item ->> 'Level', null),
                public.dashboard_int_safe(item ->> 'level', null),
                public.dashboard_int_safe(item ->> 'floor', null),
                1
              );
              found_select := true;
            end if;
          end loop;
        end if;
      end loop;

      foreach source_key in array array['Buy', 'Bought', 'Purchased'] loop
        if jsonb_typeof(item_data -> source_key) = 'array' then
          for item in select value from jsonb_array_elements(item_data -> source_key) loop
            candidate_id := coalesce(item ->> 'Name', item ->> 'name', trim(both '"' from item::text));
            if candidate_id = item_id then
              current_layer := coalesce(
                public.dashboard_int_safe(item ->> 'Level', null),
                public.dashboard_int_safe(item ->> 'level', null),
                public.dashboard_int_safe(item ->> 'floor', null),
                1
              );
              found_buy := true;
            end if;
          end loop;
        end if;
      end loop;

      if jsonb_typeof(item_data) = 'array' then
        for item in select value from jsonb_array_elements(item_data) loop
          candidate_id := coalesce(item ->> 'Name', item ->> 'name', trim(both '"' from item::text));
          if candidate_id = item_id then
            current_layer := coalesce(
              public.dashboard_int_safe(item ->> 'Level', null),
              public.dashboard_int_safe(item ->> 'level', null),
              public.dashboard_int_safe(item ->> 'floor', null),
              1
            );
            found_select := true;
          end if;
        end loop;
      end if;
    end loop;

    if not found_show and not found_select and not found_buy then
      continue;
    end if;

    normalized_layer := least(greatest(current_layer, 1), 30);
    if found_show then
      layer_data := public.dashboard_jsonb_increment(layer_data, array[normalized_layer::text, 'show'], 1);
      total_show := total_show + 1;
    end if;
    if found_select then
      layer_data := public.dashboard_jsonb_increment(layer_data, array[normalized_layer::text, 'select'], 1);
      total_select := total_select + 1;
    end if;
    if found_buy then
      layer_data := public.dashboard_jsonb_increment(layer_data, array[normalized_layer::text, 'buy'], 1);
      total_buy := total_buy + 1;
    end if;
    layer_data := public.dashboard_jsonb_increment(layer_data, array[normalized_layer::text, 'total'], 1);

    if first_seen is null or rec.created_at < first_seen then first_seen := rec.created_at; end if;
    if last_seen is null or rec.created_at > last_seen then last_seen := rec.created_at; end if;
  end loop;

  return jsonb_build_object(
    'itemId', item_id,
    'layerData', layer_data,
    'totalShow', total_show,
    'totalSelect', total_select,
    'totalBuy', total_buy,
    'firstSeen', first_seen,
    'lastSeen', last_seen
  );
end;
$$;

grant execute on function public.dashboard_jsonb_safe(text) to authenticated;
grant execute on function public.dashboard_jsonb_increment(jsonb, text[], integer) to authenticated;
grant execute on function public.dashboard_int_safe(text, integer) to authenticated;
grant execute on function public.dashboard_jsonb_object_length_safe(jsonb) to authenticated;
grant execute on function public.dashboard_record_items(jsonb) to authenticated;
grant execute on function public.dashboard_data_summary(integer) to authenticated;
grant execute on function public.dashboard_item_detail(text) to authenticated;
