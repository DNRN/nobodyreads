/** A single email subscriber. */
export interface Subscriber {
  id: string;
  email: string;
  verified: boolean;
  verifyToken: string | null;
  createdAt: string;
  verifiedAt: string | null;
  unsubscribed: boolean;
  unsubscribedAt: string | null;
}
