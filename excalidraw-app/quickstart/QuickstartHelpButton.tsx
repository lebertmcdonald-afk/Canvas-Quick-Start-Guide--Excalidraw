import { HelpIcon } from "@excalidraw/excalidraw/components/icons";
import { useTunnels } from "@excalidraw/excalidraw/context/tunnels";

/**
 * Injects a "Getting started" action into the Help dialog header, matching
 * the existing Documentation / Blog / GitHub / YouTube buttons, so a user
 * who dismissed the guide can open it again.
 */
export const QuickstartHelpButton = ({
  onRestart,
  onCloseHelp,
}: {
  onRestart: () => void;
  onCloseHelp?: () => void;
}) => {
  const { HelpDialogHeaderTunnel } = useTunnels();

  return (
    <HelpDialogHeaderTunnel.In>
      <button
        type="button"
        className="HelpDialog__btn"
        data-testid="quickstart-restart"
        onClick={() => {
          onRestart();
          onCloseHelp?.();
        }}
      >
        <div className="HelpDialog__link-icon">{HelpIcon}</div>
        Getting started
      </button>
    </HelpDialogHeaderTunnel.In>
  );
};
