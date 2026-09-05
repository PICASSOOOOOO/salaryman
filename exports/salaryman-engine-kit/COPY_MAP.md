# Copy map and integration seams

## Destination layout

The export uses a neutral layout:

```text
src/server/   API routes and server engines
src/client/   React/canvas/office engines
shared/       database and API contracts
godot/        Godot art review project
docs/         renderer and bridge contracts
```

The source files may still import `@workspace/db`,
`@workspace/integrations-openai-ai-server`, or SALARYMAN-local helpers. Replace
those with the destination project's equivalents.

## Required destination adapters

### Authentication

Keep auth at the route boundary. The copied engines should receive the
authenticated user ID from the destination app; do not make an engine trust a
client-provided owner or org ID.

### Database

The source uses Drizzle/PostgreSQL. Copy only the tables needed by the chosen
engine, then recreate its indexes, uniqueness rules, and transaction locks in
the destination schema.

### AI

`art-direction.ts`, prompt generation, and provider contracts are independent
of a particular model. Replace the OpenAI proxy import with the destination
project's model adapter and preserve strict JSON parsing and explicit failure.

### Art providers

Implement the `ArtProvider` interface in
`src/server/lib/art-providers/types.ts`. Register a provider only when its
configuration is real. Keep explicit Unreal jobs fail-closed.

### Object storage

Provider result URLs and approved asset URLs should go through the destination
project's storage policy. Do not copy URLs from the source database.

### Godot

The Godot project is a review/blocking tool. Set its asset host and bridge URL
to the destination project. Production publishing requires the destination
project's own bridge authentication.

### Unreal

Use `docs/unreal-render-node-contract.md` as the node-side HTTP contract. The
destination project owns the node URL and bearer secret through its secret
manager, never in this export.

## Safe extraction order

1. `shared/` contracts and selected database tables.
2. `src/server/lib/art-providers/`, art-family/style/QA modules.
3. provider-specific adapters and storage integration.
4. API routes and auth/ownership checks.
5. `src/client/` consumers and art review UI.
6. Godot/Unreal bridge wiring.

Run the destination project's typecheck after each layer. Do not copy the
whole server blindly if the destination has a different auth or wallet model.