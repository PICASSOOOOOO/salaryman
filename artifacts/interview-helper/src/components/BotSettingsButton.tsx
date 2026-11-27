import { Settings } from "lucide-react";

export function BotSettingsButton({
  botName,
  onOpenSettings,
  testId,
}: {
  botName: string;
  onOpenSettings: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpenSettings();
      }}
      aria-label={`Open settings for ${botName}`}
      title="Settings"
      data-testid={testId}
      className="shrink-0 rounded-md p-1.5 text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground"
    >
      <Settings className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
