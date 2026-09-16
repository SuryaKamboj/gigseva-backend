const mongoose = require('mongoose');
const { Schema } = mongoose;

const TrackingEventSchema = new Schema({
  bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
  workerId: { type: Schema.Types.ObjectId, ref: 'Worker', required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }
  },
  heading: Number,
  speedKmh: Number,
  accuracyMeters: Number,
  isDelayed: { type: Boolean, default: false },
  timestamp: { type: Date, required: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

TrackingEventSchema.index({ bookingId: 1, timestamp: -1 });
TrackingEventSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('TrackingEvent', TrackingEventSchema);
