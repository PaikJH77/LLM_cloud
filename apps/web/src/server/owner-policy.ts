import { AuthenticationError } from "../../../api/src/auth";
export function ownerPolicy(allowedIssuer: string, allowedSubject: string) {
  if (!allowedIssuer.trim() || !allowedSubject.trim())
    throw new Error("Owner issuer and subject required");
  return (issuer: string, subject: string) => {
    if (issuer !== allowedIssuer || subject !== allowedSubject)
      throw new AuthenticationError("Owner not allowed");
  };
}
