/** An error from the AI provider, with the HTTP status to send to the browser. */
export class AIError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
