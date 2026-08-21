import { MenuSyncJob } from '@dishswipe/worker';

interface RequestLike {
  params?: { restaurantId?: string };
  body?: any;
}

interface ResponseLike {
  status(code: number): ResponseLike;
  json(payload: unknown): void;
}

export function createMenuSyncHandler(job: MenuSyncJob = new MenuSyncJob()) {
  return async function menuSync(req: RequestLike, res: ResponseLike) {
    const restaurantId = req.params?.restaurantId ?? req.body?.restaurantId;

    if (!restaurantId) {
      res.status(400).json({ error: 'restaurantId is required' });
      return;
    }

    try {
      const summary = await job.syncRestaurant(restaurantId);
      res.status(200).json({ status: 'ok', summary });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      res.status(500).json({ error: message });
    }
  };
}
