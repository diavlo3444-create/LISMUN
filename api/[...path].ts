import { createApiApp } from '../src/server/app';

// Vercel routes /api/* requests through this Express handler.
// Keep the complete /api path so the existing routers remain unchanged.
const app = createApiApp();

export default app;
