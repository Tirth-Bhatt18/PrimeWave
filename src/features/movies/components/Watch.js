import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../../config/api";
import "./Watch.css";

function Watch() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [videoUrl, setVideoUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState(null);
  const [subtitleUrl, setSubtitleUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [streamLoading, setStreamLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [catalog, setCatalog] = useState(null);

  const [selectedQuality, setSelectedQuality] = useState('1080p');
  const [selectedAudio, setSelectedAudio] = useState('original');
  const [selectedSubtitle, setSelectedSubtitle] = useState('off');

  const QUALITIES = ['1080p', '720p', '480p'];
  const AUDIOS = [{ id: 'original', label: 'Original' }, { id: 'en', label: 'English' }, { id: 'es', label: 'Spanish' }, { id: 'hi', label: 'Hindi' }];
  const SUBTITLES = [{ id: 'off', label: 'Off' }, { id: 'en', label: 'English' }, { id: 'es', label: 'Spanish' }, { id: 'hi', label: 'Hindi' }];
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const streamAbortRef = useRef(null);
  const streamRequestIdRef = useRef(0);
  const progressIntervalRef = useRef(null);

  const getToken = () => localStorage.getItem("token");

  const fetchStreamUrl = async (seasonNumber, episodeNumber, quality = selectedQuality, audio = selectedAudio, subtitle = selectedSubtitle) => {
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
      setSelectionError("");

      const response = await api.get("/videos/" + id + "/stream", {
        headers: {
          Authorization: "Bearer " + token,
        },
        params: {
          seasonNumber: seasonNumber || undefined,
          episodeNumber: episodeNumber || undefined,
          quality,
          audio,
          subtitle
        },
        signal: controller.signal,
      });

      if (requestId !== streamRequestIdRef.current) {
        return;
      }

      const nextUrl = response.data?.url || "";

      if (nextUrl) {
        setVideoUrl(nextUrl);
        setAudioUrl(response.data?.audioUrl || null);
        setSubtitleUrl(response.data?.subtitleUrl || null);
        
        setSelectedQuality(quality);
        setSelectedAudio(audio);
        setSelectedSubtitle(subtitle);
      } else {
        setError("Unable to load video stream.");
      }
    } catch (err) {
      if (err.name === "CanceledError" || err.code === "ERR_CANCELED") {
        return;
      }

      if (err.response?.status === 401) {
        setError("Your session has expired. Please log in again.");
      } else if (err.response?.status === 403) {
        setError("UPGRADE_REQUIRED");
      } else if (err.response?.status === 404) {
        if (err.response.data?.message && err.response.data.message.includes('not available')) {
            setSelectionError(err.response.data.message);
        } else {
            setError("Requested video was not found.");
        }
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

  // Sync external audio with video
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;

    const handlePlay = () => audio.play().catch(() => {});
    const handlePause = () => audio.pause();
    const handleSeeked = () => { audio.currentTime = video.currentTime; };
    const handleWaiting = () => audio.pause();
    const handlePlaying = () => audio.play().catch(() => {});
    const handleTimeUpdate = () => {
        // Correct drift
        if (Math.abs(audio.currentTime - video.currentTime) > 0.3) {
            audio.currentTime = video.currentTime;
        }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('seeked', handleSeeked);
        video.removeEventListener('waiting', handleWaiting);
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [videoUrl, audioUrl]);

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
          {error === "UPGRADE_REQUIRED" ? (
            <div className="upgrade-prompt">
              <span className="lock-icon">🔒</span>
              <h3>Premium Content</h3>
              <p>This content is only available for Premium subscribers.</p>
              <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginTop: '20px' }}>
                <button className="upgrade-btn" onClick={() => navigate('/payment')}>⭐ Upgrade to Premium</button>
                <button className="upgrade-btn" style={{ background: 'rgba(255,255,255,0.1)' }} onClick={() => navigate(-1)}>← Go Back</button>
              </div>
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
        <div className="track-selectors">
            {selectionError && <div className="selection-error" style={{ color: '#ff4d6d', marginBottom: '10px' }}>{selectionError}</div>}
            <div className="selector-group" style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                <label>
                    Quality:
                    <select value={selectedQuality} onChange={(e) => fetchStreamUrl(selectedSeason, selectedEpisode, e.target.value, selectedAudio, selectedSubtitle)} style={{ marginLeft: '10px', padding: '5px', borderRadius: '5px', background: '#333', color: '#fff', border: '1px solid #555' }}>
                        {QUALITIES.map(q => <option key={q} value={q}>{q}</option>)}
                    </select>
                </label>
                <label>
                    Audio:
                    <select value={selectedAudio} onChange={(e) => fetchStreamUrl(selectedSeason, selectedEpisode, selectedQuality, e.target.value, selectedSubtitle)} style={{ marginLeft: '10px', padding: '5px', borderRadius: '5px', background: '#333', color: '#fff', border: '1px solid #555' }}>
                        {AUDIOS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                </label>
                <label>
                    Subtitle:
                    <select value={selectedSubtitle} onChange={(e) => fetchStreamUrl(selectedSeason, selectedEpisode, selectedQuality, selectedAudio, e.target.value)} style={{ marginLeft: '10px', padding: '5px', borderRadius: '5px', background: '#333', color: '#fff', border: '1px solid #555' }}>
                        {SUBTITLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                </label>
            </div>
        </div>
      )}

      {!loading && !error && videoUrl && (
        <div className="video-container">
          <video 
            ref={videoRef} 
            src={videoUrl}
            crossOrigin="anonymous"
            controls 
            autoPlay
            width="100%" 
            preload="auto"
            muted={audioUrl !== null} // Mute video if external audio is playing
          >
            {subtitleUrl && (
              <track 
                kind="subtitles" 
                src={subtitleUrl} 
                srcLang={selectedSubtitle} 
                label={SUBTITLES.find(s => s.id === selectedSubtitle)?.label + ' Subtitles'} 
                default 
              />
            )}
          </video>
          {audioUrl && (
              <audio ref={audioRef} src={audioUrl} preload="auto" />
          )}
        </div>
      )}
    </div>
  );
}

export default Watch;