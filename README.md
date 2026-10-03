# Workflow Automation Engine

A scalable and extensible workflow automation backend built with **Node.js and TypeScript**.

The engine supports event-driven workflow execution with actions such as sending emails, adding tags, calling webhooks, waiting for a specified duration, and conditional branching.

The design prioritizes:

- Extensibility
- Failure recovery
- Persistent workflow state
- Clear separation of concerns
- Testability
- Simple deployment and operation

---

## Architecture & Design Decisions

### 1. Strategy Pattern — Extensible Actions

Workflow steps can represent different types of actions such as:

- `send_email`
- `add_tag`
- `call_webhook`
- `wait`
- `condition`

Each action implements a common `Action` interface.

```text
WorkflowEngine
      |
      v
 ActionFactory
      |
      +---- SendEmailAction
      +---- AddTagAction
      +---- WebhookAction
      +---- WaitAction
      +---- ConditionAction
```

The engine only understands the action contract:

```typescript
await action.execute(enrollment, params)
```

It does not need to know the implementation details of individual actions.

The `ActionFactory` acts as a registry, allowing new action types to be added without modifying the core workflow engine.

For example:

```typescript
ActionFactory.registerAction(
  'sms',
  new SendSmsAction()
);
```

This follows the **Open-Closed Principle**: the engine can be extended with new actions without changing the orchestration logic.

Each action returns an `ExecutionResult`, which tells the engine how execution should proceed:

- `PROCEED`
- `WAIT`
- `ERROR`

---

### 2. Repository Pattern

The workflow engine should not depend directly on a particular database or ORM.

Database access is abstracted behind domain-specific repository interfaces such as:

- `IEnrollmentRepository`
- `IExecutionHistoryRepository`

The workflow engine depends on these interfaces rather than the underlying persistence implementation.

This follows the **Dependency Inversion Principle** and makes it possible to replace the persistence layer without changing the orchestration logic.

For example, the current implementation can use SQLite while a production deployment could use PostgreSQL.

---

### 3. Persistent Workflow State

Workflow execution state is persisted rather than kept entirely in memory.

This is particularly important for `wait` actions.

Instead of keeping an in-memory timer such as:

```typescript
setTimeout(...)
```

the engine persists:

```text
status = WAITING
waitUntil = <future timestamp>
```

A worker periodically checks for expired waits and resumes those workflows.

This means a process restart does not cause a waiting workflow to lose its state.

Wait execution is intentionally approximate and may resume within the polling interval.

---

### 4. Failure Semantics

The current implementation provides **at-least-once execution semantics**.

If the process crashes after an external action has completed but before the database state is updated, the action may be executed again after recovery.

For example:

```text
Workflow
   |
   v
call_webhook
   |
   +---- Webhook succeeds
   |
   +---- Process crashes before DB update
   |
   v
Recovery
   |
   v
Webhook may execute again
```

Therefore, the engine does not provide exactly-once execution for external side effects.

External integrations should use an idempotency key such as:

```text
enrollmentId + stepId
```

to safely handle duplicate execution.

This trade-off is intentional for the scope of the take-home assignment.

---

## Running the Application

### Using Docker — Recommended

Run the application using Docker Compose:

```bash
docker-compose up --build
```

The application will be available on:

```text
http://localhost:3000
```

### Local Setup — SQLite

Install dependencies:

```bash
npm install
```

Run in development mode:

```bash
npm run dev
```

Or build and start:

```bash
npm run build
npm start
```

The local setup uses **SQLite** as the database with WAL mode enabled for concurrent reads and writes. No external services are required for local development.

---

### Docker — PostgreSQL

The Docker Compose setup uses **PostgreSQL** as the database. The connection is configured automatically through environment variables.

```bash
docker-compose up --build
```

The `DB_TYPE` environment variable controls which database is used:

```text
DB_TYPE=postgres  → PostgreSQL (Docker / production)
DB_TYPE=sqlite    → SQLite (default, local dev)
```


---

## Testing

The tests use **in-memory SQLite** so they require no external database or setup.

```bash
npm run test
```

The tests focus on the core workflow execution and state-transition logic.


---

## API

### 1. Ingest Event

Triggers an event for a contact and enrolls the contact in workflows whose trigger matches the event.

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventName": "form_submitted",
    "contact": {
      "id": "c123",
      "email": "test@example.com",
      "tags": []
    }
  }'
```

### 2. View Contact History

Retrieve the execution history for a contact:

```bash
curl http://localhost:3000/api/contacts/c123/history
```

The history records which workflow steps were executed, when they executed, and their outcome.

---

# Assumptions, Trade-offs & Scope

## Assumptions

### Workflow Configuration

Workflows are defined in YAML configuration files and loaded when the application starts.

Workflow versioning is intentionally outside the scope of this assignment.

A workflow should be treated as immutable once enrollments have started. To modify an existing workflow, a new version can be created.

This prevents an in-flight enrollment from referencing a step that no longer exists.

---

### Email Reply Detection

The `send_email` action is a stub that logs the email rather than sending a real one.

The sample workflow branches on whether a contact has the tag `replied`:

```text
Condition: does the contact have the tag "replied"?
   |
   +---- Yes → Add tag "engaged", call webhook to notify sales team
   |
   +---- No  → Wait 3 days, send follow-up email
```

In a real system, this tag would be applied by a separate integration, such as an email provider webhook that listens for reply events and tags the contact accordingly.

For the purposes of this assignment, it is assumed that when a contact replies to an email, an external system has already tagged that contact with `replied` before the next condition step is evaluated.

The engine itself does not implement email sending, reply detection, or any inbound email processing. These concerns are handled externally.

---


### Wait Scheduling

The current implementation uses database polling for wait states.

A worker periodically checks for workflows where:

```text
status = WAITING
waitUntil <= currentTime
```

and resumes them.

The polling interval is currently one minute, so wait execution is approximate rather than exact.

For multiple workers, database-level locking such as PostgreSQL's:

```sql
FOR UPDATE SKIP LOCKED
```

would be required to prevent multiple workers from picking up the same waiting workflow.

At production scale, I would replace polling with a dedicated distributed scheduler.

---

### At-Least-Once Execution

The engine intentionally provides at-least-once execution.

If the process crashes during an action, the action may be retried after recovery.

This is particularly relevant for external side effects such as:

- Webhook calls
- Emails
- SMS
- Other external APIs

Exactly-once execution cannot be guaranteed solely by the workflow engine when interacting with external systems.

Instead, external actions should support idempotency using a unique execution/step identifier.

---

### Duplicate Events

Multiple identical events for the same contact result in multiple workflow enrollments.

For example, if a contact submits the same form twice:

```text
form_submitted
      |
      +---- Enrollment 1
      |
      +---- Enrollment 2
```

Event deduplication and workflow re-entry policies are outside the scope of this implementation.

---

### Webhook Errors & Retries

Webhook failures are classified into two categories.

**Retriable errors**

Examples:

- HTTP 5xx
- Network timeout
- Connection failure

These transition the enrollment into an `ERROR` state.

**Non-retriable errors**

Examples:

- HTTP 400
- Invalid request payload

These transition the enrollment into a terminal `FAILED` state.

The current implementation does not perform automatic exponential-backoff retries.

In production, I would add:

```text
retryCount
nextRetryAt
backoff
jitter
```

and automatically retry transient failures.

After the retry limit is exhausted, the workflow could remain in `ERROR` for manual retry or be moved to a dead-letter queue depending on the type of workload.

---

# What Was Intentionally Cut

The assignment is scoped to approximately 5–6 hours, so several production concerns were intentionally not implemented.

### Distributed Job Queue

The current implementation keeps the execution model simple and uses the database for persistent state.

A production system would use a dedicated distributed queue such as Kafka, RabbitMQ, or a managed queue service.

### Advanced Webhook Retry

The webhook action currently has a timeout but does not implement exponential backoff and jitter.

### Database Migrations

The current implementation uses:

```sql
CREATE TABLE IF NOT EXISTS
```

For production, I would use a proper migration framework and versioned database migrations.

### Authentication & Authorization

Authentication, authorization, tenant isolation, mTLS/JWT validation, and other service-to-service security concerns are outside the scope of this take-home.

---

# Production Evolution

With significantly higher traffic and stronger reliability requirements, I would evolve the architecture in the following areas.

## 1. Horizontally Scalable Workers

Separate workflow ingestion from workflow execution:

```text
                +----------------+
                |   API Gateway  |
                +-------+--------+
                        |
                        v
                +---------------+
                | Event Stream  |
                |    Kafka      |
                +-------+-------+
                        |
              +---------+---------+
              |         |         |
              v         v         v
           Worker     Worker     Worker
              |         |         |
              +---------+---------+
                        |
                        v
                    Database
```

This allows ingestion and execution capacity to scale independently.

---

## 2. High-Throughput Ingestion

At substantially higher traffic levels, I would decouple event ingestion from workflow execution using Kafka or another durable event streaming platform.

The API would publish events to the stream, allowing workers to consume and process them asynchronously.

This also provides buffering during traffic spikes.

---

## 3. Distributed State Storage

The current implementation uses SQLite locally and PostgreSQL in the Docker environment. Both are suitable for the scope of this assignment.

For production at scale, I would move to a fully distributed persistence layer. Options include:

- **CockroachDB or Citus (distributed Postgres)** — for teams that want to keep the SQL model with horizontal write sharding
- **DynamoDB or Cassandra** — for very high write throughput with a NoSQL model, at the cost of richer query capability

Connection pooling would be configured explicitly.

---

## 4. Distributed Wait Scheduler

Instead of polling the database every minute, wait states could be scheduled through a distributed scheduler such as:

- Temporal
- AWS EventBridge Scheduler
- BullMQ/Redis
- Another managed delayed-job system

The scheduler would resume a workflow at its required timestamp.

---

## 5. Idempotency

To handle at-least-once execution safely, external actions should receive an idempotency key:

```text
executionId + stepId
```

For example:

```http
Idempotency-Key: execution-123-step-4
```

The external service can then safely ignore duplicate requests for the same logical execution.

---

## 6. Retry Strategy

Transient failures should be retried using exponential backoff and jitter.

For example:

```text
Attempt 1 → immediate
Attempt 2 → 1s
Attempt 3 → 5s
Attempt 4 → 30s
...
```

The retry policy would depend on the action type and error category.

---

## 7. Production Data Model

The current workflow configuration is loaded from YAML for simplicity.

A production system would persist workflow definitions in a database.

A possible model would contain:

```text
Workflow
   |
   +---- WorkflowTrigger
   |
   +---- WorkflowStep
              |
              +---- Action configuration
              +---- Next step
```

This would support:

- Workflow versioning
- Dynamic workflow creation
- Multiple trigger types
- Workflow editing
- Auditing
- Per-tenant configuration

---

## 8. Asynchronous Action Workers

Slow external actions such as emails, SMS, and webhooks should not block the workflow engine.

Instead:

```text
Workflow Engine
      |
      v
Create execution reference
      |
      v
Message Queue
      |
      +---- Email Worker
      |
      +---- SMS Worker
      |
      +---- Webhook Worker
```

The workflow engine would transition into a state such as:

```text
WAITING_FOR_ACTION
```

The specialized worker would execute the action and publish a completion event containing the execution reference.

The workflow engine could then resume from the next step.

This separates workflow orchestration from provider-specific concerns such as rate limiting, retries, and external API failures.

---

## 9. Single-Step Execution

The current implementation can execute consecutive steps within a single worker invocation.

For example:

```text
A → B → C
```

If the process crashes while executing `C`, previously executed steps may need to be replayed depending on when state was persisted.

For a production implementation, I would make each step an independently persisted execution unit:

```text
Execute A
   |
   v
Persist nextStep = B
   |
   v
Queue B
   |
   v
Execute B
   |
   v
Persist nextStep = C
   |
   v
Queue C
```

This makes each workflow step independently retryable and significantly simplifies failure recovery.

---

## 10. Database / Queue Consistency

One important failure window exists when both the database and a queue are involved.

The current approach persists workflow state **before** enqueueing execution:

```text
Database write
      |
      v
Queue publish
```

This avoids a race condition where a fast worker completes a job before the initial database state is persisted. If the queue publish fails, the database-level sweeper (`recoverRunning`) detects the stuck `RUNNING` enrollment and requeues it within 5 minutes.

However, it introduces a possible dual-write failure window:

```text
DB write succeeds
      |
      X
Queue publish fails → sweeper catches it within 5 minutes
```

For production at scale, there are two stronger approaches, ordered by preference:

---

### Preferred: Kafka-First Event Sourcing

At high throughput, the API does not write to the database at all on the ingestion path.

```text
API
 |
 v
Kafka (durable event log)
 |
 v
Worker consumes event
 |
 v
Execute step → update Database
```

The Kafka offset is only committed **after** the database update succeeds. If the worker crashes between consuming and committing, Kafka automatically redelivers the message to another worker.

This eliminates the dual-write problem entirely on the hot path. There is no need for a sweeper on the ingestion side because Kafka itself is the source of truth for pending work.

Workers must be **idempotent** since Kafka provides at-least-once delivery.

---

### Alternative: Transactional Outbox Pattern

If a relational database is already the primary system and Kafka-first would be a significant architectural shift, the Transactional Outbox Pattern provides a strong consistency guarantee:

```text
Single SQL Transaction
      |
      +---- Workflow State (enrollments table)
      |
      +---- Outbox Event (outbox table)
            |
            v
      Outbox Publisher (CDC or polling)
            |
            v
         Kafka
```

This guarantees that the workflow state and the queued message are always in sync, because they are written atomically.

However, this pattern has **throughput limitations at scale**. Every event requires a synchronous SQL write to two tables inside a transaction, which limits how much you can push through a single database. At very high RPS, the database becomes a bottleneck that the Kafka-first approach avoids entirely.

---

### Best of Both: DynamoDB Transactions + CDC Streams

This approach solves the throughput limitation of the SQL Transactional Outbox while still retaining full atomicity — no sweeper required.

DynamoDB's `TransactWriteItems` atomically writes both the workflow state and the outbox event in a single operation, just like a SQL transaction but at DynamoDB's scale:

```text
DynamoDB TransactWriteItems (atomic)
      |
      +---- enrollments table  (workflow state)
      |
      +---- outbox table       (pending event record)
            |
            v
      DynamoDB Streams (CDC — no polling, event-driven)
            |
            v
         Kafka
            |
            v
         Worker consumes and executes step
```

The key advantages over the SQL Transactional Outbox:

- **Atomic write** — workflow state and outbox event are always in sync, even across failures
- **DynamoDB scales horizontally** — no single-node database bottleneck at high RPS
- **DynamoDB Streams is CDC** — changes are delivered in real time without polling the outbox table
- **Kafka decouples workers** — workers consume at their own pace, independently of the write path

Workers must still be idempotent since Kafka provides at-least-once delivery.

---



## 11. Multi-Tenancy & Noisy Neighbors

The current implementation assumes a single-tenant environment.

For a multi-tenant SaaS platform, high-volume tenants should not be able to starve other tenants.

A possible architecture would be:

- Small and medium tenants share a worker pool with per-tenant quotas.
- Large enterprise tenants can receive dedicated capacity.
- Queue partitions or worker pools can be isolated by tenant tier.
- The API gateway can route requests based on tenant configuration and capacity.

---

# AI Usage

AI tools were used to accelerate development of boilerplate and supporting code, including:

- Initial project scaffolding
- `package.json`
- Docker configuration
- Mock SQLite schemas

The workflow execution model, failure semantics, persistence approach, and architectural decisions were designed and reviewed by me.

I understand the implementation and the trade-offs described above.