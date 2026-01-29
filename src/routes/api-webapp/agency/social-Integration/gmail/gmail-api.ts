import express, { Request, Response } from "express";
import { generateGmailAuthUrl, exchangeGmailCodeForTokens, listLabels, listMessages, listFullMessages, getFullMessage, getAttachmentWithMeta, sendMessage, sendEmailWithAttachments, getThreadFull } from "../../../../../services/gmail-service";
import fs from "fs";
import { DocumentUpload } from "../../../../../services/multer";
import path from "path";

const router = express.Router();

// Extract tokens from headers/query/body; omit empty values so refresh-only works
function extractTokens(req: Request) {
  const headerAT = (req.headers["x-access-token"] as string) || (req.headers["access_token"] as string);
  const queryAT = (req.query.access_token as string) || (req.body && (req.body.access_token as string));
  const headerRT = (req.headers["x-refresh-token"] as string) || (req.headers["refresh_token"] as string);
  const queryRT = (req.query.refresh_token as string) || (req.body && (req.body.refresh_token as string));

  const access_token = (headerAT || queryAT || "").trim();
  const refresh_token = (headerRT || queryRT || "").trim();

  const tokens: any = {};
  if (access_token) tokens.access_token = access_token;
  if (refresh_token) tokens.refresh_token = refresh_token;
  return tokens;
}

// GET /gmail/auth/url
router.get("/auth/url", async (req: Request, res: Response): Promise<void> => {
  try {
    const scopesParam = (req.query.scopes as string) || process.env.GMAIL_SCOPES || "https://www.googleapis.com/auth/gmail.readonly";
    const scopes = scopesParam.split(",").map(s => s.trim()).filter(Boolean);
    const url = generateGmailAuthUrl(scopes);
    res.status(200).json({ success: true, url });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to generate auth URL" });
    return;
  }
});

// GET /gmail/oauth2callback?code=...
router.get("/oauth2callback", async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.query.code as string;
    if (!code) {
      res.status(400).json({ success: false, message: "Missing 'code' parameter" });
      return;
    }
    const tokens = await exchangeGmailCodeForTokens(code);
    res.status(200).json({ success: true, tokens });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "OAuth callback failed" });
    return;
  }
});

// GET /gmail/me/labels
router.get("/me/labels", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    const data = await listLabels(tokens);
    res.status(200).json({ success: true, data });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to fetch labels" });
    return;
  }
});

// GET /gmail/me/messages?q=from:someone@example.com
router.get("/me/messages", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    const q = (req.query.q as string) || undefined;
    const maxResults = Number(req.query.maxResults || 10);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    const data = await listMessages(tokens, q, maxResults);
    res.status(200).json({ success: true, data });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to fetch messages" });
    return;
  }
});

// GET /gmail/me/search?from=&subject=&after=YYYY/MM/DD&before=YYYY/MM/DD&maxResults=&pageToken=
router.get("/me/search", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    const from = (req.query.from as string) || "";
    const subject = (req.query.subject as string) || "";
    const after = (req.query.after as string) || ""; // YYYY/MM/DD
    const before = (req.query.before as string) || ""; // YYYY/MM/DD
    const maxResults = Number(req.query.maxResults || 10);
    const pageToken = (req.query.pageToken as string) || undefined;

    const clauses: string[] = [];
    if (from) clauses.push(`from:${from}`);
    if (subject) clauses.push(`subject:${subject}`);
    if (after) clauses.push(`after:${after}`);
    if (before) clauses.push(`before:${before}`);
    const q = clauses.join(" ") || undefined;

    const { messages, nextPageToken } = await listFullMessages(tokens, q, maxResults, pageToken);
    res.status(200).json({ success: true, messages, nextPageToken });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to search messages" });
    return;
  }
});

// GET /gmail/me/messages/full?q=&maxResults=&pageToken=
// Returns full details for each message in the page
router.get("/me/messages/full", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    const q = (req.query.q as string) || undefined;
    const maxResults = Number(req.query.maxResults || 10);
    const pageToken = (req.query.pageToken as string) || undefined;
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    const { messages, nextPageToken } = await listFullMessages(tokens, q, maxResults, pageToken);
    res.status(200).json({ success: true, messages, nextPageToken });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to fetch full messages" });
    return;
  }
});

// GET /gmail/me/messages/:id?format=full
// router.get("/me/messages/:id", async (req: Request, res: Response): Promise<void> => {
//   try {
//     const access_token = (req.headers["x-access-token"] as string) || (req.query.access_token as string) || "";
//     const refresh_token = (req.headers["x-refresh-token"] as string) || (req.query.refresh_token as string) || undefined;
//     const id = req.params.id as string;
//     const format = (req.query.format as string) as "full" | "metadata" | "minimal" | "raw" || "full";
//     if (!access_token && !refresh_token) {
//       res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
//       return;
//     }
//     if (!id) {
//       res.status(400).json({ success: false, message: "Missing message id" });
//       return;
//     }
//     const data = await getMessage({ access_token, refresh_token }, id, format);
//     res.status(200).json({ success: true, data });
//     return;
//   } catch (error: any) {
//     res.status(500).json({ success: false, message: error.message || "Failed to fetch message" });
//     return;
//   }
// });

// GET /gmail/me/messages/:id  -> fetch full Gmail message
router.get("/me/messages/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const messageId = req.params.id;
    const tokens = extractTokens(req);

    if (!messageId) {
      res.status(400).json({ success: false, message: "Message ID required" });
      return;
    }

    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    const data = await getFullMessage(tokens, messageId);

    res.status(200).json({ success: true, data });
    return;

  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch message",
    });
  }
});

// GET /gmail/me/messages/:id/attachments/:attachmentId  -> download attachment
router.get("/me/messages/:id/attachments/:attachmentId", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    const messageId = req.params.id;
    const attachmentId = req.params.attachmentId;
    const download = String(req.query.download || "").toLowerCase() === "1";
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    if (!messageId || !attachmentId) {
      res.status(400).json({ success: false, message: "Missing messageId or attachmentId" });
      return;
    }
    const data = await getAttachmentWithMeta(tokens, messageId, attachmentId);
    const buffer = Buffer.from(data.dataBase64 || "", "base64");
    if (download) {
      const filename = (data.filename || "attachment").replace(/\s+/g, "_");
      const mimeType = data.mimeType || "application/octet-stream";
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.status(200).send(buffer);
      return;
    }
    const decoded = buffer.toString("utf8");
    res.status(200).json({ success: true, data: {
      filename: data.filename || "attachment",
      mimeType: data.mimeType || "application/octet-stream",
      data: decoded,
    }});
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to download attachment" });
    return;
  }
});

// GET /gmail/me/threads/:threadId  -> fetch all messages in a thread (full)
router.get("/me/threads/:threadId", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    const threadId = req.params.threadId;
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    if (!threadId) {
      res.status(400).json({ success: false, message: "Missing threadId" });
      return;
    }
    const { messages } = await getThreadFull(tokens, threadId);
    res.status(200).json({ success: true, messages });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to fetch thread" });
    return;
  }
});

// POST /gmail/me/send
// Body: { raw: base64urlEncodedRFC2822 }
router.post("/me/send", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    const raw = (req.body.raw as string) || "";
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    if (!raw) {
      res.status(400).json({ success: false, message: "Missing 'raw' base64url email content" });
      return;
    }
  const data = await sendMessage(tokens, raw);
    res.status(200).json({ success: true, data });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to send message" });
    return;
  }
});

// POST /gmail/me/send-attachments
// Accepts either JSON attachments [{ filename, mimeType, dataBase64 }] or multipart/form-data files under field 'attachments'
router.post("/me/send-attachments", DocumentUpload.array("attachments", 10), async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }

    const to = (req.body.to as string) || "";
    const from = (req.body.from as string) || "";
    const subject = (req.body.subject as string) || "";
    const text = (req.body.text as string) || undefined;
    const html = (req.body.html as string) || undefined;

    if (!to || !from || !subject) {
      res.status(400).json({ success: false, message: "Missing required fields: from, to, subject" });
      return;
    }

    let attachments: Array<{ filename: string; mimeType: string; base64: string }> = [];

    // JSON attachments support
    const jsonAtt = req.body.attachments;
    if (jsonAtt) {
      try {
        const parsed = typeof jsonAtt === "string" ? JSON.parse(jsonAtt) : jsonAtt;
        if (Array.isArray(parsed)) {
          attachments.push(
            ...parsed.map((a: any) => ({ filename: a.filename, mimeType: a.mimeType || "application/octet-stream", base64: a.dataBase64 || a.base64 }))
          );
        }
      } catch (e) {
        // ignore bad JSON; fall through to files
      }
    }

    // Multipart files
    const files = (req.files as Express.Multer.File[]) || [];
    for (const f of files) {
      const fileData = fs.readFileSync(f.path);
      const base64 = fileData.toString("base64");
      attachments.push({ filename: f.originalname.replace(/\s+/g, "_"), mimeType: f.mimetype || "application/octet-stream", base64 });
    }

    const data = await sendEmailWithAttachments(tokens, { from, to, subject, text, html, attachments });
    res.status(200).json({ success: true, data });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to send email with attachments" });
    return;
  }
});

// POST /gmail/me/send-template
// Body: { from, to, subject, templatePath?: string, variables?: object }
router.post("/me/send-template", async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = extractTokens(req);
    if (!tokens.access_token && !tokens.refresh_token) {
      res.status(400).json({ success: false, message: "Provide access_token or refresh_token" });
      return;
    }
    const from = (req.body.from as string) || "";
    const to = (req.body.to as string) || "";
    const subject = (req.body.subject as string) || "";
    const templatePath = (req.body.templatePath as string) || path.join(process.cwd(), "src", "template", "invoice.html");
    const variables = (req.body.variables as any) || {};
    if (!from || !to || !subject) {
      res.status(400).json({ success: false, message: "Missing required fields: from, to, subject" });
      return;
    }
    let html = fs.readFileSync(templatePath, "utf8");
    // simple variable substitution: {{key}}
    html = html.replace(/{{\s*(\w+)\s*}}/g, (_m, key) => String(variables[key] ?? ""));
    const data = await sendEmailWithAttachments(tokens, { from, to, subject, html, attachments: [] });
    res.status(200).json({ success: true, data });
    return;
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Failed to send template email" });
    return;
  }
});

module.exports = router;
