// Series.js is superseded by Watch.js which handles both movies and series
// via the /watch/:id route backed by the live /api/videos/:id/catalog endpoint.
// This file redirects any legacy /series/:id links to the correct /movie/:id details page.
import { useParams, Navigate } from "react-router-dom";
import { useContext } from "react";
import { AuthContext } from "../../auth/AuthContext";

function Series() {
  const { user } = useContext(AuthContext);
  const { id } = useParams();

  if (!user) return <Navigate to="/login" />;
  // Redirect to MovieDetails which handles both movies and series
  return <Navigate to={`/movie/${id}`} replace />;
}

export default Series;
