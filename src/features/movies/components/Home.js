import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../config/api";

function Home() {
  const navigate = useNavigate();
  const moviesRef = useRef(null);
  const seriesRef = useRef(null);
  const continueRef = useRef(null);
  const recoRef = useRef(null);

  const [movies, setMovies] = useState([]);
  const [series, setSeries] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { navigate("/login"); return; }
    const headers = { Authorization: `Bearer ${token}` };

    const fetchAll = async () => {
      try {
        const [catalog, cont, reco] = await Promise.all([
          api.get("/videos/catalog/all", { headers }),
          api.get("/library/continue", { headers }),
          api.get("/user/recommendations", { headers }),
        ]);
        setMovies(catalog.data.movies || []);
        setSeries(catalog.data.series || []);
        setContinueWatching(cont.data || []);
        setRecommendations(reco.data || []);
      } catch (err) {
        if (err.response?.status === 401) navigate("/login");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [navigate]);

  const scroll = (ref, dir) => {
    if (!ref.current) return;
    ref.current.scrollBy({ left: dir === "left" ? -600 : 600, behavior: "smooth" });
  };

  const handleClick = (item) => navigate(`/movie/${item.id}`);

  const ContentRow = ({ items, rowRef, label }) => (
    <>
      <h2 className="section-title">{label}</h2>
      <div className="row-wrapper">
        <button className="scroll-btn scroll-left" onClick={() => scroll(rowRef, "left")}>◀</button>
        <div className="movie-row" ref={rowRef}>
          {items.map(item => (
            <div key={item.id} className="movie-wrapper" onClick={() => handleClick(item)}>
              <div className="movie-card">
                <img src={item.image} alt={item.title} referrerPolicy="no-referrer" />
                {item.progress_seconds > 0 && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${Math.min((item.progress_seconds / 7200) * 100, 100)}%` }}></div>
                  </div>
                )}
                <div className="movie-overlay"><h3>{item.title}</h3></div>
              </div>
            </div>
          ))}
        </div>
        <button className="scroll-btn scroll-right" onClick={() => scroll(rowRef, "right")}>▶</button>
      </div>
    </>
  );

  if (loading) return (
    <div className="home" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
      <div className="spinner"></div>
    </div>
  );

  return (
    <div className="home">
      {continueWatching.length > 0 && (
        <ContentRow items={continueWatching} rowRef={continueRef} label="Continue Watching" />
      )}
      {recommendations.length > 0 && (
        <ContentRow items={recommendations} rowRef={recoRef} label="Recommended For You" />
      )}
      {movies.length > 0 && <ContentRow items={movies} rowRef={moviesRef} label="Movies" />}
      {series.length > 0 && <ContentRow items={series} rowRef={seriesRef} label="Web Series" />}
    </div>
  );
}

export default Home;
