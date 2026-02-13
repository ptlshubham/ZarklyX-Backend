import fs from 'fs';
import path from 'path';
import axios, { AxiosError } from 'axios';

// Type definitions
interface GitHubFileResponse {
    content?: string;
    sha: string;
    url: string;
    [key: string]: any;
}

interface GitHubDeleteResponse {
    message: string;
    content: null;
    commit: {
        sha: string;
        url: string;
        [key: string]: any;
    };
    [key: string]: any;
}

// Configuration
const GITHUB_TOKEN: string = process.env.GITHUB_TOKEN || '';
const REPO_OWNER: string = process.env.REPO_OWNER || 'navadiyadarshan';
const REPO_NAME: string = process.env.REPO_NAME || 'test-image-upload';
const BRANCH: string = 'main';

const BASE_URL: string = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;

/**
 * Upload a file to GitHub repository
 * File is stored locally after upload
 * @param localFilePath - Path to the local file to upload
 * @param repoFolder - Folder path in GitHub repo (default: "posts")
 * @returns jsDelivr CDN URL or null if upload fails
 */
const uploadToGitHub = async (
    localFilePath: string,
    repoFolder: string = 'posts'
): Promise<string | null> => {
    try {
        if (!fs.existsSync(localFilePath)) return null;

        const content: string = fs.readFileSync(localFilePath, {
            encoding: 'base64',
        });
        const filename: string = path.basename(localFilePath);
        const fileUrl: string = `${BASE_URL}/${repoFolder}/${filename}`;

        // Check if file exists to get SHA for update
        let sha: string | null = null;
        try {
            const existingFile = await axios.get<GitHubFileResponse>(fileUrl, {
                headers: {
                    Authorization: `Bearer ${GITHUB_TOKEN}`,
                    Accept: 'application/vnd.github+json',
                },
            });
            sha = existingFile.data.sha;
        } catch (err) {
            const axiosError = err as AxiosError;
            if (!axiosError.response || axiosError.response.status !== 404) {
                throw err;
            }
        }

        // Upload or update file
        await axios.put(
            fileUrl,
            {
                message: `Upload ${filename}`,
                content,
                branch: BRANCH,
                ...(sha && { sha }),
            },
            {
                headers: {
                    Authorization: `Bearer ${GITHUB_TOKEN}`,
                    Accept: 'application/vnd.github+json',
                },
            }
        );

        fs.unlinkSync(localFilePath);

        // Return jsDelivr CDN URL for the uploaded file
        return `https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@${BRANCH}/${repoFolder}/${filename}`;
    } catch (error) {
        const axiosError = error as AxiosError;
        console.error(
            '[IMAGE UPLOADER] Upload Error:',
            axiosError.message || error
        );
        return null;
    }
};

/**
 * Extract repository file path from various image URL formats
 * @param url - Image URL (GitHub raw, Netlify, or jsDelivr CDN)
 * @returns Repository file path
 * @throws Error if URL format is invalid
 */
const extractRepoFilePath = (url: string): string => {
    const githubRawMatch: RegExpMatchArray | null = url.match(
        /githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)/
    );
    const netlifyMatch: RegExpMatchArray | null = url.match(
        /test-x-image\.netlify\.app\/(.+)/
    );
    const jsDelivrMatch: RegExpMatchArray | null = url.match(
        /cdn\.jsdelivr\.net\/gh\/[^/]+\/[^@]+@[^/]+\/(.+)/
    );

    if (githubRawMatch) return githubRawMatch[1];
    if (netlifyMatch) return netlifyMatch[1];
    if (jsDelivrMatch) return jsDelivrMatch[1];

    throw new Error('Invalid image URL format');
};

/**
 * Delete a file from GitHub repository
 * @param imageUrl - CDN URL of the file to delete
 * @returns GitHub delete response or null if deletion fails
 */
const deleteFromGitHub = async (
    imageUrl: string
): Promise<GitHubDeleteResponse | null> => {
    try {
        const repoPath: string = extractRepoFilePath(imageUrl);
        const fileUrl: string = `${BASE_URL}/${repoPath}`;

        // Get file SHA
        const { data } = await axios.get<GitHubFileResponse>(fileUrl, {
            headers: {
                Authorization: `Bearer ${GITHUB_TOKEN}`,
                Accept: 'application/vnd.github+json',
            },
        });

        const sha: string = data.sha;

        // Delete file from repo
        const response = await axios.delete<GitHubDeleteResponse>(fileUrl, {
            headers: {
                Authorization: `Bearer ${GITHUB_TOKEN}`,
                Accept: 'application/vnd.github+json',
            },
            data: {
                message: `Delete ${repoPath}`,
                sha,
                branch: BRANCH,
            },
        });

        return response.data;
    } catch (error) {
        const axiosError = error as AxiosError;
        console.error(
            '[IMAGE UPLOADER] Delete Error:',
            axiosError.message || error
        );
        return null;
    }
};

export {
    uploadToGitHub,
    deleteFromGitHub,
    extractRepoFilePath,
    GitHubFileResponse,
    GitHubDeleteResponse,
};
