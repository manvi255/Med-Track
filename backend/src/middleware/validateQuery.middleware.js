import { ApiError } from "../utils/ApiError.js";

export function validateQuery(schema) {
  return function validateRequestQuery(req, _res, next) {
    const result = schema.safeParse(req.query);
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

    req.validatedQuery = result.data;
    next();
  };
}
