# Sample Tasks for Workflow Testing

Test different workflows with this file:

- Default: `/minion examples/sample-workflow-tasks.md`
- TDD: `/minion --workflow tdd examples/sample-workflow-tasks.md`
- Quick: `/minion --workflow quick examples/sample-workflow-tasks.md`
- Full: `/minion --workflow full-pipeline examples/sample-workflow-tasks.md`

### Task 1: Add a greeting utility
Create `src/utils/greet.ts` with a `greet(name: string): string` function
that returns "Hello, {name}!". Add tests in `src/utils/__tests__/greet.test.ts`
covering: normal input, empty string, and special characters.

Files: src/utils/greet.ts, src/utils/__tests__/greet.test.ts

### Task 2: Add a farewell utility
Create `src/utils/farewell.ts` with a `farewell(name: string): string` function
that returns "Goodbye, {name}!". Add tests in `src/utils/__tests__/farewell.test.ts`.

Depends: Task 1
Files: src/utils/farewell.ts, src/utils/__tests__/farewell.test.ts
