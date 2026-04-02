import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../config/api";

function MyList() {
  const navigate = useNavigate();
  const [watchlist, setWatchlist] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [tab, setTab] = useState("watchlist");
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (!token) { navigate("/login"); return; }
    const fetchAll = async () => {
      try {
        const [wl, fav] = await Promise.all([
          api.get("/library/watchlist", { headers }),
          api.get("/library/favorites", { headers }),
        ]);
        setWatchlist(wl.data);
        setFavorites(fav.data);
      } catch (err) {
        if (err.response?.status === 401) navigate("/login");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeWatchlist = async (contentId) => {
    await api.delete(`/library/watchlist/${contentId}`, { headers });
    setWatchlist(prev => prev.filter(i => i.id !== contentId));
  };

  const removeFavorite = async (contentId) => {
    await api.delete(`/library/favorites/${contentId}`, { headers });
    setFavorites(prev => prev.filter(i => i.id !== contentId));
  };

  const items = tab === "watchlist" ? watchlist : favorites;
  const removeItem = tab === "watchlist" ? removeWatchlist : removeFavorite;

  return (
    <div className="home" style={{ paddingTop: "100px", paddingLeft: "40px", paddingRight: "40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "24px", marginBottom: "32px" }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", padding: "10px 20px", borderRadius: "10px", cursor: "pointer", fontSize: "0.95rem" }}
        >← Back</button>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: 0 }}>My List</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "32px" }}>
        {["watchlist", "favorites"].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? "rgba(229,9,20,0.25)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${tab === t ? "#e50914" : "rgba(255,255,255,0.1)"}`,
              color: "#fff",
              padding: "10px 24px",
              borderRadius: "10px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.95rem",
              textTransform: "capitalize",
              transition: "all 0.2s",
            }}
          >
            {t === "watchlist" ? "📋 Watchlist" : "❤️ Favorites"}
            {t === "watchlist" && watchlist.length > 0 && (
              <span style={{ marginLeft: "8px", background: "#e50914", borderRadius: "12px", padding: "2px 8px", fontSize: "0.75rem" }}>
                {watchlist.length}
              </span>
            )}
            {t === "favorites" && favorites.length > 0 && (
              <span style={{ marginLeft: "8px", background: "#e50914", borderRadius: "12px", padding: "2px 8px", fontSize: "0.75rem" }}>
                {favorites.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}><div className="spinner"></div></div>}

      {!loading && items.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 0", color: "rgba(255,255,255,0.4)" }}>
          <div style={{ fontSize: "3rem", marginBottom: "16px" }}>{tab === "watchlist" ? "📋" : "❤️"}</div>
          <p style={{ fontSize: "1.1rem" }}>Your {tab} is empty</p>
          <button
            onClick={() => navigate("/")}
            style={{ marginTop: "24px", background: "#e50914", border: "none", color: "#fff", padding: "12px 32px", borderRadius: "10px", cursor: "pointer", fontWeight: 600, fontSize: "1rem" }}
          >
            Browse Content
          </button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "20px" }}>
          {items.map(item => (
            <div key={item.id} style={{ position: "relative" }}>
              <div className="movie-card" onClick={() => navigate(`/movie/${item.id}`)} style={{ cursor: "pointer" }}>
                <img src={item.image} alt={item.title} referrerPolicy="no-referrer" style={{ width: "100%", borderRadius: "8px", display: "block" }} />
                <div className="movie-overlay"><h3>{item.title}</h3></div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                style={{
                  position: "absolute", top: "8px", right: "8px",
                  background: "rgba(0,0,0,0.7)", border: "none", color: "#fff",
                  width: "32px", height: "32px", borderRadius: "50%",
                  cursor: "pointer", fontSize: "1rem", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  backdropFilter: "blur(4px)",
                }}
                title="Remove"
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MyList;
