import type { TelegramConnection } from "@/lib/telegram/connections";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatTelegramTimestampUtc(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return `${MONTHS[date.getUTCMonth()]} ${pad(date.getUTCDate())}, ${date.getUTCFullYear()} ${pad(
    date.getUTCHours()
  )}:${pad(date.getUTCMinutes())} UTC`;
}

export function getTelegramConnectionFacts(connection: TelegramConnection) {
  return [
    {
      label: "Connected",
      value: formatTelegramTimestampUtc(connection.connectedAt),
    },
    {
      label: "Last seen",
      value: formatTelegramTimestampUtc(connection.lastSeenAt),
    },
  ];
}
