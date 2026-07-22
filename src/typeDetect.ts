import type { TextDetectedType } from './types.js';

const URL_RE = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;
const PATH_RE = /^(\/|~\/|\.\.?\/)\S+$/;
const YAML_LINE_RE = /^\s*(-\s+\S|[\w.-]+:(\s+\S|\s*$))/;
const CODE_HINT_RE = /[{};]|=>|\bfunction\b|\bconst\b|\blet\b|\bimport\b|\bclass\b|\bdef\b|\breturn\b/;

/**
 * Best-effort label for a text entry, used only for the UI badge/preview
 * styling. Never used to alter the stored text itself.
 */
export function detectTextType(text: string): TextDetectedType {
    const trimmed = text.trim();
    if (trimmed.length === 0)
        return 'plain';

    if (!trimmed.includes('\n')) {
        if (URL_RE.test(trimmed))
            return 'url';
        if (PATH_RE.test(trimmed))
            return 'path';
    }

    if (looksLikeJson(trimmed))
        return 'json';

    if (looksLikeYaml(trimmed))
        return 'yaml';

    if (looksLikeCode(trimmed))
        return 'code';

    return 'plain';
}

function looksLikeJson(text: string): boolean {
    const isObjectOrArray =
        (text.startsWith('{') && text.endsWith('}')) ||
        (text.startsWith('[') && text.endsWith(']'));
    if (!isObjectOrArray)
        return false;

    try {
        JSON.parse(text);
        return true;
    } catch {
        return false;
    }
}

function looksLikeYaml(text: string): boolean {
    if (text.startsWith('---'))
        return true;

    const lines = text.split('\n').filter(line => line.trim().length > 0);
    if (lines.length < 2)
        return false;

    const yamlLike = lines.filter(line => YAML_LINE_RE.test(line));
    return yamlLike.length / lines.length > 0.6;
}

function looksLikeCode(text: string): boolean {
    return text.includes('\n') && CODE_HINT_RE.test(text);
}
