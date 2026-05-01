# PrimeWave

PrimeWave is a full-stack OTT-style video streaming web application featuring user authentication, content browsing, AWS S3-backed video playback, and admin management.

## Tech Stack

- **Frontend:** React, React Router, Axios, AWS SDK (S3 Presigned URLs)
- **Backend:** Node.js, Express, JWT, bcryptjs
- **Database:** PostgreSQL (`pg` library)
- **Storage:** AWS S3 (for video files)

## Project Structure

```text
PrimeWave/
  backend/
    app.js
    db.js
    middleware/
    routes/
  public/
  src/
    components/
    features/
    data/
  package.json
```

## Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL 14+
- AWS Account with S3 bucket (for videos)

## Setup & Installation

**1. Clone the repository and install dependencies:**

```bash
# Install frontend dependencies (in root directory)
npm install

# Install backend dependencies
cd backend
npm install
```

**2. Environment Variables:**

Create `.env` files in both the root directory and the `backend` directory based on provided examples.

Backend variables (`backend/.env`):
```env
PORT=5000
DATABASE_URL=postgres://username:password@localhost:5432/primewave
JWT_SECRET=replace_with_a_secure_secret
TOKEN_EXPIRES_IN=24h

# AWS S3 Configuration
AWS_REGION=your_aws_region
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET_NAME=primewave
```

**3. Database Setup:**

Create the database in PostgreSQL:
```sql
CREATE DATABASE primewave;
```
*(Reference the Database Overview below for complete schema structure)*

**4. Run Locally:**

Start the backend (Terminal 1):
```bash
cd backend
npm run dev
```

Start the frontend (Terminal 2):
```bash
npm start
```

- Frontend: `http://localhost:3000`
- Backend API base: `http://localhost:5000/api`

## AWS S3 Storage Structure

Video files are stored securely in an AWS S3 bucket (`s3://primewave/`). Folder structure:

```text
s3://primewave/
    movies/
        inception/1080p.mp4
        interstellar/1080p.mp4
    webseries/breaking-bad/
        season-01/
            episode-001/720p.mp4
            :
            :
            episode-008/720p.mp4
        season-02/
            episode-001/720.mp4
            :
            :
            episode-013/720p.mp4
```

## Database Overview

This is a **video streaming / OTT platform database** encompassing users, content (movies/series), subscriptions, and interactions.

### Compact Schema Representation (Entity-Relationship)

```text
users(user_id PK, email UNIQUE, ...)
admins(admin_id PK, email UNIQUE)

content(content_id PK)
movies(movie_id PK, content_id FK)
series(series_id PK, content_id FK)
seasons(season_id PK, series_id FK)
episodes(episode_id PK, season_id FK)

genres(genre_id PK, genre_name UNIQUE)
content_genres(content_id FK, genre_id FK, PK(content_id, genre_id))

subscription_plans(plan_id PK)
user_subscriptions(subscription_id PK, user_id FK, plan_id FK)

payments(payment_id PK, user_id FK, subscription_id FK)

reviews(review_id PK, user_id FK, content_id FK)
user_watchlist(user_id FK, content_id FK, PK(user_id, content_id))
user_favorites(user_id FK, content_id FK, PK(user_id, content_id))

user_playback(playback_id PK, user_id FK, content_id FK)
user_interactions(interaction_id PK, user_id FK, content_id FK)
```

### Key Relationships & Querying

- **Users ↔ Content:** Users interact with content via `reviews`, `watchlist`, `favorites`, `playback`, and `interactions`.
- **Content Hierarchy:** `content` is the central parent table. Use it as the central join point for anything related to movies or series. 
  - Standard hierarchy: `series` → `seasons` → `episodes`.
- **Subscriptions & Payments:** `users` → `user_subscriptions` → `subscription_plans`, and `users` → `payments` → `user_subscriptions`.
- **Genres:** `content` ↔ `genres` via the many-to-many `content_genres` table.

All tables establish Functional Dependencies fully reliant on their Primary Keys, with unique requirements on `users.email`, `admins.email`, and `genres.genre_name`. Critical indexing applies to emails, foreign keys (e.g., `user_id`, `content_id`), and user-based lookups.

## API Overview

**Auth routes:**
- `POST /api/auth/register` : Register a new user
- `POST /api/auth/admin/register` : Register a new admin
- `POST /api/auth/login` : Login user/admin

**User route:**
- `GET /api/user/profile` (requires user JWT)

**Admin route:**
- `GET /api/admin/dashboard` (requires admin JWT)

## System Architecture Details

### Database: The Hybrid Model (JSONB vs Normalized)
PrimeWave uses a **Hybrid Database Model** to balance strict relational integrity with flexible dynamic metadata.

**Why JSONB was initially used:**
- Faster read operations (fewer joins) for arrays of simple strings like audio tracks and subtitle languages.
- Flexible schema without needing a rigid table structure for rapidly changing metadata fields.

**Why we normalized media tracks:**
- As the system scales, JSONB breaks the First Normal Form (1NF) rule of atomicity. 
- It makes filtering, indexing, and querying for specific file paths significantly harder.
- **Final Approach:** Structured data (video files, precise audio/subtitle tracks with S3 URLs) is moved to strict normalized tables (`video_files`, `audio_tracks`, `subtitle_tracks`). Dynamic, unpredictable metadata (like AI tags or extra non-essential descriptors) remains in JSONB columns.

### Recommendation System
PrimeWave features a **Hybrid Recommendation Engine** designed to offer a personalized "Netflix-style" homepage.

**Internal Full Flow:**
1. **Input Data Aggregation:**
   - Evaluates the user's explicit actions: `user_watchlist`, `user_favorites`, and reviews.
   - Gathers implicit signals: `user_playback` (completion rate) and `continue_watching` (engagement).
   - Maps content relationships via the `content_tag_map` and `content_genres` tables.
2. **Content-Based Filtering:**
   - Suggests content that shares genres and tags with the user's highest-engaged content (e.g., if a user watches Sci-Fi thrillers, it fetches content with matching tags).
3. **Collaborative Filtering:**
   - Identifies cohorts of users with similar interaction histories and recommends content those cohorts enjoyed.
4. **Trending & Popularity Boost:**
   - Content with sudden spikes in global `user_interactions` receives a dynamic weight boost to appear in "Trending" rows.
5. **Output Delivery:**
   - The `/api/user/recommendations` endpoint blends these signals to return distinct, personalized rows such as *"Because you watched X"*, *"Trending Now"*, and *"Recommended for You"*.