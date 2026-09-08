import { Workbench } from "@/components/workbench";
import { isRealAiEnabled } from "@/lib/runtime/feature-flags";

export const dynamic = "force-dynamic";

export default function Home() {
  return <Workbench realAiEnabled={isRealAiEnabled()} />;
}
