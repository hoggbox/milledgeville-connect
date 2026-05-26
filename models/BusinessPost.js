const mongoose = require('mongoose');

// ─── BusinessPost ─────────────────────────────────────────────────────────────
// A single photo update posted by a verified business owner.
// The image is stored as a base64 data URL (same pattern as shoutouts/marketplace).
// The push notification deep-links to `page: 'business-post', id: post._id`.

const businessPostSchema = new mongoose.Schema(
  {
    // The Business document this post belongs to (for the "all posts by biz" feed)
    business: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Business',
      required: true,
      index:    true,
    },

    // The User (owner) who created the post
    owner: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },

    // Cached business name so we never need a populate just to display it
    bizName: {
      type:    String,
      default: '',
    },

    // base64 data URL — validated on the API side (jpeg/png/webp, max ~4 MB)
    image: {
      type:     String,
      required: true,
    },

    // Optional caption (max 500 chars, enforced on API side)
    caption: {
      type:    String,
      default: '',
      maxlength: 500,
    },
  },
  {
    timestamps: true, // adds createdAt + updatedAt
  }
);

// Compound index for the "all posts by business" query (newest first)
businessPostSchema.index({ business: 1, createdAt: -1 });

// Index for the global feed (newest first across all businesses)
businessPostSchema.index({ createdAt: -1 });

module.exports = mongoose.models.BusinessPost
  || mongoose.model('BusinessPost', businessPostSchema);