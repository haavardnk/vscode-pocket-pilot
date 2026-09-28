import type { TodoItem } from '@pocket-pilot/protocol';

import { asArray, asRecord, asString, type JsonRecord } from '../json';

const STATUSES: Record<string, TodoItem['status']> = {
  'not-started': 'notStarted',
  'in-progress': 'inProgress',
  completed: 'completed'
};

function todoList(part: JsonRecord): unknown[] | null {
  const data = asRecord(part.toolSpecificData);
  return part.kind === 'toolInvocationSerialized' && data.kind === 'todoList'
    ? asArray(data.todoList)
    : null;
}

export function sessionTodos(requests: readonly JsonRecord[]): TodoItem[] | null {
  const latest = requests
    .flatMap((request) => asArray(request.response).map(asRecord))
    .map(todoList)
    .findLast((list) => list !== null);
  if (!latest) return null;
  const todos = latest.flatMap((raw) => {
    const item = asRecord(raw);
    const title = asString(item.title);
    const status = STATUSES[asString(item.status) ?? ''];
    return title && status ? [{ title, status }] : [];
  });
  return todos.length > 0 ? todos : null;
}
