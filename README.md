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

### Local Setup

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

---

## Testing

Run the test suite with:

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

## 3. Persistent Workflow State

The current SQLite implementation is intentionally simple for the assignment.

For production, I would move to PostgreSQL or another distributed persistence layer and configure connection pooling appropriately.

SQLite currently uses WAL mode to improve concurrent read/write behavior.

At very high scale, state storage could be partitioned or moved to a distributed datastore depending on the access patterns.

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

The current approach persists workflow state before enqueueing execution:

```text
Database write
      |
      v
Queue publish
```

This avoids a race where a worker completes a job before its initial database state has been persisted.

However, it introduces a possible dual-write failure:

```text
DB write succeeds
      |
      X
Queue publish fails
```

The current implementation mitigates this using a recovery/sweeper mechanism that finds workflows stuck in `RUNNING` state and requeues them.

A production implementation would use a stronger consistency mechanism such as the **Transactional Outbox Pattern**:

```text
                    +----------------+
                    |   Transaction  |
                    +-------+--------+
                            |
                +-----------+-----------+
                |                       |
                v                       v
          Workflow State          Outbox Event
                |                       |
                +-----------+-----------+
                            |
                            v
                    Outbox Publisher
                            |
                            v
                         Kafka
```

This provides a reliable bridge between database state and asynchronous message delivery.

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