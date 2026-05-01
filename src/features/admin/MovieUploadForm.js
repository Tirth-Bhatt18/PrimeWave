import React, { useState } from "react";
import axios from "axios";
import api from "../../config/api";

function MovieUploadForm({ headers, fetchDashboard, setToast }) {
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [form, setForm] = useState({
    title: "", description: "", release_year: "", age_rating: "",
    access_level: "1", duration: "", basePath: ""
  });

  const [files, setFiles] = useState({
    thumbnail: null,
    video1080: null,
    video720: null,
    video480: null,
    audioES: null,
    subEN: null
  });

  const handleFileChange = (e, key) => {
    setFiles({ ...files, [key]: e.target.files[0] });
  };

  const uploadFile = async (file, s3Key) => {
    setProgress(`Generating URL for ${file.name}...`);
    const { data } = await api.get(`/admin/presigned-put?key=${encodeURIComponent(s3Key)}&contentType=${encodeURIComponent(file.type)}`, { headers });
    
    setProgress(`Uploading ${file.name}...`);
    await axios.put(data.url, file, {
      headers: { "Content-Type": file.type },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setProgress(`Uploading ${file.name}... ${percentCompleted}%`);
      }
    });
    return s3Key;
  };

  const submitMovie = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.basePath.trim()) { 
        setToast({ type: "error", msg: "Title and Base S3 Path are required" }); 
        return; 
    }
    setSubmitting(true);
    try {
      const base = form.basePath.endsWith('/') ? form.basePath : form.basePath + '/';
      
      let thumbnailUrl = "";
      let videoUrl = "";
      let qualitiesArr = [];
      let audiosArr = [];
      let subtitlesArr = [];

      if (files.thumbnail) {
        thumbnailUrl = await uploadFile(files.thumbnail, `${base}thumbnail.${files.thumbnail.name.split('.').pop()}`);
      }
      if (files.video1080) {
        videoUrl = await uploadFile(files.video1080, `${base}1080p.mp4`);
      }
      if (files.video720) {
        const qUrl = await uploadFile(files.video720, `${base}720p.mp4`);
        qualitiesArr.push(`720p|${qUrl}`);
      }
      if (files.video480) {
        const qUrl = await uploadFile(files.video480, `${base}480p.mp4`);
        qualitiesArr.push(`480p|${qUrl}`);
      }
      if (files.audioES) {
        const aUrl = await uploadFile(files.audioES, `${base}audio_es.aac`);
        audiosArr.push(`es|${aUrl}`);
      }
      if (files.subEN) {
        const sUrl = await uploadFile(files.subEN, `${base}sub_en.vtt`);
        subtitlesArr.push(`en|${sUrl}`);
      }

      setProgress("Saving metadata to database...");
      
      const payload = {
        title: form.title,
        description: form.description,
        release_year: form.release_year ? parseInt(form.release_year) : null,
        access_level: parseInt(form.access_level) || 1,
        duration: form.duration ? parseInt(form.duration) : null,
        age_rating: form.age_rating,
        thumbnail_url: thumbnailUrl,
        video_url: videoUrl,
        qualities: qualitiesArr.join(','),
        audios: audiosArr.join(','),
        subtitles: subtitlesArr.join(',')
      };

      await api.post("/admin/content/movie", payload, { headers });
      setToast({ type: "success", msg: `Movie "${form.title}" added successfully!` });
      
      // Reset form
      setForm({ title: "", description: "", release_year: "", age_rating: "", access_level: "1", duration: "", basePath: "" });
      setFiles({ thumbnail: null, video1080: null, video720: null, video480: null, audioES: null, subEN: null });
      fetchDashboard();
    } catch (e) {
      console.error(e);
      setToast({ type: "error", msg: e.response?.data?.message || "Failed to add movie" });
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <form className="upload-form" onSubmit={submitMovie}>
      <h3>Add New Movie (Direct to S3)</h3>
      <div className="form-grid">
        <div className="form-group full">
          <label>Title *</label>
          <input type="text" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g. The Dark Knight" required />
        </div>
        <div className="form-group full">
          <label>Description</label>
          <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Brief synopsis..." rows={3} />
        </div>
        <div className="form-group">
          <label>Release Year</label>
          <input type="number" value={form.release_year} onChange={e => setForm({...form, release_year: e.target.value})} placeholder="2024" />
        </div>
        <div className="form-group">
          <label>Age Rating</label>
          <input type="text" value={form.age_rating} onChange={e => setForm({...form, age_rating: e.target.value})} placeholder="PG-13, R" />
        </div>
        <div className="form-group">
          <label>Access Level</label>
          <select value={form.access_level} onChange={e => setForm({...form, access_level: e.target.value})}>
            <option value="1">Level 1 — Free</option>
            <option value="2">Level 2 — Premium</option>
          </select>
        </div>
        <div className="form-group">
          <label>Duration (minutes)</label>
          <input type="number" value={form.duration} onChange={e => setForm({...form, duration: e.target.value})} placeholder="148" />
        </div>
        
        <div className="form-group full" style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <label style={{ color: 'var(--primary)' }}>S3 Base Path *</label>
          <input type="text" value={form.basePath} onChange={e => setForm({...form, basePath: e.target.value})} placeholder="e.g. movies/the-dark-knight/" required />
          <small style={{ color: '#aaa' }}>Files will be uploaded to this folder in your S3 bucket.</small>
        </div>

        <div className="form-group">
          <label>Thumbnail / Poster Image</label>
          <input type="file" accept="image/*" onChange={e => handleFileChange(e, 'thumbnail')} />
        </div>
        <div className="form-group">
          <label>1080p Video (.mp4) *</label>
          <input type="file" accept="video/mp4" onChange={e => handleFileChange(e, 'video1080')} required />
        </div>
        <div className="form-group">
          <label>720p Video (.mp4) (Optional)</label>
          <input type="file" accept="video/mp4" onChange={e => handleFileChange(e, 'video720')} />
        </div>
        <div className="form-group">
          <label>480p Video (.mp4) (Optional)</label>
          <input type="file" accept="video/mp4" onChange={e => handleFileChange(e, 'video480')} />
        </div>
        <div className="form-group">
          <label>Spanish Audio (.aac) (Optional)</label>
          <input type="file" accept=".aac,audio/aac" onChange={e => handleFileChange(e, 'audioES')} />
        </div>
        <div className="form-group">
          <label>English Subtitles (.vtt) (Optional)</label>
          <input type="file" accept=".vtt,text/vtt" onChange={e => handleFileChange(e, 'subEN')} />
        </div>
      </div>

      {progress && (
        <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontWeight: 'bold', color: 'var(--primary)' }}>{progress}</p>
        </div>
      )}

      <button type="submit" className="submit-btn" disabled={submitting}>
        {submitting ? "Processing..." : "🎬 Upload & Add Movie"}
      </button>
    </form>
  );
}

export default MovieUploadForm;
