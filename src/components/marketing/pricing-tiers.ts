export type PricingTier = {
  name: string;
  price: string;
  description: string;
  highlight: boolean;
  features: string[];
  action: string;
};

export const PRICING_TIERS: PricingTier[] = [
  {
    name: "Beta",
    price: "$0",
    description: "Everything, free during the public beta through 2027.",
    highlight: true,
    features: [
      "Calendar, board, dashboard and notes",
      "Encrypted sync and sharing with an account",
      "Works offline and installs like an app",
      "Every feature included, now and later",
      "Open source on GitHub",
    ],
    action: "Start for Free",
  },
  {
    name: "Flock Supporter",
    price: "$4 / month",
    description: "Help pay for the servers, and get a less crowded one.",
    highlight: false,
    features: [
      "Supporter-only servers with faster sync",
      "More storage for notes and files",
      "Faster support replies",
    ],
    action: "Coming Soon",
  },
  {
    name: "Flock Teams",
    price: "$12 / month",
    description: "For study groups and classes that want a server of their own.",
    highlight: false,
    features: [
      "A private server for your group",
      "Regular encrypted backups",
      "Faster support replies",
    ],
    action: "Coming Soon",
  },
];
