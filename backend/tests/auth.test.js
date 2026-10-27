import bcrypt from "bcryptjs";
import { jest } from "@jest/globals";
import request from "supertest";

const users = new Map();

class MockUserQuery {
  constructor(user) {
    this.user = user;
  }

  select() {
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this.user).then(resolve, reject);
  }
}

class MockUser {
  constructor({ name, email, password }) {
    this._id = `${users.size + 1}`;
    this.name = name;
    this.email = email;
    this.password = password;
    this.createdAt = new Date();
    this.updatedAt = this.createdAt;
  }

  get id() {
    return this._id;
  }

  async save() {
    this.password = await bcrypt.hash(this.password, 4);
    users.set(this._id, this);
    return this;
  }

  static findOne({ email }) {
    return new MockUserQuery([...users.values()].find((user) => user.email === email) ?? null);
  }

  static async findById(id) {
    return users.get(id) ?? null;
  }
}

jest.unstable_mockModule("../src/models/User.js", () => ({ User: MockUser }));

const { app } = await import("../src/app.js");

const validUser = {
  name: "  MediTrack User ",
  email: "MEDI.USER@example.com",
  password: "secure-password-123"
};

describe("authentication routes", () => {
  beforeEach(() => users.clear());

  it("registers a user, hashes the password, and returns a safe user", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send(validUser);

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      name: "MediTrack User",
      email: "medi.user@example.com"
    });
    expect(response.body.user).not.toHaveProperty("password");
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");

    const storedUser = [...users.values()][0];
    expect(storedUser.password).not.toBe(validUser.password);
    expect(await bcrypt.compare(validUser.password, storedUser.password)).toBe(true);
  });

  it("rejects duplicate email registrations", async () => {
    await request(app).post("/api/v1/auth/register").send(validUser);
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...validUser, email: validUser.email.toLowerCase() });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { message: "An account with this email already exists" }
    });
  });

  it("returns clear errors for invalid registration input", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: " ", email: "not-an-email", password: "short" });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain("name");
    expect(response.body.error.message).toContain("email");
    expect(response.body.error.message).toContain("password");
  });

  it("logs in with valid credentials and does not return the password hash", async () => {
    await request(app).post("/api/v1/auth/register").send(validUser);
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: validUser.email, password: validUser.password });

    expect(response.status).toBe(200);
    expect(response.body.user).not.toHaveProperty("password");
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
  });

  it("rejects an incorrect password with a generic authentication error", async () => {
    await request(app).post("/api/v1/auth/register").send(validUser);
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: validUser.email, password: "incorrect-password" });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { message: "Invalid email or password" }
    });
  });

  it("rejects access to /me without authentication", async () => {
    const response = await request(app).get("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { message: "Authentication required" }
    });
  });

  it("returns the authenticated safe user from /me", async () => {
    await request(app).post("/api/v1/auth/register").send(validUser);
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: validUser.email, password: validUser.password });
    const cookie = login.headers["set-cookie"][0].split(";")[0];

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      name: "MediTrack User",
      email: "medi.user@example.com"
    });
    expect(response.body.user).not.toHaveProperty("password");
  });

  it("clears the authentication cookie on logout", async () => {
    await request(app).post("/api/v1/auth/register").send(validUser);
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: validUser.email, password: validUser.password });

    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", login.headers["set-cookie"][0].split(";")[0]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Logged out successfully" });
    expect(response.headers["set-cookie"][0]).toContain("Expires=Thu, 01 Jan 1970");
    expect(response.headers["set-cookie"][0]).toContain("Path=/api/v1");
  });
});
