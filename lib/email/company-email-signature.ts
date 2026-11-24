import sanitizeHtml from "sanitize-html";

export type CompanyEmailSignatureAsset = {
    contentId: string;
    filePath: string;
    fileName: string;
    mimeType: "image/png";
    fileSizeBytes: number;
    previewUrl?: string;
};

const allowedTags = [
    "a", "b", "body", "br", "div", "em", "font", "head", "html", "i",
    "blockquote", "del", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "img",
    "ins", "li", "meta", "o:p", "ol", "p", "pre", "small", "span", "strong",
    "style", "sub", "sup", "table", "tbody", "td", "th", "tr", "u", "ul",
];

const safeSimpleCssValue = /^(?!.*(?:url\s*\(|expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding))[-#(),.%\w\s/'"]{1,240}$/i;

const allowedStyles: sanitizeHtml.IOptions["allowedStyles"] = {
    "*": {
        color: [safeSimpleCssValue],
        "background-color": [safeSimpleCssValue],
        "font-family": [safeSimpleCssValue],
        "font-size": [safeSimpleCssValue],
        "font-weight": [safeSimpleCssValue],
        "font-style": [safeSimpleCssValue],
        "text-align": [safeSimpleCssValue],
        "text-decoration": [safeSimpleCssValue],
        "vertical-align": [safeSimpleCssValue],
        "border-collapse": [safeSimpleCssValue],
        "border-spacing": [safeSimpleCssValue],
        "line-height": [safeSimpleCssValue],
        "letter-spacing": [safeSimpleCssValue],
        "text-indent": [safeSimpleCssValue],
        "white-space": [safeSimpleCssValue],
        display: [safeSimpleCssValue],
        width: [safeSimpleCssValue],
        height: [safeSimpleCssValue],
        "max-width": [safeSimpleCssValue],
        "min-width": [safeSimpleCssValue],
        "border-width": [safeSimpleCssValue],
        "border-style": [safeSimpleCssValue],
        "border-color": [safeSimpleCssValue],
        "mso-line-height-rule": [safeSimpleCssValue],
        "mso-margin-top-alt": [safeSimpleCssValue],
        "mso-margin-bottom-alt": [safeSimpleCssValue],
        "mso-ansi-language": [safeSimpleCssValue],
        "mso-bidi-language": [safeSimpleCssValue],
        "mso-fareast-language": [safeSimpleCssValue],
        "mso-list": [safeSimpleCssValue],
        "mso-padding-alt": [safeSimpleCssValue],
        "mso-para-margin": [safeSimpleCssValue],
        "mso-style-name": [safeSimpleCssValue],
        "mso-style-noshow": [safeSimpleCssValue],
        "mso-style-priority": [safeSimpleCssValue],
        "mso-style-qformat": [safeSimpleCssValue],
        "mso-style-unhide": [safeSimpleCssValue],
        "tab-stops": [safeSimpleCssValue],
        "page-break-before": [safeSimpleCssValue],
        "page-break-after": [safeSimpleCssValue],
        "word-break": [safeSimpleCssValue],
        margin: [safeSimpleCssValue],
        padding: [safeSimpleCssValue],
    },
};

function sanitizeOutlookStyleBlocks(value: string): string {
    return value.replace(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi, (_match, attributes: string, css: string) => {
        const safeCss = css
            .replace(/@import\b[^;]*;?/gi, "")
            .replace(/url\s*\([^)]*\)/gi, "")
            .replace(/expression\s*\([^)]*\)/gi, "")
            .replace(/(?:behavior|-moz-binding)\s*:[^;}]*;?/gi, "")
            .replace(/javascript\s*:/gi, "");
        return `<style${attributes}>${safeCss}</style>`;
    });
}

export function sanitizeCompanyEmailSignatureHtml(value: unknown): string {
    if (typeof value !== "string") return "";
    const source = sanitizeOutlookStyleBlocks(value);
    const sanitized = sanitizeHtml(source, {
        allowedTags,
        allowedAttributes: {
            "*": ["align", "bgcolor", "border", "cellpadding", "cellspacing", "class", "color", "dir", "height", "id", "lang", "rowspan", "valign", "width", "style"],
            a: ["href", "title", "target", "rel", "style"],
            body: ["bgcolor", "class", "dir", "lang", "style"],
            div: ["style"],
            font: ["color", "face", "size", "style"],
            img: ["src", "alt", "width", "height", "style"],
            meta: ["charset", "content", "http-equiv", "name"],
            li: ["style"],
            ol: ["style"],
            p: ["style"],
            span: ["style"],
            table: ["border", "cellpadding", "cellspacing", "style", "width"],
            td: ["colspan", "rowspan", "style", "valign", "width"],
            th: ["colspan", "rowspan", "style", "valign", "width"],
            tr: ["style"],
            ul: ["style"],
        },
        allowedStyles,
        allowedSchemes: ["http", "https", "mailto", "cid"],
        allowedSchemesByTag: { img: ["cid"] },
        allowedIframeHostnames: [],
        selfClosing: ["img", "meta", "br"],
        transformTags: {
            a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
        },
    }).trim();

    // Outlook often wraps the signature in html/head/body and defines formatting
    // through Word-generated classes. Keep the CSS and the body fragment while
    // avoiding a nested document when WAW appends it to an email template.
    const styles = [...sanitized.matchAll(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi)].map((match) => match[0]);
    const bodyMatch = sanitized.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
    const fragment = bodyMatch
        ? bodyMatch[1]
        : sanitized.replace(/<\/?(?:html|head|body)\b[^>]*>/gi, "").replace(/<meta\b[^>]*>/gi, "");
    return [...styles, fragment].filter(Boolean).join("\n").trim();
}

export function extractCompanyEmailSignatureContentIds(html: string): string[] {
    const sanitized = sanitizeCompanyEmailSignatureHtml(html);
    return [...new Set(Array.from(sanitized.matchAll(/\bsrc\s*=\s*["']cid:([a-z0-9_-]{1,80})["']/gi), (match) => match[1]))];
}

export function companyEmailSignaturePlainText(html: string): string {
    return sanitizeCompanyEmailSignatureHtml(html)
        .replace(/<\s*br\s*\/?\s*>/gi, "\n")
        .replace(/<\/(p|div|li|tr|table|ul|ol)>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&#039;/gi, "'")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");
}

const standardClosings = [
    "mit freundlichen grüßen", "kind regards", "me respekt", "مع أطيب التحيات",
    "з павагай", "srdačan pozdrav", "s poštovanjem", "с уважением", "с уважением",
    "üdvözlettel", "з повагою", "best regards", "atentament", "venlig hilsen",
    "lugupidamisega", "ystävällisin terveisin", "cordialement", "με εκτίμηση",
    "le dea-mhéin", " kær kveðja", "cordiali saluti", "ar cieņu", "pagarbiai",
    "mat beschte gréiss", "со почит", "tislijiet", "met vriendelijke groet",
    "med vennlig hilsen", "z poważaniem", "com os melhores cumprimentos", "cu stimă",
    "s pozdravom", "lep pozdrav", "atentamente", "med vänliga hälsningar",
    "s pozdravem", "saygılarımızla", "з повагою", "üdvözlettel",
];

function isStandardClosing(value: string): boolean {
    const normalized = value.trim().replace(/[.,!]+$/g, "").toLocaleLowerCase();
    return standardClosings.includes(normalized);
}

const standardCompanyNames = ["waw nutzfahrzeuge", "w.a.w nutzfahrzeuge", "waw"];

function isStandardCompanyName(value: string): boolean {
    return standardCompanyNames.includes(value.trim().replace(/[.,]+$/g, "").toLocaleLowerCase());
}

export function removeStandardEmailClosing(html: string, text: string): { html: string; text: string } {
    const cleanedHtml = sanitizeCompanyEmailSignatureHtml(html).replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (paragraph, contents: string) => {
        const plain = contents.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
        const lines = plain.split(/\s*\n\s*/).map((line) => line.trim()).filter(Boolean);
        if (lines.length > 0 && lines.length <= 2 && isStandardClosing(lines[0]) && (lines.length === 1 || isStandardCompanyName(lines[1]))) return "";
        return paragraph;
    });
    const lines = text.split("\n");
    const filtered: string[] = [];
    for (let index = 0; index < lines.length; index += 1) {
        if (isStandardClosing(lines[index])) {
            if (lines[index + 1] && isStandardCompanyName(lines[index + 1])) index += 1;
            continue;
        }
        filtered.push(lines[index]);
    }
    return { html: cleanedHtml, text: filtered.join("\n").trim() };
}

export function renderCompanyEmailSignaturePreview(
    html: string,
    assets: CompanyEmailSignatureAsset[],
): string {
    const sanitized = sanitizeCompanyEmailSignatureHtml(html);
    const urls = new Map(assets.filter((asset) => asset.previewUrl).map((asset) => [asset.contentId, asset.previewUrl!]));
    const withPreviewUrls = sanitized.replace(/\bsrc=(['"])cid:([a-z0-9_-]{1,80})\1/gi, (whole, quote: string, contentId: string) => {
        const url = urls.get(contentId);
        return url ? `src=${quote}${url.replaceAll("&", "&amp;")}${quote}` : "";
    });
    return sanitizeHtml(withPreviewUrls, {
        allowedTags,
        allowedAttributes: {
            "*": ["align", "bgcolor", "border", "cellpadding", "cellspacing", "class", "color", "dir", "height", "id", "lang", "rowspan", "valign", "width", "style"],
            a: ["href", "title", "target", "rel", "style"],
            div: ["style"],
            font: ["color", "face", "size", "style"],
            img: ["src", "alt", "width", "height", "style"],
            p: ["style"],
            span: ["style"],
            table: ["border", "cellpadding", "cellspacing", "style", "width"],
            td: ["colspan", "rowspan", "style", "valign", "width"],
            th: ["colspan", "rowspan", "style", "valign", "width"],
        },
        allowedStyles,
        allowedSchemes: ["https", "http", "mailto"],
        allowedSchemesByTag: { img: ["https"] },
    });
}

export function isValidEmailSignatureContentId(value: unknown): value is string {
    return typeof value === "string" && /^[a-z0-9_-]{1,80}$/i.test(value);
}
