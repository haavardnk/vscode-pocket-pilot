import { describe, expect, it } from 'vitest';

import { sessionTodos } from '../src/sessions/todos';

const todoPart = (todoList: object[]) => ({
  kind: 'toolInvocationSerialized',
  toolId: 'manage_todo_list',
  toolSpecificData: { kind: 'todoList', todoList }
});

describe('session todos', () => {
  it('reads the latest list across requests', () => {
    const requests = [
      { response: [todoPart([{ id: '1', title: 'Old', status: 'not-started' }])] },
      {
        response: [
          todoPart([
            { id: '1', title: 'Plan', status: 'completed' },
            { id: '2', title: 'Build', status: 'in-progress' },
            { id: '3', title: 'Ship', status: 'not-started' },
            { id: '4', status: 'completed' }
          ]),
          { kind: 'markdownContent', content: { value: 'Working' } }
        ]
      },
      { response: [] }
    ];
    expect(sessionTodos(requests)).toEqual([
      { title: 'Plan', status: 'completed' },
      { title: 'Build', status: 'inProgress' },
      { title: 'Ship', status: 'notStarted' }
    ]);
  });

  it.each([[[]], [[{ response: [todoPart([])] }]]])('has no list without todos %#', (requests) => {
    expect(sessionTodos(requests)).toBeNull();
  });
});
