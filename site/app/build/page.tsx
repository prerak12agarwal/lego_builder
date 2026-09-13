import { WorkshopShell } from "@/components/workshop-shell";
import Workspace from "./workspace";

export default function BuildPage() {
  return <WorkshopShell current="build"><Workspace/></WorkshopShell>;
}
