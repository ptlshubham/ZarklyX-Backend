import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const ISSUES_DIR = path.join(process.cwd(), 'temp-issues');

// Ensure directory exists
if (!fs.existsSync(ISSUES_DIR)) {
  fs.mkdirSync(ISSUES_DIR, { recursive: true });
}

export async function saveIssueAnalysis(issues: any[], analysisType: string = 'general'): Promise<string> {
  // try {
    const fileName = `issues_${analysisType}_${Date.now()}_${uuidv4()}.json`;
    const filePath = path.join(ISSUES_DIR, fileName);
    
    const issueData = {
      timestamp: new Date().toISOString(),
      analysisType,
      totalIssues: issues.length,
      issues
    };
    
    fs.writeFileSync(filePath, JSON.stringify(issueData, null, 2));
    return fileName;
  // } catch (error) {
  //   console.error('Failed to save issues to file:', error);
  //   throw error;
  // }
}

export function getAllIssueFiles(): string[] {
  // try {
    return fs.readdirSync(ISSUES_DIR).filter(file => file.endsWith('.json'));
  // } catch (error) {
  //   console.error('Failed to read issues directory:', error);
  //   return [];
  // }
}

export function getIssuesFromFile(fileName: string): any {
  // try {
    const filePath = path.join(ISSUES_DIR, fileName);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContent);
  // } catch (error) {
  //   console.error(`Failed to read issues from file ${fileName}:`, error);
  //   throw error;
  // }
}

export function deleteIssueFile(fileName: string): void {
  // try {
    const filePath = path.join(ISSUES_DIR, fileName);
    fs.unlinkSync(filePath);
  // } catch (error) {
  //   console.error(`Failed to delete issue file ${fileName}:`, error);
  //   throw error;
  // }
}