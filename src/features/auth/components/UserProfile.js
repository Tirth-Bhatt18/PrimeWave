import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../config/api";
import { AuthContext } from "../../auth/AuthContext";
import "./UserProfile.css";

function UserProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ watchlist: 0, favorites: 0 });
  const [loading, setLoading] = useState(true);
  const [subMsg, setSubMsg] = useState({ type: '', text: '' });

  const { user, login } = useContext(AuthContext);

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

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

  const planLabel = { 1: "Basic", 2: "Premium", 999: "Admin" };
  const plan = user ? (planLabel[user.plan_id] || "Basic") : "Basic";
  const initials = (profile?.name || "U").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  const handleDowngrade = async () => {
      if (!window.confirm("Are you sure you want to downgrade to the Basic plan? You will lose access to premium content.")) return;
      try {
          const res = await api.post("/user/downgrade", {}, { headers });
          const newToken = res.data.token;
          // Decode fresh user data from returned token
          const base64Payload = newToken.split('.')[1];
          const decoded = JSON.parse(atob(base64Payload));
          const updatedUser = { id: decoded.id, email: decoded.email, role: decoded.role, plan_id: decoded.plan_id };
          login(updatedUser, newToken);
          setSubMsg({ type: 'success', text: 'Successfully downgraded to Basic plan.' });
      } catch (err) {
          console.error('Downgrade error:', err.response?.data || err.message);
          setSubMsg({ type: 'error', text: err.response?.data?.message || 'Failed to downgrade. Please try again.' });
      }
  };

  return (
    <div className="profile-page">
      <button className="back-btn-profile" onClick={() => navigate(-1)}>← Back</button>

      <div className="profile-card">
        <div className="profile-avatar">{initials}</div>
        <h1 className="profile-name">{profile?.name}</h1>
        <p className="profile-email">{profile?.email}</p>
        <div style={{ marginTop: '15px' }}>
            <span className={`plan-badge plan-${plan.toLowerCase()}`}>{plan} Plan</span>
        </div>
      </div>

      <div className="subscription-card" style={{ background: 'rgba(20,20,26,0.7)', padding: '20px', borderRadius: '12px', marginTop: '20px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
          <h3>Manage Subscription</h3>
          <p style={{ color: '#aaa', margin: '10px 0' }}>Current Tier: <strong>{plan}</strong></p>
          {subMsg.text && (
            <p style={{ color: subMsg.type === 'success' ? '#4ade80' : '#f87171', marginBottom: '12px', fontWeight: 'bold' }}>
              {subMsg.type === 'success' ? '✅' : '❌'} {subMsg.text}
            </p>
          )}
          {user?.plan_id === 1 && user?.role !== 'admin' && (
              <button 
                onClick={() => navigate('/payment')} 
                style={{ background: 'var(--primary)', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                  ⭐ Upgrade to Premium
              </button>
          )}
          {user?.plan_id === 2 && user?.role !== 'admin' && (
              <button 
                onClick={handleDowngrade} 
                style={{ background: 'rgba(255,255,255,0.1)', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '5px', cursor: 'pointer', marginTop: '10px' }}
              >
                  Downgrade to Basic (Free)
              </button>
          )}
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
