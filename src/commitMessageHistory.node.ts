import { execFile } from 'node:child_process';
import {
  COMMIT_LOG_ENTRY_SEPARATOR,
  DEFAULT_LLM_MAX_PROMPT_LENGTH,
  RECENT_COMMIT_STYLE_MAX_ENTRY_LENGTH,
} from './constants';
import type { RecentCommitMessagesProvider } from './commitMessageGenerator';

type GitRepository = Parameters<RecentCommitMessagesProvider>[0];

function trimCommitStyleSample(message: string, maxLength = RECENT_COMMIT_STYLE_MAX_ENTRY_LENGTH): string {
  const normalized = message.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

export const getRecentCommitMessages: RecentCommitMessagesProvider = async (
  repo: GitRepository,
  count: number,
  maxPromptLength = DEFAULT_LLM_MAX_PROMPT_LENGTH,
): Promise<string[]> => {
  const rootPath = repo.rootUri?.fsPath?.trim();
  if (!rootPath) {
    return [];
  }

  const safeCount = Math.max(1, Math.floor(count));
  const safeMaxPromptLength = Math.max(500, Math.floor(maxPromptLength));
  const perEntryMaxLength = Math.max(
    80,
    Math.min(RECENT_COMMIT_STYLE_MAX_ENTRY_LENGTH, Math.floor(safeMaxPromptLength / safeCount)),
  );
  const stdout = await new Promise<string>((resolve) => {
    execFile(
      'git',
      ['-C', rootPath, 'log', '--no-merges', `-${safeCount}`, `--pretty=format:%B${COMMIT_LOG_ENTRY_SEPARATOR}`],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 },
      (error, output) => resolve(error ? '' : output),
    );
  });

  return stdout
    .split(COMMIT_LOG_ENTRY_SEPARATOR)
    .map((message) => trimCommitStyleSample(message, perEntryMaxLength))
    .filter((message) => message.length > 0)
    .slice(0, safeCount);
};