import { Database, KeyRound, ShieldCheck, Users, type LucideIcon } from "lucide-react";

export type PolicySection = {
  title: string;
  icon: LucideIcon;
  items: string[];
};

export const POLICY_SECTIONS: PolicySection[] = [
  {
    title: "Data we collect",
    icon: Database,
    items: [
      "Account information you provide, such as email and profile details.",
      "Planner content you create, including tasks, notes, labels, and collaboration metadata.",
      "Operational logs required to keep syncing and reliability working during the beta period.",
    ],
  },
  {
    title: "How your data is protected",
    icon: ShieldCheck,
    items: [
      "Data is designed to be encrypted before it is sent to backend services.",
      "Current architecture uses unique AES-GCM data encryption keys for courses and notes.",
      "Private keys remain on user devices, while only encrypted payloads and encrypted keys are stored remotely.",
      "Our code is 100% open-source, meaning our encryption methods and data practices can be independently verified by anyone.",
    ],
  },
  {
    title: "Sharing and access control",
    icon: Users,
    items: [
      "Shared workspaces use key exchange so collaborators can decrypt only the content they are invited to access.",
      "Server-side access is controlled with row-level policies.",
      "When collaboration membership changes, access revocation rules are applied and new keys may be rotated.",
    ],
  },
  {
    title: "Storage, sync, and retention",
    icon: KeyRound,
    items: [
      "Cuervo Planner is local-first and keeps decrypted state on your device for offline usage.",
      "Encrypted copies may be synchronized through supported cloud infrastructure to keep devices in sync.",
      "You can stop using the service at any time; self-hosting and local-first workflows remain a supported direction.",
    ],
  },
];

export type BreakdownStep = {
  step: string;
  title: string;
  copy: string;
};

export const PLAIN_LANGUAGE_STEPS: BreakdownStep[] = [
  {
    step: "1",
    title: "You lock it on your device",
    copy: "Before your notes leave your device, they are scrambled into unreadable text.",
  },
  {
    step: "2",
    title: "Only your key can unlock it",
    copy: "The app needs your key to turn that scrambled text back into readable content.",
  },
  {
    step: "3",
    title: "No key means no reading",
    copy: "If someone gets the stored data but not your key, they only see encrypted gibberish.",
  },
];
