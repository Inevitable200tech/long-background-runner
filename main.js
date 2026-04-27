#!/usr/bin/env node

/**
 * main.js
 * Entry point for Watermarked Uploader
 * Supports both scheduled background operation and manual CLI triggers
 * Now includes an HTTP server for health monitoring on port 3000
 */

const path = require('path');
const fs = require('fs');
const http = require('http'); // Added for health endpoint
const Scheduler = require('./lib/scheduler');
const BatchUpload = require('./lib/batchUpload');
const config = require('./config/config');
const db = require('./lib/db');
const historyService = require('./lib/historyService');

// Parse command line arguments
const args = process.argv.slice(2);

// Ensure directories exist
ensureDirectories();

// Main entry point
async function main() {
  try {
    if (args.length === 0) {
      // No arguments: Start background scheduler, health server, and history monitor
      await db.connect();
      const scheduler = startScheduler();
      startHealthServer(scheduler);
      startHistoryMonitor();
    } else if (args[0] === '--manual') {
      await manualTrigger();
    } else if (args[0] === '--range') {
      await dateRangeTrigger();
    } else if (args[0] === '--hash') {
      await hashTrigger();
    } else if (args[0] === '--type') {
      await typeTrigger();
    } else if (args[0] === '--status') {
      showStatus();
    } else if (args[0] === '--help' || args[0] === '-h') {
      showHelp();
    } else {
      console.log('❌ Unknown command. Use --help for usage.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Application error:', error.message);
    if (config.logging.debugMode) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Start the background scheduler
 */
function startScheduler() {
  const scheduler = new Scheduler();
  scheduler.start();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down scheduler...');
    scheduler.stop();
    process.exit(0);
  });

  return scheduler;
}

/**
 * Start HTTP server for health monitoring
 * @param {Scheduler} scheduler - The running scheduler instance
 */
function startHealthServer(scheduler) {
  const PORT = 3000;

  const server = http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      const status = scheduler.getStatus();
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'UP',
        timestamp: new Date().toISOString(),
        scheduler: {
          isRunning: status.isRunning,
          totalRuns: status.totalRuns,
          lastRun: status.lastRunTime,
          nextRun: status.nextRunTime
        }
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  server.listen(PORT, () => {
    console.log(`\n🌐 Health server running at http://localhost:${PORT}/health`);
  });

  server.on('error', (err) => {
    console.error('❌ Health server failed to start:', err.message);
  });
}

/**
 * Start history monitor - prints history every 30s and prunes entries older than 2 days
 */
function startHistoryMonitor() {
  const INTERVAL_MS = 30 * 1000; // 30 seconds
  const MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

  console.log('📜 History monitor started (every 30s, pruning entries older than 48h)');

  setInterval(async () => {
    try {
      await historyService.pruneHistory(MAX_AGE_MS);
      await historyService.printHistory();
    } catch (error) {
      console.error('❌ History monitor error:', error.message);
    }
  }, INTERVAL_MS);
}

/**
 * Helper to parse CLI arguments into an options object
 */
function getOptionsFromArgs() {
  const options = {};
  const typeIdx = args.indexOf('--type');
  if (typeIdx !== -1 && args[typeIdx + 1]) {
    options.type = args[typeIdx + 1];
  }
  const rangeIdx = args.indexOf('--range');
  if (rangeIdx !== -1 && args[rangeIdx + 1] && args[rangeIdx + 2]) {
    options.startDate = args[rangeIdx + 1];
    options.endDate = args[rangeIdx + 2];
  }
  return options;
}

async function manualTrigger() {
  const batchUpload = new BatchUpload();
  const options = getOptionsFromArgs();
  const result = await batchUpload.run({ ...options, interactive: true });
  console.log(formatResult(result));
}

async function dateRangeTrigger() {
  if (args.length < 3) {
    console.log('❌ Usage: node main.js --range YYYY-MM-DD YYYY-MM-DD');
    return;
  }
  const batchUpload = new BatchUpload();
  const result = await batchUpload.run({
    startDate: args[1],
    endDate: args[2],
    interactive: true 
  });
  console.log(formatResult(result));
}

async function hashTrigger() {
  if (args.length < 2) {
    console.log('❌ Usage: node main.js --hash [hash1] [hash2]...');
    return;
  }
  const batchUpload = new BatchUpload();
  const result = await batchUpload.run({
    hashes: args.slice(1),
    interactive: true
  });
  console.log(formatResult(result));
}

async function typeTrigger() {
  if (args.length < 2) {
    console.log('❌ Usage: node main.js --type [video|image|both]');
    return;
  }
  const batchUpload = new BatchUpload();
  const result = await batchUpload.run({
    type: args[1],
    interactive: true
  });
  console.log(formatResult(result));
}

function showStatus() {
  const scheduler = new Scheduler();
  const status = scheduler.getStatus();
  console.log('\n📊 SCHEDULER STATUS');
  console.log('==================');
  console.log(`Status:    ${status.isRunning ? 'RUNNING' : 'IDLE'}`);
  console.log(`Schedule:  ${status.schedule}`);
  console.log(`Next Run:  ${status.nextRunTime || 'N/A'}`);
  console.log(`Last Run:  ${status.lastRunTime || 'Never'}`);
  console.log(`Total Runs: ${status.totalRuns}`);
}

function showHelp() {
  console.log(`
  Watermarked Uploader CLI
  
  USAGE:
    node main.js                        # Start background scheduler & health server
    node main.js --manual               # Trigger manual upload (Interactive)
    node main.js --status               # Show scheduler status
    node main.js --range YYYY-MM-DD YYYY-MM-DD
    node main.js --hash [hashes...]
    node main.js --type [video|image]

  SERVER:
    The background scheduler now listens on http://localhost:3000/health

  LOGS:
    ${config.logging.errorLog}
  `);
  process.exit(0);
}

function formatResult(result) {
  let output = `
  Videos:     ${result.videosUploaded}/${result.videosProcessed} uploaded
  Images:     ${result.imagesUploaded}/${result.imagesProcessed} uploaded
  Thumbnails: ${result.thumbnailsUploaded} attached
  Failures:   ${result.totalFailures}
  Success:    ${result.successRate}
  `;

  if (result.albums && result.albums.length > 0) {
    output += `\n  🔗 Uploaded Albums:\n`;
    result.albums.forEach(album => {
      output += `     - ${album}\n`;
    });
  }

  return output;
}

function ensureDirectories() {
  const dirs = [
    config.processing.tempDir,
    config.processing.logsDir,
    path.dirname(config.logging.errorLog),
    './uploads'
  ];

  dirs.forEach(dir => {
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// Execute
main();