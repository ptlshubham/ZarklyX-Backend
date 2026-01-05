import axios from 'axios';
import { getDriveClientFromTokens, DriveTokens, getDriveFileMetadata } from './drive-service';

/**
 * Drive Preview Service
 * Handles preview image retrieval with multiple fallback strategies
 * Priority: thumbnailLink > webContentLink > icon by MIME type
 */

const ICON_URLS = {
  'image': 'https://drive-thirdparty.googleusercontent.com/16/type/image/png',
  'document': 'https://drive-thirdparty.googleusercontent.com/16/type/document/pdf',
  'sheet': 'https://drive-thirdparty.googleusercontent.com/16/type/spreadsheet/vnd.google-apps.spreadsheet',
  'slide': 'https://drive-thirdparty.googleusercontent.com/16/type/presentation/vnd.google-apps.presentation',
  'video': 'https://drive-thirdparty.googleusercontent.com/16/type/video/mp4',
  'folder': 'https://drive-thirdparty.googleusercontent.com/16/type/folder/folder',
  'default': 'https://drive-thirdparty.googleusercontent.com/16/type/document/octet-stream'
};

export async function getPreviewStream(
  tokens: DriveTokens,
  fileId: string
): Promise<{ data: Buffer; mimeType: string; fileName?: string }> {
  try {
    console.log('\n🎬 [Preview Service] Starting preview fetch');
    console.log(`📂 [Preview] File ID: ${fileId}`);
    console.log(`🔐 [Preview] Tokens available - access: ${tokens.access_token ? '✓' : '✗'}, refresh: ${tokens.refresh_token ? '✓' : '✗'}`);
    
    // Get file metadata to check for thumbnail/preview options
    console.log('📡 [Preview] Fetching file metadata from Google Drive...');
    const drive = getDriveClientFromTokens(tokens);
    const file = await drive.files.get({
      fileId,
      fields: 'id,name,mimeType,thumbnailLink,webContentLink,imageMediaMetadata,videoMediaMetadata'
    });

    const fileData = file.data;
    const fileName = fileData.name ?? undefined;
    const mimeType = fileData.mimeType || 'application/octet-stream';

    console.log(`✅ [Preview] Metadata retrieved:`);
    console.log(`   - File: ${fileName}`);
    console.log(`   - MimeType: ${mimeType}`);
    console.log(`   - ThumbnailLink: ${fileData.thumbnailLink ? '✓' : '✗'}`);
    console.log(`   - WebContentLink: ${fileData.webContentLink ? '✓' : '✗'}`);

    // Strategy 1: Use thumbnailLink if available (best for images, documents with previews)
    if (fileData.thumbnailLink) {
      console.log(`\n🔄 [Preview] Strategy 1: Attempting thumbnailLink...`);
      try {
        const response = await axios.get(fileData.thumbnailLink, {
          responseType: 'arraybuffer',
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (response.status === 200) {
          console.log(`✨ [Preview] ✓ Strategy 1 SUCCESS - Got ${(response.data as Buffer).length} bytes`);
          return {
            data: response.data,
            mimeType: 'image/jpeg',
            fileName
          };
        }
      } catch (err: any) {
        console.warn(`⚠️  [Preview] Strategy 1 FAILED: ${err.message}`);
      }
    } else {
      console.log(`⏭️  [Preview] Strategy 1 SKIPPED - No thumbnailLink available`);
    }

    // Strategy 2: For image files, try webContentLink (can be displayed inline)
    if (mimeType.startsWith('image/') && fileData.webContentLink) {
      console.log(`\n🔄 [Preview] Strategy 2: Attempting webContentLink (image)...`);
      try {
        const response = await axios.get(fileData.webContentLink, {
          responseType: 'arraybuffer',
          timeout: 5000,
          params: { access_token: tokens.access_token },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (response.status === 200) {
          console.log(`✨ [Preview] ✓ Strategy 2 SUCCESS - Got ${(response.data as Buffer).length} bytes`);
          return {
            data: response.data,
            mimeType: mimeType,
            fileName
          };
        }
      } catch (err: any) {
        console.warn(`⚠️  [Preview] Strategy 2 FAILED: ${err.message}`);
      }
    } else {
      console.log(`⏭️  [Preview] Strategy 2 SKIPPED - Image check: ${mimeType.startsWith('image/')}, webContentLink: ${!!fileData.webContentLink}`);
    }

    // Strategy 3: Generate icon based on MIME type
    console.log(`\n🔄 [Preview] Strategy 3: Attempting MIME-type icon fallback...`);
    const iconUrl = getMimeTypeIcon(mimeType);
    console.log(`📍 [Preview] Icon URL: ${iconUrl}`);
    const response = await axios.get(iconUrl, {
      responseType: 'arraybuffer',
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    console.log(`✨ [Preview] ✓ Strategy 3 SUCCESS - Got ${(response.data as Buffer).length} bytes`);
    return {
      data: response.data,
      mimeType: 'image/png',
      fileName
    };

  } catch (error: any) {
    console.error(`\n❌ [Preview] FATAL ERROR for ${fileId}:`);
    console.error(`   - Message: ${error.message}`);
    console.error(`   - Code: ${error.code || 'N/A'}`);
    if (error.response) {
      console.error(`   - HTTP Status: ${error.response.status}`);
      console.error(`   - Response Data: ${JSON.stringify(error.response.data).slice(0, 200)}`);
    }
    throw new Error(`Failed to generate preview: ${error.message}`);
  }
}

/**
 * Get appropriate icon URL based on MIME type
 */
function getMimeTypeIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) {
    return ICON_URLS.image;
  }
  if (mimeType.startsWith('video/')) {
    return ICON_URLS.video;
  }
  if (mimeType.includes('spreadsheet')) {
    return ICON_URLS.sheet;
  }
  if (mimeType.includes('presentation')) {
    return ICON_URLS.slide;
  }
  if (mimeType.includes('document') || mimeType.includes('word')) {
    return ICON_URLS.document;
  }
  if (mimeType === 'application/vnd.google-apps.folder') {
    return ICON_URLS.folder;
  }
  return ICON_URLS.default;
}
