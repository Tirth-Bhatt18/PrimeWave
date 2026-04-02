import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../config/api";
import "./AdminDashboard.css";

function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [content, setContent] = useState([]);
  const [tab, setTab] = useState("overview");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  // Upload state
  const [uploadMode, setUploadMode] = useState("movie"); // "movie" | "series"
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null); // { type: "success"|"error", msg }

  // Movie form
  const [movieForm, setMovieForm] = useState({
    title: "", description: "", release_year: "", age_rating: "",
    access_level: "1", thumbnail_url: "", video_url: "", duration: ""
  });

  // Series form
  const [seriesForm, setSeriesForm] = useState({
    title: "", description: "", release_year: "", age_rating: "",
    access_level: "1", thumbnail_url: ""
  });

  // After series created — add seasons/episodes
  const [createdSeries, setCreatedSeries] = useState(null); // { content_id, series_id, title }
  const [seasonNumber, setSeasonNumber] = useState("");
  const [seasons, setSeasons] = useState([]); // [{ season_id, season_number, episodes: [] }]
  const [episodeForm, setEpisodeForm] = useState({ season_idx: 0, episode_number: "", title: "", video_url: "" });

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (!token) { navigate("/login"); return; }
    fetchDashboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-hide toast after 4s
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const fetchDashboard = async () => {
    try {
      const [dash, usrs, cnt] = await Promise.all([
        api.get("/admin/dashboard", { headers }),
        api.get("/admin/users", { headers }),
        api.get("/admin/content", { headers }),
      ]);
      setStats(dash.data.stats);
      setUsers(usrs.data);
      setContent(cnt.data);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) navigate("/");
    }
  };

  const toggleUserStatus = async (userId, currentStatus) => {
    const newStatus = currentStatus === "active" ? "suspended" : "active";
    await api.patch(`/admin/users/${userId}`, { status: newStatus }, { headers });
    setUsers(users.map(u => u.user_id === userId ? { ...u, status: newStatus } : u));
  };

  const syncS3 = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await api.post("/admin/content/sync-s3", {}, { headers });
      setSyncMsg(`✅ Synced ${res.data.synced} items from S3`);
      fetchDashboard();
    } catch (e) {
      setSyncMsg("❌ Sync failed: " + e.response?.data?.message);
    } finally {
      setSyncing(false);
    }
  };

  const deleteContent = async (contentId, title) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/content/${contentId}`, { headers });
      setContent(content.filter(c => c.content_id !== contentId));
      setToast({ type: "success", msg: `"${title}" deleted` });
    } catch (e) {
      setToast({ type: "error", msg: e.response?.data?.message || "Delete failed" });
    }
  };

  // ── MOVIE SUBMIT ──
  const submitMovie = async (e) => {
    e.preventDefault();
    if (!movieForm.title.trim()) { setToast({ type: "error", msg: "Title is required" }); return; }
    setSubmitting(true);
    try {
      const payload = {
        ...movieForm,
        release_year: movieForm.release_year ? parseInt(movieForm.release_year) : null,
        access_level: parseInt(movieForm.access_level) || 1,
        duration: movieForm.duration ? parseInt(movieForm.duration) : null,
      };
      await api.post("/admin/content/movie", payload, { headers });
      setToast({ type: "success", msg: `Movie "${movieForm.title}" added!` });
      setMovieForm({ title: "", description: "", release_year: "", age_rating: "", access_level: "1", thumbnail_url: "", video_url: "", duration: "" });
      fetchDashboard();
    } catch (e) {
      setToast({ type: "error", msg: e.response?.data?.message || "Failed to add movie" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── SERIES SUBMIT ──
  const submitSeries = async (e) => {
    e.preventDefault();
    if (!seriesForm.title.trim()) { setToast({ type: "error", msg: "Title is required" }); return; }
    setSubmitting(true);
    try {
      const payload = {
        ...seriesForm,
        release_year: seriesForm.release_year ? parseInt(seriesForm.release_year) : null,
        access_level: parseInt(seriesForm.access_level) || 1,
      };
      const res = await api.post("/admin/content/series", payload, { headers });
      setCreatedSeries({ content_id: res.data.content_id, series_id: res.data.series_id, title: seriesForm.title });
      setSeasons([]);
      setToast({ type: "success", msg: `Series "${seriesForm.title}" created! Now add seasons & episodes.` });
      fetchDashboard();
    } catch (e) {
      setToast({ type: "error", msg: e.response?.data?.message || "Failed to add series" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── ADD SEASON ──
  const addSeason = async () => {
    if (!seasonNumber || !createdSeries) return;
    try {
      const res = await api.post(`/admin/content/series/${createdSeries.content_id}/season`, { season_number: parseInt(seasonNumber) }, { headers });
      setSeasons([...seasons, { season_id: res.data.season_id, season_number: parseInt(seasonNumber), episodes: [] }]);
      setSeasonNumber("");
      setToast({ type: "success", msg: `Season ${seasonNumber} added` });
    } catch (e) {
      setToast({ type: "error", msg: e.response?.data?.message || "Failed to add season" });
    }
  };

  // ── ADD EPISODE ──
  const addEpisode = async () => {
    const season = seasons[episodeForm.season_idx];
    if (!season || !episodeForm.episode_number) return;
    try {
      const res = await api.post(`/admin/content/season/${season.season_id}/episode`, {
        episode_number: parseInt(episodeForm.episode_number),
        title: episodeForm.title || `Episode ${episodeForm.episode_number}`,
        video_url: episodeForm.video_url || null,
      }, { headers });

      const updated = [...seasons];
      updated[episodeForm.season_idx].episodes.push({
        episode_id: res.data.episode_id,
        episode_number: parseInt(episodeForm.episode_number),
        title: episodeForm.title || `Episode ${episodeForm.episode_number}`,
      });
      setSeasons(updated);
      setEpisodeForm({ ...episodeForm, episode_number: "", title: "", video_url: "" });
      setToast({ type: "success", msg: `Episode ${episodeForm.episode_number} added` });
    } catch (e) {
      setToast({ type: "error", msg: e.response?.data?.message || "Failed to add episode" });
    }
  };

  const finishSeries = () => {
    setCreatedSeries(null);
    setSeasons([]);
    setSeriesForm({ title: "", description: "", release_year: "", age_rating: "", access_level: "1", thumbnail_url: "" });
    fetchDashboard();
  };

  return (
    <div className="admin-page">
      {/* TOAST */}
      {toast && (
        <div className={`admin-toast ${toast.type}`} onClick={() => setToast(null)}>
          {toast.type === "success" ? "✅" : "❌"} {toast.msg}
        </div>
      )}

      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <button className="back-btn" onClick={() => navigate("/")}>← Home</button>
      </div>

      <div className="admin-tabs">
        {["overview", "users", "content", "upload"].map(t => (
          <button key={t} className={`tab-btn ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "upload" ? "➕ Upload" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ═══════ OVERVIEW ═══════ */}
      {tab === "overview" && stats && (
        <div className="admin-overview">
          <div className="stats-grid">
            <StatCard label="Total Users" value={stats.totalUsers} icon="👥" />
            <StatCard label="Movies" value={stats.totalMovies} icon="🎬" />
            <StatCard label="Series" value={stats.totalSeries} icon="📺" />
            <StatCard label="Total Content" value={stats.totalContent} icon="🎞️" />
            <StatCard label="Watchlist Entries" value={stats.totalWatchlistEntries} icon="📋" />
            <StatCard label="Favorites" value={stats.totalFavorites} icon="❤️" />
          </div>

          <div className="sync-section">
            <h3>S3 Content Sync</h3>
            <p>Scan S3 bucket and auto-populate the database with all discovered movies and episodes.</p>
            <button className="sync-btn" onClick={syncS3} disabled={syncing}>
              {syncing ? "Syncing..." : "🔄 Sync S3 → Database"}
            </button>
            {syncMsg && <p className="sync-msg">{syncMsg}</p>}
          </div>
        </div>
      )}

      {/* ═══════ USERS ═══════ */}
      {tab === "users" && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Joined</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.user_id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td><span className={`status-badge ${u.status}`}>{u.status}</span></td>
                  <td>
                    <button className="action-btn" onClick={() => toggleUserStatus(u.user_id, u.status)}>
                      {u.status === "active" ? "Suspend" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════ CONTENT ═══════ */}
      {tab === "content" && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Title</th><th>Type</th><th>Year</th><th>Rating</th><th>Episodes</th><th>Access</th><th>Action</th></tr>
            </thead>
            <tbody>
              {content.map(c => (
                <tr key={c.content_id}>
                  <td>{c.title}</td>
                  <td><span className={`type-badge ${c.content_type}`}>{c.content_type}</span></td>
                  <td>{c.release_year}</td>
                  <td>{c.age_rating}</td>
                  <td>{c.episode_count > 0 ? c.episode_count : "—"}</td>
                  <td>Level {c.access_level}</td>
                  <td>
                    <button className="action-btn delete-btn" onClick={() => deleteContent(c.content_id, c.title)}>
                      🗑 Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════ UPLOAD ═══════ */}
      {tab === "upload" && (
        <div className="upload-section">
          {/* Mode toggle */}
          <div className="upload-mode-toggle">
            <button className={`mode-btn ${uploadMode === "movie" ? "active" : ""}`} onClick={() => { setUploadMode("movie"); setCreatedSeries(null); }}>
              🎬 Add Movie
            </button>
            <button className={`mode-btn ${uploadMode === "series" ? "active" : ""}`} onClick={() => setUploadMode("series")}>
              📺 Add Series
            </button>
          </div>

          {/* ── MOVIE FORM ── */}
          {uploadMode === "movie" && (
            <form className="upload-form" onSubmit={submitMovie}>
              <h3>Add New Movie</h3>
              <div className="form-grid">
                <div className="form-group full">
                  <label>Title *</label>
                  <input type="text" value={movieForm.title} onChange={e => setMovieForm({...movieForm, title: e.target.value})} placeholder="e.g. The Dark Knight" required />
                </div>
                <div className="form-group full">
                  <label>Description</label>
                  <textarea value={movieForm.description} onChange={e => setMovieForm({...movieForm, description: e.target.value})} placeholder="Brief synopsis..." rows={3} />
                </div>
                <div className="form-group">
                  <label>Release Year</label>
                  <input type="number" value={movieForm.release_year} onChange={e => setMovieForm({...movieForm, release_year: e.target.value})} placeholder="2024" min="1900" max="2099" />
                </div>
                <div className="form-group">
                  <label>Age Rating</label>
                  <input type="text" value={movieForm.age_rating} onChange={e => setMovieForm({...movieForm, age_rating: e.target.value})} placeholder="PG-13, R, etc." />
                </div>
                <div className="form-group">
                  <label>Access Level</label>
                  <select value={movieForm.access_level} onChange={e => setMovieForm({...movieForm, access_level: e.target.value})}>
                    <option value="1">Level 1 — Free</option>
                    <option value="2">Level 2 — Basic</option>
                    <option value="3">Level 3 — Premium</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Duration (minutes)</label>
                  <input type="number" value={movieForm.duration} onChange={e => setMovieForm({...movieForm, duration: e.target.value})} placeholder="148" min="1" />
                </div>
                <div className="form-group full">
                  <label>Thumbnail / Poster URL</label>
                  <input type="url" value={movieForm.thumbnail_url} onChange={e => setMovieForm({...movieForm, thumbnail_url: e.target.value})} placeholder="https://image.tmdb.org/t/p/w500/..." />
                </div>
                <div className="form-group full">
                  <label>S3 Video Key</label>
                  <input type="text" value={movieForm.video_url} onChange={e => setMovieForm({...movieForm, video_url: e.target.value})} placeholder="movies/the-dark-knight/1080p.mp4" />
                </div>
              </div>
              {movieForm.thumbnail_url && (
                <div className="thumb-preview">
                  <img src={movieForm.thumbnail_url} alt="Preview" onError={e => e.target.style.display='none'} />
                </div>
              )}
              <button type="submit" className="submit-btn" disabled={submitting}>
                {submitting ? "Adding..." : "🎬 Add Movie"}
              </button>
            </form>
          )}

          {/* ── SERIES FORM ── */}
          {uploadMode === "series" && !createdSeries && (
            <form className="upload-form" onSubmit={submitSeries}>
              <h3>Add New Series</h3>
              <div className="form-grid">
                <div className="form-group full">
                  <label>Title *</label>
                  <input type="text" value={seriesForm.title} onChange={e => setSeriesForm({...seriesForm, title: e.target.value})} placeholder="e.g. Breaking Bad" required />
                </div>
                <div className="form-group full">
                  <label>Description</label>
                  <textarea value={seriesForm.description} onChange={e => setSeriesForm({...seriesForm, description: e.target.value})} placeholder="Brief synopsis..." rows={3} />
                </div>
                <div className="form-group">
                  <label>Release Year</label>
                  <input type="number" value={seriesForm.release_year} onChange={e => setSeriesForm({...seriesForm, release_year: e.target.value})} placeholder="2024" min="1900" max="2099" />
                </div>
                <div className="form-group">
                  <label>Age Rating</label>
                  <input type="text" value={seriesForm.age_rating} onChange={e => setSeriesForm({...seriesForm, age_rating: e.target.value})} placeholder="TV-MA, TV-14, etc." />
                </div>
                <div className="form-group">
                  <label>Access Level</label>
                  <select value={seriesForm.access_level} onChange={e => setSeriesForm({...seriesForm, access_level: e.target.value})}>
                    <option value="1">Level 1 — Free</option>
                    <option value="2">Level 2 — Basic</option>
                    <option value="3">Level 3 — Premium</option>
                  </select>
                </div>
                <div className="form-group full">
                  <label>Thumbnail / Poster URL</label>
                  <input type="url" value={seriesForm.thumbnail_url} onChange={e => setSeriesForm({...seriesForm, thumbnail_url: e.target.value})} placeholder="https://image.tmdb.org/t/p/w500/..." />
                </div>
              </div>
              {seriesForm.thumbnail_url && (
                <div className="thumb-preview">
                  <img src={seriesForm.thumbnail_url} alt="Preview" onError={e => e.target.style.display='none'} />
                </div>
              )}
              <button type="submit" className="submit-btn" disabled={submitting}>
                {submitting ? "Creating..." : "📺 Create Series"}
              </button>
            </form>
          )}

          {/* ── SEASON / EPISODE BUILDER ── */}
          {uploadMode === "series" && createdSeries && (
            <div className="upload-form season-builder">
              <div className="series-header-row">
                <h3>📺 {createdSeries.title} — Seasons & Episodes</h3>
                <button className="finish-btn" onClick={finishSeries}>✓ Finish</button>
              </div>

              {/* Add Season */}
              <div className="inline-add">
                <label>Add Season:</label>
                <input type="number" value={seasonNumber} onChange={e => setSeasonNumber(e.target.value)} placeholder="Season #" min="1" className="small-input" />
                <button className="add-btn" onClick={addSeason} type="button">+ Add Season</button>
              </div>

              {/* Existing Seasons */}
              {seasons.length > 0 && (
                <div className="seasons-list">
                  {seasons.map((s, idx) => (
                    <div key={s.season_id} className="season-card">
                      <h4>Season {s.season_number}</h4>
                      {s.episodes.length > 0 && (
                        <ul className="episode-list">
                          {s.episodes.map(ep => (
                            <li key={ep.episode_id}>Ep {ep.episode_number}: {ep.title}</li>
                          ))}
                        </ul>
                      )}
                      {/* Add episode row */}
                      <div className="inline-add ep-add">
                        <input type="number" placeholder="Ep #" min="1" className="small-input"
                          value={episodeForm.season_idx === idx ? episodeForm.episode_number : ""}
                          onFocus={() => setEpisodeForm({...episodeForm, season_idx: idx})}
                          onChange={e => setEpisodeForm({...episodeForm, season_idx: idx, episode_number: e.target.value})} />
                        <input type="text" placeholder="Episode title" className="med-input"
                          value={episodeForm.season_idx === idx ? episodeForm.title : ""}
                          onFocus={() => setEpisodeForm({...episodeForm, season_idx: idx})}
                          onChange={e => setEpisodeForm({...episodeForm, season_idx: idx, title: e.target.value})} />
                        <input type="text" placeholder="S3 key (optional)" className="med-input"
                          value={episodeForm.season_idx === idx ? episodeForm.video_url : ""}
                          onFocus={() => setEpisodeForm({...episodeForm, season_idx: idx})}
                          onChange={e => setEpisodeForm({...episodeForm, season_idx: idx, video_url: e.target.value})} />
                        <button className="add-btn" onClick={() => { setEpisodeForm({...episodeForm, season_idx: idx}); addEpisode(); }} type="button">+ Episode</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{value ?? "—"}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default AdminDashboard;
