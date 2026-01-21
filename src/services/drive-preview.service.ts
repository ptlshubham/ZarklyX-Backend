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
    // Get file metadata to check for thumbnail/preview options
    const drive = getDriveClientFromTokens(tokens);
    const file = await drive.files.get({
      fileId,
      fields: 'id,name,mimeType,thumbnailLink,webContentLink,imageMediaMetadata,videoMediaMetadata'
    });

    const fileData = file.data;
    const fileName = fileData.name ?? undefined;
    const mimeType = fileData.mimeType || 'application/octet-stream';

    // Strategy 1: Use thumbnailLink if available (best for images, documents with previews)
    if (fileData.thumbnailLink) {
      try {
        const response = await axios.get(fileData.thumbnailLink, {
          responseType: 'arraybuffer',
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (response.status === 200) {
          return {
            data: response.data,
            mimeType: 'image/jpeg',
            fileName
          };
        }
      } catch (err: any) {
        // Continue to next strategy
      }
    }

    // Strategy 2: For image files, try webContentLink (can be displayed inline)
    if (mimeType.startsWith('image/') && fileData.webContentLink) {
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
          return {
            data: response.data,
            mimeType: mimeType,
            fileName
          };
        }
      } catch (err: any) {
        // Continue to next strategy
      }
    }

    // Strategy 3: Generate icon based on MIME type
    const iconUrl = getMimeTypeIcon(mimeType);
    const response = await axios.get(iconUrl, {
      responseType: 'arraybuffer',
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    return {
      data: response.data,
      mimeType: 'image/png',
      fileName
    };

  } catch (error: any) {
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
