#!/usr/bin/env node

/**
 * main.js
 * Entry point for Watermarked Uploader
 * Supports both scheduled background operation and manual CLI triggers
 */

const Scheduler = require('./lib/scheduler');
const BatchUpload = require('./lib/batchUpload');
const config = require('./config/config');
const fs = require('fs');

// Parse command line arguments
const args = process.argv.slice(2);

// Ensure directories exist
ensureDirectories();

// Main entry point
async function main() {
  try {
    if (args.length === 0) {
      // No arguments: Start background scheduler
      startScheduler();
    } else if (args[0] === '--manual') {
      // Manual trigger
      await manualTrigger();
    } else if (args[0] === '--range') {
      // Date range query
      await dateRangeTrigger();
    } else if (args[0] === '--hash') {
      // Specific hash
      await hashTrigger();
    } else if (args[0] === '--type') {
      // Filter by file type
      await typeTrigger();
    } else if (args[0] === '--status') {
      // Show scheduler status
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
 * Start background scheduler
 */
function startScheduler() {
  console.log('\n========================================');
  console.log('🚀 WATERMARKED UPLOADER');
  console.log('Starting Background Scheduler');
  console.log('========================================\n');

  const scheduler = new Scheduler();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    scheduler.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    scheduler.stop();
    process.exit(0);
  });

  // Start scheduler
  scheduler.start((result) => {
    if (config.logging.verbose) {
      console.log('📊 Job completed:', result);
    }
  });

  // Show status periodically if verbose
  if (config.logging.verbose) {
    setInterval(() => {
      const status = scheduler.getStatus();
      console.log(`\n📈 Scheduler Status: ${status.totalRuns} runs, Next: ${status.nextRunTime}`);
    }, 60000); // Every minute
  }

  console.log('Press Ctrl+C to stop\n');
}

/**
 * Manual immediate trigger
 */
async function manualTrigger() {
  console.log('\n========================================');
  console.log('⚡ MANUAL TRIGGER');
  console.log('========================================\n');

  try {
    const batchUpload = new BatchUpload();
    const result = await batchUpload.run();
    
    console.log('\n✅ Manual upload completed');
    console.log(formatResult(result));
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Manual upload failed:', error.message);
    process.exit(1);
  }
}

/**
 * Date range trigger
 */
async function dateRangeTrigger() {
  if (args.length < 3) {
    console.log('❌ Usage: node main.js --range YYYY-MM-DD YYYY-MM-DD');
    process.exit(1);
  }

  const startDate = args[1];
  const endDate = args[2];

  console.log(`\n========================================`);
  console.log(`📅 DATE RANGE: ${startDate} to ${endDate}`);
  console.log(`========================================\n`);

  try {
    const batchUpload = new BatchUpload();
    const result = await batchUpload.run({
      startDate: new Date(startDate),
      endDate: new Date(endDate)
    });

    console.log('\n✅ Date range upload completed');
    console.log(formatResult(result));
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Date range upload failed:', error.message);
    process.exit(1);
  }
}

/**
 * Specific hash trigger
 */
async function hashTrigger() {
  if (args.length < 2) {
    console.log('❌ Usage: node main.js --hash SHA256HASH [SHA256HASH2 ...]');
    process.exit(1);
  }

  const hashes = args.slice(1);

  console.log(`\n========================================`);
  console.log(`🔍 UPLOADING ${hashes.length} FILE(S) BY HASH`);
  console.log(`========================================\n`);

  try {
    const batchUpload = new BatchUpload();
    const result = await batchUpload.run({ hashes });

    console.log('\n✅ Hash-based upload completed');
    console.log(formatResult(result));
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Hash-based upload failed:', error.message);
    process.exit(1);
  }
}

/**
 * File type trigger
 */
async function typeTrigger() {
  if (args.length < 2) {
    console.log('❌ Usage: node main.js --type video|image|both');
    process.exit(1);
  }

  const fileType = args[1];
  if (!['video', 'image', 'both'].includes(fileType)) {
    console.log('❌ File type must be: video, image, or both');
    process.exit(1);
  }

  console.log(`\n========================================`);
  console.log(`🎬 UPLOADING: ${fileType.toUpperCase()}`);
  console.log(`========================================\n`);

  try {
    const batchUpload = new BatchUpload();
    const result = await batchUpload.run({ type: fileType });

    console.log('\n✅ Type-filtered upload completed');
    console.log(formatResult(result));
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Type-filtered upload failed:', error.message);
    process.exit(1);
  }
}

/**
 * Show scheduler status
 */
function showStatus() {
  console.log('\n========================================');
  console.log('📊 SCHEDULER STATUS');
  console.log('========================================\n');

  // Note: Status would need a persistent scheduler instance
  console.log('Schedule Interval:', config.scheduler.interval);
  console.log('Timezone:', config.scheduler.timezone);
  console.log('Video Watermarking:', config.features.watermarkVideos ? '✅' : '❌');
  console.log('Image Thumbnails:', config.features.attachThumbnails ? '✅' : '❌');
  console.log('Deduplication:', config.features.deduplicateByHash ? '✅' : '❌');
  console.log('\nHistory File:', config.logging.historyFile);
  console.log('Error Log:', config.logging.errorLog);

  if (fs.existsSync(config.logging.historyFile)) {
    const lines = fs.readFileSync(config.logging.historyFile, 'utf-8').split('\n').filter(l => l);
    console.log(`\nTotal Uploads: ${lines.length}`);
  }

  process.exit(0);
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
  Watermarked Uploader v1.0.0

  USAGE:
    node main.js                              Start background scheduler
    node main.js --manual                     Run upload cycle immediately
    node main.js --range START_DATE END_DATE  Upload files from date range
    node main.js --hash HASH [HASH ...]       Upload specific files by hash
    node main.js --type video|image|both      Upload only specific file types
    node main.js --status                     Show scheduler status
    node main.js --help                       Show this help message

  EXAMPLES:
    node main.js                              # Start scheduler (runs every 5 mins by default)
    node main.js --manual                     # Upload all pending files now
    node main.js --range 2025-04-20 2025-04-26
    node main.js --hash abc123def456 xyz789
    node main.js --type video                 # Upload only videos

  CONFIGURATION:
    Copy .env.example to .env and edit:
      LINKED_LISTER_URL=http://localhost:3000
      LINKED_LISTER_USER=admin
      LINKED_LISTER_PASS=admin123
      SCHEDULE_INTERVAL=*/5 * * * *
      DEBUG=false

  FEATURES:
    ✅ Video watermarking with custom text overlay
    ✅ Image + thumbnail dual upload
    ✅ Scheduled background operation
    ✅ Manual CLI triggers
    ✅ Date range filtering
    ✅ Duplicate detection by file hash
    ✅ Comprehensive error logging

  LOGS:
    ${config.logging.historyFile}       - Upload history
    ${config.logging.errorLog}          - Error log
    ${config.processing.tempDir}        - Temporary files
  `);
  process.exit(0);
}

/**
 * Format upload result for display
 */
function formatResult(result) {
  return `
  Videos:     ${result.videosUploaded}/${result.videosProcessed} uploaded
  Images:     ${result.imagesUploaded}/${result.imagesProcessed} uploaded
  Thumbnails: ${result.thumbnailsUploaded} attached
  Failures:   ${result.totalFailures}
  Success:    ${result.successRate}
  `;
}

/**
 * Ensure required directories exist
 */
function ensureDirectories() {
  const dirs = [
    config.processing.tempDir,
    'logs',
    'history'
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// Run main
main();
