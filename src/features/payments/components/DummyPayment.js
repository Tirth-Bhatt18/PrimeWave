import React, { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../config/api";
import { AuthContext } from "../../auth/AuthContext";
import "./DummyPayment.css";

function DummyPayment() {
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handlePayment = async (planId, amount) => {
    const token = localStorage.getItem("token");
    if (!token) { navigate("/login"); return; }

    setLoading(true);
    setError("");

    try {
      const response = await api.post(
        "/user/pay",
        { plan_id: planId, amount },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const newToken = response.data.token;
      const newPlanId = response.data.plan_id;

      // Decode the new token to get fresh user data
      const base64Payload = newToken.split('.')[1];
      const decoded = JSON.parse(atob(base64Payload));
      const updatedUser = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        plan_id: newPlanId ?? decoded.plan_id,
      };
      login(updatedUser, newToken);

      setSuccess(true);
      setTimeout(() => navigate("/"), 2000);
    } catch (err) {
      console.error("Payment error:", err.response?.data || err.message);
      setError(err.response?.data?.message || "Payment failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="payment-container">
        <div className="payment-card success">
          <h2>Payment Successful!</h2>
          <p>Your subscription has been updated. Redirecting to home...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-container">
      <div className="payment-card">
        <h2>Upgrade Subscription</h2>
        <p>Select a plan to unlock premium content.</p>
        
        {error && <div className="payment-error">{error}</div>}

        <div className="plans">
          <div className="plan-item">
            <h3>Premium Plan</h3>
            <p className="price">$9.99 / month</p>
            <ul style={{ textAlign: 'left', marginBottom: '15px', color: '#ccc', fontSize: '14px', listStyle: 'none', padding: 0 }}>
                <li>✓ 4K Ultra HD Quality</li>
                <li>✓ Unlock Premium Movies & Shows</li>
                <li>✓ Watch on 4 devices at once</li>
            </ul>
            <button 
              className="pay-btn" 
              onClick={() => handlePayment(2, 9.99)}
              disabled={loading}
            >
              {loading ? "Processing..." : "Pay $9.99"}
            </button>
          </div>
        </div>
        <button className="back-btn-text" onClick={() => navigate("/")}>Cancel & Return Home</button>
      </div>
    </div>
  );
}

export default DummyPayment;
