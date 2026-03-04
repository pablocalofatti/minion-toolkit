# Sample Tasks for Minion Testing

Use this file to test the `/minion-toolkit:minion` command:
```
/minion-toolkit:minion examples/sample-tasks.md
```

### Task 1: Add a hello utility function
Create a simple `hello(name: string): string` function in `src/utils/hello.ts` that returns `"Hello, {name}!"`. Add a test file `src/utils/__tests__/hello.test.ts` with 3 tests covering: normal input, empty string, and special characters.

Files: src/utils/hello.ts, src/utils/__tests__/hello.test.ts

### Task 2: Add a math utility module
Create `src/utils/math.ts` with `add(a: number, b: number): number`, `subtract(a: number, b: number): number`, and `multiply(a: number, b: number): number` functions. Add tests in `src/utils/__tests__/math.test.ts` covering positive numbers, negative numbers, and zero.

Files: src/utils/math.ts, src/utils/__tests__/math.test.ts

### Task 3: Add a string utility module [SKIP]
This task is skipped — used to verify the parser correctly filters [SKIP] tasks.
