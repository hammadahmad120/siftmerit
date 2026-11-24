import { QueueUnavailableError, type DemoQueue } from "@siftmerit/core";
import { ServiceUnavailableError } from "../lib/errors.js";

/**
 * Queues the demo work item. It only adds a note to the queue; the worker, a
 * separate program, does the work a moment later.
 */
export class DemoWorkService {
  constructor(private readonly queue: DemoQueue) {}

  /**
   * Adds one demo item and returns the ID the queue gave it.
   * `tenantId` must come from the sign-in check, never from the request.
   */
  async queueItem(tenantId: string, requestId: string): Promise<{ id: string }> {
    try {
      const id = await this.queue.add({ tenantId, requestId });
      return { id };
    } catch (error) {
      if (error instanceof QueueUnavailableError) {
        throw new ServiceUnavailableError(
          "The work queue cannot be reached. Try again in a moment.",
          "queue_unavailable",
        );
      }
      throw error;
    }
  }
}
