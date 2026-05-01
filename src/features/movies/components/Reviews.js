import React, { useState, useEffect } from "react";
import api from "../../../config/api";
import "./Reviews.css";

function Reviews({ contentId }) {
  const [reviewsData, setReviewsData] = useState({ reviews: [], avgRating: 0, totalReviews: 0 });
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const token = localStorage.getItem("token");

  useEffect(() => {
    fetchReviews();
  }, [contentId]);

  const fetchReviews = async () => {
    try {
      const { data } = await api.get(`/videos/${contentId}/reviews`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setReviewsData(data);
    } catch (err) {
      console.error("Failed to fetch reviews:", err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      setError("You must be logged in to review.");
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      await api.post(
        `/videos/${contentId}/reviews`,
        { rating, comment },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess("Review submitted successfully!");
      setComment("");
      fetchReviews();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to submit review.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="reviews-section">
      <div className="reviews-header">
        <h2>Reviews & Ratings</h2>
        <div className="avg-rating">
          <span className="star">★</span> {reviewsData.avgRating.toFixed(1)} 
          <span className="total-count"> ({reviewsData.totalReviews} reviews)</span>
        </div>
      </div>

      <div className="review-form-container">
        <h3>Write a Review</h3>
        <form onSubmit={handleSubmit} className="review-form">
          <div className="rating-select">
            <label>Rating: </label>
            <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
              <option value={5}>5 - Excellent</option>
              <option value={4}>4 - Good</option>
              <option value={3}>3 - Average</option>
              <option value={2}>2 - Poor</option>
              <option value={1}>1 - Terrible</option>
            </select>
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your thoughts..."
            rows={3}
            maxLength={500}
          />
          {error && <div className="review-error">{error}</div>}
          {success && <div className="review-success">{success}</div>}
          <button type="submit" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Review"}
          </button>
        </form>
      </div>

      <div className="reviews-list">
        {reviewsData.reviews.length === 0 ? (
          <p className="no-reviews">No reviews yet. Be the first to review!</p>
        ) : (
          reviewsData.reviews.map((r) => (
            <div key={r.review_id} className="review-card">
              <div className="review-card-header">
                <span className="reviewer-name">{r.user_name}</span>
                <span className="review-stars">
                  {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                </span>
              </div>
              <span className="review-date">
                {new Date(r.created_at).toLocaleDateString()}
              </span>
              {r.comment && <p className="review-comment">{r.comment}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Reviews;
