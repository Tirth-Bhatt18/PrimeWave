import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../config/api";
import MovieUploadForm from "./MovieUploadForm";
import SeriesUploadForm from "./SeriesUploadForm";
import "./AdminDashboard.css";

function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [content, setContent] = useState([]);
  const [tab, setTab] = useState("overview");

  // Upload state
  const [uploadMode, setUploadMode] = useState("movie"); // "movie" | "series"
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null); // { type: "success"|"error", msg }

  // Movie form
  const [movieForm, setMovieForm] = useState({
    title: "", description: "", release_year: "", age_rating: "",
    access_level: "1", thumbnail_url: "", video_url: "", duration: ""
  });

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
    const newStatus = currentStatus?.toUpperCase() === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await api.patch(`/admin/users/${userId}`, { status: newStatus }, { headers });
      setUsers(users.map(u => u.user_id === userId ? { ...u, status: newStatus } : u));
      setToast({ type: "success", msg: `User ${newStatus === "INACTIVE" ? "deactivated" : "activated"}` });
    } catch (e) {
      setToast({ type: "error", msg: e.response?.data?.message || "Failed to update user status" });
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

      {tab === "overview" && stats && (
        <div className="admin-overview">
          <div className="stats-grid">
            <StatCard label="Total Users" value={stats.totalUsers} icon="👥" />
            <StatCard label="Premium Users" value={stats.premiumUsers} icon="⭐" />
            <StatCard label="Movies" value={stats.totalMovies} icon="🎬" />
            <StatCard label="Series" value={stats.totalSeries} icon="📺" />
            <StatCard label="Total Content" value={stats.totalContent} icon="🎞️" />
            <StatCard label="Total Watch Time (hrs)" value={stats.totalWatchTimeHours} icon="⏱️" />
          </div>
        </div>
      )}

      {/* ═══════ USERS ═══════ */}
      {tab === "users" && (
      <div className="admin-table-wrap">
          <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '10px' }}>ℹ️ <strong>Deactivate</strong> disables a user's account (they cannot log in). <strong>Activate</strong> re-enables it. This does NOT affect subscription plans.</p>
          <table className="admin-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Joined</th><th>Plan</th><th>Account Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.user_id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td><span className={`type-badge ${u.plan_id === 2 ? 'series' : 'movie'}`}>{u.plan_name || (u.plan_id === 2 ? 'Premium' : 'Basic')}</span></td>
                  <td><span className={`status-badge ${u.status?.toLowerCase()}`}>{u.status}</span></td>
                  <td>
                    <button className="action-btn" onClick={() => toggleUserStatus(u.user_id, u.status)}>
                      {u.status?.toUpperCase() === "ACTIVE" ? "Deactivate" : "Activate"}
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
            <button className={`mode-btn ${uploadMode === "movie" ? "active" : ""}`} onClick={() => setUploadMode("movie")}>
              🎬 Add Movie
            </button>
            <button className={`mode-btn ${uploadMode === "series" ? "active" : ""}`} onClick={() => setUploadMode("series")}>
              📺 Add Series
            </button>
          </div>

          {/* ── MOVIE FORM ── */}
          {uploadMode === "movie" && (
            <MovieUploadForm headers={headers} fetchDashboard={fetchDashboard} setToast={setToast} />
          )}

          {/* ── SERIES FORM ── */}
          {uploadMode === "series" && (
            <SeriesUploadForm headers={headers} fetchDashboard={fetchDashboard} setToast={setToast} />
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
