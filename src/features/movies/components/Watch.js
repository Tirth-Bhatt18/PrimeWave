import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../../config/api";
import { movies, series } from "../../../data/content";
import "./Watch.css";

function Watch() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [streamLoading, setStreamLoading] = useState(false);
  const [error, setError] = useState("");
  const [catalog, setCatalog] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const videoRef = useRef(null);
  const streamAbortRef = useRef(null);
  const streamRequestIdRef = useRef(0);

  const item = useMemo(() => {
    const allContent = [...movies, ...series];
    return allContent.find((content) => content.id === Number(id));
  }, [id]);

  const getToken = () => localStorage.getItem("token");

  const fetchStreamUrl = async (seasonNumber, episodeNumber) => {
    const token = getToken();

    if (!token) {
      setError("You must be logged in to watch this video.");
      return;
    }

    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
    }

    const controller = new AbortController();
    streamAbortRef.current = controller;
    const requestId = ++streamRequestIdRef.current;

    try {
      setStreamLoading(true);
      setError("");

      const response = await api.get("/videos/" + id + "/stream", {
        headers: {
          Authorization: "Bearer " + token,
        },
        params:
          seasonNumber && episodeNumber
            ? { seasonNumber, episodeNumber }
            : undefined,
        signal: controller.signal,
      });

      if (requestId !== streamRequestIdRef.current) {
        return;
      }

      const nextUrl = response.data?.url || "";

      if (nextUrl && nextUrl !== videoUrl) {
        setVideoUrl(nextUrl);
      }

      if (!nextUrl) {
        setError("Unable to load video stream.");
      }
    } catch (err) {
      if (err.name === "CanceledError" || err.code === "ERR_CANCELED") {
        return;
      }

      if (err.response?.status === 401) {
        setError("Your session has expired. Please log in again.");
      } else if (err.response?.status === 404) {
        setError("Requested video was not found.");
      } else {
        setError("Unable to load video right now. Please try again.");
      }
    } finally {
      if (requestId === streamRequestIdRef.current) {
        setStreamLoading(false);
      }
    }
  };

  useEffect(() => {
    const fetchCatalog = async () => {
      const token = getToken();

      if (!token) {
        setError("You must be logged in to watch this video.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const response = await api.get("/videos/" + id + "/catalog", {
          headers: {
            Authorization: "Bearer " + token,
          },
        });

        const nextCatalog = response.data;
        setCatalog(nextCatalog);

        if (
          nextCatalog?.contentType === "series" &&
          nextCatalog.seasons &&
          nextCatalog.seasons.length > 0
        ) {
          const firstSeason = nextCatalog.seasons[0];
          const firstEpisode = firstSeason.episodes[0] || null;

          setSelectedSeason(firstSeason.seasonNumber);
          setSelectedEpisode(firstEpisode ? firstEpisode.episodeNumber : null);

          if (firstEpisode) {
            fetchStreamUrl(firstSeason.seasonNumber, firstEpisode.episodeNumber);
          }
        }
      } catch (err) {
        if (err.response?.status === 401) {
          setError("Your session has expired. Please log in again.");
        } else if (err.response?.status === 404) {
          setError("Content not found.");
        } else {
          setError("Unable to load content details right now.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchCatalog();

    return () => {
      if (streamAbortRef.current) {
        streamAbortRef.current.abort();
      }
    };
  }, [id]);

  useEffect(() => {
    const videoEl = videoRef.current;

    if (!videoEl || !videoUrl) {
      return;
    }

    try {
      if (videoEl.src !== videoUrl) {
        videoEl.pause();
        videoEl.src = videoUrl;
        videoEl.load();
      }
    } catch (mediaErr) {
      const isAbort =
        mediaErr?.name === "AbortError" ||
        (typeof mediaErr?.message === "string" && mediaErr.message.includes("aborted"));

      if (!isAbort) {
        setError("Unable to initialize media playback.");
      }
    }
  }, [videoUrl]);

  const isSeries = catalog?.contentType === "series";
  const seasons = catalog?.seasons || [];
  const activeSeason = seasons.find((s) => s.seasonNumber === selectedSeason) || null;
  const activeEpisodes = activeSeason?.episodes || [];

  if (!item) {
    return (
      <div style={{ padding: "20px" }}>
        <h2>Video not found</h2>
      </div>
    );
  }

  return (
    <div className="watch-page">
      <button onClick={() => navigate(-1)} className="back-btn">
        ← Back
      </button>

      <h2 className="watch-title">{item.title}</h2>

      {loading && <p>Loading content...</p>}

      {!loading && error && <p role="alert">{error}</p>}

      {!loading && !error && !isSeries && (
        <div className="watch-actions">
          <button
            className="play-now-btn"
            onClick={() => fetchStreamUrl()}
            disabled={streamLoading}
          >
            {streamLoading ? "Loading..." : "Play Now"}
          </button>
        </div>
      )}

      {!loading && !error && isSeries && (
        <div className="series-controls">
          <div className="season-list">
            <h3>Seasons</h3>
            <div className="pill-row">
              {seasons.map((season) => (
                <button
                  key={season.seasonNumber}
                  className={
                    "pill-btn" +
                    (selectedSeason === season.seasonNumber ? " pill-btn-active" : "")
                  }
                  onClick={() => {
                    setSelectedSeason(season.seasonNumber);
                    const firstEp = season.episodes[0] || null;
                    setSelectedEpisode(firstEp ? firstEp.episodeNumber : null);
                    if (firstEp) {
                      fetchStreamUrl(season.seasonNumber, firstEp.episodeNumber);
                    }
                  }}
                >
                  Season {season.seasonNumber}
                </button>
              ))}
            </div>
          </div>

          <div className="episode-list">
            <h3>Episodes</h3>
            <div className="pill-row">
              {activeEpisodes.map((episode) => (
                <button
                  key={episode.episodeNumber}
                  className={
                    "pill-btn" +
                    (selectedEpisode === episode.episodeNumber ? " pill-btn-active" : "")
                  }
                  onClick={() => {
                    setSelectedEpisode(episode.episodeNumber);
                    fetchStreamUrl(selectedSeason, episode.episodeNumber);
                  }}
                >
                  E{String(episode.episodeNumber).padStart(2, "0")}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && !error && videoUrl && (
        <div className="video-container">
          <video ref={videoRef} controls width="100%" preload="metadata" />
        </div>
      )}
    </div>
  );
}

export default Watch;