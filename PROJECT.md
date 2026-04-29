# NicheFinder — YouTube Niche Discovery Tool

## Vizyon
TubeLab'ın niş keşfi + ViewStats'ın outlier analizi, tek yerde. Önce kişisel kullanım, sonra public.

## Rakip Analizi

| Özellik | TubeLab ($29/ay) | ViewStats Pro ($49.99/ay) | NicheFinder |
|---|---|---|---|
| Niş keşfi | ✅ 400K+ kanal | ⚠️ Analiz odaklı | ✅ Hedef |
| Outlier detection | ✅ 4M video | ✅ "Neden viral" açıklama | ✅ Hedef |
| RPM / Monetizasyon | ✅ | ⚠️ Sınırlı | ✅ Hedef |
| Thumbnail analizi | ❌ | ✅ A/B arşivi | ⏭️ Faz 3 |
| Alerts | ❌ | ✅ | ⏭️ Faz 2 |
| AI fikir üretimi | ✅ | ✅ | ⏭️ Faz 3 |
| Chrome extension | ✅ | ✅ | ⏭️ Faz 3 |

**Farklılaşma:** Niş keşfi + outlier "neden" açıklaması + RPM filtresi tek arayüzde, daha ucuz.

## Teknoloji Stack

- **Frontend + Backend:** Next.js 15 (App Router) + TypeScript
- **Database + Auth:** Supabase (Postgres)
- **Styling:** Tailwind CSS v4
- **Data:** YouTube Data API v3 + RSS feeds
- **Cron:** Vercel Cron (gecelik tarama)
- **Deploy:** Vercel
- **AI (Faz 3):** Claude API

## Veri Stratejisi

**Quota gerçekliği:** YouTube Data API v3 = 10K unit/gün (ücretsiz).
- `videos.list` / `channels.list` = 1 unit / 50 ID batch
- `search.list` = 100 unit (pahalı, minimum kullan)
- RSS feeds = **quota YOK** (altın kaynak)

**Büyüme planı:**
1. **Seed:** 500 popüler kanal (manuel toplanır, faceless nişlere odaklı)
2. **RSS ile günlük tarama** — yeni videolar quota harcamadan
3. **Graph crawling** — featured channels + mention parsing
4. **Batch API çağrıları** — 50 ID/call, 500K kanal/gün teorik kapasite
5. **Postgres cache** — aynı kanalı 2. kez çekme

Hedef: 6 ay içinde 10-20K kanal havuzu.

## Faz 1 — MVP (2-3 hafta)

**Core özellikler:**
- [ ] Keyword/niş input → YouTube search + cache
- [ ] Video/kanal listesi + temel metrikler (views, subs, video count, yaş)
- [ ] **Outlier skoru:** `video_views / channel_avg_views`
- [ ] Saturation skoru (top 20 kanalın sub dağılımı)
- [ ] Basit filtre: min/max sub, min view, yaş
- [ ] Tek sayfa arayüz — arama + sonuç tablosu

**Teknik setup:**
- [ ] Next.js 15 + TS + Tailwind
- [ ] Supabase bağlantısı (channels, videos, searches tabloları)
- [ ] YouTube API wrapper (`lib/youtube.ts`)
- [ ] Environment variables (API key, Supabase keys)

## Faz 2 — Zenginleştirme (2-3 hafta)

- [ ] RPM tahmini (kategoriye göre tablo)
- [ ] Monetizasyon tespiti (HTML scrape, dikkatli)
- [ ] Benzer kanal keşfi
- [ ] Trend skoru (son 30 günde büyüme)
- [ ] Gecelik cron — seed kanalları refresh
- [ ] RSS feed entegrasyonu
- [ ] Alerts (konu bazlı email/push)

## Faz 3 — Public-ready

- [ ] Supabase auth (Google login)
- [ ] Stripe entegrasyonu
- [ ] AI ile başlık/fikir üretimi (Claude API)
- [ ] Thumbnail analizi (manuel curated başla)
- [ ] Chrome extension
- [ ] Landing page + SEO
- [ ] Collections/saved channels

## Veri Modeli (taslak)

```
channels
  id (youtube_id), title, description, subs, total_views, video_count,
  country, created_at, category, fetched_at, avg_views_last_30, is_monetized

videos
  id (youtube_id), channel_id, title, views, likes, duration,
  published_at, thumbnail_url, tags, outlier_score, fetched_at

searches (kullanıcı aramaları)
  id, user_id, keyword, filters_json, created_at

seed_channels (graf için)
  channel_id, added_via (seed/mention/featured/user), priority
```

## Başlangıç Adımları (şimdi)

1. Next.js projesi oluştur
2. Tailwind + TypeScript setup
3. Supabase hesabı + şema
4. YouTube API key al
5. İlk endpoint: `/api/search?q=...` — keyword → 50 video döndürür
6. Basit tablo UI
7. İterasyon

## Büyüme Stratejisi — Aşama Aşama

Tek Google hesabıyla, ToS'a uygun, sürdürülebilir ölçekleme planı.
**Çoklu hesap yok** — banlanma riski kısa vadeli kazanca değmez.

### Aşama 0 — Temel (tamam ✅)
Cache + Supabase çalışır durumda. Tek keyword araması ~102 unit, günlük ~95 arama kapasitesi. Cache sayesinde tekrar sorgular 0 unit.

### Aşama 1 — Seed + RSS ile bedava keşif
Amaç: quota harcamadan her gün binlerce yeni video keşfetmek.

- 500 manuel seed kanal topla (faceless/niche odaklı)
- Her seed için YouTube RSS feed (`videos.xml?channel_id=...`) → son 15 video, **0 quota**
- Yeni video ID'leri batch `videos.list` ile zenginleştir (1 unit / 50 video)
- Gecelik cron ile tüm seed'leri tara
- **Sonuç:** günde ~7.500 yeni video keşfi, ~20-30 unit harcama

### Aşama 1.5 — Auto-search worker (otomatik keyword taraması)
Amaç: kullanıcı manuel arama yapmadan yeni kanal keşfini otomatikleştirmek.

- `seed_keywords` tablosu — 80-100 evergreen niş keyword başlangıç tohumu
- Gecelik cron her keyword'ü sırayla aratır (en eski tarananı önce, priority desc)
- Her arama: 102 unit, çıkan top 30-50 kanalı seed listesine ekler
- Günlük budget: ~88 keyword × 102 unit ≈ ~8900 unit (9000 guard altında kalır)
- **Sonuç:** günde ~2000-3000 yeni unique kanal keşfi
- Admin UI `/admin/keywords` — keyword listesi, ekle/çıkar/disable, priority

### Aşama 1.6 — Self-evolving keyword sistemi (kendiliğinden öğrenen sistem)
Amaç: keyword listesi sabit kalmasın, sistem kendi kendine yeni keyword'ler türetsin ve eski/zayıfları ayıklasın. **Sıfır kullanıcı müdahalesiyle sürekli büyüyen havuz.**

**4 keşif kaynağı:**

1. **Tag/title extraction (mevcut veriden öğrenme)**
   - Keşfedilen son 7 gündeki videoların tags + title kelimelerini frekans analizi
   - 2-3 kelimelik n-gram'lar çıkar, stop-word filtrele
   - En az 3 farklı kanalda geçen ifadeler → candidate keyword
   - `source='extracted'` ile seed_keywords'e ekle
   - Quota: 0 (sadece DB)

2. **Variation generator (template-based üretim)**
   - High-priority keyword'lerden şablonla yeni varyantlar:
     - `"best {X} 2026"`, `"{X} tutorial"`, `"{X} explained"`,
     - `"{X} for beginners"`, `"how to {X}"`, `"{X} shorts"`, `"{X} tips"`
   - Cross-pollination: 2 high-yield keyword birleştir ("ai" + "finance" → "ai finance tools")
   - Quota: 0
   - Haftalık çalışır, ~30-50 yeni keyword/hafta

3. **Trend discovery (dış kaynak)**
   - Google Trends RSS: günlük popüler aramalar (`https://trends.google.com/trends/trendingsearches/daily/rss`)
   - YouTube trending: `videos.list?chart=mostPopular&regionCode=US` (1 unit/gün)
   - Reddit RSS: r/youtube, r/NewTubers gündem konuları
   - Çıkan trend'lerden niş keyword türet
   - `source='trend'`, `expires_at = now() + 30 days` (eski trend'ler ölür)
   - Günlük çalışır, ~5-15 yeni keyword/gün

4. **AI generation (opsiyonel, ucuz)**
   - Claude Haiku ($0.25/1M token, çok ucuz)
   - Haftalık prompt: "İşte top performing 50 keyword. 20 yeni evergreen niş keyword öner, kategori ve tahmini RPM'le birlikte"
   - `source='ai_generated'` ile ekle
   - Maliyet: ~$0.01/hafta

**Performance tuner (zayıfları ayıkla):**
- Her keyword'ün `yield = total_channels_added / total_runs` skoru
- Top 10% yield → priority +10
- Bottom 10% yield (5+ run'dan sonra) → auto-disable
- Aynı kanalı tekrar bulan keyword'ler → priority düşer (overlap penalty)
- Haftalık çalışır

**Self-reinforcing loop:**
```
Day 0:  80 manuel keyword           → 0 kanal
Day 1:  Auto-search → 3K kanal      → Extraction +30 keyword
Day 2:  110 keyword → 4K kanal      → +40 keyword + 5 trend
Day 7:  ~250 keyword                → 25K kanal
Day 30: ~600 keyword                → 100K+ kanal
```

**Cron schedule (UTC):**
- 03:00 — `/api/cron/refresh-seeds` (mevcut RSS)
- 04:00 — `/api/cron/auto-search` (keyword'leri arat)
- 05:00 — `/api/cron/keyword-discovery` (extract + vary + trend + tune)
- 06:00 — `/api/cron/keyword-ai` (AI generation, haftada bir gün)

**Sonuç:** Sen hiçbir şey yapmazsan bile sistem her gece kendi kendine büyüyor — yeni kanallar keşfediliyor, onlardan yeni keyword'ler türüyor, trendler izleniyor, zayıf keyword'ler ayıklanıyor. **6 ayda 100K+ kanal organik olarak.**

### Aşama 1.7 — Parallel Growth Orchestrator (paralel keşif motoru)
Amaç: Tüm büyüme döngülerini **aynı anda** çalıştırmak. AI yeni dikey önerirken kanallardan keyword çıkarılsın, pattern miner viral kalıpları yakalasın, slot filler kalıpları çeşitlendirsin, graph crawler yeni kanal bulsun. Hepsi tek master cron içinde paralel.

**Mimari:**
```
03:00 UTC  refresh-seeds         (RSS, 0 quota)
04:00 UTC  grow:discover ← MASTER
           ├─ pattern-miner            (regex + n-gram)
           ├─ velocity-tracker         (emerging clusters)
           ├─ keyword-extraction       (video tags/titles)
           ├─ keyword-variation        (template)
           ├─ keyword-trends           (Google Trends RSS)
           ├─ graph-crawler            (mentions + featured)
           ├─ ai:vertical-strategist   (200+ dikey kütüphanesi → boş yerlere öner)
           └─ ai:pattern-slot-filler   (pattern bulunca 50 slot doldur)
05:00 UTC  auto-search            (88 keyword arat, quota harcar)
06:00 UTC  grow:tune              (Darwinian elimination)
```

8 keşif döngüsü `Promise.all` ile paralel → 30 dk yerine 5-10 dk sürer.

**AI provider-agnostic (vendor lock-in yok):**
- OpenAI-uyumlu base URL kullanılır → kod tek
- 14 gün ücretsiz: `qwen3-max-2026-01-23` (Alibaba Cloud Coding Plan trial)
- Sonra: `gemini-3.1-flash-lite-preview` ($0.25 input / $1.50 output per 1M token)
- Switch tek env değişikliği: `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`

**Maliyet kapağı:** `AI_DAILY_BUDGET_USD=0.10` env. `ai_costs` tablosu günlük masrafı izler, eşik aşılırsa AI loop o gün durur. Bug/loop fatura yakmaz.

**Yeni tablolar:**
- `title_patterns` — yakalanan viral kalıplar + slot çeşitliliği + velocity
- `format_alerts` — breakout format alarmları
- `ai_costs` — günlük AI maliyet izleme

**Sonuç:** Tek gecede 8 paralel döngü çalışır. Sen hiçbir şey yapmazsan bile sistem her gece **yeni dikey + yeni keyword + yeni pattern + yeni kanal + zayıfları ayıklama** yapar. Tamamen otonom büyüme.

### Aşama 2 — Graph crawling ile kanal havuzu genişletme
Amaç: seed listesini organik olarak büyütmek.

- Video açıklamalarındaki `@kanal` mentionlarını parse et
- "Featured channels" (kanalın öne çıkardığı diğer kanallar) topla
- Aynı niş video yorumlarında sık geçen kanalları çıkar
- Yeni bulunanları seed listesine ekle, priority = düşük
- **Sonuç:** günde ~10.000 yeni kanal keşfi, ek quota ~0

### Aşama 3 — Playlist trick ile kanal geçmişi
Amaç: bir kanalın tüm video geçmişini ucuza çekmek.

- Her YouTube kanalının "uploads" playlist'i var (channelId → "UU" ile başlayan playlistId)
- `playlistItems.list` = 1 unit / 50 video
- Bir kanalın son 500 videosunu **10 unit**'e çekersin (search.list ile aynısı 500 unit ederdi)
- Seed kanalların geriye dönük videolarını bu yolla doldur
- **Sonuç:** kanal havuzu derinleşir, trend hesapları daha doğru

### Aşama 4 — Quota Increase başvurusu
Amaç: ölçek büyüdüğünde resmi yoldan limit yükseltme.

- Google Cloud Console → YouTube Data API → Quotas → "Request higher quota"
- Form: ürün açıklaması + kullanım senaryosu + N daily active users
- Ücretsiz, 1-4 hafta onay süreci, onay oranı ~%70
- Onaylanınca tek projeden 1M-10M unit/gün mümkün
- 30K+ kanal havuza ulaşıldığında başvur — elindeki veri "ciddi ürün" sinyali

### Hedef — 6 Ayda 10-20K kanal havuzu
Aşama 1-3 yalnızca tek hesap quota'sı içinde **6 ayda TubeLab benzeri 10-20K kanal** havuzuna çıkar. Aşama 4 onaylanırsa 400K+ kanal havuzu teknik olarak önümüzde.

### Yapma Listesi (ToS)
- ❌ Aynı ürün için birden fazla Gmail hesabından API key rotate etmek → banlanır
- ❌ `search.list`'i gereksiz yere çağırmak → quota yakar
- ❌ HTML scrape ile YouTube sayfalarından veri çekmek → izinsiz, hesap kapatılır
- ✅ Resmi API + RSS + cache + batch + quota increase
