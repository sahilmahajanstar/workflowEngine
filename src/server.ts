import { logger } from './utils/Logger';
import express from 'express';
import { WorkflowEngine } from './engine/WorkflowEngine';
import { IExecutionHistoryRepository } from './db/repositories/IExecutionHistoryRepository';
import { IEnrollmentRepository } from './db/repositories/IEnrollmentRepository';

import { z } from 'zod';

const EventPayloadSchema = z.object({
  eventName: z.string().min(1, "eventName is required"),
  contact: z.object({
    id: z.string().min(1, "contact.id is required"),
    email: z.string().email().optional(),
    tags: z.array(z.string()).default([])
  })
});

export function createServer(engine: WorkflowEngine, historyRepo: IExecutionHistoryRepository, enrollmentsRepo: IEnrollmentRepository) {
  const app = express();
  app.use(express.json());

  app.post('/api/events', async (req, res) => {
    try {
      const validationResult = EventPayloadSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          schemaVersion: "1.0",
          error: {
            message: "Invalid request payload",
            type: "ValidationError",
            status: 400,
            metadata: { issues: validationResult.error.format() }
          }
        });
      }

      const { eventName, contact } = validationResult.data;

      const enrollments = await engine.processEvent(eventName, contact);
      if (enrollments.length === 0) {
        return res.status(400).json({
          schemaVersion: "1.0",
          error: {
            message: `No active workflows found for event: '${eventName}'`,
            type: "EventNotTriggered",
            status: 400,
            metadata: { eventName }
          }
        });
      }

      res.status(202).json({ schemaVersion: "1.0", data: { 
        message: 'Event accepted', 
        workflowsTriggered: enrollments.length,
        enrollmentIds: enrollments.map(e => e.id)
      } });
    } catch (err: any) {
      logger.error(err);
      res.status(500).json({
        schemaVersion: "1.0",
        error: {
          message: "Internal server error processing event",
          type: "InternalError",
          status: 500,
          metadata: { details: err.message }
        }
      });
    }
  });

  app.get('/api/contacts/:id/history', async (req, res) => {
    try {
      const contactId = req.params.id;
      const enrollments = await enrollmentsRepo.getByContactId(contactId);
      const history = await historyRepo.getByContactId(contactId);

      // Group history by enrollmentId
      const grouped = history.reduce((acc: any, row: any) => {
        if (!acc[row.enrollmentId]) acc[row.enrollmentId] = [];
        acc[row.enrollmentId].push(row);
        return acc;
      }, {});

      // Format response combining enrollment info with its history
      const data = enrollments.map(e => {
        // Sort history chronologically (ascending by timestamp)
        const sortedHistory = (grouped[e.id] || []).sort((a: any, b: any) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        return {
          enrollmentId: e.id,
          workflowId: e.workflowId,
          status: e.status,
          createdAt: e.createdAt,
          history: sortedHistory
        };
      });

      res.json({ schemaVersion: "1.0", data });
    } catch (err: any) {
      logger.error(err);
      res.status(500).json({
        schemaVersion: "1.0",
        error: {
          message: "Failed to fetch contact history",
          type: "InternalError",
          status: 500,
          metadata: { contactId: req.params.id, details: err.message }
        }
      });
    }
  });

  // Global error handler for unhandled express errors
  app.use((err: any, req: any, res: any, next: any) => {
    res.status(500).json({
      schemaVersion: "1.0",
      error: {
        message: "Unhandled API Error",
        type: "InternalError",
        status: 500,
        metadata: { path: req.path, details: err.message }
      }
    });
  });

  return app;
}
