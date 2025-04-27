import { render } from "preact";
import "./app.css";
import { App } from "./app.tsx";

import { companionAnchorTagName } from "./utils.tsx";

declare global {
  // eslint-disable-next-line no-var
  var stagewiseCompanionStyles: string[] | undefined;
}

export function initToolbar() {
  console.log("Stagewise Toolbar Main");

  if (!document.body)
    throw new Error("stagewise companion cannot find document.body");

  // If a stagewise companion anchor already exists, we abort this instance.
  if (document.body.querySelector(companionAnchorTagName)) {
    console.warn(
      "A stagewise companion anchor already exists. Aborting this instance."
    );
    throw new Error("A stagewise companion anchor already exists.");
  }

  const shadowDomAnchor = document.createElement(companionAnchorTagName);
  shadowDomAnchor.style.position = "fixed";
  shadowDomAnchor.style.top = "0px";
  shadowDomAnchor.style.left = "0px";
  shadowDomAnchor.style.right = "0px";
  shadowDomAnchor.style.bottom = "0px";
  shadowDomAnchor.style.pointerEvents = "none";
  shadowDomAnchor.style.zIndex = "2147483647";

  console.log("Created anchor");

  const eventBlocker = (ev: Event) => {
    ev.stopPropagation();
  };

  // We block all kinds of events to prevent the anchor from interfering with the website as much as possible.
  // We want the website to basically freeze upon interacting with the companion.
  shadowDomAnchor.onclick = eventBlocker;
  shadowDomAnchor.onmousedown = eventBlocker;
  shadowDomAnchor.onmouseup = eventBlocker;
  shadowDomAnchor.onmousemove = eventBlocker;
  shadowDomAnchor.ondblclick = eventBlocker;
  shadowDomAnchor.oncontextmenu = eventBlocker;
  shadowDomAnchor.onwheel = eventBlocker;
  shadowDomAnchor.onfocus = eventBlocker;
  shadowDomAnchor.onblur = eventBlocker;

  document.body.appendChild(shadowDomAnchor);

  // Create a shadow root
  const shadow = shadowDomAnchor.attachShadow({ mode: "open" });

  console.log("Created shadow DOM");

  const fontLinkNode = document.createElement("link");
  fontLinkNode.rel = "stylesheet";
  fontLinkNode.href = `https://rsms.me/inter/inter.css"`;
  shadowDomAnchor.appendChild(fontLinkNode);

  /** Insert generated css into shadow dom */
  if (globalThis.stagewiseCompanionStyles) {
    for (const style of globalThis.stagewiseCompanionStyles) {
      const styleNode = document.createElement("style");
      styleNode.append(document.createTextNode(style));
      shadow.appendChild(styleNode);

      render(<App />, shadow!);
    }
  } else {
    console.error(
      "An internal error occured in the stagewise companion. If this error keeps appearing, contact us at support@stagewise.io"
    );
  }
}
