// Anthropic Vision client — fetch-based, no SDK (keeps the Worker bundle small).
//
// One responsibility: take a receipt image (bytes + content-type), ask
// Claude to extract structured fields, return a typed result. We strip
// the model output of code-fence wrappers and look for the first JSON
// object so the response stays robust against slight prompt drift.

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export interface ReceiptExtraction {
  vendor: string | null;
  date: string | null;          // ISO YYYY-MM-DD if confidently parsed, else null
  total_pence: number | null;
  vat_amount_pence: number | null;
  vat_rate: number | null;      // integer percent, e.g. 20
  currency: string | null;      // ISO code if visible (GBP, EUR…)
  confidence: 'high' | 'medium' | 'low';
}

export interface ExtractReceiptInput {
  apiKey: string;
  model: string;
  maxTokens: number;
  imageBytes: ArrayBuffer | Uint8Array;
  contentType: string; // image/webp | image/jpeg | image/png
}

const SYSTEM_PROMPT =
  'You read UK receipts and extract structured fields. Return ONLY a JSON object with these keys: ' +
  'vendor (string|null), date (YYYY-MM-DD|null), total_pence (integer|null), ' +
  'vat_amount_pence (integer|null), vat_rate (integer 0-100|null), currency (ISO code|null), ' +
  'confidence ("high"|"medium"|"low"). Convert money to integer pence (£12.50 → 1250). ' +
  'Use null for any field you cannot read confidently. Do not include any commentary, ' +
  'markdown fences, or explanation. Respond with the JSON object only.';

export async function extractReceiptFields(
  input: ExtractReceiptInput,
): Promise<{ ok: true; data: ReceiptExtraction } | { ok: false; error: string; status?: number }> {
  if (!input.apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY not configured' };

  const base64 = bytesToBase64(input.imageBytes);

  const body = {
    model: input.model,
    max_tokens: input.maxTokens,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: input.contentType, data: base64 },
          },
          { type: 'text', text: 'Extract the receipt fields as JSON.' },
        ],
      },
    ],
  };

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': input.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: text.slice(0, 500) || `Anthropic API ${res.status}`, status: res.status };
  }

  type AnthropicResponse = { content?: Array<{ type: string; text?: string }> };
  const json = (await res.json()) as AnthropicResponse;
  const text = (json.content ?? []).find((c) => c.type === 'text')?.text ?? '';
  const parsed = parseExtraction(text);
  if (!parsed) {
    return { ok: false, error: 'Could not parse model response as JSON' };
  }
  return { ok: true, data: parsed };
}

// ----------------------------------------------------------------------------
// Robust JSON extraction — find the first balanced { … } block in the model
// output and validate the shape. Defends against the model wrapping the
// response in a code fence, adding leading prose, etc.
// ----------------------------------------------------------------------------
function parseExtraction(raw: string): ReceiptExtraction | null {
  if (!raw) return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  return {
    vendor: stringOrNull(obj.vendor),
    date: dateOrNull(obj.date),
    total_pence: integerOrNull(obj.total_pence),
    vat_amount_pence: integerOrNull(obj.vat_amount_pence),
    vat_rate: percentOrNull(obj.vat_rate),
    currency: stringOrNull(obj.currency),
    confidence: confidenceOrNull(obj.confidence),
  };
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t.slice(0, 200) : null;
}
function integerOrNull(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n >= 0 && n < 100_000_000 ? n : null;
}
function percentOrNull(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n >= 0 && n <= 100 ? n : null;
}
function dateOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
function confidenceOrNull(v: unknown): ReceiptExtraction['confidence'] {
  if (v === 'high' || v === 'medium' || v === 'low') return v;
  return 'low';
}

// ----------------------------------------------------------------------------
// Small base64 encoder — Workers don't have Buffer; btoa needs a binary
// string. Chunked to avoid stack overflow on large images.
// ----------------------------------------------------------------------------
function bytesToBase64(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}
