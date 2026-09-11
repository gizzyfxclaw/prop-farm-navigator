import fs from 'fs';
import path from 'path';

const headersPath = path.join(process.cwd(), '.output/public/_headers');
let content = fs.readFileSync(headersPath, 'utf-8');

// Remove the immutable line and replace with 1-hour cache
content = content.replace(
  /\/assets\/\*\n\s+cache-control: public, max-age=31536000, immutable\n?/g,
  ''
);

fs.writeFileSync(headersPath, content);
console.log('✅ Removed immutable cache headers from _headers');
