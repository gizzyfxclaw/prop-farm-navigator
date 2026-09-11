const fs = require('fs');
const path = require('path');

const headersPath = path.join(__dirname, '../.output/public/_headers');
let headersContent = fs.readFileSync(headersPath, 'utf-8');

// Replace immutable cache headers with no-cache for JS/CSS
headersContent = headersContent.replace(
  /\/assets\/\*\n\s+cache-control: public, max-age=31536000, immutable/g,
  '/assets/*.js\n  cache-control: public, max-age=3600\n\n/assets/*.css\n  cache-control: public, max-age=3600\n\n/assets/*\n  cache-control: public, max-age=3600'
);

fs.writeFileSync(headersPath, headersContent);
console.log('✅ Fixed cache headers in _headers');
