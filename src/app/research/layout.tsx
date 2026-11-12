import { DeviceSync } from "@/components/device-sync";
import "../globals.css";
import "../after-hours.css";

/** Legacy research screens keep their global stylesheets and device sync, scoped to this subtree. */
export default function LegacyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <DeviceSync />
    </>
  );
}
