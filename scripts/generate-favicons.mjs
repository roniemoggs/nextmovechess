import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgPath = path.resolve('public/favicon.svg');
const svgBuffer = fs.readFileSync(svgPath);

async function generateFavicons() {
  console.log('Generating favicon suite from public/favicon.svg...');

  // 1. apple-touch-icon.png (180x180)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.resolve('public/apple-touch-icon.png'));
  console.log('✓ Created public/apple-touch-icon.png (180x180)');

  // 2. favicon-96x96.png (96x96)
  await sharp(svgBuffer)
    .resize(96, 96)
    .png()
    .toFile(path.resolve('public/favicon-96x96.png'));
  console.log('✓ Created public/favicon-96x96.png (96x96)');

  // 3. favicon.ico (32x32)
  const ico32 = await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toBuffer();
  fs.writeFileSync(path.resolve('public/favicon.ico'), ico32);
  console.log('✓ Created public/favicon.ico');

  // 4. web-app-manifest-192x192.png (192x192)
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.resolve('public/web-app-manifest-192x192.png'));
  console.log('✓ Created public/web-app-manifest-192x192.png (192x192)');

  // 5. web-app-manifest-512x512.png (512x512)
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.resolve('public/web-app-manifest-512x512.png'));
  console.log('✓ Created public/web-app-manifest-512x512.png (512x512)');

  // 6. site.webmanifest
  const manifest = {
    name: "Next Move Chess - Best Chess Move Calculator",
    short_name: "NextMoveChess",
    icons: [
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable any"
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable any"
      }
    ],
    theme_color: "#0a0a0a",
    background_color: "#0a0a0a",
    display: "standalone",
    start_url: "/",
    orientation: "portrait"
  };

  fs.writeFileSync(
    path.resolve('public/site.webmanifest'),
    JSON.stringify(manifest, null, 2)
  );
  console.log('✓ Created public/site.webmanifest');
}

generateFavicons().catch(console.error);
