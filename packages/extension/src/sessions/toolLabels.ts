import type { ToolStatus } from '@pocket-pilot/protocol';

import { asArray, asNumber, asString, type JsonRecord } from '../json';
import { basename } from './partText';
import { inlineCode, terminalMessage } from './toolParts';

const COMMAND_LENGTH = 80;

type Label = (args: JsonRecord, done: boolean, status: ToolStatus) => string | null;

function fileName(value: unknown): string | null {
  const path = asString(value);
  return path ? basename(path) : null;
}

function workspaceGlob(pattern: string): string {
  return pattern.startsWith('**') || pattern.startsWith('/') ? pattern : `**/${pattern}`;
}

function shortened(text: string): string {
  return text.length > COMMAND_LENGTH ? `${text.slice(0, COMMAND_LENGTH - 3)}...` : text;
}

function verb(done: boolean, running: string, finished: string): string {
  return done ? finished : running;
}

function fileLabel(running: string, finished: string, key: string): Label {
  return (args, done) => {
    const file = fileName(args[key]);
    return file && `${verb(done, running, finished)} ${file}`;
  };
}

function fixedLabel(running: string, finished: string): Label {
  return (_args, done) => verb(done, running, finished);
}

const LABELS: Record<string, Label> = {
  read_file: (args, done) => {
    const file = fileName(args.filePath);
    if (!file) return null;
    const start = asNumber(args.startLine);
    const end = asNumber(args.endLine);
    const lines = start !== null && end !== null ? `, lines ${start} to ${end}` : '';
    return `${verb(done, 'Reading', 'Read')} ${file}${lines}`;
  },
  list_dir: fileLabel('Reading', 'Read', 'path'),
  create_file: fileLabel('Creating', 'Created', 'filePath'),
  grep_search: (args, done) => {
    const query = asString(args.query);
    if (!query) return null;
    const include = asString(args.includePattern);
    const kind = args.isRegexp === true ? 'regex' : 'text';
    const scope = include ? ` (${inlineCode(workspaceGlob(include))})` : '';
    return `${verb(done, 'Searching', 'Searched')} for ${kind} ${inlineCode(query)}${scope}`;
  },
  file_search: (args, done) => {
    const query = asString(args.query);
    return (
      query &&
      `${verb(done, 'Searching', 'Searched')} for files matching ${inlineCode(workspaceGlob(query))}`
    );
  },
  run_in_terminal: (args, _done, status) => {
    const command = asString(args.command)?.trim();
    return command ? terminalMessage(command, status, null) : null;
  },
  send_to_terminal: (args, done) => {
    const command = asString(args.command);
    return (
      command && `${verb(done, 'Sending', 'Sent')} ${inlineCode(shortened(command))} to terminal`
    );
  },
  get_terminal_output: fixedLabel('Checking terminal output', 'Checked terminal output'),
  kill_terminal: fixedLabel('Killing terminal', 'Killed terminal'),
  run_playwright_code: (_args, done, status) =>
    status === 'failed'
      ? 'Browser action failed'
      : verb(done, 'Running Playwright code...', 'Ran Playwright code'),
  screenshot_page: fixedLabel('Capturing browser screenshot', 'Captured browser screenshot'),
  open_browser_page: (args, done) => {
    const url = asString(args.url);
    if (done) return 'Opened Browser';
    return url && `Opening browser page at ${url}`;
  },
  fetch_webpage: (args, done) => {
    const urls = asArray(args.urls).flatMap((url) => asString(url) ?? []);
    return urls.length > 0 ? `${verb(done, 'Fetching', 'Fetched')} ${urls.join(', ')}` : null;
  },
  runSubagent: (args) => asString(args.description)
};

export function toolLabel(name: string, args: JsonRecord, status: ToolStatus): string {
  return LABELS[name]?.(args, status !== 'running', status) ?? name;
}
