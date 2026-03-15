import React, { useState, useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthContext } from "../features/auth/AuthContext";
import "./Navbar.css";

function Navbar() {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const genres = ["Action", "Sci-Fi", "Crime", "Drama", "Thriller"];

  const handleGenreClick = (genre) => {
    setOpen(false);
    navigate(`/genres/${genre}`);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    navigate(`/search/${searchTerm}`);
    setSearchTerm("");
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="navbar">
      {/* Logo */}
      <div className="logo" onClick={() => navigate("/")}>
        PrimeWave
      </div>

      <div className="nav-links">

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            placeholder="Search movies or series..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </form>

        {/* Genre Dropdown */}
        <div className="genre-dropdown">
          <button
            className="genre-btn"
            onClick={() => setOpen(!open)}
          >
            Genres ▾
          </button>

          {open && (
            <div className="dropdown-menu">
              {genres.map((g) => (
                <div
                  key={g}
                  className="dropdown-item"
                  onClick={() => handleGenreClick(g)}
                >
                  {g}
                </div>
              ))}
            </div>
          )}
        </div>

        <Link to="/">Home</Link>

        {user ? (
          <>
            <span className="user-name">Hi, {user.name}</span>
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </div>
    </div>
  );
}

export default Navbar;