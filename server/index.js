const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const os = require('os');

const app = express();
const PORT = 3000;

console.log("Backend Version: 2026-02-11-FIX-RPID (blog.eightyfor.top)");

// Enable CORS with a whitelist and preflight handling
const allowedOrigins = [
    'https://blog.eightyfor.top',
    'https://blogmanager.eightyfor.top',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:4321'
];
const corsOptions = {
    origin: function(origin, callback) {
        // Allow requests with no origin (e.g. curl, server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
        // Log rejected origins for debugging CORS issues
        console.warn('[CORS] Rejected origin:', origin);
        return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'X-Requested-With', 'X-Chronicle-Auth', 'Authorization' ,'X-Filename'],
    credentials: true,
    optionsSuccessStatus: 204,
    maxAge: 86400
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Parse JSON and urlencoded request bodies before routes read req.body.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Verbose per-request result logger
app.use((req, res, next) => {
    const start = Date.now();

    // wrap res.json and res.send to log outcome when they are called
    const _json = res.json.bind(res);
    const _send = res.send.bind(res);

    function logOutcome(statusCode, responseBody) {
        const duration = Date.now() - start;
        const brief = `${req.method} ${req.originalUrl} ${statusCode} ${duration}ms`;

        if (statusCode >= 400) {
            // Always print detailed info for failures
            try {
                console.error('[API ERROR]', brief);
                console.error('  Query   :', JSON.stringify(req.query || {}));
                console.error('  Body    :', JSON.stringify(req.body || {}));
                console.error('  Response:', typeof responseBody === 'object' ? JSON.stringify(responseBody) : String(responseBody));
                if (process.env.VERBOSE_ERRORS === '1') {
                    console.error('  Headers :', JSON.stringify(req.headers || {}));
                }
            } catch (e) {
                console.error('[API ERROR] failed to serialize debug info', e);
            }

            // persist to error log when available
            try {
                const out = [`[${new Date().toISOString()}] ${brief}`,
                    `  Query: ${JSON.stringify(req.query || {})}`,
                    `  Body: ${JSON.stringify(req.body || {})}`,
                    `  Response: ${typeof responseBody === 'object' ? JSON.stringify(responseBody) : String(responseBody)}`,
                    '\n'].join('\n');
                fs.appendFile(path.join(__dirname, 'log', 'error.log'), out, () => {});
            } catch (e) {}

            return;
        }

        // success - short log
        console.log('[API]', brief);
    }

    res.json = function (body) {
        try {
            logOutcome(res.statusCode || 200, body);
        } catch (e) {}
        return _json(body);
    };

    res.send = function (body) {
        try {
            logOutcome(res.statusCode || 200, body);
        } catch (e) {}
        return _send(body);
    };

    next();
});
// Global error handler to ensure uncaught errors are logged with stack
app.use((err, req, res, next) => {
    console.error('[Unhandled API Error]', err && (err.stack || err.message || String(err)));
    try {
        console.error('  Request:', req.method, req.originalUrl);
        console.error('  Query  :', req.query);
        console.error('  Body   :', req.body);
    } catch (e) {}
    if (!res.headersSent) {
        res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
    } else {
        next(err);
    }
});

// Logger
const LOG_DIR = path.join(__dirname, 'log');
const ACCESS_LOG = path.join(LOG_DIR, 'access.log');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const accessLogStream = fs.createWriteStream(ACCESS_LOG, { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream }));

// Data Directories
const BASE_DIR = __dirname;
const DATA_DIR = path.join(BASE_DIR, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'upload');
const BACKGROUND_DIR = path.join(DATA_DIR, 'background');
const POSTS_DIR = path.join(DATA_DIR, 'posts');
const SECURITY_FILE = path.join(DATA_DIR, 'security.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const COLLECTION_FILE = path.join(DATA_DIR, 'collection.json');
const INDEX_FILE = path.join(POSTS_DIR, 'index.json');

const DEFAULT_BUILD_SETTINGS = {
    frontendUrl: 'blog.eightyfor.top',
    frontendCodeDir: '/opt/Chronicle/astro-frontend',
    frontendBuildTargetDir: '/var/www/blog.eightyfor.top'
};

const DEFAULT_MANAGER_DOMAIN = 'blogmanager.eightyfor.top';

const BACKEND_APP_DIR = path.resolve(BASE_DIR, '..', 'chronicle-frontend');

const VALID_BUILD_GRANULARITIES = new Set(['full', 'posts', 'index']);

function safeDirectorySize(dirPath) {
    try {
        if (!dirPath || !fs.existsSync(dirPath)) return 0;
        const stat = fs.lstatSync(dirPath);
        if (!stat.isDirectory()) return stat.size || 0;

        let total = 0;
        const walk = (target) => {
            let entries = [];
            try {
                entries = fs.readdirSync(target, { withFileTypes: true });
            } catch (e) {
                return;
            }

            for (const entry of entries) {
                const abs = path.join(target, entry.name);
                let st;
                try {
                    st = fs.lstatSync(abs);
                } catch (e) {
                    continue;
                }

                if (st.isSymbolicLink()) continue;
                if (st.isDirectory()) {
                    walk(abs);
                } else {
                    total += Number(st.size) || 0;
                }
            }
        };

        walk(dirPath);
        return total;
    } catch (e) {
        return 0;
    }
}

function getDiskStatsByPath(targetPath) {
    try {
        if (typeof fs.statfsSync === 'function') {
            const stats = fs.statfsSync(targetPath);
            const bsize = Number(stats.bsize) || 0;
            const blocks = Number(stats.blocks) || 0;
            const bavail = Number(stats.bavail) || 0;
            const bfree = Number(stats.bfree) || 0;
            const totalBytes = bsize * blocks;
            const availableBytes = bsize * bavail;
            const usedBytes = bsize * Math.max(0, blocks - bfree);
            if (totalBytes > 0) {
                return { totalBytes, availableBytes, usedBytes };
            }
        }
    } catch (e) {
        // Fall through to df parsing.
    }

    try {
        const escaped = String(targetPath || '').replace(/"/g, '\\"');
        const output = execSync(`df -kP "${escaped}"`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        const lines = output.trim().split(/\r?\n/);
        if (lines.length < 2) {
            return { totalBytes: 0, availableBytes: 0, usedBytes: 0 };
        }
        const parts = lines[1].trim().split(/\s+/);
        const totalKb = Number(parts[1]) || 0;
        const usedKb = Number(parts[2]) || 0;
        const availableKb = Number(parts[3]) || 0;
        return {
            totalBytes: totalKb * 1024,
            usedBytes: usedKb * 1024,
            availableBytes: availableKb * 1024,
        };
    } catch (e) {
        return { totalBytes: 0, availableBytes: 0, usedBytes: 0 };
    }
}

function resolveManagerDomain(settings) {
    const candidates = [
        settings && settings.managerDomain,
        settings && settings.managerUrl,
        settings && settings.backendUrl,
        settings && settings.backendDomain,
        settings && settings.backendHost,
    ];
    for (const raw of candidates) {
        const value = String(raw || '').trim();
        if (!value) continue;
        try {
            const host = /^https?:\/\//i.test(value) ? new URL(value).host : value;
            if (host) return host;
        } catch (e) {
            if (value) return value;
        }
    }
    return DEFAULT_MANAGER_DOMAIN;
}

function resolveApiSourcePath(baseDir) {
    const parentDir = path.resolve(baseDir, '..');
    const parentName = path.basename(parentDir).toLowerCase();

    const looksLikeChronicleRepo = parentName === 'chronicle' || (
        fs.existsSync(path.join(parentDir, 'package.json')) &&
        fs.existsSync(path.join(parentDir, 'server')) &&
        fs.existsSync(path.join(parentDir, 'chronicle-frontend'))
    );

    return looksLikeChronicleRepo ? parentDir : baseDir;
}

const CATEGORIES = ['pic', 'sound', 'txt', 'video', 'doc', 'other'];
const trafficGaCache = new Map();
let trafficGaClient = null;
const TRAFFIC_RANGE_ALIASES = {
    '1': '1d',
    '7': '7d',
    '12': '12h',
    '30': '30d',
    '90': '30d',
    all: '30d',
};
const VALID_TRAFFIC_RANGES = new Set(['30min', '12h', '1d', '7d', '30d']);

function sortTags(tags) {
    if (!tags || !Array.isArray(tags)) return [];
    return tags.sort((a, b) => {
        if (a === 'featured') return -1;
        if (b === 'featured') return 1;
        return a.localeCompare(b);
    });
}

function getBuildSettings() {
    let saved = {};
    if (fs.existsSync(SETTINGS_FILE)) {
        try {
            saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) || {};
        } catch (e) {
            saved = {};
        }
    }

    const frontendUrl = String(saved.frontendUrl || DEFAULT_BUILD_SETTINGS.frontendUrl || '').trim();
    const frontendCodeDir = String(saved.frontendCodeDir || DEFAULT_BUILD_SETTINGS.frontendCodeDir || '').trim();
    const frontendBuildTargetDir = String(saved.frontendBuildTargetDir || DEFAULT_BUILD_SETTINGS.frontendBuildTargetDir || '').trim() || `/var/www/${frontendUrl || DEFAULT_BUILD_SETTINGS.frontendUrl}`;

    return {
        ...DEFAULT_BUILD_SETTINGS,
        ...saved,
        frontendUrl,
        frontendCodeDir,
        frontendBuildTargetDir,
    };
}

function getTrafficGaConfig() {
    const settings = getBuildSettings();
    const propertyId = String(settings.gaPropertyId || process.env.GA_PROPERTY_ID || '').trim();
    const measurementId = String(settings.gaMeasurementId || process.env.GA_MEASUREMENT_ID || '').trim();
    const serviceAccountJson = String(process.env.GA_SERVICE_ACCOUNT_JSON || '').trim();
    const serviceAccountKeyFilename = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();

    return {
        propertyId,
        measurementId,
        serviceAccountJson,
        serviceAccountKeyFilename,
    };
}

function getTrafficGaClient() {
    if (trafficGaClient) return trafficGaClient;

    const config = getTrafficGaConfig();
    const options = {};

    if (config.serviceAccountKeyFilename) {
        options.keyFilename = config.serviceAccountKeyFilename;
    } else if (config.serviceAccountJson) {
        try {
            options.credentials = JSON.parse(config.serviceAccountJson);
        } catch (e) {
            throw new Error('Invalid GA service account JSON');
        }
    }

    trafficGaClient = new BetaAnalyticsDataClient(options);
    return trafficGaClient;
}

function gaMetricValue(row, index) {
    const raw = row?.metricValues?.[index]?.value;
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
}

function gaDimensionValue(row, index) {
    return String(row?.dimensionValues?.[index]?.value || '').trim();
}

function formatGaDate(raw) {
    if (!raw || raw.length < 8) return raw || '';
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function normalizeTrafficRange(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (VALID_TRAFFIC_RANGES.has(raw)) return raw;
    if (TRAFFIC_RANGE_ALIASES[raw]) return TRAFFIC_RANGE_ALIASES[raw];
    return '1d';
}

function trafficRangeGranularity(range) {
    if (range === '30min') return 'minute';
    if (range === '12h' || range === '1d') return 'hour';
    return 'day';
}

function trafficRangeSlotCount(range) {
    if (range === '30min') return 30;
    if (range === '12h') return 12;
    if (range === '1d') return 24;
    if (range === '7d') return 7;
    return 30;
}

function trafficRangeStepMs(range) {
    if (range === '30min') return 60 * 1000;
    if (range === '12h' || range === '1d') return 60 * 60 * 1000;
    return 24 * 60 * 60 * 1000;
}

function trafficRangeDateRanges(range) {
    if (range === '7d') return [{ startDate: '7daysAgo', endDate: 'today' }];
    if (range === '30d') return [{ startDate: '30daysAgo', endDate: 'today' }];
    if (range === '12h') return [{ startDate: '1daysAgo', endDate: 'today' }];
    return [{ startDate: '1daysAgo', endDate: 'today' }];
}

function trafficSlotKey(timestamp, range) {
    const date = new Date(timestamp);
    if (range === '30min') {
        return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    }
    if (range === '12h' || range === '1d') {
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}`;
    }
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function trafficSlotLabel(timestamp, range) {
    const date = new Date(timestamp);
    if (range === '30min') {
        return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    }
    if (range === '12h' || range === '1d') {
        return `${pad2(date.getHours())}:00`;
    }
    return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function buildTrafficSlots(range, now = Date.now()) {
    const slotCount = trafficRangeSlotCount(range);
    const stepMs = trafficRangeStepMs(range);
    const slots = [];
    const start = now - (slotCount - 1) * stepMs;

    for (let index = 0; index < slotCount; index += 1) {
        const timestamp = start + index * stepMs;
        slots.push({
            key: trafficSlotKey(timestamp, range),
            label: trafficSlotLabel(timestamp, range),
            start: new Date(timestamp).toISOString(),
            end: new Date(timestamp + stepMs).toISOString(),
            count: 0,
            pageViews: 0,
            apiCalls: 0,
            uniqueVisitors: 0,
        });
    }

    return slots;
}

function buildTrafficSeriesFromRows(range, rows) {
    const slots = buildTrafficSlots(range);
    const slotMap = new Map(slots.map((slot) => [slot.key, slot]));

    for (const row of rows || []) {
        const values = row?.dimensionValues || [];
        const key = range === '30min'
            ? `${pad2(Number(values[0]?.value) || 0)}:${pad2(Number(values[1]?.value) || 0)}`
            : range === '12h' || range === '1d'
                ? `${formatGaDate(values[0]?.value || '')} ${pad2(Number(values[1]?.value) || 0)}`
                : formatGaDate(values[0]?.value || '');
        const slot = slotMap.get(key);
        if (!slot) continue;

        const count = gaMetricValue(row, 0);
        const pageViews = gaMetricValue(row, 1);
        const uniqueVisitors = gaMetricValue(row, 2);
        slot.count += count;
        slot.pageViews += pageViews;
        slot.apiCalls += Math.max(0, count - pageViews);
        slot.uniqueVisitors += uniqueVisitors;
    }

    return slots;
}

function makeTrafficEmptyPayload(range) {
    const normalizedRange = normalizeTrafficRange(range);
    const series = buildTrafficSlots(normalizedRange);
    return {
        source: 'access-log',
        range: {
            value: normalizedRange,
            days: normalizedRange,
            granularity: trafficRangeGranularity(normalizedRange),
            start: null,
            end: null,
        },
        last24h: 0,
        last7d: 0,
        summary: {
            totalRequests: 0,
            pageViews: 0,
            apiCalls: 0,
            uniqueVisitors: 0,
            errors: 0,
            uniqueRoutes: 0,
        },
        series,
        daily: series,
        topRoutes: [],
        topPages: [],
        topApis: [],
        topReferrers: [],
        topDevices: [],
        topBrowsers: [],
        topMethods: [],
        topStatuses: [],
    };
}

async function runGaReport(propertyId, request) {
    const client = getTrafficGaClient();
    const [response] = await client.runReport({
        property: `properties/${propertyId}`,
        ...request,
    });
    return response || {};
}

async function buildTrafficGaPayload(days) {
    const config = getTrafficGaConfig();
    if (!config.propertyId) return null;

    const range = normalizeTrafficRange(days);

    const cacheKey = `${config.propertyId}:${range}`;
    const cached = trafficGaCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.payload;
    }

    const now = Date.now();
    const dateRanges = trafficRangeDateRanges(range);
    const series = buildTrafficSlots(range, now);
    const startAt = series[0] ? series[0].start : null;
    const endAt = series[series.length - 1] ? series[series.length - 1].end : null;

    try {
        const summaryPromise = range === '30min'
            ? clientRunRealtimeReport(config.propertyId, {
                minuteRanges: [{ startMinutesAgo: 29, endMinutesAgo: 0, name: '30min' }],
                metrics: [{ name: 'eventCount' }, { name: 'screenPageViews' }, { name: 'totalUsers' }],
            })
            : runGaReport(config.propertyId, {
                dateRanges,
                metrics: [{ name: 'eventCount' }, { name: 'screenPageViews' }, { name: 'totalUsers' }],
            });

        const trendPromise = range === '30min'
            ? clientRunRealtimeReport(config.propertyId, {
                minuteRanges: [{ startMinutesAgo: 29, endMinutesAgo: 0, name: '30min' }],
                dimensions: [{ name: 'hour' }, { name: 'minute' }],
                metrics: [{ name: 'eventCount' }, { name: 'screenPageViews' }, { name: 'totalUsers' }],
            })
            : range === '12h' || range === '1d'
                ? runGaReport(config.propertyId, {
                    dateRanges,
                    dimensions: [{ name: 'date' }, { name: 'hour' }],
                    metrics: [{ name: 'eventCount' }, { name: 'screenPageViews' }, { name: 'totalUsers' }],
                    orderBys: [{ dimension: { dimensionName: 'date' } }, { dimension: { dimensionName: 'hour' } }],
                })
                : runGaReport(config.propertyId, {
                    dateRanges,
                    dimensions: [{ name: 'date' }],
                    metrics: [{ name: 'eventCount' }, { name: 'screenPageViews' }, { name: 'totalUsers' }],
                    orderBys: [{ dimension: { dimensionName: 'date' } }],
                });

        const [summaryRes, trendRes, routesRes, referrersRes, devicesRes, browsersRes, methodsRes, statusesRes] = await Promise.all([
            summaryPromise,
            trendPromise,
            runGaReport(config.propertyId, {
                dateRanges,
                dimensions: [{ name: 'pagePathPlusQueryString' }],
                metrics: [{ name: 'screenPageViews' }],
                orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
                limit: 12,
            }),
            runGaReport(config.propertyId, {
                dateRanges,
                dimensions: [{ name: 'pageReferrer' }],
                metrics: [{ name: 'screenPageViews' }],
                orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
                limit: 10,
            }),
            runGaReport(config.propertyId, {
                dateRanges,
                dimensions: [{ name: 'deviceCategory' }],
                metrics: [{ name: 'sessions' }],
                orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
                limit: 10,
            }),
            runGaReport(config.propertyId, {
                dateRanges,
                dimensions: [{ name: 'browser' }],
                metrics: [{ name: 'sessions' }],
                orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
                limit: 10,
            }),
            runGaReport(config.propertyId, {
                dateRanges,
                dimensions: [{ name: 'eventName' }],
                metrics: [{ name: 'eventCount' }],
                orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
                limit: 10,
            }),
            runGaReport(config.propertyId, {
                dateRanges,
                dimensions: [{ name: 'sessionDefaultChannelGroup' }],
                metrics: [{ name: 'sessions' }],
                orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
                limit: 10,
            }),
        ]);

        const summaryRow = summaryRes.rows?.[0];
        const seriesRows = trendRes.rows || [];
        const seriesData = buildTrafficSeriesFromRows(range, seriesRows);
        const summary = {
            totalRequests: gaMetricValue(summaryRow, 0),
            pageViews: gaMetricValue(summaryRow, 1),
            uniqueVisitors: gaMetricValue(summaryRow, 2),
            apiCalls: Math.max(0, gaMetricValue(summaryRow, 0) - gaMetricValue(summaryRow, 1)),
            errors: 0,
            uniqueRoutes: routesRes.rows?.length || 0,
        };

        const series = seriesData.map((slot, index) => ({
            ...slot,
            key: slot.key || `${index}`,
            label: slot.label || String(index + 1),
        }));

        const topRoutes = (routesRes.rows || []).map((row) => ({
            path: gaDimensionValue(row, 0) || '/',
            count: gaMetricValue(row, 0),
            pageCount: gaMetricValue(row, 0),
            apiCount: 0,
        }));

        const topPages = topRoutes.map((item) => ({ path: item.path, count: item.count }));
        const topApis = (methodsRes.rows || []).map((row) => ({ path: gaDimensionValue(row, 0) || 'event', count: gaMetricValue(row, 0) }));
        const topReferrers = (referrersRes.rows || []).map((row) => ({ name: gaDimensionValue(row, 0) || 'Direct', count: gaMetricValue(row, 0) }));
        const topDevices = (devicesRes.rows || []).map((row) => ({ name: gaDimensionValue(row, 0) || 'Desktop', count: gaMetricValue(row, 0) }));
        const topBrowsers = (browsersRes.rows || []).map((row) => ({ name: gaDimensionValue(row, 0) || 'Other', count: gaMetricValue(row, 0) }));
        const topMethods = [];
        const topStatuses = [];

        const payload = {
            source: 'google-analytics',
            last24h: summary.totalRequests,
            last7d: summary.totalRequests,
            range: {
                value: range,
                days: range,
                granularity: trafficRangeGranularity(range),
                start: startAt,
                end: endAt,
            },
            summary,
            series,
            daily: series,
            topRoutes,
            topPages,
            topApis,
            topReferrers,
            topDevices,
            topBrowsers,
            topMethods,
            topStatuses,
        };

        trafficGaCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60 * 1000, payload });
        return payload;
    } catch (error) {
        console.error('[Traffic][GA] report error', error && (error.message || error.stack || error));
        return null;
    }
}

async function clientRunRealtimeReport(propertyId, request) {
    const client = getTrafficGaClient();
    const [response] = await client.runRealtimeReport({
        property: `properties/${propertyId}`,
        ...request,
    });
    return response || {};
}

function normalizeBuildGranularity(value) {
    if (typeof value !== 'string') return 'full';
    const normalized = value.trim().toLowerCase();
    return VALID_BUILD_GRANULARITIES.has(normalized) ? normalized : 'full';
}

function syncAstroBuildSettings(codeDir) {
    const settingsSource = path.join(DATA_DIR, 'settings.json');
    if (!fs.existsSync(settingsSource)) {
        throw new Error(`Settings file not found: ${settingsSource}`);
    }

    const settingsContent = fs.readFileSync(settingsSource, 'utf-8');
    const targetDirs = [
        path.join(codeDir, 'public', 'server', 'data'),
        path.join(codeDir, 'src', 'data'),
    ];

    for (const targetDir of targetDirs) {
        fs.mkdirSync(targetDir, { recursive: true });
        fs.writeFileSync(path.join(targetDir, 'settings.json'), settingsContent);
    }
}

function parseBackgroundLikeValue(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return null;

    try {
        return JSON.parse(raw);
    } catch (e) {
        return { url: raw };
    }
}

function normalizeBackgroundCompressionValue(meta) {
    if (!meta || typeof meta !== 'object') return 1;
    const explicitCandidates = [meta.compressionFactor, meta.compression, meta.bgCompression, meta.scale];
    for (const candidate of explicitCandidates) {
        const num = Number(candidate);
        if (Number.isFinite(num) && num > 0) {
            return Math.min(30, num);
        }
    }
    return 1;
}

function normalizeBackgroundImagePath(rawValue) {
    const raw = parseBackgroundLikeValue(rawValue);
    const candidates = [];

    if (typeof rawValue === 'string') {
        candidates.push(rawValue);
    }

    if (raw && typeof raw === 'object') {
        candidates.push(raw.sourcePath, raw.originalPath, raw.path, raw.url, raw.sourceUrl, raw.generatedPath);
    }

    for (const candidate of candidates) {
        const value = String(candidate || '').trim();
        if (!value) continue;

        try {
            const pathname = /^https?:\/\//i.test(value) ? (new URL(value)).pathname : value;
            const normalized = pathname
                .replace(/^\/+/, '')
                .replace(/^server\/data\/upload\//, '')
                .replace(/^server\/data\/background\//, '')
                .trim();
            if (!normalized || normalized.startsWith('..')) continue;
            return normalized;
        } catch (e) {
            const normalized = value
                .replace(/^\/+/, '')
                .replace(/^server\/data\/upload\//, '')
                .replace(/^server\/data\/background\//, '')
                .trim();
            if (!normalized || normalized.startsWith('..')) continue;
            return normalized;
        }
    }

    return '';
}

async function readBackgroundSourceHeight(rawValue) {
    const relPath = normalizeBackgroundImagePath(rawValue);
    if (!relPath) return null;

    const absPath = path.resolve(UPLOAD_DIR, relPath);
    if (!absPath.startsWith(UPLOAD_DIR) || !fs.existsSync(absPath)) return null;

    try {
        const sharp = require('sharp');
        const metadata = await sharp(absPath).metadata();
        const height = Number(metadata && metadata.height);
        return Number.isFinite(height) && height > 0 ? height : null;
    } catch (e) {
        return null;
    }
}

function sanitizeBackgroundStem(value) {
    const base = String(value || '').trim().replace(/\.[^.]+$/, '');
    const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return cleaned || 'background';
}

function getBackgroundOutputRel(scope, rawValue) {
    const sourcePath = normalizeBackgroundImagePath(rawValue);
    const sourceStem = sanitizeBackgroundStem(sourcePath.split('/').pop() || 'background');
    const scopePrefix = scope === 'frontend' ? 'chr_f_bg' : 'chr_b_bg';
    const hash = crypto.createHash('sha1').update(`${scope}:${sourcePath}`).digest('hex').slice(0, 10);
    return `${scopePrefix}-${sourceStem}-${hash}.webp`;
}

function clearBackgroundOutputs(scope) {
    const scopePrefix = scope === 'frontend' ? 'chr_f_bg-' : 'chr_b_bg-';
    if (!fs.existsSync(BACKGROUND_DIR)) return;

    const walk = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const absPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(absPath);
                try {
                    const remaining = fs.readdirSync(absPath);
                    if (!remaining.length) fs.rmdirSync(absPath);
                } catch (e) {}
                continue;
            }

            if (!entry.isFile()) continue;
            if (!entry.name.startsWith(scopePrefix) || !entry.name.endsWith('.webp')) continue;
            try {
                fs.unlinkSync(absPath);
            } catch (e) {}
        }
    };

    walk(BACKGROUND_DIR);
}

function resolveBackgroundUrlByRel(relPath) {
    const normalized = String(relPath || '').replace(/^\/+/, '').trim();
    if (!normalized) return '';
    const origin = process.env.MEDIA_DOMAIN ? process.env.MEDIA_DOMAIN.replace(/\/$/, '') : '';
    const base = normalized.startsWith('background/') || /^chr_[fb]_bg-/i.test(normalized.split('/').pop() || '')
        ? '/server/data/background/'
        : '/server/data/upload/';
    return origin ? `${origin}${base}${normalized}` : `${base}${normalized}`;
}

async function computeBackgroundCompression(meta, rawBackgroundValue) {
    if (!meta || typeof meta !== 'object') return 1;

    const explicit = normalizeBackgroundCompressionValue(meta);
    if (explicit > 1) return explicit;

    const blurCandidates = [
        meta.blur,
        meta.blurLight,
        meta.blurDark,
        meta.lightBlur,
        meta.darkBlur,
        meta.overlayLightBlur,
        meta.overlayDarkBlur,
    ]
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0);

    if (!blurCandidates.length) return 1;

    const sourceHeight = Number(meta.originalHeight || meta.height || await readBackgroundSourceHeight(rawBackgroundValue));
    if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) return 1;

    const factor = (sourceHeight / 1000) * 0.6 * Math.min(...blurCandidates);
    if (!Number.isFinite(factor) || factor <= 1) return 1;
    return Math.min(30, factor);
}

const TRAFFIC_LOG_FILE = ACCESS_LOG;
let trafficLogCache = { signature: '', records: [] };

function pad2(value) {
    return String(value).padStart(2, '0');
}

function getFileSignature(filePath) {
    try {
        const stat = fs.statSync(filePath);
        return `${stat.size}:${stat.mtimeMs}`;
    } catch (e) {
        return '';
    }
}

function parseTrafficLogLine(line) {
    const match = String(line || '').match(/^(\S+) \S+ \S+ \[([^\]]+)\] "([A-Z]+) ([^"]*?) HTTP\/[^"]*" (\d{3}) (\S+) "([^"]*)" "([^"]*)"$/);
    if (!match) return null;

    const [, ip, timeRaw, method, rawUrl, statusRaw, sizeRaw, referrerRaw, userAgentRaw] = match;
    const timestamp = new Date(timeRaw).getTime();
    if (!Number.isFinite(timestamp)) return null;

    let pathname = '/';
    try {
        const parsedUrl = /^https?:\/\//i.test(rawUrl) ? new URL(rawUrl) : new URL(rawUrl, 'http://localhost');
        pathname = parsedUrl.pathname || '/';
    } catch (e) {
        pathname = String(rawUrl || '/').split('?')[0] || '/';
    }

    return {
        ip: String(ip || '').trim(),
        timestamp,
        method: String(method || '').trim().toUpperCase(),
        path: pathname,
        status: Number(statusRaw) || 0,
        size: Number(sizeRaw) || 0,
        referrer: String(referrerRaw || '').trim(),
        userAgent: String(userAgentRaw || '').trim(),
    };
}

function loadTrafficLogRecords() {
    const signature = getFileSignature(TRAFFIC_LOG_FILE);
    if (!signature) {
        trafficLogCache = { signature: '', records: [] };
        return trafficLogCache.records;
    }

    if (trafficLogCache.signature === signature) {
        return trafficLogCache.records;
    }

    let content = '';
    try {
        content = fs.readFileSync(TRAFFIC_LOG_FILE, 'utf-8');
    } catch (e) {
        trafficLogCache = { signature, records: [] };
        return trafficLogCache.records;
    }

    const records = content
        .split(/\r?\n/)
        .map(parseTrafficLogLine)
        .filter(Boolean)
        .sort((a, b) => a.timestamp - b.timestamp);

    trafficLogCache = { signature, records };
    return records;
}

function isAssetPath(pathname) {
    return /\.[a-z0-9]{2,}$/i.test(String(pathname || ''));
}

function isPageRequest(record) {
    return record.method === 'GET' && !String(record.path || '').startsWith('/api/') && !isAssetPath(record.path);
}

function isApiRequest(record) {
    return String(record.path || '').startsWith('/api/');
}

function dateKeyFromTimestamp(timestamp) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function classifyDevice(userAgent) {
    const ua = String(userAgent || '').toLowerCase();
    if (/ipad|tablet/.test(ua)) return 'Tablet';
    if (/mobi|iphone|android/.test(ua)) return 'Mobile';
    return 'Desktop';
}

function classifyBrowser(userAgent) {
    const ua = String(userAgent || '');
    if (/edg\//i.test(ua)) return 'Edge';
    if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) return 'Chrome';
    if (/firefox\//i.test(ua)) return 'Firefox';
    if (/safari\//i.test(ua) && !/chrome\//i.test(ua) && !/chromium\//i.test(ua)) return 'Safari';
    if (/opera|opr\//i.test(ua)) return 'Opera';
    return 'Other';
}

function classifyReferrer(referrer) {
    const value = String(referrer || '').trim();
    if (!value || value === '-') return 'Direct';
    try {
        return new URL(value).host || 'Direct';
    } catch (e) {
        return value.replace(/^https?:\/\//i, '').split('/')[0] || 'Direct';
    }
}

function mapToTopEntries(map, keyName = 'name') {
    return Array.from(map.entries())
        .map(([key, value]) => ({
            [keyName]: key,
            ...(typeof value === 'object' && value !== null ? value : {}),
            count: typeof value === 'number' ? value : Number(value && value.count) || 0,
        }))
        .sort((a, b) => {
            const diff = (b.count || 0) - (a.count || 0);
            return diff !== 0 ? diff : String(a[keyName]).localeCompare(String(b[keyName]));
        });
}

function buildTrafficPayload(days) {
    const records = loadTrafficLogRecords();
    const now = Date.now();
    const normalizedDays = days === 'all' ? 'all' : Math.max(1, Number(days) || 30);
    const startTimestamp = normalizedDays === 'all' ? null : now - normalizedDays * 24 * 60 * 60 * 1000;
    const endTimestamp = now;

    const rangedRecords = records.filter((record) => {
        if (startTimestamp === null) return record.timestamp <= endTimestamp;
        return record.timestamp >= startTimestamp && record.timestamp <= endTimestamp;
    });

    const totalRequests = rangedRecords.length;
    const uniqueVisitors = new Set();
    const uniqueRoutes = new Set();
    const dailyMap = new Map();
    const routeMap = new Map();
    const pageMap = new Map();
    const apiMap = new Map();
    const referrerMap = new Map();
    const deviceMap = new Map();
    const browserMap = new Map();
    const methodMap = new Map();
    const statusMap = new Map();

    let pageViews = 0;
    let apiCalls = 0;
    let errors = 0;
    let last24h = 0;
    let last7d = 0;

    const day24h = now - 24 * 60 * 60 * 1000;
    const day7d = now - 7 * 24 * 60 * 60 * 1000;

    for (const record of records) {
        if (record.timestamp >= day24h) last24h += 1;
        if (record.timestamp >= day7d) last7d += 1;
    }

    for (const record of rangedRecords) {
        const pathName = record.path || '/';
        const isApi = isApiRequest(record);
        const isPage = isPageRequest(record);
        const dateKey = dateKeyFromTimestamp(record.timestamp);
        const dailyEntry = dailyMap.get(dateKey) || {
            date: dateKey,
            count: 0,
            pageViews: 0,
            apiCalls: 0,
            uniqueVisitors: new Set(),
        };

        dailyEntry.count += 1;
        if (isPage) dailyEntry.pageViews += 1;
        if (isApi) dailyEntry.apiCalls += 1;
        dailyEntry.uniqueVisitors.add(record.ip || 'unknown');
        dailyMap.set(dateKey, dailyEntry);

        if (record.ip) uniqueVisitors.add(record.ip);
        if (!isAssetPath(pathName)) uniqueRoutes.add(pathName);

        const routeEntry = routeMap.get(pathName) || { count: 0, pageCount: 0, apiCount: 0 };
        routeEntry.count += 1;
        if (isPage) routeEntry.pageCount += 1;
        if (isApi) routeEntry.apiCount += 1;
        routeMap.set(pathName, routeEntry);

        if (isPage) {
            pageViews += 1;
            pageMap.set(pathName, (pageMap.get(pathName) || 0) + 1);
        }
        if (isApi) {
            apiCalls += 1;
            apiMap.set(pathName, (apiMap.get(pathName) || 0) + 1);
        }

        const referrerName = classifyReferrer(record.referrer);
        const deviceName = classifyDevice(record.userAgent);
        const browserName = classifyBrowser(record.userAgent);
        const methodName = record.method || 'GET';
        const statusCode = record.status || 0;

        referrerMap.set(referrerName, (referrerMap.get(referrerName) || 0) + 1);
        deviceMap.set(deviceName, (deviceMap.get(deviceName) || 0) + 1);
        browserMap.set(browserName, (browserMap.get(browserName) || 0) + 1);
        methodMap.set(methodName, (methodMap.get(methodName) || 0) + 1);
        statusMap.set(statusCode, (statusMap.get(statusCode) || 0) + 1);

        if (statusCode >= 400) errors += 1;
    }

    const daily = Array.from(dailyMap.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((item) => ({
            date: item.date,
            count: item.count,
            pageViews: item.pageViews,
            apiCalls: item.apiCalls,
            uniqueVisitors: item.uniqueVisitors.size,
        }));

    const topRoutes = mapToTopEntries(routeMap, 'path')
        .slice(0, 12)
        .map((item) => ({
            path: item.path,
            count: item.count,
            pageCount: item.pageCount || 0,
            apiCount: item.apiCount || 0,
        }));

    const topPages = Array.from(pageMap.entries())
        .map(([pathName, count]) => ({ path: pathName, count }))
        .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
        .slice(0, 12);

    const topApis = Array.from(apiMap.entries())
        .map(([pathName, count]) => ({ path: pathName, count }))
        .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
        .slice(0, 12);

    const topReferrers = mapToTopEntries(referrerMap).slice(0, 10);
    const topDevices = mapToTopEntries(deviceMap).slice(0, 10);
    const topBrowsers = mapToTopEntries(browserMap).slice(0, 10);
    const topMethods = Array.from(methodMap.entries())
        .map(([method, count]) => ({ method, count }))
        .sort((a, b) => b.count - a.count || a.method.localeCompare(b.method));
    const topStatuses = Array.from(statusMap.entries())
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count || a.status - b.status);

    return {
        last24h,
        last7d,
        range: {
            days: normalizedDays,
            start: startTimestamp === null ? null : new Date(startTimestamp).toISOString(),
            end: new Date(endTimestamp).toISOString(),
        },
        summary: {
            totalRequests,
            pageViews,
            apiCalls,
            uniqueVisitors: uniqueVisitors.size,
            errors,
            uniqueRoutes: uniqueRoutes.size,
        },
        daily,
        topRoutes,
        topPages,
        topApis,
        topReferrers,
        topDevices,
        topBrowsers,
        topMethods,
        topStatuses,
    };
}

app.post('/api/background/compress', async (req, res) => {
    try {
        const body = req.body || {};
        const scope = body.scope === 'backend' ? 'backend' : 'frontend';
        
        // Ã¨Â°Æ’Ã¨Â¯â€¢Ã¦â€”Â¥Ã¥Â¿â€”Ã¯Â¼Å¡Ã¦â€°â€œÃ¥ÂÂ°Ã¦Å½Â¥Ã¦â€Â¶Ã¥Ë†Â°Ã§Å¡â€žÃ¨Â¯Â·Ã¦Â±â€šÃ¤Â½â€œ
        console.log('[Compress] Received request body:', JSON.stringify(body, null, 2));
        
        let savedSettings = {};
        try {
            savedSettings = getBuildSettings();
        } catch (e) {
            savedSettings = {};
        }

        // Ã¤Â¼ËœÃ¥â€¦Ë†Ã¤Â½Â¿Ã§â€Â¨Ã¨Â¯Â·Ã¦Â±â€šÃ¤Â½â€œÃ¤Â¸Â­Ã§Å¡â€žmetaÃ¥â€™Å’backgroundÃ¯Â¼Å’Ã¨â‚¬Å’Ã¤Â¸ÂÃ¦ËœÂ¯Ã¤Â¿ÂÃ¥Â­ËœÃ§Å¡â€žÃ¨Â®Â¾Ã§Â½Â®
        const rawMeta = parseBackgroundLikeValue(
            body.meta ||
            body.backgroundMeta ||
            (scope === 'backend' ? body.backendBackgroundMeta : body.frontendBackgroundMeta) ||
            null  // Ã¤Â¸ÂÃ¨â€¡ÂªÃ¥Å Â¨Ã¥â€ºÅ¾Ã©â‚¬â‚¬Ã¥Ë†Â°Ã¤Â¿ÂÃ¥Â­ËœÃ§Å¡â€žÃ¨Â®Â¾Ã§Â½Â®
        );
        
        const rawBackground =
            body.background ||
            body.backgroundPayload ||
            (scope === 'backend' ? body.backendBackground : body.frontendBackground) ||
            null;  // Ã¤Â¸ÂÃ¨â€¡ÂªÃ¥Å Â¨Ã¥â€ºÅ¾Ã©â‚¬â‚¬Ã¥Ë†Â°Ã¤Â¿ÂÃ¥Â­ËœÃ§Å¡â€žÃ¨Â®Â¾Ã§Â½Â®

        // Ã¨Â°Æ’Ã¨Â¯â€¢Ã¦â€”Â¥Ã¥Â¿â€”Ã¯Â¼Å¡Ã¦â€°â€œÃ¥ÂÂ°Ã¨Â§Â£Ã¦Å¾ÂÃ§Â»â€œÃ¦Å¾Å“
        console.log('[Compress] Parsed meta:', rawMeta);
        console.log('[Compress] Parsed background:', rawBackground);
        
        // Ã¥Â¦â€šÃ¦Å¾Å“Ã¨Â¯Â·Ã¦Â±â€šÃ¤Â½â€œÃ¤Â¸Â­Ã¦Â²Â¡Ã¦Å“â€°Ã¦ÂÂÃ¤Â¾â€ºÃ¥Â¿â€¦Ã¨Â¦ÂÃ§Å¡â€žÃ¥Ââ€šÃ¦â€¢Â°Ã¯Â¼Å’Ã¦â€°ÂÃ¤Â½Â¿Ã§â€Â¨Ã¤Â¿ÂÃ¥Â­ËœÃ§Å¡â€žÃ¨Â®Â¾Ã§Â½Â®
        const finalMeta = rawMeta || (scope === 'backend' ? savedSettings.backendBackgroundMeta : savedSettings.frontendBackgroundMeta);
        const finalBackground = rawBackground || (scope === 'backend' ? savedSettings.backendBackground : savedSettings.frontendBackground);
        
        console.log('[Compress] Final meta:', finalMeta);
        console.log('[Compress] Final background:', finalBackground);

        if (!rawMeta || typeof rawMeta !== 'object') {
            return res.json({
                success: true,
                skipped: true,
                message: 'Missing meta',
                meta: null,
                background: rawBackground || null,
            });
        }

        const compression = await computeBackgroundCompression(rawMeta, rawBackground);
        const sourcePath = normalizeBackgroundImagePath(rawBackground);
        if (!sourcePath) {
            return res.json({
                success: true,
                skipped: true,
                message: 'Missing background source',
                meta: rawMeta,
                background: rawBackground || null,
            });
        }

        const sharp = require('sharp');
        const absSourcePath = path.resolve(UPLOAD_DIR, sourcePath);
        if (!absSourcePath.startsWith(UPLOAD_DIR) || !fs.existsSync(absSourcePath)) {
            return res.json({
                success: true,
                skipped: true,
                message: 'Background source not found',
                meta: rawMeta,
                background: rawBackground || null,
            });
        }

        const relPath = getBackgroundOutputRel(scope, sourcePath);
        const absTargetPath = path.resolve(BACKGROUND_DIR, relPath);
        if (!absTargetPath.startsWith(BACKGROUND_DIR)) {
            return res.status(400).json({ success: false, message: 'Invalid background target path' });
        }

        clearBackgroundOutputs(scope);
        fs.mkdirSync(path.dirname(absTargetPath), { recursive: true, mode: 0o775 });

        const sourceMeta = await sharp(absSourcePath).metadata();
        const sourceWidth = Number(sourceMeta.width || 0);
        const sourceHeight = Number(sourceMeta.height || 0);
        const quality = Math.max(35, Math.min(92, Math.round(92 - (compression - 1) * 5)));
        const resizeWidth = sourceWidth > 0 ? Math.max(128, Math.round(sourceWidth / Math.max(1, compression))) : undefined;

        let transformer = sharp(absSourcePath, { failOnError: false }).webp({ quality, effort: 6 });
        if (resizeWidth && resizeWidth > 0 && sourceWidth > resizeWidth) {
            transformer = transformer.resize({ width: resizeWidth, withoutEnlargement: true });
        }

        await transformer.toFile(absTargetPath);

        const nextMeta = {
            ...rawMeta,
            compressionFactor: compression,
            compression,
            bgCompression: compression,
        };

        const generatedPath = relPath;
        const generatedName = path.basename(relPath);
        const generatedUrl = resolveBackgroundUrlByRel(relPath);

        res.json({
            success: true,
            scope,
            compression,
            meta: nextMeta,
            background: {
                url: generatedUrl,
                path: generatedPath,
                sourcePath,
                sourceName: path.basename(sourcePath),
                originalName: path.basename(sourcePath),
                generatedPath,
                generatedName,
            },
        });
    } catch (e) {
        console.error('[Background] Compression error', e);
        res.status(500).json({ success: false, message: e.message || 'Compression failed' });
    }
});

function ensureWritableTree(targetPath, dirMode = 0o775, fileMode = 0o664) {
    if (!targetPath || !fs.existsSync(targetPath)) return;

    const stat = fs.lstatSync(targetPath);
    if (stat.isDirectory()) {
        try { fs.chmodSync(targetPath, dirMode); } catch (e) {}
        for (const entry of fs.readdirSync(targetPath)) {
            ensureWritableTree(path.join(targetPath, entry), dirMode, fileMode);
        }
        return;
    }

    try { fs.chmodSync(targetPath, fileMode); } catch (e) {}
}

function copyEntry(sourcePath, targetPath) {
    if (!fs.existsSync(sourcePath)) return false;

    const sourceStat = fs.lstatSync(sourcePath);
    if (sourceStat.isDirectory()) {
        fs.mkdirSync(targetPath, { recursive: true, mode: 0o775 });
        fs.cpSync(sourcePath, targetPath, {
            recursive: true,
            force: true,
            dereference: true,
        });
        return true;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o775 });
    fs.copyFileSync(sourcePath, targetPath);
    return true;
}

function syncBuildOutputByGranularity(distDir, targetDir, granularity) {
    const normalizedGranularity = normalizeBuildGranularity(granularity);

    fs.mkdirSync(targetDir, { recursive: true, mode: 0o775 });

    if (normalizedGranularity === 'full') {
        const stageDir = `${targetDir}.stage-${Date.now()}`;
        if (fs.existsSync(stageDir)) {
            fs.rmSync(stageDir, { recursive: true, force: true });
        }

        fs.mkdirSync(stageDir, { recursive: true, mode: 0o775 });
        fs.cpSync(distDir, stageDir, {
            recursive: true,
            force: true,
            dereference: true,
        });
        ensureWritableTree(stageDir);
        ensureWritableTree(targetDir);
        fs.rmSync(targetDir, { recursive: true, force: true });
        fs.renameSync(stageDir, targetDir);
        ensureWritableTree(targetDir);

        return {
            granularity: normalizedGranularity,
            copiedPaths: ['*'],
            targetDir,
        };
    }

    const copiedPaths = [];
    const copyIfExists = (relativePath) => {
        const sourcePath = path.join(distDir, relativePath);
        const targetPath = path.join(targetDir, relativePath);
        if (copyEntry(sourcePath, targetPath)) {
            copiedPaths.push(relativePath);
        }
    };

    // Shared build assets change across all granularities.
    copyIfExists('assets');

    if (normalizedGranularity === 'index') {
        copyIfExists('index.html');
        copyIfExists('blogs');
        copyIfExists('friends');
        copyIfExists('search');
        copyIfExists('post');
        copyIfExists(path.join('en', 'index.html'));
        copyIfExists(path.join('zh', 'index.html'));
    } else if (normalizedGranularity === 'posts') {
        copyIfExists('blogs');
        copyIfExists('friends');
        copyIfExists('search');
        copyIfExists('post');
        copyIfExists(path.join('en', 'blogs'));
        copyIfExists(path.join('zh', 'blogs'));
        copyIfExists(path.join('en', 'post'));
        copyIfExists(path.join('zh', 'post'));
    }

    ensureWritableTree(targetDir);
    return {
        granularity: normalizedGranularity,
        copiedPaths,
        targetDir,
    };
}

function normalizeAdminToken(input) {
    if (!input) return { token: '' };

    if (typeof input === 'object') {
        return {
            token: typeof input.token === 'string' ? input.token : '',
            expiry: Number(input.expiry || 0) || 0,
        };
    }

    const raw = String(input).trim();
    if (!raw) return { token: '' };

    if (raw.startsWith('{') && raw.endsWith('}')) {
        try {
            const parsed = JSON.parse(raw);
            return normalizeAdminToken(parsed);
        } catch (e) {
            // fall through to legacy string token handling
        }
    }

    return { token: raw };
}

function requireAdminToken(req, res) {
    const headerToken = normalizeAdminToken(req.headers['x-chronicle-auth']);
    const bodyToken = normalizeAdminToken(req.body?.token);
    const tokenPayload = headerToken.token ? headerToken : bodyToken;
    const token = tokenPayload.token || '';
    const expiry = tokenPayload.expiry || 0;

    if (expiry && Number.isFinite(expiry) && Date.now() > expiry) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return false;
    }

    if (!token || (token !== 'session-valid' && token !== 'active')) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return false;
    }
    return true;
}

function buildAstroFrontendAsync(settings, options = {}) {
    return new Promise((resolve, reject) => {
        const granularity = normalizeBuildGranularity(options.granularity);
        const codeDir = path.resolve(settings.frontendCodeDir || DEFAULT_BUILD_SETTINGS.frontendCodeDir);
        const targetDir = path.resolve(settings.frontendBuildTargetDir || `/var/www/${settings.frontendUrl || DEFAULT_BUILD_SETTINGS.frontendUrl}`);

        if (!fs.existsSync(codeDir)) {
            reject(new Error(`Frontend code dir not found: ${codeDir}`));
            return;
        }
        if (!path.isAbsolute(targetDir) || targetDir === path.parse(targetDir).root) {
            reject(new Error(`Invalid build target dir: ${targetDir}`));
            return;
        }

        // ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã¢â‚¬Â¹ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂºÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂºÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂºÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¨ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¹ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂºÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âº
        syncAstroBuildSettings(codeDir);
        const workerScriptPath = path.join(__dirname, 'build-worker.js');
        const worker = new Worker(workerScriptPath, {
            workerData: { codeDir, targetDir, granularity }
        });

        worker.on('message', (message) => {
            if (message.success) {
                const syncResult = syncBuildOutputByGranularity(message.distDir, targetDir, granularity);
                resolve({ 
                    codeDir, 
                    targetDir, 
                    granularity: syncResult.granularity, 
                    copiedPaths: syncResult.copiedPaths 
                });
            } else {
                reject(new Error(message.error));
            }
            worker.terminate();
        });

        worker.on('error', (error) => {
            reject(error);
            worker.terminate();
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });

        setTimeout(() => {
            worker.terminate();
            reject(new Error('Build timeout after 10 minutes'));
        }, 10 * 60 * 1000);
    });
}

// ÃƒÂ¦Ã¢â‚¬â€œÃ‚Â°ÃƒÂ§Ã…Â¡Ã¢â‚¬Å¾ÃƒÂ¥Ã‚Â¼Ã¢â‚¬Å¡ÃƒÂ¦Ã‚Â­Ã‚Â¥ÃƒÂ¦Ã…Â¾Ã¢â‚¬Å¾ÃƒÂ¥Ã‚Â»Ã‚ÂºÃƒÂ¥Ã¢â‚¬Â¡Ã‚Â½ÃƒÂ¦Ã¢â‚¬Â¢Ã‚Â° - 60ÃƒÂ§Ã‚Â§Ã¢â‚¬â„¢ÃƒÂ¥Ã¢â‚¬Â Ã¢â‚¬Â¦ÃƒÂ¨Ã‚Â¿Ã¢â‚¬ÂÃƒÂ¥Ã¢â‚¬ÂºÃ…Â¾ÃƒÂ§Ã…Â Ã‚Â¶ÃƒÂ¦Ã¢â€šÂ¬Ã‚Â
function buildAstroFrontendWithTimeout(settings, options = {}) {
    return new Promise((resolve) => {
        const buildId = Date.now();
        let buildStatus = 'pending'; // pending, success, failed, timeout
        let buildResult = null;
        let buildError = null;
        
        console.log(`[Build ${buildId}] Starting Astro build with 60s timeout...`);
        
        // ÃƒÂ¥Ã‚ÂÃ‚Â¯ÃƒÂ¥Ã…Â Ã‚Â¨ÃƒÂ¦Ã…Â¾Ã¢â‚¬Å¾ÃƒÂ¥Ã‚Â»Ã‚Âº
        buildAstroFrontendAsync(settings, options)
            .then(result => {
                buildStatus = 'success';
                buildResult = result;
                console.log(`[Build ${buildId}] Build completed successfully`);
                
                // ÃƒÂ¦Ã…Â¾Ã¢â‚¬Å¾ÃƒÂ¥Ã‚Â»Ã‚ÂºÃƒÂ¥Ã‚Â®Ã…â€™ÃƒÂ¦Ã‹â€ Ã‚ÂÃƒÂ¦Ã¢â‚¬â€Ã‚Â¶ÃƒÂ§Ã‚Â«Ã¢â‚¬Â¹ÃƒÂ¥Ã‚ÂÃ‚Â³ÃƒÂ¨Ã‚Â¿Ã¢â‚¬ÂÃƒÂ¥Ã¢â‚¬ÂºÃ…Â¾ÃƒÂ§Ã‚Â»Ã¢â‚¬Å“ÃƒÂ¦Ã…Â¾Ã…â€œ
                resolve({
                    buildId,
                    status: buildStatus,
                    result: buildResult,
                    error: buildError,
                    message: getBuildStatusMessage(buildStatus)
                });
            })
            .catch(error => {
                buildStatus = 'failed';
                buildError = error.message;
                console.error(`[Build ${buildId}] Build failed:`, error.message);
                
                // ÃƒÂ¦Ã…Â¾Ã¢â‚¬Å¾ÃƒÂ¥Ã‚Â»Ã‚ÂºÃƒÂ¥Ã‚Â¤Ã‚Â±ÃƒÂ¨Ã‚Â´Ã‚Â¥ÃƒÂ¦Ã¢â‚¬â€Ã‚Â¶ÃƒÂ§Ã‚Â«Ã¢â‚¬Â¹ÃƒÂ¥Ã‚ÂÃ‚Â³ÃƒÂ¨Ã‚Â¿Ã¢â‚¬ÂÃƒÂ¥Ã¢â‚¬ÂºÃ…Â¾ÃƒÂ§Ã‚Â»Ã¢â‚¬Å“ÃƒÂ¦Ã…Â¾Ã…â€œ
                resolve({
                    buildId,
                    status: buildStatus,
                    result: buildResult,
                    error: buildError,
                    message: getBuildStatusMessage(buildStatus)
                });
            });
        
        // 60ÃƒÂ§Ã‚Â§Ã¢â‚¬â„¢ÃƒÂ¥Ã‚ÂÃ…Â½ÃƒÂ¨Ã‚Â¿Ã¢â‚¬ÂÃƒÂ¥Ã¢â‚¬ÂºÃ…Â¾ÃƒÂ¥Ã‚Â½Ã¢â‚¬Å“ÃƒÂ¥Ã¢â‚¬Â°Ã‚ÂÃƒÂ§Ã…Â Ã‚Â¶ÃƒÂ¦Ã¢â€šÂ¬Ã‚Â
        setTimeout(() => {
            if (buildStatus === 'pending') {
                buildStatus = 'timeout';
                console.log(`[Build ${buildId}] Build timeout after 60s, but worker continues in background`);
                
                resolve({
                    buildId,
                    status: buildStatus,
                    result: buildResult,
                    error: buildError,
                    message: getBuildStatusMessage(buildStatus)
                });
            }
            // ÃƒÂ¥Ã‚Â¦Ã¢â‚¬Å¡ÃƒÂ¦Ã…Â¾Ã…â€œÃƒÂ¦Ã…Â¾Ã¢â‚¬Å¾ÃƒÂ¥Ã‚Â»Ã‚ÂºÃƒÂ¥Ã‚Â·Ã‚Â²ÃƒÂ§Ã‚Â»Ã‚ÂÃƒÂ¥Ã‚Â®Ã…â€™ÃƒÂ¦Ã‹â€ Ã‚ÂÃƒÂ¯Ã‚Â¼Ã…â€™ÃƒÂ¤Ã‚Â¸Ã‚ÂÃƒÂ©Ã…â€œÃ¢â€šÂ¬ÃƒÂ¨Ã‚Â¦Ã‚ÂÃƒÂ¥Ã¢â‚¬Â Ã‚ÂÃƒÂ¦Ã‚Â¬Ã‚Â¡resolve
        }, 60000); // 60ÃƒÂ§Ã‚Â§Ã¢â‚¬â„¢ÃƒÂ¨Ã‚Â¶Ã¢â‚¬Â¦ÃƒÂ¦Ã¢â‚¬â€Ã‚Â¶
    });
}

// ÃƒÂ¦Ã…Â¾Ã¢â‚¬Å¾ÃƒÂ¥Ã‚Â»Ã‚ÂºÃƒÂ§Ã…Â Ã‚Â¶ÃƒÂ¦Ã¢â€šÂ¬Ã‚ÂÃƒÂ¦Ã‚Â¶Ã‹â€ ÃƒÂ¦Ã‚ÂÃ‚Â¯
function getBuildStatusMessage(status) {
    const messages = {
        pending: 'Build is starting...',
        success: 'Build completed successfully',
        failed: 'Build failed',
        timeout: 'Build timeout after 60s, but continues in background'
    };
    return messages[status] || 'Unknown build status';
}

function buildAstroFrontend(settings, options = {}) {
    const granularity = normalizeBuildGranularity(options.granularity);
    const codeDir = path.resolve(settings.frontendCodeDir || DEFAULT_BUILD_SETTINGS.frontendCodeDir);
    const targetDir = path.resolve(settings.frontendBuildTargetDir || `/var/www/${settings.frontendUrl || DEFAULT_BUILD_SETTINGS.frontendUrl}`);

    if (!fs.existsSync(codeDir)) {
        throw new Error(`Frontend code dir not found: ${codeDir}`);
    }
    if (!path.isAbsolute(targetDir) || targetDir === path.parse(targetDir).root) {
        throw new Error(`Invalid build target dir: ${targetDir}`);
    }

    syncAstroBuildSettings(codeDir);
    execSync('npm run build', {
        cwd: codeDir,
        stdio: 'inherit',
        env: process.env,
    });

    const distDir = path.join(codeDir, 'dist');
    if (!fs.existsSync(distDir)) {
        throw new Error(`Build output not found: ${distDir}`);
    }

    const syncResult = syncBuildOutputByGranularity(distDir, targetDir, granularity);

    return { codeDir, targetDir, granularity: syncResult.granularity, copiedPaths: syncResult.copiedPaths };
}

// Dev Static Link Helper
// Ensures that even if started without start.sh, or if links are missing,
// we try to bind the upload folder to the frontend public folder.
function ensureDevSymlink() {
    try {
        // Detect if we are in the monorepo structure
        // ../chronicle-frontend/public
        const frontendPublic = path.resolve(__dirname, '../chronicle-frontend/public');
        if (fs.existsSync(frontendPublic)) {
            const targetParent = path.join(frontendPublic, 'server/data');
            const targetLink = path.join(targetParent, 'upload');
            
            if (!fs.existsSync(targetParent)) {
                fs.mkdirSync(targetParent, { recursive: true });
            }

            if (!fs.existsSync(targetLink)) {
                // Ensure source exists
                if (fs.existsSync(UPLOAD_DIR)) {
                     // Check if targetLink is a broken link
                     try { fs.unlinkSync(targetLink); } catch(e) {}
                     fs.symlinkSync(UPLOAD_DIR, targetLink, 'dir');
                     console.log('[Dev] Created static asset symlink:', targetLink);
                }
            }
        }
    } catch (e) {
        // Silent fail - permission or structure issues
    }
}
// Run once on startup
ensureDevSymlink();

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(BACKGROUND_DIR)) fs.mkdirSync(BACKGROUND_DIR, { recursive: true });
CATEGORIES.forEach(cat => {
    const catDir = path.join(UPLOAD_DIR, cat);
    if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
});
if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR, { recursive: true });
if (!fs.existsSync(INDEX_FILE)) fs.writeFileSync(INDEX_FILE, '[]');

// Encryption Setup
const ALGORITHM = 'aes-256-cbc';
const SECRET_KEY = crypto.scryptSync('chronicle-secret-key-123', 'salt', 32);

// CDN purge config from env (for Alibaba Cloud)
const ALIYUN_ACCESS_KEY_ID = process.env.ALIYUN_ACCESS_KEY_ID || '';
const ALIYUN_ACCESS_KEY_SECRET = process.env.ALIYUN_ACCESS_KEY_SECRET || '';
const CDN_API_ENDPOINT = process.env.CDN_API_ENDPOINT || 'https://cdn.aliyuncs.com/';
// Optional switch to enable/disable CDN purge behaviour.
// Currently hard-coded OFF for safety. To enable later, set this to read from env as before.
const ENABLE_CDN_PURGE = false;

function percentEncode(str) {
    return encodeURIComponent(str)
        .replace(/\+/g, '%20')
        .replace(/\*/g, '%2A')
        .replace(/%7E/g, '~');
}

async function aliyunCdnRefresh(urls = []) {
    if (!ENABLE_CDN_PURGE) {
        console.log('[CDN] Purge disabled by ENABLE_CDN_PURGE env var');
        return;
    }
    if (!ALIYUN_ACCESS_KEY_ID || !ALIYUN_ACCESS_KEY_SECRET || !urls || urls.length === 0) {
        console.log('[CDN] Skipping CDN refresh - missing creds or urls');
        return;
    }

    try {
        const params = {
            Format: 'JSON',
            Version: '2018-05-10',
            AccessKeyId: ALIYUN_ACCESS_KEY_ID,
            SignatureMethod: 'HMAC-SHA1',
            Timestamp: new Date().toISOString(),
            SignatureVersion: '1.0',
            SignatureNonce: Math.random().toString(36).slice(2),
            Action: 'RefreshObjectCaches'
        };

        // ObjectPath.N entries
        urls.forEach((u, i) => { params[`ObjectPath.${i+1}`] = u; });
        params.ObjectType = 'File';

        // Canonicalize
        const keys = Object.keys(params).sort();
        const canonicalized = keys.map(k => `${percentEncode(k)}=${percentEncode(String(params[k]))}`).join('&');
        const stringToSign = `GET&%2F&${percentEncode(canonicalized)}`;

        const sign = crypto.createHmac('sha1', ALIYUN_ACCESS_KEY_SECRET + '&').update(stringToSign).digest('base64');
        const finalParams = { Signature: sign, ...params };

        const qs = Object.keys(finalParams).map(k => `${percentEncode(k)}=${percentEncode(String(finalParams[k]))}`).join('&');
        const url = `${CDN_API_ENDPOINT}?${qs}`;

        // Fire request (GET)
        console.log('[CDN] Purge request URL:', url.replace(/(AccessKeyId=)[^&]+/, '$1****'));
        const resp = await fetch(url, { method: 'GET', timeout: 10000 });
        const body = await resp.text();
        console.log('[CDN] Purge response:', resp.status, body);
    } catch (e) {
        console.error('[CDN] Purge error', e);
    }
}

// --- Front Matter Helpers ---
function parseFrontMatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { attributes: {}, body: content };
    
    const attributes = {};
    match[1].split('\n').forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const value = parts.slice(1).join(':').trim();
            if (key === 'tags') {
                try { attributes[key] = JSON.parse(value); } catch(e) { attributes[key] = []; }
            } else {
                attributes[key] = value;
            }
        }
    });
    return { attributes, body: match[2] };
}

function stringifyFrontMatter(attributes, body) {
    let fm = '---\n';
    if (attributes.title) fm += `title: ${attributes.title}\n`;
    if (attributes.date) fm += `date: ${attributes.date}\n`;
    if (attributes.font) fm += `font: ${attributes.font}\n`;
    if (attributes.author) fm += `author: ${attributes.author}\n`;
    if (typeof attributes.aiGenerated === 'boolean') fm += `aiGenerated: ${attributes.aiGenerated}\n`;
    if (attributes.tags) fm += `tags: ${JSON.stringify(attributes.tags)}\n`;
    fm += '---\n';
    return fm + body;
}

// Helper: get directory path for a post (supports legacy filename)
function getPostDir(post) {
    if (!post) return '';
    const dirName = post.dir || (post.filename ? post.filename.replace(/\.md$/, '') : post.id);
    return path.join(POSTS_DIR, String(dirName || ''));
}

function isValidId(id) {
    return typeof id === 'string' && /^[0-9a-fA-F\-]+$/.test(id)
}

function readPostContentFromDisk(post) {
    const dir = getPostDir(post)
    const id = post.id
    if (!isValidId(id)) return ''
    const expectedName = `${id}-content.md`
    const p = path.join(dir, expectedName)
    if (fs.existsSync(p)) {
        let raw = fs.readFileSync(p, 'utf-8')
        try { raw = decrypt(raw) } catch(e) {}
        const { body } = parseFrontMatter(raw)
        return body
    }
    // Fallback to legacy filename if present and appears to match id
    if (post.filename && post.filename.startsWith(id)) {
        const legacy = path.join(POSTS_DIR, post.filename)
        if (fs.existsSync(legacy)) {
            let raw = fs.readFileSync(legacy, 'utf-8')
            try { raw = decrypt(raw) } catch(e) {}
            const { body } = parseFrontMatter(raw)
            return body
        }
    }
    return ''
}

function writePostContentToDisk(post, content, options = {}) {
    // options: { draft: boolean }
    const dir = getPostDir(post)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const id = post.id
    if (!isValidId(id)) throw new Error('Invalid post id')
    const filename = options.draft ? `${id}-draft.md` : `${id}-content.md`
    const full = stringifyFrontMatter({ title: post.title, date: post.date, updatedAt: post.updatedAt, tags: post.tags || [], font: post.font || 'sans' }, content || '')
    const encrypted = encrypt(full)
    fs.writeFileSync(path.join(dir, filename), encrypted)
}

function writeCompiledHtmlToDisk(post, html) {
    const dir = getPostDir(post)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const id = post.id
    if (!isValidId(id)) throw new Error('Invalid post id')
    fs.writeFileSync(path.join(dir, `${id}-compiled.html`), html || '')
}

function writeTocToDisk(post, toc) {
    const dir = getPostDir(post)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const id = post.id
    if (!isValidId(id)) throw new Error('Invalid post id')
    fs.writeFileSync(path.join(dir, `${id}-toc.json`), JSON.stringify(toc || []))
}

function readCompiledHtmlFromDisk(post) {
    const dir = getPostDir(post)
    const id = post.id
    if (!isValidId(id)) return ''
    const p = path.join(dir, `${id}-compiled.html`)
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8')
    return ''
}

function readTocFromDisk(post) {
    const dir = getPostDir(post)
    const id = post.id
    if (!isValidId(id)) return []
    const p = path.join(dir, `${id}-toc.json`)
    if (fs.existsSync(p)) {
        try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch(e) { return [] }
    }
    return []
}

// Ensure Index Consistency on Startup
function syncIndexWithFiles() {
    try {
        if (!fs.existsSync(INDEX_FILE)) return;
        let posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
        let modified = false;

        posts.forEach(post => {
            // Support new per-post directory layout: POSTS_DIR/<id>/<id>-content.md
            const dirName = post.dir || (post.filename ? post.filename.replace(/\.md$/, '') : post.id);
            const dirPath = path.join(POSTS_DIR, dirName || '')
            const expected = path.join(dirPath, `${post.id}-content.md`)
            let mdPath = ''
            if (fs.existsSync(expected)) {
                mdPath = expected
            } else if (post.filename && fs.existsSync(path.join(POSTS_DIR, post.filename))) {
                mdPath = path.join(POSTS_DIR, post.filename)
            }

            if (mdPath && fs.existsSync(mdPath)) {
                let content = fs.readFileSync(mdPath, 'utf-8');
                try { content = decrypt(content); } catch(e) {}
                
                const { attributes } = parseFrontMatter(content);
                if (attributes.font && attributes.font !== post.font) {
                    post.font = attributes.font;
                    modified = true;
                    console.log(`[Sync] Updated font for ${post.id} from file metadata: ${post.font}`);
                }
                const author = typeof attributes.author === 'string' ? attributes.author.trim() : '';
                if ((author || '') !== (post.author || '')) {
                    post.author = author;
                    modified = true;
                    console.log(`[Sync] Updated author for ${post.id} from file metadata`);
                }
                const aiGenerated = attributes.aiGenerated === true || attributes.aiGenerated === 'true' || attributes.aiGenerated === '1';
                if (!!aiGenerated !== !!post.aiGenerated) {
                    post.aiGenerated = !!aiGenerated;
                    modified = true;
                    console.log(`[Sync] Updated aiGenerated for ${post.id} from file metadata`);
                }
            }
        });

        if (modified) {
            fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2));
            console.log('[Sync] Index updated based on file metadata');
        }
    } catch (e) {
        console.error('[Sync] Failed to sync index:', e);
    }
}
syncIndexWithFiles();

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  const [ivHex, encryptedText] = text.split(':');
  if (!ivHex || !encryptedText) return '';
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function hashPassword(pwd) {
    return crypto.scryptSync(pwd, 'chronicle-salt', 64).toString('hex');
}

// Passkey Globals
const isDev = process.argv.includes('--dev');

let RP_ID = 'localhost';
let ORIGIN = 'http://localhost:5173';

if (!isDev) {
    // try to get from env or fallback
    RP_ID = process.env.FRONTEND_DOMAIN || process.env.RP_ID || 'blog.eightyfor.top';
    ORIGIN = process.env.ORIGIN || (RP_ID === 'localhost' ? 'http://localhost:3000' : `https://${RP_ID}`);
} 
// MEDIA_DOMAIN controls the public base URL for uploaded media files.
// Set via environment variable in production: MEDIA_DOMAIN=https://file.eightyfor.top
const MEDIA_DOMAIN = (process.env.MEDIA_DOMAIN && process.env.MEDIA_DOMAIN.replace(/\/$/, '')) || (isDev ? 'http://localhost:3000' : 'https://file.eightyfor.top');
console.log('Passkey Config:', { RP_ID, ORIGIN });
const passkeyChallenges = new Map();
const verificationCodes = new Map();

// Middlewares
// Use JSON parser for everything EXCEPT upload endpoint which needs raw stream
// ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â  limit ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¨ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¶ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¼ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â  413 ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â®ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“
app.use((req, res, next) => {
    if (req.path === '/api/upload') {
        next();
    } else {
        // Apply JSON parser with proper error handling
        express.json({ 
            limit: '100mb',
            verify: (req, res, buf) => {
                // Log raw request body for debugging
                if (buf && buf.length > 0) {
                    console.log('[JSON Parser] Raw request body:', buf.toString('utf8').substring(0, 500));
                }
            }
        })(req, res, (err) => {
            if (err) {
                console.error('[JSON Parser] Error:', err.message);
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid JSON in request body' 
                });
            }
            next();
        });
    }
});

// --- ROUTES ---

// 1. Static File Serving (Mimic /server/data/upload/...)
// Frontend requests: /server/data/upload/pic/xxx.png
app.use('/server/data/upload', express.static(UPLOAD_DIR, {
    maxAge: '7d',
    immutable: true
}));

app.use('/server/data/background', express.static(BACKGROUND_DIR, {
    maxAge: '7d',
    immutable: true
}));

// Thumbnail endpoint: /thumb/<category>/<file>
// Tries to generate a cached thumbnail under UPLOAD_DIR/.thumbs
let sharpLib = null;
try {
    sharpLib = require('sharp');
} catch (e) {
    // sharp not installed - thumbnails will fallback to original image
    console.log('[Thumb] sharp not available, thumbnails will fallback to original images');
}

app.get('/thumb/*', async (req, res) => {
    try {
        const rel = req.path.replace(/^\/thumb\//, '').replace(/^\/+/, '');
        const target = path.resolve(UPLOAD_DIR, rel);
        if (!target.startsWith(UPLOAD_DIR) || !fs.existsSync(target)) {
            return res.status(404).send('Not found');
        }

        // cached thumbs dir
        const thumbBase = path.join(UPLOAD_DIR, '.thumbs');
        const thumbPath = path.join(thumbBase, rel);
        const thumbDir = path.dirname(thumbPath);

        // Ensure thumb dir exists
        if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

        // If sharp available, create thumbnail if needed
        if (sharpLib) {
            let needCreate = true;
            try {
                if (fs.existsSync(thumbPath)) {
                    const tStat = fs.statSync(thumbPath);
                    const oStat = fs.statSync(target);
                    if (tStat.mtimeMs >= oStat.mtimeMs) needCreate = false;
                }
            } catch (e) { needCreate = true; }

            if (needCreate) {
                try {
                        await sharpLib(target)
                            .resize({ width: 200, height: 200, fit: 'inside', withoutEnlargement: true })
                        .toFile(thumbPath);
                } catch (e) {
                    console.error('[Thumb] failed to generate thumb for', target, e.message || e);
                    // fallback to original
                    return res.sendFile(target);
                }
            }

            res.setHeader('Cache-Control', 'public, max-age=2592000, immutable'); // 30 days
            return res.sendFile(thumbPath);
        }

        // sharp not available -> just serve original image
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        return res.sendFile(target);
    } catch (e) {
        console.error('[Thumb] error', e);
        res.status(500).send('Error');
    }
});


// 2. Auth - Passkey
// Code Verification Routes
app.get('/api/auth/code/generate', (req, res) => {
    // Simple mock auth check - in prod check session
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes.set('admin', { 
        code, 
        expires: Date.now() + 5 * 60 * 1000 
    });
    console.log('Generated code:', code);
    res.json({ code, expiresIn: 300 });
});

app.post('/api/auth/code/verify', (req, res) => {
    const { code } = req.body;
    const stored = verificationCodes.get('admin');
    
    if (!stored) return res.status(400).json({ success: false, message: 'No code active' });
    if (Date.now() > stored.expires) {
        verificationCodes.delete('admin');
        return res.status(400).json({ success: false, message: 'Code expired' });
    }
    
    if (stored.code === code) {
        verificationCodes.delete('admin');
        res.json({ success: true, token: 'session-valid' });
    } else {
        res.status(400).json({ success: false, message: 'Invalid code' });
    }
});

app.post('/api/auth/passkey/register/options', async (req, res) => {
    const user = 'admin';
    const reqOrigin = req.get('origin') || ORIGIN;
    let reqRPID = RP_ID;
    try { if (reqOrigin) reqRPID = new URL(reqOrigin).hostname; } catch(e){}

    const options = await generateRegistrationOptions({
        rpName: 'Chronicle Blog',
        rpID: reqRPID,
        userID: new Uint8Array(Buffer.from(user)),
        userName: user,
        timeout: 60000,
    });
    passkeyChallenges.set(user, options.challenge);
    res.json(options);
});

app.post('/api/auth/passkey/register/verify', async (req, res) => {
    try {
        const { response } = req.body;
        const user = 'admin';
        const expectedChallenge = passkeyChallenges.get(user);
        
        if (!expectedChallenge) return res.status(400).json({ error: 'No challenge' });

        const reqOrigin = req.get('origin') || ORIGIN;
        let reqRPID = RP_ID;
        try { if (reqOrigin) reqRPID = new URL(reqOrigin).hostname; } catch(e){}

        const verification = await verifyRegistrationResponse({
            response,
            expectedChallenge,
            expectedOrigin: reqOrigin,
            expectedRPID: reqRPID,
        });

        if (verification.verified && verification.registrationInfo) {
            passkeyChallenges.delete(user);
            
            if (!fs.existsSync(SECURITY_FILE)) {
                const defaultHash = hashPassword('admin');
                fs.writeFileSync(SECURITY_FILE, JSON.stringify({ passwordHash: defaultHash, devices: [] }));
            }
            
            const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
            if (!saved.devices) saved.devices = [];
            
            const { credential } = verification.registrationInfo;
            // ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¨ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¨ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â®ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹
            const deviceName = os.hostname();
            const ua = req.headers['user-agent'] || '';
            const deviceType = getDeviceTypeFromUA(ua);
            const dateStr = new Date().toLocaleDateString();
            
            // Format: "Device (Type, Date)" e.g. "MyMac (Mac, 2/12/2026)"
            let finalName = req.query.name || `${deviceName} (${deviceType}, ${dateStr})`;
            
            saved.devices.push({
                credentialID: credential.id,
                credentialPublicKey: Buffer.from(credential.publicKey).toString('base64url'),
                counter: credential.counter,
                transports: response.response.transports,
                name: finalName,
                createdAt: new Date().toISOString()
            });
            
            fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
            res.json({ verified: true });
        } else {
            res.status(400).json({ verified: false });
        }
    } catch (e) {
        console.error(e);
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/auth/passkey/login/options', async (req, res) => {
    const user = 'admin';
    const reqOrigin = req.get('origin') || ORIGIN;
    let reqRPID = RP_ID;
    try { if (reqOrigin) reqRPID = new URL(reqOrigin).hostname; } catch(e){}

    const options = await generateAuthenticationOptions({
            rpID: reqRPID,
            userVerification: 'preferred',
    });
    passkeyChallenges.set(user, options.challenge);
    res.json(options);
});

app.post('/api/auth/passkey/login/verify', async (req, res) => {
    try {
        const { response } = req.body;
        const user = 'admin';
        const expectedChallenge = passkeyChallenges.get(user);

        if (!fs.existsSync(SECURITY_FILE)) return res.status(400).send('No devices registered');
        const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
        const devices = saved.devices || [];
        
        const device = devices.find(d => d.credentialID === response.id);
        if (!device) return res.status(400).send('Device not found');

        const reqOrigin = req.get('origin') || ORIGIN;
        let reqRPID = RP_ID;
        try { if (reqOrigin) reqRPID = new URL(reqOrigin).hostname; } catch(e){}

        const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge: expectedChallenge || '',
            expectedOrigin: reqOrigin,
            expectedRPID: reqRPID,
            credential: {
                id: device.credentialID,
                publicKey: new Uint8Array(Buffer.from(device.credentialPublicKey, 'base64url')),
                counter: device.counter,
                transports: device.transports,
            },
        });

        if (verification.verified) {
            passkeyChallenges.delete(user);
            device.counter = verification.authenticationInfo.newCounter;
            fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
            res.json({ verified: true, token: 'session-valid' });
        } else {
            res.status(400).json({ verified: false });
        }
    } catch(e) {
        console.error(e);
        res.status(400).json({ error: e.message });
    }
});

app.get('/api/auth/passkeys', (req, res) => {
    if (!requireAdminToken(req, res)) return;
    try {
        if (!fs.existsSync(SECURITY_FILE)) return res.json([]);
        const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
        const devices = (saved.devices || []).map(d => ({
            id: d.credentialID,
            name: d.name || 'Unnamed Passkey',
            createdAt: d.createdAt || '',
            transports: d.transports
        }));
        res.json(devices);
    } catch(e) {
        res.status(500).json([]);
    }
});

app.delete('/api/auth/passkeys/:id', (req, res) => {
    if (!requireAdminToken(req, res)) return;
    try {
        const { id } = req.params;
        if (!fs.existsSync(SECURITY_FILE)) return res.status(404).send('No file');
        
        const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
        if (!saved.devices) return res.status(404).send('Not found');
        
        const initialLen = saved.devices.length;
        saved.devices = saved.devices.filter(d => d.credentialID !== id);
        
        if (saved.devices.length === initialLen) {
            return res.status(404).send('Not found');
        }

        fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
        res.json({ success: true });
    } catch(e) {
        res.status(500).send('Error');
    }
});

app.patch('/api/auth/passkeys/:id', (req, res) => {
    if (!requireAdminToken(req, res)) return;
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!fs.existsSync(SECURITY_FILE)) return res.status(404).send('No file');
        
        const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
        const device = (saved.devices || []).find(d => d.credentialID === id);
        
        if (!device) return res.status(404).send('Not found');
        
        device.name = name || device.name;
        fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
        res.json({ success: true });
    } catch(e) {
        res.status(500).send('Error');
    }
});


// 3. Auth - Normal
app.post('/api/auth/login', (req, res) => {
    try {
        const { password } = req.body;
        
        if (!fs.existsSync(SECURITY_FILE)) {
            const defaultHash = hashPassword('admin');
            fs.writeFileSync(SECURITY_FILE, JSON.stringify({ passwordHash: defaultHash }));
        }
        
        const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
        const attemptHash = hashPassword(password);
        
        if (saved.passwordHash === attemptHash) {
            if (saved.devices && saved.devices.length > 0) {
                res.json({ success: true, requirePasskey: true });
            } else {
                res.json({ success: true, token: 'session-valid' });
            }
        } else {
            res.status(401).json({ success: false, message: 'Invalid password' });
        }
    } catch (e) {
        res.status(500).send('Error');
    }
});

app.post('/api/auth/change', (req, res) => {
    try {
        const { oldPassword, newPassword, token } = req.body;
        
        if (!fs.existsSync(SECURITY_FILE)) {
            const newHash = hashPassword(newPassword);
            fs.writeFileSync(SECURITY_FILE, JSON.stringify({ passwordHash: newHash }));
            return res.json({ success: true });
        }

        const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
        const oldHash = hashPassword(oldPassword);

        if (saved.passwordHash === oldHash) {
            // Check 2FA if enabled
            if (saved.devices && saved.devices.length > 0) {
                if (token !== 'session-valid') {
                    return res.json({ success: false, requirePasskey: true });
                }
            }

            const newHash = hashPassword(newPassword);
            saved.passwordHash = newHash; // Keep devices
            fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false, message: 'Old password incorrect' });
        }
    } catch(e) {
        res.status(500).send('Error');
    }
});


// 4. Files API
app.get('/api/files', (req, res) => {
    const queryPath = req.query.path || '';

    if (queryPath === 'all') {
            let allFiles = [];
            CATEGORIES.forEach(cat => {
                const catDir = path.join(UPLOAD_DIR, cat);
                if (fs.existsSync(catDir)) {
                    try {
                        const files = fs.readdirSync(catDir, { withFileTypes: true })
                        .filter(d => !d.isDirectory())
                        .map(dirent => {
                            const relPath = `${cat}/${dirent.name}`;
                            const fullUrl = `${MEDIA_DOMAIN}/server/data/upload/${relPath}`;
                            // Construct thumb URL if likely an image (simple check via cat or ext)
                            // We use /thumb/ route which handles existence check or fallback
                                const thumbUrl = ['pic'].includes(cat)
                                    ? `${MEDIA_DOMAIN}/server/data/upload/.thumbs/${relPath}`
                                : undefined;
                                
                            return {
                                name: dirent.name,
                                type: 'file',
                                category: cat,
                                path: relPath,
                                url: fullUrl,
                                thumb: thumbUrl
                            };
                        });
                        allFiles = allFiles.concat(files);
                    } catch(e) {}
                }
            });

            return res.json(allFiles);
    }

    const targetDir = path.resolve(UPLOAD_DIR, queryPath.replace(/^\/+/, ''));
    if (!targetDir.startsWith(UPLOAD_DIR)) {
        return res.status(403).send('Forbidden');
    }
    if (!fs.existsSync(targetDir)) {
        return res.json([]);
    }

    try {
        const items = fs.readdirSync(targetDir, { withFileTypes: true }).map(dirent => {
            const rel = path.relative(UPLOAD_DIR, path.join(targetDir, dirent.name)).replace(/\\/g, '/');
            const isDir = dirent.isDirectory();
            const fullUrl = `${MEDIA_DOMAIN}/server/data/upload/${rel}`;
            
            // Determine thumb
            // If we are listing a specific path (e.g. 'pic'), we can infer category logic
            // Or just check extension
            let thumbUrl;
            if (!isDir) {
                const ext = path.extname(dirent.name).toLowerCase();
                if (['.png','.jpg','.jpeg','.gif','.svg','.webp','.ico','.bmp','.tiff'].includes(ext)) {
                         thumbUrl = `${MEDIA_DOMAIN}/server/data/upload/.thumbs/${rel}`;
                }
            }

            return {
                name: dirent.name,
                type: isDir ? 'directory' : 'file',
                path: rel,
                url: fullUrl,
                thumb: thumbUrl
            };
        });
        res.json(items);
    } catch (e) {
        res.status(500).send('Error listing files');
    }
});

// 5. Settings API - read/write a simple JSON file under server/data/settings.json
app.get('/api/settings', (req, res) => {
    try {
        const saved = getBuildSettings();
        res.json(saved);
    } catch (e) {
        console.error('[Settings] GET error', e);
        res.status(500).json({});
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        const body = req.body || {};
        let saved = {};
        if (fs.existsSync(SETTINGS_FILE)) {
            try { saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) } catch(e) { saved = {} }
        }

        // Merge incoming values first.
        saved = Object.assign({}, saved, body);

        const frontendBackgroundMeta = parseBackgroundLikeValue(saved.frontendBackgroundMeta);
        const backendBackgroundMeta = parseBackgroundLikeValue(saved.backendBackgroundMeta);

        if (frontendBackgroundMeta && typeof frontendBackgroundMeta === 'object') {
            const compression = await computeBackgroundCompression(frontendBackgroundMeta, saved.frontendBackground);
            frontendBackgroundMeta.compressionFactor = compression;
            frontendBackgroundMeta.compression = compression;
            frontendBackgroundMeta.bgCompression = compression;
            saved.frontendBackgroundCompression = compression;
            saved.frontendBackgroundMeta = JSON.stringify(frontendBackgroundMeta);
        }

        if (backendBackgroundMeta && typeof backendBackgroundMeta === 'object') {
            const compression = await computeBackgroundCompression(backendBackgroundMeta, saved.backendBackground);
            backendBackgroundMeta.compressionFactor = compression;
            backendBackgroundMeta.compression = compression;
            backendBackgroundMeta.bgCompression = compression;
            saved.backendBackgroundCompression = compression;
            saved.backendBackgroundMeta = JSON.stringify(backendBackgroundMeta);
        }

        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(saved, null, 2));
        res.json(saved);
    } catch (e) {
        console.error('[Settings] POST error', e);
        res.status(500).send('Error');
    }
});

app.get('/api/traffic', async (req, res) => {
    try {
        const range = typeof req.query.range === 'string' && req.query.range.trim()
            ? req.query.range.trim()
            : (typeof req.query.days === 'string' && req.query.days.trim() ? req.query.days.trim() : '1d');
        const gaPayload = await buildTrafficGaPayload(range);
        const payload = gaPayload || buildTrafficPayload(range);
        res.set('Cache-Control', 'no-store');
        res.json(payload);
    } catch (e) {
        console.error('[Traffic] GET error', e);
        res.status(500).json(makeTrafficEmptyPayload('1d'));
    }
});

// Collections API - store/load collections under server/data/collection.json
app.get('/api/collections', (req, res) => {
    try {
        if (!fs.existsSync(COLLECTION_FILE)) return res.json({ collections: [] });
        const data = JSON.parse(fs.readFileSync(COLLECTION_FILE, 'utf-8') || '{}') || {};
        return res.json(data);
    } catch (e) {
        console.error('[Collections] GET error', e);
        return res.status(500).json({ collections: [] });
    }
});

app.post('/api/collections', (req, res) => {
    try {
        const body = req.body || {};
        let oldSaved = {};
        if (fs.existsSync(COLLECTION_FILE)) {
            try { oldSaved = JSON.parse(fs.readFileSync(COLLECTION_FILE, 'utf-8')) || {} } catch(e) { oldSaved = {} }
        }

        const oldCollections = Array.isArray(oldSaved.collections) ? oldSaved.collections : [];
        const newSaved = Object.assign({}, oldSaved);

        // Merge top-level, but ensure collections is an array
        if (Array.isArray(body.collections)) {
            newSaved.collections = body.collections;
        } else {
            Object.assign(newSaved, body);
        }

        // Helper: sanitize collections (remove post nodes with empty id)
        function sanitizeCollections(collections) {
            if (!Array.isArray(collections)) return [];
            function sanitizeNodes(nodes) {
                if (!Array.isArray(nodes)) return [];
                const out = [];
                for (const node of nodes) {
                    if (!node) continue;
                    if (node.type === 'post') {
                        const id = String(node.id || '').trim();
                        if (!id) continue; // skip posts with empty id
                        out.push({ ...node, id });
                    } else if (node.type === 'group') {
                        const children = sanitizeNodes(node.children || []);
                        out.push(Object.assign({}, node, { children }));
                    } else {
                        // unknown node shape: preserve if has children after sanitize
                        const children = sanitizeNodes(node.children || []);
                        if (children.length > 0) out.push(Object.assign({}, node, { children }));
                    }
                }
                return out;
            }

            const outCols = [];
            for (const col of collections) {
                if (!col) continue;
                const nodes = sanitizeNodes(col.nodes || []);
                outCols.push(Object.assign({}, col, { nodes }));
            }
            return outCols;
        }

        // Helper: traverse collections and build map postId -> { name, path }
        function buildPostMap(collections) {
            const map = Object.create(null);
            if (!Array.isArray(collections)) return map;

            function traverseNodes(nodes, pathPrefix, collectionName) {
                if (!Array.isArray(nodes)) return;
                for (let i = 0; i < nodes.length; i++) {
                    const node = nodes[i];
                    const nodePath = `${pathPrefix}/${i}`;
                    if (!node) continue;
                    if (node.type === 'post') {
                        const id = String(node.id || '').trim();
                        if (id) {
                            // Keep last occurrence if duplicated in collections (client intent overrides)
                            map[id] = { collectionName: collectionName || '', nodePath };
                        }
                    } else if (node.type === 'group') {
                        traverseNodes(node.children, nodePath, collectionName);
                    } else {
                        // heuristics: if node has children treat as group, else ignore
                        if (Array.isArray(node.children)) traverseNodes(node.children, nodePath, collectionName);
                    }
                }
            }

            for (let ci = 0; ci < collections.length; ci++) {
                const col = collections[ci];
                const name = col && col.name ? String(col.name) : '';
                traverseNodes(col.nodes, `r/${ci}`, name);
            }

            return map;
        }

        // sanitize new collections to avoid saving empty post nodes
        newSaved.collections = sanitizeCollections(newSaved.collections || []);

        const oldMap = buildPostMap(oldCollections);
        const newMap = buildPostMap(newSaved.collections || []);

        // compute diffs
        const idsToAddOrUpdate = [];
        const idsToRemove = [];

        // additions or changed mappings
        for (const id of Object.keys(newMap)) {
            const nm = newMap[id];
            const om = oldMap[id];
            if (!om || om.collectionName !== nm.collectionName || om.nodePath !== nm.nodePath) idsToAddOrUpdate.push(id);
        }

        // removed from collections or moved
        for (const id of Object.keys(oldMap)) {
            if (!newMap[id]) idsToRemove.push(id);
        }

        // persist new collections file
        fs.writeFileSync(COLLECTION_FILE, JSON.stringify(newSaved, null, 2));

        // If there are changes, update posts index incrementally
        if (idsToAddOrUpdate.length > 0 || idsToRemove.length > 0) {
            try {
                let posts = [];
                try { posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8') || '[]'); } catch (e) { posts = [] }

                const postById = Object.create(null);
                posts.forEach(p => { if (p && p.id) postById[String(p.id)] = p; });

                let modified = false;

                // Remove collection fields for removed ids
                for (const id of idsToRemove) {
                    const p = postById[id];
                    if (p && (p.collection || p.collectionPath)) {
                        delete p.collection;
                        delete p.collectionPath;
                        modified = true;
                        console.log(`[Collections] Cleared collection for post ${id}`);
                    }
                }

                // Add/update for additions
                for (const id of idsToAddOrUpdate) {
                    const mapping = newMap[id];
                    if (!mapping) continue;
                    const p = postById[id];
                    if (p) {
                        const collName = mapping.collectionName || '';
                        const collPath = mapping.nodePath || '';
                        if (p.collection !== collName || p.collectionPath !== collPath) {
                            p.collection = collName;
                            p.collectionPath = collPath;
                            modified = true;
                            console.log(`[Collections] Set collection=${collName} path=${collPath} for post ${id}`);
                        }
                    } else {
                        // If post not present in index, ignore (index rebuild will pick it up later)
                        console.warn(`[Collections] Post ${id} not found in index.json while applying collection mapping`);
                    }
                }

                if (modified) {
                    fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2));
                    console.log('[Collections] posts/index.json updated for collection changes');
                }
            } catch (err) {
                console.error('[Collections] Failed to update posts index for collection changes', err);
            }
        }

        res.json(newSaved);
    } catch (e) {
        console.error('[Collections] POST error', e);
        res.status(500).send('Error');
    }
});

app.get('/api/system/storage', (req, res) => {
    try {
        const settings = getBuildSettings();
        const contentPagePath = path.resolve(settings.frontendBuildTargetDir || `/var/www/${settings.frontendUrl || DEFAULT_BUILD_SETTINGS.frontendUrl}`);
        const managerDomain = resolveManagerDomain(settings);
        const managerPagePath = path.resolve(`/var/www/${managerDomain}`);
        const apiSourcePath = resolveApiSourcePath(BASE_DIR);

        const frontendBytes = safeDirectorySize(contentPagePath);
        const backendBytes = safeDirectorySize(managerPagePath);
        const apiSourceBytes = safeDirectorySize(apiSourcePath);
        const uploadBytes = safeDirectorySize(UPLOAD_DIR);
        const apiBytes = Math.max(0, apiSourceBytes - uploadBytes);

        const disk = getDiskStatsByPath(BASE_DIR);
        const serverTotalBytes = Number(disk.totalBytes) || 0;
        const serverAvailableBytes = Number(disk.availableBytes) || 0;
        const serverUsedBytes = Number(disk.usedBytes) || Math.max(0, serverTotalBytes - serverAvailableBytes);
        const knownUsedBytes = frontendBytes + backendBytes + apiBytes + uploadBytes;
        const otherBytes = Math.max(0, serverUsedBytes - knownUsedBytes);

        const segments = [
            { key: 'frontend', label: 'Content Page', bytes: frontendBytes },
            { key: 'backend', label: 'Manager Page', bytes: backendBytes },
            { key: 'api', label: 'API', bytes: apiBytes },
            { key: 'upload', label: 'Upload', bytes: uploadBytes },
            { key: 'other', label: 'Other Used', bytes: otherBytes },
            { key: 'available', label: 'Available', bytes: serverAvailableBytes },
        ].map((item) => ({
            ...item,
            ratio: serverTotalBytes > 0 ? item.bytes / serverTotalBytes : 0,
        }));

        res.json({
            generatedAt: new Date().toISOString(),
            paths: {
                frontendPath: contentPagePath,
                backendPath: managerPagePath,
                apiPath: apiSourcePath,
                uploadPath: UPLOAD_DIR,
            },
            usage: {
                frontendBytes,
                backendBytes,
                apiBytes,
                otherBytes,
                uploadBytes,
            },
            server: {
                totalBytes: serverTotalBytes,
                availableBytes: serverAvailableBytes,
                usedBytes: serverUsedBytes,
            },
            segments,
        });
    } catch (e) {
        console.error('[Storage] GET error', e);
        res.status(500).json({
            generatedAt: new Date().toISOString(),
            paths: {},
            usage: { frontendBytes: 0, backendBytes: 0, apiBytes: 0, otherBytes: 0, uploadBytes: 0 },
            server: { totalBytes: 0, availableBytes: 0, usedBytes: 0 },
            segments: [],
        });
    }
});

app.post('/api/admin/build/astro', async (req, res) => {
    try {
        if (!requireAdminToken(req, res)) return;

        console.log('[Build] Starting Astro build with 60s timeout...');
        
        const settings = getBuildSettings();
        const buildResult = await buildAstroFrontendWithTimeout(settings, {
            granularity: req.body?.granularity,
        });
        
        res.json({
            success: buildResult.status === 'success',
            message: buildResult.message,
            buildId: buildResult.buildId,
            status: buildResult.status,
            error: buildResult.error
        });
        
    } catch (e) {
        console.error('[Build] Astro build initialization failed', e);
        res.status(500).json({ success: false, message: e.message || 'Build initialization failed' });
    }
});

// Ã¦Â¸â€¦Ã§Ââ€ Ã¦Å¾â€žÃ¥Â»ÂºÃ§â€ºÂ®Ã¦Â â€¡Ã§â€ºÂ®Ã¥Â½â€¢API
app.post('/api/admin/clean/build-target', async (req, res) => {
    try {
        if (!requireAdminToken(req, res)) return;

        const { targetDir } = req.body;
        
        if (!targetDir) {
            return res.status(400).json({ success: false, message: 'Missing target directory' });
        }

        console.log('[Clean] Cleaning build target directory:', targetDir);
        
        // Ã©ÂªÅ’Ã¨Â¯ÂÃ§â€ºÂ®Ã¦Â â€¡Ã§â€ºÂ®Ã¥Â½â€¢Ã¨Â·Â¯Ã¥Â¾â€žÃ¥Â®â€°Ã¥â€¦Â¨Ã¦â‚¬Â§
        const resolvedTargetDir = path.resolve(targetDir);
        if (!resolvedTargetDir.startsWith('/var/www/')) {
            return res.status(403).json({ success: false, message: 'Invalid target directory path' });
        }

        // Ã¦Â£â‚¬Ã¦Å¸Â¥Ã§â€ºÂ®Ã¥Â½â€¢Ã¦ËœÂ¯Ã¥ÂÂ¦Ã¥Â­ËœÃ¥Å“Â¨
        if (!fs.existsSync(resolvedTargetDir)) {
            return res.status(404).json({ success: false, message: 'Target directory does not exist' });
        }

        // Ã¦Â¸â€¦Ã§Â©ÂºÃ§â€ºÂ®Ã¥Â½â€¢Ã¥â€ â€¦Ã¥Â®Â¹Ã¯Â¼Ë†Ã¤Â¿ÂÃ§â€¢â„¢Ã§â€ºÂ®Ã¥Â½â€¢Ã¦Å“Â¬Ã¨ÂºÂ«Ã¯Â¼â€°
        const files = fs.readdirSync(resolvedTargetDir);
        let cleanedCount = 0;
        
        for (const file of files) {
            const filePath = path.join(resolvedTargetDir, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory()) {
                fs.rmSync(filePath, { recursive: true, force: true });
            } else {
                fs.unlinkSync(filePath);
            }
            cleanedCount++;
        }

        console.log(`[Clean] Cleaned ${cleanedCount} items from ${resolvedTargetDir}`);
        
        res.json({
            success: true,
            message: `Cleaned ${cleanedCount} items from build target directory`,
            cleanedCount: cleanedCount
        });
        
    } catch (e) {
        console.error('[Clean] Clean operation failed', e);
        res.status(500).json({ success: false, message: e.message || 'Clean operation failed' });
    }
});

app.post('/api/folder', (req, res) => {
    try {
        const { folderPath } = req.body;
        if (!folderPath) throw new Error('Missing folderPath');
        
        const targetPath = path.resolve(UPLOAD_DIR, folderPath.replace(/^\/+/, ''));
        if (!targetPath.startsWith(UPLOAD_DIR)) return res.status(403).send('Forbidden');

        if (!fs.existsSync(targetPath)) {
            fs.mkdirSync(targetPath, { recursive: true });
        }
        res.json({ success: true });
    } catch(e) {
        res.status(500).send('Error');
    }
});

app.delete('/api/files', (req, res) => {
    const queryPath = req.query.path || '';
    const targetPath = path.resolve(UPLOAD_DIR, queryPath.replace(/^\/+/, ''));
    if (!targetPath.startsWith(UPLOAD_DIR)) return res.status(403).send('Forbidden');
    
    try {
        if (fs.existsSync(targetPath)) {
            fs.rmSync(targetPath, { recursive: true, force: true });
        }

        // Also remove cached thumbnails for this path under .thumbs
        try {
            const rel = path.relative(UPLOAD_DIR, targetPath).replace(/\\/g, '/');
            const thumbTarget = path.join(UPLOAD_DIR, '.thumbs', rel);
            // Ensure thumbTarget is inside upload dir for safety
            if (thumbTarget.startsWith(UPLOAD_DIR) && fs.existsSync(thumbTarget)) {
                fs.rmSync(thumbTarget, { recursive: true, force: true });
            }

            // Trigger CDN refresh for both origin path and thumbs path (fire-and-forget)
            (async () => {
                try {
                    const relSafe = rel.replace(/^\/+/, '');
                    if (!relSafe) return;
                    const urls = [];
                    const originUrl = `${MEDIA_DOMAIN.replace(/\/$/, '')}/server/data/upload/${relSafe}`;
                    const thumbUrl = `${MEDIA_DOMAIN.replace(/\/$/, '')}/server/data/upload/.thumbs/${relSafe}`;
                    urls.push(originUrl);
                    urls.push(thumbUrl);
                    // Also add wildcard variants to try to purge directories
                    urls.push(originUrl + '*');
                    urls.push(thumbUrl + '*');

                    console.log('[Delete] Triggering CDN purge for', urls);
                    await aliyunCdnRefresh(urls);
                } catch (e) {
                    console.error('[Delete] CDN purge failed', e);
                }
            })();
        } catch (e) {
            console.error('[Delete] Failed to remove thumbs for', targetPath, e);
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).send('Error');
    }
});

app.post('/api/upload', (req, res) => {
    // Ensure access capability
    ensureDevSymlink();

    const filename = req.headers['x-filename'];
    let category = req.headers['x-category'] || '';
    
    if (!filename) return res.status(400).send('Missing filename');
    
    const decodedName = decodeURIComponent(filename);
    const ext = path.extname(decodedName).toLowerCase();

    // Auto-classify
    if (!category || !CATEGORIES.includes(category)) {
        if (['.png','.jpg','.jpeg','.gif','.svg','.webp','.ico','.bmp','.tiff'].includes(ext)) category = 'pic';
        else if (['.mp3','.wav','.ogg','.m4a','.flac','.aac'].includes(ext)) category = 'sound';
        else if (['.mp4','.webm','.avi','.mov','.mkv','.wmv'].includes(ext)) category = 'video';
        else if (['.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.odt','.ods','.odp','.rtf'].includes(ext)) category = 'doc';
        else if (['.txt','.md','.js','.ts','.html','.css','.json','.py','.java','.c','.cpp','.h','.vue','.xml','.yaml','.yml','.ini','.conf','.sh','.bat','.log','.csv','.rs','.go','.php','.rb','.pl','.swift','.kt','.sql','.r','.m','.make','.dockerfile'].includes(ext)) category = 'txt';
        else category = 'other';
    }

    const categoryDir = path.join(UPLOAD_DIR, category);
    if (!fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir, { recursive: true });

    const cleanName = decodedName.replace(/[^a-zA-Z0-9.\-_]/g, '');
    const randomName = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${cleanName}`;
    const filePath = path.join(categoryDir, randomName);
    
    const writeStream = fs.createWriteStream(filePath);
    req.pipe(writeStream);

    writeStream.on('finish', async () => {
        const webPath = `/server/data/upload/${category}/${randomName}`;
        const fullUrl = `${MEDIA_DOMAIN}${webPath}`;
        
        let thumbUrl = '';
        
        // Thumbnail generation & Pre-warm logic
            try {
                // 1. Generate thumbnail immediately if it's an image and sharp is available
                if (sharpLib && ['pic'].includes(category)) {
                     const thumbRel = `/${category}/${randomName}`;
                     const thumbBase = path.join(UPLOAD_DIR, '.thumbs');
                     const thumbPath = path.join(thumbBase, thumbRel);
                     const thumbDir = path.dirname(thumbPath);
                     
                     if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
                     
                     try {
                         await sharpLib(filePath)
                             .resize({ width: 200, height: 200, fit: 'inside', withoutEnlargement: true })
                             .toFile(thumbPath);
                         thumbUrl = `${MEDIA_DOMAIN}/server/data/upload/.thumbs${thumbRel}`;
                     } catch (err) {
                         console.error('[Upload] Thumb generation failed:', err.message);
                     }
                }

            // 2. Pre-warm CDN (Async)
            // Trigger GET requests to the CDN URLs so it pulls from origin immediately
            // We do not await this to avoid blocking the response significantly, 
            // but a small delay might be fine to ensure origin is ready.
            const warmUrls = [fullUrl];
            if (thumbUrl) warmUrls.push(thumbUrl);

            // Fire and forget pre-warm
            (async () => {
                try {
                    console.log('[Pre-warm] Triggering fetch for:', warmUrls);
                    const results = await Promise.allSettled(warmUrls.map(u => fetch(u, { method: 'HEAD', timeout: 5000 })));
                    results.forEach((r, i) => {
                         if (r.status === 'rejected') console.error(`[Pre-warm] Failed ${warmUrls[i]}:`, r.reason);
                         else console.log(`[Pre-warm] Success ${warmUrls[i]}`);
                    });
                } catch (e) { console.error('[Pre-warm] error', e); }
            })();

        } catch (e) {
            console.error('[Upload] Post-process error', e);
        }

        res.json({ url: fullUrl, path: webPath, category, thumb: thumbUrl });
    });
    writeStream.on('error', (err) => {
        console.error(err);
        res.status(500).send('Upload failed');
    });
});


// 5. Blog Posts API

app.get('/api/posts', (req, res) => {
    try {
        // Reload strictly to get fresh data
        const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
        let posts = JSON.parse(indexContent || '[]');
        
        const includeDrafts = req.query.includeDrafts === 'true';
        if (!includeDrafts) {
            posts = posts.filter(p => p.status === 'published' || p.status === 'modifying' || !p.status);
        }

        const featuredOnly = req.query.featured === 'true';
        if (featuredOnly) {
            posts = posts.filter((post) => Array.isArray(post.tags) && post.tags.some((tag) => String(tag) === 'featured' || String(tag) === '精选'));
        }

        // Augment posts with hasHtml flag based on disk state
        posts = posts.map(p => {
            const html = readCompiledHtmlFromDisk(p)
            const hasHtml = !!(html && html.length > 0)
            // ensure dir field when possible
            if (!p.dir) p.dir = p.filename ? p.filename.replace(/\.md$/, '') : p.id
            return { ...p, hasHtml }
        })

        posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const pageValue = Number.parseInt(req.query.page, 10);
        const perPageValue = Number.parseInt(req.query.perPage, 10);
        const hasPagination = Number.isFinite(pageValue) && Number.isFinite(perPageValue) && perPageValue > 0;

        if (hasPagination) {
            const page = pageValue > 0 ? pageValue : 1;
            const perPage = perPageValue;
            const total = posts.length;
            const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;

            if (page > totalPages || total === 0) {
                return res.json({
                    posts: [],
                    total,
                    page,
                    perPage,
                    totalPages,
                });
            }

            const start = (page - 1) * perPage;
            const pagedPosts = posts.slice(start, start + perPage);

            return res.json({
                posts: pagedPosts,
                total,
                page,
                perPage,
                totalPages,
            });
        }

        res.json(posts);
    } catch(e) {
        res.status(500).send('[]');
    }
});

function searchPostsFromIndex(posts, keyword) {
    const normalizedKeyword = String(keyword || '').trim().toLowerCase();
    if (!normalizedKeyword) return posts;

    return posts.filter((post) => {
        const title = String(post.title || '').toLowerCase();
        const summary = String(post.summary || '').toLowerCase();
        const tags = Array.isArray(post.tags) ? post.tags.map((tag) => String(tag || '').toLowerCase()) : [];

        if (title.includes(normalizedKeyword)) return true;
        if (summary.includes(normalizedKeyword)) return true;
        if (tags.some((tag) => tag.includes(normalizedKeyword))) return true;

        const content = readPostContentFromDisk(post);
        return String(content || '').toLowerCase().includes(normalizedKeyword);
    });
}

function normalizeSearchTags(rawTags) {
    if (Array.isArray(rawTags)) {
        return rawTags.map((tag) => String(tag || '').trim()).filter(Boolean);
    }

    return String(rawTags || '')
        .split(',')
        .map((tag) => String(tag || '').trim())
        .filter(Boolean);
}

function handleSearchRequest(req, res) {
    try {
        const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
        let posts = JSON.parse(indexContent || '[]');

        posts = posts.filter((post) => post.status === 'published' || post.status === 'modifying' || !post.status);

        const keyword = req.query.keyword || req.query.q || req.query.title || '';
        const tags = normalizeSearchTags(req.query.tags || req.query.tag);

        let filtered = posts;

        if (tags.length > 0) {
            filtered = filtered.filter((post) => {
                const postTags = Array.isArray(post.tags) ? post.tags.map((tag) => String(tag || '').trim()) : [];
                return tags.every((tag) => postTags.includes(tag));
            });
        }

        filtered = searchPostsFromIndex(filtered, keyword);

        filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        res.json(filtered);
    } catch (e) {
        res.status(500).send('[]');
    }
}

app.get('/api/search', handleSearchRequest);
app.get('/api/public/search', handleSearchRequest);

app.get('/api/post', (req, res) => {
    const { id, mode } = req.query;
    if (!id) return res.status(400).send('Missing ID');

    try {
        const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
        const posts = JSON.parse(indexContent || '[]');
        const post = posts.find(p => p.id === id);

        if (!post) return res.status(404).send('Post not found');

        // legacy filename handling removed: content is read from per-post dir via helpers

        // Read content from per-post directory or legacy filename
        const content = readPostContentFromDisk(post)

        // Read compiled html & toc from disk if available (validate id)
        const html = readCompiledHtmlFromDisk(post) || ''
        const toc = readTocFromDisk(post)
        const hasHtml = !!(html && html.length > 0)

        // If mode=edit and there's a draft file, prefer draft content for editing
        if (mode === 'edit') {
            const dir = getPostDir(post)
            const draftPath = path.join(dir, `${post.id}-draft.md`)
            if (fs.existsSync(draftPath)) {
                let raw = fs.readFileSync(draftPath, 'utf-8')
                try { raw = decrypt(raw) } catch(e) {}
                const { body } = parseFrontMatter(raw)
                // override content
                // Note: do not promote draft to published unless saved as such
                // return draft as content for editor
                return res.json({ ...post, content: body, html, hasHtml, toc })
            }
        }

        res.json({ ...post, content, html, hasHtml, toc });
    } catch(e) {
        res.status(500).send('Error');
    }
});

app.post('/api/restore', (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).send('Missing ID');
    try {
        const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
        const posts = JSON.parse(indexContent || '[]');
        const post = posts.find(p => p.id === id);

        if (post && post.status === 'modifying') {
            const dir = getPostDir(post)
            const draftPath = path.join(dir, `${id}-draft.md`)
            if (fs.existsSync(draftPath)) fs.unlinkSync(draftPath)
            // remove legacy draftFilename field if present
            if (post.draftFilename) delete post.draftFilename
            post.status = 'published'
            fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2));
        }
        res.json({ success: true });
    } catch(e) {
        res.status(500).send('Error');
    }
});

app.post('/api/post', (req, res) => {
    try {
        const data = req.body;
        if (!data.title) return res.status(400).send('Missing title');

        let posts = [];
        try { posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8') || '[]'); } catch(e){}

        let post;
        const now = new Date().toISOString();
        const content = data.content;
        const status = data.status;
        // track whether this post was already published before this request
        let wasPublished = false;

        if (data.id) {
            post = posts.find(p => p.id === data.id);
            if (post) wasPublished = post.status === 'published';
            if (post) {
                post.title = data.title || post.title;
                if (data.author !== undefined) post.author = String(data.author || '').trim();
                if (data.aiGenerated !== undefined) post.aiGenerated = !!data.aiGenerated;
                if (content !== undefined) {
                    post.summary = content.slice(0, 200).replace(/[#*`\[\]]/g, '');
                }

                // For directory-based storage, manage draft files instead of draftFilename
                if (status === 'modifying') {
                    post.status = 'modifying';
                } else if (status === 'published') {
                    // Remove any draft file named <id>-draft.md if promoting to published
                    const dir = getPostDir(post)
                    const draftPath = path.join(dir, `${post.id}-draft.md`)
                    if (fs.existsSync(draftPath)) fs.unlinkSync(draftPath)
                    post.status = 'published';
                } else if (status) {
                    post.status = status;
                }
                if (data.tags) post.tags = sortTags(data.tags || []);
                if (data.font) post.font = data.font;
                post.updatedAt = now;
                // Ensure post.dir exists for new/legacy posts
                if (!post.dir) post.dir = post.id
            }
        }

        if (!post) {
            const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);
            const filename = `${id}.md`;
            post = {
                id,
                title: data.title,
                date: now,
                updatedAt: now,
                filename,
                dir: id,
                summary: (content || '').slice(0, 200).replace(/[#*`\[\]]/g, ''),
                tags: sortTags(data.tags || []),
                font: data.font || 'sans',
                author: String(data.author || '').trim(),
                aiGenerated: !!data.aiGenerated,
                status: status || 'draft'
            };
            posts.push(post);
            data.id = id;
        }

        if (content !== undefined || !data.id) {
            // Write content to per-post directory (draft or content)
            try {
                if (post.status === 'modifying') {
                    writePostContentToDisk(post, content || '', { draft: true })
                } else {
                    writePostContentToDisk(post, content || '', { draft: false })
                }
            } catch (e) {
                console.error('[Post] Failed to write content to disk', e)
            }
        } else {
             // If content wasn't sent but metadata was updated, we should update the file metadata too.
             // But reading, decrypting, updating FM, encrypting, saving is expensive.
             // Given BlogEditor always sends content, we might skip this edge case or handle it.
             // For robustness (user request: "ensure... linking"), allow metadata-only update to file:
             // metadata-only update: update front matter in existing content.md (or legacy file)
             const dir = getPostDir(post)
             const candidate1 = path.join(dir, `${post.id}-content.md`)
             const candidate2 = path.join(dir, `${post.id}-draft.md`)
             const existingPath = fs.existsSync(candidate1) ? candidate1 : (fs.existsSync(candidate2) ? candidate2 : (post.filename ? path.join(POSTS_DIR, post.filename) : null))
             if (existingPath && fs.existsSync(existingPath)) {
                 try {
                     const raw = fs.readFileSync(existingPath, 'utf-8');
                     let currentContent = raw;
                     try { currentContent = decrypt(raw); } catch(e){}
                     const { body } = parseFrontMatter(currentContent);
                     const newContent = stringifyFrontMatter({
                        title: post.title,
                        date: post.date,
                        updatedAt: post.updatedAt,
                        tags: post.tags || [],
                                font: post.font || 'sans',
                                author: post.author || '',
                                aiGenerated: !!post.aiGenerated,
                    }, body);
                    fs.writeFileSync(existingPath, encrypt(newContent));
                } catch(e) { console.error('Failed to update file metadata', e); }
             }
        }

        // If frontend sent compiledHtml (static HTML) or html, sanitize and store it on disk
        if (data.compiledHtml || data.html) {
            try {
                const sanitized = sanitizeHtml(data.compiledHtml || data.html);
                post.html = sanitized; // keep in index for quick access
                writeCompiledHtmlToDisk(post, sanitized);
            } catch (e) {
                post.html = '';
            }
        }

        // Save toc if provided
        if (data.toc) {
            try { writeTocToDisk(post, data.toc) } catch(e) { }
        }

        fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2));
        res.json({ success: true, id: post.id });

        // If this request caused a promotion to published, and settings allow it,
        // trigger an async frontend build from the server side.
        try {
            const settings = getBuildSettings();
            const shouldAutoBuild = !!settings.autoBuildOnPublish;
            const becamePublished = post && post.status === 'published' && !wasPublished;
            if (shouldAutoBuild && becamePublished) {
                console.log('[AutoBuild] Post published — triggering frontend build (async)');
                // non-blocking trigger; buildAstroFrontendWithTimeout resolves with status or timeout
                buildAstroFrontendWithTimeout(settings, { granularity: settings.buildGranularity })
                    .then(result => console.log('[AutoBuild] Build result:', result.status, result.buildId))
                    .catch(err => console.error('[AutoBuild] Build failed:', err && err.message ? err.message : err));
            }
        } catch (e) { console.error('[AutoBuild] Failed to check/trigger build on publish', e) }
    } catch(e) {
        console.error(e);
        res.status(500).send('Error');
    }
});

app.delete('/api/post', (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).send('ID required');

    try {
        let posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8') || '[]');
        const post = posts.find(p => p.id === id);
        if (post) {
            // Remove per-post directory if exists, otherwise remove legacy file
            const dir = getPostDir(post)
            if (fs.existsSync(dir)) {
                try { fs.rmSync(dir, { recursive: true, force: true }) } catch(e) { console.error('[Delete] remove dir failed', e) }
            } else if (post.filename) {
                const mdPath = path.join(POSTS_DIR, post.filename);
                if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);
            }
            posts = posts.filter(p => p.id !== id);
            fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2));
        }
        res.json({ success: true });
    } catch(e) {
        res.status(500).send('Error');
    }
});

app.post('/api/scan', (req, res) => {
    try {
        let posts = [];
        try { posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8') || '[]'); } catch(e){}
        // Scan POSTS_DIR for per-post directories and legacy .md files
        const entries = fs.readdirSync(POSTS_DIR, { withFileTypes: true });
        const dirPosts = [];
        const legacyFiles = [];
        entries.forEach(e => {
            if (e.isDirectory()) {
                dirPosts.push(e.name)
            } else if (e.isFile() && e.name.endsWith('.md')) {
                legacyFiles.push(e.name)
            }
        })

        const originalCount = posts.length;

        // Keep posts that still exist (either dir or legacy file)
        posts = posts.filter(p => {
            const dirName = p.dir || (p.filename ? p.filename.replace(/\.md$/, '') : p.id)
            return dirPosts.includes(dirName) || legacyFiles.includes(p.filename)
        })

        // Find orphaned legacy files and recover them
        const indexedFiles = new Set(posts.map(p => p.filename).filter(Boolean));
        const orphans = legacyFiles.filter(f => !indexedFiles.has(f));

        let recoveredCount = 0;
        orphans.forEach(filename => {
            try {
                const raw = fs.readFileSync(path.join(POSTS_DIR, filename), 'utf-8');
                let content = raw;
                try { content = decrypt(raw); } catch(e) {}
                const stats = fs.statSync(path.join(POSTS_DIR, filename));
                const id = filename.replace('.md', '');

                posts.push({
                    id,
                    title: `Recovered: ${id}`,
                    date: stats.birthtime || new Date(),
                    filename,
                    dir: id,
                    summary: content.slice(0, 100).replace(/[#*`\[\]]/g, ''),
                    tags: ['recovered'],
                    status: 'draft'
                });
                recoveredCount++;
            } catch(e){}
        });

        if (posts.length !== originalCount || recoveredCount > 0) {
            fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2));
        }

        res.json({ 
            success: true, 
            removed: originalCount - posts.length + recoveredCount, 
            recovered: recoveredCount 
        });
    } catch(e) {
        res.status(500).send('Scan failed');
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

function getDeviceTypeFromUA(ua) {
    if (!ua) return 'Unknown';
    ua = ua.toLowerCase();
    if (ua.includes('windows')) return 'Windows';
    if (ua.includes('macintosh') || ua.includes('mac os')) return 'Mac';
    if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('linux')) return 'Linux';
    if (ua.includes('cros')) return 'ChromeOS';
    return 'Other';
}

// Very small sanitizer for compiled HTML saved from clients.
// This is NOT a replacement for a proper HTML sanitizer like DOMPurify on the server side,
// but helps prevent obvious script injections saved into index.json.
function sanitizeHtml(html) {
    if (!html) return '';
    try {
        // Remove <script>...</script>
        let s = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
        // Remove javascript: URIs
        s = s.replace(/href\s*=\s*["']?javascript:[^"'>\s]*/gi, '');
        s = s.replace(/src\s*=\s*["']?javascript:[^"'>\s]*/gi, '');
        // Strip on* event handlers e.g. onclick, onerror
        s = s.replace(/\son[a-z]+\s*=\s*(?:\"[^\"]*\"|\'[^\']*\'|[^\s>]+)/gi, '');
        return s;
    } catch (e) {
        return '';
    }
}