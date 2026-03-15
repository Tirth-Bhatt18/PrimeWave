import React, { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { movies, series } from "../../../data/content";

function Home() {
  const navigate = useNavigate();
  const moviesRef = useRef(null);
  const seriesRef = useRef(null);

  const scroll = (ref, direction) => {
    if (!ref.current) return;
    const amount = direction === "left" ? -600 : 600;
    ref.current.scrollBy({ left: amount, behavior: "smooth" });
  };

  const handleWatch = (item) => {
  navigate(`/movie/${item.id}`);
};

  return (
    <div className="home">
      {/* ================= MOVIES ================= */}
      <h2 className="section-title">Movies</h2>

      <div className="row-wrapper">
        <button
          className="scroll-btn scroll-left"
          onClick={() => scroll(moviesRef, "left")}
        >
          ◀
        </button>

        <div className="movie-row" ref={moviesRef}>
          {movies.map(movie => (
            <div key={movie.id} className="movie-wrapper">
              <div className="movie-card">
                <img src={movie.image} alt={movie.title} />
              </div>

              <div className="movie-popup-card">
                <img src={movie.image} alt={movie.title} />
                <div className="popup-info">
                  <h3>{movie.title}</h3>
                  <p className="meta">
                    {movie.year} • {movie.duration}
                  </p>
                  <p className="rating">⭐ {movie.rating}</p>
                  <p className="desc">{movie.description}</p>
                  <button
                    className="watch-btn"
                    onClick={() => handleWatch(movie)}
                  >
                    ▶ Watch Now
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          className="scroll-btn scroll-right"
          onClick={() => scroll(moviesRef, "right")}
        >
          ▶
        </button>
      </div>

      {/* ================= WEB SERIES ================= */}
      <h2 className="section-title">Web Series</h2>

      <div className="row-wrapper">
        <button
          className="scroll-btn scroll-left"
          onClick={() => scroll(seriesRef, "left")}
        >
          ◀
        </button>

        <div className="movie-row" ref={seriesRef}>
          {series.map(show => (
            <div key={show.id} className="movie-wrapper">
              <div className="movie-card">
                <img src={show.image} alt={show.title} />
              </div>

              <div className="movie-popup-card">
                <img src={show.image} alt={show.title} />
                <div className="popup-info">
                  <h3>{show.title}</h3>
                  <p className="meta">
                    {show.year} • {show.seasons}
                  </p>
                  <p className="rating">⭐ {show.rating}</p>
                  <p className="desc">{show.description}</p>
                  <button
                    className="watch-btn"
                    onClick={() => handleWatch(show)}
                  >
                    ▶ Watch Now
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          className="scroll-btn scroll-right"
          onClick={() => scroll(seriesRef, "right")}
        >
          ▶
        </button>
      </div>
    </div>
  );
}

export default Home;
