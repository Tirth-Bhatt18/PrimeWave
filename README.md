# PrimeWave

PrimeWave is a full-stack OTT-style video streaming platform featuring tiered subscriptions (Basic/Premium), AWS S3-backed video playback, a content reviews system, and a full-featured admin dashboard with direct-to-S3 uploads.

## Tech Stack

- **Frontend:** React, React Router, Axios
- **Backend:** Node.js, Express, JWT, bcryptjs
- **Database:** PostgreSQL (`pg` library)
- **Storage:** AWS S3 (Direct-to-S3 uploads via Presigned PUT URLs)

## Project Structure

```text
PrimeWave/
  backend/
    app.js
    db.js
    middleware/
    routes/
      authRoutes.js
      userRoutes.js
      adminRoutes.js
      videoRoutes.js
      libraryRoutes.js
  src/
    features/
      admin/
        AdminDashboard.js
        MovieUploadForm.js
        SeriesUploadForm.js
      auth/
        AuthContext.js
        components/
      movies/
        components/
          MovieDetails.js
          Watch.js
          Reviews.js
      payments/
        components/
          DummyPayment.js
```

## Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL 14+
- AWS Account with S3 bucket

## Setup & Installation

**1. Clone the repository and install dependencies:**

```bash
npm install          # frontend (root)
cd backend && npm install   # backend
```

**2. Environment Variables — `backend/.env`:**

```env
PORT=5000
DATABASE_URL=postgres://username:password@localhost:5432/primewave
JWT_SECRET=replace_with_a_secure_secret
TOKEN_EXPIRES_IN=24h
AWS_REGION=your_aws_region
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET_NAME=primewave
```

**3. Database Setup:**

```sql
CREATE DATABASE primewave;
```

**4. Run Locally:**

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
npm start
```

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:5000/api`

---

## AWS S3 Storage Structure

```text
s3://primewave/
    movies/
        inception/
            thumbnail.jpg
            1080p.mp4
            720p.mp4
            audio_es.aac
            sub_en.vtt
    webseries/breaking-bad/
        thumbnail.jpg
        season-01/
            episode-001/
                1080p.mp4
                720p.mp4
        season-02/
            episode-001/
                1080p.mp4
```

---

## Database Overview

### Compact Schema

```text
users(user_id PK, email UNIQUE, status CHECK('ACTIVE','INACTIVE'))
admins(admin_id PK, email UNIQUE)

subscription_plans(plan_id PK, plan_name)
user_subscriptions(subscription_id PK, user_id FK, plan_id FK, status CHECK('ACTIVE','EXPIRED'))
payments(payment_id PK, user_id FK, subscription_id FK NOT NULL, amount, payment_status)

content(content_id PK, content_type, access_level)
movies(movie_id PK, content_id FK)
series(series_id PK, content_id FK)
seasons(season_id PK, series_id FK)
episodes(episode_id PK, season_id FK, video_url)

video_files(file_id PK, content_id FK, episode_id FK nullable, quality, file_url)
audio_tracks(track_id PK, content_id FK, episode_id FK nullable, language_code, file_url)
subtitle_tracks(track_id PK, content_id FK, episode_id FK nullable, language_code, file_url)

genres(genre_id PK, genre_name UNIQUE)
content_genres(content_id FK, genre_id FK)

reviews(review_id PK, user_id FK, content_id FK, rating, UNIQUE(user_id,content_id))
user_watchlist(user_id FK, content_id FK)
user_favorites(user_id FK, content_id FK)
continue_watching(id PK, user_id FK, content_id FK, progress_seconds)
```

### Key Relationships

- `users.status` (`ACTIVE`/`INACTIVE`) controls **account access** — independent of subscription plan
- `user_subscriptions.plan_id` controls **subscription tier** (1=Basic/Free, 2=Premium)
- `content.access_level` controls **content access** — enforced in stream route by comparing JWT `plan_id`
- Media tracks (`video_files`, `audio_tracks`, `subtitle_tracks`) keyed by `content_id` + optional `episode_id`

---

## API Overview

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/register` | Register user (creates subscription row) |
| POST | `/api/auth/admin/register` | Register admin |
| POST | `/api/auth/login` | Login — returns JWT with `plan_id` embedded |

### User
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/user/profile` | Get profile |
| GET | `/api/user/recommendations` | Personalized suggestions |
| POST | `/api/user/pay` | Dummy payment — upgrades plan, records payment, returns new JWT |
| POST | `/api/user/downgrade` | Downgrade to Basic, returns new JWT |

### Video
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/videos` | Browse all content |
| GET | `/api/videos/:id/stream` | Presigned stream URL (enforces `access_level` vs JWT `plan_id`, returns 403 if insufficient) |
| GET | `/api/videos/:id/catalog` | Season/episode catalog for series |
| GET | `/api/videos/:id/reviews` | Reviews + aggregate rating |
| POST | `/api/videos/:id/reviews` | Submit review (requires `progress_seconds > 0` in `continue_watching`) |

### Library
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST/DELETE | `/api/library/watchlist` | Watchlist management |
| GET/POST/DELETE | `/api/library/favorites` | Favorites management |
| GET/POST | `/api/library/continue` | Continue watching progress |

### Admin _(requires Admin JWT)_
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/admin/dashboard` | Real-time stats (users, premium count, content, watch hours) |
| GET | `/api/admin/users` | All users with plan info |
| PATCH | `/api/admin/users/:id` | Set account status (`ACTIVE`/`INACTIVE`) |
| GET | `/api/admin/content` | All content with episode counts |
| DELETE | `/api/admin/content/:id` | Delete content + all related data |
| POST | `/api/admin/content/movie` | Register movie in DB |
| POST | `/api/admin/content/series` | Register series in DB |
| POST | `/api/admin/content/series/:id/season` | Add season |
| POST | `/api/admin/content/season/:id/episode` | Add episode + tracks to DB |
| GET | `/api/admin/presigned-put` | Generate S3 Presigned PUT URL for direct upload |

---

## System Architecture

### Subscription & Payment Flow

1. **Registration:** User selects plan. `user_subscriptions` row is created immediately.
2. **Premium Upgrade:** User is redirected to `/payment`. On confirm, `POST /api/user/pay`:
   - SELECTs existing subscription (or INSERTs new) — captures `subscription_id`
   - UPDATEs `user_subscriptions` with `plan_id=2, status='ACTIVE'`
   - INSERTs into `payments` (with `subscription_id` to satisfy NOT NULL constraint)
   - Strips JWT metadata (`exp`, `iat`, `nbf`) and signs a **new JWT** with updated `plan_id`
   - Frontend decodes new token directly → updates `AuthContext` + `localStorage`
3. **Downgrade:** `POST /api/user/downgrade` sets `plan_id=1`, returns new JWT. UI shows inline status message.

### JWT Re-Signing Pattern

```js
// Strip exp/iat/nbf before re-signing — prevents "payload already has exp" error
const { exp, iat, nbf, ...userClaims } = req.user;
const payload = { ...userClaims, plan_id: parseInt(plan_id) };
const newToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
```

### Premium Content Gate

- `content.access_level = 2` → Premium only
- Stream route returns `403` if `req.user.plan_id < content.access_level`
- Watch page catches `403` → renders locked Premium gate UI with "⭐ Upgrade to Premium" button
- Browse UI shows `🔒 Premium` badge overlay on restricted content cards

### Admin Dashboard

- **Overview:** Aggregated stats — premium count queries `user_subscriptions WHERE plan_id=2 AND status='ACTIVE'`
- **Users:** Shows each user's plan. Deactivate/Activate controls `users.status` (login access only — not plan)
- **Upload → Movie (`MovieUploadForm`):** Thumbnail + 1080p/720p video + audio + subtitle → direct S3 upload → DB registration
- **Upload → Series (`SeriesUploadForm`):** Multi-step: create series → add seasons → per-episode file uploads → DB registration

### Direct-to-S3 Upload Pipeline

1. Frontend → `GET /api/admin/presigned-put?key=<path>&contentType=<mime>` → gets Presigned PUT URL
2. Frontend → `axios.put(presignedUrl, file)` — uploads directly to S3 (no backend memory pressure)
3. Frontend → POST metadata to DB registration endpoint

### Reviews & Ratings

- One review per user per content (`UNIQUE(user_id, content_id)` + `ON CONFLICT DO UPDATE` for edits)
- Backend validates `progress_seconds > 0` in `continue_watching` before accepting POST (admins exempt)
- 1–5 star ratings aggregated and shown on content detail pages
