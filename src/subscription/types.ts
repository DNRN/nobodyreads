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

/** Subscription feature settings stored in site_settings. */
export interface SubscriptionSettings {
  enabled: boolean;
  provider: "mailgun";
  apiKey: string;
  domain: string;
  fromName: string;
  fromEmail: string;
}

/** Default settings when nothing is configured yet. */
export const DEFAULT_SUBSCRIPTION_SETTINGS: SubscriptionSettings = {
  enabled: false,
  provider: "mailgun",
  apiKey: "",
  domain: "",
  fromName: "",
  fromEmail: "",
};
