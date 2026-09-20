export type PricingTier = {
  name: string
  price: string
  description: string
  highlight: boolean
  features: string[]
  action: string
}

export const PRICING_TIERS: PricingTier[] = [
  {
    name: "Beta",
    price: "$0",
    description: "Free access during the public beta through 2027.",
    highlight: true,
    features: [
      "Private-by-default planner",
      "Notes and homework organization",
      "Cross-platform sync-ready architecture",
      "All features are free forever",
      "Open Source on GitHub",
    ],
    action: "Start for Free",
  },
  {
    name: "Flock Supporter",
    price: "$4 / month",
    description: "Help support the project and get access to less crowded servers",
    highlight: false,
    features: [
      "Supporter only servers with faster syncing",
      "Increased storage limits for notes and file attachments",
      "Faster support response times",
    ],
    action: "Comming Soon",
  },
  {
    name: "Flock Teams",
    price: "$12 / month",
    description: "Built for study groups and classes using secure key exchange.",
    highlight: false,
    features: [
      "Private Servers for teams",
      "Frequent Cloud backups",
      "Faster support response times",
    ],
    action: "Comming Soon",
  },
]
