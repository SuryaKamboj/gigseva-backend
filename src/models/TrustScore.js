const mongoose = require('mongoose');
const { Schema } = mongoose;

const TrustScoreSchema = new Schema({
  workerId: { type: Schema.Types.ObjectId, ref: 'Worker', required: true, unique: true },
  currentScore: { type: Number, default: 70 },
  components: {
    customerRatingWeight: { type: Number, default: 0 },
    completionRateWeight: { type: Number, default: 0 },
    punctualityWeight: { type: Number, default: 0 },
    peerEndorsementWeight: { type: Number, default: 0 },
    disciplinaryDeductionWeight: { type: Number, default: 0 }
  },
  lastCalculatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('TrustScore', TrustScoreSchema);
