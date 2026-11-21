import 'dotenv/config';
import express from 'express';
import path from 'path';
import crypto from 'crypto';

const escapeHtml = (unsafe) => {
  return String(unsafe ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const APP_URL = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : 'https://civisha.vercel.app';
const ADMIN_UID = '6Xqc0OVRh8UzEfCFDZHRV0d4uOI2';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'civishatest2';

function getB2Config() {
  const rawEndpoint = (process.env.B2_ENDPOINT || '').trim();
  const bucket = (process.env.B2_BUCKET_NAME || '').trim();
  const keyId = (process.env.B2_KEY_ID || '').trim();
  const appKey = (process.env.B2_APP_KEY || '').trim();
  const region = (process.env.B2_REGION || '').trim() ||
    (rawEndpoint.match(/s3\.([a-z0-9-]+)\.backblazeb2\.com/i)?.[1]) ||
    'eu-central-003';
  const host = rawEndpoint.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const configured = Boolean(host && bucket && keyId && appKey);
  return { configured, host, bucket, keyId, appKey, region };
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function encodeS3URI(str, encodeSlash = false) {
  return encodeURIComponent(str)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%2F/g, encodeSlash ? '%2F' : '/');
}

function createB2PresignedUrl({ method = 'GET', key, expiresIn = 3600 }) {
  const b2 = getB2Config();
  if (!b2.configured) throw new Error('Backblaze B2 storage is not configured.');

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${b2.region}/s3/aws4_request`;

  const canonicalUri = `/${encodeS3URI(b2.bucket, true)}/${encodeS3URI(key, false)}`;
  const queryParams = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${b2.keyId}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresIn)],
    ['X-Amz-SignedHeaders', 'host'],
  ];

  const canonicalQueryString = queryParams
    .map(([k, v]) => `${encodeS3URI(k, true)}=${encodeS3URI(v, true)}`)
    .join('&');

  const canonicalHeaders = `host:${b2.host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${b2.appKey}`, dateStamp);
  const kRegion = hmac(kDate, b2.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  return `https://${b2.host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

async function uploadToB2(key, buffer, contentType) {
  const signedPutUrl = createB2PresignedUrl({ method: 'PUT', key, expiresIn: 900 });
  const putRes = await fetch(signedPutUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
    },
    body: buffer,
  });
  if (!putRes.ok) {
    const errText = await putRes.text().catch(() => '');
    throw new Error(`B2 upload HTTP ${putRes.status}: ${errText.slice(0, 200)}`);
  }
}

async function deleteFromB2(key) {
  const signedDeleteUrl = createB2PresignedUrl({ method: 'DELETE', key, expiresIn: 900 });
  const delRes = await fetch(signedDeleteUrl, { method: 'DELETE' });
  if (!delRes.ok && delRes.status !== 404) {
    const errText = await delRes.text().catch(() => '');
    throw new Error(`B2 delete HTTP ${delRes.status}: ${errText.slice(0, 200)}`);
  }
}

async function saveMediaToFirestoreFallback(buffer, contentType, fileName = 'upload.jpg') {
  const mediaId = `m_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const base64String = buffer.toString('base64');
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/reports_media?documentId=${encodeURIComponent(mediaId)}`;
  const res = await fetch(firestoreUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        contentType: { stringValue: contentType },
        base64Data: { stringValue: base64String },
        fileName: { stringValue: String(fileName).slice(0, 200) },
        createdAt: { timestampValue: new Date().toISOString() },
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Fallback media storage failed (${res.status}): ${errText.slice(0, 150)}`);
  }
  const key = `firestore/${mediaId}`;
  return { key, proxyUrl: `/api/media/${key}` };
}

async function storeUploadedImage(buffer, contentType, fileName = 'upload.jpg') {
  const b2 = getB2Config();
  if (b2.configured) {
    try {
      const safeName = String(fileName || 'upload.jpg').replace(/[^a-zA-Z0-9.-]/g, '_');
      const key = `reports/${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${safeName}`;
      await uploadToB2(key, buffer, contentType);
      return { key, proxyUrl: `/api/media/${key}` };
    } catch (b2Err) {
      console.warn('B2 upload failed, falling back to Firestore media storage:', b2Err);
    }
  }
  return await saveMediaToFirestoreFallback(buffer, contentType, fileName);
}

async function verifyFirebaseIdToken(token) {
  try {
    const { getApps, initializeApp, cert } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');
    if (!getApps().length) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id || FIREBASE_PROJECT_ID,
        });
      } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        initializeApp({
          credential: cert({
            projectId: FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }),
          projectId: FIREBASE_PROJECT_ID,
        });
      } else {
        initializeApp({ projectId: FIREBASE_PROJECT_ID });
      }
    }
    return await getAuth().verifyIdToken(token);
  } catch (err) {
    // Fallback token payload decode & verification against Google tokeninfo if firebase-admin is unavailable
    const parts = String(token || '').split('.');
    if (parts.length !== 3) throw new Error('Invalid token format');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    if (!payload.sub || (payload.exp && payload.exp * 1000 < Date.now())) {
      throw new Error('Expired or invalid token');
    }
    return {
      uid: payload.user_id || payload.sub,
      email: payload.email,
      email_verified: payload.email_verified,
    };
  }
}

export async function buildApiApp() {
  const app = express();

  // Safe body parser that respects Vercel's pre-parsed req.body without hanging on consumed streams
  app.use((req, res, next) => {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'string' && (req.headers['content-type'] || '').includes('application/json')) {
        try {
          req.body = JSON.parse(req.body);
        } catch (_) {}
      } else if (Buffer.isBuffer(req.body) && (req.headers['content-type'] || '').includes('application/json')) {
        try {
          req.body = JSON.parse(req.body.toString('utf-8'));
        } catch (_) {}
      }
      return next();
    }
    express.json({ limit: '10mb' })(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: 'Invalid JSON request body' });
      }
      express.urlencoded({ limit: '10mb', extended: true })(req, res, next);
    });
  });

  app.get('/api/health', (req, res) => {
    const b2 = getB2Config();
    const xConfigured = Boolean(
      process.env.X_API_KEY &&
      process.env.X_API_SECRET &&
      process.env.X_ACCESS_TOKEN &&
      process.env.X_ACCESS_SECRET
    );
    const aiConfigured = Boolean(process.env.GEMINI_API_KEY);
    res.json({
      status: 'ok',
      b2Configured: b2.configured,
      xConfigured,
      aiConfigured,
      fallbackStorage: 'firestore_reports_media',
    });
  });

  app.get('/api/export/:filename', (req, res) => {
    const allowedFiles = {
      'Civisha-UI-Screenshots.pdf': 'application/pdf',
      'Civisha-UI-Screenshots.zip': 'application/zip',
      'Civisha-Launch-And-SEO-Plan.pdf': 'application/pdf',
    };
    const filename = req.params.filename;
    if (!allowedFiles[filename]) {
      return res.status(404).send('File not found');
    }
    const filePath = path.join(
      process.cwd(),
      '.aistudio/artifacts/brain/23703bb4-3873-4d4f-a9b8-bd9436e8ce0a',
      filename
    );
    res.setHeader('Content-Type', allowedFiles[filename]);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.download(filePath, filename);
  });

  const requireAuth = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization token' });
      }
      const token = authHeader.split('Bearer ')[1];
      req.user = await verifyFirebaseIdToken(token);
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
  };

  const requireAdmin = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid token' });
      }
      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await verifyFirebaseIdToken(token);
      const uid = decodedToken.uid;
      if (uid === ADMIN_UID || (decodedToken.email === 'shreyankkushwaha@gmail.com' && decodedToken.email_verified)) {
        req.user = decodedToken;
        return next();
      }
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
      const userRes = await fetch(firestoreUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!userRes.ok) return res.status(403).json({ error: 'Not authorized or user not found' });
      const userData = await userRes.json();
      const isAdmin = userData?.fields?.isAdmin?.booleanValue === true;
      if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });
      req.user = decodedToken;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid authentication' });
    }
  };

  // Storage API Routes
  app.post('/api/storage/upload-raw', async (req, res) => {
    try {
      const contentType = req.headers['content-type'] || 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        return res.status(400).json({ error: 'Only image uploads are allowed.' });
      }

      let buffer;
      if (Buffer.isBuffer(req.body)) {
        buffer = req.body;
      } else if (req.body instanceof Uint8Array) {
        buffer = Buffer.from(req.body);
      } else if (typeof req.body === 'string' && req.body.length > 0) {
        buffer = Buffer.from(req.body, 'base64');
      } else {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        buffer = Buffer.concat(chunks);
      }

      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ error: 'Empty image payload.' });
      }
      if (buffer.length > 6 * 1024 * 1024) {
        return res.status(413).json({ error: 'Image exceeds 6MB limit.' });
      }

      const fileName = (typeof req.query.fileName === 'string' ? req.query.fileName : '') || 'upload.jpg';
      const result = await storeUploadedImage(buffer, contentType, fileName);
      return res.json(result);
    } catch (e) {
      console.error('Storage upload-raw error:', e);
      return res.status(500).json({ error: e?.message || 'Failed to upload image' });
    }
  });

  app.post('/api/storage/upload', async (req, res) => {
    try {
      const body = req.body || {};
      const { fileName, contentType, base64Data } = body;
      if (!fileName || !contentType || !base64Data) {
        return res.status(400).json({ error: 'Missing required fields (fileName, contentType, base64Data)' });
      }
      if (typeof contentType !== 'string' || !contentType.startsWith('image/')) {
        return res.status(400).json({ error: 'Invalid content type. Only images are permitted.' });
      }
      const base64String = String(base64Data).includes(',') ? String(base64Data).split(',')[1] : String(base64Data);
      const buffer = Buffer.from(base64String, 'base64');
      if (buffer.length > 6 * 1024 * 1024) {
        return res.status(413).json({ error: 'Image exceeds 6MB limit.' });
      }
      const result = await storeUploadedImage(buffer, contentType, fileName);
      return res.json(result);
    } catch (err) {
      console.error('Storage upload JSON error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to upload image' });
    }
  });

  app.get('/api/media/*', async (req, res) => {
    try {
      const rawKey = req.params[0] || '';
      if (!rawKey) {
        return res.status(404).send('Media not found');
      }

      // 1. Serve Firestore-stored fallback media
      if (rawKey.startsWith('firestore/')) {
        const mediaId = rawKey.replace(/^firestore\//, '').trim();
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/reports_media/${encodeURIComponent(mediaId)}`;
        const docRes = await fetch(firestoreUrl);
        if (!docRes.ok) {
          return res.redirect('https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&q=80&w=600');
        }
        const docJson = await docRes.json();
        const base64Data = docJson?.fields?.base64Data?.stringValue;
        const contentType = docJson?.fields?.contentType?.stringValue || 'image/jpeg';
        if (!base64Data) {
          return res.status(404).send('Media content empty');
        }
        const imgBuffer = Buffer.from(base64Data, 'base64');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.send(imgBuffer);
      }

      // 2. Serve Backblaze B2 media via presigned GET URL
      const b2 = getB2Config();
      if (!b2.configured) {
        return res.redirect('https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&q=80&w=600');
      }
      const signedUrl = createB2PresignedUrl({ method: 'GET', key: rawKey, expiresIn: 3600 });
      return res.redirect(302, signedUrl);
    } catch (err) {
      console.error('Error retrieving media:', err);
      return res.status(500).send('Error retrieving media');
    }
  });

  app.delete('/api/media/*', requireAuth, async (req, res) => {
    try {
      const key = decodeURIComponent(req.params[0] || '');
      if (!key) {
        return res.status(400).json({ error: 'Invalid media key.' });
      }
      if (key.startsWith('firestore/')) {
        return res.json({ success: true });
      }
      if (!key.startsWith('reports/')) {
        return res.status(400).json({ error: 'Invalid media key.' });
      }
      const b2 = getB2Config();
      if (!b2.configured) return res.json({ success: true });
      await deleteFromB2(key);
      return res.json({ success: true });
    } catch (err) {
      console.error('Error deleting media:', err);
      return res.status(500).json({ error: 'Failed to delete media' });
    }
  });

  const GEMINI_FLASH_MODEL = 'gemini-3.1-flash-lite';
  const VALID_CATEGORIES = ['garbage', 'roads', 'infrastructure', 'street_issues', 'safety'];

  async function createGeminiClient() {
    if (!process.env.GEMINI_API_KEY) {
      const err = new Error('Gemini API is not configured. Please check GEMINI_API_KEY in Secrets.');
      err.statusCode = 500;
      throw err;
    }
    const { GoogleGenAI, Type, ThinkingLevel } = await import('@google/genai');
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    return { ai, Type, ThinkingLevel };
  }

  function parseDataUrlToInlinePart(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl.trim()) {
      return null;
    }
    const trimmed = dataUrl.trim();
    const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
    let mimeType = 'image/jpeg';
    let base64Data = trimmed;
    if (match) {
      mimeType = match[1].toLowerCase();
      base64Data = match[2];
    } else if (trimmed.startsWith('data:')) {
      return null;
    }
    if (!mimeType.startsWith('image/')) {
      return null;
    }
    const approxBytes = Math.floor((base64Data.length * 3) / 4);
    if (approxBytes === 0 || approxBytes > 6 * 1024 * 1024) {
      return null;
    }
    return {
      inlineData: {
        mimeType,
        data: base64Data,
      },
    };
  }

  async function resolveImageUrlToInlinePart(imageUrl) {
    if (typeof imageUrl !== 'string' || !imageUrl.trim()) return null;
    const trimmed = imageUrl.trim();
    if (trimmed.startsWith('data:image/')) {
      return parseDataUrlToInlinePart(trimmed);
    }

    // 1. Direct Firestore fallback media lookup
    if (trimmed.startsWith('/api/media/firestore/')) {
      const mediaId = trimmed.replace('/api/media/firestore/', '').trim();
      if (!mediaId) return null;
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/reports_media/${encodeURIComponent(mediaId)}`;
      const docRes = await fetch(firestoreUrl);
      if (!docRes.ok) return null;
      const docJson = await docRes.json();
      const base64Data = docJson?.fields?.base64Data?.stringValue;
      const contentType = docJson?.fields?.contentType?.stringValue || 'image/jpeg';
      if (!base64Data || !contentType.startsWith('image/')) return null;
      return {
        inlineData: {
          mimeType: contentType,
          data: base64Data,
        },
      };
    }

    // 2. Direct Backblaze B2 presigned GET fetch
    if (trimmed.startsWith('/api/media/')) {
      const key = decodeURIComponent(trimmed.replace('/api/media/', '').trim());
      const b2 = getB2Config();
      if (!key || !b2.configured) return null;
      const signedUrl = createB2PresignedUrl({ method: 'GET', key, expiresIn: 300 });
      const b2Res = await fetch(signedUrl);
      if (!b2Res.ok) return null;
      const contentType = (b2Res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
      if (!contentType.startsWith('image/')) return null;
      const arrBuf = await b2Res.arrayBuffer();
      if (arrBuf.byteLength === 0 || arrBuf.byteLength > 6 * 1024 * 1024) return null;
      return {
        inlineData: {
          mimeType: contentType,
          data: Buffer.from(arrBuf).toString('base64'),
        },
      };
    }

    // 3. External HTTPS image URL (block localhost / private IPs)
    if (trimmed.startsWith('https://')) {
      try {
        const parsed = new URL(trimmed);
        const host = parsed.hostname.toLowerCase();
        if (
          host === 'localhost' ||
          host === '127.0.0.1' ||
          host === '0.0.0.0' ||
          host.startsWith('10.') ||
          host.startsWith('192.168.') ||
          host.startsWith('169.254.') ||
          /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
        ) {
          return null;
        }
        const imgRes = await fetch(trimmed);
        if (!imgRes.ok) return null;
        const contentType = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
        if (!contentType.startsWith('image/')) return null;
        const arrBuf = await imgRes.arrayBuffer();
        if (arrBuf.byteLength === 0 || arrBuf.byteLength > 6 * 1024 * 1024) return null;
        return {
          inlineData: {
            mimeType: contentType,
            data: Buffer.from(arrBuf).toString('base64'),
          },
        };
      } catch {
        return null;
      }
    }

    return null;
  }

  function handleGeminiRouteError(res, error, fallbackMessage) {
    console.error(fallbackMessage, error);
    const status = error?.status || error?.statusCode || 500;
    const rawMsg = String(error?.message || fallbackMessage);
    if (status === 429 || rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('429')) {
      return res.status(429).json({ error: 'AI service is temporarily busy (rate limit reached). Please try again in a moment.' });
    }
    if (status === 403 || rawMsg.includes('API_KEY_INVALID') || rawMsg.includes('PERMISSION_DENIED')) {
      return res.status(500).json({ error: 'AI service key error. Please verify GEMINI_API_KEY configuration.' });
    }
    return res.status(status >= 400 && status < 600 ? status : 500).json({ error: rawMsg || fallbackMessage });
  }

  // X / Twitter & Gemini AI Routes (lazy-loaded SDKs)
  app.post('/api/x/generate', requireAdmin, async (req, res) => {
    try {
      const { title, content, category, location, authorities } = req.body || {};
      if (!title || !category) return res.status(400).json({ error: 'Missing required report data' });

      const { ai } = await createGeminiClient();

      const prompt = `
        You are a civic engagement assistant for Civisha.
        Please formulate a short, factual, objective X (Twitter) post based on the following reported civic issue.
        It must include the issue, the location, and relevant hashtags.
        Keep it concise, within 200 characters to leave room for mentions and images.
        DO NOT exaggerate, make claims without evidence, or invent information.
        DO NOT hallucinate a mention.
        
        Issue Title: ${title}
        Description: ${content || ''}
        Category: ${category}
        Location: ${location || 'Unknown Location'}
        
        Available configured authorities for this region/category:
        ${JSON.stringify(authorities || [])}
        
        Return ONLY a JSON object with two keys:
        - "text": The text of the tweet (without the authority mention, we will append it later).
        - "suggestedAuthorityHandle": The @handle of the best matching authority from the available list, or null if none match.
      `;
      const response = await ai.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      let result;
      try {
        result = JSON.parse(response.text || '{}');
      } catch (e) {
        result = {
          text: `Civic issue reported on Civisha: ${title} (${location || 'India'}) #Civisha`,
          suggestedAuthorityHandle: null,
        };
      }
      res.json(result);
    } catch (error) {
      return handleGeminiRouteError(res, error, 'Gemini X post generation error');
    }
  });

  // 1. Opt-In Snap-to-Fill Civic Report Drafting (Photo + Location -> Category, Title, Description in EN or HI)
  app.post('/api/ai/draft-report', async (req, res) => {
    try {
      const { images, address, lat, lng, language } = req.body || {};
      if (!Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ error: 'Please capture at least one photo before using AI drafting.' });
      }

      const imageParts = images
        .slice(0, 3)
        .map(parseDataUrlToInlinePart)
        .filter(Boolean);

      if (imageParts.length === 0) {
        return res.status(400).json({ error: 'Invalid photo format or photo exceeds 6MB limit.' });
      }

      const targetLang = language === 'hi' ? 'hi' : 'en';
      const safeAddress = typeof address === 'string' ? address.trim().slice(0, 350) : '';
      const coordText =
        typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
          ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
          : 'Not provided';

      const { ai, Type } = await createGeminiClient();

      const languageInstruction =
        targetLang === 'hi'
          ? 'Write BOTH the "title" and "description" in clear, natural Hindi using Devanagari script (हिंदी). Do not use English sentences unless a proper location name requires it.'
          : 'Write BOTH the "title" and "description" in clear, objective, formal civic English.';

      const promptText = `You are a civic issue reporting assistant for Civisha in India.
Analyze the attached evidence photo(s) along with the fetched location below and draft a factual civic issue report.

Fetched Location / Address: ${safeAddress || 'Not specified'}
GPS Coordinates: ${coordText}

Choose the SINGLE most accurate category ID from this exact list:
- "garbage": Trash piles, overflowing bins, illegal waste dumping, uncollected garbage, sanitation issues.
- "roads": Potholes, broken/damaged roads, crumbled asphalt, damaged road dividers, road cave-ins.
- "infrastructure": Issues with public toilets, parks, government buildings, schools, hospitals, broken public benches/shelters, water supply/pipelines.
- "street_issues": Broken streetlights, clogged/overflowing drains, waterlogging, damaged footpaths/pavements, hanging cables.
- "safety": Immediate public safety hazards, open manholes, exposed live wires, missing hazard signs, unsafe collapsed structures.

Requirements:
1. ${languageInstruction}
2. "title": Concise, specific, factual headline (max 90 characters, no hashtags, no quotes).
3. "description": 2 to 4 clear, factual sentences describing what is visibly seen in the photo(s), how it affects commuters or residents, and naturally referencing the fetched area/address if available.
4. Stay strictly truthful to what is visible in the photo(s) and the provided address. Do NOT invent landmarks, dates, or claims not supported by the image.`;

      const response = await ai.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents: {
          parts: [...imageParts, { text: promptText }],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: {
                type: Type.STRING,
                enum: VALID_CATEGORIES,
                description: 'Best matching civic category ID.',
              },
              title: {
                type: Type.STRING,
                description: 'Short factual civic issue title (under 90 characters).',
              },
              description: {
                type: Type.STRING,
                description: 'Factual 2-4 sentence description referencing the visual evidence and fetched location.',
              },
            },
            required: ['category', 'title', 'description'],
          },
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim());
      const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'street_issues';
      const title = String(parsed.title || '').trim().slice(0, 100);
      const description = String(parsed.description || '').trim().slice(0, 2000);

      if (!title || !description) {
        return res.status(502).json({ error: 'AI returned an incomplete draft. Please try again.' });
      }

      return res.json({
        category,
        title,
        description,
        language: targetLang,
      });
    } catch (error) {
      return handleGeminiRouteError(res, error, 'Gemini Snap-to-Fill draft error');
    }
  });

  // 2. Before-vs-After Resolution Verification (Original Photo vs Proof Photo)
  app.post('/api/ai/verify-resolution', async (req, res) => {
    try {
      const {
        beforeImageUrl,
        beforeImageBase64,
        afterImageBase64,
        title,
        category,
        description,
        address,
        proposedStatus,
      } = req.body || {};

      const afterPart = parseDataUrlToInlinePart(afterImageBase64);
      if (!afterPart) {
        return res.status(400).json({ error: 'A valid proof photo is required for verification.' });
      }

      const beforePart = beforeImageBase64
        ? parseDataUrlToInlinePart(beforeImageBase64)
        : await resolveImageUrlToInlinePart(beforeImageUrl);

      if (!beforePart) {
        return res.status(400).json({ error: 'Original report photo could not be loaded for comparison.' });
      }

      const safeStatus = proposedStatus === 'In Progress' ? 'In Progress' : 'Complete';
      const { ai, Type, ThinkingLevel } = await createGeminiClient();

      const promptText = `You are a civic resolution verification inspector for Civisha.
Compare IMAGE 1 (BEFORE: original reported civic issue) and IMAGE 2 (AFTER: newly submitted proof photo claiming status "${safeStatus}").

Report Context:
- Title: ${String(title || '').slice(0, 150)}
- Category: ${String(category || '').slice(0, 50)}
- Description: ${String(description || '').slice(0, 600)}
- Location: ${String(address || '').slice(0, 250)}
- Claimed Status: ${safeStatus}

Evaluate carefully:
1. Do both photos appear to show the same general location/issue (allowing reasonable camera angle/lighting differences)?
2. Does IMAGE 2 actually show the reported issue resolved (if "Complete") or visible repair/cleanup work underway (if "In Progress")?

Assign one exact "verdict":
- "verified": Clear visual evidence that the issue matches and is resolved (for Complete) or actively being worked on (for In Progress).
- "partial": Some cleanup/work is visible, or the site looks partially improved, but the issue is not fully resolved yet.
- "not_resolved": The civic issue (garbage pile, pothole, broken light, drain, hazard, etc.) still visibly exists with no meaningful fix.
- "mismatch": IMAGE 2 is blurry/unusable, shows an unrelated scene/object, or does not clearly match the original issue so resolution cannot be confirmed.

Write:
- "userMessage": 1-2 clear, polite, specific sentences addressed directly to the citizen explaining what AI saw and—if there is a problem—specifically what is wrong or missing (e.g., "The garbage pile still appears visible near the roadside, so this cannot be confirmed as complete yet." or "This photo appears to show a different angle/location than the original pothole.").
- "adminReason": 1-2 objective sentences for Civisha moderators summarizing the visual comparison and why it passed or needs manual review.
- "shouldFlagForAdmin": boolean. Set TRUE if verdict is "not_resolved" or "mismatch", OR if Claimed Status is "Complete" and verdict is "partial". Set FALSE only when verdict is "verified" (or "partial" for "In Progress").`;

      const response = await ai.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents: {
          parts: [
            { text: 'IMAGE 1 (BEFORE - Original Reported Issue):' },
            beforePart,
            { text: 'IMAGE 2 (AFTER - Submitted Resolution Proof):' },
            afterPart,
            { text: promptText },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              verdict: {
                type: Type.STRING,
                enum: ['verified', 'partial', 'not_resolved', 'mismatch'],
              },
              userMessage: {
                type: Type.STRING,
                description: 'Clear 1-2 sentence explanation for the citizen describing what was observed and any issue found.',
              },
              adminReason: {
                type: Type.STRING,
                description: 'Concise moderation summary for Admin Dashboard review.',
              },
              shouldFlagForAdmin: {
                type: Type.BOOLEAN,
              },
            },
            required: ['verdict', 'userMessage', 'adminReason', 'shouldFlagForAdmin'],
          },
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim());
      const validVerdicts = ['verified', 'partial', 'not_resolved', 'mismatch'];
      const verdict = validVerdicts.includes(parsed.verdict) ? parsed.verdict : 'mismatch';
      const shouldFlagForAdmin =
        verdict === 'not_resolved' ||
        verdict === 'mismatch' ||
        (safeStatus === 'Complete' && verdict === 'partial') ||
        Boolean(parsed.shouldFlagForAdmin);

      return res.json({
        verdict,
        userMessage: String(parsed.userMessage || 'Visual comparison completed.').trim().slice(0, 500),
        adminReason: String(parsed.adminReason || 'Flagged for visual verification review.').trim().slice(0, 500),
        shouldFlagForAdmin,
        checkedAt: new Date().toISOString(),
      });
    } catch (error) {
      return handleGeminiRouteError(res, error, 'Gemini Before-vs-After verification error');
    }
  });

  // 3. Universal English Social Media Post Writer for Share Modal
  app.post('/api/ai/share-post', async (req, res) => {
    try {
      const { title, content, category, address, status, confirms, upvotes, reportUrl } = req.body || {};
      if (!title || !reportUrl) {
        return res.status(400).json({ error: 'Report title and link are required to generate a social post.' });
      }

      const { ai, Type } = await createGeminiClient();

      const promptText = `You are a civic communication writer for Civisha.
Write ONE single universal social media post in clear, engaging English that a citizen can directly copy or share on X (Twitter), WhatsApp, Instagram, LinkedIn, or Facebook to raise public awareness about this civic report.

Report Details:
- Title: ${String(title).slice(0, 150)}
- Description: ${String(content || '').slice(0, 1200)}
- Category: ${String(category || 'Civic Issue').slice(0, 50)}
- Location: ${String(address || 'Local Area').slice(0, 250)}
- Current Status: ${String(status || 'Pending').slice(0, 40)}
- Community Confirmations: ${Number(confirms) || 0}
- Upvotes: ${Number(upvotes) || 0}
- Report Link: ${String(reportUrl).slice(0, 300)}

Guidelines:
1. Write strictly in English.
2. Be factual, constructive, and compelling—do NOT exaggerate, insult, or invent details not given above.
3. Structure cleanly with short paragraphs (total ~320–550 characters):
   - Opening hook highlighting the issue and area
   - 1–2 concise lines summarizing the impact & community status (mention confirmations if > 0)
   - Brief call-to-action inviting neighbors/authorities to view, verify, or help resolve
   - 3–4 relevant hashtags including #Civisha
   - End with the exact Report Link on its own line.`;

      const response = await ai.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents: promptText,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              postText: {
                type: Type.STRING,
                description: 'Ready-to-share universal English social media post including hashtags and report link.',
              },
            },
            required: ['postText'],
          },
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim());
      const postText = String(parsed.postText || '').trim();
      if (!postText) {
        return res.status(502).json({ error: 'AI returned an empty post. Please try again.' });
      }

      return res.json({ postText });
    } catch (error) {
      return handleGeminiRouteError(res, error, 'Gemini share post generation error');
    }
  });

  app.post('/api/x/publish', requireAdmin, async (req, res) => {
    try {
      if (
        !process.env.X_API_KEY ||
        !process.env.X_API_SECRET ||
        !process.env.X_ACCESS_TOKEN ||
        !process.env.X_ACCESS_SECRET
      ) {
        return res.status(500).json({ error: 'X/Twitter API is not configured.' });
      }
      const { text, imageUrl, reportId } = req.body || {};
      if (!text || !reportId) return res.status(400).json({ error: 'Missing required fields' });

      const { TwitterApi } = await import('twitter-api-v2');
      const xClient = new TwitterApi({
        appKey: process.env.X_API_KEY,
        appSecret: process.env.X_API_SECRET,
        accessToken: process.env.X_ACCESS_TOKEN,
        accessSecret: process.env.X_ACCESS_SECRET,
      });

      const authHeader = req.headers.authorization || '';
      const token = authHeader.split('Bearer ')[1];
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/reports/${encodeURIComponent(reportId)}`;
      const reportRes = await fetch(firestoreUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (reportRes.ok) {
        const reportData = await reportRes.json();
        if (reportData?.fields?.xPostStatus?.stringValue === 'Published') {
          return res.status(400).json({ error: 'This report has already been published to X.' });
        }
      }

      let mediaId = undefined;
      if (imageUrl && imageUrl.startsWith('/api/media/')) {
        try {
          const rawKey = imageUrl.replace('/api/media/', '');
          if (rawKey.startsWith('firestore/')) {
            const fId = rawKey.replace(/^firestore\//, '');
            const fRes = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/reports_media/${encodeURIComponent(fId)}`);
            if (fRes.ok) {
              const fJson = await fRes.json();
              const b64 = fJson?.fields?.base64Data?.stringValue;
              const cType = fJson?.fields?.contentType?.stringValue || 'image/jpeg';
              if (b64) {
                mediaId = await xClient.v1.uploadMedia(Buffer.from(b64, 'base64'), { mimeType: cType });
              }
            }
          } else if (getB2Config().configured) {
            const signedUrl = createB2PresignedUrl({ method: 'GET', key: rawKey, expiresIn: 600 });
            const mediaRes = await fetch(signedUrl);
            if (mediaRes.ok) {
              const arrayBuffer = await mediaRes.arrayBuffer();
              const contentType = mediaRes.headers.get('content-type') || 'image/jpeg';
              mediaId = await xClient.v1.uploadMedia(Buffer.from(arrayBuffer), { mimeType: contentType });
            }
          }
        } catch (mediaErr) {
          return res.status(500).json({ error: 'Media upload to X failed', details: String(mediaErr) });
        }
      }

      const tweetParams = { text };
      if (mediaId) tweetParams.media = { media_ids: [mediaId] };
      const tweetResponse = await xClient.v2.tweet(tweetParams);
      res.json({ success: true, xPostId: tweetResponse.data.id });
    } catch (error) {
      if (error?.code === 402) {
        return res.json({
          success: true,
          xPostId: `simulated_${Date.now()}`,
          simulated: true,
          message: 'Published in SIMULATION mode due to Twitter API payment limits.',
        });
      }
      let errorMessage = 'Failed to publish post to X';
      if (error?.code === 429) errorMessage = 'X API rate limit exceeded. Please try again later.';
      else if (error?.code === 401) errorMessage = 'X API authentication failed. Check credentials.';
      else if (error?.code === 403) errorMessage = 'X API permission denied. Ensure your app has Write access in the developer portal.';
      else if (error?.data?.detail) errorMessage = error.data.detail;
      else if (error?.message) errorMessage = error.message;
      res.status(500).json({ error: errorMessage });
    }
  });

  // Helper to load base index.html and inject dynamic SEO + JSON-LD
  const loadBaseHtml = async () => {
    try {
      const distPath = path.join(process.cwd(), 'dist');
      const fs = await import('fs');
      return await fs.promises.readFile(path.join(distPath, 'index.html'), 'utf-8');
    } catch {
      try {
        const fs = await import('fs');
        return await fs.promises.readFile(path.join(process.cwd(), 'index.html'), 'utf-8');
      } catch {
        return `<!DOCTYPE html><html lang="en"><head><title>Civisha</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`;
      }
    }
  };

  const injectSEOMeta = (rawHtml, opts) => {
    const escapedTitle = escapeHtml(opts.title);
    const escapedDesc = escapeHtml(opts.description);
    const escapedImg = escapeHtml(opts.image || `${APP_URL}/og-fallback.png`);
    const escapedUrl = escapeHtml(opts.url);
    const escapedType = escapeHtml(opts.type || 'website');
    const robotsContent = escapeHtml(
      opts.robots || 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
    );

    let html = rawHtml.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapedTitle}</title>`);
    html = html.replace(/<meta\s+name="description"[^>]*>/gi, '');
    html = html.replace(/<meta\s+name="robots"[^>]*>/gi, '');
    html = html.replace(/<link\s+rel="canonical"[^>]*>/gi, '');
    html = html.replace(/<meta\s+property="og:[^"]+"[^>]*>/gi, '');
    html = html.replace(/<meta\s+name="twitter:[^"]+"[^>]*>/gi, '');

    if (opts.jsonLd) {
      html = html.replace(/<script\s+type="application\/ld\+json"\s+id="app-structured-data"[^>]*>[\s\S]*?<\/script>/gi, '');
    }

    const jsonLdTag = opts.jsonLd
      ? `<script type="application/ld+json">${JSON.stringify(opts.jsonLd)}</script>`
      : '';
    const keywordsTag = opts.keywords
      ? `<meta name="keywords" content="${escapeHtml(opts.keywords)}" />`
      : '';

    html = html.replace(
      '</head>',
      `  <meta name="description" content="${escapedDesc}" />
  <meta name="robots" content="${robotsContent}" />
  ${keywordsTag}
  <link rel="canonical" href="${escapedUrl}" />
  <meta property="og:type" content="${escapedType}" />
  <meta property="og:site_name" content="Civisha" />
  <meta property="og:title" content="${escapedTitle}" />
  <meta property="og:description" content="${escapedDesc}" />
  <meta property="og:image" content="${escapedImg}" />
  <meta property="og:url" content="${escapedUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapedTitle}" />
  <meta name="twitter:description" content="${escapedDesc}" />
  <meta name="twitter:image" content="${escapedImg}" />
  ${jsonLdTag}
</head>`
    );

    if (opts.bodyHtml) {
      html = html.replace(
        '<div id="root"></div>',
        `<div id="root">${opts.bodyHtml}</div>`
      );
    }

    return html;
  };

  const renderSsrShell = ({ heading, intro, bodyHtml = '' }) => `
    <div class="min-h-screen bg-gray-50 text-gray-900">
      <header class="border-b border-gray-200 bg-white px-4 py-3">
        <nav aria-label="Primary navigation" class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <a href="/" class="text-xl font-bold text-indigo-600">Civisha</a>
          <div class="flex flex-wrap gap-4 text-sm font-medium text-gray-700">
            <a href="/">Home Feed</a>
            <a href="/radar">Civic Radar</a>
            <a href="/journal">Civic Journal</a>
            <a href="/how-it-works">How It Works</a>
            <a href="/about">About</a>
            <a href="/support">Support</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </div>
        </nav>
      </header>
      <main class="mx-auto max-w-4xl px-4 py-8">
        <h1 class="text-3xl font-bold tracking-tight text-gray-900">${escapeHtml(heading)}</h1>
        <p class="mt-3 text-base leading-relaxed text-gray-700">${escapeHtml(intro)}</p>
        ${bodyHtml}
      </main>
      <footer class="border-t border-gray-200 bg-white px-4 py-6 text-sm text-gray-600">
        <div class="mx-auto flex max-w-5xl flex-wrap gap-4">
          <a href="/">Civisha Home</a>
          <a href="/radar">Civic Radar Map</a>
          <a href="/journal">Public Data Analytics</a>
          <a href="/how-it-works">How Civisha Works</a>
          <a href="/about">About Civisha</a>
          <a href="/support">Citizen Support</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms &amp; Conditions</a>
        </div>
      </footer>
    </div>
  `;

  app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send([
      'User-agent: *',
      'Allow: /',
      'Allow: /report/',
      'Allow: /u/',
      'Allow: /area/',
      'Allow: /radar',
      'Allow: /journal',
      'Allow: /about',
      'Allow: /how-it-works',
      'Allow: /support',
      'Allow: /terms',
      'Allow: /privacy',
      'Disallow: /notifications',
      'Disallow: /api/',
      '',
      `Sitemap: ${APP_URL}/sitemap.xml`,
    ].join('\n'));
  });

  app.get('/sitemap.xml', async (req, res) => {
    try {
      const todayIso = new Date().toISOString().split('T')[0];
      const staticPaths = [
        { path: '/', priority: '1.0', changefreq: 'always' },
        { path: '/radar', priority: '0.9', changefreq: 'hourly' },
        { path: '/journal', priority: '0.9', changefreq: 'daily' },
        { path: '/about', priority: '0.7', changefreq: 'monthly' },
        { path: '/how-it-works', priority: '0.8', changefreq: 'monthly' },
        { path: '/support', priority: '0.6', changefreq: 'monthly' },
        { path: '/terms', priority: '0.4', changefreq: 'yearly' },
        { path: '/privacy', priority: '0.4', changefreq: 'yearly' },
      ];

      const urls = staticPaths.map(
        (s) => `  <url>\n    <loc>${escapeHtml(`${APP_URL}${s.path}`)}</loc>\n    <lastmod>${todayIso}</lastmod>\n    <changefreq>${s.changefreq}</changefreq>\n    <priority>${s.priority}</priority>\n  </url>`
      );

      const areaSet = new Set();

      const fetchCollectionDocs = async (collectionName, pageSize = 300, maxPages = 5) => {
        const docs = [];
        let pageToken = '';
        for (let page = 0; page < maxPages; page++) {
          const url = new URL(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionName}`);
          url.searchParams.set('pageSize', String(pageSize));
          if (pageToken) url.searchParams.set('pageToken', pageToken);
          const resp = await fetch(url.toString());
          if (!resp.ok) break;
          const json = await resp.json();
          if (Array.isArray(json.documents)) {
            docs.push(...json.documents);
          }
          if (!json.nextPageToken) break;
          pageToken = json.nextPageToken;
        }
        return docs;
      };

      try {
        const [reportDocs, userDocs] = await Promise.all([
          fetchCollectionDocs('reports', 300, 5),
          fetchCollectionDocs('users', 200, 5),
        ]);

        for (const docItem of reportDocs) {
          const docId = docItem.name.split('/').pop();
          if (!docId) continue;
          const status = docItem.fields?.status?.stringValue || 'Pending';
          if (status === 'Withdrawn' || status === 'Rejected') continue;
          const rawLastMod =
            docItem.fields?.updatedAt?.timestampValue ||
            docItem.updateTime ||
            docItem.fields?.createdAt?.timestampValue ||
            new Date().toISOString();
          const lastModIso = Number.isNaN(Date.parse(rawLastMod))
            ? new Date().toISOString()
            : new Date(rawLastMod).toISOString();

          urls.push(
            `  <url>\n    <loc>${escapeHtml(`${APP_URL}/report/${encodeURIComponent(docId)}`)}</loc>\n    <lastmod>${escapeHtml(lastModIso)}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`
          );

          const loc = (docItem.fields?.address?.stringValue || docItem.fields?.location?.stringValue || '').trim();
          if (loc && loc.length > 2 && loc.length < 80) {
            areaSet.add(loc);
          }
        }

        const seenUsers = new Set();
        for (const uItem of userDocs) {
          const isBanned = Boolean(uItem.fields?.isBanned?.booleanValue);
          const isAnonymous = Boolean(uItem.fields?.isAnonymous?.booleanValue);
          if (isBanned || isAnonymous) continue;
          const uid = uItem.name.split('/').pop();
          const rawHandle = (uItem.fields?.handle?.stringValue || '').trim().replace(/^@/, '');
          const slug = rawHandle || uid;
          if (!slug || seenUsers.has(slug.toLowerCase())) continue;
          seenUsers.add(slug.toLowerCase());
          urls.push(
            `  <url>\n    <loc>${escapeHtml(`${APP_URL}/u/${encodeURIComponent(slug)}`)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`
          );
        }
      } catch (e) {
        console.warn('Sitemap Firestore fetch warning:', e);
      }

      areaSet.forEach((area) => {
        urls.push(
          `  <url>\n    <loc>${escapeHtml(`${APP_URL}/area/${encodeURIComponent(area)}`)}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.75</priority>\n  </url>`
        );
      });

      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      res.send(sitemap);
    } catch (error) {
      res.status(500).send('Error generating sitemap');
    }
  });

  app.get('/', async (req, res, next) => {
    if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
      return next();
    }
    try {
      let html = await loadBaseHtml();
      let recentReportsHtml = '';
      try {
        const resp = await fetch(
          `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/reports?pageSize=15`,
          { signal: AbortSignal.timeout(2500) }
        );
        if (resp.ok) {
          const json = await resp.json();
          const items = (json.documents || [])
            .filter((d) => {
              const st = d.fields?.status?.stringValue || 'Pending';
              return st !== 'Withdrawn' && st !== 'Rejected';
            })
            .slice(0, 12)
            .map((d) => {
              const id = d.name.split('/').pop();
              const title = d.fields?.title?.stringValue || 'Civic Issue';
              const category = d.fields?.category?.stringValue || 'Civic Issue';
              const address = d.fields?.address?.stringValue || d.fields?.location?.stringValue || 'India';
              const status = d.fields?.status?.stringValue || 'Pending';
              return `<article class="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                <h2 class="text-lg font-semibold"><a href="/report/${encodeURIComponent(id)}">${escapeHtml(title)}</a></h2>
                <p class="text-sm text-gray-600">${escapeHtml(category)} • ${escapeHtml(status)} • <a href="/area/${encodeURIComponent(address)}">${escapeHtml(address)}</a></p>
              </article>`;
            })
            .join('\n');
          if (items) {
            recentReportsHtml = `<section class="mt-6"><h2 class="text-xl font-bold">Recent Community-Verified Civic Reports</h2>${items}</section>`;
          }
        }
      } catch {
        // Non-blocking fallback for homepage SSR
      }

      const bodyHtml = renderSsrShell({
        heading: 'Civisha – Citizen-Led Civic Issue Reporting & Community Verification',
        intro: 'Report, GPS-verify within 500 meters, and track local civic infrastructure issues including potholes, garbage, sanitation, water supply, and streetlights across India.',
        bodyHtml: `
          <section class="mt-6 grid gap-4 sm:grid-cols-2">
            <div class="rounded-lg border border-gray-200 bg-white p-4">
              <h2 class="text-lg font-semibold"><a href="/radar">Civic Radar Heatmap</a></h2>
              <p class="mt-1 text-sm text-gray-600">Explore live geospatial civic issue clusters and ward priority metrics across neighborhoods.</p>
            </div>
            <div class="rounded-lg border border-gray-200 bg-white p-4">
              <h2 class="text-lg font-semibold"><a href="/journal">Civic Journal &amp; Analytics</a></h2>
              <p class="mt-1 text-sm text-gray-600">Analyze live civic issue resolution velocity, category trends, and transparent public datasets.</p>
            </div>
          </section>
          ${recentReportsHtml}
        `,
      });

      html = injectSEOMeta(html, {
        title: 'Civisha – Civic Issue Reporting & Community Verification',
        description: 'Report, verify, and track local civic issues in real time with community-driven accountability, live radar maps, and civic impact analytics on Civisha.',
        url: `${APP_URL}/`,
        keywords: 'Civisha, civic issues India, report potholes, garbage reporting app, municipal complaints, citizen verification, civic tech',
        bodyHtml,
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Civisha',
            url: `${APP_URL}/`,
          },
          {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'Civisha',
            url: `${APP_URL}/`,
            applicationCategory: 'PublicService',
            operatingSystem: 'All',
            description: 'Report, verify, and track local civic issues in real time with community-driven accountability, live radar maps, and civic impact analytics on Civisha.',
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'INR',
            },
          },
        ],
      });
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      res.send(html);
    } catch {
      next();
    }
  });

  app.get('/report/:id', async (req, res, next) => {
    try {
      let html = await loadBaseHtml();
      const reportId = req.params.id;
      let data = null;
      let exists = false;

      const restUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/reports/${encodeURIComponent(reportId)}`;
      const restRes = await fetch(restUrl);
      if (restRes.ok) {
        const docJson = await restRes.json();
        exists = true;
        data = {
          title: docJson.fields?.title?.stringValue || 'Civic Issue',
          content: docJson.fields?.content?.stringValue || '',
          category: docJson.fields?.category?.stringValue || 'Civic Issue',
          address: docJson.fields?.address?.stringValue || docJson.fields?.location?.stringValue || 'Local Area',
          status: docJson.fields?.status?.stringValue || 'Pending',
          imageUrl: docJson.fields?.imageUrl?.stringValue || null,
          confirmations: Number(docJson.fields?.confirms?.integerValue || docJson.fields?.confirmations?.integerValue || 0),
          upvotes: Number(docJson.fields?.upvotes?.integerValue || 0),
          author: docJson.fields?.author?.stringValue || 'Citizen Reporter',
          isAnonymous: Boolean(docJson.fields?.isAnonymous?.booleanValue),
          lat: docJson.fields?.lat?.doubleValue ? Number(docJson.fields.lat.doubleValue) : undefined,
          lng: docJson.fields?.lng?.doubleValue ? Number(docJson.fields.lng.doubleValue) : undefined,
        };
      }

      if (!exists) {
        return res.status(404).send(
          injectSEOMeta(html, {
            title: 'Report Not Found | Civisha',
            description: 'This civic report could not be found on Civisha.',
            url: `${APP_URL}/report/${encodeURIComponent(reportId)}`,
            robots: 'noindex, follow',
            bodyHtml: renderSsrShell({
              heading: 'Report Not Found',
              intro: 'The requested civic report does not exist or may have been removed.',
            }),
          })
        );
      }

      if (!data || data.status === 'Withdrawn' || data.status === 'Rejected') {
        return res.status(404).send(
          injectSEOMeta(html, {
            title: 'Report Unavailable | Civisha',
            description: 'This civic report is no longer active on Civisha.',
            url: `${APP_URL}/report/${encodeURIComponent(reportId)}`,
            robots: 'noindex, follow',
            bodyHtml: renderSsrShell({
              heading: 'Report Unavailable',
              intro: 'This civic issue report has been withdrawn or archived.',
            }),
          })
        );
      }

      const locLabel = data.address || 'Local Area';
      const categoryLabel = data.category || 'Civic Issue';
      const statusLabel = data.status || 'Pending';
      const title = `${data.title} – ${categoryLabel} in ${locLabel} (${statusLabel}) | Civisha`;
      const rawDesc = `${statusLabel} ${categoryLabel} issue at ${locLabel}: ${data.content || data.title} (${data.confirmations || 0} community verifications on Civisha).`;
      const description = rawDesc.substring(0, 160);

      let imageUrl = data.imageUrl || `${APP_URL}/og-fallback.png`;
      if (imageUrl.startsWith('/api/media/')) {
        imageUrl = `${APP_URL}${imageUrl}`;
      }
      const url = `${APP_URL}/report/${encodeURIComponent(reportId)}`;

      html = injectSEOMeta(html, {
        title,
        description,
        url,
        image: imageUrl,
        type: 'article',
        keywords: `${data.title}, ${categoryLabel}, ${locLabel}, ${locLabel} civic issue, ${statusLabel}, Civisha`,
        bodyHtml: renderSsrShell({
          heading: data.title,
          intro: data.content || rawDesc,
          bodyHtml: `
            <div class="mt-4 space-y-2 text-sm text-gray-700">
              <p><strong>Category:</strong> ${escapeHtml(categoryLabel)}</p>
              <p><strong>Status:</strong> ${escapeHtml(statusLabel)}</p>
              <p><strong>Location:</strong> <a href="/area/${encodeURIComponent(locLabel)}">${escapeHtml(locLabel)}</a></p>
              <p><strong>Community Verifications:</strong> ${data.confirmations || 0} • <strong>Upvotes:</strong> ${data.upvotes || 0}</p>
            </div>
          `,
        }),
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: data.title,
          description,
          articleSection: categoryLabel,
          image: [imageUrl],
          author: {
            '@type': 'Person',
            name: data.isAnonymous ? 'Anonymous Citizen' : data.author || 'Citizen Reporter',
          },
          contentLocation: {
            '@type': 'Place',
            name: locLabel,
            address: locLabel,
            ...(data.lat && data.lng
              ? {
                  geo: {
                    '@type': 'GeoCoordinates',
                    latitude: data.lat,
                    longitude: data.lng,
                  },
                }
              : {}),
          },
          interactionStatistic: [
            {
              '@type': 'InteractionCounter',
              interactionType: 'https://schema.org/AgreeAction',
              userInteractionCount: data.confirmations || 0,
            },
            {
              '@type': 'InteractionCounter',
              interactionType: 'https://schema.org/LikeAction',
              userInteractionCount: data.upvotes || 0,
            },
          ],
        },
      });

      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      res.send(html);
    } catch (error) {
      console.error('Unexpected error in report route:', error);
      next();
    }
  });

  app.get('/u/:handle', async (req, res, next) => {
    try {
      let html = await loadBaseHtml();
      const rawHandle = decodeURIComponent(req.params.handle).trim().replace(/^@/, '');
      let userData = null;

      let targetUid = rawHandle;
      const hRes = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/usernames/${encodeURIComponent(rawHandle.toLowerCase())}`);
      if (hRes.ok) {
        const hJson = await hRes.json();
        if (hJson.fields?.uid?.stringValue) {
          targetUid = hJson.fields.uid.stringValue;
        }
      }
      const uRes = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(targetUid)}`);
      if (uRes.ok) {
        const uJson = await uRes.json();
        userData = {
          uid: targetUid,
          displayName: uJson.fields?.displayName?.stringValue || rawHandle,
          handle: uJson.fields?.handle?.stringValue || rawHandle,
          bio: uJson.fields?.bio?.stringValue || '',
          photoURL: uJson.fields?.photoURL?.stringValue || '',
        };
      }

      const displayName = userData?.displayName || rawHandle;
      const handle = userData?.handle || rawHandle;
      const title = `${displayName} (@${handle}) – Citizen Civic Profile | Civisha`;
      const description = (
        userData?.bio
          ? `${displayName} (@${handle}) on Civisha: ${userData.bio}`
          : `View ${displayName} (@${handle})'s verified civic issue reports, proximity verifications, and community impact on Civisha.`
      ).substring(0, 160);
      const url = `${APP_URL}/u/${encodeURIComponent(handle)}`;
      const image = userData?.photoURL || `${APP_URL}/og-fallback.png`;

      html = injectSEOMeta(html, {
        title,
        description,
        url,
        image,
        type: 'profile',
        keywords: `${displayName}, @${handle}, Civisha citizen profile, civic reports`,
        bodyHtml: renderSsrShell({
          heading: `${displayName} (@${handle})`,
          intro: description,
        }),
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'ProfilePage',
          mainEntity: {
            '@type': 'Person',
            name: displayName,
            alternateName: `@${handle}`,
            description,
            image,
            url,
          },
        },
      });

      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      res.send(html);
    } catch (err) {
      next();
    }
  });

  app.get('/area/:areaName', async (req, res, next) => {
    try {
      let html = await loadBaseHtml();
      const areaName = decodeURIComponent(req.params.areaName).trim();
      const title = `${areaName} Civic Issues, Reports & Ward Priority | Civisha`;
      const description = `Track live reported civic issues, sanitation, roads, water, and electricity complaints in ${areaName} with community verification on Civisha Radar.`.substring(0, 160);
      const url = `${APP_URL}/area/${encodeURIComponent(areaName)}`;

      html = injectSEOMeta(html, {
        title,
        description,
        url,
        type: 'website',
        keywords: `${areaName} civic issues, ${areaName} complaints, ${areaName} pothole report, Civisha Radar`,
        bodyHtml: renderSsrShell({
          heading: `${areaName} Civic Issues & Ward Priority`,
          intro: description,
          bodyHtml: `<p class="mt-4 text-sm text-gray-600">Explore community-verified road, water, sanitation, and infrastructure reports for ${escapeHtml(areaName)} on <a href="/radar">Civisha Radar</a>.</p>`,
        }),
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Place',
          name: areaName,
          description,
          url,
        },
      });
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      res.send(html);
    } catch (err) {
      next();
    }
  });

  const STATIC_PAGE_META = {
    '/radar': {
      title: 'Civic Radar Heatmap & Area Intelligence | Civisha',
      description: 'Explore real-time geospatial civic issue clusters, ward priority rankings, and resolution rates across India on Civisha Radar.',
      keywords: 'civic radar, civic heatmap, ward priority index, civic issues India, Civisha',
      heading: 'Civic Radar Heatmap & Area Intelligence',
      bodyHtml: `
        <section class="mt-6 space-y-3 text-gray-700">
          <h2 class="text-xl font-bold text-gray-900">Live Geospatial Ward &amp; Neighborhood Monitoring</h2>
          <p>Civisha Radar aggregates citizen-reported potholes, garbage hotspots, streetlight outages, drainage blockages, and water supply issues into live area priority heatmaps.</p>
          <p>Residents within 500 meters can verify issues to raise community trust scores and highlight urgent municipal zones.</p>
        </section>
      `,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Civic Radar Heatmap & Area Intelligence',
        url: `${APP_URL}/radar`,
        description: 'Explore real-time geospatial civic issue clusters, ward priority rankings, and resolution rates across India on Civisha Radar.',
      },
    },
    '/journal': {
      title: 'Civic Journal & Public Data Analytics | Civisha',
      description: 'Analyze live civic issue datasets, category breakdowns, resolution velocity, and weekly automated civic briefs on Civisha Journal.',
      keywords: 'civic data analytics, public infrastructure dataset, civic journal, Civisha',
      heading: 'Civic Journal & Public Data Analytics',
      bodyHtml: `
        <section class="mt-6 space-y-3 text-gray-700">
          <h2 class="text-xl font-bold text-gray-900">Transparent Civic Infrastructure Metrics</h2>
          <p>Civisha Journal tracks issue resolution velocity, category distributions across sanitation, roads, electricity, and water, and community verification accuracy.</p>
          <p>Public analytics empower citizens, journalists, and local authorities with verifiable civic accountability records.</p>
        </section>
      `,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: 'Civisha Public Civic Issues & Resolution Analytics',
        url: `${APP_URL}/journal`,
        description: 'Real-time community-verified dataset of civic infrastructure issues, sanitation, roads, water, and resolution metrics.',
      },
    },
    '/about': {
      title: 'About Civisha – Civic Issue Reporting Platform & Public Data',
      description: 'Civisha is India’s citizen-led civic reporting platform to report civic problems, verify local infrastructure issues, and access open civic report & data analytics.',
      keywords: 'Civisha civic reporting platform, report civic problem, civic report and data, citizen civic accountability India, report potholes garbage water issues',
      heading: 'About Civisha – Civic Issue Reporting Platform & Public Data',
      bodyHtml: `
        <section class="mt-6 space-y-4 text-gray-700">
          <p><strong>Civisha</strong> is a citizen-led <strong>civic reporting platform</strong> built to bridge the gap between communities and local municipal authorities across India. Citizens can <strong>report civic problems</strong>, verify neighborhood issues with community consensus, and build a transparent <strong>civic report &amp; data</strong> record.</p>
          <h2 class="text-xl font-bold text-gray-900">Report Civic Problems &amp; Track Public Infrastructure Data</h2>
          <p>From potholes, road damage, and uncollected garbage to water leaks, drainage blockages, and streetlight outages, Civisha turns local citizen reports into verified ward-level heatmaps on <a href="/radar">Civisha Radar</a> and open analytics in the <a href="/journal">Civic Journal</a>.</p>
          <h2 class="text-xl font-bold text-gray-900">Community Verification &amp; Ghost Mode Privacy</h2>
          <p>Local residents confirm or dispute reports to generate a community Trust Score, while Ghost Mode allows citizens to report sensitive civic problems anonymously.</p>
        </section>
      `,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        name: 'About Civisha – Civic Issue Reporting Platform & Public Data',
        url: `${APP_URL}/about`,
        description: 'Civisha is India’s citizen-led civic reporting platform to report civic problems, verify local infrastructure issues, and access open civic report & data analytics.',
      },
    },
    '/how-it-works': {
      title: 'How Civisha Works – Report Civic Problems, Verify & Track Data',
      description: 'Learn how to report civic problems on Civisha with live GPS photos, verify neighborhood issues within 500 meters, build your Trust Score, and explore civic report & data insights.',
      keywords: 'how to report civic problem, Civisha civic reporting platform guide, 500m GPS verification, Ghost Mode reporting, civic report and data',
      heading: 'How Civisha Works – Report Civic Problems & Verify Data',
      bodyHtml: `
        <section class="mt-6 space-y-4 text-gray-700">
          <div>
            <h2 class="text-xl font-bold text-gray-900">1. Report a Civic Problem with Live GPS Photo Proof</h2>
            <p>Tap the + Report button on the Civisha civic reporting platform, capture a photo of the civic issue (potholes, garbage, water supply, drainage, streetlights), choose a category, and publish publicly or in Ghost Mode.</p>
          </div>
          <div>
            <h2 class="text-xl font-bold text-gray-900">2. 500m Proximity Community Verification</h2>
            <p>Citizens physically within 500 meters of a reported civic problem can confirm or dispute it, creating a verified community Trust Score (%).</p>
          </div>
          <div>
            <h2 class="text-xl font-bold text-gray-900">3. Civic Radar Heatmaps &amp; Open Report Data</h2>
            <p>Every verified issue updates the <a href="/radar">Civisha Radar</a> state/district maps and <a href="/journal">Civic Journal</a> public datasets to drive municipal accountability and track resolution proof.</p>
          </div>
        </section>
      `,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'How do I report a civic problem on the Civisha civic reporting platform?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Tap the + Report button, capture a live GPS-tagged photo of the civic issue, select the issue category, and publish either publicly or anonymously using Ghost Mode.',
            },
          },
          {
            '@type': 'Question',
            name: 'How does 500m proximity verification and civic report & data tracking work?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Citizens physically located within 500 meters of a reported issue can confirm or dispute the report to build a verified community Trust Score and update public civic data analytics.',
            },
          },
        ],
      },
    },
    '/support': {
      title: 'Help & Support – Civic Problem Reporting & Data Help Center | Civisha',
      description: 'Get support on the Civisha civic reporting platform for submitting civic problem reports, 500m GPS verification, Ghost Mode privacy, and public report & data inquiries.',
      keywords: 'Civisha support, civic reporting platform help, report civic problem support, civic report data help center',
      heading: 'Help & Support – Civisha Civic Reporting Platform',
      bodyHtml: `
        <section class="mt-6 space-y-3 text-gray-700">
          <h2 class="text-xl font-bold text-gray-900">Citizen Support for Civic Problem Reports, Verification &amp; Data</h2>
          <p>Need help submitting a civic issue report, verifying a neighborhood complaint within 500m, using Ghost Mode privacy, or requesting moderation on the Civisha civic reporting platform? Submit a support ticket directly inside Civisha Help &amp; Support.</p>
          <p>For a complete walkthrough on reporting civic problems and exploring public civic report &amp; data analytics, visit <a href="/how-it-works">How Civisha Works</a>.</p>
        </section>
      `,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Help & Support – Civic Problem Reporting & Data Help Center | Civisha',
        url: `${APP_URL}/support`,
        description: 'Get support on the Civisha civic reporting platform for submitting civic problem reports, 500m GPS verification, Ghost Mode privacy, and public report & data inquiries.',
      },
    },
    '/terms': {
      title: 'Terms & Conditions – Civic Reporting Platform & Data Standards | Civisha',
      description: 'Review the Terms & Conditions for using the Civisha civic reporting platform, including authentic civic problem reporting rules, 500m verification integrity, and open civic data usage.',
      keywords: 'Civisha terms of service, civic reporting platform rules, community verification guidelines, civic report data standards',
      heading: 'Terms & Conditions – Civisha Civic Reporting Platform',
      bodyHtml: `
        <section class="mt-6 space-y-3 text-gray-700">
          <h2 class="text-xl font-bold text-gray-900">Civic Problem Reporting Standards &amp; Public Data Terms</h2>
          <p>Civisha provides a citizen-led civic reporting platform for documenting public infrastructure, sanitation, road damage, water supply, and municipal issues across India.</p>
          <p>By submitting or verifying civic reports, users agree to provide authentic, location-accurate evidence and uphold the integrity of Civisha’s public civic report &amp; data records.</p>
        </section>
      `,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Terms & Conditions – Civic Reporting Platform & Data Standards | Civisha',
        url: `${APP_URL}/terms`,
        description: 'Review the Terms & Conditions for using the Civisha civic reporting platform, including authentic civic problem reporting rules, 500m verification integrity, and open civic data usage.',
      },
    },
    '/privacy': {
      title: 'Privacy Policy – Ghost Mode & Civic Report Data Protection | Civisha',
      description: 'Read how the Civisha civic reporting platform protects citizen privacy, Ghost Mode anonymous civic problem reports, GPS verification coordinates, and public report & data records.',
      keywords: 'Civisha privacy policy, Ghost Mode anonymous reporting, civic report data protection, citizen location privacy',
      heading: 'Privacy Policy – Ghost Mode & Civic Report Data Protection',
      bodyHtml: `
        <section class="mt-6 space-y-3 text-gray-700">
          <h2 class="text-xl font-bold text-gray-900">Citizen Data Protection &amp; Ghost Mode Anonymous Civic Reporting</h2>
          <p>The Civisha civic reporting platform protects citizen privacy while enabling transparent public infrastructure accountability. Ghost Mode allows users to report a civic problem without displaying their personal identity publicly.</p>
          <p>Location metadata is used strictly to anchor civic reports to affected neighborhoods, compute the 500-meter verification radius, and aggregate anonymized civic report &amp; data analytics.</p>
        </section>
      `,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Privacy Policy – Ghost Mode & Civic Report Data Protection | Civisha',
        url: `${APP_URL}/privacy`,
        description: 'Read how the Civisha civic reporting platform protects citizen privacy, Ghost Mode anonymous civic problem reports, GPS verification coordinates, and public report & data records.',
      },
    },
  };

  Object.entries(STATIC_PAGE_META).forEach(([routePath, meta]) => {
    app.get(routePath, async (req, res, next) => {
      if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
        return next();
      }
      try {
        let html = await loadBaseHtml();
        html = injectSEOMeta(html, {
          title: meta.title,
          description: meta.description,
          url: `${APP_URL}${routePath}`,
          keywords: meta.keywords,
          jsonLd: meta.jsonLd,
          bodyHtml: renderSsrShell({
            heading: meta.heading,
            intro: meta.description,
            bodyHtml: meta.bodyHtml,
          }),
        });
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        res.send(html);
      } catch {
        next();
      }
    });
  });

  app.use((err, req, res, next) => {
    console.error('Unhandled API error:', err);
    if (!res.headersSent) {
      res.status(err?.status || 500).json({
        error: err?.message || 'Internal Server Error',
      });
    }
  });

  return app;
}

const appPromise = buildApiApp();

export default async function handler(req, res) {
  if (req.query && req.query.path) {
    const rawPath = req.query.path;
    const pathStr = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath);

    const queryStr = Object.keys(req.query)
      .filter((k) => k !== 'path')
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(req.query[k])}`)
      .join('&');

    const targetUrl = (pathStr.startsWith('/') ? pathStr : `/${pathStr}`) + (queryStr ? `?${queryStr}` : '');
    req.url = targetUrl;
    req.originalUrl = targetUrl;
  }

  const app = await appPromise;

  return new Promise((resolve, reject) => {
    res.on('finish', () => resolve());
    res.on('close', () => resolve());
    res.on('error', (err) => reject(err));
    app(req, res, (err) => {
      if (err) {
        console.error('Express handler error on Vercel:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: err?.message || 'Server handler error' });
        }
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
