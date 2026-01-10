import { Router, Request, Response } from 'express';
import { getAllIssueFiles, getIssuesFromFile, deleteIssueFile } from './seo-issue-handler';

const router = Router();

// Get all stored issue files
router.get('/stored-issues', async (req: Request, res: Response): Promise<any> => {
  try {
    const files = getAllIssueFiles();
    
    const fileInfo = files.map(fileName => {
      try {
        const data = getIssuesFromFile(fileName);
        return {
          fileName,
          timestamp: data.timestamp,
          analysisType: data.analysisType,
          totalIssues: data.totalIssues
        };
      } catch (error) {
        return {
          fileName,
          error: 'Failed to read file'
        };
      }
    });

    return res.json({
      success: true,
      totalFiles: files.length,
      files: fileInfo
    });

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get issues from specific file and delete it
router.get('/retrieve-issues/:fileName', async (req: Request, res: Response): Promise<any> => {
  try {
    const { fileName } = req.params;
    
    if (!fileName.endsWith('.json')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file name'
      });
    }

    const issueData = getIssuesFromFile(fileName);
    
    // Delete file after retrieval
    deleteIssueFile(fileName);

    return res.json({
      success: true,
      fileName,
      retrieved: true,
      deleted: true,
      data: issueData
    });

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all issues from all files and delete them
router.get('/retrieve-all-issues', async (req: Request, res: Response): Promise<any> => {
  try {
    const files = getAllIssueFiles();
    const allIssues = [];
    const processedFiles = [];

    for (const fileName of files) {
      try {
        const issueData = getIssuesFromFile(fileName);
        allIssues.push(...issueData.issues);
        processedFiles.push(fileName);
        
        // Delete file after retrieval
        deleteIssueFile(fileName);
      } catch (error) {
        console.error(`Failed to process file ${fileName}:`, error);
      }
    }

    return res.json({
      success: true,
      totalFiles: files.length,
      processedFiles: processedFiles.length,
      totalIssues: allIssues.length,
      filesDeleted: true,
      issues: allIssues
    });

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;