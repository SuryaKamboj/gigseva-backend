/**
 * Canonical Pricing Engine — GigSevak v1.1
 *
 * Formula:
 *   effectiveLaborAmount = baseLaborPrice * tierMultiplier * demandMultiplier
 *   platformFee = effectiveLaborAmount * platformFeeRatio (default 0.05)
 *   taxBase = effectiveLaborAmount + platformFee
 *   taxAmount = taxBase * taxRatePercent / 100  (default 18% GST — OD-01)
 *   totalAmount = effectiveLaborAmount + materialAmount + platformFee + taxAmount
 *
 * All monetary values in rupees (2 decimal places).
 * Worker payout = totalAmount after tax * workerSharePercent
 */

const TIER_MULTIPLIERS = { STANDARD: 1.00, SENIOR: 1.15, MASTER: 1.25 };
const PLATFORM_FEE_RATIO = 0.05;
const DEFAULT_TAX_RATE = 18; // GST — OD-01: unconfirmed, assumed 18%

function truncatePaise(rupees) {
  return Math.floor(rupees * 100) / 100;
}

/**
 * Calculate full pricing breakdown.
 *
 * @param {object} params
 * @param {number} params.baseLaborPrice - from Service document
 * @param {string} params.experienceTier - STANDARD | SENIOR | MASTER
 * @param {number} params.demandMultiplier - from Region document (default 1.0)
 * @param {number} params.materialAmount - sum of APPROVED material requests
 * @param {number} params.additionalCharges - admin-imposed extras
 * @param {number} params.taxRatePercent - federation tax rate (default 18)
 * @param {object} params.splitRatios - { workerSharePercent, societySharePercent, referringSocietySharePercent, federationSharePercent }
 * @returns {object} CanonicalPricingBreakdown
 */
function calculatePricing({
  baseLaborPrice,
  experienceTier = 'STANDARD',
  demandMultiplier = 1.0,
  materialAmount = 0,
  additionalCharges = 0,
  taxRatePercent = DEFAULT_TAX_RATE,
  splitRatios = { workerSharePercent: 85, societySharePercent: 10, referringSocietySharePercent: 0, federationSharePercent: 5 }
}) {
  const tierMultiplier = TIER_MULTIPLIERS[experienceTier] || 1.0;
  const effectiveLaborAmount = truncatePaise(baseLaborPrice * tierMultiplier * demandMultiplier);
  const platformFee = truncatePaise(effectiveLaborAmount * PLATFORM_FEE_RATIO);
  const taxBase = effectiveLaborAmount + platformFee;
  const taxAmount = truncatePaise(taxBase * (taxRatePercent / 100));
  const totalAmount = truncatePaise(effectiveLaborAmount + materialAmount + additionalCharges + platformFee + taxAmount);

  // Cooperative distribution (applied on totalAmount pre-tax? or on worker's share only?)
  // ADR-05 decision: split applies to effectiveLaborAmount (labor revenue only, not materials or platform fees)
  const laborRevenue = effectiveLaborAmount;
  const workerPayoutAmount = truncatePaise(laborRevenue * (splitRatios.workerSharePercent / 100));
  const servicingSocietyAmount = truncatePaise(laborRevenue * (splitRatios.societySharePercent / 100));
  const referringSocietyAmount = truncatePaise(laborRevenue * (splitRatios.referringSocietySharePercent / 100));
  const platformReserveAmount = truncatePaise(laborRevenue * (splitRatios.federationSharePercent / 100));

  return {
    baseLaborAmount: truncatePaise(baseLaborPrice),
    effectiveLaborAmount,
    tierMultiplier,
    demandMultiplier,
    materialAmount,
    additionalCharges,
    platformFee,
    taxRatePercent,
    taxAmount,
    totalAmount,
    workerPayoutAmount,
    servicingSocietyAmount,
    referringSocietyAmount,
    platformReserveAmount,
    // Sanity check: labor components should sum to laborRevenue
    _laborDistributionSum: truncatePaise(workerPayoutAmount + servicingSocietyAmount + referringSocietyAmount + platformReserveAmount)
  };
}

module.exports = { calculatePricing };
