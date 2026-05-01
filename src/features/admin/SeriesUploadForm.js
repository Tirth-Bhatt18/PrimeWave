import React, { useState } from "react";
import axios from "axios";
import api from "../../config/api";

function SeriesUploadForm({ headers, fetchDashboard, setToast }) {
  const [step, setStep] = useState("series"); // "series" | "episodes"
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(null);

  // Series metadata
  const [seriesForm, setSeriesForm] = useState({
    title: "", description: "", release_year: "", age_rating: "",
    access_level: "1"
  });
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [seriesBasePath, setSeriesBasePath] = useState("");

  // Created series info
  const [createdSeries, setCreatedSeries] = useState(null); // { content_id, series_id, title }

  // Season/episode builder
  const [seasons, setSeasons] = useState([]); // [{ season_id, season_number, basePath, episodes: [] }]
  const [newSeasonNumber, setNewSeasonNumber] = useState("");

  // Episode form per season
  const [episodeForms, setEpisodeForms] = useState({}); // { season_idx: { number, title, file1080, file720, audioES, subEN } }

  const uploadFile = async (file, s3Key) => {
    setProgress(`Generating URL for ${file.name}...`);
    const { data } = await api.get(
      `/admin/presigned-put?key=${encodeURIComponent(s3Key)}&contentType=${encodeURIComponent(file.type)}`,
      { headers }
    );
    setProgress(`Uploading ${file.name}...`);
    await axios.put(data.url, file, {
      headers: { "Content-Type": file.type },
      onUploadProgress: (e) => {
        const pct = Math.round((e.loaded * 100) / e.total);
        setProgress(`Uploading ${file.name}... ${pct}%`);
      }
    });
    return s3Key;
  };

  // Step 1: Create series
  const submitSeries = async (e) => {
    e.preventDefault();
    if (!seriesForm.title.trim() || !seriesBasePath.trim()) {
      setToast({ type: "error", msg: "Title and Base S3 Path are required" });
      return;
    }
    setSubmitting(true);
    try {
      const base = seriesBasePath.endsWith("/") ? seriesBasePath : seriesBasePath + "/";
      let thumbnailUrl = "";
      if (thumbnailFile) {
        thumbnailUrl = await uploadFile(thumbnailFile, `${base}thumbnail.${thumbnailFile.name.split(".").pop()}`);
      }
      setProgress("Creating series in database...");
      const res = await api.post("/admin/content/series", {
        ...seriesForm,
        release_year: seriesForm.release_year ? parseInt(seriesForm.release_year) : null,
        access_level: parseInt(seriesForm.access_level) || 1,
        thumbnail_url: thumbnailUrl
      }, { headers });

      setCreatedSeries({ content_id: res.data.content_id, series_id: res.data.series_id, title: seriesForm.title, base });
      setStep("episodes");
      setToast({ type: "success", msg: `Series "${seriesForm.title}" created! Now add seasons & episodes.` });
      fetchDashboard();
    } catch (e) {
      setToast({ type: "error", msg: e.response?.data?.message || "Failed to create series" });
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  // Add a season
  const addSeason = async () => {
    if (!newSeasonNumber || !createdSeries) return;
    try {
      const res = await api.post(
        `/admin/content/series/${createdSeries.content_id}/season`,
        { season_number: parseInt(newSeasonNumber) },
        { headers }
      );
      const seasonBase = `${createdSeries.base}season-${String(newSeasonNumber).padStart(2, "0")}/`;
      setSeasons([...seasons, { season_id: res.data.season_id, season_number: parseInt(newSeasonNumber), base: seasonBase, episodes: [] }]);
      setEpisodeForms(prev => ({ ...prev, [seasons.length]: { number: "", title: "", file1080: null, file720: null, audioES: null, subEN: null } }));
      setNewSeasonNumber("");
      setToast({ type: "success", msg: `Season ${newSeasonNumber} added` });
    } catch (e) {
      setToast({ type: "error", msg: e.response?.data?.message || "Failed to add season" });
    }
  };

  // Upload episode files and register in DB
  const addEpisode = async (seasonIdx) => {
    const season = seasons[seasonIdx];
    const form = episodeForms[seasonIdx] || {};
    if (!form.number) { setToast({ type: "error", msg: "Episode number is required" }); return; }
    setSubmitting(true);
    try {
      const epBase = `${season.base}episode-${String(form.number).padStart(3, "0")}/`;
      let videoUrl = "";
      let qualities = [];
      let audios = [];
      let subtitles = [];

      if (form.file1080) {
        videoUrl = await uploadFile(form.file1080, `${epBase}1080p.mp4`);
      }
      if (form.file720) {
        const k = await uploadFile(form.file720, `${epBase}720p.mp4`);
        qualities.push(`720p|${k}`);
      }
      if (form.audioES) {
        const k = await uploadFile(form.audioES, `${epBase}audio_es.aac`);
        audios.push(`es|${k}`);
      }
      if (form.subEN) {
        const k = await uploadFile(form.subEN, `${epBase}sub_en.vtt`);
        subtitles.push(`en|${k}`);
      }

      setProgress("Saving episode to database...");
      const res = await api.post(`/admin/content/season/${season.season_id}/episode`, {
        episode_number: parseInt(form.number),
        title: form.title || `Episode ${form.number}`,
        video_url: videoUrl,
        qualities: qualities.join(","),
        audios: audios.join(","),
        subtitles: subtitles.join(",")
      }, { headers });

      const updated = [...seasons];
      updated[seasonIdx].episodes.push({ episode_id: res.data.episode_id, episode_number: parseInt(form.number), title: form.title || `Episode ${form.number}` });
      setSeasons(updated);
      setEpisodeForms(prev => ({ ...prev, [seasonIdx]: { number: "", title: "", file1080: null, file720: null, audioES: null, subEN: null } }));
      setToast({ type: "success", msg: `Episode ${form.number} added!` });
    } catch (e) {
      setToast({ type: "error", msg: e.response?.data?.message || "Failed to add episode" });
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  const finish = () => {
    setStep("series");
    setCreatedSeries(null);
    setSeasons([]);
    setEpisodeForms({});
    setSeriesForm({ title: "", description: "", release_year: "", age_rating: "", access_level: "1" });
    setSeriesBasePath("");
    setThumbnailFile(null);
    fetchDashboard();
  };

  // ── RENDER ──
  if (step === "series") {
    return (
      <form className="upload-form" onSubmit={submitSeries}>
        <h3>Add New Series (Direct to S3)</h3>
        <div className="form-grid">
          <div className="form-group full">
            <label>Title *</label>
            <input type="text" value={seriesForm.title} onChange={e => setSeriesForm({ ...seriesForm, title: e.target.value })} placeholder="e.g. Breaking Bad" required />
          </div>
          <div className="form-group full">
            <label>Description</label>
            <textarea value={seriesForm.description} onChange={e => setSeriesForm({ ...seriesForm, description: e.target.value })} rows={3} placeholder="Brief synopsis..." />
          </div>
          <div className="form-group">
            <label>Release Year</label>
            <input type="number" value={seriesForm.release_year} onChange={e => setSeriesForm({ ...seriesForm, release_year: e.target.value })} placeholder="2024" />
          </div>
          <div className="form-group">
            <label>Age Rating</label>
            <input type="text" value={seriesForm.age_rating} onChange={e => setSeriesForm({ ...seriesForm, age_rating: e.target.value })} placeholder="TV-MA, TV-14" />
          </div>
          <div className="form-group">
            <label>Access Level</label>
            <select value={seriesForm.access_level} onChange={e => setSeriesForm({ ...seriesForm, access_level: e.target.value })}>
              <option value="1">Level 1 — Free</option>
              <option value="2">Level 2 — Premium</option>
            </select>
          </div>
          <div className="form-group full" style={{ marginTop: "15px", paddingTop: "15px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <label style={{ color: "var(--primary)" }}>S3 Base Path *</label>
            <input type="text" value={seriesBasePath} onChange={e => setSeriesBasePath(e.target.value)} placeholder="e.g. webseries/breaking-bad/" required />
            <small style={{ color: "#aaa" }}>Season folders will be auto-created under this path.</small>
          </div>
          <div className="form-group">
            <label>Thumbnail / Poster Image</label>
            <input type="file" accept="image/*" onChange={e => setThumbnailFile(e.target.files[0])} />
          </div>
        </div>
        {progress && (
          <div style={{ marginTop: "20px", padding: "15px", background: "rgba(255,255,255,0.05)", borderRadius: "8px", textAlign: "center" }}>
            <p style={{ margin: 0, fontWeight: "bold", color: "var(--primary)" }}>{progress}</p>
          </div>
        )}
        <button type="submit" className="submit-btn" disabled={submitting}>
          {submitting ? "Creating..." : "📺 Create Series & Continue"}
        </button>
      </form>
    );
  }

  // Step 2: Episodes builder
  return (
    <div className="upload-form season-builder">
      <div className="series-header-row">
        <h3>📺 {createdSeries.title} — Seasons & Episodes</h3>
        <button className="finish-btn" onClick={finish}>✓ Finish</button>
      </div>

      <div className="inline-add" style={{ marginBottom: "20px" }}>
        <label>Add Season:</label>
        <input type="number" value={newSeasonNumber} onChange={e => setNewSeasonNumber(e.target.value)} placeholder="Season #" min="1" className="small-input" />
        <button className="add-btn" onClick={addSeason} type="button">+ Add Season</button>
      </div>

      {seasons.map((season, idx) => {
        const form = episodeForms[idx] || {};
        return (
          <div key={season.season_id} className="season-card">
            <h4>Season {season.season_number}</h4>
            <p style={{ color: "#777", fontSize: "12px", margin: "0 0 10px" }}>S3: {season.base}</p>
            {season.episodes.length > 0 && (
              <ul className="episode-list">
                {season.episodes.map(ep => <li key={ep.episode_id}>Ep {ep.episode_number}: {ep.title}</li>)}
              </ul>
            )}

            <div className="ep-upload-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", color: "#aaa" }}>Episode # *</label>
                <input type="number" placeholder="1" min="1" className="small-input" style={{ width: "100%" }}
                  value={form.number || ""}
                  onChange={e => setEpisodeForms(prev => ({ ...prev, [idx]: { ...(prev[idx] || {}), number: e.target.value } }))} />
              </div>
              <div>
                <label style={{ fontSize: "12px", color: "#aaa" }}>Episode Title</label>
                <input type="text" placeholder="Episode title" className="med-input" style={{ width: "100%" }}
                  value={form.title || ""}
                  onChange={e => setEpisodeForms(prev => ({ ...prev, [idx]: { ...(prev[idx] || {}), title: e.target.value } }))} />
              </div>
              <div>
                <label style={{ fontSize: "12px", color: "#aaa" }}>1080p Video (.mp4) *</label>
                <input type="file" accept="video/mp4"
                  onChange={e => setEpisodeForms(prev => ({ ...prev, [idx]: { ...(prev[idx] || {}), file1080: e.target.files[0] } }))} />
              </div>
              <div>
                <label style={{ fontSize: "12px", color: "#aaa" }}>720p Video (.mp4) (Optional)</label>
                <input type="file" accept="video/mp4"
                  onChange={e => setEpisodeForms(prev => ({ ...prev, [idx]: { ...(prev[idx] || {}), file720: e.target.files[0] } }))} />
              </div>
              <div>
                <label style={{ fontSize: "12px", color: "#aaa" }}>Spanish Audio (.aac) (Optional)</label>
                <input type="file" accept=".aac,audio/aac"
                  onChange={e => setEpisodeForms(prev => ({ ...prev, [idx]: { ...(prev[idx] || {}), audioES: e.target.files[0] } }))} />
              </div>
              <div>
                <label style={{ fontSize: "12px", color: "#aaa" }}>English Subtitles (.vtt) (Optional)</label>
                <input type="file" accept=".vtt,text/vtt"
                  onChange={e => setEpisodeForms(prev => ({ ...prev, [idx]: { ...(prev[idx] || {}), subEN: e.target.files[0] } }))} />
              </div>
            </div>

            {progress && (
              <div style={{ marginTop: "10px", padding: "10px", background: "rgba(255,255,255,0.05)", borderRadius: "8px", textAlign: "center" }}>
                <p style={{ margin: 0, color: "var(--primary)", fontWeight: "bold" }}>{progress}</p>
              </div>
            )}
            <button className="add-btn" onClick={() => addEpisode(idx)} type="button" disabled={submitting}
              style={{ marginTop: "10px" }}>
              {submitting ? "Uploading..." : "⬆ Upload & Add Episode"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default SeriesUploadForm;
