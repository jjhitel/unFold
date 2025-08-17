const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const manifestJsonPath = path.join(projectRoot, 'manifest.json');

try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const version = packageJson.version;

    if (!version) {
        throw new Error('Version field not found in package.json');
    }

    const manifest = JSON.parse(fs.readFileSync(manifestJsonPath, 'utf8'));
    manifest.version = version;

    fs.writeFileSync(manifestJsonPath, JSON.stringify(manifest, null, 4));

    console.log(`Manifest version updated to ${version}`);
} catch (error) {
    console.error('Error updating manifest version:', error);
    process.exit(1);
}
