// ── News.js ───────────────────────────────────────────────────────────────────
const newsSchema = new mongoose.Schema({
  title:      { type: String, required: true },
  summary:    { type: String, required: true },
  content:    { type: String, required: true },
  images:     [{ type: String }],
  author:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: { type: String },
  createdAt:  { type: Date, default: Date.now },
  hidden:     { type: Boolean, default: false },
 
  // ── AUTO-MOD ──────────────────────────────────────────────────────────────
  flaggedBy:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  autoHidden: { type: Boolean, default: false },
  // ─────────────────────────────────────────────────────────────────────────
});
 
module.exports = mongoose.model('News', newsSchema);