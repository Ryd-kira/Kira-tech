import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { originCheck } from './middleware/originCheck.js';
import { requestId } from './middleware/requestId.js';
import authRoutes from './modules/auth/routes.js';
import healthRoutes from './modules/health/routes.js';
import publicRoutes from './modules/public/routes.js';
import userRoutes from './modules/users/routes.js';
import productRoutes from './modules/products/routes.js';
import categoryRoutes from './modules/categories/routes.js';
import settingsRoutes from './modules/settings/routes.js';
import messageRoutes from './modules/messages/routes.js';
import stockRoutes from './modules/stock/routes.js';
import transferRoutes from './modules/transfers/routes.js';
import supplierRoutes from './modules/suppliers/routes.js';
import purchaseRoutes from './modules/purchases/routes.js';
import customerRoutes from './modules/customers/routes.js';
import reservationRoutes from './modules/reservations/routes.js';
import saleRoutes from './modules/sales/routes.js';
import paymentRoutes from './modules/payments/routes.js';
import fulfillmentRoutes from './modules/fulfillments/routes.js';
import returnRoutes from './modules/returns/routes.js';
import dashboardRoutes from './modules/dashboard/routes.js';
import reportRoutes from './modules/reports/routes.js';
import auditRoutes from './modules/audit/routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: (req) => req.id, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    strictTransportSecurity: env.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  }));
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/health', healthRoutes);

  const api = express.Router();
  api.use(originCheck);
  api.use('/public', publicRoutes);
  api.use('/admin/auth', authRoutes);
  // Toute autre route /admin exige une session : refus par défaut.
  api.use('/admin', requireAuth);
  api.use('/admin/users', userRoutes);
  api.use('/admin/products', productRoutes);
  api.use('/admin/categories', categoryRoutes);
  api.use('/admin/settings', settingsRoutes);
  api.use('/admin/messages', messageRoutes);
  api.use('/admin/stock', stockRoutes);
  api.use('/admin/transfers', transferRoutes);
  api.use('/admin/suppliers', supplierRoutes);
  api.use('/admin/purchases', purchaseRoutes);
  api.use('/admin/customers', customerRoutes);
  api.use('/admin/reservations', reservationRoutes);
  api.use('/admin/sales', saleRoutes);
  api.use('/admin/payments', paymentRoutes);
  api.use('/admin/fulfillments', fulfillmentRoutes);
  api.use('/admin/returns', returnRoutes);
  api.use('/admin/dashboard', dashboardRoutes);
  api.use('/admin/reports', reportRoutes);
  api.use('/admin/audit-logs', auditRoutes);
  app.use('/api/v1', api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
