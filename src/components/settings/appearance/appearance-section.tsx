import { Eye, EyeOff } from "lucide-react";
import type { ReactNode } from "react";

import {
  DASHBOARD_CARD_LABELS,
  DENSITY_LABELS,
  FONT_SIZE_LABELS,
  SIDEBAR_LABELS,
  THEME_OPTIONS,
} from "@/components/appearance-options";
import { AccentPicker } from "@/components/settings/appearance/accent-picker";
import { ChoiceGroup } from "@/components/settings/appearance/choice-group";
import { OrderList } from "@/components/settings/appearance/order-list";
import { Button } from "@/components/ui/button";
import { orderNavItems } from "@/components/workspace-nav";
import { useAppearance } from "@/hooks/use-appearance";
import { DENSITIES, FONT_SIZES, SIDEBAR_MODES } from "@/lib/preferences/preferences-model";

const choicesOf = <Value extends string>(values: readonly Value[], labels: Record<Value, string>) =>
  values.map((value) => ({ value, label: labels[value] }));

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 py-5 first:pt-0 last:pb-0 md:grid-cols-[14rem_1fr] md:gap-6">
      <div className="grid content-start gap-0.5">
        <h3 className="text-heading">{title}</h3>
        {hint ? <p className="text-caption text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * How the app looks and how it is arranged. Every change applies at once and syncs to
 * every device signed in to the same account.
 */
export function AppearanceSection() {
  const { preferences, update } = useAppearance();

  return (
    <div className="grid divide-y">
      <Row title="Theme" hint="System follows your device's light or dark setting.">
        <ChoiceGroup
          label="Theme"
          value={preferences.theme}
          choices={THEME_OPTIONS}
          onChange={(theme) => update({ theme })}
        />
      </Row>
      <Row title="Accent colour" hint="Buttons, links, focus rings and highlights.">
        <AccentPicker value={preferences.accent} onChange={(accent) => update({ accent })} />
      </Row>
      <Row title="Density" hint="How much space sits around everything.">
        <ChoiceGroup
          label="Density"
          value={preferences.density}
          choices={choicesOf(DENSITIES, DENSITY_LABELS)}
          onChange={(density) => update({ density })}
        />
      </Row>
      <Row title="Text size">
        <ChoiceGroup
          label="Text size"
          value={preferences.fontSize}
          choices={choicesOf(FONT_SIZES, FONT_SIZE_LABELS)}
          onChange={(fontSize) => update({ fontSize })}
        />
      </Row>
      <Row title="Sidebar" hint="On a wide screen. ⌘B toggles it too.">
        <ChoiceGroup
          label="Sidebar"
          value={preferences.sidebar}
          choices={choicesOf(SIDEBAR_MODES, SIDEBAR_LABELS)}
          onChange={(sidebar) => update({ sidebar })}
        />
      </Row>
      <Row title="Navigation order" hint="The sidebar and the phone tab bar.">
        <OrderList
          label="Navigation order"
          items={orderNavItems(preferences.navOrder)}
          keyOf={(item) => item.id}
          nameOf={(item) => item.title}
          onReorder={(items) => update({ navOrder: items.map((item) => item.id) })}
        />
      </Row>
      <Row title="Dashboard" hint="Which cards it shows, and in what order.">
        <OrderList
          label="Dashboard cards"
          items={preferences.dashboardCards}
          keyOf={(card) => card.id}
          nameOf={(card) => DASHBOARD_CARD_LABELS[card.id]}
          onReorder={(dashboardCards) => update({ dashboardCards })}
          renderExtra={(card) => (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={card.visible}
              aria-label={`Show ${DASHBOARD_CARD_LABELS[card.id]}`}
              onClick={() =>
                update({
                  dashboardCards: preferences.dashboardCards.map((each) =>
                    each.id === card.id ? { ...each, visible: !each.visible } : each,
                  ),
                })
              }
            >
              {card.visible ? <Eye /> : <EyeOff className="text-muted-foreground" />}
            </Button>
          )}
        />
      </Row>
    </div>
  );
}
