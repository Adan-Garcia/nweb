import { Check, Zap } from "lucide-react";

import type { PricingTier } from "@/components/marketing/pricing-tiers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PricingTierCard({ tier }: { tier: PricingTier }) {
  return (
    <Card className={cn("text-left", tier.highlight && "ring-2 ring-primary")}>
      <CardHeader>
        <div className="mb-2 flex items-center justify-between">
          <CardTitle className="text-title">{tier.name}</CardTitle>
          {tier.highlight ? (
            <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
              <Zap className="mr-1 size-3.5" />
              Most Popular
            </span>
          ) : null}
        </div>
        <p className="mb-1 text-display text-foreground">{tier.price}</p>
        <CardDescription>{tier.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="mb-6 space-y-3 text-sm text-muted-foreground">
          {tier.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 text-primary" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        <Button className="w-full" variant={tier.highlight ? "default" : "outline"}>
          {tier.action}
        </Button>
      </CardContent>
    </Card>
  );
}
