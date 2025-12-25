import { google } from "googleapis";
import fs from "fs";

function getRedirectUri() {
  return process.env.GMAIL_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/gmail/oauth2callback`;
}

export function getGmailOAuthClient(redirectUri?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirect = redirectUri || getRedirectUri();
  return new google.auth.OAuth2(clientId, clientSecret, redirect);
}

export function generateGmailAuthUrl(scopes?: string[]) {
  const oauth2Client = getGmailOAuthClient();
  const scopeList = scopes && scopes.length > 0
    ? scopes
    : (process.env.GMAIL_SCOPES || "https://www.googleapis.com/auth/gmail.readonly").split(",").map(s => s.trim()).filter(Boolean);

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopeList,
  });
}

export async function exchangeGmailCodeForTokens(code: string, redirectUri?: string) {
  const oauth2Client = getGmailOAuthClient(redirectUri);
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export function getGmailClient(tokens: any) {
  const oauth2Client = getGmailOAuthClient();
  oauth2Client.setCredentials(tokens);
  return google.gmail({ version: "v1", auth: oauth2Client });
}

export async function listLabels(tokens: any) {
  const gmail = getGmailClient(tokens);
  const res = await gmail.users.labels.list({ userId: "me" });
  return res.data;
}

export async function listMessages(tokens: any, query?: string, maxResults: number = 10) {
  const gmail = getGmailClient(tokens);
  const res = await gmail.users.messages.list({ userId: "me", q: query, maxResults });
  return res.data;
}

// export async function getMessage(tokens: any, id: string, format: "full" | "metadata" | "minimal" | "raw" = "full") {
//   const gmail = getGmailClient(tokens);
//   const res = await gmail.users.messages.get({ userId: "me", id, format });
//   return res.data;
// }

export async function getFullMessage(tokens: any, messageId: string) {
  // Use configured OAuth2 client so refresh_token flows work
  const oauth2Client = getGmailOAuthClient();
  const creds: any = {};
  if (tokens?.access_token) creds.access_token = tokens.access_token;
  if (tokens?.refresh_token) creds.refresh_token = tokens.refresh_token;
  oauth2Client.setCredentials(creds);

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const message = res.data;

  // Extract headers
  const headers = message.payload?.headers || [];

  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || null;

  // Decode body
  let body = "";
  if (message.payload?.body?.data) {
    const data = message.payload.body.data.replace(/-/g, "+").replace(/_/g, "/");
    body = Buffer.from(data, "base64").toString("utf-8");
  } else if (message.payload?.parts) {
    const part = message.payload.parts.find((p) => p.mimeType === "text/html" || p.mimeType === "text/plain");
    if (part?.body?.data) {
      const pdata = part.body.data.replace(/-/g, "+").replace(/_/g, "/");
      body = Buffer.from(pdata, "base64").toString("utf-8");
    }
  }

  return {
    id: message.id,
    threadId: message.threadId,
    snippet: message.snippet,
    subject: getHeader("Subject"),
    from: getHeader("From"),
    to: getHeader("To"),
    date: getHeader("Date"),
    body,
    attachments:
      message.payload?.parts
        ?.filter((p) => p.filename && p.body?.attachmentId)
        ?.map((p) => ({
          filename: p.filename,
          mimeType: p.mimeType,
          attachmentId: p.body?.attachmentId,
        })) || [],
  };
}

// List messages and return full details for each message (subject, from, snippet, body, attachments)
export async function listFullMessages(
  tokens: any,
  query?: string,
  maxResults: number = 10,
  pageToken?: string
) {
  const gmail = getGmailClient(tokens);
  const res = await gmail.users.messages.list({ userId: "me", q: query, maxResults, pageToken });
  const ids = (res.data.messages || []).map((m) => m.id!).filter(Boolean);
  // Fetch details in parallel (reasonable limit via maxResults)
  const messages = await Promise.all(ids.map((id) => getFullMessage(tokens, id)));
  return {
    messages,
    nextPageToken: res.data.nextPageToken,
    resultSizeEstimate: res.data.resultSizeEstimate,
  };
}

// Fetch full thread details: returns array of normalized messages
export async function getThreadFull(tokens: any, threadId: string) {
  const gmail = getGmailClient(tokens);
  const res = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
  const thread = res.data;
  const msgs = thread.messages || [];
  // Normalize each message similar to getFullMessage
  const normalized = msgs.map((message) => {
    const headers = message.payload?.headers || [] as any[];
    const getHeader = (name: string) => headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || null;
    // Decode body
    let body = "";
    if (message.payload?.body?.data) {
      const data = (message.payload.body.data || "").replace(/-/g, "+").replace(/_/g, "/");
      body = Buffer.from(data, "base64").toString("utf-8");
    } else if (message.payload?.parts) {
      const part = message.payload.parts.find((p: any) => p.mimeType === "text/html" || p.mimeType === "text/plain");
      if (part?.body?.data) {
        const pdata = (part.body.data || "").replace(/-/g, "+").replace(/_/g, "/");
        body = Buffer.from(pdata, "base64").toString("utf-8");
      }
    }
    const attachments = (message.payload?.parts || [])
      .filter((p: any) => p.filename && p.body?.attachmentId)
      .map((p: any) => ({ filename: p.filename, mimeType: p.mimeType, attachmentId: p.body?.attachmentId }));
    return {
      id: message.id,
      threadId: message.threadId,
      snippet: message.snippet,
      subject: getHeader("Subject"),
      from: getHeader("From"),
      to: getHeader("To"),
      date: getHeader("Date"),
      body,
      attachments,
    };
  });
  return { messages: normalized };
}

// Download a Gmail attachment; returns { dataBase64, size, mimeType }
export async function getAttachment(tokens: any, messageId: string, attachmentId: string) {
  const oauth2Client = getGmailOAuthClient();
  const creds: any = {};
  if (tokens?.access_token) creds.access_token = tokens.access_token;
  if (tokens?.refresh_token) creds.refresh_token = tokens.refresh_token;
  oauth2Client.setCredentials(creds);

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const res = await gmail.users.messages.attachments.get({ userId: "me", messageId, id: attachmentId });
  const data = res.data?.data || ""; // base64url
  const dataBase64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return {
    dataBase64,
    size: res.data?.size || data.length,
    mimeType: undefined as string | undefined, // Gmail API doesn't return mimeType here; could infer via filename from message
  };
}

// Attachment with metadata: finds filename and mimeType from the message payload parts matching attachmentId
export async function getAttachmentWithMeta(tokens: any, messageId: string, attachmentId: string) {
  const oauth2Client = getGmailOAuthClient();
  const creds: any = {};
  if (tokens?.access_token) creds.access_token = tokens.access_token;
  if (tokens?.refresh_token) creds.refresh_token = tokens.refresh_token;
  oauth2Client.setCredentials(creds);

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const msg = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  const parts = msg.data?.payload?.parts || [];
  const found = parts.find((p: any) => p?.body?.attachmentId === attachmentId) || null;
  const filename = found?.filename || undefined;
  const mimeType = found?.mimeType || undefined;

  const res = await gmail.users.messages.attachments.get({ userId: "me", messageId, id: attachmentId });
  const data = res.data?.data || ""; // base64url
  const dataBase64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return {
    filename: filename || undefined,
    mimeType: mimeType || "application/octet-stream",
    dataBase64,
  };
}

export async function sendMessage(tokens: any, rawMessageBase64Url: string) {
  const gmail = getGmailClient(tokens);
  // raw must be base64url encoded RFC 2822 message
  const res = await gmail.users.messages.send({ userId: "me", requestBody: { raw: rawMessageBase64Url } });
  return res.data;
}

// Build RFC 2822 raw message with attachments; returns base64url string
export function buildRawEmailWithAttachments(params: {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{ filename: string; mimeType: string; base64: string }>;
}) {
  const boundary = "mix_" + Date.now();
  const altBoundary = "alt_" + Date.now();

  const headers = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary=\"${boundary}\"`,
    "",
    "This is a multi-part message in MIME format.",
    "",
  ].join("\r\n");

  const altParts = [] as string[];
  if (params.text) {
    altParts.push([
      `--${altBoundary}`,
      "Content-Type: text/plain; charset=\"UTF-8\"",
      "Content-Transfer-Encoding: 7bit",
      "",
      params.text,
      "",
    ].join("\r\n"));
  }
  if (params.html) {
    altParts.push([
      `--${altBoundary}`,
      "Content-Type: text/html; charset=\"UTF-8\"",
      "Content-Transfer-Encoding: 7bit",
      "",
      params.html,
      "",
    ].join("\r\n"));
  }
  altParts.push(`--${altBoundary}--`);

  const mixedStart = [
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary=\"${altBoundary}\"`,
    "",
    altParts.join("\r\n"),
    "",
  ].join("\r\n");

  const attachmentParts = (params.attachments || []).map((att) => [
    `--${boundary}`,
    `Content-Type: ${att.mimeType}; name=\"${att.filename}\"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename=\"${att.filename}\"`,
    "",
    att.base64,
    "",
  ].join("\r\n"));

  const endBoundary = `--${boundary}--`;

  const message = [headers, mixedStart, ...attachmentParts, endBoundary, ""].join("\r\n");
  const base64 = Buffer.from(message).toString("base64");
  const base64url = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return base64url;
}

export async function sendEmailWithAttachments(tokens: any, params: {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{ filename: string; mimeType: string; base64: string }>;
}) {
  const raw = buildRawEmailWithAttachments(params);
  return await sendMessage(tokens, raw);
}
