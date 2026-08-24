import { useState } from 'react';
import { feedbackApi } from '../api/feedbackApi';

const RATINGS = [1, 2, 3, 4, 5];

/**
 * A small star-rating control for one feedback type on one CVE. Deliberately
 * just a rating, no comment field - asking for a paragraph on every CVE
 * would suppress the casual "this looked right" feedback that's actually
 * the majority signal calibration reports need. Submits immediately on
 * click rather than requiring a separate "submit" step.
 */
export function FeedbackWidget({ cveId, feedbackType, label }) {
  const [rating, setRating] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  async function handleRate(value) {
    setRating(value);
    setError(null);
    try {
      await feedbackApi.submit({ cveId, feedbackType, rating: value });
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    }
  }

  if (submitted) {
    return <div className="feedback-widget feedback-widget--done">Thanks - feedback recorded.</div>;
  }

  return (
    <div className="feedback-widget">
      <span className="feedback-widget__label">{label}</span>
      <div className="feedback-widget__stars">
        {RATINGS.map((value) => (
          <button
            key={value}
            className={`feedback-widget__star ${rating !== null && value <= rating ? 'feedback-widget__star--filled' : ''}`}
            onClick={() => handleRate(value)}
            aria-label={`Rate ${value} out of 5`}
            title={`${value} / 5`}
          >
            ★
          </button>
        ))}
      </div>
      {error && <span className="feedback-widget__error">{error}</span>}
    </div>
  );
}
