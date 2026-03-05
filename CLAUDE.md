# Engineering Standards

Expert full-stack engineer. Primary stack: TypeScript, React, Next.js, NestJS, AWS.

## Code Rules (Non-Negotiable)

### TypeScript
- **No `any`** — use `unknown`, generics, or proper types. Zero tolerance
- **No magic numbers/strings** — extract to named constants (`const MAX_RETRIES = 3`)
- **No non-null assertions (`!`)** — handle nullability explicitly
- **Exhaustive switch** — always handle `default` or use `satisfies never` guard
- **Prefer `const` > `let`** — never use `var`
- **Async/await over `.then()`** — except in rare pipeline cases

### React / Next.js
- **No inline styles** — use MUI `sx` prop or styled components
- **No prop drilling > 2 levels** — use context, Zustand, or composition
- **No `useEffect` for derived state** — use `useMemo` or compute inline
- **Event handlers** — prefix with `handle*` (`handleSubmit`, `handleClick`)
- **Custom hooks** — prefix with `use*`, extract when logic is reused
- **One component per file** — small helpers in same file are OK

### NestJS / Backend
- **DTOs for all endpoints** — never pass raw request bodies
- **Repository pattern** — never query DB from controllers
- **No business logic in controllers** — controllers delegate to services
- **Consistent error format** — use proper HTTP status codes

### General
- **Functions under 40 lines** — extract helpers if longer
- **Max 3 parameters** — use an options object for more
- **Early returns** — guard clauses first, happy path last
- **Meaningful names** — `getUserById` not `getData`, `isValid` not `check`
- **No commented-out code** — delete it, git remembers
- **No console.log in production code** — use proper logger
- **Handle errors explicitly** — no empty catch blocks, no swallowed promises

### Testing
- **Test behavior, not implementation** — don't test private methods
- **Descriptive names** — `"should return 404 when user not found"` not `"test error"`
- **Arrange-Act-Assert** — clear separation in every test
- **No test interdependence** — each test runs in isolation

### Git
- **Conventional commits** — `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`
- **Commit often** — one logical change per commit
- **Branch naming** — `feat/description`, `fix/description`, `chore/description`

## Architecture & Design (Martin Fowler School)

### Core Principles
- **Separation of Concerns** — each module/class/function has one reason to change
- **Single Responsibility Principle** — a class does one thing and does it well
- **Dependency Inversion** — depend on abstractions (interfaces), not concretions
- **Information Hiding** — expose behavior, hide implementation details
- **Tell, Don't Ask** — objects should perform work, not expose state for others to act on
- **Command-Query Separation** — methods either change state (command) or return data (query), never both

### Design Patterns (Use When Appropriate)
- **Strategy** — prefer composition over conditionals for variant behavior
- **Repository** — abstract data access behind a clean interface
- **Factory** — encapsulate complex object creation
- **Observer/EventEmitter** — decouple producers from consumers
- **Adapter** — wrap third-party libraries behind your own interface so they're replaceable
- **Builder** — use for objects with many optional parameters instead of telescoping constructors

### Anti-Patterns to Reject
- **God Objects** — classes that know/do too much. Split them
- **Primitive Obsession** — use Value Objects for domain concepts (e.g., `Email`, `Money`, not raw strings)
- **Feature Envy** — if a method uses more data from another class than its own, it belongs there
- **Shotgun Surgery** — if one change requires edits across many files, the abstraction is wrong
- **Leaky Abstractions** — implementation details must not leak through module boundaries
- **Anemic Domain Model** — domain objects with only getters/setters and no behavior. Put logic where the data lives
- **Temporal Coupling** — methods that must be called in a specific order. Make invalid states unrepresentable
- **Boolean Blindness** — prefer enums or union types over boolean flags that obscure intent
- **Deep Nesting** — more than 2 levels of nesting is a code smell. Extract, use early returns, or decompose
- **Train Wreck Calls** — `a.getB().getC().doThing()` violates Law of Demeter. Encapsulate the traversal

### Architectural Guidelines
- **Layered Architecture** — clear boundaries: presentation → application → domain → infrastructure
- **Ports and Adapters** — business logic at the center, I/O at the edges. Infrastructure is pluggable
- **Bounded Contexts** — group related concepts together; don't leak domain models across boundaries
- **CQRS where it fits** — separate read and write models when complexity warrants it
- **Event-Driven for decoupling** — use events between modules that don't need synchronous coordination
- **Fail Fast** — validate at the boundary, trust internals. Invalid states should not propagate
- **Immutability by default** — prefer `readonly`, `Readonly<T>`, and pure functions. Mutation is opt-in, not default
- **Explicit over implicit** — no hidden side effects, no magic. Code should be obvious at the call site

### Code Smells to Flag
- Functions with more than 3 levels of indentation
- Files longer than 300 lines
- Classes with more than 7 public methods
- Modules with circular dependencies
- Catch blocks that swallow errors silently
- String-typing instead of enums or union types
- Mutable shared state between modules
- Comments that explain "what" instead of "why" (the code should explain "what")
- Tests that test implementation details rather than behavior
- Configuration scattered across the codebase instead of centralized
