import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../../config/api";
import "./Watch.css";

function Watch() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [videoUrl, setVideoUrl] = useState("");
  const [trackData, setTrackData] = useState({ audios: {}, subtitles: {} });
  const [loading, setLoading] = useState(true);
  const [streamLoading, setStreamLoading] = useState(false);
  const [error, setError] = useState("");
  const [catalog, setCatalog] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const videoRef = useRef(null);
  const streamAbortRef = useRef(null);
  const streamRequestIdRef = useRef(0);
  const progressIntervalRef = useRef(null);

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
        setTrackData({
          audios: response.data?.audios || {},
          subtitles: response.data?.subtitles || {}
        });
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
        } else if (nextCatalog?.contentType === 'movie') {
          fetchStreamUrl();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (videoUrl) {
      // Stop any ongoing network activity on the element BEFORE switching to the new URL
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load(); // Cancels the previous S3 fetch immediately

      videoEl.src = videoUrl;
      videoEl.load();

      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => { /* autoplay blocked by browser */ });
      }
    }

    return () => {
      // Component unmounting OR videoUrl changing — stop the browser fetching S3 bytes
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
    };
  }, [videoUrl]);

  // Auto-save continue watching every 30s while video plays
  useEffect(() => {
    const saveProgress = async () => {
      const video = videoRef.current;
      if (!video || video.paused || video.ended || !catalog) return;
      const token = getToken();
      if (!token) return;
      try {
        await api.post(`/library/continue/${id}`, {
          season_number: selectedSeason || null,
          episode_number: selectedEpisode || null,
          progress_seconds: Math.floor(video.currentTime),
        }, { headers: { Authorization: `Bearer ${token}` } });
      } catch (_) { /* silent */ }
    };
    progressIntervalRef.current = setInterval(saveProgress, 30000);
    return () => {
      clearInterval(progressIntervalRef.current);
      saveProgress();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, catalog, selectedSeason, selectedEpisode]);

  const title = catalog?.title || 'Loading...';
  const isSeries = catalog?.contentType === "series";
  const seasons = catalog?.seasons || [];
  const activeSeason = seasons.find((s) => s.seasonNumber === selectedSeason) || null;
  const activeEpisodes = activeSeason?.episodes || [];

  if (!loading && !catalog && !error) {
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

      <h2 className="watch-title">{title}</h2>

      {loading && <p>Loading content...</p>}

      {!loading && error && (
        <div className="watch-error">
          {error.includes('Subscription') ? (
            <div className="upgrade-prompt">
              <span className="lock-icon">🔒</span>
              <h3>Premium Content</h3>
              <p>This content requires a higher subscription tier.</p>
              <button className="upgrade-btn" onClick={() => navigate('/')}>Upgrade Plan</button>
            </div>
          ) : (
            <p role="alert">{error}</p>
          )}
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
          <video 
            ref={videoRef} 
            controls 
            width="100%" 
            preload="auto"
          >
            {Object.keys(trackData.subtitles).map((lang, index) => (
              <track 
                key={lang} 
                kind="subtitles" 
                src={trackData.subtitles[lang]} 
                srcLang={lang} 
                label={lang.toUpperCase() + ' Subtitles'} 
                default={index === 0} 
              />
            ))}
          </video>
        </div>
      )}
    </div>
  );
}

export default Watch;