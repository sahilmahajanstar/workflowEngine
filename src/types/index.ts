export interface RelationalWorkflow {
  id: string;
  name?: string;
  status: 'active' | 'inactive';
}

export interface RelationalTrigger {
  id: string;
  eventName: string;
}

export interface RelationalWorkflowTrigger {
  workflowId: string;
  triggerId: string;
  initialStepId: string;
  status: 'active' | 'inactive';
}

export interface RelationalWorkflowAction {
  id: string;
  workflowId: string;
  type: string;
  params?: any;
  nextStepId?: string | null;
  branches?: Record<string, string>;
}

export interface RelationalSchema {
  workflows: RelationalWorkflow[];
  triggers: RelationalTrigger[];
  workflow_triggers: RelationalWorkflowTrigger[];
  workflow_actions: RelationalWorkflowAction[];
}

export interface Contact {
  id: string;
  email?: string;
  tags: string[];
}

export enum EnrollmentStatus {
  RUNNING = 'running',
  WAITING = 'waiting', // time-based wait
  WAITING_FOR_RESPONSE = 'waiting_for_response', // waiting for external worker ack
  ERROR = 'error', // retriable error state (e.g. 500 webhook)
  COMPLETED = 'completed',
  FAILED = 'failed' // terminal unrecoverable error
}

export interface Enrollment {
  id: string;
  workflowId: string;
  contactId: string;
  currentStepId: string | null;
  status: EnrollmentStatus;
  waitUntil: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  context: {
    contact: Contact;
    [key: string]: any;
  };
}

export enum ExecutionResultType {
  PROCEED = 'PROCEED',
  WAIT = 'WAIT',
  WAITING_FOR_RESPONSE = 'WAITING_FOR_RESPONSE',
  ERROR = 'ERROR', // Retriable
  FAIL = 'FAIL' // Terminal
}

export interface ExecutionResult {
  type: ExecutionResultType;
  nextStepId?: string | null;
  waitUntil?: Date;
  error?: string;
  logs?: any;
}

export interface ExecutionHistory {
  id: string;
  enrollmentId: string;
  stepId: string;
  status: string;
  outcome: any;
  timestamp: Date;
}
