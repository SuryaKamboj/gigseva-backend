const mongoose = require('mongoose');
const { Schema } = mongoose;

const ServiceSchema = new Schema({
  serviceCode: { type: String, required: true, unique: true, index: true },
  name: { type: String }, // Flat convenience for frontend
  title: {
    en: String,
    pa: String,
    hi: String
  },
  category: {
    type: String,
    enum: ['PLUMBING','ELECTRICAL','CARPENTRY','CLEANING','PAINTING','APPLIANCE_REPAIR','APPLIANCE','MASONRY','GARDENING','OTHER'],
    required: true
  },
  description: { type: Schema.Types.Mixed },
  iconUrl: String,
  imageUrl: String,
  baseLaborPrice: { type: Number, required: true },
  baseEstimatedMinutes: { type: Number, default: 60 },
  defaultDurationMinutes: { type: Number, default: 60 },
  allowedAddons: [{
    addonId: String,
    title: { en: String, pa: String, hi: String },
    price: Number,
    _id: false
  }],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

ServiceSchema.pre('save', function(next) {
  if (!this.name && this.title && this.title.en) {
    this.name = this.title.en;
  }
  if (!this.title && this.name) {
    this.title = { en: this.name, hi: this.name, pa: this.name };
  }
  if (this.defaultDurationMinutes && !this.baseEstimatedMinutes) {
    this.baseEstimatedMinutes = this.defaultDurationMinutes;
  }
  next();
});

module.exports = mongoose.model('Service', ServiceSchema);