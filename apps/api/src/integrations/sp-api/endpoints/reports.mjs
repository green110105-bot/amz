// SP-API Reports 2021-06-30 — async report workflow.
//   POST /reports/2021-06-30/reports          → { reportId }
//   GET  /reports/2021-06-30/reports/{id}     → { processingStatus, reportDocumentId? }
//   GET  /reports/2021-06-30/documents/{id}   → { url, compressionAlgorithm? }
//   GET  <presigned url>                      → raw bytes (often GZipped TSV/CSV/JSON)

import { spapiCall } from '../client.mjs';
import { gunzipSync } from 'node:zlib';

const REPORTS_BASE = '/reports/2021-06-30';

// ---------------------------------------------------------------------------
// createReport
// ---------------------------------------------------------------------------
export async function createReport({
  userId, storeId, reportType, marketplaceIds,
  dataStartTime, dataEndTime, reportOptions,
}) {
  if (!reportType) throw new Error('report_type_required');
  if (!Array.isArray(marketplaceIds) || marketplaceIds.length === 0) {
    throw new Error('marketplace_ids_required');
  }
  const body = {
    reportType,
    marketplaceIds,
  };
  if (dataStartTime) body.dataStartTime = dataStartTime;
  if (dataEndTime) body.dataEndTime = dataEndTime;
  if (reportOptions) body.reportOptions = reportOptions;

  const { json } = await spapiCall({
    userId, storeId,
    endpoint: 'reports.createReport',
    path: `${REPORTS_BASE}/reports`,
    method: 'POST',
    body,
  });
  const reportId = json?.reportId || json?.payload?.reportId;
  if (!reportId) throw new Error('reports_create_no_id');
  return reportId;
}

// ---------------------------------------------------------------------------
// pollReport — exponential backoff, capped at 30s
// ---------------------------------------------------------------------------
const TERMINAL_STATUSES = new Set(['DONE', 'FATAL', 'CANCELLED']);

export async function pollReport({
  userId, storeId, reportId, maxAttempts = 60, baseDelayMs = 2000,
}) {
  if (!reportId) throw new Error('report_id_required');
  let attempt = 0;
  let lastStatus = null;
  let lastDoc = null;
  while (attempt < maxAttempts) {
    const { json } = await spapiCall({
      userId, storeId,
      endpoint: 'reports.getReport',
      path: `${REPORTS_BASE}/reports/${encodeURIComponent(reportId)}`,
    });
    const payload = json?.payload || json || {};
    lastStatus = payload.processingStatus || null;
    lastDoc = payload.reportDocumentId || null;
    if (lastStatus && TERMINAL_STATUSES.has(lastStatus)) {
      if (lastStatus === 'FATAL') {
        const err = new Error(`report_fatal:${reportId}`);
        err.status = lastStatus;
        err.reportId = reportId;
        throw err;
      }
      if (lastStatus === 'CANCELLED') {
        const err = new Error(`report_cancelled:${reportId}`);
        err.status = lastStatus;
        err.reportId = reportId;
        throw err;
      }
      return { status: lastStatus, reportDocumentId: lastDoc };
    }
    attempt += 1;
    if (attempt >= maxAttempts) break;
    const delay = Math.min(30_000, baseDelayMs * Math.pow(2, attempt - 1));
    await new Promise((r) => setTimeout(r, delay));
  }
  const err = new Error(`report_poll_timeout:${reportId} lastStatus=${lastStatus}`);
  err.status = 'TIMEOUT';
  err.lastStatus = lastStatus;
  err.reportId = reportId;
  throw err;
}

// ---------------------------------------------------------------------------
// downloadReportDocument — fetch presigned URL, gunzip if needed, parse TSV
// ---------------------------------------------------------------------------
export async function downloadReportDocument({
  userId, storeId, reportDocumentId, parse = 'tsv',
}) {
  if (!reportDocumentId) throw new Error('report_document_id_required');
  const { json } = await spapiCall({
    userId, storeId,
    endpoint: 'reports.getReportDocument',
    path: `${REPORTS_BASE}/documents/${encodeURIComponent(reportDocumentId)}`,
  });
  const payload = json?.payload || json || {};
  const url = payload.url;
  const compression = payload.compressionAlgorithm || null;
  if (!url) throw new Error('report_document_no_url');

  const res = await fetch(url);
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`report_document_download_failed_${res.status}:${t.slice(0, 200)}`);
  }
  const ab = await res.arrayBuffer();
  let buf = Buffer.from(ab);
  if (compression && /gzip/i.test(compression)) {
    buf = gunzipSync(buf);
  } else {
    // Some sandboxes return un-flagged gzip; sniff magic bytes.
    if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
      buf = gunzipSync(buf);
    }
  }
  const contentType = res.headers.get('content-type') || 'text/tab-separated-values';
  const text = buf.toString('utf8');
  let rows = null;
  if (parse === 'tsv') rows = parseTsv(text);
  else if (parse === 'csv') rows = parseDelimited(text, ',');
  else if (parse === 'json') {
    try { rows = JSON.parse(text); } catch { rows = null; }
  }
  return { contentType, text, rows, compression };
}

// ---------------------------------------------------------------------------
// runReportSync — orchestrator
// ---------------------------------------------------------------------------
export async function runReportSync({
  userId, storeId, reportType, marketplaceIds,
  since, until, reportOptions,
  pollMaxAttempts, pollBaseDelayMs, parse = 'tsv',
}) {
  const reportId = await createReport({
    userId, storeId, reportType, marketplaceIds,
    dataStartTime: since, dataEndTime: until, reportOptions,
  });
  const { reportDocumentId } = await pollReport({
    userId, storeId, reportId,
    maxAttempts: pollMaxAttempts, baseDelayMs: pollBaseDelayMs,
  });
  if (!reportDocumentId) {
    return { reportId, reportDocumentId: null, rows: [], text: '' };
  }
  const doc = await downloadReportDocument({
    userId, storeId, reportDocumentId, parse,
  });
  return {
    reportId,
    reportDocumentId,
    rows: doc.rows || [],
    text: doc.text,
    contentType: doc.contentType,
  };
}

// ---------------------------------------------------------------------------
// TSV parser — Amazon settlement / FBA inventory reports are tab-separated.
// Returns an array of objects keyed by header row.
// ---------------------------------------------------------------------------
export function parseTsv(text) {
  return parseDelimited(text, '\t');
}

function parseDelimited(text, delim) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  // Trim trailing blank line if present.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length === 0) return [];
  const headers = lines[0].split(delim).map((h) => h.trim());
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw) continue;
    const cells = raw.split(delim);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cells[j] !== undefined ? cells[j] : '';
    }
    out.push(row);
  }
  return out;
}
