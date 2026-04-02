import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../../config/api";
import "./MovieDetails.css";

function MovieDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [inFavorites, setInFavorites] = useState(false);
  const [libLoading, setLibLoading] = useState(false);

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (!token) { navigate("/login"); return; }

    const fetchAll = async () => {
      try {
        const [catalogRes, statusRes] = await Promise.all([
          api.get(`/videos/${id}/catalog`, { headers }),
          api.get(`/library/status/${id}`, { headers }),
        ]);
        setItem(catalogRes.data);
        setInWatchlist(statusRes.data.inWatchlist);
        setInFavorites(statusRes.data.inFavorites);
      } catch (err) {
        setError(true);
        if (err.response?.status === 401) navigate("/login");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const toggleWatchlist = async () => {
    setLibLoading(true);
    try {
      if (inWatchlist) {
        await api.delete(`/library/watchlist/${id}`, { headers });
        setInWatchlist(false);
      } else {
        await api.post(`/library/watchlist/${id}`, {}, { headers });
        setInWatchlist(true);
      }
    } finally { setLibLoading(false); }
  };

  const toggleFavorite = async () => {
    setLibLoading(true);
    try {
      if (inFavorites) {
        await api.delete(`/library/favorites/${id}`, { headers });
        setInFavorites(false);
      } else {
        await api.post(`/library/favorites/${id}`, {}, { headers });
        setInFavorites(true);
      }
    } finally { setLibLoading(false); }
  };

  if (loading) return <div className="details-loading"><div className="spinner"></div></div>;
  if (error || !item) return <h2 className="details-error">Content not found</h2>;

  return (
    <div className="details-page">
      <div className="hero-backdrop">
        <img
          src={item.image}
          alt={item.title}
          referrerPolicy="no-referrer"
          className="hero-img"
        />
        <div className="hero-vignette"></div>
      </div>

      <button className="back-btn-top" onClick={() => navigate(-1)}>← Back</button>

      <div className="details-content">
        <h1>{item.title}</h1>

        <div className="meta-row">
          <span className="match-score">98% Match</span>
          <span className="year">{item.year}</span>
          <span className="maturity-rating">{item.rating || "16+"}</span>
          <span className="duration">
            {item.duration || (
              Array.isArray(item.seasons)
                ? `${item.seasons.length} Season${item.seasons.length !== 1 ? 's' : ''}`
                : item.seasons
            )}
          </span>
          <span className="hd-badge">HD</span>
        </div>

        <div className="details-actions">
          <button
            className="play-main-btn"
            onClick={() => navigate(`/watch/${item.id}`)}
          >
          <span>▶</span> {(item.contentType === 'series' || Array.isArray(item.seasons)) ? "Play S1:E1" : "Play"}
          </button>

          <button
            className={`icon-btn ${inWatchlist ? "active" : ""}`}
            onClick={toggleWatchlist}
            disabled={libLoading}
            title={inWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
          >
            {inWatchlist ? "✓" : "+"}
            <span className="icon-label">Watchlist</span>
          </button>

          <button
            className={`icon-btn ${inFavorites ? "active fav-active" : ""}`}
            onClick={toggleFavorite}
            disabled={libLoading}
            title={inFavorites ? "Remove from Favorites" : "Add to Favorites"}
          >
            {inFavorites ? "❤️" : "🤍"}
            <span className="icon-label">Favorite</span>
          </button>
        </div>

        <p className="details-desc">{item.description}</p>
      </div>
    </div>
  );
}

export default MovieDetails;