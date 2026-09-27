import type { HierarchyLevel } from "@/components/marketing/documentation-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function HierarchyLevelCard({ level }: { level: HierarchyLevel }) {
  return (
    <Card className="text-left transition-colors hover:ring-foreground/20">
      <CardHeader>
        <CardTitle className="text-heading">{level.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{level.description}</p>
      </CardContent>
    </Card>
  );
}
