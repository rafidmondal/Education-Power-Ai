import type { Handler } from "@netlify/functions";

// GET /api/health — unchanged from the original Express route.
export const handler: Handler = async () => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "ok", time: new Date().toISOString() }),
  };
};
