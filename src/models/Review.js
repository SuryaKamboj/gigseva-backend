const mongoose = require('mongoose');
const { Schema } = mongoose;

const CANONICAL_TAGS = ['PUNCTUAL','CLEAN_WORK','PROFESSIONAL','TRANSPARENT','FRIENDLY','SKILLED','FAST_SERVICE','AFFORDABLE','WOULD_RECOMMEND'];

const ReviewSchema = new Schema({
  bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  workerId: { type: Schema.Types.ObjectId, ref: 'Worker', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  categoryRatings: {
    punctuality: { type: Number, min: 1, max: 5 },
    workQuality: { type: Number, min: 1, max: 5 },
    behavior: { type: Number, min: 1, max: 5 },
    transparency: { type: Number, min: 1, max: 5 }
  },
  tags: [{
    type: String,
    enum: CANONICAL_TAGS,
    validate: { validator: v => CANONICAL_TAGS.includes(v), message: 'Invalid review tag' }
  }],
  comment: String,
  isPublic: { type: Boolean, default: true }
}, { timestamps: true });

ReviewSchema.index({ workerId: 1, createdAt: -1 });

module.exports = mongoose.model('Review', ReviewSchema);
