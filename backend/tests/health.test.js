import request from "supertest";
import { app } from "../src/app.js";

describe("GET /api/v1/health", () => {
  it("reports API availability and database connectivity", async () => {
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: "degraded",
      database: { status: "unavailable" }
    });
  });

  it("returns a centralized 404 for unknown routes", async () => {
    const response = await request(app).get("/api/v1/unknown");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { message: "Route not found: GET /api/v1/unknown" }
    });
  });

  it("rejects origins that are not configured", async () => {
    const response = await request(app)
      .get("/api/v1/health")
      .set("Origin", "https://untrusted.example");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { message: "Origin is not allowed by CORS" }
    });
  });
});
