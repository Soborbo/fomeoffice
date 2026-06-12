/**
 * Lightweight Google Sheets API helper using direct REST calls.
 * Uses service account JWT auth — no googleapis package needed.
 * This keeps the Cloudflare Workers bundle under the 25 MB limit.
 */

interface JWTHeader {
  alg: string;
  typ: string;
}

interface JWTClaims {
  iss: string;
  scope: string;
  aud: string;
  exp: number;
  iat: number;
}

// Base64url encode
function base64url(input: string | ArrayBuffer): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Create a signed JWT using Web Crypto API (works in Cloudflare Workers)
async function createJWT(email: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header: JWTHeader = { alg: 'RS256', typ: 'JWT' };
  const claims: JWTClaims = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaims = base64url(JSON.stringify(claims));
  const signInput = `${encodedHeader}.${encodedClaims}`;

  // Import the private key
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');

  const binaryKey = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signInput)
  );

  return `${signInput}.${base64url(signature)}`;
}

// Exchange JWT for access token
async function getAccessToken(email: string, privateKey: string): Promise<string | null> {
  try {
    const jwt = await createJWT(email, privateKey);

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!response.ok) {
      console.error('Token exchange failed:', response.status, await response.text());
      return null;
    }

    const data = await response.json() as { access_token: string };
    return data.access_token;
  } catch (error) {
    console.error('JWT/token error:', error);
    return null;
  }
}

// Simple in-memory token cache
let cachedToken: { token: string; expiry: number } | null = null;

async function getToken(email: string, privateKey: string): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiry > now) {
    return cachedToken.token;
  }

  const token = await getAccessToken(email, privateKey);
  if (token) {
    cachedToken = { token, expiry: now + 50 * 60 * 1000 }; // 50 min cache
  }
  return token;
}

/**
 * Read rows from a Google Sheet.
 * Returns all rows or empty array on failure.
 */
export async function readFromSheet(envVars?: { email?: string; privateKey?: string; spreadsheetId?: string }): Promise<string[][]> {
  try {
    const email = envVars?.email ?? process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = (envVars?.privateKey ?? process.env.GOOGLE_PRIVATE_KEY)?.replace(/\\n/g, '\n');
    const spreadsheetId = envVars?.spreadsheetId ?? process.env.GOOGLE_SPREADSHEET_ID;

    if (!email || !privateKey || !spreadsheetId) {
      console.warn('Google Sheets not configured — skipping read');
      return [];
    }

    const token = await getToken(email, privateKey);
    if (!token) {
      console.error('Failed to get Google access token');
      return [];
    }

    const range = encodeURIComponent('Sheet1!A:AH');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      console.error('Sheets read failed:', response.status, await response.text());
      return [];
    }

    const data = await response.json() as { values?: string[][] };
    return data.values || [];
  } catch (error) {
    console.error('Google Sheets read error:', error);
    return [];
  }
}

/**
 * Update a single cell in the Google Sheet.
 */
export async function updateCell(cell: string, value: string, envVars?: { email?: string; privateKey?: string; spreadsheetId?: string }): Promise<boolean> {
  try {
    const email = envVars?.email ?? process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = (envVars?.privateKey ?? process.env.GOOGLE_PRIVATE_KEY)?.replace(/\\n/g, '\n');
    const spreadsheetId = envVars?.spreadsheetId ?? process.env.GOOGLE_SPREADSHEET_ID;

    if (!email || !privateKey || !spreadsheetId) {
      console.warn('Google Sheets not configured — skipping cell update');
      return false;
    }

    const token = await getToken(email, privateKey);
    if (!token) {
      console.error('Failed to get Google access token');
      return false;
    }

    const range = encodeURIComponent(`Sheet1!${cell}`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [[value]] }),
    });

    if (!response.ok) {
      console.error('Sheets cell update failed:', response.status, await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('Google Sheets cell update error:', error);
    return false;
  }
}

/**
 * Write a row of values to a range (e.g. "A5:Q5"). Overwrites existing cells.
 */
export async function updateRange(range: string, values: string[], envVars?: { email?: string; privateKey?: string; spreadsheetId?: string }): Promise<boolean> {
  try {
    const email = envVars?.email ?? process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = (envVars?.privateKey ?? process.env.GOOGLE_PRIVATE_KEY)?.replace(/\\n/g, '\n');
    const spreadsheetId = envVars?.spreadsheetId ?? process.env.GOOGLE_SPREADSHEET_ID;

    if (!email || !privateKey || !spreadsheetId) return false;
    const token = await getToken(email, privateKey);
    if (!token) return false;

    const encoded = encodeURIComponent(`Sheet1!${range}`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encoded}?valueInputOption=USER_ENTERED`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [values] }),
    });

    if (!response.ok) {
      console.error('Sheets range update failed:', response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error('Google Sheets range update error:', error);
    return false;
  }
}

/**
 * Set background color for an entire row using the Sheets batchUpdate API.
 * rowIndex is 1-based (sheet row number). Pass null color to clear formatting.
 */
export async function setRowColor(
  rowIndex: number,
  color: { red: number; green: number; blue: number } | null,
  envVars?: { email?: string; privateKey?: string; spreadsheetId?: string },
): Promise<boolean> {
  try {
    const email = envVars?.email ?? process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = (envVars?.privateKey ?? process.env.GOOGLE_PRIVATE_KEY)?.replace(/\\n/g, '\n');
    const spreadsheetId = envVars?.spreadsheetId ?? process.env.GOOGLE_SPREADSHEET_ID;

    if (!email || !privateKey || !spreadsheetId) {
      console.warn('Google Sheets not configured — skipping row color');
      return false;
    }

    const token = await getToken(email, privateKey);
    if (!token) {
      console.error('Failed to get Google access token');
      return false;
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;

    const request: any = {
      repeatCell: {
        range: {
          sheetId: 0,
          startRowIndex: rowIndex - 1,
          endRowIndex: rowIndex,
          startColumnIndex: 0,
          endColumnIndex: 26,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: color ?? { red: 1, green: 1, blue: 1 },
          },
        },
        fields: 'userEnteredFormat.backgroundColor',
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests: [request] }),
    });

    if (!response.ok) {
      console.error('Sheets row color failed:', response.status, await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('Google Sheets row color error:', error);
    return false;
  }
}

/**
 * Append rows to a Google Sheet.
 * Fails silently (logs error) so it never breaks the main flow.
 * When a single row is appended, returns its sheet row number (1-based) so
 * callers can store it for later updates (status changes, color, etc.).
 */
export async function appendToSheet(
  values: string[][],
  envVars?: { email?: string; privateKey?: string; spreadsheetId?: string },
): Promise<{ ok: boolean; row: number | null }> {
  try {
    const email = envVars?.email ?? process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = (envVars?.privateKey ?? process.env.GOOGLE_PRIVATE_KEY)?.replace(/\\n/g, '\n');
    const spreadsheetId = envVars?.spreadsheetId ?? process.env.GOOGLE_SPREADSHEET_ID;

    if (!email || !privateKey || !spreadsheetId) {
      console.warn('Google Sheets not configured — skipping row append');
      return { ok: false, row: null };
    }

    const token = await getToken(email, privateKey);
    if (!token) {
      console.error('Failed to get Google access token');
      return { ok: false, row: null };
    }

    // Scope the range to A:Q (the 17 columns we write). Using A:Z let Google
    // Sheets include column R (status) in the detected "table", which caused
    // appends to land at column R instead of A whenever any row had a status.
    const range = encodeURIComponent('Sheet1!A:Q');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    });

    if (!response.ok) {
      console.error('Sheets append failed:', response.status, await response.text());
      return { ok: false, row: null };
    }

    const data = (await response.json()) as { updates?: { updatedRange?: string } };
    const row = parseAppendedRow(data.updates?.updatedRange);
    return { ok: true, row };
  } catch (error) {
    console.error('Google Sheets append error:', error);
    return { ok: false, row: null };
  }
}

// Sheets returns updatedRange like "'Sheet1'!A5:Q5" — extract the first row.
function parseAppendedRow(updatedRange: string | undefined): number | null {
  if (!updatedRange) return null;
  const match = updatedRange.match(/[A-Z]+(\d+)(?::[A-Z]+\d+)?$/);
  return match ? parseInt(match[1], 10) : null;
}
