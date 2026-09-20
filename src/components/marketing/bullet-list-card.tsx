import type { LucideIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type BulletListCardProps = {
  title: string
  icon: LucideIcon
  description?: string
  items: string[]
}

/** A card with an icon heading and a list of short statements. */
export function BulletListCard({ title, icon: Icon, description, items }: BulletListCardProps) {
  return (
    <Card className="text-left">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Icon className="size-5 text-primary" />
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <ul className="space-y-3 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={item} className="rounded-md border border-border/70 bg-card/70 px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
