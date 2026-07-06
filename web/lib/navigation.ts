import {
  BellRingIcon,
  CreditCardIcon,
  GaugeIcon,
  HistoryIcon,
  Settings2Icon,
} from "lucide-react";

export const primaryNavigation = [
  {
    href: "/dashboard",
    label: "Dashboard",
    description: "Health, account state, and recent activity.",
    icon: GaugeIcon,
  },
  {
    href: "/alerts",
    label: "Alerts",
    description: "Configure supported order-flow rules.",
    icon: BellRingIcon,
  },
  {
    href: "/history",
    label: "History",
    description: "Review delivered alerts and proof snapshots.",
    icon: HistoryIcon,
  },
  {
    href: "/settings",
    label: "Settings",
    description: "Telegram connection and account controls.",
    icon: Settings2Icon,
  },
  {
    href: "/billing",
    label: "Billing",
    description: "Subscription state and launch pricing.",
    icon: CreditCardIcon,
  },
] as const;

export const navigationTitleByPath = primaryNavigation.reduce<
  Record<string, string>
>((titles, item) => {
  titles[item.href] = item.label;
  return titles;
}, {});

export function getNavigationTitle(pathname: string) {
  if (navigationTitleByPath[pathname]) {
    return navigationTitleByPath[pathname];
  }

  const nestedMatch = primaryNavigation.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  return nestedMatch?.label ?? "Overview";
}
