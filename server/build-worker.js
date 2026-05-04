const { workerData, parentPort } = require('worker_threads');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('[Build Worker] Starting Astro build...');

try {
    // 执行构建命令
    console.log('[Build Worker] Building in directory:', workerData.codeDir);
    
    execSync('npm run build', {
        cwd: workerData.codeDir,
        stdio: 'inherit',
        env: process.env,
    });
    
    const distDir = path.join(workerData.codeDir, 'dist');
    if (!fs.existsSync(distDir)) {
        throw new Error('Build output not found: ' + distDir);
    }
    
    console.log('[Build Worker] Build completed successfully');
    
    parentPort.postMessage({ 
        success: true, 
        distDir: distDir 
    });
} catch (error) {
    console.error('[Build Worker] Build failed:', error.message);
    parentPort.postMessage({ 
        success: false, 
        error: error.message 
    });
}