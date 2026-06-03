# Query Router

Query Router is a small Node.js Express service that accepts SQL over REST, classifies each statement, and sends it to the correct PostgreSQL pool.

## Routing Workflow

1. A client sends SQL to `POST /query`.
2. The service normalizes the statement by trimming whitespace and skipping leading comments.
3. The classifier inspects the first executable keyword.
4. `SELECT` queries are marked as read-only and routed to a replica pool.
5. `INSERT`, `UPDATE`, and `DELETE` queries are marked as write operations and routed to the primary pool.
6. The controller runs the query through the selected `pg.Pool` and returns the database response as JSON.
7. If a replica is unavailable, the router tries the next replica before failing the request.

## Folder Structure

- `src/app.js`: builds the Express application and registers middleware.
- `src/server.js`: starts the HTTP server.
- `src/config/`: environment loading and PostgreSQL pool creation.
- `src/routing/`: SQL classification and pool selection.
- `src/controllers/`: request handling and query execution.
- `src/routes/`: REST endpoint definitions.
- `src/middleware/`: error handling.

## API

- `POST /query`: accepts `{ "sql": "SELECT ..." }` or plain text SQL.
- `GET /health`: returns service status.

## Deployment

The service is intended to run inside the same Docker Compose network as the PostgreSQL cluster so it can resolve `postgres-primary`, `postgres-replica-1`, and `postgres-replica-2` by name.