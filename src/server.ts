
import dotenv from 'dotenv';
import express, { Request, Response } from "express";
import connectMySQL from "./config/dbSQL"; // Importing MySQL Connection
import { connectDatabases } from "./config/db"; // MongoDB connection
import { initControlDBConnection } from "./db/core/control-db";
import { initTokenStore } from "./services/token-store.service";
import { initializeSocket } from "./services/socket-service";
import http from "http";
import cors from 'cors';
import { ConsoleSpinner } from "./services/console-info";
import userRoutes from "./routes/api-webapp/authentication/user/user-api";
import companyRoutes from './routes/api-webapp/company/company-api';
import otpRoutes from './routes/api-webapp/otp/otp-api';
import Category from './routes/api-webapp/superAdmin/generalSetup/category/category-api';
import PremiumModule from './routes/api-webapp/superAdmin/generalSetup/premiumModule/premiumModule-api';
import ClientsRoutes from './routes/api-webapp/agency/clients/clients-api';
import businessTypeRoutes from './routes/api-webapp/superAdmin/generalSetup/businessType/businessType-api';
const youtubeRoutes = require('./routes/api-webapp/agency/social-Integration/youtube/youtube-api');
const googleBusinessRoutes = require('./routes/api-webapp/agency/social-Integration/google-business/google-business-api');
const gmailRoutes = require('./routes/api-webapp/agency/social-Integration/gmail/gmail-api');
const driveRoutes = require('./routes/api-webapp/agency/social-Integration/drive/drive-api');
const googleRoutes = require('./routes/api-webapp/agency/social-Integration/google/google-api');
const linkedinRoutes = require('./routes/api-webapp/agency/social-Integration/linkedin/linkedin-api');
const facebookRoutes = require('./routes/api-webapp/agency/social-Integration/facebook/facebook-api');
const pinterestRoutes = require('./routes/api-webapp/agency/social-Integration/pinterest/pinterest-api');
import twitterRoutes from './routes/api-webapp/agency/social-Integration/twitter/twitter-api';
import tiktokRoutes from './routes/api-webapp/agency/social-Integration/tiktok/tiktok-api';
// const twitterRoutes = require('./routes/api-webapp/agency/social-Integration/twitter/twitter-api');
// import rolesRoutes from './routes/api-webapp/roles/roles-api';
import rolesRoutes from './routes/api-webapp/roles/role-api';
// const influencerRoutes = require ('./routes/api-webapp/influencer/influencer-api');
import influencerRoutes from './routes/api-webapp/influencer/influencer-api';
import influencerCategoryRoutes from './routes/api-webapp/superAdmin/influencer/category/influencerCategory-api';
import influencerIndustryRoutes from './routes/api-webapp/superAdmin/influencer/industry/influencerIndustry-api';
import influencerPlatformRoutes from './routes/api-webapp/superAdmin/influencer/platform/influencerPlatform-api';
const bodyParser = require('body-parser');
const cookieSession = require('cookie-session');

import employeeRoutes from './routes/api-webapp/agency/employee/employee-api';
import itTicketsRoutes from './routes/api-webapp/it-Management/it-Tickets/it-Tickets-api';
import itemCategoryRoutes from './routes/api-webapp/accounting/item-Category/item-Category-api';
import unitRouter from './routes/api-webapp/accounting/unit/unit-api';
import itemRouter from './routes/api-webapp/accounting/item/item-api';
import vendorRouter from './routes/api-webapp/accounting/vendor/vendor-api';
import invoiceRouter from './routes/api-webapp/accounting/invoice/invoice-api';
import quoteRouter from './routes/api-webapp/accounting/quote/quote-api';
import creditNoteRouter from './routes/api-webapp/accounting/credit-Note/credit-note-api';
import purchaseBillRouter from './routes/api-webapp/accounting/purchase-Bill/purchase-bill-api';
import purchaseOrderRouter from './routes/api-webapp/accounting/purchaseOrder/purchase-order-api';
import itAssetsManagementRoutes from './routes/api-webapp/it-Management/it-Assets-Management/it-Assets-Management-api';
import ticketsRoutes from './routes/api-webapp/tickets/ticket/ticket-api';
import ticketAssignmentRoutes from './routes/api-webapp/tickets/ticket-assignment/ticket-assignment-api';
import ticketChangesRoutes from './routes/api-webapp/tickets/ticket-changes/ticket-changes-api';
import managerHandoverRoutes from './routes/api-webapp/tickets/manager-handover/manager-handover-api';
import ticketDashboardRoutes from './routes/api-webapp/tickets/dashboard/ticket-dashboard-api';
import clientUserAssignmentRouter from './routes/api-webapp/agency/client-assignment/client-assignment-api';
// Import cron jobs
import './cron/warranty-reminder.cron';
import paymentsRouter from './routes/api-webapp/accounting/payments/payments-api'
import debitNoteRouter from './routes/api-webapp/accounting/debtit-Note/debit-note-api';
import modulesRouter from './routes/api-webapp/superAdmin/modules/module-api';
import permissionsRouter from './routes/api-webapp/superAdmin/permissions/permissions-api';
import subscriptionPlanRouter from './routes/api-webapp/superAdmin/subscription-plan/subscription-plan-api';
import subscriptionPlanModuleRouter from './routes/api-webapp/superAdmin/subscription-plan-module/subscription-plan-module-api';
import subscriptionPlanPermissionRouter from './routes/api-webapp/superAdmin/subscription-plan-permission/subscription-plan-permission-api';
import companySubscriptionRouter from './routes/api-webapp/company/company-subscription/company-subscription-api';
import companyModuleRouter from './routes/api-webapp/company/company-module/company-module-api';
import companyPermissionRouter from './routes/api-webapp/company/company-permission/company-permission-api';
import RolePermissionsRouter from './routes/api-webapp/role-permissions/role-permissions-api'
import UserPermissionOverridesRouter from './routes/api-webapp/user-permission-overrides/user-permission-overrides-api'
import RbacRouter from './routes/api-webapp/rbac/rbac-api';

// ROUTES for zarklyX User Role bases system
import zarklyXAuthRouter from "./routes/api-webapp/superAdmin/authentication/auth-api";
import zarklyXUsersRouter from "./routes/api-webapp/superAdmin/authentication/user/user-api";
import zarklyXRolesRouter from "./routes/api-webapp/superAdmin/rbac/roles/roles-api";
import zarklyXPermissionsRouter from "./routes/api-webapp/superAdmin/rbac/permissions/permissions-api";
import zarklyXOverridesRouter from "./routes/api-webapp/superAdmin/rbac/user-permission-overrides/user-permission-overrides-api";
import zarklyX2FARouter from "./routes/api-webapp/superAdmin/authentication/2fa/zarklyX-2fa-api";
import zarklyXRolePermissionsRouter from './routes/api-webapp/superAdmin/rbac/role-permissions/role-permissions-api';


import path from "path";
const app = express();
dotenv.config();

// CORS must be applied FIRST, before other middleware
app.use(cors({
  origin: 'http://localhost:4200', // Angular app origin
  credentials: true,               // Allow credentials (cookies)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Access-Token', 'X-Refresh-Token']
}));

// Body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session middleware AFTER CORS, BEFORE routes
app.use(cookieSession({
  name: 'session',
  keys: [process.env.COOKIE_SECRET || 'default_secret_key'],
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  httpOnly: true,
  secure: false, // Set to true if using HTTPS
  sameSite: 'lax' // Important for OAuth redirects
}));

// console.log("FB APP ID:", process.env.FACEBOOK_APP_ID);
app.use('/profileFile', express.static(path.join(__dirname, '..', 'public', 'profileFile')));
app.use('/itManagement', express.static(path.join(__dirname, 'public', 'itManagement'))); 
app.use('/tickets', express.static(path.join(__dirname, 'public', 'tickets'))); // Tickets module attachments
app.use(express.json()); 
const publicPath = path.join(process.cwd(), 'src', 'public');
app.use(
  express.static(publicPath, { maxAge: '1d', etag: true, immutable: true })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/user", userRoutes);
app.use("/company", companyRoutes);
app.use("/otp", otpRoutes);
app.use("/category", Category);
app.use("/premiumModule", PremiumModule);
app.use("/clients", ClientsRoutes);
app.use("/businessType", businessTypeRoutes);
app.use("/youtube", youtubeRoutes);
app.use("/google-business", googleBusinessRoutes);
app.use("/gmail", gmailRoutes);
app.use("/google", googleRoutes);

// 🔍 DEBUG: Log all /drive requests
app.use("/drive", (req, res, next) => {
  // console.log(`📍 [DRIVE REQUEST] ${req.method} ${req.path}`, { 
  //   hasAccessToken: !!req.query.access_token || !!req.headers['x-access-token'],
  //   hasRefreshToken: !!req.query.refresh_token || !!req.headers['x-refresh-token']
  // });
  next();
});

app.use("/drive", driveRoutes);
app.use("/linkedin", linkedinRoutes);
app.use("/facebook", facebookRoutes);
app.use("/pinterest", pinterestRoutes);
app.use("/twitter", twitterRoutes);
// app.use("/roles", rolesRoutes);
app.use("/tiktok", tiktokRoutes);
app.use("/roles", rolesRoutes);
app.use("/influencer", influencerRoutes);
app.use("/influencerCategory", influencerCategoryRoutes);
app.use("/influencerIndustry", influencerIndustryRoutes);
app.use("/influencerPlatform", influencerPlatformRoutes);
app.use("/itManagement/itTickets", itTicketsRoutes);
app.use("/accounting/item-Category",itemCategoryRoutes);
app.use("/accounting/unit",unitRouter);
app.use("/accounting/vendor",vendorRouter);
app.use("/accounting/item",itemRouter);
app.use("/accounting/invoice",invoiceRouter);
app.use("/accounting/quote",quoteRouter);
app.use("/accounting/credit-note",creditNoteRouter);
app.use("/accounting/purchase-bill",purchaseBillRouter);
app.use("/accounting/purchaseOrder",purchaseOrderRouter);
app.use("/itManagement/itAssetsManagement", itAssetsManagementRoutes);
app.use("/tickets", ticketsRoutes);
app.use("/tickets/assignment", ticketAssignmentRoutes);
app.use("/tickets/changes", ticketChangesRoutes);
app.use("/tickets/managerHandover", managerHandoverRoutes);
app.use("/tickets/stats", ticketDashboardRoutes);
app.use("/clients/client-assignment",clientUserAssignmentRouter);
app.use("/accounting/payments",paymentsRouter);
app.use("/accounting/debit-note",debitNoteRouter);
app.use("/superAdmin/modules",modulesRouter);
app.use("/superAdmin/permissions",permissionsRouter);
app.use("/superAdmin/subscription-plan",subscriptionPlanRouter);
app.use("/superAdmin/subscription-plan-module",subscriptionPlanModuleRouter);
app.use("/superAdmin/subscription-plan-permission",subscriptionPlanPermissionRouter);
app.use("/company-subscription",companySubscriptionRouter);
app.use("/company-module",companyModuleRouter);
app.use("/company-permission",companyPermissionRouter);
app.use("/role-permissions",RolePermissionsRouter);
app.use("/user-overrides",UserPermissionOverridesRouter);
app.use("/rbac",RbacRouter);
app.use("/superAdmin/zarklyx/auth",zarklyXAuthRouter),
app.use("/superAdmin/zarklyx/user",zarklyXUsersRouter),
app.use("/superAdmin/zarklyx/roles",zarklyXRolesRouter),
app.use("/superAdmin/zarklyx/permissions",zarklyXPermissionsRouter),
app.use("/superAdmin/zarklyx/role-permissions",zarklyXRolePermissionsRouter),
app.use("/superAdmin/zarklyx/overrides",zarklyXOverridesRouter),
app.use("/superAdmin/zarklyx/2fa",zarklyX2FARouter),

// Support root-level callback path that some OAuth providers / dev tools use
// If TikTok (or your ngrok) redirects to '/auth/tiktok/callback' (root), forward it
// to the mounted tiktok router at '/tiktok/auth/tiktok/callback' so it won't 404.
app.get('/auth/tiktok/callback', (req: Request, res: Response) => {
  // Preserve query string when forwarding
  const qs = req.url && req.url.includes('?') ? req.url.split('?')[1] : '';
  const forwardUrl = `/tiktok/auth/tiktok/callback${qs ? '?' + qs : ''}`;
  return res.redirect(302, forwardUrl);
});


const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
app.use("/employee", employeeRoutes);

// Web App Apis Route Index
// Initialize databases (MySQL main, MongoDB and control DB)
(async () => {
  try {
    await connectMySQL();
  } catch (err) {
    // connectMySQL handles retries and returns false on failure; ignore here
  }

  try {
    await connectDatabases();
  } catch (err) {
    console.warn("MongoDB connect warning:", err);
  }

  // Initialize control DB connection (separate instance) - optional
  try {
    await initControlDBConnection();
  } catch (err) {
    console.warn("Control DB init warning:", err);
  }

  // Initialize token store model
  try {
    await initTokenStore();
  } catch (err) {
    console.warn("Token store init warning:", err);
  }
})();

const server = http.createServer(app);

// Initialize Socket.io
(async () => {
  try {
    await initializeSocket(server);
  } catch (err) {
    console.error("Socket.io initialization error:", err);
  }
})();

// Allow overriding the port with the PORT environment variable (useful in dev or CI)
const unsecurePort = Number(process.env.PORT) || 9005;

// Start server with explicit error handling so EADDRINUSE gives a clear message
server.listen(unsecurePort)
  .on('listening', () => {
    ConsoleSpinner.success(`HTTP Server running at ${unsecurePort}`);
  })
  .on('error', (err: any) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`Port ${unsecurePort} is already in use. ${err.message}`);
      console.error('Stop the process using that port or set PORT to a free port before retrying.');
      process.exit(1);
    }
    console.error('Server error:', err);
    process.exit(1);
  });


app.get("/api/health", (req: Request, res: Response) => {
  res.json({ message: "API is working fine!" });
});





