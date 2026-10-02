# Workflow Automation Engine

A scalable and extensible workflow automation backend built in Node.js and TypeScript, applying SOLID principles and common design patterns.

## Architecture & Design Decisions

### 1. Strategy Pattern (Polymorphism & Interfaces)
**Why we used it:** The workflow engine orchestrates a variety of steps (`send_email`, `call_webhook`, `wait`, `condition`, etc.), and new types of steps will inevitably be required as the product grows.
- By defining a common `Action` interface, we achieve **Polymorphism**. The core `WorkflowEngine` simply calls `await action.execute(enrollment, params)`, remaining completely agnostic to the underlying action's business logic. 
- The `ActionFactory` acts as a dynamic registry leveraging the **Strategy Pattern**. Instead of hardcoding massive `switch` or `if/else` statements that violate the Open-Closed Principle (OCP), new actions are registered dynamically (e.g., `ActionFactory.registerAction('sms', new SendSmsAction())`). 
- **Inheritance/Implementation**: Each specific action class strictly implements the `Action` interface. This enforces a contract ensuring every step safely returns an `ExecutionResult` that dictates the engine state transitions (`PROCEED`, `WAIT`, or `ERROR`).

### 2. Repository Pattern
**Why we used it:** Database technology and ORMs often evolve. We must not tightly couple our core orchestration logic to a specific SQL dialect or ORM library.
- We abstracted all data access behind domain-specific interfaces (`IEnrollmentRepository` and `IExecutionHistoryRepository`). 
- The `WorkflowEngine` operates entirely against these interfaces (Dependency Inversion Principle). If we need to move from SQLite to a distributed PostgreSQL cluster, or migrate from TypeORM to Prisma, the engine code remains completely untouched. We simply inject a new Repository implementation.

### 3. Stateless Execution
Instead of keeping in-memory timers (which cause memory leaks and die on server restarts), the engine handles `wait` states statelessly by persisting `waitUntil` and `status=waiting` in the database. A centralized worker polls and re-queues them. This guarantees the system can horizontally scale across multiple pods without losing state.

## Running the Application

### Using Docker (Recommended)

Run the application entirely inside Docker using Docker Compose:

```bash
docker-compose up --build
```

The application runs on port `3000`.

### Local Setup

1. Install dependencies: `npm install`
2. Start in dev mode: `npm run dev`
3. Or build and start: `npm run build && npm start`

## Testing

Run tests using Jest:

```bash
npm run test
```

## API Endpoints

### 1. Ingest Event
Triggers an event for a contact, enrolling them in matching workflows.

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventName": "form_submitted",
    "contact": { "id": "c123", "email": "test@example.com", "tags": [] }
  }'
```

### 2. View History
Check a contact's run history.

```bash
curl http://localhost:3000/api/contacts/c123/history
```

## Assumptions, Cuts, & Next Steps

### Assumptions Made
- Workflows are defined in YAML configuration files loaded at startup.
- **Job Scheduling & Wait Precision**: To reduce scope and keep the architecture simple without introducing complex external job schedulers (like Temporal or BullMQ delayed jobs), we opted for **database polling**. A simple `setInterval` runs every 1 minute to sweep the database for expired wait statuses. This means wait task execution is **approximate** (within a 1-minute window). 
  - *Concurrency Cut*: If we were running multiple polling instances, this naive approach would cause a race condition where multiple workers pick up the same expired wait task. To fix this with database polling, we would use PostgreSQL's `FOR UPDATE SKIP LOCKED` query to exclusively lock rows during pickup. However, in a true production environment, we wouldn't use polling at all—we would delegate waits entirely to a dedicated distributed Job Scheduler.
- **Simplicity Over Frameworks**: We actively avoided implementing a heavy framework like NestJS for this iteration to prioritize raw logical simplicity and demonstrate a firm grasp of core design patterns (like SOLID, Strategy, Dependency Injection) using bare Node.js/Express.
- **At-Least-Once Execution**: If the engine restarts abruptly during an active step (e.g., *after* a webhook is called but *before* the database updates the enrollment status), the engine will resume that step from the beginning upon restart. This provides "at-least-once" execution semantics, meaning external actions like API calls may execute twice in the event of a sudden crash. Idempotency is not handled by the engine and must be managed by the dependent external workers (e.g., an email service should verify it hasn't already processed an action for a given `enrollmentId` + `stepId`).
- **Duplicate Enrollments**: A single customer triggering an event multiple times (e.g., submitting a form twice) will generate multiple concurrent enrollments. The engine's job is purely to execute events as they arrive; deduplication or re-entry constraints are out of scope.
- **Error Handling & Dashboard Retries**: 
  - Retriable errors (like a 500 status from a 3rd party Webhook or a network timeout) transition the enrollment into an `ERROR` state.
  - Non-retriable errors (like a 400 Bad Request indicating a mismatched payload) transition into a terminal `FAILED` state.
  - **Assumption**: Currently, there is no automatic exponential backoff retry. In production, 3rd party webhooks would be retried automatically for X days. If it still fails, it remains in the `ERROR` state so a human can manually trigger a retry from a UI Dashboard. For internal tooling/jobs, failures would be pushed to a DLQ (Dead Letter Queue) after multiple automatic retries so they can be processed once the internal service payload is fixed.
- **Workflow Versioning Out of Scope**: It is currently assumed that workflows are static and cannot be edited in place once created. If a user wishes to "edit" a workflow, they must recreate it by copying the existing one and making a new version. This prevents in-flight enrollments from crashing due to missing steps or invalid state transitions.

### What Was Cut
- **Fully Distributed Job Queue**: I didn't use distributed Queue for message processing to minimize external dependencies and complexity for a take-home, opting to use SQLite as a simple job queue instead.
- **Robust Error Handling on Webhooks**: The `call_webhook` action has a basic 5-second timeout, but it doesn't implement exponential backoff retry.
- **Comprehensive DB Migrations**: I used simple `CREATE TABLE IF NOT EXISTS`. In production, I'd use Orm for migration
- **Authentication & Security**: Service-to-service authentication (e.g., mTLS, JWT verification) and API Authorization logic are out of scope for this MVP but are required for production.

### What I'd Do With More Time (Production & High Scale)
- **High-Scale Architecture**: Move from a monolithic single-node engine to horizontally scalable worker nodes. I would introduce an event bus (e.g., Apache Kafka) to ingest events securely at massive scale without dropping them.
- **Handling 20k+ RPS**: At 20,000 requests per second, a standard relational database (like a single Postgres instance) will become a severe bottleneck due to write locks. To handle this scale:
  - **Ingestion**: Use an event streaming platform (e.g., Apache Kafka) to buffer incoming events. Kafka easily absorbs 20k RPS and allows worker nodes to consume events at their own pace.
  - **State Storage & ORM Connection Pooling**: We are currently using **TypeORM**. In production, migrating from SQLite to PostgreSQL is as simple as switching the driver configuration. We would explicitly configure TypeORM's connection pool (`poolSize: 50`) to handle high concurrent writes securely. For the current SQLite setup, we've enabled `PRAGMA journal_mode = WAL;` to mimic concurrent reads/writes. To support 20k RPS without locking, we would need to shard this across distributed PostgreSQL databases (like Citus) or move to a high-throughput NoSQL database like DynamoDB or Cassandra.
  - **Wait States**: Replace interval-based polling with a robust distributed timing wheel or a distributed queuing system (like Temporal, or Redis running on a cluster).
- **Idempotencys**: To handle the "at-least-once" restarts gracefully, I'd implement Idempotency Keys on all external `call_webhook` requests, passing a unique `ExecutionID + StepID` so that external systems can safely deduplicate retries.
- **Retry Mechanism**: Add a `retryCount` to the enrollment table and build a robust retry strategy with exponential backoff and jitter for HTTP failures.
- **Production Data Model**: Move away from static YAML loading to a normalized, relational database schema:
  - **Triggers**: A `trigger` table to define reusable trigger conditions.
  - **Workflow Triggers (`workflow_trigger`)**: A junction table linking multiple triggers to a single workflow, storing the `workflowId` and the specific `initialStepId` for each trigger entry point.
  - **Workflow Actions (`workflow_action`)**: A table to store individual action nodes (steps) securely in the database instead of a local JSON blob.
  - **Distributed Scheduler**: Instead of the basic interval poller, `wait` actions would push a scheduled task to a distributed scheduler (like Temporal, AWS EventBridge Scheduler, or BullMQ) to resume the execution context reliably at the exact future timestamp.
- **Asynchronous Worker Offloading (Emails/Webhooks)**: 
  - **Assumption**: Currently, there is no rate limiting on sending emails, and blocking I/O happens sequentially in the engine.
  - **Production Solution**: To prevent pending workflows from being bottlenecked by slow I/O or failing APIs, actions like `send_email`, `sms`, and `call_webhook` will be entirely delegated to separate background worker queues.
  - The workflow engine will generate a `refId`, place the job on a message broker (e.g., Kafka), and put the workflow into a `WAITING_FOR_RESPONSE` state (keeping time-based `WAITING` separate). 
  - The specialized worker is responsible for executing the task, managing provider-specific rate limits, and handling its own retry logic. 
  - Upon success, the worker publishes an acknowledgment event back to the workflow system. The engine listens for this event, matches the `refId`, and resumes the workflow to execute the `nextActionId`.
- **Persistent Execution Queue**: 
  - **Current Implementation**: We implemented an abstracted queue system using **Redis (BullMQ)** for durable, persistent queueing (with an in-memory fallback for local tests).
  - **Production Solution**: At massive scale, we would transition from Redis to **Kafka** as the primary event stream and persistent execution queue. Kafka guarantees distributed durability, infinite replayability, and strict ordering without being bound by memory limits, completely eliminating the need for SQL sweeps during recovery.
- **Multi-Tenancy & Noisy Neighbors**: 
  - **Assumption**: The current design assumes a single-tenant environment.
  - **Production Solution**: In a multi-tenant SaaS, high-volume users can cause a "noisy neighbor" effect, starving smaller users of compute resources. To resolve this, a **hybrid tenancy architecture** should be employed:
    - Small-to-medium businesses share resources on a pooled multi-tenant cluster to maintain cost efficiency. Limit number of workflow creation. Limit number of workflow enrollment base on plan
    - Large enterprise clients with massive workflow volume are provisioned on dedicated, isolated instances (or strictly partitioned Kafka topics/worker nodes).
    - An intelligent API Gateway/Routing layer will inspect the incoming `tenantId` and dynamically route the execution request to the appropriate cluster based on predefined capacity and tiering rules.


## AI Usage
AI tools were used to quickly scaffold the boilerplate structure (package.json, Dockerfile) and generate the mock SQLite table schemas. The core architectural decisions and step transitions were explicitly defined and designed by me to guarantee correct behavior on failures.
