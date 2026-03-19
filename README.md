# PrimeWave

PrimeWave is a full-stack OTT-style web application with:

- React frontend for browsing movies and series, authentication screens, and media pages.
- Node.js + Express backend for authentication and role-protected APIs.
- PostgreSQL for user/admin data.

## Tech Stack

- Frontend: React, React Router, Axios
- Backend: Node.js, Express, JWT, bcryptjs, pg
- Database: PostgreSQL

## Project Structure

```
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

## Environment Variables

Create these files from examples:

- `/.env`
- `/backend/.env`

Backend variables (`backend/.env`):

```
PORT=5000
DATABASE_URL=postgres://username:password@localhost:5432/primewave
JWT_SECRET=replace_with_a_secure_secret
TOKEN_EXPIRES_IN=24h
```

## Database Setup

Create the database and required tables in PostgreSQL:

```sql
CREATE DATABASE primewave;

\c primewave;

CREATE TABLE IF NOT EXISTS users (
  user_id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS admins (
  admin_id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL
);
```

## Install

Install frontend dependencies:

```bash
npm install
```

Install backend dependencies:

```bash
cd backend
npm install
```

## Run Locally

Run backend (Terminal 1):

```bash
cd backend
npm run dev
```

Run frontend (Terminal 2):

```bash
npm start
```

Frontend: `http://localhost:3000`

Backend API base: `http://localhost:5000/api`

## API Overview

Auth routes:

- `POST /api/auth/register`
- `POST /api/auth/admin/register`
- `POST /api/auth/login`

User route:

- `GET /api/user/profile` (requires user JWT)

Admin route:

- `GET /api/admin/dashboard` (requires admin JWT)

## Scripts

Frontend (`/`):

- `npm start`
- `npm run build`
- `npm test`

Backend (`/backend`):

- `npm start`
- `npm run dev`

## Notes

- Generated logs and one-time DB bootstrap helper scripts were removed from version control.
- Keep `.env` files local and never commit secrets.
