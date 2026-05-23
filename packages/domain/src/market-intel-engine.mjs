export function clusterReviews(reviews = []) {
  const clusters = [
    { id: 'quality', label: 'Product quality', keywords: ['broken', 'loose', 'scratch', 'defect', 'quality'] },
    { id: 'expectation', label: 'Expectation mismatch', keywords: ['small', 'large', 'size', 'different', 'expected'] },
    { id: 'packaging', label: 'Packaging and logistics', keywords: ['package', 'box', 'shipping', 'damaged'] },
    { id: 'instruction', label: 'Instruction and usage', keywords: ['instructions', 'manual', 'confusing', 'setup'] },
    { id: 'performance', label: 'Performance', keywords: ['slow', 'heat', 'battery', 'charging', 'noise'] },
  ];

  return clusters.map((cluster) => {
    const matched = reviews.filter((review) => {
      const text = `${review.title || ''} ${review.body || ''}`.toLowerCase();
      return cluster.keywords.some((keyword) => text.includes(keyword));
    });
    return {
      id: cluster.id,
      label: cluster.label,
      frequency: matched.length,
      negativeCount: matched.filter((review) => Number(review.rating || 5) <= 3).length,
      examples: matched.slice(0, 3).map((review) => ({ rating: review.rating, title: review.title })),
      recommendation: recommendationFor(cluster.id),
    };
  }).filter((cluster) => cluster.frequency > 0)
    .sort((a, b) => b.negativeCount - a.negativeCount || b.frequency - a.frequency);
}

export function detectCompetitorChanges(previousSnapshots = [], currentSnapshots = []) {
  const previousByAsin = new Map(previousSnapshots.map((item) => [item.asin, item]));
  const changes = [];

  for (const current of currentSnapshots) {
    const previous = previousByAsin.get(current.asin);
    if (!previous) {
      changes.push(makeChange(current, 'NEW_COMPETITOR', 'P2', ['New competitor snapshot appeared.']));
      continue;
    }

    if (Number(previous.price) > 0 && Math.abs(Number(current.price) - Number(previous.price)) / Number(previous.price) >= 0.1) {
      changes.push(makeChange(current, 'PRICE_CHANGE', Number(current.price) < Number(previous.price) ? 'P1' : 'P2', [
        `Price changed from ${previous.price} to ${current.price}.`,
      ]));
    }

    if (previous.titleHash && current.titleHash && previous.titleHash !== current.titleHash) {
      changes.push(makeChange(current, 'LISTING_COPY_CHANGE', 'P2', ['Title or bullet hash changed.']));
    }

    if (current.dealActive && !previous.dealActive) {
      changes.push(makeChange(current, 'DEAL_STARTED', 'P1', ['Deal or coupon became active.']));
    }
  }

  return changes;
}

function makeChange(snapshot, type, severity, evidence) {
  return {
    id: `${snapshot.asin}:${type}`,
    asin: snapshot.asin,
    productId: snapshot.productId,
    type,
    severity,
    evidence,
    interpretation: interpretationFor(type),
  };
}

function recommendationFor(clusterId) {
  const recommendations = {
    quality: 'Create supplier/product improvement task and reflect resolved proof in Listing after confirmed.',
    expectation: 'Add clearer dimensions, compatibility, and expectation-setting images to Listing.',
    packaging: 'Review FBA prep and packaging strength; add packaging QA checklist.',
    instruction: 'Rewrite instruction PDF and add quick-start visuals to A+ or gallery images.',
    performance: 'Check product spec claims and add realistic usage conditions to Listing.',
  };
  return recommendations[clusterId] || 'Review cluster and assign an owner.';
}

function interpretationFor(type) {
  const interpretations = {
    NEW_COMPETITOR: 'A new monitored competitor entered the pool; compare positioning before reacting.',
    PRICE_CHANGE: 'Competitor price movement may affect Buy Box, conversion, and ad efficiency; run M2 price-follow math.',
    LISTING_COPY_CHANGE: 'Competitor changed positioning; send to M1 for copy/visual comparison.',
    DEAL_STARTED: 'Competitor likely runs short-term rank or inventory campaign; coordinate M2/M3 response.',
  };
  return interpretations[type] || 'Review competitor change.';
}
