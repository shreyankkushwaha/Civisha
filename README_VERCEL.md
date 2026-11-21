# Vercel Deployment Instructions

The Vercel Serverless Function and Photo Upload issues have been fixed:
1. **Async Promise Execution**: The Express serverless bridge now returns a Promise that properly waits for the HTTP response to finish before Vercel completes function invocation, fixing `FUNCTION_INVOCATION_FAILED`.
2. **Reliable Storage Endpoints**: Added standard JSON-payload upload via `/api/storage/upload` alongside stream-tolerant `/api/storage/upload-raw` to eliminate serverless stream cutoffs.
3. **Graceful Error Handling**: Unhandled exceptions in Express routes are now safely caught with actionable error messages instead of process crashes.

### Deployment Steps:
1. Export / push the updated code to your GitHub repository connected to Vercel.
2. Vercel will build and deploy the updated serverless functions.
3. **Required Environment Variables in Vercel Dashboard** (Settings -> Environment Variables):
   - `B2_ENDPOINT`: Your Backblaze S3 endpoint (e.g. `s3.eu-central-003.backblazeb2.com`)
   - `B2_BUCKET_NAME`: Your Backblaze bucket name (e.g. `civisha-media`)
   - `B2_KEY_ID`: Your Backblaze application key ID
   - `B2_APP_KEY`: Your Backblaze application key secret
   - `FIREBASE_PROJECT_ID`: `civishatest2`
   - `APP_URL`: `https://civisha.vercel.app`

