const mongoose = require('mongoose');
const { Schema } = mongoose;

const WorkGalleryItemSchema = new Schema({
  workerId: { type: Schema.Types.ObjectId, ref: 'Worker', required: true, index: true },
  serviceCategory: String,
  photoUrl: { type: String, required: true },
  caption: String,
  isPublic: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('WorkGalleryItem', WorkGalleryItemSchema);
