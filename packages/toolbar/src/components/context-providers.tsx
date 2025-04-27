import { LocationProvider } from "../hooks/use-location";
import { type ComponentChildren } from "preact";

export function ContextProviders({
  children,
}: {
  children?: ComponentChildren;
}) {
  console.log("ContextProviders rendered!");
  return <LocationProvider>{children}</LocationProvider>;
}
