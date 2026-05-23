import { roundCurrency } from './profit-engine.mjs';

export function scoreListing({ product, listing = {}, searchTerms = [], reviews = [], competitors = [] }) {
  const title = listing.title || product?.title || '';
  const bullets = listing.bullets || [];
  const description = listing.description || '';
  const allText = `${title} ${bullets.join(' ')} ${description}`.toLowerCase();

  const highValueTerms = searchTerms
    .filter((term) => Number(term.impressions || 0) > 100 || Number(term.conversions || 0) > 0)
    .map((term) => term.term.toLowerCase());
  const coveredTerms = highValueTerms.filter((term) => allText.includes(term));
  const keywordCoverage = highValueTerms.length === 0 ? 55 : (coveredTerms.length / highValueTerms.length) * 100;

  const hasSpecificClaims = /\d|%|year|years|warranty|certified|tested|hours|lbs|kg|inch|cm/i.test(allText);
  const bulletCompleteness = Math.min(100, bullets.filter((bullet) => bullet.length >= 35).length * 20);
  const sellingPointClarity = (bulletCompleteness * 0.7) + (hasSpecificClaims ? 30 : 0);

  const painKeywords = extractPainKeywords(reviews);
  const painCovered = painKeywords.filter((word) => allText.includes(word));
  const painPointAlignment = painKeywords.length === 0 ? 50 : (painCovered.length / painKeywords.length) * 100;

  const imageCount = (listing.images || []).length;
  const hasAplus = Boolean(listing.aPlusHtml || listing.aPlusModules?.length);
  const visualAplus = Math.min(100, imageCount * 12 + (hasAplus ? 35 : 0));

  const conversionTriggers = [
    /warranty|guarantee|return|refund/i,
    /compare|versus|vs\.?/i,
    /limited|today|deal|coupon/i,
    /review|rated|trusted|bestseller/i,
  ].reduce((score, regex) => score + (regex.test(allText) ? 25 : 0), 0);

  const dimensions = {
    keywordCoverage: roundCurrency(keywordCoverage, 1),
    sellingPointClarity: roundCurrency(sellingPointClarity, 1),
    painPointAlignment: roundCurrency(painPointAlignment, 1),
    visualAplus: roundCurrency(visualAplus, 1),
    conversionTriggers: roundCurrency(conversionTriggers, 1),
  };

  const total = roundCurrency(
    dimensions.keywordCoverage * 0.25 +
    dimensions.sellingPointClarity * 0.20 +
    dimensions.painPointAlignment * 0.20 +
    dimensions.visualAplus * 0.15 +
    dimensions.conversionTriggers * 0.20,
    1,
  );

  return {
    productId: product?.id || listing.productId,
    asin: product?.asin,
    total,
    dimensions,
    evidence: {
      coveredTerms,
      missingTerms: highValueTerms.filter((term) => !coveredTerms.includes(term)),
      painKeywords,
      painCovered,
      competitorCount: competitors.length,
    },
    confidence: roundCurrency(Math.min(0.9, 0.45 + searchTerms.length * 0.02 + reviews.length * 0.01 + competitors.length * 0.03), 2),
  };
}

export function suggestListingImprovements(score) {
  const candidates = [
    {
      dimension: 'keywordCoverage',
      title: 'Add missing high-value search terms naturally into title, bullets, or backend terms.',
      expectedLift: 8,
    },
    {
      dimension: 'sellingPointClarity',
      title: 'Rewrite weak bullets with specific proof points, numbers, and product differentiators.',
      expectedLift: 7,
    },
    {
      dimension: 'painPointAlignment',
      title: 'Address recurring review pain points directly in bullets, image copy, or A+ modules.',
      expectedLift: 7,
    },
    {
      dimension: 'visualAplus',
      title: 'Add gallery/A+ modules for scenario, comparison, dimension, and trust-building content.',
      expectedLift: 6,
    },
    {
      dimension: 'conversionTriggers',
      title: 'Add risk reducers such as warranty, return reassurance, comparison, and social proof.',
      expectedLift: 5,
    },
  ];

  return candidates
    .filter((candidate) => Number(score.dimensions[candidate.dimension]) < 75)
    .sort((a, b) => Number(score.dimensions[a.dimension]) - Number(score.dimensions[b.dimension]) || b.expectedLift - a.expectedLift)
    .slice(0, 5)
    .map((candidate, index) => ({
      id: `listing-improvement-${index + 1}`,
      ...candidate,
      currentScore: score.dimensions[candidate.dimension],
      rationale: `Current ${candidate.dimension} score is ${score.dimensions[candidate.dimension]}.`,
    }));
}

export function diagnoseListing(input) {
  const score = scoreListing(input);
  return {
    sourceMode: input.sourceMode || 'mock',
    score,
    improvements: suggestListingImprovements(score),
    sovereignty: 'manual_only',
  };
}

function extractPainKeywords(reviews) {
  const dictionary = ['size', 'small', 'large', 'broken', 'loose', 'slow', 'heat', 'battery', 'scratch', 'package', 'instructions', 'warranty'];
  const reviewText = reviews.map((review) => `${review.title || ''} ${review.body || ''}`.toLowerCase()).join(' ');
  return dictionary.filter((word) => reviewText.includes(word));
}
