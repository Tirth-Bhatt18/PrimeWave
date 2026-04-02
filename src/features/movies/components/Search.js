import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../../config/api";

function Search() {
  const { query } = useParams();
  const navigate = useNavigate();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { navigate("/login"); return; }

    const search = async () => {
      try {
        const res = await api.get("/videos/catalog/all", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const all = [...(res.data.movies || []), ...(res.data.series || [])];
        const filtered = all.filter(item =>
          item.title.toLowerCase().includes(query.toLowerCase())
        );
        setResults(filtered);
      } catch (err) {
        if (err.response?.status === 401) navigate("/login");
      } finally {
        setLoading(false);
      }
    };
    search();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="home">
      <h2 className="section-title">Search Results for "{query}"</h2>

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
          <div className="spinner"></div>
        </div>
      )}

      {!loading && results.length === 0 && (
        <p style={{ padding: "20px 40px", color: "rgba(255,255,255,0.5)" }}>
          No results found for "{query}".
        </p>
      )}

      {!loading && results.length > 0 && (
        <div className="movie-row" style={{ padding: "0 40px", flexWrap: "wrap", gap: "20px" }}>
          {results.map(item => (
            <div
              key={item.id}
              className="movie-wrapper"
              onClick={() => navigate(`/movie/${item.id}`)}
            >
              <div className="movie-card">
                <img src={item.image} alt={item.title} referrerPolicy="no-referrer" />
                <div className="movie-overlay">
                  <h3>{item.title}</h3>
                  <p style={{ fontSize: "12px", opacity: 0.7 }}>{item.year} • {item.type}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Search;