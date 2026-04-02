// Static content data - deprecated.
// All content is now served dynamically from the PostgreSQL database via:
//   GET /api/videos/catalog/all     (home page, search, genres)
//   GET /api/videos/:id/catalog     (movie details, watch page)
// This file is kept as an empty export to prevent any legacy import from breaking.
export const movies = [];
export const series = [];