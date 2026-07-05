set statement_timeout = '10min';

with classified as (
  select
    v.youtube_id,
    array_remove(array[
      case
        when (coalesce(v.duration_seconds, 0) > 0 and v.duration_seconds <= 180)
          or combined_text ~* '(^|\s)#(shorts|youtubeshorts)(\s|$)'
          or coalesce(v.tags, '{}') && array['shorts', 'youtube shorts', 'youtubeshorts']
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
)
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
where v.youtube_id = classified.youtube_id;

with channel_stats as (
  select
    channel_id,
    count(*) as total_videos,
    count(*) filter (where content_class = 'junk') as junk_videos,
    coalesce(
      array(
        select reason
        from unnest(array_agg(content_reasons)) as reason
        where reason is not null
        group by reason
        order by count(*) desc, reason
        limit 5
      ),
      '{}'
    ) as reasons
  from public.videos
  group by channel_id
)
update public.channels c
set
  junk_video_ratio = case
    when channel_stats.total_videos > 0
      then round((channel_stats.junk_videos::numeric / channel_stats.total_videos::numeric), 4)
    else 0
  end,
  content_class = case
    when channel_stats.total_videos >= 3
      and (channel_stats.junk_videos::numeric / greatest(channel_stats.total_videos, 1)::numeric) >= 0.5
      then 'junk'
    else 'niche'
  end,
  content_reasons = channel_stats.reasons
from channel_stats
where c.youtube_id = channel_stats.channel_id;

update public.seed_channels sc
set
  disabled_at = coalesce(sc.disabled_at, now()),
  disabled_reason = coalesce(sc.disabled_reason, 'content_quality_backfill')
from public.channels c
where sc.channel_id = c.youtube_id
  and c.content_class = 'junk';

