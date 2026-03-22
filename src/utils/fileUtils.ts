/**
 * File utility helpers: binary detection, language mapping, formatting.
 */

import * as path from 'path';

// ─── Binary File Extensions ───────────────────────────────────────

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.zip', '.gz', '.tar', '.rar', '.7z', '.bz2', '.xz',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.mp3', '.mp4', '.wav', '.ogg', '.flac', '.avi', '.mkv', '.mov', '.webm',
  '.sqlite', '.db', '.sqlite3',
  '.wasm', '.pyc', '.pyo', '.class',
  '.vsix', '.deb', '.rpm', '.dmg', '.iso',
]);

// ─── Language Map ─────────────────────────────────────────────────

interface LanguageInfo {
  name: string;
  color: string;
}

const LANGUAGE_MAP: Record<string, LanguageInfo> = {
  '.ts':     { name: 'TypeScript',  color: '#3178c6' },
  '.tsx':    { name: 'TSX',         color: '#3178c6' },
  '.js':     { name: 'JavaScript',  color: '#f7df1e' },
  '.jsx':    { name: 'JSX',         color: '#f7df1e' },
  '.py':     { name: 'Python',      color: '#3776ab' },
  '.rs':     { name: 'Rust',        color: '#dea584' },
  '.go':     { name: 'Go',          color: '#00add8' },
  '.java':   { name: 'Java',        color: '#ed8b00' },
  '.kt':     { name: 'Kotlin',      color: '#7f52ff' },
  '.swift':  { name: 'Swift',       color: '#f05138' },
  '.c':      { name: 'C',           color: '#a8b9cc' },
  '.cpp':    { name: 'C++',         color: '#00599c' },
  '.h':      { name: 'C Header',    color: '#a8b9cc' },
  '.hpp':    { name: 'C++ Header',  color: '#00599c' },
  '.cs':     { name: 'C#',          color: '#239120' },
  '.rb':     { name: 'Ruby',        color: '#cc342d' },
  '.php':    { name: 'PHP',         color: '#777bb4' },
  '.html':   { name: 'HTML',        color: '#e34c26' },
  '.htm':    { name: 'HTML',        color: '#e34c26' },
  '.css':    { name: 'CSS',         color: '#1572b6' },
  '.scss':   { name: 'SCSS',        color: '#c6538c' },
  '.sass':   { name: 'Sass',        color: '#c6538c' },
  '.less':   { name: 'Less',        color: '#1d365d' },
  '.json':   { name: 'JSON',        color: '#a6a6a6' },
  '.yaml':   { name: 'YAML',        color: '#cb171e' },
  '.yml':    { name: 'YAML',        color: '#cb171e' },
  '.xml':    { name: 'XML',         color: '#f16529' },
  '.md':     { name: 'Markdown',    color: '#083fa1' },
  '.mdx':    { name: 'MDX',         color: '#fcb32c' },
  '.sql':    { name: 'SQL',         color: '#e38c00' },
  '.sh':     { name: 'Shell',       color: '#89e051' },
  '.bash':   { name: 'Bash',        color: '#89e051' },
  '.zsh':    { name: 'Zsh',         color: '#89e051' },
  '.ps1':    { name: 'PowerShell',  color: '#012456' },
  '.r':      { name: 'R',           color: '#276dc3' },
  '.lua':    { name: 'Lua',         color: '#000080' },
  '.dart':   { name: 'Dart',        color: '#0175c2' },
  '.vue':    { name: 'Vue',         color: '#4fc08d' },
  '.svelte': { name: 'Svelte',      color: '#ff3e00' },
  '.sol':    { name: 'Solidity',    color: '#363636' },
  '.toml':   { name: 'TOML',        color: '#9c4121' },
  '.ini':    { name: 'INI',         color: '#a6a6a6' },
  '.env':    { name: 'Env',         color: '#ecd53f' },
  '.dockerfile': { name: 'Dockerfile', color: '#2496ed' },
  '.graphql':    { name: 'GraphQL',    color: '#e10098' },
  '.proto':      { name: 'Protobuf',   color: '#a6a6a6' },
};

// ─── Public Functions ─────────────────────────────────────────────

/**
 * Check if a file is likely binary based on extension.
 */
export function isBinaryExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Check if a buffer contains binary content (null bytes in first 8KB).
 */
export function isBinaryContent(buffer: Buffer): boolean {
  const checkLength = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Get language info from file extension.
 */
export function getLanguageInfo(filePath: string): LanguageInfo {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();

  // Special filenames
  if (basename === 'dockerfile') {
    return { name: 'Dockerfile', color: '#2496ed' };
  }
  if (basename === 'makefile' || basename === 'gnumakefile') {
    return { name: 'Makefile', color: '#427819' };
  }
  if (basename === '.gitignore' || basename === '.dockerignore') {
    return { name: 'Ignore', color: '#a6a6a6' };
  }

  return LANGUAGE_MAP[ext] ?? { name: ext.slice(1).toUpperCase() || 'Unknown', color: '#a6a6a6' };
}

/**
 * Format a timestamp as HH:MM:SS.
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour12: false });
}

/**
 * Format milliseconds as human-readable duration.
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / 60000) % 60;
  const hours = Math.floor(ms / 3600000);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Generate a unique ID for change events.
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Get the max file size in bytes from config value in MB.
 */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
