/**
 * Configuration file for Watermarked Uploader
 * Load from .env or use defaults
 */

require('dotenv').config({ path: 'cert.env' });
// Fallback to .env if cert.env doesn't exist
require('dotenv').config();

let ffmpegPath = 'ffmpeg';
let ffprobePath = 'ffprobe';

// We use the system ffmpeg instead of ffmpeg-static because ffmpeg-static
// does not come compiled with the 'drawtext' filter which is required for watermarking.


module.exports = {
  // Linked-Lister API Configuration
  linkedLister: {
    baseUrl: process.env.LINKED_LISTER_URL || 'http://localhost:3000',
    username: process.env.LINKED_LISTER_USER || 'admin',
    password: process.env.LINKED_LISTER_PASS || 'admin123',
    apiToken: process.env.LINKED_LISTER_TOKEN || null,
    retryAttempts: 3,
    retryDelayMs: 2000
  },

  // HotPic Upload Configuration
  // To disable auto-deletion, set HOTPIC_AUTO_DELETE=0 in cert.env or .env
  // Auto-delete can be configured with HOTPIC_AUTO_DELETE_TIME (in seconds)
  hotpic: {
    endpoint: process.env.HOTPIC_ENDPOINT || 'https://up.hotpic.me/uploads.php',
    description: process.env.HOTPIC_DESCRIPTION || 'full video at:- https://tinyurl.com/bd66a67a',
    private: process.env.HOTPIC_PRIVATE || '0',
    safe: process.env.HOTPIC_SAFE || 'adult',
    orientation: process.env.HOTPIC_ORIENTATION || 'Straight',
    autoDelete: process.env.HOTPIC_AUTO_DELETE || '1', // Set to '0' to disable auto-deletion
    autoDeleteTime: process.env.HOTPIC_AUTO_DELETE_TIME ? parseInt(process.env.HOTPIC_AUTO_DELETE_TIME) : 172800, // seconds (default: 48 hours)
    visitorId: process.env.HOTPIC_VISITOR_ID || 'b3aa583268e6a6413e5ec0fe0db10051',
    userAgent: process.env.HOTPIC_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    origin: process.env.HOTPIC_ORIGIN || 'https://hotpic.me',
    referer: process.env.HOTPIC_REFERER || 'https://hotpic.me/'
  },

  // Watermark Configuration
  watermark: {
    videoText: process.env.WATERMARK_TEXT || 'full video at:- desi-new-video.onrender.com',
    textColor: process.env.WATERMARK_TEXT_COLOR || 'white',
    fontSize: process.env.WATERMARK_FONT_SIZE ? parseInt(process.env.WATERMARK_FONT_SIZE) : 24,
    fontFile: process.env.WATERMARK_FONT_FILE || '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', // System font, adjust per OS
    position: process.env.WATERMARK_POSITION || 'bottom-center', // bottom-center, top-center, etc.
    alpha: process.env.WATERMARK_ALPHA ? parseFloat(process.env.WATERMARK_ALPHA) : 1.0, // Full opacity
    boxColor: process.env.WATERMARK_BOX_COLOR || 'black',
    boxBorderw: process.env.WATERMARK_BOX_BORDERW ? parseInt(process.env.WATERMARK_BOX_BORDERW) : 2,
    margin: process.env.WATERMARK_MARGIN ? parseInt(process.env.WATERMARK_MARGIN) : 20
  },

  // Scheduler Configuration
  scheduler: {
    enabled: true,
    // Cron format: "*/5 * * * *" = every 5 minutes
    // Default: every 5 minutes
    interval: process.env.SCHEDULE_INTERVAL || '*/5 * * * *',
    timezone: 'UTC'
  },

  // MongoDB Configuration
  mongodb: {
    uri: process.env.MONGODB_URI || null
  },

  // File Processing Configuration
  processing: {
    tempDir: './temp',
    logsDir: './logs',
    maxVideoSize: 2 * 1024 * 1024 * 1024, // 2GB
    maxImageSize: 500 * 1024 * 1024, // 500MB
    supportedVideoExts: ['.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.webm'],
    supportedImageExts: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'],
    ffmpegPath: process.env.FFMPEG_PATH || ffmpegPath,
    ffprobePath: process.env.FFPROBE_PATH || ffprobePath
  },

  // Logging Configuration
  logging: {
    errorLog: './logs/errors.log',
    debugMode: process.env.DEBUG || false,
    verbose: process.env.VERBOSE || false
  },

  // Feature Flags
  features: {
    uploadVideos: true,
    uploadImages: true,
    watermarkVideos: true,
    attachThumbnails: true,
    deduplicateByHash: true
  }
};
