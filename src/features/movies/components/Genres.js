import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../../config/api";

// Genre keyword matching since DB doesn't have a genre column
// Map genre route param → keywords to match against title
const GENRE_KEYWORDS = {
  "Action":   ["action","war","fight","mission","battle","heist","agent"],
  "Sci-Fi":   ["interstellar","inception","dark","westworld","stranger"],
  "Crime":    ["breaking bad","narcos","money heist","mindhunter","gone girl","se7en","fight club","scarface"],
  "Drama":    ["forrest gump","shawshank","you","dark","money heist"],
  "Thriller": ["shutter island","gone girl","se7en","mindhunter","narcos","fight club"],
};

function Genres() {
  const { genre } = useParams();
  const navigate = useNavigate();
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { navigate("/login"); return; }

    api.get("/videos/catalog/all", {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => {
      setAll([...(res.data.movies || []), ...(res.data.series || [])]);
    }).catch(err => {
      if (err.response?.status === 401) navigate("/login");
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genre]);

  const keywords = GENRE_KEYWORDS[genre] || [];
  const filtered = genre === "All"
    ? all
    : all.filter(item =>
        keywords.some(kw => item.title.toLowerCase().includes(kw.toLowerCase()))
      );

  const movies = filtered.filter(i => i.type === "movie");
  const series = filtered.filter(i => i.type === "series");

  return (
    <div className="home">
      <h2 className="section-title">{genre}</h2>

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
          <div className="spinner"></div>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <p style={{ padding: "20px 40px", color: "rgba(255,255,255,0.5)" }}>
          No content found for "{genre}".
        </p>
      )}

      {!loading && movies.length > 0 && (
        <>
          <h3 className="section-title" style={{ fontSize: "20px" }}>Movies</h3>
          <div className="movie-row" style={{ padding: "0 40px", flexWrap: "wrap", gap: "20px", marginBottom: "40px" }}>
            {movies.map(item => (
              <div key={item.id} className="movie-wrapper" onClick={() => navigate(`/movie/${item.id}`)}>
                <div className="movie-card">
                  <img src={item.image} alt={item.title} referrerPolicy="no-referrer" />
                  <div className="movie-overlay"><h3>{item.title}</h3></div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && series.length > 0 && (
        <>
          <h3 className="section-title" style={{ fontSize: "20px" }}>Web Series</h3>
          <div className="movie-row" style={{ padding: "0 40px", flexWrap: "wrap", gap: "20px" }}>
            {series.map(item => (
              <div key={item.id} className="movie-wrapper" onClick={() => navigate(`/movie/${item.id}`)}>
                <div className="movie-card">
                  <img src={item.image} alt={item.title} referrerPolicy="no-referrer" />
                  <div className="movie-overlay"><h3>{item.title}</h3></div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default Genres;
