import type { PermissionLevel } from '@pocket-pilot/protocol';

export interface PermissionOption {
  level: PermissionLevel;
  label: string;
  short: string;
  description: string;
  warning: string | null;
}

export const PERMISSIONS: Record<PermissionLevel, PermissionOption> = {
  default: {
    level: 'default',
    label: 'Default approvals',
    short: 'Default',
    description: 'Ask before running tools that need approval',
    warning: null
  },
  autoApprove: {
    level: 'autoApprove',
    label: 'Bypass approvals',
    short: 'Bypass',
    description: 'Run every tool without asking',
    warning:
      'The agent can run terminal commands, edit files and call tools without asking you first.'
  },
  autopilot: {
    level: 'autopilot',
    label: 'Autopilot',
    short: 'Autopilot',
    description: 'Run every tool and keep working without stopping for questions',
    warning:
      'The agent runs every tool without asking and answers its own questions until the task is done.'
  }
};
