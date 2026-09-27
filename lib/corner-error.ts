// A user-facing failure from the custom-triangle pipeline: the message is safe to show, the status is the HTTP code.
export class CornerError extends Error{constructor(message:string,public status=503){super(message)}}
