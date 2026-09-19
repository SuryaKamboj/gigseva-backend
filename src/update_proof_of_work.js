require('dotenv').config();
const mongoose = require('mongoose');

async function updateProofOfWork() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const Worker = mongoose.model('Worker', new mongoose.Schema({}, { strict: false }));
    const WorkProof = mongoose.model('WorkProof', new mongoose.Schema({}, { strict: false }));
    const WorkGalleryItem = mongoose.model('WorkGalleryItem', new mongoose.Schema({}, { strict: false }));
    const Booking = mongoose.model('Booking', new mongoose.Schema({}, { strict: false }));

    const beforeImg = '/uploads/proof-of-work/before-switchboard-overhaul.png';
    const afterImg = '/uploads/proof-of-work/after-switchboard-overhaul.png';

    // 1. Update all Rajesh Kumar worker records
    const updateResult = await Worker.updateMany(
      {
        $or: [
          { workerCode: 'WK-DEL-001' },
          { fullName: 'Rajesh Kumar' },
          { _id: new mongoose.Types.ObjectId('6aa307c9abef287d06eb4213') }
        ]
      },
      {
        $set: {
          workGallery: [
            {
              id: 'wg-1',
              title: 'Burnt Switchboard Overhaul',
              jobType: 'Emergency MCB & Wiring Repair',
              date: '14 Aug 2026',
              rating: 5.0,
              location: 'Lajpat Nagar II, New Delhi',
              beforeImg: beforeImg,
              afterImg: afterImg
            }
          ],
          portfolio: [
            {
              id: 'pf-1-before',
              url: beforeImg,
              title: 'Burnt Switchboard Overhaul (Before Image)',
              uploadedAt: new Date('2026-08-14T10:15:00Z')
            },
            {
              id: 'pf-1-after',
              url: afterImg,
              title: 'Burnt Switchboard Overhaul (After Image)',
              uploadedAt: new Date('2026-08-14T11:45:00Z')
            }
          ]
        }
      }
    );
    console.log('Workers updated count:', updateResult.modifiedCount);

    // 2. Canonical worker
    const worker = await Worker.findOne({ workerCode: 'WK-DEL-001' });
    if (worker) {
      // Find a completed booking or any booking for this worker
      let booking = await Booking.findOne({ workerId: worker._id, status: 'COMPLETED' });
      if (!booking) {
        booking = await Booking.findOne({ workerId: worker._id });
      }

      if (booking) {
        const proofRes = await WorkProof.findOneAndUpdate(
          { bookingId: booking._id },
          {
            $set: {
              bookingId: booking._id,
              workerId: worker._id,
              beforeWorkPhotos: [{ url: beforeImg, capturedAt: new Date('2026-08-14T10:15:00Z') }],
              afterWorkPhotos: [{ url: afterImg, capturedAt: new Date('2026-08-14T11:45:00Z') }],
              workNotes: 'Burnt Switchboard Overhaul & Safety Wiring',
              location: { type: 'Point', coordinates: [77.2090, 28.5300] }
            }
          },
          { upsert: true, new: true }
        );
        console.log('WorkProof updated/upserted with ID:', proofRes._id);
      }

      // WorkGalleryItems in DB
      await WorkGalleryItem.deleteMany({ workerId: worker._id });
      const g1 = await WorkGalleryItem.create({
        workerId: worker._id,
        serviceCategory: 'ELECTRICAL',
        photoUrl: beforeImg,
        caption: 'Burnt Switchboard Overhaul (Before Image)',
        isPublic: true
      });
      const g2 = await WorkGalleryItem.create({
        workerId: worker._id,
        serviceCategory: 'ELECTRICAL',
        photoUrl: afterImg,
        caption: 'Burnt Switchboard Overhaul (After Image)',
        isPublic: true
      });
      console.log('WorkGalleryItems created:', g1._id, g2._id);
    }

    // Verify
    const verifiedWorker = await Worker.findOne({ workerCode: 'WK-DEL-001' });
    console.log('Verified Worker workGallery in DB:');
    console.log(JSON.stringify(verifiedWorker.workGallery, null, 2));

    const verifiedProofs = await WorkProof.find({});
    console.log('Verified WorkProofs count in DB:', verifiedProofs.length);
    console.log(JSON.stringify(verifiedProofs, null, 2));

    await mongoose.disconnect();
    console.log('Database updated successfully!');
  } catch (err) {
    console.error('Error updating proof of work:', err);
    process.exit(1);
  }
}

updateProofOfWork();
