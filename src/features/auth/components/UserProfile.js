import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../config/api";
import "./UserProfile.css";

function UserProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ watchlist: 0, favorites: 0 });
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  useEffect(() => {
    if (!token) { navigate("/login"); return; }

    const fetchAll = async () => {
      try {
        const [profileRes, wlRes, favRes] = await Promise.all([
          api.get("/user/profile", { headers }),
          api.get("/library/watchlist", { headers }),
          api.get("/library/favorites", { headers }),
        ]);
        setProfile(profileRes.data.user);
        setStats({
          watchlist: wlRes.data.length,
          favorites: favRes.data.length,
        });
      } catch (err) {
        if (err.response?.status === 401) navigate("/login");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="profile-page"><div className="spinner"></div></div>;

  const joinDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  const planLabel = { 1: "Basic", 2: "Standard", 3: "Premium", 999: "Admin" };
  const plan = planLabel[user.plan_id] || "Basic";
  const initials = (profile?.name || "U").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="profile-page">
      <button className="back-btn-profile" onClick={() => navigate(-1)}>← Back</button>

      <div className="profile-card">
        <div className="profile-avatar">{initials}</div>
        <h1 className="profile-name">{profile?.name}</h1>
        <p className="profile-email">{profile?.email}</p>
        <span className={`plan-badge plan-${plan.toLowerCase()}`}>{plan} Plan</span>
      </div>

      <div className="profile-stats">
        <div className="pstat-card" onClick={() => navigate("/mylist")}>
          <div className="pstat-value">{stats.watchlist}</div>
          <div className="pstat-label">Watchlist</div>
        </div>
        <div className="pstat-card" onClick={() => navigate("/mylist")}>
          <div className="pstat-value">{stats.favorites}</div>
          <div className="pstat-label">Favorites</div>
        </div>
        <div className="pstat-card">
          <div className="pstat-value">{joinDate}</div>
          <div className="pstat-label">Member Since</div>
        </div>
      </div>

      <div className="profile-actions">
        <button className="paction-btn" onClick={() => navigate("/mylist")}>📋 My List</button>
        <button className="paction-btn" onClick={() => navigate("/")}>🏠 Browse</button>
      </div>
    </div>
  );
}

export default UserProfile;
