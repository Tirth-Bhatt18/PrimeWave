import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { movies, series } from "../../../data/content";
import "./MovieDetails.css";

function MovieDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const allContent = [...movies, ...series];
  const item = allContent.find((content) => content.id === Number(id));

  if (!item) {
    return <h2 style={{ padding: "20px" }}>Movie not found</h2>;
  }

  return (
    <div className="details-page">
      <div className="details-container">
        <img src={item.image} alt={item.title} />

        <div className="details-info">
          <h1>{item.title}</h1>
          <p className="meta">
            {item.year} • {item.duration || item.seasons}
          </p>
          <p className="rating">⭐ {item.rating}</p>
          <p className="desc">{item.description}</p>

          <button
            className="play-btn"
            onClick={() => navigate(`/watch/${item.id}`)}
          >
            {item.seasons ? "▶ View Episodes" : "▶ Play Now"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MovieDetails;