import { jest } from "@jest/globals";

const subscription = {
  _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  endpoint: "https://push.example/subscription/test",
  keys: {
    p256dh: "subscription-public-key",
    auth: "subscription-auth-key"
  }
};
const select = jest.fn(() => Promise.resolve([subscription]));
const find = jest.fn(() => ({ select }));
const sendNotification = jest.fn(async () => undefined);
const setVapidDetails = jest.fn();

jest.unstable_mockModule("../src/config/env.js", () => ({
  env: {
    WEB_PUSH_PUBLIC_KEY: "test-public-key",
    WEB_PUSH_PRIVATE_KEY: "test-private-key",
    WEB_PUSH_SUBJECT: "mailto:test@example.com"
  }
}));
jest.unstable_mockModule("../src/models/PushSubscription.js", () => ({
  PushSubscription: {
    find,
    deleteOne: jest.fn(async () => ({ deletedCount: 0 }))
  }
}));
jest.unstable_mockModule("web-push", () => ({
  default: { setVapidDetails, sendNotification }
}));

const { sendMinimalPushToUser } = await import("../src/services/push.service.js");

describe("push delivery", () => {
  beforeEach(() => {
    find.mockClear();
    select.mockClear();
    sendNotification.mockClear();
    setVapidDetails.mockClear();
  });

  it("loads the hidden endpoint and keys required to send browser push", async () => {
    await expect(sendMinimalPushToUser("user-id", {
      title: "Reminder",
      body: "A test reminder"
    })).resolves.toEqual({ status: "sent" });

    expect(find).toHaveBeenCalledWith({ user: "user-id" });
    expect(select).toHaveBeenCalledWith("+endpoint +keys.p256dh +keys.auth");
    expect(sendNotification).toHaveBeenCalledWith({
      endpoint: subscription.endpoint,
      keys: subscription.keys
    }, JSON.stringify({ title: "Reminder", body: "A test reminder" }), { TTL: 60 });
  });
});
