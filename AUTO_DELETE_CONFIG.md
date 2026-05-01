# Auto-Deletion Configuration Guide

## Overview
The Auto Uploader supports automatic deletion of uploaded files on HotPic. By default, files are set to auto-delete after **48 hours (172800 seconds)**.

## Disabling Auto-Deletion

To prevent files from being automatically deleted, you have two options:

### Option 1: Update Configuration File
Edit `cert.env` and set:
```
HOTPIC_AUTO_DELETE=0
```

### Option 2: Set Environment Variable
Before running the application:
```bash
export HOTPIC_AUTO_DELETE=0
node main.js
```

### Option 3: Use CLI Command
Check and display current auto-delete configuration:
```bash
node main.js --config-auto-delete status
```

## Enabling Auto-Deletion

### Option 1: Update Configuration File
Edit `cert.env`:
```
HOTPIC_AUTO_DELETE=1
HOTPIC_AUTO_DELETE_TIME=172800
```

### Option 2: Set Environment Variables
```bash
export HOTPIC_AUTO_DELETE=1
export HOTPIC_AUTO_DELETE_TIME=172800
node main.js
```

### Option 3: Use CLI Command
Display the recommended settings:
```bash
node main.js --config-auto-delete enable
node main.js --config-auto-delete enable 3600  # 1 hour
```

## Configuration Parameters

| Parameter | Values | Description |
|-----------|--------|-------------|
| `HOTPIC_AUTO_DELETE` | `0` or `1` | Enable (1) or disable (0) auto-deletion |
| `HOTPIC_AUTO_DELETE_TIME` | Seconds | Time until auto-deletion (default: 172800 = 48 hours) |

## Common Examples

**Disable auto-deletion permanently:**
```
HOTPIC_AUTO_DELETE=0
```

**Auto-delete after 1 hour:**
```
HOTPIC_AUTO_DELETE=1
HOTPIC_AUTO_DELETE_TIME=3600
```

**Auto-delete after 24 hours:**
```
HOTPIC_AUTO_DELETE=1
HOTPIC_AUTO_DELETE_TIME=86400
```

**Auto-delete after 7 days:**
```
HOTPIC_AUTO_DELETE=1
HOTPIC_AUTO_DELETE_TIME=604800
```

## CLI Commands

### Check Current Configuration
```bash
node main.js --config-auto-delete status
```

### Get Disable Instructions
```bash
node main.js --config-auto-delete disable
```

### Get Enable Instructions
```bash
node main.js --config-auto-delete enable
node main.js --config-auto-delete enable [seconds]
```

## Notes
- Changes to `cert.env` require restarting the application
- The auto-delete setting is sent to HotPic with each upload
- All uploaded files inherit the auto-delete settings from the time of upload
