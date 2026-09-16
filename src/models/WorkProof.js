const mongoose = require('mongoose');
const { Schema } = mongoose;

const WorkProofSchema = new Schema({
  bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true, index: true },
  workerId: { type: Schema.Types.ObjectId, ref: 'Worker', required: true },
  beforeWorkPhotos: [{ url: String, capturedAt: Date }],
  afterWorkPhotos: [{ url: String, capturedAt: Date }],
  workNotes: String,
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }
  }
}, { timestamps: true });

module.exports = mongoose.model('WorkProof', WorkProofSchema);
