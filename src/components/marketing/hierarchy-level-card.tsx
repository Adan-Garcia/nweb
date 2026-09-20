import type { HierarchyLevel } from "@/components/marketing/documentation-content"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function HierarchyLevelCard({ level }: { level: HierarchyLevel }) {
  return (
    <Card className="text-left transition-all hover:border-primary/60 hover:shadow-md">
      <CardHeader>
        <CardTitle className="text-lg">{level.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{level.description}</p>
      </CardContent>
    </Card>
  )
}
