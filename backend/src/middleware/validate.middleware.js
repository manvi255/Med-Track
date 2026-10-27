import { ApiError } from "../utils/ApiError.js";

export function validateBody(schema) {
  return function validateRequestBody(req, _res, next) {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const message = result.error.issues
        .map(({ path, message: issueMessage }) => {
          const field = path.join(".");
          return field ? `${field}: ${issueMessage}` : issueMessage;
        })
        .join("; ");
      next(new ApiError(400, message));
      return;
    }

    req.body = result.data;
    next();
  };
}
