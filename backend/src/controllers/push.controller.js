import { ApiError } from "../utils/ApiError.js";
import {
  deletePushSubscription,
  getPushPublicKey,
  registerPushSubscription
} from "../services/push.service.js";

export function pushPublicKeyController(_req, res) {
  res.status(200).json({ publicKey: getPushPublicKey() });
}

export async function subscribePushController(req, res) {
  await registerPushSubscription(req.user.id, req.body);
  res.status(201).json({ message: "Push subscription registered" });
}

export async function unsubscribePushController(req, res) {
  const removed = await deletePushSubscription(req.user.id, req.body.endpoint);
  if (!removed) throw new ApiError(404, "Push subscription not found");
  res.status(204).end();
}
