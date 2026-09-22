import {
  ExternalLinkIcon,
  HelpIcon,
} from "@excalidraw/excalidraw/components/icons";
import { useTunnels } from "@excalidraw/excalidraw/context/tunnels";

/**
 * Injects quickstart actions into the shortcuts-and-help dialog's header,
 * matching the existing Documentation / Blog / GitHub / YouTube buttons:
 *
 *  - "Show guide": reopens the guide for a user who dismissed it.
 *  - "Getting started": the external how-to link that used to sit in the
 *    quickstart prompt itself as "How to start with Excalidraw" -- moved
 *    here so the prompt stays a two-choice decision (opt in / keep
 *    drawing).
 */

const HOW_TO_START_URL = "https://plus.excalidraw.com/how-to-start";

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
        Show guide
      </button>
      {/* Opens in a new tab so it doesn't pull the user off whatever's
          already on their canvas. */}
      <a
        className="HelpDialog__btn"
        data-testid="quickstart-how-to-start"
        href={HOW_TO_START_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <div className="HelpDialog__link-icon">{ExternalLinkIcon}</div>
        Getting started
      </a>
    </HelpDialogHeaderTunnel.In>
  );
};
