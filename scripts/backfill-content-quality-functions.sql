set statement_timeout = '5min';

create or replace function public.backfill_content_quality_video_bucket(bucket integer, bucket_count integer)
returns integer
language sql
as $$
with classified as (
  select
    v.youtube_id,
    array_remove(array[
      case
        when (coalesce(v.duration_seconds, 0) > 0 and v.duration_seconds <= 180)
          or combined_text ~* '(^|\s)#(shorts|youtubeshorts)(\s|$)'
          or exists (
            select 1
            from unnest(coalesce(v.tags, '{}')) as tag
            where lower(trim(tag)) in ('shorts', 'youtube shorts', 'youtubeshorts')
          )
        then 'short_clip'
      end,
      case
        when combined_text ~* '\m(official\s+trailer|final\s+trailer|teaser\s+trailer|trailer|teaser|promo|coming\s+soon|release\s+date|first\s+look)\M'
        then 'trailer_promo'
      end,
      case
        when combined_text ~* '\m(announcement|announced|officially\s+announced|revealed|launch\s+event|premiere\s+date|release\s+announcement)\M'
        then 'announcement'
      end,
      case
        when combined_text ~* '\m(movie\s+clip|film\s+clip|official\s+clip|tv\s+show|full\s+episode|episode\s+[0-9]+|season\s+[0-9]+|web\s+series|netflix|disney\+|hbo|max\s+original|prime\s+video)\M'
        then 'film_tv_show'
      end,
      case
        when combined_text ~* '\m(match\s+highlights|game\s+highlights|full\s+match|live\s+score|goals?|nba|nfl|mlb|nhl|ufc|fifa|premier\s+league|champions\s+league|wwe|cricket|ipl)\M'
        then 'sports_match'
      end,
      case
        when combined_text ~* '\m(gameplay|walkthrough|let''?s\s+play|speedrun|minecraft|fortnite|roblox|gta\s*v?|valorant|call\s+of\s+duty|warzone|free\s+fire|pubg|gaming\s+setup|game\s+stream)\M'
        then 'gaming_gameplay'
      end,
      case
        when combined_text ~* '(^|\m)(live\s+stream|livestream|stream\s+highlights|streamed\s+live|full\s+stream|watch\s+live|live\s+now|live:)\M'
        then 'live_stream'
      end,
      case
        when combined_text ~* '\m(news\s+clip|tv\s+broadcast|broadcast\s+clip|late\s+show|tonight\s+show|interview\s+clip|cnn|fox\s+news|bbc\s+news|sky\s+news|msnbc)\M'
        then 'broadcast_clip'
      end,
      case
        when combined_text ~* '\m(official\s+music\s+video|music\s+video|lyric\s+video|visualizer|audio\s+official|official\s+audio)\M'
        then 'official_music_video'
      end
    ]::text[], null) as reasons
  from public.videos v
  cross join lateral (
    select lower(
      coalesce(v.title, '') || ' ' ||
      coalesce(v.description, '') || ' ' ||
      coalesce(array_to_string(v.tags, ' '), '')
    ) as combined_text
  ) text_source
  where mod(abs(hashtext(v.youtube_id)), bucket_count) = bucket
),
updated as (
  update public.videos v
  set
    content_class = case when cardinality(classified.reasons) > 0 then 'junk' else 'niche' end,
    content_reasons = classified.reasons,
    content_score = case
      when cardinality(classified.reasons) > 0
        then greatest(0.02, 0.22 - cardinality(classified.reasons) * 0.03)
      when lower(coalesce(v.title, '') || ' ' || coalesce(v.description, '') || ' ' || coalesce(array_to_string(v.tags, ' '), '')) ~*
        '\m(explained|documentary|case\s+study|how\s+to|guide|for\s+beginners|beginner''?s\s+guide|tutorial|breakdown|analysis|deep\s+dive|mistakes|lessons|strategy|framework|workflow|finance|business|startup|saas|tech|ai|education|health|productivity|history|science|engineering|investing|marketing|automation)\M'
        then 0.9
      else 0.62
    end
  from classified
  where v.youtube_id = classified.youtube_id
  returning 1
)
select count(*)::integer from updated;
$$;

create or replace function public.backfill_content_quality_channel_bucket(bucket integer, bucket_count integer)
returns integer
language sql
as $$
with bucket_channels as (
  select youtube_id
  from public.channels
  where mod(abs(hashtext(youtube_id)), bucket_count) = bucket
),
totals as (
  select
    bc.youtube_id as channel_id,
    count(v.youtube_id) as total_videos,
    count(v.youtube_id) filter (where v.content_class = 'junk') as junk_videos
  from bucket_channels bc
  left join public.videos v on v.channel_id = bc.youtube_id
  group by bc.youtube_id
),
reason_counts as (
  select
    v.channel_id,
    reason,
    count(*) as reason_count
  from public.videos v
  join bucket_channels bc on bc.youtube_id = v.channel_id
  cross join unnest(v.content_reasons) as reason
  group by v.channel_id, reason
),
ranked_reasons as (
  select
    channel_id,
    reason,
    reason_count,
    row_number() over (partition by channel_id order by reason_count desc, reason) as rn
  from reason_counts
),
reason_arrays as (
  select
    channel_id,
    array_agg(reason order by reason_count desc, reason) as reasons
  from ranked_reasons
  where rn <= 5
  group by channel_id
),
updated as (
  update public.channels c
  set
    junk_video_ratio = case
      when totals.total_videos > 0
        then round((totals.junk_videos::numeric / totals.total_videos::numeric), 4)
      else 0
    end,
    content_class = case
      when totals.total_videos >= 3
        and (totals.junk_videos::numeric / greatest(totals.total_videos, 1)::numeric) >= 0.5
        then 'junk'
      else 'niche'
    end,
    content_reasons = coalesce(reason_arrays.reasons, '{}')
  from totals
  left join reason_arrays on reason_arrays.channel_id = totals.channel_id
  where c.youtube_id = totals.channel_id
  returning 1
)
select count(*)::integer from updated;
$$;

create or replace function public.backfill_content_quality_seed_bucket(bucket integer, bucket_count integer)
returns integer
language sql
as $$
with updated as (
  update public.seed_channels sc
  set
    disabled_at = coalesce(sc.disabled_at, now()),
    disabled_reason = coalesce(sc.disabled_reason, 'content_quality_backfill')
  from public.channels c
  where sc.channel_id = c.youtube_id
    and c.content_class = 'junk'
    and mod(abs(hashtext(sc.channel_id)), bucket_count) = bucket
  returning 1
)
select count(*)::integer from updated;
$$;

