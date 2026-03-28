#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const securityFile = path.join(repoRoot, 'server', 'data', 'security.json');

function backup(originalPath) {
  try {
    const dest = originalPath + '.bak.' + Date.now();
    fs.copyFileSync(originalPath, dest);
    console.log('Backup created at', dest);
  } catch (e) {
    console.warn('No existing security file to backup or backup failed:', e.message || e);
  }
}

function main() {
  if (!fs.existsSync(securityFile)) {
    console.log('No security file found at', securityFile);
    console.log('Nothing to do.');
    return;
  }

  let raw = fs.readFileSync(securityFile, 'utf-8');
  let obj;
  try { obj = JSON.parse(raw); } catch (e) {
    console.error('Failed to parse security.json:', e.message || e);
    process.exit(2);
  }

  // Backup first
  backup(securityFile);

  // Remove passkeys/devices while preserving passwordHash (if present)
  if (obj.devices && Array.isArray(obj.devices) && obj.devices.length > 0) {
    obj.devices = [];
    fs.writeFileSync(securityFile, JSON.stringify(obj, null, 2), 'utf-8');
    console.log('All passkeys removed from', securityFile);
  } else {
    // if devices not present, still ensure the field is removed for clarity
    if (obj.devices) delete obj.devices;
    fs.writeFileSync(securityFile, JSON.stringify(obj, null, 2), 'utf-8');
    console.log('No passkeys found; file updated (devices cleared).');
  }

  console.log('Done. Restart the server if it is running to pick up changes.');
}

if (require.main === module) main();
