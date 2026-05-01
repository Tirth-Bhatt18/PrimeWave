import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../config/api";
import "./DummyPayment.css";

function DummyPayment() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handlePayment = async (planId, amount) => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await api.post(
        "/user/pay",
        { plan_id: planId, amount },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(true);
      setTimeout(() => {
        navigate("/");
      }, 2000);
    } catch (err) {
      setError("Payment failed. Please try again.");
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
            <button 
              className="pay-btn" 
              onClick={() => handlePayment(3, 9.99)}
              disabled={loading}
            >
              {loading ? "Processing..." : "Pay $9.99"}
            </button>
          </div>
          <div className="plan-item">
            <h3>Basic Plan</h3>
            <p className="price">$4.99 / month</p>
            <button 
              className="pay-btn basic-btn" 
              onClick={() => handlePayment(2, 4.99)}
              disabled={loading}
            >
              {loading ? "Processing..." : "Pay $4.99"}
            </button>
          </div>
        </div>
        <button className="back-btn-text" onClick={() => navigate("/")}>Cancel</button>
      </div>
    </div>
  );
}

export default DummyPayment;
