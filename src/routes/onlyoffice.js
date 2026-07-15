import express from "express";

export function createOnlyOfficeRouter({ callbackService }) {
  const router = express.Router();

  router.post("/callback/:id", async (request, response) => {
    const result = await callbackService.handle({
      fileId: request.params.id,
      body: request.body,
      authorization: request.get("authorization"),
    });
    response.status(200).json(result);
  });

  return router;
}
