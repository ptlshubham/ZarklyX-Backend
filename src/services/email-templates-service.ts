import fs from "fs";
import path from "path";

// Default image
const DEFAULT_IMG =
    "https://cdn.jsdelivr.net/gh/dream-words/dreams-words-images@main/posts/1765115094183-921193959.png";

// Load HTML template file
function loadTemplate(filename: string): string {
    const filePath = path.join(__dirname, "../templates", `${filename}.html`);
    return fs.readFileSync(filePath, "utf-8");
}


// Replace {{var}} in template
function replaceVars(template: string, data: any): string {
    for (const key of Object.keys(data)) {
        template = template.replace(new RegExp(`{{${key}}}`, "g"), String(data[key]));
    }
    return template;
}


// OTP Titles mapped to type
const OTP_TITLES: Record<string, { title: string; subtitle: string }> = {
    register: { title: "Verify Your Email", subtitle: "Your OTP code is:" },
    login: { title: "Login Verification", subtitle: "Use the OTP to login:" },
    "forgot-password": { title: "Reset Password", subtitle: "Use this OTP to reset your password:" },
    email: { title: "Email Verification", subtitle: "Verify your email using this code:" },
};

export function getOtpTemplate(type: string, params: { otp: number; img?: string }): string {
    const html = loadTemplate("otp");
    const { title, subtitle } = OTP_TITLES[type];

    return replaceVars(html, {
        img: params.img || DEFAULT_IMG,
        title,
        subtitle,
        otp: params.otp,
    });
}


export function getWelcomeTemplate(params:any): string {
    const html = loadTemplate("welcome");
    return replaceVars(html, {
        img: params.img || DEFAULT_IMG,
        company: params.company,
        name: params.name,
        year: new Date().getFullYear(),
    });
}

export default {
    getOtpTemplate,
    getWelcomeTemplate,
};

