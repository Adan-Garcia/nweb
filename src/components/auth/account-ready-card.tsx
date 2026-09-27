import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AccountReadyCardProps = {
  title: string;
  description: string;
  /** Something that went only partly right, said before moving on. */
  notice?: string | null;
  to: string;
  action: string;
  className?: string;
};

/** A device with nothing left to set up: one sentence and the way in. */
export function AccountReadyCard({
  title,
  description,
  notice,
  to,
  action,
  className,
}: AccountReadyCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-title">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {notice ? (
          <p role="alert" className="text-sm text-destructive">
            {notice}
          </p>
        ) : null}
        <Button nativeButton={false} render={<Link to={to} />}>
          {action}
        </Button>
      </CardContent>
    </Card>
  );
}
