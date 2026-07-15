import { Router } from "express";

export function createGuidesRouter({ guideService }) {
  const router = Router();

  router.get("/", (_request, response) => {
    response.json({ data: guideService.list() });
  });

  router.get("/:slug", async (request, response, next) => {
    try {
      response.json({ data: await guideService.get(request.params.slug) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
